import { describe, expect, it } from 'vitest';
import {
  SEMENTES_PADRAO,
  criarGeradorDeterministico,
  diasNoPeriodo,
  pesosPorAnimalDias,
  pesosPorCabecas,
  pesosPorPeso,
  validarPesosManuais,
} from '../src';

describe('pesos do rateio', () => {
  it('cabeças: lote vazio fica de fora', () => {
    expect(
      pesosPorCabecas([
        { id: 'A', animais: 12 },
        { id: 'B', animais: 0 },
        { id: 'C', animais: 8 },
      ]).map((p) => [p.id, p.peso]),
    ).toEqual([
      ['A', 12],
      ['C', 8],
    ]);
  });
  it('dias no período usam o fim do dia: entra no início e não conta o dia da saída', () => {
    // Do dia 10 ao dia 14 (5 dias): entrou no 10 e saiu no 13 -> presente em 10, 11 e 12.
    expect(
      diasNoPeriodo([{ inicio: '2026-10-10', fim: '2026-10-13' }], '2026-10-10', '2026-10-14'),
    ).toBe(3);
    // Continua no lote: presente nos 5 dias.
    expect(diasNoPeriodo([{ inicio: '2026-09-01', fim: null }], '2026-10-10', '2026-10-14')).toBe(
      5,
    );
    // Duas permanências no mesmo lote (saiu e voltou).
    expect(
      diasNoPeriodo(
        [
          { inicio: '2026-10-01', fim: '2026-10-12' },
          { inicio: '2026-10-14', fim: null },
        ],
        '2026-10-10',
        '2026-10-15',
      ),
    ).toBe(2 + 2);
    // Fora do período.
    expect(diasNoPeriodo([{ inicio: '2026-11-01', fim: null }], '2026-10-10', '2026-10-14')).toBe(
      0,
    );
    expect(() => diasNoPeriodo([], '2026-10-14', '2026-10-10')).toThrow();
  });
  it('animal-dias soma os animais do lote', () => {
    const r = pesosPorAnimalDias(
      [
        {
          id: 'A',
          animais: [[{ inicio: '2026-10-01', fim: null }], [{ inicio: '2026-10-03', fim: null }]],
        },
        { id: 'B', animais: [[{ inicio: '2026-11-01', fim: null }]] },
      ],
      '2026-10-01',
      '2026-10-05',
    );
    // A: 5 dias + 3 dias = 8; B não estava no período.
    expect(r.map((p) => [p.id, p.peso])).toEqual([['A', 8]]);
  });
  it('peso exige pesagem real recente de TODOS os animais e lista quem falta', () => {
    const lotes = [
      {
        id: 'A',
        animais: [
          { id: 'a1', rotulo: 'A-1', pesoG: 300000, idadeDias: 10 },
          { id: 'a2', rotulo: 'A-2', pesoG: 280000, idadeDias: 5 },
        ],
      },
    ];
    expect(pesosPorPeso(lotes, 30)).toMatchObject({
      erros: [],
      pesos: [{ id: 'A', peso: 580000 }],
    });
    const antigo = pesosPorPeso(lotes, 7);
    expect(antigo.pesos).toEqual([]);
    expect(antigo.erros[0]).toMatch(/Sem pesagem real de até 7 dia\(s\): A-1/);
    const semPesagem = pesosPorPeso(
      [{ id: 'A', animais: [{ id: 'a1', rotulo: 'A-1', pesoG: null, idadeDias: null }] }],
      30,
    );
    expect(semPesagem.erros).toHaveLength(1);
    expect(pesosPorPeso(lotes, -1).erros[0]).toMatch(/idade máxima/);
  });
  it('pesos manuais: inteiros positivos e sem repetir destino', () => {
    expect(
      validarPesosManuais([
        { id: 'A', peso: 3 },
        { id: 'B', peso: 1 },
      ]),
    ).toEqual([]);
    expect(validarPesosManuais([])).toHaveLength(1);
    expect(validarPesosManuais([{ id: 'A', peso: 0 }])[0]).toMatch(/inteiro maior que zero/);
    expect(validarPesosManuais([{ id: 'A', peso: 1.5 }])[0]).toMatch(/inteiro/);
    expect(
      validarPesosManuais([
        { id: 'A', peso: 1 },
        { id: 'A', peso: 2 },
      ])[0],
    ).toMatch(/repetido/);
  });
  it('propriedade: dias no período nunca passam do tamanho do período e a soma de partições fecha', () => {
    for (const semente of SEMENTES_PADRAO) {
      const g = criarGeradorDeterministico(semente);
      for (let caso = 0; caso < 500; caso++) {
        const dia = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
        const ini = g.inteiro(1, 20);
        const fim = g.inteiro(ini, 28);
        const permanencias = Array.from({ length: g.inteiro(0, 3) }, () => {
          const a = g.inteiro(1, 28);
          return { inicio: dia(a), fim: g.booleano(0.3) ? null : dia(g.inteiro(a, 28)) };
        });
        const total = diasNoPeriodo(permanencias, dia(ini), dia(fim));
        const meio = g.inteiro(ini, fim);
        const partes =
          diasNoPeriodo(permanencias, dia(ini), dia(meio)) +
          (meio < fim ? diasNoPeriodo(permanencias, dia(meio + 1), dia(fim)) : 0);
        expect(partes, `semente ${semente}, caso ${caso}`).toBe(total);
        expect(total).toBeLessThanOrEqual((fim - ini + 1) * Math.max(permanencias.length, 1));
      }
    }
  });
});
