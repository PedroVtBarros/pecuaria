/**
 * Envia erros da interface para o log do processo principal.
 * Nunca lança: se o envio falhar, o erro original já foi exibido ao usuário.
 */
export function relatarErro(erro: unknown, origem: string): void {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  const pilha = erro instanceof Error && erro.stack ? erro.stack.slice(0, 8000) : undefined;
  try {
    void window.api
      .invocar('log:registrar', {
        nivel: 'erro',
        mensagem: mensagem.slice(0, 2000),
        origem: origem.slice(0, 200),
        ...(pilha ? { pilha } : {}),
      })
      .catch(() => undefined);
  } catch {
    // sem API disponível (ex.: testes), nada a fazer
  }
}

export function instalarCapturaDeErrosGlobais(): void {
  window.addEventListener('error', (evento) =>
    relatarErro(evento.error ?? evento.message, 'window.onerror'),
  );
  window.addEventListener('unhandledrejection', (evento) =>
    relatarErro(evento.reason, 'unhandledrejection'),
  );
}
