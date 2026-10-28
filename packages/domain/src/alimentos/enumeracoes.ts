/**
 * Vocabulário do banco de alimentos (Fase 5A). Listas fechadas, usadas pelos esquemas Zod, pelos
 * serviços e pelos CHECK da migration 0012. Mudar uma lista exige nova migration.
 *
 * Nenhuma lista aqui contém dado científico: são categorias de organização e rastreabilidade
 * (MODELOS_NUTRICIONAIS.md, seções 3 e 6; BANCO_DE_DADOS.md, seção 3.7).
 */

/** Origem do dado de composição (MODELOS_NUTRICIONAIS.md, seção 3). */
export const ORIGENS_FONTE = [
  'tabela_compilada',
  'estudo_individual',
  'laboratorial',
  'rotulo_comercial',
  'medicao_propria',
  /** Reservada para o registro de exigências da Fase 6 (BR-CORTE). Recusada na Fase 5. */
  'sistema_exigencias',
] as const;
export type OrigemFonte = (typeof ORIGENS_FONTE)[number];

/** Origens que o usuário pode cadastrar na Fase 5. */
export const ORIGENS_FONTE_CADASTRAVEIS = [
  'tabela_compilada',
  'estudo_individual',
  'laboratorial',
  'rotulo_comercial',
  'medicao_propria',
] as const satisfies readonly OrigemFonte[];
export type OrigemFonteCadastravel = (typeof ORIGENS_FONTE_CADASTRAVEIS)[number];

/** Publicações científicas: exigem autores, ano e página ou tabela em cada registro. */
export const ORIGENS_BIBLIOGRAFICAS = [
  'tabela_compilada',
  'estudo_individual',
] as const satisfies readonly OrigemFonte[];

/** Dados da propriedade, não científicos: pertencem a uma propriedade e a uma amostra datada. */
export const ORIGENS_DA_PROPRIEDADE = [
  'laboratorial',
  'medicao_propria',
] as const satisfies readonly OrigemFonte[];

export const FORMAS_CONSERVACAO = [
  'fresco',
  'pastejo',
  'ensilado',
  'pre_secado',
  'feno',
  'grao',
  'farelo',
  'mistura_comercial',
  'mineral',
  'outro',
] as const;
export type FormaConservacao = (typeof FORMAS_CONSERVACAO)[number];

export const CLASSES_ALIMENTO = [
  'volumoso',
  'pastagem',
  'concentrado_energetico',
  'concentrado_proteico',
  'suplemento_mineral',
  'suplemento_proteico',
  'suplemento_proteico_energetico',
  'aditivo',
  'subproduto',
  'outro',
] as const;
export type ClasseAlimento = (typeof CLASSES_ALIMENTO)[number];

export const GRUPOS_NUTRIENTE = [
  'fracao_seca',
  'proteina',
  'fibra',
  'energia',
  'mineral_macro',
  'mineral_micro',
  'digestibilidade',
  'outro',
] as const;
export type GrupoNutriente = (typeof GRUPOS_NUTRIENTE)[number];

/** Matéria seca ou matéria natural. Todo valor tem uma das duas, sempre exibida ao lado. */
/**
 * O que o número de uma definição representa (migration 0018): fração mássica (0 a 100 %), PB
 * total como N × 6,25 (pode passar de 100 %) ou a parcela dessa PB que vem de nitrogênio não
 * proteico, contida na PB total e nunca somada a ela.
 */
export const NATUREZAS_VALOR = [
  'fracao_massica',
  'equivalente_proteico',
  'equivalente_proteico_nnp',
] as const;
export type NaturezaValor = (typeof NATUREZAS_VALOR)[number];

export const BASES_NUTRICIONAIS = ['ms', 'mn'] as const;
export type BaseNutricional = (typeof BASES_NUTRICIONAIS)[number];

/** Tipo de estatística do valor, como publicado (MODELOS_NUTRICIONAIS.md, seção 6). */
export const TIPOS_VALOR = [
  'valor_unico',
  'media',
  'mediana',
  'minimo_garantido',
  'maximo_garantido',
] as const;
export type TipoValor = (typeof TIPOS_VALOR)[number];
export const TIPOS_VALOR_GARANTIA = [
  'minimo_garantido',
  'maximo_garantido',
] as const satisfies readonly TipoValor[];

export const DIRECOES_CONSERVADORAS = ['menor', 'maior', 'nao_definida'] as const;
export type DirecaoConservadora = (typeof DIRECOES_CONSERVADORAS)[number];

/**
 * Situação da definição de um nutriente. "fundamentada" exige método analítico, fonte cadastrada e
 * página ou tabela (decisão D5-2). Definição sem isso fica "pendente".
 */
export const SITUACOES_FUNDAMENTACAO = ['pendente', 'fundamentada'] as const;
export type SituacaoFundamentacao = (typeof SITUACOES_FUNDAMENTACAO)[number];

export const ORIGENS_DEFINICAO = ['sistema', 'usuario'] as const;
export type OrigemDefinicao = (typeof ORIGENS_DEFINICAO)[number];

/** Separador decimal usado pela fonte, para ler o número publicado sem adivinhar (D5-3). */
export const SEPARADORES_DECIMAIS = ['virgula', 'ponto'] as const;
export type SeparadorDecimal = (typeof SEPARADORES_DECIMAIS)[number];

export const STATUS_REGISTRO = [
  'rascunho',
  'transcrito',
  'conferido',
  'rejeitado',
  'substituido',
] as const;
export type StatusRegistro = (typeof STATUS_REGISTRO)[number];
