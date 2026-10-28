import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EntradaApi, EntradaAvaliacaoDieta, EntradaExigencias } from '@pecuaria/shared-types';
import { chamarApi } from './api';

/** Cálculo das exigências (Fase 6A-7): nada é gravado, então não invalida consultas. */
export function useCalcularExigencias() {
  return useMutation({
    mutationFn: (entrada: EntradaExigencias) => chamarApi('nutricao:calcularExigencias', entrada),
  });
}

/**
 * Perfis com a elegibilidade de agora (6B-5). Fica sob a chave do banco de alimentos: qualquer
 * gravação lá (conferência, versão nova, perfil novo, aprovação de regra) recarrega o seletor.
 */
export function usePerfisParaDieta() {
  return useQuery({
    queryKey: ['alimentos', 'perfis-para-dieta'],
    queryFn: () => chamarApi('nutricao:perfisParaDieta', {}),
  });
}

/** Simulação: calcula sem gravar. */
export function useAvaliarDieta() {
  return useMutation({
    mutationFn: (entrada: EntradaAvaliacaoDieta) => chamarApi('nutricao:avaliarDieta', entrada),
  });
}

export function useAvaliacoesNutricionais() {
  return useQuery({
    queryKey: ['nutricao', 'avaliacoes'],
    queryFn: () => chamarApi('nutricao:listarAvaliacoes', {}),
  });
}

export function useAvaliacaoNutricional(id: string) {
  return useQuery({
    queryKey: ['nutricao', 'avaliacao', id],
    queryFn: () => chamarApi('nutricao:obterAvaliacao', { id }),
    enabled: Boolean(id),
  });
}

/** Gravação explícita (6B-4): o main recalcula e confere o hash do que a tela exibiu. */
export function useRegistrarAvaliacao() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (d: EntradaApi<'nutricao:registrarAvaliacao'>) =>
      chamarApi('nutricao:registrarAvaliacao', d),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['nutricao'] }),
  });
}

export function useAnularAvaliacao() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (d: EntradaApi<'nutricao:anularAvaliacao'>) =>
      chamarApi('nutricao:anularAvaliacao', d),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['nutricao'] }),
  });
}
