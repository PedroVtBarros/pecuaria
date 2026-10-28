import type { ObterConexao } from './comum';

/**
 * Catálogo fechado da trilha de alterações (decisão D-I). O banco só confere o formato
 * (minúsculas e "_"); quem decide o que é válido é esta lista, que é a única porta de escrita.
 * Valor novo exige editar a lista e o teste de catálogo.
 */
export const ENTIDADES_HISTORICO = [
  'propriedade',
  'area',
  'raca',
  'lote',
  'animal',
  'pesagem',
  'produto_sanitario',
  'manejo_sanitario',
  'agenda_sanitaria',
  'estoque_item',
  'estoque_lote',
  'movimentacao_estoque',
  'pessoa_comercial',
  'categoria_financeira',
  'lancamento_financeiro',
  'pagamento_financeiro',
  'negociacao_animal',
  'custo_anterior',
  'classificacao_origem',
  'rateio_custo',
  'centro_producao',
  'devolucao_animal',
  'fonte',
  'nutriente',
  'alimento',
  'registro_composicao',
  'estoque_item_alimento',
  'importacao_curadoria',
  'vinculo_registro',
  'avaliacao_cientifica',
  'aprovacao_regra_selecao',
  'perfil_composicao',
  'avaliacao_nutricional',
] as const;
export type EntidadeHistorico = (typeof ENTIDADES_HISTORICO)[number];

export const ACOES_HISTORICO = [
  'criacao',
  'alteracao',
  'exclusao',
  'transferencia',
  'saida',
  'encerramento',
  'reabertura',
  'mudanca_area',
  'importacao',
  'conferencia',
  'remocao_animal',
  'cancelamento',
  'conclusao',
  'estorno',
  'renegociacao',
  'definicao_condicao',
  'classificacao_lote',
  'reversao_saida',
  'retorno',
  'reversao_retorno',
  'transcricao',
  'retorno_rascunho',
  'rejeicao',
  'reabertura_rascunho',
  'nova_versao',
  'substituicao',
  'vinculacao',
  'desvinculacao',
  'confirmacao',
  'descarte',
  'atualizacao',
  'avaliacao',
  'retirada',
  'aprovacao',
  'anulacao',
] as const;
export type AcaoHistorico = (typeof ACOES_HISTORICO)[number];

export class ErroTrilha extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroTrilha';
  }
}

export interface RegistroHistorico {
  id: string;
  entidade: EntidadeHistorico;
  entidadeId: string;
  acao: AcaoHistorico;
  dadosAnteriores: Record<string, unknown> | null;
  dadosNovos: Record<string, unknown> | null;
  motivo: string | null;
  ocorridoEm: string;
}

interface Linha {
  id: string;
  entidade: EntidadeHistorico;
  entidade_id: string;
  acao: AcaoHistorico;
  dados_anteriores_json: string | null;
  dados_novos_json: string | null;
  motivo: string | null;
  ocorrido_em: string;
}

/** Trilha de alterações. Só inserção: o banco recusa alterar ou apagar. */
export class RepositorioHistorico {
  constructor(private readonly db: ObterConexao) {}

  registrar(registro: RegistroHistorico): void {
    // Validação em tempo de execução: o tipo protege o código, mas dados vindos de fora do
    // compilador (ou um cast) não podem criar entidade ou ação fora do catálogo.
    if (!(ENTIDADES_HISTORICO as readonly string[]).includes(registro.entidade))
      throw new ErroTrilha(`Entidade de trilha desconhecida: ${String(registro.entidade)}`);
    if (!(ACOES_HISTORICO as readonly string[]).includes(registro.acao))
      throw new ErroTrilha(`Ação de trilha desconhecida: ${String(registro.acao)}`);
    if (registro.entidadeId.trim() === '' || registro.id.trim() === '')
      throw new ErroTrilha('A trilha exige identificadores preenchidos.');
    this.db()
      .prepare(
        `INSERT INTO historico_alteracao
           (id, entidade, entidade_id, acao, dados_anteriores_json, dados_novos_json, motivo, ocorrido_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        registro.id,
        registro.entidade,
        registro.entidadeId,
        registro.acao,
        registro.dadosAnteriores ? JSON.stringify(registro.dadosAnteriores) : null,
        registro.dadosNovos ? JSON.stringify(registro.dadosNovos) : null,
        registro.motivo,
        registro.ocorridoEm,
      );
  }

  listar(entidade: EntidadeHistorico, entidadeIds: readonly string[]): RegistroHistorico[] {
    if (entidadeIds.length === 0) return [];
    const marcadores = entidadeIds.map(() => '?').join(', ');
    const linhas = this.db()
      .prepare(
        `SELECT * FROM historico_alteracao
         WHERE entidade = ? AND entidade_id IN (${marcadores})
         ORDER BY ocorrido_em, id`,
      )
      .all(entidade, ...entidadeIds) as Linha[];
    return linhas.map((l) => ({
      id: l.id,
      entidade: l.entidade,
      entidadeId: l.entidade_id,
      acao: l.acao,
      dadosAnteriores: l.dados_anteriores_json ? JSON.parse(l.dados_anteriores_json) : null,
      dadosNovos: l.dados_novos_json ? JSON.parse(l.dados_novos_json) : null,
      motivo: l.motivo,
      ocorridoEm: l.ocorrido_em,
    }));
  }

  /**
   * Igual a `listar`, mas desempata eventos do mesmo instante pela ordem de inserção (o UUID v7 não
   * é monotônico dentro do mesmo milissegundo). Usado pelo banco de alimentos, em que uma operação
   * grava mais de um evento na mesma transação.
   */
  listarEmOrdem(entidade: EntidadeHistorico, entidadeIds: readonly string[]): RegistroHistorico[] {
    if (entidadeIds.length === 0) return [];
    const marcadores = entidadeIds.map(() => '?').join(', ');
    const linhas = this.db()
      .prepare(
        `SELECT * FROM historico_alteracao
         WHERE entidade = ? AND entidade_id IN (${marcadores})
         ORDER BY ocorrido_em, rowid`,
      )
      .all(entidade, ...entidadeIds) as Linha[];
    return linhas.map((l) => ({
      id: l.id,
      entidade: l.entidade,
      entidadeId: l.entidade_id,
      acao: l.acao,
      dadosAnteriores: l.dados_anteriores_json ? JSON.parse(l.dados_anteriores_json) : null,
      dadosNovos: l.dados_novos_json ? JSON.parse(l.dados_novos_json) : null,
      motivo: l.motivo,
      ocorridoEm: l.ocorrido_em,
    }));
  }
}
