import { createHash } from 'node:crypto';
import { createReadStream, renameSync, rmSync, writeFileSync } from 'node:fs';

export function sha256Texto(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

export function sha256Arquivo(caminho: string): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const hash = createHash('sha256');
    createReadStream(caminho)
      .on('data', (parte) => hash.update(parte))
      .on('error', rejeitar)
      .on('end', () => resolver(hash.digest('hex')));
  });
}

/** Grava o arquivo inteiro de uma vez, por arquivo temporário e renomeação. */
export function escreverArquivoAtomico(caminho: string, conteudo: string): void {
  const temporario = `${caminho}.tmp`;
  try {
    writeFileSync(temporario, conteudo, 'utf8');
    renameSync(temporario, caminho);
  } catch (erro) {
    rmSync(temporario, { force: true });
    throw erro;
  }
}

/** Normaliza quebras de linha para que o checksum não mude entre Windows e Git. */
export function normalizarQuebrasDeLinha(texto: string): string {
  return texto.replace(/\r\n?/g, '\n');
}

export function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
