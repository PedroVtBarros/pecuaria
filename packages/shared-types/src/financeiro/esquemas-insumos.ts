import { z } from 'zod';
import { ATIVIDADES, CENTAVOS_MAXIMO, UNIDADES_ESTOQUE } from '@pecuaria/domain';
import { esquemaQuantidadeEstoque } from '../estoque/esquemas';
import {
  esquemaData,
  esquemaId,
  esquemaMotivoObrigatorio,
  textoOpcional,
} from '../rebanho/esquemas';
import {
  esquemaCentavosPositivos,
  esquemaCondicaoPagamento,
  esquemaParcelaPlanejada,
} from './esquemas';

/**
 * Compra de insumos ligada ao estoque (entrega 4D). Cada item cria uma entrada de compra no
 * estoque; o valor da nota é o dono do dinheiro e o estoque é dono da quantidade e do custo
 * médio. Nenhuma despesa de resultado nasce da entrada nem do consumo.
 */
const centavosNaoNegativos = z
  .number()
  .int('O valor deve estar em centavos inteiros.')
  .min(0, 'O valor não pode ser negativo.')
  .max(CENTAVOS_MAXIMO, 'Valor acima do limite permitido.');

const esquemaLoteFisico = z
  .discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('existente'), id: esquemaId }).strict(),
    z
      .object({
        tipo: z.literal('novo'),
        codigo: z.string().trim().min(1, 'Informe o código do lote.').max(100),
        validade: esquemaData.nullable(),
      })
      .strict(),
  ])
  .nullable();

const esquemaItemDaCompra = z
  .object({
    estoqueItemId: esquemaId,
    quantidade: esquemaQuantidadeEstoque,
    unidadeBase: z.enum(UNIDADES_ESTOQUE),
    /** Valor do item sem o frete; 0 é um custo conhecido (ex.: bonificação), não "desconhecido". */
    valorCentavos: centavosNaoNegativos,
    /** Obrigatório quando o item controla lote físico. */
    loteFisico: esquemaLoteFisico,
  })
  .strict();

const filtrosConsumo = {
  propriedadeId: esquemaId,
  dataInicial: esquemaData.optional(),
  dataFinal: esquemaData.optional(),
  destino: z.enum(['propriedade', 'lote', 'animal']).optional(),
  loteId: esquemaId.optional(),
  animalId: esquemaId.optional(),
  estoqueItemId: esquemaId.optional(),
  tipo: z.enum(['saida_consumo', 'saida_perda', 'ajuste_saida', 'saida_venda']).optional(),
};
const intervaloValido = (v: { dataInicial?: string | undefined; dataFinal?: string | undefined }) =>
  !v.dataInicial || !v.dataFinal || v.dataInicial <= v.dataFinal;

export const entradasInsumos = {
  'compraInsumo:listar': z
    .object({
      propriedadeId: esquemaId,
      incluirCanceladas: z.boolean().default(false),
      pagina: z.number().int().min(1).default(1),
      tamanhoPagina: z.number().int().min(1).max(200).default(50),
    })
    .strict(),
  'compraInsumo:obter': z.object({ lancamentoId: esquemaId }).strict(),
  'compraInsumo:registrar': z
    .object({
      requisicaoId: esquemaId,
      propriedadeId: esquemaId,
      data: esquemaData,
      pessoaId: esquemaId.nullable(),
      /** Categoria de despesa com tratamento "estoque" (compra de insumo). */
      categoriaId: esquemaId,
      documentoNumero: textoOpcional(60, 'Número do documento'),
      atividade: z.enum(ATIVIDADES, 'Selecione a atividade.'),
      observacoes: textoOpcional(1000, 'Observações'),
      /** Frete da nota, rateado entre os itens em proporção ao valor e somado ao custo de entrada. */
      freteCentavos: centavosNaoNegativos.default(0),
      condicao: esquemaCondicaoPagamento,
      itens: z.array(esquemaItemDaCompra).min(1, 'Informe ao menos um item.').max(100),
    })
    .strict(),
  'compraInsumo:corrigirItem': z
    .object({
      itemId: esquemaId,
      requisicaoId: esquemaId,
      /** Valor novo do item (sem frete rateado anterior: é o valor final do item). */
      valorCentavos: centavosNaoNegativos,
      quantidade: esquemaQuantidadeEstoque,
      /** Parcelas novas do que ainda está em aberto, quando o total da nota muda. */
      novasParcelas: z.array(esquemaParcelaPlanejada).max(120).default([]),
      motivo: esquemaMotivoObrigatorio,
    })
    .strict(),
  'compraInsumo:cancelar': z
    .object({ lancamentoId: esquemaId, motivo: esquemaMotivoObrigatorio })
    .strict(),
  'compraInsumo:vincularEntrada': z
    .object({ movimentacaoId: esquemaId, lancamentoId: esquemaId })
    .strict(),
  'compraInsumo:criarDaEntrada': z
    .object({
      requisicaoId: esquemaId,
      movimentacaoId: esquemaId,
      categoriaId: esquemaId,
      pessoaId: esquemaId.nullable(),
      documentoNumero: textoOpcional(60, 'Número do documento'),
      atividade: z.enum(ATIVIDADES, 'Selecione a atividade.'),
      condicao: esquemaCondicaoPagamento,
    })
    .strict(),
  'auditoria:pendencias': z.object({ propriedadeId: esquemaId }).strict(),
  'consumo:listar': z
    .object({
      ...filtrosConsumo,
      pagina: z.number().int().min(1).default(1),
      tamanhoPagina: z.number().int().min(1).max(200).default(50),
    })
    .strict()
    .refine(intervaloValido, 'A data inicial deve ser anterior ou igual à final.'),
  'consumo:resumo': z
    .object(filtrosConsumo)
    .strict()
    .refine(intervaloValido, 'A data inicial deve ser anterior ou igual à final.'),
  'custoSanitario:obter': z.object({ manejoId: esquemaId }).strict(),
  'custoSanitario:lancarServico': z
    .object({
      requisicaoId: esquemaId,
      manejoId: esquemaId,
      /** Categoria de despesa com tratamento "resultado" (serviço sanitário). */
      categoriaId: esquemaId,
      pessoaId: esquemaId.nullable(),
      dataCompetencia: esquemaData,
      valorTotalCentavos: esquemaCentavosPositivos,
      descricao: z.string().trim().min(1, 'Descreva o serviço.').max(200),
      documentoNumero: textoOpcional(60, 'Número do documento'),
      condicao: esquemaCondicaoPagamento,
    })
    .strict(),
  'classificacaoOrigem:listar': z.object({ propriedadeId: esquemaId }).strict(),
  'classificacaoOrigem:definir': z
    .object({
      propriedadeId: esquemaId,
      escopo: z.enum(['estoque_item', 'aquisicao_animal', 'custo_anterior']),
      /** Item de estoque quando o escopo é `estoque_item`; nulo nos demais. */
      referenciaId: esquemaId.nullable(),
      comportamento: z.enum(['variavel', 'fixo', 'nao_classificado']),
    })
    .strict()
    .refine((v) => (v.escopo === 'estoque_item') === (v.referenciaId !== null), {
      message: 'Só o escopo "item de estoque" tem referência.',
      path: ['referenciaId'],
    }),
} as const;

export type DadosCompraInsumos = z.input<(typeof entradasInsumos)['compraInsumo:registrar']>;
export type DadosCompraInsumosValidados = z.output<
  (typeof entradasInsumos)['compraInsumo:registrar']
>;
export type FiltrosConsumoValidados = z.output<(typeof entradasInsumos)['consumo:resumo']>;
export type FiltrosConsumoPaginadosValidados = z.output<(typeof entradasInsumos)['consumo:listar']>;
export type CorrecaoItemValidada = z.output<(typeof entradasInsumos)['compraInsumo:corrigirItem']>;
export type CompraDaEntradaValidada = z.output<
  (typeof entradasInsumos)['compraInsumo:criarDaEntrada']
>;
export type ServicoSanitarioValidado = z.output<
  (typeof entradasInsumos)['custoSanitario:lancarServico']
>;
