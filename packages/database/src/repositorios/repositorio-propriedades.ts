import type { Area, Propriedade } from '@pecuaria/shared-types';
import type { TipoArea, TipoExploracao } from '@pecuaria/domain';
import type { ObterConexao } from './comum';

export interface GravacaoPropriedade {
  nome: string;
  nomeNormalizado: string;
  municipio: string | null;
  uf: string | null;
  areaTotalHa: number | null;
  tipoExploracao: TipoExploracao;
  observacoes: string | null;
}

export interface GravacaoArea {
  nome: string;
  nomeNormalizado: string;
  tipo: TipoArea;
  areaHa: number | null;
  observacoes: string | null;
}

interface LinhaPropriedade {
  id: string;
  nome: string;
  municipio: string | null;
  uf: string | null;
  area_total_ha: number | null;
  tipo_exploracao: TipoExploracao;
  observacoes: string | null;
  animais_ativos: number;
  lotes_ativos: number;
  created_at: string;
  updated_at: string;
}

interface LinhaArea {
  id: string;
  propriedade_id: string;
  nome: string;
  tipo: TipoArea;
  area_ha: number | null;
  observacoes: string | null;
  lotes_ativos: number;
}

const SELECT_PROPRIEDADE = `
  SELECT p.*,
    (SELECT count(*) FROM animal a WHERE a.propriedade_id = p.id AND a.deleted_at IS NULL AND a.status = 'ativo') AS animais_ativos,
    (SELECT count(*) FROM lote l WHERE l.propriedade_id = p.id AND l.deleted_at IS NULL AND l.ativo = 1) AS lotes_ativos
  FROM propriedade p`;

const SELECT_AREA = `
  SELECT ar.*,
    (SELECT count(*) FROM lote l WHERE l.area_id = ar.id AND l.deleted_at IS NULL AND l.ativo = 1) AS lotes_ativos
  FROM area ar`;

function paraPropriedade(l: LinhaPropriedade): Propriedade {
  return {
    id: l.id,
    nome: l.nome,
    municipio: l.municipio,
    uf: l.uf,
    areaTotalHa: l.area_total_ha,
    tipoExploracao: l.tipo_exploracao,
    observacoes: l.observacoes,
    animaisAtivos: l.animais_ativos,
    lotesAtivos: l.lotes_ativos,
    criadoEm: l.created_at,
    atualizadoEm: l.updated_at,
  };
}

function paraArea(l: LinhaArea): Area {
  return {
    id: l.id,
    propriedadeId: l.propriedade_id,
    nome: l.nome,
    tipo: l.tipo,
    areaHa: l.area_ha,
    observacoes: l.observacoes,
    lotesAtivos: l.lotes_ativos,
  };
}

export class RepositorioPropriedades {
  constructor(private readonly db: ObterConexao) {}

  listar(): Propriedade[] {
    const linhas = this.db()
      .prepare(`${SELECT_PROPRIEDADE} WHERE p.deleted_at IS NULL ORDER BY p.nome_normalizado`)
      .all() as LinhaPropriedade[];
    return linhas.map(paraPropriedade);
  }

  obter(id: string): Propriedade | null {
    const linha = this.db()
      .prepare(`${SELECT_PROPRIEDADE} WHERE p.id = ? AND p.deleted_at IS NULL`)
      .get(id) as LinhaPropriedade | undefined;
    return linha ? paraPropriedade(linha) : null;
  }

  nomeEmUso(nomeNormalizado: string, excetoId: string | null): boolean {
    return (
      this.db()
        .prepare(
          'SELECT 1 FROM propriedade WHERE nome_normalizado = ? AND deleted_at IS NULL AND id IS NOT ?',
        )
        .get(nomeNormalizado, excetoId) !== undefined
    );
  }

  inserir(id: string, dados: GravacaoPropriedade, agora: string): void {
    this.db()
      .prepare(
        `INSERT INTO propriedade (id, nome, nome_normalizado, municipio, uf, area_total_ha, tipo_exploracao, observacoes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        dados.nome,
        dados.nomeNormalizado,
        dados.municipio,
        dados.uf,
        dados.areaTotalHa,
        dados.tipoExploracao,
        dados.observacoes,
        agora,
        agora,
      );
  }

  atualizar(id: string, dados: GravacaoPropriedade, agora: string): void {
    this.db()
      .prepare(
        `UPDATE propriedade SET nome = ?, nome_normalizado = ?, municipio = ?, uf = ?, area_total_ha = ?,
           tipo_exploracao = ?, observacoes = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(
        dados.nome,
        dados.nomeNormalizado,
        dados.municipio,
        dados.uf,
        dados.areaTotalHa,
        dados.tipoExploracao,
        dados.observacoes,
        agora,
        id,
      );
  }

  excluirLogico(id: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE propriedade SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      )
      .run(agora, agora, id);
  }

  /** Registros não excluídos ligados à propriedade. */
  contarVinculos(id: string): { animais: number; lotes: number; areas: number } {
    return this.db()
      .prepare(
        `SELECT
           (SELECT count(*) FROM animal WHERE propriedade_id = ? AND deleted_at IS NULL) AS animais,
           (SELECT count(*) FROM lote WHERE propriedade_id = ? AND deleted_at IS NULL) AS lotes,
           (SELECT count(*) FROM area WHERE propriedade_id = ? AND deleted_at IS NULL) AS areas`,
      )
      .get(id, id, id) as { animais: number; lotes: number; areas: number };
  }

  // -------------------------------------------------------------------------
  // Áreas
  // -------------------------------------------------------------------------

  listarAreas(propriedadeId: string): Area[] {
    const linhas = this.db()
      .prepare(
        `${SELECT_AREA} WHERE ar.propriedade_id = ? AND ar.deleted_at IS NULL ORDER BY ar.nome_normalizado`,
      )
      .all(propriedadeId) as LinhaArea[];
    return linhas.map(paraArea);
  }

  obterArea(id: string): Area | null {
    const linha = this.db()
      .prepare(`${SELECT_AREA} WHERE ar.id = ? AND ar.deleted_at IS NULL`)
      .get(id) as LinhaArea | undefined;
    return linha ? paraArea(linha) : null;
  }

  nomeDeAreaEmUso(
    propriedadeId: string,
    nomeNormalizado: string,
    excetoId: string | null,
  ): boolean {
    return (
      this.db()
        .prepare(
          'SELECT 1 FROM area WHERE propriedade_id = ? AND nome_normalizado = ? AND deleted_at IS NULL AND id IS NOT ?',
        )
        .get(propriedadeId, nomeNormalizado, excetoId) !== undefined
    );
  }

  inserirArea(id: string, propriedadeId: string, dados: GravacaoArea, agora: string): void {
    this.db()
      .prepare(
        `INSERT INTO area (id, propriedade_id, nome, nome_normalizado, tipo, area_ha, observacoes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        propriedadeId,
        dados.nome,
        dados.nomeNormalizado,
        dados.tipo,
        dados.areaHa,
        dados.observacoes,
        agora,
        agora,
      );
  }

  atualizarArea(id: string, dados: GravacaoArea, agora: string): void {
    this.db()
      .prepare(
        `UPDATE area SET nome = ?, nome_normalizado = ?, tipo = ?, area_ha = ?, observacoes = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(
        dados.nome,
        dados.nomeNormalizado,
        dados.tipo,
        dados.areaHa,
        dados.observacoes,
        agora,
        id,
      );
  }

  excluirAreaLogico(id: string, agora: string): void {
    this.db()
      .prepare('UPDATE area SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(agora, agora, id);
  }
}
