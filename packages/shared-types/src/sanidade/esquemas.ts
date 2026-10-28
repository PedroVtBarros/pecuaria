import { z } from 'zod';
import { esquemaConsumosEstoque } from '../estoque/esquemas';
import {
  CARENCIA_MAXIMA_DIAS,
  DOSE_MAXIMA,
  TIPOS_MANEJO_SANITARIO,
  TIPOS_PRODUTO_SANITARIO,
  UNIDADES_DOSE,
  VIAS_APLICACAO,
} from '@pecuaria/domain';
import {
  esquemaData,
  esquemaId,
  esquemaIdOpcional,
  esquemaMotivo,
  esquemaMotivoObrigatorio,
  textoObrigatorio,
  textoOpcional,
} from '../rebanho/esquemas';

function opcao<const T extends readonly [string, ...string[]]>(valores: T, rotulo: string) {
  return z.enum(valores, `Selecione ${rotulo}.`);
}

/** Dias de carência como informados pelo usuário a partir da bula. */
function esquemaCarencia(rotulo: string) {
  return z
    .number({ error: `${rotulo} deve ser um número inteiro de dias.` })
    .int(`${rotulo} deve ser um número inteiro de dias.`)
    .min(0, `${rotulo} não pode ser negativa.`)
    .max(CARENCIA_MAXIMA_DIAS, `${rotulo} deve ser no máximo ${CARENCIA_MAXIMA_DIAS} dias.`)
    .nullable();
}

export const esquemaDose = z
  .number({ error: 'Dose deve ser um número.' })
  .finite('Dose deve ser um número.')
  .positive('Dose deve ser maior que zero.')
  .max(DOSE_MAXIMA, `Dose deve ser no máximo ${DOSE_MAXIMA.toLocaleString('pt-BR')}.`);

const esquemaCustoCentavos = z
  .number({ error: 'Custo deve ser um valor em reais.' })
  .int('Custo deve ser um valor em reais.')
  .min(0, 'Custo não pode ser negativo.')
  .max(100_000_000_00, 'Custo grande demais.')
  .nullable();

const tipoManejo = opcao(TIPOS_MANEJO_SANITARIO, 'o tipo de manejo');
const unidadeDose = opcao(UNIDADES_DOSE, 'a unidade da dose');

// ---------------------------------------------------------------------------
// Produto sanitário
// ---------------------------------------------------------------------------

export const esquemaDadosProdutoSanitario = z
  .object({
    nome: textoObrigatorio(120, 'Nome'),
    tipo: opcao(TIPOS_PRODUTO_SANITARIO, 'o tipo de produto'),
    fabricante: textoOpcional(120, 'Fabricante'),
    principioAtivo: textoOpcional(200, 'Princípio ativo'),
    unidadeDose: unidadeDose.nullable(),
    carenciaCarneDias: esquemaCarencia('Carência para carne'),
    carenciaLeiteDias: esquemaCarencia('Carência para leite'),
    observacoes: textoOpcional(1000, 'Observações'),
  })
  .strict();
export type DadosProdutoSanitario = z.input<typeof esquemaDadosProdutoSanitario>;

// ---------------------------------------------------------------------------
// Registro sanitário (manejo)
// ---------------------------------------------------------------------------

export const esquemaDadosManejo = z
  .object({
    tipo: tipoManejo,
    data: esquemaData,
    produtoId: esquemaIdOpcional,
    descricao: textoOpcional(200, 'Descrição'),
    dose: esquemaDose.nullable(),
    unidadeDose: unidadeDose.nullable(),
    via: opcao(VIAS_APLICACAO, 'a via de aplicação').nullable(),
    carenciaCarneDias: esquemaCarencia('Carência para carne'),
    carenciaLeiteDias: esquemaCarencia('Carência para leite'),
    responsavel: textoOpcional(120, 'Responsável'),
    diagnostico: textoOpcional(500, 'Diagnóstico ou motivo'),
    custoTotalCentavos: esquemaCustoCentavos,
    observacoes: textoOpcional(1000, 'Observações'),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.produtoId === null && d.descricao === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Escolha o produto ou descreva o que foi feito.',
        path: ['descricao'],
      });
    }
    if (d.dose !== null && d.unidadeDose === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe a unidade da dose.',
        path: ['unidadeDose'],
      });
    }
  });
export type DadosManejo = z.input<typeof esquemaDadosManejo>;

export const esquemaAnimalDoManejo = z
  .object({ animalId: esquemaId, dose: esquemaDose.nullable().default(null) })
  .strict();

export const esquemaProximaAplicacao = z
  .object({ data: esquemaData, observacoes: textoOpcional(500, 'Observações').default(null) })
  .strict();

export const esquemaFiltrosManejo = z
  .object({
    tipo: tipoManejo.optional(),
    loteId: esquemaId.optional(),
    animalId: esquemaId.optional(),
    produtoId: esquemaId.optional(),
    dataInicial: esquemaData.optional(),
    dataFinal: esquemaData.optional(),
    pagina: z.number().int().min(1).optional(),
    tamanhoPagina: z.number().int().min(1).max(200).optional(),
  })
  .strict();
export type FiltrosManejo = z.input<typeof esquemaFiltrosManejo>;

// ---------------------------------------------------------------------------
// Agenda sanitária
// ---------------------------------------------------------------------------

export const esquemaDadosAgenda = z
  .object({
    dataPrevista: esquemaData,
    tipo: tipoManejo,
    produtoId: esquemaIdOpcional,
    descricao: textoOpcional(200, 'Descrição'),
    loteId: esquemaIdOpcional,
    animalId: esquemaIdOpcional,
    observacoes: textoOpcional(500, 'Observações'),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.produtoId === null && d.descricao === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Escolha o produto ou descreva o que será feito.',
        path: ['descricao'],
      });
    }
    if (d.loteId !== null && d.animalId !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Escolha um lote ou um animal, não os dois.',
        path: ['animalId'],
      });
    }
  });
export type DadosAgenda = z.input<typeof esquemaDadosAgenda>;

/** Preferências dos avisos de sanidade (Configurações). */
export const esquemaPreferenciasSanidade = z
  .object({
    antecedenciaDias: z
      .number({ error: 'Informe um número inteiro de dias.' })
      .int('Informe um número inteiro de dias.')
      .min(0, 'A antecedência não pode ser negativa.')
      .max(365, 'A antecedência deve ser no máximo 365 dias.'),
  })
  .strict();

// ---------------------------------------------------------------------------
// Entradas dos canais
// ---------------------------------------------------------------------------

export const entradasSanidade = {
  'produtoSanitario:listar': z.object({}).strict(),
  'produtoSanitario:criar': z.object({ dados: esquemaDadosProdutoSanitario }).strict(),
  'produtoSanitario:atualizar': z
    .object({ id: esquemaId, dados: esquemaDadosProdutoSanitario })
    .strict(),
  'produtoSanitario:excluir': z.object({ id: esquemaId }).strict(),

  'manejoSanitario:listar': z
    .object({ propriedadeId: esquemaId, filtros: esquemaFiltrosManejo })
    .strict(),
  'manejoSanitario:obter': z.object({ id: esquemaId }).strict(),
  'manejoSanitario:registrar': z
    .object({
      propriedadeId: esquemaId,
      dados: esquemaDadosManejo,
      animais: z
        .array(esquemaAnimalDoManejo)
        .min(1, 'Selecione ao menos um animal.')
        .max(5000, 'No máximo 5000 animais por registro.'),
      /** Lote escolhido para a aplicação coletiva (só para referência). */
      loteId: esquemaIdOpcional.default(null),
      /** Evento da agenda que esta aplicação realiza. */
      agendaId: esquemaIdOpcional.default(null),
      proximaAplicacao: esquemaProximaAplicacao.nullable().default(null),
      consumosEstoque: esquemaConsumosEstoque.default([]),
    })
    .strict(),
  'manejoSanitario:atualizar': z
    .object({
      id: esquemaId,
      dados: esquemaDadosManejo,
      motivo: esquemaMotivoObrigatorio,
      consumosEstoque: esquemaConsumosEstoque.optional(),
      confirmarConsumoMantido: z.boolean().default(false),
    })
    .strict(),
  'manejoSanitario:removerAnimal': z
    .object({
      manejoId: esquemaId,
      animalId: esquemaId,
      motivo: esquemaMotivoObrigatorio,
      confirmarConsumoMantido: z.boolean().default(false),
    })
    .strict(),
  'manejoSanitario:excluir': z
    .object({
      id: esquemaId,
      motivo: esquemaMotivoObrigatorio,
      estornarEstoque: z.boolean().default(false),
    })
    .strict(),

  'sanidade:doAnimal': z.object({ animalId: esquemaId }).strict(),
  'sanidade:resumo': z.object({ propriedadeId: esquemaId }).strict(),

  'agendaSanitaria:listar': z
    .object({ propriedadeId: esquemaId, incluirConcluidos: z.boolean().default(false) })
    .strict(),
  'agendaSanitaria:criar': z
    .object({ propriedadeId: esquemaId, dados: esquemaDadosAgenda })
    .strict(),
  'agendaSanitaria:atualizar': z
    .object({ id: esquemaId, dados: esquemaDadosAgenda, motivo: esquemaMotivo.default(null) })
    .strict(),
  'agendaSanitaria:cancelar': z
    .object({ id: esquemaId, motivo: esquemaMotivoObrigatorio })
    .strict(),
} as const;

export type DadosProdutoSanitarioValidados = z.output<typeof esquemaDadosProdutoSanitario>;
export type DadosManejoValidados = z.output<typeof esquemaDadosManejo>;
export type AnimalDoManejoValidado = z.output<typeof esquemaAnimalDoManejo>;
export type ProximaAplicacaoValidada = z.output<typeof esquemaProximaAplicacao>;
export type FiltrosManejoValidados = z.output<typeof esquemaFiltrosManejo>;
export type DadosAgendaValidados = z.output<typeof esquemaDadosAgenda>;
