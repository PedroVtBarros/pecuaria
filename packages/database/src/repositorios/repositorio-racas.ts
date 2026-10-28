import type { Raca } from '@pecuaria/shared-types';
import type { AptidaoRaca, GrupoGenetico } from '@pecuaria/domain';
import type { ObterConexao } from './comum';

export interface GravacaoRaca {
  nome: string;
  nomeNormalizado: string;
  aptidao: AptidaoRaca;
  grupoGenetico: GrupoGenetico;
}

interface Linha {
  id: string;
  nome: string;
  aptidao: AptidaoRaca;
  grupo_genetico: GrupoGenetico;
  origem: 'sugestao' | 'usuario';
  animais_vinculados: number;
}

const SELECT = `
  SELECT r.*,
    (SELECT count(*) FROM animal a WHERE a.raca_id = r.id AND a.deleted_at IS NULL) AS animais_vinculados
  FROM raca r`;

function paraRaca(l: Linha): Raca {
  return {
    id: l.id,
    nome: l.nome,
    aptidao: l.aptidao,
    grupoGenetico: l.grupo_genetico,
    origem: l.origem,
    animaisVinculados: l.animais_vinculados,
  };
}

export class RepositorioRacas {
  constructor(private readonly db: ObterConexao) {}

  listar(): Raca[] {
    return (
      this.db()
        .prepare(`${SELECT} WHERE r.deleted_at IS NULL ORDER BY r.nome_normalizado`)
        .all() as Linha[]
    ).map(paraRaca);
  }

  obter(id: string): Raca | null {
    const linha = this.db().prepare(`${SELECT} WHERE r.id = ? AND r.deleted_at IS NULL`).get(id) as
      Linha | undefined;
    return linha ? paraRaca(linha) : null;
  }

  obterPorNome(nomeNormalizado: string): Raca | null {
    const linha = this.db()
      .prepare(`${SELECT} WHERE r.nome_normalizado = ? AND r.deleted_at IS NULL`)
      .get(nomeNormalizado) as Linha | undefined;
    return linha ? paraRaca(linha) : null;
  }

  nomeEmUso(nomeNormalizado: string, excetoId: string | null): boolean {
    return (
      this.db()
        .prepare(
          'SELECT 1 FROM raca WHERE nome_normalizado = ? AND deleted_at IS NULL AND id IS NOT ?',
        )
        .get(nomeNormalizado, excetoId) !== undefined
    );
  }

  inserir(id: string, dados: GravacaoRaca, agora: string): void {
    this.db()
      .prepare(
        `INSERT INTO raca (id, nome, nome_normalizado, aptidao, grupo_genetico, origem, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'usuario', ?, ?)`,
      )
      .run(id, dados.nome, dados.nomeNormalizado, dados.aptidao, dados.grupoGenetico, agora, agora);
  }

  atualizar(id: string, dados: GravacaoRaca, agora: string): void {
    this.db()
      .prepare(
        `UPDATE raca SET nome = ?, nome_normalizado = ?, aptidao = ?, grupo_genetico = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(dados.nome, dados.nomeNormalizado, dados.aptidao, dados.grupoGenetico, agora, id);
  }

  excluirLogico(id: string, agora: string): void {
    this.db()
      .prepare('UPDATE raca SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(agora, agora, id);
  }
}
