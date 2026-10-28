import type { CategoriaCusto } from '@pecuaria/domain';

/** Textos dos relatórios gerados no processo principal (entrega 4H). */
export const TITULOS = {
  resultado: 'Resultado do período',
  custos: 'Custos por lote e animal',
  animal: 'Custo do animal',
  lote: 'Composição do custo do lote',
  lancamentos: 'Lançamentos do período',
  fluxo: 'Fluxo de caixa',
  conciliacao: 'Conciliação entre competência e caixa',
  conferencia: 'Conferência financeira',
} as const;

export const CATEGORIAS: Record<CategoriaCusto, string> = {
  aquisicao: 'Aquisição',
  custo_anterior: 'Custo anterior ao sistema',
  alimentacao: 'Alimentação',
  sanidade: 'Sanidade',
  mercadoria_vendida: 'Mercadoria vendida',
  outros: 'Outros',
};

export const SITUACOES_LANCAMENTO: Record<string, string> = {
  pendente_definicao: 'Pendente de definição',
  a_vencer: 'A vencer',
  vencido: 'Vencido',
  parcialmente_pago: 'Parcialmente pago',
  quitado: 'Quitado',
  cancelado: 'Cancelado',
};

export const SAIDAS: Record<string, string> = {
  vendido: 'Vendido',
  morto: 'Morte (perda)',
  descartado: 'Descarte',
  devolvido_fornecedor: 'Devolvido ao fornecedor',
};

export const VIAS: Record<string, string> = {
  direto: 'Lançado ao animal',
  rateio: 'Rateio',
  animais_tratados: 'Registro sanitário',
  lote: 'Parte do custo do lote',
};

export const TEXTO_SEM_DOCUMENTO =
  'O documento (CPF ou CNPJ) das contrapartes não foi incluído. Para incluí-lo, marque a opção na exportação.';

export const ESTADOS_INDICADOR: Record<'completo' | 'parcial' | 'indisponivel', string> = {
  completo: 'completo',
  parcial: 'parcial',
  indisponivel: 'indisponível',
};

export const SITUACOES_ANIMAL: Record<string, string> = {
  ativo: 'Ativo',
  vendido: 'Vendido',
  morto: 'Morto',
  descartado: 'Descartado',
};
