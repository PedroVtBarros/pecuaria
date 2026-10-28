import { z } from 'zod';
import { ATIVIDADES, GRANULARIDADES_FLUXO, NATUREZAS_FINANCEIRAS } from '@pecuaria/domain';
import { esquemaData, esquemaId, textoOpcional } from '../rebanho/esquemas';

const intervaloValido = (v: { dataInicial?: string | undefined; dataFinal?: string | undefined }) =>
  !v.dataInicial || !v.dataFinal || v.dataInicial <= v.dataFinal;
const MENSAGEM_INTERVALO = 'A data inicial deve ser anterior ou igual à final.';

/** Filtros comuns às consultas de caixa (pagamentos e parcelas em aberto). */
const filtrosComuns = {
  propriedadeId: esquemaId,
  natureza: z.enum(NATUREZAS_FINANCEIRAS).optional(),
  categoriaId: esquemaId.optional(),
  atividade: z.enum(ATIVIDADES).optional(),
  loteId: esquemaId.optional(),
  pessoaId: esquemaId.optional(),
};

export const esquemaFiltrosFluxo = z
  .object({
    ...filtrosComuns,
    dataInicial: esquemaData,
    dataFinal: esquemaData,
    granularidade: z.enum(GRANULARIDADES_FLUXO).default('mes'),
  })
  .strict()
  .refine(intervaloValido, MENSAGEM_INTERVALO);

export const esquemaFiltrosContas = z
  .object({
    propriedadeId: esquemaId,
    /** Obrigatória: "a pagar" e "a receber" nunca vêm somadas. */
    natureza: z.enum(NATUREZAS_FINANCEIRAS),
    categoriaId: esquemaId.optional(),
    pessoaId: esquemaId.optional(),
    atividade: z.enum(ATIVIDADES).optional(),
    /** Vencimento. */
    dataInicial: esquemaData.optional(),
    dataFinal: esquemaData.optional(),
    situacao: z.enum(['atrasada', 'a_vencer']).optional(),
    busca: z.string().trim().max(100).optional(),
    pagina: z.number().int().min(1).default(1),
    tamanhoPagina: z.number().int().min(1).max(200).default(50),
  })
  .strict()
  .refine(intervaloValido, MENSAGEM_INTERVALO);

export const esquemaFiltrosPainel = z
  .object({ propriedadeId: esquemaId, dataInicial: esquemaData, dataFinal: esquemaData })
  .strict()
  .refine(intervaloValido, MENSAGEM_INTERVALO);

const comportamentoEscolhido = z.enum(['variavel', 'fixo', 'nao_classificado']);

export const entradasCaixa = {
  'fluxo:obter': esquemaFiltrosFluxo,
  'conta:listar': esquemaFiltrosContas,
  'painel:obter': esquemaFiltrosPainel,
  'classificacao:resumo': z
    .object({
      propriedadeId: esquemaId,
      dataInicial: esquemaData.optional(),
      dataFinal: esquemaData.optional(),
    })
    .strict()
    .refine(intervaloValido, MENSAGEM_INTERVALO),
  'classificacao:previa': z.object({ propriedadeId: esquemaId, categoriaId: esquemaId }).strict(),
  'classificacao:aplicarCategoria': z
    .object({
      propriedadeId: esquemaId,
      categoriaId: esquemaId,
      /** O que o usuário viu na prévia: se algo mudou, a operação é recusada. */
      comportamento: z.enum(['variavel', 'fixo'], 'Selecione fixo ou variável.'),
      quantidadeEsperada: z.number().int().min(1),
      motivo: textoOpcional(500, 'Motivo'),
    })
    .strict(),
  'classificacao:definirLancamento': z
    .object({
      id: esquemaId,
      comportamento: comportamentoEscolhido,
      motivo: textoOpcional(500, 'Motivo'),
    })
    .strict(),
} as const;

export type FiltrosFluxo = z.input<typeof esquemaFiltrosFluxo>;
export type FiltrosFluxoValidados = z.output<typeof esquemaFiltrosFluxo>;
export type FiltrosContas = z.input<typeof esquemaFiltrosContas>;
export type FiltrosContasValidados = z.output<typeof esquemaFiltrosContas>;
export type FiltrosPainelValidados = z.output<typeof esquemaFiltrosPainel>;
