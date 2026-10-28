import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { EntradaApi } from '@pecuaria/shared-types';
import { chamarApi } from './api';

export function usePendentesRateio(propriedadeId: string) {
  return useQuery({
    queryKey: ['financeiro', 'rateio-pendentes', propriedadeId],
    queryFn: () => chamarApi('rateio:pendentes', { propriedadeId }),
  });
}
export function useRateios(propriedadeId: string, incluirCancelados: boolean) {
  return useQuery({
    queryKey: ['financeiro', 'rateios', propriedadeId, incluirCancelados],
    queryFn: () => chamarApi('rateio:listar', { propriedadeId, incluirCancelados }),
  });
}
export function useRateio(id: string) {
  return useQuery({
    queryKey: ['financeiro', 'rateio', id],
    queryFn: () => chamarApi('rateio:obter', { id }),
    enabled: Boolean(id),
  });
}
export function usePreviaRateio(entrada: EntradaApi<'rateio:previa'> | null) {
  return useQuery({
    queryKey: ['financeiro', 'rateio-previa', entrada],
    queryFn: () => chamarApi('rateio:previa', entrada as EntradaApi<'rateio:previa'>),
    enabled: entrada !== null,
    placeholderData: keepPreviousData,
  });
}
export function useResumoCustos(filtros: EntradaApi<'custo:resumo'>) {
  return useQuery({
    queryKey: ['financeiro', 'custo-resumo', filtros],
    queryFn: () => chamarApi('custo:resumo', filtros),
  });
}
export function useCustosAnimais(filtros: EntradaApi<'custo:animais'>) {
  return useQuery({
    queryKey: ['financeiro', 'custo-animais', filtros],
    queryFn: () => chamarApi('custo:animais', filtros),
    placeholderData: keepPreviousData,
  });
}
export function useExplicacaoAnimal(filtros: EntradaApi<'custo:animal'> | null) {
  return useQuery({
    queryKey: ['financeiro', 'custo-animal-origem', filtros],
    queryFn: () => chamarApi('custo:animal', filtros as EntradaApi<'custo:animal'>),
    enabled: filtros !== null,
  });
}
export function useExplicacaoLote(filtros: EntradaApi<'custo:lote'> | null) {
  return useQuery({
    queryKey: ['financeiro', 'custo-lote-origem', filtros],
    queryFn: () => chamarApi('custo:lote', filtros as EntradaApi<'custo:lote'>),
    enabled: filtros !== null,
  });
}
