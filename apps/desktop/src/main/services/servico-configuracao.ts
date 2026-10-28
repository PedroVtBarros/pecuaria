import {
  ErroAplicacao,
  esquemasConfiguracaoConhecida,
  type ValorJson,
} from '@pecuaria/shared-types';
import type { RepositorioConfiguracao } from '@pecuaria/database';

/** Regras de leitura e gravação de configurações. */
export class ServicoConfiguracao {
  constructor(private readonly repositorio: RepositorioConfiguracao) {}

  obter(chave: string): ValorJson | null {
    return this.repositorio.obter(chave);
  }

  definir(chave: string, valor: ValorJson): void {
    const esquema =
      esquemasConfiguracaoConhecida[chave as keyof typeof esquemasConfiguracaoConhecida];
    if (esquema && !esquema.safeParse(valor).success) {
      throw new ErroAplicacao('ENTRADA_INVALIDA', `Valor inválido para a configuração "${chave}".`);
    }
    this.repositorio.definir(chave, valor);
  }
}
