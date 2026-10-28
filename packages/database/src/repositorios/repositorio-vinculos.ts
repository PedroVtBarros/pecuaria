import type { RelacaoVinculo, SituacaoVinculo } from '@pecuaria/domain';
import type { ObterConexao } from './comum';

type Linha = Record<string, unknown>;
const texto = (v: unknown) => (v === null || v === undefined ? null : (v as string));

/** Vínculo como gravado (migration 0015). A leitura por ponto de vista fica no serviço. */
export interface VinculoGravado {
  id: string;
  registroId: string;
  relacionadoId: string | null;
  alvoFonteCodigo: string;
  alvoReferenciaLocal: string;
  relacao: RelacaoVinculo;
  evidencia: string;
  pacoteCodigo: string | null;
  situacao: SituacaoVinculo;
  decididoPor: string | null;
  decididoEm: string | null;
  motivoDecisao: string | null;
}

function vinculo(l: Linha): VinculoGravado {
  return {
    id: l['id'] as string,
    registroId: l['registro_id'] as string,
    relacionadoId: texto(l['relacionado_id']),
    alvoFonteCodigo: l['alvo_fonte_codigo'] as string,
    alvoReferenciaLocal: l['alvo_referencia_local'] as string,
    relacao: l['relacao'] as RelacaoVinculo,
    evidencia: l['evidencia'] as string,
    pacoteCodigo: texto(l['pacote_codigo']),
    situacao: l['situacao'] as SituacaoVinculo,
    decididoPor: texto(l['decidido_por']),
    decididoEm: texto(l['decidido_em']),
    motivoDecisao: texto(l['motivo_decisao']),
  };
}

/** SQL dos vínculos de possível mesma origem; regras no domínio e no serviço. */
export class RepositorioVinculos {
  constructor(private readonly db: ObterConexao) {}

  obter(id: string): VinculoGravado | null {
    const l = this.db().prepare('SELECT * FROM vinculo_registro WHERE id = ?').get(id) as
      Linha | undefined;
    return l ? vinculo(l) : null;
  }

  /** Vínculos em que algum dos registros aparece, de qualquer lado. */
  porRegistros(ids: readonly string[]): VinculoGravado[] {
    if (ids.length === 0) return [];
    const marcas = ids.map(() => '?').join(', ');
    return (
      this.db()
        .prepare(
          `SELECT * FROM vinculo_registro WHERE registro_id IN (${marcas}) OR relacionado_id IN (${marcas})
           ORDER BY rowid`,
        )
        .all(...ids, ...ids) as Linha[]
    ).map(vinculo);
  }

  todos(): VinculoGravado[] {
    return (
      this.db().prepare('SELECT * FROM vinculo_registro ORDER BY rowid').all() as Linha[]
    ).map(vinculo);
  }

  pendentes(): VinculoGravado[] {
    return (
      this.db()
        .prepare('SELECT * FROM vinculo_registro WHERE relacionado_id IS NULL ORDER BY rowid')
        .all() as Linha[]
    ).map(vinculo);
  }

  inserir(
    id: string,
    v: Omit<
      VinculoGravado,
      'id' | 'situacao' | 'decididoPor' | 'decididoEm' | 'motivoDecisao' | 'relacionadoId'
    >,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO vinculo_registro(id, registro_id, alvo_fonte_codigo, alvo_referencia_local, relacao, evidencia,
           pacote_codigo, situacao, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'a_confirmar', ?, ?)`,
      )
      .run(
        id,
        v.registroId,
        v.alvoFonteCodigo,
        v.alvoReferenciaLocal,
        v.relacao,
        v.evidencia,
        v.pacoteCodigo,
        agora,
        agora,
      );
  }

  resolver(id: string, relacionadoId: string, agora: string): void {
    this.db()
      .prepare('UPDATE vinculo_registro SET relacionado_id = ?, updated_at = ? WHERE id = ?')
      .run(relacionadoId, agora, id);
  }

  decidir(
    id: string,
    situacao: Exclude<SituacaoVinculo, 'a_confirmar'>,
    responsavel: string,
    motivo: string | null,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `UPDATE vinculo_registro SET situacao = ?, decidido_por = ?, decidido_em = ?, motivo_decisao = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(situacao, responsavel, agora, motivo, agora, id);
  }

  /**
   * Registro que o alvo identifica: mesma fonte (código) e mesma página ou tabela, ativo, na
   * primeira versão da cadeia (as versões seguintes herdam o vínculo pela cadeia).
   */
  localizarAlvo(fonteCodigo: string, referenciaLocal: string): string | null {
    const l = this.db()
      .prepare(
        `SELECT r.id FROM registro_composicao r JOIN fonte f ON f.id = r.fonte_id
         WHERE f.codigo_normalizado = ? AND f.deleted_at IS NULL AND r.referencia_local = ?
           AND r.deleted_at IS NULL AND r.substitui_id IS NULL
         ORDER BY r.rowid LIMIT 1`,
      )
      .get(fonteCodigo, referenciaLocal) as Linha | undefined;
    return l ? (l['id'] as string) : null;
  }
}
