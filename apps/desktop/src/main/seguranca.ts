import { normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { App, Session } from 'electron';
import type { Logger } from '@pecuaria/database';

/**
 * Onde o renderer pode estar carregado. Em produção, apenas o index.html
 * empacotado. Em desenvolvimento, apenas a origem do servidor do Vite.
 */
export interface OrigemRenderer {
  urlDesenvolvimento: string | null;
  arquivoIndex: string;
}

function mesmoArquivo(a: string, b: string): boolean {
  return normalize(a).toLowerCase() === normalize(b).toLowerCase();
}

/** A URL é a página do aplicativo? Usado para validar navegação e remetentes IPC. */
export function urlDoAplicativo(url: string, origem: OrigemRenderer): boolean {
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return false;
  }
  if (origem.urlDesenvolvimento) {
    return alvo.origin === new URL(origem.urlDesenvolvimento).origin;
  }
  if (alvo.protocol !== 'file:') return false;
  try {
    return mesmoArquivo(fileURLToPath(alvo), origem.arquivoIndex);
  } catch {
    return false;
  }
}

/**
 * Requisições de rede permitidas. O aplicativo é offline: em produção só
 * arquivos locais. Em desenvolvimento, também o servidor local do Vite.
 */
export function requisicaoPermitida(url: string, origem: OrigemRenderer): boolean {
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return false;
  }
  if (['file:', 'data:', 'blob:', 'devtools:'].includes(alvo.protocol)) return true;
  if (origem.urlDesenvolvimento) {
    const dev = new URL(origem.urlDesenvolvimento);
    const mesmoHost = alvo.hostname === dev.hostname && alvo.port === dev.port;
    return mesmoHost && ['http:', 'ws:'].includes(alvo.protocol);
  }
  return false;
}

export interface RemetenteIpc {
  sender: { id: number };
  senderFrame: { url: string; parent: unknown } | null;
}

/** Só a moldura principal da janela do aplicativo pode chamar a API. */
export function remetenteAutorizado(
  evento: RemetenteIpc,
  idJanelaPrincipal: number | null,
  origem: OrigemRenderer,
): boolean {
  const moldura = evento.senderFrame;
  if (idJanelaPrincipal === null || evento.sender.id !== idJanelaPrincipal) return false;
  if (!moldura || moldura.parent !== null) return false;
  return urlDoAplicativo(moldura.url, origem);
}

/** Endurece sessão e conteúdos web. Chamar depois de app.whenReady(). */
export function aplicarSeguranca(
  app: App,
  sessao: Session,
  origem: OrigemRenderer,
  logger: Logger,
): void {
  sessao.setPermissionRequestHandler((_conteudo, permissao, responder) => {
    logger.aviso('Permissão negada ao renderer', { permissao });
    responder(false);
  });
  sessao.setPermissionCheckHandler(() => false);

  sessao.webRequest.onBeforeRequest((detalhes, responder) => {
    const permitida = requisicaoPermitida(detalhes.url, origem);
    if (!permitida)
      logger.aviso('Requisição de rede bloqueada (aplicativo offline)', { url: detalhes.url });
    responder({ cancel: !permitida });
  });

  app.on('web-contents-created', (_evento, conteudo) => {
    conteudo.setWindowOpenHandler(({ url }) => {
      logger.aviso('Abertura de nova janela bloqueada', { url });
      return { action: 'deny' };
    });
    const bloquearNavegacaoExterna = (
      evento: { preventDefault: () => void },
      url: string,
    ): void => {
      if (!urlDoAplicativo(url, origem)) {
        evento.preventDefault();
        logger.aviso('Navegação bloqueada', { url });
      }
    };
    conteudo.on('will-navigate', (evento) => bloquearNavegacaoExterna(evento, evento.url));
    conteudo.on('will-redirect', (evento) => bloquearNavegacaoExterna(evento, evento.url));
    conteudo.on('will-attach-webview', (evento) => {
      evento.preventDefault();
      logger.aviso('Webview bloqueado');
    });
  });
}

/**
 * Content Security Policy da página empacotada. Injetada no index.html no
 * build de produção (ver electron.vite.config.ts). Sem rede, sem eval.
 */
export const POLITICA_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/**
 * CSP do modo de desenvolvimento. O Vite injeta um script inline (React Refresh)
 * e usa WebSocket local para recarregar a página; nada além do servidor local.
 * Sem 'unsafe-eval'.
 */
export const POLITICA_CSP_DESENVOLVIMENTO = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* http://localhost:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
