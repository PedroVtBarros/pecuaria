import { describe, expect, it } from 'vitest';
import {
  abaixoDoMinimo,
  calcularEstoque,
  quantidadeEmMilesimos,
  type MovimentoParaEstoque,
} from '../src/estoque/regras-estoque';
const m = (
  id: string,
  tipo: MovimentoParaEstoque['tipo'],
  quantidade: number,
  custo: number | null,
  ordem: number,
  data = '2026-10-01',
  loteEstoqueId: string | null = null,
): MovimentoParaEstoque => ({
  id,
  tipo,
  quantidadeMilesimos: quantidadeEmMilesimos(quantidade),
  custoEntradaCentavos: custo,
  ordem,
  data,
  loteEstoqueId,
});
describe('estoque: regras e valoração móvel', () => {
  it('saldo vazio não inventa preço médio', () =>
    expect(calcularEstoque([])).toMatchObject({
      saldoMilesimos: 0,
      valorSaldoCentavos: 0,
      movimentos: [],
    }));
  it('média móvel usa o valor remanescente após saídas', () => {
    const r = calcularEstoque([
      m('a', 'entrada_compra', 10, 10000, 1),
      m('b', 'saida_consumo', 5, null, 2),
      m('c', 'entrada_compra', 5, 10000, 3),
      m('d', 'saida_consumo', 2, null, 4),
    ]);
    expect(r.movimentos.map((x) => x.custoApropriadoCentavos)).toEqual([10000, 5000, 10000, 3000]);
    expect(r).toMatchObject({ saldoMilesimos: 8000, valorSaldoCentavos: 12000 });
  });
  it('distingue produção de custo zero da desconhecida e recupera valoração após esgotar', () => {
    expect(calcularEstoque([m('a', 'entrada_producao', 2, 0, 1)])).toMatchObject({
      valorSaldoCentavos: 0,
      valoracaoCompleta: true,
    });
    const r = calcularEstoque([
      m('a', 'entrada_producao', 2, null, 1),
      m('b', 'entrada_compra', 2, 1000, 2),
      m('c', 'saida_consumo', 1, null, 3),
      m('d', 'saida_consumo', 3, null, 4),
      m('e', 'entrada_compra', 1, 100, 5),
    ]);
    expect(r.movimentos.map((x) => x.custoApropriadoCentavos)).toEqual([
      null,
      1000,
      null,
      null,
      100,
    ]);
    expect(r).toMatchObject({ valorSaldoCentavos: 100, valoracaoCompleta: true });
  });
  it('arredonda metade para cima e absorve resíduo ao zerar', () => {
    const r = calcularEstoque([
      m('a', 'entrada_compra', 3, 2, 1),
      m('b', 'saida_consumo', 1, null, 2),
      m('c', 'saida_consumo', 1, null, 3),
      m('d', 'saida_consumo', 1, null, 4),
    ]);
    expect(r.movimentos.slice(1).map((x) => x.custoApropriadoCentavos)).toEqual([1, 1, 0]);
    expect(r).toMatchObject({ saldoMilesimos: 0, valorSaldoCentavos: 0 });
  });
  it('não perde frações de centavo por unidade física', () => {
    const r = calcularEstoque([
      m('a', 'entrada_compra', 1000, 5, 1),
      m('b', 'saida_consumo', 500, null, 2),
    ]);
    expect(r).toMatchObject({ saldoMilesimos: 500000, valorSaldoCentavos: 2 });
    expect(r.movimentos[1]!.custoApropriadoCentavos).toBe(3);
  });
  it('ordem determinística por data e sequência, não pela ordem de entrada do array', () => {
    const a = m('a', 'entrada_compra', 1, 10, 1);
    const b = m('b', 'saida_consumo', 1, null, 2);
    expect(calcularEstoque([b, a])).toEqual(calcularEstoque([a, b]));
    expect(() => calcularEstoque([{ ...a, ordem: 3 }, b])).toThrow(/insuficiente/);
  });
  it('recusa negativo intermediário mesmo com reposição posterior', () =>
    expect(() =>
      calcularEstoque([m('a', 'saida_consumo', 1, null, 1), m('b', 'entrada_compra', 2, 10, 2)]),
    ).toThrow(/insuficiente/));
  it('recusa consumir lote físico diferente, mesmo com saldo total disponível', () =>
    expect(() =>
      calcularEstoque([
        m('a', 'entrada_compra', 2, 10, 1, '2026-10-01', 'L1'),
        m('b', 'saida_consumo', 1, null, 2, '2026-10-01', 'L2'),
      ]),
    ).toThrow(/insuficiente/));
  it('recalcular custo retroativo completa as saídas antes indeterminadas', () => {
    const entrada = m('a', 'entrada_producao', 10, null, 1);
    const saida = m('b', 'saida_consumo', 2, null, 2);
    expect(calcularEstoque([entrada, saida]).movimentos[1]!.custoApropriadoCentavos).toBeNull();
    expect(
      calcularEstoque([{ ...entrada, custoEntradaCentavos: 1000 }, saida]).movimentos[1]!
        .custoApropriadoCentavos,
    ).toBe(200);
  });
  it('precisão explícita, unidades contáveis inteiras e rejeição de NaN', () => {
    expect(quantidadeEmMilesimos(1.125, 'kg')).toBe(1125);
    for (const q of [0, -1, NaN, Infinity, 0.0001])
      expect(() => quantidadeEmMilesimos(q)).toThrow();
    expect(() => quantidadeEmMilesimos(0.5, 'un')).toThrow(/inteira/);
  });
});
describe('estoque mínimo configurável', () => {
  it('não informado desliga o alerta', () => {
    expect(abaixoDoMinimo(0, null)).toBe(false);
    expect(abaixoDoMinimo(5000, null)).toBe(false);
  });
  it('zero avisa só com saldo zerado', () => {
    expect(abaixoDoMinimo(0, 0)).toBe(true);
    expect(abaixoDoMinimo(1, 0)).toBe(false);
  });
  it('maior que zero avisa com saldo menor ou igual, em milésimos inteiros', () => {
    expect(abaixoDoMinimo(10_001, 10_000)).toBe(false);
    expect(abaixoDoMinimo(10_000, 10_000)).toBe(true);
    expect(abaixoDoMinimo(9_999, 10_000)).toBe(true);
  });
});
