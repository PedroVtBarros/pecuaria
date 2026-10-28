import {
  formatarCentavos,
  type Atividade,
  type ComportamentoLancamento,
  type CondicaoPagamento,
  type GrupoCategoria,
  type NaturezaFinanceira,
  type PapelPessoa,
  type SituacaoLancamento,
  type SituacaoParcela,
  type TratamentoCategoria,
  type UnidadeQuantidadeLancamento,
} from '@pecuaria/domain';

/** Rótulos do módulo financeiro. As frases de cada tela ficam nos componentes (ARQUITETURA D30). */
export const naturezas: Record<NaturezaFinanceira, string> = {
  despesa: 'Despesa',
  receita: 'Receita',
};
export const gruposCategoria: Record<GrupoCategoria, string> = {
  animais: 'Animais',
  alimentacao: 'Alimentação',
  sanidade: 'Sanidade',
  mao_de_obra: 'Mão de obra',
  infraestrutura: 'Infraestrutura',
  impostos: 'Impostos e taxas',
  leite: 'Leite',
  producao_propria: 'Produção própria',
  outros: 'Outros',
};
export const tratamentos: Record<TratamentoCategoria, string> = {
  resultado: 'Entra no resultado do período',
  estoque: 'Compra para estoque (vira custo no consumo)',
  ativo_animal: 'Aquisição de animal (vira custo na saída do animal)',
  fora_resultado: 'Fora do resultado (transferências, empréstimos)',
};
export const tratamentosCurtos: Record<TratamentoCategoria, string> = {
  resultado: 'Resultado',
  estoque: 'Estoque',
  ativo_animal: 'Animais',
  fora_resultado: 'Fora do resultado',
};
export const comportamentos: Record<ComportamentoLancamento, string> = {
  variavel: 'Variável',
  fixo: 'Fixo',
  nao_classificado: 'Não classificado',
  nao_se_aplica: 'Não se aplica',
};
export const atividades: Record<Atividade, string> = {
  corte: 'Corte',
  leite: 'Leite',
  compartilhada: 'Compartilhada (corte e leite)',
  nao_definida: 'Não definida',
};
export const papeis: Record<PapelPessoa, string> = {
  fornecedor: 'Fornecedor',
  comprador: 'Comprador',
  frigorifico: 'Frigorífico',
  laticinio: 'Laticínio',
  prestador: 'Prestador de serviço',
  outro: 'Outro',
};
export const condicoes: Record<CondicaoPagamento, string> = {
  a_vista: 'À vista',
  parcelado: 'Parcelado',
  nao_informada: 'Não informada (pendente de definição)',
};
export const unidadesQuantidade: Record<UnidadeQuantidadeLancamento, string> = {
  cabeca: 'cabeças',
  kg: 'kg (mercadoria)',
  kg_vivo: 'kg de peso vivo',
  kg_carcaca: 'kg de carcaça',
  arroba_vivo: '@ de peso vivo',
  arroba_carcaca: '@ de carcaça',
  litro: 'litros',
};
export const situacoes: Record<SituacaoLancamento, string> = {
  pendente_definicao: 'Pendente de definição',
  a_vencer: 'A vencer',
  vencido: 'Vencido',
  parcialmente_pago: 'Parcialmente pago',
  quitado: 'Quitado',
  cancelado: 'Cancelado',
};
export function situacaoDoLancamento(
  situacao: SituacaoLancamento,
  natureza: NaturezaFinanceira,
  compensadoCentavos = 0,
): string {
  // Quitado em parte por compensação de devolução: não foi tudo pago nem recebido em dinheiro.
  if (situacao === 'quitado' && compensadoCentavos > 0) return 'Liquidado com compensação';
  if (natureza === 'receita') {
    if (situacao === 'parcialmente_pago') return 'Parcialmente recebido';
    if (situacao === 'quitado') return 'Recebido';
  }
  return situacoes[situacao];
}
export const tomDaSituacao: Record<
  SituacaoLancamento,
  'neutro' | 'marca' | 'sucesso' | 'alerta' | 'perigo'
> = {
  pendente_definicao: 'alerta',
  a_vencer: 'neutro',
  vencido: 'perigo',
  parcialmente_pago: 'marca',
  quitado: 'sucesso',
  cancelado: 'neutro',
};
export const situacoesParcela: Record<SituacaoParcela, string> = {
  aberta: 'Aberta',
  parcial: 'Parcial',
  paga: 'Paga',
  compensada: 'Compensada',
  atrasada: 'Atrasada',
};

/** Rótulos dos três valores que nunca se misturam (D-C). */
export function rotulosDosValores(natureza: NaturezaFinanceira) {
  return natureza === 'receita'
    ? { operacao: 'Valor da operação', saldo: 'A receber', efetivo: 'Recebido' }
    : { operacao: 'Valor da operação', saldo: 'A pagar', efetivo: 'Pago' };
}

/** Dinheiro para exibir. Ausente aparece como "A definir", nunca como R$ 0,00. */
export function moeda(centavos: number | null): string {
  return centavos === null ? 'A definir' : formatarCentavos(centavos);
}

/**
 * Finalidade do lote → atividade sugerida (D-A). É só uma sugestão mostrada ao usuário:
 * nada é classificado sem a confirmação dele.
 */
export function sugerirAtividade(finalidade: string): Atividade | null {
  if (finalidade === 'cria' || finalidade === 'recria' || finalidade === 'engorda') return 'corte';
  if (finalidade === 'lactacao' || finalidade === 'seca') return 'leite';
  return null;
}
export const regraAtividadePorFinalidade =
  'Cria, recria e engorda sugerem corte; lactação e seca sugerem leite; "outro" não tem sugestão.';

export const avisoGeral =
  'Relatório gerencial de uso próprio: não substitui contabilidade nem calcula impostos. Competência (quando o fato ocorreu), caixa (quando o dinheiro entrou ou saiu) e custo apropriado são coisas diferentes e aparecem separadas.';

export const granularidades: Record<'dia' | 'semana' | 'mes', string> = {
  dia: 'Por dia',
  semana: 'Por semana',
  mes: 'Por mês',
};
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Rótulo de uma linha do fluxo: dia = data; semana = "semana de dd/mm"; mês = "out/2026". */
export function rotuloDoPeriodo(chave: string, granularidade: 'dia' | 'semana' | 'mes'): string {
  if (granularidade === 'mes') {
    const [ano, mes] = chave.split('-');
    return `${MESES[Number(mes) - 1] ?? mes}/${ano}`;
  }
  const [ano, mes, dia] = chave.split('-');
  return granularidade === 'dia' ? `${dia}/${mes}/${ano}` : `Semana de ${dia}/${mes}/${ano}`;
}

/** Textos fixos das visões do caixa. Realizado e previsto nunca são somados. */
export const textoRealizado =
  'Pagamentos e recebimentos efetivos, pela data em que o dinheiro saiu ou entrou. É movimento de caixa: não é lucro nem resultado.';
export const textoPrevisto =
  'Saldo das parcelas ainda em aberto, pelo vencimento. É uma previsão, nunca soma com o realizado. Lançamentos sem condição de pagamento definida ficam de fora, porque o saldo deles é desconhecido.';
