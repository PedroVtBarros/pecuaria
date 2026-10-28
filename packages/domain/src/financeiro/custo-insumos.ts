import { apurarComponentes, type Apuracao } from './apuracao';
import { somarCentavos } from './dinheiro';
import { dividirIgual, dividirProporcional } from './proporcional';

/**
 * Regras puras da entrega 4D: rateio de frete numa compra de insumos, apuração de custos de
 * consumo (nunca zero para o que é desconhecido) e precedência do custo sanitário (um fato, um
 * dono: o mesmo custo nunca é contado duas vezes).
 */

export interface ItemParaFrete {
  id: string;
  /** Valor do item sem o frete, em centavos. */
  valorCentavos: number;
}

/**
 * Distribui o frete entre os itens em proporção ao valor de cada um (maior resto). Devolve o valor
 * final de cada item (valor + parte do frete) ou os erros. Item sem valor impede o rateio por
 * valor: o sistema não inventa outro critério.
 */
export function ratearFretePorValor(
  itens: readonly ItemParaFrete[],
  freteCentavos: number,
): { valores: Map<string, number>; erros: string[] } {
  const valores = new Map<string, number>();
  if (freteCentavos === 0) {
    for (const i of itens) valores.set(i.id, i.valorCentavos);
    return { valores, erros: [] };
  }
  if (itens.length === 0) return { valores, erros: ['Informe ao menos um item.'] };
  if (itens.some((i) => i.valorCentavos <= 0))
    return {
      valores,
      erros: [
        'Para ratear o frete por valor, todos os itens precisam ter valor maior que zero. Lance o frete separado ou informe o valor dos itens.',
      ],
    };
  const partes = dividirProporcional(
    freteCentavos,
    itens.map((i) => ({ id: i.id, peso: i.valorCentavos })),
  );
  const parte = new Map(partes.map((p) => [p.id, p.valorCentavos]));
  for (const i of itens) valores.set(i.id, i.valorCentavos + (parte.get(i.id) ?? 0));
  return { valores, erros: [] };
}

/** Apuração a partir de contagens agregadas (para somar milhares de consumos sem listá-los). */
export function apuracaoDeContagens(entrada: {
  conhecidoCentavos: number;
  conhecidos: number;
  desconhecidos: number;
}): Apuracao {
  const { conhecidoCentavos, conhecidos, desconhecidos } = entrada;
  if (conhecidos < 0 || desconhecidos < 0) throw new Error('Contagem inválida.');
  if (conhecidos === 0 && conhecidoCentavos !== 0)
    throw new Error('Há valor conhecido sem consumos conhecidos.');
  // Um componente "conhecido" representa a soma; o que importa é valor e contagens.
  const componentes = [
    ...(conhecidos > 0 ? [{ tipo: 'conhecido' as const, valorCentavos: conhecidoCentavos }] : []),
    ...Array.from({ length: desconhecidos }, () => ({ tipo: 'desconhecido' as const })),
  ];
  const a = apurarComponentes(componentes);
  return { ...a, componentesConhecidos: conhecidos };
}

export interface EntradaCustoSanitario {
  /** Custo apropriado de cada baixa de estoque do registro; `null` = valoração desconhecida. */
  consumosEstoque: readonly (number | null)[];
  /** Despesas de serviço lançadas e vinculadas ao registro (consulta, exame). */
  servicos: readonly number[];
  /** Custo total digitado no registro sanitário (campo antigo); estimativa informada. */
  informadoCentavos: number | null;
}

export interface CustoSanitario {
  apuracao: Apuracao;
  estoque: { quantidade: number; conhecidoCentavos: number; desconhecidos: number };
  servicosCentavos: number;
  /** O valor informado conta só quando não há componente de estoque nem de serviço. */
  informadoContado: boolean;
  /** Valor informado que ficou de fora para não contar o mesmo custo duas vezes. */
  informadoNaoContadoCentavos: number | null;
}

/**
 * Custo de um registro sanitário por componentes, cada um com uma única fonte (plano, 5.6):
 * baixas de estoque, serviços lançados e, só se não houver nenhum dos dois, o valor informado no
 * registro. Sem nenhum componente, o custo é "não apurado": nunca zero.
 */
export function apurarCustoSanitario(e: EntradaCustoSanitario): CustoSanitario {
  const temEstoque = e.consumosEstoque.length > 0;
  const temServicos = e.servicos.length > 0;
  const informadoContado = !temEstoque && !temServicos && e.informadoCentavos !== null;
  const componentes = [
    ...e.consumosEstoque.map((c) =>
      c === null
        ? ({ tipo: 'desconhecido' } as const)
        : ({ tipo: 'conhecido', valorCentavos: c } as const),
    ),
    ...e.servicos.map((s) => ({ tipo: 'conhecido', valorCentavos: s }) as const),
    ...(informadoContado
      ? [{ tipo: 'conhecido', valorCentavos: e.informadoCentavos as number } as const]
      : []),
  ];
  if (componentes.length === 0) componentes.push({ tipo: 'nao_apurado' } as never);
  const conhecidos = e.consumosEstoque.filter((c): c is number => c !== null);
  return {
    apuracao: apurarComponentes(componentes),
    estoque: {
      quantidade: e.consumosEstoque.length,
      conhecidoCentavos: somarCentavos(conhecidos),
      desconhecidos: e.consumosEstoque.length - conhecidos.length,
    },
    servicosCentavos: somarCentavos(e.servicos),
    informadoContado,
    informadoNaoContadoCentavos:
      !informadoContado && (temEstoque || temServicos) ? e.informadoCentavos : null,
  };
}

/**
 * Parte de cada animal no custo do registro: divisão igual do valor conhecido entre os animais
 * tratados (sem peso de dose nem critério científico). Em estado parcial é uma parte mínima.
 */
export function ratearCustoEntreAnimais(
  valorConhecidoCentavos: number,
  animalIds: readonly string[],
): { animalId: string; valorCentavos: number }[] {
  if (animalIds.length === 0) return [];
  return dividirIgual(valorConhecidoCentavos, animalIds).map((p) => ({
    animalId: p.id,
    valorCentavos: p.valorCentavos,
  }));
}
