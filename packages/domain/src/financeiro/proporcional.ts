/**
 * Divisão proporcional de dinheiro em centavos inteiros, pelo método do maior resto.
 * É o único lugar do sistema que divide dinheiro (parcelas, rateios, alocação de preço):
 * a soma das partes é sempre igual ao total, sem perda de centavos.
 */
export interface ParteProporcional {
  id: string;
  /** Peso relativo: inteiro seguro positivo (cabeças, animal-dias, gramas, ...). */
  peso: number;
}
export interface ValorDaParte {
  id: string;
  valorCentavos: number;
}

/**
 * Cada parte recebe o piso de `total × peso ÷ soma dos pesos`; os centavos que sobram vão,
 * um a um, às partes de maior resto. Empate de resto: menor `id` (comparação de texto simples,
 * independente de idioma), para o resultado não depender da ordem de entrada. A saída segue
 * a ordem de entrada.
 */
export function dividirProporcional(
  totalCentavos: number,
  partes: readonly ParteProporcional[],
): ValorDaParte[] {
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos < 0)
    throw new Error('O total a dividir deve ser um inteiro não negativo de centavos.');
  if (partes.length === 0) {
    if (totalCentavos === 0) return [];
    throw new Error('Não há para onde distribuir o valor.');
  }
  const ids = new Set<string>();
  for (const p of partes) {
    if (!Number.isSafeInteger(p.peso) || p.peso <= 0)
      throw new Error('Cada peso deve ser um inteiro positivo.');
    if (ids.has(p.id)) throw new Error('Identificador repetido na divisão.');
    ids.add(p.id);
  }
  const total = BigInt(totalCentavos);
  const soma = partes.reduce((acc, p) => acc + BigInt(p.peso), 0n);
  const calculadas = partes.map((p) => {
    const produto = total * BigInt(p.peso);
    return { id: p.id, piso: produto / soma, resto: produto % soma };
  });
  let sobra = total - calculadas.reduce((acc, c) => acc + c.piso, 0n);
  const porResto = [...calculadas].sort((a, b) =>
    a.resto === b.resto ? (a.id < b.id ? -1 : 1) : a.resto > b.resto ? -1 : 1,
  );
  const extra = new Set<string>();
  for (const c of porResto) {
    if (sobra === 0n) break;
    extra.add(c.id);
    sobra -= 1n;
  }
  return calculadas.map((c) => ({
    id: c.id,
    valorCentavos: Number(c.piso + (extra.has(c.id) ? 1n : 0n)),
  }));
}

/** Divisão igual: o caso de pesos todos iguais a 1. */
export function dividirIgual(totalCentavos: number, ids: readonly string[]): ValorDaParte[] {
  return dividirProporcional(
    totalCentavos,
    ids.map((id) => ({ id, peso: 1 })),
  );
}
