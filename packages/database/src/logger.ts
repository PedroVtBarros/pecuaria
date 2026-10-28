/**
 * Interface mínima de log. O processo main injeta a implementação real,
 * que grava em arquivo. Testes usam o logger silencioso ou um coletor.
 */
export type ContextoLog = Record<string, unknown>;

export interface Logger {
  debug(mensagem: string, contexto?: ContextoLog): void;
  info(mensagem: string, contexto?: ContextoLog): void;
  aviso(mensagem: string, contexto?: ContextoLog): void;
  erro(mensagem: string, contexto?: ContextoLog): void;
}

export const loggerSilencioso: Logger = {
  debug: () => undefined,
  info: () => undefined,
  aviso: () => undefined,
  erro: () => undefined,
};
