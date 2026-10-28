import { z } from 'zod';
import {
  ATIVIDADES,
  CENTAVOS_MAXIMO,
  COMPORTAMENTOS_CUSTO,
  GRUPOS_CATEGORIA,
  NATUREZAS_FINANCEIRAS,
  PAPEIS_PESSOA,
  PARCELAS_MAXIMO,
  TRATAMENTOS_CATEGORIA,
  UNIDADES_QUANTIDADE_LANCAMENTO,
} from '@pecuaria/domain';
import {
  esquemaData,
  esquemaId,
  esquemaMotivoObrigatorio,
  textoObrigatorio,
  textoOpcional,
} from '../rebanho/esquemas';
import { esquemaQuantidadeEstoque } from '../estoque/esquemas';

const SITUACOES_LANCAMENTO = [
  'pendente_definicao',
  'a_vencer',
  'vencido',
  'parcialmente_pago',
  'quitado',
  'cancelado',
] as const;

/** Dinheiro sempre em centavos inteiros e positivos. Nunca número fracionário. */
export const esquemaCentavosPositivos = z
  .number()
  .int('O valor deve estar em centavos inteiros.')
  .min(1, 'O valor deve ser maior que zero.')
  .max(CENTAVOS_MAXIMO, 'Valor acima do limite permitido.');
const idOpcional = esquemaId.nullable();
const motivoOpcional = textoOpcional(500, 'Motivo');

export const esquemaDadosPessoaComercial = z
  .object({
    nome: textoObrigatorio(120, 'Nome'),
    papel: z.enum(PAPEIS_PESSOA, 'Selecione o papel.'),
    documento: textoOpcional(30, 'Documento'),
    observacoes: textoOpcional(1000, 'Observações'),
    ativo: z.boolean().default(true),
  })
  .strict();

export const esquemaDadosCategoriaFinanceira = z
  .object({
    nome: textoObrigatorio(120, 'Nome'),
    natureza: z.enum(NATUREZAS_FINANCEIRAS, 'Selecione a natureza.'),
    grupo: z.enum(GRUPOS_CATEGORIA, 'Selecione o grupo.'),
    tratamento: z.enum(TRATAMENTOS_CATEGORIA, 'Selecione o tratamento.'),
    /** Só para despesa; em receita é sempre "não se aplica". */
    comportamentoCusto: z.enum(COMPORTAMENTOS_CUSTO).default('nao_classificado'),
    ativa: z.boolean().default(true),
  })
  .strict();

const esquemaDestino = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('propriedade') }).strict(),
  z.object({ tipo: z.literal('nenhum') }).strict(),
  z.object({ tipo: z.literal('lote'), loteId: esquemaId }).strict(),
  z.object({ tipo: z.literal('animal'), animalId: esquemaId }).strict(),
]);

export const esquemaParcelaPlanejada = z
  .object({ vencimento: esquemaData, valorCentavos: esquemaCentavosPositivos })
  .strict();

const esquemaPagamentoImediato = z
  .object({ data: esquemaData, forma: textoOpcional(40, 'Forma de pagamento') })
  .strict();

/**
 * Condição de pagamento (D-C). "Não informada" deixa o lançamento pendente de definição
 * financeira: não cria parcela nem pagamento e não significa ausência de obrigação.
 */
export const esquemaCondicaoPagamento = z.discriminatedUnion('tipo', [
  z
    .object({
      tipo: z.literal('a_vista'),
      /** Padrão: a data de competência. */
      vencimento: esquemaData.nullable().default(null),
      /** Só existe pagamento se o usuário o informar aqui; o padrão é não pago. */
      pagamento: esquemaPagamentoImediato.nullable().default(null),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('parcelado'),
      parcelas: z
        .array(esquemaParcelaPlanejada)
        .min(2, 'Parcelado exige ao menos duas parcelas.')
        .max(PARCELAS_MAXIMO),
    })
    .strict(),
  z.object({ tipo: z.literal('nao_informada') }).strict(),
]);

/** Condição que define o pagamento de um lançamento que estava pendente. */
export const esquemaCondicaoDefinida = z.discriminatedUnion('tipo', [
  esquemaCondicaoPagamento.options[0],
  esquemaCondicaoPagamento.options[1],
]);

const esquemaQuantidadeLancamento = z
  .object({ valor: esquemaQuantidadeEstoque, unidade: z.enum(UNIDADES_QUANTIDADE_LANCAMENTO) })
  .strict();

const camposEditaveisDoLancamento = {
  categoriaId: esquemaId,
  pessoaId: idOpcional,
  dataCompetencia: esquemaData,
  descricao: textoObrigatorio(200, 'Descrição'),
  documentoNumero: textoOpcional(60, 'Número do documento'),
  atividade: z.enum(ATIVIDADES, 'Selecione a atividade.'),
  destino: esquemaDestino,
  quantidade: esquemaQuantidadeLancamento.nullable(),
  /** `null` copia a classificação padrão da categoria no momento da criação (D-E). */
  comportamentoCusto: z.enum(COMPORTAMENTOS_CUSTO).nullable(),
  observacoes: textoOpcional(1000, 'Observações'),
};

export const esquemaDadosLancamento = z
  .object({
    propriedadeId: esquemaId,
    valorTotalCentavos: esquemaCentavosPositivos,
    condicao: esquemaCondicaoPagamento,
    ...camposEditaveisDoLancamento,
  })
  .strict();

/** Edição de um lançamento: valor e condição de pagamento têm operações próprias. */
export const esquemaEdicaoLancamento = z.object(camposEditaveisDoLancamento).strict();

export const esquemaDadosPagamento = z
  .object({
    data: esquemaData,
    valorCentavos: esquemaCentavosPositivos,
    forma: textoOpcional(40, 'Forma de pagamento'),
    observacao: textoOpcional(500, 'Observação'),
  })
  .strict();

export const esquemaFiltrosLancamento = z
  .object({
    propriedadeId: esquemaId,
    dataInicial: esquemaData.optional(),
    dataFinal: esquemaData.optional(),
    natureza: z.enum(NATUREZAS_FINANCEIRAS).optional(),
    categoriaId: esquemaId.optional(),
    atividade: z.enum(ATIVIDADES).optional(),
    loteId: esquemaId.optional(),
    animalId: esquemaId.optional(),
    pessoaId: esquemaId.optional(),
    situacao: z.enum(SITUACOES_LANCAMENTO).optional(),
    /** Classificação do lançamento (D-E); usada para listar o que falta classificar. */
    comportamentoCusto: z.enum(COMPORTAMENTOS_CUSTO).optional(),
    tratamento: z.enum(TRATAMENTOS_CATEGORIA).optional(),
    busca: z.string().trim().max(100).optional(),
    incluirCancelados: z.boolean().default(false),
    pagina: z.number().int().min(1).default(1),
    tamanhoPagina: z.number().int().min(1).max(200).default(50),
  })
  .strict()
  .refine(
    (v) => !v.dataInicial || !v.dataFinal || v.dataInicial <= v.dataFinal,
    'A data inicial deve ser anterior ou igual à final.',
  );

export const entradasFinanceiro = {
  'pessoaComercial:listar': z.object({ incluirInativas: z.boolean().default(false) }).strict(),
  'pessoaComercial:criar': z.object({ dados: esquemaDadosPessoaComercial }).strict(),
  'pessoaComercial:atualizar': z
    .object({ id: esquemaId, dados: esquemaDadosPessoaComercial, motivo: motivoOpcional })
    .strict(),
  'categoriaFinanceira:listar': z.object({ incluirInativas: z.boolean().default(false) }).strict(),
  'categoriaFinanceira:criar': z.object({ dados: esquemaDadosCategoriaFinanceira }).strict(),
  'categoriaFinanceira:atualizar': z
    .object({ id: esquemaId, dados: esquemaDadosCategoriaFinanceira, motivo: motivoOpcional })
    .strict(),
  'lancamento:listar': esquemaFiltrosLancamento,
  'lancamento:obter': z.object({ id: esquemaId }).strict(),
  'lancamento:criar': z.object({ requisicaoId: esquemaId, dados: esquemaDadosLancamento }).strict(),
  'lancamento:atualizar': z
    .object({ id: esquemaId, dados: esquemaEdicaoLancamento, motivo: esquemaMotivoObrigatorio })
    .strict(),
  'lancamento:cancelar': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
  'lancamento:definirPagamento': z
    .object({ id: esquemaId, condicao: esquemaCondicaoDefinida })
    .strict(),
  'lancamento:renegociar': z
    .object({
      id: esquemaId,
      novasParcelas: z.array(esquemaParcelaPlanejada).max(PARCELAS_MAXIMO),
      /** Ajuste do valor do lançamento, quando a renegociação muda o total. */
      novoTotalCentavos: esquemaCentavosPositivos.nullable().default(null),
      motivo: esquemaMotivoObrigatorio,
    })
    .strict(),
  'pagamento:registrar': z
    .object({ parcelaId: esquemaId, requisicaoId: esquemaId, dados: esquemaDadosPagamento })
    .strict(),
  'pagamento:estornar': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
} as const;

export type DadosPessoaComercial = z.input<typeof esquemaDadosPessoaComercial>;
export type DadosPessoaComercialValidados = z.output<typeof esquemaDadosPessoaComercial>;
export type DadosCategoriaFinanceira = z.input<typeof esquemaDadosCategoriaFinanceira>;
export type DadosCategoriaFinanceiraValidados = z.output<typeof esquemaDadosCategoriaFinanceira>;
export type DadosLancamento = z.input<typeof esquemaDadosLancamento>;
export type DadosLancamentoValidados = z.output<typeof esquemaDadosLancamento>;
export type EdicaoLancamento = z.input<typeof esquemaEdicaoLancamento>;
export type EdicaoLancamentoValidada = z.output<typeof esquemaEdicaoLancamento>;
export type CondicaoPagamentoValidada = z.output<typeof esquemaCondicaoPagamento>;
export type CondicaoDefinidaValidada = z.output<typeof esquemaCondicaoDefinida>;
export type DadosPagamento = z.input<typeof esquemaDadosPagamento>;
export type DadosPagamentoValidados = z.output<typeof esquemaDadosPagamento>;
export type FiltrosLancamento = z.input<typeof esquemaFiltrosLancamento>;
export type FiltrosLancamentoValidados = z.output<typeof esquemaFiltrosLancamento>;
export type ParcelaPlanejadaValidada = z.output<typeof esquemaParcelaPlanejada>;
