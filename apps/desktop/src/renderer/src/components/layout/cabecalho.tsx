import { MapPin, Plus } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { usePropriedadeAtual } from '../../hooks/use-propriedade-atual';
import { moduloPorRota } from '../../modulos';
import { textos } from '../../textos';
import { SeletorTema } from './seletor-tema';

function SeletorPropriedade() {
  const { propriedade, propriedades, carregando, selecionar } = usePropriedadeAtual();
  if (carregando) return null;
  if (propriedades.length === 0) {
    return (
      <Link
        to="/rebanho/propriedades?nova=1"
        className="flex h-9 items-center gap-2 rounded-md border border-dashed border-borda px-3 text-sm text-texto-suave hover:border-marca hover:text-marca"
      >
        <Plus className="size-4" aria-hidden />
        Cadastrar propriedade
      </Link>
    );
  }
  return (
    <label className="flex h-9 min-w-56 items-center gap-2 rounded-md border border-borda bg-superficie-2 px-3 text-sm">
      <MapPin className="size-4 text-marca" aria-hidden />
      <span className="sr-only">{textos.cabecalho.propriedade}</span>
      <select
        aria-label={textos.cabecalho.propriedade}
        className="flex-1 cursor-pointer bg-transparent text-texto focus:outline-none"
        value={propriedade?.id ?? ''}
        onChange={(e) => selecionar(e.target.value)}
      >
        {propriedades.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Cabecalho() {
  const { pathname } = useLocation();
  const modulo = moduloPorRota(pathname);

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-borda bg-superficie px-6">
      <h1 className="flex-1 truncate text-lg font-semibold">{modulo?.titulo ?? textos.app.nome}</h1>
      <SeletorPropriedade />
      <SeletorTema />
    </header>
  );
}
