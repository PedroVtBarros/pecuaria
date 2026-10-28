/** Textos da entrega 4F: produção própria. */
export const tiposCentro = {
  volumoso: 'Volumoso (capineira, silagem, feno)',
  outro: 'Outro',
} as const;
export const situacoesCentro = { aberto: 'Aberto', encerrado: 'Encerrado' } as const;
export const textoProducao =
  'Um centro de produção reúne o custo de produzir um item do estoque (ex.: silagem): despesas lançadas e insumos do estoque consumidos. Enquanto estão no centro, esses custos não são de lote nem de animal e não ficam "não alocados". Ao encerrar, você informa a quantidade colhida e o custo total vira o custo de entrada no estoque; ele chega aos animais quando o volumoso é consumido.';
export const textoCustoDesconhecido =
  'Há consumo com custo desconhecido: a entrada de produção ficará com custo desconhecido (nunca zero). Você pode completar o custo no estoque, reabrir e encerrar de novo.';
