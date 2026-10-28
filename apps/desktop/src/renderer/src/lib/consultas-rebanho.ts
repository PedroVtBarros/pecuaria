import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type { CanalApi, EntradaApi, FiltrosAnimal, FiltrosManejo } from '@pecuaria/shared-types';
import { chamarApi } from './api';

/** Chaves de cache do rebanho. Qualquer escrita invalida o prefixo 'rebanho'. */
export const chavesRebanho = {
  tudo: ['rebanho'] as const,
  propriedades: ['rebanho', 'propriedades'] as const,
  areas: (propriedadeId: string) => ['rebanho', 'areas', propriedadeId] as const,
  racas: ['rebanho', 'racas'] as const,
  lotes: (propriedadeId: string, incluirEncerrados: boolean) =>
    ['rebanho', 'lotes', propriedadeId, incluirEncerrados] as const,
  lote: (id: string) => ['rebanho', 'lote', id] as const,
  animais: (propriedadeId: string, filtros: FiltrosAnimal) =>
    ['rebanho', 'animais', propriedadeId, filtros] as const,
  animal: (id: string) => ['rebanho', 'animal', id] as const,
  pesagens: (animalId: string) => ['rebanho', 'pesagens', animalId] as const,
  historico: (animalId: string) => ['rebanho', 'historico', animalId] as const,
  evolucaoLote: (loteId: string) => ['rebanho', 'evolucao', loteId] as const,
  alertasPesagem: (propriedadeId: string, incluirConferidas: boolean) =>
    ['rebanho', 'alertas', propriedadeId, incluirConferidas] as const,
  produtos: ['rebanho', 'produtos'] as const,
  manejos: (propriedadeId: string, filtros: FiltrosManejo) =>
    ['rebanho', 'manejos', propriedadeId, filtros] as const,
  manejo: (id: string) => ['rebanho', 'manejo', id] as const,
  sanidadeAnimal: (animalId: string) => ['rebanho', 'sanidade', animalId] as const,
  agenda: (propriedadeId: string, incluirConcluidos: boolean) =>
    ['rebanho', 'agenda', propriedadeId, incluirConcluidos] as const,
  resumoSanidade: (propriedadeId: string) => ['rebanho', 'resumo-sanidade', propriedadeId] as const,
};

export function useEvolucaoLote(loteId: string) {
  return useQuery({
    queryKey: chavesRebanho.evolucaoLote(loteId),
    queryFn: () => chamarApi('lote:evolucao', { id: loteId }),
  });
}

export function useAlertasPesagem(propriedadeId: string | null, incluirConferidas = false) {
  return useQuery({
    queryKey: chavesRebanho.alertasPesagem(propriedadeId ?? '', incluirConferidas),
    queryFn: () =>
      chamarApi('pesagem:alertas', { propriedadeId: propriedadeId!, incluirConferidas }),
    enabled: propriedadeId !== null,
  });
}

export function useProdutosSanitarios() {
  return useQuery({
    queryKey: chavesRebanho.produtos,
    queryFn: () => chamarApi('produtoSanitario:listar', {}),
  });
}

export function useManejos(propriedadeId: string | null, filtros: FiltrosManejo) {
  return useQuery({
    queryKey: chavesRebanho.manejos(propriedadeId ?? '', filtros),
    queryFn: () => chamarApi('manejoSanitario:listar', { propriedadeId: propriedadeId!, filtros }),
    enabled: propriedadeId !== null,
    placeholderData: keepPreviousData,
  });
}

export function useManejo(id: string) {
  return useQuery({
    queryKey: chavesRebanho.manejo(id),
    queryFn: () => chamarApi('manejoSanitario:obter', { id }),
  });
}

export function useSanidadeAnimal(animalId: string) {
  return useQuery({
    queryKey: chavesRebanho.sanidadeAnimal(animalId),
    queryFn: () => chamarApi('sanidade:doAnimal', { animalId }),
  });
}

export function useAgenda(propriedadeId: string | null, incluirConcluidos = false) {
  return useQuery({
    queryKey: chavesRebanho.agenda(propriedadeId ?? '', incluirConcluidos),
    queryFn: () =>
      chamarApi('agendaSanitaria:listar', { propriedadeId: propriedadeId!, incluirConcluidos }),
    enabled: propriedadeId !== null,
  });
}

export function useResumoSanidade(propriedadeId: string | null) {
  return useQuery({
    queryKey: chavesRebanho.resumoSanidade(propriedadeId ?? ''),
    queryFn: () => chamarApi('sanidade:resumo', { propriedadeId: propriedadeId! }),
    enabled: propriedadeId !== null,
  });
}

export function usePropriedades() {
  return useQuery({
    queryKey: chavesRebanho.propriedades,
    queryFn: () => chamarApi('propriedade:listar', {}),
  });
}

export function useAreas(propriedadeId: string | null) {
  return useQuery({
    queryKey: chavesRebanho.areas(propriedadeId ?? ''),
    queryFn: () => chamarApi('area:listar', { propriedadeId: propriedadeId! }),
    enabled: propriedadeId !== null,
  });
}

export function useRacas() {
  return useQuery({ queryKey: chavesRebanho.racas, queryFn: () => chamarApi('raca:listar', {}) });
}

export function useLotes(propriedadeId: string | null, incluirEncerrados = false) {
  return useQuery({
    queryKey: chavesRebanho.lotes(propriedadeId ?? '', incluirEncerrados),
    queryFn: () => chamarApi('lote:listar', { propriedadeId: propriedadeId!, incluirEncerrados }),
    enabled: propriedadeId !== null,
  });
}

export function useLote(id: string) {
  return useQuery({
    queryKey: chavesRebanho.lote(id),
    queryFn: () => chamarApi('lote:obter', { id }),
  });
}

export function useAnimais(propriedadeId: string | null, filtros: FiltrosAnimal) {
  return useQuery({
    queryKey: chavesRebanho.animais(propriedadeId ?? '', filtros),
    queryFn: () => chamarApi('animal:listar', { propriedadeId: propriedadeId!, filtros }),
    enabled: propriedadeId !== null,
    placeholderData: keepPreviousData,
  });
}

export function useAnimal(id: string, habilitado = true) {
  return useQuery({
    queryKey: chavesRebanho.animal(id),
    queryFn: () => chamarApi('animal:obter', { id }),
    enabled: habilitado,
  });
}

export function usePesagens(animalId: string) {
  return useQuery({
    queryKey: chavesRebanho.pesagens(animalId),
    queryFn: () => chamarApi('pesagem:listar', { animalId }),
  });
}

export function useHistoricoAnimal(animalId: string) {
  return useQuery({
    queryKey: chavesRebanho.historico(animalId),
    queryFn: () => chamarApi('animal:historico', { id: animalId }),
  });
}

/**
 * Mutação genérica de qualquer canal do rebanho. Depois de gravar, invalida
 * todo o cache do rebanho: os dados são locais e a consulta é rápida, então
 * preferimos simplicidade a invalidações finas que podem esquecer algo.
 */
export function useAcaoRebanho<C extends CanalApi>(canal: C) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (entrada: EntradaApi<C>) => chamarApi(canal, entrada),
    onSuccess: () => cliente.invalidateQueries(),
  });
}
