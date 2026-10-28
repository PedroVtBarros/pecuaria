/**
 * Unidades explícitas do motor. Toda entrada e toda saída de equação leva a unidade junto do
 * número; o motor recusa valor com unidade diferente da declarada pela equação. Não há conversão
 * automática: conversão é equação registrada, com fonte.
 */
export const UNIDADES = [
  'kg',
  'kg/dia',
  /** Quantidade de alimento por cabeça e dia em matéria natural ou seca (6B; MN e MS não somam). */
  'kg MN/dia',
  'kg MS/dia',
  'g/dia',
  'mg/dia',
  'Mcal/dia',
  'Mcal/kg MS',
  '% MS',
  '% PB',
  '%',
  'fração',
  'adimensional',
] as const;
export type Unidade = (typeof UNIDADES)[number];

export interface Quantidade {
  valor: number;
  unidade: Unidade;
}

export const q = (valor: number, unidade: Unidade): Quantidade => ({ valor, unidade });

export class ErroUnidade extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroUnidade';
  }
}

/** Recusa unidade diferente da esperada e número não finito. */
export function exigirUnidade(nome: string, x: Quantidade, esperada: Unidade): number {
  if (x.unidade !== esperada)
    throw new ErroUnidade(`${nome}: unidade ${x.unidade}, esperada ${esperada}.`);
  if (!Number.isFinite(x.valor)) throw new ErroUnidade(`${nome}: valor não numérico.`);
  return x.valor;
}
