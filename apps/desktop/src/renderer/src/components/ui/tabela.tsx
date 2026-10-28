import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Tabela({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
      <table className={cn('w-full text-sm', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function Cabeca({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-superficie-2 text-left text-xs text-texto-suave">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-3 py-2 font-medium whitespace-nowrap', className)} {...props} />;
}

export function Linha({
  className,
  clicavel,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { clicavel?: boolean }) {
  return (
    <tr
      className={cn(
        'border-t border-borda',
        clicavel && 'cursor-pointer hover:bg-superficie-2',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2', className)} {...props} />;
}

export function LinhaVazia({ colunas, children }: { colunas: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colunas} className="px-3 py-10 text-center text-texto-suave">
        {children}
      </td>
    </tr>
  );
}
