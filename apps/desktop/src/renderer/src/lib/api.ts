import {
  contratoApi,
  type CanalApi,
  type CodigoErro,
  type EntradaApi,
  type ErroApi,
  type SaidaApi,
} from '@pecuaria/shared-types';

/** Erro de chamada à API, com o código vindo do processo principal. */
export class ErroChamadaApi extends Error {
  readonly codigo: CodigoErro;
  readonly detalhes: string[];

  constructor(erro: ErroApi) {
    super(erro.mensagem);
    this.name = 'ErroChamadaApi';
    this.codigo = erro.codigo;
    this.detalhes = erro.detalhes ?? [];
  }
}

/**
 * Chama um canal da API. Valida a entrada localmente (feedback imediato);
 * o processo principal valida de novo, porque não confia no renderer.
 */
export async function chamarApi<C extends CanalApi>(
  canal: C,
  entrada: EntradaApi<C>,
): Promise<SaidaApi<C>> {
  const validacao = contratoApi[canal].entrada.safeParse(entrada);
  if (!validacao.success) {
    throw new ErroChamadaApi({
      codigo: 'ENTRADA_INVALIDA',
      mensagem: 'Os dados informados são inválidos.',
      detalhes: validacao.error.issues.map((p) => p.message),
    });
  }
  const resultado = await window.api.invocar(canal, entrada);
  if (resultado.ok) return resultado.dados;
  throw new ErroChamadaApi(resultado.erro);
}

export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  return 'Ocorreu um erro inesperado.';
}
