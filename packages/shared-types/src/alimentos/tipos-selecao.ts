import type {
  BaseNutricional,
  CenarioPerfil,
  FormaObtencao,
  IdentidadeAlimento,
  NivelCorrespondencia,
  RegraSelecao,
  ResultadoSelecao,
  TipoAvaliacao,
  TipoPerfil,
  TipoValor,
  UnidadeNutricional,
} from '@pecuaria/domain';

/** Avaliação científica de um registro ou valor (Fase 5D), separada da conferência. */
export interface AvaliacaoCientificaApi {
  id: string;
  registroId: string;
  valorId: string | null;
  tipo: TipoAvaliacao;
  motivo: string;
  avaliadoPor: string;
  avaliadoEm: string;
  retiradoPor: string | null;
  retiradoEm: string | null;
  motivoRetirada: string | null;
}

/** Versão da regra de seleção, com a aprovação do usuário (se houver). */
export interface RegraSelecaoApi {
  regra: RegraSelecao;
  hash: string;
  aprovacao: { aprovadoPor: string; aprovadoEm: string; observacao: string | null } | null;
}

export interface ExecucaoSelecao {
  alimento: IdentidadeAlimento;
  regra: RegraSelecaoApi;
  resultado: ResultadoSelecao;
}

export interface ResumoPerfil {
  id: string;
  alimentoId: string;
  alimentoNome: string;
  nome: string;
  tipo: TipoPerfil;
  cenario: CenarioPerfil;
  nivel: NivelCorrespondencia;
  idadeCorteBuscaDias: number | null;
  nutrienteReferencia: { id: string; codigo: string } | null;
  regraCodigo: string;
  regraVersao: number;
  nValores: number;
  criadoPor: string;
  criadoEm: string;
}

export interface ValorPerfilApi {
  id: string;
  nutriente: { id: string; codigo: string; nome: string };
  valor: number;
  valorPublicado: string | null;
  unidade: UnidadeNutricional;
  base: BaseNutricional;
  tipoValor: TipoValor;
  formaObtencao: FormaObtencao;
  metodoAnaliticoFonte: string | null;
  interpretacaoBase: string | null;
  nOrigens: number;
  mediana: number | null;
  minimo: number | null;
  maximo: number | null;
  cobertura: string | null;
  origens: { valorNutricionalId: string; registroId: string; valorUsado: number }[];
}

export interface PerfilDetalhe {
  perfil: ResumoPerfil;
  registroBaseId: string | null;
  diferencas: string[];
  limitacoes: string[];
  naoQuantificados: { nutrienteId: string; textoPublicado: string; natureza: string }[];
  selecao: Record<string, unknown>;
  valores: ValorPerfilApi[];
}
