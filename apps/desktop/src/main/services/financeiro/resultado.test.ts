import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
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
import { conferirInsumos } from './apoio-insumos';
import { conferirApropriacaoDoBanco } from './apoio-rateio';
import { conferirProducao } from './apoio-producao';
import { conferirResultado } from './apoio-resultado';

/**
 * Entrega 4G: resultado por competência e por caixa, resultado realizado por animal e lote,
 * margens, ponto de equilíbrio, indicadores, conciliação e projeção. Cenário do plano (9.3, item 4)
 * com valores calculados à mão:
 *
 * - 4 animais comprados em 01/09 por R$ 4.000,00, pagos à vista (R$ 1.000,00 cada);
 * - 1.000 kg de ração comprados por R$ 1.000,00, pagos; 400 kg consumidos no lote (R$ 100,00 por animal);
 * - energia de R$ 200,00, paga, sem destino (não alocada);
 * - a1 e a2 vendidos em 10/10 por R$ 3.000,00 (R$ 1.500,00 cada, 450 kg vivos e 240 kg de carcaça cada),
 *   recebidos; a3 morre em 12/10; a4 continua no rebanho.
 */
let amb: AmbienteIpc;
let prop: string;
let loteA: string;
let racao: string;
let energia: string;
const animal: Record<string, string> = {};
const P = { dataInicial: '2026-09-01', dataFinal: '2026-10-16' };
const aVista = (data: string) => ({
  tipo: 'a_vista' as const,
  vencimento: data,
  pagamento: { data, forma: null },
});

beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
  prop = (await criarPropriedade(amb, 'Fazenda do resultado')).id;
  loteA = (await criarLote(amb, prop, 'Lote A')).id;
  const c = await comprar(
    amb,
    dadosDeCompra(
      prop,
      ['a1', 'a2', 'a3', 'a4'].map((identificacao) => ({ identificacao })),
      {
        loteId: loteA,
        valorTotalCentavos: 400000,
        data: '2026-09-01',
        condicao: aVista('2026-09-01'),
      },
    ),
  );
  for (const i of c.itens) animal[i.animalIdentificacao] = i.animalId;
  racao = (
    await amb.ok('estoque:criarItem', {
      propriedadeId: prop,
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
  await amb.ok('compraInsumo:registrar', {
    requisicaoId: gerarUuidV7(),
    propriedadeId: prop,
    data: '2026-09-02',
    pessoaId: null,
    categoriaId: (
      await categoriaPorNome(amb, 'Insumos para estoque (ração, silagem, suplemento, mineral)')
    ).id,
    documentoNumero: null,
    atividade: 'corte',
    observacoes: null,
    freteCentavos: 0,
    condicao: aVista('2026-09-02'),
    itens: [
      {
        estoqueItemId: racao,
        quantidade: 1000,
        unidadeBase: 'kg',
        valorCentavos: 100000,
        loteFisico: null,
      },
    ],
  });
  await amb.ok('estoque:registrar', {
    itemId: racao,
    requisicaoId: gerarUuidV7(),
    dados: {
      data: '2026-09-10',
      tipo: 'saida_consumo',
      quantidade: 400,
      unidadeBase: 'kg',
      loteEstoqueId: null,
      custoEntradaCentavos: null,
      destino: 'lote',
      loteAnimalId: loteA,
      animalId: null,
      documentoOrigemId: null,
      motivo: null,
      observacao: null,
    },
  });
  energia = (await categoriaPorNome(amb, 'Alimentação (despesa direta, sem estoque)')).id;
  await criarLancamento(
    amb,
    dadosDeLancamento(prop, energia, {
      valorTotalCentavos: 20000,
      dataCompetencia: '2026-09-15',
      descricao: 'Energia',
      comportamentoCusto: 'fixo',
      condicao: aVista('2026-09-15'),
    }),
  );
  await vender(
    amb,
    dadosDeVenda(
      prop,
      ['a1', 'a2'].map((n) => ({ animalId: animal[n]!, pesoVivoKg: 450, pesoCarcacaKg: 240 })),
      { valorTotalCentavos: 300000, data: '2026-10-10', condicao: aVista('2026-10-10') },
    ),
  );
  await amb.ok('animal:registrarSaida', {
    id: animal['a3']!,
    tipo: 'morto',
    data: '2026-10-12',
    motivo: null,
  });
});
afterEach(async () => {
  expect(conferirInvariantes(amb)).toEqual([]);
  expect(conferirInsumos(amb)).toEqual([]);
  expect(conferirProducao(amb)).toEqual([]);
  expect(await conferirApropriacaoDoBanco(amb)).toEqual([]);
  expect(await conferirCaixa(amb)).toEqual([]);
  expect(await conferirResultado(amb, prop, '2026-10-16')).toEqual([]);
  amb.encerrar();
});

const periodo = () => amb.ok('resultado:periodo', { propriedadeId: prop, ...P });
const classificar = (
  escopo: 'estoque_item' | 'aquisicao_animal',
  referenciaId: string | null,
  comportamento: 'fixo' | 'variavel',
) =>
  amb.ok('classificacaoOrigem:definir', {
    propriedadeId: prop,
    escopo,
    referenciaId,
    comportamento,
  });

describe('resultado realizado: vendidos, perdidos e remanescentes fecham com as origens', () => {
  it('custo da baixa é o custo acumulado até a saída; morte é perda', async () => {
    const r = await amb.ok('resultado:realizado', { propriedadeId: prop, ...P });
    const por = Object.fromEntries(r.animais.map((a) => [a.identificacao, a]));
    // Aquisição R$ 1.000,00 + ração R$ 100,00 = R$ 1.100,00 por animal.
    expect(por['a1']).toMatchObject({
      saida: 'vendido',
      receitaCentavos: 150000,
      resultadoCentavos: 40000,
      estado: 'completo',
    });
    expect(por['a1']!.custo.valorConhecidoCentavos).toBe(110000);
    expect(por['a3']).toMatchObject({
      saida: 'morto',
      receitaCentavos: 0,
      resultadoCentavos: -110000,
    });
    expect(r.totais).toMatchObject({
      animais: 3,
      vendidos: 2,
      perdas: 1,
      perdasCentavos: 110000,
      receitaCentavos: 300000,
      resultadoCentavos: -30000,
      estado: 'completo',
    });
    expect(r.porLote).toMatchObject([
      { loteNome: 'Lote A', animais: 3, resultadoCentavos: -30000 },
    ]);
    // Conservação: vendidos + perdido + remanescente = aquisição + consumo (R$ 4.000,00 + R$ 400,00).
    const a4 = await amb.ok('custo:animal', { animalId: animal['a4']! });
    expect(r.totais.custo.valorConhecidoCentavos + a4.apuracao.valorConhecidoCentavos).toBe(440000);
  });

  it('venda sem negociação registrada fica com receita "não registrada", nunca zero', async () => {
    await amb.ok('animal:registrarSaida', {
      id: animal['a4']!,
      tipo: 'vendido',
      data: '2026-10-14',
      motivo: null,
    });
    const r = await amb.ok('resultado:realizado', { propriedadeId: prop, ...P });
    const a4 = r.animais.find((a) => a.identificacao === 'a4')!;
    expect(a4).toMatchObject({
      receitaCentavos: null,
      resultadoCentavos: null,
      estado: 'nao_apurado',
    });
    // Há receitas conhecidas (a1, a2) e a morte (a3, zero conhecido): o total é parcial, no mínimo.
    expect(r.totais).toMatchObject({
      receitasDesconhecidas: 1,
      estado: 'parcial',
      limite: 'no_minimo',
    });
  });

  it('desfazer a saída devolve o animal ao custo acumulado e tira a baixa do resultado', async () => {
    await amb.ok('animal:desfazerSaida', {
      id: animal['a3']!,
      motivo: 'Registrado por engano',
      destino: { tipo: 'origem' },
    });
    const real = await amb.ok('resultado:realizado', { propriedadeId: prop, ...P });
    expect(real.animais.map((a) => a.identificacao)).not.toContain('a3');
    // Só a aquisição de a1 e a2 vira custo do período; a de a3 volta a ser ativo do rebanho.
    expect((await periodo()).competencia.baixaDeAnimaisCentavos).toBe(200000);
  });
});

describe('resultado do período: competência e caixa lado a lado, nunca somados', () => {
  it('competência soma o custo do período e a baixa dos animais que saíram; caixa é o que entrou e saiu', async () => {
    const r = await periodo();
    expect(r.competencia.receitas).toEqual({
      vendaAnimaisCentavos: 300000,
      devolucoesVendaCentavos: 0,
      recuperadoDevolucaoCompraCentavos: 0,
      leiteCentavos: 0,
      outrasCentavos: 0,
      totalCentavos: 300000,
    });
    // Ração consumida R$ 400,00 + energia R$ 200,00 + aquisição de a1, a2 e a3 R$ 3.000,00.
    expect(r.competencia.custo).toMatchObject({
      estado: 'completa',
      valorConhecidoCentavos: 360000,
    });
    expect(r.competencia).toMatchObject({
      baixaDeAnimaisCentavos: 300000,
      naoAlocadoCentavos: 20000,
      animaisSemBase: 0,
      resultadoCentavos: -60000,
      estado: 'completo',
    });
    // Caixa: recebida a venda; pagos os animais, a ração e a energia.
    expect(r.caixa).toEqual({
      entradasCentavos: 300000,
      saidasCentavos: 520000,
      saldoCentavos: -220000,
    });
    const fluxo = await amb.ok('fluxo:obter', { propriedadeId: prop, ...P });
    expect(fluxo.realizado.saldoCentavos).toBe(r.caixa.saldoCentavos);
  });

  it('margem bruta fica parcial e lista o que falta classificar; classificada, é calculada', async () => {
    let r = await periodo();
    expect(r.margemBruta.estado).toBe('parcial');
    expect(r.margemBruta.coberturaCentavos).toEqual({
      classificado: 20000,
      total: 360000,
      naoClassificado: 340000,
    });
    expect(r.margemBruta.semClassificacao.map((s) => s.descricao).sort()).toEqual(
      ['Aquisição do animal', 'Aquisição do animal', 'Aquisição do animal', 'Ração: 400 kg'].sort(),
    );
    await classificar('estoque_item', racao, 'variavel');
    await classificar('aquisicao_animal', null, 'variavel');
    r = await periodo();
    // Receita R$ 3.000,00 − variáveis (ração R$ 400,00 + aquisição R$ 3.000,00) = −R$ 400,00.
    expect(r.margemBruta).toMatchObject({
      estado: 'calculada',
      variaveisCentavos: 340000,
      fixosCentavos: 20000,
      margemCentavos: -40000,
      semClassificacao: [],
    });
    // Margem líquida não depende da classificação: continua igual.
    expect(r.competencia.resultadoCentavos).toBe(-60000);
  });

  it('receitas de leite entram no resultado e no preço médio do litro, só com litros informados', async () => {
    const leite = (await categoriaPorNome(amb, 'Venda de leite')).id;
    await criarLancamento(
      amb,
      dadosDeLancamento(prop, leite, {
        valorTotalCentavos: 50000,
        dataCompetencia: '2026-10-01',
        descricao: 'Leite de setembro',
        quantidade: { valor: 1000, unidade: 'litro' },
      } as never),
    );
    await criarLancamento(
      amb,
      dadosDeLancamento(prop, leite, {
        valorTotalCentavos: 10000,
        dataCompetencia: '2026-10-02',
        descricao: 'Leite avulso',
      }),
    );
    const r = await periodo();
    expect(r.competencia.receitas).toMatchObject({ leiteCentavos: 60000, totalCentavos: 360000 });
    expect(r.competencia.resultadoCentavos).toBe(0);
    const i = await amb.ok('resultado:indicadores', { propriedadeId: prop, ...P });
    // R$ 500,00 em 1.000 litros = R$ 0,50 por litro; a receita sem litros fica de fora e é contada.
    expect(i.leite).toEqual({
      litrosMilesimos: 1000000,
      receitaCentavos: 50000,
      precoPorLitroCentavos: 50,
      receitasSemLitros: 1,
    });
  });
});

describe('indicadores', () => {
  it('custo por @ de carcaça e de peso vivo, cada um na sua base', async () => {
    const i = await amb.ok('resultado:indicadores', { propriedadeId: prop, ...P });
    // 480 kg de carcaça = 32 @: receita R$ 93,75/@; custo dos vendidos R$ 2.200,00 = R$ 68,75/@.
    expect(i.carcaca).toMatchObject({
      animais: 2,
      gramas: 480000,
      receitaPorArrobaCentavos: 9375,
      custoPorArrobaCentavos: 6875,
      margemPorArrobaCentavos: 2500,
      semPeso: 0,
      estado: 'completo',
    });
    // 900 kg vivos = 60 @: receita R$ 50,00/@; custo R$ 36,67/@.
    expect(i.vivo).toMatchObject({
      receitaPorArrobaCentavos: 5000,
      custoPorArrobaCentavos: 3667,
      margemPorArrobaCentavos: 1333,
    });
  });

  it('custo por kg ganho só com duas pesagens no período, sem a aquisição, e diz quem ficou de fora', async () => {
    const pesar = (nome: string, data: string, kg: number) =>
      amb.ok('pesagem:registrar', {
        animalId: animal[nome]!,
        dados: {
          data,
          pesoVivoKg: kg,
          metodo: 'balanca',
          observacao: null,
          escoreCorporal: null,
          escalaEcc: null,
        },
        justificativa: null,
      });
    await pesar('a1', '2026-09-05', 310);
    await pesar('a1', '2026-10-05', 340);
    await pesar('a4', '2026-09-05', 300);
    await pesar('a4', '2026-10-05', 330);
    const i = await amb.ok('resultado:indicadores', { propriedadeId: prop, ...P });
    // R$ 100,00 + R$ 100,00 de ração sobre 30 kg + 30 kg = R$ 3,33 por kg.
    expect(i.custoPorKgGanho).toMatchObject({
      centavosPorKg: 333,
      animais: 2,
      ganhoGramas: 60000,
      semPesagens: 2,
      estado: 'completo',
      pesagensPorMetodo: { balanca: 4 },
    });
    expect(i.porLote.map((l) => [l.loteNome, l.animais])).toEqual([['Lote A', 1]]);
  });
});

describe('ponto de equilíbrio', () => {
  it('indisponível sem classificação; com classificação, fixos × unidades ÷ margem de contribuição', async () => {
    const sem = await amb.ok('resultado:pontoEquilibrio', {
      propriedadeId: prop,
      ...P,
      base: 'arroba_carcaca',
    });
    expect(sem.estado).toBe('indisponivel');
    expect(sem.motivos.join(' ')).toMatch(/sem classificação/);
    await classificar('estoque_item', racao, 'variavel');
    await classificar('aquisicao_animal', null, 'fixo');
    const pe = await amb.ok('resultado:pontoEquilibrio', {
      propriedadeId: prop,
      ...P,
      base: 'arroba_carcaca',
    });
    // Fixos R$ 3.200,00; variáveis R$ 400,00; 32 @ por R$ 3.000,00.
    // Equilíbrio = 3.200 × 32 ÷ (3.000 − 400) = 39,385 @; preço R$ 93,75/@; variável R$ 12,50/@.
    expect(pe).toMatchObject({
      estado: 'calculado',
      unidadesMilesimos: 39385,
      precoMedioCentavos: 9375,
      custoVariavelPorUnidadeCentavos: 1250,
      unidadesVendidasMilesimos: 32000,
      vendasIncluidas: 2,
      fixosCentavos: 320000,
      variaveisCentavos: 40000,
      motivos: [],
    });
    const cabeca = await amb.ok('resultado:pontoEquilibrio', {
      propriedadeId: prop,
      ...P,
      base: 'cabeca',
    });
    expect(cabeca.unidadesMilesimos).toBe(Math.round((320000 * 2000) / 260000));
  });
});

describe('conciliação entre competência e caixa', () => {
  it('cada linha explica a diferença; os totais batem com o resultado e com o caixa', async () => {
    const c = await amb.ok('resultado:conciliacao', { propriedadeId: prop, ...P });
    const por = Object.fromEntries(c.linhas.map((l) => [l.chave, l]));
    expect(por['venda_animais']).toMatchObject({
      competencia: { receitaCentavos: 300000 },
      caixa: { entradasCentavos: 300000 },
      diferencaCentavos: 0,
    });
    expect(por['despesas']).toMatchObject({
      competencia: { custoCentavos: 20000 },
      caixa: { saidasCentavos: 20000 },
      diferencaCentavos: 0,
    });
    // Pagou R$ 1.000,00 de ração e consumiu R$ 400,00: R$ 600,00 ficaram no estoque.
    expect(por['insumos']).toMatchObject({
      competencia: { custoCentavos: 40000 },
      caixa: { saidasCentavos: 100000 },
      diferencaCentavos: 60000,
    });
    // Pagou R$ 4.000,00 de animais; R$ 3.000,00 saíram do rebanho; R$ 1.000,00 seguem como ativo.
    expect(por['animais']).toMatchObject({
      competencia: { custoCentavos: 300000 },
      caixa: { saidasCentavos: 400000 },
      diferencaCentavos: 100000,
    });
    expect(c.totais).toEqual({
      resultadoCompetenciaCentavos: -60000,
      caixaLiquidoCentavos: -220000,
      diferencaCentavos: 160000,
    });
    const r = await periodo();
    expect(c.totais.resultadoCompetenciaCentavos).toBe(r.competencia.resultadoCentavos);
    expect(c.totais.caixaLiquidoCentavos).toBe(r.caixa.saldoCentavos);
    expect(c.linhas.reduce((s, l) => s + l.diferencaCentavos, 0)).toBe(c.totais.diferencaCentavos);
  });
});

describe('projeção por premissas', () => {
  it('calcula sem gravar nada e recusa animal que já saiu', async () => {
    const antes = ['lancamento_financeiro', 'historico_alteracao', 'movimentacao_estoque'].map(
      (t) => contar(amb, t),
    );
    const p = await amb.ok('projecao:calcular', {
      alvo: { tipo: 'lote', id: loteA },
      data: '2026-12-01',
      unidadePreco: 'arroba_vivo',
      precoUnitarioCentavos: 30000,
      pesoVivoKgPorAnimal: 450,
      pesoCarcacaKgPorAnimal: null,
      custosFuturosCentavos: 50000,
    });
    // Só a4 segue no lote: 450 kg = 30 @ × R$ 300,00 = R$ 9.000,00; custo acumulado R$ 1.100,00.
    expect(p).toMatchObject({
      animais: 1,
      receitaEsperadaCentavos: 900000,
      custosFuturosCentavos: 50000,
      resultadoProjetadoCentavos: 900000 - 110000 - 50000,
      estado: 'completo',
      erros: [],
    });
    expect(p.rotulo).toMatch(/não é dado apurado/);
    expect(
      ['lancamento_financeiro', 'historico_alteracao', 'movimentacao_estoque'].map((t) =>
        contar(amb, t),
      ),
    ).toEqual(antes);
    const vendido = await amb.chamar('projecao:calcular', {
      alvo: { tipo: 'animal', id: animal['a1']! },
      data: '2026-12-01',
      unidadePreco: 'cabeca',
      precoUnitarioCentavos: 100000,
      pesoVivoKgPorAnimal: null,
      pesoCarcacaKgPorAnimal: null,
      custosFuturosCentavos: 0,
    });
    expect(vendido.ok).toBe(false);
    const semCarcaca = await amb.ok('projecao:calcular', {
      alvo: { tipo: 'animal', id: animal['a4']! },
      data: '2026-12-01',
      unidadePreco: 'arroba_carcaca',
      precoUnitarioCentavos: 30000,
      pesoVivoKgPorAnimal: 450,
      pesoCarcacaKgPorAnimal: null,
      custosFuturosCentavos: 0,
    });
    expect(semCarcaca.erros.join(' ')).toMatch(/não é estimado a partir do peso vivo/);
  });
});

describe('consultas memorizadas nunca mostram valor velho', () => {
  it('qualquer escrita e a restauração de backup recalculam os custos', async () => {
    const custo = async () => (await periodo()).competencia.custo.valorConhecidoCentavos;
    expect(await custo()).toBe(360000);
    expect(await custo()).toBe(360000);
    const backup = await amb.ok('backup:criar', { observacao: 'Antes da despesa' });
    await criarLancamento(
      amb,
      dadosDeLancamento(prop, energia, {
        valorTotalCentavos: 12345,
        dataCompetencia: '2026-10-01',
        descricao: 'Manutenção',
      }),
    );
    expect(await custo()).toBe(360000 + 12345);
    await amb.ok('backup:restaurar', { id: backup.id });
    expect(await custo()).toBe(360000);
  });
});
