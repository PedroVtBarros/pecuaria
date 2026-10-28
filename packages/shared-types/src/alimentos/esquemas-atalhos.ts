import { z } from 'zod';
import {
  BASES_NUTRICIONAIS,
  SEPARADORES_DECIMAIS,
  TAMANHO_MAXIMO_NUMERO_PUBLICADO,
  TIPOS_VALOR_GARANTIA,
  UNIDADES_NUTRICIONAIS,
} from '@pecuaria/domain';
import {
  esquemaData,
  esquemaDataOpcional,
  esquemaId,
  textoObrigatorio,
  textoOpcional,
} from '../rebanho/esquemas';
import { esquemaDadosAlimento } from './esquemas';

/**
 * Atalhos da Fase 5A-4: produto comercial pelo rótulo, laudo laboratorial e MS medida na fazenda.
 * Cada atalho cria fonte, registro (em rascunho) e valores numa transação; a conferência continua
 * obrigatória (RF-05.10). Números chegam como texto publicado (D5-3).
 */
const textoPublicado = z
  .string()
  .trim()
  .min(1, 'Informe o valor como publicado.')
  .max(TAMANHO_MAXIMO_NUMERO_PUBLICADO, 'Valor publicado longo demais.');

const chaveUnica = <T>(itens: T[], chave: (i: T) => string) =>
  new Set(itens.map(chave)).size === itens.length;

const esquemaGarantia = z
  .object({
    nutrienteId: esquemaId,
    valorPublicado: textoPublicado,
    unidade: z.enum(UNIDADES_NUTRICIONAIS, 'Selecione a unidade.'),
    tipoValor: z.enum(TIPOS_VALOR_GARANTIA, 'Mínimo ou máximo garantido.'),
    observacao: textoOpcional(1000, 'Observação'),
  })
  .strict();

export const esquemaDadosRotulo = z
  .object({
    /** Alimento comercial já cadastrado, ou os dados de um novo (exatamente um dos dois). */
    alimentoId: esquemaId.nullable(),
    alimento: esquemaDadosAlimento.nullable(),
    titulo: textoObrigatorio(300, 'Título do rótulo'),
    fabricante: textoObrigatorio(200, 'Fabricante'),
    registroProduto: textoOpcional(100, 'Registro do produto'),
    observacoes: textoOpcional(2000, 'Observações'),
    separadorDecimal: z.enum(SEPARADORES_DECIMAIS, 'Informe o separador decimal do rótulo.'),
    garantias: z
      .array(esquemaGarantia)
      .min(1, 'Informe ao menos um nível de garantia.')
      .max(80, 'No máximo 80 níveis de garantia.'),
  })
  .strict()
  .refine((d) => (d.alimentoId === null) !== (d.alimento === null), {
    message: 'Escolha um alimento comercial existente ou cadastre um novo.',
    path: ['alimentoId'],
  })
  .refine((d) => chaveUnica(d.garantias, (g) => `${g.nutrienteId}|${g.tipoValor}`), {
    message: 'Há garantia repetida (mesmo nutriente e tipo).',
    path: ['garantias'],
  });

const esquemaValorLaudo = z
  .object({
    nutrienteId: esquemaId,
    valorPublicado: textoPublicado,
    unidade: z.enum(UNIDADES_NUTRICIONAIS, 'Selecione a unidade.'),
    base: z.enum(BASES_NUTRICIONAIS, 'Selecione a base.'),
    metodoAnaliticoFonte: textoOpcional(500, 'Método informado no laudo'),
    observacao: textoOpcional(1000, 'Observação'),
  })
  .strict();

export const esquemaDadosLaudo = z
  .object({
    propriedadeId: esquemaId,
    alimentoId: esquemaId,
    laboratorio: textoObrigatorio(200, 'Laboratório'),
    numeroLaudo: textoOpcional(100, 'Número do laudo'),
    dataLaudo: esquemaDataOpcional,
    dataAmostra: esquemaData,
    identificacaoAmostra: textoOpcional(120, 'Identificação da amostra'),
    observacoes: textoOpcional(2000, 'Observações'),
    separadorDecimal: z.enum(SEPARADORES_DECIMAIS, 'Informe o separador decimal do laudo.'),
    valores: z
      .array(esquemaValorLaudo)
      .min(1, 'Informe ao menos um valor do laudo.')
      .max(80, 'No máximo 80 valores.'),
  })
  .strict()
  .refine((d) => chaveUnica(d.valores, (v) => `${v.nutrienteId}|${v.base}`), {
    message: 'Há valor repetido (mesmo nutriente e base).',
    path: ['valores'],
  });

export const esquemaDadosMedicaoMs = z
  .object({
    propriedadeId: esquemaId,
    alimentoId: esquemaId,
    /** Método já cadastrado (fonte de medição própria da propriedade) ou um novo. */
    fonteId: esquemaId.nullable(),
    metodo: z
      .object({
        titulo: textoObrigatorio(300, 'Nome do método'),
        metodoMedicao: textoObrigatorio(2000, 'Descrição do método'),
        limitacoesMedicao: textoObrigatorio(2000, 'Limitações do método'),
      })
      .strict()
      .nullable(),
    nutrienteId: esquemaId,
    dataAmostra: esquemaData,
    identificacaoAmostra: textoOpcional(120, 'Identificação da amostra'),
    separadorDecimal: z.enum(SEPARADORES_DECIMAIS),
    valorPublicado: textoPublicado,
    tipoValor: z.enum(['valor_unico', 'media']),
    nObservacoes: z.number().int().min(1).nullable(),
    observacao: textoOpcional(1000, 'Observação'),
  })
  .strict()
  .refine((d) => (d.fonteId === null) !== (d.metodo === null), {
    message: 'Escolha um método já cadastrado ou descreva um novo.',
    path: ['fonteId'],
  });

export const entradasAtalhosAlimentos = {
  'rotulo:registrar': esquemaDadosRotulo,
  'laudo:registrar': esquemaDadosLaudo,
  'medicaoMs:registrar': esquemaDadosMedicaoMs,
} as const;

export type DadosRotulo = z.input<typeof esquemaDadosRotulo>;
export type DadosRotuloValidados = z.output<typeof esquemaDadosRotulo>;
export type DadosLaudo = z.input<typeof esquemaDadosLaudo>;
export type DadosLaudoValidados = z.output<typeof esquemaDadosLaudo>;
export type DadosMedicaoMs = z.input<typeof esquemaDadosMedicaoMs>;
export type DadosMedicaoMsValidados = z.output<typeof esquemaDadosMedicaoMs>;
