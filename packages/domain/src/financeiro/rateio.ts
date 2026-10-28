import { diasEntre, somarDias } from '../comum/datas';

/**
 * Critérios de rateio de custos compartilhados (entrega 4E). Cada critério gera PESOS inteiros
 * positivos, que são gravados com o rateio; o valor de cada destino é calculado a cada leitura a
 * partir do valor atual da origem (divisão proporcional exata). Nada é estimado: sem dado, o
 * critério fica indisponível e o motivo é mostrado.
 */
export const CRITERIOS_RATEIO = ['cabecas', 'animal_dias', 'peso', 'manual'] as const;
export type CriterioRateio = (typeof CRITERIOS_RATEIO)[number];

export interface PesoDeDestino {
  id: string;
  peso: number;
  /** Texto da base usada, gravado para auditoria (ex.: "12 cabeças"). */
  base: string;
}

/** Cabeças: animais presentes ao fim do dia da data-base em cada lote. Lote vazio fica de fora. */
export function pesosPorCabecas(
  lotes: readonly { id: string; animais: number }[],
): PesoDeDestino[] {
  return lotes
    .filter((l) => l.animais > 0)
    .map((l) => ({ id: l.id, peso: l.animais, base: `${l.animais} cabeça(s)` }));
}

export interface PermanenciaSimples {
  inicio: string;
  /** Dia em que saiu do lote (ao fim dele o animal já não está); `null` = continua. */
  fim: string | null;
}

/**
 * Dias, dentro de [inicio, fim] (inclusivos), em que o animal estava no lote ao fim do dia:
 * presente em d se `permanencia.inicio <= d < permanencia.fim`.
 */
export function diasNoPeriodo(
  permanencias: readonly PermanenciaSimples[],
  inicio: string,
  fim: string,
): number {
  if (inicio > fim) throw new Error('Período inválido.');
  const ultimoDia = somarDias(fim, 1); // exclusivo
  let total = 0;
  for (const p of permanencias) {
    const de = p.inicio > inicio ? p.inicio : inicio;
    const ate = p.fim === null || p.fim > ultimoDia ? ultimoDia : p.fim;
    if (ate > de) total += diasEntre(de, ate);
  }
  return total;
}

/** Animal-dias: soma, por lote, dos dias de cada animal no período. Lote sem nenhum dia fica de fora. */
export function pesosPorAnimalDias(
  lotes: readonly { id: string; animais: readonly (readonly PermanenciaSimples[])[] }[],
  inicio: string,
  fim: string,
): PesoDeDestino[] {
  const saida: PesoDeDestino[] = [];
  for (const l of lotes) {
    const dias = l.animais.reduce((s, p) => s + diasNoPeriodo(p, inicio, fim), 0);
    if (dias > 0) saida.push({ id: l.id, peso: dias, base: `${dias} animal-dia(s)` });
  }
  return saida;
}

export interface AnimalParaPeso {
  id: string;
  rotulo: string;
  /** Peso da última pesagem real em gramas; `null` = sem pesagem até a data-base. */
  pesoG: number | null;
  /** Dias entre a pesagem e a data-base; `null` sem pesagem. */
  idadeDias: number | null;
}

/**
 * Peso: soma dos pesos da última pesagem real dos animais presentes em cada lote. Só vale se TODOS
 * os animais envolvidos têm pesagem dentro da idade máxima informada pelo usuário (o sistema não
 * escolhe esse limite). Caso contrário o critério fica indisponível e lista quem falta.
 */
export function pesosPorPeso(
  lotes: readonly { id: string; animais: readonly AnimalParaPeso[] }[],
  idadeMaximaDias: number,
): { pesos: PesoDeDestino[]; erros: string[] } {
  if (!Number.isInteger(idadeMaximaDias) || idadeMaximaDias < 0)
    return { pesos: [], erros: ['Informe a idade máxima da pesagem, em dias.'] };
  const erros: string[] = [];
  const pesos: PesoDeDestino[] = [];
  for (const l of lotes) {
    const sem = l.animais.filter(
      (a) => a.pesoG === null || a.idadeDias === null || a.idadeDias > idadeMaximaDias,
    );
    if (sem.length > 0) {
      erros.push(
        `Sem pesagem real de até ${idadeMaximaDias} dia(s): ${sem.map((a) => a.rotulo).join(', ')}.`,
      );
      continue;
    }
    const g = l.animais.reduce((s, a) => s + (a.pesoG as number), 0);
    if (g > 0) pesos.push({ id: l.id, peso: g, base: `${(g / 1000).toLocaleString('pt-BR')} kg` });
  }
  if (erros.length > 0) return { pesos: [], erros };
  return { pesos, erros };
}

/** Pesos digitados pelo usuário (inteiros positivos, sem repetir destino). */
export function validarPesosManuais(pesos: readonly { id: string; peso: number }[]): string[] {
  const erros: string[] = [];
  if (pesos.length === 0) erros.push('Informe ao menos um destino.');
  const vistos = new Set<string>();
  for (const p of pesos) {
    if (vistos.has(p.id)) erros.push('Destino repetido no rateio.');
    vistos.add(p.id);
    if (!Number.isSafeInteger(p.peso) || p.peso <= 0)
      erros.push('Cada peso deve ser um número inteiro maior que zero.');
  }
  return [...new Set(erros)];
}
