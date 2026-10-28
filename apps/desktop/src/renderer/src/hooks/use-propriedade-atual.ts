import type { Propriedade } from '@pecuaria/shared-types';
import { useConfiguracao, useDefinirConfiguracao } from '../lib/consultas';
import { usePropriedades } from '../lib/consultas-rebanho';

export const CHAVE_PROPRIEDADE_ATUAL = 'interface.propriedadeAtual';

/**
 * Propriedade em uso na interface. A escolha fica salva no banco. Se a
 * escolhida não existir mais, usa a primeira da lista.
 */
export function usePropriedadeAtual(): {
  propriedade: Propriedade | null;
  propriedades: Propriedade[];
  carregando: boolean;
  selecionar: (id: string) => void;
} {
  const lista = usePropriedades();
  const escolhida = useConfiguracao(CHAVE_PROPRIEDADE_ATUAL);
  const definir = useDefinirConfiguracao();
  const propriedades = lista.data ?? [];
  const propriedade = propriedades.find((p) => p.id === escolhida.data) ?? propriedades[0] ?? null;
  return {
    propriedade,
    propriedades,
    carregando: lista.isLoading || escolhida.isLoading,
    selecionar: (id) => definir.mutate({ chave: CHAVE_PROPRIEDADE_ATUAL, valor: id }),
  };
}
