import { diasEntre } from '../comum/datas';
import type { MetodoPesagem } from './enumeracoes';

/**
 * Ganho médio diário OBSERVADO: diferença de peso vivo entre duas pesagens reais
 * dividida pelos dias entre elas. É uma medida, não uma projeção nutricional
 * (MODELOS_NUTRICIONAIS.md, seção 7.4). Não usa nenhum coeficiente.
 *
 *   GMD (kg/dia) = (peso final − peso inicial) / dias entre as pesagens
 */

export interface PesagemParaGmd {
  id: string;
  data: string;
  pesoVivoKg: number;
  metodo: MetodoPesagem;
}

export interface IntervaloGmd {
  pesagemInicialId: string;
  pesagemFinalId: string;
  dataInicial: string;
  dataFinal: string;
  dias: number;
  pesoInicialKg: number;
  pesoFinalKg: number;
  ganhoKg: number;
  gmdKgDia: number;
  /** Verdadeiro se alguma das duas pesagens não foi feita em balança. */
  estimado: boolean;
}

export type SituacaoGmd = 'sem_pesagens' | 'pesagem_unica' | 'calculado';

export interface AnaliseGmd {
  situacao: SituacaoGmd;
  quantidadePesagens: number;
  /** Entre pesagens consecutivas, em ordem cronológica. */
  intervalos: IntervaloGmd[];
  /** Da primeira à última pesagem. */
  periodoTotal: IntervaloGmd | null;
}

function intervalo(inicial: PesagemParaGmd, final: PesagemParaGmd): IntervaloGmd {
  const dias = diasEntre(inicial.data, final.data);
  const ganhoKg = final.pesoVivoKg - inicial.pesoVivoKg;
  return {
    pesagemInicialId: inicial.id,
    pesagemFinalId: final.id,
    dataInicial: inicial.data,
    dataFinal: final.data,
    dias,
    pesoInicialKg: inicial.pesoVivoKg,
    pesoFinalKg: final.pesoVivoKg,
    ganhoKg,
    gmdKgDia: ganhoKg / dias,
    estimado: inicial.metodo !== 'balanca' || final.metodo !== 'balanca',
  };
}

export class ErroPesagensInvalidas extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroPesagensInvalidas';
  }
}

/**
 * Calcula o GMD observado. Precisa de pelo menos duas pesagens em datas
 * diferentes. Duas pesagens na mesma data são recusadas, porque não existe
 * intervalo de tempo para dividir.
 */
export function analisarGmd(pesagens: readonly PesagemParaGmd[]): AnaliseGmd {
  const ordenadas = [...pesagens].sort((a, b) => a.data.localeCompare(b.data));
  for (let i = 1; i < ordenadas.length; i++) {
    if (ordenadas[i]!.data === ordenadas[i - 1]!.data) {
      throw new ErroPesagensInvalidas(`Há mais de uma pesagem na data ${ordenadas[i]!.data}.`);
    }
  }
  for (const p of ordenadas) {
    if (!(p.pesoVivoKg > 0) || !Number.isFinite(p.pesoVivoKg)) {
      throw new ErroPesagensInvalidas(`Peso inválido na pesagem de ${p.data}.`);
    }
  }

  if (ordenadas.length === 0) {
    return { situacao: 'sem_pesagens', quantidadePesagens: 0, intervalos: [], periodoTotal: null };
  }
  if (ordenadas.length === 1) {
    return { situacao: 'pesagem_unica', quantidadePesagens: 1, intervalos: [], periodoTotal: null };
  }

  const intervalos: IntervaloGmd[] = [];
  for (let i = 1; i < ordenadas.length; i++) {
    intervalos.push(intervalo(ordenadas[i - 1]!, ordenadas[i]!));
  }
  return {
    situacao: 'calculado',
    quantidadePesagens: ordenadas.length,
    intervalos,
    periodoTotal: intervalo(ordenadas[0]!, ordenadas[ordenadas.length - 1]!),
  };
}
