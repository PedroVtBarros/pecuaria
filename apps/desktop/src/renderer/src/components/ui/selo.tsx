import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const estilos = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tom: {
        neutro: 'bg-superficie-2 text-texto-suave',
        marca: 'bg-marca-suave text-marca',
        sucesso: 'bg-sucesso-suave text-sucesso',
        alerta: 'bg-alerta-suave text-alerta',
        perigo: 'bg-perigo-suave text-perigo',
      },
    },
    defaultVariants: { tom: 'neutro' },
  },
);

export function Selo({
  className,
  tom,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof estilos>) {
  return <span className={cn(estilos({ tom }), className)} {...props} />;
}
