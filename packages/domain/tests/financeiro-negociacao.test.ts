import { describe, expect, it } from 'vitest';
import {
  CENTAVOS_MAXIMO,
  SEMENTES_PADRAO,
  alocarPrecoDeAnimais,
  apurarAquisicaoEFormacao,
  conferirPrecoUnitario,
  criarGeradorDeterministico,
  criterioPadraoDaUnidade,
  kgParaGramas,
  totalPelaUnidade,
  type AnimalParaAlocar,
  type CriterioAlocacao,
  type GeradorDeterministico,
} from '../src';

const animal = (id: string, extra: Partial<AnimalParaAlocar> = {}): AnimalParaAlocar => ({
  id,
  rotulo: id,
  pesoVivoG: null,
  pesoCarcacaG: null,
  valorManualCentavos: null,
  ...extra,
});

describe('critério padrão e pesos', () => {
  it('deriva o critério da unidade do preço, sem adivinhar', () => {
    expect(criterioPadraoDaUnidade('total')).toBe('igual');
    expect(criterioPadraoDaUnidade('cabeca')).toBe('igual');
    expect(criterioPadraoDaUnidade('kg_vivo')).toBe('peso_vivo');
    expect(criterioPadraoDaUnidade('arroba_vivo')).toBe('peso_vivo');
    expect(criterioPadraoDaUnidade('arroba_carcaca')).toBe('peso_carcaca');
  });
  it('quilos para gramas inteiras', () => {
    expect(kgParaGramas(312.5)).toBe(312500);
    expect(kgParaGramas(0.001)).toBe(1);
    expect(kgParaGramas(274.95)).toBe(274950);
    expect(() => kgParaGramas(0)).toThrow();
    expect(() => kgParaGramas(3000.5)).toThrow();
    expect(() => kgParaGramas(Number.NaN)).toThrow();
  });
});

describe('alocação do preço entre os animais (D-D)', () => {
  it('igual: divide por cabeça e o resto vai para o menor id entre os empatados', () => {
    const r = alocarPrecoDeAnimais({
      totalCentavos: 100,
      criterio: 'igual',
      animais: [animal('b'), animal('a'), animal('c')],
    });
    expect(r.erros).toEqual([]);
    expect(r.valores).toEqual([
      { id: 'b', valorCentavos: 33 },
      { id: 'a', valorCentavos: 34 },
      { id: 'c', valorCentavos: 33 },
    ]);
  });
  it('peso vivo: proporcional aos gramas, calculado à mão', () => {
    // 1.000,00 entre 300 kg, 200 kg e 500 kg = 300,00 / 200,00 / 500,00
    const r = alocarPrecoDeAnimais({
      totalCentavos: 100000,
      criterio: 'peso_vivo',
      animais: [
        animal('1', { pesoVivoG: 300000 }),
        animal('2', { pesoVivoG: 200000 }),
        animal('3', { pesoVivoG: 500000 }),
      ],
    });
    expect(r.valores.map((v) => v.valorCentavos)).toEqual([30000, 20000, 50000]);
  });
  it('peso de carcaça usa só a carcaça informada', () => {
    const r = alocarPrecoDeAnimais({
      totalCentavos: 1000,
      criterio: 'peso_carcaca',
      animais: [
        animal('1', { pesoVivoG: 999999, pesoCarcacaG: 100000 }),
        animal('2', { pesoVivoG: 1, pesoCarcacaG: 300000 }),
      ],
    });
    expect(r.valores.map((v) => v.valorCentavos)).toEqual([250, 750]);
  });
  it('recusa quando falta peso, listando os animais, em vez de cair em "igual"', () => {
    const r = alocarPrecoDeAnimais({
      totalCentavos: 1000,
      criterio: 'peso_vivo',
      animais: [animal('A-1', { pesoVivoG: 300000 }), animal('A-2'), animal('A-3')],
    });
    expect(r.valores).toEqual([]);
    expect(r.erros[0]).toMatch(/exige o peso vivo de todos os animais\. Falta em: A-2, A-3/);
    const c = alocarPrecoDeAnimais({
      totalCentavos: 1000,
      criterio: 'peso_carcaca',
      animais: [animal('A-1', { pesoVivoG: 300000 })],
    });
    expect(c.erros[0]).toMatch(/peso de carcaça/);
  });
  it('manual: soma exata ou recusa com a diferença', () => {
    const ok = alocarPrecoDeAnimais({
      totalCentavos: 1000,
      criterio: 'manual',
      animais: [
        animal('1', { valorManualCentavos: 400 }),
        animal('2', { valorManualCentavos: 600 }),
      ],
    });
    expect(ok.valores.map((v) => v.valorCentavos)).toEqual([400, 600]);
    const menos = alocarPrecoDeAnimais({
      totalCentavos: 1000,
      criterio: 'manual',
      animais: [
        animal('1', { valorManualCentavos: 400 }),
        animal('2', { valorManualCentavos: 599 }),
      ],
    });
    expect(menos.erros[0]).toMatch(/diferença de 1 centavos/);
    const falta = alocarPrecoDeAnimais({
      totalCentavos: 1000,
      criterio: 'manual',
      animais: [animal('1', { valorManualCentavos: 1000 }), animal('2')],
    });
    expect(falta.erros[0]).toMatch(/Informe o valor de: 2/);
    const negativo = alocarPrecoDeAnimais({
      totalCentavos: 1000,
      criterio: 'manual',
      animais: [
        animal('1', { valorManualCentavos: 1100 }),
        animal('2', { valorManualCentavos: -100 }),
      ],
    });
    expect(negativo.erros[0]).toMatch(/inválido/);
  });
  it('recusa total inválido, lista vazia e animal repetido', () => {
    expect(
      alocarPrecoDeAnimais({ totalCentavos: 0, criterio: 'igual', animais: [animal('1')] }).erros,
    ).toHaveLength(1);
    expect(
      alocarPrecoDeAnimais({ totalCentavos: 10, criterio: 'igual', animais: [] }).erros,
    ).toHaveLength(1);
    expect(
      alocarPrecoDeAnimais({
        totalCentavos: 10,
        criterio: 'igual',
        animais: [animal('1'), animal('1')],
      }).erros[0],
    ).toMatch(/repetido/);
  });
});

describe('conferência do preço unitário contra o total', () => {
  const base = { cabecas: 4, pesoVivoG: 1200000, pesoCarcacaG: 660000 };
  it('calcula o total esperado por unidade, com arredondamento ao centavo', () => {
    expect(totalPelaUnidade('cabeca', 250000, base)).toBe(1000000);
    // 1.200 kg a R$ 8,00/kg = 9.600,00
    expect(totalPelaUnidade('kg_vivo', 800, base)).toBe(960000);
    // 1.200 kg = 80 @ de peso vivo; R$ 280,00/@ = 22.400,00
    expect(totalPelaUnidade('arroba_vivo', 28000, base)).toBe(2240000);
    // 660 kg de carcaça = 44 @; R$ 300,00/@ = 13.200,00
    expect(totalPelaUnidade('arroba_carcaca', 30000, base)).toBe(1320000);
    expect(totalPelaUnidade('total', 1, base)).toBeNull();
    // meio centavo arredonda para cima: 1 g × R$ 0,01/kg = 0,00001 → 0; 500 g × 1 centavo/kg = 0,5 → 1
    expect(totalPelaUnidade('kg_vivo', 1, { cabecas: 1, pesoVivoG: 500, pesoCarcacaG: null })).toBe(
      1,
    );
  });
  it('carcaça nunca é estimada a partir do peso vivo', () => {
    expect(
      totalPelaUnidade('arroba_carcaca', 30000, {
        cabecas: 1,
        pesoVivoG: 500000,
        pesoCarcacaG: null,
      }),
    ).toBeNull();
    expect(
      conferirPrecoUnitario({
        totalCentavos: 1000,
        unidade: 'arroba_carcaca',
        precoUnitarioCentavos: 30000,
        cabecas: 1,
        pesoVivoG: 500000,
        pesoCarcacaG: null,
      }),
    ).toMatch(/não estima carcaça/);
  });
  it('aceita até 1 centavo de diferença e recusa mais, mantendo o total como verdade', () => {
    const entrada = {
      unidade: 'cabeca' as const,
      precoUnitarioCentavos: 100,
      cabecas: 3,
      pesoVivoG: null,
      pesoCarcacaG: null,
    };
    expect(conferirPrecoUnitario({ ...entrada, totalCentavos: 300 })).toBeNull();
    expect(conferirPrecoUnitario({ ...entrada, totalCentavos: 301 })).toBeNull();
    expect(conferirPrecoUnitario({ ...entrada, totalCentavos: 302 })).toMatch(
      /diferença de 2 centavos/,
    );
  });
  it('unidade "total" não aceita preço unitário e as demais exigem', () => {
    const base2 = { totalCentavos: 100, cabecas: 1, pesoVivoG: null, pesoCarcacaG: null };
    expect(
      conferirPrecoUnitario({ ...base2, unidade: 'total', precoUnitarioCentavos: null }),
    ).toBeNull();
    expect(conferirPrecoUnitario({ ...base2, unidade: 'total', precoUnitarioCentavos: 5 })).toMatch(
      /sem unidade/,
    );
    expect(
      conferirPrecoUnitario({ ...base2, unidade: 'cabeca', precoUnitarioCentavos: null }),
    ).toMatch(/Informe o preço/);
    expect(
      conferirPrecoUnitario({ ...base2, unidade: 'kg_vivo', precoUnitarioCentavos: 10 }),
    ).toMatch(/peso vivo/);
  });
});

describe('custo de aquisição e formação (D-F, D-G)', () => {
  it('comprado com compra registrada: aquisição conhecida mais acessórios, completa', () => {
    const c = apurarAquisicaoEFormacao({
      origem: 'comprado',
      aquisicaoAlocadaCentavos: 250000,
      custosAnterioresCentavos: [],
      acessoriosCentavos: [5000, 1234],
    });
    expect(c.aquisicao).toEqual({ situacao: 'registrada', valorCentavos: 250000 });
    expect(c.formacao.situacao).toBe('nao_aplicavel');
    expect(c.acessoriosCentavos).toBe(6234);
    expect(c.apuracao).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 256234 });
  });
  it('nascido sem custo anterior: aquisição não aplicável, formação não apurada, nunca zero', () => {
    const c = apurarAquisicaoEFormacao({
      origem: 'nascido',
      aquisicaoAlocadaCentavos: null,
      custosAnterioresCentavos: [],
      acessoriosCentavos: [],
    });
    expect(c.aquisicao.situacao).toBe('nao_aplicavel');
    expect(c.formacao).toEqual({ situacao: 'nao_apurada', valorCentavos: null });
    expect(c.apuracao.estado).toBe('nao_apurada');
    expect(c.apuracao.valorConhecidoCentavos).toBe(0); // soma dos conhecidos; o estado diz que não há nenhum
    expect(c.apuracao.componentesConhecidos).toBe(0);
  });
  it('nascido com custo anterior informado: formação informada e apuração completa', () => {
    const c = apurarAquisicaoEFormacao({
      origem: 'nascido',
      aquisicaoAlocadaCentavos: null,
      custosAnterioresCentavos: [30000, 4000],
      acessoriosCentavos: [],
    });
    expect(c.formacao).toEqual({ situacao: 'informada', valorCentavos: 34000 });
    expect(c.apuracao).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 34000 });
  });
  it('comprado sem compra registrada: aquisição não apurada; com acessório fica parcial', () => {
    const sem = apurarAquisicaoEFormacao({
      origem: 'comprado',
      aquisicaoAlocadaCentavos: null,
      custosAnterioresCentavos: [],
      acessoriosCentavos: [],
    });
    expect(sem.aquisicao.situacao).toBe('nao_apurada');
    expect(sem.apuracao.estado).toBe('nao_apurada');
    const parcial = apurarAquisicaoEFormacao({
      origem: 'comprado',
      aquisicaoAlocadaCentavos: null,
      custosAnterioresCentavos: [],
      acessoriosCentavos: [1000],
    });
    expect(parcial.apuracao).toMatchObject({ estado: 'parcial', valorConhecidoCentavos: 1000 });
  });
});

describe('propriedades da alocação (gerador determinístico)', () => {
  const CASOS = 1000;
  function porSemente(nome: string, corpo: (g: GeradorDeterministico) => void) {
    describe(nome, () => {
      for (const semente of SEMENTES_PADRAO) {
        it(`semente ${semente}`, () => {
          const g = criarGeradorDeterministico(semente);
          for (let caso = 0; caso < CASOS; caso++) {
            try {
              corpo(g);
            } catch (e) {
              throw new Error(`Falha na semente ${semente}, caso ${caso}: ${(e as Error).message}`);
            }
          }
        });
      }
    });
  }
  const gerarAnimais = (g: GeradorDeterministico, completo: boolean) =>
    Array.from({ length: g.inteiro(1, 12) }, (_, i) =>
      animal(`a${String(i).padStart(2, '0')}`, {
        pesoVivoG: completo || g.booleano(0.8) ? g.inteiro(1, 900_000) : null,
        pesoCarcacaG: completo || g.booleano(0.8) ? g.inteiro(1, 500_000) : null,
      }),
    );
  const gerarTotal = (g: GeradorDeterministico) =>
    g.booleano(0.1) ? (g.booleano() ? 1 : CENTAVOS_MAXIMO) : g.inteiro(1, 50_000_000);

  porSemente(
    'a soma das partes é exatamente o total, em todo critério com dados completos',
    (g) => {
      const criterio = g.escolher([
        'igual',
        'peso_vivo',
        'peso_carcaca',
      ] as const satisfies readonly CriterioAlocacao[]);
      const total = gerarTotal(g);
      const r = alocarPrecoDeAnimais({
        totalCentavos: total,
        criterio,
        animais: gerarAnimais(g, true),
      });
      expect(r.erros).toEqual([]);
      expect(r.valores.reduce((s, v) => s + v.valorCentavos, 0)).toBe(total);
      expect(
        r.valores.every((v) => Number.isInteger(v.valorCentavos) && v.valorCentavos >= 0),
      ).toBe(true);
    },
  );

  porSemente('a ordem dos animais não muda o valor de cada um', (g) => {
    const animais = gerarAnimais(g, true);
    const total = gerarTotal(g);
    const a = alocarPrecoDeAnimais({ totalCentavos: total, criterio: 'peso_vivo', animais });
    const b = alocarPrecoDeAnimais({
      totalCentavos: total,
      criterio: 'peso_vivo',
      animais: g.embaralhar(animais),
    });
    const mapa = (r: typeof a) => Object.fromEntries(r.valores.map((v) => [v.id, v.valorCentavos]));
    expect(mapa(b)).toEqual(mapa(a));
  });

  porSemente('peso ausente sempre recusa; nunca devolve valores parciais', (g) => {
    const animais = gerarAnimais(g, false);
    const r = alocarPrecoDeAnimais({
      totalCentavos: gerarTotal(g),
      criterio: 'peso_vivo',
      animais,
    });
    const falta = animais.some((a) => a.pesoVivoG === null);
    expect(r.erros.length > 0).toBe(falta);
    if (falta) expect(r.valores).toEqual([]);
  });

  porSemente('manual: fecha exatamente quando a soma bate e recusa quando não bate', (g) => {
    const total = gerarTotal(g);
    const n = g.inteiro(1, 8);
    // Parte o total em n valores quaisquer (inclusive zero) cuja soma é exata.
    const cortes = Array.from({ length: n - 1 }, () => g.inteiro(0, total)).sort((x, y) => x - y);
    const partes = [...cortes, total].map((c, i) => c - (i === 0 ? 0 : (cortes[i - 1] as number)));
    const animais = partes.map((v, i) => animal(`m${i}`, { valorManualCentavos: v }));
    expect(
      alocarPrecoDeAnimais({ totalCentavos: total, criterio: 'manual', animais }).erros,
    ).toEqual([]);
    const errado = animais.map((a, i) =>
      i === 0 ? { ...a, valorManualCentavos: (a.valorManualCentavos as number) + 1 } : a,
    );
    expect(
      alocarPrecoDeAnimais({ totalCentavos: total, criterio: 'manual', animais: errado }).erros,
    ).toHaveLength(1);
  });
});
