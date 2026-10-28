import { z } from 'zod';
import { esquemaQuantidadeEstoque } from '../estoque/esquemas';
import {
  esquemaData,
  esquemaId,
  esquemaIdOpcional,
  esquemaMotivoObrigatorio,
  textoObrigatorio,
  textoOpcional,
} from '../rebanho/esquemas';

/**
 * Produção própria (entrega 4F): centro de produção que reúne despesas e insumos do estoque e, ao
 * encerrar, gera a entrada de produção no estoque com o custo total apurado.
 */
const dadosDoCentro = z
  .object({
    nome: textoObrigatorio(120, 'Nome'),
    tipo: z.enum(['volumoso', 'outro']),
    areaId: esquemaIdOpcional.default(null),
    dataInicio: esquemaData,
    estoqueItemId: esquemaId,
    observacoes: textoOpcional(500, 'Observações'),
  })
  .strict();

const tipoDeCusto = z.enum(['lancamento', 'consumo']);

export const entradasProducao = {
  'producao:listar': z
    .object({ propriedadeId: esquemaId, incluirCancelados: z.boolean().default(false) })
    .strict(),
  'producao:obter': z.object({ id: esquemaId }).strict(),
  'producao:criar': z
    .object({ requisicaoId: esquemaId, propriedadeId: esquemaId, dados: dadosDoCentro })
    .strict(),
  'producao:atualizar': z
    .object({
      id: esquemaId,
      dados: dadosDoCentro.omit({ estoqueItemId: true }),
      motivo: esquemaMotivoObrigatorio,
    })
    .strict(),
  'producao:cancelar': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
  'producao:candidatos': z.object({ id: esquemaId }).strict(),
  'producao:vincular': z.object({ id: esquemaId, tipo: tipoDeCusto, origemId: esquemaId }).strict(),
  'producao:desvincular': z
    .object({ id: esquemaId, tipo: tipoDeCusto, origemId: esquemaId })
    .strict(),
  'producao:encerrar': z
    .object({
      id: esquemaId,
      requisicaoId: esquemaId,
      dataFim: esquemaData,
      /** Quantidade colhida, na unidade do item produzido. */
      quantidade: esquemaQuantidadeEstoque,
      loteEstoqueId: esquemaIdOpcional.default(null),
      observacao: textoOpcional(500, 'Observação'),
    })
    .strict(),
  'producao:reabrir': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
} as const;

export type DadosCentroValidados = z.output<(typeof entradasProducao)['producao:criar']>['dados'];
export type EdicaoCentroValidada = z.output<(typeof entradasProducao)['producao:atualizar']>;
export type EncerramentoValidado = z.output<(typeof entradasProducao)['producao:encerrar']>;
