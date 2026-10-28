import type { InfoSistema, PastaAbrivel } from '@pecuaria/shared-types';
import { ErroAplicacao } from '@pecuaria/shared-types';
import {
  lerVersaoSchema,
  listarMigracoesAplicadas,
  versaoSqlite,
  type GerenciadorBanco,
} from '@pecuaria/database';
import type { CaminhosApp } from '../caminhos';

export interface AmbienteExecucao {
  versaoApp: string;
  empacotado: boolean;
  versoes: { electron: string; chrome: string; node: string };
  abrirPastaNoSistema: (caminho: string) => Promise<string>;
}

/** Informações de diagnóstico e ações de sistema permitidas ao renderer. */
export class ServicoSistema {
  constructor(
    private readonly gerenciador: GerenciadorBanco,
    private readonly caminhos: CaminhosApp,
    private readonly ambiente: AmbienteExecucao,
  ) {}

  obterInfo(): InfoSistema {
    const db = this.gerenciador.conexao;
    return {
      versaoApp: this.ambiente.versaoApp,
      versaoElectron: this.ambiente.versoes.electron,
      versaoChrome: this.ambiente.versoes.chrome,
      versaoNode: this.ambiente.versoes.node,
      versaoSqlite: versaoSqlite(db),
      versaoSchema: lerVersaoSchema(db),
      versaoSchemaSuportada: this.gerenciador.versaoSuportada,
      migracoesAplicadas: listarMigracoesAplicadas(db),
      caminhos: { ...this.caminhos },
      empacotado: this.ambiente.empacotado,
    };
  }

  /** Abre apenas pastas conhecidas do aplicativo, nunca um caminho vindo do renderer. */
  async abrirPasta(pasta: PastaAbrivel): Promise<null> {
    const alvo = {
      dados: this.caminhos.dados,
      backups: this.caminhos.backups,
      logs: this.caminhos.logs,
    }[pasta];
    const erro = await this.ambiente.abrirPastaNoSistema(alvo);
    if (erro) throw new ErroAplicacao('ERRO_INTERNO', `Não foi possível abrir a pasta: ${erro}`);
    return null;
  }
}
