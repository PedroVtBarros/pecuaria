import type { TipoMovimentacao } from './enumeracoes';

/**
 * Reconstrução de quando um animal esteve num lote, a partir do histórico de
 * movimentações (entrada no rebanho, troca de lote e saída). As movimentações
 * só têm data, sem hora; por isso o dia de uma troca de lote pertence aos dois
 * lotes (o de origem e o de destino).
 */
export interface MovimentacaoParaLote {
  tipo: TipoMovimentacao;
  data: string;
  loteOrigemId: string | null;
  loteDestinoId: string | null;
}

/** Período contínuo no lote. Datas inclusivas. */
export interface PermanenciaNoLote {
  inicio: string;
  /** Data em que saiu do lote; `null` = continua no lote. */
  fim: string | null;
  /** Entrou por troca de lote: no dia `inicio` o animal também esteve em outro lote (ou sem lote). */
  inicioEmTroca: boolean;
  /** Saiu por troca de lote: no dia `fim` o animal também esteve em outro lote (ou sem lote). */
  fimEmTroca: boolean;
}

export type ReconstrucaoPermanencias =
  | { situacao: 'ok'; permanencias: PermanenciaNoLote[] }
  | { situacao: 'inconsistente'; motivo: string };

function inconsistente(motivo: string): ReconstrucaoPermanencias {
  return { situacao: 'inconsistente', motivo };
}

/**
 * Refaz as permanências do animal no lote. `movimentacoes` deve estar em ordem
 * cronológica (data e ordem de registro). `loteAtualId` é o lote do cadastro,
 * usado para conferir se o histórico termina onde o animal está.
 *
 * Se o histórico tiver lacuna ou contradição, devolve `inconsistente` em vez
 * de adivinhar: o animal fica fora das médias e a tela mostra o motivo.
 */
export function reconstruirPermanencias(
  movimentacoes: readonly MovimentacaoParaLote[],
  loteId: string,
  loteAtualId: string | null,
): ReconstrucaoPermanencias {
  const permanencias: PermanenciaNoLote[] = [];
  let atual: string | null = null;
  let aberta: PermanenciaNoLote | null = null;
  let saiu = false;

  for (const [i, m] of movimentacoes.entries()) {
    const anterior = movimentacoes[i - 1];
    if (anterior && m.data < anterior.data) {
      return inconsistente('as movimentações não estão em ordem cronológica.');
    }
    // Depois de uma saída, só um retorno ao rebanho (nova entrada, ex.: devolução da venda pelo
    // comprador) é aceito; o período fora do rebanho não pertence a nenhum lote.
    if (saiu && m.tipo !== 'entrada')
      return inconsistente('há movimentação depois da saída do rebanho.');
    if (m.tipo === 'entrada') {
      if (i !== 0 && !saiu)
        return inconsistente('a entrada no rebanho aparece mais de uma vez sem saída entre elas.');
      if (m.loteOrigemId !== null) return inconsistente('a entrada no rebanho tem lote de origem.');
      saiu = false;
    } else {
      if (i === 0) return inconsistente('falta o registro de entrada no rebanho.');
      if (m.loteOrigemId !== atual) {
        return inconsistente(
          'o lote de origem de uma movimentação não confere com o lote anterior.',
        );
      }
    }
    if (m.tipo === 'saida') {
      if (m.loteDestinoId !== null) return inconsistente('a saída do rebanho tem lote de destino.');
      saiu = true;
    }

    const destino = m.loteDestinoId;
    if (aberta && destino !== loteId) {
      aberta.fim = m.data;
      aberta.fimEmTroca = m.tipo === 'troca_lote';
      permanencias.push(aberta);
      aberta = null;
    }
    if (!aberta && destino === loteId && atual !== loteId) {
      aberta = {
        inicio: m.data,
        fim: null,
        inicioEmTroca: m.tipo === 'troca_lote',
        fimEmTroca: false,
      };
    }
    atual = destino;
  }

  if (movimentacoes.length === 0) return inconsistente('não há movimentações registradas.');
  if (atual !== loteAtualId) {
    return inconsistente('o lote atual do cadastro não confere com o histórico de movimentações.');
  }
  if (aberta) permanencias.push(aberta);
  return { situacao: 'ok', permanencias };
}

export type PosicaoNoLote = 'dentro' | 'dia_da_troca' | 'fora';

/**
 * Onde cai uma data em relação às permanências. `dia_da_troca` é o dia de
 * entrada ou saída por troca de lote: a pesagem desse dia vale para os dois
 * lotes, porque não há hora para saber se foi antes ou depois da troca.
 */
export function posicaoNoLote(
  data: string,
  permanencias: readonly PermanenciaNoLote[],
): PosicaoNoLote {
  let posicao: PosicaoNoLote = 'fora';
  for (const p of permanencias) {
    if (data < p.inicio || (p.fim !== null && data > p.fim)) continue;
    const naBorda = (data === p.inicio && p.inicioEmTroca) || (data === p.fim && p.fimEmTroca);
    if (!naBorda) return 'dentro';
    posicao = 'dia_da_troca';
  }
  return posicao;
}
