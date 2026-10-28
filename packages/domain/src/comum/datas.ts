/**
 * Datas de calendário sem hora, no formato AAAA-MM-DD (BANCO_DE_DADOS.md, seção 1).
 * Comparações e diferenças usam UTC para não sofrer com fuso ou horário de verão.
 */
const PADRAO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function ehDataIso(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const partes = PADRAO_DATA.exec(valor);
  if (!partes) return false;
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  if (ano < 1900 || ano > 2999 || mes < 1 || mes > 12 || dia < 1) return false;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  );
}

function paraUtc(data: string): number {
  const [ano, mes, dia] = data.split('-').map(Number) as [number, number, number];
  return Date.UTC(ano, mes - 1, dia);
}

/** Número de dias de `inicio` até `fim` (positivo se fim é depois). */
export function diasEntre(inicio: string, fim: string): number {
  return Math.round((paraUtc(fim) - paraUtc(inicio)) / 86_400_000);
}

/** Data AAAA-MM-DD somada de `dias` dias de calendário (negativo volta no tempo). */
export function somarDias(data: string, dias: number): string {
  const resultado = new Date(paraUtc(data) + dias * 86_400_000);
  const mes = String(resultado.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(resultado.getUTCDate()).padStart(2, '0');
  return `${resultado.getUTCFullYear()}-${mes}-${dia}`;
}

/** Data de hoje no fuso local do computador, em AAAA-MM-DD. */
export function dataLocalIso(data: Date = new Date()): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Idade em meses completos na data de referência. */
export function idadeEmMeses(nascimento: string, referencia: string): number {
  const [an, mn, dn] = nascimento.split('-').map(Number) as [number, number, number];
  const [ar, mr, dr] = referencia.split('-').map(Number) as [number, number, number];
  let meses = (ar - an) * 12 + (mr - mn);
  if (dr < dn) meses -= 1;
  return Math.max(0, meses);
}

/** Aceita AAAA-MM-DD ou DD/MM/AAAA. Retorna AAAA-MM-DD ou null se inválida. */
export function interpretarData(valor: string): string | null {
  const texto = valor.trim();
  if (ehDataIso(texto)) return texto;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (!br) return null;
  const iso = `${br[3]}-${br[2]!.padStart(2, '0')}-${br[1]!.padStart(2, '0')}`;
  return ehDataIso(iso) ? iso : null;
}
