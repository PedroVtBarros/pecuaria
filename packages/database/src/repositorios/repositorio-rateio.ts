import type { CriterioRateio } from '@pecuaria/domain';
import type { ObterConexao } from './comum';

type Linha = Record<string, unknown>;

export interface LinhaRateio {
  id: string;
  propriedadeId: string;
  origemTipo: 'lancamento' | 'movimentacao_estoque';
  origemId: string;
  criterio: CriterioRateio;
  dataBase: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  idadeMaximaPesagemDias: number | null;
  motivo: string;
  substituiId: string | null;
  requisicaoId: string;
  motivoCancelamento: string | null;
  cancelado: boolean;
  criadoEm: string;
}

export interface LinhaItemRateio {
  id: string;
  rateioId: string;
  loteId: string | null;
  loteNome: string | null;
  animalId: string | null;
  animalIdentificacao: string | null;
  pesoRelativo: number;
  baseDescricao: string;
}

export interface NovoRateio {
  id: string;
  propriedadeId: string;
  origemTipo: 'lancamento' | 'movimentacao_estoque';
  origemId: string;
  criterio: CriterioRateio;
  dataBase: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  idadeMaximaPesagemDias: number | null;
  motivo: string;
  substituiId: string | null;
  requisicaoId: string;
}

function rateio(l: Linha): LinhaRateio {
  return {
    id: l['id'] as string,
    propriedadeId: l['propriedade_id'] as string,
    origemTipo: l['origem_tipo'] as LinhaRateio['origemTipo'],
    origemId: l['origem_id'] as string,
    criterio: l['criterio'] as CriterioRateio,
    dataBase: l['data_base'] as string,
    periodoInicio: l['periodo_inicio'] as string | null,
    periodoFim: l['periodo_fim'] as string | null,
    idadeMaximaPesagemDias:
      l['idade_maxima_pesagem_dias'] === null ? null : Number(l['idade_maxima_pesagem_dias']),
    motivo: l['motivo'] as string,
    substituiId: l['substitui_id'] as string | null,
    requisicaoId: l['requisicao_id'] as string,
    motivoCancelamento: l['motivo_cancelamento'] as string | null,
    cancelado: l['deleted_at'] !== null,
    criadoEm: l['created_at'] as string,
  };
}

/** SQL e mapeamento dos rateios de custos compartilhados. Sem regra de negócio. */
export class RepositorioRateio {
  constructor(private readonly db: ObterConexao) {}

  inserirRateio(r: NovoRateio, agora: string): void {
    this.db()
      .prepare(
        `INSERT INTO rateio_custo(id,propriedade_id,origem_tipo,origem_id,criterio,data_base,periodo_inicio,periodo_fim,idade_maxima_pesagem_dias,motivo,substitui_id,requisicao_id,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        r.id,
        r.propriedadeId,
        r.origemTipo,
        r.origemId,
        r.criterio,
        r.dataBase,
        r.periodoInicio,
        r.periodoFim,
        r.idadeMaximaPesagemDias,
        r.motivo,
        r.substituiId,
        r.requisicaoId,
        agora,
        agora,
      );
  }
  inserirItem(
    i: {
      id: string;
      rateioId: string;
      loteId: string | null;
      animalId: string | null;
      pesoRelativo: number;
      baseDescricao: string;
    },
    agora: string,
  ): void {
    this.db()
      .prepare(
        'INSERT INTO rateio_custo_item(id,rateio_id,lote_id,animal_id,peso_relativo,base_descricao,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(i.id, i.rateioId, i.loteId, i.animalId, i.pesoRelativo, i.baseDescricao, agora, agora);
  }
  obterRateio(id: string): LinhaRateio | null {
    const r = this.db().prepare('SELECT * FROM rateio_custo WHERE id = ?').get(id) as
      Linha | undefined;
    return r ? rateio(r) : null;
  }
  rateioPorRequisicao(requisicaoId: string): LinhaRateio | null {
    const r = this.db()
      .prepare('SELECT * FROM rateio_custo WHERE requisicao_id = ?')
      .get(requisicaoId) as Linha | undefined;
    return r ? rateio(r) : null;
  }
  rateioAtivoDaOrigem(tipo: string, origemId: string): LinhaRateio | null {
    const r = this.db()
      .prepare(
        'SELECT * FROM rateio_custo WHERE origem_tipo = ? AND origem_id = ? AND deleted_at IS NULL',
      )
      .get(tipo, origemId) as Linha | undefined;
    return r ? rateio(r) : null;
  }
  listarRateios(propriedadeId: string, incluirCancelados: boolean): LinhaRateio[] {
    return (
      this.db()
        .prepare(
          `SELECT * FROM rateio_custo WHERE propriedade_id = ? ${incluirCancelados ? '' : 'AND deleted_at IS NULL'}
           ORDER BY created_at DESC, id DESC`,
        )
        .all(propriedadeId) as Linha[]
    ).map(rateio);
  }
  itensDoRateio(rateioId: string): LinhaItemRateio[] {
    return (
      this.db()
        .prepare(
          `SELECT i.*, l.nome AS lote_nome, a.identificacao AS animal_identificacao
           FROM rateio_custo_item i LEFT JOIN lote l ON l.id = i.lote_id LEFT JOIN animal a ON a.id = i.animal_id
           WHERE i.rateio_id = ? ORDER BY i.rowid`,
        )
        .all(rateioId) as Linha[]
    ).map((l) => ({
      id: l['id'] as string,
      rateioId: l['rateio_id'] as string,
      loteId: l['lote_id'] as string | null,
      loteNome: l['lote_nome'] as string | null,
      animalId: l['animal_id'] as string | null,
      animalIdentificacao: l['animal_identificacao'] as string | null,
      pesoRelativo: Number(l['peso_relativo']),
      baseDescricao: l['base_descricao'] as string,
    }));
  }
  cancelarRateio(id: string, motivo: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE rateio_custo SET deleted_at=?,motivo_cancelamento=?,updated_at=? WHERE id=? AND deleted_at IS NULL',
      )
      .run(agora, motivo, agora, id);
  }
  /** Cadeia de versões (da mais antiga à mais nova) a que o rateio pertence. */
  versoes(id: string): LinhaRateio[] {
    const ate: LinhaRateio[] = [];
    let atual = this.obterRateio(id);
    while (atual) {
      ate.unshift(atual);
      atual = atual.substituiId ? this.obterRateio(atual.substituiId) : null;
    }
    let ultimo = ate.at(-1);
    while (ultimo) {
      const proxima = this.db()
        .prepare('SELECT * FROM rateio_custo WHERE substitui_id = ?')
        .get(ultimo.id) as Linha | undefined;
      ultimo = proxima ? rateio(proxima) : undefined;
      if (ultimo) ate.push(ultimo);
    }
    return ate;
  }
  /** Algum rateio ativo para o lançamento? (impede mudar o destino à mão) */
  temRateioAtivoDoLancamento(lancamentoId: string): boolean {
    return Boolean(
      this.db()
        .prepare(
          "SELECT 1 FROM rateio_custo WHERE origem_tipo = 'lancamento' AND origem_id = ? AND deleted_at IS NULL",
        )
        .get(lancamentoId),
    );
  }

  /**
   * Movimento de estoque vigente da cadeia de correções que começa em `origemId`: segue
   * `substitui_id` para a frente. Devolve o último movimento e se ele está ativo.
   */
  movimentoVigente(origemId: string): { id: string; ativo: boolean } | null {
    let id = origemId;
    for (let i = 0; i < 1000; i++) {
      const proximo = this.db()
        .prepare(
          'SELECT id FROM movimentacao_estoque WHERE substitui_id = ? ORDER BY rowid DESC LIMIT 1',
        )
        .get(id) as { id: string } | undefined;
      if (!proximo) break;
      id = proximo.id;
    }
    const m = this.db()
      .prepare('SELECT id, deleted_at FROM movimentacao_estoque WHERE id = ?')
      .get(id) as { id: string; deleted_at: string | null } | undefined;
    return m ? { id: m.id, ativo: m.deleted_at === null } : null;
  }
  /** Primeira origem da cadeia de correções que termina em `vigenteId` (o movimento que o rateio cita). */
  origemDaCadeia(vigenteId: string): string[] {
    const ids = [vigenteId];
    let atual = vigenteId;
    for (let i = 0; i < 1000; i++) {
      const m = this.db()
        .prepare('SELECT substitui_id FROM movimentacao_estoque WHERE id = ?')
        .get(atual) as { substitui_id: string | null } | undefined;
      if (!m?.substitui_id) break;
      atual = m.substitui_id;
      ids.push(atual);
    }
    return ids;
  }

  /** Destinos de todos os rateios ativos da propriedade, numa só consulta. */
  itensDosRateiosAtivos(propriedadeId: string): Map<string, LinhaItemRateio[]> {
    const mapa = new Map<string, LinhaItemRateio[]>();
    const linhas = this.db()
      .prepare(
        `SELECT i.*, l.nome AS lote_nome, a.identificacao AS animal_identificacao
         FROM rateio_custo r JOIN rateio_custo_item i ON i.rateio_id = r.id
         LEFT JOIN lote l ON l.id = i.lote_id LEFT JOIN animal a ON a.id = i.animal_id
         WHERE r.propriedade_id = ? AND r.deleted_at IS NULL ORDER BY i.rowid`,
      )
      .all(propriedadeId) as Linha[];
    for (const l of linhas) {
      const item: LinhaItemRateio = {
        id: l['id'] as string,
        rateioId: l['rateio_id'] as string,
        loteId: l['lote_id'] as string | null,
        loteNome: l['lote_nome'] as string | null,
        animalId: l['animal_id'] as string | null,
        animalIdentificacao: l['animal_identificacao'] as string | null,
        pesoRelativo: Number(l['peso_relativo']),
        baseDescricao: l['base_descricao'] as string,
      };
      const lista = mapa.get(item.rateioId) ?? [];
      lista.push(item);
      mapa.set(item.rateioId, lista);
    }
    return mapa;
  }

  /**
   * Movimento vigente (fim da cadeia de correções) da origem de cada rateio ativo de consumo,
   * numa só consulta recursiva. Mesma regra de `movimentoVigente`.
   */
  vigentesDosRateiosAtivos(propriedadeId: string): Map<string, { id: string; ativo: boolean }> {
    const linhas = this.db()
      .prepare(
        `WITH RECURSIVE cadeia(rateio_id, atual, nivel) AS (
           SELECT r.id, r.origem_id, 0 FROM rateio_custo r
           WHERE r.propriedade_id = ? AND r.deleted_at IS NULL AND r.origem_tipo = 'movimentacao_estoque'
           UNION ALL
           SELECT c.rateio_id,
                  (SELECT m.id FROM movimentacao_estoque m WHERE m.substitui_id = c.atual ORDER BY m.rowid DESC LIMIT 1),
                  c.nivel + 1
           FROM cadeia c
           WHERE c.nivel < 1000 AND EXISTS (SELECT 1 FROM movimentacao_estoque m WHERE m.substitui_id = c.atual)
         )
         SELECT c.rateio_id, c.atual, m.deleted_at FROM cadeia c
         JOIN movimentacao_estoque m ON m.id = c.atual
         WHERE c.nivel = (SELECT MAX(nivel) FROM cadeia x WHERE x.rateio_id = c.rateio_id)`,
      )
      .all(propriedadeId) as { rateio_id: string; atual: string; deleted_at: string | null }[];
    return new Map(linhas.map((l) => [l.rateio_id, { id: l.atual, ativo: l.deleted_at === null }]));
  }
}
