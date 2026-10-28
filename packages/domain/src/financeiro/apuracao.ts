/**
 * Estado de apuração de um custo: conhecido, desconhecido ou parcialmente apurado. Zero
 * conhecido é diferente de desconhecido em todo o módulo (regra 2 do CLAUDE.md).
 *
 * - completa: todos os componentes aplicáveis têm valor conhecido (inclusive zero);
 * - parcial: há componente conhecido e há componente desconhecido ou não apurado;
 * - desconhecida: nenhum componente conhecido e há componente desconhecido;
 * - nao_apurada: nenhum componente conhecido e todos os que faltam são "não apurados"
 *   (ex.: custo de formação de animal nascido na propriedade).
 */
export type EstadoApuracao = 'completa' | 'parcial' | 'desconhecida' | 'nao_apurada';

export type ComponenteCusto =
  { tipo: 'conhecido'; valorCentavos: number } | { tipo: 'desconhecido' } | { tipo: 'nao_apurado' };

export interface Apuracao {
  estado: EstadoApuracao;
  /** Soma dos componentes conhecidos. Em estado parcial é um mínimo, não o total. */
  valorConhecidoCentavos: number;
  componentesConhecidos: number;
  componentesDesconhecidos: number;
  componentesNaoApurados: number;
}

function estadoDe(k: number, d: number, n: number): EstadoApuracao {
  if (d === 0 && n === 0) return 'completa';
  if (k > 0) return 'parcial';
  return d > 0 ? 'desconhecida' : 'nao_apurada';
}

function montar(valor: number, k: number, d: number, n: number): Apuracao {
  if (!Number.isSafeInteger(valor)) throw new Error('A soma excede o limite de precisão.');
  return {
    estado: estadoDe(k, d, n),
    valorConhecidoCentavos: valor,
    componentesConhecidos: k,
    componentesDesconhecidos: d,
    componentesNaoApurados: n,
  };
}

export function apurarComponentes(componentes: readonly ComponenteCusto[]): Apuracao {
  let valor = 0n;
  let k = 0;
  let d = 0;
  let n = 0;
  for (const c of componentes) {
    if (c.tipo === 'conhecido') {
      if (!Number.isSafeInteger(c.valorCentavos) || c.valorCentavos < 0)
        throw new Error('Custo conhecido inválido.');
      valor += BigInt(c.valorCentavos);
      k += 1;
    } else if (c.tipo === 'desconhecido') d += 1;
    else n += 1;
  }
  return montar(Number(valor), k, d, n);
}

/** Soma de apurações: associativa e comutativa; o estado é recalculado dos contadores. */
export function somarApuracoes(apuracoes: readonly Apuracao[]): Apuracao {
  let valor = 0n;
  let k = 0;
  let d = 0;
  let n = 0;
  for (const a of apuracoes) {
    valor += BigInt(a.valorConhecidoCentavos);
    k += a.componentesConhecidos;
    d += a.componentesDesconhecidos;
    n += a.componentesNaoApurados;
  }
  return montar(Number(valor), k, d, n);
}
