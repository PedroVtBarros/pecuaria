import type { EstadoResultado, LimiteResultado } from '@pecuaria/domain';
import type { CompletudeResultado } from './tipos-resultado';

/**
 * Textos únicos da completude do resultado econômico: as telas (renderer) e os relatórios
 * (processo principal) usam estes mesmos textos, para nunca classificarem o mesmo número de
 * formas diferentes. A regra está no domínio (`apurarResultado`).
 */
export const ROTULOS_ESTADO_RESULTADO: Record<EstadoResultado, string> = {
  completo: 'Completo',
  parcial: 'Parcial',
  nao_apurado: 'Não apurado',
};

const PREFIXOS: Record<LimiteResultado, string> = {
  exato: '',
  no_maximo: 'no máximo ',
  no_minimo: 'no mínimo ',
  sem_limite: 'só o conhecido: ',
};

/** Valor do resultado com o qualificador ("no máximo", "no mínimo") ou "Não apurado". */
export function textoResultado(
  c: Pick<CompletudeResultado, 'resultadoCentavos' | 'estado' | 'limite'>,
  formatar: (centavos: number) => string,
): string {
  if (c.estado === 'nao_apurado' || c.resultadoCentavos === null) return 'Não apurado';
  return `${PREFIXOS[c.limite ?? 'exato']}${formatar(c.resultadoCentavos)}`;
}

const QUALIFICADORES: Record<LimiteResultado, string> = {
  exato: 'Completo',
  no_maximo: 'Parcial: no máximo',
  no_minimo: 'Parcial: no mínimo',
  sem_limite: 'Parcial: só o conhecido, não é limite',
};

/** Situação curta, para colunas e selos: "Completo", "Parcial: no máximo", "Não apurado"… */
export function situacaoResultado(c: Pick<CompletudeResultado, 'estado' | 'limite'>): string {
  if (c.estado === 'nao_apurado') return ROTULOS_ESTADO_RESULTADO.nao_apurado;
  return QUALIFICADORES[c.limite ?? 'exato'];
}

/** Explicação curta do estado, com a causa. */
export function explicarCompletude(c: CompletudeResultado): string {
  const n = c.receitasDesconhecidas;
  const vendas = `${n} venda(s) ou descarte(s) sem receita registrada`;
  if (c.estado === 'completo') return 'Completo: receitas e custos com valor conhecido.';
  if (c.estado === 'nao_apurado')
    return `Não apurado: ${vendas} e nenhuma receita conhecida. A receita desconhecida não é tratada como zero.`;
  if (c.limite === 'no_maximo')
    return 'Parcial: há custo desconhecido ou não apurado; o resultado é no máximo o valor mostrado.';
  if (c.limite === 'no_minimo')
    return `Parcial: ${vendas}; o resultado é no mínimo o valor mostrado.`;
  return `Parcial: ${vendas} e custo desconhecido ou não apurado; o valor mostrado é só o conhecido e não é limite.`;
}
