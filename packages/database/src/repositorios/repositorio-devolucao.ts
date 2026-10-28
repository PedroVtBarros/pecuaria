import type { ObterConexao } from './comum';
import type { TipoNegociacao } from './repositorio-negociacao';

type Linha = Record<string, unknown>;

export interface LinhaDevolucao {
  id: string;
  propriedadeId: string;
  tipo: TipoNegociacao;
  negociacaoId: string;
  data: string;
  lancamentoId: string;
  valorTotalCentavos: number;
  observacoes: string | null;
  requisicaoId: string;
  motivoCancelamento: string | null;
  cancelada: boolean;
  criadoEm: string;
}

export interface LinhaItemDevolucao {
  id: string;
  devolucaoId: string;
  negociacaoItemId: string;
  animalId: string;
  animalIdentificacao: string;
  movimentacaoId: string;
  valorCentavos: number;
  /** Valor atribuído ao animal na negociação original (para a conferência). */
  valorOriginalCentavos: number;
  cancelado: boolean;
}

export interface LinhaCompensacao {
  id: string;
  devolucaoId: string;
  parcelaOrigemId: string;
  parcelaDevolucaoId: string;
  data: string;
  valorCentavos: number;
  cancelada: boolean;
}

export interface NovaDevolucao {
  id: string;
  propriedadeId: string;
  tipo: TipoNegociacao;
  negociacaoId: string;
  data: string;
  lancamentoId: string;
  valorTotalCentavos: number;
  observacoes: string | null;
  requisicaoId: string;
}

/** Devolução de venda (retorno ao rebanho) ou de compra (saída ao fornecedor), por animal. */
export interface DevolucaoParaResultado {
  tipo: TipoNegociacao;
  devolucaoId: string;
  negociacaoId: string;
  animalId: string;
  identificacao: string;
  data: string;
  movimentacaoId: string;
  /** Saída da venda original (venda devolvida) ou a própria saída (compra devolvida). */
  saidaOriginalId: string | null;
  dataNegociacao: string;
  valorCentavos: number;
  valorOriginalCentavos: number;
}

function devolucao(l: Linha): LinhaDevolucao {
  return {
    id: l['id'] as string,
    propriedadeId: l['propriedade_id'] as string,
    tipo: l['tipo'] as TipoNegociacao,
    negociacaoId: l['negociacao_id'] as string,
    data: l['data'] as string,
    lancamentoId: l['lancamento_id'] as string,
    valorTotalCentavos: Number(l['valor_total_centavos']),
    observacoes: l['observacoes'] as string | null,
    requisicaoId: l['requisicao_id'] as string,
    motivoCancelamento: l['motivo_cancelamento'] as string | null,
    cancelada: l['deleted_at'] !== null,
    criadoEm: l['created_at'] as string,
  };
}
function item(l: Linha): LinhaItemDevolucao {
  return {
    id: l['id'] as string,
    devolucaoId: l['devolucao_id'] as string,
    negociacaoItemId: l['negociacao_item_id'] as string,
    animalId: l['animal_id'] as string,
    animalIdentificacao: l['animal_identificacao'] as string,
    movimentacaoId: l['movimentacao_animal_id'] as string,
    valorCentavos: Number(l['valor_centavos']),
    valorOriginalCentavos: Number(l['valor_original']),
    cancelado: l['deleted_at'] !== null,
  };
}
function compensacao(l: Linha): LinhaCompensacao {
  return {
    id: l['id'] as string,
    devolucaoId: l['devolucao_id'] as string,
    parcelaOrigemId: l['parcela_origem_id'] as string,
    parcelaDevolucaoId: l['parcela_devolucao_id'] as string,
    data: l['data'] as string,
    valorCentavos: Number(l['valor_centavos']),
    cancelada: l['deleted_at'] !== null,
  };
}

/** SQL e mapeamento das devoluções de animais e das compensações. Sem regra de negócio. */
export class RepositorioDevolucao {
  constructor(private readonly db: ObterConexao) {}

  inserirDevolucao(d: NovaDevolucao, agora: string): void {
    this.db()
      .prepare(
        `INSERT INTO devolucao_animal(id,propriedade_id,tipo,negociacao_id,data,lancamento_id,valor_total_centavos,observacoes,requisicao_id,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        d.id,
        d.propriedadeId,
        d.tipo,
        d.negociacaoId,
        d.data,
        d.lancamentoId,
        d.valorTotalCentavos,
        d.observacoes,
        d.requisicaoId,
        agora,
        agora,
      );
  }
  inserirItem(
    i: {
      id: string;
      devolucaoId: string;
      negociacaoItemId: string;
      animalId: string;
      movimentacaoId: string;
      valorCentavos: number;
    },
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO devolucao_animal_item(id,devolucao_id,negociacao_item_id,animal_id,movimentacao_animal_id,valor_centavos,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        i.id,
        i.devolucaoId,
        i.negociacaoItemId,
        i.animalId,
        i.movimentacaoId,
        i.valorCentavos,
        agora,
        agora,
      );
  }
  inserirCompensacao(
    k: {
      id: string;
      devolucaoId: string;
      parcelaOrigemId: string;
      parcelaDevolucaoId: string;
      data: string;
      valorCentavos: number;
    },
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO compensacao_financeira(id,devolucao_id,parcela_origem_id,parcela_devolucao_id,data,valor_centavos,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        k.id,
        k.devolucaoId,
        k.parcelaOrigemId,
        k.parcelaDevolucaoId,
        k.data,
        k.valorCentavos,
        agora,
        agora,
      );
  }

  obter(id: string): LinhaDevolucao | null {
    const r = this.db().prepare('SELECT * FROM devolucao_animal WHERE id = ?').get(id) as
      Linha | undefined;
    return r ? devolucao(r) : null;
  }
  porRequisicao(requisicaoId: string): LinhaDevolucao | null {
    const r = this.db()
      .prepare('SELECT * FROM devolucao_animal WHERE requisicao_id = ?')
      .get(requisicaoId) as Linha | undefined;
    return r ? devolucao(r) : null;
  }
  daNegociacao(negociacaoId: string): LinhaDevolucao[] {
    return (
      this.db()
        .prepare(
          'SELECT * FROM devolucao_animal WHERE negociacao_id = ? ORDER BY data, created_at, id',
        )
        .all(negociacaoId) as Linha[]
    ).map(devolucao);
  }
  doLancamento(lancamentoId: string): LinhaDevolucao | null {
    const r = this.db()
      .prepare('SELECT * FROM devolucao_animal WHERE lancamento_id = ?')
      .get(lancamentoId) as Linha | undefined;
    return r ? devolucao(r) : null;
  }
  itens(devolucaoId: string): LinhaItemDevolucao[] {
    return (
      this.db()
        .prepare(
          `SELECT d.*, a.identificacao AS animal_identificacao, i.valor_alocado_centavos AS valor_original
           FROM devolucao_animal_item d JOIN animal a ON a.id = d.animal_id
           JOIN negociacao_animal_item i ON i.id = d.negociacao_item_id
           WHERE d.devolucao_id = ? ORDER BY a.identificacao_normalizada, d.id`,
        )
        .all(devolucaoId) as Linha[]
    ).map(item);
  }
  /** Item de devolução ativo do item de negociação (o animal já foi devolvido por ela). */
  itemAtivoDoItemDeNegociacao(negociacaoItemId: string): LinhaItemDevolucao | null {
    const r = this.db()
      .prepare(
        `SELECT d.*, a.identificacao AS animal_identificacao, i.valor_alocado_centavos AS valor_original
         FROM devolucao_animal_item d JOIN animal a ON a.id = d.animal_id
         JOIN negociacao_animal_item i ON i.id = d.negociacao_item_id
         WHERE d.negociacao_item_id = ? AND d.deleted_at IS NULL`,
      )
      .get(negociacaoItemId) as Linha | undefined;
    return r ? item(r) : null;
  }
  /** Item de devolução ativo ligado à movimentação (retorno ou saída ao fornecedor). */
  itemAtivoPorMovimentacao(movimentacaoId: string): LinhaItemDevolucao | null {
    const r = this.db()
      .prepare(
        `SELECT d.*, a.identificacao AS animal_identificacao, i.valor_alocado_centavos AS valor_original
         FROM devolucao_animal_item d JOIN animal a ON a.id = d.animal_id
         JOIN negociacao_animal_item i ON i.id = d.negociacao_item_id
         WHERE d.movimentacao_animal_id = ? AND d.deleted_at IS NULL`,
      )
      .get(movimentacaoId) as Linha | undefined;
    return r ? item(r) : null;
  }
  compensacoes(devolucaoId: string): LinhaCompensacao[] {
    return (
      this.db()
        .prepare(
          'SELECT * FROM compensacao_financeira WHERE devolucao_id = ? ORDER BY created_at, id',
        )
        .all(devolucaoId) as Linha[]
    ).map(compensacao);
  }
  temDevolucaoAtiva(negociacaoId: string): boolean {
    return Boolean(
      this.db()
        .prepare(
          'SELECT 1 FROM devolucao_animal WHERE negociacao_id = ? AND deleted_at IS NULL LIMIT 1',
        )
        .get(negociacaoId),
    );
  }

  cancelarCompensacoes(devolucaoId: string, motivo: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE compensacao_financeira SET deleted_at=?,motivo_cancelamento=?,updated_at=? WHERE devolucao_id=? AND deleted_at IS NULL',
      )
      .run(agora, motivo, agora, devolucaoId);
  }
  cancelar(id: string, motivo: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE devolucao_animal SET deleted_at=?,motivo_cancelamento=?,updated_at=? WHERE id=? AND deleted_at IS NULL',
      )
      .run(agora, motivo, agora, id);
  }
  cancelarItens(devolucaoId: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE devolucao_animal_item SET deleted_at=?,updated_at=? WHERE devolucao_id=? AND deleted_at IS NULL',
      )
      .run(agora, agora, devolucaoId);
  }

  /**
   * Conferência das devoluções da propriedade: compensações ativas fora da regra (devolução,
   * parcela ou lançamento cancelados; parcela com pagamento + compensação acima do valor) e
   * devoluções ativas com o lançamento cancelado. Zero quando tudo fecha.
   */
  inconsistencias(propriedadeId: string): number {
    const r = this.db()
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM compensacao_financeira k
            JOIN devolucao_animal d ON d.id = k.devolucao_id
            JOIN parcela_financeira po ON po.id = k.parcela_origem_id
            JOIN parcela_financeira pd ON pd.id = k.parcela_devolucao_id
            WHERE d.propriedade_id = @p AND k.deleted_at IS NULL
              AND (d.deleted_at IS NOT NULL OR po.deleted_at IS NOT NULL OR pd.deleted_at IS NOT NULL))
         + (SELECT COUNT(*) FROM devolucao_animal d JOIN lancamento_financeiro l ON l.id = d.lancamento_id
            WHERE d.propriedade_id = @p AND d.deleted_at IS NULL AND l.deleted_at IS NOT NULL)
         + (SELECT COUNT(*) FROM parcela_financeira pf JOIN lancamento_financeiro l ON l.id = pf.lancamento_id
            WHERE l.propriedade_id = @p AND pf.deleted_at IS NULL
              AND pf.valor_centavos <
                COALESCE((SELECT SUM(g.valor_centavos) FROM pagamento_financeiro g WHERE g.parcela_id = pf.id AND g.deleted_at IS NULL), 0)
                + COALESCE((SELECT SUM(k.valor_centavos) FROM compensacao_financeira k
                            WHERE (k.parcela_origem_id = pf.id OR k.parcela_devolucao_id = pf.id) AND k.deleted_at IS NULL), 0)) AS n`,
      )
      .get({ p: propriedadeId }) as { n: number };
    return Number(r.n);
  }

  /** Devoluções ativas da propriedade, por animal, para o resultado (todas as datas). */
  paraResultado(propriedadeId: string): DevolucaoParaResultado[] {
    return (
      this.db()
        .prepare(
          `SELECT dv.tipo, dv.id AS devolucao_id, dv.negociacao_id, d.animal_id, a.identificacao, dv.data,
                  d.movimentacao_animal_id, ni.movimentacao_animal_id AS saida_original, n.data AS data_negociacao,
                  d.valor_centavos, ni.valor_alocado_centavos
           FROM devolucao_animal_item d
           JOIN devolucao_animal dv ON dv.id = d.devolucao_id
           JOIN negociacao_animal n ON n.id = dv.negociacao_id
           JOIN negociacao_animal_item ni ON ni.id = d.negociacao_item_id
           JOIN animal a ON a.id = d.animal_id
           WHERE dv.propriedade_id = ? AND d.deleted_at IS NULL AND dv.deleted_at IS NULL
           ORDER BY dv.data, a.identificacao_normalizada`,
        )
        .all(propriedadeId) as Linha[]
    ).map((r) => ({
      tipo: r['tipo'] as TipoNegociacao,
      devolucaoId: r['devolucao_id'] as string,
      negociacaoId: r['negociacao_id'] as string,
      animalId: r['animal_id'] as string,
      identificacao: r['identificacao'] as string,
      data: r['data'] as string,
      movimentacaoId: r['movimentacao_animal_id'] as string,
      saidaOriginalId: r['tipo'] === 'venda' ? (r['saida_original'] as string) : null,
      dataNegociacao: r['data_negociacao'] as string,
      valorCentavos: Number(r['valor_centavos']),
      valorOriginalCentavos: Number(r['valor_alocado_centavos']),
    }));
  }
}
