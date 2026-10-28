import { z } from 'zod';
import {
  ehDataIso,
  TIPOS_ITEM_ESTOQUE,
  TIPOS_MOVIMENTO_ESTOQUE,
  UNIDADES_ESTOQUE,
  sentidoEstoque,
} from '@pecuaria/domain';
import { esquemaId, esquemaMotivoObrigatorio } from '../rebanho/esquemas';
const idOpcional = esquemaId.nullable().default(null);
const texto = (max: number) => z.string().trim().max(max).nullable().default(null);
const data = z.string().refine(ehDataIso, 'Informe uma data válida.');
export const esquemaQuantidadeEstoque = z
  .number()
  .finite()
  .positive()
  .max(1_000_000_000)
  .refine((n) => n === Number(n.toFixed(3)), 'Use no máximo três casas decimais.');
export const esquemaDadosItemEstoque = z
  .object({
    nome: z.string().trim().min(1, 'Informe o nome.').max(120),
    tipo: z.enum(TIPOS_ITEM_ESTOQUE),
    unidadeBase: z.enum(UNIDADES_ESTOQUE),
    controleLote: z.boolean(),
    estoqueMinimo: esquemaQuantidadeEstoque.or(z.literal(0)).nullable().default(null),
    produtoSanitarioId: idOpcional,
    ativo: z.boolean().default(true),
    observacoes: texto(1000),
  })
  .strict();
export const esquemaDadosLoteEstoque = z
  .object({ codigo: z.string().trim().min(1).max(100), validade: data.nullable().default(null) })
  .strict();
export const esquemaDadosMovimentoEstoque = z
  .object({
    data,
    tipo: z.enum(TIPOS_MOVIMENTO_ESTOQUE),
    quantidade: esquemaQuantidadeEstoque,
    unidadeBase: z.enum(UNIDADES_ESTOQUE),
    loteEstoqueId: idOpcional,
    custoEntradaCentavos: z.number().int().min(0).max(1_000_000_000_000).nullable().default(null),
    destino: z.enum(['propriedade', 'lote', 'animal']).nullable().default(null),
    loteAnimalId: idOpcional,
    animalId: idOpcional,
    documentoOrigemId: idOpcional,
    motivo: texto(500),
    observacao: texto(1000),
  })
  .strict()
  .superRefine((v, ctx) => {
    const entrada = sentidoEstoque(v.tipo) === 'entrada';
    if (entrada && (v.destino || v.loteAnimalId || v.animalId))
      ctx.addIssue({
        code: 'custom',
        message: 'Entradas não têm destino de consumo.',
        path: ['destino'],
      });
    if (
      !entrada &&
      (!v.destino ||
        (v.destino === 'lote') !== Boolean(v.loteAnimalId) ||
        (v.destino === 'animal') !== Boolean(v.animalId))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Informe um único destino válido para a saída.',
        path: ['destino'],
      });
    if (!entrada && v.custoEntradaCentavos !== null)
      ctx.addIssue({
        code: 'custom',
        message: 'O custo da saída é apropriado pelo custo médio.',
        path: ['custoEntradaCentavos'],
      });
    if (v.tipo.startsWith('ajuste_') && !v.motivo?.trim())
      ctx.addIssue({ code: 'custom', message: 'Ajustes exigem motivo.', path: ['motivo'] });
  });
export const esquemaConsumoEstoque = z
  .object({
    itemId: esquemaId,
    loteEstoqueId: idOpcional,
    quantidade: esquemaQuantidadeEstoque,
    unidadeBase: z.enum(UNIDADES_ESTOQUE),
    requisicaoId: esquemaId,
  })
  .strict();
export const esquemaConsumosEstoque = z
  .array(esquemaConsumoEstoque)
  .max(100)
  .superRefine((itens, ctx) => {
    if (new Set(itens.map((i) => i.requisicaoId)).size !== itens.length)
      ctx.addIssue({ code: 'custom', message: 'Identificadores de consumo repetidos.' });
  });
export const esquemaConsultaExtratoEstoque = z
  .object({
    itemId: esquemaId,
    dataInicial: data.optional(),
    dataFinal: data.optional(),
    destino: z.enum(['propriedade', 'lote', 'animal']).optional(),
    incluirCancelados: z.boolean().default(false),
    pagina: z.number().int().min(1).default(1),
    tamanhoPagina: z.number().int().min(1).max(200).default(50),
  })
  .strict()
  .refine(
    (v) => !v.dataInicial || !v.dataFinal || v.dataInicial <= v.dataFinal,
    'A data inicial deve ser anterior ou igual à final.',
  );
export type ConsultaExtratoEstoque = z.output<typeof esquemaConsultaExtratoEstoque>;
export const entradasEstoque = {
  'estoque:listar': z
    .object({ propriedadeId: esquemaId, incluirInativos: z.boolean().default(false) })
    .strict(),
  'estoque:obter': z.object({ id: esquemaId }).strict(),
  'estoque:criarItem': z
    .object({ propriedadeId: esquemaId, dados: esquemaDadosItemEstoque })
    .strict(),
  'estoque:atualizarItem': z
    .object({ id: esquemaId, dados: esquemaDadosItemEstoque, motivo: esquemaMotivoObrigatorio })
    .strict(),
  'estoque:criarLote': z.object({ itemId: esquemaId, dados: esquemaDadosLoteEstoque }).strict(),
  'estoque:atualizarLote': z
    .object({ id: esquemaId, dados: esquemaDadosLoteEstoque, motivo: esquemaMotivoObrigatorio })
    .strict(),
  'estoque:registrar': z
    .object({ itemId: esquemaId, requisicaoId: esquemaId, dados: esquemaDadosMovimentoEstoque })
    .strict(),
  'estoque:corrigir': z
    .object({
      id: esquemaId,
      requisicaoId: esquemaId,
      dados: esquemaDadosMovimentoEstoque,
      motivo: esquemaMotivoObrigatorio,
    })
    .strict(),
  'estoque:cancelar': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
  'estoque:prever': z
    .object({ itemId: esquemaId, dados: esquemaDadosMovimentoEstoque, substituiId: idOpcional })
    .strict(),
  'estoque:alertas': z.object({ propriedadeId: esquemaId }).strict(),
  'estoque:extrato': esquemaConsultaExtratoEstoque,
} as const;
export const esquemaPreferenciasEstoque = z
  .object({ antecedenciaValidadeDias: z.number().int().min(0).max(365) })
  .strict();
export type DadosItemEstoque = z.input<typeof esquemaDadosItemEstoque>;
export type DadosItemEstoqueValidados = z.output<typeof esquemaDadosItemEstoque>;
export type DadosLoteEstoque = z.output<typeof esquemaDadosLoteEstoque>;
export type DadosMovimentoEstoque = z.input<typeof esquemaDadosMovimentoEstoque>;
export type MovimentoEstoqueValidado = z.output<typeof esquemaDadosMovimentoEstoque>;
export type ConsumoEstoque = z.output<typeof esquemaConsumoEstoque>;
