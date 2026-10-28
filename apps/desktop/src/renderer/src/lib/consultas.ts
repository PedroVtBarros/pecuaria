import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PastaAbrivel, ValorJson } from '@pecuaria/shared-types';
import { chamarApi } from './api';

export const chaves = {
  infoSistema: ['sistema', 'info'] as const,
  backups: ['backups'] as const,
  configuracao: (chave: string) => ['configuracao', chave] as const,
};

export function useInfoSistema() {
  return useQuery({
    queryKey: chaves.infoSistema,
    queryFn: () => chamarApi('sistema:obterInfo', {}),
  });
}

export function useConfiguracao(chave: string) {
  return useQuery({
    queryKey: chaves.configuracao(chave),
    queryFn: async () => (await chamarApi('configuracao:obter', { chave })).valor,
  });
}

export function useDefinirConfiguracao() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (dados: { chave: string; valor: ValorJson }) =>
      chamarApi('configuracao:definir', dados),
    onSuccess: (_resultado, dados) => {
      cliente.setQueryData(chaves.configuracao(dados.chave), dados.valor);
    },
  });
}

export function useBackups() {
  return useQuery({
    queryKey: chaves.backups,
    queryFn: () => chamarApi('backup:listar', {}),
  });
}

export function useCriarBackup() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (observacao?: string) =>
      chamarApi('backup:criar', observacao ? { observacao } : {}),
    onSuccess: () => cliente.invalidateQueries({ queryKey: chaves.backups }),
  });
}

/** Depois de restaurar, todos os dados exibidos podem ter mudado. */
export function useRestaurarBackup() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chamarApi('backup:restaurar', { id }),
    onSuccess: () => cliente.invalidateQueries(),
  });
}

export function useImportarERestaurar() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () => chamarApi('backup:importarERestaurar', {}),
    onSuccess: (resultado) => {
      if (!resultado.cancelado) void cliente.invalidateQueries();
    },
  });
}

export function useExportarBackup() {
  return useMutation({
    mutationFn: (id: string) => chamarApi('backup:exportar', { id }),
  });
}

export function useAbrirPasta() {
  return useMutation({
    mutationFn: (pasta: PastaAbrivel) => chamarApi('sistema:abrirPasta', { pasta }),
  });
}
