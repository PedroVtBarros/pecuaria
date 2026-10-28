import { z } from 'zod';
import { esquemaData, esquemaId } from '../rebanho/esquemas';

/** Resultado, indicadores, conciliação e projeção (entrega 4G). Tudo derivado; nada é gravado. */
const MENSAGEM_INTERVALO = 'A data inicial deve ser anterior ou igual à final.';
const periodo = {
  propriedadeId: esquemaId,
  dataInicial: esquemaData,
  dataFinal: esquemaData,
};
const conferir = (v: { dataInicial: string; dataFinal: string }) => v.dataInicial <= v.dataFinal;
const esquemaPeriodo = z.object(periodo).strict().refine(conferir, MENSAGEM_INTERVALO);
const pesoKg = z
  .number()
  .positive('O peso deve ser maior que zero.')
  .max(5000)
  .refine(
    (v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6,
    'Use no máximo três casas decimais.',
  )
  .nullable()
  .default(null);

export const BASES_UNIDADE = ['cabeca', 'kg_vivo', 'arroba_vivo', 'arroba_carcaca'] as const;

export const entradasResultado = {
  'resultado:periodo': esquemaPeriodo,
  'resultado:realizado': esquemaPeriodo,
  'resultado:indicadores': esquemaPeriodo,
  'resultado:conciliacao': esquemaPeriodo,
  'resultado:pontoEquilibrio': z
    .object({ ...periodo, base: z.enum(BASES_UNIDADE) })
    .strict()
    .refine(conferir, MENSAGEM_INTERVALO),
  'projecao:calcular': z
    .object({
      alvo: z.object({ tipo: z.enum(['animal', 'lote']), id: esquemaId }).strict(),
      data: esquemaData,
      unidadePreco: z.enum(BASES_UNIDADE),
      precoUnitarioCentavos: z.number().int().min(1, 'Informe o preço esperado.').max(100_000_000),
      pesoVivoKgPorAnimal: pesoKg,
      pesoCarcacaKgPorAnimal: pesoKg,
      custosFuturosCentavos: z.number().int().min(0).max(1_000_000_000_000).default(0),
    })
    .strict(),
} as const;

export type PeriodoValidado = z.output<(typeof entradasResultado)['resultado:periodo']>;
export type ProjecaoValidada = z.output<(typeof entradasResultado)['projecao:calcular']>;
