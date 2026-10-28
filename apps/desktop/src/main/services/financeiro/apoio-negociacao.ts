import type { AmbienteIpc } from '../../teste/ambiente-ipc';

/** Conferências das negociações de animais e do custo anterior (entrega 4C), direto no banco. */
export function conferirNegociacoes(amb: AmbienteIpc): string[] {
  const db = amb.gerenciador.conexao;
  const erros: string[] = [];
  const q = <T>(sql: string): T[] => db.prepare(sql).all() as T[];

  // Lançamento com origem só existe se a negociação (ou a devolução) dona dele existe.
  for (const l of q<{ id: string }>(
    `SELECT l.id FROM lancamento_financeiro l WHERE l.origem_tipo NOT IN ('manual','compra_estoque','sanitario')
     AND (l.origem_tipo <> 'negociacao_animal'
       OR (NOT EXISTS (SELECT 1 FROM negociacao_animal n WHERE n.id = l.origem_id AND n.lancamento_id = l.id)
           AND NOT EXISTS (SELECT 1 FROM devolucao_animal d WHERE d.id = l.origem_id AND d.lancamento_id = l.id)))`,
  ))
    erros.push(`${l.id}: lançamento com origem sem o registro dono`);

  for (const n of q<{
    id: string;
    total: number;
    cancelada: number;
    lancamento_cancelado: number;
  }>(
    `SELECT n.id, n.valor_total_centavos AS total, n.deleted_at IS NOT NULL AS cancelada,
            l.deleted_at IS NOT NULL AS lancamento_cancelado
     FROM negociacao_animal n JOIN lancamento_financeiro l ON l.id = n.lancamento_id`,
  )) {
    const itens = db
      .prepare(
        'SELECT COALESCE(SUM(valor_alocado_centavos),0) AS s, COUNT(*) AS n FROM negociacao_animal_item WHERE negociacao_id = ? AND deleted_at IS NULL',
      )
      .get(n.id) as { s: number; n: number };
    if (n.cancelada) {
      if (!n.lancamento_cancelado) erros.push(`${n.id}: negociação cancelada com lançamento ativo`);
      if (itens.n !== 0) erros.push(`${n.id}: negociação cancelada com itens ativos`);
    } else {
      if (n.lancamento_cancelado) erros.push(`${n.id}: negociação ativa com lançamento cancelado`);
      if (itens.s !== n.total)
        erros.push(`${n.id}: soma alocada ${itens.s} diferente do total ${n.total}`);
      if (itens.n === 0) erros.push(`${n.id}: negociação ativa sem animais`);
    }
  }
  for (const i of q<{
    id: string;
    tipo: string;
    status: string;
    origem: string;
    excluido: number;
    devolvido: number;
  }>(
    `SELECT i.id, i.tipo, a.status, a.origem, a.deleted_at IS NOT NULL AS excluido,
            EXISTS (SELECT 1 FROM devolucao_animal_item d WHERE d.negociacao_item_id = i.id AND d.deleted_at IS NULL) AS devolvido
     FROM negociacao_animal_item i JOIN animal a ON a.id = i.animal_id WHERE i.deleted_at IS NULL`,
  )) {
    if (i.excluido) erros.push(`${i.id}: item ativo de animal excluído`);
    // Venda devolvida pelo comprador: o animal voltou (pode até ter sido vendido de novo).
    if (i.tipo === 'venda' && !i.devolvido && i.status !== 'vendido')
      erros.push(`${i.id}: venda ativa com animal ${i.status}`);
    if (i.tipo === 'compra' && i.origem !== 'comprado')
      erros.push(`${i.id}: compra de animal que não é comprado`);
  }
  for (const c of q<{ id: string; valor: number }>(
    'SELECT id, valor_centavos AS valor FROM custo_anterior WHERE deleted_at IS NULL',
  )) {
    const soma = (
      db
        .prepare(
          'SELECT COALESCE(SUM(valor_centavos),0) AS s FROM custo_anterior_item WHERE custo_anterior_id = ?',
        )
        .get(c.id) as { s: number }
    ).s;
    if (soma !== c.valor)
      erros.push(`${c.id}: custo anterior distribuído ${soma} diferente de ${c.valor}`);
  }
  // Animal ativo não tem saída vigente: a última entrada ou saída dele é uma entrada (a de origem
  // ou o retorno de uma devolução). Animal fora do rebanho tem a saída como última.
  for (const a of q<{ id: string; status: string; ultimo: string | null }>(
    `SELECT a.id, a.status,
            (SELECT m.tipo FROM movimentacao_animal m WHERE m.animal_id = a.id AND m.deleted_at IS NULL
               AND m.tipo IN ('entrada','saida') ORDER BY m.data DESC, m.rowid DESC LIMIT 1) AS ultimo
     FROM animal a WHERE a.deleted_at IS NULL`,
  )) {
    if (a.status === 'ativo' && a.ultimo === 'saida')
      erros.push(`${a.id}: animal ativo com saída válida registrada`);
    if (a.status !== 'ativo' && a.ultimo !== 'saida')
      erros.push(`${a.id}: animal fora do rebanho sem saída vigente`);
  }
  return erros;
}
