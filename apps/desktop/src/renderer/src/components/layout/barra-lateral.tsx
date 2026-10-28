import { Leaf } from 'lucide-react';
import { NavLink } from 'react-router';
import { MODULOS, type GrupoModulo } from '../../modulos';
import { textos } from '../../textos';
import { cn } from '../../lib/utils';

const ORDEM_GRUPOS: GrupoModulo[] = [
  'inicio',
  'rebanho',
  'gestao',
  'nutricao',
  'analise',
  'sistema',
];

export function BarraLateral() {
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-lateral text-lateral-texto">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-lateral-ativo text-white">
          <Leaf className="size-5" aria-hidden />
        </div>
        <div className="leading-tight">
          <p className="font-semibold text-white">{textos.app.nome}</p>
          <p className="text-xs opacity-70">{textos.app.subtitulo}</p>
        </div>
      </div>

      <nav aria-label="Módulos" className="flex-1 overflow-y-auto px-3 pb-4">
        {ORDEM_GRUPOS.map((grupo) => {
          const modulos = MODULOS.filter((m) => m.grupo === grupo);
          if (modulos.length === 0) return null;
          return (
            <div key={grupo} className="mb-4">
              <p className="px-2 pb-1 text-[11px] font-semibold tracking-wider uppercase opacity-50">
                {textos.navegacao.grupos[grupo]}
              </p>
              <ul className="flex flex-col gap-0.5">
                {modulos.map((m) => (
                  <li key={m.id}>
                    <NavLink
                      to={m.rota}
                      end={m.rota === '/'}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-lateral-ativo text-white'
                            : 'hover:bg-white/5 hover:text-white',
                        )
                      }
                    >
                      <m.icone className="size-4 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{m.titulo}</span>
                      {m.fase && (
                        <span className="text-[10px] whitespace-nowrap opacity-50">
                          {m.fase.replace('Fases ', 'F').replace('Fase ', 'F').replace(' e ', '/')}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
