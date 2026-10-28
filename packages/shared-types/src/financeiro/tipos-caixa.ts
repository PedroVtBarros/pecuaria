import type {
  Atividade,
  ComportamentoLancamento,
  GrupoCategoria,
  GranularidadeFluxo,
  NaturezaFinanceira,
  SituacaoParcela,
  TratamentoCategoria,
} from '@pecuaria/domain';

/**
 * Tipos da entrega 4B: fluxo de caixa, contas a pagar e receber, painel e classificação.
 * Fluxo realizado (pagamentos), previsto (parcelas em aberto) e competência (lançamentos) são
 * visões diferentes e nunca vêm somadas entre si.
 */

export interface TotalPorCategoria {
  categoriaId: string;
  categoriaNome: string;
  grupo: GrupoCategoria;
  tratamento: TratamentoCategoria;
  natureza: NaturezaFinanceira;
  totalCentavos: number;
  quantidade: number;
}

export interface LinhaFluxoRealizadoApi {
  chave: string;
  inicio: string;
  fim: string;
  entradasCentavos: number;
  saidasCentavos: number;
  saldoDoPeriodoCentavos: number;
  acumuladoCentavos: number;
  movimentos: number;
}

export interface LinhaFluxoPrevistoApi {
  chave: string;
  inicio: string;
  fim: string;
  aReceberCentavos: number;
  aPagarCentavos: number;
  emAtrasoReceberCentavos: number;
  emAtrasoPagarCentavos: number;
  saldoPrevistoCentavos: number;
  parcelas: number;
}

export interface PendentesDeDefinicao {
  quantidade: number;
  /** Valor das operações (não é saldo a pagar: esse é desconhecido enquanto a condição não existe). */
  valorOperacaoReceitaCentavos: number;
  valorOperacaoDespesaCentavos: number;
}

export interface FluxoDeCaixa {
  propriedadeId: string;
  dataInicial: string;
  dataFinal: string;
  granularidade: GranularidadeFluxo;
  hoje: string;
  realizado: {
    linhas: LinhaFluxoRealizadoApi[];
    entradasCentavos: number;
    saidasCentavos: number;
    saldoCentavos: number;
    movimentos: number;
    porCategoria: TotalPorCategoria[];
  };
  previsto: {
    linhas: LinhaFluxoPrevistoApi[];
    aReceberCentavos: number;
    aPagarCentavos: number;
    emAtrasoReceberCentavos: number;
    emAtrasoPagarCentavos: number;
    saldoPrevistoCentavos: number;
    parcelas: number;
    porCategoria: TotalPorCategoria[];
  };
  /** Lançamentos com saldo desconhecido: ficam fora do previsto, nunca como zero. */
  pendentesDeDefinicao: PendentesDeDefinicao;
}

export interface ContaEmAberto {
  parcelaId: string;
  lancamentoId: string;
  numero: number;
  totalParcelas: number;
  vencimento: string;
  valorCentavos: number;
  pagoCentavos: number;
  /** Liquidado por compensação de devolução (sem caixa). */
  compensadoCentavos: number;
  saldoCentavos: number;
  situacao: SituacaoParcela;
  /** Dias de atraso; `null` quando a parcela não está atrasada. */
  diasEmAtraso: number | null;
  natureza: NaturezaFinanceira;
  descricao: string;
  documentoNumero: string | null;
  categoria: { id: string; nome: string };
  pessoa: { id: string; nome: string } | null;
  dataCompetencia: string;
  atividade: Atividade;
  destinoDescricao: string | null;
}

export interface ResumoContas {
  quantidade: number;
  saldoTotalCentavos: number;
  emAtrasoQuantidade: number;
  emAtrasoCentavos: number;
  aVencerQuantidade: number;
  aVencerCentavos: number;
}

export interface PaginaContas {
  natureza: NaturezaFinanceira;
  hoje: string;
  itens: ContaEmAberto[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
  /** Calculado sobre todo o conjunto filtrado, não só sobre a página. */
  resumo: ResumoContas;
  pendentesDeDefinicao: { quantidade: number; valorOperacaoCentavos: number };
}

export interface BlocoCompetencia {
  natureza: NaturezaFinanceira;
  tratamento: TratamentoCategoria;
  totalCentavos: number;
  quantidade: number;
}

export interface PainelFinanceiro {
  propriedadeId: string;
  dataInicial: string;
  dataFinal: string;
  hoje: string;
  /** Pagamentos e recebimentos efetivos do período: movimento de dinheiro, não lucro. */
  caixa: {
    entradasCentavos: number;
    saidasCentavos: number;
    saldoCentavos: number;
    movimentos: number;
  };
  /** Saldo de parcelas em aberto (todas as datas), com o que vence nos próximos 30 dias. */
  contas: {
    aReceber: ResumoPainelContas;
    aPagar: ResumoPainelContas;
  };
  /** Lançamentos do período por data de competência. Valor das operações; não é resultado. */
  competencia: BlocoCompetencia[];
  pendencias: {
    pendentesDeDefinicao: PendentesDeDefinicao;
    despesasNaoClassificadas: { quantidade: number; valorCentavos: number };
  };
}

export interface ResumoPainelContas {
  saldoTotalCentavos: number;
  emAtrasoCentavos: number;
  emAtrasoQuantidade: number;
  proximos30DiasCentavos: number;
  proximos30DiasQuantidade: number;
}

// ---- Classificação (D-E) ---------------------------------------------------------------------

export interface FaixaClassificacao {
  quantidade: number;
  valorCentavos: number;
}

export interface ClassificacaoDaCategoria {
  categoriaId: string;
  categoriaNome: string;
  grupo: GrupoCategoria;
  tratamento: TratamentoCategoria;
  ativa: boolean;
  /** Padrão da categoria: copiado para lançamentos novos. */
  padrao: ComportamentoLancamento;
  fixo: FaixaClassificacao;
  variavel: FaixaClassificacao;
  naoClassificado: FaixaClassificacao;
}

export interface ResumoClassificacao {
  propriedadeId: string;
  dataInicial: string | null;
  dataFinal: string | null;
  /**
   * Despesas de tratamento "resultado". Compras para estoque e aquisição de animais são
   * classificadas na origem (item de estoque, aquisição), em entregas posteriores.
   */
  cobertura: {
    totalCentavos: number;
    fixoCentavos: number;
    variavelCentavos: number;
    naoClassificadoCentavos: number;
    quantidadeTotal: number;
    quantidadeNaoClassificada: number;
  };
  porCategoria: ClassificacaoDaCategoria[];
}

export interface PreviaClassificacao {
  categoriaId: string;
  categoriaNome: string;
  padrao: ComportamentoLancamento;
  quantidade: number;
  valorCentavos: number;
  amostra: { id: string; descricao: string; dataCompetencia: string; valorCentavos: number }[];
}

export interface ResultadoClassificacaoEmLote {
  categoriaId: string;
  comportamento: ComportamentoLancamento;
  quantidadeAlterada: number;
  valorCentavos: number;
}
