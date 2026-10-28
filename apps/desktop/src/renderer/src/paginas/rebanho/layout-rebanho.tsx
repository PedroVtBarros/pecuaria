import { MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import type { Propriedade } from '@pecuaria/shared-types';
import { usePropriedadeAtual } from '../../hooks/use-propriedade-atual';
import { cn } from '../../lib/utils';
import { Botao } from '../../components/ui/botao';
import { EstadoVazio } from '../../components/ui/pagina';

const ABAS = [
  { para: '/rebanho/animais', rotulo: 'Animais' },
  { para: '/rebanho/lotes', rotulo: 'Lotes' },
  { para: '/rebanho/areas', rotulo: 'Áreas' },
  { para: '/rebanho/propriedades', rotulo: 'Propriedades' },
  { para: '/rebanho/racas', rotulo: 'Raças' },
  { para: '/rebanho/importar', rotulo: 'Importar planilha' },
];

export function LayoutRebanho() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-8">
      <nav
        aria-label="Seções do rebanho"
        className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-borda [scrollbar-width:thin]"
      >
        {ABAS.map((aba) => (
          <NavLink
            key={aba.para}
            to={aba.para}
            className={({ isActive }) =>
              cn(
                '-mb-px border-b-2 px-4 py-2 text-sm whitespace-nowrap transition-colors',
                isActive
                  ? 'border-marca font-medium text-texto'
                  : 'border-transparent text-texto-suave hover:text-texto',
              )
            }
          >
            {aba.rotulo}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

/** Mostra o conteúdo só quando há uma propriedade escolhida. */
export function ComPropriedade({
  children,
}: {
  children: (propriedade: Propriedade) => ReactNode;
}) {
  const { propriedade, carregando } = usePropriedadeAtual();
  if (carregando) return null;
  if (!propriedade) {
    return (
      <EstadoVazio
        icone={MapPin}
        titulo="Cadastre sua primeira propriedade"
        descricao="Animais, lotes e áreas pertencem a uma propriedade. Comece cadastrando a fazenda ou sítio."
        acao={
          <Link to="/rebanho/propriedades?nova=1">
            <Botao>Cadastrar propriedade</Botao>
          </Link>
        }
      />
    );
  }
  return <>{children(propriedade)}</>;
}
