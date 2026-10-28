/**
 * Devolução de animais (revisão final da Fase 4): plano financeiro, só aritmética em centavos.
 *
 * O valor acordado da devolução primeiro liquida, por compensação (sem caixa), o que ainda está em
 * aberto na negociação original; o restante vira reembolso a pagar (venda devolvida) ou valor a
 * recuperar (compra devolvida). Exemplo do usuário: venda de R$ 3.000,00 com R$ 1.000,00 recebidos
 * e devolução integral de R$ 3.000,00 → compensa R$ 2.000,00 em aberto e reembolsa R$ 1.000,00.
 * Nenhum pagamento é criado aqui: o reembolso só é caixa quando o usuário o registrar.
 */
export interface ParcelaParaCompensar {
  id: string;
  numero: number;
  vencimento: string;
  /** Saldo em aberto da parcela (valor − pago − já compensado). */
  saldoCentavos: number;
}

export interface PlanoDeCompensacao {
  compensacoes: { parcelaId: string; valorCentavos: number }[];
  compensadoCentavos: number;
  restanteCentavos: number;
}

const inteiroPositivo = (v: number, rotulo: string) => {
  if (!Number.isSafeInteger(v) || v <= 0) throw new Error(`${rotulo} inválido.`);
};

/**
 * Compensa até o valor acordado, começando pelas parcelas de vencimento mais tarde (as que ficariam
 * por último a receber ou a pagar). A soma das compensações mais o restante é exatamente o valor.
 */
export function planejarCompensacao(
  valorAcordadoCentavos: number,
  parcelasEmAberto: readonly ParcelaParaCompensar[],
): PlanoDeCompensacao {
  inteiroPositivo(valorAcordadoCentavos, 'Valor da devolução');
  for (const p of parcelasEmAberto)
    if (!Number.isSafeInteger(p.saldoCentavos) || p.saldoCentavos < 0)
      throw new Error('Saldo de parcela inválido.');
  const ordem = [...parcelasEmAberto]
    .filter((p) => p.saldoCentavos > 0)
    .sort((a, b) => b.vencimento.localeCompare(a.vencimento) || b.numero - a.numero);
  let falta = valorAcordadoCentavos;
  const compensacoes: PlanoDeCompensacao['compensacoes'] = [];
  for (const p of ordem) {
    if (falta === 0) break;
    const v = Math.min(falta, p.saldoCentavos);
    compensacoes.push({ parcelaId: p.id, valorCentavos: v });
    falta -= v;
  }
  return {
    compensacoes,
    compensadoCentavos: valorAcordadoCentavos - falta,
    restanteCentavos: falta,
  };
}

/** Conferência dos valores devolvidos contra a alocação original, animal a animal. */
export interface ConferenciaDaDevolucao {
  originalCentavos: number;
  devolvidoCentavos: number;
  /** Original − devolvido: positivo quando se devolve menos do que o valor original do animal. */
  diferencaCentavos: number;
}

export function conferirDevolucao(
  itens: readonly { valorOriginalCentavos: number; valorDevolvidoCentavos: number }[],
): ConferenciaDaDevolucao {
  let original = 0;
  let devolvido = 0;
  for (const i of itens) {
    if (!Number.isSafeInteger(i.valorOriginalCentavos) || i.valorOriginalCentavos < 0)
      throw new Error('Valor original inválido.');
    inteiroPositivo(i.valorDevolvidoCentavos, 'Valor devolvido');
    original += i.valorOriginalCentavos;
    devolvido += i.valorDevolvidoCentavos;
  }
  if (!Number.isSafeInteger(original) || !Number.isSafeInteger(devolvido))
    throw new Error('A soma excede o limite de precisão.');
  return {
    originalCentavos: original,
    devolvidoCentavos: devolvido,
    diferencaCentavos: original - devolvido,
  };
}
