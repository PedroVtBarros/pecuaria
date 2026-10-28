import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const estilos = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      variante: {
        primario: 'bg-marca text-sobre-marca hover:bg-marca-forte',
        secundario: 'border border-borda bg-superficie text-texto hover:bg-superficie-2',
        fantasma: 'text-texto hover:bg-superficie-2',
        perigo: 'bg-perigo text-white hover:opacity-90',
      },
      tamanho: {
        normal: 'h-9 px-4',
        pequeno: 'h-8 px-3 text-xs',
        icone: 'h-9 w-9',
      },
    },
    defaultVariants: { variante: 'primario', tamanho: 'normal' },
  },
);

export interface BotaoProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof estilos> {
  carregando?: boolean;
}

export function Botao({
  className,
  variante,
  tamanho,
  carregando = false,
  disabled,
  children,
  type = 'button',
  ...props
}: BotaoProps) {
  return (
    <button
      type={type}
      className={cn(estilos({ variante, tamanho }), className)}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      {...props}
    >
      {carregando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
