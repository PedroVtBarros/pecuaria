import { NavLink, Outlet } from 'react-router';
import { cn } from '../../lib/utils';

const ABAS = [
  { para: '/manejo/agenda', rotulo: 'Agenda e alertas' },
  { para: '/manejo/sanidade', rotulo: 'Registros sanitários' },
  { para: '/manejo/pesagem', rotulo: 'Pesagem em lote' },
  { para: '/manejo/alertas', rotulo: 'Alertas de pesagem' },
  { para: '/manejo/produtos', rotulo: 'Produtos' },
];

export function LayoutManejo() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-8">
      <nav
        aria-label="Seções de sanidade e manejo"
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
