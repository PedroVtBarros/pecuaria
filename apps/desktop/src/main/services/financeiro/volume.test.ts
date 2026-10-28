import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import {
  DATA_DO_RELOGIO,
  categoriaPorNome,
  conferirCaixa,
  conferirInvariantes,
  criarPropriedade,
} from './apoio-teste';

/**
 * Volume sintético: 20.000 lançamentos com duas parcelas cada e pagamentos em parte deles.
 * Valida os resultados e a paginação; os tempos são medidos e registrados no relatório da fase,
 * sem impor limite de tempo frágil na suíte.
 */
let amb: AmbienteIpc;
beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
});
afterEach(() => amb.encerrar());

describe('volume financeiro', () => {
  it('lista, filtra por situação e pagina 20.000 lançamentos', { timeout: 120_000 }, async () => {
    const prop = (await criarPropriedade(amb, 'Fazenda volume')).id;
    const categoria = (await categoriaPorNome(amb, 'Outras despesas')).id;
    const db = amb.gerenciador.conexao;
    const agora = '2026-10-16T12:00:00.000Z';
    const N = 20_000;
    const inserirLancamento = db.prepare(
      `INSERT INTO lancamento_financeiro(id,propriedade_id,categoria_id,natureza,data_competencia,valor_total_centavos,descricao,atividade,destino_tipo,condicao_pagamento,comportamento_custo,requisicao_id,created_at,updated_at)
       VALUES(?,?,?,'despesa',?,?,?,'nao_definida','propriedade',?, 'nao_classificado',?,?,?)`,
    );
    const inserirParcela = db.prepare(
      'INSERT INTO parcela_financeira(id,lancamento_id,numero,vencimento,valor_centavos,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
    );
    const inserirPagamento = db.prepare(
      "INSERT INTO pagamento_financeiro(id,parcela_id,data,valor_centavos,requisicao_id,created_at,updated_at) VALUES(?,?,'2026-10-10',?,?,?,?)",
    );
    db.transaction(() => {
      for (let i = 0; i < N; i++) {
        const id = gerarUuidV7();
        const dia = String((i % 28) + 1).padStart(2, '0');
        const nao = i % 10 === 0;
        inserirLancamento.run(
          id,
          prop,
          categoria,
          `2026-09-${dia}`,
          20000,
          `Lançamento ${i}`,
          nao ? 'nao_informada' : 'parcelado',
          `req-${i}`,
          agora,
          agora,
        );
        if (nao) continue;
        const p1 = gerarUuidV7();
        inserirParcela.run(p1, id, 1, '2026-11-10', 10000, agora, agora);
        inserirParcela.run(gerarUuidV7(), id, 2, '2026-12-10', 10000, agora, agora);
        if (i % 3 === 0) {
          inserirPagamento.run(gerarUuidV7(), p1, 10000, `rp-${i}`, agora, agora);
        }
      }
    })();
    const medir = async <T>(rotulo: string, f: () => Promise<T>) => {
      const t = performance.now();
      const r = await f();
      console.info(`[volume financeiro] ${rotulo}: ${Math.round(performance.now() - t)} ms`);
      return r;
    };
    const pagina1 = await medir('listar página 1 (SQL)', () =>
      amb.ok('lancamento:listar', { propriedadeId: prop }),
    );
    expect(pagina1).toMatchObject({ total: N, pagina: 1, tamanhoPagina: 50 });
    expect(pagina1.itens).toHaveLength(50);
    const ultima = await amb.ok('lancamento:listar', { propriedadeId: prop, pagina: N / 50 });
    expect(ultima.itens).toHaveLength(50);
    const pendentes = await medir('filtrar pendentes de definição (memória)', () =>
      amb.ok('lancamento:listar', { propriedadeId: prop, situacao: 'pendente_definicao' }),
    );
    expect(pendentes.total).toBe(N / 10);
    expect(pendentes.itens.every((i) => i.saldoEmAbertoCentavos === null)).toBe(true);
    const aVencer = await medir('filtrar a vencer (memória)', () =>
      amb.ok('lancamento:listar', { propriedadeId: prop, situacao: 'a_vencer' }),
    );
    const parciais = await amb.ok('lancamento:listar', {
      propriedadeId: prop,
      situacao: 'parcialmente_pago',
    });
    expect(aVencer.total + parciais.total + pendentes.total).toBe(N);
    expect(parciais.total).toBeGreaterThan(0);
    const busca = await medir('buscar por texto (memória)', () =>
      amb.ok('lancamento:listar', { propriedadeId: prop, busca: 'lancamento 19999' }),
    );
    expect(busca.total).toBe(1);
    // Caixa (4B): fluxo, contas, painel e classificação sobre o mesmo volume.
    let pagos = 0;
    for (let i = 0; i < N; i++) if (i % 10 !== 0 && i % 3 === 0) pagos += 1;
    const abertas = (N - N / 10) * 2 - pagos;
    const fluxo = await medir('fluxo de caixa (nov e dez, por mês)', () =>
      amb.ok('fluxo:obter', {
        propriedadeId: prop,
        dataInicial: '2026-11-01',
        dataFinal: '2026-12-31',
        granularidade: 'mes',
      }),
    );
    expect(fluxo.previsto.parcelas).toBe(abertas);
    expect(fluxo.realizado.movimentos).toBe(0); // os pagamentos sintéticos são de 10/10
    expect(fluxo.pendentesDeDefinicao.quantidade).toBe(N / 10);
    const contas = await medir('contas a pagar, página 1', () =>
      amb.ok('conta:listar', {
        propriedadeId: prop,
        natureza: 'despesa',
        pagina: 1,
        tamanhoPagina: 50,
      }),
    );
    expect(contas.total).toBe(abertas);
    expect(contas.itens).toHaveLength(50);
    expect(contas.resumo.saldoTotalCentavos).toBe(abertas * 10000);
    const painel = await medir('painel (mês de outubro)', () =>
      amb.ok('painel:obter', {
        propriedadeId: prop,
        dataInicial: '2026-10-01',
        dataFinal: '2026-10-31',
      }),
    );
    expect(painel.caixa.movimentos).toBe(pagos);
    const classificacao = await medir('resumo de classificação', () =>
      amb.ok('classificacao:resumo', { propriedadeId: prop }),
    );
    expect(classificacao.cobertura.quantidadeNaoClassificada).toBe(N);
    expect(await conferirCaixa(amb)).toEqual([]);
    expect(conferirInvariantes(amb)).toEqual([]);
  });
});
