import { apurarComponentes, type Apuracao, type ComponenteCusto } from './apuracao';

/**
 * Custo de um centro de produção própria (entrega 4F): soma das despesas vinculadas (valor
 * conhecido) e dos consumos de estoque vinculados (custo apropriado, que pode ser desconhecido).
 *
 * - Sem nenhum componente não há o que encerrar: o custo é "não apurado", nunca zero.
 * - Com algum componente desconhecido, a entrada de produção leva custo desconhecido (política do
 *   estoque), e o valor conhecido fica registrado à parte, sem ser tratado como total.
 */
export interface CustoDoCentro {
  apuracao: Apuracao;
  conhecidoCentavos: number;
  /** Componentes (despesas e consumos) com valor conhecido ou desconhecido. */
  componentes: number;
  desconhecidos: number;
  /** Há pelo menos um componente e nenhum é desconhecido. */
  completo: boolean;
  /** Pode-se encerrar: há ao menos um componente. */
  podeEncerrar: boolean;
  /** Custo de entrada da `entrada_producao`: o total quando completo; `null` = desconhecido. */
  custoDaEntradaCentavos: number | null;
}

export function apurarCustoDoCentro(entrada: {
  despesasCentavos: readonly number[];
  consumosCentavos: readonly (number | null)[];
}): CustoDoCentro {
  const componentes: ComponenteCusto[] = [
    ...entrada.despesasCentavos.map((v) => ({ tipo: 'conhecido', valorCentavos: v }) as const),
    ...entrada.consumosCentavos.map((v) =>
      v === null
        ? ({ tipo: 'desconhecido' } as const)
        : ({ tipo: 'conhecido', valorCentavos: v } as const),
    ),
  ];
  const apuracao = apurarComponentes(
    componentes.length === 0 ? [{ tipo: 'nao_apurado' }] : componentes,
  );
  const desconhecidos = apuracao.componentesDesconhecidos;
  const completo = componentes.length > 0 && desconhecidos === 0;
  return {
    apuracao,
    conhecidoCentavos: apuracao.valorConhecidoCentavos,
    componentes: componentes.length,
    desconhecidos,
    completo,
    podeEncerrar: componentes.length > 0,
    custoDaEntradaCentavos: completo ? apuracao.valorConhecidoCentavos : null,
  };
}
