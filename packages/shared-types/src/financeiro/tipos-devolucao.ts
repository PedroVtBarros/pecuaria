import type { SituacaoLancamento } from '@pecuaria/domain';

/** Tipos da devolução de animais (revisão final da Fase 4). */

export interface ItemDevolucao {
  id: string;
  negociacaoItemId: string;
  animalId: string;
  animalIdentificacao: string;
  /** Valor atribuído ao animal na negociação original. */
  valorOriginalCentavos: number;
  /** Valor acordado na devolução, informado pelo usuário. */
  valorCentavos: number;
  cancelado: boolean;
}

export interface CompensacaoDaDevolucao {
  id: string;
  /** Parcela da negociação original liquidada pela compensação. */
  parcelaOrigemNumero: number;
  data: string;
  valorCentavos: number;
  cancelada: boolean;
}

export interface DevolucaoDetalhe {
  id: string;
  /** Tipo da negociação devolvida: venda (o comprador devolveu) ou compra (devolvida ao fornecedor). */
  tipo: 'venda' | 'compra';
  negociacaoId: string;
  data: string;
  lancamentoId: string;
  /** Valor acordado (soma dos animais). */
  valorTotalCentavos: number;
  /** Parte liquidada contra o que estava em aberto na negociação original (sem caixa). */
  compensadoCentavos: number;
  /** Restante: reembolso a pagar (venda) ou valor a recuperar (compra). */
  restanteCentavos: number;
  /** Do restante, quanto já foi efetivamente pago (venda) ou recebido (compra). */
  liquidadoEmCaixaCentavos: number;
  /** Restante ainda em aberto; `null` quando a condição do restante não foi definida. */
  restanteEmAbertoCentavos: number | null;
  situacaoFinanceira: SituacaoLancamento;
  /** Original − devolvido (positivo quando se devolve menos do que o valor original). */
  diferencaDoOriginalCentavos: number;
  itens: ItemDevolucao[];
  compensacoes: CompensacaoDaDevolucao[];
  observacoes: string | null;
  cancelada: boolean;
  motivoCancelamento: string | null;
  criadoEm: string;
}

/** Prévia da devolução: o que será compensado e o que fica a pagar ou a receber. */
export interface PrevisaoDevolucao {
  tipo: 'venda' | 'compra';
  itens: {
    negociacaoItemId: string;
    animalIdentificacao: string;
    valorOriginalCentavos: number;
    valorCentavos: number;
  }[];
  valorTotalCentavos: number;
  originalCentavos: number;
  diferencaDoOriginalCentavos: number;
  /** Em aberto hoje na negociação original (antes da devolução). */
  emAbertoNaOriginalCentavos: number;
  /** Já pago (compra) ou recebido (venda) na negociação original. */
  liquidadoNaOriginalCentavos: number;
  compensadoCentavos: number;
  restanteCentavos: number;
  avisos: string[];
}
