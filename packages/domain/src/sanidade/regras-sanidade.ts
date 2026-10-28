import { diasEntre, somarDias } from '../comum/datas';

/**
 * Fim do prazo de carência: data da aplicação + `carenciaDias` dias corridos,
 * com os dias que o usuário informou. É só uma conta sobre o dado digitado,
 * não garantia de liberação sanitária nem autorização de venda ou de entrega
 * de leite: o prazo correto é o da bula e da orientação profissional.
 * `null` quando não há carência informada; 0 dia = sem carência.
 */
export function fimCarencia(dataAplicacao: string, carenciaDias: number | null): string | null {
  if (carenciaDias === null || carenciaDias <= 0) return null;
  return somarDias(dataAplicacao, carenciaDias);
}

/** Ainda em carência em `hoje`? */
export function emCarencia(fimPrazo: string | null, hoje: string): boolean {
  return fimPrazo !== null && diasEntre(hoje, fimPrazo) > 0;
}

export type SituacaoAgenda = 'atrasado' | 'hoje' | 'proximo' | 'futuro';

/** Situação de um evento pendente da agenda em relação a hoje. */
export function situacaoAgenda(
  dataPrevista: string,
  hoje: string,
  antecedenciaDias: number,
): SituacaoAgenda {
  const faltam = diasEntre(hoje, dataPrevista);
  if (faltam < 0) return 'atrasado';
  if (faltam === 0) return 'hoje';
  if (faltam <= antecedenciaDias) return 'proximo';
  return 'futuro';
}

/** Custo por animal em centavos inteiros, arredondado; só para exibição. */
export function custoPorAnimalCentavos(custoTotalCentavos: number, animais: number): number | null {
  if (animais <= 0) return null;
  return Math.round(custoTotalCentavos / animais);
}
