import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/utils';

const ESTILO_CONTROLE =
  'w-full rounded-md border border-borda bg-superficie px-3 text-sm text-texto placeholder:text-texto-suave/70 focus:border-marca focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-perigo';

/**
 * Rótulo, controle, ajuda e mensagem de erro. O controle recebe `id`,
 * `aria-invalid` e `aria-describedby` pela função `children`.
 */
export function Campo({
  rotulo,
  erro,
  ajuda,
  obrigatorio,
  className,
  children,
}: {
  rotulo: string;
  erro?: string | undefined;
  ajuda?: ReactNode;
  obrigatorio?: boolean;
  className?: string;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const idMensagem = `${id}-mensagem`;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {rotulo}
        {obrigatorio && (
          <span className="ml-0.5 text-perigo" aria-hidden>
            *
          </span>
        )}
      </label>
      {children({
        id,
        'aria-invalid': Boolean(erro),
        'aria-describedby': erro || ajuda ? idMensagem : undefined,
      })}
      {erro ? (
        <p id={idMensagem} className="text-xs text-perigo">
          {erro}
        </p>
      ) : ajuda ? (
        <p id={idMensagem} className="text-xs text-texto-suave">
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}

export function Entrada({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(ESTILO_CONTROLE, 'h-9', className)} {...props} />;
}

export function Selecao({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(ESTILO_CONTROLE, 'h-9 cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function AreaTexto({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(ESTILO_CONTROLE, 'min-h-20 py-2', className)} {...props} />;
}

export function CaixaMarcar({
  rotulo,
  marcado,
  aoMudar,
  disabled,
}: {
  rotulo: string;
  marcado: boolean;
  aoMudar: (marcado: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-texto">
      <input
        type="checkbox"
        className="size-4 cursor-pointer accent-marca"
        checked={marcado}
        disabled={disabled}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      {rotulo}
    </label>
  );
}

/** Opções de um <select> a partir de um mapa código → rótulo. */
export function opcoesDe<T extends string>(rotulos: Record<T, string>, codigos?: readonly T[]) {
  return (codigos ?? (Object.keys(rotulos) as T[])).map((codigo) => (
    <option key={codigo} value={codigo}>
      {rotulos[codigo]}
    </option>
  ));
}
