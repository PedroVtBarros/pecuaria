import type {
  Apuracao,
  ComportamentoCusto,
  SituacaoLancamento,
  UnidadeEstoque,
} from '@pecuaria/domain';

/** Tipos da entrega 4D: compra de insumos, consumos apropriados, custo sanitário e pendências. */

export interface ItemDaCompra {
  id: string;
  estoqueItemId: string;
  estoqueItemNome: string;
  quantidade: number;
  unidadeBase: UnidadeEstoque;
  valorCentavos: number;
  movimentacaoId: string;
  cancelado: boolean;
}

export interface CompraInsumosResumo {
  lancamentoId: string;
  data: string;
  descricao: string;
  documentoNumero: string | null;
  pessoaNome: string | null;
  valorTotalCentavos: number;
  quantidadeItens: number;
  somaItensCentavos: number;
  /** Total do lançamento menos a soma dos itens: frete ou diferença a classificar, nunca lançada sozinha. */
  diferencaCentavos: number;
  /** `compra_estoque`: criada pela nota; `manual`: lançamento antigo ligado depois (vínculo retroativo). */
  origem: 'compra_estoque' | 'manual';
  cancelada: boolean;
}

export interface PaginaCompras {
  itens: CompraInsumosResumo[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}

export interface CompraInsumosDetalhe extends CompraInsumosResumo {
  itens: ItemDaCompra[];
  situacaoFinanceira: SituacaoLancamento;
  saldoEmAbertoCentavos: number | null;
  pagoCentavos: number;
  /** Vencimento e parcelas ficam no lançamento financeiro ligado. */
  condicaoPagamento: 'a_vista' | 'parcelado' | 'nao_informada';
}

export interface EntradaSemDocumentoApi {
  movimentacaoId: string;
  data: string;
  estoqueItemId: string;
  estoqueItemNome: string;
  quantidade: number;
  unidadeBase: UnidadeEstoque;
  /** `null`: custo de entrada desconhecido; não pode ser ligada a um valor até ser corrigida. */
  custoEntradaCentavos: number | null;
  /** Aponta para um documento que não existe (dado antigo). */
  documentoOrfao: boolean;
}

export interface PendenciasEstoqueFinanceiro {
  propriedadeId: string;
  entradasSemDocumento: { total: number; itens: EntradaSemDocumentoApi[] };
  /** Compras para estoque lançadas sem entrada de estoque ligada. */
  comprasSemEntrada: {
    id: string;
    data: string;
    descricao: string;
    valorCentavos: number;
  }[];
  /** Notas cujo total difere da soma dos itens. */
  diferencas: {
    id: string;
    data: string;
    descricao: string;
    totalCentavos: number;
    somaItensCentavos: number;
  }[];
  consumosSemCusto: number;
  /** Total de pendências de qualquer tipo; zero significa "nada a conferir". */
  total: number;
}

export interface ConsumoApropriado {
  movimentacaoId: string;
  data: string;
  tipo: string;
  estoqueItemId: string;
  estoqueItemNome: string;
  quantidade: number;
  unidadeBase: UnidadeEstoque;
  destino: 'propriedade' | 'lote' | 'animal';
  destinoDescricao: string;
  manejoSanitarioId: string | null;
  /** `null`: custo desconhecido (valoração incompleta). Nunca exibido como zero. */
  custoApropriadoCentavos: number | null;
}

export interface PaginaConsumos {
  itens: ConsumoApropriado[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}

export interface TotalApropriado {
  chave: string;
  rotulo: string;
  apuracao: Apuracao;
}

export interface ResumoConsumos {
  propriedadeId: string;
  total: Apuracao;
  porDestino: TotalApropriado[];
  porItem: (TotalApropriado & { classificacao: ComportamentoCusto })[];
  porTipo: TotalApropriado[];
  /** Consumo da propriedade sem lote nem animal: custo compartilhado, "não alocado" até o rateio (4E). */
  naoAlocado: Apuracao;
}

export interface CustoSanitarioRegistro {
  manejoId: string;
  data: string;
  apuracao: Apuracao;
  estoque: {
    quantidade: number;
    conhecidoCentavos: number;
    desconhecidos: number;
    baixas: { id: string; custoApropriadoCentavos: number | null }[];
  };
  servicos: { id: string; valorCentavos: number; descricao: string }[];
  servicosCentavos: number;
  informadoCentavos: number | null;
  informadoContado: boolean;
  /** Valor digitado no registro que ficou de fora para não contar o mesmo custo duas vezes. */
  informadoNaoContadoCentavos: number | null;
  porAnimal: { animalId: string; identificacao: string; valorCentavos: number }[];
  observacao: string;
}

export interface ClassificacaoDeOrigem {
  escopo: 'estoque_item' | 'aquisicao_animal' | 'custo_anterior';
  referenciaId: string | null;
  comportamento: ComportamentoCusto;
}
