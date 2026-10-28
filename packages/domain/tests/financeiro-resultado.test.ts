import { describe, expect, it } from 'vitest';
import {
  SEMENTES_PADRAO,
  apurarComponentes,
  apurarCustoPorKgGanho,
  apurarMargemBruta,
  apurarPontoDeEquilibrio,
  apurarResultado,
  criarGeradorDeterministico,
  dividirArredondado,
  projetarResultado,
  totalizarPorClassificacao,
  valorPorArroba,
  type ParteClassificada,
} from '../src';

const completa = (v: number) => apurarComponentes([{ tipo: 'conhecido', valorCentavos: v }]);
const parcial = (v: number) =>
  apurarComponentes([{ tipo: 'conhecido', valorCentavos: v }, { tipo: 'desconhecido' }]);

describe('divisão arredondada', () => {
  it('arredonda ao mais próximo, meio para cima, também com negativos', () => {
    expect(dividirArredondado(7n, 2n)).toBe(4n);
    expect(dividirArredondado(5n, 3n)).toBe(2n);
    expect(dividirArredondado(4n, 3n)).toBe(1n);
    expect(dividirArredondado(-7n, 2n)).toBe(-4n);
    expect(() => dividirArredondado(1n, 0n)).toThrow();
  });
});

describe('resultado e margens', () => {
  const rec = (conhecidaCentavos: number, conhecidas = 1, desconhecidas = 0) => ({
    conhecidaCentavos,
    conhecidas,
    desconhecidas,
  });

  it('resultado com custo completo é exato; com custo desconhecido é parcial ("no máximo")', () => {
    expect(apurarResultado(rec(500000), completa(320000))).toMatchObject({
      resultadoCentavos: 180000,
      estado: 'completo',
      limite: 'exato',
    });
    expect(apurarResultado(rec(500000), parcial(320000))).toMatchObject({
      resultadoCentavos: 180000,
      estado: 'parcial',
      limite: 'no_maximo',
    });
    expect(apurarResultado(rec(100000), completa(150000)).resultadoCentavos).toBe(-50000);
  });

  it('receita desconhecida nunca vira zero: parcial "no mínimo", sem limite ou não apurado', () => {
    // Uma venda conhecida e outra sem receita: o valor conhecido só pode aumentar.
    expect(apurarResultado(rec(500000, 1, 1), completa(320000))).toMatchObject({
      resultadoCentavos: 180000,
      valorConhecidoCentavos: 180000,
      receitasDesconhecidas: 1,
      estado: 'parcial',
      limite: 'no_minimo',
    });
    // Faltam receita e custo: o valor conhecido não é limite de nada.
    expect(apurarResultado(rec(500000, 1, 2), parcial(320000))).toMatchObject({
      estado: 'parcial',
      limite: 'sem_limite',
    });
    // Só receita desconhecida: não há resultado; o valor conhecido (−custo) não é mostrado.
    expect(apurarResultado(rec(0, 0, 1), completa(320000))).toMatchObject({
      resultadoCentavos: null,
      valorConhecidoCentavos: -320000,
      estado: 'nao_apurado',
      limite: null,
    });
    // Morte sem venda: receita zero conhecida, resultado completo (perda).
    expect(apurarResultado(rec(0, 1, 0), completa(320000))).toMatchObject({
      resultadoCentavos: -320000,
      estado: 'completo',
    });
    // Sem nenhuma receita no período e sem desconhecida: só custos, completo.
    expect(apurarResultado(rec(0, 0, 0), completa(1000)).estado).toBe('completo');
    expect(() => apurarResultado(rec(0, -1, 0), completa(0))).toThrow();
  });

  it('propriedade: o estado só é completo sem nada faltando e só é não apurado sem receita conhecida', () => {
    const g = criarGeradorDeterministico(20261017);
    for (let i = 0; i < 1000; i++) {
      const conhecidas = g.inteiro(0, 3);
      const desconhecidas = g.inteiro(0, 2);
      const custo =
        g.inteiro(0, 1) === 0 ? completa(g.inteiro(0, 99999)) : parcial(g.inteiro(0, 99999));
      const r = apurarResultado(rec(g.inteiro(0, 99999), conhecidas, desconhecidas), custo);
      expect(r.estado === 'completo').toBe(desconhecidas === 0 && custo.estado === 'completa');
      expect(r.estado === 'nao_apurado').toBe(desconhecidas > 0 && conhecidas === 0);
      expect(r.resultadoCentavos === null).toBe(r.estado === 'nao_apurado');
      expect(r.valorConhecidoCentavos).toBe(r.receitaCentavos - custo.valorConhecidoCentavos);
    }
  });

  it('totaliza por classificação sem misturar desconhecido com zero', () => {
    const partes: ParteClassificada[] = [
      { classificacao: 'fixo', valorCentavos: 10000 },
      { classificacao: 'variavel', valorCentavos: 25000 },
      { classificacao: 'variavel', valorCentavos: null },
      { classificacao: 'nao_classificado', valorCentavos: 0 },
    ];
    const t = totalizarPorClassificacao(partes);
    expect(t).toMatchObject({
      fixoCentavos: 10000,
      variavelCentavos: 25000,
      naoClassificadoCentavos: 0,
    });
    expect(t.desconhecidos).toEqual({ fixo: 0, variavel: 1, nao_classificado: 0 });
    expect(t.apuracao.estado).toBe('parcial');
  });

  it('margem bruta só é "calculada" com tudo classificado e conhecido; senão mostra a cobertura e os motivos', () => {
    const ok = apurarMargemBruta(500000, [
      { classificacao: 'variavel', valorCentavos: 200000 },
      { classificacao: 'fixo', valorCentavos: 100000 },
    ]);
    expect(ok).toMatchObject({ margemCentavos: 300000, estado: 'calculada', motivos: [] });
    expect(ok.coberturaCentavos).toEqual({
      classificado: 300000,
      total: 300000,
      naoClassificado: 0,
    });
    const falta = apurarMargemBruta(500000, [
      { classificacao: 'variavel', valorCentavos: 200000 },
      { classificacao: 'nao_classificado', valorCentavos: 50000 },
      { classificacao: 'fixo', valorCentavos: null },
    ]);
    expect(falta.estado).toBe('parcial');
    expect(falta.coberturaCentavos).toEqual({
      classificado: 200000,
      total: 250000,
      naoClassificado: 50000,
    });
    expect(falta.motivos.join(' ')).toMatch(
      /1 custo\(s\) sem classificação.*1 custo\(s\) de valor desconhecido/,
    );
  });
});

describe('ponto de equilíbrio', () => {
  it('fixos × unidades ÷ (receita − variáveis), na base escolhida', () => {
    // 100 @ vendidas por R$ 30.000,00; variáveis R$ 12.000,00; fixos R$ 9.000,00.
    // Preço R$ 300,00/@; variável R$ 120,00/@; equilíbrio = 9.000 ÷ 180 = 50 @.
    const pe = apurarPontoDeEquilibrio({
      partes: [
        { classificacao: 'variavel', valorCentavos: 1200000 },
        { classificacao: 'fixo', valorCentavos: 900000 },
      ],
      receitaDasUnidadesCentavos: 3000000,
      unidadesMilesimos: 100000,
    });
    expect(pe).toMatchObject({
      estado: 'calculado',
      unidadesMilesimos: 50000,
      precoMedioCentavos: 30000,
      custoVariavelPorUnidadeCentavos: 12000,
    });
  });

  it('indisponível com custo não classificado, desconhecido, sem unidades ou sem margem de contribuição', () => {
    const base = { receitaDasUnidadesCentavos: 3000000, unidadesMilesimos: 100000 };
    expect(
      apurarPontoDeEquilibrio({
        ...base,
        partes: [{ classificacao: 'nao_classificado', valorCentavos: 1 }],
      }).estado,
    ).toBe('indisponivel');
    expect(
      apurarPontoDeEquilibrio({
        ...base,
        partes: [{ classificacao: 'fixo', valorCentavos: null }],
      }).motivos.join(),
    ).toMatch(/desconhecido/);
    expect(
      apurarPontoDeEquilibrio({
        ...base,
        unidadesMilesimos: 0,
        partes: [{ classificacao: 'fixo', valorCentavos: 1 }],
      }).motivos.join(),
    ).toMatch(/Nenhuma unidade/);
    const semMargem = apurarPontoDeEquilibrio({
      ...base,
      partes: [{ classificacao: 'variavel', valorCentavos: 3000000 }],
    });
    expect(semMargem.estado).toBe('indisponivel');
    expect(semMargem.motivos.join()).toMatch(/não é positiva/);
  });
});

describe('indicadores por peso', () => {
  it('custo por kg ganho: Σ custo ÷ Σ ganho, parcial com custo desconhecido, indisponível sem ganho', () => {
    // R$ 450,00 + R$ 300,00 sobre 60 kg + 40 kg = R$ 7,50 por kg.
    const c = apurarCustoPorKgGanho([
      { custo: completa(45000), ganhoGramas: 60000 },
      { custo: completa(30000), ganhoGramas: 40000 },
    ]);
    expect(c).toMatchObject({
      centavosPorKg: 750,
      animais: 2,
      ganhoGramas: 100000,
      estado: 'completo',
    });
    expect(apurarCustoPorKgGanho([{ custo: parcial(1000), ganhoGramas: 1000 }]).estado).toBe(
      'parcial',
    );
    expect(apurarCustoPorKgGanho([{ custo: completa(1000), ganhoGramas: -500 }])).toMatchObject({
      centavosPorKg: null,
      estado: 'indisponivel',
    });
    expect(apurarCustoPorKgGanho([]).estado).toBe('indisponivel');
  });

  it('valor por @ usa 15 kg da mesma base do peso informado', () => {
    // R$ 3.300,00 em 270 kg de carcaça = 18 @ = R$ 183,33 por @.
    expect(valorPorArroba(330000, 270000)).toBe(18333);
    expect(valorPorArroba(330000, 0)).toBeNull();
  });
});

describe('projeção por premissas', () => {
  const base = {
    data: '2026-12-01',
    precoUnitarioCentavos: 32000,
    quantidadeAnimais: 2,
    pesoVivoGramasPorAnimal: 450000,
    pesoCarcacaGramasPorAnimal: null,
    custosFuturosCentavos: 20000,
  };
  it('receita pela base escolhida, menos custo acumulado e custos futuros', () => {
    // 2 × 450 kg = 900 kg = 60 @ vivas × R$ 320,00 = R$ 19.200,00.
    const p = projetarResultado({ ...base, unidadePreco: 'arroba_vivo' }, completa(1000000));
    expect(p).toMatchObject({
      receitaEsperadaCentavos: 1920000,
      resultadoProjetadoCentavos: 1920000 - 1000000 - 20000,
      estado: 'completo',
      erros: [],
    });
    expect(
      projetarResultado({ ...base, unidadePreco: 'cabeca' }, completa(0)).receitaEsperadaCentavos,
    ).toBe(64000);
    expect(
      projetarResultado(
        { ...base, unidadePreco: 'kg_vivo', precoUnitarioCentavos: 1050 },
        completa(0),
      ).receitaEsperadaCentavos,
    ).toBe(945000);
  });
  it('custo acumulado parcial deixa a projeção parcial; carcaça nunca é estimada do peso vivo', () => {
    expect(projetarResultado({ ...base, unidadePreco: 'arroba_vivo' }, parcial(1)).estado).toBe(
      'parcial',
    );
    const semCarcaca = projetarResultado({ ...base, unidadePreco: 'arroba_carcaca' }, completa(0));
    expect(semCarcaca.erros.join()).toMatch(/peso de carcaça/);
    expect(semCarcaca.receitaEsperadaCentavos).toBe(0);
  });
});

describe('propriedades', () => {
  it('margem bruta + variáveis = receita, e cobertura fecha (3 sementes × 1.000 casos)', () => {
    for (const semente of SEMENTES_PADRAO) {
      const g = criarGeradorDeterministico(semente);
      for (let k = 0; k < 1000; k++) {
        const partes: ParteClassificada[] = Array.from({ length: g.inteiro(0, 8) }, () => ({
          classificacao: g.escolher(['fixo', 'variavel', 'nao_classificado'] as const),
          valorCentavos: g.booleano(0.1) ? null : g.inteiro(0, 1_000_000),
        }));
        const receita = g.inteiro(0, 5_000_000);
        const m = apurarMargemBruta(receita, partes);
        expect(m.margemCentavos + m.variaveisCentavos).toBe(receita);
        expect(m.coberturaCentavos.classificado + m.coberturaCentavos.naoClassificado).toBe(
          m.coberturaCentavos.total,
        );
        const t = totalizarPorClassificacao(partes);
        expect(t.fixoCentavos + t.variavelCentavos + t.naoClassificadoCentavos).toBe(
          t.apuracao.valorConhecidoCentavos,
        );
      }
    }
  });
});
