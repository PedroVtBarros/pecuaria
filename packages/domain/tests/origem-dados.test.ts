import { describe, expect, it } from 'vitest';
import {
  exigeDescricaoObtencao,
  FORMAS_OBTENCAO,
  problemasDaObtencao,
  registrosIndependentes,
  type VinculoParaIndependencia,
} from '../src';

/* Textos e ids fictícios (CLAUDE.md, regra 1). */
describe('forma de obtenção (5C)', () => {
  it('cálculo e equação exigem a descrição; medido, NIR e não informado não', () => {
    expect(FORMAS_OBTENCAO.filter(exigeDescricaoObtencao)).toEqual([
      'calculado',
      'estimado_equacao',
    ]);
    expect(problemasDaObtencao('estimado_equacao', null)).toHaveLength(1);
    expect(problemasDaObtencao('calculado', '  ')).toHaveLength(1);
    expect(
      problemasDaObtencao('estimado_equacao', 'Equação fictícia (Autor fictício, 2000).'),
    ).toEqual([]);
    for (const f of ['medido', 'estimado_nir', 'nao_informado'] as const)
      expect(problemasDaObtencao(f, null), f).toEqual([]);
    expect(problemasDaObtencao('medido', 'x'.repeat(501))).toEqual([
      'Descrição da forma de obtenção longa demais.',
    ]);
  });
});

describe('vínculos de possível mesma origem (5C)', () => {
  const v = (
    situacao: VinculoParaIndependencia['situacao'],
    relacionadoId: string | null = 'b',
  ) => ({
    registroId: 'a',
    relacionadoId,
    situacao,
  });

  it('vinculados a confirmar ou confirmados não são independentes, nos dois sentidos', () => {
    expect(registrosIndependentes('a', 'b', [v('a_confirmar')])).toBe(false);
    expect(registrosIndependentes('b', 'a', [v('confirmado')])).toBe(false);
    expect(registrosIndependentes('a', 'c', [v('confirmado')])).toBe(true);
  });

  it('só o descarte devolve a independência; vínculo sem o outro lado não liga ninguém', () => {
    expect(registrosIndependentes('a', 'b', [v('descartado')])).toBe(true);
    expect(registrosIndependentes('a', 'b', [v('descartado'), v('a_confirmar')])).toBe(false);
    expect(registrosIndependentes('a', 'b', [v('a_confirmar', null)])).toBe(true);
    expect(registrosIndependentes('a', 'a', [])).toBe(false);
  });
});
