import { z } from 'zod';
import {
  ATIVIDADES,
  CENTAVOS_MAXIMO,
  CRITERIOS_ALOCACAO,
  METODOS_PESAGEM,
  UNIDADES_PRECO,
} from '@pecuaria/domain';
import {
  esquemaData,
  esquemaDadosAnimal,
  esquemaId,
  esquemaMotivoObrigatorio,
  esquemaPesoVivoKg,
  textoObrigatorio,
  textoOpcional,
} from '../rebanho/esquemas';
import { esquemaCentavosPositivos, esquemaCondicaoPagamento } from './esquemas';

/**
 * Compra e venda de animais (entrega 4C). O valor total é a verdade gravada; o preço unitário é
 * conferido contra ele. Pesos chegam em quilos (até três casas) e são gravados em gramas inteiras.
 */
const valorManual = z
  .number()
  .int('O valor deve estar em centavos inteiros.')
  .min(0, 'O valor não pode ser negativo.')
  .max(CENTAVOS_MAXIMO, 'Valor acima do limite permitido.')
  .nullable();

const camposComuns = {
  requisicaoId: esquemaId,
  propriedadeId: esquemaId,
  data: esquemaData,
  pessoaId: esquemaId.nullable(),
  atividade: z.enum(ATIVIDADES, 'Selecione a atividade.'),
  observacoes: textoOpcional(1000, 'Observações'),
  valorTotalCentavos: esquemaCentavosPositivos,
  unidadePreco: z.enum(UNIDADES_PRECO, 'Selecione a unidade do preço.'),
  precoUnitarioCentavos: esquemaCentavosPositivos.nullable(),
  /** Padrão: o que a unidade do preço indica. O usuário pode trocar, conscientemente. */
  criterio: z.enum(CRITERIOS_ALOCACAO, 'Selecione o critério de alocação.'),
  condicao: esquemaCondicaoPagamento,
};

const esquemaAnimalDaCompra = z
  .object({
    dados: esquemaDadosAnimal,
    pesoVivoKg: esquemaPesoVivoKg.nullable(),
    metodoPesagem: z.enum(METODOS_PESAGEM).nullable(),
    pesoCarcacaKg: esquemaPesoVivoKg.nullable(),
    valorManualCentavos: valorManual,
  })
  .strict()
  .refine((a) => (a.pesoVivoKg === null) === (a.metodoPesagem === null), {
    message: 'Informe o método da pesagem junto com o peso de entrada.',
    path: ['metodoPesagem'],
  });

const esquemaAnimalDaVenda = z
  .object({
    animalId: esquemaId,
    pesoVivoKg: esquemaPesoVivoKg.nullable(),
    pesoCarcacaKg: esquemaPesoVivoKg.nullable(),
    valorManualCentavos: valorManual,
  })
  .strict();

/** Onde o animal volta ao desfazer a saída. Nada é decidido sozinho. */
const destinoDaReversao = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('origem') }).strict(),
  z.object({ tipo: z.literal('reabrir_origem') }).strict(),
  z.object({ tipo: z.literal('lote'), loteId: esquemaId }).strict(),
  z.object({ tipo: z.literal('sem_lote') }).strict(),
]);

const destinoDoCustoAnterior = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('animal'), animalId: esquemaId }).strict(),
  z
    .object({
      tipo: z.literal('lote'),
      loteId: esquemaId,
      /** O rateio igualitário entre os animais do lote só vale com esta confirmação explícita. */
      confirmarRateioIgual: z.boolean(),
    })
    .strict(),
]);

export const entradasNegociacao = {
  'negociacao:listar': z
    .object({
      propriedadeId: esquemaId,
      tipo: z.enum(['compra', 'venda']).optional(),
      pessoaId: esquemaId.optional(),
      dataInicial: esquemaData.optional(),
      dataFinal: esquemaData.optional(),
      incluirCanceladas: z.boolean().default(false),
      pagina: z.number().int().min(1).default(1),
      tamanhoPagina: z.number().int().min(1).max(200).default(50),
    })
    .strict()
    .refine(
      (v) => !v.dataInicial || !v.dataFinal || v.dataInicial <= v.dataFinal,
      'A data inicial deve ser anterior ou igual à final.',
    ),
  'negociacao:obter': z.object({ id: esquemaId }).strict(),
  'negociacao:registrarCompra': z
    .object({
      ...camposComuns,
      /** Lote em que todos os animais entram (opcional). */
      loteId: esquemaId.nullable(),
      animais: z.array(esquemaAnimalDaCompra).min(1, 'Informe ao menos um animal.').max(500),
    })
    .strict(),
  'negociacao:registrarVenda': z
    .object({
      ...camposComuns,
      animais: z.array(esquemaAnimalDaVenda).min(1, 'Selecione ao menos um animal.').max(500),
    })
    .strict(),
  'negociacao:cancelar': z
    .object({
      id: esquemaId,
      motivo: esquemaMotivoObrigatorio,
      /** Venda: onde os animais voltam (D-H). Compra: ignorado. Padrão: o lote de origem. */
      destino: destinoDaReversao.default({ tipo: 'origem' }),
    })
    .strict(),
  'animal:desfazerSaida': z
    .object({
      id: esquemaId,
      motivo: esquemaMotivoObrigatorio,
      /**
       * Onde o animal volta. `origem`: o lote de onde saiu, se ainda ativo; `reabrir_origem`: reabre
       * esse lote; `lote`: outro lote ativo; `sem_lote`. Nada é decidido sozinho.
       */
      destino: destinoDaReversao,
    })
    .strict(),
  'custoAnterior:listar': z
    .object({
      propriedadeId: esquemaId,
      animalId: esquemaId.optional(),
      loteId: esquemaId.optional(),
      incluirCancelados: z.boolean().default(false),
    })
    .strict(),
  'custoAnterior:registrar': z
    .object({
      requisicaoId: esquemaId,
      propriedadeId: esquemaId,
      destino: destinoDoCustoAnterior,
      valorCentavos: esquemaCentavosPositivos,
      dataReferencia: esquemaData,
      descricao: textoObrigatorio(200, 'Descrição'),
      origemInformacao: textoObrigatorio(200, 'Origem da informação'),
      justificativa: textoObrigatorio(500, 'Justificativa'),
      /**
       * Confirma que o valor não repete custos já registrados no sistema para o mesmo destino
       * até a data de referência (o sistema lista o que já existe antes de pedir isto).
       */
      confirmarSemDuplicidade: z.boolean(),
    })
    .strict(),
  'custoAnterior:cancelar': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
  'custoAnimal:obter': z.object({ animalId: esquemaId }).strict(),
} as const;

export type DadosCompraAnimais = z.input<(typeof entradasNegociacao)['negociacao:registrarCompra']>;
export type DadosCompraAnimaisValidados = z.output<
  (typeof entradasNegociacao)['negociacao:registrarCompra']
>;
export type DadosVendaAnimais = z.input<(typeof entradasNegociacao)['negociacao:registrarVenda']>;
export type DadosVendaAnimaisValidados = z.output<
  (typeof entradasNegociacao)['negociacao:registrarVenda']
>;
export type FiltrosNegociacaoValidados = z.output<(typeof entradasNegociacao)['negociacao:listar']>;
export type DesfazerSaidaValidado = z.output<(typeof entradasNegociacao)['animal:desfazerSaida']>;
export type CustoAnteriorValidado = z.output<
  (typeof entradasNegociacao)['custoAnterior:registrar']
>;
