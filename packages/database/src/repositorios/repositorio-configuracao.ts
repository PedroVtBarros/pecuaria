import type { ValorJson } from '@pecuaria/shared-types';
import type { Conexao } from '../conexao';

interface LinhaConfiguracao {
  chave: string;
  valor_json: string;
  updated_at: string;
}

/**
 * Acesso à tabela `configuracao`. Só SQL e mapeamento; validação de chave e
 * de valor acontece na camada de serviço e no contrato IPC.
 */
export class RepositorioConfiguracao {
  constructor(
    private readonly obterConexao: () => Conexao,
    private readonly relogio: () => Date = () => new Date(),
  ) {}

  obter(chave: string): ValorJson | null {
    const linha = this.obterConexao()
      .prepare('SELECT chave, valor_json, updated_at FROM configuracao WHERE chave = ?')
      .get(chave) as LinhaConfiguracao | undefined;
    return linha ? (JSON.parse(linha.valor_json) as ValorJson) : null;
  }

  definir(chave: string, valor: ValorJson): void {
    const agora = this.relogio().toISOString();
    this.obterConexao()
      .prepare(
        `INSERT INTO configuracao (chave, valor_json, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (chave) DO UPDATE SET
           valor_json = excluded.valor_json,
           updated_at = excluded.updated_at`,
      )
      .run(chave, JSON.stringify(valor), agora, agora);
  }

  listar(): { chave: string; valor: ValorJson; atualizadoEm: string }[] {
    const linhas = this.obterConexao()
      .prepare('SELECT chave, valor_json, updated_at FROM configuracao ORDER BY chave')
      .all() as LinhaConfiguracao[];
    return linhas.map((l) => ({
      chave: l.chave,
      valor: JSON.parse(l.valor_json) as ValorJson,
      atualizadoEm: l.updated_at,
    }));
  }
}
