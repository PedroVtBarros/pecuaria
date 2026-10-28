import type { ReactNode } from 'react';
import type { CompletudeResultado } from '@pecuaria/shared-types';
import { cn } from '../../lib/utils';

/** Cor do resultado: alerta quando parcial ou não apurado; senão, pelo sinal. */
export const destaqueDoResultado = (
  c: Pick<CompletudeResultado, 'resultadoCentavos' | 'estado'>,
) =>
  c.resultadoCentavos === null || c.estado !== 'completo'
    ? ('alerta' as const)
    : c.resultadoCentavos < 0
      ? ('perigo' as const)
      : ('sucesso' as const);

/** Um número com rótulo. Valor ausente nunca vira zero: quem chama passa o texto já pronto. */
export function Indicador({
  rotulo,
  valor,
  dica,
  destaque,
}: {
  rotulo: string;
  valor: ReactNode;
  dica?: ReactNode;
  destaque?: 'perigo' | 'sucesso' | 'alerta' | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-texto-suave">{rotulo}</dt>
      <dd
        className={cn(
          'text-lg font-semibold whitespace-nowrap',
          destaque === 'perigo' && 'text-perigo',
          destaque === 'sucesso' && 'text-sucesso',
          destaque === 'alerta' && 'text-alerta',
        )}
      >
        {valor}
      </dd>
      {dica && <div className="text-xs text-texto-suave">{dica}</div>}
    </div>
  );
}

/** Grade de indicadores que cabe em janela estreita. */
export function GradeIndicadores({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string | undefined;
}) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4" data-testid={testId}>
      {children}
    </dl>
  );
}
