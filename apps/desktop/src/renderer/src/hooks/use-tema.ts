import { useEffect } from 'react';
import { TEMAS_INTERFACE, type TemaInterface } from '@pecuaria/shared-types';
import { useConfiguracao, useDefinirConfiguracao } from '../lib/consultas';

export const CHAVE_TEMA = 'interface.tema';
const CHAVE_CACHE_LOCAL = 'pecuaria.tema';

function ehTema(valor: unknown): valor is TemaInterface {
  return typeof valor === 'string' && (TEMAS_INTERFACE as readonly string[]).includes(valor);
}

/** Cache local só para evitar o "piscar" do tema na abertura. A fonte de verdade é o banco. */
function lerCacheLocal(): TemaInterface | null {
  try {
    const valor = localStorage.getItem(CHAVE_CACHE_LOCAL);
    return ehTema(valor) ? valor : null;
  } catch {
    return null;
  }
}

function gravarCacheLocal(tema: TemaInterface): void {
  try {
    localStorage.setItem(CHAVE_CACHE_LOCAL, tema);
  } catch {
    // armazenamento indisponível: sem problema
  }
}

export function aplicarTemaNoDocumento(tema: TemaInterface): void {
  const escuro =
    tema === 'escuro' ||
    (tema === 'sistema' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
  document.documentElement.classList.toggle('dark', Boolean(escuro));
  document.documentElement.dataset['tema'] = tema;
}

export function aplicarTemaInicial(): void {
  aplicarTemaNoDocumento(lerCacheLocal() ?? 'sistema');
}

export function useTema(): {
  tema: TemaInterface;
  definirTema: (tema: TemaInterface) => void;
  salvando: boolean;
} {
  const consulta = useConfiguracao(CHAVE_TEMA);
  const definir = useDefinirConfiguracao();
  const tema: TemaInterface = ehTema(consulta.data)
    ? consulta.data
    : (lerCacheLocal() ?? 'sistema');

  useEffect(() => {
    aplicarTemaNoDocumento(tema);
    if (consulta.isSuccess) gravarCacheLocal(tema);
    if (tema !== 'sistema') return;
    const midia = window.matchMedia?.('(prefers-color-scheme: dark)');
    const aoMudar = (): void => aplicarTemaNoDocumento('sistema');
    midia?.addEventListener('change', aoMudar);
    return () => midia?.removeEventListener('change', aoMudar);
  }, [tema, consulta.isSuccess]);

  return {
    tema,
    definirTema: (novo) => definir.mutate({ chave: CHAVE_TEMA, valor: novo }),
    salvando: definir.isPending,
  };
}
