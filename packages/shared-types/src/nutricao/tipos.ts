import type {
  PerfilOferta,
  ResultadoBalanco,
  ResultadoOferta,
  ValorPerfilOferta,
} from '@pecuaria/nutrition-engine';
import type { EntradaAvaliacaoDieta, EntradaExigencias, TipoQuantidadeDieta } from './esquemas';

/** Situação de um resultado do motor (MODELOS_NUTRICIONAIS.md; decisão C10 e P-01). */
export const SITUACOES_EXIGENCIA = [
  'valido',
  'fora_do_dominio',
  'fora_do_escopo',
  'indeterminado',
] as const;
export type SituacaoExigencia = (typeof SITUACOES_EXIGENCIA)[number];

export interface ReferenciaLivro {
  capitulo: number;
  pagina: number;
  local: string;
}

/** Um resultado do motor com o que é preciso para explicar "como foi calculado". */
export interface ItemExigencia {
  /** Nó do cálculo (ex.: "PCVZ", "CMS", "Ca.dietetica"). */
  chave: string;
  equacaoId: string;
  descricao: string;
  referencias: ReferenciaLivro[];
  situacao: SituacaoExigencia;
  /** Precisão integral; null quando não calculado (nunca zero no lugar de ausente). */
  valor: number | null;
  unidade: string;
  usoOperacional: boolean;
  motivos: string[];
  /** Limitações científicas, domínios provisórios e restrições de aplicação. */
  avisos: string[];
  /** Notas informativas fixas (ex.: CMS usado; exigência não é oferta). */
  notas: string[];
  coeficientes: Record<string, number>;
  entradas: Record<string, { valor: number; unidade: string }>;
  /** Aprovação da equação pelo usuário; null em nó que não é equação do livro (CMS informado). */
  aprovacao: { por: string; data: string } | null;
}

export const GRUPOS_RESULTADO_EXIGENCIA = [
  'peso',
  'cms',
  'energia',
  'proteina',
  'minerais',
] as const;
export type GrupoResultadoExigencia = (typeof GRUPOS_RESULTADO_EXIGENCIA)[number];

export interface ExigenciasCalculadas {
  fonte: { obra: string; edicao: string; ano: number; doi: string };
  versaoMotor: string;
  entrada: EntradaExigencias;
  /** Qual CMS entrou na energia e na proteína. */
  cmsUsado: { origem: 'informado' | 'previsto'; equacaoId: string };
  grupos: Record<GrupoResultadoExigencia, ItemExigencia[]>;
  resumo: Record<SituacaoExigencia, number> & { total: number };
}

/** Fonte de um registro usado por um perfil (rastreio até a publicação). */
export interface FonteDoPerfil {
  registroId: string;
  fonteTitulo: string;
  fonteCodigo: string | null;
  referenciaLocal: string | null;
  statusRegistro: string;
}

/** Perfil usado na avaliação, como estava no momento do cálculo (6B-3). */
export interface PerfilAvaliado {
  perfilId: string;
  nome: string;
  alimentoId: string;
  alimentoNome: string;
  tipo: string;
  cenario: string;
  nivel: string;
  regra: { codigo: string; versao: number; aprovadaEm: string | null; vigente: boolean };
  criadoEm: string;
  elegivel: boolean;
  /** Por que o perfil não entra no cálculo (vazio se elegível). */
  motivosInelegibilidade: string[];
  /** "Uso com cautela", limitações do perfil e versões novas em conferência: não bloqueiam. */
  avisos: string[];
  fontes: FonteDoPerfil[];
  /**
   * Valores efetivamente entregues ao motor (6B-4): como gravados no perfil, com unidade, base,
   * tipo, forma de obtenção, natureza, base validada e origens. Nada completado com zero.
   */
  valores: ValorPerfilOferta[];
  naoQuantificados: PerfilOferta['naoQuantificados'];
}

/** Perfil para o seletor da avaliação de dieta (6B-5), com a elegibilidade de agora. */
export type PerfilParaDieta = Omit<PerfilAvaliado, 'valores' | 'naoQuantificados'> & {
  /** Códigos dos nutrientes com valor no perfil. */
  nutrientes: string[];
};

/** Hipóteses do cálculo, explícitas para ficarem gravadas com a avaliação (6B-4). */
export interface HipotesesAvaliacao {
  tipoQuantidade: TipoQuantidadeDieta;
  /** CMS que entrou nas exigências: a MS consumida (como CMS informado) ou o CMS previsto. */
  cmsExigencia: {
    origem: 'ms_consumida' | 'cms_previsto';
    cms: EntradaExigencias['cms'];
  };
  /** GMD é o desejado (planejado), informado pelo usuário; não o observado nas pesagens. */
  gmd: 'desejado';
  textos: string[];
}

/**
 * D-6B4-01: parcial (falta dado em alguma parte) e uso operacional (nenhum perfil inelegível),
 * calculados com a avaliação e gravados no retrato.
 */
export interface SituacaoAvaliacaoCalculada {
  parcial: boolean;
  motivosParcial: string[];
  usoOperacional: boolean;
  /** Por que não há uso operacional (perfis inelegíveis, com os motivos). */
  bloqueios: string[];
}

/** Avaliação de dieta calculada na hora (6B-3); gravada só por ação do usuário (6B-4). */
export interface AvaliacaoDietaCalculada {
  fonte: { obra: string; edicao: string; ano: number; doi: string };
  versaoMotor: string;
  entrada: EntradaAvaliacaoDieta;
  hipoteses: HipotesesAvaliacao;
  /** CMS previsto pelo BR-CORTE, separado do consumo (C-6B-01). */
  cmsPrevisto: ItemExigencia;
  /**
   * Exigências calculadas com a MS consumida como CMS (observada ou assumida); com a dieta só
   * oferecida, com o CMS previsto, identificado.
   */
  exigencias: ExigenciasCalculadas;
  perfis: PerfilAvaliado[];
  oferta: ResultadoOferta;
  balanco: ResultadoBalanco;
  situacao: SituacaoAvaliacaoCalculada;
  /**
   * SHA-256 do retrato que seria gravado (D-6B4-02): a tela o devolve ao gravar e o main confere.
   * Null quando o retrato não cabe em JSON sem perda (naoGravavel diz por quê).
   */
  conteudoSha256: string | null;
  naoGravavel: string | null;
}

/**
 * Avaliação nutricional gravada (6B-4, migration 0019): o retrato como foi calculado e gravado,
 * sem recálculo. "integridade" confere o SHA-256 do conteúdo gravado.
 */
export interface AvaliacaoNutricionalGravada {
  id: string;
  rotulo: string;
  observacao: string | null;
  registradoPor: string;
  registradoEm: string;
  formatoVersao: number;
  conteudoSha256: string;
  integridade: 'conferida' | 'divergente';
  /** D-6B4-03: registro separado; o retrato não muda. */
  anulacao: AnulacaoAvaliacao | null;
  /**
   * Uso operacional: sem perfil inelegível (D-6B4-01), com integridade conferida (D-6B4-04) e
   * não anulada. Avaliação sem uso operacional continua consultável.
   */
  usoOperacional: boolean;
  bloqueios: string[];
  /** Retrato de formato 1 (sem a situação gravada): situação recalculada do retrato na leitura. */
  situacaoCalculadaNaLeitura: boolean;
  avaliacao: AvaliacaoDietaCalculada;
}

export interface AnulacaoAvaliacao {
  motivo: string;
  anuladoPor: string;
  anuladoEm: string;
}

export interface ResumoAvaliacaoNutricional {
  id: string;
  rotulo: string;
  observacao: string | null;
  registradoPor: string;
  registradoEm: string;
  versaoMotor: string;
  tipoQuantidade: TipoQuantidadeDieta;
  parcial: boolean;
  anulada: boolean;
  integridade: 'conferida' | 'divergente';
  usoOperacional: boolean;
  /** Nome do perfil e do alimento como estavam ao gravar. */
  perfis: { perfilId: string; nome: string; alimentoNome: string; elegivel: boolean }[];
}
