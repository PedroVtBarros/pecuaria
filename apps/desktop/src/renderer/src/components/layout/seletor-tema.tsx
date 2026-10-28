import { Monitor, Moon, Sun } from 'lucide-react';
import type { TemaInterface } from '@pecuaria/shared-types';
import { useTema } from '../../hooks/use-tema';
import { textos } from '../../textos';
import { cn } from '../../lib/utils';

const OPCOES: { tema: TemaInterface; icone: typeof Sun }[] = [
  { tema: 'claro', icone: Sun },
  { tema: 'escuro', icone: Moon },
  { tema: 'sistema', icone: Monitor },
];

export function SeletorTema({ comRotulo = false }: { comRotulo?: boolean }) {
  const { tema, definirTema } = useTema();
  return (
    <div
      role="radiogroup"
      aria-label={textos.cabecalho.tema}
      className="inline-flex rounded-lg border border-borda bg-superficie-2 p-0.5"
    >
      {OPCOES.map(({ tema: opcao, icone: Icone }) => {
        const ativo = tema === opcao;
        return (
          <button
            key={opcao}
            type="button"
            role="radio"
            aria-checked={ativo}
            title={textos.tema[opcao]}
            aria-label={textos.tema[opcao]}
            onClick={() => definirTema(opcao)}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
              ativo ? 'bg-superficie text-texto shadow-sm' : 'text-texto-suave hover:text-texto',
            )}
          >
            <Icone className="size-3.5" aria-hidden />
            {comRotulo && <span>{textos.tema[opcao]}</span>}
          </button>
        );
      })}
    </div>
  );
}
