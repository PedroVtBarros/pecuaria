import { diasEntre, ehDataIso, somarDias } from '../comum/datas';
import { somarCentavos } from './dinheiro';
import type { NaturezaFinanceira } from './enumeracoes';
import { somarMeses } from './parcelas';

/**
 * Fluxo de caixa (entrega 4B). Duas visões que nunca se somam:
 * - realizado: pagamentos e recebimentos efetivos, por data de pagamento;
 * - previsto: saldo de parcelas em aberto, por vencimento.
 * Nenhuma delas é lucro nem resultado: são movimentos de dinheiro.
 */
export const GRANULARIDADES_FLUXO = ['dia', 'semana', 'mes'] as const;
export type GranularidadeFluxo = (typeof GRANULARIDADES_FLUXO)[number];

/** Limite de períodos numa consulta, para a tela continuar legível. */
export const PERIODOS_MAXIMO = 400;

const ORIGEM = '1970-01-01';

/** Segunda-feira da semana da data (a semana começa na segunda). */
function segundaDaSemana(data: string): string {
  // 01/01/1970 foi quinta-feira: índice 3 numa semana que começa na segunda (0).
  const deslocamento = (((diasEntre(ORIGEM, data) + 3) % 7) + 7) % 7;
  return somarDias(data, -deslocamento);
}

/** Chave do período que contém a data: dia = a data; semana = a segunda-feira; mês = AAAA-MM. */
export function chaveDoPeriodo(data: string, g: GranularidadeFluxo): string {
  if (g === 'dia') return data;
  if (g === 'mes') return data.slice(0, 7);
  return segundaDaSemana(data);
}

/** Primeiro e último dia do período identificado pela chave. */
export function limitesDoPeriodo(
  chave: string,
  g: GranularidadeFluxo,
): { inicio: string; fim: string } {
  if (g === 'dia') return { inicio: chave, fim: chave };
  if (g === 'semana') return { inicio: chave, fim: somarDias(chave, 6) };
  const inicio = `${chave}-01`;
  return { inicio, fim: somarDias(somarMeses(inicio, 1), -1) };
}

/** Chaves, em ordem e sem lacunas, dos períodos que cobrem o intervalo [inicio, fim]. */
export function periodosDoIntervalo(inicio: string, fim: string, g: GranularidadeFluxo): string[] {
  if (!ehDataIso(inicio) || !ehDataIso(fim)) throw new Error('Datas inválidas.');
  if (inicio > fim) throw new Error('A data inicial deve ser anterior ou igual à final.');
  const chaves: string[] = [];
  let atual = chaveDoPeriodo(inicio, g);
  const ultima = chaveDoPeriodo(fim, g);
  while (atual <= ultima) {
    chaves.push(atual);
    if (chaves.length > PERIODOS_MAXIMO)
      throw new Error(
        `O intervalo tem mais de ${PERIODOS_MAXIMO} períodos. Escolha um período menor ou agrupe por semana ou mês.`,
      );
    const { fim: fimDoPeriodo } = limitesDoPeriodo(atual, g);
    atual = chaveDoPeriodo(somarDias(fimDoPeriodo, 1), g);
  }
  return chaves;
}

export interface MovimentoDeCaixa {
  data: string;
  natureza: NaturezaFinanceira;
  valorCentavos: number;
  /** Quantos pagamentos o valor representa (1 quando omitido), para consultas já agregadas. */
  quantidade?: number;
}

export interface LinhaFluxoRealizado {
  chave: string;
  inicio: string;
  fim: string;
  entradasCentavos: number;
  saidasCentavos: number;
  /** Entradas menos saídas do período. Não é lucro. */
  saldoDoPeriodoCentavos: number;
  /** Soma dos saldos desde o primeiro período consultado. Não é saldo bancário. */
  acumuladoCentavos: number;
  movimentos: number;
}

export interface FluxoRealizadoCalculado {
  linhas: LinhaFluxoRealizado[];
  entradasCentavos: number;
  saidasCentavos: number;
  saldoCentavos: number;
  movimentos: number;
}

/**
 * Agrupa pagamentos e recebimentos efetivos por período. Movimentos fora do intervalo são
 * ignorados; períodos sem movimento aparecem com zero registrado (é o que o sistema sabe).
 * A soma das linhas é sempre igual aos totais.
 */
export function montarFluxoRealizado(
  movimentos: readonly MovimentoDeCaixa[],
  inicio: string,
  fim: string,
  g: GranularidadeFluxo,
): FluxoRealizadoCalculado {
  const chaves = periodosDoIntervalo(inicio, fim, g);
  const entradas = new Map<string, number[]>();
  const saidas = new Map<string, number[]>();
  const contagem = new Map<string, number>();
  for (const m of movimentos) {
    if (m.data < inicio || m.data > fim) continue;
    const chave = chaveDoPeriodo(m.data, g);
    const alvo = m.natureza === 'receita' ? entradas : saidas;
    const lista = alvo.get(chave) ?? [];
    lista.push(m.valorCentavos);
    alvo.set(chave, lista);
    contagem.set(chave, (contagem.get(chave) ?? 0) + (m.quantidade ?? 1));
  }
  let acumulado = 0;
  const linhas = chaves.map((chave): LinhaFluxoRealizado => {
    const limites = limitesDoPeriodo(chave, g);
    const e = somarCentavos(entradas.get(chave) ?? []);
    const s = somarCentavos(saidas.get(chave) ?? []);
    acumulado += e - s;
    return {
      chave,
      inicio: limites.inicio < inicio ? inicio : limites.inicio,
      fim: limites.fim > fim ? fim : limites.fim,
      entradasCentavos: e,
      saidasCentavos: s,
      saldoDoPeriodoCentavos: e - s,
      acumuladoCentavos: acumulado,
      movimentos: contagem.get(chave) ?? 0,
    };
  });
  const totalEntradas = somarCentavos(linhas.map((l) => l.entradasCentavos));
  const totalSaidas = somarCentavos(linhas.map((l) => l.saidasCentavos));
  return {
    linhas,
    entradasCentavos: totalEntradas,
    saidasCentavos: totalSaidas,
    saldoCentavos: totalEntradas - totalSaidas,
    movimentos: linhas.reduce((n, l) => n + l.movimentos, 0),
  };
}

export interface SaldoAbertoPorVencimento {
  vencimento: string;
  natureza: NaturezaFinanceira;
  /** Saldo ainda não pago ou recebido da parcela. */
  saldoCentavos: number;
  /** Quantas parcelas o valor representa (1 quando omitido), para consultas já agregadas. */
  quantidade?: number;
}

export interface LinhaFluxoPrevisto {
  chave: string;
  inicio: string;
  fim: string;
  aReceberCentavos: number;
  aPagarCentavos: number;
  /** Parte do total acima cujo vencimento já passou (anterior a hoje). */
  emAtrasoReceberCentavos: number;
  emAtrasoPagarCentavos: number;
  /** A receber menos a pagar com vencimento no período. É previsão, não resultado. */
  saldoPrevistoCentavos: number;
  parcelas: number;
}

export interface FluxoPrevistoCalculado {
  linhas: LinhaFluxoPrevisto[];
  aReceberCentavos: number;
  aPagarCentavos: number;
  emAtrasoReceberCentavos: number;
  emAtrasoPagarCentavos: number;
  saldoPrevistoCentavos: number;
  parcelas: number;
}

/**
 * Agrupa o saldo das parcelas em aberto por vencimento. Parcelas sem saldo não entram. O que
 * venceu antes de `hoje` fica marcado como "em atraso" dentro do total do período.
 */
export function montarFluxoPrevisto(
  parcelas: readonly SaldoAbertoPorVencimento[],
  hoje: string,
  inicio: string,
  fim: string,
  g: GranularidadeFluxo,
): FluxoPrevistoCalculado {
  const chaves = periodosDoIntervalo(inicio, fim, g);
  type Acum = {
    receber: number[];
    pagar: number[];
    atrasoReceber: number[];
    atrasoPagar: number[];
    n: number;
  };
  const grupos = new Map<string, Acum>();
  for (const p of parcelas) {
    if (p.saldoCentavos <= 0 || p.vencimento < inicio || p.vencimento > fim) continue;
    const chave = chaveDoPeriodo(p.vencimento, g);
    const a = grupos.get(chave) ?? {
      receber: [],
      pagar: [],
      atrasoReceber: [],
      atrasoPagar: [],
      n: 0,
    };
    const atrasada = p.vencimento < hoje;
    if (p.natureza === 'receita') {
      a.receber.push(p.saldoCentavos);
      if (atrasada) a.atrasoReceber.push(p.saldoCentavos);
    } else {
      a.pagar.push(p.saldoCentavos);
      if (atrasada) a.atrasoPagar.push(p.saldoCentavos);
    }
    a.n += p.quantidade ?? 1;
    grupos.set(chave, a);
  }
  const linhas = chaves.map((chave): LinhaFluxoPrevisto => {
    const limites = limitesDoPeriodo(chave, g);
    const a = grupos.get(chave);
    const receber = somarCentavos(a?.receber ?? []);
    const pagar = somarCentavos(a?.pagar ?? []);
    return {
      chave,
      inicio: limites.inicio < inicio ? inicio : limites.inicio,
      fim: limites.fim > fim ? fim : limites.fim,
      aReceberCentavos: receber,
      aPagarCentavos: pagar,
      emAtrasoReceberCentavos: somarCentavos(a?.atrasoReceber ?? []),
      emAtrasoPagarCentavos: somarCentavos(a?.atrasoPagar ?? []),
      saldoPrevistoCentavos: receber - pagar,
      parcelas: a?.n ?? 0,
    };
  });
  const soma = (f: (l: LinhaFluxoPrevisto) => number) => somarCentavos(linhas.map(f));
  const receber = soma((l) => l.aReceberCentavos);
  const pagar = soma((l) => l.aPagarCentavos);
  return {
    linhas,
    aReceberCentavos: receber,
    aPagarCentavos: pagar,
    emAtrasoReceberCentavos: soma((l) => l.emAtrasoReceberCentavos),
    emAtrasoPagarCentavos: soma((l) => l.emAtrasoPagarCentavos),
    saldoPrevistoCentavos: receber - pagar,
    parcelas: linhas.reduce((n, l) => n + l.parcelas, 0),
  };
}
