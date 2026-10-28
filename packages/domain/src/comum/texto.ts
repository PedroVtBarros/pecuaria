/** Remove espaços nas pontas e junta espaços repetidos. Texto vazio vira null. */
export function limparTexto(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const limpo = valor.normalize('NFC').replace(/\s+/g, ' ').trim();
  return limpo === '' ? null : limpo;
}

/**
 * Chave de comparação para nomes (propriedade, lote, área, raça):
 * sem diferença de maiúsculas, espaços extras ou forma Unicode.
 * Acentos são mantidos: "Pasto São João" e "Pasto Sao Joao" são nomes diferentes.
 */
export function normalizarNome(valor: string): string {
  return (limparTexto(valor) ?? '').toLocaleLowerCase('pt-BR');
}

/**
 * Chave de comparação para identificação de animal (brinco, chip, tatuagem):
 * sem diferença de maiúsculas e espaços. "br 001" e "BR001" são diferentes,
 * mas "br 001" e "BR 001" são a mesma identificação.
 */
export function normalizarIdentificacao(valor: string): string {
  return (limparTexto(valor) ?? '').toLocaleUpperCase('pt-BR');
}

/** Remove acentos para comparar palavras digitadas pelo usuário (ex.: "fêmea" = "femea"). */
export function semAcentos(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
