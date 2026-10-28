/**
 * Unidades conhecidas dos valores nutricionais (decisão D5-3). O valor é gravado na unidade em que
 * foi publicado; a conversão só acontece no cálculo (Fase 6), por este módulo.
 *
 * Os fatores são definições de unidade, não dados científicos: 1 % = 10 g/kg = 10.000 mg/kg, e
 * ppm em massa é mg/kg. Grandezas diferentes nunca se convertem. Energia e atividade (UI) não
 * têm conversão definida nesta fase: uma conversão nova exige cadastro explícito aqui, com teste.
 */
export const GRANDEZAS_NUTRICIONAIS = [
  'fracao_massica',
  'energia_massica',
  'atividade_massica',
] as const;
export type GrandezaNutricional = (typeof GRANDEZAS_NUTRICIONAIS)[number];

export const UNIDADES_NUTRICIONAIS = ['pct', 'g_kg', 'mg_kg', 'ppm', 'mcal_kg', 'ui_kg'] as const;
export type UnidadeNutricional = (typeof UNIDADES_NUTRICIONAIS)[number];

export interface DefinicaoUnidade {
  simbolo: string;
  grandeza: GrandezaNutricional;
  /**
   * Potência de dez em relação a mg/kg, só para fração mássica: valor em mg/kg = valor × 10^n.
   * `null` = sem conversão definida.
   */
  expoenteMgKg: number | null;
  /** Faixa possível pela própria definição da unidade (fração de 0 a 100 %). `null` = sem limite. */
  minimo: number | null;
  maximo: number | null;
}

export const DEFINICOES_UNIDADE: Readonly<Record<UnidadeNutricional, DefinicaoUnidade>> = {
  pct: { simbolo: '%', grandeza: 'fracao_massica', expoenteMgKg: 4, minimo: 0, maximo: 100 },
  g_kg: { simbolo: 'g/kg', grandeza: 'fracao_massica', expoenteMgKg: 3, minimo: 0, maximo: 1000 },
  mg_kg: {
    simbolo: 'mg/kg',
    grandeza: 'fracao_massica',
    expoenteMgKg: 0,
    minimo: 0,
    maximo: 1_000_000,
  },
  ppm: {
    simbolo: 'ppm',
    grandeza: 'fracao_massica',
    expoenteMgKg: 0,
    minimo: 0,
    maximo: 1_000_000,
  },
  mcal_kg: {
    simbolo: 'Mcal/kg',
    grandeza: 'energia_massica',
    expoenteMgKg: null,
    minimo: null,
    maximo: null,
  },
  ui_kg: {
    simbolo: 'UI/kg',
    grandeza: 'atividade_massica',
    expoenteMgKg: null,
    minimo: 0,
    maximo: null,
  },
};

export function grandezaDaUnidade(unidade: UnidadeNutricional): GrandezaNutricional {
  return DEFINICOES_UNIDADE[unidade].grandeza;
}

export function mesmaGrandeza(a: UnidadeNutricional, b: UnidadeNutricional): boolean {
  return grandezaDaUnidade(a) === grandezaDaUnidade(b);
}

/** O valor cabe na faixa que a unidade admite por definição? (ex.: percentual de 0 a 100). */
export function dentroDaFaixaDaUnidade(valor: number, unidade: UnidadeNutricional): boolean {
  if (!Number.isFinite(valor)) return false;
  const { minimo, maximo } = DEFINICOES_UNIDADE[unidade];
  return (minimo === null || valor >= minimo) && (maximo === null || valor <= maximo);
}

export function descreverFaixa(unidade: UnidadeNutricional): string | null {
  const { minimo, maximo, simbolo } = DEFINICOES_UNIDADE[unidade];
  if (minimo === null && maximo === null) return null;
  if (maximo === null) return `maior ou igual a ${minimo} ${simbolo}`;
  return `de ${minimo ?? '−∞'} a ${maximo.toLocaleString('pt-BR')} ${simbolo}`;
}

export function existeConversao(de: UnidadeNutricional, para: UnidadeNutricional): boolean {
  if (de === para) return true;
  return (
    mesmaGrandeza(de, para) &&
    DEFINICOES_UNIDADE[de].expoenteMgKg !== null &&
    DEFINICOES_UNIDADE[para].expoenteMgKg !== null
  );
}

/**
 * Converte entre unidades da mesma grandeza com fator exato (potência de dez). O resultado é
 * limpo do ruído binário (15 algarismos significativos), para que 0,07 % vire 0,7 g/kg e não
 * 0,7000000000000001. Lança erro se não houver conversão definida.
 */
export function converterUnidade(
  valor: number,
  de: UnidadeNutricional,
  para: UnidadeNutricional,
): number {
  if (!Number.isFinite(valor)) throw new Error('Valor inválido para conversão.');
  if (de === para) return valor;
  if (!existeConversao(de, para))
    throw new Error(
      `Não há conversão definida de ${DEFINICOES_UNIDADE[de].simbolo} para ${DEFINICOES_UNIDADE[para].simbolo}.`,
    );
  const expoente = DEFINICOES_UNIDADE[de].expoenteMgKg! - DEFINICOES_UNIDADE[para].expoenteMgKg!;
  const bruto = expoente >= 0 ? valor * 10 ** expoente : valor / 10 ** -expoente;
  return Number(bruto.toPrecision(15));
}
