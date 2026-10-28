import type { CategoriaCusto, CriterioRateio } from '@pecuaria/domain';

/** Textos da entrega 4E: rateio de custos compartilhados e custo por lote e por animal. */
export const criteriosRateio: Record<CriterioRateio, string> = {
  cabecas: 'Cabeças (animais presentes na data-base)',
  animal_dias: 'Animal-dias (dias de cada animal no período)',
  peso: 'Peso (última pesagem real de cada animal)',
  manual: 'Manual (pesos informados por você)',
};
export const criteriosCurtos: Record<CriterioRateio, string> = {
  cabecas: 'Cabeças',
  animal_dias: 'Animal-dias',
  peso: 'Peso',
  manual: 'Manual',
};
export const ajudaCriterio: Record<CriterioRateio, string> = {
  cabecas:
    'Divide em proporção ao número de animais que estavam em cada lote ao fim do dia da data-base. Lote sem animais não recebe.',
  animal_dias:
    'Divide em proporção à soma dos dias que cada animal esteve no lote durante o período (o dia da entrada conta; o dia da saída ou da troca, não).',
  peso: 'Divide em proporção à soma do peso da última pesagem real dos animais de cada lote. Só vale se todos os animais tiverem pesagem dentro do limite de dias que você informar; o sistema não escolhe esse limite.',
  manual:
    'Você informa o peso relativo de cada lote ou animal. O sistema só faz a divisão exata do valor, sem estimar nada.',
};
export const categoriasCusto: Record<CategoriaCusto, string> = {
  aquisicao: 'Aquisição',
  custo_anterior: 'Custo anterior ao sistema',
  alimentacao: 'Alimentação',
  sanidade: 'Sanidade',
  mercadoria_vendida: 'Mercadoria vendida',
  outros: 'Outros',
};
export const origensCusto = {
  lancamento: 'Lançamento financeiro',
  consumo: 'Consumo de estoque',
  aquisicao: 'Compra do animal',
  custo_anterior: 'Custo anterior informado',
  manejo_sanitario: 'Registro sanitário',
} as const;
export const textoRateio =
  'Custos da propriedade (despesas e consumos de estoque sem lote nem animal) ficam "não alocados" até você ratear. O rateio guarda só os pesos de cada destino: o valor de cada um é recalculado a partir do valor atual do custo, então correções no financeiro ou no estoque continuam fechando. Revisar cria uma versão nova e cancela a anterior; nada é apagado.';
export const textoCustos =
  'Custo apropriado (não é caixa nem lucro). Custo lançado a um lote é dividido por igual, dia a dia, entre os animais que estavam nele naquele dia; custo da propriedade só chega a lotes e animais por rateio. Custo desconhecido nunca vira zero e deixa o total parcial.';
export const valorDesconhecido = 'Custo desconhecido';
