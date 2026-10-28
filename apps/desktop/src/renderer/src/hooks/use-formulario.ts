import { useCallback, useState } from 'react';
import type { z } from 'zod';
import { interpretarNumero } from '@pecuaria/domain';
import { ErroChamadaApi } from '../lib/api';

export type ErrosCampos = Record<string, string>;

/**
 * Estado de formulário com validação pelo mesmo esquema Zod do contrato IPC.
 * `converter` transforma os valores digitados (texto) no formato do esquema.
 * O processo principal valida de novo; erros dele aparecem em `errosGerais`.
 */
export function useFormulario<V extends Record<string, unknown>, S extends z.ZodType>(opcoes: {
  inicial: V;
  esquema: S;
  converter: (valores: V) => unknown;
  /** Regras extras (entre campos) para feedback imediato. Retorna mensagens. */
  validarExtra?: (dados: z.output<S>) => string[];
}) {
  const [valores, setValores] = useState<V>(opcoes.inicial);
  const [errosCampos, setErrosCampos] = useState<ErrosCampos>({});
  const [errosGerais, setErrosGerais] = useState<string[]>([]);

  const definir = useCallback(<K extends keyof V>(campo: K, valor: V[K]) => {
    setValores((atual) => ({ ...atual, [campo]: valor }));
    setErrosCampos((atual) => {
      if (!((campo as string) in atual)) return atual;
      const { [campo as string]: _removido, ...resto } = atual;
      return resto;
    });
  }, []);

  /** Valida e devolve os dados convertidos, ou null se houver erro. */
  const validar = useCallback((): z.output<S> | null => {
    setErrosGerais([]);
    const resultado = opcoes.esquema.safeParse(opcoes.converter(valores));
    if (!resultado.success) {
      const erros: ErrosCampos = {};
      const gerais: string[] = [];
      for (const problema of resultado.error.issues) {
        // Campo = último nome no caminho (ex.: ['entrada', 'pesoVivoKg'] → 'pesoVivoKg').
        const campo = [...problema.path].reverse().find((p) => typeof p === 'string');
        if (typeof campo === 'string' && !(campo in erros)) erros[campo] = problema.message;
        else if (campo === undefined) gerais.push(problema.message);
      }
      setErrosCampos(erros);
      setErrosGerais(gerais);
      return null;
    }
    const extras = opcoes.validarExtra?.(resultado.data) ?? [];
    if (extras.length > 0) {
      setErrosGerais(extras);
      return null;
    }
    setErrosCampos({});
    return resultado.data;
  }, [opcoes, valores]);

  /** Mostra no formulário um erro vindo do processo principal. */
  const mostrarErroDoServidor = useCallback((erro: unknown) => {
    if (erro instanceof ErroChamadaApi) {
      setErrosGerais(erro.detalhes.length > 0 ? erro.detalhes : [erro.message]);
    } else {
      setErrosGerais([erro instanceof Error ? erro.message : 'Ocorreu um erro inesperado.']);
    }
  }, []);

  return {
    valores,
    definir,
    definirTudo: setValores,
    errosCampos,
    errosGerais,
    validar,
    mostrarErroDoServidor,
  };
}

/**
 * Texto do campo → número, aceitando vírgula ou ponto decimal.
 * Vazio vira null. Inválido ou ambíguo (ex.: "1.050") vira NaN para o esquema acusar.
 */
export function textoParaNumero(texto: string): number | null {
  if (texto.trim() === '') return null;
  return interpretarNumero(texto) ?? Number.NaN;
}

/** Texto vazio → null. */
export function vazioParaNulo(texto: string): string | null {
  return texto.trim() === '' ? null : texto;
}
