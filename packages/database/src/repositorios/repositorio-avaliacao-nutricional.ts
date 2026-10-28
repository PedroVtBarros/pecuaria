import type { ObterConexao } from './comum';

type Linha = Record<string, unknown>;

/** Avaliação nutricional como gravada: as colunas JSON voltam como texto, sem interpretação. */
export interface LinhaAvaliacaoNutricional {
  id: string;
  rotulo: string;
  observacao: string | null;
  formatoVersao: number;
  versaoMotor: string;
  tipoQuantidade: string;
  fonteJson: string;
  entradaJson: string;
  hipotesesJson: string;
  perfisJson: string;
  resultadoJson: string;
  conteudoSha256: string;
  registradoPor: string;
  registradoEm: string;
}

export interface LinhaAnulacao {
  avaliacaoId: string;
  motivo: string;
  anuladoPor: string;
  anuladoEm: string;
}

export interface LinhaPerfilDaAvaliacao {
  avaliacaoId: string;
  perfilId: string;
  perfilNome: string;
  alimentoNome: string;
  ordem: number;
  elegivel: boolean;
}

function linha(l: Linha): LinhaAvaliacaoNutricional {
  return {
    id: l['id'] as string,
    rotulo: l['rotulo'] as string,
    observacao: (l['observacao'] as string | null) ?? null,
    formatoVersao: Number(l['formato_versao']),
    versaoMotor: l['versao_motor'] as string,
    tipoQuantidade: l['tipo_quantidade'] as string,
    fonteJson: l['fonte_json'] as string,
    entradaJson: l['entrada_json'] as string,
    hipotesesJson: l['hipoteses_json'] as string,
    perfisJson: l['perfis_json'] as string,
    resultadoJson: l['resultado_json'] as string,
    conteudoSha256: l['conteudo_sha256'] as string,
    registradoPor: l['registrado_por'] as string,
    registradoEm: l['registrado_em'] as string,
  };
}

/**
 * SQL da Fase 6B-4 (migrations 0019 e 0020): avaliação nutricional imutável e anulação. O retrato é montado e
 * conferido no serviço; aqui só se grava e se lê o texto.
 */
export class RepositorioAvaliacaoNutricional {
  constructor(private readonly db: ObterConexao) {}

  inserir(
    a: Omit<LinhaAvaliacaoNutricional, 'registradoEm'>,
    perfis: { id: string; perfilId: string; ordem: number; elegivel: boolean }[],
    agora: string,
  ): void {
    const db = this.db();
    db.prepare(
      `INSERT INTO avaliacao_nutricional(id, rotulo, observacao, formato_versao, versao_motor, tipo_quantidade,
         fonte_json, entrada_json, hipoteses_json, perfis_json, resultado_json, conteudo_sha256,
         registrado_por, registrado_em, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      a.id,
      a.rotulo,
      a.observacao,
      a.formatoVersao,
      a.versaoMotor,
      a.tipoQuantidade,
      a.fonteJson,
      a.entradaJson,
      a.hipotesesJson,
      a.perfisJson,
      a.resultadoJson,
      a.conteudoSha256,
      a.registradoPor,
      agora,
      agora,
      agora,
    );
    const perfil = db.prepare(
      `INSERT INTO avaliacao_nutricional_perfil(id, avaliacao_id, perfil_id, ordem, elegivel, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const p of perfis)
      perfil.run(p.id, a.id, p.perfilId, p.ordem, p.elegivel ? 1 : 0, agora, agora);
  }

  obter(id: string): LinhaAvaliacaoNutricional | null {
    const l = this.db().prepare('SELECT * FROM avaliacao_nutricional WHERE id = ?').get(id) as
      Linha | undefined;
    return l ? linha(l) : null;
  }

  /** Mais recentes primeiro (a integridade de cada uma é conferida no serviço). */
  listar(): LinhaAvaliacaoNutricional[] {
    return (
      this.db()
        .prepare('SELECT * FROM avaliacao_nutricional ORDER BY registrado_em DESC, rowid DESC')
        .all() as Linha[]
    ).map(linha);
  }

  inserirAnulacao(id: string, a: LinhaAnulacao, agora: string): void {
    this.db()
      .prepare(
        `INSERT INTO anulacao_avaliacao_nutricional(id, avaliacao_id, motivo, anulado_por, anulado_em,
           created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, a.avaliacaoId, a.motivo, a.anuladoPor, a.anuladoEm, agora, agora);
  }

  anulacoes(avaliacaoIds: readonly string[]): LinhaAnulacao[] {
    if (avaliacaoIds.length === 0) return [];
    return (
      this.db()
        .prepare(
          `SELECT avaliacao_id, motivo, anulado_por, anulado_em FROM anulacao_avaliacao_nutricional
           WHERE avaliacao_id IN (SELECT value FROM json_each(?))`,
        )
        .all(JSON.stringify(avaliacaoIds)) as Linha[]
    ).map((l) => ({
      avaliacaoId: l['avaliacao_id'] as string,
      motivo: l['motivo'] as string,
      anuladoPor: l['anulado_por'] as string,
      anuladoEm: l['anulado_em'] as string,
    }));
  }

  /**
   * Perfis de cada avaliação, na ordem do retrato; nome do perfil e do alimento como estavam ao
   * gravar (do retrato, não do cadastro atual).
   */
  perfis(avaliacaoIds: readonly string[]): LinhaPerfilDaAvaliacao[] {
    if (avaliacaoIds.length === 0) return [];
    return (
      this.db()
        .prepare(
          `SELECT x.avaliacao_id, x.perfil_id, x.ordem, x.elegivel,
             json_extract(v.perfis_json, '$[' || (x.ordem - 1) || '].nome') AS perfil_nome,
             json_extract(v.perfis_json, '$[' || (x.ordem - 1) || '].alimentoNome') AS alimento_nome
           FROM avaliacao_nutricional_perfil x
           JOIN avaliacao_nutricional v ON v.id = x.avaliacao_id
           WHERE x.avaliacao_id IN (SELECT value FROM json_each(?))
           ORDER BY x.avaliacao_id, x.ordem`,
        )
        .all(JSON.stringify(avaliacaoIds)) as Linha[]
    ).map((l) => ({
      avaliacaoId: l['avaliacao_id'] as string,
      perfilId: l['perfil_id'] as string,
      perfilNome: l['perfil_nome'] as string,
      alimentoNome: l['alimento_nome'] as string,
      ordem: Number(l['ordem']),
      elegivel: Number(l['elegivel']) === 1,
    }));
  }
}
