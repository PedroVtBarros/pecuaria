import type { ComportamentoCusto } from '@pecuaria/domain';
import type { ObterConexao } from './comum';

type Linha = Record<string, unknown>;

export interface LinhaItemCompra {
  id: string;
  lancamentoId: string;
  estoqueItemId: string;
  estoqueItemNome: string;
  quantidadeMilesimos: number;
  unidadeBase: string;
  valorCentavos: number;
  movimentacaoId: string;
  cancelado: boolean;
}

export interface LinhaCompraInsumos {
  lancamentoId: string;
  data: string;
  descricao: string;
  documentoNumero: string | null;
  pessoaNome: string | null;
  valorTotalCentavos: number;
  origemTipo: string;
  cancelado: boolean;
  quantidadeItens: number;
  somaItensCentavos: number;
}

export interface EntradaSemDocumento {
  movimentacaoId: string;
  data: string;
  estoqueItemId: string;
  estoqueItemNome: string;
  quantidadeMilesimos: number;
  unidadeBase: string;
  /** `null`: custo de entrada desconhecido (não pode ser vinculado a um valor). */
  custoEntradaCentavos: number | null;
  documentoOrigemId: string | null;
}

export interface FiltrosConsumo {
  propriedadeId: string;
  dataInicial?: string | undefined;
  dataFinal?: string | undefined;
  destino?: 'propriedade' | 'lote' | 'animal' | undefined;
  loteId?: string | undefined;
  animalId?: string | undefined;
  estoqueItemId?: string | undefined;
  tipo?: 'saida_consumo' | 'saida_perda' | 'ajuste_saida' | 'saida_venda' | undefined;
}

export interface LinhaConsumo {
  movimentacaoId: string;
  data: string;
  tipo: string;
  estoqueItemId: string;
  estoqueItemNome: string;
  quantidadeMilesimos: number;
  unidadeBase: string;
  destino: 'propriedade' | 'lote' | 'animal';
  loteId: string | null;
  loteNome: string | null;
  animalId: string | null;
  animalIdentificacao: string | null;
  manejoSanitarioId: string | null;
  /** Centro de produção em que o consumo está vinculado (o custo fica no centro). */
  centroProducaoNome: string | null;
  /** `null`: custo desconhecido (valoração incompleta), nunca zero. */
  custoApropriadoCentavos: number | null;
}

export interface TotalConsumo {
  chave: string;
  conhecidoCentavos: number;
  conhecidos: number;
  desconhecidos: number;
}

const TIPOS_SAIDA = ['saida_consumo', 'saida_perda', 'ajuste_saida', 'saida_venda'] as const;

const SELECT_ITEM = `
  SELECT li.*, ei.nome AS estoque_item_nome FROM lancamento_item li
  JOIN estoque_item ei ON ei.id = li.estoque_item_id`;
function item(l: Linha): LinhaItemCompra {
  return {
    id: l['id'] as string,
    lancamentoId: l['lancamento_id'] as string,
    estoqueItemId: l['estoque_item_id'] as string,
    estoqueItemNome: l['estoque_item_nome'] as string,
    quantidadeMilesimos: Number(l['quantidade_milesimos']),
    unidadeBase: l['unidade_base'] as string,
    valorCentavos: Number(l['valor_centavos']),
    movimentacaoId: l['movimentacao_estoque_id'] as string,
    cancelado: l['deleted_at'] !== null,
  };
}

/** SQL e mapeamento da compra de insumos, dos consumos apropriados e da classificação por origem. */
export class RepositorioInsumos {
  constructor(private readonly db: ObterConexao) {}

  // ---- Itens de compra ----------------------------------------------------------------------
  inserirItem(
    i: {
      id: string;
      lancamentoId: string;
      estoqueItemId: string;
      quantidadeMilesimos: number;
      unidadeBase: string;
      valorCentavos: number;
      movimentacaoId: string;
    },
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO lancamento_item(id,lancamento_id,estoque_item_id,quantidade_milesimos,unidade_base,valor_centavos,movimentacao_estoque_id,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        i.id,
        i.lancamentoId,
        i.estoqueItemId,
        i.quantidadeMilesimos,
        i.unidadeBase,
        i.valorCentavos,
        i.movimentacaoId,
        agora,
        agora,
      );
  }
  obterItem(id: string): LinhaItemCompra | null {
    const r = this.db().prepare(`${SELECT_ITEM} WHERE li.id = ?`).get(id) as Linha | undefined;
    return r ? item(r) : null;
  }
  itensDoLancamento(lancamentoId: string, incluirCancelados = false): LinhaItemCompra[] {
    return (
      this.db()
        .prepare(
          `${SELECT_ITEM} WHERE li.lancamento_id = ? ${incluirCancelados ? '' : 'AND li.deleted_at IS NULL'} ORDER BY li.rowid`,
        )
        .all(lancamentoId) as Linha[]
    ).map(item);
  }
  /** Item ativo que dono da entrada de estoque, se houver. */
  itemAtivoDaEntrada(movimentacaoId: string): LinhaItemCompra | null {
    const r = this.db()
      .prepare(`${SELECT_ITEM} WHERE li.movimentacao_estoque_id = ? AND li.deleted_at IS NULL`)
      .get(movimentacaoId) as Linha | undefined;
    return r ? item(r) : null;
  }
  corrigirItem(
    id: string,
    movimentacaoId: string,
    quantidadeMilesimos: number,
    valorCentavos: number,
    agora: string,
  ): void {
    this.db()
      .prepare(
        'UPDATE lancamento_item SET movimentacao_estoque_id=?, quantidade_milesimos=?, valor_centavos=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
      )
      .run(movimentacaoId, quantidadeMilesimos, valorCentavos, agora, id);
  }
  cancelarItem(id: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE lancamento_item SET deleted_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL',
      )
      .run(agora, agora, id);
  }
  /** Soma dos valores dos itens ativos do lançamento. */
  somaDosItens(lancamentoId: string): number {
    return Number(
      (
        this.db()
          .prepare(
            'SELECT COALESCE(SUM(valor_centavos),0) AS s FROM lancamento_item WHERE lancamento_id = ? AND deleted_at IS NULL',
          )
          .get(lancamentoId) as { s: number }
      ).s,
    );
  }

  /** Lançamentos de despesa que têm ou tiveram itens de compra, mais recentes primeiro. */
  listarCompras(
    propriedadeId: string,
    incluirCanceladas: boolean,
    pagina: { limite: number; deslocamento: number },
  ): { itens: LinhaCompraInsumos[]; total: number } {
    const where = `l.propriedade_id = ? AND EXISTS (SELECT 1 FROM lancamento_item li WHERE li.lancamento_id = l.id) ${incluirCanceladas ? '' : 'AND l.deleted_at IS NULL'}`;
    const total = Number(
      (
        this.db()
          .prepare(`SELECT COUNT(*) AS n FROM lancamento_financeiro l WHERE ${where}`)
          .get(propriedadeId) as { n: number }
      ).n,
    );
    const linhas = this.db()
      .prepare(
        `SELECT l.id, l.data_competencia, l.descricao, l.documento_numero, p.nome AS pessoa_nome,
                l.valor_total_centavos, l.origem_tipo, l.deleted_at,
                (SELECT COUNT(*) FROM lancamento_item li WHERE li.lancamento_id = l.id AND li.deleted_at IS NULL) AS n_itens,
                (SELECT COALESCE(SUM(li.valor_centavos),0) FROM lancamento_item li WHERE li.lancamento_id = l.id AND li.deleted_at IS NULL) AS soma
         FROM lancamento_financeiro l LEFT JOIN pessoa_comercial p ON p.id = l.pessoa_id
         WHERE ${where} ORDER BY l.data_competencia DESC, l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`,
      )
      .all(propriedadeId, pagina.limite, pagina.deslocamento) as Linha[];
    return {
      total,
      itens: linhas.map((l) => ({
        lancamentoId: l['id'] as string,
        data: l['data_competencia'] as string,
        descricao: l['descricao'] as string,
        documentoNumero: l['documento_numero'] as string | null,
        pessoaNome: l['pessoa_nome'] as string | null,
        valorTotalCentavos: Number(l['valor_total_centavos']),
        origemTipo: l['origem_tipo'] as string,
        cancelado: l['deleted_at'] !== null,
        quantidadeItens: Number(l['n_itens']),
        somaItensCentavos: Number(l['soma']),
      })),
    };
  }

  // ---- Pendências (auditor de consistência) -------------------------------------------------
  /** Entradas de compra ativas sem item de compra: lançamento ainda não ligado (ou documento órfão). */
  entradasSemDocumento(propriedadeId: string, limite: number): EntradaSemDocumento[] {
    return (
      this.db()
        .prepare(
          `SELECT m.id, m.data, m.estoque_item_id, i.nome AS item_nome, m.quantidade_milesimos, m.unidade_base,
                  m.custo_entrada_centavos, m.documento_origem_id
           FROM movimentacao_estoque m JOIN estoque_item i ON i.id = m.estoque_item_id
           WHERE i.propriedade_id = ? AND m.tipo = 'entrada_compra' AND m.deleted_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM lancamento_item li WHERE li.movimentacao_estoque_id = m.id AND li.deleted_at IS NULL)
           ORDER BY m.data DESC, m.ordem DESC LIMIT ?`,
        )
        .all(propriedadeId, limite) as Linha[]
    ).map((r) => ({
      movimentacaoId: r['id'] as string,
      data: r['data'] as string,
      estoqueItemId: r['estoque_item_id'] as string,
      estoqueItemNome: r['item_nome'] as string,
      quantidadeMilesimos: Number(r['quantidade_milesimos']),
      unidadeBase: r['unidade_base'] as string,
      custoEntradaCentavos:
        r['custo_entrada_centavos'] === null ? null : Number(r['custo_entrada_centavos']),
      documentoOrigemId: r['documento_origem_id'] as string | null,
    }));
  }
  contarEntradasSemDocumento(propriedadeId: string): number {
    return Number(
      (
        this.db()
          .prepare(
            `SELECT COUNT(*) AS n FROM movimentacao_estoque m JOIN estoque_item i ON i.id = m.estoque_item_id
             WHERE i.propriedade_id = ? AND m.tipo = 'entrada_compra' AND m.deleted_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM lancamento_item li WHERE li.movimentacao_estoque_id = m.id AND li.deleted_at IS NULL)`,
          )
          .get(propriedadeId) as { n: number }
      ).n,
    );
  }
  /** Lançamentos ativos de compra para estoque que não têm nenhum item: sem entrada física ligada. */
  lancamentosDeEstoqueSemItens(
    propriedadeId: string,
    limite: number,
  ): {
    id: string;
    data: string;
    descricao: string;
    valorCentavos: number;
  }[] {
    return (
      this.db()
        .prepare(
          `SELECT l.id, l.data_competencia, l.descricao, l.valor_total_centavos
           FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id
           WHERE l.propriedade_id = ? AND l.deleted_at IS NULL AND l.natureza = 'despesa' AND c.tratamento = 'estoque'
             AND NOT EXISTS (SELECT 1 FROM lancamento_item li WHERE li.lancamento_id = l.id AND li.deleted_at IS NULL)
           ORDER BY l.data_competencia DESC, l.id LIMIT ?`,
        )
        .all(propriedadeId, limite) as Linha[]
    ).map((r) => ({
      id: r['id'] as string,
      data: r['data_competencia'] as string,
      descricao: r['descricao'] as string,
      valorCentavos: Number(r['valor_total_centavos']),
    }));
  }
  /** Lançamentos com itens cuja soma difere do total (frete ou diferença a classificar). */
  lancamentosComDiferenca(
    propriedadeId: string,
    limite: number,
  ): {
    id: string;
    data: string;
    descricao: string;
    totalCentavos: number;
    somaItensCentavos: number;
  }[] {
    return (
      this.db()
        .prepare(
          `SELECT * FROM (
             SELECT l.id AS id, l.data_competencia AS data, l.descricao AS descricao, l.valor_total_centavos AS total,
                    (SELECT COALESCE(SUM(li.valor_centavos),0) FROM lancamento_item li WHERE li.lancamento_id = l.id AND li.deleted_at IS NULL) AS soma,
                    (SELECT COUNT(*) FROM lancamento_item li WHERE li.lancamento_id = l.id AND li.deleted_at IS NULL) AS n
             FROM lancamento_financeiro l WHERE l.propriedade_id = ? AND l.deleted_at IS NULL
           ) WHERE n > 0 AND soma <> total ORDER BY data DESC, id LIMIT ?`,
        )
        .all(propriedadeId, limite) as Linha[]
    ).map((r) => ({
      id: r['id'] as string,
      data: r['data'] as string,
      descricao: r['descricao'] as string,
      totalCentavos: Number(r['total']),
      somaItensCentavos: Number(r['soma']),
    }));
  }

  // ---- Consumos apropriados (custo lido do estoque, nunca recalculado aqui) -----------------
  private condicoesConsumo(f: FiltrosConsumo): { where: string; params: unknown[] } {
    const c = [
      'i.propriedade_id = ?',
      'm.deleted_at IS NULL',
      // Literais (não parâmetros) para o SQLite poder usar o índice parcial das saídas.
      `m.tipo IN (${TIPOS_SAIDA.map((t) => `'${t}'`).join(',')})`,
    ];
    const params: unknown[] = [f.propriedadeId];
    const simples: [unknown, string][] = [
      [f.dataInicial, 'm.data >= ?'],
      [f.dataFinal, 'm.data <= ?'],
      [f.destino, 'm.destino = ?'],
      [f.loteId, 'm.lote_animal_id = ?'],
      [f.animalId, 'm.animal_id = ?'],
      [f.estoqueItemId, 'm.estoque_item_id = ?'],
      [f.tipo, 'm.tipo = ?'],
    ];
    for (const [v, sql] of simples)
      if (v !== undefined) {
        c.push(sql);
        params.push(v);
      }
    return { where: c.join(' AND '), params };
  }
  contarConsumos(f: FiltrosConsumo): number {
    const { where, params } = this.condicoesConsumo(f);
    return Number(
      (
        this.db()
          .prepare(
            `SELECT COUNT(*) AS n FROM movimentacao_estoque m JOIN estoque_item i ON i.id = m.estoque_item_id WHERE ${where}`,
          )
          .get(...params) as { n: number }
      ).n,
    );
  }
  listarConsumos(
    f: FiltrosConsumo,
    pagina: { limite: number; deslocamento: number },
  ): LinhaConsumo[] {
    const { where, params } = this.condicoesConsumo(f);
    return (
      this.db()
        .prepare(
          `SELECT m.id, m.data, m.tipo, m.estoque_item_id, i.nome AS item_nome, m.quantidade_milesimos, m.unidade_base,
                  m.destino, m.lote_animal_id, lt.nome AS lote_nome, m.animal_id, a.identificacao AS animal_identificacao,
                  m.manejo_sanitario_id, m.custo_apropriado_centavos, cp.nome AS centro_nome
           FROM movimentacao_estoque m
           JOIN estoque_item i ON i.id = m.estoque_item_id
           LEFT JOIN lote lt ON lt.id = m.lote_animal_id
           LEFT JOIN animal a ON a.id = m.animal_id
           LEFT JOIN centro_producao_consumo cc ON cc.movimentacao_estoque_id = m.id AND cc.deleted_at IS NULL
           LEFT JOIN centro_producao cp ON cp.id = cc.centro_id
           WHERE ${where} ORDER BY m.data DESC, m.ordem DESC, m.id DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, pagina.limite, pagina.deslocamento) as Linha[]
    ).map((r) => ({
      movimentacaoId: r['id'] as string,
      data: r['data'] as string,
      tipo: r['tipo'] as string,
      estoqueItemId: r['estoque_item_id'] as string,
      estoqueItemNome: r['item_nome'] as string,
      quantidadeMilesimos: Number(r['quantidade_milesimos']),
      unidadeBase: r['unidade_base'] as string,
      destino: r['destino'] as 'propriedade' | 'lote' | 'animal',
      loteId: r['lote_animal_id'] as string | null,
      loteNome: r['lote_nome'] as string | null,
      animalId: r['animal_id'] as string | null,
      animalIdentificacao: r['animal_identificacao'] as string | null,
      manejoSanitarioId: r['manejo_sanitario_id'] as string | null,
      centroProducaoNome: r['centro_nome'] as string | null,
      custoApropriadoCentavos:
        r['custo_apropriado_centavos'] === null ? null : Number(r['custo_apropriado_centavos']),
    }));
  }
  /** Totais por destino, item ou tipo, separando custo conhecido de consumo sem custo. */
  totaisDeConsumo(f: FiltrosConsumo, agrupar: 'destino' | 'item' | 'tipo'): TotalConsumo[] {
    const { where, params } = this.condicoesConsumo(f);
    const coluna =
      agrupar === 'destino' ? 'm.destino' : agrupar === 'item' ? 'm.estoque_item_id' : 'm.tipo';
    const totais = (
      this.db()
        .prepare(
          `SELECT ${coluna} AS chave,
                  COALESCE(SUM(m.custo_apropriado_centavos),0) AS conhecido,
                  SUM(m.custo_apropriado_centavos IS NOT NULL) AS conhecidos,
                  SUM(m.custo_apropriado_centavos IS NULL) AS desconhecidos
           FROM movimentacao_estoque m JOIN estoque_item i ON i.id = m.estoque_item_id
           WHERE ${where} GROUP BY ${coluna} ORDER BY chave`,
        )
        .all(...params) as Linha[]
    ).map((r) => ({
      chave: r['chave'] as string,
      conhecidoCentavos: Number(r['conhecido']),
      conhecidos: Number(r['conhecidos']),
      desconhecidos: Number(r['desconhecidos']),
    }));
    if (agrupar !== 'destino') return totais;
    // Consumo da propriedade vinculado a um centro de produção não é "não alocado": o custo fica no
    // centro. Os vinculados (poucos) são somados à parte e saem do balde da propriedade, sem
    // subconsulta por linha sobre todos os consumos.
    const v = this.db()
      .prepare(
        `SELECT COALESCE(SUM(m.custo_apropriado_centavos),0) AS conhecido,
                COALESCE(SUM(m.custo_apropriado_centavos IS NOT NULL),0) AS conhecidos,
                COALESCE(SUM(m.custo_apropriado_centavos IS NULL),0) AS desconhecidos
         FROM centro_producao_consumo cc
         JOIN movimentacao_estoque m ON m.id = cc.movimentacao_estoque_id
         JOIN estoque_item i ON i.id = m.estoque_item_id
         WHERE cc.deleted_at IS NULL AND m.destino = 'propriedade' AND ${where}`,
      )
      .get(...params) as Linha;
    const vinculado = {
      chave: 'centro_producao',
      conhecidoCentavos: Number(v['conhecido']),
      conhecidos: Number(v['conhecidos']),
      desconhecidos: Number(v['desconhecidos']),
    };
    if (vinculado.conhecidos + vinculado.desconhecidos === 0) return totais;
    const saida = totais
      .map((t) =>
        t.chave === 'propriedade'
          ? {
              ...t,
              conhecidoCentavos: t.conhecidoCentavos - vinculado.conhecidoCentavos,
              conhecidos: t.conhecidos - vinculado.conhecidos,
              desconhecidos: t.desconhecidos - vinculado.desconhecidos,
            }
          : t,
      )
      .filter((t) => t.conhecidos + t.desconhecidos > 0);
    return [...saida, vinculado].sort((a, b) => a.chave.localeCompare(b.chave));
  }

  // ---- Custo sanitário ----------------------------------------------------------------------
  /** Baixas de estoque ativas do registro sanitário, com o custo apropriado (ou `null`). */
  consumosDoManejo(manejoId: string): { id: string; custoApropriadoCentavos: number | null }[] {
    return (
      this.db()
        .prepare(
          `SELECT id, custo_apropriado_centavos FROM movimentacao_estoque
           WHERE manejo_sanitario_id = ? AND deleted_at IS NULL AND tipo = 'saida_consumo' ORDER BY ordem`,
        )
        .all(manejoId) as Linha[]
    ).map((r) => ({
      id: r['id'] as string,
      custoApropriadoCentavos:
        r['custo_apropriado_centavos'] === null ? null : Number(r['custo_apropriado_centavos']),
    }));
  }
  /** Despesas de serviço lançadas e ligadas ao registro sanitário. */
  servicosDoManejo(manejoId: string): { id: string; valorCentavos: number; descricao: string }[] {
    return (
      this.db()
        .prepare(
          `SELECT id, valor_total_centavos, descricao FROM lancamento_financeiro
           WHERE origem_tipo = 'sanitario' AND origem_id = ? AND deleted_at IS NULL ORDER BY data_competencia, id`,
        )
        .all(manejoId) as Linha[]
    ).map((r) => ({
      id: r['id'] as string,
      valorCentavos: Number(r['valor_total_centavos']),
      descricao: r['descricao'] as string,
    }));
  }
  /** Custo total digitado no registro (campo antigo) e os animais tratados. */
  dadosDoManejo(manejoId: string): {
    propriedadeId: string;
    data: string;
    custoInformadoCentavos: number | null;
    animais: { id: string; identificacao: string }[];
  } | null {
    const m = this.db()
      .prepare(
        'SELECT propriedade_id, data, custo_total_centavos FROM manejo_sanitario WHERE id = ? AND deleted_at IS NULL',
      )
      .get(manejoId) as Linha | undefined;
    if (!m) return null;
    const animais = this.db()
      .prepare(
        `SELECT DISTINCT a.id AS id, a.identificacao AS identificacao FROM evento_sanitario e
         JOIN animal a ON a.id = e.animal_id WHERE e.manejo_id = ? AND e.deleted_at IS NULL ORDER BY a.identificacao_normalizada`,
      )
      .all(manejoId) as { id: string; identificacao: string }[];
    return {
      propriedadeId: m['propriedade_id'] as string,
      data: m['data'] as string,
      custoInformadoCentavos:
        m['custo_total_centavos'] === null ? null : Number(m['custo_total_centavos']),
      animais,
    };
  }

  // ---- Classificação padrão de custos que não são lançamentos (D-E) --------------------------
  listarClassificacoes(
    propriedadeId: string,
  ): { escopo: string; referenciaId: string | null; comportamento: ComportamentoCusto }[] {
    return (
      this.db()
        .prepare(
          'SELECT escopo, referencia_id, comportamento_custo FROM classificacao_custo_origem WHERE propriedade_id = ? ORDER BY escopo, referencia_id',
        )
        .all(propriedadeId) as Linha[]
    ).map((r) => ({
      escopo: r['escopo'] as string,
      referenciaId: r['referencia_id'] as string | null,
      comportamento: r['comportamento_custo'] as ComportamentoCusto,
    }));
  }
  obterClassificacao(
    propriedadeId: string,
    escopo: string,
    referenciaId: string | null,
  ): ComportamentoCusto | null {
    const r = this.db()
      .prepare(
        "SELECT comportamento_custo FROM classificacao_custo_origem WHERE propriedade_id = ? AND escopo = ? AND COALESCE(referencia_id,'') = COALESCE(?,'')",
      )
      .get(propriedadeId, escopo, referenciaId) as
      { comportamento_custo: ComportamentoCusto } | undefined;
    return r?.comportamento_custo ?? null;
  }
  gravarClassificacao(
    id: string,
    propriedadeId: string,
    escopo: string,
    referenciaId: string | null,
    comportamento: ComportamentoCusto,
    agora: string,
  ): void {
    const existe = this.obterClassificacao(propriedadeId, escopo, referenciaId);
    if (existe) {
      this.db()
        .prepare(
          "UPDATE classificacao_custo_origem SET comportamento_custo=?, updated_at=? WHERE propriedade_id = ? AND escopo = ? AND COALESCE(referencia_id,'') = COALESCE(?,'')",
        )
        .run(comportamento, agora, propriedadeId, escopo, referenciaId);
    } else {
      this.db()
        .prepare(
          'INSERT INTO classificacao_custo_origem(id,propriedade_id,escopo,referencia_id,comportamento_custo,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(id, propriedadeId, escopo, referenciaId, comportamento, agora, agora);
    }
  }
}
