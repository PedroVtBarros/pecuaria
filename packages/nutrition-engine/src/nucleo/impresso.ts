/**
 * Comparação com valor impresso no livro (decisão C8 ajustada): tolerância de meia unidade do
 * último algarismo impresso daquele valor; o cálculo usa precisão integral. Ex.: "144,2" aceita
 * de 144,15 a 144,25; "0,963" aceita de 0,9625 a 0,9635.
 */
export function lerImpresso(impresso: string): { valor: number; tolerancia: number } {
  const t = impresso.trim();
  if (!/^-?\d+(,\d+)?$/.test(t)) throw new Error(`Valor impresso inválido: "${impresso}".`);
  const casas = t.includes(',') ? t.split(',')[1]!.length : 0;
  return { valor: Number(t.replace(',', '.')), tolerancia: 0.5 * 10 ** -casas };
}

/** O valor calculado arredonda para o impresso? Pequena folga só para o ruído binário. */
export function confereImpresso(calculado: number, impresso: string): boolean {
  const { valor, tolerancia } = lerImpresso(impresso);
  return Math.abs(calculado - valor) <= tolerancia * (1 + 1e-9);
}
