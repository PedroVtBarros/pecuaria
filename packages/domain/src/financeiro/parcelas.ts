import { ehDataIso, somarDias } from '../comum/datas';
import { CENTAVOS_MAXIMO, somarCentavos } from './dinheiro';

export const PARCELAS_MAXIMO = 120;

export interface ParcelaPlanejada {
  vencimento: string;
  valorCentavos: number;
}

export type RegraVencimento = { tipo: 'intervalo_dias'; dias: number } | { tipo: 'mensal' };

/** Soma meses mantendo o dia original, limitado ao último dia do mês de destino. */
export function somarMeses(data: string, meses: number, diaOriginal?: number): string {
  const [ano, mes, dia] = data.split('-').map(Number) as [number, number, number];
  const alvo = diaOriginal ?? dia;
  const indice = ano * 12 + (mes - 1) + meses;
  const anoNovo = Math.floor(indice / 12);
  const mesNovo = (indice % 12) + 1;
  const ultimoDia = new Date(Date.UTC(anoNovo, mesNovo, 0)).getUTCDate();
  return `${String(anoNovo).padStart(4, '0')}-${String(mesNovo).padStart(2, '0')}-${String(Math.min(alvo, ultimoDia)).padStart(2, '0')}`;
}

/**
 * Gera parcelas de valores iguais; o resíduo da divisão fica na última parcela. Cada parcela
 * precisa ter ao menos um centavo.
 */
export function gerarParcelas(entrada: {
  totalCentavos: number;
  quantidade: number;
  primeiroVencimento: string;
  regra: RegraVencimento;
}): ParcelaPlanejada[] {
  const { totalCentavos, quantidade, primeiroVencimento, regra } = entrada;
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos <= 0 || totalCentavos > CENTAVOS_MAXIMO)
    throw new Error('Informe um total positivo em centavos.');
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > PARCELAS_MAXIMO)
    throw new Error(`Informe de 1 a ${PARCELAS_MAXIMO} parcelas.`);
  if (!ehDataIso(primeiroVencimento)) throw new Error('Primeiro vencimento inválido.');
  if (totalCentavos < quantidade) throw new Error('Há mais parcelas do que centavos a dividir.');
  if (regra.tipo === 'intervalo_dias' && (!Number.isInteger(regra.dias) || regra.dias < 1))
    throw new Error('O intervalo deve ser de pelo menos um dia.');
  const base = Math.floor(totalCentavos / quantidade);
  const diaOriginal = Number(primeiroVencimento.slice(8, 10));
  return Array.from({ length: quantidade }, (_, i) => ({
    vencimento:
      regra.tipo === 'intervalo_dias'
        ? somarDias(primeiroVencimento, i * regra.dias)
        : somarMeses(primeiroVencimento, i, diaOriginal),
    valorCentavos: i === quantidade - 1 ? totalCentavos - base * (quantidade - 1) : base,
  }));
}

/**
 * Confere uma lista de parcelas contra o total esperado. Devolve as mensagens de erro (vazia
 * quando está tudo certo). A soma exata é obrigatória: nada é arredondado em silêncio.
 */
export function validarParcelas(
  parcelas: readonly ParcelaPlanejada[],
  totalEsperadoCentavos: number,
): string[] {
  const erros: string[] = [];
  if (parcelas.length === 0) {
    if (totalEsperadoCentavos !== 0) erros.push('Informe ao menos uma parcela.');
    return erros;
  }
  if (parcelas.length > PARCELAS_MAXIMO) erros.push(`No máximo ${PARCELAS_MAXIMO} parcelas.`);
  for (const [i, p] of parcelas.entries()) {
    if (!ehDataIso(p.vencimento)) erros.push(`Parcela ${i + 1}: vencimento inválido.`);
    if (!Number.isSafeInteger(p.valorCentavos) || p.valorCentavos <= 0)
      erros.push(`Parcela ${i + 1}: o valor deve ser positivo.`);
    else if (p.valorCentavos > CENTAVOS_MAXIMO) erros.push(`Parcela ${i + 1}: valor excessivo.`);
  }
  if (
    erros.length === 0 &&
    somarCentavos(parcelas.map((p) => p.valorCentavos)) !== totalEsperadoCentavos
  )
    erros.push('A soma das parcelas deve ser exatamente igual ao total a parcelar.');
  return erros;
}
