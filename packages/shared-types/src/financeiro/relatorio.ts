import { z } from 'zod';
import type { Apuracao } from '@pecuaria/domain';
import { esquemaData, esquemaId } from '../rebanho/esquemas';

/**
 * Relatórios gerenciais e exportação em CSV e PDF (entrega 4H). O modelo é neutro: os mesmos
 * dados viram CSV e HTML (PDF) no processo principal. Dinheiro em centavos; `null` é ausente.
 */
export const TIPOS_RELATORIO = [
  'resultado',
  'custos',
  'animal',
  'lote',
  'lancamentos',
  'fluxo',
  'conciliacao',
  'conferencia',
] as const;
export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number];
export const FORMATOS_RELATORIO = ['csv', 'pdf'] as const;
export type FormatoRelatorio = (typeof FORMATOS_RELATORIO)[number];

const esquemaFiltros = z
  .object({
    propriedadeId: esquemaId,
    dataInicial: esquemaData.nullable().default(null),
    dataFinal: esquemaData.nullable().default(null),
    loteId: esquemaId.nullable().default(null),
    animalId: esquemaId.nullable().default(null),
    /** O documento (CPF/CNPJ) das contrapartes só sai com esta opção marcada. */
    incluirDocumentos: z.boolean().default(false),
  })
  .strict()
  .refine((v) => !v.dataInicial || !v.dataFinal || v.dataInicial <= v.dataFinal, {
    message: 'A data inicial deve ser anterior ou igual à final.',
  });

export const entradasRelatorio = {
  'relatorio:montar': z.object({ tipo: z.enum(TIPOS_RELATORIO), filtros: esquemaFiltros }).strict(),
  'relatorio:exportar': z
    .object({
      tipo: z.enum(TIPOS_RELATORIO),
      formato: z.enum(FORMATOS_RELATORIO),
      filtros: esquemaFiltros,
    })
    .strict(),
} as const;

export type FiltrosRelatorioValidados = z.output<typeof esquemaFiltros>;

export type TipoDeColuna = 'texto' | 'data' | 'dinheiro' | 'apuracao' | 'quantidade' | 'inteiro';
export interface ColunaRelatorio {
  rotulo: string;
  tipo: TipoDeColuna;
}
/** `{ apuracao }` para colunas do tipo "apuracao"; número em centavos para "dinheiro". */
export type CelulaRelatorio = string | number | null | { apuracao: Apuracao };
export interface IndicadorRelatorio {
  rotulo: string;
  valor: CelulaRelatorio;
  tipo: TipoDeColuna;
  observacao?: string;
}
export interface SecaoRelatorio {
  titulo: string;
  descricao?: string;
  indicadores?: IndicadorRelatorio[];
  colunas?: ColunaRelatorio[];
  linhas?: CelulaRelatorio[][];
  vazio?: string;
}
export type VisaoDoRelatorio =
  | 'Caixa'
  | 'Custo apropriado'
  | 'Resultado'
  | 'Caixa e resultado'
  | 'Lançamentos'
  | 'Conferência'
  | 'Conciliação';
export interface Relatorio {
  titulo: string;
  visao: VisaoDoRelatorio;
  propriedade: string;
  periodo: string;
  geradoEm: string;
  avisos: string[];
  secoes: SecaoRelatorio[];
  /** Nome de arquivo sugerido, sem extensão. */
  nomeArquivo: string;
}
