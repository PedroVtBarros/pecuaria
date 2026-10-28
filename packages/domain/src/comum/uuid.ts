// Web Crypto existe no Node 19+, no Electron e em navegadores. O núcleo não
// depende de tipos de nenhum desses ambientes, então declara só o necessário.
declare const crypto: { getRandomValues<T extends Uint8Array>(destino: T): T };

/**
 * UUID versão 7 (RFC 9562): 48 bits de tempo em milissegundos + bits aleatórios.
 * Ordenável por tempo de criação e sem colisão entre dispositivos, o que prepara
 * os dados para sincronização futura (BANCO_DE_DADOS.md, seção 1).
 */
export function gerarUuidV7(
  agoraMs: number = Date.now(),
  preencherAleatorio: (bytes: Uint8Array) => void = (b) => crypto.getRandomValues(b),
): string {
  const bytes = new Uint8Array(16);
  preencherAleatorio(bytes);
  const tempo = BigInt(Math.max(0, Math.floor(agoraMs)));
  for (let i = 0; i < 6; i++) {
    bytes[i] = Number((tempo >> BigInt(8 * (5 - i))) & 0xffn);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // versão 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variante RFC
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function ehUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && PADRAO_UUID.test(valor);
}
