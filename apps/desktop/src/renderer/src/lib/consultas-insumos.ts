import { useQuery } from '@tanstack/react-query';
import type { EntradaApi } from '@pecuaria/shared-types';
import { chamarApi } from './api';

export function useComprasInsumos(entrada: EntradaApi<'compraInsumo:listar'>) {
  return useQuery({
    queryKey: ['financeiro', 'compras-insumos', entrada],
    queryFn: () => chamarApi('compraInsumo:listar', entrada),
  });
}
export function useCompraInsumos(lancamentoId: string) {
  return useQuery({
    queryKey: ['financeiro', 'compra-insumos', lancamentoId],
    queryFn: () => chamarApi('compraInsumo:obter', { lancamentoId }),
    enabled: Boolean(lancamentoId),
  });
}
export function usePendenciasEstoque(propriedadeId: string) {
  return useQuery({
    queryKey: ['financeiro', 'pendencias-estoque', propriedadeId],
    queryFn: () => chamarApi('auditoria:pendencias', { propriedadeId }),
  });
}
export function useResumoConsumos(filtros: EntradaApi<'consumo:resumo'>) {
  return useQuery({
    queryKey: ['financeiro', 'consumo-resumo', filtros],
    queryFn: () => chamarApi('consumo:resumo', filtros),
  });
}
export function useConsumos(filtros: EntradaApi<'consumo:listar'>) {
  return useQuery({
    queryKey: ['financeiro', 'consumos', filtros],
    queryFn: () => chamarApi('consumo:listar', filtros),
  });
}
export function useCustoSanitario(manejoId: string) {
  return useQuery({
    queryKey: ['financeiro', 'custo-sanitario', manejoId],
    queryFn: () => chamarApi('custoSanitario:obter', { manejoId }),
    enabled: Boolean(manejoId),
  });
}
export function useClassificacoesOrigem(propriedadeId: string) {
  return useQuery({
    queryKey: ['financeiro', 'classificacao-origem', propriedadeId],
    queryFn: () => chamarApi('classificacaoOrigem:listar', { propriedadeId }),
  });
}
