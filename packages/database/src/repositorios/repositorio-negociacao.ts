import type { CriterioAlocacao, UnidadePreco } from '@pecuaria/domain';
import type { ObterConexao } from './comum';

type Linha = Record<string, unknown>;

export type TipoNegociacao = 'compra' | 'venda';

export interface LinhaNegociacao {
  id: string;
  propriedadeId: string;
  tipo: TipoNegociacao;
  data: string;
  pessoaId: string | null;
  pessoaNome: string | null;
  lancamentoId: string;
  valorTotalCentavos: number;
  criterio: CriterioAlocacao;
  unidadePreco: UnidadePreco;
  precoUnitarioCentavos: number | null;
  observacoes: string | null;
  requisicaoId: string;
  motivoCancelamento: string | null;
  cancelada: boolean;
  criadoEm: string;
}

export interface LinhaItemNegociacao {
  id: string;
  negociacaoId: string;
  tipo: TipoNegociacao;
  animalId: string;
  animalIdentificacao: string;
  movimentacaoId: string;
  valorAlocadoCentavos: number;
  pesoVivoG: number | null;
  pesoCarcacaG: number | null;
  cancelado: boolean;
}

export interface NovaNegociacao {
  id: string;
  propriedadeId: string;
  tipo: TipoNegociacao;
  data: string;
  pessoaId: string | null;
  lancamentoId: string;
  valorTotalCentavos: number;
  criterio: CriterioAlocacao;
  unidadePreco: UnidadePreco;
  precoUnitarioCentavos: number | null;
  observacoes: string | null;
  requisicaoId: string;
}

export interface NovoItemNegociacao {
  id: string;
  negociacaoId: string;
  tipo: TipoNegociacao;
  animalId: string;
  movimentacaoId: string;
  valorAlocadoCentavos: number;
  pesoVivoG: number | null;
  pesoCarcacaG: number | null;
}

export interface FiltrosNegociacoes {
  propriedadeId: string;
  tipo?: TipoNegociacao | undefined;
  pessoaId?: string | undefined;
  dataInicial?: string | undefined;
  dataFinal?: string | undefined;
  incluirCanceladas: boolean;
}

export interface LinhaCustoAnterior {
  id: string;
  propriedadeId: string;
  destino: 'animal' | 'lote';
  animalId: string | null;
  animalIdentificacao: string | null;
  loteId: string | null;
  loteNome: string | null;
  valorCentavos: number;
  dataReferencia: string;
  descricao: string;
  origemInformacao: string;
  justificativa: string;
  requisicaoId: string;
  motivoCancelamento: string | null;
  cancelado: boolean;
  criadoEm: string;
}

export interface LinhaItemCustoAnterior {
  id: string;
  custoAnteriorId: string;
  animalId: string;
  animalIdentificacao: string;
  valorCentavos: number;
  pesoRelativo: number;
}

const SELECT_NEGOCIACAO = `
  SELECT n.*, p.nome AS pessoa_nome
  FROM negociacao_animal n LEFT JOIN pessoa_comercial p ON p.id = n.pessoa_id`;

function negociacao(l: Linha): LinhaNegociacao {
  return {
    id: l['id'] as string,
    propriedadeId: l['propriedade_id'] as string,
    tipo: l['tipo'] as TipoNegociacao,
    data: l['data'] as string,
    pessoaId: l['pessoa_id'] as string | null,
    pessoaNome: l['pessoa_nome'] as string | null,
    lancamentoId: l['lancamento_id'] as string,
    valorTotalCentavos: Number(l['valor_total_centavos']),
    criterio: l['criterio_alocacao'] as CriterioAlocacao,
    unidadePreco: l['unidade_preco'] as UnidadePreco,
    precoUnitarioCentavos:
      l['preco_unitario_centavos'] === null ? null : Number(l['preco_unitario_centavos']),
    observacoes: l['observacoes'] as string | null,
    requisicaoId: l['requisicao_id'] as string,
    motivoCancelamento: l['motivo_cancelamento'] as string | null,
    cancelada: l['deleted_at'] !== null,
    criadoEm: l['created_at'] as string,
  };
}
function item(l: Linha): LinhaItemNegociacao {
  return {
    id: l['id'] as string,
    negociacaoId: l['negociacao_id'] as string,
    tipo: l['tipo'] as TipoNegociacao,
    animalId: l['animal_id'] as string,
    animalIdentificacao: l['animal_identificacao'] as string,
    movimentacaoId: l['movimentacao_animal_id'] as string,
    valorAlocadoCentavos: Number(l['valor_alocado_centavos']),
    pesoVivoG: l['peso_vivo_g'] === null ? null : Number(l['peso_vivo_g']),
    pesoCarcacaG: l['peso_carcaca_g'] === null ? null : Number(l['peso_carcaca_g']),
    cancelado: l['deleted_at'] !== null,
  };
}
function custoAnterior(l: Linha): LinhaCustoAnterior {
  return {
    id: l['id'] as string,
    propriedadeId: l['propriedade_id'] as string,
    destino: l['destino'] as 'animal' | 'lote',
    animalId: l['animal_id'] as string | null,
    animalIdentificacao: l['animal_identificacao'] as string | null,
    loteId: l['lote_id'] as string | null,
    loteNome: l['lote_nome'] as string | null,
    valorCentavos: Number(l['valor_centavos']),
    dataReferencia: l['data_referencia'] as string,
    descricao: l['descricao'] as string,
    origemInformacao: l['origem_informacao'] as string,
    justificativa: l['justificativa'] as string,
    requisicaoId: l['requisicao_id'] as string,
    motivoCancelamento: l['motivo_cancelamento'] as string | null,
    cancelado: l['deleted_at'] !== null,
    criadoEm: l['created_at'] as string,
  };
}

/** SQL e mapeamento das negociações de animais e do custo anterior. Sem regra de negócio. */
export class RepositorioNegociacao {
  constructor(private readonly db: ObterConexao) {}

  // ---- Negociações --------------------------------------------------------------------------
  inserirNegociacao(n: NovaNegociacao, agora: string): void {
    this.db()
      .prepare(
        `INSERT INTO negociacao_animal(id,propriedade_id,tipo,data,pessoa_id,lancamento_id,valor_total_centavos,criterio_alocacao,unidade_preco,preco_unitario_centavos,observacoes,requisicao_id,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        n.id,
        n.propriedadeId,
        n.tipo,
        n.data,
        n.pessoaId,
        n.lancamentoId,
        n.valorTotalCentavos,
        n.criterio,
        n.unidadePreco,
        n.precoUnitarioCentavos,
        n.observacoes,
        n.requisicaoId,
        agora,
        agora,
      );
  }
  inserirItem(i: NovoItemNegociacao, agora: string): void {
    this.db()
      .prepare(
        `INSERT INTO negociacao_animal_item(id,negociacao_id,tipo,animal_id,movimentacao_animal_id,valor_alocado_centavos,peso_vivo_g,peso_carcaca_g,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        i.id,
        i.negociacaoId,
        i.tipo,
        i.animalId,
        i.movimentacaoId,
        i.valorAlocadoCentavos,
        i.pesoVivoG,
        i.pesoCarcacaG,
        agora,
        agora,
      );
  }
  obterNegociacao(id: string): LinhaNegociacao | null {
    const r = this.db().prepare(`${SELECT_NEGOCIACAO} WHERE n.id = ?`).get(id) as Linha | undefined;
    return r ? negociacao(r) : null;
  }
  negociacaoPorRequisicao(requisicaoId: string): LinhaNegociacao | null {
    const r = this.db()
      .prepare(`${SELECT_NEGOCIACAO} WHERE n.requisicao_id = ?`)
      .get(requisicaoId) as Linha | undefined;
    return r ? negociacao(r) : null;
  }
  negociacaoDoLancamento(lancamentoId: string): LinhaNegociacao | null {
    const r = this.db()
      .prepare(`${SELECT_NEGOCIACAO} WHERE n.lancamento_id = ?`)
      .get(lancamentoId) as Linha | undefined;
    return r ? negociacao(r) : null;
  }

  private condicoes(f: FiltrosNegociacoes): { where: string; params: unknown[] } {
    const c = ['n.propriedade_id = ?'];
    const params: unknown[] = [f.propriedadeId];
    if (!f.incluirCanceladas) c.push('n.deleted_at IS NULL');
    const simples: [unknown, string][] = [
      [f.tipo, 'n.tipo = ?'],
      [f.pessoaId, 'n.pessoa_id = ?'],
      [f.dataInicial, 'n.data >= ?'],
      [f.dataFinal, 'n.data <= ?'],
    ];
    for (const [v, sql] of simples)
      if (v !== undefined) {
        c.push(sql);
        params.push(v);
      }
    return { where: c.join(' AND '), params };
  }
  contarNegociacoes(f: FiltrosNegociacoes): number {
    const { where, params } = this.condicoes(f);
    return (
      this.db()
        .prepare(`SELECT COUNT(*) AS n FROM negociacao_animal n WHERE ${where}`)
        .get(...params) as { n: number }
    ).n;
  }
  listarNegociacoes(
    f: FiltrosNegociacoes,
    pagina: { limite: number; deslocamento: number },
  ): LinhaNegociacao[] {
    const { where, params } = this.condicoes(f);
    return (
      this.db()
        .prepare(
          `${SELECT_NEGOCIACAO} WHERE ${where} ORDER BY n.data DESC, n.created_at DESC, n.id DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, pagina.limite, pagina.deslocamento) as Linha[]
    ).map(negociacao);
  }

  itensDaNegociacao(negociacaoId: string): LinhaItemNegociacao[] {
    return (
      this.db()
        .prepare(
          `SELECT i.*, a.identificacao AS animal_identificacao FROM negociacao_animal_item i
           JOIN animal a ON a.id = i.animal_id
           WHERE i.negociacao_id = ? ORDER BY a.identificacao_normalizada, i.id`,
        )
        .all(negociacaoId) as Linha[]
    ).map(item);
  }
  /** Contagem de itens por negociação, em lote (para a lista). */
  contagemDeItens(ids: readonly string[]): Map<string, number> {
    const mapa = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 500) {
      const bloco = ids.slice(i, i + 500);
      const linhas = this.db()
        .prepare(
          `SELECT negociacao_id, COUNT(*) AS n FROM negociacao_animal_item
           WHERE negociacao_id IN (${bloco.map(() => '?').join(',')}) GROUP BY negociacao_id`,
        )
        .all(...bloco) as { negociacao_id: string; n: number }[];
      for (const l of linhas) mapa.set(l.negociacao_id, l.n);
    }
    return mapa;
  }
  /**
   * Item ativo (não cancelado) do animal para o tipo, com a negociação. Venda devolvida pelo
   * comprador deixa de ser a venda vigente (o animal voltou); compra devolvida ao fornecedor
   * continua sendo a aquisição histórica do animal.
   */
  itemAtivoDoAnimal(animalId: string, tipo: TipoNegociacao): LinhaItemNegociacao | null {
    const r = this.db()
      .prepare(
        `SELECT i.*, a.identificacao AS animal_identificacao FROM negociacao_animal_item i
         JOIN animal a ON a.id = i.animal_id
         WHERE i.animal_id = ? AND i.tipo = ? AND i.deleted_at IS NULL
           AND (i.tipo = 'compra' OR NOT EXISTS (
             SELECT 1 FROM devolucao_animal_item d WHERE d.negociacao_item_id = i.id AND d.deleted_at IS NULL))
         ORDER BY i.created_at DESC, i.rowid DESC LIMIT 1`,
      )
      .get(animalId, tipo) as Linha | undefined;
    return r ? item(r) : null;
  }
  /** O animal aparece em alguma negociação, ativa ou cancelada (impede exclusão do cadastro). */
  temItemDoAnimal(animalId: string): boolean {
    return Boolean(
      this.db()
        .prepare('SELECT 1 FROM negociacao_animal_item WHERE animal_id = ? LIMIT 1')
        .get(animalId),
    );
  }
  itemPorMovimentacao(movimentacaoId: string): LinhaItemNegociacao | null {
    const r = this.db()
      .prepare(
        `SELECT i.*, a.identificacao AS animal_identificacao FROM negociacao_animal_item i
         JOIN animal a ON a.id = i.animal_id WHERE i.movimentacao_animal_id = ?`,
      )
      .get(movimentacaoId) as Linha | undefined;
    return r ? item(r) : null;
  }
  cancelarNegociacao(id: string, motivo: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE negociacao_animal SET deleted_at=?,motivo_cancelamento=?,updated_at=? WHERE id=? AND deleted_at IS NULL',
      )
      .run(agora, motivo, agora, id);
  }
  cancelarItens(negociacaoId: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE negociacao_animal_item SET deleted_at=?,updated_at=? WHERE negociacao_id=? AND deleted_at IS NULL',
      )
      .run(agora, agora, negociacaoId);
  }
  /** Lançamentos de acessórios da aquisição lançados direto ao animal (frete, comissão). */
  acessoriosDoAnimal(animalId: string): { id: string; valorCentavos: number }[] {
    return (
      this.db()
        .prepare(
          `SELECT l.id AS id, l.valor_total_centavos AS valor
           FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id
           WHERE l.animal_id = ? AND l.deleted_at IS NULL AND l.natureza = 'despesa'
             AND c.tratamento = 'ativo_animal' AND l.origem_tipo = 'manual'
           ORDER BY l.data_competencia, l.id`,
        )
        .all(animalId) as { id: string; valor: number }[]
    ).map((l) => ({ id: l.id, valorCentavos: Number(l.valor) }));
  }

  // ---- Custo anterior ao sistema (D-G) ------------------------------------------------------
  inserirCustoAnterior(
    c: Omit<
      LinhaCustoAnterior,
      'animalIdentificacao' | 'loteNome' | 'cancelado' | 'criadoEm' | 'motivoCancelamento'
    >,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO custo_anterior(id,propriedade_id,destino,animal_id,lote_id,valor_centavos,data_referencia,descricao,origem_informacao,justificativa,requisicao_id,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        c.id,
        c.propriedadeId,
        c.destino,
        c.animalId,
        c.loteId,
        c.valorCentavos,
        c.dataReferencia,
        c.descricao,
        c.origemInformacao,
        c.justificativa,
        c.requisicaoId,
        agora,
        agora,
      );
  }
  inserirItemCustoAnterior(
    i: {
      id: string;
      custoAnteriorId: string;
      animalId: string;
      valorCentavos: number;
      pesoRelativo: number;
    },
    agora: string,
  ): void {
    this.db()
      .prepare(
        'INSERT INTO custo_anterior_item(id,custo_anterior_id,animal_id,valor_centavos,peso_relativo,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(i.id, i.custoAnteriorId, i.animalId, i.valorCentavos, i.pesoRelativo, agora, agora);
  }
  private selectCustoAnterior = `SELECT c.*, a.identificacao AS animal_identificacao, lt.nome AS lote_nome
    FROM custo_anterior c LEFT JOIN animal a ON a.id = c.animal_id LEFT JOIN lote lt ON lt.id = c.lote_id`;
  obterCustoAnterior(id: string): LinhaCustoAnterior | null {
    const r = this.db().prepare(`${this.selectCustoAnterior} WHERE c.id = ?`).get(id) as
      Linha | undefined;
    return r ? custoAnterior(r) : null;
  }
  custoAnteriorPorRequisicao(requisicaoId: string): LinhaCustoAnterior | null {
    const r = this.db()
      .prepare(`${this.selectCustoAnterior} WHERE c.requisicao_id = ?`)
      .get(requisicaoId) as Linha | undefined;
    return r ? custoAnterior(r) : null;
  }
  listarCustosAnteriores(f: {
    propriedadeId: string;
    animalId?: string | undefined;
    loteId?: string | undefined;
    incluirCancelados: boolean;
  }): LinhaCustoAnterior[] {
    const c = ['c.propriedade_id = ?'];
    const params: unknown[] = [f.propriedadeId];
    if (!f.incluirCancelados) c.push('c.deleted_at IS NULL');
    if (f.animalId) {
      // Inclui o que foi distribuído ao animal a partir de um lote.
      c.push(
        '(c.animal_id = ? OR c.id IN (SELECT custo_anterior_id FROM custo_anterior_item WHERE animal_id = ?))',
      );
      params.push(f.animalId, f.animalId);
    }
    if (f.loteId) {
      c.push('c.lote_id = ?');
      params.push(f.loteId);
    }
    return (
      this.db()
        .prepare(
          `${this.selectCustoAnterior} WHERE ${c.join(' AND ')} ORDER BY c.data_referencia DESC, c.created_at DESC, c.id DESC`,
        )
        .all(...params) as Linha[]
    ).map(custoAnterior);
  }
  itensDoCustoAnterior(custoAnteriorId: string): LinhaItemCustoAnterior[] {
    return (
      this.db()
        .prepare(
          `SELECT i.*, a.identificacao AS animal_identificacao FROM custo_anterior_item i
           JOIN animal a ON a.id = i.animal_id WHERE i.custo_anterior_id = ?
           ORDER BY a.identificacao_normalizada, i.id`,
        )
        .all(custoAnteriorId) as Linha[]
    ).map((l) => ({
      id: l['id'] as string,
      custoAnteriorId: l['custo_anterior_id'] as string,
      animalId: l['animal_id'] as string,
      animalIdentificacao: l['animal_identificacao'] as string,
      valorCentavos: Number(l['valor_centavos']),
      pesoRelativo: Number(l['peso_relativo']),
    }));
  }
  /** Valores de custo anterior distribuídos ao animal, só de registros não cancelados. */
  custosAnterioresDoAnimal(animalId: string): number[] {
    return (
      this.db()
        .prepare(
          `SELECT i.valor_centavos AS v FROM custo_anterior_item i
           JOIN custo_anterior c ON c.id = i.custo_anterior_id
           WHERE i.animal_id = ? AND c.deleted_at IS NULL ORDER BY c.data_referencia, c.id`,
        )
        .all(animalId) as { v: number }[]
    ).map((l) => Number(l.v));
  }
  animalTemCustoAnterior(animalId: string): boolean {
    return Boolean(
      this.db()
        .prepare(
          `SELECT 1 FROM custo_anterior_item i JOIN custo_anterior c ON c.id = i.custo_anterior_id
           WHERE i.animal_id = ? AND c.deleted_at IS NULL LIMIT 1`,
        )
        .get(animalId),
    );
  }
  cancelarCustoAnterior(id: string, motivo: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE custo_anterior SET deleted_at=?,motivo_cancelamento=?,updated_at=? WHERE id=? AND deleted_at IS NULL',
      )
      .run(agora, motivo, agora, id);
  }
}
