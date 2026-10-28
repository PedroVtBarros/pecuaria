import { CENTAVOS_MAXIMO, somarCentavos } from './dinheiro';
import { QUILOS_POR_ARROBA } from './enumeracoes';
import { dividirIgual, dividirProporcional, type ValorDaParte } from './proporcional';

/**
 * Alocação do valor de uma compra ou venda de animais entre os animais (decisão D-D).
 * O critério padrão vem da unidade em que o preço foi negociado e nunca é adivinhado: se o
 * critério pede peso e algum animal não o tem, a alocação é recusada em vez de cair em "igual".
 * Pesos em gramas inteiros; a divisão usa o maior resto e a soma das partes é sempre o total.
 */
export const CRITERIOS_ALOCACAO = ['igual', 'peso_vivo', 'peso_carcaca', 'manual'] as const;
export type CriterioAlocacao = (typeof CRITERIOS_ALOCACAO)[number];

/** `total`: só o valor da operação foi informado, sem preço unitário. */
export const UNIDADES_PRECO = [
  'total',
  'cabeca',
  'kg_vivo',
  'arroba_vivo',
  'arroba_carcaca',
] as const;
export type UnidadePreco = (typeof UNIDADES_PRECO)[number];

/** Peso máximo plausível de um animal em quilos: só barra erro de digitação (não é dado científico). */
export const PESO_MAXIMO_KG = 3000;

/** Critério sugerido para a unidade do preço. O usuário pode trocá-lo conscientemente. */
export function criterioPadraoDaUnidade(unidade: UnidadePreco): CriterioAlocacao {
  if (unidade === 'kg_vivo' || unidade === 'arroba_vivo') return 'peso_vivo';
  if (unidade === 'arroba_carcaca') return 'peso_carcaca';
  return 'igual';
}

/** Quilos (com até três casas) para gramas inteiras, sem erro de ponto flutuante visível. */
export function kgParaGramas(kg: number): number {
  if (!Number.isFinite(kg) || kg <= 0 || kg > PESO_MAXIMO_KG)
    throw new Error(`O peso deve estar entre 0 e ${PESO_MAXIMO_KG} kg.`);
  return Math.round(kg * 1000);
}

export interface AnimalParaAlocar {
  /** Identificador único dentro da operação (id do animal ou chave provisória). */
  id: string;
  /** Rótulo para as mensagens (identificação do animal). */
  rotulo: string;
  pesoVivoG: number | null;
  pesoCarcacaG: number | null;
  /** Só para o critério manual. */
  valorManualCentavos: number | null;
}

export interface ResultadoAlocacao {
  /** Vazio quando há erros. */
  valores: ValorDaParte[];
  erros: string[];
}

/**
 * Distribui `totalCentavos` entre os animais pelo critério escolhido. Nunca devolve valores
 * parciais: ou fecha exatamente no total ou devolve só os erros.
 */
export function alocarPrecoDeAnimais(entrada: {
  totalCentavos: number;
  criterio: CriterioAlocacao;
  animais: readonly AnimalParaAlocar[];
}): ResultadoAlocacao {
  const { totalCentavos, criterio, animais } = entrada;
  const falha = (...erros: string[]): ResultadoAlocacao => ({ valores: [], erros });
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos <= 0 || totalCentavos > CENTAVOS_MAXIMO)
    return falha('O valor total deve ser um valor positivo em centavos.');
  if (animais.length === 0) return falha('Informe ao menos um animal.');
  if (new Set(animais.map((a) => a.id)).size !== animais.length)
    return falha('Há animal repetido na operação.');

  if (criterio === 'igual')
    return {
      valores: dividirIgual(
        totalCentavos,
        animais.map((a) => a.id),
      ),
      erros: [],
    };

  if (criterio === 'manual') {
    const faltando = animais.filter((a) => a.valorManualCentavos === null);
    if (faltando.length > 0)
      return falha(`Informe o valor de: ${faltando.map((a) => a.rotulo).join(', ')}.`);
    const invalidos = animais.filter(
      (a) =>
        !Number.isSafeInteger(a.valorManualCentavos) ||
        (a.valorManualCentavos as number) < 0 ||
        (a.valorManualCentavos as number) > CENTAVOS_MAXIMO,
    );
    if (invalidos.length > 0)
      return falha(`Valor inválido para: ${invalidos.map((a) => a.rotulo).join(', ')}.`);
    const soma = somarCentavos(animais.map((a) => a.valorManualCentavos as number));
    if (soma !== totalCentavos)
      return falha(
        `A soma dos valores informados (${soma} centavos) deve ser exatamente o valor total (${totalCentavos} centavos); diferença de ${totalCentavos - soma} centavos.`,
      );
    return {
      valores: animais.map((a) => ({ id: a.id, valorCentavos: a.valorManualCentavos as number })),
      erros: [],
    };
  }

  const campo = criterio === 'peso_vivo' ? 'pesoVivoG' : 'pesoCarcacaG';
  const nome = criterio === 'peso_vivo' ? 'peso vivo' : 'peso de carcaça';
  const semPeso = animais.filter((a) => a[campo] === null || (a[campo] as number) <= 0);
  if (semPeso.length > 0)
    return falha(
      `O critério por ${nome} exige o ${nome} de todos os animais. Falta em: ${semPeso.map((a) => a.rotulo).join(', ')}. Informe o peso ou escolha conscientemente outro critério.`,
    );
  return {
    valores: dividirProporcional(
      totalCentavos,
      animais.map((a) => ({ id: a.id, peso: a[campo] as number })),
    ),
    erros: [],
  };
}

/** Tolerância na conferência do preço unitário contra o total (arredondamento). */
export const TOLERANCIA_PRECO_CENTAVOS = 1;

/**
 * Valor que o preço unitário daria para a base informada, em centavos, arredondado ao centavo
 * mais próximo (meio para cima). `null` quando a unidade é `total` ou falta a base.
 */
export function totalPelaUnidade(
  unidade: UnidadePreco,
  precoUnitarioCentavos: number,
  base: { cabecas: number; pesoVivoG: number | null; pesoCarcacaG: number | null },
): number | null {
  const p = BigInt(precoUnitarioCentavos);
  const arredondar = (num: bigint, den: bigint) => Number((2n * num + den) / (2n * den));
  if (unidade === 'total') return null;
  if (unidade === 'cabeca') return Number(p * BigInt(base.cabecas));
  if (unidade === 'kg_vivo')
    return base.pesoVivoG === null ? null : arredondar(p * BigInt(base.pesoVivoG), 1000n);
  if (unidade === 'arroba_vivo')
    return base.pesoVivoG === null
      ? null
      : arredondar(p * BigInt(base.pesoVivoG), BigInt(QUILOS_POR_ARROBA) * 1000n);
  return base.pesoCarcacaG === null
    ? null
    : arredondar(p * BigInt(base.pesoCarcacaG), BigInt(QUILOS_POR_ARROBA) * 1000n);
}

/**
 * Confere o preço unitário informado contra o total (que é a verdade gravada). Devolve a
 * mensagem do problema ou `null` se confere (ou se não há como conferir).
 */
export function conferirPrecoUnitario(entrada: {
  totalCentavos: number;
  unidade: UnidadePreco;
  precoUnitarioCentavos: number | null;
  cabecas: number;
  pesoVivoG: number | null;
  pesoCarcacaG: number | null;
}): string | null {
  const { unidade, precoUnitarioCentavos } = entrada;
  if (unidade === 'total') {
    return precoUnitarioCentavos === null ? null : 'Preço unitário informado sem unidade de preço.';
  }
  if (precoUnitarioCentavos === null)
    return 'Informe o preço unitário ou escolha "só o valor total".';
  const esperado = totalPelaUnidade(unidade, precoUnitarioCentavos, entrada);
  if (esperado === null) {
    return unidade === 'arroba_carcaca'
      ? 'O preço por @ de carcaça exige o peso de carcaça de todos os animais; o sistema não estima carcaça a partir do peso vivo.'
      : 'O preço por peso exige o peso vivo de todos os animais.';
  }
  const diferenca = Math.abs(entrada.totalCentavos - esperado);
  if (diferenca > TOLERANCIA_PRECO_CENTAVOS)
    return `O preço unitário e as quantidades dão ${esperado} centavos, mas o valor total informado é ${entrada.totalCentavos} (diferença de ${diferenca} centavos). O valor total é o que fica gravado: corrija o preço, o peso ou o total.`;
  return null;
}
