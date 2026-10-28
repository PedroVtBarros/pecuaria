import { z } from 'zod';
import {
  BASES_NUTRICIONAIS,
  CLASSES_ALIMENTO,
  DIRECOES_CONSERVADORAS,
  FORMAS_CONSERVACAO,
  fundamentacaoCompleta,
  GRUPOS_NUTRIENTE,
  ORIGENS_FONTE_CADASTRAVEIS,
  PADRAO_CODIGO,
  problemasDaFonte,
  SITUACOES_FUNDAMENTACAO,
  UNIDADES_NUTRICIONAIS,
} from '@pecuaria/domain';
import {
  esquemaDataOpcional,
  esquemaId,
  esquemaMotivoObrigatorio,
  textoObrigatorio,
  textoOpcional,
} from '../rebanho/esquemas';

/**
 * Banco de alimentos (Fase 5A): fontes, definições de nutrientes e alimentos. Os textos são
 * limpos (espaços extras), mas nenhum número de composição passa por aqui: valores entram pelos
 * esquemas de registro, como publicados (D5-3).
 */
const esquemaCodigo = z
  .string()
  .trim()
  .regex(
    PADRAO_CODIGO,
    'Código: comece com letra e use só letras sem acento, dígitos e "_" (até 30).',
  );

export const esquemaDadosFonte = z
  .object({
    origem: z.enum(ORIGENS_FONTE_CADASTRAVEIS, 'Selecione a origem.'),
    codigo: esquemaCodigo.nullable(),
    titulo: textoObrigatorio(300, 'Título'),
    autores: textoOpcional(1000, 'Autores'),
    ano: z
      .number()
      .int('Ano inválido.')
      .min(1800, 'Ano inválido.')
      .max(2200, 'Ano inválido.')
      .nullable(),
    edicaoVersao: textoOpcional(120, 'Edição ou versão'),
    instituicaoEditora: textoOpcional(200, 'Instituição ou editora'),
    isbnDoiUrl: textoOpcional(300, 'ISBN, DOI ou URL'),
    dataAcesso: esquemaDataOpcional,
    experimentoOrigem: textoOpcional(200, 'Experimento de origem'),
    laboratorio: textoOpcional(200, 'Laboratório'),
    numeroLaudo: textoOpcional(100, 'Número do laudo'),
    dataLaudo: esquemaDataOpcional,
    fabricante: textoOpcional(200, 'Fabricante'),
    registroProduto: textoOpcional(100, 'Registro do produto'),
    metodoMedicao: textoOpcional(2000, 'Método de medição'),
    limitacoesMedicao: textoOpcional(2000, 'Limitações do método'),
    propriedadeId: esquemaId.nullable(),
    observacoes: textoOpcional(2000, 'Observações'),
  })
  .strict()
  .superRefine((d, ctx) => {
    for (const p of problemasDaFonte(d))
      ctx.addIssue({ code: 'custom', message: p.mensagem, path: [p.campo] });
  });

export const esquemaDadosNutriente = z
  .object({
    codigo: esquemaCodigo,
    nome: textoObrigatorio(120, 'Nome'),
    grupo: z.enum(GRUPOS_NUTRIENTE, 'Selecione o grupo.'),
    unidadeReferencia: z.enum(UNIDADES_NUTRICIONAIS, 'Selecione a unidade.'),
    baseReferencia: z.enum(BASES_NUTRICIONAIS, 'Selecione a base.'),
    direcaoConservadora: z.enum(DIRECOES_CONSERVADORAS, 'Selecione a direção.'),
    metodoAnalitico: textoOpcional(500, 'Método analítico'),
    situacaoFundamentacao: z.enum(SITUACOES_FUNDAMENTACAO),
    fundamentacaoFonteId: esquemaId.nullable(),
    fundamentacaoReferencia: textoOpcional(200, 'Página ou tabela da fundamentação'),
    descricao: textoOpcional(1000, 'Descrição'),
    ativo: z.boolean(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.situacaoFundamentacao === 'fundamentada' && !fundamentacaoCompleta(d))
      ctx.addIssue({
        code: 'custom',
        message:
          'Definição fundamentada exige método analítico, fonte cadastrada e página ou tabela.',
        path: ['situacaoFundamentacao'],
      });
    if ((d.fundamentacaoFonteId === null) !== (d.fundamentacaoReferencia === null))
      ctx.addIssue({
        code: 'custom',
        message: 'Informe a fonte e a página ou tabela da fundamentação juntas.',
        path: ['fundamentacaoReferencia'],
      });
  });

export const esquemaDadosAlimento = z
  .object({
    nome: textoObrigatorio(160, 'Nome'),
    especie: textoOpcional(160, 'Espécie'),
    cultivar: textoOpcional(120, 'Cultivar'),
    partePlanta: textoOpcional(120, 'Parte da planta'),
    formaConservacao: z.enum(FORMAS_CONSERVACAO, 'Selecione a forma de conservação.'),
    processamento: textoOpcional(120, 'Processamento'),
    classe: z.enum(CLASSES_ALIMENTO, 'Selecione a classe.'),
    comercial: z.boolean(),
    observacoes: textoOpcional(2000, 'Observações'),
  })
  .strict();

export const esquemaFiltrosAlimentos = z
  .object({
    busca: z.string().trim().max(120).default(''),
    formaConservacao: z.enum(FORMAS_CONSERVACAO).nullable().default(null),
    classe: z.enum(CLASSES_ALIMENTO).nullable().default(null),
    incluirExcluidos: z.boolean().default(false),
  })
  .strict();

export const entradasAlimentos = {
  'fonte:listar': z
    .object({
      origem: z.enum(ORIGENS_FONTE_CADASTRAVEIS).nullable().default(null),
      /** Com propriedade: fontes globais e as da propriedade. Sem: só as globais (D5-9). */
      propriedadeId: esquemaId.nullable().default(null),
      incluirExcluidas: z.boolean().default(false),
    })
    .strict(),
  'fonte:obter': z.object({ id: esquemaId }).strict(),
  'fonte:criar': z.object({ dados: esquemaDadosFonte }).strict(),
  'fonte:atualizar': z
    .object({ id: esquemaId, dados: esquemaDadosFonte, motivo: esquemaMotivoObrigatorio })
    .strict(),
  'fonte:excluir': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
  'nutriente:listar': z.object({ incluirInativos: z.boolean().default(false) }).strict(),
  'nutriente:criar': z.object({ dados: esquemaDadosNutriente }).strict(),
  'nutriente:atualizar': z
    .object({ id: esquemaId, dados: esquemaDadosNutriente, motivo: esquemaMotivoObrigatorio })
    .strict(),
  'alimento:listar': esquemaFiltrosAlimentos,
  /** Registros de fontes globais e, com propriedade, os laudos e medições dela (D5-9). */
  'alimento:obter': z
    .object({ id: esquemaId, propriedadeId: esquemaId.nullable().default(null) })
    .strict(),
  'alimento:criar': z.object({ dados: esquemaDadosAlimento }).strict(),
  'alimento:atualizar': z
    .object({ id: esquemaId, dados: esquemaDadosAlimento, motivo: esquemaMotivoObrigatorio })
    .strict(),
  'alimento:excluir': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
  'vinculoAlimento:obter': z.object({ itemId: esquemaId }).strict(),
  /** `alimentoId` nulo desfaz o vínculo. */
  'vinculoAlimento:definir': z
    .object({ itemId: esquemaId, alimentoId: esquemaId.nullable() })
    .strict(),
} as const;

export type DadosFonte = z.input<typeof esquemaDadosFonte>;
export type DadosFonteValidados = z.output<typeof esquemaDadosFonte>;
export type DadosNutriente = z.input<typeof esquemaDadosNutriente>;
export type DadosNutrienteValidados = z.output<typeof esquemaDadosNutriente>;
export type DadosAlimento = z.input<typeof esquemaDadosAlimento>;
export type DadosAlimentoValidados = z.output<typeof esquemaDadosAlimento>;
export type FiltrosAlimentos = z.output<typeof esquemaFiltrosAlimentos>;
export type FiltrosFontes = z.output<(typeof entradasAlimentos)['fonte:listar']>;
