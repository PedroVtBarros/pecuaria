import type {
  NaturezaValor,
  BaseNutricional,
  ClasseAlimento,
  DirecaoConservadora,
  FormaConservacao,
  GrupoNutriente,
  OrigemDefinicao,
  OrigemFonte,
  SituacaoFundamentacao,
  UnidadeNutricional,
} from '@pecuaria/domain';
import type { ResumoRegistro } from './tipos-composicao';

/** Fonte de dado de composição (tabela, estudo, laudo, rótulo ou medição própria). */
export interface Fonte {
  id: string;
  origem: OrigemFonte;
  codigo: string | null;
  titulo: string;
  autores: string | null;
  ano: number | null;
  edicaoVersao: string | null;
  instituicaoEditora: string | null;
  isbnDoiUrl: string | null;
  dataAcesso: string | null;
  experimentoOrigem: string | null;
  laboratorio: string | null;
  numeroLaudo: string | null;
  dataLaudo: string | null;
  fabricante: string | null;
  registroProduto: string | null;
  metodoMedicao: string | null;
  limitacoesMedicao: string | null;
  propriedadeId: string | null;
  propriedadeNome: string | null;
  observacoes: string | null;
  excluidaEm: string | null;
  /** Registros ativos (não descartados) desta fonte. */
  nRegistros: number;
}

/** Definição de nutriente do catálogo. */
export interface Nutriente {
  id: string;
  codigo: string;
  nome: string;
  grupo: GrupoNutriente;
  unidadeReferencia: UnidadeNutricional;
  baseReferencia: BaseNutricional;
  metodoAnalitico: string | null;
  situacaoFundamentacao: SituacaoFundamentacao;
  fundamentacaoFonte: { id: string; titulo: string; codigo: string | null } | null;
  fundamentacaoReferencia: string | null;
  direcaoConservadora: DirecaoConservadora;
  /** Direção pela regra 5.4 do grupo, para a tela mostrar quando a escolhida difere. */
  direcaoSugerida: DirecaoConservadora;
  origemDefinicao: OrigemDefinicao;
  descricao: string | null;
  /** O que o número representa (migration 0018): fração mássica ou equivalente proteico. */
  naturezaValor: NaturezaValor;
  ativo: boolean;
  /** Valores ativos que usam esta definição: com valores, unidade, base e método não mudam. */
  nValores: number;
}

export interface Alimento {
  id: string;
  nome: string;
  especie: string | null;
  cultivar: string | null;
  partePlanta: string | null;
  formaConservacao: FormaConservacao;
  processamento: string | null;
  classe: ClasseAlimento;
  comercial: boolean;
  observacoes: string | null;
  excluidoEm: string | null;
}

export interface ResumoAlimento extends Alimento {
  /** Registros ativos e, entre eles, os conferidos. */
  nRegistros: number;
  nConferidos: number;
}

export interface EventoHistoricoAlimentos {
  id: string;
  entidade: string;
  entidadeId: string;
  acao: string;
  motivo: string | null;
  ocorridoEm: string;
  dadosAnteriores: Record<string, unknown> | null;
  dadosNovos: Record<string, unknown> | null;
}

export interface AlimentoDetalhe {
  alimento: Alimento;
  /** Registros ativos: fontes globais e, se pedida a propriedade, os laudos e medições dela. */
  registros: ResumoRegistro[];
  /** Itens de estoque (de qualquer propriedade) que apontam para este alimento. */
  itensEstoque: { id: string; nome: string; propriedadeId: string; propriedadeNome: string }[];
  historico: EventoHistoricoAlimentos[];
}

/** Alimento do banco ao qual um item de estoque aponta (sem copiar composição). */
export interface VinculoAlimentoItem {
  itemId: string;
  alimento: { id: string; nome: string } | null;
  historico: EventoHistoricoAlimentos[];
}

export interface FonteDetalhe {
  fonte: Fonte;
  historico: EventoHistoricoAlimentos[];
}
