import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { DadosDevolucao, NegociacaoDetalhe } from '@pecuaria/shared-types';
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
import { comprar, criarLote, dadosDeCompra, dadosDeVenda, vender } from './apoio-animais';
import { conferirApropriacaoDoBanco } from './apoio-rateio';
import { conferirResultado } from './apoio-resultado';

/**
 * Devolução de animais (revisão final da Fase 4). Valores à mão:
 * - a1..a4 comprados em 01/09 por R$ 4.000,00 à vista pagos (R$ 1.000,00 cada), no Lote A;
 * - despesa de R$ 400,00 no Lote A em 10/09 (R$ 100,00 por animal);
 * - b1 e b2 comprados em 01/09 de um fornecedor por R$ 2.000,00: parcela de R$ 1.000,00 paga em
 *   01/09 e R$ 1.000,00 em aberto (10/11), sem lote.
 * Hoje é 16/10/2026.
 */
let amb: AmbienteIpc;
let prop: string;
let loteA: string;
let loteB: string;
let fornecedor: string;
let comprador: string;
let compraB: NegociacaoDetalhe;
const animal: Record<string, string> = {};
const OUT = { dataInicial: '2026-10-01', dataFinal: '2026-10-16' };
const pago = (data: string) => ({
  tipo: 'a_vista' as const,
  vencimento: data,
  pagamento: { data, forma: null },
});
const emAberto = (vencimento: string) => ({
  tipo: 'a_vista' as const,
  vencimento,
  pagamento: null,
});

beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
  prop = (await criarPropriedade(amb, 'Fazenda das devoluções')).id;
  loteA = (await criarLote(amb, prop, 'Lote A')).id;
  loteB = (await criarLote(amb, prop, 'Lote B')).id;
  const pessoa = async (nome: string, papel: 'fornecedor' | 'comprador') =>
    (
      await amb.ok('pessoaComercial:criar', {
        dados: { nome, papel, documento: null, observacoes: null, ativo: true },
      })
    ).id;
  fornecedor = await pessoa('Leilões Vale', 'fornecedor');
  comprador = await pessoa('Frigorífico Sul', 'comprador');
  const c = await comprar(
    amb,
    dadosDeCompra(
      prop,
      ['a1', 'a2', 'a3', 'a4'].map((identificacao) => ({ identificacao })),
      {
        loteId: loteA,
        valorTotalCentavos: 400000,
        data: '2026-09-01',
        condicao: pago('2026-09-01'),
      },
    ),
  );
  for (const i of c.itens) animal[i.animalIdentificacao] = i.animalId;
  compraB = await comprar(
    amb,
    dadosDeCompra(prop, [{ identificacao: 'b1' }, { identificacao: 'b2' }], {
      valorTotalCentavos: 200000,
      data: '2026-09-01',
      pessoaId: fornecedor,
      condicao: {
        tipo: 'parcelado',
        parcelas: [
          { vencimento: '2026-09-01', valorCentavos: 100000 },
          { vencimento: '2026-11-10', valorCentavos: 100000 },
        ],
      },
    }),
  );
  for (const i of compraB.itens) animal[i.animalIdentificacao] = i.animalId;
  const lanc = await amb.ok('lancamento:obter', { id: compraB.lancamentoId });
  await amb.ok('pagamento:registrar', {
    parcelaId: lanc.parcelas.find((p) => p.numero === 1)!.id,
    requisicaoId: gerarUuidV7(),
    dados: { data: '2026-09-01', valorCentavos: 100000, forma: null, observacao: null },
  });
  await criarLancamento(
    amb,
    dadosDeLancamento(
      prop,
      (await categoriaPorNome(amb, 'Alimentação (despesa direta, sem estoque)')).id,
      {
        valorTotalCentavos: 40000,
        dataCompetencia: '2026-09-10',
        descricao: 'Despesa do Lote A',
        destino: { tipo: 'lote', loteId: loteA },
        condicao: pago('2026-09-10'),
      },
    ),
  );
});
afterEach(async () => {
  expect(conferirInvariantes(amb)).toEqual([]);
  expect(await conferirCaixa(amb)).toEqual([]);
  expect(await conferirApropriacaoDoBanco(amb)).toEqual([]);
  expect(await conferirResultado(amb, prop, '2026-10-16')).toEqual([]);
  amb.encerrar();
});

const devolucao = (
  negociacao: NegociacaoDetalhe,
  itens: [string, number][],
  extra: Partial<DadosDevolucao> = {},
): DadosDevolucao => ({
  requisicaoId: gerarUuidV7(),
  negociacaoId: negociacao.id,
  data: '2026-10-10',
  itens: itens.map(([id, valorCentavos]) => ({
    negociacaoItemId: negociacao.itens.find((i) => i.animalIdentificacao === id)!.id,
    valorCentavos,
  })),
  loteRetornoId: loteB,
  condicaoRestante: emAberto('2026-10-20'),
  observacoes: null,
  ...extra,
});
const pagamentos = () => contar(amb, 'pagamento_financeiro', 'deleted_at IS NULL');
const periodo = (p = OUT) => amb.ok('resultado:periodo', { propriedadeId: prop, ...p });

describe('devolução de venda: exemplo do usuário (R$ 3.000,00, R$ 1.000,00 recebidos)', () => {
  it('compensa os R$ 2.000,00 em aberto, reconhece R$ 1.000,00 a reembolsar e só gera caixa quando pago', async () => {
    const venda = await vender(
      amb,
      dadosDeVenda(
        prop,
        ['a1', 'a2', 'a3'].map((n) => ({ animalId: animal[n]! })),
        {
          valorTotalCentavos: 300000,
          data: '2026-10-01',
          pessoaId: comprador,
          condicao: {
            tipo: 'parcelado',
            parcelas: [
              { vencimento: '2026-10-01', valorCentavos: 100000 },
              { vencimento: '2026-11-10', valorCentavos: 100000 },
              { vencimento: '2026-12-10', valorCentavos: 100000 },
            ],
          },
        },
      ),
    );
    const lancVenda = await amb.ok('lancamento:obter', { id: venda.lancamentoId });
    await amb.ok('pagamento:registrar', {
      parcelaId: lancVenda.parcelas.find((p) => p.numero === 1)!.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-01', valorCentavos: 100000, forma: null, observacao: null },
    });
    const dados = devolucao(venda, [
      ['a1', 100000],
      ['a2', 100000],
      ['a3', 100000],
    ]);
    const previa = await amb.ok('devolucao:prever', {
      negociacaoId: dados.negociacaoId,
      data: dados.data,
      itens: dados.itens,
      loteRetornoId: dados.loteRetornoId,
    });
    expect(previa).toMatchObject({
      valorTotalCentavos: 300000,
      emAbertoNaOriginalCentavos: 200000,
      liquidadoNaOriginalCentavos: 100000,
      compensadoCentavos: 200000,
      restanteCentavos: 100000,
      diferencaDoOriginalCentavos: 0,
    });
    const antesPagamentos = pagamentos();
    const d = await amb.ok('devolucao:registrar', dados);
    // Nenhum pagamento fictício: a compensação não é pagamento.
    expect(pagamentos()).toBe(antesPagamentos);
    expect(d).toMatchObject({
      tipo: 'venda',
      valorTotalCentavos: 300000,
      compensadoCentavos: 200000,
      restanteCentavos: 100000,
      liquidadoEmCaixaCentavos: 0,
      restanteEmAbertoCentavos: 100000,
    });
    // Venda original: R$ 1.000,00 recebidos + R$ 2.000,00 compensados; nada mais a receber.
    const vendaDepois = await amb.ok('lancamento:obter', { id: venda.lancamentoId });
    expect(vendaDepois).toMatchObject({
      valorOperacaoCentavos: 300000,
      pagoCentavos: 100000,
      compensadoCentavos: 200000,
      saldoEmAbertoCentavos: 0,
      situacao: 'quitado',
    });
    // Reembolso a pagar ao comprador; o caixa só tem a entrada de R$ 1.000,00.
    const contas = await amb.ok('conta:listar', {
      propriedadeId: prop,
      natureza: 'despesa',
      pagina: 1,
      tamanhoPagina: 50,
    });
    expect(
      contas.itens.map((c) => [c.descricao.startsWith('Devolução'), c.saldoCentavos]),
    ).toContainEqual([true, 100000]);
    // Parcelas da venda liquidadas por compensação não aparecem em contas a receber.
    const aReceber = await amb.ok('conta:listar', {
      propriedadeId: prop,
      natureza: 'receita',
      pagina: 1,
      tamanhoPagina: 50,
    });
    expect(aReceber.itens.filter((c) => c.lancamentoId === venda.lancamentoId)).toEqual([]);
    let r = await periodo();
    expect(r.caixa).toMatchObject({ entradasCentavos: 100000, saidasCentavos: 0 });
    // Pago o reembolso, a saída de caixa aparece.
    const lancDev = await amb.ok('lancamento:obter', { id: d.lancamentoId });
    const parcelaReembolso = lancDev.parcelas.find((p) => p.saldoCentavos > 0)!;
    await amb.ok('pagamento:registrar', {
      parcelaId: parcelaReembolso.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-15', valorCentavos: 100000, forma: null, observacao: null },
    });
    r = await periodo();
    expect(r.caixa).toMatchObject({ entradasCentavos: 100000, saidasCentavos: 100000 });
    // Animais de volta, no Lote B, com a venda e a saída preservadas no histórico.
    for (const n of ['a1', 'a2', 'a3']) {
      const a = await amb.ok('animal:obter', { id: animal[n]! });
      expect(a).toMatchObject({ status: 'ativo', lote: { id: loteB } });
    }
    const negociacao = await amb.ok('negociacao:obter', { id: venda.id });
    expect(negociacao.cancelada).toBe(false);
    expect(negociacao.itens.every((i) => !i.cancelado && i.devolucao?.id === d.id)).toBe(true);
    expect(negociacao.devolucoes.map((x) => x.id)).toEqual([d.id]);
    // Competência: venda bruta R$ 3.000,00, devoluções R$ 3.000,00 (receita líquida zero), baixa
    // e estorno da aquisição (R$ 3.000,00 cada): nada sobra no resultado de outubro.
    expect(r.competencia.receitas).toMatchObject({
      vendaAnimaisCentavos: 300000,
      devolucoesVendaCentavos: 300000,
      totalCentavos: 0,
    });
    expect(r.competencia).toMatchObject({
      baixaDeAnimaisCentavos: 300000,
      estornoDeBaixaCentavos: 300000,
      resultadoCentavos: 0,
      estado: 'completo',
    });
  });
});

describe('devolução parcial de venda coletiva, valor diferente do original e revenda', () => {
  it('compensa só o valor acordado, mantém o restante a receber e o resultado fecha à mão', async () => {
    const venda = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: animal['a1']! }, { animalId: animal['a2']! }], {
        valorTotalCentavos: 300000,
        data: '2026-10-01',
        pessoaId: comprador,
        condicao: emAberto('2026-10-20'),
      }),
    );
    const d = await amb.ok(
      'devolucao:registrar',
      devolucao(venda, [['a1', 140000]], { data: '2026-10-05' }),
    );
    expect(d).toMatchObject({
      compensadoCentavos: 140000,
      restanteCentavos: 0,
      diferencaDoOriginalCentavos: 10000,
      situacaoFinanceira: 'quitado',
    });
    const vendaDepois = await amb.ok('lancamento:obter', { id: venda.lancamentoId });
    expect(vendaDepois).toMatchObject({
      compensadoCentavos: 140000,
      saldoEmAbertoCentavos: 160000,
    });
    // Devolução duplicada do mesmo animal pela mesma venda é recusada.
    const dup = await amb.chamar(
      'devolucao:registrar',
      devolucao(venda, [['a1', 140000]], { data: '2026-10-06' }),
    );
    expect(dup.ok).toBe(false);
    // a2 continua vendido; a1 voltou e pode ser vendido de novo.
    expect((await amb.ok('animal:obter', { id: animal['a2']! })).status).toBe('vendido');
    let r = await periodo();
    // Venda R$ 3.000,00 − devolução R$ 1.400,00 = R$ 1.600,00; baixa a1 e a2 (R$ 2.000,00) −
    // estorno de a1 (R$ 1.000,00) = R$ 1.000,00 de custo; resultado R$ 600,00.
    expect(r.competencia).toMatchObject({ resultadoCentavos: 60000, estado: 'completo' });
    await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: animal['a1']! }], {
        valorTotalCentavos: 170000,
        data: '2026-10-12',
        condicao: pago('2026-10-12'),
      }),
    );
    r = await periodo();
    // a2: +R$ 500,00; a1: 1.500 − 1.400 + 1.700 − 1.000 = +R$ 800,00. Total R$ 1.300,00.
    expect(r.competencia).toMatchObject({ resultadoCentavos: 130000, estado: 'completo' });
    expect(r.competencia.receitas).toMatchObject({
      vendaAnimaisCentavos: 470000,
      devolucoesVendaCentavos: 140000,
      totalCentavos: 330000,
    });
    // Realizado: as duas vendas de a1 ficam no histórico; a devolução aparece em bloco próprio.
    const rr = await amb.ok('resultado:realizado', { propriedadeId: prop, ...OUT });
    expect(rr.animais.filter((a) => a.identificacao === 'a1')).toHaveLength(2);
    expect(rr.devolucoesVenda).toEqual([
      expect.objectContaining({
        identificacao: 'a1',
        receitaOriginalCentavos: 150000,
        valorDevolvidoCentavos: 140000,
        // Custo até a saída: aquisição R$ 1.000,00 + R$ 100,00 da despesa do Lote A.
        efeitoCentavos: 110000 - 140000,
      }),
    ]);
    expect(rr.devolucoesVenda[0]!.custoQueVolta.valorConhecidoCentavos).toBe(110000);
  });

  it('fora do rebanho não há pesagem, consumo nem custo de lote; depois do retorno, há', async () => {
    const venda = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: animal['a1']! }], {
        valorTotalCentavos: 150000,
        data: '2026-10-01',
        condicao: pago('2026-10-01'),
      }),
    );
    // Despesa no Lote A enquanto a1 está com o comprador: não chega a ele.
    const cat = (await categoriaPorNome(amb, 'Alimentação (despesa direta, sem estoque)')).id;
    await criarLancamento(
      amb,
      dadosDeLancamento(prop, cat, {
        valorTotalCentavos: 30000,
        dataCompetencia: '2026-10-03',
        descricao: 'Despesa do Lote A com a1 fora',
        destino: { tipo: 'lote', loteId: loteA },
        condicao: pago('2026-10-03'),
      }),
    );
    await amb.ok(
      'devolucao:registrar',
      devolucao(venda, [['a1', 150000]], {
        data: '2026-10-05',
        loteRetornoId: loteA,
        condicaoRestante: pago('2026-10-05'),
      }),
    );
    const pesagem = (data: string) =>
      amb.chamar('pesagem:registrar', {
        animalId: animal['a1']!,
        dados: {
          data,
          pesoVivoKg: 400,
          metodo: 'balanca',
          observacao: null,
          escoreCorporal: null,
          escalaEcc: null,
        },
      });
    const fora = await pesagem('2026-10-03');
    expect(fora.ok).toBe(false);
    if (!fora.ok) expect(JSON.stringify(fora.erro)).toMatch(/fora do rebanho/);
    expect((await pesagem('2026-10-06')).ok).toBe(true);
    const foraLanc = await amb.chamar('lancamento:criar', {
      requisicaoId: gerarUuidV7(),
      dados: dadosDeLancamento(prop, cat, {
        dataCompetencia: '2026-10-03',
        destino: { tipo: 'animal', animalId: animal['a1']! },
      }),
    });
    expect(foraLanc.ok).toBe(false);
    // Custo de a1: aquisição + R$ 100,00 de setembro; nada da despesa de 03/10 (R$ 300,00 entre a2,
    // a3 e a4: R$ 100,00 cada).
    const custo = await amb.ok('custo:animal', { animalId: animal['a1']! });
    expect(custo.apuracao.valorConhecidoCentavos).toBe(110000);
    const a2 = await amb.ok('custo:animal', { animalId: animal['a2']! });
    expect(a2.apuracao.valorConhecidoCentavos).toBe(120000);
  });
});

describe('reembolso parcelado e cancelamento', () => {
  it('venda paga integralmente: reembolso parcelado a pagar; cancelar exige estornar; correção registra de novo', async () => {
    const venda = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: animal['a3']! }], {
        valorTotalCentavos: 150000,
        data: '2026-10-01',
        condicao: pago('2026-10-01'),
      }),
    );
    const d = await amb.ok(
      'devolucao:registrar',
      devolucao(venda, [['a3', 150000]], {
        data: '2026-10-08',
        condicaoRestante: {
          tipo: 'parcelado',
          parcelas: [
            { vencimento: '2026-11-10', valorCentavos: 75000 },
            { vencimento: '2026-12-10', valorCentavos: 75000 },
          ],
        },
      }),
    );
    expect(d).toMatchObject({
      compensadoCentavos: 0,
      restanteCentavos: 150000,
      restanteEmAbertoCentavos: 150000,
    });
    const lanc = await amb.ok('lancamento:obter', { id: d.lancamentoId });
    expect(lanc.parcelas.filter((p) => !p.cancelada)).toHaveLength(2);
    const pagamento = await amb.ok('pagamento:registrar', {
      parcelaId: lanc.parcelas[0]!.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-14', valorCentavos: 75000, forma: null, observacao: null },
    });
    expect((await periodo()).caixa.saidasCentavos).toBe(75000);
    const recusa = await amb.chamar('devolucao:cancelar', {
      id: d.id,
      motivo: 'Lançada por engano',
    });
    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.erro.mensagem).toMatch(/Estorne/);
    // A venda original não pode ser cancelada enquanto houver devolução ativa.
    const cancelarVenda = await amb.chamar('negociacao:cancelar', { id: venda.id, motivo: 'x' });
    expect(cancelarVenda.ok).toBe(false);
    await amb.ok('pagamento:estornar', {
      id: pagamento.pagamentos.find((g) => !g.estornado)!.id,
      motivo: 'Pagamento errado',
    });
    const cancelada = await amb.ok('devolucao:cancelar', { id: d.id, motivo: 'Valor errado' });
    expect(cancelada.cancelada).toBe(true);
    expect((await amb.ok('animal:obter', { id: animal['a3']! })).status).toBe('vendido');
    expect((await amb.ok('lancamento:obter', { id: d.lancamentoId })).cancelado).toBe(true);
    // Correção: nova devolução com o valor certo.
    const nova = await amb.ok(
      'devolucao:registrar',
      devolucao(venda, [['a3', 145000]], { data: '2026-10-09' }),
    );
    expect(nova.valorTotalCentavos).toBe(145000);
    const historico = amb.gerenciador.conexao
      .prepare(
        "SELECT acao FROM historico_alteracao WHERE entidade = 'devolucao_animal' ORDER BY rowid",
      )
      .all() as { acao: string }[];
    expect(historico.map((h) => h.acao)).toEqual(['criacao', 'cancelamento', 'criacao']);
  });

  it('não desfaz a devolução se o animal teve fato depois do retorno', async () => {
    const venda = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: animal['a4']! }], {
        valorTotalCentavos: 150000,
        data: '2026-10-01',
        condicao: emAberto('2026-10-20'),
      }),
    );
    const d = await amb.ok(
      'devolucao:registrar',
      devolucao(venda, [['a4', 150000]], { data: '2026-10-05' }),
    );
    await amb.ok('pesagem:registrar', {
      animalId: animal['a4']!,
      dados: {
        data: '2026-10-07',
        pesoVivoKg: 410,
        metodo: 'balanca',
        observacao: null,
        escoreCorporal: null,
        escalaEcc: null,
      },
    });
    const r = await amb.chamar('devolucao:cancelar', { id: d.id, motivo: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(JSON.stringify(r.erro)).toMatch(/pesagem/);
    expect((await amb.ok('devolucao:obter', { id: d.id })).cancelada).toBe(false);
  });
});

describe('devolução ao fornecedor', () => {
  it('sai do rebanho, compensa a dívida em aberto e mostra a diferença sem chamar de venda', async () => {
    const d = await amb.ok(
      'devolucao:registrar',
      devolucao(compraB, [['b2', 90000]], { data: '2026-10-05', loteRetornoId: null }),
    );
    expect(d).toMatchObject({ tipo: 'compra', compensadoCentavos: 90000, restanteCentavos: 0 });
    const compra = await amb.ok('lancamento:obter', { id: compraB.lancamentoId });
    expect(compra).toMatchObject({
      pagoCentavos: 100000,
      compensadoCentavos: 90000,
      saldoEmAbertoCentavos: 10000,
    });
    expect((await amb.ok('animal:obter', { id: animal['b2']! })).status).toBe('vendido');
    const r = await periodo();
    // Recuperado R$ 900,00 (não é venda de animais) contra a baixa da aquisição (R$ 1.000,00).
    expect(r.competencia.receitas).toMatchObject({
      vendaAnimaisCentavos: 0,
      recuperadoDevolucaoCompraCentavos: 90000,
      totalCentavos: 90000,
    });
    expect(r.competencia).toMatchObject({
      baixaDeAnimaisCentavos: 100000,
      resultadoCentavos: -10000,
    });
    const rr = await amb.ok('resultado:realizado', { propriedadeId: prop, ...OUT });
    expect(rr.animais).toEqual([
      expect.objectContaining({
        identificacao: 'b2',
        saida: 'devolvido_fornecedor',
        receitaCentavos: 90000,
      }),
    ]);
    expect(rr.totais).toMatchObject({ animais: 0, vendidos: 0 });
    expect(rr.devolucoesCompra).toMatchObject({
      animais: 1,
      recuperadoCentavos: 90000,
      diferencaCentavos: -10000,
    });
    const ind = await amb.ok('resultado:indicadores', { propriedadeId: prop, ...OUT });
    expect(ind.carcaca.animais + ind.vivo.animais + ind.carcaca.semPeso).toBe(0);
    // Regressão (achada pelas sequências aleatórias): o desfazer saída genérico do rebanho não
    // desfaz a saída de uma devolução ao fornecedor; isso só acontece cancelando a devolução.
    const generico = await amb.chamar('animal:desfazerSaida', {
      id: animal['b2']!,
      motivo: 'x',
      destino: { tipo: 'origem' },
    });
    expect(generico.ok).toBe(false);
    if (!generico.ok) expect(generico.erro.mensagem).toMatch(/devolução ao fornecedor/);
    // Cancelar a devolução: o animal volta, a compensação é desfeita e a dívida volta a R$ 1.000,00.
    await amb.ok('devolucao:cancelar', { id: d.id, motivo: 'Fornecedor não aceitou' });
    expect((await amb.ok('animal:obter', { id: animal['b2']! })).status).toBe('ativo');
    expect(
      (await amb.ok('lancamento:obter', { id: compraB.lancamentoId })).saldoEmAbertoCentavos,
    ).toBe(100000);
  });

  it('compra já paga: o valor a recuperar fica a receber e só vira caixa quando recebido', async () => {
    const compra = await comprar(
      amb,
      dadosDeCompra(prop, [{ identificacao: 'c1' }], {
        valorTotalCentavos: 100000,
        data: '2026-09-01',
        pessoaId: fornecedor,
        condicao: pago('2026-09-01'),
      }),
    );
    const d = await amb.ok(
      'devolucao:registrar',
      devolucao(compra, [['c1', 100000]], { data: '2026-10-05', loteRetornoId: null }),
    );
    expect(d).toMatchObject({
      compensadoCentavos: 0,
      restanteCentavos: 100000,
      restanteEmAbertoCentavos: 100000,
    });
    expect((await periodo()).caixa.entradasCentavos).toBe(0);
    const lanc = await amb.ok('lancamento:obter', { id: d.lancamentoId });
    expect(lanc.natureza).toBe('receita');
    await amb.ok('pagamento:registrar', {
      parcelaId: lanc.parcelas[0]!.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-12', valorCentavos: 100000, forma: null, observacao: null },
    });
    expect((await periodo()).caixa.entradasCentavos).toBe(100000);
  });
});

describe('integridade', () => {
  it('recusa devolução antes da venda, com data futura, de animal que não é da negociação, e sem condição definida', async () => {
    const venda = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: animal['a1']! }], {
        valorTotalCentavos: 150000,
        data: '2026-10-01',
        condicao: { tipo: 'nao_informada' },
      }),
    );
    const semCondicao = await amb.chamar('devolucao:registrar', devolucao(venda, [['a1', 150000]]));
    expect(semCondicao.ok).toBe(false);
    if (!semCondicao.ok) expect(semCondicao.erro.mensagem).toMatch(/condição de pagamento/);
    const outra = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: animal['a2']! }], {
        valorTotalCentavos: 150000,
        data: '2026-10-01',
        condicao: pago('2026-10-01'),
      }),
    );
    for (const data of ['2026-09-30', '2026-10-17']) {
      const r = await amb.chamar(
        'devolucao:registrar',
        devolucao(outra, [['a2', 150000]], { data }),
      );
      expect(r.ok).toBe(false);
    }
    const estranho = await amb.chamar('devolucao:registrar', {
      ...devolucao(outra, [['a2', 150000]]),
      itens: [{ negociacaoItemId: venda.itens[0]!.id, valorCentavos: 1000 }],
    });
    expect(estranho.ok).toBe(false);
    // O banco também recusa um segundo item de devolução ativo do mesmo animal.
    const d = await amb.ok('devolucao:registrar', devolucao(outra, [['a2', 150000]]));
    expect(() =>
      amb.gerenciador.conexao
        .prepare(
          "INSERT INTO devolucao_animal_item(id,devolucao_id,negociacao_item_id,animal_id,movimentacao_animal_id,valor_centavos,created_at,updated_at) VALUES(?,?,?,?,?,1,'x','x')",
        )
        .run(gerarUuidV7(), d.id, outra.itens[0]!.id, animal['a2']!, gerarUuidV7()),
    ).toThrow();
  });

  it('repetir a mesma requisição devolve a mesma devolução, sem duplicar nada', async () => {
    const venda = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: animal['a1']! }], {
        valorTotalCentavos: 150000,
        data: '2026-10-01',
        condicao: pago('2026-10-01'),
      }),
    );
    const dados = devolucao(venda, [['a1', 150000]]);
    const d1 = await amb.ok('devolucao:registrar', dados);
    const d2 = await amb.ok('devolucao:registrar', dados);
    expect(d2.id).toBe(d1.id);
    expect(contar(amb, 'devolucao_animal')).toBe(1);
  });
});

describe('relatórios', () => {
  it('identificam vendas, devoluções e receita líquida; mostram o compensado; a conferência fecha', async () => {
    const venda = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: animal['a1']! }, { animalId: animal['a2']! }], {
        valorTotalCentavos: 300000,
        data: '2026-10-01',
        condicao: emAberto('2026-10-20'),
      }),
    );
    await amb.ok('devolucao:registrar', devolucao(venda, [['a1', 150000]], { data: '2026-10-05' }));
    await amb.ok(
      'devolucao:registrar',
      devolucao(compraB, [['b2', 90000]], { data: '2026-10-06', loteRetornoId: null }),
    );
    const filtros = {
      propriedadeId: prop,
      ...OUT,
      loteId: null,
      animalId: null,
      incluirDocumentos: false,
    };
    const r = await amb.ok('relatorio:montar', { tipo: 'resultado', filtros });
    const valor = (rotulo: string) =>
      r.secoes[0]!.indicadores!.find((i) => i.rotulo === rotulo)!.valor;
    expect(valor('Venda de animais (bruta)')).toBe(300000);
    expect(valor('Devoluções de venda (deduzidas)')).toBe(150000);
    expect(valor('Venda de animais líquida de devoluções')).toBe(150000);
    expect(valor('Recuperado em devoluções a fornecedor (não é venda)')).toBe(90000);
    expect(r.secoes.find((x) => x.titulo.startsWith('Devoluções de venda'))!.linhas).toHaveLength(
      1,
    );
    const lanc = await amb.ok('relatorio:montar', { tipo: 'lancamentos', filtros });
    const tabela = lanc.secoes[0]!;
    const col = tabela.colunas!.findIndex((c) => c.rotulo === 'Compensado (sem caixa)');
    expect(
      tabela
        .linhas!.map((l) => l[col])
        .filter((v) => v !== 0)
        .sort(),
      // A compra de b1 e b2 (competência 01/09) está fora do período: só a devolução dela aparece.
    ).toEqual([150000, 150000, 90000].sort());
    const conf = await amb.ok('relatorio:montar', { tipo: 'conferencia', filtros });
    const sit = Object.fromEntries(conf.secoes[0]!.linhas!.map((l) => [l[0], l[1]]));
    expect(sit['Devoluções e compensações']).toBe('Fecha');
    expect(sit['Resultado']).toBe('Fecha');
    expect(sit['Caixa']).toBe('Fecha');
  });
});
