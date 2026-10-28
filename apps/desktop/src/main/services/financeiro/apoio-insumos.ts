import type { AmbienteIpc } from '../../teste/ambiente-ipc';

/**
 * Conferências da compra de insumos (entrega 4D), direto no banco: cada item ativo liga uma
 * entrada de compra ativa com o mesmo valor e quantidade; nota criada pelo sistema tem total igual
 * à soma dos itens; nenhuma entrada está ligada duas vezes; cancelamentos andam juntos.
 */
export function conferirInsumos(amb: AmbienteIpc): string[] {
  const db = amb.gerenciador.conexao;
  const erros: string[] = [];
  const q = <T>(sql: string): T[] => db.prepare(sql).all() as T[];

  for (const i of q<{ id: string; ok: number }>(
    `SELECT li.id,
       (m.deleted_at IS NULL AND m.tipo = 'entrada_compra' AND m.estoque_item_id = li.estoque_item_id
        AND m.quantidade_milesimos = li.quantidade_milesimos AND m.custo_entrada_centavos = li.valor_centavos) AS ok
     FROM lancamento_item li JOIN movimentacao_estoque m ON m.id = li.movimentacao_estoque_id
     WHERE li.deleted_at IS NULL`,
  ))
    if (!i.ok) erros.push(`${i.id}: item ativo não confere com a entrada de estoque`);

  for (const i of q<{ id: string }>(
    `SELECT li.id FROM lancamento_item li JOIN movimentacao_estoque m ON m.id = li.movimentacao_estoque_id
     WHERE li.deleted_at IS NOT NULL AND m.deleted_at IS NULL`,
  ))
    erros.push(`${i.id}: item cancelado com entrada de estoque ainda ativa`);

  for (const l of q<{ id: string; total: number; soma: number }>(
    `SELECT l.id, l.valor_total_centavos AS total,
            (SELECT COALESCE(SUM(li.valor_centavos),0) FROM lancamento_item li WHERE li.lancamento_id = l.id AND li.deleted_at IS NULL) AS soma
     FROM lancamento_financeiro l WHERE l.origem_tipo = 'compra_estoque' AND l.deleted_at IS NULL`,
  ))
    if (l.total !== l.soma)
      erros.push(`${l.id}: total ${l.total} diferente da soma dos itens ${l.soma}`);

  for (const l of q<{ id: string }>(
    `SELECT l.id FROM lancamento_financeiro l
     WHERE l.deleted_at IS NOT NULL AND EXISTS (SELECT 1 FROM lancamento_item li WHERE li.lancamento_id = l.id AND li.deleted_at IS NULL)`,
  ))
    erros.push(`${l.id}: lançamento cancelado com itens ativos`);

  for (const m of q<{ id: string; n: number }>(
    `SELECT movimentacao_estoque_id AS id, COUNT(*) AS n FROM lancamento_item WHERE deleted_at IS NULL
     GROUP BY movimentacao_estoque_id HAVING n > 1`,
  ))
    erros.push(`${m.id}: entrada ligada a mais de um item`);

  // Nenhuma despesa de resultado nasce da compra: o lançamento da nota é de tratamento "estoque".
  for (const l of q<{ id: string }>(
    `SELECT l.id FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id
     WHERE l.origem_tipo = 'compra_estoque' AND c.tratamento <> 'estoque'`,
  ))
    erros.push(`${l.id}: compra de insumos fora do tratamento "estoque"`);
  return erros;
}
