import type {
  AlertaPesagem,
  AnaliseEvolucaoGrupo,
  AnaliseGmd,
  AptidaoAnimal,
  EscalaEcc,
  ParametrosAlertasPesagem,
  PermanenciaNoLote,
  AptidaoRaca,
  CategoriaAnimal,
  CondicaoSexual,
  FinalidadeLote,
  GrupoGenetico,
  MetodoPesagem,
  OrigemAnimal,
  Sexo,
  StatusAnimal,
  TipoArea,
  TipoExploracao,
  TipoMovimentacao,
  TipoSaida,
} from '@pecuaria/domain';

import type { EventoSanitarioAnimal } from '../sanidade/tipos';

/** Referência curta a outro registro, para exibição. */
export interface Referencia {
  id: string;
  nome: string;
}

export interface Propriedade {
  id: string;
  nome: string;
  municipio: string | null;
  uf: string | null;
  areaTotalHa: number | null;
  tipoExploracao: TipoExploracao;
  observacoes: string | null;
  animaisAtivos: number;
  lotesAtivos: number;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Area {
  id: string;
  propriedadeId: string;
  nome: string;
  tipo: TipoArea;
  areaHa: number | null;
  observacoes: string | null;
  lotesAtivos: number;
}

export interface Raca {
  id: string;
  nome: string;
  aptidao: AptidaoRaca;
  grupoGenetico: GrupoGenetico;
  origem: 'sugestao' | 'usuario';
  animaisVinculados: number;
}

export interface Lote {
  id: string;
  propriedadeId: string;
  nome: string;
  finalidade: FinalidadeLote;
  area: Referencia | null;
  dataFormacao: string;
  ativo: boolean;
  dataEncerramento: string | null;
  observacoes: string | null;
  animaisAtivos: number;
}

export interface MovimentacaoLote {
  id: string;
  data: string;
  areaOrigem: Referencia | null;
  areaDestino: Referencia | null;
  observacao: string | null;
}

export interface LoteDetalhe extends Lote {
  movimentacoesArea: MovimentacaoLote[];
}

export interface PesoRegistrado {
  data: string;
  pesoVivoKg: number;
  metodo: MetodoPesagem;
}

export interface AnimalResumo {
  id: string;
  identificacao: string;
  nome: string | null;
  sexo: Sexo;
  categoria: CategoriaAnimal;
  raca: Referencia | null;
  lote: Referencia | null;
  dataNascimento: string | null;
  status: StatusAnimal;
  ultimaPesagem: PesoRegistrado | null;
}

export interface ReferenciaAnimal {
  id: string;
  identificacao: string;
  nome: string | null;
  excluido: boolean;
}

export interface AnimalDetalhe {
  id: string;
  propriedadeId: string;
  identificacao: string;
  nome: string | null;
  sexo: Sexo;
  condicaoSexual: CondicaoSexual;
  categoria: CategoriaAnimal;
  aptidao: AptidaoAnimal;
  raca: Referencia | null;
  lote: Referencia | null;
  dataNascimento: string | null;
  dataNascimentoEstimada: boolean;
  mae: ReferenciaAnimal | null;
  pai: ReferenciaAnimal | null;
  origem: OrigemAnimal;
  dataEntrada: string;
  status: StatusAnimal;
  dataSaida: string | null;
  motivoSaida: string | null;
  observacoes: string | null;
  ultimaPesagem: PesoRegistrado | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface PaginaAnimais {
  itens: AnimalResumo[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}

export interface Pesagem {
  id: string;
  animalId: string;
  data: string;
  pesoVivoKg: number;
  metodo: MetodoPesagem;
  observacao: string | null;
  escoreCorporal: number | null;
  escalaEcc: EscalaEcc | null;
  /** Preenchido quando o usuário conferiu um alerta e confirmou o valor. */
  conferidaEm: string | null;
  justificativaConferencia: string | null;
  criadoEm: string;
}

/** Pesagens reais, o GMD OBSERVADO calculado a partir delas e os alertas de conferência. */
export interface PesagensDoAnimal {
  pesagens: Pesagem[];
  gmd: AnaliseGmd;
  alertas: AlertaPesagem[];
  parametrosAlertas: ParametrosAlertasPesagem;
}

/** Alerta de pesagem com o animal, para a lista geral de conferência. */
export interface AlertaPesagemItem {
  alerta: AlertaPesagem;
  animal: { id: string; identificacao: string; nome: string | null; lote: Referencia | null };
  pesagem: Pesagem;
  conferida: boolean;
}

export interface AlertasPesagem {
  itens: AlertaPesagemItem[];
  parametros: ParametrosAlertasPesagem;
}

/** Uma linha da prévia ou do resultado da pesagem em lote. */
export interface ItemResultadoPesagemLote {
  animalId: string;
  identificacao: string;
  data: string;
  pesoVivoKg: number;
  erros: string[];
  alertas: AlertaPesagem[];
  anterior: PesoRegistrado | null;
}

export interface ResultadoPesagemLote {
  confirmado: boolean;
  itens: ItemResultadoPesagemLote[];
  comErro: number;
  comAlerta: number;
  gravadas: number;
}

/**
 * Evolução histórica de peso do lote: cada animal entra só enquanto pertencia
 * ao lote, pelas datas do histórico de movimentações. Só pesagens reais.
 */
export interface EvolucaoLote {
  loteId: string;
  /** Animais que estão ou já estiveram no lote. */
  animais: {
    id: string;
    identificacao: string;
    nome: string | null;
    status: StatusAnimal;
    noLoteAgora: boolean;
    permanencias: PermanenciaNoLote[];
    /** Pesagens de cada permanência no lote. O histórico completo fica na ficha do animal. */
    trechos: PesoRegistrado[][];
    pesagensForaDoLote: number;
  }[];
  /**
   * Animais cujo histórico de movimentações não permite saber com segurança
   * quando estiveram no lote. Ficam fora das médias.
   */
  semReconstrucao: { id: string; identificacao: string; nome: string | null; motivo: string }[];
  analise: AnaliseEvolucaoGrupo;
}

export interface MovimentacaoAnimal {
  id: string;
  tipo: TipoMovimentacao;
  data: string;
  loteOrigem: Referencia | null;
  loteDestino: Referencia | null;
  motivo: string | null;
}

export interface CampoAlterado {
  campo: string;
  antes: unknown;
  depois: unknown;
}

/** Item da linha do tempo do animal. */
export type EventoHistoricoAnimal =
  | { tipo: 'movimentacao'; data: string; registradoEm: string; movimentacao: MovimentacaoAnimal }
  | { tipo: 'pesagem'; data: string; registradoEm: string; pesagem: Pesagem }
  | { tipo: 'sanidade'; data: string; registradoEm: string; evento: EventoSanitarioAnimal }
  | {
      tipo: 'alteracao';
      data: string;
      registradoEm: string;
      acao: string;
      entidade: 'animal' | 'pesagem' | 'manejo_sanitario';
      campos: CampoAlterado[];
      motivo: string | null;
      /** Para pesagens: data da pesagem corrigida ou excluída. */
      dataReferencia: string | null;
    };

export interface HistoricoAnimal {
  eventos: EventoHistoricoAnimal[];
}

export interface ResultadoTransferencia {
  transferidos: number;
}

export type { TipoSaida };

export interface LinhaPreviaImportacao {
  linha: number;
  identificacao: string | null;
  erros: string[];
}

export interface ResultadoImportacao {
  confirmado: boolean;
  erroGeral: string | null;
  totalLinhas: number;
  linhasValidas: number;
  linhasComErro: LinhaPreviaImportacao[];
  importados: number;
}
