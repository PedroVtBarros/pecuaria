/** Unidades físicas do estoque. Não há conversão implícita, composição ou prescrição. */
export const UNIDADES_ESTOQUE = ['kg', 'g', 't', 'l', 'ml', 'dose', 'un', 'ui'] as const;
export type UnidadeEstoque = (typeof UNIDADES_ESTOQUE)[number];
export const TIPOS_ITEM_ESTOQUE = [
  'racao',
  'silagem',
  'volumoso',
  'suplemento',
  'mineral',
  'medicamento',
  'vacina',
  'semen',
  'outro',
] as const;
export type TipoItemEstoque = (typeof TIPOS_ITEM_ESTOQUE)[number];
export const TIPOS_MOVIMENTO_ESTOQUE = [
  'entrada_compra',
  'entrada_producao',
  'entrada_inicial',
  'saida_consumo',
  'saida_perda',
  'saida_venda',
  'ajuste_entrada',
  'ajuste_saida',
] as const;
export type TipoMovimentoEstoque = (typeof TIPOS_MOVIMENTO_ESTOQUE)[number];
export type DestinoEstoque = 'propriedade' | 'lote' | 'animal';
export function sentidoEstoque(tipo: TipoMovimentoEstoque): 'entrada' | 'saida' {
  return tipo.startsWith('entrada_') || tipo === 'ajuste_entrada' ? 'entrada' : 'saida';
}
export function quantidadeEmMilesimos(quantidade: number, unidade?: UnidadeEstoque): number {
  if (
    !Number.isFinite(quantidade) ||
    quantidade <= 0 ||
    quantidade > 1_000_000_000 ||
    quantidade !== Number(quantidade.toFixed(3))
  ) {
    throw new Error('Informe quantidade positiva com no máximo três casas decimais.');
  }
  if ((unidade === 'un' || unidade === 'ui') && !Number.isInteger(quantidade)) {
    throw new Error('Esta unidade exige quantidade inteira.');
  }
  return Math.round(quantidade * 1000);
}

/**
 * Alerta de estoque mínimo, em milésimos inteiros da unidade do item.
 * - Mínimo não informado (`null`): alerta desligado.
 * - Mínimo zero: alerta só quando o saldo estiver zerado.
 * - Mínimo maior que zero: alerta quando o saldo for menor ou igual a ele.
 * Operacional e configurável pelo usuário; não prescreve compra nem uso.
 */
export function abaixoDoMinimo(saldoMilesimos: number, minimoMilesimos: number | null): boolean {
  return minimoMilesimos !== null && saldoMilesimos <= minimoMilesimos;
}

export interface MovimentoParaEstoque {
  id: string;
  data: string;
  ordem: number;
  tipo: TipoMovimentoEstoque;
  quantidadeMilesimos: number;
  loteEstoqueId: string | null;
  custoEntradaCentavos: number | null;
}
export interface ValorMovimentoEstoque {
  id: string;
  custoApropriadoCentavos: number | null;
  saldoMilesimos: number;
  valorSaldoCentavos: number | null;
}
export interface AnaliseEstoque {
  saldoMilesimos: number;
  valorSaldoCentavos: number | null;
  /** Numerador do custo médio; dividir pelo saldo físico somente para exibição. */
  valoracaoCompleta: boolean;
  lotes: { loteEstoqueId: string | null; saldoMilesimos: number }[];
  movimentos: ValorMovimentoEstoque[];
}
function inteiroSeguro(valor: bigint): number {
  const n = Number(valor);
  if (!Number.isSafeInteger(n)) throw new Error('O valor acumulado excede o limite de precisão.');
  return n;
}
/**
 * Média móvel por (data, ordem, id). Dinheiro calculado com BigInt; nunca float.
 * Saída: metade para cima ao centavo. A saída final leva o resíduo integral.
 * Entrada desconhecida torna a mistura indeterminada até zerar ou corrigir sua origem.
 */
export function calcularEstoque(movimentos: readonly MovimentoParaEstoque[]): AnaliseEstoque {
  let quantidade = 0n;
  let valor: bigint | null = 0n;
  const lotes = new Map<string | null, bigint>();
  const valores: ValorMovimentoEstoque[] = [];
  const ordenados = [...movimentos].sort(
    (a, b) => a.data.localeCompare(b.data) || a.ordem - b.ordem || a.id.localeCompare(b.id),
  );
  for (const m of ordenados) {
    if (!Number.isSafeInteger(m.quantidadeMilesimos) || m.quantidadeMilesimos <= 0)
      throw new Error('Quantidade inválida.');
    const q = BigInt(m.quantidadeMilesimos);
    const saldoLote = lotes.get(m.loteEstoqueId) ?? 0n;
    let apropriado: bigint | null;
    if (sentidoEstoque(m.tipo) === 'entrada') {
      if (
        m.custoEntradaCentavos !== null &&
        (!Number.isSafeInteger(m.custoEntradaCentavos) || m.custoEntradaCentavos < 0)
      )
        throw new Error('Custo de entrada inválido.');
      apropriado = m.custoEntradaCentavos === null ? null : BigInt(m.custoEntradaCentavos);
      quantidade += q;
      valor = valor === null || apropriado === null ? null : valor + apropriado;
      lotes.set(m.loteEstoqueId, saldoLote + q);
    } else {
      if (q > quantidade || q > saldoLote)
        throw new Error(
          `Estoque insuficiente em ${m.data}; o item ou lote físico ficaria negativo.`,
        );
      apropriado =
        valor === null
          ? null
          : q === quantidade
            ? valor
            : (2n * valor * q + quantidade) / (2n * quantidade);
      quantidade -= q;
      lotes.set(m.loteEstoqueId, saldoLote - q);
      valor =
        quantidade === 0n ? 0n : valor === null || apropriado === null ? null : valor - apropriado;
    }
    valores.push({
      id: m.id,
      custoApropriadoCentavos: apropriado === null ? null : inteiroSeguro(apropriado),
      saldoMilesimos: inteiroSeguro(quantidade),
      valorSaldoCentavos: valor === null ? null : inteiroSeguro(valor),
    });
  }
  return {
    saldoMilesimos: inteiroSeguro(quantidade),
    valorSaldoCentavos: valor === null ? null : inteiroSeguro(valor),
    valoracaoCompleta: valor !== null,
    lotes: [...lotes].map(([loteEstoqueId, saldo]) => ({
      loteEstoqueId,
      saldoMilesimos: inteiroSeguro(saldo),
    })),
    movimentos: valores,
  };
}
