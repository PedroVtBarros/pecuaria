import { z } from 'zod';
import { esquemaId, esquemaPesoVivoKg, textoObrigatorio, textoOpcional } from '../rebanho/esquemas';

/*
 * Fase 6A-7: entrada do cálculo de exigências (BR-CORTE 2023). As listas repetem as do motor
 * (`@pecuaria/nutrition-engine`, GRUPOS_GENETICOS, CLASSES_SEXUAIS e SISTEMAS); o serviço do main
 * confere a igualdade em teste. Nada é gravado: as exigências são calculadas na hora (A4).
 */
export const GRUPOS_EXIGENCIA = ['zebuino', 'cruzado_corte', 'cruzado_leite'] as const;
export const SEXOS_EXIGENCIA = ['macho_nao_castrado', 'macho_castrado', 'femea'] as const;
export const SISTEMAS_EXIGENCIA = ['confinamento', 'pasto'] as const;
/** De onde vem o CMS: informado pelo usuário ou previsto por uma equação escolhida. */
export const FONTES_CMS = [
  'informado',
  'confinamento',
  'concentrado',
  'pasto',
  'terminacao_intensiva_pasto',
] as const;

export type GrupoExigencia = (typeof GRUPOS_EXIGENCIA)[number];
export type SexoExigencia = (typeof SEXOS_EXIGENCIA)[number];
export type SistemaExigencia = (typeof SISTEMAS_EXIGENCIA)[number];
export type FonteCmsExigencia = (typeof FONTES_CMS)[number];

function numero(minimo: number, maximo: number, rotulo: string) {
  return z
    .number({
      error: (problema) =>
        problema.input === null || problema.input === undefined
          ? `${rotulo} é obrigatório.`
          : `${rotulo} deve ser um número.`,
    })
    .finite(`${rotulo} deve ser um número.`)
    .min(minimo, `${rotulo} deve ser no mínimo ${minimo.toLocaleString('pt-BR')}.`)
    .max(maximo, `${rotulo} deve ser no máximo ${maximo.toLocaleString('pt-BR')}.`);
}

const esquemaCms = z.discriminatedUnion('fonte', [
  z
    .object({
      fonte: z.literal('informado'),
      cmsKgDia: numero(0, 50, 'CMS informado').refine((v) => v > 0, 'CMS deve ser maior que zero.'),
    })
    .strict(),
  z.object({ fonte: z.literal('confinamento') }).strict(),
  z
    .object({ fonte: z.literal('concentrado'), ncPctMs: numero(0, 100, 'Teor de concentrado') })
    .strict(),
  z
    .object({ fonte: z.literal('pasto'), cmssKgDia: numero(0, 50, 'Consumo de suplemento') })
    .strict(),
  z.object({ fonte: z.literal('terminacao_intensiva_pasto') }).strict(),
]);

export const esquemaEntradaExigencias = z
  .object({
    grupo: z.enum(GRUPOS_EXIGENCIA, 'Escolha o grupo genético.'),
    sexo: z.enum(SEXOS_EXIGENCIA, 'Escolha a classe sexual.'),
    sistema: z.enum(SISTEMAS_EXIGENCIA, 'Escolha o sistema de produção.'),
    pcKg: esquemaPesoVivoKg,
    // GMD **desejado** (planejado), informado pelo usuário; não é o GMD observado nas pesagens
    // (a comparação previsto × observado é a 6E). Negativo é aceito para o motor responder
    // "fora do escopo" (P-01).
    gmdKgDia: numero(-5, 5, 'Ganho médio diário desejado'),
    cms: esquemaCms,
  })
  .strict();
export type EntradaExigencias = z.infer<typeof esquemaEntradaExigencias>;

/*
 * Fase 6B-3: avaliação de dieta com perfis gravados (Fase 5D). Os nomes dos tipos de quantidade
 * repetem `TIPOS_QUANTIDADE` do motor; o serviço do main confere a igualdade em teste.
 */
export const TIPOS_QUANTIDADE_DIETA = [
  'oferecido',
  'consumo_observado',
  'consumo_assumido_sem_sobras',
] as const;
export type TipoQuantidadeDieta = (typeof TIPOS_QUANTIDADE_DIETA)[number];

const esquemaItemDieta = z
  .object({
    perfilId: esquemaId,
    /** Por cabeça e dia, na base indicada (matéria natural ou seca). */
    quantidadeKgDia: numero(0, 200, 'Quantidade do alimento'),
    base: z.enum(['mn', 'ms'], 'Escolha a base da quantidade (MN ou MS).'),
    /** Só no consumo observado: sobras medidas do mesmo alimento, na mesma base. */
    sobrasKgDia: numero(0, 200, 'Sobras').nullable(),
  })
  .strict();

export const esquemaEntradaAvaliacaoDieta = z
  .object({
    animal: esquemaEntradaExigencias.omit({ cms: true }),
    /** CMS previsto pelo BR-CORTE, mostrado à parte (C-6B-01); nunca o CMS informado. */
    cmsPrevisto: esquemaCms.refine(
      (c) => c.fonte !== 'informado',
      'O CMS previsto vem de equação.',
    ),
    dieta: z
      .object({
        tipo: z.enum(TIPOS_QUANTIDADE_DIETA, 'Escolha o que a quantidade representa.'),
        itens: z.array(esquemaItemDieta).min(1, 'Inclua ao menos um alimento.').max(30),
      })
      .strict()
      .superRefine((d, ctx) => {
        d.itens.forEach((i, k) => {
          const caminho = ['itens', k, 'sobrasKgDia'];
          if (d.tipo === 'consumo_observado' && i.sobrasKgDia === null)
            ctx.addIssue({ code: 'custom', path: caminho, message: 'Informe as sobras medidas.' });
          if (d.tipo !== 'consumo_observado' && i.sobrasKgDia !== null)
            ctx.addIssue({
              code: 'custom',
              path: caminho,
              message: 'Sobras só entram no consumo observado.',
            });
          if (i.sobrasKgDia !== null && i.sobrasKgDia > i.quantidadeKgDia)
            ctx.addIssue({
              code: 'custom',
              path: caminho,
              message: 'As sobras não podem passar do oferecido.',
            });
        });
      }),
  })
  .strict();
export type EntradaAvaliacaoDieta = z.infer<typeof esquemaEntradaAvaliacaoDieta>;

/*
 * Fase 6B-4: avaliação nutricional imutável, gravada só por ação do usuário. O main recalcula a
 * avaliação a partir da entrada; resultado vindo do renderer nunca é aceito.
 */
export const entradasNutricao = {
  'nutricao:calcularExigencias': esquemaEntradaExigencias,
  'nutricao:avaliarDieta': esquemaEntradaAvaliacaoDieta,
  'nutricao:perfisParaDieta': z.object({}).strict(),
  'nutricao:registrarAvaliacao': z
    .object({
      entrada: esquemaEntradaAvaliacaoDieta,
      /** SHA-256 do retrato exibido na simulação; o main recalcula e compara (D-6B4-02). */
      conteudoSha256Exibido: z
        .string()
        .regex(/^[0-9a-f]{64}$/, 'Faça a avaliação antes de gravar.'),
      rotulo: textoObrigatorio(120, 'Nome da avaliação'),
      observacao: textoOpcional(1000, 'Observação'),
      responsavel: textoObrigatorio(120, 'Nome de quem executa'),
    })
    .strict(),
  'nutricao:listarAvaliacoes': z.object({}).strict(),
  'nutricao:obterAvaliacao': z.object({ id: esquemaId }).strict(),
  /** D-6B4-03: anulação com motivo, em registro separado; o retrato não muda. */
  'nutricao:anularAvaliacao': z
    .object({
      id: esquemaId,
      motivo: textoObrigatorio(1000, 'Motivo da anulação'),
      responsavel: textoObrigatorio(120, 'Nome de quem executa'),
    })
    .strict(),
};
