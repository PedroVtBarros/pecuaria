/**
 * Valores fixos do módulo de rebanho. Os mesmos códigos são usados no banco
 * (CHECK), no contrato IPC (Zod) e na interface. Rótulos de exibição ficam na
 * interface (textos.ts).
 */

export const TIPOS_EXPLORACAO = ['corte', 'leite', 'misto'] as const;
export type TipoExploracao = (typeof TIPOS_EXPLORACAO)[number];

export const TIPOS_AREA = ['piquete', 'curral', 'baia', 'confinamento', 'outro'] as const;
export type TipoArea = (typeof TIPOS_AREA)[number];

export const FINALIDADES_LOTE = ['cria', 'recria', 'engorda', 'lactacao', 'seca', 'outro'] as const;
export type FinalidadeLote = (typeof FINALIDADES_LOTE)[number];

export const SEXOS = ['F', 'M'] as const;
export type Sexo = (typeof SEXOS)[number];

export const CONDICOES_SEXUAIS = ['femea', 'inteiro', 'castrado'] as const;
export type CondicaoSexual = (typeof CONDICOES_SEXUAIS)[number];

export const CATEGORIAS_ANIMAL = [
  'bezerra',
  'novilha',
  'vaca',
  'bezerro',
  'garrote',
  'novilho',
  'boi',
  'touro',
] as const;
export type CategoriaAnimal = (typeof CATEGORIAS_ANIMAL)[number];

/** Sexo compatível com cada categoria. */
export const SEXO_DA_CATEGORIA: Record<CategoriaAnimal, Sexo> = {
  bezerra: 'F',
  novilha: 'F',
  vaca: 'F',
  bezerro: 'M',
  garrote: 'M',
  novilho: 'M',
  boi: 'M',
  touro: 'M',
};

export const APTIDOES_ANIMAL = ['corte', 'leite'] as const;
export type AptidaoAnimal = (typeof APTIDOES_ANIMAL)[number];

export const APTIDOES_RACA = ['corte', 'leite', 'dupla'] as const;
export type AptidaoRaca = (typeof APTIDOES_RACA)[number];

export const GRUPOS_GENETICOS = ['zebuino', 'taurino', 'cruzado', 'indefinido'] as const;
export type GrupoGenetico = (typeof GRUPOS_GENETICOS)[number];

export const ORIGENS_ANIMAL = ['nascido', 'comprado'] as const;
export type OrigemAnimal = (typeof ORIGENS_ANIMAL)[number];

export const STATUS_ANIMAL = ['ativo', 'vendido', 'morto', 'descartado'] as const;
export type StatusAnimal = (typeof STATUS_ANIMAL)[number];

export const TIPOS_SAIDA = ['vendido', 'morto', 'descartado'] as const;
export type TipoSaida = (typeof TIPOS_SAIDA)[number];

export const TIPOS_MOVIMENTACAO = ['entrada', 'troca_lote', 'saida'] as const;
export type TipoMovimentacao = (typeof TIPOS_MOVIMENTACAO)[number];

/**
 * Método da pesagem. Só "balanca" mede o peso; fita e avaliação visual são
 * estimativas e o GMD calculado com elas é marcado como estimado.
 */
export const METODOS_PESAGEM = ['balanca', 'fita', 'visual'] as const;
export type MetodoPesagem = (typeof METODOS_PESAGEM)[number];

/**
 * Escala do escore de condição corporal (ECC). O sistema só guarda a nota
 * na escala que o usuário usou; não converte entre escalas nem interpreta
 * a nota, porque isso exigiria critério de uma fonte que não foi consultada.
 */
export const ESCALAS_ECC = ['1_5', '1_9'] as const;
export type EscalaEcc = (typeof ESCALAS_ECC)[number];
export const LIMITES_ESCALA_ECC: Record<EscalaEcc, { minimo: number; maximo: number }> = {
  '1_5': { minimo: 1, maximo: 5 },
  '1_9': { minimo: 1, maximo: 9 },
};

export const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const;
export type Uf = (typeof UFS)[number];

/**
 * Limite de sanidade para peso vivo digitado, em kg. Não é dado zootécnico:
 * serve só para barrar erro de digitação (ex.: 4500 em vez de 450).
 */
export const PESO_VIVO_MAXIMO_KG = 2000;
