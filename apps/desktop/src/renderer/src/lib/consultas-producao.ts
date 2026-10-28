import { useQuery } from '@tanstack/react-query';
import { chamarApi } from './api';

export function useCentrosProducao(propriedadeId: string, incluirCancelados: boolean) {
  return useQuery({
    queryKey: ['financeiro', 'producao', propriedadeId, incluirCancelados],
    queryFn: () => chamarApi('producao:listar', { propriedadeId, incluirCancelados }),
  });
}
export function useCentroProducao(id: string) {
  return useQuery({
    queryKey: ['financeiro', 'producao-centro', id],
    queryFn: () => chamarApi('producao:obter', { id }),
    enabled: Boolean(id),
  });
}
export function useCandidatosCentro(id: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['financeiro', 'producao-candidatos', id],
    queryFn: () => chamarApi('producao:candidatos', { id }),
    enabled: habilitado && Boolean(id),
  });
}
