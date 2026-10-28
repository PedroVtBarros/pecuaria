import type { AmbienteIpc } from '../../teste/ambiente-ipc';

/**
 * Conferências da produção própria (entrega 4F), direto no banco e sem usar o domínio:
 * - centro encerrado tem a entrada de produção ativa, do item produzido, com a quantidade colhida
 *   e custo de entrada igual à soma das despesas e consumos vinculados (ou desconhecido, se algum
 *   consumo vinculado tem custo desconhecido);
 * - centro aberto não tem entrada;
 * - nenhum custo vinculado a centro está também em rateio ativo;
 * - nenhum vínculo ativo aponta para lançamento ou movimento cancelado.
 */
export function conferirProducao(amb: AmbienteIpc): string[] {
  const db = amb.gerenciador.conexao;
  const erros: string[] = [];
  const q = <T>(sql: string): T[] => db.prepare(sql).all() as T[];

  for (const c of q<{
    id: string;
    status: string;
    mov: string | null;
    item: string;
    qtd: number | null;
    total: number | null;
    conhecido: number | null;
    desconhecidos: number | null;
  }>(
    `SELECT id, status, movimentacao_estoque_id AS mov, estoque_item_id AS item, quantidade_produzida_milesimos AS qtd,
            custo_total_centavos AS total, custo_conhecido_centavos AS conhecido, componentes_desconhecidos AS desconhecidos
     FROM centro_producao WHERE deleted_at IS NULL`,
  )) {
    const despesas = db
      .prepare(
        `SELECT COALESCE(SUM(l.valor_total_centavos),0) AS v FROM centro_producao_lancamento x
         JOIN lancamento_financeiro l ON l.id = x.lancamento_id
         WHERE x.centro_id = ? AND x.deleted_at IS NULL AND l.deleted_at IS NULL`,
      )
      .get(c.id) as { v: number };
    const consumos = db
      .prepare(
        `SELECT COALESCE(SUM(m.custo_apropriado_centavos),0) AS v, SUM(m.custo_apropriado_centavos IS NULL) AS nulos
         FROM centro_producao_consumo x JOIN movimentacao_estoque m ON m.id = x.movimentacao_estoque_id
         WHERE x.centro_id = ? AND x.deleted_at IS NULL AND m.deleted_at IS NULL`,
      )
      .get(c.id) as { v: number; nulos: number | null };
    const soma = despesas.v + consumos.v;
    const nulos = consumos.nulos ?? 0;
    if (c.status === 'aberto') {
      if (c.mov !== null) erros.push(`${c.id}: centro aberto com entrada`);
      continue;
    }
    const e = db
      .prepare(
        'SELECT tipo, estoque_item_id AS item, quantidade_milesimos AS qtd, custo_entrada_centavos AS custo, deleted_at, documento_origem_id AS doc FROM movimentacao_estoque WHERE id = ?',
      )
      .get(c.mov) as
      | {
          tipo: string;
          item: string;
          qtd: number;
          custo: number | null;
          deleted_at: string | null;
          doc: string;
        }
      | undefined;
    if (
      !e ||
      e.deleted_at !== null ||
      e.tipo !== 'entrada_producao' ||
      e.item !== c.item ||
      e.doc !== c.id
    )
      erros.push(`${c.id}: centro encerrado sem entrada de produção ativa correspondente`);
    else if (e.qtd !== c.qtd) erros.push(`${c.id}: quantidade da entrada difere da colhida`);
    if (c.conhecido !== soma)
      erros.push(`${c.id}: custo conhecido ${c.conhecido} diferente da soma ${soma}`);
    if (c.desconhecidos !== nulos)
      erros.push(`${c.id}: desconhecidos ${c.desconhecidos} diferente de ${nulos}`);
    const esperado = nulos > 0 ? null : soma;
    if (c.total !== esperado || (e && e.custo !== esperado))
      erros.push(
        `${c.id}: custo de entrada ${e?.custo} / ${c.total} diferente do esperado ${esperado}`,
      );
  }

  for (const d of q<{ id: string }>(
    `SELECT x.lancamento_id AS id FROM centro_producao_lancamento x
     JOIN rateio_custo r ON r.origem_tipo = 'lancamento' AND r.origem_id = x.lancamento_id AND r.deleted_at IS NULL
     WHERE x.deleted_at IS NULL
     UNION ALL
     SELECT x.movimentacao_estoque_id FROM centro_producao_consumo x
     JOIN rateio_custo r ON r.origem_tipo = 'movimentacao_estoque' AND r.origem_id = x.movimentacao_estoque_id AND r.deleted_at IS NULL
     WHERE x.deleted_at IS NULL`,
  ))
    erros.push(`${d.id}: custo em centro de produção e em rateio ao mesmo tempo`);

  for (const d of q<{ id: string }>(
    `SELECT x.id FROM centro_producao_lancamento x JOIN lancamento_financeiro l ON l.id = x.lancamento_id
     WHERE x.deleted_at IS NULL AND l.deleted_at IS NOT NULL
     UNION ALL
     SELECT x.id FROM centro_producao_consumo x JOIN movimentacao_estoque m ON m.id = x.movimentacao_estoque_id
     WHERE x.deleted_at IS NULL AND m.deleted_at IS NOT NULL`,
  ))
    erros.push(`${d.id}: vínculo ativo para custo cancelado`);
  return erros;
}
