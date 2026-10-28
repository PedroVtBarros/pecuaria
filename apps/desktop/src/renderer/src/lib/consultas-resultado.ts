import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { EntradaApi } from '@pecuaria/shared-types';
import { chamarApi } from './api';

export function useResultadoPeriodo(filtros: EntradaApi<'resultado:periodo'> | null) {
  return useQuery({
    queryKey: ['financeiro', 'resultado-periodo', filtros],
    queryFn: () => chamarApi('resultado:periodo', filtros as EntradaApi<'resultado:periodo'>),
    enabled: filtros !== null,
    placeholderData: keepPreviousData,
  });
}
export function useResultadoRealizado(filtros: EntradaApi<'resultado:realizado'>) {
  return useQuery({
    queryKey: ['financeiro', 'resultado-realizado', filtros],
    queryFn: () => chamarApi('resultado:realizado', filtros),
    placeholderData: keepPreviousData,
  });
}
export function useIndicadores(filtros: EntradaApi<'resultado:indicadores'>) {
  return useQuery({
    queryKey: ['financeiro', 'resultado-indicadores', filtros],
    queryFn: () => chamarApi('resultado:indicadores', filtros),
    placeholderData: keepPreviousData,
  });
}
export function usePontoEquilibrio(filtros: EntradaApi<'resultado:pontoEquilibrio'>) {
  return useQuery({
    queryKey: ['financeiro', 'resultado-equilibrio', filtros],
    queryFn: () => chamarApi('resultado:pontoEquilibrio', filtros),
    placeholderData: keepPreviousData,
  });
}
export function useConciliacao(filtros: EntradaApi<'resultado:conciliacao'>) {
  return useQuery({
    queryKey: ['financeiro', 'resultado-conciliacao', filtros],
    queryFn: () => chamarApi('resultado:conciliacao', filtros),
    placeholderData: keepPreviousData,
  });
}
