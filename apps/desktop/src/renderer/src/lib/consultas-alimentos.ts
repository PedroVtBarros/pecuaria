import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CanalApi, EntradaApi } from '@pecuaria/shared-types';
import { chamarApi } from './api';

/** Consultas do banco de alimentos. Toda gravação invalida o cache do módulo e do estoque. */
export function useAlimentos(filtros: EntradaApi<'alimento:listar'>) {
  return useQuery({
    queryKey: ['alimentos', 'lista', filtros],
    queryFn: () => chamarApi('alimento:listar', filtros),
  });
}

export function useAlimento(id: string, propriedadeId: string | null) {
  return useQuery({
    queryKey: ['alimentos', 'alimento', id, propriedadeId],
    queryFn: () => chamarApi('alimento:obter', { id, propriedadeId }),
    enabled: Boolean(id),
  });
}

export function useFontes(filtros: EntradaApi<'fonte:listar'>) {
  return useQuery({
    queryKey: ['alimentos', 'fontes', filtros],
    queryFn: () => chamarApi('fonte:listar', filtros),
  });
}

export function useNutrientes(incluirInativos = false) {
  return useQuery({
    queryKey: ['alimentos', 'nutrientes', incluirInativos],
    queryFn: () => chamarApi('nutriente:listar', { incluirInativos }),
  });
}

export function useRegistros(filtros: EntradaApi<'composicao:listar'>, habilitado = true) {
  return useQuery({
    queryKey: ['alimentos', 'registros', filtros],
    queryFn: () => chamarApi('composicao:listar', filtros),
    enabled: habilitado,
  });
}

export function useRegistro(id: string) {
  return useQuery({
    queryKey: ['alimentos', 'registro', id],
    queryFn: () => chamarApi('composicao:obter', { id }),
    enabled: Boolean(id),
  });
}

export function useVinculoAlimento(itemId: string) {
  return useQuery({
    queryKey: ['alimentos', 'vinculo', itemId],
    queryFn: () => chamarApi('vinculoAlimento:obter', { itemId }),
    enabled: Boolean(itemId),
  });
}

export function useCuradorias() {
  return useQuery({
    queryKey: ['alimentos', 'curadorias'],
    queryFn: () => chamarApi('curadoria:listar', {}),
  });
}

export function useRegrasSelecao() {
  return useQuery({
    queryKey: ['alimentos', 'regras-selecao'],
    queryFn: () => chamarApi('selecao:regras', {}),
  });
}

export function useSelecao(entrada: EntradaApi<'selecao:executar'> | null) {
  return useQuery({
    queryKey: ['alimentos', 'selecao', entrada],
    queryFn: () => chamarApi('selecao:executar', entrada!),
    enabled: entrada !== null,
  });
}

export function usePerfis(alimentoId: string | null) {
  return useQuery({
    queryKey: ['alimentos', 'perfis', alimentoId],
    queryFn: () => chamarApi('perfil:listar', { alimentoId }),
  });
}

export function usePerfil(id: string) {
  return useQuery({
    queryKey: ['alimentos', 'perfil', id],
    queryFn: () => chamarApi('perfil:obter', { id }),
    enabled: Boolean(id),
  });
}

export function useAcaoAlimentos<C extends CanalApi>(canal: C) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (entrada: EntradaApi<C>) => chamarApi(canal, entrada),
    onSuccess: () => cache.invalidateQueries(),
  });
}
