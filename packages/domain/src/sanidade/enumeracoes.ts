/**
 * Códigos do módulo de sanidade. Nenhum protocolo, posologia ou calendário
 * vem pronto: produtos, doses, carências e datas são sempre informados pelo
 * usuário, conforme a bula e a orientação do veterinário.
 */

export const TIPOS_MANEJO_SANITARIO = [
  'vacinacao',
  'vermifugacao',
  'controle_ectoparasitas',
  'tratamento',
  'exame',
  'outro',
] as const;
export type TipoManejoSanitario = (typeof TIPOS_MANEJO_SANITARIO)[number];

export const TIPOS_PRODUTO_SANITARIO = [
  'vacina',
  'vermifugo',
  'ectoparasiticida',
  'antimicrobiano',
  'anti_inflamatorio',
  'vitamina_mineral',
  'outro',
] as const;
export type TipoProdutoSanitario = (typeof TIPOS_PRODUTO_SANITARIO)[number];

export const UNIDADES_DOSE = ['ml', 'dose', 'g', 'mg', 'ui', 'unidade'] as const;
export type UnidadeDose = (typeof UNIDADES_DOSE)[number];

export const VIAS_APLICACAO = [
  'subcutanea',
  'intramuscular',
  'intravenosa',
  'oral',
  'topica',
  'pour_on',
  'intramamaria',
  'intranasal',
  'outra',
] as const;
export type ViaAplicacao = (typeof VIAS_APLICACAO)[number];

export const ABRANGENCIAS_MANEJO = ['individual', 'coletiva'] as const;
export type AbrangenciaManejo = (typeof ABRANGENCIAS_MANEJO)[number];

export const STATUS_AGENDA_SANITARIA = ['pendente', 'realizado', 'cancelado'] as const;
export type StatusAgendaSanitaria = (typeof STATUS_AGENDA_SANITARIA)[number];

/** Limite de digitação para carência, em dias. Não é dado farmacológico. */
export const CARENCIA_MAXIMA_DIAS = 3650;

/** Limite de digitação para dose. Não é posologia. */
export const DOSE_MAXIMA = 100_000;

/**
 * Antecedência inicial dos avisos da agenda, em dias. É preferência de
 * interface, ajustável em Configurações, não recomendação sanitária.
 */
export const ANTECEDENCIA_AGENDA_INICIAL_DIAS = 7;
