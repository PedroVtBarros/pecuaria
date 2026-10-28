/**
 * Gerador pseudoaleatório determinístico para testes de propriedade (decisão D-K). Algoritmo
 * mulberry32: mesma semente, mesma sequência, em qualquer máquina. Não é criptográfico e não
 * deve ser usado em regra de negócio. Fica no domínio para ser usado por todos os pacotes de teste.
 */
export interface GeradorDeterministico {
  readonly semente: number;
  /** Número em [0, 1). */
  proximo(): number;
  /** Inteiro em [minimo, maximo], extremos incluídos. */
  inteiro(minimo: number, maximo: number): number;
  booleano(probabilidadeVerdadeiro?: number): boolean;
  escolher<T>(itens: readonly T[]): T;
  embaralhar<T>(itens: readonly T[]): T[];
}

/** Sementes fixas usadas por padrão nas suítes. */
export const SEMENTES_PADRAO = [20261016, 7, 424242] as const;

export function criarGeradorDeterministico(semente: number): GeradorDeterministico {
  let estado = semente >>> 0;
  const proximo = (): number => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const inteiro = (minimo: number, maximo: number): number => {
    if (!Number.isInteger(minimo) || !Number.isInteger(maximo) || maximo < minimo)
      throw new Error('Intervalo inválido.');
    return minimo + Math.floor(proximo() * (maximo - minimo + 1));
  };
  return {
    semente,
    proximo,
    inteiro,
    booleano: (p = 0.5) => proximo() < p,
    escolher: (itens) => {
      if (itens.length === 0) throw new Error('Lista vazia.');
      return itens[inteiro(0, itens.length - 1)] as (typeof itens)[number];
    },
    embaralhar: (itens) => {
      const copia = [...itens];
      for (let i = copia.length - 1; i > 0; i--) {
        const j = inteiro(0, i);
        [copia[i], copia[j]] = [
          copia[j] as (typeof copia)[number],
          copia[i] as (typeof copia)[number],
        ];
      }
      return copia;
    },
  };
}
