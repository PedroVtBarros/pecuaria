import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
let amb: AmbienteIpc | undefined;
afterEach(() => amb?.encerrar());
it('extrato paginado, prévia e saldo coerentes com 100.000 movimentos sintéticos', async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 16) });
  const p = await amb.ok('propriedade:criar', {
    dados: {
      nome: 'Volume sintético',
      municipio: null,
      uf: null,
      areaTotalHa: null,
      tipoExploracao: 'corte',
      observacoes: null,
    },
  });
  const i = await amb.ok('estoque:criarItem', {
    propriedadeId: p.id,
    dados: {
      nome: 'Insumo sintético',
      tipo: 'outro',
      unidadeBase: 'kg',
      controleLote: false,
      estoqueMinimo: null,
      produtoSanitarioId: null,
      ativo: true,
      observacoes: null,
    },
  });
  const db = amb.gerenciador.conexao;
  // Fixture SQL evita medir 100.000 transações de usuário; nenhum dado operacional.
  const ins = db.prepare(
    `INSERT INTO movimentacao_estoque(id,estoque_item_id,data,ordem,tipo,quantidade_milesimos,unidade_base,custo_entrada_centavos,custo_apropriado_centavos,destino,requisicao_id,created_at,updated_at) VALUES(?,?,'2026-01-01',?,?,?,'kg',?,?,?,?,'2026-10-16T00:00:00Z','2026-10-16T00:00:00Z')`,
  );
  db.transaction(() => {
    for (let n = 1; n <= 100000; n++) {
      const entrada = n % 2 === 1;
      ins.run(
        `fixture-${n}`,
        i.id,
        n,
        entrada ? 'entrada_compra' : 'saida_consumo',
        entrada ? 1000 : 500,
        entrada ? 100 : null,
        entrada ? 100 : 50,
        entrada ? null : 'propriedade',
        `req-fixture-${n}`,
      );
    }
  })();
  const tempos: Record<string, number> = {};
  let inicio = performance.now();
  const extrato = await amb.ok('estoque:extrato', {
    itemId: i.id,
    pagina: 2,
    tamanhoPagina: 50,
    destino: 'propriedade',
  });
  tempos['extratoMs'] = performance.now() - inicio;
  expect(extrato.total).toBe(50000);
  expect(extrato.itens).toHaveLength(50);
  expect(new Set(extrato.itens.map((m) => m.id)).size).toBe(50);
  expect(extrato.itens[0]?.ordem).toBe(99900);
  inicio = performance.now();
  const detalhe = await amb.ok('estoque:obter', { id: i.id });
  tempos['detalheMs'] = performance.now() - inicio;
  expect(detalhe.item).toMatchObject({ saldo: 25000, valorSaldoCentavos: 2500000 });
  expect(detalhe.movimentos).toHaveLength(200);
  inicio = performance.now();
  const previa = await amb.ok('estoque:prever', {
    itemId: i.id,
    dados: {
      data: '2026-10-01',
      tipo: 'saida_consumo',
      quantidade: 1,
      unidadeBase: 'kg',
      destino: 'propriedade',
    },
  });
  tempos['previaMs'] = performance.now() - inicio;
  expect(previa).toMatchObject({
    saldo: 24999,
    valorSaldoCentavos: 2499900,
    custoMovimentoCentavos: 100,
    movimentosRecalculados: 0,
  });
  inicio = performance.now();
  const novo = await amb.ok('estoque:registrar', {
    itemId: i.id,
    requisicaoId: gerarUuidV7(),
    dados: {
      data: '2026-10-01',
      tipo: 'saida_consumo',
      quantidade: 1,
      unidadeBase: 'kg',
      destino: 'propriedade',
    },
  });
  tempos['registroMs'] = performance.now() - inicio;
  expect(novo.custoApropriadoCentavos).toBe(100);
  writeFileSync(join(tmpdir(), 'pecuaria-fase3-volume.json'), JSON.stringify(tempos, null, 2));
  // Limite folgado: com a suíte inteira em paralelo o tempo passa de 20 s; o teste confere
  // coerência, não tempo (os tempos vão para o arquivo acima).
}, 60_000);
