import type { Apuracao } from '@pecuaria/domain';

/** Tipos da entrega 4F: produção própria. */
export interface CentroProducaoResumo {
  id: string;
  propriedadeId: string;
  nome: string;
  tipo: 'volumoso' | 'outro';
  area: { id: string; nome: string } | null;
  dataInicio: string;
  dataFim: string | null;
  item: { id: string; nome: string; unidadeBase: string };
  status: 'aberto' | 'encerrado';
  cancelado: boolean;
  /** Custo conhecido até aqui (despesas e consumos vinculados), com o estado de apuração. */
  apuracao: Apuracao;
  componentes: number;
}

export interface DespesaDoCentro {
  id: string;
  data: string;
  descricao: string;
  valorCentavos: number;
  /** Cancelada depois de vinculada: não conta. */
  cancelada: boolean;
}
export interface ConsumoDoCentroApi {
  movimentacaoId: string;
  data: string;
  itemNome: string;
  quantidade: number;
  unidadeBase: string;
  /** `null`: custo desconhecido (valoração incompleta do estoque). */
  custoCentavos: number | null;
}

export interface CentroProducaoDetalhe extends CentroProducaoResumo {
  observacoes: string | null;
  motivoCancelamento: string | null;
  criadoEm: string;
  despesas: DespesaDoCentro[];
  consumos: ConsumoDoCentroApi[];
  custo: {
    apuracao: Apuracao;
    conhecidoCentavos: number;
    desconhecidos: number;
    completo: boolean;
    podeEncerrar: boolean;
    /** Custo de entrada que o encerramento daria: o total, ou `null` = custo desconhecido. */
    custoDaEntradaCentavos: number | null;
  };
  /** Retrato do encerramento (só encerrado). */
  encerramento: {
    movimentacaoId: string;
    quantidade: number;
    custoConhecidoCentavos: number;
    componentesDesconhecidos: number;
    custoTotalCentavos: number | null;
  } | null;
  /** Texto fixo: o custo só chega aos animais quando o item produzido é consumido. */
  observacao: string;
}

export interface CandidatosDoCentro {
  despesas: { id: string; data: string; descricao: string; valorCentavos: number }[];
  consumos: ConsumoDoCentroApi[];
}
