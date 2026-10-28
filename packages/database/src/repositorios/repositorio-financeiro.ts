import type {
  Atividade,
  ComportamentoLancamento,
  CondicaoPagamento,
  DestinoLancamento,
  GrupoCategoria,
  NaturezaFinanceira,
  OrigemExigida,
  OrigemLancamento,
  PapelPessoa,
  TipoLancamento,
  TratamentoCategoria,
  UnidadeQuantidadeLancamento,
} from '@pecuaria/domain';
import type {
  CategoriaFinanceira,
  HistoricoFinanceiro,
  PessoaComercial,
} from '@pecuaria/shared-types';
import type { ObterConexao } from './comum';

type Linha = Record<string, unknown>;

/** Linha de lançamento com os nomes das referências; os valores derivados são do serviço. */
export interface LinhaLancamento {
  id: string;
  propriedadeId: string;
  categoriaId: string;
  categoriaNome: string;
  categoriaTratamento: TratamentoCategoria;
  categoriaGrupo: GrupoCategoria;
  pessoaId: string | null;
  pessoaNome: string | null;
  natureza: NaturezaFinanceira;
  tipo: TipoLancamento;
  lancamentoOrigemId: string | null;
  dataCompetencia: string;
  valorTotalCentavos: number;
  descricao: string;
  documentoNumero: string | null;
  atividade: Atividade;
  destinoTipo: DestinoLancamento;
  loteId: string | null;
  loteNome: string | null;
  animalId: string | null;
  animalIdentificacao: string | null;
  quantidadeMilesimos: number | null;
  unidadeQuantidade: UnidadeQuantidadeLancamento | null;
  condicaoPagamento: CondicaoPagamento;
  comportamentoCusto: ComportamentoLancamento;
  origemTipo: OrigemLancamento;
  origemId: string | null;
  requisicaoId: string;
  observacoes: string | null;
  motivoCancelamento: string | null;
  cancelado: boolean;
  criadoEm: string;
}

export interface LinhaParcela {
  id: string;
  lancamentoId: string;
  numero: number;
  vencimento: string;
  valorCentavos: number;
  pagoCentavos: number;
  /** Liquidado por compensação de devolução (sem caixa). */
  compensadoCentavos: number;
  cancelada: boolean;
  motivoCancelamento: string | null;
}

export interface LinhaPagamento {
  id: string;
  parcelaId: string;
  parcelaNumero: number;
  lancamentoId: string;
  data: string;
  valorCentavos: number;
  forma: string | null;
  observacao: string | null;
  requisicaoId: string;
  motivoEstorno: string | null;
  estornado: boolean;
  criadoEm: string;
}

export interface FiltrosListaLancamentos {
  propriedadeId: string;
  dataInicial?: string | undefined;
  dataFinal?: string | undefined;
  natureza?: NaturezaFinanceira | undefined;
  categoriaId?: string | undefined;
  atividade?: Atividade | undefined;
  loteId?: string | undefined;
  animalId?: string | undefined;
  pessoaId?: string | undefined;
  comportamentoCusto?: ComportamentoLancamento | undefined;
  tratamento?: TratamentoCategoria | undefined;
  incluirCancelados: boolean;
}

/** Filtros das consultas de caixa (pagamentos e parcelas em aberto). */
export interface FiltrosCaixa {
  propriedadeId: string;
  natureza?: NaturezaFinanceira | undefined;
  categoriaId?: string | undefined;
  atividade?: Atividade | undefined;
  loteId?: string | undefined;
  pessoaId?: string | undefined;
}

export interface PagamentoAgregado {
  data: string;
  natureza: NaturezaFinanceira;
  categoriaId: string;
  totalCentavos: number;
  quantidade: number;
}

export interface SaldoAbertoAgregado {
  vencimento: string;
  natureza: NaturezaFinanceira;
  categoriaId: string;
  saldoCentavos: number;
  quantidade: number;
}

export interface LinhaContaAberta {
  parcelaId: string;
  lancamentoId: string;
  numero: number;
  totalParcelas: number;
  vencimento: string;
  valorCentavos: number;
  pagoCentavos: number;
  compensadoCentavos: number;
  saldoCentavos: number;
  natureza: NaturezaFinanceira;
  descricao: string;
  documentoNumero: string | null;
  categoriaId: string;
  categoriaNome: string;
  pessoaId: string | null;
  pessoaNome: string | null;
  dataCompetencia: string;
  atividade: Atividade;
  destinoTipo: DestinoLancamento;
  loteNome: string | null;
  animalIdentificacao: string | null;
}

export interface TotalCompetencia {
  natureza: NaturezaFinanceira;
  tratamento: TratamentoCategoria;
  totalCentavos: number;
  quantidade: number;
}

export interface CoberturaDaCategoria {
  categoriaId: string;
  comportamento: ComportamentoLancamento;
  totalCentavos: number;
  quantidade: number;
}

export interface LancamentoSemClassificacao {
  id: string;
  descricao: string;
  dataCompetencia: string;
  valorCentavos: number;
}

export interface NovoLancamento {
  id: string;
  propriedadeId: string;
  categoriaId: string;
  pessoaId: string | null;
  natureza: NaturezaFinanceira;
  dataCompetencia: string;
  valorTotalCentavos: number;
  descricao: string;
  documentoNumero: string | null;
  atividade: Atividade;
  destinoTipo: DestinoLancamento;
  loteId: string | null;
  animalId: string | null;
  quantidadeMilesimos: number | null;
  unidadeQuantidade: UnidadeQuantidadeLancamento | null;
  condicaoPagamento: CondicaoPagamento;
  comportamentoCusto: ComportamentoLancamento;
  requisicaoId: string;
  origemTipo: OrigemLancamento;
  origemId: string | null;
  observacoes: string | null;
  /** Devolução: lançamento original (o tipo vira "devolucao"). */
  lancamentoOrigemId?: string | null;
}

export interface EdicaoLinhaLancamento {
  categoriaId: string;
  pessoaId: string | null;
  dataCompetencia: string;
  descricao: string;
  documentoNumero: string | null;
  atividade: Atividade;
  destinoTipo: DestinoLancamento;
  loteId: string | null;
  animalId: string | null;
  quantidadeMilesimos: number | null;
  unidadeQuantidade: UnidadeQuantidadeLancamento | null;
  comportamentoCusto: ComportamentoLancamento;
  observacoes: string | null;
}

export interface ConsumoDeLancamento {
  data: string;
  descricao: string;
  valorTotalCentavos: number;
}
export interface LancamentosForaDaJanela {
  total: number;
  amostra: ConsumoDeLancamento[];
}

const SELECT_LANCAMENTO = `
  SELECT l.*, c.nome AS categoria_nome, c.tratamento AS categoria_tratamento,
         c.grupo AS categoria_grupo, p.nome AS pessoa_nome, lt.nome AS lote_nome,
         a.identificacao AS animal_identificacao
  FROM lancamento_financeiro l
  JOIN categoria_financeira c ON c.id = l.categoria_id
  LEFT JOIN pessoa_comercial p ON p.id = l.pessoa_id
  LEFT JOIN lote lt ON lt.id = l.lote_id
  LEFT JOIN animal a ON a.id = l.animal_id`;

function lancamento(l: Linha): LinhaLancamento {
  return {
    id: l['id'] as string,
    propriedadeId: l['propriedade_id'] as string,
    categoriaId: l['categoria_id'] as string,
    categoriaNome: l['categoria_nome'] as string,
    categoriaTratamento: l['categoria_tratamento'] as TratamentoCategoria,
    categoriaGrupo: l['categoria_grupo'] as GrupoCategoria,
    pessoaId: l['pessoa_id'] as string | null,
    pessoaNome: l['pessoa_nome'] as string | null,
    natureza: l['natureza'] as NaturezaFinanceira,
    tipo: l['tipo'] as TipoLancamento,
    lancamentoOrigemId: l['lancamento_origem_id'] as string | null,
    dataCompetencia: l['data_competencia'] as string,
    valorTotalCentavos: Number(l['valor_total_centavos']),
    descricao: l['descricao'] as string,
    documentoNumero: l['documento_numero'] as string | null,
    atividade: l['atividade'] as Atividade,
    destinoTipo: l['destino_tipo'] as DestinoLancamento,
    loteId: l['lote_id'] as string | null,
    loteNome: l['lote_nome'] as string | null,
    animalId: l['animal_id'] as string | null,
    animalIdentificacao: l['animal_identificacao'] as string | null,
    quantidadeMilesimos:
      l['quantidade_milesimos'] === null ? null : Number(l['quantidade_milesimos']),
    unidadeQuantidade: l['unidade_quantidade'] as UnidadeQuantidadeLancamento | null,
    condicaoPagamento: l['condicao_pagamento'] as CondicaoPagamento,
    comportamentoCusto: l['comportamento_custo'] as ComportamentoLancamento,
    origemTipo: l['origem_tipo'] as OrigemLancamento,
    origemId: l['origem_id'] as string | null,
    requisicaoId: l['requisicao_id'] as string,
    observacoes: l['observacoes'] as string | null,
    motivoCancelamento: l['motivo_cancelamento'] as string | null,
    cancelado: l['deleted_at'] !== null,
    criadoEm: l['created_at'] as string,
  };
}
/**
 * Valor de uma parcela liquidado por compensação (devolução de animais): não é pagamento nem caixa,
 * mas reduz o saldo em aberto. Somas separadas para usar os dois índices parciais.
 */
const COMPENSADO_SQL = `(COALESCE((SELECT SUM(k.valor_centavos) FROM compensacao_financeira k WHERE k.parcela_origem_id = pf.id AND k.deleted_at IS NULL), 0)
  + COALESCE((SELECT SUM(k.valor_centavos) FROM compensacao_financeira k WHERE k.parcela_devolucao_id = pf.id AND k.deleted_at IS NULL), 0))`;

function parcela(l: Linha): LinhaParcela {
  return {
    id: l['id'] as string,
    lancamentoId: l['lancamento_id'] as string,
    numero: Number(l['numero']),
    vencimento: l['vencimento'] as string,
    valorCentavos: Number(l['valor_centavos']),
    pagoCentavos: Number(l['pago'] ?? 0),
    compensadoCentavos: Number(l['compensado'] ?? 0),
    cancelada: l['deleted_at'] !== null,
    motivoCancelamento: l['motivo_cancelamento'] as string | null,
  };
}
function pagamento(l: Linha): LinhaPagamento {
  return {
    id: l['id'] as string,
    parcelaId: l['parcela_id'] as string,
    parcelaNumero: Number(l['parcela_numero']),
    lancamentoId: l['lancamento_id'] as string,
    data: l['data'] as string,
    valorCentavos: Number(l['valor_centavos']),
    forma: l['forma'] as string | null,
    observacao: l['observacao'] as string | null,
    requisicaoId: l['requisicao_id'] as string,
    motivoEstorno: l['motivo_estorno'] as string | null,
    estornado: l['deleted_at'] !== null,
    criadoEm: l['created_at'] as string,
  };
}
function pessoa(l: Linha): PessoaComercial {
  return {
    id: l['id'] as string,
    nome: l['nome'] as string,
    papel: l['papel'] as PapelPessoa,
    documento: l['documento'] as string | null,
    observacoes: l['observacoes'] as string | null,
    ativo: l['ativo'] === 1,
  };
}
function categoria(l: Linha): CategoriaFinanceira {
  return {
    id: l['id'] as string,
    nome: l['nome'] as string,
    natureza: l['natureza'] as NaturezaFinanceira,
    grupo: l['grupo'] as GrupoCategoria,
    tratamento: l['tratamento'] as TratamentoCategoria,
    comportamentoCusto: l['comportamento_custo'] as ComportamentoLancamento,
    origemExigida: l['origem_exigida'] as OrigemExigida | null,
    origem: l['origem'] as 'sugestao' | 'usuario',
    ativa: l['ativa'] === 1,
  };
}

/** Em blocos, para respeitar o limite de parâmetros do SQLite. */
function emBlocos<T>(itens: readonly T[], tamanho = 500): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) blocos.push(itens.slice(i, i + tamanho));
  return blocos;
}

/** SQL e mapeamento apenas. Valores derivados, regras e validações pertencem ao serviço. */
export class RepositorioFinanceiro {
  constructor(private readonly db: ObterConexao) {}

  // ---- Contrapartes -------------------------------------------------------------------------
  listarPessoas(incluirInativas: boolean): PessoaComercial[] {
    return (
      this.db()
        .prepare(
          `SELECT * FROM pessoa_comercial WHERE deleted_at IS NULL ${incluirInativas ? '' : 'AND ativo = 1'} ORDER BY nome_normalizado`,
        )
        .all() as Linha[]
    ).map(pessoa);
  }
  obterPessoa(id: string): PessoaComercial | null {
    const r = this.db()
      .prepare('SELECT * FROM pessoa_comercial WHERE id = ? AND deleted_at IS NULL')
      .get(id) as Linha | undefined;
    return r ? pessoa(r) : null;
  }
  salvarPessoa(
    id: string,
    d: {
      nome: string;
      papel: PapelPessoa;
      documento: string | null;
      observacoes: string | null;
      ativo: boolean;
    },
    nomeNormalizado: string,
    agora: string,
    novo: boolean,
  ): void {
    if (novo)
      this.db()
        .prepare(
          'INSERT INTO pessoa_comercial(id,nome,nome_normalizado,papel,documento,observacoes,ativo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          d.nome,
          nomeNormalizado,
          d.papel,
          d.documento,
          d.observacoes,
          Number(d.ativo),
          agora,
          agora,
        );
    else
      this.db()
        .prepare(
          'UPDATE pessoa_comercial SET nome=?,nome_normalizado=?,papel=?,documento=?,observacoes=?,ativo=?,updated_at=? WHERE id=?',
        )
        .run(
          d.nome,
          nomeNormalizado,
          d.papel,
          d.documento,
          d.observacoes,
          Number(d.ativo),
          agora,
          id,
        );
  }
  pessoaTemLancamentos(id: string): boolean {
    return Boolean(
      this.db()
        .prepare(
          'SELECT 1 FROM lancamento_financeiro WHERE pessoa_id = ? AND deleted_at IS NULL LIMIT 1',
        )
        .get(id),
    );
  }

  // ---- Categorias ---------------------------------------------------------------------------
  listarCategorias(incluirInativas: boolean): CategoriaFinanceira[] {
    return (
      this.db()
        .prepare(
          `SELECT * FROM categoria_financeira WHERE deleted_at IS NULL ${incluirInativas ? '' : 'AND ativa = 1'} ORDER BY natureza DESC, nome_normalizado`,
        )
        .all() as Linha[]
    ).map(categoria);
  }
  obterCategoria(id: string): CategoriaFinanceira | null {
    const r = this.db()
      .prepare('SELECT * FROM categoria_financeira WHERE id = ? AND deleted_at IS NULL')
      .get(id) as Linha | undefined;
    return r ? categoria(r) : null;
  }
  salvarCategoria(
    id: string,
    d: {
      nome: string;
      natureza: NaturezaFinanceira;
      grupo: GrupoCategoria;
      tratamento: TratamentoCategoria;
      comportamentoCusto: ComportamentoLancamento;
      ativa: boolean;
    },
    nomeNormalizado: string,
    agora: string,
    novo: boolean,
  ): void {
    if (novo)
      this.db()
        .prepare(
          "INSERT INTO categoria_financeira(id,nome,nome_normalizado,natureza,grupo,tratamento,comportamento_custo,origem,ativa,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'usuario',?,?,?)",
        )
        .run(
          id,
          d.nome,
          nomeNormalizado,
          d.natureza,
          d.grupo,
          d.tratamento,
          d.comportamentoCusto,
          Number(d.ativa),
          agora,
          agora,
        );
    else
      this.db()
        .prepare(
          'UPDATE categoria_financeira SET nome=?,nome_normalizado=?,natureza=?,grupo=?,tratamento=?,comportamento_custo=?,ativa=?,updated_at=? WHERE id=?',
        )
        .run(
          d.nome,
          nomeNormalizado,
          d.natureza,
          d.grupo,
          d.tratamento,
          d.comportamentoCusto,
          Number(d.ativa),
          agora,
          id,
        );
  }
  /** Categoria reservada a uma origem (ex.: compra de animais), para a natureza dada. */
  categoriaDaOrigem(origem: OrigemLancamento, natureza: NaturezaFinanceira): string | null {
    const r = this.db()
      .prepare(
        'SELECT id FROM categoria_financeira WHERE origem_exigida = ? AND natureza = ? AND deleted_at IS NULL ORDER BY id LIMIT 1',
      )
      .get(origem, natureza) as { id: string } | undefined;
    return r?.id ?? null;
  }
  categoriaTemLancamentos(id: string): boolean {
    return Boolean(
      this.db()
        .prepare('SELECT 1 FROM lancamento_financeiro WHERE categoria_id = ? LIMIT 1')
        .get(id),
    );
  }

  // ---- Lançamentos --------------------------------------------------------------------------
  obterLancamento(id: string): LinhaLancamento | null {
    const r = this.db().prepare(`${SELECT_LANCAMENTO} WHERE l.id = ?`).get(id) as Linha | undefined;
    return r ? lancamento(r) : null;
  }
  lancamentoPorRequisicao(requisicaoId: string): LinhaLancamento | null {
    const r = this.db()
      .prepare(`${SELECT_LANCAMENTO} WHERE l.requisicao_id = ?`)
      .get(requisicaoId) as Linha | undefined;
    return r ? lancamento(r) : null;
  }
  inserirLancamento(n: NovoLancamento, agora: string): void {
    this.db()
      .prepare(
        `INSERT INTO lancamento_financeiro(id,propriedade_id,categoria_id,pessoa_id,natureza,data_competencia,valor_total_centavos,descricao,documento_numero,atividade,destino_tipo,lote_id,animal_id,quantidade_milesimos,unidade_quantidade,condicao_pagamento,comportamento_custo,requisicao_id,origem_tipo,origem_id,observacoes,tipo,lancamento_origem_id,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        n.id,
        n.propriedadeId,
        n.categoriaId,
        n.pessoaId,
        n.natureza,
        n.dataCompetencia,
        n.valorTotalCentavos,
        n.descricao,
        n.documentoNumero,
        n.atividade,
        n.destinoTipo,
        n.loteId,
        n.animalId,
        n.quantidadeMilesimos,
        n.unidadeQuantidade,
        n.condicaoPagamento,
        n.comportamentoCusto,
        n.requisicaoId,
        n.origemTipo,
        n.origemId,
        n.observacoes,
        n.lancamentoOrigemId ? 'devolucao' : 'normal',
        n.lancamentoOrigemId ?? null,
        agora,
        agora,
      );
  }
  atualizarLancamento(id: string, e: EdicaoLinhaLancamento, agora: string): void {
    this.db()
      .prepare(
        `UPDATE lancamento_financeiro SET categoria_id=?,pessoa_id=?,data_competencia=?,descricao=?,documento_numero=?,atividade=?,destino_tipo=?,lote_id=?,animal_id=?,quantidade_milesimos=?,unidade_quantidade=?,comportamento_custo=?,observacoes=?,updated_at=? WHERE id=?`,
      )
      .run(
        e.categoriaId,
        e.pessoaId,
        e.dataCompetencia,
        e.descricao,
        e.documentoNumero,
        e.atividade,
        e.destinoTipo,
        e.loteId,
        e.animalId,
        e.quantidadeMilesimos,
        e.unidadeQuantidade,
        e.comportamentoCusto,
        e.observacoes,
        agora,
        id,
      );
  }
  definirTotalECondicao(
    id: string,
    totalCentavos: number,
    condicao: CondicaoPagamento,
    agora: string,
  ): void {
    this.db()
      .prepare(
        'UPDATE lancamento_financeiro SET valor_total_centavos=?,condicao_pagamento=?,updated_at=? WHERE id=?',
      )
      .run(totalCentavos, condicao, agora, id);
  }
  cancelarLancamento(id: string, motivo: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE lancamento_financeiro SET deleted_at=?,motivo_cancelamento=?,updated_at=? WHERE id=? AND deleted_at IS NULL',
      )
      .run(agora, motivo, agora, id);
  }

  private condicoes(f: FiltrosListaLancamentos): { where: string; params: unknown[] } {
    const c = ['l.propriedade_id = ?'];
    const params: unknown[] = [f.propriedadeId];
    if (!f.incluirCancelados) c.push('l.deleted_at IS NULL');
    const simples: [unknown, string][] = [
      [f.dataInicial, 'l.data_competencia >= ?'],
      [f.dataFinal, 'l.data_competencia <= ?'],
      [f.natureza, 'l.natureza = ?'],
      [f.categoriaId, 'l.categoria_id = ?'],
      [f.atividade, 'l.atividade = ?'],
      [f.loteId, 'l.lote_id = ?'],
      [f.animalId, 'l.animal_id = ?'],
      [f.pessoaId, 'l.pessoa_id = ?'],
      [f.comportamentoCusto, 'l.comportamento_custo = ?'],
      [f.tratamento, 'c.tratamento = ?'],
    ];
    for (const [valor, sql] of simples)
      if (valor !== undefined) {
        c.push(sql);
        params.push(valor);
      }
    return { where: c.join(' AND '), params };
  }
  contarLancamentos(f: FiltrosListaLancamentos): number {
    const { where, params } = this.condicoes(f);
    return (
      this.db()
        .prepare(
          `SELECT COUNT(*) AS n FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id WHERE ${where}`,
        )
        .get(...params) as { n: number }
    ).n;
  }
  listarLancamentos(
    f: FiltrosListaLancamentos,
    pagina?: { limite: number; deslocamento: number },
  ): LinhaLancamento[] {
    const { where, params } = this.condicoes(f);
    const limite = pagina ? ' LIMIT ? OFFSET ?' : '';
    const extra = pagina ? [pagina.limite, pagina.deslocamento] : [];
    return (
      this.db()
        .prepare(
          `${SELECT_LANCAMENTO} WHERE ${where} ORDER BY l.data_competencia DESC, l.created_at DESC, l.id DESC${limite}`,
        )
        .all(...params, ...extra) as Linha[]
    ).map(lancamento);
  }

  // ---- Parcelas -----------------------------------------------------------------------------
  /** Parcelas com o total efetivamente pago (pagamentos ativos), em lote. */
  parcelasDosLancamentos(
    ids: readonly string[],
    incluirCanceladas: boolean,
  ): Map<string, LinhaParcela[]> {
    const mapa = new Map<string, LinhaParcela[]>();
    for (const bloco of emBlocos(ids)) {
      const marcadores = bloco.map(() => '?').join(',');
      const linhas = this.db()
        .prepare(
          `SELECT pf.*, COALESCE((SELECT SUM(g.valor_centavos) FROM pagamento_financeiro g WHERE g.parcela_id = pf.id AND g.deleted_at IS NULL), 0) AS pago, ${COMPENSADO_SQL} AS compensado
           FROM parcela_financeira pf
           WHERE pf.lancamento_id IN (${marcadores}) ${incluirCanceladas ? '' : 'AND pf.deleted_at IS NULL'}
           ORDER BY pf.lancamento_id, pf.numero`,
        )
        .all(...bloco) as Linha[];
      for (const l of linhas.map(parcela)) {
        const lista = mapa.get(l.lancamentoId) ?? [];
        lista.push(l);
        mapa.set(l.lancamentoId, lista);
      }
    }
    return mapa;
  }
  obterParcela(id: string): LinhaParcela | null {
    const r = this.db()
      .prepare(
        `SELECT pf.*, COALESCE((SELECT SUM(g.valor_centavos) FROM pagamento_financeiro g WHERE g.parcela_id = pf.id AND g.deleted_at IS NULL), 0) AS pago, ${COMPENSADO_SQL} AS compensado
         FROM parcela_financeira pf WHERE pf.id = ?`,
      )
      .get(id) as Linha | undefined;
    return r ? parcela(r) : null;
  }
  inserirParcela(
    id: string,
    lancamentoId: string,
    numero: number,
    vencimento: string,
    valorCentavos: number,
    agora: string,
  ): void {
    this.db()
      .prepare(
        'INSERT INTO parcela_financeira(id,lancamento_id,numero,vencimento,valor_centavos,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(id, lancamentoId, numero, vencimento, valorCentavos, agora, agora);
  }
  maiorNumeroDeParcela(lancamentoId: string): number {
    return Number(
      (
        this.db()
          .prepare(
            'SELECT COALESCE(MAX(numero),0) AS n FROM parcela_financeira WHERE lancamento_id = ?',
          )
          .get(lancamentoId) as { n: number }
      ).n,
    );
  }
  reduzirParcela(id: string, valorCentavos: number, agora: string): void {
    this.db()
      .prepare('UPDATE parcela_financeira SET valor_centavos=?,updated_at=? WHERE id=?')
      .run(valorCentavos, agora, id);
  }
  cancelarParcela(id: string, motivo: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE parcela_financeira SET deleted_at=?,motivo_cancelamento=?,updated_at=? WHERE id=? AND deleted_at IS NULL',
      )
      .run(agora, motivo, agora, id);
  }

  // ---- Pagamentos ---------------------------------------------------------------------------
  private selectPagamento = `SELECT g.*, pf.numero AS parcela_numero, pf.lancamento_id AS lancamento_id
    FROM pagamento_financeiro g JOIN parcela_financeira pf ON pf.id = g.parcela_id`;
  obterPagamento(id: string): LinhaPagamento | null {
    const r = this.db().prepare(`${this.selectPagamento} WHERE g.id = ?`).get(id) as
      Linha | undefined;
    return r ? pagamento(r) : null;
  }
  pagamentoPorRequisicao(requisicaoId: string): LinhaPagamento | null {
    const r = this.db()
      .prepare(`${this.selectPagamento} WHERE g.requisicao_id = ?`)
      .get(requisicaoId) as Linha | undefined;
    return r ? pagamento(r) : null;
  }
  pagamentosDoLancamento(lancamentoId: string): LinhaPagamento[] {
    return (
      this.db()
        .prepare(
          `${this.selectPagamento} WHERE pf.lancamento_id = ? ORDER BY g.data, g.created_at, g.id`,
        )
        .all(lancamentoId) as Linha[]
    ).map(pagamento);
  }
  inserirPagamento(
    id: string,
    parcelaId: string,
    d: { data: string; valorCentavos: number; forma: string | null; observacao: string | null },
    requisicaoId: string,
    agora: string,
  ): void {
    this.db()
      .prepare(
        'INSERT INTO pagamento_financeiro(id,parcela_id,data,valor_centavos,forma,observacao,requisicao_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        parcelaId,
        d.data,
        d.valorCentavos,
        d.forma,
        d.observacao,
        requisicaoId,
        agora,
        agora,
      );
  }
  estornarPagamento(id: string, motivo: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE pagamento_financeiro SET deleted_at=?,motivo_estorno=?,updated_at=? WHERE id=? AND deleted_at IS NULL',
      )
      .run(agora, motivo, agora, id);
  }

  // ---- Caixa (4B): somente leitura -----------------------------------------------------------
  private condicoesCaixa(f: FiltrosCaixa): { where: string; params: unknown[] } {
    const c = ['l.propriedade_id = ?', 'l.deleted_at IS NULL'];
    const params: unknown[] = [f.propriedadeId];
    const simples: [unknown, string][] = [
      [f.natureza, 'l.natureza = ?'],
      [f.categoriaId, 'l.categoria_id = ?'],
      [f.atividade, 'l.atividade = ?'],
      [f.loteId, 'l.lote_id = ?'],
      [f.pessoaId, 'l.pessoa_id = ?'],
    ];
    for (const [valor, sql] of simples)
      if (valor !== undefined) {
        c.push(sql);
        params.push(valor);
      }
    return { where: c.join(' AND '), params };
  }

  /** Pagamentos efetivos (não estornados) somados por dia, natureza e categoria. */
  pagamentosAgregados(f: FiltrosCaixa, de: string, ate: string): PagamentoAgregado[] {
    const { where, params } = this.condicoesCaixa(f);
    return (
      this.db()
        .prepare(
          `SELECT g.data AS data, l.natureza AS natureza, l.categoria_id AS categoria_id,
                  SUM(g.valor_centavos) AS total, COUNT(*) AS n
           FROM pagamento_financeiro g
           JOIN parcela_financeira pf ON pf.id = g.parcela_id
           JOIN lancamento_financeiro l ON l.id = pf.lancamento_id
           WHERE g.deleted_at IS NULL AND g.data >= ? AND g.data <= ? AND ${where}
           GROUP BY g.data, l.natureza, l.categoria_id
           ORDER BY g.data`,
        )
        .all(de, ate, ...params) as Linha[]
    ).map((r) => ({
      data: r['data'] as string,
      natureza: r['natureza'] as NaturezaFinanceira,
      categoriaId: r['categoria_id'] as string,
      totalCentavos: Number(r['total']),
      quantidade: Number(r['n']),
    }));
  }

  private parcelasAbertasSql(where: string): string {
    return `SELECT * FROM (
      SELECT pf.id AS parcela_id, pf.lancamento_id AS lancamento_id, pf.numero AS numero,
        pf.vencimento AS vencimento, pf.valor_centavos AS valor,
        COALESCE((SELECT SUM(g.valor_centavos) FROM pagamento_financeiro g WHERE g.parcela_id = pf.id AND g.deleted_at IS NULL), 0) AS pago, ${COMPENSADO_SQL} AS compensado,
        (SELECT COUNT(*) FROM parcela_financeira x WHERE x.lancamento_id = pf.lancamento_id AND x.deleted_at IS NULL) AS total_parcelas,
        l.natureza AS natureza, l.descricao AS descricao, l.documento_numero AS documento_numero,
        l.categoria_id AS categoria_id, c.nome AS categoria_nome, l.pessoa_id AS pessoa_id,
        p.nome AS pessoa_nome, l.data_competencia AS data_competencia, l.atividade AS atividade,
        l.destino_tipo AS destino_tipo, lt.nome AS lote_nome, a.identificacao AS animal_identificacao
      FROM parcela_financeira pf
      JOIN lancamento_financeiro l ON l.id = pf.lancamento_id
      JOIN categoria_financeira c ON c.id = l.categoria_id
      LEFT JOIN pessoa_comercial p ON p.id = l.pessoa_id
      LEFT JOIN lote lt ON lt.id = l.lote_id
      LEFT JOIN animal a ON a.id = l.animal_id
      WHERE pf.deleted_at IS NULL AND ${where}
    ) WHERE valor - pago - compensado > 0`;
  }

  /** Saldo das parcelas em aberto somado por vencimento, natureza e categoria. */
  saldosAbertosAgregados(f: FiltrosCaixa, de: string, ate: string): SaldoAbertoAgregado[] {
    const { where, params } = this.condicoesCaixa(f);
    return (
      this.db()
        .prepare(
          `SELECT vencimento, natureza, categoria_id, SUM(valor - pago - compensado) AS saldo, COUNT(*) AS n
           FROM (${this.parcelasAbertasSql(where)}) WHERE vencimento >= ? AND vencimento <= ?
           GROUP BY vencimento, natureza, categoria_id ORDER BY vencimento`,
        )
        .all(...params, de, ate) as Linha[]
    ).map((r) => ({
      vencimento: r['vencimento'] as string,
      natureza: r['natureza'] as NaturezaFinanceira,
      categoriaId: r['categoria_id'] as string,
      saldoCentavos: Number(r['saldo']),
      quantidade: Number(r['n']),
    }));
  }

  /** Todas as parcelas com saldo, ordenadas por vencimento. Filtros finos ficam no serviço. */
  contasEmAberto(
    f: FiltrosCaixa,
    vencimento?: { de?: string | undefined; ate?: string | undefined },
  ): LinhaContaAberta[] {
    const { where, params } = this.condicoesCaixa(f);
    const extra: string[] = [];
    const extraParams: unknown[] = [];
    if (vencimento?.de) {
      extra.push('vencimento >= ?');
      extraParams.push(vencimento.de);
    }
    if (vencimento?.ate) {
      extra.push('vencimento <= ?');
      extraParams.push(vencimento.ate);
    }
    const filtro = extra.length ? ` AND ${extra.join(' AND ')}` : '';
    return (
      this.db()
        .prepare(
          `${this.parcelasAbertasSql(where)}${filtro} ORDER BY vencimento, lancamento_id, numero`,
        )
        .all(...params, ...extraParams) as Linha[]
    ).map((r) => ({
      parcelaId: r['parcela_id'] as string,
      lancamentoId: r['lancamento_id'] as string,
      numero: Number(r['numero']),
      totalParcelas: Number(r['total_parcelas']),
      vencimento: r['vencimento'] as string,
      valorCentavos: Number(r['valor']),
      pagoCentavos: Number(r['pago']),
      compensadoCentavos: Number(r['compensado']),
      saldoCentavos: Number(r['valor']) - Number(r['pago']) - Number(r['compensado']),
      natureza: r['natureza'] as NaturezaFinanceira,
      descricao: r['descricao'] as string,
      documentoNumero: r['documento_numero'] as string | null,
      categoriaId: r['categoria_id'] as string,
      categoriaNome: r['categoria_nome'] as string,
      pessoaId: r['pessoa_id'] as string | null,
      pessoaNome: r['pessoa_nome'] as string | null,
      dataCompetencia: r['data_competencia'] as string,
      atividade: r['atividade'] as Atividade,
      destinoTipo: r['destino_tipo'] as DestinoLancamento,
      loteNome: r['lote_nome'] as string | null,
      animalIdentificacao: r['animal_identificacao'] as string | null,
    }));
  }

  /**
   * Lançamentos ativos sem condição de pagamento informada: o saldo é desconhecido. Devolve a
   * soma do valor das operações (não do saldo) por natureza.
   */
  pendentesDeDefinicao(
    f: FiltrosCaixa,
  ): { natureza: NaturezaFinanceira; quantidade: number; valorCentavos: number }[] {
    const { where, params } = this.condicoesCaixa(f);
    return (
      this.db()
        .prepare(
          `SELECT l.natureza AS natureza, COUNT(*) AS n, SUM(l.valor_total_centavos) AS total
           FROM lancamento_financeiro l
           WHERE l.condicao_pagamento = 'nao_informada' AND ${where}
           GROUP BY l.natureza`,
        )
        .all(...params) as Linha[]
    ).map((r) => ({
      natureza: r['natureza'] as NaturezaFinanceira,
      quantidade: Number(r['n']),
      valorCentavos: Number(r['total']),
    }));
  }

  /** Lançamentos do período (por competência) somados por natureza e tratamento da categoria. */
  competenciaPorTratamento(propriedadeId: string, de: string, ate: string): TotalCompetencia[] {
    return (
      this.db()
        .prepare(
          `SELECT l.natureza AS natureza, c.tratamento AS tratamento, SUM(l.valor_total_centavos) AS total, COUNT(*) AS n
           FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id
           WHERE l.propriedade_id = ? AND l.deleted_at IS NULL AND l.data_competencia >= ? AND l.data_competencia <= ?
           GROUP BY l.natureza, c.tratamento ORDER BY l.natureza, c.tratamento`,
        )
        .all(propriedadeId, de, ate) as Linha[]
    ).map((r) => ({
      natureza: r['natureza'] as NaturezaFinanceira,
      tratamento: r['tratamento'] as TratamentoCategoria,
      totalCentavos: Number(r['total']),
      quantidade: Number(r['n']),
    }));
  }

  // ---- Classificação de custo (D-E) -------------------------------------------------------
  /** Despesas ativas de tratamento "resultado" por categoria e classificação. */
  coberturaPorCategoria(propriedadeId: string, de?: string, ate?: string): CoberturaDaCategoria[] {
    const extra: string[] = [];
    const params: unknown[] = [propriedadeId];
    if (de) {
      extra.push('AND l.data_competencia >= ?');
      params.push(de);
    }
    if (ate) {
      extra.push('AND l.data_competencia <= ?');
      params.push(ate);
    }
    return (
      this.db()
        .prepare(
          `SELECT l.categoria_id AS categoria_id, l.comportamento_custo AS comportamento,
                  SUM(l.valor_total_centavos) AS total, COUNT(*) AS n
           FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id
           WHERE l.propriedade_id = ? AND l.deleted_at IS NULL AND l.natureza = 'despesa'
             AND c.tratamento = 'resultado' ${extra.join(' ')}
           GROUP BY l.categoria_id, l.comportamento_custo`,
        )
        .all(...params) as Linha[]
    ).map((r) => ({
      categoriaId: r['categoria_id'] as string,
      comportamento: r['comportamento'] as ComportamentoLancamento,
      totalCentavos: Number(r['total']),
      quantidade: Number(r['n']),
    }));
  }
  /** Despesas ativas da categoria ainda não classificadas, na ordem em que serão alteradas. */
  lancamentosNaoClassificadosDaCategoria(
    propriedadeId: string,
    categoriaId: string,
  ): LancamentoSemClassificacao[] {
    return (
      this.db()
        .prepare(
          `SELECT id, descricao, data_competencia, valor_total_centavos FROM lancamento_financeiro
           WHERE propriedade_id = ? AND categoria_id = ? AND natureza = 'despesa'
             AND deleted_at IS NULL AND comportamento_custo = 'nao_classificado'
           ORDER BY data_competencia, id`,
        )
        .all(propriedadeId, categoriaId) as Linha[]
    ).map((r) => ({
      id: r['id'] as string,
      descricao: r['descricao'] as string,
      dataCompetencia: r['data_competencia'] as string,
      valorCentavos: Number(r['valor_total_centavos']),
    }));
  }
  definirComportamento(id: string, comportamento: ComportamentoLancamento, agora: string): void {
    this.db()
      .prepare(
        'UPDATE lancamento_financeiro SET comportamento_custo=?,updated_at=? WHERE id=? AND deleted_at IS NULL',
      )
      .run(comportamento, agora, id);
  }

  // ---- Conferências para mudanças retroativas em outros módulos ----------------------------
  private lancamentosFora(
    coluna: 'animal_id' | 'lote_id',
    id: string,
    comparacao: '>' | '<',
    data: string,
  ): LancamentosForaDaJanela {
    const where = `${coluna} = ? AND deleted_at IS NULL AND data_competencia ${comparacao} ?`;
    const total = (
      this.db()
        .prepare(`SELECT COUNT(*) AS n FROM lancamento_financeiro WHERE ${where}`)
        .get(id, data) as { n: number }
    ).n;
    const amostra = (
      this.db()
        .prepare(
          `SELECT data_competencia AS data, descricao, valor_total_centavos AS valor FROM lancamento_financeiro WHERE ${where} ORDER BY data_competencia, id LIMIT 3`,
        )
        .all(id, data) as { data: string; descricao: string; valor: number }[]
    ).map((l) => ({ data: l.data, descricao: l.descricao, valorTotalCentavos: Number(l.valor) }));
    return { total, amostra };
  }
  lancamentosDoAnimalApos(animalId: string, data: string): LancamentosForaDaJanela {
    return this.lancamentosFora('animal_id', animalId, '>', data);
  }
  lancamentosDoAnimalAntes(animalId: string, data: string): LancamentosForaDaJanela {
    return this.lancamentosFora('animal_id', animalId, '<', data);
  }
  lancamentosDoLoteApos(loteId: string, data: string): LancamentosForaDaJanela {
    return this.lancamentosFora('lote_id', loteId, '>', data);
  }
  lancamentosDoLoteAntes(loteId: string, data: string): LancamentosForaDaJanela {
    return this.lancamentosFora('lote_id', loteId, '<', data);
  }
  temLancamentoDoAnimal(animalId: string): boolean {
    return Boolean(
      this.db()
        .prepare('SELECT 1 FROM lancamento_financeiro WHERE animal_id = ? LIMIT 1')
        .get(animalId),
    );
  }
  temLancamentoNaPropriedade(propriedadeId: string): boolean {
    return Boolean(
      this.db()
        .prepare('SELECT 1 FROM lancamento_financeiro WHERE propriedade_id = ? LIMIT 1')
        .get(propriedadeId),
    );
  }

  // ---- Trilha (somente leitura; a escrita é do RepositorioHistorico) ------------------------
  historicoDoLancamento(lancamentoId: string): HistoricoFinanceiro[] {
    const linhas = this.db()
      .prepare(
        `SELECT * FROM historico_alteracao WHERE
           (entidade = 'lancamento_financeiro' AND entidade_id = ?) OR
           (entidade = 'pagamento_financeiro' AND entidade_id IN (
              SELECT g.id FROM pagamento_financeiro g JOIN parcela_financeira p ON p.id = g.parcela_id WHERE p.lancamento_id = ?))
         ORDER BY ocorrido_em DESC, id DESC LIMIT 200`,
      )
      .all(lancamentoId, lancamentoId) as Linha[];
    return linhas.map((r) => ({
      id: r['id'] as string,
      entidade: r['entidade'] as string,
      entidadeId: r['entidade_id'] as string,
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
}
