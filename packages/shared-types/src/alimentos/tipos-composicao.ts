import type {
  AcaoConferencia,
  BaseNutricional,
  FormaObtencao,
  GrupoNutriente,
  NaturezaNaoQuantificado,
  OrigemFonte,
  RelacaoVinculo,
  SeparadorDecimal,
  SituacaoVinculo,
  SituacaoFundamentacao,
  StatusRegistro,
  TipoValor,
  UnidadeNutricional,
} from '@pecuaria/domain';
import type { EventoHistoricoAlimentos } from './tipos';
import type { AvaliacaoCientificaApi } from './tipos-selecao';

export interface FonteResumida {
  id: string;
  origem: OrigemFonte;
  codigo: string | null;
  titulo: string;
  propriedadeId: string | null;
  propriedadeNome: string | null;
}

export interface ResumoRegistro {
  id: string;
  alimentoId: string;
  alimentoNome: string;
  fonte: FonteResumida;
  referenciaLocal: string | null;
  idadeCorteDias: number | null;
  dataAmostra: string | null;
  status: StatusRegistro;
  /** Valores numéricos e não quantificados ativos. */
  nValores: number;
  transcritoPor: string | null;
  transcritoEm: string | null;
  conferidoPor: string | null;
  conferidoEm: string | null;
  substituiId: string | null;
  /** Versão que substituiu este registro, quando houver (conferida ou em aberto). */
  sucessorId: string | null;
  /** A mesma pessoa transcreveu e conferiu (permitido, mas a tela avisa). */
  mesmaPessoa: boolean;
  descartadoEm: string | null;
}

export interface ValorNutricionalApi {
  id: string;
  nutriente: {
    id: string;
    codigo: string;
    nome: string;
    grupo: GrupoNutriente;
    unidadeReferencia: UnidadeNutricional;
    baseReferencia: BaseNutricional;
    situacaoFundamentacao: SituacaoFundamentacao;
  };
  valorPublicado: string;
  valor: number;
  casasDecimais: number;
  unidade: UnidadeNutricional;
  base: BaseNutricional;
  tipoValor: TipoValor;
  desvioPadraoPublicado: string | null;
  desvioPadrao: number | null;
  minimoPublicado: string | null;
  minimo: number | null;
  maximoPublicado: string | null;
  maximo: number | null;
  nObservacoes: number | null;
  metodoAnaliticoFonte: string | null;
  /** Medido, calculado, estimado por equação ou NIR, ou não informado pela fonte. */
  formaObtencao: FormaObtencao;
  descricaoObtencao: string | null;
  /** Base não declarada pela fonte: a interpretação e o motivo. Null: base declarada pela fonte. */
  interpretacaoBase: string | null;
  referenciaLocal: string | null;
  observacao: string | null;
}

/**
 * Vínculo de possível mesma origem experimental, visto a partir de um registro. "Outro" é o
 * registro do outro lado (na versão vigente) ou, se ainda não está no banco, a fonte e a página.
 */
export interface VinculoOrigemApi {
  id: string;
  /** O registro consultado é o que declarou o vínculo ("este") ou o outro lado. */
  lado: 'este' | 'outro';
  relacao: RelacaoVinculo;
  evidencia: string;
  pacoteCodigo: string | null;
  situacao: SituacaoVinculo;
  decididoPor: string | null;
  decididoEm: string | null;
  motivoDecisao: string | null;
  outro: {
    registroId: string | null;
    alimentoNome: string | null;
    fonteCodigo: string;
    referenciaLocal: string;
    status: StatusRegistro | null;
  };
}

/**
 * Valor não quantificado ("<0,01", "ND", "traços"), como publicado e com o significado segundo a
 * fonte. Não tem número: nunca entra em cálculo como valor.
 */
export interface ValorNaoQuantificadoApi {
  id: string;
  nutriente: ValorNutricionalApi['nutriente'];
  textoPublicado: string;
  natureza: NaturezaNaoQuantificado;
  significadoFonte: string;
  unidade: UnidadeNutricional;
  base: BaseNutricional;
  tipoValor: TipoValor;
  metodoAnaliticoFonte: string | null;
  referenciaLocal: string | null;
  observacao: string | null;
}

export interface RegistroComposicao extends ResumoRegistro {
  classeIdadeFonte: string | null;
  aditivoEnsilagem: string | null;
  regiao: string | null;
  estacao: string | null;
  adubacao: string | null;
  outrasCondicoes: Record<string, string> | null;
  nObservacoes: number | null;
  separadorDecimal: SeparadorDecimal;
  identificacaoAmostra: string | null;
  observacoes: string | null;
  rejeitadoPor: string | null;
  rejeitadoEm: string | null;
  motivoRejeicao: string | null;
  motivoVersao: string | null;
  substituidoEm: string | null;
  motivoDescarte: string | null;
}

/** Diferença entre esta versão e a anterior, para a conferência. */
export interface DiferencaVersao {
  campo: string;
  antes: string | null;
  depois: string | null;
}

export interface RegistroDetalhe {
  registro: RegistroComposicao;
  fonte: FonteResumida & {
    autores: string | null;
    ano: number | null;
    edicaoVersao: string | null;
    metodoMedicao: string | null;
    limitacoesMedicao: string | null;
    laboratorio: string | null;
    numeroLaudo: string | null;
    fabricante: string | null;
  };
  valores: ValorNutricionalApi[];
  valoresNaoQuantificados: ValorNaoQuantificadoApi[];
  /** Vínculos de possível mesma origem experimental (este registro e suas versões). */
  vinculosOrigem: VinculoOrigemApi[];
  /** Avaliação científica (5D): uso com cautela e base validada; separada da conferência. */
  avaliacoes: AvaliacaoCientificaApi[];
  acoes: AcaoConferencia[];
  editavel: boolean;
  descartavel: boolean;
  aceitaNovaVersao: boolean;
  /** Cadeia de versões, da mais antiga à mais nova, incluindo este registro. */
  versoes: ResumoRegistro[];
  diferencasDaAnterior: DiferencaVersao[];
  historico: EventoHistoricoAlimentos[];
}
