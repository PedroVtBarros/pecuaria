import type { ImportacaoCuradoria } from '@pecuaria/shared-types';
import type { ObterConexao } from './comum';

type Linha = Record<string, unknown>;

function importacao(l: Linha): ImportacaoCuradoria {
  return {
    id: l['id'] as string,
    pacoteCodigo: l['pacote_codigo'] as string,
    pacoteVersao: Number(l['pacote_versao']),
    fonteId: l['fonte_id'] as string,
    nAlimentosCriados: Number(l['n_alimentos_criados']),
    nRegistros: Number(l['n_registros']),
    nValores: Number(l['n_valores']),
    importadoEm: l['importado_em'] as string,
  };
}

/** SQL das importações de pacotes de curadoria (migration 0014); regras no serviço. */
export class RepositorioCuradoria {
  constructor(private readonly db: ObterConexao) {}

  listar(): ImportacaoCuradoria[] {
    return (
      this.db().prepare('SELECT * FROM importacao_curadoria ORDER BY rowid').all() as Linha[]
    ).map(importacao);
  }

  obter(codigo: string, versao: number): ImportacaoCuradoria | null {
    const l = this.db()
      .prepare('SELECT * FROM importacao_curadoria WHERE pacote_codigo = ? AND pacote_versao = ?')
      .get(codigo, versao) as Linha | undefined;
    return l ? importacao(l) : null;
  }

  /** O resumo gravado na importação (ids criados, vínculos, itens da atualização). */
  resumo(id: string): Record<string, unknown> {
    const l = this.db()
      .prepare('SELECT resumo_json FROM importacao_curadoria WHERE id = ?')
      .get(id) as Linha | undefined;
    return l ? (JSON.parse(l['resumo_json'] as string) as Record<string, unknown>) : {};
  }

  inserir(i: ImportacaoCuradoria, resumo: object, agora: string): void {
    this.db()
      .prepare(
        `INSERT INTO importacao_curadoria(id, pacote_codigo, pacote_versao, fonte_id, n_alimentos_criados, n_registros,
           n_valores, resumo_json, importado_em, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        i.id,
        i.pacoteCodigo,
        i.pacoteVersao,
        i.fonteId,
        i.nAlimentosCriados,
        i.nRegistros,
        i.nValores,
        JSON.stringify(resumo),
        i.importadoEm,
        agora,
        agora,
      );
  }
}
