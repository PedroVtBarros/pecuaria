/**
 * Vocabulário do módulo financeiro (Fase 4). Listas fechadas, usadas pelos esquemas Zod, pelos
 * serviços e pelos CHECK da migration 0005. Mudar uma lista exige nova migration.
 */
export const NATUREZAS_FINANCEIRAS = ['receita', 'despesa'] as const;
export type NaturezaFinanceira = (typeof NATUREZAS_FINANCEIRAS)[number];

export const GRUPOS_CATEGORIA = [
  'animais',
  'alimentacao',
  'sanidade',
  'mao_de_obra',
  'infraestrutura',
  'impostos',
  'leite',
  'producao_propria',
  'outros',
] as const;
export type GrupoCategoria = (typeof GRUPOS_CATEGORIA)[number];

/**
 * Como a categoria entra nas três visões (caixa, custo apropriado, resultado):
 * - resultado: despesa ou receita do período, na competência;
 * - estoque: compra de insumo; vira estoque e só vira custo quando consumido;
 * - ativo_animal: aquisição de animal e acessórios; só vira custo na saída do animal;
 * - fora_resultado: transferências e empréstimos.
 */
export const TRATAMENTOS_CATEGORIA = [
  'resultado',
  'estoque',
  'ativo_animal',
  'fora_resultado',
] as const;
export type TratamentoCategoria = (typeof TRATAMENTOS_CATEGORIA)[number];

/** Classificação de despesa para margem bruta e ponto de equilíbrio (decisão D-E). */
export const COMPORTAMENTOS_CUSTO = ['variavel', 'fixo', 'nao_classificado'] as const;
export type ComportamentoCusto = (typeof COMPORTAMENTOS_CUSTO)[number];
/** Receita não é custo: a classificação não se aplica. */
export const COMPORTAMENTOS_LANCAMENTO = [...COMPORTAMENTOS_CUSTO, 'nao_se_aplica'] as const;
export type ComportamentoLancamento = (typeof COMPORTAMENTOS_LANCAMENTO)[number];

export const ATIVIDADES = ['corte', 'leite', 'compartilhada', 'nao_definida'] as const;
export type Atividade = (typeof ATIVIDADES)[number];

export const CONDICOES_PAGAMENTO = ['a_vista', 'parcelado', 'nao_informada'] as const;
export type CondicaoPagamento = (typeof CONDICOES_PAGAMENTO)[number];

export const DESTINOS_LANCAMENTO = ['propriedade', 'lote', 'animal', 'nenhum'] as const;
export type DestinoLancamento = (typeof DESTINOS_LANCAMENTO)[number];

export const ORIGENS_LANCAMENTO = [
  'manual',
  'compra_estoque',
  'negociacao_animal',
  'sanitario',
  'producao',
] as const;
export type OrigemLancamento = (typeof ORIGENS_LANCAMENTO)[number];
/** Origem que uma categoria pode exigir: lançamento manual não a usa. */
export type OrigemExigida = Exclude<OrigemLancamento, 'manual'>;

export const TIPOS_LANCAMENTO = ['normal', 'devolucao'] as const;
export type TipoLancamento = (typeof TIPOS_LANCAMENTO)[number];

export const PAPEIS_PESSOA = [
  'fornecedor',
  'comprador',
  'frigorifico',
  'laticinio',
  'prestador',
  'outro',
] as const;
export type PapelPessoa = (typeof PAPEIS_PESSOA)[number];

/**
 * Unidade da quantidade informativa de um lançamento. @ e kg de animal levam a base no nome
 * (peso vivo ou carcaça), decisão D-B; "kg" simples é para mercadorias.
 */
export const UNIDADES_QUANTIDADE_LANCAMENTO = [
  'cabeca',
  'kg',
  'kg_vivo',
  'kg_carcaca',
  'arroba_vivo',
  'arroba_carcaca',
  'litro',
] as const;
export type UnidadeQuantidadeLancamento = (typeof UNIDADES_QUANTIDADE_LANCAMENTO)[number];

/** Uma arroba comercial tem 15 kg, tanto de peso vivo quanto de carcaça (D-B). */
export const QUILOS_POR_ARROBA = 15;
