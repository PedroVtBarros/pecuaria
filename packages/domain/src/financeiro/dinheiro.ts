/**
 * Dinheiro em centavos inteiros (CLAUDE.md, regra 4). Nenhuma função aqui usa ponto flutuante
 * para valores monetários: o texto digitado é interpretado por análise de caracteres.
 */
export const CENTAVOS_MAXIMO = 1_000_000_000_000;

export function ehCentavos(valor: unknown): valor is number {
  return (
    typeof valor === 'number' &&
    Number.isSafeInteger(valor) &&
    valor >= 0 &&
    valor <= CENTAVOS_MAXIMO
  );
}
export function ehCentavosPositivos(valor: unknown): valor is number {
  return ehCentavos(valor) && valor > 0;
}

/** Soma exata. Recusa resultado fora do intervalo seguro. */
export function somarCentavos(valores: readonly number[]): number {
  let total = 0n;
  for (const v of valores) {
    if (!Number.isSafeInteger(v)) throw new Error('Valor monetário inválido.');
    total += BigInt(v);
  }
  const n = Number(total);
  if (!Number.isSafeInteger(n)) throw new Error('A soma excede o limite de precisão.');
  return n;
}

const GRUPOS_MILHAR = /^\d{1,3}(\.\d{3})+$/;

/**
 * Interpreta valor digitado em reais e devolve centavos, ou null se inválido ou ambíguo.
 * Aceita "R$ 1.234,56", "1234,56", "1234.56", "10", "0,5". Recusa mais de duas casas
 * decimais, sinal negativo e "1.234" sozinho (pode ser mil duzentos e trinta e quatro ou
 * um vírgula dois três quatro). Zero é aceito; quem exige valor positivo valida depois.
 */
export function interpretarCentavos(texto: string): number | null {
  const limpo = texto.replace(/R\$/gi, '').replace(/\s/g, '');
  if (limpo === '') return null;
  let inteiro: string;
  let fracao = '';
  if (limpo.includes(',')) {
    const partes = limpo.split(',');
    if (partes.length !== 2) return null;
    const [parteInteira, parteDecimal] = partes as [string, string];
    if (!/^\d{1,2}$/.test(parteDecimal)) return null;
    if (!/^\d+$/.test(parteInteira) && !GRUPOS_MILHAR.test(parteInteira)) return null;
    inteiro = parteInteira.replace(/\./g, '');
    fracao = parteDecimal;
  } else if (limpo.includes('.')) {
    if (/^\d+\.\d{1,2}$/.test(limpo)) {
      [inteiro, fracao] = limpo.split('.') as [string, string];
    } else {
      // "1.234" ou "1.234.567": ambíguo ou inválido; nunca adivinhar.
      return null;
    }
  } else if (/^\d+$/.test(limpo)) {
    inteiro = limpo;
  } else {
    return null;
  }
  const centavos = BigInt(inteiro) * 100n + BigInt(fracao.padEnd(2, '0'));
  if (centavos > BigInt(CENTAVOS_MAXIMO)) return null;
  return Number(centavos);
}

/** "1.234,56" a partir de centavos. Sem símbolo; aceita valor negativo (saldos). */
export function formatarCentavosSemSimbolo(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) throw new Error('Valor monetário inválido.');
  const negativo = centavos < 0;
  const absoluto = Math.abs(centavos);
  const reais = Math.floor(absoluto / 100);
  const resto = String(absoluto % 100).padStart(2, '0');
  const agrupado = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}${agrupado},${resto}`;
}

/** "R$ 1.234,56". */
export function formatarCentavos(centavos: number): string {
  const texto = formatarCentavosSemSimbolo(centavos);
  return texto.startsWith('-') ? `-R$ ${texto.slice(1)}` : `R$ ${texto}`;
}
