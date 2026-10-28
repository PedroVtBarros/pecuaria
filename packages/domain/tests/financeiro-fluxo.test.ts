import { describe, expect, it } from 'vitest';
import {
  CENTAVOS_MAXIMO,
  PERIODOS_MAXIMO,
  SEMENTES_PADRAO,
  chaveDoPeriodo,
  criarGeradorDeterministico,
  diasEntre,
  limitesDoPeriodo,
  montarFluxoPrevisto,
  montarFluxoRealizado,
  periodosDoIntervalo,
  somarDias,
  type GeradorDeterministico,
  type MovimentoDeCaixa,
  type SaldoAbertoPorVencimento,
} from '../src';

describe('períodos do fluxo de caixa', () => {
  it('semana começa na segunda-feira', () => {
    // 2026-10-16 é sexta-feira; a segunda dessa semana é 2026-10-12.
    expect(chaveDoPeriodo('2026-10-16', 'semana')).toBe('2026-10-12');
    expect(chaveDoPeriodo('2026-10-12', 'semana')).toBe('2026-10-12');
    expect(chaveDoPeriodo('2026-10-18', 'semana')).toBe('2026-10-12');
    expect(chaveDoPeriodo('2026-10-19', 'semana')).toBe('2026-10-19');
  });
  it('semana atravessa virada de mês e de ano', () => {
    expect(chaveDoPeriodo('2027-01-01', 'semana')).toBe('2026-12-28');
    expect(limitesDoPeriodo('2026-12-28', 'semana')).toEqual({
      inicio: '2026-12-28',
      fim: '2027-01-03',
    });
  });
  it('mês: limites incluem ano bissexto e fevereiro', () => {
    expect(limitesDoPeriodo('2028-02', 'mes')).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' });
    expect(limitesDoPeriodo('2027-02', 'mes')).toEqual({ inicio: '2027-02-01', fim: '2027-02-28' });
    expect(limitesDoPeriodo('2026-12', 'mes')).toEqual({ inicio: '2026-12-01', fim: '2026-12-31' });
  });
  it('lista períodos contíguos, inclusive os parciais nas pontas', () => {
    expect(periodosDoIntervalo('2026-10-16', '2026-12-02', 'mes')).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
    expect(periodosDoIntervalo('2026-10-16', '2026-10-30', 'semana')).toEqual([
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
    expect(periodosDoIntervalo('2026-10-16', '2026-10-16', 'dia')).toEqual(['2026-10-16']);
  });
  it('recusa intervalo invertido, data inválida e excesso de períodos', () => {
    expect(() => periodosDoIntervalo('2026-10-16', '2026-10-15', 'dia')).toThrow(/anterior/);
    expect(() => periodosDoIntervalo('2026-02-30', '2026-03-01', 'dia')).toThrow(/inválidas/);
    expect(() => periodosDoIntervalo('2020-01-01', '2026-01-01', 'dia')).toThrow(
      new RegExp(String(PERIODOS_MAXIMO)),
    );
  });
});

describe('fluxo realizado', () => {
  const movimentos: MovimentoDeCaixa[] = [
    { data: '2026-10-02', natureza: 'despesa', valorCentavos: 100_000 },
    { data: '2026-10-02', natureza: 'receita', valorCentavos: 30_000 },
    { data: '2026-10-20', natureza: 'despesa', valorCentavos: 5_050 },
    { data: '2026-11-03', natureza: 'receita', valorCentavos: 200_000 },
    { data: '2026-09-30', natureza: 'despesa', valorCentavos: 999 }, // fora do intervalo
  ];
  it('agrupa por mês com entradas, saídas, saldo e acumulado calculados à mão', () => {
    const f = montarFluxoRealizado(movimentos, '2026-10-01', '2026-11-30', 'mes');
    expect(f.linhas.map((l) => l.chave)).toEqual(['2026-10', '2026-11']);
    expect(f.linhas[0]).toMatchObject({
      entradasCentavos: 30_000,
      saidasCentavos: 105_050,
      saldoDoPeriodoCentavos: -75_050,
      acumuladoCentavos: -75_050,
      movimentos: 3,
      inicio: '2026-10-01',
      fim: '2026-10-31',
    });
    expect(f.linhas[1]).toMatchObject({
      entradasCentavos: 200_000,
      saidasCentavos: 0,
      saldoDoPeriodoCentavos: 200_000,
      acumuladoCentavos: 124_950,
    });
    expect(f.entradasCentavos).toBe(230_000);
    expect(f.saidasCentavos).toBe(105_050);
    expect(f.saldoCentavos).toBe(124_950);
    expect(f.movimentos).toBe(4);
  });
  it('limita as pontas ao intervalo pedido e mostra períodos sem movimento com zero registrado', () => {
    const f = montarFluxoRealizado(movimentos, '2026-10-10', '2026-10-25', 'semana');
    expect(f.linhas.map((l) => [l.chave, l.inicio, l.fim, l.movimentos])).toEqual([
      ['2026-10-05', '2026-10-10', '2026-10-11', 0],
      ['2026-10-12', '2026-10-12', '2026-10-18', 0],
      ['2026-10-19', '2026-10-19', '2026-10-25', 1],
    ]);
    expect(f.saidasCentavos).toBe(5_050);
  });
});

describe('fluxo previsto', () => {
  const parcelas: SaldoAbertoPorVencimento[] = [
    { vencimento: '2026-10-10', natureza: 'despesa', saldoCentavos: 40_000 }, // atrasada
    { vencimento: '2026-10-20', natureza: 'despesa', saldoCentavos: 60_000 },
    { vencimento: '2026-10-25', natureza: 'receita', saldoCentavos: 150_000 },
    { vencimento: '2026-11-05', natureza: 'receita', saldoCentavos: 10_000 },
    { vencimento: '2026-11-06', natureza: 'despesa', saldoCentavos: 0 }, // sem saldo: ignorada
  ];
  it('separa a receber, a pagar e a parte em atraso', () => {
    const f = montarFluxoPrevisto(parcelas, '2026-10-16', '2026-10-01', '2026-11-30', 'mes');
    expect(f.linhas[0]).toMatchObject({
      aReceberCentavos: 150_000,
      aPagarCentavos: 100_000,
      emAtrasoPagarCentavos: 40_000,
      emAtrasoReceberCentavos: 0,
      saldoPrevistoCentavos: 50_000,
      parcelas: 3,
    });
    expect(f.linhas[1]).toMatchObject({ aReceberCentavos: 10_000, aPagarCentavos: 0, parcelas: 1 });
    expect(f.aReceberCentavos).toBe(160_000);
    expect(f.aPagarCentavos).toBe(100_000);
    expect(f.emAtrasoPagarCentavos).toBe(40_000);
    expect(f.parcelas).toBe(4);
  });
  it('vencimento igual a hoje não é atraso', () => {
    const f = montarFluxoPrevisto(
      [{ vencimento: '2026-10-16', natureza: 'despesa', saldoCentavos: 100 }],
      '2026-10-16',
      '2026-10-16',
      '2026-10-16',
      'dia',
    );
    expect(f.emAtrasoPagarCentavos).toBe(0);
    expect(f.aPagarCentavos).toBe(100);
  });
});

describe('propriedades do fluxo (gerador determinístico)', () => {
  const CASOS = 1000;
  function porSemente(nome: string, corpo: (g: GeradorDeterministico, caso: number) => void) {
    describe(nome, () => {
      for (const semente of SEMENTES_PADRAO) {
        it(`semente ${semente}`, () => {
          const g = criarGeradorDeterministico(semente);
          for (let caso = 0; caso < CASOS; caso++) {
            try {
              corpo(g, caso);
            } catch (e) {
              throw new Error(`Falha na semente ${semente}, caso ${caso}: ${(e as Error).message}`);
            }
          }
        });
      }
    });
  }
  const gerarIntervalo = (g: GeradorDeterministico) => {
    const inicio = somarDias('2026-01-01', g.inteiro(0, 600));
    const fim = somarDias(inicio, g.inteiro(0, g.booleano(0.2) ? 0 : 120));
    return { inicio, fim, granularidade: g.escolher(['dia', 'semana', 'mes'] as const) };
  };
  const gerarValor = (g: GeradorDeterministico) =>
    g.booleano(0.1) ? (g.booleano() ? 1 : CENTAVOS_MAXIMO) : g.inteiro(1, 5_000_000);

  porSemente(
    'realizado: soma das linhas é igual ao total e cada movimento cai em um só período',
    (g) => {
      const { inicio, fim, granularidade } = gerarIntervalo(g);
      const n = g.inteiro(0, 40);
      const movimentos: MovimentoDeCaixa[] = Array.from({ length: n }, () => ({
        data: somarDias(inicio, g.inteiro(-5, diasEntre(inicio, fim) + 5)),
        natureza: g.escolher(['receita', 'despesa'] as const),
        valorCentavos: gerarValor(g),
      }));
      const dentro = movimentos.filter((m) => m.data >= inicio && m.data <= fim);
      const f = montarFluxoRealizado(movimentos, inicio, fim, granularidade);
      const esperadoE = dentro
        .filter((m) => m.natureza === 'receita')
        .reduce((s, m) => s + m.valorCentavos, 0);
      const esperadoS = dentro
        .filter((m) => m.natureza === 'despesa')
        .reduce((s, m) => s + m.valorCentavos, 0);
      expect(f.entradasCentavos).toBe(esperadoE);
      expect(f.saidasCentavos).toBe(esperadoS);
      expect(f.saldoCentavos).toBe(esperadoE - esperadoS);
      expect(f.movimentos).toBe(dentro.length);
      expect(f.linhas.reduce((s, l) => s + l.saldoDoPeriodoCentavos, 0)).toBe(f.saldoCentavos);
      expect(f.linhas.at(-1)?.acumuladoCentavos ?? 0).toBe(f.saldoCentavos);
      // Períodos contíguos e cobrindo exatamente o intervalo.
      expect(f.linhas[0]?.inicio).toBe(inicio);
      expect(f.linhas.at(-1)?.fim).toBe(fim);
      for (let i = 1; i < f.linhas.length; i++)
        expect(f.linhas[i]!.inicio).toBe(somarDias(f.linhas[i - 1]!.fim, 1));
    },
  );

  porSemente('realizado: a ordem dos movimentos não altera o resultado', (g) => {
    const { inicio, fim, granularidade } = gerarIntervalo(g);
    const movimentos: MovimentoDeCaixa[] = Array.from({ length: g.inteiro(0, 25) }, () => ({
      data: somarDias(inicio, g.inteiro(0, diasEntre(inicio, fim))),
      natureza: g.escolher(['receita', 'despesa'] as const),
      valorCentavos: gerarValor(g),
    }));
    expect(montarFluxoRealizado(g.embaralhar(movimentos), inicio, fim, granularidade)).toEqual(
      montarFluxoRealizado(movimentos, inicio, fim, granularidade),
    );
  });

  porSemente('previsto: totais fecham e o atraso nunca passa do total', (g) => {
    const { inicio, fim, granularidade } = gerarIntervalo(g);
    const hoje = somarDias(inicio, g.inteiro(-10, diasEntre(inicio, fim) + 10));
    const parcelas: SaldoAbertoPorVencimento[] = Array.from({ length: g.inteiro(0, 40) }, () => ({
      vencimento: somarDias(inicio, g.inteiro(-5, diasEntre(inicio, fim) + 5)),
      natureza: g.escolher(['receita', 'despesa'] as const),
      saldoCentavos: g.booleano(0.1) ? 0 : gerarValor(g),
    }));
    const dentro = parcelas.filter(
      (p) => p.saldoCentavos > 0 && p.vencimento >= inicio && p.vencimento <= fim,
    );
    const f = montarFluxoPrevisto(parcelas, hoje, inicio, fim, granularidade);
    const somar = (xs: SaldoAbertoPorVencimento[]) => xs.reduce((s, p) => s + p.saldoCentavos, 0);
    expect(f.aReceberCentavos).toBe(somar(dentro.filter((p) => p.natureza === 'receita')));
    expect(f.aPagarCentavos).toBe(somar(dentro.filter((p) => p.natureza === 'despesa')));
    expect(f.emAtrasoPagarCentavos).toBe(
      somar(dentro.filter((p) => p.natureza === 'despesa' && p.vencimento < hoje)),
    );
    expect(f.emAtrasoReceberCentavos).toBeLessThanOrEqual(f.aReceberCentavos);
    expect(f.emAtrasoPagarCentavos).toBeLessThanOrEqual(f.aPagarCentavos);
    expect(f.parcelas).toBe(dentro.length);
    expect(f.linhas.reduce((s, l) => s + l.saldoPrevistoCentavos, 0)).toBe(f.saldoPrevistoCentavos);
  });

  it('guarda de abrangência: o gerador produz borda (1 centavo, máximo, intervalo de um dia, três granularidades)', () => {
    const g = criarGeradorDeterministico(SEMENTES_PADRAO[0]);
    const vistos = {
      um: false,
      maximo: false,
      umDia: false,
      dia: false,
      semana: false,
      mes: false,
    };
    for (let i = 0; i < 2000; i++) {
      const v = g.booleano(0.1) ? (g.booleano() ? 1 : CENTAVOS_MAXIMO) : g.inteiro(1, 5_000_000);
      if (v === 1) vistos.um = true;
      if (v === CENTAVOS_MAXIMO) vistos.maximo = true;
      const inicio = somarDias('2026-01-01', g.inteiro(0, 600));
      const fim = somarDias(inicio, g.inteiro(0, g.booleano(0.2) ? 0 : 120));
      if (inicio === fim) vistos.umDia = true;
      vistos[g.escolher(['dia', 'semana', 'mes'] as const)] = true;
    }
    expect(Object.values(vistos).every(Boolean)).toBe(true);
  });
});
