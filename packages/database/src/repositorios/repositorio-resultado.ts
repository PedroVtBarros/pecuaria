import type { ObterConexao } from './comum';

type Linha = Record<string, unknown>;

export interface ReceitaParaResultado {
  id: string;
  data: string;
  descricao: string;
  valorCentavos: number;
  origemTipo: string;
  /** "devolucao": devolução de venda (natureza despesa, dedução da receita) ou de compra (valor recuperado). */
  tipo: 'normal' | 'devolucao';
  natureza: 'receita' | 'despesa';
  grupo: string;
  quantidadeMilesimos: number | null;
  unidadeQuantidade: string | null;
}
export interface VendaParaResultado {
  animalId: string;
  /** Saída do rebanho desta venda. */
  movimentacaoId: string;
  negociacaoId: string;
  data: string;
  valorAlocadoCentavos: number;
  pesoVivoGramas: number | null;
  pesoCarcacaGramas: number | null;
}
export interface SaidaParaResultado {
  movimentacaoId: string;
  animalId: string;
  identificacao: string;
  data: string;
  loteOrigemId: string | null;
  loteOrigemNome: string | null;
  /** Situação atual do animal (vale para a saída vigente; um animal devolvido pelo comprador volta a ativo). */
  status: string;
  /** Venda negociada que deu esta saída (continua mesmo se o comprador devolveu depois). */
  venda: Omit<VendaParaResultado, 'animalId' | 'movimentacaoId'> | null;
  /** Devolução ao fornecedor que deu esta saída: valor acordado (a recuperar). */
  devolucaoCompraCentavos: number | null;
}
export interface PagamentoParaConciliacao {
  data: string;
  valorCentavos: number;
  natureza: 'receita' | 'despesa';
  tipo: 'normal' | 'devolucao';
  tratamento: string;
  origemTipo: string;
  /** Despesa vinculada a um centro de produção (ativo). */
  emCentro: boolean;
}
export interface PesagemParaGanho {
  animalId: string;
  data: string;
  pesoGramas: number;
  metodo: string;
}

/** Fontes do resultado, dos indicadores e da conciliação (entrega 4G). Só leitura. */
export class RepositorioResultado {
  constructor(private readonly db: ObterConexao) {}

  /** Receitas de resultado ativas (venda de animais, leite e outras), pela competência. */
  receitas(propriedadeId: string): ReceitaParaResultado[] {
    return (
      this.db()
        .prepare(
          `SELECT l.id, l.data_competencia, l.descricao, l.valor_total_centavos, l.origem_tipo, l.tipo, l.natureza, c.grupo,
                  l.quantidade_milesimos, l.unidade_quantidade
           FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id
           WHERE l.propriedade_id = ? AND l.deleted_at IS NULL
             AND ((l.natureza = 'receita' AND c.tratamento = 'resultado') OR l.tipo = 'devolucao')
           ORDER BY l.data_competencia, l.id`,
        )
        .all(propriedadeId) as Linha[]
    ).map((r) => ({
      id: r['id'] as string,
      data: r['data_competencia'] as string,
      descricao: r['descricao'] as string,
      valorCentavos: Number(r['valor_total_centavos']),
      origemTipo: r['origem_tipo'] as string,
      tipo: r['tipo'] as 'normal' | 'devolucao',
      natureza: r['natureza'] as 'receita' | 'despesa',
      grupo: r['grupo'] as string,
      quantidadeMilesimos:
        r['quantidade_milesimos'] === null ? null : Number(r['quantidade_milesimos']),
      unidadeQuantidade: r['unidade_quantidade'] as string | null,
    }));
  }

  /** Itens de venda de animais ativos, com o valor alocado e os pesos do documento. */
  vendas(propriedadeId: string): VendaParaResultado[] {
    return (
      this.db()
        .prepare(
          `SELECT i.animal_id, i.movimentacao_animal_id, n.id AS negociacao_id, n.data, i.valor_alocado_centavos, i.peso_vivo_g, i.peso_carcaca_g
           FROM negociacao_animal_item i JOIN negociacao_animal n ON n.id = i.negociacao_id
           WHERE n.propriedade_id = ? AND i.tipo = 'venda' AND i.deleted_at IS NULL AND n.deleted_at IS NULL`,
        )
        .all(propriedadeId) as Linha[]
    ).map((r) => ({
      animalId: r['animal_id'] as string,
      movimentacaoId: r['movimentacao_animal_id'] as string,
      negociacaoId: r['negociacao_id'] as string,
      data: r['data'] as string,
      valorAlocadoCentavos: Number(r['valor_alocado_centavos']),
      pesoVivoGramas: r['peso_vivo_g'] === null ? null : Number(r['peso_vivo_g']),
      pesoCarcacaGramas: r['peso_carcaca_g'] === null ? null : Number(r['peso_carcaca_g']),
    }));
  }

  /**
   * Saídas do rebanho ativas, uma por movimentação (o mesmo animal pode sair, voltar por devolução
   * da venda e sair de novo), com o lote de onde saiu, a venda negociada ou a devolução ao
   * fornecedor que a originou.
   */
  saidas(propriedadeId: string): SaidaParaResultado[] {
    return (
      this.db()
        .prepare(
          `SELECT m.id AS mov_id, m.animal_id, a.identificacao, m.data, m.lote_origem_id, lt.nome AS lote_nome, a.status,
                  vi.negociacao_id AS venda_negociacao, vn.data AS venda_data, vi.valor_alocado_centavos AS venda_valor,
                  vi.peso_vivo_g AS venda_vivo, vi.peso_carcaca_g AS venda_carcaca,
                  (SELECT di.valor_centavos FROM devolucao_animal_item di JOIN devolucao_animal dv ON dv.id = di.devolucao_id
                   WHERE di.movimentacao_animal_id = m.id AND di.deleted_at IS NULL AND dv.tipo = 'compra') AS devolucao_compra
           FROM movimentacao_animal m JOIN animal a ON a.id = m.animal_id
           LEFT JOIN lote lt ON lt.id = m.lote_origem_id
           LEFT JOIN negociacao_animal_item vi ON vi.movimentacao_animal_id = m.id AND vi.tipo = 'venda' AND vi.deleted_at IS NULL
           LEFT JOIN negociacao_animal vn ON vn.id = vi.negociacao_id
           WHERE a.propriedade_id = ? AND m.tipo = 'saida' AND m.deleted_at IS NULL AND a.deleted_at IS NULL
           ORDER BY m.data, a.identificacao_normalizada, m.rowid`,
        )
        .all(propriedadeId) as Linha[]
    ).map((r) => ({
      movimentacaoId: r['mov_id'] as string,
      animalId: r['animal_id'] as string,
      identificacao: r['identificacao'] as string,
      data: r['data'] as string,
      loteOrigemId: r['lote_origem_id'] as string | null,
      loteOrigemNome: r['lote_nome'] as string | null,
      status: r['status'] as string,
      venda:
        r['venda_negociacao'] === null
          ? null
          : {
              negociacaoId: r['venda_negociacao'] as string,
              data: r['venda_data'] as string,
              valorAlocadoCentavos: Number(r['venda_valor']),
              pesoVivoGramas: r['venda_vivo'] === null ? null : Number(r['venda_vivo']),
              pesoCarcacaGramas: r['venda_carcaca'] === null ? null : Number(r['venda_carcaca']),
            },
      devolucaoCompraCentavos:
        r['devolucao_compra'] === null || r['devolucao_compra'] === undefined
          ? null
          : Number(r['devolucao_compra']),
    }));
  }

  /** Pagamentos e recebimentos efetivos (não estornados) do período, com o tratamento da categoria. */
  pagamentos(propriedadeId: string, de: string, ate: string): PagamentoParaConciliacao[] {
    return (
      this.db()
        .prepare(
          `SELECT g.data, g.valor_centavos, l.natureza, l.tipo, c.tratamento, l.origem_tipo,
                  EXISTS (SELECT 1 FROM centro_producao_lancamento v WHERE v.lancamento_id = l.id AND v.deleted_at IS NULL) AS em_centro
           FROM pagamento_financeiro g
           JOIN parcela_financeira pf ON pf.id = g.parcela_id
           JOIN lancamento_financeiro l ON l.id = pf.lancamento_id
           JOIN categoria_financeira c ON c.id = l.categoria_id
           WHERE l.propriedade_id = ? AND g.deleted_at IS NULL AND g.data >= ? AND g.data <= ?`,
        )
        .all(propriedadeId, de, ate) as Linha[]
    ).map((r) => ({
      data: r['data'] as string,
      valorCentavos: Number(r['valor_centavos']),
      natureza: r['natureza'] as 'receita' | 'despesa',
      tipo: r['tipo'] as 'normal' | 'devolucao',
      tratamento: r['tratamento'] as string,
      origemTipo: r['origem_tipo'] as string,
      emCentro: Number(r['em_centro']) === 1,
    }));
  }

  /** Pesagens registradas da propriedade no período (inclusive). */
  pesagens(propriedadeId: string, de: string, ate: string): PesagemParaGanho[] {
    return (
      this.db()
        .prepare(
          `SELECT p.animal_id, p.data, p.peso_vivo_kg, p.metodo FROM pesagem p JOIN animal a ON a.id = p.animal_id
           WHERE a.propriedade_id = ? AND a.deleted_at IS NULL AND p.deleted_at IS NULL AND p.data >= ? AND p.data <= ?
           ORDER BY p.animal_id, p.data`,
        )
        .all(propriedadeId, de, ate) as Linha[]
    ).map((r) => ({
      animalId: r['animal_id'] as string,
      data: r['data'] as string,
      pesoGramas: Math.round(Number(r['peso_vivo_kg']) * 1000),
      metodo: r['metodo'] as string,
    }));
  }
}
