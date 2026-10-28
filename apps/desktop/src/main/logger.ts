import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chaveDia, type ContextoLog, type Logger } from '@pecuaria/database';

export type NivelLog = 'debug' | 'info' | 'aviso' | 'erro';

const ORDEM: Record<NivelLog, number> = { debug: 0, info: 1, aviso: 2, erro: 3 };
const PADRAO_ARQUIVO = /^app-(\d{4}-\d{2}-\d{2})\.log$/;

export interface OpcoesLoggerArquivo {
  pasta: string;
  nivelMinimo?: NivelLog;
  espelharNoConsole?: boolean;
  retencaoDias?: number;
  relogio?: () => Date;
}

/** Converte erros e valores não serializáveis em objetos simples para o log. */
export function serializarParaLog(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 4) return '[profundidade máxima]';
  if (valor instanceof Error) {
    const base: Record<string, unknown> = {
      nome: valor.name,
      mensagem: valor.message,
      pilha: valor.stack,
    };
    const extra = valor as Error & { codigo?: unknown; detalhes?: unknown };
    if (extra.codigo !== undefined) base['codigo'] = extra.codigo;
    if (extra.detalhes !== undefined) base['detalhes'] = extra.detalhes;
    if (valor.cause !== undefined) base['causa'] = serializarParaLog(valor.cause, profundidade + 1);
    return base;
  }
  if (Array.isArray(valor))
    return valor.slice(0, 50).map((v) => serializarParaLog(v, profundidade + 1));
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [k, serializarParaLog(v, profundidade + 1)]),
    );
  }
  if (typeof valor === 'string' && valor.length > 8000) return `${valor.slice(0, 8000)}…`;
  if (typeof valor === 'bigint') return valor.toString();
  if (typeof valor === 'function' || typeof valor === 'symbol') return String(valor);
  return valor;
}

/** Arquivos de log mais antigos que a retenção. Função pura. */
export function logsParaRemover(
  nomes: readonly string[],
  hoje: Date,
  retencaoDias: number,
): string[] {
  const limite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (retencaoDias - 1));
  const chaveLimite = chaveDia(limite);
  return nomes.filter((nome) => {
    const data = PADRAO_ARQUIVO.exec(nome)?.[1];
    return data !== undefined && data < chaveLimite;
  });
}

/**
 * Log em arquivo, um JSON por linha, um arquivo por dia: logs/app-AAAA-MM-DD.log.
 * Falhas de escrita nunca derrubam o aplicativo.
 */
export function criarLoggerArquivo(opcoes: OpcoesLoggerArquivo): Logger & { pasta: string } {
  const relogio = opcoes.relogio ?? (() => new Date());
  const nivelMinimo = opcoes.nivelMinimo ?? 'info';
  mkdirSync(opcoes.pasta, { recursive: true });

  try {
    for (const nome of logsParaRemover(
      readdirSync(opcoes.pasta),
      relogio(),
      opcoes.retencaoDias ?? 30,
    )) {
      rmSync(join(opcoes.pasta, nome), { force: true });
    }
  } catch {
    // limpeza é opcional
  }

  const escrever = (nivel: NivelLog, mensagem: string, contexto?: ContextoLog): void => {
    if (ORDEM[nivel] < ORDEM[nivelMinimo]) return;
    const agora = relogio();
    const registro: Record<string, unknown> = { ts: agora.toISOString(), nivel, mensagem };
    if (contexto !== undefined) registro['contexto'] = serializarParaLog(contexto);
    let linha: string;
    try {
      linha = JSON.stringify(registro);
    } catch {
      linha = JSON.stringify({
        ts: agora.toISOString(),
        nivel,
        mensagem,
        contexto: '[não serializável]',
      });
    }
    try {
      appendFileSync(join(opcoes.pasta, `app-${chaveDia(agora)}.log`), `${linha}\n`, 'utf8');
    } catch {
      // sem disco disponível, o log é perdido, mas o aplicativo continua
    }
    if (opcoes.espelharNoConsole) {
      const saida =
        nivel === 'erro' ? console.error : nivel === 'aviso' ? console.warn : console.log;
      saida(`[${nivel}] ${mensagem}`, contexto ?? '');
    }
  };

  return {
    pasta: opcoes.pasta,
    debug: (m, c) => escrever('debug', m, c),
    info: (m, c) => escrever('info', m, c),
    aviso: (m, c) => escrever('aviso', m, c),
    erro: (m, c) => escrever('erro', m, c),
  };
}
