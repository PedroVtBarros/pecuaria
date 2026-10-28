import type { Unidade } from './unidades';

/** Categorias de bovinos de corte em crescimento e terminação (C2). Vaca leiteira não existe aqui (A6). */
export const GRUPOS_GENETICOS = ['zebuino', 'cruzado_corte', 'cruzado_leite'] as const;
export type GrupoGenetico = (typeof GRUPOS_GENETICOS)[number];

export const CLASSES_SEXUAIS = ['macho_nao_castrado', 'macho_castrado', 'femea'] as const;
export type ClasseSexual = (typeof CLASSES_SEXUAIS)[number];

export const SISTEMAS = ['confinamento', 'pasto'] as const;
export type Sistema = (typeof SISTEMAS)[number];

export interface Categoria {
  grupo: GrupoGenetico;
  sexo: ClasseSexual;
  sistema: Sistema;
}

/** Onde está cada coisa no livro: capítulo, página impressa e tabela ou número da equação. */
export interface ReferenciaFonte {
  capitulo: number;
  pagina: number;
  local: string;
}

/** Coeficiente transcrito, com o texto como impresso e a página. */
export interface Coeficiente {
  valor: number;
  impresso: string;
  referencia: ReferenciaFonte;
}

/**
 * Situação de um resultado (decisão C10 e determinação P-01):
 * - valido: calculado dentro do domínio validado;
 * - fora_do_dominio: calculado, mas fora do domínio dos dados: sem uso operacional;
 * - fora_do_escopo: não calculado (categoria não coberta, GMD negativo);
 * - indeterminado: não calculado por falta de entrada ou de resultado de que depende.
 */
export const SITUACOES_RESULTADO = [
  'valido',
  'fora_do_dominio',
  'fora_do_escopo',
  'indeterminado',
] as const;
export type SituacaoResultado = (typeof SITUACOES_RESULTADO)[number];

export interface Resultado {
  equacaoId: string;
  situacao: SituacaoResultado;
  /** null quando não calculado. Precisão integral: nada é arredondado no motor. */
  valor: number | null;
  unidade: Unidade;
  /** Só "valido" tem uso operacional (C10). */
  usoOperacional: boolean;
  motivos: string[];
  /**
   * Avisos que não tiram o uso operacional, mas pedem atenção: limitação científica, domínio
   * provisório, restrição de aplicação.
   */
  avisos: string[];
  /** Notas informativas fixas (ex.: qual CMS foi usado; exigência não é oferta). */
  notas: string[];
  /** Valores dos coeficientes usados, para a avaliação imutável guardar (A4). */
  coeficientes: Record<string, number>;
  /** Entradas usadas, com unidade. */
  entradas: Record<string, { valor: number; unidade: Unidade }>;
}

/** Transcrição e conferências de uma equação (A2, C9). */
export interface Conferencia {
  transcritoPor: string;
  conferencias: { por: string; data: string; metodo: string; paginas: number[] }[];
  /** Aprovação da equação pelo usuário; null enquanto pendente. */
  aprovacaoUsuario: { por: string; data: string } | null;
}
