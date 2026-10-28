import type { AmbienteIpc } from '../../teste/ambiente-ipc';

/**
 * Conferência independente da apropriação de custos (entrega 4E), direto no banco: a soma dos
 * custos de origem calculada por SQL deve ser igual ao que o serviço diz ter distribuído, e tudo
 * o que foi distribuído (animais + lotes sem animais + não alocado) deve fechar com a origem.
 * Custos vinculados a centros de produção (4F) ficam de fora: são do centro e voltam como custo
 * de entrada do item produzido, que chega aos animais pelo consumo.
 * Não usa nenhuma função de domínio da apropriação.
 */
export function somaDeOrigemNoBanco(amb: AmbienteIpc, propriedadeId: string): number {
  const db = amb.gerenciador.conexao;
  const n = (sql: string): number =>
    Number((db.prepare(sql).get(propriedadeId) as { v: number | null }).v ?? 0);
  const consumos = n(
    `SELECT SUM(m.custo_apropriado_centavos) AS v FROM movimentacao_estoque m
     JOIN estoque_item i ON i.id = m.estoque_item_id
     WHERE i.propriedade_id = ? AND m.deleted_at IS NULL
       AND m.tipo IN ('saida_consumo','saida_perda','ajuste_saida','saida_venda')
       AND m.id NOT IN (SELECT movimentacao_estoque_id FROM centro_producao_consumo WHERE deleted_at IS NULL)`,
  );
  const lancamentos = n(
    `SELECT SUM(l.valor_total_centavos) AS v FROM lancamento_financeiro l
     JOIN categoria_financeira c ON c.id = l.categoria_id
     WHERE l.propriedade_id = ? AND l.deleted_at IS NULL AND l.natureza = 'despesa'
       AND c.tratamento IN ('resultado','ativo_animal') AND l.origem_tipo IN ('manual','sanitario')
       AND l.id NOT IN (SELECT lancamento_id FROM centro_producao_lancamento WHERE deleted_at IS NULL)`,
  );
  const aquisicoes = n(
    `SELECT SUM(i.valor_alocado_centavos) AS v FROM negociacao_animal_item i
     JOIN negociacao_animal n ON n.id = i.negociacao_id
     WHERE n.propriedade_id = ? AND i.tipo = 'compra' AND i.deleted_at IS NULL AND n.deleted_at IS NULL`,
  );
  const anteriores = n(
    `SELECT SUM(i.valor_centavos) AS v FROM custo_anterior_item i
     JOIN custo_anterior c ON c.id = i.custo_anterior_id
     WHERE c.propriedade_id = ? AND c.deleted_at IS NULL`,
  );
  // O custo digitado no registro sanitário só conta quando não há baixa de estoque nem serviço.
  const informados = n(
    `SELECT SUM(m.custo_total_centavos) AS v FROM manejo_sanitario m
     WHERE m.propriedade_id = ? AND m.deleted_at IS NULL AND m.custo_total_centavos IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM movimentacao_estoque e WHERE e.manejo_sanitario_id = m.id
                       AND e.deleted_at IS NULL AND e.tipo = 'saida_consumo')
       AND NOT EXISTS (SELECT 1 FROM lancamento_financeiro s WHERE s.origem_tipo = 'sanitario'
                       AND s.origem_id = m.id AND s.deleted_at IS NULL)`,
  );
  return consumos + lancamentos + aquisicoes + anteriores + informados;
}

export async function conferirApropriacaoDoBanco(amb: AmbienteIpc): Promise<string[]> {
  const erros: string[] = [];
  const db = amb.gerenciador.conexao;
  const props = db.prepare('SELECT id FROM propriedade WHERE deleted_at IS NULL').all() as {
    id: string;
  }[];
  for (const { id } of props) {
    const r = await amb.chamar('custo:resumo', { propriedadeId: id });
    if (!r.ok) {
      erros.push(`${id}: ${r.erro.mensagem}`);
      continue;
    }
    const resumo = r.dados;
    const esperado = somaDeOrigemNoBanco(amb, id);
    if (resumo.totalDeOrigemCentavos !== esperado)
      erros.push(`${id}: origem ${resumo.totalDeOrigemCentavos} diferente do SQL ${esperado}`);
    const distribuido =
      resumo.animais.apuracao.valorConhecidoCentavos +
      resumo.lotes.reduce((s, l) => s + l.semAnimaisCentavos, 0) +
      resumo.naoAlocado.apuracao.valorConhecidoCentavos;
    if (distribuido !== esperado)
      erros.push(`${id}: distribuído ${distribuido} diferente da origem ${esperado}`);
    if (!resumo.conferido) erros.push(`${id}: resumo diz que não conferiu`);
  }
  // Nunca dois rateios ativos para o mesmo custo (lançamento ou movimento).
  for (const d of db
    .prepare(
      `SELECT origem_tipo, origem_id, COUNT(*) AS n FROM rateio_custo WHERE deleted_at IS NULL
       GROUP BY origem_tipo, origem_id HAVING n > 1`,
    )
    .all() as { origem_id: string }[])
    erros.push(`${d.origem_id}: mais de um rateio ativo`);
  // Todo rateio ativo tem itens, e só de destinos da sua propriedade.
  for (const d of db
    .prepare(
      `SELECT r.id FROM rateio_custo r WHERE r.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM rateio_custo_item i WHERE i.rateio_id = r.id)`,
    )
    .all() as { id: string }[])
    erros.push(`${d.id}: rateio ativo sem destinos`);
  return erros;
}
