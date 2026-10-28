import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import {
  DATA_DO_RELOGIO,
  conferirCaixa,
  conferirInvariantes,
  criarPropriedade,
  parcelasDe,
} from './apoio-teste';
import { comprar, criarLote, dadosDeCompra, dadosDeVenda, vender } from './apoio-animais';
import { conferirResultado } from './apoio-resultado';

/**
 * Completude do resultado econômico (ajuste da revisão da Fase 4): a mesma regra em resultado do
 * período, realizado, ponto de equilíbrio, conciliação e relatórios. Recebimento é caixa, não
 * completude: venda a prazo, parcelada ou com condição a definir tem receita conhecida. Só a venda
 * sem valor de receita (registrada só no rebanho) deixa o resultado parcial ou não apurado, e a
 * receita desconhecida nunca é somada como zero.
 *
 * Valores à mão: 6 animais comprados em 01/09 por R$ 6.000,00 à vista (R$ 1.000,00 cada).
 */
let amb: AmbienteIpc;
let prop: string;
const animal: Record<string, string> = {};
const P = { dataInicial: '2026-09-01', dataFinal: '2026-10-16' };
const aVistaRecebida = (data: string) => ({
  tipo: 'a_vista' as const,
  vencimento: data,
  pagamento: { data, forma: null },
});

beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
  prop = (await criarPropriedade(amb, 'Fazenda da completude')).id;
  const lote = (await criarLote(amb, prop, 'Lote A')).id;
  const c = await comprar(
    amb,
    dadosDeCompra(
      prop,
      ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((identificacao) => ({ identificacao })),
      {
        loteId: lote,
        valorTotalCentavos: 600000,
        data: '2026-09-01',
        condicao: aVistaRecebida('2026-09-01'),
      },
    ),
  );
  for (const i of c.itens) animal[i.animalIdentificacao] = i.animalId;
});
afterEach(async () => {
  expect(conferirInvariantes(amb)).toEqual([]);
  expect(await conferirCaixa(amb)).toEqual([]);
  expect(await conferirResultado(amb, prop, '2026-10-16')).toEqual([]);
  amb.encerrar();
});

const venderUm = (id: string, data: string, condicao: Parameters<typeof dadosDeVenda>[2]) =>
  vender(
    amb,
    dadosDeVenda(prop, [{ animalId: animal[id]! }], {
      valorTotalCentavos: 150000,
      data,
      ...condicao,
    }),
  );
const semNegociacao = (id: string, data: string, tipo: 'vendido' | 'descartado' = 'vendido') =>
  amb.ok('animal:registrarSaida', { id: animal[id]!, tipo, data, motivo: null });

describe('recebimento não é completude', () => {
  it('venda à vista recebida, à vista em aberto, parcelada e com condição a definir: receita conhecida, resultado completo', async () => {
    await venderUm('a1', '2026-10-01', { condicao: aVistaRecebida('2026-10-01') });
    await venderUm('a2', '2026-10-02', {
      condicao: { tipo: 'a_vista', vencimento: '2026-10-30', pagamento: null },
    });
    await venderUm('a3', '2026-10-03', {
      condicao: { tipo: 'parcelado', parcelas: parcelasDe([75000, 75000]) },
    });
    await venderUm('a4', '2026-10-04', { condicao: { tipo: 'nao_informada' } });
    const r = await amb.ok('resultado:periodo', { propriedadeId: prop, ...P });
    // Competência: 4 × R$ 1.500,00 de receita − 4 × R$ 1.000,00 de baixa = R$ 2.000,00, completo.
    expect(r.competencia).toMatchObject({
      receitasDesconhecidas: 0,
      valorConhecidoCentavos: 200000,
      resultadoCentavos: 200000,
      estado: 'completo',
      limite: 'exato',
    });
    expect(r.competencia.receitas.vendaAnimaisCentavos).toBe(600000);
    // Caixa: só a venda recebida entrou (R$ 1.500,00); a compra saiu (R$ 6.000,00). Não é lucro.
    expect(r.caixa).toMatchObject({ entradasCentavos: 150000, saidasCentavos: 600000 });
    const rr = await amb.ok('resultado:realizado', { propriedadeId: prop, ...P });
    for (const a of rr.animais)
      expect(a).toMatchObject({
        receitaCentavos: 150000,
        resultadoCentavos: 50000,
        estado: 'completo',
      });
    expect(rr.totais).toMatchObject({ resultadoCentavos: 200000, estado: 'completo' });
    const c = await amb.ok('resultado:conciliacao', { propriedadeId: prop, ...P });
    expect(c.competencia).toMatchObject({ estado: 'completo', resultadoCentavos: 200000 });
  });
});

describe('receita desconhecida nunca vira zero', () => {
  it('venda sem negociação com outra conhecida: parcial "no mínimo", com o valor só do conhecido', async () => {
    await venderUm('a1', '2026-10-01', { condicao: aVistaRecebida('2026-10-01') });
    await semNegociacao('a2', '2026-10-05');
    const r = await amb.ok('resultado:periodo', { propriedadeId: prop, ...P });
    // Receita conhecida R$ 1.500,00 − baixa de a1 e a2 R$ 2.000,00 = −R$ 500,00, no mínimo.
    expect(r.competencia).toMatchObject({
      receitasDesconhecidas: 1,
      valorConhecidoCentavos: -50000,
      resultadoCentavos: -50000,
      estado: 'parcial',
      limite: 'no_minimo',
    });
    expect(r.margemBruta.estado).toBe('parcial');
    expect(r.margemBruta.motivos.join(' ')).toMatch(/1 venda\(s\) ou descarte\(s\)/);
    const rr = await amb.ok('resultado:realizado', { propriedadeId: prop, ...P });
    const a2 = rr.animais.find((a) => a.identificacao === 'a2')!;
    expect(a2).toMatchObject({
      receitaCentavos: null,
      resultadoCentavos: null,
      estado: 'nao_apurado',
      limite: null,
    });
    expect(rr.porLote[0]).toMatchObject({
      receitaCentavos: 150000,
      receitasDesconhecidas: 1,
      resultadoCentavos: -50000,
      estado: 'parcial',
      limite: 'no_minimo',
    });
    const c = await amb.ok('resultado:conciliacao', { propriedadeId: prop, ...P });
    expect(c.linhas.find((l) => l.chave === 'venda_animais')!.competencia).toMatchObject({
      receitaCentavos: 150000,
      receitasDesconhecidas: 1,
    });
    expect(c.competencia).toMatchObject({ estado: 'parcial', limite: 'no_minimo' });
  });

  it('só venda e descarte sem receita no período: resultado não apurado (sem −custo disfarçado de resultado)', async () => {
    await semNegociacao('a1', '2026-10-15');
    await semNegociacao('a2', '2026-10-15', 'descartado');
    const D = { propriedadeId: prop, dataInicial: '2026-10-15', dataFinal: '2026-10-15' };
    const r = await amb.ok('resultado:periodo', D);
    expect(r.competencia).toMatchObject({
      receitasDesconhecidas: 2,
      valorConhecidoCentavos: -200000,
      resultadoCentavos: null,
      estado: 'nao_apurado',
      limite: null,
    });
    const rr = await amb.ok('resultado:realizado', D);
    expect(rr.totais).toMatchObject({ resultadoCentavos: null, estado: 'nao_apurado' });
    const pe = await amb.ok('resultado:pontoEquilibrio', { ...D, base: 'cabeca' });
    expect(pe.estado).toBe('indisponivel');
    expect(pe.motivos.join(' ')).toMatch(/2 venda\(s\) ou descarte\(s\) do período sem receita/);
    const c = await amb.ok('resultado:conciliacao', D);
    expect(c.competencia).toMatchObject({ estado: 'nao_apurado', resultadoCentavos: null });
    // Relatórios: mesma classificação, e a conferência fecha.
    const filtros = { ...D, loteId: null, animalId: null, incluirDocumentos: false };
    const rel = await amb.ok('relatorio:montar', { tipo: 'resultado', filtros });
    const ind = rel.secoes[0]!.indicadores!.find((i) => i.rotulo === 'Resultado (margem líquida)')!;
    expect(ind).toMatchObject({ valor: null, observacao: 'Não apurado' });
    expect(rel.avisos.join(' ')).toMatch(/Não apurado: 2 venda\(s\) ou descarte\(s\)/);
    const conf = await amb.ok('relatorio:montar', { tipo: 'conferencia', filtros });
    const sit = Object.fromEntries(conf.secoes[0]!.linhas!.map((l) => [l[0], l[1]]));
    expect(sit['Resultado']).toBe('Fecha');
    expect(sit['Completude do resultado']).toBe('Não apurado');
  });

  it('venda com receita conhecida e custo desconhecido segue "no máximo"; com receita desconhecida também, "sem limite"', async () => {
    const nascido = await amb.ok('animal:criar', {
      propriedadeId: prop,
      dados: {
        identificacao: 'n1',
        nome: null,
        sexo: 'M',
        condicaoSexual: 'castrado',
        categoria: 'garrote',
        aptidao: 'corte',
        racaId: null,
        dataNascimento: '2026-09-02',
        dataNascimentoEstimada: false,
        maeId: null,
        paiId: null,
        origem: 'nascido',
        observacoes: null,
      },
      entrada: { data: '2026-09-02', loteId: null, pesoVivoKg: null, metodoPesagem: null },
    });
    // Animal nascido sem custo anterior: custo de formação não apurado.
    await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: nascido.id }], {
        valorTotalCentavos: 90000,
        data: '2026-10-06',
        condicao: aVistaRecebida('2026-10-06'),
      }),
    );
    let r = await amb.ok('resultado:periodo', { propriedadeId: prop, ...P });
    expect(r.competencia).toMatchObject({ estado: 'parcial', limite: 'no_maximo' });
    await semNegociacao('a1', '2026-10-07');
    r = await amb.ok('resultado:periodo', { propriedadeId: prop, ...P });
    expect(r.competencia).toMatchObject({
      estado: 'parcial',
      limite: 'sem_limite',
      receitasDesconhecidas: 1,
    });
  });
});

describe('cancelamento', () => {
  it('cancelar a venda tira a receita e a baixa; desfazer a saída sem negociação devolve a completude', async () => {
    const v = await venderUm('a1', '2026-10-01', {
      condicao: { tipo: 'parcelado', parcelas: parcelasDe([75000, 75000]) },
    });
    await semNegociacao('a2', '2026-10-05');
    let r = await amb.ok('resultado:periodo', { propriedadeId: prop, ...P });
    expect(r.competencia).toMatchObject({ estado: 'parcial', limite: 'no_minimo' });
    await amb.ok('negociacao:cancelar', { id: v.id, motivo: 'Venda desfeita' });
    r = await amb.ok('resultado:periodo', { propriedadeId: prop, ...P });
    // Sem receita conhecida e com a2 sem receita: não apurado.
    expect(r.competencia).toMatchObject({
      receitasDesconhecidas: 1,
      resultadoCentavos: null,
      estado: 'nao_apurado',
    });
    expect(r.competencia.receitas.totalCentavos).toBe(0);
    await amb.ok('animal:desfazerSaida', {
      id: animal['a2']!,
      motivo: 'Saída registrada por engano',
      destino: { tipo: 'origem' },
    });
    r = await amb.ok('resultado:periodo', { propriedadeId: prop, ...P });
    // Nada saiu: nenhuma receita, nenhuma baixa, nenhum custo do período.
    expect(r.competencia).toMatchObject({
      receitasDesconhecidas: 0,
      resultadoCentavos: 0,
      estado: 'completo',
    });
  });
});
