/**
 * Interpreta número digitado no padrão brasileiro ou internacional:
 * "450", "450,5", "450.5", "1.234,5", "1,234.5". Retorna null se inválido.
 */
export function interpretarNumero(valor: string): number | null {
  let texto = valor.trim().replace(/\s/g, '');
  if (texto === '') return null;
  const temVirgula = texto.includes(',');
  const temPonto = texto.includes('.');
  if (temVirgula && temPonto) {
    // O separador que aparece por último é o decimal.
    if (texto.lastIndexOf(',') > texto.lastIndexOf('.')) {
      texto = texto.replace(/\./g, '').replace(',', '.');
    } else {
      texto = texto.replace(/,/g, '');
    }
  } else if (temVirgula) {
    texto = texto.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) {
    // "1.050" pode ser mil e cinquenta (padrão brasileiro) ou um vírgula zero cinco.
    // Ambíguo: recusar em vez de adivinhar.
    return null;
  }
  if (!/^-?\d+(\.\d+)?$/.test(texto)) return null;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

/** Arredonda para exibição. Cálculos usam o valor completo. */
export function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}
