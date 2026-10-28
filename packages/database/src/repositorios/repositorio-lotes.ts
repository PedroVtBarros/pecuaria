import type { Lote, MovimentacaoLote } from '@pecuaria/shared-types';
import type { FinalidadeLote } from '@pecuaria/domain';
import { comoBooleano, referencia, type ObterConexao } from './comum';

export interface GravacaoLote {
  nome: string;
  nomeNormalizado: string;
  finalidade: FinalidadeLote;
  dataFormacao: string;
  observacoes: string | null;
}

interface Linha {
  id: string;
  propriedade_id: string;
  area_id: string | null;
  area_nome: string | null;
  nome: string;
  finalidade: FinalidadeLote;
  data_formacao: string;
  ativo: number;
  data_encerramento: string | null;
  observacoes: string | null;
  animais_ativos: number;
}

const SELECT = `
  SELECT l.*, ar.nome AS area_nome,
    (SELECT count(*) FROM animal a WHERE a.lote_id = l.id AND a.deleted_at IS NULL AND a.status = 'ativo') AS animais_ativos
  FROM lote l
  LEFT JOIN area ar ON ar.id = l.area_id`;

function paraLote(l: Linha): Lote {
  return {
    id: l.id,
    propriedadeId: l.propriedade_id,
    nome: l.nome,
    finalidade: l.finalidade,
    area: referencia(l.area_id, l.area_nome),
    dataFormacao: l.data_formacao,
    ativo: comoBooleano(l.ativo),
    dataEncerramento: l.data_encerramento,
    observacoes: l.observacoes,
    animaisAtivos: l.animais_ativos,
  };
}

export class RepositorioLotes {
  constructor(private readonly db: ObterConexao) {}

  listar(propriedadeId: string, incluirEncerrados: boolean): Lote[] {
    const filtroAtivo = incluirEncerrados ? '' : 'AND l.ativo = 1';
    return (
      this.db()
        .prepare(
          `${SELECT} WHERE l.propriedade_id = ? AND l.deleted_at IS NULL ${filtroAtivo}
           ORDER BY l.ativo DESC, l.nome_normalizado`,
        )
        .all(propriedadeId) as Linha[]
    ).map(paraLote);
  }

  obter(id: string): Lote | null {
    const linha = this.db().prepare(`${SELECT} WHERE l.id = ? AND l.deleted_at IS NULL`).get(id) as
      Linha | undefined;
    return linha ? paraLote(linha) : null;
  }

  /** Lote ativo com este nome na propriedade (para importação por nome). */
  obterAtivoPorNome(propriedadeId: string, nomeNormalizado: string): Lote | null {
    const linha = this.db()
      .prepare(
        `${SELECT} WHERE l.propriedade_id = ? AND l.nome_normalizado = ? AND l.ativo = 1 AND l.deleted_at IS NULL`,
      )
      .get(propriedadeId, nomeNormalizado) as Linha | undefined;
    return linha ? paraLote(linha) : null;
  }

  nomeEmUso(propriedadeId: string, nomeNormalizado: string, excetoId: string | null): boolean {
    return (
      this.db()
        .prepare(
          `SELECT 1 FROM lote WHERE propriedade_id = ? AND nome_normalizado = ? AND ativo = 1
             AND deleted_at IS NULL AND id IS NOT ?`,
        )
        .get(propriedadeId, nomeNormalizado, excetoId) !== undefined
    );
  }

  inserir(
    id: string,
    propriedadeId: string,
    areaId: string | null,
    dados: GravacaoLote,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO lote (id, propriedade_id, area_id, nome, nome_normalizado, finalidade, data_formacao, observacoes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        propriedadeId,
        areaId,
        dados.nome,
        dados.nomeNormalizado,
        dados.finalidade,
        dados.dataFormacao,
        dados.observacoes,
        agora,
        agora,
      );
  }

  atualizar(id: string, dados: GravacaoLote, agora: string): void {
    this.db()
      .prepare(
        `UPDATE lote SET nome = ?, nome_normalizado = ?, finalidade = ?, data_formacao = ?, observacoes = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(
        dados.nome,
        dados.nomeNormalizado,
        dados.finalidade,
        dados.dataFormacao,
        dados.observacoes,
        agora,
        id,
      );
  }

  definirArea(id: string, areaId: string | null, agora: string): void {
    this.db()
      .prepare('UPDATE lote SET area_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(areaId, agora, id);
  }

  encerrar(id: string, data: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE lote SET ativo = 0, data_encerramento = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      )
      .run(data, agora, id);
  }

  reabrir(id: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE lote SET ativo = 1, data_encerramento = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      )
      .run(agora, id);
  }

  /** Data da última movimentação de lote (para manter o histórico em ordem). */
  ultimaMudancaDeArea(loteId: string): string | null {
    const linha = this.db()
      .prepare(
        'SELECT max(data) AS data FROM movimentacao_lote WHERE lote_id = ? AND deleted_at IS NULL',
      )
      .get(loteId) as { data: string | null };
    return linha.data;
  }

  registrarMudancaDeArea(
    id: string,
    loteId: string,
    data: string,
    areaOrigemId: string | null,
    areaDestinoId: string | null,
    observacao: string | null,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO movimentacao_lote (id, lote_id, data, area_origem_id, area_destino_id, observacao, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, loteId, data, areaOrigemId, areaDestinoId, observacao, agora, agora);
  }

  listarMudancasDeArea(loteId: string): MovimentacaoLote[] {
    const linhas = this.db()
      .prepare(
        `SELECT m.id, m.data, m.observacao, m.area_origem_id, ao.nome AS origem_nome, m.area_destino_id, ad.nome AS destino_nome
         FROM movimentacao_lote m
         LEFT JOIN area ao ON ao.id = m.area_origem_id
         LEFT JOIN area ad ON ad.id = m.area_destino_id
         WHERE m.lote_id = ? AND m.deleted_at IS NULL
         ORDER BY m.data DESC, m.created_at DESC`,
      )
      .all(loteId) as {
      id: string;
      data: string;
      observacao: string | null;
      area_origem_id: string | null;
      origem_nome: string | null;
      area_destino_id: string | null;
      destino_nome: string | null;
    }[];
    return linhas.map((l) => ({
      id: l.id,
      data: l.data,
      areaOrigem: referencia(l.area_origem_id, l.origem_nome),
      areaDestino: referencia(l.area_destino_id, l.destino_nome),
      observacao: l.observacao,
    }));
  }

  /** Lotes que já receberam algum animal (não podem ser excluídos, só encerrados). */
  jaTeveAnimais(loteId: string): boolean {
    return (
      this.db()
        .prepare(
          `SELECT 1 FROM movimentacao_animal
           WHERE (lote_destino_id = ? OR lote_origem_id = ?) AND deleted_at IS NULL LIMIT 1`,
        )
        .get(loteId, loteId) !== undefined
    );
  }
}
