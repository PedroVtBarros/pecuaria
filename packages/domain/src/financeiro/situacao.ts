import type { CondicaoPagamento } from './enumeracoes';

/**
 * Situações derivadas, nunca gravadas. Três valores sempre separados (decisão D-C):
 * valor da operação, saldo a pagar/receber e valor efetivamente pago/recebido. A compensação de
 * uma devolução de animais liquida saldo sem caixa: reduz o "em aberto", mas nunca é "pago".
 */
export type SituacaoParcela = 'aberta' | 'parcial' | 'paga' | 'compensada' | 'atrasada';
export type SituacaoLancamento =
  'pendente_definicao' | 'a_vencer' | 'vencido' | 'parcialmente_pago' | 'quitado' | 'cancelado';

export function saldoDaParcela(
  valorCentavos: number,
  pagoCentavos: number,
  compensadoCentavos = 0,
): number {
  return Math.max(valorCentavos - pagoCentavos - compensadoCentavos, 0);
}

/** Atrasada vale quando ainda há saldo e o vencimento é anterior a hoje (hoje não é atraso). */
export function situacaoDaParcela(entrada: {
  valorCentavos: number;
  pagoCentavos: number;
  compensadoCentavos?: number;
  vencimento: string;
  hoje: string;
}): SituacaoParcela {
  const compensado = entrada.compensadoCentavos ?? 0;
  const saldo = saldoDaParcela(entrada.valorCentavos, entrada.pagoCentavos, compensado);
  if (saldo === 0) return entrada.pagoCentavos === 0 && compensado > 0 ? 'compensada' : 'paga';
  if (entrada.vencimento < entrada.hoje) return 'atrasada';
  return entrada.pagoCentavos + compensado > 0 ? 'parcial' : 'aberta';
}

export interface ParcelaParaResumo {
  valorCentavos: number;
  pagoCentavos: number;
  /** Liquidado por compensação de devolução (sem caixa). */
  compensadoCentavos?: number;
  vencimento: string;
}

export interface ResumoFinanceiro {
  situacao: SituacaoLancamento;
  /** Valor da operação (total do lançamento). */
  valorOperacaoCentavos: number;
  /**
   * A pagar ou a receber. `null` quando a condição de pagamento não foi informada: a ausência
   * de parcelas não significa que não haja obrigação, então o saldo é desconhecido, não zero.
   */
  saldoEmAbertoCentavos: number | null;
  /** Efetivamente pago ou recebido (pagamentos ativos). */
  pagoCentavos: number;
  /** Liquidado por compensação de devolução: não é caixa nem pagamento. */
  compensadoCentavos: number;
  proximoVencimento: string | null;
}

/**
 * Resumo financeiro de um lançamento a partir das parcelas ativas e dos pagamentos já somados.
 * Prioridade da situação: cancelado, pendente de definição, vencido, parcialmente pago,
 * quitado, a vencer.
 */
export function resumirLancamento(entrada: {
  valorOperacaoCentavos: number;
  condicao: CondicaoPagamento;
  cancelado: boolean;
  parcelas: readonly ParcelaParaResumo[];
  hoje: string;
}): ResumoFinanceiro {
  const { valorOperacaoCentavos, condicao, cancelado, parcelas, hoje } = entrada;
  const pago = parcelas.reduce((acc, p) => acc + p.pagoCentavos, 0);
  const compensado = parcelas.reduce((acc, p) => acc + (p.compensadoCentavos ?? 0), 0);
  const saldoDe = (p: ParcelaParaResumo) =>
    saldoDaParcela(p.valorCentavos, p.pagoCentavos, p.compensadoCentavos ?? 0);
  if (condicao === 'nao_informada' && parcelas.length === 0) {
    return {
      situacao: cancelado ? 'cancelado' : 'pendente_definicao',
      valorOperacaoCentavos,
      saldoEmAbertoCentavos: null,
      pagoCentavos: pago,
      compensadoCentavos: compensado,
      proximoVencimento: null,
    };
  }
  const abertas = parcelas.filter((p) => saldoDe(p) > 0);
  const saldo = abertas.reduce((acc, p) => acc + saldoDe(p), 0);
  const proximo = abertas.map((p) => p.vencimento).sort()[0] ?? null;
  let situacao: SituacaoLancamento;
  if (cancelado) situacao = 'cancelado';
  else if (abertas.some((p) => p.vencimento < hoje)) situacao = 'vencido';
  else if (saldo === 0) situacao = 'quitado';
  else if (pago > 0) situacao = 'parcialmente_pago';
  else situacao = 'a_vencer';
  return {
    situacao,
    valorOperacaoCentavos,
    saldoEmAbertoCentavos: saldo,
    pagoCentavos: pago,
    compensadoCentavos: compensado,
    proximoVencimento: proximo,
  };
}
