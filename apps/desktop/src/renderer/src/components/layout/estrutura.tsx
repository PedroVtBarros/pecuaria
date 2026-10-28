import { Outlet, useLocation } from 'react-router';
import { ErroLimite } from '../erro-limite';
import { BarraLateral } from './barra-lateral';
import { Cabecalho } from './cabecalho';

export function Estrutura() {
  const { pathname } = useLocation();
  return (
    <div className="flex h-full">
      <BarraLateral />
      <div className="flex min-w-0 flex-1 flex-col">
        <Cabecalho />
        <main className="flex-1 overflow-y-auto">
          <ErroLimite chaveReinicio={pathname}>
            <Outlet />
          </ErroLimite>
        </main>
      </div>
    </div>
  );
}
