import type {
  Atividade,
  ComportamentoLancamento,
  CondicaoPagamento,
  DestinoLancamento,
  GrupoCategoria,
  NaturezaFinanceira,
  OrigemExigida,
  OrigemLancamento,
  PapelPessoa,
  SituacaoLancamento,
  SituacaoParcela,
  TipoLancamento,
  TratamentoCategoria,
  UnidadeQuantidadeLancamento,
} from '@pecuaria/domain';

export interface PessoaComercial {
  id: string;
  nome: string;
  papel: PapelPessoa;
  documento: string | null;
  observacoes: string | null;
  ativo: boolean;
}

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  natureza: NaturezaFinanceira;
  grupo: GrupoCategoria;
  tratamento: TratamentoCategoria;
  /** Classificação padrão, copiada para cada lançamento novo (D-E). */
  comportamentoCusto: ComportamentoLancamento;
  /** Categoria que só aceita lançamentos criados por outro módulo. */
  origemExigida: OrigemExigida | null;
  origem: 'sugestao' | 'usuario';
  ativa: boolean;
}

export interface ParcelaFinanceira {
  id: string;
  numero: number;
  vencimento: string;
  valorCentavos: number;
  pagoCentavos: number;
  /** Liquidado por compensação de devolução de animais: não é pagamento nem caixa. */
  compensadoCentavos: number;
  saldoCentavos: number;
  /** Derivada. Parcela cancelada em renegociação não tem situação. */
  situacao: SituacaoParcela | null;
  cancelada: boolean;
  motivoCancelamento: string | null;
}

export interface PagamentoFinanceiro {
  id: string;
  parcelaId: string;
  parcelaNumero: number;
  data: string;
  valorCentavos: number;
  forma: string | null;
  observacao: string | null;
  estornado: boolean;
  motivoEstorno: string | null;
  registradoEm: string;
}

export interface DestinoDoLancamento {
  tipo: DestinoLancamento;
  loteId: string | null;
  loteNome: string | null;
  animalId: string | null;
  animalIdentificacao: string | null;
}

export interface LancamentoResumo {
  id: string;
  propriedadeId: string;
  categoria: {
    id: string;
    nome: string;
    tratamento: TratamentoCategoria;
    grupo: GrupoCategoria;
  };
  pessoa: { id: string; nome: string } | null;
  natureza: NaturezaFinanceira;
  tipo: TipoLancamento;
  lancamentoOrigemId: string | null;
  /** Competência: quando o fato ocorreu. Não é a data de pagamento. */
  dataCompetencia: string;
  descricao: string;
  documentoNumero: string | null;
  atividade: Atividade;
  destino: DestinoDoLancamento;
  quantidade: number | null;
  unidadeQuantidade: UnidadeQuantidadeLancamento | null;
  condicaoPagamento: CondicaoPagamento;
  comportamentoCusto: ComportamentoLancamento;
  origemTipo: OrigemLancamento;
  origemId: string | null;
  observacoes: string | null;
  /** Derivada das parcelas e dos pagamentos. */
  situacao: SituacaoLancamento;
  /** Valor da operação. */
  valorOperacaoCentavos: number;
  /** A pagar ou a receber. `null` = condição de pagamento ainda não definida (não é zero). */
  saldoEmAbertoCentavos: number | null;
  /** Efetivamente pago ou recebido. */
  pagoCentavos: number;
  /** Liquidado por compensação de devolução de animais (sem caixa). */
  compensadoCentavos: number;
  proximoVencimento: string | null;
  cancelado: boolean;
  motivoCancelamento: string | null;
  criadoEm: string;
}

export interface HistoricoFinanceiro {
  id: string;
  entidade: string;
  entidadeId: string;
  acao: string;
  motivo: string | null;
  ocorridoEm: string;
  dadosAnteriores: Record<string, unknown> | null;
  dadosNovos: Record<string, unknown> | null;
}

export interface LancamentoDetalhe extends LancamentoResumo {
  parcelas: ParcelaFinanceira[];
  pagamentos: PagamentoFinanceiro[];
  historico: HistoricoFinanceiro[];
}

export interface PaginaLancamentos {
  itens: LancamentoResumo[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}
