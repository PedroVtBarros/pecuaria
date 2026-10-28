import type { Apuracao, CategoriaCusto, CriterioRateio } from '@pecuaria/domain';

/** Tipos da entrega 4E: rateio de custos compartilhados e custo por lote e por animal. */

export interface CustoCompartilhado {
  origemTipo: 'lancamento' | 'movimentacao_estoque';
  origemId: string;
  data: string;
  descricao: string;
  /** `null`: custo desconhecido (valoração incompleta do estoque). */
  valorCentavos: number | null;
}

export interface PendentesDeRateio {
  propriedadeId: string;
  itens: CustoCompartilhado[];
  total: Apuracao;
  /** Há mais custos do que os mostrados (a lista é limitada). */
  truncado: boolean;
}

export interface DestinoDoRateio {
  tipo: 'lote' | 'animal';
  id: string;
  rotulo: string;
  peso: number;
  base: string;
  /** Parte atual do valor da origem; `null` = custo desconhecido. */
  valorCentavos: number | null;
}

export interface PreviaDeRateio {
  origem: { data: string; descricao: string; valorCentavos: number | null; ativa: boolean };
  destinos: DestinoDoRateio[];
  /** Vazio quando o critério pôde ser calculado. */
  erros: string[];
  /** Soma das partes (igual ao valor da origem quando conhecido). */
  somaCentavos: number | null;
}

export interface RateioDetalhe {
  id: string;
  propriedadeId: string;
  origemTipo: 'lancamento' | 'movimentacao_estoque';
  origemId: string;
  criterio: CriterioRateio;
  dataBase: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  idadeMaximaPesagemDias: number | null;
  motivo: string;
  cancelado: boolean;
  motivoCancelamento: string | null;
  criadoEm: string;
  origem: { data: string; descricao: string; valorCentavos: number | null; ativa: boolean };
  destinos: DestinoDoRateio[];
  somaCentavos: number | null;
  /** A origem foi cancelada: o rateio não gera custo até ser cancelado ou refeito. */
  origemCancelada: boolean;
  /** Critério automático: a base de hoje difere da gravada (revise se for o caso). */
  baseMudou: boolean | null;
  /** Versões do mesmo rateio, da mais antiga à mais nova. */
  versoes: {
    id: string;
    criadoEm: string;
    criterio: CriterioRateio;
    cancelado: boolean;
    motivo: string;
  }[];
}

export interface ResumoDeRateio {
  id: string;
  origemTipo: 'lancamento' | 'movimentacao_estoque';
  criterio: CriterioRateio;
  descricao: string;
  data: string;
  valorCentavos: number | null;
  destinos: number;
  cancelado: boolean;
  origemCancelada: boolean;
  criadoEm: string;
}

export interface CustoPorCategoria {
  categoria: CategoriaCusto;
  valorCentavos: number;
}

export interface CustoDoLote {
  loteId: string;
  loteNome: string;
  diretoCentavos: number;
  rateadoCentavos: number;
  totalCentavos: number;
  desconhecidos: number;
  porCategoria: CustoPorCategoria[];
  apuracao: Apuracao;
  /** Custo do lote em dias sem nenhum animal presente (não chegou a nenhum animal). */
  semAnimaisCentavos: number;
}

export interface ResumoDeCustos {
  propriedadeId: string;
  dataInicial: string | null;
  dataFinal: string | null;
  lotes: CustoDoLote[];
  /** Custo da propriedade sem rateio: sempre visível e incluído no total geral. */
  naoAlocado: { apuracao: Apuracao; porCategoria: CustoPorCategoria[] };
  animais: { quantidade: number; apuracao: Apuracao };
  /** Custos que estão em centros de produção (fora da apropriação a lotes e animais até virarem estoque). */
  emProducao: Apuracao;
  /** Soma dos custos de origem conhecidos; igual a animais + lotes sem animais + não alocado. */
  totalDeOrigemCentavos: number;
  desconhecidosDeOrigem: number;
  conferido: boolean;
  /** Animais cujo histórico de lote não permitiu reconstruir a presença. */
  avisos: string[];
}

export interface CustoDoAnimalNoPeriodo {
  animalId: string;
  identificacao: string;
  loteId: string | null;
  loteNome: string | null;
  status: string;
  apuracao: Apuracao;
  porCategoria: CustoPorCategoria[];
}

export interface PaginaCustosAnimais {
  itens: CustoDoAnimalNoPeriodo[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}

export interface LinhaDeOrigem {
  via: 'direto' | 'rateio' | 'animais_tratados' | 'lote';
  categoria: CategoriaCusto;
  data: string;
  /** Parte do animal; `null` = desconhecida. */
  valorCentavos: number | null;
  descricao: string;
  /** Para onde levar o usuário: lançamento, movimento de estoque, compra ou custo anterior. */
  origem: {
    tipo: 'lancamento' | 'consumo' | 'aquisicao' | 'custo_anterior' | 'manejo_sanitario';
    id: string;
  } | null;
  explicacao: string;
}

export interface ExplicacaoDeCusto {
  animalId: string;
  identificacao: string;
  apuracao: Apuracao;
  porCategoria: CustoPorCategoria[];
  linhas: LinhaDeOrigem[];
  avisos: string[];
}

export interface ExplicacaoDoLote {
  loteId: string;
  loteNome: string;
  apuracao: Apuracao;
  linhas: {
    via: 'direto' | 'rateio';
    categoria: CategoriaCusto;
    data: string;
    valorCentavos: number | null;
    descricao: string;
    origem: { tipo: 'lancamento' | 'consumo' | 'manejo_sanitario'; id: string } | null;
  }[];
}
