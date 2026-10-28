import type {
  TipoItemEstoque,
  TipoMovimentoEstoque,
  UnidadeEstoque,
  DestinoEstoque,
} from '@pecuaria/domain';
export interface ItemEstoque {
  id: string;
  propriedadeId: string;
  nome: string;
  tipo: TipoItemEstoque;
  unidadeBase: UnidadeEstoque;
  baseMateria: 'mn' | 'nao_aplicavel';
  controleLote: boolean;
  estoqueMinimo: number | null;
  produtoSanitarioId: string | null;
  ativo: boolean;
  observacoes: string | null;
}
export interface ResumoItemEstoque extends ItemEstoque {
  saldo: number;
  valorSaldoCentavos: number | null;
  valoracaoCompleta: boolean;
  abaixoMinimo: boolean;
}
export interface LoteEstoque {
  id: string;
  itemId: string;
  codigo: string;
  validade: string | null;
  saldo: number;
}
export interface MovimentoEstoque {
  id: string;
  itemId: string;
  loteEstoqueId: string | null;
  data: string;
  ordem: number;
  tipo: TipoMovimentoEstoque;
  quantidade: number;
  unidadeBase: UnidadeEstoque;
  custoEntradaCentavos: number | null;
  custoApropriadoCentavos: number | null;
  destino: DestinoEstoque | null;
  loteAnimalId: string | null;
  animalId: string | null;
  manejoSanitarioId: string | null;
  requisicaoId: string;
  documentoOrigemId: string | null;
  substituiId: string | null;
  motivo: string | null;
  observacao: string | null;
  canceladoEm: string | null;
}
export interface HistoricoEstoque {
  id: string;
  acao: string;
  motivo: string | null;
  ocorridoEm: string;
  dadosAnteriores: Record<string, unknown> | null;
  dadosNovos: Record<string, unknown> | null;
}
export interface DetalheItemEstoque {
  item: ResumoItemEstoque;
  lotes: LoteEstoque[];
  movimentos: MovimentoEstoque[];
  historico: HistoricoEstoque[];
}
export interface AlertasEstoque {
  antecedenciaValidadeDias: number;
  minimo: ResumoItemEstoque[];
  validade: {
    itemId: string;
    itemNome: string;
    unidadeBase: UnidadeEstoque;
    lote: LoteEstoque;
    situacao: 'vencido' | 'hoje' | 'proximo';
  }[];
}
export interface PreviaEstoque {
  saldo: number;
  valorSaldoCentavos: number | null;
  valoracaoCompleta: boolean;
  custoMovimentoCentavos: number | null;
  movimentosRecalculados: number;
}
export interface PaginaMovimentosEstoque {
  itens: MovimentoEstoque[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}
