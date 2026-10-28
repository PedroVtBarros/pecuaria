import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CanalApi, EntradaApi } from '@pecuaria/shared-types';
import { chamarApi } from './api';
export const chavesEstoque = { tudo: ['estoque'] as const };
export function useEstoque(propriedadeId: string | null, incluirInativos = false) {
  return useQuery({
    queryKey: ['estoque', 'itens', propriedadeId, incluirInativos],
    queryFn: () => chamarApi('estoque:listar', { propriedadeId: propriedadeId!, incluirInativos }),
    enabled: Boolean(propriedadeId),
  });
}
export function useItemEstoque(id: string) {
  return useQuery({
    queryKey: ['estoque', 'item', id],
    queryFn: () => chamarApi('estoque:obter', { id }),
    enabled: Boolean(id),
  });
}
export function useExtratoEstoque(entrada: EntradaApi<'estoque:extrato'>) {
  return useQuery({
    queryKey: ['estoque', 'extrato', entrada],
    queryFn: () => chamarApi('estoque:extrato', entrada),
  });
}
export function useAlertasEstoque(propriedadeId: string) {
  return useQuery({
    queryKey: ['estoque', 'alertas', propriedadeId],
    queryFn: () => chamarApi('estoque:alertas', { propriedadeId }),
  });
}
export function useAcaoEstoque<C extends CanalApi>(canal: C) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (entrada: EntradaApi<C>) => chamarApi(canal, entrada),
    onSuccess: () => cache.invalidateQueries(),
  });
}
