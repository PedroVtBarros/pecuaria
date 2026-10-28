import {
  contratoApi,
  ErroAplicacao,
  falha,
  sucesso,
  type CanalApi,
  type EntradaValidadaApi,
  type Resultado,
  type SaidaApi,
} from '@pecuaria/shared-types';
import type { Logger } from '@pecuaria/database';
import type { RemetenteIpc } from '../seguranca';

export type Executor<C extends CanalApi> = (
  entrada: EntradaValidadaApi<C>,
) => Promise<SaidaApi<C>> | SaidaApi<C>;

export interface DependenciasManipulador {
  validarRemetente: (evento: RemetenteIpc) => boolean;
  logger: Logger;
}

/**
 * Envolve o executor de um canal com as defesas comuns:
 * 1. recusa remetente que não seja a janela do aplicativo;
 * 2. valida a entrada com o esquema do contrato (o renderer não é confiável);
 * 3. converte exceções em Resultado, sem vazar detalhes internos.
 *
 * Não depende do Electron, para poder ser testado diretamente.
 */
export function criarManipulador<C extends CanalApi>(
  canal: C,
  executar: Executor<C>,
  deps: DependenciasManipulador,
): (evento: RemetenteIpc, entradaBruta: unknown) => Promise<Resultado<SaidaApi<C>>> {
  const esquema = contratoApi[canal].entrada;

  return async (evento, entradaBruta) => {
    if (!deps.validarRemetente(evento)) {
      deps.logger.aviso('Chamada IPC recusada: remetente não autorizado', {
        canal,
        url: evento.senderFrame?.url ?? null,
      });
      return falha('REMETENTE_NAO_AUTORIZADO', 'Origem da chamada não autorizada.');
    }

    const validacao = esquema.safeParse(entradaBruta ?? {});
    if (!validacao.success) {
      const detalhes = validacao.error.issues.map(
        (problema) => `${problema.path.join('.') || '(entrada)'}: ${problema.message}`,
      );
      deps.logger.aviso('Chamada IPC recusada: entrada inválida', { canal, detalhes });
      return falha('ENTRADA_INVALIDA', 'Os dados enviados são inválidos.', detalhes);
    }

    try {
      const dados = await executar(validacao.data as EntradaValidadaApi<C>);
      return sucesso(dados);
    } catch (erro) {
      if (erro instanceof ErroAplicacao) {
        deps.logger.aviso('Operação recusada', {
          canal,
          codigo: erro.codigo,
          mensagem: erro.message,
        });
        return falha(erro.codigo, erro.message, erro.detalhes);
      }
      deps.logger.erro('Erro inesperado em chamada IPC', { canal, erro });
      return falha(
        'ERRO_INTERNO',
        'Ocorreu um erro inesperado. Os detalhes foram registrados no log do aplicativo.',
      );
    }
  };
}
