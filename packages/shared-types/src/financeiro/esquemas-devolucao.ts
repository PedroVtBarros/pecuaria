import { z } from 'zod';
import {
  esquemaData,
  esquemaId,
  esquemaMotivoObrigatorio,
  textoOpcional,
} from '../rebanho/esquemas';
import { esquemaCentavosPositivos, esquemaCondicaoPagamento } from './esquemas';

/**
 * Devolução de animais (revisão final da Fase 4). O valor de cada animal é informado pelo usuário
 * (a tela pode sugerir o valor original, mas nunca o confirma sozinha). A condição vale só para o
 * restante depois da compensação do que estava em aberto na negociação original: reembolso ao
 * comprador (venda devolvida) ou valor a recuperar do fornecedor (compra devolvida).
 */
const esquemaItemDevolucao = z
  .object({
    negociacaoItemId: esquemaId,
    valorCentavos: esquemaCentavosPositivos,
  })
  .strict();

const camposDevolucao = {
  negociacaoId: esquemaId,
  data: esquemaData,
  itens: z
    .array(esquemaItemDevolucao)
    .min(1, 'Selecione ao menos um animal.')
    .max(500, 'No máximo 500 animais por devolução.'),
  /** Venda devolvida: lote para onde os animais voltam; `null` = sem lote. Compra: ignorado. */
  loteRetornoId: esquemaId.nullable(),
};

export const esquemaDadosDevolucao = z
  .object({
    requisicaoId: esquemaId,
    ...camposDevolucao,
    condicaoRestante: esquemaCondicaoPagamento,
    observacoes: textoOpcional(1000, 'Observações'),
  })
  .strict()
  .refine((d) => new Set(d.itens.map((i) => i.negociacaoItemId)).size === d.itens.length, {
    message: 'Há animal repetido na devolução.',
    path: ['itens'],
  });

export const entradasDevolucao = {
  'devolucao:prever': z
    .object(camposDevolucao)
    .strict()
    .refine((d) => new Set(d.itens.map((i) => i.negociacaoItemId)).size === d.itens.length, {
      message: 'Há animal repetido na devolução.',
      path: ['itens'],
    }),
  'devolucao:registrar': esquemaDadosDevolucao,
  'devolucao:obter': z.object({ id: esquemaId }).strict(),
  'devolucao:cancelar': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
} as const;

export type DadosDevolucao = z.input<typeof esquemaDadosDevolucao>;
export type DadosDevolucaoValidados = z.output<typeof esquemaDadosDevolucao>;
export type PrevisaoDevolucaoValidada = z.output<(typeof entradasDevolucao)['devolucao:prever']>;
