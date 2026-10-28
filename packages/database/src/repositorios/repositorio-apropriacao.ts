import type { ObterConexao } from './comum';

type Linha = Record<string, unknown>;

export interface ConsumoParaCusto {
  id: string;
  data: string;
  tipo: string;
  itemId: string;
  itemNome: string;
  itemTipo: string;
  quantidadeMilesimos: number;
  unidadeBase: string;
  destino: 'propriedade' | 'lote' | 'animal';
  loteId: string | null;
  animalId: string | null;
  manejoId: string | null;
  /** `null`: valoração incompleta (custo desconhecido). */
  custoCentavos: number | null;
}

export interface LancamentoParaCusto {
  id: string;
  data: string;
  descricao: string;
  valorCentavos: number;
  destinoTipo: 'propriedade' | 'lote' | 'animal' | 'nenhum';
  loteId: string | null;
  animalId: string | null;
  origemTipo: string;
  origemId: string | null;
  categoriaGrupo: string;
  categoriaTratamento: string;
  /** Fixo, variável ou não classificado (classificação própria do lançamento). */
  comportamento: string;
}

export interface AquisicaoParaCusto {
  itemId: string;
  animalId: string;
  data: string;
  valorCentavos: number;
  negociacaoId: string;
}

export interface CustoAnteriorParaCusto {
  itemId: string;
  animalId: string;
  data: string;
  valorCentavos: number;
  custoAnteriorId: string;
  descricao: string;
}

export interface ManejoParaCusto {
  id: string;
  data: string;
  /** Custo total digitado no registro (campo antigo); conta só sem estoque nem serviço. */
  custoInformadoCentavos: number | null;
}

/** Fontes de custo lidas do banco para a apropriação (entrega 4E). Só leitura. */
export class RepositorioApropriacao {
  constructor(private readonly db: ObterConexao) {}

  consumos(propriedadeId: string): ConsumoParaCusto[] {
    return (
      this.db()
        .prepare(
          `SELECT m.id, m.data, m.tipo, m.estoque_item_id, i.nome AS item_nome, i.tipo AS item_tipo,
                  m.quantidade_milesimos, m.unidade_base, m.destino, m.lote_animal_id, m.animal_id,
                  m.manejo_sanitario_id, m.custo_apropriado_centavos
           FROM movimentacao_estoque m JOIN estoque_item i ON i.id = m.estoque_item_id
           WHERE i.propriedade_id = ? AND m.deleted_at IS NULL
             AND m.tipo IN ('saida_consumo','saida_perda','ajuste_saida','saida_venda')
             AND NOT EXISTS (SELECT 1 FROM centro_producao_consumo cc WHERE cc.movimentacao_estoque_id = m.id AND cc.deleted_at IS NULL)`,
          // Sem ORDER BY: a apropriação não depende da ordem e ordenar 100 mil linhas pesa.
        )
        .all(propriedadeId) as Linha[]
    ).map((r) => ({
      id: r['id'] as string,
      data: r['data'] as string,
      tipo: r['tipo'] as string,
      itemId: r['estoque_item_id'] as string,
      itemNome: r['item_nome'] as string,
      itemTipo: r['item_tipo'] as string,
      quantidadeMilesimos: Number(r['quantidade_milesimos']),
      unidadeBase: r['unidade_base'] as string,
      destino: r['destino'] as ConsumoParaCusto['destino'],
      loteId: r['lote_animal_id'] as string | null,
      animalId: r['animal_id'] as string | null,
      manejoId: r['manejo_sanitario_id'] as string | null,
      custoCentavos:
        r['custo_apropriado_centavos'] === null ? null : Number(r['custo_apropriado_centavos']),
    }));
  }

  /** Despesas de resultado (e acessórios de aquisição) ativas, fora das compras de estoque e de animais. */
  lancamentos(propriedadeId: string): LancamentoParaCusto[] {
    return (
      this.db()
        .prepare(
          `SELECT l.id, l.data_competencia, l.descricao, l.valor_total_centavos, l.destino_tipo, l.lote_id, l.animal_id,
                  l.origem_tipo, l.origem_id, c.grupo AS grupo, c.tratamento AS tratamento, l.comportamento_custo AS comportamento
           FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id
           WHERE l.propriedade_id = ? AND l.deleted_at IS NULL AND l.natureza = 'despesa'
             AND c.tratamento IN ('resultado','ativo_animal')
             AND l.origem_tipo IN ('manual','sanitario')
             AND NOT EXISTS (SELECT 1 FROM centro_producao_lancamento cl WHERE cl.lancamento_id = l.id AND cl.deleted_at IS NULL)
           ORDER BY l.data_competencia, l.id`,
        )
        .all(propriedadeId) as Linha[]
    ).map((r) => ({
      id: r['id'] as string,
      data: r['data_competencia'] as string,
      descricao: r['descricao'] as string,
      valorCentavos: Number(r['valor_total_centavos']),
      destinoTipo: r['destino_tipo'] as LancamentoParaCusto['destinoTipo'],
      loteId: r['lote_id'] as string | null,
      animalId: r['animal_id'] as string | null,
      origemTipo: r['origem_tipo'] as string,
      origemId: r['origem_id'] as string | null,
      categoriaGrupo: r['grupo'] as string,
      categoriaTratamento: r['tratamento'] as string,
      comportamento: r['comportamento'] as string,
    }));
  }

  aquisicoes(propriedadeId: string): AquisicaoParaCusto[] {
    return (
      this.db()
        .prepare(
          `SELECT i.id, i.animal_id, n.data, i.valor_alocado_centavos, n.id AS negociacao_id
           FROM negociacao_animal_item i JOIN negociacao_animal n ON n.id = i.negociacao_id
           WHERE n.propriedade_id = ? AND i.tipo = 'compra' AND i.deleted_at IS NULL AND n.deleted_at IS NULL`,
        )
        .all(propriedadeId) as Linha[]
    ).map((r) => ({
      itemId: r['id'] as string,
      animalId: r['animal_id'] as string,
      data: r['data'] as string,
      valorCentavos: Number(r['valor_alocado_centavos']),
      negociacaoId: r['negociacao_id'] as string,
    }));
  }

  custosAnteriores(propriedadeId: string): CustoAnteriorParaCusto[] {
    return (
      this.db()
        .prepare(
          `SELECT i.id, i.animal_id, c.data_referencia, i.valor_centavos, c.id AS custo_id, c.descricao
           FROM custo_anterior_item i JOIN custo_anterior c ON c.id = i.custo_anterior_id
           WHERE c.propriedade_id = ? AND c.deleted_at IS NULL`,
        )
        .all(propriedadeId) as Linha[]
    ).map((r) => ({
      itemId: r['id'] as string,
      animalId: r['animal_id'] as string,
      data: r['data_referencia'] as string,
      valorCentavos: Number(r['valor_centavos']),
      custoAnteriorId: r['custo_id'] as string,
      descricao: r['descricao'] as string,
    }));
  }

  /** Animais tratados de cada registro sanitário (eventos ativos), em ordem estável. */
  animaisDosManejos(manejoIds: readonly string[]): Map<string, string[]> {
    const mapa = new Map<string, string[]>();
    for (let i = 0; i < manejoIds.length; i += 500) {
      const bloco = manejoIds.slice(i, i + 500);
      const linhas = this.db()
        .prepare(
          `SELECT DISTINCT manejo_id, animal_id FROM evento_sanitario
           WHERE deleted_at IS NULL AND manejo_id IN (${bloco.map(() => '?').join(',')})
           ORDER BY manejo_id, animal_id`,
        )
        .all(...bloco) as { manejo_id: string; animal_id: string }[];
      for (const l of linhas) {
        const lista = mapa.get(l.manejo_id) ?? [];
        lista.push(l.animal_id);
        mapa.set(l.manejo_id, lista);
      }
    }
    return mapa;
  }

  /** Última pesagem real do animal até a data (inclusive), em gramas. */
  ultimaPesagemAte(animalId: string, data: string): { data: string; pesoG: number } | null {
    const r = this.db()
      .prepare(
        'SELECT data, peso_vivo_kg FROM pesagem WHERE animal_id = ? AND deleted_at IS NULL AND data <= ? ORDER BY data DESC LIMIT 1',
      )
      .get(animalId, data) as { data: string; peso_vivo_kg: number } | undefined;
    return r ? { data: r.data, pesoG: Math.round(r.peso_vivo_kg * 1000) } : null;
  }

  /** Lançamentos da propriedade elegíveis a rateio (destino da propriedade, manuais, ativos). */
  lancamentosRateaveis(propriedadeId: string): {
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
           WHERE l.propriedade_id = ? AND l.deleted_at IS NULL AND l.natureza = 'despesa'
             AND l.destino_tipo IN ('propriedade','nenhum') AND l.origem_tipo = 'manual'
             AND c.tratamento IN ('resultado','ativo_animal')
             AND NOT EXISTS (SELECT 1 FROM centro_producao_lancamento cl WHERE cl.lancamento_id = l.id AND cl.deleted_at IS NULL)
           ORDER BY l.data_competencia DESC, l.id`,
        )
        .all(propriedadeId) as Linha[]
    ).map((r) => ({
      id: r['id'] as string,
      data: r['data_competencia'] as string,
      descricao: r['descricao'] as string,
      valorCentavos: Number(r['valor_total_centavos']),
    }));
  }
  /** Consumos da propriedade elegíveis a rateio (destino propriedade, fora de registro sanitário). */
  consumosRateaveis(propriedadeId: string): {
    id: string;
    data: string;
    descricao: string;
    custoCentavos: number | null;
  }[] {
    return (
      this.db()
        .prepare(
          `SELECT m.id, m.data, i.nome AS item_nome, m.quantidade_milesimos, m.unidade_base, m.custo_apropriado_centavos
           FROM movimentacao_estoque m JOIN estoque_item i ON i.id = m.estoque_item_id
           WHERE i.propriedade_id = ? AND m.deleted_at IS NULL AND m.destino = 'propriedade'
             AND m.manejo_sanitario_id IS NULL AND m.tipo IN ('saida_consumo','saida_perda','ajuste_saida')
             AND NOT EXISTS (SELECT 1 FROM centro_producao_consumo cc WHERE cc.movimentacao_estoque_id = m.id AND cc.deleted_at IS NULL)
           ORDER BY m.data DESC, m.ordem DESC`,
        )
        .all(propriedadeId) as Linha[]
    ).map((r) => ({
      id: r['id'] as string,
      data: r['data'] as string,
      descricao: `Consumo de ${r['item_nome'] as string} (${Number(r['quantidade_milesimos']) / 1000} ${r['unidade_base'] as string})`,
      custoCentavos:
        r['custo_apropriado_centavos'] === null ? null : Number(r['custo_apropriado_centavos']),
    }));
  }
  /** Valor atual e dados de um lançamento ou consumo, para prévia e conferência de rateio. */
  origemLancamento(id: string): {
    propriedadeId: string;
    data: string;
    descricao: string;
    valorCentavos: number;
    ativo: boolean;
    natureza: string;
    destinoTipo: string;
    origemTipo: string;
    tratamento: string;
  } | null {
    const r = this.db()
      .prepare(
        `SELECT l.propriedade_id, l.data_competencia, l.descricao, l.valor_total_centavos, l.deleted_at,
                l.natureza, l.destino_tipo, l.origem_tipo, c.tratamento AS tratamento
         FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id WHERE l.id = ?`,
      )
      .get(id) as Linha | undefined;
    return r
      ? {
          propriedadeId: r['propriedade_id'] as string,
          data: r['data_competencia'] as string,
          descricao: r['descricao'] as string,
          valorCentavos: Number(r['valor_total_centavos']),
          ativo: r['deleted_at'] === null,
          natureza: r['natureza'] as string,
          destinoTipo: r['destino_tipo'] as string,
          origemTipo: r['origem_tipo'] as string,
          tratamento: r['tratamento'] as string,
        }
      : null;
  }
  origemConsumo(id: string): {
    propriedadeId: string;
    data: string;
    descricao: string;
    custoCentavos: number | null;
    ativo: boolean;
    tipo: string;
    destino: string;
    manejoId: string | null;
  } | null {
    const r = this.db()
      .prepare(
        `SELECT i.propriedade_id, m.data, i.nome, m.quantidade_milesimos, m.unidade_base, m.custo_apropriado_centavos, m.deleted_at,
                m.tipo, m.destino, m.manejo_sanitario_id
         FROM movimentacao_estoque m JOIN estoque_item i ON i.id = m.estoque_item_id WHERE m.id = ?`,
      )
      .get(id) as Linha | undefined;
    return r
      ? {
          propriedadeId: r['propriedade_id'] as string,
          data: r['data'] as string,
          descricao: `Consumo de ${r['nome'] as string} (${Number(r['quantidade_milesimos']) / 1000} ${r['unidade_base'] as string})`,
          custoCentavos:
            r['custo_apropriado_centavos'] === null ? null : Number(r['custo_apropriado_centavos']),
          ativo: r['deleted_at'] === null,
          tipo: r['tipo'] as string,
          destino: r['destino'] as string,
          manejoId: r['manejo_sanitario_id'] as string | null,
        }
      : null;
  }

  /** Registros sanitários ativos da propriedade, com o custo digitado (campo antigo). */
  manejos(propriedadeId: string): ManejoParaCusto[] {
    return (
      this.db()
        .prepare(
          'SELECT id, data, custo_total_centavos FROM manejo_sanitario WHERE propriedade_id = ? AND deleted_at IS NULL ORDER BY data, id',
        )
        .all(propriedadeId) as Linha[]
    ).map((r) => ({
      id: r['id'] as string,
      data: r['data'] as string,
      custoInformadoCentavos:
        r['custo_total_centavos'] === null ? null : Number(r['custo_total_centavos']),
    }));
  }
}
