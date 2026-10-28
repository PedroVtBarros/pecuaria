import { isAbsolute, join, relative, resolve } from 'node:path';

export interface CaminhosApp {
  dados: string;
  banco: string;
  backups: string;
  logs: string;
}

/** Variável de ambiente que redireciona a pasta de dados. Usada pelos testes E2E. */
export const VARIAVEL_PASTA_DADOS = 'PECUARIA_DIR_DADOS';

/**
 * Pasta de dados do aplicativo, dentro de %APPDATA% e fora do código.
 * O nome é sem acento para evitar problemas de caminho em ferramentas nativas.
 * Desenvolvimento e versão instalada usam pastas diferentes, para que testes
 * manuais nunca toquem nos dados reais.
 */
export function escolherPastaDeDados(opcoes: {
  pastaAppData: string;
  empacotado: boolean;
  env: NodeJS.ProcessEnv;
}): string {
  const sobrescrita = opcoes.env[VARIAVEL_PASTA_DADOS];
  if (sobrescrita && sobrescrita.trim()) return resolve(sobrescrita);
  return join(opcoes.pastaAppData, opcoes.empacotado ? 'GestaoPecuaria' : 'GestaoPecuaria-dev');
}

export function resolverCaminhos(pastaDados: string): CaminhosApp {
  return {
    dados: pastaDados,
    banco: join(pastaDados, 'dados', 'pecuaria.db'),
    backups: join(pastaDados, 'backups'),
    logs: join(pastaDados, 'logs'),
  };
}

export function estaDentroDe(caminho: string, pasta: string): boolean {
  const rel = relative(resolve(pasta), resolve(caminho));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * O banco operacional não pode ficar dentro da pasta do código nem de uma
 * pasta sincronizada pelo OneDrive (risco de corrupção com arquivo aberto).
 */
export function validarLocalDoBanco(
  caminhos: CaminhosApp,
  pastaCodigo: string,
): { erro: string | null; avisos: string[] } {
  if (estaDentroDe(caminhos.banco, pastaCodigo)) {
    return {
      erro: `O banco de dados não pode ficar dentro da pasta do código (${pastaCodigo}).`,
      avisos: [],
    };
  }
  const avisos: string[] = [];
  if (/[\\/]onedrive[^\\/]*[\\/]/i.test(caminhos.banco)) {
    avisos.push(
      'O banco de dados está em uma pasta do OneDrive. Isso pode corromper o arquivo enquanto o aplicativo estiver aberto.',
    );
  }
  return { erro: null, avisos };
}
