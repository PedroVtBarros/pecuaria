import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Sexo } from '@pecuaria/domain';
import { useAnimais } from '../../lib/consultas-rebanho';
import { Entrada } from '../../components/ui/campos';

/**
 * Escolha de um animal da propriedade por busca (usado para mãe e pai).
 * Mostra até 8 resultados por vez, para funcionar com rebanhos grandes.
 */
export function SeletorAnimal({
  id,
  propriedadeId,
  sexo,
  excluirId,
  somenteAtivos = false,
  valor,
  rotuloValor,
  aoMudar,
}: {
  id: string;
  propriedadeId: string;
  sexo?: Sexo | undefined;
  excluirId?: string;
  somenteAtivos?: boolean;
  valor: string;
  rotuloValor: string | null;
  aoMudar: (id: string, rotulo: string | null) => void;
}) {
  const [busca, setBusca] = useState('');
  const [aplicada, setAplicada] = useState('');
  useEffect(() => {
    const espera = window.setTimeout(() => setAplicada(busca), 250);
    return () => window.clearTimeout(espera);
  }, [busca]);
  const resultados = useAnimais(aplicada.trim() ? propriedadeId : null, {
    busca: aplicada.trim(),
    ...(sexo ? { sexo } : {}),
    status: somenteAtivos ? 'ativo' : 'todos',
    tamanhoPagina: 8,
  });

  if (valor) {
    return (
      <div className="flex h-9 items-center justify-between rounded-md border border-borda bg-superficie-2 px-3 text-sm">
        <span>{rotuloValor ?? 'Animal selecionado'}</span>
        <button
          type="button"
          aria-label="Remover"
          className="cursor-pointer text-texto-suave hover:text-texto"
          onClick={() => aoMudar('', null)}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  const opcoes = (resultados.data?.itens ?? []).filter((a) => a.id !== excluirId);
  return (
    <div className="relative">
      <Entrada
        id={id}
        placeholder="Buscar por identificação ou nome"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      {aplicada.trim() && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-borda bg-superficie shadow-lg">
          {opcoes.length === 0 && (
            <li className="px-3 py-2 text-sm text-texto-suave">Nenhum animal encontrado.</li>
          )}
          {opcoes.map((a) => {
            const rotulo = a.nome ? `${a.identificacao} · ${a.nome}` : a.identificacao;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  className="w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-superficie-2"
                  onClick={() => {
                    aoMudar(a.id, rotulo);
                    setBusca('');
                  }}
                >
                  {rotulo}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
