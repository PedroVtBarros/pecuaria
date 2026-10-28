import { z } from 'zod';
import { CRITERIOS_RATEIO } from '@pecuaria/domain';
import { esquemaData, esquemaId, esquemaMotivoObrigatorio } from '../rebanho/esquemas';

/**
 * Rateio de custos compartilhados e custo por lote e animal (entrega 4E). O rateio guarda pesos
 * (nunca valores): o valor de cada destino é calculado a cada leitura a partir do valor atual da
 * origem. O servidor sempre recalcula os pesos dos critérios automáticos; só o critério manual
 * aceita pesos digitados.
 */
const intervaloValido = (v: { dataInicial?: string | undefined; dataFinal?: string | undefined }) =>
  !v.dataInicial || !v.dataFinal || v.dataInicial <= v.dataFinal;
const MENSAGEM_INTERVALO = 'A data inicial deve ser anterior ou igual à final.';

const esquemaPesoManual = z
  .object({
    tipo: z.enum(['lote', 'animal']),
    id: esquemaId,
    peso: z
      .number()
      .int('O peso deve ser um número inteiro.')
      .min(1, 'O peso deve ser maior que zero.')
      .max(1_000_000_000),
  })
  .strict();

const camposDoRateio = {
  propriedadeId: esquemaId,
  origemTipo: z.enum(['lancamento', 'movimentacao_estoque']),
  origemId: esquemaId,
  criterio: z.enum(CRITERIOS_RATEIO, 'Selecione o critério.'),
  /** Dia de referência de cabeças e peso (animais presentes ao fim do dia). */
  dataBase: esquemaData,
  periodoInicio: esquemaData.nullable().default(null),
  periodoFim: esquemaData.nullable().default(null),
  /** Idade máxima da pesagem aceita no critério "peso", escolhida pelo usuário. */
  idadeMaximaPesagemDias: z.number().int().min(0).max(3650).nullable().default(null),
  manual: z.array(esquemaPesoManual).max(500).default([]),
};
function conferirCampos(
  v: {
    criterio: string;
    periodoInicio: string | null;
    periodoFim: string | null;
    idadeMaximaPesagemDias: number | null;
    manual: unknown[];
  },
  ctx: z.RefinementCtx,
) {
  if (v.criterio === 'animal_dias' && (!v.periodoInicio || !v.periodoFim))
    ctx.addIssue({
      code: 'custom',
      message: 'Animal-dias exige o período.',
      path: ['periodoInicio'],
    });
  if (v.periodoInicio && v.periodoFim && v.periodoInicio > v.periodoFim)
    ctx.addIssue({ code: 'custom', message: MENSAGEM_INTERVALO, path: ['periodoFim'] });
  if (v.criterio === 'peso' && v.idadeMaximaPesagemDias === null)
    ctx.addIssue({
      code: 'custom',
      message: 'Informe a idade máxima da pesagem, em dias.',
      path: ['idadeMaximaPesagemDias'],
    });
  if (v.criterio === 'manual' && v.manual.length === 0)
    ctx.addIssue({
      code: 'custom',
      message: 'Informe os pesos de cada destino.',
      path: ['manual'],
    });
}

export const entradasRateio = {
  'rateio:pendentes': z.object({ propriedadeId: esquemaId }).strict(),
  'rateio:previa': z.object(camposDoRateio).strict().superRefine(conferirCampos),
  'rateio:criar': z
    .object({ ...camposDoRateio, requisicaoId: esquemaId, motivo: esquemaMotivoObrigatorio })
    .strict()
    .superRefine(conferirCampos),
  'rateio:revisar': z
    .object({
      id: esquemaId,
      requisicaoId: esquemaId,
      criterio: camposDoRateio.criterio,
      dataBase: camposDoRateio.dataBase,
      periodoInicio: camposDoRateio.periodoInicio,
      periodoFim: camposDoRateio.periodoFim,
      idadeMaximaPesagemDias: camposDoRateio.idadeMaximaPesagemDias,
      manual: camposDoRateio.manual,
      motivo: esquemaMotivoObrigatorio,
    })
    .strict()
    .superRefine(conferirCampos),
  'rateio:cancelar': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
  'rateio:listar': z
    .object({ propriedadeId: esquemaId, incluirCancelados: z.boolean().default(false) })
    .strict(),
  'rateio:obter': z.object({ id: esquemaId }).strict(),
  'custo:resumo': z
    .object({
      propriedadeId: esquemaId,
      dataInicial: esquemaData.optional(),
      dataFinal: esquemaData.optional(),
    })
    .strict()
    .refine(intervaloValido, MENSAGEM_INTERVALO),
  'custo:lote': z
    .object({
      loteId: esquemaId,
      dataInicial: esquemaData.optional(),
      dataFinal: esquemaData.optional(),
    })
    .strict()
    .refine(intervaloValido, MENSAGEM_INTERVALO),
  'custo:animais': z
    .object({
      propriedadeId: esquemaId,
      loteId: esquemaId.optional(),
      busca: z.string().trim().max(80).optional(),
      dataInicial: esquemaData.optional(),
      dataFinal: esquemaData.optional(),
      pagina: z.number().int().min(1).default(1),
      tamanhoPagina: z.number().int().min(1).max(200).default(50),
    })
    .strict()
    .refine(intervaloValido, MENSAGEM_INTERVALO),
  'custo:animal': z
    .object({
      animalId: esquemaId,
      dataInicial: esquemaData.optional(),
      dataFinal: esquemaData.optional(),
    })
    .strict()
    .refine(intervaloValido, MENSAGEM_INTERVALO),
} as const;

export type DadosRateioValidados = z.output<(typeof entradasRateio)['rateio:criar']>;
export type PreviaRateioValidada = z.output<(typeof entradasRateio)['rateio:previa']>;
export type RevisaoRateioValidada = z.output<(typeof entradasRateio)['rateio:revisar']>;
export type FiltrosCustoAnimaisValidados = z.output<(typeof entradasRateio)['custo:animais']>;
