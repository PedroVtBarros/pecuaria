/**
 * Envelope de resposta de toda chamada da API entre renderer e main.
 *
 * Erros não atravessam o IPC como exceções, porque o Electron perde tipo e
 * propriedades ao serializá-los. O main sempre devolve um Resultado.
 */

export const CODIGOS_ERRO = [
  'ENTRADA_INVALIDA',
  'REMETENTE_NAO_AUTORIZADO',
  'NAO_ENCONTRADO',
  'DUPLICADO',
  'OPERACAO_INVALIDA',
  'BACKUP_INVALIDO',
  'BANCO_INDISPONIVEL',
  'OPERACAO_EM_ANDAMENTO',
  /** Os dados mudaram desde o que a tela exibiu: é preciso calcular de novo (D-6B4-02). */
  'DADOS_DESATUALIZADOS',
  'ERRO_INTERNO',
] as const;

export type CodigoErro = (typeof CODIGOS_ERRO)[number];

export interface ErroApi {
  codigo: CodigoErro;
  mensagem: string;
  detalhes?: string[];
}

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroApi };

export function sucesso<T>(dados: T): Resultado<T> {
  return { ok: true, dados };
}

export function falha<T = never>(
  codigo: CodigoErro,
  mensagem: string,
  detalhes?: string[],
): Resultado<T> {
  return detalhes && detalhes.length > 0
    ? { ok: false, erro: { codigo, mensagem, detalhes } }
    : { ok: false, erro: { codigo, mensagem } };
}

/**
 * Erro conhecido da aplicação. O main converte em ErroApi com a mensagem
 * original. Erros que não são ErroAplicacao viram ERRO_INTERNO com mensagem
 * genérica, para não vazar detalhes internos ao renderer.
 */
export class ErroAplicacao extends Error {
  readonly codigo: CodigoErro;
  readonly detalhes: string[] | undefined;

  constructor(codigo: CodigoErro, mensagem: string, detalhes?: string[]) {
    super(mensagem);
    this.name = 'ErroAplicacao';
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}
