import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CanalApi, EntradaApi } from '@pecuaria/shared-types';
import { chamarApi } from './api';

export function useLancamentos(filtros: EntradaApi<'lancamento:listar'>, habilitado = true) {
  return useQuery({
    queryKey: ['financeiro', 'lancamentos', filtros],
    queryFn: () => chamarApi('lancamento:listar', filtros),
    enabled: habilitado,
  });
}
export function useLancamento(id: string) {
  return useQuery({
    queryKey: ['financeiro', 'lancamento', id],
    queryFn: () => chamarApi('lancamento:obter', { id }),
    enabled: Boolean(id),
  });
}
export function useCategoriasFinanceiras(incluirInativas = false) {
  return useQuery({
    queryKey: ['financeiro', 'categorias', incluirInativas],
    queryFn: () => chamarApi('categoriaFinanceira:listar', { incluirInativas }),
  });
}
export function usePessoasComerciais(incluirInativas = false) {
  return useQuery({
    queryKey: ['financeiro', 'pessoas', incluirInativas],
    queryFn: () => chamarApi('pessoaComercial:listar', { incluirInativas }),
  });
}
/** Ação de escrita: depois dela todas as consultas são renovadas. */
export function useAcaoFinanceiro<C extends CanalApi>(canal: C) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (entrada: EntradaApi<C>) => chamarApi(canal, entrada),
    onSuccess: () => cache.invalidateQueries(),
  });
}

export function useFluxo(filtros: EntradaApi<'fluxo:obter'>) {
  return useQuery({
    queryKey: ['financeiro', 'fluxo', filtros],
    queryFn: () => chamarApi('fluxo:obter', filtros),
  });
}
export function useContas(filtros: EntradaApi<'conta:listar'>) {
  return useQuery({
    queryKey: ['financeiro', 'contas', filtros],
    queryFn: () => chamarApi('conta:listar', filtros),
  });
}
export function usePainel(filtros: EntradaApi<'painel:obter'>) {
  return useQuery({
    queryKey: ['financeiro', 'painel', filtros],
    queryFn: () => chamarApi('painel:obter', filtros),
  });
}
export function useResumoClassificacao(filtros: EntradaApi<'classificacao:resumo'>) {
  return useQuery({
    queryKey: ['financeiro', 'classificacao', filtros],
    queryFn: () => chamarApi('classificacao:resumo', filtros),
  });
}
