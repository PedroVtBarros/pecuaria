import type { ObterConexao } from './comum';

type Linha = Record<string, unknown>;

export interface LinhaCentro {
  id: string;
  propriedadeId: string;
  nome: string;
  tipo: 'volumoso' | 'outro';
  areaId: string | null;
  areaNome: string | null;
  dataInicio: string;
  dataFim: string | null;
  estoqueItemId: string;
  estoqueItemNome: string;
  unidadeBase: string;
  status: 'aberto' | 'encerrado';
  quantidadeProduzidaMilesimos: number | null;
  movimentacaoEstoqueId: string | null;
  custoConhecidoCentavos: number | null;
  componentesDesconhecidos: number | null;
  custoTotalCentavos: number | null;
  observacoes: string | null;
  requisicaoId: string;
  motivoCancelamento: string | null;
  cancelado: boolean;
  criadoEm: string;
}

export interface NovoCentro {
  id: string;
  propriedadeId: string;
  nome: string;
  nomeNormalizado: string;
  tipo: 'volumoso' | 'outro';
  areaId: string | null;
  dataInicio: string;
  estoqueItemId: string;
  observacoes: string | null;
  requisicaoId: string;
}

export interface ConsumoDoCentro {
  movimentacaoId: string;
  data: string;
  tipo: string;
  itemId: string;
  itemNome: string;
  quantidadeMilesimos: number;
  unidadeBase: string;
  /** `null`: custo desconhecido. */
  custoCentavos: number | null;
}
export interface LancamentoDoCentro {
  id: string;
  data: string;
  descricao: string;
  valorCentavos: number;
  cancelado: boolean;
}
export interface CentroDoVinculo {
  centroId: string;
  nome: string;
  status: 'aberto' | 'encerrado';
}

const SELECT_CENTRO = `
  SELECT c.*, a.nome AS area_nome, i.nome AS item_nome, i.unidade_base AS item_unidade
  FROM centro_producao c
  JOIN estoque_item i ON i.id = c.estoque_item_id
  LEFT JOIN area a ON a.id = c.area_id`;

function centro(l: Linha): LinhaCentro {
  const n = (v: unknown) => (v === null ? null : Number(v));
  return {
    id: l['id'] as string,
    propriedadeId: l['propriedade_id'] as string,
    nome: l['nome'] as string,
    tipo: l['tipo'] as LinhaCentro['tipo'],
    areaId: l['area_id'] as string | null,
    areaNome: l['area_nome'] as string | null,
    dataInicio: l['data_inicio'] as string,
    dataFim: l['data_fim'] as string | null,
    estoqueItemId: l['estoque_item_id'] as string,
    estoqueItemNome: l['item_nome'] as string,
    unidadeBase: l['item_unidade'] as string,
    status: l['status'] as LinhaCentro['status'],
    quantidadeProduzidaMilesimos: n(l['quantidade_produzida_milesimos']),
    movimentacaoEstoqueId: l['movimentacao_estoque_id'] as string | null,
    custoConhecidoCentavos: n(l['custo_conhecido_centavos']),
    componentesDesconhecidos: n(l['componentes_desconhecidos']),
    custoTotalCentavos: n(l['custo_total_centavos']),
    observacoes: l['observacoes'] as string | null,
    requisicaoId: l['requisicao_id'] as string,
    motivoCancelamento: l['motivo_cancelamento'] as string | null,
    cancelado: l['deleted_at'] !== null,
    criadoEm: l['created_at'] as string,
  };
}

/** SQL e mapeamento da produção própria (centros de produção e seus vínculos). Sem regra de negócio. */
export class RepositorioProducao {
  constructor(private readonly db: ObterConexao) {}

  inserirCentro(c: NovoCentro, agora: string): void {
    this.db()
      .prepare(
        `INSERT INTO centro_producao(id,propriedade_id,nome,nome_normalizado,tipo,area_id,data_inicio,estoque_item_id,observacoes,requisicao_id,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        c.id,
        c.propriedadeId,
        c.nome,
        c.nomeNormalizado,
        c.tipo,
        c.areaId,
        c.dataInicio,
        c.estoqueItemId,
        c.observacoes,
        c.requisicaoId,
        agora,
        agora,
      );
  }
  atualizarCentro(
    id: string,
    d: {
      nome: string;
      nomeNormalizado: string;
      tipo: 'volumoso' | 'outro';
      areaId: string | null;
      dataInicio: string;
      observacoes: string | null;
    },
    agora: string,
  ): void {
    this.db()
      .prepare(
        'UPDATE centro_producao SET nome=?,nome_normalizado=?,tipo=?,area_id=?,data_inicio=?,observacoes=?,updated_at=? WHERE id=?',
      )
      .run(d.nome, d.nomeNormalizado, d.tipo, d.areaId, d.dataInicio, d.observacoes, agora, id);
  }
  obterCentro(id: string): LinhaCentro | null {
    const r = this.db().prepare(`${SELECT_CENTRO} WHERE c.id = ?`).get(id) as Linha | undefined;
    return r ? centro(r) : null;
  }
  centroPorRequisicao(requisicaoId: string): LinhaCentro | null {
    const r = this.db().prepare(`${SELECT_CENTRO} WHERE c.requisicao_id = ?`).get(requisicaoId) as
      Linha | undefined;
    return r ? centro(r) : null;
  }
  listarCentros(propriedadeId: string, incluirCancelados: boolean): LinhaCentro[] {
    return (
      this.db()
        .prepare(
          `${SELECT_CENTRO} WHERE c.propriedade_id = ? ${incluirCancelados ? '' : 'AND c.deleted_at IS NULL'}
           ORDER BY c.status, c.data_inicio DESC, c.id`,
        )
        .all(propriedadeId) as Linha[]
    ).map(centro);
  }
  nomeEmUso(propriedadeId: string, nomeNormalizado: string, excetoId: string | null): boolean {
    return Boolean(
      this.db()
        .prepare(
          'SELECT 1 FROM centro_producao WHERE propriedade_id=? AND nome_normalizado=? AND deleted_at IS NULL AND id IS NOT ?',
        )
        .get(propriedadeId, nomeNormalizado, excetoId),
    );
  }
  encerrar(
    id: string,
    d: {
      dataFim: string;
      quantidadeMilesimos: number;
      movimentacaoEstoqueId: string;
      conhecidoCentavos: number;
      desconhecidos: number;
      totalCentavos: number | null;
    },
    agora: string,
  ): void {
    this.db()
      .prepare(
        `UPDATE centro_producao SET status='encerrado', data_fim=?, quantidade_produzida_milesimos=?, movimentacao_estoque_id=?,
           custo_conhecido_centavos=?, componentes_desconhecidos=?, custo_total_centavos=?, updated_at=? WHERE id=?`,
      )
      .run(
        d.dataFim,
        d.quantidadeMilesimos,
        d.movimentacaoEstoqueId,
        d.conhecidoCentavos,
        d.desconhecidos,
        d.totalCentavos,
        agora,
        id,
      );
  }
  reabrir(id: string, agora: string): void {
    this.db()
      .prepare(
        `UPDATE centro_producao SET status='aberto', data_fim=NULL, quantidade_produzida_milesimos=NULL, movimentacao_estoque_id=NULL,
           custo_conhecido_centavos=NULL, componentes_desconhecidos=NULL, custo_total_centavos=NULL, updated_at=? WHERE id=?`,
      )
      .run(agora, id);
  }
  cancelarCentro(id: string, motivo: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE centro_producao SET deleted_at=?, motivo_cancelamento=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
      )
      .run(agora, motivo, agora, id);
  }

  // ---- Vínculos -----------------------------------------------------------------------------
  vincularConsumo(id: string, centroId: string, movimentacaoId: string, agora: string): void {
    this.db()
      .prepare(
        'INSERT INTO centro_producao_consumo(id,centro_id,movimentacao_estoque_id,created_at,updated_at) VALUES(?,?,?,?,?)',
      )
      .run(id, centroId, movimentacaoId, agora, agora);
  }
  vincularLancamento(id: string, centroId: string, lancamentoId: string, agora: string): void {
    this.db()
      .prepare(
        'INSERT INTO centro_producao_lancamento(id,centro_id,lancamento_id,created_at,updated_at) VALUES(?,?,?,?,?)',
      )
      .run(id, centroId, lancamentoId, agora, agora);
  }
  desvincularConsumo(movimentacaoId: string, agora: string): number {
    return this.db()
      .prepare(
        'UPDATE centro_producao_consumo SET deleted_at=?, updated_at=? WHERE movimentacao_estoque_id=? AND deleted_at IS NULL',
      )
      .run(agora, agora, movimentacaoId).changes;
  }
  desvincularLancamento(lancamentoId: string, agora: string): number {
    return this.db()
      .prepare(
        'UPDATE centro_producao_lancamento SET deleted_at=?, updated_at=? WHERE lancamento_id=? AND deleted_at IS NULL',
      )
      .run(agora, agora, lancamentoId).changes;
  }
  /** A correção do estoque cria um movimento novo: o vínculo o acompanha. */
  transferirConsumo(antigoId: string, novoId: string, agora: string): number {
    return this.db()
      .prepare(
        'UPDATE centro_producao_consumo SET movimentacao_estoque_id=?, updated_at=? WHERE movimentacao_estoque_id=? AND deleted_at IS NULL',
      )
      .run(novoId, agora, antigoId).changes;
  }
  centroDoConsumo(movimentacaoId: string): CentroDoVinculo | null {
    const r = this.db()
      .prepare(
        `SELECT c.id, c.nome, c.status FROM centro_producao_consumo v JOIN centro_producao c ON c.id = v.centro_id
         WHERE v.movimentacao_estoque_id = ? AND v.deleted_at IS NULL`,
      )
      .get(movimentacaoId) as Linha | undefined;
    return r
      ? {
          centroId: r['id'] as string,
          nome: r['nome'] as string,
          status: r['status'] as CentroDoVinculo['status'],
        }
      : null;
  }
  centroDoLancamento(lancamentoId: string): CentroDoVinculo | null {
    const r = this.db()
      .prepare(
        `SELECT c.id, c.nome, c.status FROM centro_producao_lancamento v JOIN centro_producao c ON c.id = v.centro_id
         WHERE v.lancamento_id = ? AND v.deleted_at IS NULL`,
      )
      .get(lancamentoId) as Linha | undefined;
    return r
      ? {
          centroId: r['id'] as string,
          nome: r['nome'] as string,
          status: r['status'] as CentroDoVinculo['status'],
        }
      : null;
  }
  /** Centro encerrado que gerou esta entrada de produção. */
  centroDaEntrada(movimentacaoId: string): CentroDoVinculo | null {
    const r = this.db()
      .prepare(
        "SELECT id, nome, status FROM centro_producao WHERE movimentacao_estoque_id = ? AND status = 'encerrado'",
      )
      .get(movimentacaoId) as Linha | undefined;
    return r
      ? {
          centroId: r['id'] as string,
          nome: r['nome'] as string,
          status: r['status'] as CentroDoVinculo['status'],
        }
      : null;
  }

  consumosDoCentro(centroId: string): ConsumoDoCentro[] {
    return (
      this.db()
        .prepare(
          `SELECT m.id, m.data, m.tipo, m.estoque_item_id, i.nome AS item_nome, m.quantidade_milesimos, m.unidade_base,
                  m.custo_apropriado_centavos
           FROM centro_producao_consumo v JOIN movimentacao_estoque m ON m.id = v.movimentacao_estoque_id
           JOIN estoque_item i ON i.id = m.estoque_item_id
           WHERE v.centro_id = ? AND v.deleted_at IS NULL AND m.deleted_at IS NULL
           ORDER BY m.data, m.ordem`,
        )
        .all(centroId) as Linha[]
    ).map((r) => ({
      movimentacaoId: r['id'] as string,
      data: r['data'] as string,
      tipo: r['tipo'] as string,
      itemId: r['estoque_item_id'] as string,
      itemNome: r['item_nome'] as string,
      quantidadeMilesimos: Number(r['quantidade_milesimos']),
      unidadeBase: r['unidade_base'] as string,
      custoCentavos:
        r['custo_apropriado_centavos'] === null ? null : Number(r['custo_apropriado_centavos']),
    }));
  }
  lancamentosDoCentro(centroId: string): LancamentoDoCentro[] {
    return (
      this.db()
        .prepare(
          `SELECT l.id, l.data_competencia, l.descricao, l.valor_total_centavos, l.deleted_at
           FROM centro_producao_lancamento v JOIN lancamento_financeiro l ON l.id = v.lancamento_id
           WHERE v.centro_id = ? AND v.deleted_at IS NULL
           ORDER BY l.data_competencia, l.id`,
        )
        .all(centroId) as Linha[]
    ).map((r) => ({
      id: r['id'] as string,
      data: r['data_competencia'] as string,
      descricao: r['descricao'] as string,
      valorCentavos: Number(r['valor_total_centavos']),
      cancelado: r['deleted_at'] !== null,
    }));
  }

  /** Despesas que podem ser vinculadas a um centro: manuais, de resultado, da propriedade, livres. */
  lancamentosVinculaveis(propriedadeId: string): LancamentoDoCentro[] {
    return (
      this.db()
        .prepare(
          `SELECT l.id, l.data_competencia, l.descricao, l.valor_total_centavos
           FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id
           WHERE l.propriedade_id = ? AND l.deleted_at IS NULL AND l.natureza = 'despesa' AND l.origem_tipo = 'manual'
             AND l.destino_tipo IN ('propriedade','nenhum') AND c.tratamento = 'resultado'
             AND NOT EXISTS (SELECT 1 FROM centro_producao_lancamento v WHERE v.lancamento_id = l.id AND v.deleted_at IS NULL)
             AND NOT EXISTS (SELECT 1 FROM rateio_custo r WHERE r.origem_tipo = 'lancamento' AND r.origem_id = l.id AND r.deleted_at IS NULL)
           ORDER BY l.data_competencia DESC, l.id LIMIT 300`,
        )
        .all(propriedadeId) as Linha[]
    ).map((r) => ({
      id: r['id'] as string,
      data: r['data_competencia'] as string,
      descricao: r['descricao'] as string,
      valorCentavos: Number(r['valor_total_centavos']),
      cancelado: false,
    }));
  }
  /** Consumos da propriedade que podem ser vinculados (rateios pela cadeia são conferidos no serviço). */
  consumosVinculaveis(propriedadeId: string, itemProduzidoId: string): ConsumoDoCentro[] {
    return (
      this.db()
        .prepare(
          `SELECT m.id, m.data, m.tipo, m.estoque_item_id, i.nome AS item_nome, m.quantidade_milesimos, m.unidade_base,
                  m.custo_apropriado_centavos
           FROM movimentacao_estoque m JOIN estoque_item i ON i.id = m.estoque_item_id
           WHERE i.propriedade_id = ? AND m.deleted_at IS NULL AND m.destino = 'propriedade' AND m.manejo_sanitario_id IS NULL
             AND m.tipo IN ('saida_consumo','saida_perda','ajuste_saida') AND m.estoque_item_id <> ?
             AND NOT EXISTS (SELECT 1 FROM centro_producao_consumo v WHERE v.movimentacao_estoque_id = m.id AND v.deleted_at IS NULL)
           ORDER BY m.data DESC, m.ordem DESC LIMIT 300`,
        )
        .all(propriedadeId, itemProduzidoId) as Linha[]
    ).map((r) => ({
      movimentacaoId: r['id'] as string,
      data: r['data'] as string,
      tipo: r['tipo'] as string,
      itemId: r['estoque_item_id'] as string,
      itemNome: r['item_nome'] as string,
      quantidadeMilesimos: Number(r['quantidade_milesimos']),
      unidadeBase: r['unidade_base'] as string,
      custoCentavos:
        r['custo_apropriado_centavos'] === null ? null : Number(r['custo_apropriado_centavos']),
    }));
  }

  /** Custos em centros de produção abertos (fora da apropriação; encerrado, o custo já é valor do estoque). */
  custosEmCentros(propriedadeId: string): { data: string; valorCentavos: number | null }[] {
    const lancamentos = this.db()
      .prepare(
        `SELECT l.valor_total_centavos AS v, l.data_competencia AS d FROM centro_producao_lancamento x
         JOIN centro_producao c ON c.id = x.centro_id JOIN lancamento_financeiro l ON l.id = x.lancamento_id
         WHERE c.propriedade_id = ? AND c.status = 'aberto' AND x.deleted_at IS NULL AND l.deleted_at IS NULL`,
      )
      .all(propriedadeId) as { v: number; d: string }[];
    const consumos = this.db()
      .prepare(
        `SELECT m.custo_apropriado_centavos AS v, m.data AS d FROM centro_producao_consumo x
         JOIN centro_producao c ON c.id = x.centro_id JOIN movimentacao_estoque m ON m.id = x.movimentacao_estoque_id
         WHERE c.propriedade_id = ? AND c.status = 'aberto' AND x.deleted_at IS NULL AND m.deleted_at IS NULL`,
      )
      .all(propriedadeId) as { v: number | null; d: string }[];
    return [
      ...lancamentos.map((l) => ({ data: l.d, valorCentavos: Number(l.v) })),
      ...consumos.map((c) => ({ data: c.d, valorCentavos: c.v === null ? null : Number(c.v) })),
    ];
  }
}
