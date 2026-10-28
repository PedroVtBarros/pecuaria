import { useQuery } from '@tanstack/react-query';
import type { EntradaApi } from '@pecuaria/shared-types';
import { chamarApi } from './api';

export function useNegociacoes(filtros: EntradaApi<'negociacao:listar'>) {
  return useQuery({
    queryKey: ['financeiro', 'negociacoes', filtros],
    queryFn: () => chamarApi('negociacao:listar', filtros),
  });
}
export function useNegociacao(id: string) {
  return useQuery({
    queryKey: ['financeiro', 'negociacao', id],
    queryFn: () => chamarApi('negociacao:obter', { id }),
    enabled: Boolean(id),
  });
}
export function useCustoDoAnimal(animalId: string) {
  return useQuery({
    queryKey: ['financeiro', 'custo-animal', animalId],
    queryFn: () => chamarApi('custoAnimal:obter', { animalId }),
    enabled: Boolean(animalId),
  });
}
export function useCustosAnteriores(filtros: EntradaApi<'custoAnterior:listar'>) {
  return useQuery({
    queryKey: ['financeiro', 'custos-anteriores', filtros],
    queryFn: () => chamarApi('custoAnterior:listar', filtros),
  });
}
