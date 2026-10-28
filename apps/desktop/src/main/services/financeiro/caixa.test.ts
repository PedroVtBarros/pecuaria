import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { LancamentoDetalhe } from '@pecuaria/shared-types';
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
  parcelasDe,
} from './apoio-teste';

/**
 * Entrega 4B: fluxo de caixa, contas a pagar e receber, painel e classificação. Valores
 * calculados à mão. Relógio fixo em 2026-10-16.
 */
let amb: AmbienteIpc;
let prop: string;
let outrasDespesas: string;
let maoDeObra: string;
let outrasReceitas: string;
const erro = (r: { ok: boolean; erro?: { mensagem: string; detalhes?: string[] } }) => {
  expect(r.ok).toBe(false);
  return [r.erro?.mensagem, ...(r.erro?.detalhes ?? [])].join(' | ');
};

interface Cenario {
  l1: LancamentoDetalhe; // despesa 1.000,00 paga em 05/10
  l2: LancamentoDetalhe; // despesa 1.000,00 em 3 parcelas, 100,00 pagos em 10/10
  l3: LancamentoDetalhe; // receita 2.500,00 a receber, vencida em 12/10
  l4: LancamentoDetalhe; // receita 500,00 recebida em 14/10
  l5: LancamentoDetalhe; // despesa 777,00 com condição não informada
  pagamentoId: string;
}

async function montarCenario(): Promise<Cenario> {
  const l1 = await criarLancamento(
    amb,
    dadosDeLancamento(prop, outrasDespesas, {
      descricao: 'Conserto da cerca',
      condicao: {
        tipo: 'a_vista',
        vencimento: '2026-10-05',
        pagamento: { data: '2026-10-05', forma: 'PIX' },
      },
    }),
  );
  let l2 = await criarLancamento(
    amb,
    dadosDeLancamento(prop, maoDeObra, {
      descricao: 'Diaristas de outubro',
      condicao: { tipo: 'parcelado', parcelas: parcelasDe([30000, 30000, 40000]) },
    }),
  );
  l2 = await amb.ok('pagamento:registrar', {
    parcelaId: l2.parcelas[0]!.id,
    requisicaoId: gerarUuidV7(),
    dados: { data: '2026-10-10', valorCentavos: 10000, forma: null, observacao: null },
  });
  const l3 = await criarLancamento(
    amb,
    dadosDeLancamento(prop, outrasReceitas, {
      descricao: 'Venda de esterco',
      valorTotalCentavos: 250000,
      condicao: { tipo: 'a_vista', vencimento: '2026-10-12', pagamento: null },
    }),
  );
  const l4 = await criarLancamento(
    amb,
    dadosDeLancamento(prop, outrasReceitas, {
      descricao: 'Aluguel de pasto',
      valorTotalCentavos: 50000,
      condicao: {
        tipo: 'a_vista',
        vencimento: '2026-10-14',
        pagamento: { data: '2026-10-14', forma: null },
      },
    }),
  );
  const l5 = await criarLancamento(
    amb,
    dadosDeLancamento(prop, outrasDespesas, {
      descricao: 'Serviço sem condição',
      valorTotalCentavos: 77700,
      condicao: { tipo: 'nao_informada' },
    }),
  );
  return { l1, l2, l3, l4, l5, pagamentoId: l2.pagamentos[0]!.id };
}

beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
  prop = (await criarPropriedade(amb, 'Fazenda do caixa')).id;
  outrasDespesas = (await categoriaPorNome(amb, 'Outras despesas')).id;
  maoDeObra = (await categoriaPorNome(amb, 'Mão de obra')).id;
  outrasReceitas = (await categoriaPorNome(amb, 'Outras receitas')).id;
});
afterEach(async () => {
  expect(conferirInvariantes(amb)).toEqual([]);
  expect(await conferirCaixa(amb)).toEqual([]);
  amb.encerrar();
});

const filtroFluxo = (extra = {}) => ({
  propriedadeId: prop,
  dataInicial: '2026-10-01',
  dataFinal: '2027-01-31',
  granularidade: 'mes' as const,
  ...extra,
});

describe('fluxo de caixa', () => {
  it('realizado e previsto separados, com valores calculados à mão e saldo desconhecido fora', async () => {
    await montarCenario();
    const f = await amb.ok('fluxo:obter', filtroFluxo());
    // Realizado: pagamentos de 05/10 (1.000,00), 10/10 (100,00) e recebimento de 14/10 (500,00).
    expect(f.realizado.linhas.map((l) => l.chave)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
    ]);
    expect(f.realizado.linhas[0]).toMatchObject({
      entradasCentavos: 50000,
      saidasCentavos: 110000,
      saldoDoPeriodoCentavos: -60000,
      movimentos: 3,
    });
    expect(f.realizado.entradasCentavos).toBe(50000);
    expect(f.realizado.saidasCentavos).toBe(110000);
    expect(f.realizado.saldoCentavos).toBe(-60000);
    expect(f.realizado.movimentos).toBe(3);
    // Previsto: 2.500,00 a receber (vencido) e 900,00 a pagar em três vencimentos.
    expect(f.previsto.linhas.map((l) => [l.chave, l.aReceberCentavos, l.aPagarCentavos])).toEqual([
      ['2026-10', 250000, 0],
      ['2026-11', 0, 20000],
      ['2026-12', 0, 30000],
      ['2027-01', 0, 40000],
    ]);
    expect(f.previsto.emAtrasoReceberCentavos).toBe(250000);
    expect(f.previsto.emAtrasoPagarCentavos).toBe(0);
    expect(f.previsto.aPagarCentavos).toBe(90000);
    expect(f.previsto.saldoPrevistoCentavos).toBe(160000);
    expect(f.previsto.parcelas).toBe(4);
    // O lançamento sem condição não entra no previsto nem vira zero: é sinalizado à parte.
    expect(f.pendentesDeDefinicao).toEqual({
      quantidade: 1,
      valorOperacaoReceitaCentavos: 0,
      valorOperacaoDespesaCentavos: 77700,
    });
  });

  it('total por categoria do realizado fecha com o total e separa receita de despesa', async () => {
    await montarCenario();
    const f = await amb.ok('fluxo:obter', filtroFluxo());
    const porCat = f.realizado.porCategoria;
    const soma = (n: 'receita' | 'despesa') =>
      porCat.filter((c) => c.natureza === n).reduce((s, c) => s + c.totalCentavos, 0);
    expect(soma('receita')).toBe(f.realizado.entradasCentavos);
    expect(soma('despesa')).toBe(f.realizado.saidasCentavos);
    expect(porCat.find((c) => c.categoriaNome === 'Mão de obra')).toMatchObject({
      totalCentavos: 10000,
      quantidade: 1,
    });
  });

  it('estorno de pagamento muda o realizado e devolve o saldo ao previsto', async () => {
    const c = await montarCenario();
    await amb.ok('pagamento:estornar', { id: c.pagamentoId, motivo: 'Pagamento lançado errado' });
    const f = await amb.ok('fluxo:obter', filtroFluxo());
    expect(f.realizado.saidasCentavos).toBe(100000);
    expect(f.realizado.movimentos).toBe(2);
    expect(f.previsto.linhas[1]).toMatchObject({ chave: '2026-11', aPagarCentavos: 30000 });
    expect(f.previsto.aPagarCentavos).toBe(100000);
  });

  it('agrupa por semana e por dia e respeita os filtros', async () => {
    await montarCenario();
    const porDia = await amb.ok(
      'fluxo:obter',
      filtroFluxo({ dataFinal: '2026-10-16', granularidade: 'dia' }),
    );
    expect(porDia.realizado.linhas).toHaveLength(16);
    expect(porDia.realizado.linhas.find((l) => l.chave === '2026-10-05')?.saidasCentavos).toBe(
      100000,
    );
    const semana = await amb.ok(
      'fluxo:obter',
      filtroFluxo({ dataFinal: '2026-10-18', granularidade: 'semana' }),
    );
    // 05/10 e 10/10 caem na semana de 05/10; 14/10 na de 12/10.
    expect(
      semana.realizado.linhas.map((l) => [l.chave, l.entradasCentavos, l.saidasCentavos]),
    ).toEqual([
      ['2026-09-28', 0, 0],
      ['2026-10-05', 0, 110000],
      ['2026-10-12', 50000, 0],
    ]);
    const soReceita = await amb.ok('fluxo:obter', filtroFluxo({ natureza: 'receita' }));
    expect(soReceita.realizado.saidasCentavos).toBe(0);
    expect(soReceita.realizado.entradasCentavos).toBe(50000);
    expect(soReceita.previsto.aPagarCentavos).toBe(0);
    const soMaoDeObra = await amb.ok('fluxo:obter', filtroFluxo({ categoriaId: maoDeObra }));
    expect(soMaoDeObra.realizado.saidasCentavos).toBe(10000);
    expect(soMaoDeObra.previsto.aPagarCentavos).toBe(90000);
  });

  it('recusa intervalo invertido, períodos demais e propriedade inexistente', async () => {
    expect(
      erro(
        await amb.chamar(
          'fluxo:obter',
          filtroFluxo({ dataInicial: '2026-11-01', dataFinal: '2026-10-01' }),
        ),
      ),
    ).toMatch(/anterior/);
    expect(
      erro(
        await amb.chamar(
          'fluxo:obter',
          filtroFluxo({ dataInicial: '2020-01-01', dataFinal: '2026-10-01', granularidade: 'dia' }),
        ),
      ),
    ).toMatch(/mais de 400 períodos/);
    expect(
      erro(await amb.chamar('fluxo:obter', filtroFluxo({ propriedadeId: gerarUuidV7() }))),
    ).toMatch(/Propriedade não encontrada/);
  });

  it('isola propriedades', async () => {
    await montarCenario();
    const outra = await criarPropriedade(amb, 'Outra fazenda');
    const f = await amb.ok('fluxo:obter', filtroFluxo({ propriedadeId: outra.id }));
    expect(f.realizado.movimentos).toBe(0);
    expect(f.previsto.parcelas).toBe(0);
    expect(f.pendentesDeDefinicao.quantidade).toBe(0);
  });

  it('consultar não cria nada: nenhum lançamento, parcela, pagamento ou trilha novos', async () => {
    await montarCenario();
    const antes = [
      'lancamento_financeiro',
      'parcela_financeira',
      'pagamento_financeiro',
      'historico_alteracao',
    ].map((t) => contar(amb, t));
    await amb.ok('fluxo:obter', filtroFluxo());
    await amb.ok('conta:listar', {
      propriedadeId: prop,
      natureza: 'despesa',
      pagina: 1,
      tamanhoPagina: 50,
    });
    await amb.ok('painel:obter', {
      propriedadeId: prop,
      dataInicial: '2026-10-01',
      dataFinal: '2026-10-31',
    });
    await amb.ok('classificacao:resumo', { propriedadeId: prop });
    expect(
      [
        'lancamento_financeiro',
        'parcela_financeira',
        'pagamento_financeiro',
        'historico_alteracao',
      ].map((t) => contar(amb, t)),
    ).toEqual(antes);
  });
});

describe('contas a pagar e a receber', () => {
  const pedir = (natureza: 'despesa' | 'receita', extra = {}) =>
    amb.ok('conta:listar', {
      propriedadeId: prop,
      natureza,
      pagina: 1,
      tamanhoPagina: 50,
      ...extra,
    });

  it('lista a pagar por vencimento, com resumo e o pendente de definição à parte', async () => {
    await montarCenario();
    const pagar = await pedir('despesa');
    expect(
      pagar.itens.map((i) => [i.descricao, i.numero, i.vencimento, i.saldoCentavos, i.situacao]),
    ).toEqual([
      ['Diaristas de outubro', 1, '2026-11-10', 20000, 'parcial'],
      ['Diaristas de outubro', 2, '2026-12-10', 30000, 'aberta'],
      ['Diaristas de outubro', 3, '2027-01-10', 40000, 'aberta'],
    ]);
    expect(pagar.itens[0]).toMatchObject({
      totalParcelas: 3,
      valorCentavos: 30000,
      pagoCentavos: 10000,
    });
    expect(pagar.resumo).toEqual({
      quantidade: 3,
      saldoTotalCentavos: 90000,
      emAtrasoQuantidade: 0,
      emAtrasoCentavos: 0,
      aVencerQuantidade: 3,
      aVencerCentavos: 90000,
    });
    expect(pagar.pendentesDeDefinicao).toEqual({ quantidade: 1, valorOperacaoCentavos: 77700 });
  });

  it('a receber destaca o atraso em dias e nunca mistura com o a pagar', async () => {
    await montarCenario();
    const receber = await pedir('receita');
    expect(receber.itens).toHaveLength(1);
    expect(receber.itens[0]).toMatchObject({
      descricao: 'Venda de esterco',
      situacao: 'atrasada',
      diasEmAtraso: 4,
      saldoCentavos: 250000,
    });
    expect(receber.resumo).toMatchObject({ emAtrasoCentavos: 250000, aVencerCentavos: 0 });
    expect(receber.pendentesDeDefinicao).toEqual({ quantidade: 0, valorOperacaoCentavos: 0 });
  });

  it('pagar a parcela inteira a tira da lista; pagamento parcial mantém o saldo', async () => {
    const c = await montarCenario();
    await amb.ok('pagamento:registrar', {
      parcelaId: c.l2.parcelas[0]!.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-16', valorCentavos: 5000, forma: null, observacao: null },
    });
    let pagar = await pedir('despesa');
    expect(pagar.itens[0]!.saldoCentavos).toBe(15000);
    await amb.ok('pagamento:registrar', {
      parcelaId: c.l2.parcelas[0]!.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-16', valorCentavos: 15000, forma: null, observacao: null },
    });
    pagar = await pedir('despesa');
    expect(pagar.itens.map((i) => i.numero)).toEqual([2, 3]);
    expect(pagar.resumo.saldoTotalCentavos).toBe(70000);
  });

  it('filtra por situação, vencimento e busca sem acento; pagina e totaliza o conjunto inteiro', async () => {
    await montarCenario();
    expect((await pedir('despesa', { situacao: 'atrasada' })).itens).toHaveLength(0);
    expect((await pedir('despesa', { situacao: 'a_vencer' })).itens).toHaveLength(3);
    expect(
      (await pedir('despesa', { dataInicial: '2026-12-01', dataFinal: '2026-12-31' })).itens.map(
        (i) => i.numero,
      ),
    ).toEqual([2]);
    expect((await pedir('despesa', { busca: 'DIARISTAS' })).itens).toHaveLength(3);
    expect((await pedir('despesa', { busca: 'mao de obra' })).itens).toHaveLength(3);
    expect((await pedir('despesa', { busca: 'cerca' })).itens).toHaveLength(0);
    const pagina = await pedir('despesa', { pagina: 2, tamanhoPagina: 2 });
    expect(pagina.itens.map((i) => i.numero)).toEqual([3]);
    expect(pagina.total).toBe(3);
    expect(pagina.resumo.saldoTotalCentavos).toBe(90000);
  });

  it('exige a natureza (a pagar e a receber nunca vêm juntos)', async () => {
    const r = await amb.chamar('conta:listar', {
      propriedadeId: prop,
      pagina: 1,
      tamanhoPagina: 50,
    } as never);
    expect(r.ok).toBe(false);
  });

  it('lançamento cancelado não deixa conta em aberto', async () => {
    const c = await montarCenario();
    await amb.ok('lancamento:cancelar', { id: c.l3.id, motivo: 'Venda desfeita' });
    expect((await pedir('receita')).itens).toHaveLength(0);
  });
});

describe('painel financeiro', () => {
  it('mostra caixa, contas, competência e pendências em blocos separados', async () => {
    await montarCenario();
    const p = await amb.ok('painel:obter', {
      propriedadeId: prop,
      dataInicial: '2026-10-01',
      dataFinal: '2026-10-31',
    });
    expect(p.caixa).toEqual({
      entradasCentavos: 50000,
      saidasCentavos: 110000,
      saldoCentavos: -60000,
      movimentos: 3,
    });
    expect(p.contas.aReceber).toEqual({
      saldoTotalCentavos: 250000,
      emAtrasoCentavos: 250000,
      emAtrasoQuantidade: 1,
      proximos30DiasCentavos: 0,
      proximos30DiasQuantidade: 0,
    });
    // Hoje + 30 dias = 15/11: só a primeira parcela (vence em 10/11, saldo de 200,00) entra.
    expect(p.contas.aPagar).toEqual({
      saldoTotalCentavos: 90000,
      emAtrasoCentavos: 0,
      emAtrasoQuantidade: 0,
      proximos30DiasCentavos: 20000,
      proximos30DiasQuantidade: 1,
    });
    // Competência: valor das operações lançadas no período, por natureza e tratamento.
    expect(p.competencia).toEqual([
      { natureza: 'despesa', tratamento: 'resultado', totalCentavos: 277700, quantidade: 3 },
      { natureza: 'receita', tratamento: 'resultado', totalCentavos: 300000, quantidade: 2 },
    ]);
    expect(p.pendencias.pendentesDeDefinicao.quantidade).toBe(1);
    expect(p.pendencias.despesasNaoClassificadas).toEqual({ quantidade: 3, valorCentavos: 277700 });
  });

  it('período sem movimento mostra zero registrado e não inventa saldo', async () => {
    const p = await amb.ok('painel:obter', {
      propriedadeId: prop,
      dataInicial: '2026-01-01',
      dataFinal: '2026-01-31',
    });
    expect(p.caixa.movimentos).toBe(0);
    expect(p.contas.aPagar.saldoTotalCentavos).toBe(0);
    expect(p.competencia).toEqual([]);
  });
});

describe('classificação fixo ou variável (D-E)', () => {
  it('cobertura mostra o que está sem classificação, por categoria', async () => {
    await montarCenario();
    const r = await amb.ok('classificacao:resumo', { propriedadeId: prop });
    expect(r.cobertura).toEqual({
      totalCentavos: 277700,
      fixoCentavos: 0,
      variavelCentavos: 0,
      naoClassificadoCentavos: 277700,
      quantidadeTotal: 3,
      quantidadeNaoClassificada: 3,
    });
    expect(r.porCategoria.find((c) => c.categoriaId === maoDeObra)).toMatchObject({
      padrao: 'nao_classificado',
      naoClassificado: { quantidade: 1, valorCentavos: 100000 },
      fixo: { quantidade: 0, valorCentavos: 0 },
    });
    // Compras de insumos e de animais são classificadas na origem, não aqui.
    expect(r.porCategoria.some((c) => c.categoriaNome.startsWith('Insumos para estoque'))).toBe(
      false,
    );
  });

  it('mudar o padrão da categoria não reescreve lançamentos antigos; a ação em lote é explícita', async () => {
    const c = await montarCenario();
    const cat = await categoriaPorNome(amb, 'Mão de obra');
    await amb.ok('categoriaFinanceira:atualizar', {
      id: cat.id,
      dados: {
        nome: cat.nome,
        natureza: cat.natureza,
        grupo: cat.grupo,
        tratamento: cat.tratamento,
        comportamentoCusto: 'fixo',
        ativa: true,
      },
      motivo: 'Mão de obra é custo fixo',
    });
    // Lançamento antigo continua não classificado.
    expect((await amb.ok('lancamento:obter', { id: c.l2.id })).comportamentoCusto).toBe(
      'nao_classificado',
    );
    // Lançamento novo copia o padrão.
    const novo = await criarLancamento(
      amb,
      dadosDeLancamento(prop, maoDeObra, { descricao: 'Novo' }),
    );
    expect(novo.comportamentoCusto).toBe('fixo');

    const previa = await amb.ok('classificacao:previa', {
      propriedadeId: prop,
      categoriaId: maoDeObra,
    });
    expect(previa).toMatchObject({ padrao: 'fixo', quantidade: 1, valorCentavos: 100000 });
    expect(previa.amostra[0]!.descricao).toBe('Diaristas de outubro');

    const antes = contar(amb, 'historico_alteracao');
    const r = await amb.ok('classificacao:aplicarCategoria', {
      propriedadeId: prop,
      categoriaId: maoDeObra,
      comportamento: 'fixo',
      quantidadeEsperada: 1,
      motivo: null,
    });
    expect(r).toMatchObject({
      quantidadeAlterada: 1,
      valorCentavos: 100000,
      comportamento: 'fixo',
    });
    const l2 = await amb.ok('lancamento:obter', { id: c.l2.id });
    expect(l2.comportamentoCusto).toBe('fixo');
    expect(l2.historico[0]).toMatchObject({
      acao: 'alteracao',
      dadosAnteriores: { comportamentoCusto: 'nao_classificado' },
      dadosNovos: { comportamentoCusto: 'fixo' },
    });
    // Uma entrada por lançamento alterado mais a da categoria.
    expect(contar(amb, 'historico_alteracao')).toBe(antes + 2);
    expect(contar(amb, 'historico_alteracao', "acao = 'classificacao_lote'")).toBe(1);
    // Só os não classificados mudaram: os demais lançamentos não foram tocados.
    expect((await amb.ok('lancamento:obter', { id: c.l1.id })).comportamentoCusto).toBe(
      'nao_classificado',
    );
    const cobertura = (await amb.ok('classificacao:resumo', { propriedadeId: prop })).cobertura;
    expect(cobertura).toMatchObject({
      fixoCentavos: 200000, // Diaristas (1.000,00) + o lançamento novo (1.000,00)
      naoClassificadoCentavos: 177700,
      quantidadeNaoClassificada: 2,
    });
    // Repetir não encontra mais nada para classificar.
    expect(
      erro(
        await amb.chamar('classificacao:aplicarCategoria', {
          propriedadeId: prop,
          categoriaId: maoDeObra,
          comportamento: 'fixo',
          quantidadeEsperada: 1,
          motivo: null,
        }),
      ),
    ).toMatch(/Não há lançamentos não classificados/);
  });

  it('recusa quando o padrão ou a quantidade mudaram desde a prévia', async () => {
    await montarCenario();
    const cat = await categoriaPorNome(amb, 'Mão de obra');
    const base = {
      nome: cat.nome,
      natureza: cat.natureza,
      grupo: cat.grupo,
      tratamento: cat.tratamento,
      ativa: true,
    };
    await amb.ok('categoriaFinanceira:atualizar', {
      id: cat.id,
      dados: { ...base, comportamentoCusto: 'fixo' },
      motivo: null,
    });
    const aplicar = (comportamento: 'fixo' | 'variavel', quantidadeEsperada: number) =>
      amb.chamar('classificacao:aplicarCategoria', {
        propriedadeId: prop,
        categoriaId: maoDeObra,
        comportamento,
        quantidadeEsperada,
        motivo: null,
      });
    expect(erro(await aplicar('variavel', 1))).toMatch(/padrão da categoria mudou/);
    expect(erro(await aplicar('fixo', 5))).toMatch(
      /mudaram desde a prévia \(esperado 5, encontrado 1\)/,
    );
    expect(
      contar(
        amb,
        'lancamento_financeiro',
        "natureza = 'despesa' AND comportamento_custo <> 'nao_classificado'",
      ),
    ).toBe(0);
  });

  it('padrão "não classificado" nunca é aplicado e receita não é classificável', async () => {
    const c = await montarCenario();
    expect(
      (
        await amb.chamar('classificacao:aplicarCategoria', {
          propriedadeId: prop,
          categoriaId: maoDeObra,
          comportamento: 'nao_classificado' as never,
          quantidadeEsperada: 1,
          motivo: null,
        })
      ).ok,
    ).toBe(false);
    expect(
      erro(
        await amb.chamar('classificacao:previa', {
          propriedadeId: prop,
          categoriaId: outrasReceitas,
        }),
      ),
    ).toMatch(/Só despesas/);
    expect(
      erro(
        await amb.chamar('classificacao:definirLancamento', {
          id: c.l3.id,
          comportamento: 'fixo',
          motivo: null,
        }),
      ),
    ).toMatch(/Receita não tem classificação/);
  });

  it('classifica um lançamento isolado com trilha e não altera nada se o valor é o mesmo', async () => {
    const c = await montarCenario();
    const d = await amb.ok('classificacao:definirLancamento', {
      id: c.l1.id,
      comportamento: 'variavel',
      motivo: 'Material de consumo',
    });
    expect(d.comportamentoCusto).toBe('variavel');
    expect(d.historico[0]).toMatchObject({ acao: 'alteracao', motivo: 'Material de consumo' });
    const antes = contar(amb, 'historico_alteracao');
    await amb.ok('classificacao:definirLancamento', {
      id: c.l1.id,
      comportamento: 'variavel',
      motivo: null,
    });
    expect(contar(amb, 'historico_alteracao')).toBe(antes);
    // Voltar a "não classificado" é permitido e fica registrado.
    const volta = await amb.ok('classificacao:definirLancamento', {
      id: c.l1.id,
      comportamento: 'nao_classificado',
      motivo: null,
    });
    expect(volta.comportamentoCusto).toBe('nao_classificado');
  });

  it('lançamento cancelado não é classificado nem entra na cobertura', async () => {
    const c = await montarCenario();
    await amb.ok('lancamento:cancelar', { id: c.l5.id, motivo: 'Lançado em duplicidade' });
    expect(
      erro(
        await amb.chamar('classificacao:definirLancamento', {
          id: c.l5.id,
          comportamento: 'fixo',
          motivo: null,
        }),
      ),
    ).toMatch(/cancelado/);
    const r = await amb.ok('classificacao:resumo', { propriedadeId: prop });
    expect(r.cobertura.totalCentavos).toBe(200000);
  });

  it('filtros novos da lista de lançamentos: por classificação e por tratamento', async () => {
    await montarCenario();
    const sem = await amb.ok('lancamento:listar', {
      propriedadeId: prop,
      comportamentoCusto: 'nao_classificado',
      tratamento: 'resultado',
      natureza: 'despesa',
      incluirCancelados: false,
      pagina: 1,
      tamanhoPagina: 50,
    });
    expect(sem.total).toBe(3);
    const estoque = await amb.ok('lancamento:listar', {
      propriedadeId: prop,
      tratamento: 'estoque',
      incluirCancelados: false,
      pagina: 1,
      tamanhoPagina: 50,
    });
    expect(estoque.total).toBe(0);
  });
});
