import { gerarUuidV7 } from '@pecuaria/domain';
import type {
  CategoriaFinanceira,
  DadosLancamento,
  LancamentoDetalhe,
} from '@pecuaria/shared-types';
import type { AmbienteIpc } from '../../teste/ambiente-ipc';
import { conferirNegociacoes } from './apoio-negociacao';

/** Apoio comum aos testes do módulo financeiro (banco temporário e IPC reais). */
export const HOJE = '2026-10-16';
export const DATA_DO_RELOGIO = new Date(2026, 9, 16, 12);

export async function criarPropriedade(amb: AmbienteIpc, nome: string) {
  return amb.ok('propriedade:criar', {
    dados: {
      nome,
      municipio: null,
      uf: null,
      areaTotalHa: null,
      tipoExploracao: 'misto',
      observacoes: null,
    },
  });
}

export async function categoriaPorNome(
  amb: AmbienteIpc,
  nome: string,
): Promise<CategoriaFinanceira> {
  const todas = await amb.ok('categoriaFinanceira:listar', { incluirInativas: true });
  const c = todas.find((x) => x.nome === nome);
  if (!c) throw new Error(`Categoria não encontrada: ${nome}`);
  return c;
}

export function dadosDeLancamento(
  propriedadeId: string,
  categoriaId: string,
  extra: Partial<DadosLancamento> = {},
): DadosLancamento {
  return {
    propriedadeId,
    categoriaId,
    pessoaId: null,
    dataCompetencia: '2026-10-01',
    valorTotalCentavos: 100000,
    descricao: 'Despesa de teste',
    documentoNumero: null,
    atividade: 'nao_definida',
    destino: { tipo: 'propriedade' },
    quantidade: null,
    comportamentoCusto: null,
    observacoes: null,
    condicao: { tipo: 'a_vista', vencimento: '2026-10-20', pagamento: null },
    ...extra,
  };
}

export async function criarLancamento(
  amb: AmbienteIpc,
  dados: DadosLancamento,
  requisicaoId = gerarUuidV7(),
): Promise<LancamentoDetalhe> {
  return amb.ok('lancamento:criar', { requisicaoId, dados });
}

export function contar(amb: AmbienteIpc, tabela: string, where = '1=1'): number {
  return (
    amb.gerenciador.conexao.prepare(`SELECT COUNT(*) AS n FROM ${tabela} WHERE ${where}`).get() as {
      n: number;
    }
  ).n;
}

const VENCIMENTOS = ['2026-11-10', '2026-12-10', '2027-01-10', '2027-02-10', '2027-03-10'];
/** Parcelas com vencimentos futuros crescentes (um por mês, a partir de 10/11/2026). */
export function parcelasDe(centavos: number[]): { vencimento: string; valorCentavos: number }[] {
  return centavos.map((valorCentavos, i) => ({ vencimento: VENCIMENTOS[i]!, valorCentavos }));
}

/**
 * Conferências de consistência do módulo (a "auditoria" da 4A), sobre o banco inteiro.
 * Devolve as violações encontradas; vazia quando tudo está coerente.
 */
export function conferirInvariantes(amb: AmbienteIpc): string[] {
  const db = amb.gerenciador.conexao;
  const erros: string[] = [];
  const q = <T>(sql: string): T[] => db.prepare(sql).all() as T[];
  for (const l of q<{ id: string; total: number; condicao: string }>(
    'SELECT id, valor_total_centavos AS total, condicao_pagamento AS condicao FROM lancamento_financeiro WHERE deleted_at IS NULL',
  )) {
    const soma = db
      .prepare(
        'SELECT COALESCE(SUM(valor_centavos),0) AS s, COUNT(*) AS n FROM parcela_financeira WHERE lancamento_id = ? AND deleted_at IS NULL',
      )
      .get(l.id) as { s: number; n: number };
    if (l.condicao === 'nao_informada') {
      if (soma.n !== 0) erros.push(`${l.id}: lançamento pendente de definição com parcelas`);
    } else if (soma.s !== l.total) {
      erros.push(`${l.id}: soma das parcelas ${soma.s} diferente do total ${l.total}`);
    }
  }
  for (const p of q<{ id: string; valor: number; pago: number; compensado: number }>(
    `SELECT pf.id, pf.valor_centavos AS valor,
            COALESCE((SELECT SUM(g.valor_centavos) FROM pagamento_financeiro g WHERE g.parcela_id = pf.id AND g.deleted_at IS NULL),0) AS pago,
            COALESCE((SELECT SUM(k.valor_centavos) FROM compensacao_financeira k WHERE (k.parcela_origem_id = pf.id OR k.parcela_devolucao_id = pf.id) AND k.deleted_at IS NULL),0) AS compensado
     FROM parcela_financeira pf WHERE pf.deleted_at IS NULL`,
  ))
    if (p.pago + p.compensado > p.valor)
      erros.push(`${p.id}: pago ${p.pago} + compensado ${p.compensado} acima do valor ${p.valor}`);
  erros.push(...conferirDevolucoes(amb));
  for (const g of q<{ id: string }>(
    `SELECT g.id FROM pagamento_financeiro g
     JOIN parcela_financeira p ON p.id = g.parcela_id
     JOIN lancamento_financeiro l ON l.id = p.lancamento_id
     WHERE g.deleted_at IS NULL AND (l.deleted_at IS NOT NULL OR p.deleted_at IS NOT NULL)`,
  ))
    erros.push(`${g.id}: pagamento ativo em parcela ou lançamento cancelado`);
  for (const g of q<{ id: string }>(`SELECT id FROM pagamento_financeiro WHERE data > '${HOJE}'`))
    erros.push(`${g.id}: pagamento com data futura`);
  erros.push(...conferirNegociacoes(amb));
  for (const t of q<{ entidade: string; acao: string }>(
    'SELECT DISTINCT entidade, acao FROM historico_alteracao',
  ))
    if (!/^[a-z_]+$/.test(t.entidade) || !/^[a-z_]+$/.test(t.acao))
      erros.push(`trilha com formato inválido: ${t.entidade}/${t.acao}`);
  if (db.pragma('integrity_check', { simple: true }) !== 'ok') erros.push('integrity_check falhou');
  if ((db.pragma('foreign_key_check') as unknown[]).length > 0)
    erros.push('foreign_key_check falhou');
  return erros;
}

/**
 * Conferência independente do caixa: compara o que o serviço devolve (fluxo, contas e painel)
 * com somas feitas direto no banco. Vale para qualquer estado: valor da operação = pago + em
 * aberto (fora os lançamentos pendentes de definição, cujo saldo é desconhecido).
 */
export async function conferirCaixa(amb: AmbienteIpc): Promise<string[]> {
  const db = amb.gerenciador.conexao;
  const erros: string[] = [];
  const props = db.prepare('SELECT id FROM propriedade').all() as { id: string }[];
  const soma = (sql: string, ...p: unknown[]): number =>
    Number((db.prepare(sql).get(...p) as { s: number | null }).s ?? 0);
  for (const { id } of props) {
    for (const natureza of ['receita', 'despesa'] as const) {
      const base = `FROM lancamento_financeiro l WHERE l.propriedade_id = ? AND l.deleted_at IS NULL AND l.natureza = ?`;
      const total = soma(
        `SELECT SUM(l.valor_total_centavos) AS s ${base} AND l.condicao_pagamento <> 'nao_informada'`,
        id,
        natureza,
      );
      const pago = soma(
        `SELECT SUM(g.valor_centavos) AS s FROM pagamento_financeiro g
         JOIN parcela_financeira pf ON pf.id = g.parcela_id
         JOIN lancamento_financeiro l ON l.id = pf.lancamento_id
         WHERE g.deleted_at IS NULL AND l.propriedade_id = ? AND l.deleted_at IS NULL AND l.natureza = ?`,
        id,
        natureza,
      );
      const compensadoSql = `(SELECT COALESCE(SUM(k.valor_centavos), 0) FROM compensacao_financeira k
         WHERE (k.parcela_origem_id = pf.id OR k.parcela_devolucao_id = pf.id) AND k.deleted_at IS NULL)`;
      const compensado = soma(
        `SELECT SUM(${compensadoSql}) AS s
         FROM parcela_financeira pf JOIN lancamento_financeiro l ON l.id = pf.lancamento_id
         WHERE pf.deleted_at IS NULL AND l.propriedade_id = ? AND l.deleted_at IS NULL AND l.natureza = ?`,
        id,
        natureza,
      );
      const aberto = soma(
        `SELECT SUM(pf.valor_centavos - COALESCE((SELECT SUM(g.valor_centavos) FROM pagamento_financeiro g WHERE g.parcela_id = pf.id AND g.deleted_at IS NULL), 0) - ${compensadoSql}) AS s
         FROM parcela_financeira pf JOIN lancamento_financeiro l ON l.id = pf.lancamento_id
         WHERE pf.deleted_at IS NULL AND l.propriedade_id = ? AND l.deleted_at IS NULL AND l.natureza = ?`,
        id,
        natureza,
      );
      if (total !== pago + compensado + aberto)
        erros.push(
          `${natureza}: valor da operação ${total} diferente de pago ${pago} + compensado ${compensado} + aberto ${aberto}`,
        );
      const pendente = soma(
        `SELECT SUM(l.valor_total_centavos) AS s ${base} AND l.condicao_pagamento = 'nao_informada'`,
        id,
        natureza,
      );

      const fluxo = await amb.ok('fluxo:obter', {
        propriedadeId: id,
        dataInicial: '2026-01-01',
        dataFinal: '2028-12-31',
        granularidade: 'mes',
        natureza,
      });
      const realizado =
        natureza === 'receita' ? fluxo.realizado.entradasCentavos : fluxo.realizado.saidasCentavos;
      const previsto =
        natureza === 'receita' ? fluxo.previsto.aReceberCentavos : fluxo.previsto.aPagarCentavos;
      if (realizado !== pago)
        erros.push(`${natureza}: fluxo realizado ${realizado} diferente de ${pago}`);
      if (previsto !== aberto)
        erros.push(`${natureza}: fluxo previsto ${previsto} diferente de ${aberto}`);
      const pendenteFluxo =
        natureza === 'receita'
          ? fluxo.pendentesDeDefinicao.valorOperacaoReceitaCentavos
          : fluxo.pendentesDeDefinicao.valorOperacaoDespesaCentavos;
      if (pendenteFluxo !== pendente)
        erros.push(`${natureza}: pendente de definição ${pendenteFluxo} diferente de ${pendente}`);

      const contas = await amb.ok('conta:listar', {
        propriedadeId: id,
        natureza,
        pagina: 1,
        tamanhoPagina: 200,
      });
      if (contas.resumo.saldoTotalCentavos !== aberto)
        erros.push(
          `${natureza}: contas ${contas.resumo.saldoTotalCentavos} diferente de ${aberto}`,
        );
      if (contas.resumo.emAtrasoCentavos + contas.resumo.aVencerCentavos !== aberto)
        erros.push(`${natureza}: atrasado + a vencer diferente do saldo em aberto`);
      const painel = await amb.ok('painel:obter', {
        propriedadeId: id,
        dataInicial: '2026-01-01',
        dataFinal: '2026-12-31',
      });
      const doPainel = natureza === 'receita' ? painel.contas.aReceber : painel.contas.aPagar;
      if (doPainel.saldoTotalCentavos !== aberto)
        erros.push(`${natureza}: painel ${doPainel.saldoTotalCentavos} diferente de ${aberto}`);
    }
  }
  return erros;
}

/**
 * Conferência das devoluções de animais (revisão final da Fase 4), direto no banco:
 * - devolução ativa ⇔ lançamento de devolução ativo; valor = soma dos itens = valor do lançamento;
 * - compensação ativa só entre parcelas ativas da negociação original e da devolução, e a parte
 *   compensada da devolução é exatamente a parcela 1 dela (sem caixa: nenhum pagamento nela);
 * - cada item da negociação devolvido no máximo uma vez;
 * - venda devolvida: o animal tem a entrada de retorno ativa;
 * - compra devolvida: a saída da devolução está ativa.
 */
export function conferirDevolucoes(amb: AmbienteIpc): string[] {
  const db = amb.gerenciador.conexao;
  const erros: string[] = [];
  const q = <T>(sql: string, ...p: unknown[]): T[] => db.prepare(sql).all(...p) as T[];
  for (const d of q<{
    id: string;
    ativa: number;
    lanc_ativo: number;
    valor: number;
    itens: number;
    lanc_valor: number;
    tipo: string;
  }>(
    `SELECT d.id, d.deleted_at IS NULL AS ativa, l.deleted_at IS NULL AS lanc_ativo, d.valor_total_centavos AS valor,
            l.valor_total_centavos AS lanc_valor, d.tipo,
            COALESCE((SELECT SUM(i.valor_centavos) FROM devolucao_animal_item i WHERE i.devolucao_id = d.id AND (i.deleted_at IS NULL) = (d.deleted_at IS NULL)),0) AS itens
     FROM devolucao_animal d JOIN lancamento_financeiro l ON l.id = d.lancamento_id`,
  )) {
    if (d.ativa !== d.lanc_ativo)
      erros.push(`${d.id}: devolução e lançamento em situações diferentes`);
    if (d.valor !== d.itens || d.valor !== d.lanc_valor)
      erros.push(`${d.id}: valor ${d.valor} ≠ itens ${d.itens} ou lançamento ${d.lanc_valor}`);
    if (!d.ativa) continue;
    const comp = q<{ s: number }>(
      'SELECT COALESCE(SUM(valor_centavos),0) AS s FROM compensacao_financeira WHERE devolucao_id = ? AND deleted_at IS NULL',
      d.id,
    )[0]!.s;
    if (comp > 0) {
      const p1 = q<{ valor: number; pagos: number }>(
        `SELECT pf.valor_centavos AS valor,
                (SELECT COUNT(*) FROM pagamento_financeiro g WHERE g.parcela_id = pf.id AND g.deleted_at IS NULL) AS pagos
         FROM parcela_financeira pf JOIN devolucao_animal d ON d.lancamento_id = pf.lancamento_id
         WHERE d.id = ? AND pf.numero = 1 AND pf.deleted_at IS NULL`,
        d.id,
      )[0];
      if (!p1 || p1.valor !== comp) erros.push(`${d.id}: parte compensada ${comp} ≠ parcela 1`);
      if (p1 && p1.pagos > 0) erros.push(`${d.id}: parcela compensada com pagamento`);
    }
    for (const i of q<{ id: string; animal_id: string; mov_ativa: number; mov_tipo: string }>(
      `SELECT i.id, i.animal_id, m.deleted_at IS NULL AS mov_ativa, m.tipo AS mov_tipo
       FROM devolucao_animal_item i JOIN movimentacao_animal m ON m.id = i.movimentacao_animal_id
       WHERE i.devolucao_id = ? AND i.deleted_at IS NULL`,
      d.id,
    )) {
      if (!i.mov_ativa) erros.push(`${i.id}: movimentação da devolução cancelada`);
      if (i.mov_tipo !== (d.tipo === 'venda' ? 'entrada' : 'saida'))
        erros.push(`${i.id}: movimentação da devolução de tipo errado`);
    }
  }
  for (const k of q<{ id: string }>(
    `SELECT k.id FROM compensacao_financeira k
     JOIN devolucao_animal d ON d.id = k.devolucao_id
     JOIN negociacao_animal n ON n.id = d.negociacao_id
     JOIN parcela_financeira po ON po.id = k.parcela_origem_id
     JOIN parcela_financeira pd ON pd.id = k.parcela_devolucao_id
     WHERE k.deleted_at IS NULL AND (d.deleted_at IS NOT NULL OR po.deleted_at IS NOT NULL OR pd.deleted_at IS NOT NULL
       OR po.lancamento_id <> n.lancamento_id OR pd.lancamento_id <> d.lancamento_id)`,
  ))
    erros.push(`${k.id}: compensação ativa fora da regra`);
  for (const r of q<{ item: string; n: number }>(
    `SELECT negociacao_item_id AS item, COUNT(*) AS n FROM devolucao_animal_item
     WHERE deleted_at IS NULL GROUP BY negociacao_item_id HAVING n > 1`,
  ))
    erros.push(`${r.item}: animal devolvido mais de uma vez pela mesma negociação`);
  return erros;
}
