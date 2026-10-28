import { describe, expect, it } from 'vitest';
import { analisarGmd, ErroPesagensInvalidas, type PesagemParaGmd } from '../src';

function p(
  id: string,
  data: string,
  pesoVivoKg: number,
  metodo: PesagemParaGmd['metodo'] = 'balanca',
) {
  return { id, data, pesoVivoKg, metodo };
}

describe('analisarGmd: ganho médio diário observado', () => {
  it('sem pesagens e com uma só pesagem não há GMD', () => {
    expect(analisarGmd([])).toEqual({
      situacao: 'sem_pesagens',
      quantidadePesagens: 0,
      intervalos: [],
      periodoTotal: null,
    });
    expect(analisarGmd([p('a', '2026-01-01', 300)])).toMatchObject({
      situacao: 'pesagem_unica',
      periodoTotal: null,
    });
  });

  it('30 dias: (330 − 300) / 30 = 1,0 kg/dia', () => {
    const r = analisarGmd([p('a', '2026-01-01', 300), p('b', '2026-01-31', 330)]);
    expect(r.situacao).toBe('calculado');
    expect(r.periodoTotal).toMatchObject({ dias: 30, ganhoKg: 30, gmdKgDia: 1 });
  });

  it('intervalo de 1 dia', () => {
    const r = analisarGmd([p('a', '2026-03-10', 400), p('b', '2026-03-11', 400.8)]);
    expect(r.periodoTotal?.dias).toBe(1);
    expect(r.periodoTotal?.gmdKgDia).toBeCloseTo(0.8, 10);
  });

  it('intervalo longo atravessando ano bissexto: 2027-12-01 a 2028-03-01 = 91 dias', () => {
    const r = analisarGmd([p('a', '2027-12-01', 250), p('b', '2028-03-01', 341)]);
    expect(r.periodoTotal?.dias).toBe(91);
    expect(r.periodoTotal?.gmdKgDia).toBeCloseTo(1, 10);
  });

  it('intervalos consecutivos diferentes e período total, com entrada fora de ordem', () => {
    const r = analisarGmd([
      p('c', '2026-03-02', 360),
      p('a', '2026-01-01', 300),
      p('b', '2026-01-31', 330),
    ]);
    expect(r.intervalos.map((i) => [i.pesagemInicialId, i.pesagemFinalId, i.dias])).toEqual([
      ['a', 'b', 30],
      ['b', 'c', 30],
    ]);
    expect(r.intervalos[1]?.gmdKgDia).toBeCloseTo(1, 10);
    expect(r.periodoTotal).toMatchObject({ dias: 60, ganhoKg: 60 });
    expect(r.periodoTotal?.gmdKgDia).toBeCloseTo(1, 10);
  });

  it('perda de peso gera GMD negativo, sem esconder o valor', () => {
    const r = analisarGmd([p('a', '2026-05-01', 420), p('b', '2026-05-21', 410)]);
    expect(r.periodoTotal?.gmdKgDia).toBeCloseTo(-0.5, 10);
  });

  it('marca como estimado quando alguma pesagem não foi em balança', () => {
    const r = analisarGmd([
      p('a', '2026-01-01', 300, 'fita'),
      p('b', '2026-01-31', 330),
      p('c', '2026-03-02', 360),
    ]);
    expect(r.intervalos.map((i) => i.estimado)).toEqual([true, false]);
    expect(r.periodoTotal?.estimado).toBe(true);
  });

  it('recusa duas pesagens na mesma data', () => {
    expect(() => analisarGmd([p('a', '2026-01-01', 300), p('b', '2026-01-01', 301)])).toThrow(
      ErroPesagensInvalidas,
    );
  });

  it('recusa peso não positivo', () => {
    expect(() => analisarGmd([p('a', '2026-01-01', 0)])).toThrow(ErroPesagensInvalidas);
  });
});
