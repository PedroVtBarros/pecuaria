import { apurarComponentes, type Apuracao, type ComponenteCusto } from './apuracao';
import { somarCentavos } from './dinheiro';

/**
 * Custo de aquisição e de formação de um animal (decisões D-F e D-G, entrega 4C). Só reúne o que
 * existe sobre a entrada do animal no rebanho; consumo de estoque, sanidade e rateios entram nas
 * entregas seguintes e somam a este por `somarApuracoes`.
 *
 * Três situações que nunca se confundem:
 * - animal comprado com compra registrada: aquisição conhecida (valor alocado) mais acessórios;
 * - animal nascido na propriedade: aquisição "não aplicável" (não houve compra); o custo de
 *   formação é "não apurado" até o usuário informar um custo anterior;
 * - animal comprado sem compra registrada (cadastro antigo): aquisição "não apurada" até o usuário
 *   informar um custo anterior.
 * Nada é estimado e desconhecido nunca vira zero.
 */
export type SituacaoAquisicao = 'registrada' | 'nao_aplicavel' | 'nao_apurada';
export type SituacaoFormacao = 'informada' | 'nao_apurada' | 'nao_aplicavel';

export interface EntradaCustoAnimal {
  origem: 'nascido' | 'comprado';
  /** Valor alocado da compra registrada no sistema; `null` se não há compra registrada. */
  aquisicaoAlocadaCentavos: number | null;
  /** Custos informados como "anterior ao sistema", já distribuídos a este animal. */
  custosAnterioresCentavos: readonly number[];
  /** Acessórios da aquisição lançados direto ao animal (frete, comissão). */
  acessoriosCentavos: readonly number[];
}

export interface CustoAquisicaoFormacao {
  aquisicao: { situacao: SituacaoAquisicao; valorCentavos: number | null };
  formacao: { situacao: SituacaoFormacao; valorCentavos: number | null };
  acessoriosCentavos: number;
  apuracao: Apuracao;
}

export function apurarAquisicaoEFormacao(e: EntradaCustoAnimal): CustoAquisicaoFormacao {
  const anterior = somarCentavos(e.custosAnterioresCentavos);
  const temAnterior = e.custosAnterioresCentavos.length > 0;
  const acessorios = somarCentavos(e.acessoriosCentavos);
  const componentes: ComponenteCusto[] = [];

  let aquisicao: CustoAquisicaoFormacao['aquisicao'];
  let formacao: CustoAquisicaoFormacao['formacao'];
  if (e.origem === 'comprado' && e.aquisicaoAlocadaCentavos !== null) {
    aquisicao = { situacao: 'registrada', valorCentavos: e.aquisicaoAlocadaCentavos };
    componentes.push({ tipo: 'conhecido', valorCentavos: e.aquisicaoAlocadaCentavos });
    formacao = temAnterior
      ? { situacao: 'informada', valorCentavos: anterior }
      : { situacao: 'nao_aplicavel', valorCentavos: null };
    if (temAnterior) componentes.push({ tipo: 'conhecido', valorCentavos: anterior });
  } else if (e.origem === 'comprado') {
    aquisicao = { situacao: 'nao_apurada', valorCentavos: null };
    formacao = temAnterior
      ? { situacao: 'informada', valorCentavos: anterior }
      : { situacao: 'nao_aplicavel', valorCentavos: null };
    componentes.push(
      temAnterior ? { tipo: 'conhecido', valorCentavos: anterior } : { tipo: 'nao_apurado' },
    );
  } else {
    aquisicao = { situacao: 'nao_aplicavel', valorCentavos: null };
    formacao = temAnterior
      ? { situacao: 'informada', valorCentavos: anterior }
      : { situacao: 'nao_apurada', valorCentavos: null };
    componentes.push(
      temAnterior ? { tipo: 'conhecido', valorCentavos: anterior } : { tipo: 'nao_apurado' },
    );
  }
  for (const a of e.acessoriosCentavos) componentes.push({ tipo: 'conhecido', valorCentavos: a });
  return {
    aquisicao,
    formacao,
    acessoriosCentavos: acessorios,
    apuracao: apurarComponentes(componentes),
  };
}
