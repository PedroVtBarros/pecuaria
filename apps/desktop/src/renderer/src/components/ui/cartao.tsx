import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Cartao({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn('rounded-xl border border-borda bg-superficie shadow-sm', className)}
      {...props}
    />
  );
}

export function CartaoCabecalho({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 px-5 pt-5', className)} {...props} />;
}

export function CartaoTitulo({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-semibold text-texto', className)} {...props} />;
}

export function CartaoDescricao({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-texto-suave', className)} {...props} />;
}

export function CartaoConteudo({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-5', className)} {...props} />;
}
