import type {
  ConsultaExtratoEstoque,
  PaginaMovimentosEstoque,
  DadosItemEstoqueValidados,
  DadosLoteEstoque,
  HistoricoEstoque,
  ItemEstoque,
  LoteEstoque,
  MovimentoEstoque,
  MovimentoEstoqueValidado,
} from '@pecuaria/shared-types';
import type { MovimentoParaEstoque } from '@pecuaria/domain';
import type { ObterConexao } from './comum';

type Linha = Record<string, unknown>;
export interface ConsumoDatado {
  data: string;
  itemNome: string;
  quantidade: number;
  unidadeBase: string;
}
export interface ConsumosForaDaJanela {
  total: number;
  amostra: ConsumoDatado[];
}
function item(l: Linha): ItemEstoque {
  return {
    id: l['id'] as string,
    propriedadeId: l['propriedade_id'] as string,
    nome: l['nome'] as string,
    tipo: l['tipo'] as ItemEstoque['tipo'],
    unidadeBase: l['unidade_base'] as ItemEstoque['unidadeBase'],
    baseMateria: l['base_materia'] as ItemEstoque['baseMateria'],
    controleLote: Boolean(l['controle_lote']),
    estoqueMinimo:
      l['estoque_minimo_milesimos'] === null ? null : Number(l['estoque_minimo_milesimos']) / 1000,
    produtoSanitarioId: l['produto_sanitario_id'] as string | null,
    ativo: Boolean(l['ativo']),
    observacoes: l['observacoes'] as string | null,
  };
}
function lote(l: Linha): LoteEstoque {
  return {
    id: l['id'] as string,
    itemId: l['estoque_item_id'] as string,
    codigo: l['codigo'] as string,
    validade: l['validade'] as string | null,
    saldo: 0,
  };
}
function movimento(l: Linha): MovimentoEstoque {
  return {
    id: l['id'] as string,
    itemId: l['estoque_item_id'] as string,
    loteEstoqueId: l['lote_estoque_id'] as string | null,
    data: l['data'] as string,
    ordem: Number(l['ordem']),
    tipo: l['tipo'] as MovimentoEstoque['tipo'],
    quantidade: Number(l['quantidade_milesimos']) / 1000,
    unidadeBase: l['unidade_base'] as MovimentoEstoque['unidadeBase'],
    custoEntradaCentavos: l['custo_entrada_centavos'] as number | null,
    custoApropriadoCentavos: l['custo_apropriado_centavos'] as number | null,
    destino: l['destino'] as MovimentoEstoque['destino'],
    loteAnimalId: l['lote_animal_id'] as string | null,
    animalId: l['animal_id'] as string | null,
    manejoSanitarioId: l['manejo_sanitario_id'] as string | null,
    requisicaoId: l['requisicao_id'] as string,
    documentoOrigemId: l['documento_origem_id'] as string | null,
    substituiId: l['substitui_id'] as string | null,
    motivo: l['motivo'] as string | null,
    observacao: l['observacao'] as string | null,
    canceladoEm: l['deleted_at'] as string | null,
  };
}
/** SQL e mapeamento apenas; saldo, custos e consistência pertencem ao domínio/main. */
export class RepositorioEstoque {
  constructor(private readonly db: ObterConexao) {}
  listar(propriedadeId: string, incluirInativos = false): ItemEstoque[] {
    return (
      this.db()
        .prepare(
          `SELECT * FROM estoque_item WHERE propriedade_id = ? AND deleted_at IS NULL ${incluirInativos ? '' : 'AND ativo = 1'} ORDER BY nome_normalizado`,
        )
        .all(propriedadeId) as Linha[]
    ).map(item);
  }
  obter(id: string): ItemEstoque | null {
    const r = this.db()
      .prepare('SELECT * FROM estoque_item WHERE id = ? AND deleted_at IS NULL')
      .get(id) as Linha | undefined;
    return r ? item(r) : null;
  }
  salvarItem(
    id: string,
    propriedadeId: string,
    d: DadosItemEstoqueValidados,
    nomeNormalizado: string,
    baseMateria: ItemEstoque['baseMateria'],
    minimoMilesimos: number | null,
    agora: string,
    novo: boolean,
  ): void {
    const params = [
      d.nome,
      nomeNormalizado,
      d.tipo,
      d.unidadeBase,
      baseMateria,
      Number(d.controleLote),
      minimoMilesimos,
      d.produtoSanitarioId,
      Number(d.ativo),
      d.observacoes,
    ];
    if (novo)
      this.db()
        .prepare(
          'INSERT INTO estoque_item(nome,nome_normalizado,tipo,unidade_base,base_materia,controle_lote,estoque_minimo_milesimos,produto_sanitario_id,ativo,observacoes,id,propriedade_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(...params, id, propriedadeId, agora, agora);
    else
      this.db()
        .prepare(
          'UPDATE estoque_item SET nome=?,nome_normalizado=?,tipo=?,unidade_base=?,base_materia=?,controle_lote=?,estoque_minimo_milesimos=?,produto_sanitario_id=?,ativo=?,observacoes=?,updated_at=? WHERE id=?',
        )
        .run(...params, agora, id);
  }
  lotes(itemId: string): LoteEstoque[] {
    return (
      this.db()
        .prepare(
          'SELECT * FROM estoque_lote WHERE estoque_item_id=? AND deleted_at IS NULL ORDER BY validade,codigo_normalizado',
        )
        .all(itemId) as Linha[]
    ).map(lote);
  }
  obterLote(id: string): LoteEstoque | null {
    const r = this.db()
      .prepare('SELECT * FROM estoque_lote WHERE id=? AND deleted_at IS NULL')
      .get(id) as Linha | undefined;
    return r ? lote(r) : null;
  }
  salvarLote(
    id: string,
    itemId: string,
    d: DadosLoteEstoque,
    normalizado: string,
    agora: string,
    novo: boolean,
  ): void {
    if (novo)
      this.db()
        .prepare(
          'INSERT INTO estoque_lote(id,estoque_item_id,codigo,codigo_normalizado,validade,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(id, itemId, d.codigo, normalizado, d.validade, agora, agora);
    else
      this.db()
        .prepare(
          'UPDATE estoque_lote SET codigo=?,codigo_normalizado=?,validade=?,updated_at=? WHERE id=?',
        )
        .run(d.codigo, normalizado, d.validade, agora, id);
  }
  movimentos(itemId: string, incluirCancelados = false): MovimentoEstoque[] {
    return (
      this.db()
        .prepare(
          `SELECT * FROM movimentacao_estoque WHERE estoque_item_id=? ${incluirCancelados ? '' : 'AND deleted_at IS NULL'} ORDER BY data,ordem,created_at,id`,
        )
        .all(itemId) as Linha[]
    ).map(movimento);
  }
  /** Projeção pequena para recalcular sem carregar observações e relacionamentos. */
  paraCalculo(
    itemId: string,
  ): (MovimentoParaEstoque & { custoApropriadoCentavos: number | null })[] {
    return this.db()
      .prepare(
        `SELECT id,data,ordem,tipo,quantidade_milesimos AS quantidadeMilesimos,lote_estoque_id AS loteEstoqueId,custo_entrada_centavos AS custoEntradaCentavos,custo_apropriado_centavos AS custoApropriadoCentavos FROM movimentacao_estoque WHERE estoque_item_id=? AND deleted_at IS NULL ORDER BY data,ordem`,
      )
      .all(itemId) as (MovimentoParaEstoque & { custoApropriadoCentavos: number | null })[];
  }
  obterMovimento(id: string): MovimentoEstoque | null {
    const r = this.db().prepare('SELECT * FROM movimentacao_estoque WHERE id=?').get(id) as
      Linha | undefined;
    return r ? movimento(r) : null;
  }
  porRequisicao(id: string): MovimentoEstoque | null {
    const r = this.db()
      .prepare('SELECT * FROM movimentacao_estoque WHERE requisicao_id=?')
      .get(id) as Linha | undefined;
    return r ? movimento(r) : null;
  }
  doManejo(id: string): MovimentoEstoque[] {
    return (
      this.db()
        .prepare(
          'SELECT * FROM movimentacao_estoque WHERE manejo_sanitario_id=? AND deleted_at IS NULL ORDER BY ordem',
        )
        .all(id) as Linha[]
    ).map(movimento);
  }
  proximaOrdem(): number {
    return Number(
      (
        this.db()
          .prepare('SELECT COALESCE(MAX(ordem),0)+1 AS n FROM movimentacao_estoque')
          .get() as { n: number }
      ).n,
    );
  }
  inserirMovimento(
    id: string,
    itemId: string,
    d: MovimentoEstoqueValidado,
    quantidadeMilesimos: number,
    requisicaoId: string,
    ordem: number,
    agora: string,
    manejoId: string | null,
    substituiId: string | null,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO movimentacao_estoque(id,estoque_item_id,lote_estoque_id,data,ordem,tipo,quantidade_milesimos,unidade_base,custo_entrada_centavos,destino,lote_animal_id,animal_id,manejo_sanitario_id,requisicao_id,documento_origem_id,substitui_id,motivo,observacao,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        itemId,
        d.loteEstoqueId,
        d.data,
        ordem,
        d.tipo,
        quantidadeMilesimos,
        d.unidadeBase,
        d.custoEntradaCentavos,
        d.destino,
        d.loteAnimalId,
        d.animalId,
        manejoId,
        requisicaoId,
        d.documentoOrigemId,
        substituiId,
        d.motivo,
        d.observacao,
        agora,
        agora,
      );
  }
  cancelar(id: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE movimentacao_estoque SET deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL',
      )
      .run(agora, agora, id);
  }
  atualizarCusto(id: string, custo: number | null, agora: string): void {
    this.db()
      .prepare(
        'UPDATE movimentacao_estoque SET custo_apropriado_centavos=?,updated_at=? WHERE id=?',
      )
      .run(custo, agora, id);
  }
  temMovimentos(itemId: string): boolean {
    return Boolean(
      this.db()
        .prepare('SELECT 1 FROM movimentacao_estoque WHERE estoque_item_id=? LIMIT 1')
        .get(itemId),
    );
  }
  temDestinoAnimal(id: string): boolean {
    return Boolean(
      this.db().prepare('SELECT 1 FROM movimentacao_estoque WHERE animal_id=? LIMIT 1').get(id),
    );
  }
  /**
   * Consumos ativos (não cancelados) com destino a um animal ou a um lote de animais fora de uma
   * janela de datas. Só leitura: serve para impedir mudanças retroativas que deixariam o
   * histórico de consumo inconsistente. `total` conta todos; `amostra` traz os primeiros.
   */
  private consumosFora(
    coluna: 'animal_id' | 'lote_animal_id',
    id: string,
    comparacao: '>' | '<',
    data: string,
  ): ConsumosForaDaJanela {
    const where = `${coluna} = ? AND deleted_at IS NULL AND data ${comparacao} ?`;
    const total = (
      this.db()
        .prepare(`SELECT COUNT(*) AS n FROM movimentacao_estoque WHERE ${where}`)
        .get(id, data) as { n: number }
    ).n;
    const amostra = (
      this.db()
        .prepare(
          `SELECT m.data AS data, i.nome AS itemNome, m.quantidade_milesimos AS milesimos, m.unidade_base AS unidadeBase
           FROM movimentacao_estoque m JOIN estoque_item i ON i.id = m.estoque_item_id
           WHERE m.${coluna} = ? AND m.deleted_at IS NULL AND m.data ${comparacao} ?
           ORDER BY m.data, m.ordem LIMIT 3`,
        )
        .all(id, data) as {
        data: string;
        itemNome: string;
        milesimos: number;
        unidadeBase: string;
      }[]
    ).map((l) => ({
      data: l.data,
      itemNome: l.itemNome,
      quantidade: l.milesimos / 1000,
      unidadeBase: l.unidadeBase,
    }));
    return { total, amostra };
  }
  consumosDoAnimalApos(animalId: string, data: string): ConsumosForaDaJanela {
    return this.consumosFora('animal_id', animalId, '>', data);
  }
  consumosDoAnimalAntes(animalId: string, data: string): ConsumosForaDaJanela {
    return this.consumosFora('animal_id', animalId, '<', data);
  }
  consumosDoLoteAnimalApos(loteId: string, data: string): ConsumosForaDaJanela {
    return this.consumosFora('lote_animal_id', loteId, '>', data);
  }
  consumosDoLoteAnimalAntes(loteId: string, data: string): ConsumosForaDaJanela {
    return this.consumosFora('lote_animal_id', loteId, '<', data);
  }
  temEstoqueNaPropriedade(id: string): boolean {
    return Boolean(
      this.db()
        .prepare('SELECT 1 FROM estoque_item WHERE propriedade_id=? AND deleted_at IS NULL LIMIT 1')
        .get(id),
    );
  }
  usaProduto(id: string): boolean {
    return Boolean(
      this.db()
        .prepare(
          'SELECT 1 FROM estoque_item WHERE produto_sanitario_id=? AND deleted_at IS NULL LIMIT 1',
        )
        .get(id),
    );
  }
  historico(itemId: string): HistoricoEstoque[] {
    const rows = this.db()
      .prepare(
        `SELECT * FROM historico_alteracao WHERE
      (entidade='estoque_item' AND entidade_id=?) OR
      (entidade='estoque_lote' AND entidade_id IN (SELECT id FROM estoque_lote WHERE estoque_item_id=?)) OR
      (entidade='movimentacao_estoque' AND entidade_id IN (SELECT id FROM movimentacao_estoque WHERE estoque_item_id=?))
      ORDER BY ocorrido_em DESC,id DESC LIMIT 100`,
      )
      .all(itemId, itemId, itemId) as Linha[];
    return rows.map((r) => ({
      id: r['id'] as string,
      acao: r['acao'] as string,
      motivo: r['motivo'] as string | null,
      ocorridoEm: r['ocorrido_em'] as string,
      dadosAnteriores:
        r['dados_anteriores_json'] === null
          ? null
          : (JSON.parse(String(r['dados_anteriores_json'])) as Record<string, unknown>),
      dadosNovos:
        r['dados_novos_json'] === null
          ? null
          : (JSON.parse(String(r['dados_novos_json'])) as Record<string, unknown>),
    }));
  }
  extrato(f: ConsultaExtratoEstoque): PaginaMovimentosEstoque {
    const condicoes = ['estoque_item_id = ?'];
    const params: unknown[] = [f.itemId];
    if (!f.incluirCancelados) condicoes.push('deleted_at IS NULL');
    if (f.dataInicial) {
      condicoes.push('data >= ?');
      params.push(f.dataInicial);
    }
    if (f.dataFinal) {
      condicoes.push('data <= ?');
      params.push(f.dataFinal);
    }
    if (f.destino) {
      condicoes.push('destino = ?');
      params.push(f.destino);
    }
    const where = condicoes.join(' AND ');
    const total = (
      this.db()
        .prepare(`SELECT COUNT(*) AS n FROM movimentacao_estoque WHERE ${where}`)
        .get(...params) as { n: number }
    ).n;
    const itens = (
      this.db()
        .prepare(
          `SELECT * FROM movimentacao_estoque WHERE ${where} ORDER BY data DESC,ordem DESC,created_at DESC,id DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, f.tamanhoPagina, (f.pagina - 1) * f.tamanhoPagina) as Linha[]
    ).map(movimento);
    return { itens, total, pagina: f.pagina, tamanhoPagina: f.tamanhoPagina };
  }
}
