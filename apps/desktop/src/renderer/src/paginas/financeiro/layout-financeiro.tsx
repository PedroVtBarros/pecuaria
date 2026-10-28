import { NavLink, Outlet } from 'react-router';
import { cn } from '../../lib/utils';

const ABAS = [
  { para: '/financeiro', rotulo: 'Painel', fim: true },
  { para: '/financeiro/resultado', rotulo: 'Resultado', fim: false },
  { para: '/financeiro/conciliacao', rotulo: 'Conciliação', fim: false },
  { para: '/financeiro/projecao', rotulo: 'Projeção', fim: false },
  { para: '/financeiro/relatorios', rotulo: 'Relatórios e exportação', fim: false },
  { para: '/financeiro/lancamentos', rotulo: 'Lançamentos', fim: false },
  { para: '/financeiro/animais', rotulo: 'Animais: compras e vendas', fim: false },
  { para: '/financeiro/custo-anterior', rotulo: 'Custo anterior', fim: false },
  { para: '/financeiro/insumos', rotulo: 'Compras de insumos', fim: false },
  { para: '/financeiro/consumo', rotulo: 'Custos de consumo', fim: false },
  { para: '/financeiro/rateio', rotulo: 'Rateio de custos', fim: false },
  { para: '/financeiro/custos', rotulo: 'Custos por lote e animal', fim: false },
  { para: '/financeiro/producao', rotulo: 'Produção própria', fim: false },
  { para: '/financeiro/pendencias', rotulo: 'Pendências', fim: false },
  { para: '/financeiro/fluxo', rotulo: 'Fluxo de caixa', fim: false },
  { para: '/financeiro/contas', rotulo: 'A pagar e a receber', fim: false },
  { para: '/financeiro/classificacoes', rotulo: 'Classificações', fim: false },
  { para: '/financeiro/categorias', rotulo: 'Categorias', fim: false },
  { para: '/financeiro/contrapartes', rotulo: 'Contrapartes', fim: false },
];

export function LayoutFinanceiro() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-8">
      <nav
        aria-label="Seções do financeiro"
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
