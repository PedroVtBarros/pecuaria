import { z } from 'zod';
import {
  BASES_NUTRICIONAIS,
  FORMAS_OBTENCAO,
  NATUREZAS_NAO_QUANTIFICADO,
  ORIGENS_FONTE_CADASTRAVEIS,
  SEPARADORES_DECIMAIS,
  STATUS_REGISTRO,
  TAMANHO_MAXIMO_NUMERO_PUBLICADO,
  TAMANHO_MAXIMO_SIGNIFICADO,
  TIPOS_VALOR,
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
 * Registros de composição e valores (Fase 5A-3). O número chega como TEXTO publicado; o número
 * para cálculo é derivado no processo principal, com o separador decimal do registro (D5-3).
 * Aqui só se confere o formato básico do texto: a leitura completa é do domínio.
 */
const esquemaTextoPublicado = (rotulo: string) =>
  z
    .string()
    .trim()
    .min(1, `Informe ${rotulo} como publicado.`)
    .max(TAMANHO_MAXIMO_NUMERO_PUBLICADO, `${rotulo} publicado longo demais.`);

const esquemaOutrasCondicoes = z
  .record(
    z.string().trim().min(1, 'Nome da condição vazio.').max(60),
    z.string().trim().min(1, 'Valor da condição vazio.').max(200),
  )
  .refine((o) => Object.keys(o).length <= 20, 'No máximo 20 condições adicionais.')
  .nullable();

export const esquemaDadosRegistro = z
  .object({
    alimentoId: esquemaId,
    fonteId: esquemaId,
    referenciaLocal: textoOpcional(200, 'Página ou tabela'),
    idadeCorteDias: z
      .number()
      .int('Idade de corte em dias inteiros.')
      .min(1, 'Idade de corte inválida.')
      .max(3650, 'Idade de corte inválida.')
      .nullable(),
    classeIdadeFonte: textoOpcional(120, 'Classe de idade da fonte'),
    aditivoEnsilagem: textoOpcional(200, 'Aditivo de ensilagem'),
    regiao: textoOpcional(200, 'Região'),
    estacao: textoOpcional(120, 'Estação'),
    adubacao: textoOpcional(500, 'Adubação'),
    outrasCondicoes: esquemaOutrasCondicoes,
    nObservacoes: z
      .number()
      .int()
      .min(1, 'O número de observações deve ser maior que zero.')
      .nullable(),
    separadorDecimal: z.enum(SEPARADORES_DECIMAIS, 'Informe o separador decimal da fonte.'),
    dataAmostra: esquemaDataOpcional,
    identificacaoAmostra: textoOpcional(120, 'Identificação da amostra'),
    observacoes: textoOpcional(2000, 'Observações'),
  })
  .strict();

export const esquemaDadosValor = z
  .object({
    nutrienteId: esquemaId,
    valorPublicado: esquemaTextoPublicado('o valor'),
    unidade: z.enum(UNIDADES_NUTRICIONAIS, 'Selecione a unidade.'),
    base: z.enum(BASES_NUTRICIONAIS, 'Selecione a base.'),
    tipoValor: z.enum(TIPOS_VALOR, 'Selecione o tipo de valor.'),
    desvioPadraoPublicado: esquemaTextoPublicado('o desvio-padrão').nullable(),
    minimoPublicado: esquemaTextoPublicado('o mínimo').nullable(),
    maximoPublicado: esquemaTextoPublicado('o máximo').nullable(),
    nObservacoes: z
      .number()
      .int()
      .min(1, 'O número de observações deve ser maior que zero.')
      .nullable(),
    metodoAnaliticoFonte: textoOpcional(500, 'Método informado pela fonte'),
    formaObtencao: z
      .enum(FORMAS_OBTENCAO, 'Selecione a forma de obtenção.')
      .default('nao_informado'),
    descricaoObtencao: textoOpcional(500, 'Descrição da forma de obtenção').default(null),
    interpretacaoBase: textoOpcional(500, 'Interpretação da base').default(null),
    referenciaLocal: textoOpcional(200, 'Página ou tabela do valor'),
    observacao: textoOpcional(1000, 'Observação'),
  })
  .strict();

/** Valor não quantificado: texto como publicado e significado segundo a fonte, sem número. */
export const esquemaDadosValorNaoQuantificado = z
  .object({
    nutrienteId: esquemaId,
    textoPublicado: esquemaTextoPublicado('o texto'),
    natureza: z.enum(NATUREZAS_NAO_QUANTIFICADO, 'Selecione o que o texto significa na fonte.'),
    significadoFonte: textoObrigatorio(TAMANHO_MAXIMO_SIGNIFICADO, 'Significado segundo a fonte'),
    unidade: z.enum(UNIDADES_NUTRICIONAIS, 'Selecione a unidade.'),
    base: z.enum(BASES_NUTRICIONAIS, 'Selecione a base.'),
    tipoValor: z.enum(TIPOS_VALOR, 'Selecione o tipo de valor.'),
    metodoAnaliticoFonte: textoOpcional(500, 'Método informado pela fonte'),
    referenciaLocal: textoOpcional(200, 'Página ou tabela do valor'),
    observacao: textoOpcional(1000, 'Observação'),
  })
  .strict();

const esquemaResponsavel = textoObrigatorio(120, 'Nome de quem executa');

export const esquemaFiltrosRegistros = z
  .object({
    alimentoId: esquemaId.nullable().default(null),
    fonteId: esquemaId.nullable().default(null),
    status: z.enum(STATUS_REGISTRO).nullable().default(null),
    origem: z.enum(ORIGENS_FONTE_CADASTRAVEIS).nullable().default(null),
    /** Com propriedade: registros de fontes globais e os da propriedade. Sem: só os globais. */
    propriedadeId: esquemaId.nullable().default(null),
    /** Só laudos e medições da propriedade informada. */
    somenteDaPropriedade: z.boolean().default(false),
  })
  .strict()
  .refine((f) => !f.somenteDaPropriedade || f.propriedadeId !== null, {
    message: 'Informe a propriedade.',
    path: ['propriedadeId'],
  });

export const entradasComposicao = {
  'composicao:listar': esquemaFiltrosRegistros,
  'composicao:obter': z.object({ id: esquemaId }).strict(),
  'composicao:criar': z.object({ dados: esquemaDadosRegistro }).strict(),
  'composicao:atualizar': z.object({ id: esquemaId, dados: esquemaDadosRegistro }).strict(),
  'composicao:salvarValor': z
    .object({ registroId: esquemaId, valorId: esquemaId.nullable(), dados: esquemaDadosValor })
    .strict(),
  'composicao:removerValor': z.object({ registroId: esquemaId, valorId: esquemaId }).strict(),
  'composicao:salvarNaoQuantificado': z
    .object({
      registroId: esquemaId,
      valorId: esquemaId.nullable(),
      dados: esquemaDadosValorNaoQuantificado,
    })
    .strict(),
  'composicao:removerNaoQuantificado': z
    .object({ registroId: esquemaId, valorId: esquemaId })
    .strict(),
  'composicao:transcrever': z.object({ id: esquemaId, responsavel: esquemaResponsavel }).strict(),
  'composicao:devolver': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
  'composicao:conferir': z.object({ id: esquemaId, responsavel: esquemaResponsavel }).strict(),
  'composicao:rejeitar': z
    .object({ id: esquemaId, responsavel: esquemaResponsavel, motivo: esquemaMotivoObrigatorio })
    .strict(),
  'composicao:reabrir': z.object({ id: esquemaId }).strict(),
  'composicao:novaVersao': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
  'composicao:descartar': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
  /** Decisão do usuário sobre um vínculo de possível mesma origem (só uma vez). */
  'vinculoOrigem:decidir': z
    .object({
      registroId: esquemaId,
      vinculoId: esquemaId,
      decisao: z.enum(['confirmado', 'descartado'], 'Escolha confirmar ou descartar.'),
      responsavel: esquemaResponsavel,
      motivo: textoOpcional(1000, 'Motivo'),
    })
    .strict()
    .refine((d) => d.decisao !== 'descartado' || d.motivo !== null, {
      message: 'Informe o motivo do descarte.',
      path: ['motivo'],
    }),
} as const;

export type DadosRegistro = z.input<typeof esquemaDadosRegistro>;
export type DadosRegistroValidados = z.output<typeof esquemaDadosRegistro>;
export type DadosValor = z.input<typeof esquemaDadosValor>;
export type DadosValorValidados = z.output<typeof esquemaDadosValor>;
export type DadosValorNaoQuantificado = z.input<typeof esquemaDadosValorNaoQuantificado>;
export type DadosValorNaoQuantificadoValidados = z.output<typeof esquemaDadosValorNaoQuantificado>;
export type FiltrosRegistros = z.output<typeof esquemaFiltrosRegistros>;
