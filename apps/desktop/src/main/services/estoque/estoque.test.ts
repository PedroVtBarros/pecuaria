import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { DadosItemEstoque, DadosMovimentoEstoque } from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
let amb: AmbienteIpc;
let prop: string;
async function propriedade(nome: string) {
  return amb.ok('propriedade:criar', {
    dados: {
      nome,
      municipio: null,
      uf: null,
      areaTotalHa: null,
      tipoExploracao: 'misto',
      observacoes: null,
    },
  });
}
function itemDados(extra: Partial<DadosItemEstoque> = {}): DadosItemEstoque {
  return {
    nome: 'Silagem própria',
    tipo: 'silagem',
    unidadeBase: 'kg',
    controleLote: false,
    estoqueMinimo: null,
    produtoSanitarioId: null,
    ativo: true,
    observacoes: null,
    ...extra,
  };
}
async function item(extra: Partial<DadosItemEstoque> = {}, propriedadeId = prop) {
  return amb.ok('estoque:criarItem', { propriedadeId, dados: itemDados(extra) });
}
function dados(
  tipo: DadosMovimentoEstoque['tipo'],
  quantidade = 10,
  extra: Partial<DadosMovimentoEstoque> = {},
): DadosMovimentoEstoque {
  return {
    data: '2026-10-01',
    tipo,
    quantidade,
    unidadeBase: 'kg',
    loteEstoqueId: null,
    custoEntradaCentavos: tipo.startsWith('entrada') ? 1000 : null,
    destino: tipo.startsWith('entrada') ? null : 'propriedade',
    loteAnimalId: null,
    animalId: null,
    documentoOrigemId: null,
    motivo: null,
    observacao: null,
    ...extra,
  };
}
async function mover(itemId: string, d: DadosMovimentoEstoque) {
  return amb.ok('estoque:registrar', { itemId, requisicaoId: gerarUuidV7(), dados: d });
}
beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 16, 12) });
  prop = (await propriedade('Fazenda estoque')).id;
});
afterEach(() => amb.encerrar());

describe('entrega 2: cadastro de estoque', () => {
  it('cadastro por propriedade, normalização, unidade e base de matéria natural', async () => {
    const i = await item();
    expect(i).toMatchObject({
      saldo: 0,
      valorSaldoCentavos: 0,
      baseMateria: 'mn',
      unidadeBase: 'kg',
      produtoSanitarioId: null,
    });
    const duplicado = await amb.chamar('estoque:criarItem', {
      propriedadeId: prop,
      dados: itemDados({ nome: '  silagem própria  ' }),
    });
    expect(duplicado.ok).toBe(false);
    const outra = await propriedade('Outra');
    expect((await item({}, outra.id)).propriedadeId).toBe(outra.id);
  });
  it('edita, audita e inativa item sem saldo', async () => {
    const i = await item();
    const atualizado = await amb.ok('estoque:atualizarItem', {
      id: i.id,
      dados: itemDados({ nome: 'Silagem identificada', ativo: false }),
      motivo: 'Cadastro duplicado na conferência',
    });
    expect(atualizado.ativo).toBe(false);
    expect(await amb.ok('estoque:listar', { propriedadeId: prop })).toEqual([]);
    expect(
      await amb.ok('estoque:listar', { propriedadeId: prop, incluirInativos: true }),
    ).toHaveLength(1);
    expect(
      (await amb.ok('estoque:obter', { id: i.id })).historico.some(
        (h) => h.motivo === 'Cadastro duplicado na conferência',
      ),
    ).toBe(true);
  });
  it('produto global pode ter estoque em duas propriedades e fica protegido contra exclusão', async () => {
    const p = await amb.ok('produtoSanitario:criar', {
      dados: {
        nome: 'Produto cadastrado',
        tipo: 'outro',
        fabricante: null,
        principioAtivo: null,
        unidadeDose: null,
        carenciaCarneDias: null,
        carenciaLeiteDias: null,
        observacoes: null,
      },
    });
    await item({
      nome: 'Produto',
      tipo: 'medicamento',
      unidadeBase: 'ml',
      produtoSanitarioId: p.id,
    });
    await item(
      { nome: 'Produto', tipo: 'medicamento', unidadeBase: 'ml', produtoSanitarioId: p.id },
      (await propriedade('Segunda fazenda')).id,
    );
    expect((await amb.chamar('produtoSanitario:excluir', { id: p.id })).ok).toBe(false);
    expect((await amb.chamar('propriedade:excluir', { id: prop })).ok).toBe(false);
  });
  it('recusa datas impossíveis e código de lote físico duplicado', async () => {
    const i = await item({ controleLote: true });
    await amb.ok('estoque:criarLote', { itemId: i.id, dados: { codigo: 'L-1', validade: null } });
    expect(
      (
        await amb.chamar('estoque:criarLote', {
          itemId: i.id,
          dados: { codigo: 'l-1', validade: null },
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await amb.chamar('estoque:criarLote', {
          itemId: i.id,
          dados: { codigo: 'L-2', validade: '2026-02-30' },
        })
      ).ok,
    ).toBe(false);
  });
});

describe('entrega 3: movimentações e custo médio', () => {
  it('compra, consumo produtivo e nova entrada têm custos separados e identificadores próprios', async () => {
    const i = await item();
    const compra = await mover(i.id, dados('entrada_compra', 10, { custoEntradaCentavos: 10000 }));
    const consumo = await mover(i.id, dados('saida_consumo', 5));
    await mover(i.id, dados('entrada_compra', 5, { custoEntradaCentavos: 10000 }));
    expect(consumo).toMatchObject({ destino: 'propriedade', custoApropriadoCentavos: 5000 });
    expect(compra.requisicaoId).not.toBe(consumo.requisicaoId);
    expect((await amb.ok('estoque:obter', { id: i.id })).item).toMatchObject({
      saldo: 10,
      valorSaldoCentavos: 15000,
    });
  });
  it('custo desconhecido não vira zero, e correção retroativa completa a valoração auditada', async () => {
    const i = await item();
    const entrada = await mover(
      i.id,
      dados('entrada_producao', 10, { custoEntradaCentavos: null }),
    );
    const saida = await mover(i.id, dados('saida_consumo', 2));
    expect(saida.custoApropriadoCentavos).toBeNull();
    expect((await amb.ok('estoque:obter', { id: i.id })).item.valoracaoCompleta).toBe(false);
    const antes = await amb.ok('estoque:prever', {
      itemId: i.id,
      substituiId: entrada.id,
      dados: dados('entrada_producao', 10, { custoEntradaCentavos: 1000 }),
    });
    expect(antes).toMatchObject({ saldo: 8, valorSaldoCentavos: 800, movimentosRecalculados: 1 });
    expect((await amb.ok('estoque:obter', { id: i.id })).item.valoracaoCompleta).toBe(false);
    const corrigida = await amb.ok('estoque:corrigir', {
      id: entrada.id,
      requisicaoId: gerarUuidV7(),
      dados: dados('entrada_producao', 10, { custoEntradaCentavos: 1000 }),
      motivo: 'Custo apurado posteriormente',
    });
    expect(corrigida.ordem).toBe(entrada.ordem);
    const d = await amb.ok('estoque:obter', { id: i.id });
    expect(d.item).toMatchObject({ saldo: 8, valorSaldoCentavos: 800, valoracaoCompleta: true });
    expect(d.movimentos.find((m) => m.id === saida.id)?.custoApropriadoCentavos).toBe(200);
    expect(d.movimentos.find((m) => m.id === entrada.id)?.canceladoEm).not.toBeNull();
    expect(
      d.historico.some(
        (h) =>
          h.dadosAnteriores?.['custoApropriadoCentavos'] === null &&
          h.dadosNovos?.['custoApropriadoCentavos'] === 200,
      ),
    ).toBe(true);
  });
  it('produção com custo zero conhecido conserva zero nas saídas', async () => {
    const i = await item();
    await mover(i.id, dados('entrada_producao', 1, { custoEntradaCentavos: 0 }));
    expect((await mover(i.id, dados('saida_consumo', 0.125))).custoApropriadoCentavos).toBe(0);
    expect((await amb.ok('estoque:obter', { id: i.id })).item).toMatchObject({
      saldo: 0.875,
      valoracaoCompleta: true,
      valorSaldoCentavos: 0,
    });
  });
  it('prévia e transações recusam saldo negativo, inclusive ao corrigir ou cancelar entrada antiga', async () => {
    const i = await item();
    const e = await mover(i.id, dados('entrada_compra', 10));
    await mover(i.id, dados('saida_consumo', 8, { data: '2026-10-02' }));
    for (const d of [
      dados('entrada_compra', 5),
      dados('entrada_compra', 10, { data: '2026-10-03' }),
    ])
      expect(
        (
          await amb.chamar('estoque:corrigir', {
            id: e.id,
            requisicaoId: gerarUuidV7(),
            dados: d,
            motivo: 'Correção conferida',
          })
        ).ok,
      ).toBe(false);
    expect(
      (await amb.chamar('estoque:cancelar', { id: e.id, motivo: 'Cancelamento conferido' })).ok,
    ).toBe(false);
    const atual = await amb.ok('estoque:obter', { id: i.id });
    expect(atual.item.saldo).toBe(2);
    expect(atual.movimentos).toHaveLength(2);
    expect(atual.movimentos.every((m) => !m.canceladoEm)).toBe(true);
  });
  it('repetição idempotente não duplica; mesmo identificador com outro conteúdo é recusado', async () => {
    const i = await item();
    const req = { itemId: i.id, requisicaoId: gerarUuidV7(), dados: dados('entrada_compra') };
    const a = await amb.ok('estoque:registrar', req);
    expect((await amb.ok('estoque:registrar', req)).id).toBe(a.id);
    expect(
      (await amb.chamar('estoque:registrar', { ...req, dados: dados('entrada_compra', 20) })).ok,
    ).toBe(false);
    expect((await amb.ok('estoque:obter', { id: i.id })).item.saldo).toBe(10);
  });
  it('unidades não são convertidas e cadastros com movimentos não mudam de unidade', async () => {
    const i = await item();
    await mover(i.id, dados('entrada_compra'));
    expect(
      (
        await amb.chamar('estoque:registrar', {
          itemId: i.id,
          requisicaoId: gerarUuidV7(),
          dados: dados('saida_consumo', 1, { unidadeBase: 'l' }),
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await amb.chamar('estoque:atualizarItem', {
          id: i.id,
          dados: itemDados({ unidadeBase: 'l' }),
          motivo: 'Troca de unidade',
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await amb.chamar('estoque:atualizarItem', {
          id: i.id,
          dados: itemDados({ ativo: false }),
          motivo: 'Inativação',
        })
      ).ok,
    ).toBe(false);
  });
  it('destino por lote ou animal fica explícito; vínculos de outra propriedade são recusados', async () => {
    const i = await item();
    await mover(i.id, dados('entrada_compra'));
    const outra = await propriedade('Outro destino');
    async function lote(propriedadeId: string) {
      return amb.ok('lote:criar', {
        propriedadeId,
        dados: {
          nome: 'Recria',
          finalidade: 'recria',
          dataFormacao: '2026-01-01',
          areaId: null,
          observacoes: null,
        },
      });
    }
    const l = await lote(prop);
    const errado = await lote(outra.id);
    expect(
      (await mover(i.id, dados('saida_consumo', 1, { destino: 'lote', loteAnimalId: l.id })))
        .loteAnimalId,
    ).toBe(l.id);
    expect(
      (
        await amb.chamar('estoque:registrar', {
          itemId: i.id,
          requisicaoId: gerarUuidV7(),
          dados: dados('saida_consumo', 1, { destino: 'lote', loteAnimalId: errado.id }),
        })
      ).ok,
    ).toBe(false);
  });
});

describe('entrega 4: lotes físicos, validade e mínimo', () => {
  it('saldo por lote impede retirada do lote errado; vencimento é aviso e ausência é desconhecida', async () => {
    const i = await item({ controleLote: true, estoqueMinimo: 2 });
    const l1 = await amb.ok('estoque:criarLote', {
      itemId: i.id,
      dados: { codigo: 'Vencido', validade: '2026-10-15' },
    });
    const l2 = await amb.ok('estoque:criarLote', {
      itemId: i.id,
      dados: { codigo: 'Sem validade', validade: null },
    });
    await mover(i.id, dados('entrada_compra', 1, { loteEstoqueId: l1.id }));
    expect(
      (
        await amb.chamar('estoque:registrar', {
          itemId: i.id,
          requisicaoId: gerarUuidV7(),
          dados: dados('saida_consumo', 1, { loteEstoqueId: l2.id }),
        })
      ).ok,
    ).toBe(false);
    const a = await amb.ok('estoque:alertas', { propriedadeId: prop });
    expect(a.minimo).toHaveLength(1);
    expect(a.validade).toHaveLength(1);
    expect(a.validade[0]?.situacao).toBe('vencido');
    await mover(i.id, dados('saida_consumo', 1, { loteEstoqueId: l1.id }));
    expect((await amb.ok('estoque:alertas', { propriedadeId: prop })).validade).toHaveLength(0);
  });
  it('antecedência é configurável e alterações da validade são auditadas', async () => {
    const i = await item({ controleLote: true });
    const l = await amb.ok('estoque:criarLote', {
      itemId: i.id,
      dados: { codigo: 'L1', validade: '2026-10-26' },
    });
    await mover(i.id, dados('entrada_compra', 1, { loteEstoqueId: l.id }));
    expect((await amb.ok('estoque:alertas', { propriedadeId: prop })).validade).toHaveLength(0);
    await amb.ok('configuracao:definir', {
      chave: 'alertas.estoque',
      valor: { antecedenciaValidadeDias: 10 },
    });
    expect((await amb.ok('estoque:alertas', { propriedadeId: prop })).validade[0]?.situacao).toBe(
      'proximo',
    );
    await amb.ok('estoque:atualizarLote', {
      id: l.id,
      dados: { codigo: 'L1', validade: null },
      motivo: 'Não havia data legível',
    });
    expect(
      (await amb.ok('estoque:obter', { id: i.id })).historico.some(
        (h) => h.motivo === 'Não havia data legível',
      ),
    ).toBe(true);
  });
});
