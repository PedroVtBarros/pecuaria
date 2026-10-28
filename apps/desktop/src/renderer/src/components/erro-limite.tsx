import { Component, type ErrorInfo, type ReactNode } from 'react';
import { relatarErro } from '../lib/relatar-erro';
import { textos } from '../textos';
import { Alerta } from './ui/alerta';
import { Botao } from './ui/botao';

interface Estado {
  erro: Error | null;
}

/** Impede que um erro em uma tela derrube a interface inteira. */
export class ErroLimite extends Component<{ children: ReactNode; chaveReinicio?: string }, Estado> {
  override state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  override componentDidCatch(erro: Error, info: ErrorInfo): void {
    relatarErro(
      Object.assign(new Error(erro.message), {
        stack: `${erro.stack ?? ''}\n${info.componentStack ?? ''}`,
      }),
      'ErroLimite',
    );
  }

  override componentDidUpdate(anterior: { chaveReinicio?: string }): void {
    if (this.state.erro && anterior.chaveReinicio !== this.props.chaveReinicio) {
      this.setState({ erro: null });
    }
  }

  override render(): ReactNode {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-8">
        <Alerta tom="perigo" titulo={textos.geral.erroInesperado}>
          {textos.geral.erroInesperadoDetalhe}
        </Alerta>
        <div>
          <Botao
            variante="secundario"
            onClick={() => {
              window.location.hash = '#/';
              this.setState({ erro: null });
            }}
          >
            {textos.geral.voltarAoPainel}
          </Botao>
        </div>
      </div>
    );
  }
}
