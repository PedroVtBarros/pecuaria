import { NavLink, Outlet } from 'react-router';
import { cn } from '../../lib/utils';

/** Seções da nutrição de corte (6A-7 e 6B-5): exigência, avaliação de dieta e histórico. */
const ABAS = [
  { para: '/nutricao', rotulo: 'Exigências do animal', fim: true },
  { para: '/nutricao/dieta', rotulo: 'Avaliar dieta', fim: false },
  { para: '/nutricao/avaliacoes', rotulo: 'Avaliações gravadas', fim: false },
] as const;

export function LayoutNutricao() {
  return (
    <div className="mx-auto flex min-w-0 max-w-7xl flex-col gap-6 p-8">
      <nav
        aria-label="Seções da nutrição"
        className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-borda [scrollbar-width:thin]"
      >
        {ABAS.map((aba) => (
          <NavLink
            key={aba.para}
            to={aba.para}
            end={aba.fim}
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
