import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

const configuracao = {
  info: { icone: Info, classes: 'border-borda bg-superficie-2 text-texto' },
  sucesso: { icone: CircleCheck, classes: 'border-transparent bg-sucesso-suave text-sucesso' },
  alerta: { icone: TriangleAlert, classes: 'border-transparent bg-alerta-suave text-alerta' },
  perigo: { icone: CircleAlert, classes: 'border-transparent bg-perigo-suave text-perigo' },
} as const;

export function Alerta({
  tom = 'info',
  titulo,
  children,
  className,
}: {
  tom?: keyof typeof configuracao;
  titulo?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { icone: Icone, classes } = configuracao[tom];
  return (
    <div
      role={tom === 'perigo' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', classes, className)}
    >
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex flex-col gap-1">
        {titulo && <p className="font-medium">{titulo}</p>}
        {children && <div className="text-texto-suave">{children}</div>}
      </div>
    </div>
  );
}
