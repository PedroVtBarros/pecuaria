import { describe, expect, it } from 'vitest';
import {
  apurarComponentes,
  apurarResultado,
  conferirDevolucao,
  criarGeradorDeterministico,
  planejarCompensacao,
  resumirLancamento,
  saldoDaParcela,
  situacaoDaParcela,
} from '../src';

const parcela = (id: string, numero: number, vencimento: string, saldoCentavos: number) => ({
  id,
  numero,
  vencimento,
  saldoCentavos,
});

describe('plano de compensação da devolução', () => {
  it('exemplo do usuário: venda de R$ 3.000,00, R$ 1.000,00 recebidos, devolução integral', () => {
    // Parcelas da venda: 1ª de R$ 1.000,00 recebida (saldo 0); 2ª e 3ª de R$ 1.000,00 em aberto.
    const plano = planejarCompensacao(300000, [
      parcela('p1', 1, '2026-09-10', 0),
      parcela('p2', 2, '2026-10-10', 100000),
      parcela('p3', 3, '2026-11-10', 100000),
    ]);
    expect(plano).toEqual({
      compensacoes: [
        { parcelaId: 'p3', valorCentavos: 100000 },
        { parcelaId: 'p2', valorCentavos: 100000 },
      ],
      compensadoCentavos: 200000,
      restanteCentavos: 100000,
    });
  });

  it('devolução parcial menor que o em aberto: compensa só o valor, a partir da última parcela', () => {
    const plano = planejarCompensacao(150001, [
      parcela('p1', 1, '2026-10-10', 150000),
      parcela('p2', 2, '2026-11-10', 150000),
    ]);
    expect(plano).toEqual({
      compensacoes: [
        { parcelaId: 'p2', valorCentavos: 150000 },
        { parcelaId: 'p1', valorCentavos: 1 },
      ],
      compensadoCentavos: 150001,
      restanteCentavos: 0,
    });
  });

  it('venda já recebida: nada a compensar, tudo vira reembolso', () => {
    expect(planejarCompensacao(50000, [parcela('p1', 1, '2026-10-10', 0)])).toEqual({
      compensacoes: [],
      compensadoCentavos: 0,
      restanteCentavos: 50000,
    });
    expect(() => planejarCompensacao(0, [])).toThrow();
    expect(() => planejarCompensacao(1.5, [])).toThrow();
  });

  it('propriedade: compensado + restante = valor; nenhuma parcela além do seu saldo', () => {
    const g = criarGeradorDeterministico(20261018);
    for (let k = 0; k < 1000; k++) {
      const n = g.inteiro(0, 5);
      const parcelas = Array.from({ length: n }, (_, i) =>
        parcela(
          `p${i}`,
          i + 1,
          `2026-1${g.inteiro(0, 2)}-0${g.inteiro(1, 9)}`,
          g.inteiro(0, 50000),
        ),
      );
      const valor = g.inteiro(1, 200000);
      const plano = planejarCompensacao(valor, parcelas);
      expect(plano.compensadoCentavos + plano.restanteCentavos).toBe(valor);
      expect(plano.compensacoes.reduce((s, c) => s + c.valorCentavos, 0)).toBe(
        plano.compensadoCentavos,
      );
      for (const c of plano.compensacoes) {
        const p = parcelas.find((x) => x.id === c.parcelaId)!;
        expect(c.valorCentavos).toBeGreaterThan(0);
        expect(c.valorCentavos).toBeLessThanOrEqual(p.saldoCentavos);
      }
      const emAberto = parcelas.reduce((s, p) => s + p.saldoCentavos, 0);
      expect(plano.compensadoCentavos).toBe(Math.min(valor, emAberto));
    }
  });
});

describe('conferência dos valores devolvidos contra a alocação original', () => {
  it('soma exata e diferença por sinal; valor devolvido sempre positivo e informado', () => {
    expect(
      conferirDevolucao([
        { valorOriginalCentavos: 150000, valorDevolvidoCentavos: 140000 },
        { valorOriginalCentavos: 150001, valorDevolvidoCentavos: 150001 },
      ]),
    ).toEqual({ originalCentavos: 300001, devolvidoCentavos: 290001, diferencaCentavos: 10000 });
    expect(() =>
      conferirDevolucao([{ valorOriginalCentavos: 1, valorDevolvidoCentavos: 0 }]),
    ).toThrow();
  });
});

describe('compensação não é pagamento', () => {
  it('reduz o saldo sem virar "pago"; parcela liquidada só por compensação é "compensada"', () => {
    expect(saldoDaParcela(100000, 30000, 70000)).toBe(0);
    expect(saldoDaParcela(100000, 30000, 20000)).toBe(50000);
    const hoje = '2026-10-18';
    expect(
      situacaoDaParcela({
        valorCentavos: 100000,
        pagoCentavos: 0,
        compensadoCentavos: 100000,
        vencimento: '2026-11-10',
        hoje,
      }),
    ).toBe('compensada');
    expect(
      situacaoDaParcela({
        valorCentavos: 100000,
        pagoCentavos: 40000,
        compensadoCentavos: 60000,
        vencimento: '2026-11-10',
        hoje,
      }),
    ).toBe('paga');
    expect(
      situacaoDaParcela({
        valorCentavos: 100000,
        pagoCentavos: 0,
        compensadoCentavos: 60000,
        vencimento: '2026-11-10',
        hoje,
      }),
    ).toBe('parcial');
    const r = resumirLancamento({
      valorOperacaoCentavos: 300000,
      condicao: 'parcelado',
      cancelado: false,
      hoje,
      parcelas: [
        { valorCentavos: 100000, pagoCentavos: 100000, vencimento: '2026-09-10' },
        {
          valorCentavos: 100000,
          pagoCentavos: 0,
          compensadoCentavos: 100000,
          vencimento: '2026-10-10',
        },
        {
          valorCentavos: 100000,
          pagoCentavos: 0,
          compensadoCentavos: 100000,
          vencimento: '2026-11-10',
        },
      ],
    });
    // Valor da operação, pago (caixa), compensado e em aberto: quatro números separados.
    expect(r).toMatchObject({
      valorOperacaoCentavos: 300000,
      pagoCentavos: 100000,
      compensadoCentavos: 200000,
      saldoEmAbertoCentavos: 0,
      situacao: 'quitado',
    });
  });
});

describe('estorno de custo no resultado', () => {
  it('custo que volta a ser ativo (animal devolvido) soma ao resultado sem mudar a completude', () => {
    const custo = apurarComponentes([{ tipo: 'conhecido', valorCentavos: 50000 }]);
    const r = apurarResultado(
      { conhecidaCentavos: -150000, conhecidas: 1, desconhecidas: 0 },
      custo,
      100000,
    );
    expect(r).toMatchObject({
      valorConhecidoCentavos: -100000,
      resultadoCentavos: -100000,
      estado: 'completo',
    });
    expect(() =>
      apurarResultado({ conhecidaCentavos: 0, conhecidas: 0, desconhecidas: 0 }, custo, -1),
    ).toThrow();
  });
});
