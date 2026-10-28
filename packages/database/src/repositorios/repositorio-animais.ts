import type {
  AnimalDetalhe,
  AnimalResumo,
  MovimentacaoAnimal,
  ReferenciaAnimal,
} from '@pecuaria/shared-types';
import type {
  AptidaoAnimal,
  CategoriaAnimal,
  CondicaoSexual,
  MetodoPesagem,
  MovimentacaoParaLote,
  OrigemAnimal,
  Sexo,
  StatusAnimal,
  TipoMovimentacao,
} from '@pecuaria/domain';
import { comoBooleano, padraoLike, referencia, type ObterConexao } from './comum';

export interface GravacaoAnimal {
  identificacao: string;
  identificacaoNormalizada: string;
  nome: string | null;
  sexo: Sexo;
  condicaoSexual: CondicaoSexual;
  categoria: CategoriaAnimal;
  aptidao: AptidaoAnimal;
  racaId: string | null;
  dataNascimento: string | null;
  dataNascimentoEstimada: boolean;
  maeId: string | null;
  paiId: string | null;
  origem: OrigemAnimal;
  observacoes: string | null;
}

export interface ConsultaAnimais {
  propriedadeId: string;
  busca?: string | undefined;
  status?: StatusAnimal | 'todos' | undefined;
  loteId?: string | 'sem_lote' | undefined;
  sexo?: Sexo | undefined;
  categoria?: CategoriaAnimal | undefined;
  racaId?: string | undefined;
  ordenacao?: 'identificacao' | 'nome' | 'categoria' | 'lote' | 'nascimento' | undefined;
  pagina: number;
  tamanhoPagina: number;
}

export interface AnimalBasico {
  id: string;
  identificacao: string;
  nome: string | null;
  propriedadeId: string;
  lote: { id: string; nome: string } | null;
  status: StatusAnimal;
  dataEntrada: string;
  dataSaida: string | null;
}

interface LinhaBasica {
  id: string;
  identificacao: string;
  nome: string | null;
  propriedade_id: string;
  lote_id: string | null;
  lote_nome: string | null;
  status: StatusAnimal;
  data_entrada: string;
  data_saida: string | null;
}

interface LinhaAnimal {
  id: string;
  propriedade_id: string;
  lote_id: string | null;
  lote_nome: string | null;
  identificacao: string;
  nome: string | null;
  sexo: Sexo;
  condicao_sexual: CondicaoSexual;
  categoria: CategoriaAnimal;
  aptidao: AptidaoAnimal;
  raca_id: string | null;
  raca_nome: string | null;
  data_nascimento: string | null;
  data_nascimento_estimada: number;
  mae_id: string | null;
  pai_id: string | null;
  origem: OrigemAnimal;
  data_entrada: string;
  status: StatusAnimal;
  data_saida: string | null;
  motivo_saida: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  ult_data: string | null;
  ult_peso: number | null;
  ult_metodo: MetodoPesagem | null;
}

const SELECT = `
  WITH ultima AS (
    SELECT animal_id, data, peso_vivo_kg, metodo,
      row_number() OVER (PARTITION BY animal_id ORDER BY data DESC) AS ordem
    FROM pesagem WHERE deleted_at IS NULL
  )
  SELECT a.*, r.nome AS raca_nome, l.nome AS lote_nome,
    u.data AS ult_data, u.peso_vivo_kg AS ult_peso, u.metodo AS ult_metodo
  FROM animal a
  LEFT JOIN raca r ON r.id = a.raca_id
  LEFT JOIN lote l ON l.id = a.lote_id
  LEFT JOIN ultima u ON u.animal_id = a.id AND u.ordem = 1`;

const ORDENACAO: Record<NonNullable<ConsultaAnimais['ordenacao']>, string> = {
  identificacao: 'a.identificacao_normalizada',
  nome: 'a.nome IS NULL, a.nome COLLATE NOCASE, a.identificacao_normalizada',
  categoria: 'a.categoria, a.identificacao_normalizada',
  lote: 'l.nome IS NULL, l.nome COLLATE NOCASE, a.identificacao_normalizada',
  nascimento: 'a.data_nascimento IS NULL, a.data_nascimento, a.identificacao_normalizada',
};

function ultimaPesagem(l: LinhaAnimal) {
  return l.ult_data && l.ult_peso !== null && l.ult_metodo
    ? { data: l.ult_data, pesoVivoKg: l.ult_peso, metodo: l.ult_metodo }
    : null;
}

function paraResumo(l: LinhaAnimal): AnimalResumo {
  return {
    id: l.id,
    identificacao: l.identificacao,
    nome: l.nome,
    sexo: l.sexo,
    categoria: l.categoria,
    raca: referencia(l.raca_id, l.raca_nome),
    lote: referencia(l.lote_id, l.lote_nome),
    dataNascimento: l.data_nascimento,
    status: l.status,
    ultimaPesagem: ultimaPesagem(l),
  };
}

export class RepositorioAnimais {
  constructor(private readonly db: ObterConexao) {}

  listar(consulta: ConsultaAnimais): { itens: AnimalResumo[]; total: number } {
    const condicoes = ['a.propriedade_id = ?', 'a.deleted_at IS NULL'];
    const parametros: unknown[] = [consulta.propriedadeId];
    const status = consulta.status ?? 'ativo';
    if (status !== 'todos') {
      condicoes.push('a.status = ?');
      parametros.push(status);
    }
    if (consulta.loteId === 'sem_lote') condicoes.push('a.lote_id IS NULL');
    else if (consulta.loteId) {
      condicoes.push('a.lote_id = ?');
      parametros.push(consulta.loteId);
    }
    if (consulta.sexo) {
      condicoes.push('a.sexo = ?');
      parametros.push(consulta.sexo);
    }
    if (consulta.categoria) {
      condicoes.push('a.categoria = ?');
      parametros.push(consulta.categoria);
    }
    if (consulta.racaId) {
      condicoes.push('a.raca_id = ?');
      parametros.push(consulta.racaId);
    }
    const busca = consulta.busca?.trim();
    if (busca) {
      condicoes.push(
        "(a.identificacao_normalizada LIKE ? ESCAPE '\\' OR a.nome LIKE ? ESCAPE '\\')",
      );
      parametros.push(padraoLike(busca.toLocaleUpperCase('pt-BR')), padraoLike(busca));
    }
    const onde = condicoes.join(' AND ');
    const total = (
      this.db()
        .prepare(`SELECT count(*) AS total FROM animal a WHERE ${onde}`)
        .get(...parametros) as { total: number }
    ).total;
    const linhas = this.db()
      .prepare(
        `${SELECT} WHERE ${onde} ORDER BY ${ORDENACAO[consulta.ordenacao ?? 'identificacao']}
         LIMIT ? OFFSET ?`,
      )
      .all(
        ...parametros,
        consulta.tamanhoPagina,
        (consulta.pagina - 1) * consulta.tamanhoPagina,
      ) as LinhaAnimal[];
    return { itens: linhas.map(paraResumo), total };
  }

  obter(id: string): AnimalDetalhe | null {
    const l = this.db().prepare(`${SELECT} WHERE a.id = ? AND a.deleted_at IS NULL`).get(id) as
      LinhaAnimal | undefined;
    if (!l) return null;
    return {
      id: l.id,
      propriedadeId: l.propriedade_id,
      identificacao: l.identificacao,
      nome: l.nome,
      sexo: l.sexo,
      condicaoSexual: l.condicao_sexual,
      categoria: l.categoria,
      aptidao: l.aptidao,
      raca: referencia(l.raca_id, l.raca_nome),
      lote: referencia(l.lote_id, l.lote_nome),
      dataNascimento: l.data_nascimento,
      dataNascimentoEstimada: comoBooleano(l.data_nascimento_estimada),
      mae: this.referenciaAnimal(l.mae_id),
      pai: this.referenciaAnimal(l.pai_id),
      origem: l.origem,
      dataEntrada: l.data_entrada,
      status: l.status,
      dataSaida: l.data_saida,
      motivoSaida: l.motivo_saida,
      observacoes: l.observacoes,
      ultimaPesagem: ultimaPesagem(l),
      criadoEm: l.created_at,
      atualizadoEm: l.updated_at,
    };
  }

  /** Referência a pai ou mãe, inclusive se o registro foi excluído depois. */
  referenciaAnimal(id: string | null): ReferenciaAnimal | null {
    if (!id) return null;
    const l = this.db()
      .prepare('SELECT id, identificacao, nome, deleted_at FROM animal WHERE id = ?')
      .get(id) as
      | { id: string; identificacao: string; nome: string | null; deleted_at: string | null }
      | undefined;
    return l
      ? { id: l.id, identificacao: l.identificacao, nome: l.nome, excluido: l.deleted_at !== null }
      : null;
  }

  /** Dados básicos para validar genealogia. Inclui excluídos só para mensagens. */
  obterBasico(id: string): {
    id: string;
    propriedadeId: string;
    sexo: Sexo;
    dataNascimento: string | null;
    excluido: boolean;
  } | null {
    const l = this.db()
      .prepare(
        'SELECT id, propriedade_id, sexo, data_nascimento, deleted_at FROM animal WHERE id = ?',
      )
      .get(id) as
      | {
          id: string;
          propriedade_id: string;
          sexo: Sexo;
          data_nascimento: string | null;
          deleted_at: string | null;
        }
      | undefined;
    return l
      ? {
          id: l.id,
          propriedadeId: l.propriedade_id,
          sexo: l.sexo,
          dataNascimento: l.data_nascimento,
          excluido: l.deleted_at !== null,
        }
      : null;
  }

  /**
   * Dados mínimos de muitos animais de uma vez (pesagem em lote, alertas,
   * sanidade coletiva), sem paginação. Só não excluídos.
   */
  listarBasicos(filtro: {
    propriedadeId: string;
    loteId?: string;
    /** Animais que estão ou já estiveram no lote, inclusive os que saíram do rebanho. */
    passaramPeloLoteId?: string;
    somenteAtivos?: boolean;
    ids?: readonly string[];
  }): AnimalBasico[] {
    const condicoes = ['a.propriedade_id = ?', 'a.deleted_at IS NULL'];
    const parametros: unknown[] = [filtro.propriedadeId];
    if (filtro.loteId) {
      condicoes.push('a.lote_id = ?');
      parametros.push(filtro.loteId);
    }
    if (filtro.passaramPeloLoteId) {
      condicoes.push(
        `(a.lote_id = ? OR EXISTS (SELECT 1 FROM movimentacao_animal m WHERE m.animal_id = a.id
           AND m.deleted_at IS NULL AND (m.lote_destino_id = ? OR m.lote_origem_id = ?)))`,
      );
      parametros.push(
        filtro.passaramPeloLoteId,
        filtro.passaramPeloLoteId,
        filtro.passaramPeloLoteId,
      );
    }
    if (filtro.somenteAtivos) condicoes.push("a.status = 'ativo'");
    const consultar = (extra: string, extras: unknown[]) =>
      this.db()
        .prepare(
          `SELECT a.id, a.identificacao, a.nome, a.propriedade_id, a.lote_id, l.nome AS lote_nome, a.status,
             a.data_entrada, a.data_saida
           FROM animal a LEFT JOIN lote l ON l.id = a.lote_id
           WHERE ${[...condicoes, ...(extra ? [extra] : [])].join(' AND ')}
           ORDER BY a.identificacao_normalizada`,
        )
        .all(...parametros, ...extras) as LinhaBasica[];
    let linhas: LinhaBasica[];
    if (filtro.ids) {
      linhas = [];
      const BLOCO = 500;
      for (let i = 0; i < filtro.ids.length; i += BLOCO) {
        const parte = filtro.ids.slice(i, i + BLOCO);
        linhas.push(...consultar(`a.id IN (${parte.map(() => '?').join(', ')})`, parte));
      }
    } else {
      linhas = consultar('', []);
    }
    return linhas.map((l) => ({
      id: l.id,
      identificacao: l.identificacao,
      nome: l.nome,
      propriedadeId: l.propriedade_id,
      lote: referencia(l.lote_id, l.lote_nome),
      status: l.status,
      dataEntrada: l.data_entrada,
      dataSaida: l.data_saida,
    }));
  }

  /**
   * Movimentações de vários animais, em ordem cronológica e, no mesmo dia, na
   * ordem em que foram registradas (rowid), para reconstruir a passagem por lotes.
   */
  listarMovimentacoesDeAnimais(animalIds: readonly string[]): Map<string, MovimentacaoParaLote[]> {
    const resultado = new Map<string, MovimentacaoParaLote[]>(animalIds.map((id) => [id, []]));
    const BLOCO = 500;
    for (let i = 0; i < animalIds.length; i += BLOCO) {
      const parte = animalIds.slice(i, i + BLOCO);
      const linhas = this.db()
        .prepare(
          `SELECT animal_id, tipo, data, lote_origem_id, lote_destino_id FROM movimentacao_animal
           WHERE deleted_at IS NULL AND animal_id IN (${parte.map(() => '?').join(', ')})
           ORDER BY animal_id, data, rowid`,
        )
        .all(...parte) as {
        animal_id: string;
        tipo: TipoMovimentacao;
        data: string;
        lote_origem_id: string | null;
        lote_destino_id: string | null;
      }[];
      for (const l of linhas) {
        resultado.get(l.animal_id)?.push({
          tipo: l.tipo,
          data: l.data,
          loteOrigemId: l.lote_origem_id,
          loteDestinoId: l.lote_destino_id,
        });
      }
    }
    return resultado;
  }

  identificacaoEmUso(propriedadeId: string, normalizada: string, excetoId: string | null): boolean {
    return (
      this.db()
        .prepare(
          `SELECT 1 FROM animal WHERE propriedade_id = ? AND identificacao_normalizada = ?
             AND deleted_at IS NULL AND id IS NOT ?`,
        )
        .get(propriedadeId, normalizada, excetoId) !== undefined
    );
  }

  /** Filhos não excluídos que apontam para o animal como mãe ou pai. */
  contarFilhos(id: string): { comoMae: number; comoPai: number } {
    return this.db()
      .prepare(
        `SELECT
           (SELECT count(*) FROM animal WHERE mae_id = ? AND deleted_at IS NULL) AS comoMae,
           (SELECT count(*) FROM animal WHERE pai_id = ? AND deleted_at IS NULL) AS comoPai`,
      )
      .get(id, id) as { comoMae: number; comoPai: number };
  }

  nascimentoMaisAntigoDosFilhos(id: string): string | null {
    return (
      this.db()
        .prepare(
          `SELECT min(data_nascimento) AS data FROM animal
           WHERE (mae_id = ? OR pai_id = ?) AND deleted_at IS NULL AND data_nascimento IS NOT NULL`,
        )
        .get(id, id) as { data: string | null }
    ).data;
  }

  inserir(
    id: string,
    propriedadeId: string,
    loteId: string | null,
    dataEntrada: string,
    dados: GravacaoAnimal,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO animal (id, propriedade_id, lote_id, identificacao, identificacao_normalizada, nome, sexo,
           condicao_sexual, categoria, aptidao, raca_id, data_nascimento, data_nascimento_estimada, mae_id, pai_id,
           origem, data_entrada, status, observacoes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativo', ?, ?, ?)`,
      )
      .run(
        id,
        propriedadeId,
        loteId,
        dados.identificacao,
        dados.identificacaoNormalizada,
        dados.nome,
        dados.sexo,
        dados.condicaoSexual,
        dados.categoria,
        dados.aptidao,
        dados.racaId,
        dados.dataNascimento,
        dados.dataNascimentoEstimada ? 1 : 0,
        dados.maeId,
        dados.paiId,
        dados.origem,
        dataEntrada,
        dados.observacoes,
        agora,
        agora,
      );
  }

  atualizar(id: string, dados: GravacaoAnimal, agora: string): void {
    this.db()
      .prepare(
        `UPDATE animal SET identificacao = ?, identificacao_normalizada = ?, nome = ?, sexo = ?, condicao_sexual = ?,
           categoria = ?, aptidao = ?, raca_id = ?, data_nascimento = ?, data_nascimento_estimada = ?, mae_id = ?,
           pai_id = ?, origem = ?, observacoes = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(
        dados.identificacao,
        dados.identificacaoNormalizada,
        dados.nome,
        dados.sexo,
        dados.condicaoSexual,
        dados.categoria,
        dados.aptidao,
        dados.racaId,
        dados.dataNascimento,
        dados.dataNascimentoEstimada ? 1 : 0,
        dados.maeId,
        dados.paiId,
        dados.origem,
        dados.observacoes,
        agora,
        id,
      );
  }

  definirLote(id: string, loteId: string | null, agora: string): void {
    this.db()
      .prepare('UPDATE animal SET lote_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(loteId, agora, id);
  }

  registrarSaida(
    id: string,
    status: StatusAnimal,
    data: string,
    motivo: string | null,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `UPDATE animal SET status = ?, data_saida = ?, motivo_saida = ?, lote_id = NULL, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(status, data, motivo, agora, id);
  }

  excluirLogico(id: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE animal SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      )
      .run(agora, agora, id);
  }

  // -------------------------------------------------------------------------
  // Movimentações
  // -------------------------------------------------------------------------

  registrarMovimentacao(
    id: string,
    animalId: string,
    tipo: TipoMovimentacao,
    data: string,
    loteOrigemId: string | null,
    loteDestinoId: string | null,
    motivo: string | null,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO movimentacao_animal (id, animal_id, tipo, data, lote_origem_id, lote_destino_id, motivo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, animalId, tipo, data, loteOrigemId, loteDestinoId, motivo, agora, agora);
  }

  listarMovimentacoes(animalId: string): MovimentacaoAnimal[] {
    const linhas = this.db()
      .prepare(
        `SELECT m.id, m.tipo, m.data, m.motivo, m.lote_origem_id, lo.nome AS origem_nome,
           m.lote_destino_id, ld.nome AS destino_nome
         FROM movimentacao_animal m
         LEFT JOIN lote lo ON lo.id = m.lote_origem_id
         LEFT JOIN lote ld ON ld.id = m.lote_destino_id
         WHERE m.animal_id = ? AND m.deleted_at IS NULL
         ORDER BY m.data, m.created_at`,
      )
      .all(animalId) as {
      id: string;
      tipo: TipoMovimentacao;
      data: string;
      motivo: string | null;
      lote_origem_id: string | null;
      origem_nome: string | null;
      lote_destino_id: string | null;
      destino_nome: string | null;
    }[];
    return linhas.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      data: l.data,
      loteOrigem: referencia(l.lote_origem_id, l.origem_nome),
      loteDestino: referencia(l.lote_destino_id, l.destino_nome),
      motivo: l.motivo,
    }));
  }

  /** Animais (não excluídos) que passaram pelo lote em algum momento, pela movimentação válida. */
  idsQueEstiveramNoLote(loteId: string): string[] {
    return (
      this.db()
        .prepare(
          `SELECT DISTINCT m.animal_id AS id FROM movimentacao_animal m JOIN animal a ON a.id = m.animal_id
           WHERE m.deleted_at IS NULL AND a.deleted_at IS NULL AND (m.lote_destino_id = ? OR m.lote_origem_id = ?)
           ORDER BY m.animal_id`,
        )
        .all(loteId, loteId) as { id: string }[]
    ).map((l) => l.id);
  }
  /** Última saída do rebanho ainda válida (não cancelada) do animal. */
  obterMovimentacaoDeSaida(
    animalId: string,
  ): { id: string; data: string; loteOrigemId: string | null; motivo: string | null } | null {
    const r = this.db()
      .prepare(
        `SELECT id, data, lote_origem_id, motivo FROM movimentacao_animal
         WHERE animal_id = ? AND tipo = 'saida' AND deleted_at IS NULL ORDER BY data DESC, rowid DESC LIMIT 1`,
      )
      .get(animalId) as
      | { id: string; data: string; lote_origem_id: string | null; motivo: string | null }
      | undefined;
    return r ? { id: r.id, data: r.data, loteOrigemId: r.lote_origem_id, motivo: r.motivo } : null;
  }
  /** Cancelamento lógico de uma movimentação (reversão de saída). */
  cancelarMovimentacao(id: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE movimentacao_animal SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      )
      .run(agora, agora, id);
  }
  /** Volta o animal ao rebanho: ativo, sem data nem motivo de saída. */
  reativar(id: string, loteId: string | null, agora: string): void {
    this.db()
      .prepare(
        `UPDATE animal SET status = 'ativo', data_saida = NULL, motivo_saida = NULL, lote_id = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(loteId, agora, id);
  }

  /**
   * Período em que o animal esteve fora do rebanho e depois voltou (saída seguida de nova entrada,
   * ex.: venda devolvida pelo comprador) que contém a data: `de < data < ate`. Nos dias da saída e
   * do retorno o animal esteve no rebanho. `null` quando a data não cai num desses períodos.
   */
  ausenciaNaData(animalId: string, data: string): { de: string; ate: string } | null {
    const movs = this.db()
      .prepare(
        `SELECT tipo, data FROM movimentacao_animal
         WHERE animal_id = ? AND deleted_at IS NULL AND tipo IN ('entrada','saida')
         ORDER BY data, rowid`,
      )
      .all(animalId) as { tipo: string; data: string }[];
    let saida: string | null = null;
    for (const m of movs) {
      if (m.tipo === 'saida') saida = m.data;
      else if (saida !== null) {
        if (saida < data && data < m.data) return { de: saida, ate: m.data };
        saida = null;
      }
    }
    return null;
  }

  ultimaMovimentacao(animalId: string): string | null {
    return (
      this.db()
        .prepare(
          'SELECT max(data) AS data FROM movimentacao_animal WHERE animal_id = ? AND deleted_at IS NULL',
        )
        .get(animalId) as { data: string | null }
    ).data;
  }
}
