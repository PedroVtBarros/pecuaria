import type { Unidade } from './unidades';

/*
 * Números em mensagens (motivos e avisos) para leitura em português: vírgula decimal, milhar com
 * ponto e casas conforme a grandeza. Só o texto muda: o valor guardado no resultado continua em
 * precisão integral.
 */

const casasPadrao = (v: number) => (Math.abs(v) >= 100 ? 1 : Math.abs(v) >= 1 ? 2 : 3);
const pt = (v: number, casas: number) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Limite publicado (faixa de domínio), sem arredondar além do que foi publicado. */
export const formatarLimite = (v: number) => pt(v, 6);

/**
 * Valor calculado, com as casas da grandeza; se arredondado ele parecer igual a um limite de que
 * difere, ganha casas até se distinguir (ex.: 469,03 fora de "até 469").
 */
export function formatarValor(v: number, limites: readonly number[] = []): string {
  for (let casas = casasPadrao(v); casas <= 6; casas++) {
    const texto = pt(v, casas);
    if (!limites.some((l) => l !== v && formatarLimite(l) === texto)) return texto;
  }
  return pt(v, 6);
}

const UNIDADE_LEGIVEL: Partial<Record<Unidade, string>> = {
  '% MS': '% da MS',
  '% PB': '% da PB',
  'kg MN/dia': 'kg de MN/dia',
  'kg MS/dia': 'kg de MS/dia',
  fração: '',
  adimensional: '',
};

/** Número seguido da unidade (sem unidade para fração e adimensional). */
export function comUnidade(texto: string, unidade: Unidade): string {
  const u = UNIDADE_LEGIVEL[unidade] ?? unidade;
  return u ? `${texto} ${u}` : texto;
}
