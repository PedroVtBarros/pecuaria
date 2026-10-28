import { z } from 'zod';
import { PADRAO_CODIGO, SENTIDOS_CENARIO, TIPOS_AVALIACAO, TIPOS_PERFIL } from '@pecuaria/domain';
import {
  esquemaId,
  esquemaMotivoObrigatorio,
  textoObrigatorio,
  textoOpcional,
} from '../rebanho/esquemas';

const esquemaResponsavel = textoObrigatorio(120, 'Nome de quem executa');
const esquemaIdade = z
  .number()
  .int()
  .min(1, 'Idade de corte inválida.')
  .max(3650, 'Idade de corte inválida.')
  .nullable();
const esquemaEscolhas = z
  .array(z.object({ origemId: esquemaId, registroId: esquemaId }).strict())
  .max(500)
  .default([]);

/** Fase 5D: regra de seleção, seleção, perfis e avaliação científica; tudo por ação do usuário. */
export const entradasSelecao = {
  'selecao:regras': z.object({}).strict(),
  'selecao:aprovarRegra': z
    .object({
      codigo: z.string().regex(PADRAO_CODIGO, 'Código de regra inválido.'),
      versao: z.number().int().min(1),
      responsavel: esquemaResponsavel,
      observacao: textoOpcional(1000, 'Observação'),
    })
    .strict(),
  'selecao:executar': z
    .object({ alimentoId: esquemaId, idadeCorteDias: esquemaIdade, escolhas: esquemaEscolhas })
    .strict(),
  'perfil:gravar': z
    .object({
      alimentoId: esquemaId,
      idadeCorteDias: esquemaIdade,
      escolhas: esquemaEscolhas,
      tipo: z.enum(TIPOS_PERFIL, 'Escolha o tipo de perfil.'),
      registroId: esquemaId.nullable(),
      nutrienteId: esquemaId.nullable(),
      sentido: z.enum(SENTIDOS_CENARIO).nullable(),
      nome: textoObrigatorio(120, 'Nome do perfil'),
      responsavel: esquemaResponsavel,
    })
    .strict()
    .superRefine((d, ctx) => {
      const exige = (ok: boolean, campo: string, mensagem: string) => {
        if (!ok) ctx.addIssue({ code: 'custom', path: [campo], message: mensagem });
      };
      if (d.tipo === 'referencia_individual')
        exige(d.registroId !== null, 'registroId', 'Escolha o registro.');
      if (d.tipo === 'cenario_real') {
        exige(d.registroId !== null, 'registroId', 'Escolha o registro do cenário.');
        exige(d.nutrienteId !== null, 'nutrienteId', 'Escolha o nutriente do cenário.');
        exige(d.sentido !== null, 'sentido', 'Escolha conservador ou favorável.');
      }
    }),
  'perfil:listar': z.object({ alimentoId: esquemaId.nullable().default(null) }).strict(),
  'perfil:obter': z.object({ id: esquemaId }).strict(),
  'avaliacao:marcar': z
    .object({
      registroId: esquemaId,
      valorId: esquemaId.nullable(),
      tipo: z.enum(TIPOS_AVALIACAO, 'Escolha o tipo de avaliação.'),
      motivo: esquemaMotivoObrigatorio,
      responsavel: esquemaResponsavel,
    })
    .strict(),
  'avaliacao:retirar': z
    .object({
      registroId: esquemaId,
      avaliacaoId: esquemaId,
      motivo: esquemaMotivoObrigatorio,
      responsavel: esquemaResponsavel,
    })
    .strict(),
} as const;
