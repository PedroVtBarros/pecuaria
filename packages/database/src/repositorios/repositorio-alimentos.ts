import { direcaoSugeridaPorGrupo, normalizarCodigo } from '@pecuaria/domain';
import type {
  Alimento,
  DadosAlimentoValidados,
  DadosFonteValidados,
  DadosNutrienteValidados,
  FiltrosAlimentos,
  FiltrosFontes,
  Fonte,
  Nutriente,
  ResumoAlimento,
} from '@pecuaria/shared-types';
import { padraoLike, type ObterConexao } from './comum';

type Linha = Record<string, unknown>;

const texto = (v: unknown) => (v === null || v === undefined ? null : (v as string));

function fonte(l: Linha): Fonte {
  return {
    id: l['id'] as string,
    origem: l['origem'] as Fonte['origem'],
    codigo: texto(l['codigo']),
    titulo: l['titulo'] as string,
    autores: texto(l['autores']),
    ano: l['ano'] === null ? null : Number(l['ano']),
    edicaoVersao: texto(l['edicao_versao']),
    instituicaoEditora: texto(l['instituicao_editora']),
    isbnDoiUrl: texto(l['isbn_doi_url']),
    dataAcesso: texto(l['data_acesso']),
    experimentoOrigem: texto(l['experimento_origem']),
    laboratorio: texto(l['laboratorio']),
    numeroLaudo: texto(l['numero_laudo']),
    dataLaudo: texto(l['data_laudo']),
    fabricante: texto(l['fabricante']),
    registroProduto: texto(l['registro_produto']),
    metodoMedicao: texto(l['metodo_medicao']),
    limitacoesMedicao: texto(l['limitacoes_medicao']),
    propriedadeId: texto(l['propriedade_id']),
    propriedadeNome: texto(l['propriedade_nome']),
    observacoes: texto(l['observacoes']),
    excluidaEm: texto(l['deleted_at']),
    nRegistros: Number(l['n_registros'] ?? 0),
  };
}

function nutriente(l: Linha): Nutriente {
  const grupo = l['grupo'] as Nutriente['grupo'];
  return {
    id: l['id'] as string,
    codigo: l['codigo'] as string,
    nome: l['nome'] as string,
    grupo,
    unidadeReferencia: l['unidade_referencia'] as Nutriente['unidadeReferencia'],
    baseReferencia: l['base_referencia'] as Nutriente['baseReferencia'],
    metodoAnalitico: texto(l['metodo_analitico']),
    situacaoFundamentacao: l['situacao_fundamentacao'] as Nutriente['situacaoFundamentacao'],
    fundamentacaoFonte: l['fundamentacao_fonte_id']
      ? {
          id: l['fundamentacao_fonte_id'] as string,
          titulo: l['fundamentacao_fonte_titulo'] as string,
          codigo: texto(l['fundamentacao_fonte_codigo']),
        }
      : null,
    fundamentacaoReferencia: texto(l['fundamentacao_referencia']),
    direcaoConservadora: l['direcao_conservadora'] as Nutriente['direcaoConservadora'],
    naturezaValor: ((l['natureza_valor'] as string | undefined) ??
      'fracao_massica') as Nutriente['naturezaValor'],
    direcaoSugerida: direcaoSugeridaPorGrupo(grupo),
    origemDefinicao: l['origem_definicao'] as Nutriente['origemDefinicao'],
    descricao: texto(l['descricao']),
    ativo: Boolean(l['ativo']),
    nValores: Number(l['n_valores'] ?? 0),
  };
}

function alimento(l: Linha): Alimento {
  return {
    id: l['id'] as string,
    nome: l['nome'] as string,
    especie: texto(l['especie']),
    cultivar: texto(l['cultivar']),
    partePlanta: texto(l['parte_planta']),
    formaConservacao: l['forma_conservacao'] as Alimento['formaConservacao'],
    processamento: texto(l['processamento']),
    classe: l['classe'] as Alimento['classe'],
    comercial: Boolean(l['comercial']),
    observacoes: texto(l['observacoes']),
    excluidoEm: texto(l['deleted_at']),
  };
}

function resumoAlimento(l: Linha): ResumoAlimento {
  return {
    ...alimento(l),
    nRegistros: Number(l['n_registros'] ?? 0),
    nConferidos: Number(l['n_conferidos'] ?? 0),
  };
}

const SELECT_FONTE = `SELECT f.*, p.nome AS propriedade_nome,
  (SELECT count(*) FROM registro_composicao r WHERE r.fonte_id = f.id AND r.deleted_at IS NULL) AS n_registros
  FROM fonte f LEFT JOIN propriedade p ON p.id = f.propriedade_id`;

const SELECT_NUTRIENTE = `SELECT n.*, f.titulo AS fundamentacao_fonte_titulo, f.codigo AS fundamentacao_fonte_codigo,
  (SELECT count(*) FROM valor_nutricional v WHERE v.nutriente_id = n.id AND v.deleted_at IS NULL)
    + (SELECT count(*) FROM valor_nao_quantificado q WHERE q.nutriente_id = n.id AND q.deleted_at IS NULL) AS n_valores
  FROM nutriente n LEFT JOIN fonte f ON f.id = n.fundamentacao_fonte_id`;

const SELECT_ALIMENTO = `SELECT a.*,
  (SELECT count(*) FROM registro_composicao r WHERE r.alimento_id = a.id AND r.deleted_at IS NULL) AS n_registros,
  (SELECT count(*) FROM registro_composicao r WHERE r.alimento_id = a.id AND r.deleted_at IS NULL AND r.status = 'conferido') AS n_conferidos
  FROM alimento a`;

/** SQL e mapeamento do catálogo do banco de alimentos; regras ficam no domínio e no serviço. */
export class RepositorioAlimentos {
  constructor(private readonly db: ObterConexao) {}

  // ----- Fontes -----

  listarFontes(filtros: FiltrosFontes): Fonte[] {
    const condicoes: string[] = [];
    const params: unknown[] = [];
    if (!filtros.incluirExcluidas) condicoes.push('f.deleted_at IS NULL');
    if (filtros.origem) {
      condicoes.push('f.origem = ?');
      params.push(filtros.origem);
    }
    if (filtros.propriedadeId) {
      condicoes.push('(f.propriedade_id IS NULL OR f.propriedade_id = ?)');
      params.push(filtros.propriedadeId);
    } else condicoes.push('f.propriedade_id IS NULL');
    const onde = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
    return (
      this.db()
        .prepare(`${SELECT_FONTE} ${onde} ORDER BY f.origem, lower(f.titulo), f.rowid`)
        .all(...params) as Linha[]
    ).map(fonte);
  }

  obterFonte(id: string): Fonte | null {
    const l = this.db().prepare(`${SELECT_FONTE} WHERE f.id = ?`).get(id) as Linha | undefined;
    return l ? fonte(l) : null;
  }

  salvarFonte(id: string, d: DadosFonteValidados, agora: string, nova: boolean): void {
    const valores = {
      codigo: d.codigo,
      codigo_normalizado: d.codigo === null ? null : normalizarCodigo(d.codigo),
      titulo: d.titulo,
      autores: d.autores,
      ano: d.ano,
      edicao_versao: d.edicaoVersao,
      instituicao_editora: d.instituicaoEditora,
      isbn_doi_url: d.isbnDoiUrl,
      data_acesso: d.dataAcesso,
      experimento_origem: d.experimentoOrigem,
      laboratorio: d.laboratorio,
      numero_laudo: d.numeroLaudo,
      data_laudo: d.dataLaudo,
      fabricante: d.fabricante,
      registro_produto: d.registroProduto,
      metodo_medicao: d.metodoMedicao,
      limitacoes_medicao: d.limitacoesMedicao,
      observacoes: d.observacoes,
    };
    const colunas = Object.keys(valores);
    if (nova)
      this.db()
        .prepare(
          `INSERT INTO fonte(id, origem, propriedade_id, ${colunas.join(', ')}, created_at, updated_at)
           VALUES (?, ?, ?, ${colunas.map(() => '?').join(', ')}, ?, ?)`,
        )
        .run(id, d.origem, d.propriedadeId, ...Object.values(valores), agora, agora);
    else
      this.db()
        .prepare(
          `UPDATE fonte SET ${colunas.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        )
        .run(...Object.values(valores), agora, id);
  }

  excluirFonte(id: string, agora: string): void {
    this.db()
      .prepare('UPDATE fonte SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(agora, agora, id);
  }

  /** Uma fonte de mesmo código (sem diferença de maiúsculas) entre as ativas, exceto `excetoId`. */
  fontePorCodigo(codigo: string, excetoId: string | null = null): Fonte | null {
    const l = this.db()
      .prepare(
        `${SELECT_FONTE} WHERE f.codigo_normalizado = ? AND f.deleted_at IS NULL AND f.id IS NOT ?`,
      )
      .get(normalizarCodigo(codigo), excetoId) as Linha | undefined;
    return l ? fonte(l) : null;
  }

  // ----- Nutrientes -----

  listarNutrientes(incluirInativos: boolean): Nutriente[] {
    return (
      this.db()
        .prepare(
          `${SELECT_NUTRIENTE} ${incluirInativos ? '' : 'WHERE n.ativo = 1'}
           ORDER BY n.rowid`,
        )
        .all() as Linha[]
    ).map(nutriente);
  }

  obterNutriente(id: string): Nutriente | null {
    const l = this.db().prepare(`${SELECT_NUTRIENTE} WHERE n.id = ?`).get(id) as Linha | undefined;
    return l ? nutriente(l) : null;
  }

  nutrientePorCodigo(codigo: string): Nutriente | null {
    const l = this.db()
      .prepare(`${SELECT_NUTRIENTE} WHERE n.codigo_normalizado = ?`)
      .get(normalizarCodigo(codigo)) as Linha | undefined;
    return l ? nutriente(l) : null;
  }

  inserirNutriente(id: string, d: DadosNutrienteValidados, agora: string): void {
    this.db()
      .prepare(
        `INSERT INTO nutriente(id, codigo, codigo_normalizado, nome, grupo, unidade_referencia, base_referencia,
           metodo_analitico, situacao_fundamentacao, fundamentacao_fonte_id, fundamentacao_referencia,
           direcao_conservadora, origem_definicao, descricao, ativo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'usuario', ?, ?, ?, ?)`,
      )
      .run(
        id,
        d.codigo,
        normalizarCodigo(d.codigo),
        d.nome,
        d.grupo,
        d.unidadeReferencia,
        d.baseReferencia,
        d.metodoAnalitico,
        d.situacaoFundamentacao,
        d.fundamentacaoFonteId,
        d.fundamentacaoReferencia,
        d.direcaoConservadora,
        d.descricao,
        Number(d.ativo),
        agora,
        agora,
      );
  }

  atualizarNutriente(id: string, d: DadosNutrienteValidados, agora: string): void {
    this.db()
      .prepare(
        `UPDATE nutriente SET nome = ?, grupo = ?, unidade_referencia = ?, base_referencia = ?, metodo_analitico = ?,
           situacao_fundamentacao = ?, fundamentacao_fonte_id = ?, fundamentacao_referencia = ?,
           direcao_conservadora = ?, descricao = ?, ativo = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        d.nome,
        d.grupo,
        d.unidadeReferencia,
        d.baseReferencia,
        d.metodoAnalitico,
        d.situacaoFundamentacao,
        d.fundamentacaoFonteId,
        d.fundamentacaoReferencia,
        d.direcaoConservadora,
        d.descricao,
        Number(d.ativo),
        agora,
        id,
      );
  }

  // ----- Alimentos -----

  listarAlimentos(filtros: FiltrosAlimentos): ResumoAlimento[] {
    const condicoes: string[] = [];
    const params: unknown[] = [];
    if (!filtros.incluirExcluidos) condicoes.push('a.deleted_at IS NULL');
    if (filtros.formaConservacao) {
      condicoes.push('a.forma_conservacao = ?');
      params.push(filtros.formaConservacao);
    }
    if (filtros.classe) {
      condicoes.push('a.classe = ?');
      params.push(filtros.classe);
    }
    if (filtros.busca) {
      const padrao = padraoLike(filtros.busca.toLocaleLowerCase('pt-BR'));
      condicoes.push(
        `(a.nome_normalizado LIKE ? ESCAPE '\\' OR lower(coalesce(a.especie, '')) LIKE ? ESCAPE '\\' OR lower(coalesce(a.cultivar, '')) LIKE ? ESCAPE '\\')`,
      );
      params.push(padrao, padrao, padrao);
    }
    const onde = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
    return (
      this.db()
        .prepare(`${SELECT_ALIMENTO} ${onde} ORDER BY a.nome_normalizado, a.rowid`)
        .all(...params) as Linha[]
    ).map(resumoAlimento);
  }

  obterAlimento(id: string): ResumoAlimento | null {
    const l = this.db().prepare(`${SELECT_ALIMENTO} WHERE a.id = ?`).get(id) as Linha | undefined;
    return l ? resumoAlimento(l) : null;
  }

  alimentoPorNome(nomeNormalizado: string, excetoId: string | null = null): Alimento | null {
    const l = this.db()
      .prepare(
        'SELECT * FROM alimento WHERE nome_normalizado = ? AND deleted_at IS NULL AND id IS NOT ?',
      )
      .get(nomeNormalizado, excetoId) as Linha | undefined;
    return l ? alimento(l) : null;
  }

  salvarAlimento(
    id: string,
    d: DadosAlimentoValidados,
    nomeNormalizado: string,
    agora: string,
    novo: boolean,
  ): void {
    const valores = [
      d.nome,
      nomeNormalizado,
      d.especie,
      d.cultivar,
      d.partePlanta,
      d.formaConservacao,
      d.processamento,
      d.classe,
      Number(d.comercial),
      d.observacoes,
    ];
    if (novo)
      this.db()
        .prepare(
          `INSERT INTO alimento(nome, nome_normalizado, especie, cultivar, parte_planta, forma_conservacao, processamento,
             classe, comercial, observacoes, id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(...valores, id, agora, agora);
    else
      this.db()
        .prepare(
          `UPDATE alimento SET nome = ?, nome_normalizado = ?, especie = ?, cultivar = ?, parte_planta = ?,
             forma_conservacao = ?, processamento = ?, classe = ?, comercial = ?, observacoes = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(...valores, agora, id);
  }

  excluirAlimento(id: string, motivo: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE alimento SET deleted_at = ?, motivo_exclusao = ?, updated_at = ? WHERE id = ?',
      )
      .run(agora, motivo, agora, id);
  }

  /** Itens de estoque ativos vinculados ao alimento (para recusar a exclusão com mensagem clara). */
  contarVinculosEstoque(alimentoId: string): number {
    const l = this.db()
      .prepare(
        'SELECT count(*) AS n FROM estoque_item_alimento WHERE alimento_id = ? AND deleted_at IS NULL',
      )
      .get(alimentoId) as { n: number };
    return l.n;
  }

  // ----- Vínculo com item de estoque -----

  /** Vínculo ativo do item de estoque, com o alimento. */
  vinculoDoItem(itemId: string): { id: string; alimentoId: string; alimentoNome: string } | null {
    const l = this.db()
      .prepare(
        `SELECT v.id, v.alimento_id, a.nome AS alimento_nome FROM estoque_item_alimento v
         JOIN alimento a ON a.id = v.alimento_id WHERE v.estoque_item_id = ? AND v.deleted_at IS NULL`,
      )
      .get(itemId) as Linha | undefined;
    return l
      ? {
          id: l['id'] as string,
          alimentoId: l['alimento_id'] as string,
          alimentoNome: l['alimento_nome'] as string,
        }
      : null;
  }

  vincular(id: string, itemId: string, alimentoId: string, agora: string): void {
    this.db()
      .prepare(
        'INSERT INTO estoque_item_alimento(id, estoque_item_id, alimento_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, itemId, alimentoId, agora, agora);
  }

  desvincular(id: string, agora: string): void {
    this.db()
      .prepare('UPDATE estoque_item_alimento SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(agora, agora, id);
  }

  /** Itens de estoque (de todas as propriedades) vinculados ao alimento. */
  itensVinculados(
    alimentoId: string,
  ): { id: string; nome: string; propriedadeId: string; propriedadeNome: string }[] {
    return (
      this.db()
        .prepare(
          `SELECT i.id, i.nome, i.propriedade_id, p.nome AS propriedade_nome FROM estoque_item_alimento v
           JOIN estoque_item i ON i.id = v.estoque_item_id JOIN propriedade p ON p.id = i.propriedade_id
           WHERE v.alimento_id = ? AND v.deleted_at IS NULL ORDER BY p.nome, i.nome_normalizado`,
        )
        .all(alimentoId) as Linha[]
    ).map((l) => ({
      id: l['id'] as string,
      nome: l['nome'] as string,
      propriedadeId: l['propriedade_id'] as string,
      propriedadeNome: l['propriedade_nome'] as string,
    }));
  }
}
