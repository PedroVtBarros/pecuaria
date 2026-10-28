import type { AmbienteIpc } from '../../teste/ambiente-ipc';
import { somaDeOrigemNoBanco } from './apoio-rateio';

/**
 * Conferência independente do resultado (entrega 4G), para todo o histórico até hoje:
 * - custo do resultado = soma de origem (SQL) − o que ainda é ativo dos animais no rebanho
 *   (aquisição, custo anterior e acessórios lançados a eles);
 * - receita = soma das receitas de resultado (SQL);
 * - caixa da conciliação = caixa realizado do fluxo da 4B (outro caminho de código);
 * - a conciliação fecha: competência = resultado, caixa = saldo, Σ diferenças = diferença total.
 */
export async function conferirResultado(
  amb: AmbienteIpc,
  propriedadeId: string,
  hoje: string,
): Promise<string[]> {
  const erros: string[] = [];
  const db = amb.gerenciador.conexao;
  const n = (sql: string): number =>
    Number((db.prepare(sql).get(propriedadeId) as { v: number | null }).v ?? 0);
  const P = { propriedadeId, dataInicial: '2000-01-01', dataFinal: hoje };
  const r = await amb.ok('resultado:periodo', P);
  const ativo =
    n(`SELECT SUM(i.valor_alocado_centavos) AS v FROM negociacao_animal_item i
       JOIN negociacao_animal ng ON ng.id = i.negociacao_id JOIN animal a ON a.id = i.animal_id
       WHERE ng.propriedade_id = ? AND i.tipo = 'compra' AND i.deleted_at IS NULL AND ng.deleted_at IS NULL AND a.status = 'ativo'`) +
    n(`SELECT SUM(i.valor_centavos) AS v FROM custo_anterior_item i JOIN custo_anterior c ON c.id = i.custo_anterior_id
       JOIN animal a ON a.id = i.animal_id WHERE c.propriedade_id = ? AND c.deleted_at IS NULL AND a.status = 'ativo'`) +
    n(`SELECT SUM(l.valor_total_centavos) AS v FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id
       JOIN animal a ON a.id = l.animal_id WHERE l.propriedade_id = ? AND l.deleted_at IS NULL AND l.natureza = 'despesa'
       AND c.tratamento = 'ativo_animal' AND l.destino_tipo = 'animal' AND l.origem_tipo = 'manual' AND a.status = 'ativo'`);
  // Custo líquido: o estorno da baixa (animais devolvidos pelo comprador) volta a ser ativo.
  const custoEsperado = somaDeOrigemNoBanco(amb, propriedadeId) - ativo;
  const custoLiquido =
    r.competencia.custo.valorConhecidoCentavos - r.competencia.estornoDeBaixaCentavos;
  if (custoLiquido !== custoEsperado)
    erros.push(`custo do resultado ${custoLiquido} diferente do SQL ${custoEsperado}`);
  // Receita líquida: receitas de resultado (inclusive o recuperado em devolução de compra) menos
  // as devoluções de venda.
  const receita =
    n(
      `SELECT SUM(l.valor_total_centavos) AS v FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id
       WHERE l.propriedade_id = ? AND l.deleted_at IS NULL AND l.natureza = 'receita' AND c.tratamento = 'resultado'`,
    ) -
    n(
      `SELECT SUM(l.valor_total_centavos) AS v FROM lancamento_financeiro l
       WHERE l.propriedade_id = ? AND l.deleted_at IS NULL AND l.natureza = 'despesa' AND l.tipo = 'devolucao'`,
    );
  if (r.competencia.receitas.totalCentavos !== receita)
    erros.push(`receita ${r.competencia.receitas.totalCentavos} diferente do SQL ${receita}`);
  const fluxo = await amb.ok('fluxo:obter', P);
  if (fluxo.realizado.saldoCentavos !== r.caixa.saldoCentavos)
    erros.push(
      `caixa ${r.caixa.saldoCentavos} diferente do fluxo realizado ${fluxo.realizado.saldoCentavos}`,
    );
  // Receitas desconhecidas: saídas de venda ou descarte sem venda negociada nem devolução ao
  // fornecedor ligadas à própria movimentação (SQL).
  const semReceita = n(
    `SELECT COUNT(*) AS v FROM movimentacao_animal m JOIN animal a ON a.id = m.animal_id
     WHERE a.propriedade_id = ? AND m.tipo = 'saida' AND m.deleted_at IS NULL AND a.deleted_at IS NULL
       AND a.status IN ('vendido','descartado')
       AND NOT EXISTS (SELECT 1 FROM negociacao_animal_item i
                       WHERE i.movimentacao_animal_id = m.id AND i.tipo = 'venda' AND i.deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM devolucao_animal_item d
                       WHERE d.movimentacao_animal_id = m.id AND d.deleted_at IS NULL)`,
  );
  if (r.competencia.receitasDesconhecidas !== semReceita)
    erros.push(
      `receitas desconhecidas ${r.competencia.receitasDesconhecidas} diferente do SQL ${semReceita}`,
    );
  // Nunca há valor quando não apurado; o valor conhecido é receita − custo conhecidos.
  if ((r.competencia.estado === 'nao_apurado') !== (r.competencia.resultadoCentavos === null))
    erros.push('resultado não apurado com valor, ou com valor sem estar apurado');
  if (r.competencia.valorConhecidoCentavos !== receita - custoLiquido)
    erros.push('valor conhecido diferente de receita − custo conhecidos');
  const c = await amb.ok('resultado:conciliacao', P);
  if (c.totais.resultadoCompetenciaCentavos !== r.competencia.valorConhecidoCentavos)
    erros.push('conciliação: competência diferente do resultado');
  if (
    c.competencia.estado !== r.competencia.estado ||
    c.competencia.limite !== r.competencia.limite ||
    c.competencia.receitasDesconhecidas !== r.competencia.receitasDesconhecidas
  )
    erros.push('conciliação: completude diferente da do resultado');
  if (c.totais.caixaLiquidoCentavos !== r.caixa.saldoCentavos)
    erros.push('conciliação: caixa diferente do saldo');
  if (c.linhas.reduce((s, l) => s + l.diferencaCentavos, 0) !== c.totais.diferencaCentavos)
    erros.push('conciliação: soma das diferenças não fecha');
  return erros;
}
