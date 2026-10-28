import type { BaseDeUnidade } from '@pecuaria/domain';

/** Textos da entrega 4G: resultado, indicadores, conciliação e projeção. */
export const textoCompetencia =
  'Regime de competência: receitas e custos pela data do fato. O custo inclui o consumo de estoque, as despesas (inclusive as não alocadas) e a aquisição dos animais que saíram do rebanho no período. Venda a prazo ou ainda não recebida conta como receita (recebimento é caixa). Custo desconhecido deixa o resultado parcial "no máximo"; venda sem receita registrada, "no mínimo"; sem nenhuma receita conhecida, o resultado fica não apurado.';
export const textoCaixa =
  'Regime de caixa: o dinheiro que entrou e saiu no período, pela data do pagamento. Não é lucro e não é somado com a competência.';
export const textoRealizado =
  'Resultado realizado por animal: receita da venda menos o custo acumulado até a saída. Morte entra como perda. Venda sem negociação registrada fica com a receita "não registrada", nunca zero.';
export const textoMargemBruta =
  'Margem bruta = receita − custos variáveis. Depende da classificação em fixo ou variável: custo sem classificação nunca entra em silêncio e deixa a margem parcial.';
export const textoEquilibrio =
  'Ponto de equilíbrio = custos fixos ÷ (preço médio − custo variável por unidade), na base escolhida. Só é calculado com todos os custos classificados e conhecidos e com o peso da base em todas as vendas do período.';
export const textoConciliacao =
  'Explica por que o caixa do período é diferente do resultado: cada linha compara o que é custo ou receita na competência com o que entrou ou saiu do caixa. As diferenças somadas fecham exatamente a diferença total.';
export const textoProjecao =
  'Projeção por premissas suas, não é dado apurado. Nada é gravado e o valor não entra em nenhum total. O sistema não estima ganho de peso, preço nem peso de carcaça.';
export const basesUnidade: Record<BaseDeUnidade, string> = {
  cabeca: 'Por cabeça',
  kg_vivo: 'Por kg de peso vivo',
  arroba_vivo: 'Por @ de peso vivo (15 kg)',
  arroba_carcaca: 'Por @ de carcaça (15 kg)',
};
export const unidadesCurtas: Record<BaseDeUnidade, string> = {
  cabeca: 'cabeça(s)',
  kg_vivo: 'kg vivos',
  arroba_vivo: '@ vivas',
  arroba_carcaca: '@ de carcaça',
};
export const saidasAnimal = {
  vendido: 'Vendido',
  morto: 'Morte (perda)',
  descartado: 'Descarte',
  devolvido_fornecedor: 'Devolvido ao fornecedor',
} as const;
