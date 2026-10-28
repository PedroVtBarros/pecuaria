import { describe, expect, it } from 'vitest';
import {
  CENTAVOS_MAXIMO,
  apurarComponentes,
  criarGeradorDeterministico,
  dividirIgual,
  dividirProporcional,
  formatarCentavos,
  formatarCentavosSemSimbolo,
  gerarParcelas,
  interpretarCentavos,
  resumirLancamento,
  situacaoDaParcela,
  somarApuracoes,
  somarCentavos,
  somarMeses,
  validarParcelas,
} from '../src';

describe('dinheiro: interpretar e formatar centavos', () => {
  it.each([
    ['10', 1000],
    ['10,5', 1050],
    ['10,50', 1050],
    ['0,05', 5],
    ['0', 0],
    ['1.234,56', 123456],
    ['R$ 1.234,56', 123456],
    ['  R$ 12,3 ', 1230],
    ['1234.56', 123456],
    ['12.5', 1250],
    ['10000000000,00', CENTAVOS_MAXIMO],
    ['00012', 1200],
  ])('interpreta "%s" como %i centavos', (texto, esperado) => {
    expect(interpretarCentavos(texto)).toBe(esperado);
  });
  it.each([
    '',
    ' ',
    'abc',
    '-5',
    '10,',
    ',5',
    '1,234', // três casas decimais
    '0,005',
    '1.234', // ambíguo: mil duzentos e trinta e quatro ou um vírgula dois três quatro
    '1.234.567',
    '1..2',
    '1,2,3',
    '10000000000,01', // acima do limite
    '1e3',
    'NaN',
  ])('recusa "%s"', (texto) => {
    expect(interpretarCentavos(texto)).toBeNull();
  });
  it('formata sem float, com milhar, sinal e zeros', () => {
    expect(formatarCentavos(123456)).toBe('R$ 1.234,56');
    expect(formatarCentavos(5)).toBe('R$ 0,05');
    expect(formatarCentavos(0)).toBe('R$ 0,00');
    expect(formatarCentavos(-150)).toBe('-R$ 1,50');
    expect(formatarCentavos(CENTAVOS_MAXIMO)).toBe('R$ 10.000.000.000,00');
    expect(formatarCentavosSemSimbolo(100)).toBe('1,00');
    expect(() => formatarCentavos(1.5)).toThrow();
  });
  it('soma exata e recusa valor não inteiro', () => {
    expect(somarCentavos([10, 20, 30])).toBe(60);
    expect(somarCentavos([])).toBe(0);
    expect(() => somarCentavos([1.5])).toThrow();
    expect(() => somarCentavos([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER])).toThrow(
      /precisão/,
    );
  });
});

describe('divisão proporcional por maior resto', () => {
  it('empate de resto vai ao menor identificador, sem depender da ordem de entrada', () => {
    const a = dividirProporcional(100, [
      { id: 'c', peso: 1 },
      { id: 'a', peso: 1 },
      { id: 'b', peso: 1 },
    ]);
    // 100 ÷ 3 = 33 com resto 1 em todas; o centavo extra vai a "a".
    expect(a).toEqual([
      { id: 'c', valorCentavos: 33 },
      { id: 'a', valorCentavos: 34 },
      { id: 'b', valorCentavos: 33 },
    ]);
  });
  it('exemplos calculados à mão', () => {
    expect(
      dividirProporcional(10, [
        { id: 'x', peso: 3 },
        { id: 'y', peso: 2 },
        { id: 'z', peso: 5 },
      ]).map((p) => p.valorCentavos),
    ).toEqual([3, 2, 5]);
    // 100 × 1/3 = 33,33 (resto 1); 100 × 2/3 = 66,66 (resto 2): o centavo extra vai ao maior resto.
    expect(
      dividirProporcional(100, [
        { id: 'x', peso: 1 },
        { id: 'y', peso: 2 },
      ]).map((p) => p.valorCentavos),
    ).toEqual([33, 67]);
    expect(dividirIgual(1, ['a', 'b', 'c']).map((p) => p.valorCentavos)).toEqual([1, 0, 0]);
    expect(dividirProporcional(0, [{ id: 'a', peso: 7 }])).toEqual([{ id: 'a', valorCentavos: 0 }]);
    expect(dividirProporcional(0, [])).toEqual([]);
  });
  it('um centavo nunca se perde, mesmo com pesos muito desiguais', () => {
    const r = dividirProporcional(1_000_000_000_000, [
      { id: 'a', peso: 1 },
      { id: 'b', peso: 999_999_999 },
    ]);
    expect(r[0]!.valorCentavos + r[1]!.valorCentavos).toBe(1_000_000_000_000);
    expect(r[0]!.valorCentavos).toBe(1000);
  });
  it('recusa total inválido, peso inválido, id repetido e divisão sem destino', () => {
    expect(() => dividirProporcional(-1, [{ id: 'a', peso: 1 }])).toThrow();
    expect(() => dividirProporcional(1.5, [{ id: 'a', peso: 1 }])).toThrow();
    expect(() => dividirProporcional(10, [{ id: 'a', peso: 0 }])).toThrow(/peso/);
    expect(() => dividirProporcional(10, [{ id: 'a', peso: 1.5 }])).toThrow(/peso/);
    expect(() =>
      dividirProporcional(10, [
        { id: 'a', peso: 1 },
        { id: 'a', peso: 1 },
      ]),
    ).toThrow(/repetido/);
    expect(() => dividirProporcional(10, [])).toThrow(/para onde distribuir/);
  });
});

describe('parcelas', () => {
  it('divide em partes iguais e deixa o resíduo na última', () => {
    expect(
      gerarParcelas({
        totalCentavos: 1000,
        quantidade: 3,
        primeiroVencimento: '2026-10-16',
        regra: { tipo: 'intervalo_dias', dias: 30 },
      }),
    ).toEqual([
      { vencimento: '2026-10-16', valorCentavos: 333 },
      { vencimento: '2026-11-15', valorCentavos: 333 },
      { vencimento: '2026-12-15', valorCentavos: 334 },
    ]);
  });
  it('vencimento mensal mantém o dia e usa o último dia do mês quando ele não existe', () => {
    expect(
      gerarParcelas({
        totalCentavos: 300,
        quantidade: 3,
        primeiroVencimento: '2026-01-31',
        regra: { tipo: 'mensal' },
      }).map((p) => p.vencimento),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
    expect(somarMeses('2026-11-30', 3)).toBe('2027-02-28');
    expect(somarMeses('2026-12-15', 1)).toBe('2027-01-15');
  });
  it('recusa configuração impossível', () => {
    const base = {
      totalCentavos: 1000,
      quantidade: 2,
      primeiroVencimento: '2026-10-16',
      regra: { tipo: 'mensal' } as const,
    };
    expect(() => gerarParcelas({ ...base, totalCentavos: 0 })).toThrow();
    expect(() => gerarParcelas({ ...base, quantidade: 0 })).toThrow();
    expect(() => gerarParcelas({ ...base, quantidade: 121 })).toThrow();
    expect(() => gerarParcelas({ ...base, totalCentavos: 1, quantidade: 2 })).toThrow(/centavos/);
    expect(() => gerarParcelas({ ...base, primeiroVencimento: '2026-02-30' })).toThrow();
    expect(() => gerarParcelas({ ...base, regra: { tipo: 'intervalo_dias', dias: 0 } })).toThrow();
  });
  it('valida soma exata, valores positivos e datas', () => {
    const p = [
      { vencimento: '2026-11-01', valorCentavos: 600 },
      { vencimento: '2026-12-01', valorCentavos: 400 },
    ];
    expect(validarParcelas(p, 1000)).toEqual([]);
    expect(validarParcelas(p, 1001)[0]).toMatch(/exatamente/);
    expect(validarParcelas([{ vencimento: '2026-13-01', valorCentavos: 1000 }], 1000)[0]).toMatch(
      /vencimento/,
    );
    expect(validarParcelas([{ vencimento: '2026-11-01', valorCentavos: 0 }], 0)[0]).toMatch(
      /positivo/,
    );
    expect(validarParcelas([], 1000)[0]).toMatch(/ao menos uma/);
  });
});

describe('situação derivada: operação, a pagar/receber e pago/recebido', () => {
  const hoje = '2026-10-16';
  it('parcela: hoje não é atraso; atrasada só com saldo', () => {
    const s = (pago: number, vencimento: string) =>
      situacaoDaParcela({ valorCentavos: 100, pagoCentavos: pago, vencimento, hoje });
    expect(s(0, '2026-10-16')).toBe('aberta');
    expect(s(0, '2026-10-15')).toBe('atrasada');
    expect(s(40, '2026-10-20')).toBe('parcial');
    expect(s(40, '2026-10-15')).toBe('atrasada');
    expect(s(100, '2026-10-15')).toBe('paga');
    expect(s(120, '2026-10-15')).toBe('paga');
  });
  it('condição não informada: pendente de definição, saldo desconhecido (nunca zero)', () => {
    const r = resumirLancamento({
      valorOperacaoCentavos: 5000,
      condicao: 'nao_informada',
      cancelado: false,
      parcelas: [],
      hoje,
    });
    expect(r).toEqual({
      situacao: 'pendente_definicao',
      valorOperacaoCentavos: 5000,
      saldoEmAbertoCentavos: null,
      pagoCentavos: 0,
      compensadoCentavos: 0,
      proximoVencimento: null,
    });
    expect(
      resumirLancamento({
        valorOperacaoCentavos: 5000,
        condicao: 'nao_informada',
        cancelado: true,
        parcelas: [],
        hoje,
      }).situacao,
    ).toBe('cancelado');
  });
  it('à vista não paga fica a vencer e com saldo igual ao valor; paga fica quitada', () => {
    const aberta = resumirLancamento({
      valorOperacaoCentavos: 100,
      condicao: 'a_vista',
      cancelado: false,
      parcelas: [{ valorCentavos: 100, pagoCentavos: 0, vencimento: '2026-10-16' }],
      hoje,
    });
    expect(aberta).toMatchObject({
      situacao: 'a_vencer',
      saldoEmAbertoCentavos: 100,
      pagoCentavos: 0,
      proximoVencimento: '2026-10-16',
    });
    const quitada = resumirLancamento({
      valorOperacaoCentavos: 100,
      condicao: 'a_vista',
      cancelado: false,
      parcelas: [{ valorCentavos: 100, pagoCentavos: 100, vencimento: '2026-10-16' }],
      hoje,
    });
    expect(quitada).toMatchObject({
      situacao: 'quitado',
      saldoEmAbertoCentavos: 0,
      pagoCentavos: 100,
      proximoVencimento: null,
    });
  });
  it('parcelado: vencido tem prioridade, depois parcialmente pago, depois a vencer', () => {
    const parcelas = (p1: number, v2: string) => [
      { valorCentavos: 500, pagoCentavos: p1, vencimento: '2026-10-01' },
      { valorCentavos: 500, pagoCentavos: 0, vencimento: v2 },
    ];
    const r = (p: ReturnType<typeof parcelas>) =>
      resumirLancamento({
        valorOperacaoCentavos: 1000,
        condicao: 'parcelado',
        cancelado: false,
        parcelas: p,
        hoje,
      });
    expect(r(parcelas(0, '2026-11-01')).situacao).toBe('vencido');
    expect(r(parcelas(300, '2026-11-01'))).toMatchObject({
      situacao: 'vencido',
      saldoEmAbertoCentavos: 700,
      pagoCentavos: 300,
    });
    expect(r(parcelas(500, '2026-11-01'))).toMatchObject({
      situacao: 'parcialmente_pago',
      saldoEmAbertoCentavos: 500,
      proximoVencimento: '2026-11-01',
    });
    expect(r(parcelas(500, '2026-10-01'))).toMatchObject({ situacao: 'vencido' });
    expect(
      resumirLancamento({
        valorOperacaoCentavos: 1000,
        condicao: 'parcelado',
        cancelado: false,
        parcelas: [{ valorCentavos: 1000, pagoCentavos: 0, vencimento: '2026-12-01' }],
        hoje,
      }).situacao,
    ).toBe('a_vencer');
  });
});

describe('estado de apuração: conhecido, desconhecido, parcial e não apurado', () => {
  const c = (v: number) => ({ tipo: 'conhecido', valorCentavos: v }) as const;
  const d = { tipo: 'desconhecido' } as const;
  const n = { tipo: 'nao_apurado' } as const;
  it('zero conhecido é completo; desconhecido nunca vira zero', () => {
    expect(apurarComponentes([c(0)])).toMatchObject({
      estado: 'completa',
      valorConhecidoCentavos: 0,
    });
    expect(apurarComponentes([])).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 0 });
    expect(apurarComponentes([d])).toMatchObject({
      estado: 'desconhecida',
      componentesDesconhecidos: 1,
    });
    expect(apurarComponentes([n])).toMatchObject({
      estado: 'nao_apurada',
      componentesNaoApurados: 1,
    });
    expect(apurarComponentes([d, n])).toMatchObject({ estado: 'desconhecida' });
  });
  it('parcial quando há conhecido e falta algum componente; o valor é um mínimo', () => {
    expect(apurarComponentes([c(100), d])).toMatchObject({
      estado: 'parcial',
      valorConhecidoCentavos: 100,
    });
    expect(apurarComponentes([c(100), n])).toMatchObject({
      estado: 'parcial',
      valorConhecidoCentavos: 100,
    });
    expect(apurarComponentes([c(100), c(50)])).toMatchObject({
      estado: 'completa',
      valorConhecidoCentavos: 150,
    });
  });
  it('soma de apurações é recalculada dos contadores', () => {
    const s = somarApuracoes([apurarComponentes([c(10)]), apurarComponentes([d])]);
    expect(s).toMatchObject({
      estado: 'parcial',
      valorConhecidoCentavos: 10,
      componentesConhecidos: 1,
      componentesDesconhecidos: 1,
    });
    expect(somarApuracoes([apurarComponentes([d]), apurarComponentes([n])]).estado).toBe(
      'desconhecida',
    );
    expect(somarApuracoes([]).estado).toBe('completa');
  });
  it('recusa custo conhecido inválido', () => {
    expect(() => apurarComponentes([c(-1)])).toThrow();
    expect(() => apurarComponentes([c(1.5)])).toThrow();
  });
});

describe('gerador determinístico (D-K)', () => {
  it('mesma semente produz a mesma sequência; sementes diferentes divergem', () => {
    const a = criarGeradorDeterministico(1);
    const b = criarGeradorDeterministico(1);
    const c = criarGeradorDeterministico(2);
    const sa = Array.from({ length: 20 }, () => a.proximo());
    const sb = Array.from({ length: 20 }, () => b.proximo());
    const sc = Array.from({ length: 20 }, () => c.proximo());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true);
  });
  it('inteiro respeita os extremos, embaralhar é permutação e escolher usa a lista', () => {
    const g = criarGeradorDeterministico(99);
    const vistos = new Set(Array.from({ length: 500 }, () => g.inteiro(3, 6)));
    expect([...vistos].sort()).toEqual([3, 4, 5, 6]);
    expect(g.embaralhar([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(['a', 'b']).toContain(g.escolher(['a', 'b']));
    expect(() => g.escolher([])).toThrow();
    expect(() => g.inteiro(5, 1)).toThrow();
  });
});
