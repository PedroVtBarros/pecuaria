import { z } from 'zod';
import { PADRAO_CODIGO } from '@pecuaria/domain';

/** Pacotes de curadoria (Fase 5B-2): listar, importar e atualizar para versão nova, sempre por ação do usuário. */
export const entradasCuradoria = {
  'curadoria:listar': z.object({}).strict(),
  'curadoria:importar': z
    .object({
      codigo: z.string().regex(PADRAO_CODIGO, 'Código de pacote inválido.'),
      versao: z.number().int().min(1, 'Versão do pacote inválida.'),
    })
    .strict(),
  'curadoria:atualizar': z
    .object({
      codigo: z.string().regex(PADRAO_CODIGO, 'Código de pacote inválido.'),
      versao: z.number().int().min(1, 'Versão do pacote inválida.'),
    })
    .strict(),
} as const;
