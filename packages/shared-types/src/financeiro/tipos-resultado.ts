import type {
  Apuracao,
  BaseDeUnidade,
  CategoriaCusto,
  EstadoResultado,
  LimiteResultado,
} from '@pecuaria/domain';

/** Completude do resultado (regra única do domínio, `apurarResultado`). */
export interface CompletudeResultado {
  /** Receita conhecida − custo conhecido; é o resultado só quando completo. */
  valorConhecidoCentavos: number;
  /** `null` quando não apurado. */
  resultadoCentavos: number | null;
  /** Receitas que deveriam existir, sem valor registrado (nunca contadas como zero). */
  receitasDesconhecidas: number;
  estado: EstadoResultado;
  limite: LimiteResultado | null;
}

/** Tipos da entrega 4G: resultado, indicadores, conciliação e projeção. */
export interface CustoSemClassificacao {
  data: string;
  descricao: string;
  /** `null` = valor desconhecido. */
  valorCentavos: number | null;
  origem: { tipo: string; id: string };
}

export interface MargemBrutaApi {
  receitaCentavos: number;
  variaveisCentavos: number;
  fixosCentavos: number;
  margemCentavos: number;
  estado: 'calculada' | 'parcial';
  coberturaCentavos: { classificado: number; total: number; naoClassificado: number };
  motivos: string[];
  semClassificacao: CustoSemClassificacao[];
  /** A lista acima foi limitada. */
  semClassificacaoTruncada: boolean;
}

export interface ResultadoDoPeriodo {
  propriedadeId: string;
  dataInicial: string;
  dataFinal: string;
  /** Regime de competência: receitas e custos apropriados do período. */
  competencia: {
    receitas: {
      /** Vendas de animais (bruto, sem as devoluções). */
      vendaAnimaisCentavos: number;
      /** Devoluções de venda reconhecidas no período (deduzem a receita; valor acordado). */
      devolucoesVendaCentavos: number;
      leiteCentavos: number;
      outrasCentavos: number;
      /** Valor acordado com o fornecedor em devoluções de compra (não é venda de animais). */
      recuperadoDevolucaoCompraCentavos: number;
      /** Receita líquida: vendas − devoluções + leite + outras + recuperado de devoluções de compra. */
      totalCentavos: number;
    };
    custo: Apuracao;
    porCategoria: { categoria: CategoriaCusto; valorCentavos: number }[];
    /** Aquisição e custo anterior dos animais que saíram do rebanho no período. */
    baixaDeAnimaisCentavos: number;
    /** Aquisição e custo anterior que voltaram a ser ativo com animais devolvidos pelo comprador. */
    estornoDeBaixaCentavos: number;
    /** Parte do custo que é da propriedade, sem rateio: entra no resultado, nunca é escondida. */
    naoAlocadoCentavos: number;
    /** Animais que saíram sem custo de aquisição nem custo anterior informado. */
    animaisSemBase: number;
  } & CompletudeResultado;
  /** Regime de caixa: dinheiro que entrou e saiu no período. Não é lucro. */
  caixa: { entradasCentavos: number; saidasCentavos: number; saldoCentavos: number };
  margemBruta: MargemBrutaApi;
}

export interface ResultadoDoAnimal extends CompletudeResultado {
  animalId: string;
  identificacao: string;
  /** "devolvido_fornecedor": saída por devolução da compra (não é venda; a receita é o valor recuperado). */
  saida: 'vendido' | 'morto' | 'descartado' | 'devolvido_fornecedor';
  data: string;
  lote: { id: string; nome: string } | null;
  /** `null`: venda sem negociação registrada (receita não informada). */
  receitaCentavos: number | null;
  /** Custo acumulado até a saída. */
  custo: Apuracao;
}

export interface ResultadoAgrupado extends CompletudeResultado {
  loteId: string | null;
  loteNome: string;
  animais: number;
  receitaCentavos: number;
  custo: Apuracao;
}

export interface RealizadoDoPeriodo {
  propriedadeId: string;
  dataInicial: string;
  dataFinal: string;
  animais: ResultadoDoAnimal[];
  porLote: ResultadoAgrupado[];
  /** Vendas, mortes e descartes (sem as devoluções ao fornecedor, que ficam em bloco próprio). */
  totais: ResultadoAgrupado & { vendidos: number; perdas: number; perdasCentavos: number };
  /** Animais devolvidos pelo comprador no período: voltam ao rebanho com o custo da saída. */
  devolucoesVenda: DevolucaoDeVendaRealizada[];
  /** Animais devolvidos ao fornecedor no período: diferença econômica, não lucro de venda. */
  devolucoesCompra: {
    animais: number;
    recuperadoCentavos: number;
    custo: Apuracao;
    /** Recuperado − custo acumulado até a saída; com custo parcial é um máximo. */
    diferencaCentavos: number;
  };
}

export interface DevolucaoDeVendaRealizada {
  animalId: string;
  identificacao: string;
  data: string;
  dataVenda: string;
  receitaOriginalCentavos: number;
  valorDevolvidoCentavos: number;
  /** Custo acumulado até a saída da venda, que volta ao rebanho com o animal. */
  custoQueVolta: Apuracao;
  /** Efeito no resultado da devolução: custo que volta − valor devolvido. */
  efeitoCentavos: number;
}

export interface IndicadorPorArroba {
  animais: number;
  gramas: number;
  receitaCentavos: number;
  custo: Apuracao;
  receitaPorArrobaCentavos: number | null;
  custoPorArrobaCentavos: number | null;
  margemPorArrobaCentavos: number | null;
  /** Vendas do período sem esse peso informado (ficaram de fora). */
  semPeso: number;
  estado: 'completo' | 'parcial' | 'indisponivel';
}

export interface CustoPorKgGanhoApi {
  centavosPorKg: number | null;
  animais: number;
  ganhoGramas: number;
  custo: Apuracao;
  estado: 'completo' | 'parcial' | 'indisponivel';
  /** Animais com custo no período mas sem duas pesagens no período. */
  semPesagens: number;
  /** Pesagens usadas, por método (balança, fita, visual), como registradas. */
  pesagensPorMetodo: Record<string, number>;
}

export interface IndicadoresDoPeriodo {
  propriedadeId: string;
  dataInicial: string;
  dataFinal: string;
  custoPorKgGanho: CustoPorKgGanhoApi;
  porLote: ({ loteId: string; loteNome: string } & CustoPorKgGanhoApi)[];
  carcaca: IndicadorPorArroba;
  vivo: IndicadorPorArroba;
  /** Devoluções de venda no período (os indicadores por @ usam as vendas como registradas). */
  devolucoesVendaNoPeriodo: number;
  leite: {
    litrosMilesimos: number;
    receitaCentavos: number;
    precoPorLitroCentavos: number | null;
    receitasSemLitros: number;
  };
}

export interface PontoDeEquilibrioApi {
  base: BaseDeUnidade;
  estado: 'calculado' | 'indisponivel';
  unidadesMilesimos: number | null;
  precoMedioCentavos: number | null;
  custoVariavelPorUnidadeCentavos: number | null;
  unidadesVendidasMilesimos: number;
  vendasIncluidas: number;
  vendasSemPeso: number;
  receitaDasUnidadesCentavos: number;
  fixosCentavos: number;
  variaveisCentavos: number;
  motivos: string[];
}

export type ChaveConciliacao =
  | 'venda_animais'
  | 'outras_receitas'
  | 'despesas'
  | 'insumos'
  | 'animais'
  | 'producao'
  | 'fora_resultado';

export interface LinhaConciliacao {
  chave: ChaveConciliacao;
  rotulo: string;
  competencia: {
    receitaCentavos: number;
    custoCentavos: number;
    /** Custos de valor desconhecido (fora da soma). */
    desconhecidos: number;
    /** Receitas sem valor registrado (fora da soma). */
    receitasDesconhecidas: number;
  };
  caixa: { entradasCentavos: number; saidasCentavos: number };
  /** (receita − custo) na competência menos (entradas − saídas) no caixa. */
  diferencaCentavos: number;
  explicacao: string;
}

export interface Conciliacao {
  propriedadeId: string;
  dataInicial: string;
  dataFinal: string;
  linhas: LinhaConciliacao[];
  totais: {
    /** Receitas e custos de valor conhecido; ver a completude abaixo. */
    resultadoCompetenciaCentavos: number;
    caixaLiquidoCentavos: number;
    diferencaCentavos: number;
  };
  custoDesconhecido: number;
  /** Completude da competência, pela mesma regra do resultado do período. */
  competencia: CompletudeResultado;
}

export interface ProjecaoApi {
  rotulo: string;
  alvo: { tipo: 'animal' | 'lote'; id: string; nome: string };
  animais: number;
  data: string;
  unidadePreco: BaseDeUnidade;
  receitaEsperadaCentavos: number;
  custoAcumulado: Apuracao;
  custosFuturosCentavos: number;
  resultadoProjetadoCentavos: number;
  estado: 'completo' | 'parcial';
  erros: string[];
}
