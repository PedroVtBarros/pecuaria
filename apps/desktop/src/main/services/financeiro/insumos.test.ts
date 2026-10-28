import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { DadosCompraInsumos } from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import {
  DATA_DO_RELOGIO,
  categoriaPorNome,
  conferirCaixa,
  conferirInvariantes,
  contar,
  criarLancamento,
  criarPropriedade,
  dadosDeLancamento,
} from './apoio-teste';
import { conferirInsumos } from './apoio-insumos';

/**
 * Entrega 4D: compra de insumos ligada ao estoque, consumo como custo apropriado, custo sanitário
 * sem duplicação, custos desconhecidos e correções retroativas. Valores calculados à mão.
 */
let amb: AmbienteIpc;
let prop: string;
let racao: string;
let silagem: string;
let vacina: string;
let categoriaInsumos: string;
const erro = (r: { ok: boolean; erro?: { mensagem: string; detalhes?: string[] } }) => {
  expect(r.ok).toBe(false);
  return [r.erro?.mensagem, ...(r.erro?.detalhes ?? [])].join(' | ');
};
const TABELAS = [
  'lancamento_financeiro',
  'parcela_financeira',
  'pagamento_financeiro',
  'lancamento_item',
  'movimentacao_estoque',
  'estoque_lote',
  'historico_alteracao',
];
const contagens = () => TABELAS.map((t) => contar(amb, t));

async function criarItem(nome: string, extra: Record<string, unknown> = {}) {
  return (
    await amb.ok('estoque:criarItem', {
      propriedadeId: prop,
      dados: {
        nome,
        tipo: 'racao',
        unidadeBase: 'kg',
        controleLote: false,
        estoqueMinimo: null,
        produtoSanitarioId: null,
        ativo: true,
        observacoes: null,
        ...extra,
      } as never,
    })
  ).id;
}

beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
  prop = (await criarPropriedade(amb, 'Fazenda dos insumos')).id;
  racao = await criarItem('Ração');
  silagem = await criarItem('Silagem', { tipo: 'silagem' });
  vacina = await criarItem('Vacina', { tipo: 'vacina', unidadeBase: 'dose', controleLote: true });
  categoriaInsumos = (
    await categoriaPorNome(amb, 'Insumos para estoque (ração, silagem, suplemento, mineral)')
  ).id;
});
afterEach(async () => {
  expect(conferirInvariantes(amb)).toEqual([]);
  expect(conferirInsumos(amb)).toEqual([]);
  expect(await conferirCaixa(amb)).toEqual([]);
  amb.encerrar();
});

function nota(
  itens: DadosCompraInsumos['itens'],
  extra: Partial<DadosCompraInsumos> = {},
): DadosCompraInsumos {
  return {
    requisicaoId: gerarUuidV7(),
    propriedadeId: prop,
    data: '2026-10-01',
    pessoaId: null,
    categoriaId: categoriaInsumos,
    documentoNumero: 'NF-100',
    atividade: 'corte',
    observacoes: null,
    freteCentavos: 0,
    condicao: { tipo: 'a_vista', vencimento: '2026-10-20', pagamento: null },
    itens,
    ...extra,
  };
}
const item = (estoqueItemId: string, quantidade: number, valorCentavos: number) => ({
  estoqueItemId,
  quantidade,
  unidadeBase: 'kg' as const,
  valorCentavos,
  loteFisico: null,
});
const saldoDe = async (id: string) => (await amb.ok('estoque:obter', { id })).item;

describe('compra de insumos', () => {
  it('cria o lançamento e as entradas juntos, rateia o frete por valor e não cria despesa de resultado', async () => {
    const antes = contagens();
    const c = await amb.ok(
      'compraInsumo:registrar',
      nota([item(racao, 500, 100000), item(silagem, 1000, 50000)], { freteCentavos: 9000 }),
    );
    // Frete de R$ 90,00 em proporção a R$ 1.000,00 e R$ 500,00: 60,00 e 30,00.
    expect(c).toMatchObject({
      origem: 'compra_estoque',
      valorTotalCentavos: 159000,
      somaItensCentavos: 159000,
      diferencaCentavos: 0,
      quantidadeItens: 2,
      pagoCentavos: 0,
      saldoEmAbertoCentavos: 159000,
    });
    expect(c.itens.map((i) => [i.estoqueItemNome, i.valorCentavos])).toEqual([
      ['Ração', 106000],
      ['Silagem', 53000],
    ]);
    const r = await saldoDe(racao);
    expect(r).toMatchObject({ saldo: 500, valorSaldoCentavos: 106000, valoracaoCompleta: true });
    // Um lançamento, uma parcela, duas entradas e dois itens: nada além disso.
    const d = contagens().map((v, i) => v - antes[i]!);
    expect(d.slice(0, 5)).toEqual([1, 1, 0, 2, 2]);
    const l = await amb.ok('lancamento:obter', { id: c.lancamentoId });
    expect(l).toMatchObject({ natureza: 'despesa', origemTipo: 'compra_estoque' });
    expect(l.categoria.tratamento).toBe('estoque');
    // A entrada do estoque guarda o item como documento de origem.
    const detalhe = await amb.ok('estoque:obter', { id: racao });
    const entrada = detalhe.movimentos.find((m) => m.tipo === 'entrada_compra')!;
    expect(entrada.documentoOrigemId).toBe(c.itens[0]!.id);
    expect(entrada.custoEntradaCentavos).toBe(106000);
  });

  it('conservação: comprar 1.000 kg por R$ 1.000,00 e consumir 400 kg custa R$ 400,00, sem despesa nova', async () => {
    const c = await amb.ok(
      'compraInsumo:registrar',
      nota([item(racao, 1000, 100000)], {
        condicao: {
          tipo: 'a_vista',
          vencimento: '2026-10-01',
          pagamento: { data: '2026-10-01', forma: null },
        },
      }),
    );
    const lancamentos = contar(amb, 'lancamento_financeiro');
    await amb.ok('estoque:registrar', {
      itemId: racao,
      requisicaoId: gerarUuidV7(),
      dados: {
        data: '2026-10-05',
        tipo: 'saida_consumo',
        quantidade: 400,
        unidadeBase: 'kg',
        loteEstoqueId: null,
        custoEntradaCentavos: null,
        destino: 'propriedade',
        loteAnimalId: null,
        animalId: null,
        documentoOrigemId: null,
        motivo: null,
        observacao: null,
      },
    });
    expect(contar(amb, 'lancamento_financeiro')).toBe(lancamentos); // consumo não cria despesa
    // Caixa: saída de R$ 1.000,00 (a compra paga).
    const fluxo = await amb.ok('fluxo:obter', {
      propriedadeId: prop,
      dataInicial: '2026-10-01',
      dataFinal: '2026-10-31',
      granularidade: 'mes',
    });
    expect(fluxo.realizado.saidasCentavos).toBe(100000);
    // Custo apropriado: R$ 400,00; estoque remanescente R$ 600,00.
    const resumo = await amb.ok('consumo:resumo', { propriedadeId: prop });
    expect(resumo.total).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 40000 });
    expect(resumo.naoAlocado.valorConhecidoCentavos).toBe(40000);
    const r = await saldoDe(racao);
    expect(r).toMatchObject({ saldo: 600, valorSaldoCentavos: 60000 });
    expect(c.valorTotalCentavos).toBe(100000);
  });

  it('item que controla lote exige lote físico; lote novo é criado dentro da operação; erro desfaz tudo', async () => {
    const antes = contagens();
    const semLote = await amb.chamar(
      'compraInsumo:registrar',
      nota([item(racao, 10, 1000), { ...item(vacina, 20, 4000), unidadeBase: 'dose' as never }]),
    );
    expect(erro(semLote)).toMatch(/Vacina: informe o lote físico/);
    expect(contagens()).toEqual(antes);
    const ok = await amb.ok(
      'compraInsumo:registrar',
      nota([
        item(racao, 10, 1000),
        {
          estoqueItemId: vacina,
          quantidade: 20,
          unidadeBase: 'dose' as never,
          valorCentavos: 4000,
          loteFisico: { tipo: 'novo', codigo: 'L-2026', validade: '2027-06-01' },
        },
      ]),
    );
    expect(ok.quantidadeItens).toBe(2);
    expect((await saldoDe(vacina)).saldo).toBe(20);
    // Item que não controla lote recusa lote.
    expect(
      erro(
        await amb.chamar(
          'compraInsumo:registrar',
          nota([
            { ...item(racao, 1, 100), loteFisico: { tipo: 'novo', codigo: 'X', validade: null } },
          ]),
        ),
      ),
    ).toMatch(/não controla lote/);
  });

  it('frete não rateável (item sem valor) e categoria errada são recusados sem rastro', async () => {
    const antes = contagens();
    expect(
      erro(
        await amb.chamar(
          'compraInsumo:registrar',
          nota([item(racao, 10, 0), item(silagem, 5, 1000)], { freteCentavos: 500 }),
        ),
      ),
    ).toMatch(/maior que zero/);
    const outras = (await categoriaPorNome(amb, 'Outras despesas')).id;
    expect(
      erro(
        await amb.chamar(
          'compraInsumo:registrar',
          nota([item(racao, 10, 1000)], { categoriaId: outras }),
        ),
      ),
    ).toMatch(/categoria de compra para estoque/);
    expect(erro(await amb.chamar('compraInsumo:registrar', nota([item(racao, 10, 0)])))).toMatch(
      /maior que zero/,
    );
    expect(contagens()).toEqual(antes);
  });

  it('é idempotente: repetir a requisição não duplica; conteúdo diferente é recusado', async () => {
    const dados = nota([item(racao, 100, 20000)]);
    const a = await amb.ok('compraInsumo:registrar', dados);
    const antes = contagens();
    const b = await amb.ok('compraInsumo:registrar', dados);
    expect(b.lancamentoId).toBe(a.lancamentoId);
    expect(contagens()).toEqual(antes);
    expect(
      erro(
        await amb.chamar('compraInsumo:registrar', { ...dados, itens: [item(racao, 100, 30000)] }),
      ),
    ).toMatch(/já foi usado com outro conteúdo/);
  });

  it('item de outra propriedade é recusado', async () => {
    const outra = await criarPropriedade(amb, 'Outra');
    const itemDeFora = (
      await amb.ok('estoque:criarItem', {
        propriedadeId: outra.id,
        dados: {
          nome: 'Ração',
          tipo: 'racao',
          unidadeBase: 'kg',
          controleLote: false,
          estoqueMinimo: null,
          produtoSanitarioId: null,
          ativo: true,
          observacoes: null,
        },
      })
    ).id;
    expect(
      erro(await amb.chamar('compraInsumo:registrar', nota([item(itemDeFora, 1, 100)]))),
    ).toMatch(/outra propriedade/);
  });

  it('lançamento ligado a entradas não pode ser cancelado nem ter a categoria trocada à mão', async () => {
    const c = await amb.ok('compraInsumo:registrar', nota([item(racao, 100, 20000)]));
    expect(
      erro(await amb.chamar('lancamento:cancelar', { id: c.lancamentoId, motivo: 'x' })),
    ).toMatch(/módulo de origem/);
    expect(
      erro(
        await amb.chamar('lancamento:renegociar', {
          id: c.lancamentoId,
          novasParcelas: [{ vencimento: '2026-12-01', valorCentavos: 10000 }],
          novoTotalCentavos: 10000,
          motivo: 'x',
        }),
      ),
    ).toMatch(/sem mudar o total/);
  });
});

describe('entradas ligadas: correção e cancelamento só pela compra', () => {
  it('a tela de estoque recusa corrigir ou cancelar entrada ligada e orienta a usar a compra', async () => {
    const c = await amb.ok('compraInsumo:registrar', nota([item(racao, 100, 20000)]));
    const mov = (await amb.ok('estoque:obter', { id: racao })).movimentos[0]!;
    const dados = {
      data: mov.data,
      tipo: 'entrada_compra' as const,
      quantidade: 90,
      unidadeBase: 'kg' as const,
      loteEstoqueId: null,
      custoEntradaCentavos: 20000,
      destino: null,
      loteAnimalId: null,
      animalId: null,
      documentoOrigemId: mov.documentoOrigemId,
      motivo: null,
      observacao: null,
    };
    expect(
      erro(
        await amb.chamar('estoque:corrigir', {
          id: mov.id,
          requisicaoId: gerarUuidV7(),
          dados,
          motivo: 'x',
        }),
      ),
    ).toMatch(/pertence a uma compra de insumos/);
    expect(erro(await amb.chamar('estoque:cancelar', { id: mov.id, motivo: 'x' }))).toMatch(
      /pertence a uma compra de insumos/,
    );
    expect(c.quantidadeItens).toBe(1);
  });

  it('corrigir o valor repassa ao estoque, recalcula o custo dos consumos e ajusta as parcelas informadas', async () => {
    const c = await amb.ok(
      'compraInsumo:registrar',
      nota([item(racao, 1000, 100000)], {
        condicao: {
          tipo: 'parcelado',
          parcelas: [
            { vencimento: '2026-11-10', valorCentavos: 50000 },
            { vencimento: '2026-12-10', valorCentavos: 50000 },
          ],
        },
      }),
    );
    await amb.ok('estoque:registrar', {
      itemId: racao,
      requisicaoId: gerarUuidV7(),
      dados: {
        data: '2026-10-05',
        tipo: 'saida_consumo',
        quantidade: 500,
        unidadeBase: 'kg',
        loteEstoqueId: null,
        custoEntradaCentavos: null,
        destino: 'propriedade',
        loteAnimalId: null,
        animalId: null,
        documentoOrigemId: null,
        motivo: null,
        observacao: null,
      },
    });
    expect(
      (await amb.ok('consumo:resumo', { propriedadeId: prop })).total.valorConhecidoCentavos,
    ).toBe(50000);
    const itemId = c.itens[0]!.id;
    // Sem parcelas novas: recusado, nada muda.
    const antes = contagens();
    expect(
      erro(
        await amb.chamar('compraInsumo:corrigirItem', {
          itemId,
          requisicaoId: gerarUuidV7(),
          valorCentavos: 120000,
          quantidade: 1000,
          novasParcelas: [],
          motivo: 'Valor da nota estava errado',
        }),
      ),
    ).toMatch(/informe as parcelas novas/);
    expect(contagens()).toEqual(antes);
    const corrigida = await amb.ok('compraInsumo:corrigirItem', {
      itemId,
      requisicaoId: gerarUuidV7(),
      valorCentavos: 120000,
      quantidade: 1000,
      novasParcelas: [
        { vencimento: '2026-11-10', valorCentavos: 60000 },
        { vencimento: '2026-12-10', valorCentavos: 60000 },
      ],
      motivo: 'Valor da nota estava errado',
    });
    expect(corrigida).toMatchObject({
      valorTotalCentavos: 120000,
      somaItensCentavos: 120000,
      diferencaCentavos: 0,
      saldoEmAbertoCentavos: 120000,
    });
    // Custo médio R$ 1,20/kg: os 500 kg já consumidos passam a custar R$ 600,00 (recálculo do estoque).
    expect(
      (await amb.ok('consumo:resumo', { propriedadeId: prop })).total.valorConhecidoCentavos,
    ).toBe(60000);
    expect(await saldoDe(racao)).toMatchObject({ saldo: 500, valorSaldoCentavos: 60000 });
    // Trilha e entrada substituída (a antiga continua guardada, cancelada).
    expect(
      contar(amb, 'movimentacao_estoque', "tipo = 'entrada_compra' AND deleted_at IS NOT NULL"),
    ).toBe(1);
    const l = await amb.ok('lancamento:obter', { id: c.lancamentoId });
    expect(l.historico.some((h) => h.motivo === 'Valor da nota estava errado')).toBe(true);
  });

  it('o estoque pode recusar a correção (saldo negativo) e então nada muda', async () => {
    const c = await amb.ok('compraInsumo:registrar', nota([item(racao, 100, 20000)]));
    await amb.ok('estoque:registrar', {
      itemId: racao,
      requisicaoId: gerarUuidV7(),
      dados: {
        data: '2026-10-05',
        tipo: 'saida_consumo',
        quantidade: 90,
        unidadeBase: 'kg',
        loteEstoqueId: null,
        custoEntradaCentavos: null,
        destino: 'propriedade',
        loteAnimalId: null,
        animalId: null,
        documentoOrigemId: null,
        motivo: null,
        observacao: null,
      },
    });
    const antes = contagens();
    const r = await amb.chamar('compraInsumo:corrigirItem', {
      itemId: c.itens[0]!.id,
      requisicaoId: gerarUuidV7(),
      valorCentavos: 10000,
      quantidade: 50,
      novasParcelas: [{ vencimento: '2026-10-20', valorCentavos: 10000 }],
      motivo: 'Quantidade menor',
    });
    expect(r.ok).toBe(false);
    expect(contagens()).toEqual(antes);
    expect(
      (await amb.ok('compraInsumo:obter', { lancamentoId: c.lancamentoId })).valorTotalCentavos,
    ).toBe(20000);
  });

  it('com pagamento feito, o novo total não pode ficar abaixo do pago e as parcelas cobrem só o saldo', async () => {
    const c = await amb.ok('compraInsumo:registrar', nota([item(racao, 100, 20000)]));
    const l = await amb.ok('lancamento:obter', { id: c.lancamentoId });
    await amb.ok('pagamento:registrar', {
      parcelaId: l.parcelas[0]!.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-02', valorCentavos: 15000, forma: null, observacao: null },
    });
    const abaixo = await amb.chamar('compraInsumo:corrigirItem', {
      itemId: c.itens[0]!.id,
      requisicaoId: gerarUuidV7(),
      valorCentavos: 10000,
      quantidade: 100,
      novasParcelas: [],
      motivo: 'Desconto',
    });
    expect(erro(abaixo)).toMatch(/menor do que o valor já pago/);
    const ok = await amb.ok('compraInsumo:corrigirItem', {
      itemId: c.itens[0]!.id,
      requisicaoId: gerarUuidV7(),
      valorCentavos: 30000,
      quantidade: 100,
      novasParcelas: [{ vencimento: '2026-11-20', valorCentavos: 15000 }],
      motivo: 'Acréscimo',
    });
    expect(ok).toMatchObject({
      valorTotalCentavos: 30000,
      pagoCentavos: 15000,
      saldoEmAbertoCentavos: 15000,
    });
  });

  it('nota sem condição de pagamento: o total muda sem parcelas e continua pendente de definição', async () => {
    const c = await amb.ok(
      'compraInsumo:registrar',
      nota([item(racao, 100, 20000)], { condicao: { tipo: 'nao_informada' } }),
    );
    const ok = await amb.ok('compraInsumo:corrigirItem', {
      itemId: c.itens[0]!.id,
      requisicaoId: gerarUuidV7(),
      valorCentavos: 25000,
      quantidade: 100,
      novasParcelas: [],
      motivo: 'Valor corrigido',
    });
    expect(ok).toMatchObject({
      valorTotalCentavos: 25000,
      situacaoFinanceira: 'pendente_definicao',
      saldoEmAbertoCentavos: null,
    });
  });

  it('cancelar a compra cancela as entradas e o lançamento; recusa com pagamento ou saldo que ficaria negativo', async () => {
    const c = await amb.ok('compraInsumo:registrar', nota([item(racao, 100, 20000)]));
    const l = await amb.ok('lancamento:obter', { id: c.lancamentoId });
    const comPagamento = await amb.ok('pagamento:registrar', {
      parcelaId: l.parcelas[0]!.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-02', valorCentavos: 5000, forma: null, observacao: null },
    });
    expect(
      erro(
        await amb.chamar('compraInsumo:cancelar', { lancamentoId: c.lancamentoId, motivo: 'x' }),
      ),
    ).toMatch(/Estorne-os/);
    await amb.ok('pagamento:estornar', { id: comPagamento.pagamentos[0]!.id, motivo: 'Erro' });
    await amb.ok('estoque:registrar', {
      itemId: racao,
      requisicaoId: gerarUuidV7(),
      dados: {
        data: '2026-10-05',
        tipo: 'saida_consumo',
        quantidade: 60,
        unidadeBase: 'kg',
        loteEstoqueId: null,
        custoEntradaCentavos: null,
        destino: 'propriedade',
        loteAnimalId: null,
        animalId: null,
        documentoOrigemId: null,
        motivo: null,
        observacao: null,
      },
    });
    const antes = contagens();
    expect(
      (
        await amb.chamar('compraInsumo:cancelar', {
          lancamentoId: c.lancamentoId,
          motivo: 'Já consumida',
        })
      ).ok,
    ).toBe(false);
    expect(contagens()).toEqual(antes);
  });

  it('cancelar a compra sem consumo zera o estoque e deixa tudo guardado', async () => {
    const c = await amb.ok('compraInsumo:registrar', nota([item(racao, 100, 20000)]));
    const r = await amb.ok('compraInsumo:cancelar', {
      lancamentoId: c.lancamentoId,
      motivo: 'Compra desfeita',
    });
    expect(r).toMatchObject({
      cancelada: true,
      quantidadeItens: 0,
      situacaoFinanceira: 'cancelado',
    });
    expect(await saldoDe(racao)).toMatchObject({ saldo: 0 });
    expect(contar(amb, 'lancamento_item', 'deleted_at IS NOT NULL')).toBe(1);
    expect(contar(amb, 'movimentacao_estoque', 'deleted_at IS NOT NULL')).toBe(1);
  });
});

describe('vínculo retroativo e auditor', () => {
  const entradaAntiga = async (custo: number | null, quantidade = 100) =>
    amb.ok('estoque:registrar', {
      itemId: racao,
      requisicaoId: gerarUuidV7(),
      dados: {
        data: '2026-09-15',
        tipo: 'entrada_compra',
        quantidade,
        unidadeBase: 'kg',
        loteEstoqueId: null,
        custoEntradaCentavos: custo,
        destino: null,
        loteAnimalId: null,
        animalId: null,
        documentoOrigemId: null,
        motivo: null,
        observacao: null,
      },
    });

  it('lista entradas sem documento e lançamentos de estoque sem entrada, e o que não pode ligar', async () => {
    await entradaAntiga(20000);
    await entradaAntiga(null);
    await criarLancamento(
      amb,
      dadosDeLancamento(prop, categoriaInsumos, {
        descricao: 'Ração do mês',
        valorTotalCentavos: 50000,
      }),
    );
    const p = await amb.ok('auditoria:pendencias', { propriedadeId: prop });
    expect(p.entradasSemDocumento.total).toBe(2);
    expect(p.entradasSemDocumento.itens.map((e) => e.custoEntradaCentavos)).toEqual(
      expect.arrayContaining([null, 20000]),
    );
    expect(p.comprasSemEntrada.map((c) => c.descricao)).toEqual(['Ração do mês']);
    expect(p.total).toBe(3);
  });

  it('cria o lançamento a partir da entrada; entrada sem custo não é ligada a valor inventado', async () => {
    const conhecida = await entradaAntiga(20000);
    const desconhecida = await entradaAntiga(null);
    expect(
      erro(
        await amb.chamar('compraInsumo:criarDaEntrada', {
          requisicaoId: gerarUuidV7(),
          movimentacaoId: desconhecida.id,
          categoriaId: categoriaInsumos,
          pessoaId: null,
          documentoNumero: null,
          atividade: 'corte',
          condicao: { tipo: 'nao_informada' },
        }),
      ),
    ).toMatch(/custo de entrada desta compra é desconhecido/);
    const c = await amb.ok('compraInsumo:criarDaEntrada', {
      requisicaoId: gerarUuidV7(),
      movimentacaoId: conhecida.id,
      categoriaId: categoriaInsumos,
      pessoaId: null,
      documentoNumero: 'NF-9',
      atividade: 'corte',
      condicao: { tipo: 'nao_informada' },
    });
    expect(c).toMatchObject({
      valorTotalCentavos: 20000,
      quantidadeItens: 1,
      data: '2026-09-15',
      situacaoFinanceira: 'pendente_definicao',
    });
    expect(
      (await amb.ok('auditoria:pendencias', { propriedadeId: prop })).entradasSemDocumento.total,
    ).toBe(1);
    // A entrada agora está ligada: o estoque recusa corrigi-la fora da compra.
    expect(erro(await amb.chamar('estoque:cancelar', { id: conhecida.id, motivo: 'x' }))).toMatch(
      /pertence a uma compra/,
    );
  });

  it('vincula uma entrada a um lançamento antigo sem alterar valores; a diferença vira pendência', async () => {
    const entrada = await entradaAntiga(20000);
    const l = await criarLancamento(
      amb,
      dadosDeLancamento(prop, categoriaInsumos, {
        descricao: 'Ração + frete',
        valorTotalCentavos: 25000,
      }),
    );
    const c = await amb.ok('compraInsumo:vincularEntrada', {
      movimentacaoId: entrada.id,
      lancamentoId: l.id,
    });
    expect(c).toMatchObject({
      origem: 'manual',
      valorTotalCentavos: 25000,
      somaItensCentavos: 20000,
      diferencaCentavos: 5000,
    });
    const p = await amb.ok('auditoria:pendencias', { propriedadeId: prop });
    expect(p.diferencas).toEqual([
      expect.objectContaining({ id: l.id, totalCentavos: 25000, somaItensCentavos: 20000 }),
    ]);
    expect(p.entradasSemDocumento.total).toBe(0);
    // 1:1: a mesma entrada não liga duas vezes e o lançamento ligado não é cancelado à mão.
    const outra = await criarLancamento(
      amb,
      dadosDeLancamento(prop, categoriaInsumos, { descricao: 'Outro' }),
    );
    expect(
      erro(
        await amb.chamar('compraInsumo:vincularEntrada', {
          movimentacaoId: entrada.id,
          lancamentoId: outra.id,
        }),
      ),
    ).toMatch(/já está ligada/);
    expect(erro(await amb.chamar('lancamento:cancelar', { id: l.id, motivo: 'x' }))).toMatch(
      /entradas de estoque ligadas/,
    );
    // Lançamento de outra natureza ou categoria é recusado.
    const entrada2 = await entradaAntiga(1000, 5);
    const comum = await criarLancamento(
      amb,
      dadosDeLancamento(prop, (await categoriaPorNome(amb, 'Outras despesas')).id),
    );
    expect(
      erro(
        await amb.chamar('compraInsumo:vincularEntrada', {
          movimentacaoId: entrada2.id,
          lancamentoId: comum.id,
        }),
      ),
    ).toMatch(/compra para estoque/);
  });
});

describe('consumos como custo apropriado', () => {
  it('lista e totaliza por destino, item e tipo; consumo sem custo é desconhecido, nunca zero', async () => {
    const lote = await amb.ok('lote:criar', {
      propriedadeId: prop,
      dados: {
        nome: 'Engorda',
        finalidade: 'engorda',
        dataFormacao: '2026-01-01',
        areaId: null,
        observacoes: null,
      },
    });
    // Estoque inicial sem custo (valoração incompleta) e uma compra com custo.
    await amb.ok('estoque:registrar', {
      itemId: silagem,
      requisicaoId: gerarUuidV7(),
      dados: {
        data: '2026-09-01',
        tipo: 'entrada_inicial',
        quantidade: 100,
        unidadeBase: 'kg',
        loteEstoqueId: null,
        custoEntradaCentavos: null,
        destino: null,
        loteAnimalId: null,
        animalId: null,
        documentoOrigemId: null,
        motivo: null,
        observacao: null,
      },
    });
    await amb.ok('compraInsumo:registrar', nota([item(racao, 100, 10000)]));
    const consumir = (
      itemId: string,
      quantidade: number,
      destino: 'propriedade' | 'lote',
      data = '2026-10-05',
    ) =>
      amb.ok('estoque:registrar', {
        itemId,
        requisicaoId: gerarUuidV7(),
        dados: {
          data,
          tipo: 'saida_consumo',
          quantidade,
          unidadeBase: 'kg',
          loteEstoqueId: null,
          custoEntradaCentavos: null,
          destino,
          loteAnimalId: destino === 'lote' ? lote.id : null,
          animalId: null,
          documentoOrigemId: null,
          motivo: null,
          observacao: null,
        },
      });
    await consumir(racao, 40, 'lote'); // R$ 40,00
    await consumir(racao, 10, 'propriedade'); // R$ 10,00 (não alocado)
    await consumir(silagem, 20, 'lote'); // custo desconhecido
    const r = await amb.ok('consumo:resumo', { propriedadeId: prop });
    expect(r.total).toMatchObject({
      estado: 'parcial',
      valorConhecidoCentavos: 5000,
      componentesDesconhecidos: 1,
      componentesConhecidos: 2,
    });
    expect(r.naoAlocado).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 1000 });
    const lote_ = r.porDestino.find((d) => d.chave === 'lote')!;
    expect(lote_.apuracao).toMatchObject({ estado: 'parcial', valorConhecidoCentavos: 4000 });
    const ras = r.porItem.find((i) => i.rotulo === 'Ração')!;
    expect(ras.apuracao).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 5000 });
    const sil = r.porItem.find((i) => i.rotulo === 'Silagem')!;
    expect(sil.apuracao.estado).toBe('desconhecida');
    expect(sil.classificacao).toBe('nao_classificado');
    const pagina = await amb.ok('consumo:listar', {
      propriedadeId: prop,
      destino: 'lote',
      pagina: 1,
      tamanhoPagina: 50,
    });
    expect(pagina.total).toBe(2);
    expect(pagina.itens.map((c) => [c.estoqueItemNome, c.custoApropriadoCentavos])).toEqual(
      expect.arrayContaining([
        ['Silagem', null],
        ['Ração', 4000],
      ]),
    );
    // Filtros por período e por item.
    expect(
      (await amb.ok('consumo:resumo', { propriedadeId: prop, estoqueItemId: racao })).total
        .valorConhecidoCentavos,
    ).toBe(5000);
    expect(
      (await amb.ok('consumo:resumo', { propriedadeId: prop, dataInicial: '2026-10-06' })).total
        .componentesConhecidos,
    ).toBe(0);
    expect((await amb.ok('auditoria:pendencias', { propriedadeId: prop })).consumosSemCusto).toBe(
      1,
    );
  });

  it('cancelar um consumo o tira do custo; corrigir a entrada retroativamente atualiza o custo (derivado)', async () => {
    const c = await amb.ok('compraInsumo:registrar', nota([item(racao, 100, 10000)]));
    const consumo = await amb.ok('estoque:registrar', {
      itemId: racao,
      requisicaoId: gerarUuidV7(),
      dados: {
        data: '2026-10-05',
        tipo: 'saida_consumo',
        quantidade: 50,
        unidadeBase: 'kg',
        loteEstoqueId: null,
        custoEntradaCentavos: null,
        destino: 'propriedade',
        loteAnimalId: null,
        animalId: null,
        documentoOrigemId: null,
        motivo: null,
        observacao: null,
      },
    });
    expect(
      (await amb.ok('consumo:resumo', { propriedadeId: prop })).total.valorConhecidoCentavos,
    ).toBe(5000);
    await amb.ok('compraInsumo:corrigirItem', {
      itemId: c.itens[0]!.id,
      requisicaoId: gerarUuidV7(),
      valorCentavos: 20000,
      quantidade: 100,
      novasParcelas: [{ vencimento: '2026-10-20', valorCentavos: 20000 }],
      motivo: 'Valor correto',
    });
    expect(
      (await amb.ok('consumo:resumo', { propriedadeId: prop })).total.valorConhecidoCentavos,
    ).toBe(10000);
    await amb.ok('estoque:cancelar', { id: consumo.id, motivo: 'Lançado por engano' });
    const r = await amb.ok('consumo:resumo', { propriedadeId: prop });
    expect(r.total.componentesConhecidos).toBe(0);
    expect(r.total.valorConhecidoCentavos).toBe(0);
  });

  it('classificação por item de estoque: define, desfaz e não altera nada além da classificação', async () => {
    await amb.ok('compraInsumo:registrar', nota([item(racao, 100, 10000)]));
    await amb.ok('estoque:registrar', {
      itemId: racao,
      requisicaoId: gerarUuidV7(),
      dados: {
        data: '2026-10-05',
        tipo: 'saida_consumo',
        quantidade: 10,
        unidadeBase: 'kg',
        loteEstoqueId: null,
        custoEntradaCentavos: null,
        destino: 'propriedade',
        loteAnimalId: null,
        animalId: null,
        documentoOrigemId: null,
        motivo: null,
        observacao: null,
      },
    });
    const lancamentos = contar(amb, 'lancamento_financeiro');
    let lista = await amb.ok('classificacaoOrigem:definir', {
      propriedadeId: prop,
      escopo: 'estoque_item',
      referenciaId: racao,
      comportamento: 'variavel',
    });
    expect(lista).toEqual([
      { escopo: 'estoque_item', referenciaId: racao, comportamento: 'variavel' },
    ]);
    expect(
      (await amb.ok('consumo:resumo', { propriedadeId: prop })).porItem[0]!.classificacao,
    ).toBe('variavel');
    lista = await amb.ok('classificacaoOrigem:definir', {
      propriedadeId: prop,
      escopo: 'estoque_item',
      referenciaId: racao,
      comportamento: 'nao_classificado',
    });
    expect(lista[0]!.comportamento).toBe('nao_classificado');
    expect(contar(amb, 'lancamento_financeiro')).toBe(lancamentos);
    expect(contar(amb, 'historico_alteracao', "entidade = 'classificacao_origem'")).toBe(2);
    // Escopos globais não têm referência; item de estoque exige.
    expect(
      (
        await amb.chamar('classificacaoOrigem:definir', {
          propriedadeId: prop,
          escopo: 'aquisicao_animal',
          referenciaId: racao,
          comportamento: 'fixo',
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await amb.ok('classificacaoOrigem:definir', {
          propriedadeId: prop,
          escopo: 'aquisicao_animal',
          referenciaId: null,
          comportamento: 'fixo',
        })
      ).length,
    ).toBe(2);
  });
});

describe('custo sanitário sem duplicação (plano 5.6)', () => {
  async function manejoComBaixa(custoInformado: number | null) {
    const produto = (
      await amb.ok('produtoSanitario:criar', {
        dados: {
          nome: 'Produto',
          tipo: 'outro',
          fabricante: null,
          principioAtivo: null,
          unidadeDose: null,
          carenciaCarneDias: null,
          carenciaLeiteDias: null,
          observacoes: null,
        },
      })
    ).id;
    const medicamento = await criarItem('Medicamento', {
      tipo: 'medicamento',
      unidadeBase: 'ml',
      produtoSanitarioId: produto,
    });
    await amb.ok('estoque:registrar', {
      itemId: medicamento,
      requisicaoId: gerarUuidV7(),
      dados: {
        data: '2026-09-01',
        tipo: 'entrada_compra',
        quantidade: 100,
        unidadeBase: 'ml',
        loteEstoqueId: null,
        custoEntradaCentavos: 2000,
        destino: null,
        loteAnimalId: null,
        animalId: null,
        documentoOrigemId: null,
        motivo: null,
        observacao: null,
      },
    });
    const animais: { animalId: string; dose: null }[] = [];
    for (const identificacao of ['S-1', 'S-2']) {
      const a = await amb.ok('animal:criar', {
        propriedadeId: prop,
        dados: {
          identificacao,
          nome: null,
          sexo: 'M',
          condicaoSexual: 'castrado',
          categoria: 'garrote',
          aptidao: 'corte',
          racaId: null,
          dataNascimento: null,
          dataNascimentoEstimada: false,
          maeId: null,
          paiId: null,
          origem: 'comprado',
          observacoes: null,
        },
        entrada: { data: '2026-01-01', loteId: null, pesoVivoKg: null, metodoPesagem: null },
      });
      animais.push({ animalId: a.id, dose: null });
    }
    const m = await amb.ok('manejoSanitario:registrar', {
      propriedadeId: prop,
      dados: {
        tipo: 'tratamento',
        data: '2026-10-01',
        produtoId: produto,
        descricao: null,
        dose: 0.1,
        unidadeDose: 'ml',
        via: null,
        carenciaCarneDias: null,
        carenciaLeiteDias: null,
        responsavel: null,
        diagnostico: null,
        custoTotalCentavos: custoInformado,
        observacoes: null,
      },
      animais,
      consumosEstoque: [
        {
          requisicaoId: gerarUuidV7(),
          itemId: medicamento,
          loteEstoqueId: null,
          quantidade: 5,
          unidadeBase: 'ml',
        },
      ],
    });
    return { m, medicamento };
  }

  it('baixa de estoque é o custo; o valor informado fica "não contado"; dividido por igual entre os animais', async () => {
    const { m } = await manejoComBaixa(9000);
    const c = await amb.ok('custoSanitario:obter', { manejoId: m.id });
    // 5 ml a R$ 0,20/ml = R$ 1,00.
    expect(c.apuracao).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 100 });
    expect(c).toMatchObject({
      informadoCentavos: 9000,
      informadoContado: false,
      informadoNaoContadoCentavos: 9000,
      servicosCentavos: 0,
    });
    expect(c.porAnimal.map((a) => a.valorCentavos)).toEqual([50, 50]);
  });

  it('serviço lançado soma sem repetir a baixa; informado continua fora', async () => {
    const { m } = await manejoComBaixa(9000);
    const cat = await categoriaPorNome(amb, 'Sanidade (serviços e despesas diretas)');
    const lancamentos = contar(amb, 'lancamento_financeiro');
    const c = await amb
      .ok('custoSanitario:lancarServico', {
        requisicaoId: gerarUuidV7(),
        manejoId: m.id,
        categoriaId: cat.id,
        pessoaId: null,
        dataCompetencia: '2026-10-02',
        valorTotalCentavos: 8000,
        descricao: 'Consulta veterinária',
        documentoNumero: null,
        condicao: { tipo: 'nao_nformada' as never },
      })
      .catch(() => null);
    expect(c).toBeNull(); // condição inválida é recusada pela validação
    const ok = await amb.ok('custoSanitario:lancarServico', {
      requisicaoId: gerarUuidV7(),
      manejoId: m.id,
      categoriaId: cat.id,
      pessoaId: null,
      dataCompetencia: '2026-10-02',
      valorTotalCentavos: 8000,
      descricao: 'Consulta veterinária',
      documentoNumero: null,
      condicao: { tipo: 'nao_informada' },
    });
    expect(contar(amb, 'lancamento_financeiro')).toBe(lancamentos + 1);
    expect(ok.apuracao).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 8100 });
    expect(ok.servicos).toHaveLength(1);
    expect(ok.informadoNaoContadoCentavos).toBe(9000);
    expect(ok.porAnimal.map((a) => a.valorCentavos)).toEqual([4050, 4050]);
    // O serviço pode ser cancelado como lançamento comum (origem sanitária).
    const id = ok.servicos[0]!.id;
    await amb.ok('lancamento:cancelar', { id, motivo: 'Lançado em duplicidade' });
    expect(
      (await amb.ok('custoSanitario:obter', { manejoId: m.id })).apuracao.valorConhecidoCentavos,
    ).toBe(100);
  });

  it('só o valor informado (registro antigo) conta; sem nada, não apurado; baixa sem custo é desconhecida', async () => {
    // Registro antigo: sem baixa e sem serviço.
    const produto = (
      await amb.ok('produtoSanitario:criar', {
        dados: {
          nome: 'Antigo',
          tipo: 'outro',
          fabricante: null,
          principioAtivo: null,
          unidadeDose: null,
          carenciaCarneDias: null,
          carenciaLeiteDias: null,
          observacoes: null,
        },
      })
    ).id;
    const a = await amb.ok('animal:criar', {
      propriedadeId: prop,
      dados: {
        identificacao: 'Z-1',
        nome: null,
        sexo: 'M',
        condicaoSexual: 'castrado',
        categoria: 'garrote',
        aptidao: 'corte',
        racaId: null,
        dataNascimento: null,
        dataNascimentoEstimada: false,
        maeId: null,
        paiId: null,
        origem: 'comprado',
        observacoes: null,
      },
      entrada: { data: '2026-01-01', loteId: null, pesoVivoKg: null, metodoPesagem: null },
    });
    const registrar = (custo: number | null) =>
      amb.ok('manejoSanitario:registrar', {
        propriedadeId: prop,
        dados: {
          tipo: 'tratamento',
          data: '2026-10-01',
          produtoId: produto,
          descricao: null,
          dose: null,
          unidadeDose: null,
          via: null,
          carenciaCarneDias: null,
          carenciaLeiteDias: null,
          responsavel: null,
          diagnostico: null,
          custoTotalCentavos: custo,
          observacoes: null,
        },
        animais: [{ animalId: a.id, dose: null }],
        consumosEstoque: [],
      });
    const comInformado = await registrar(7000);
    const c1 = await amb.ok('custoSanitario:obter', { manejoId: comInformado.id });
    expect(c1).toMatchObject({ informadoContado: true });
    expect(c1.apuracao).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 7000 });
    const semNada = await registrar(null);
    const c2 = await amb.ok('custoSanitario:obter', { manejoId: semNada.id });
    expect(c2.apuracao.estado).toBe('nao_apurada');
    expect(c2.porAnimal).toEqual([]);
  });
});
