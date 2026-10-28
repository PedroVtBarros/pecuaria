import type { TipoItemEstoque, TipoMovimentoEstoque } from '@pecuaria/domain';
export const tiposItemEstoque: Record<TipoItemEstoque, string> = {
  racao: 'Ração',
  silagem: 'Silagem',
  volumoso: 'Volumoso',
  suplemento: 'Suplemento',
  mineral: 'Mineral',
  medicamento: 'Medicamento',
  vacina: 'Vacina',
  semen: 'Sêmen',
  outro: 'Outro',
};
export const tiposMovimentoEstoque: Record<TipoMovimentoEstoque, string> = {
  entrada_compra: 'Entrada por compra',
  entrada_producao: 'Produção própria',
  entrada_inicial: 'Saldo inicial',
  saida_consumo: 'Consumo produtivo',
  saida_perda: 'Perda',
  saida_venda: 'Saída por venda',
  ajuste_entrada: 'Ajuste de entrada',
  ajuste_saida: 'Ajuste de saída',
};
export function quantidadeEstoque(q: number, unidade: string): string {
  return `${q.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${unidade}`;
}
/** Regra do alerta de estoque mínimo (mesma de `abaixoDoMinimo`, no domínio). */
export function ajudaEstoqueMinimo(unidade: string): string {
  return `Em ${unidade}. Em branco: sem alerta. Zero: avisa só quando o saldo chegar a zero. Maior que zero: avisa quando o saldo for menor ou igual ao mínimo.`;
}
export function explicacaoEstoqueMinimo(minimo: number, unidade: string): string {
  return minimo === 0
    ? 'Mínimo informado: 0. O aviso indica saldo zerado.'
    : `Mínimo informado: ${quantidadeEstoque(minimo, unidade)}. O aviso aparece com saldo igual ou menor que o mínimo.`;
}
export function valorEstoque(centavos: number | null): string {
  return centavos === null
    ? 'Valoração incompleta'
    : (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
