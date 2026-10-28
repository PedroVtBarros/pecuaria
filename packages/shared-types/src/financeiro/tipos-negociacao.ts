import type {
  Atividade,
  CriterioAlocacao,
  EstadoApuracao,
  SituacaoAquisicao,
  SituacaoFormacao,
  SituacaoLancamento,
  UnidadePreco,
} from '@pecuaria/domain';

import type { DevolucaoDetalhe } from './tipos-devolucao';

/** Tipos da entrega 4C: compra e venda de animais e custo anterior ao sistema. */

export interface ItemNegociacao {
  id: string;
  animalId: string;
  animalIdentificacao: string;
  valorAlocadoCentavos: number;
  pesoVivoKg: number | null;
  pesoCarcacaKg: number | null;
  cancelado: boolean;
  /** Devolução ativa do animal nesta negociação (o mesmo animal não é devolvido duas vezes). */
  devolucao: { id: string; data: string; valorCentavos: number } | null;
}

export interface NegociacaoResumo {
  id: string;
  propriedadeId: string;
  tipo: 'compra' | 'venda';
  data: string;
  pessoa: { id: string; nome: string } | null;
  lancamentoId: string;
  /** Valor da operação. A pagar e o pago ficam no lançamento e nunca se misturam com ele. */
  valorTotalCentavos: number;
  criterio: CriterioAlocacao;
  unidadePreco: UnidadePreco;
  precoUnitarioCentavos: number | null;
  quantidadeAnimais: number;
  observacoes: string | null;
  cancelada: boolean;
  motivoCancelamento: string | null;
  criadoEm: string;
  /** Situação financeira derivada do lançamento ligado. */
  situacaoFinanceira: SituacaoLancamento;
  saldoEmAbertoCentavos: number | null;
  pagoCentavos: number;
  /** Liquidado por compensação de devoluções (sem caixa). */
  compensadoCentavos: number;
}

export interface NegociacaoDetalhe extends NegociacaoResumo {
  atividade: Atividade;
  itens: ItemNegociacao[];
  /** Devoluções desta negociação, ativas e canceladas. */
  devolucoes: DevolucaoDetalhe[];
}

export interface PaginaNegociacoes {
  itens: NegociacaoResumo[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}

export interface ItemCustoAnterior {
  animalId: string;
  animalIdentificacao: string;
  valorCentavos: number;
  pesoRelativo: number;
}

export interface CustoAnterior {
  id: string;
  propriedadeId: string;
  destino: 'animal' | 'lote';
  animal: { id: string; identificacao: string } | null;
  lote: { id: string; nome: string } | null;
  valorCentavos: number;
  dataReferencia: string;
  descricao: string;
  origemInformacao: string;
  justificativa: string;
  /** Sempre "informado pelo usuário": o sistema não estima custo anterior. */
  informadoPeloUsuario: true;
  cancelado: boolean;
  motivoCancelamento: string | null;
  criadoEm: string;
  itens: ItemCustoAnterior[];
}

export interface CustoDoAnimal {
  animalId: string;
  identificacao: string;
  origem: 'nascido' | 'comprado';
  aquisicao: {
    situacao: SituacaoAquisicao;
    valorCentavos: number | null;
    negociacao: { id: string; data: string; fornecedor: string | null } | null;
  };
  formacao: { situacao: SituacaoFormacao; valorCentavos: number | null };
  custosAnteriores: CustoAnterior[];
  acessorios: { lancamentoId: string; valorCentavos: number }[];
  apuracao: {
    estado: EstadoApuracao;
    /** Em estado parcial é um mínimo, não o total. */
    valorConhecidoCentavos: number;
    componentesConhecidos: number;
    componentesNaoApurados: number;
  };
  /** Venda ativa do animal, se houver. */
  venda: { negociacaoId: string; data: string; valorAlocadoCentavos: number } | null;
  /** O que ainda não entra neste número (as demais entregas somam consumo, sanidade e rateios). */
  observacao: string;
}
