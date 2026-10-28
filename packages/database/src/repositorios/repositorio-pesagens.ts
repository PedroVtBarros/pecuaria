import type { Pesagem } from '@pecuaria/shared-types';
import type { EscalaEcc, MetodoPesagem } from '@pecuaria/domain';
import type { ObterConexao } from './comum';

export interface GravacaoPesagem {
  data: string;
  pesoVivoKg: number;
  metodo: MetodoPesagem;
  observacao: string | null;
  escoreCorporal?: number | null;
  escalaEcc?: EscalaEcc | null;
}

/** Conferência de alerta: gravada junto com a pesagem ou depois. */
export interface Conferencia {
  justificativa: string;
  em: string;
}

interface Linha {
  id: string;
  animal_id: string;
  data: string;
  peso_vivo_kg: number;
  metodo: MetodoPesagem;
  observacao: string | null;
  escore_corporal: number | null;
  escala_ecc: EscalaEcc | null;
  conferida_em: string | null;
  justificativa_conferencia: string | null;
  created_at: string;
}

function paraPesagem(l: Linha): Pesagem {
  return {
    id: l.id,
    animalId: l.animal_id,
    data: l.data,
    pesoVivoKg: l.peso_vivo_kg,
    metodo: l.metodo,
    observacao: l.observacao,
    escoreCorporal: l.escore_corporal,
    escalaEcc: l.escala_ecc,
    conferidaEm: l.conferida_em,
    justificativaConferencia: l.justificativa_conferencia,
    criadoEm: l.created_at,
  };
}

export class RepositorioPesagens {
  constructor(private readonly db: ObterConexao) {}

  listar(animalId: string): Pesagem[] {
    return (
      this.db()
        .prepare('SELECT * FROM pesagem WHERE animal_id = ? AND deleted_at IS NULL ORDER BY data')
        .all(animalId) as Linha[]
    ).map(paraPesagem);
  }

  /**
   * Pesagens não excluídas de vários animais, agrupadas por animal.
   * Consulta em blocos para não passar do limite de parâmetros do SQLite.
   */
  listarDeAnimais(animalIds: readonly string[]): Map<string, Pesagem[]> {
    const resultado = new Map<string, Pesagem[]>(animalIds.map((id) => [id, []]));
    const BLOCO = 500;
    for (let i = 0; i < animalIds.length; i += BLOCO) {
      const parte = animalIds.slice(i, i + BLOCO);
      const linhas = this.db()
        .prepare(
          `SELECT * FROM pesagem WHERE deleted_at IS NULL AND animal_id IN (${parte.map(() => '?').join(', ')})
           ORDER BY animal_id, data`,
        )
        .all(...parte) as Linha[];
      for (const l of linhas) resultado.get(l.animal_id)?.push(paraPesagem(l));
    }
    return resultado;
  }

  /** Inclui excluídas, para a linha do tempo mostrar o que foi corrigido. */
  listarInclusiveExcluidas(animalId: string): (Pesagem & { excluidaEm: string | null })[] {
    return (
      this.db()
        .prepare('SELECT * FROM pesagem WHERE animal_id = ? ORDER BY data')
        .all(animalId) as (Linha & { deleted_at: string | null })[]
    ).map((l) => ({ ...paraPesagem(l), excluidaEm: l.deleted_at }));
  }

  obter(id: string): Pesagem | null {
    const linha = this.db()
      .prepare('SELECT * FROM pesagem WHERE id = ? AND deleted_at IS NULL')
      .get(id) as Linha | undefined;
    return linha ? paraPesagem(linha) : null;
  }

  dataEmUso(animalId: string, data: string, excetoId: string | null): boolean {
    return (
      this.db()
        .prepare(
          'SELECT 1 FROM pesagem WHERE animal_id = ? AND data = ? AND deleted_at IS NULL AND id IS NOT ?',
        )
        .get(animalId, data, excetoId) !== undefined
    );
  }

  primeiraData(animalId: string): string | null {
    return (
      this.db()
        .prepare('SELECT min(data) AS data FROM pesagem WHERE animal_id = ? AND deleted_at IS NULL')
        .get(animalId) as { data: string | null }
    ).data;
  }

  ultimaData(animalId: string): string | null {
    return (
      this.db()
        .prepare('SELECT max(data) AS data FROM pesagem WHERE animal_id = ? AND deleted_at IS NULL')
        .get(animalId) as { data: string | null }
    ).data;
  }

  inserir(
    id: string,
    animalId: string,
    dados: GravacaoPesagem,
    agora: string,
    conferencia: Conferencia | null = null,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO pesagem (id, animal_id, data, peso_vivo_kg, metodo, observacao, escore_corporal, escala_ecc,
           conferida_em, justificativa_conferencia, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        animalId,
        dados.data,
        dados.pesoVivoKg,
        dados.metodo,
        dados.observacao,
        dados.escoreCorporal ?? null,
        dados.escoreCorporal == null ? null : (dados.escalaEcc ?? null),
        conferencia?.em ?? null,
        conferencia?.justificativa ?? null,
        agora,
        agora,
      );
  }

  /**
   * Corrige a pesagem. A conferência anterior é descartada (o valor mudou);
   * se a correção vier com justificativa, ela vira a nova conferência.
   */
  atualizar(
    id: string,
    dados: GravacaoPesagem,
    agora: string,
    conferencia: Conferencia | null,
  ): void {
    this.db()
      .prepare(
        `UPDATE pesagem SET data = ?, peso_vivo_kg = ?, metodo = ?, observacao = ?, escore_corporal = ?,
           escala_ecc = ?, conferida_em = ?, justificativa_conferencia = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(
        dados.data,
        dados.pesoVivoKg,
        dados.metodo,
        dados.observacao,
        dados.escoreCorporal ?? null,
        dados.escoreCorporal == null ? null : (dados.escalaEcc ?? null),
        conferencia?.em ?? null,
        conferencia?.justificativa ?? null,
        agora,
        id,
      );
  }

  conferir(id: string, conferencia: Conferencia, agora: string): void {
    this.db()
      .prepare(
        `UPDATE pesagem SET conferida_em = ?, justificativa_conferencia = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(conferencia.em, conferencia.justificativa, agora, id);
  }

  excluirLogico(id: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE pesagem SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      )
      .run(agora, agora, id);
  }
}
