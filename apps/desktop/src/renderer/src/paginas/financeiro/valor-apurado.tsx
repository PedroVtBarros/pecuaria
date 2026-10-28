import type { Apuracao } from '@pecuaria/domain';
import { moeda } from '../../textos-financeiro';

export const estadosApuracao = {
  completa: 'Completo',
  parcial: 'Parcial: há custo sem valor',
  desconhecida: 'Custo desconhecido',
  nao_apurada: 'Não apurado',
} as const;

/** Valor com o estado: "no mínimo" quando parcial, "custo desconhecido" quando nada é conhecido. */
export function ValorApurado({ a }: { a: Apuracao }) {
  if (a.estado === 'desconhecida') return <>Custo desconhecido</>;
  if (a.estado === 'nao_apurada') return <>—</>;
  return (
    <>
      {a.estado === 'parcial' ? 'no mínimo ' : ''}
      {moeda(a.valorConhecidoCentavos)}
    </>
  );
}
