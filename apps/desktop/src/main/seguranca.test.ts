import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  remetenteAutorizado,
  requisicaoPermitida,
  urlDoAplicativo,
  type OrigemRenderer,
} from './seguranca';

const index = join(tmpdir(), 'app', 'out', 'renderer', 'index.html');
const producao: OrigemRenderer = { urlDesenvolvimento: null, arquivoIndex: index };
const desenvolvimento: OrigemRenderer = {
  urlDesenvolvimento: 'http://localhost:5173/',
  arquivoIndex: index,
};
const urlIndex = pathToFileURL(index).href;

describe('urlDoAplicativo', () => {
  it('em produção aceita só o index.html empacotado, com ou sem rota no hash', () => {
    expect(urlDoAplicativo(urlIndex, producao)).toBe(true);
    expect(urlDoAplicativo(`${urlIndex}#/configuracoes`, producao)).toBe(true);
    expect(urlDoAplicativo(pathToFileURL(join(tmpdir(), 'outro.html')).href, producao)).toBe(false);
    expect(urlDoAplicativo('https://example.com', producao)).toBe(false);
    expect(urlDoAplicativo('não é url', producao)).toBe(false);
  });

  it('em desenvolvimento aceita só a origem do servidor do Vite', () => {
    expect(urlDoAplicativo('http://localhost:5173/#/estoque', desenvolvimento)).toBe(true);
    expect(urlDoAplicativo('http://localhost:5174/', desenvolvimento)).toBe(false);
    expect(urlDoAplicativo(urlIndex, desenvolvimento)).toBe(false);
  });
});

describe('requisicaoPermitida (aplicativo offline)', () => {
  it('em produção bloqueia toda rede e permite arquivos locais', () => {
    expect(requisicaoPermitida(urlIndex, producao)).toBe(true);
    expect(requisicaoPermitida('data:image/png;base64,AAAA', producao)).toBe(true);
    for (const url of [
      'https://example.com/',
      'http://localhost:5173/',
      'ws://localhost:5173/',
      'https://fonts.googleapis.com/css',
      'ftp://x',
    ]) {
      expect(requisicaoPermitida(url, producao), url).toBe(false);
    }
  });

  it('em desenvolvimento permite apenas o servidor local do Vite', () => {
    expect(requisicaoPermitida('http://localhost:5173/src/main.tsx', desenvolvimento)).toBe(true);
    expect(requisicaoPermitida('ws://localhost:5173/', desenvolvimento)).toBe(true);
    expect(requisicaoPermitida('https://example.com/', desenvolvimento)).toBe(false);
    expect(requisicaoPermitida('http://localhost:9999/', desenvolvimento)).toBe(false);
  });
});

describe('remetenteAutorizado', () => {
  const evento = (id: number, url: string, parent: unknown = null) => ({
    sender: { id },
    senderFrame: { url, parent },
  });

  it('aceita a moldura principal da janela do aplicativo', () => {
    expect(remetenteAutorizado(evento(7, urlIndex), 7, producao)).toBe(true);
  });

  it('recusa outra janela, subframe, URL externa ou janela ainda inexistente', () => {
    expect(remetenteAutorizado(evento(8, urlIndex), 7, producao)).toBe(false);
    expect(remetenteAutorizado(evento(7, urlIndex, {}), 7, producao)).toBe(false);
    expect(remetenteAutorizado(evento(7, 'https://example.com'), 7, producao)).toBe(false);
    expect(remetenteAutorizado(evento(7, urlIndex), null, producao)).toBe(false);
    expect(remetenteAutorizado({ sender: { id: 7 }, senderFrame: null }, 7, producao)).toBe(false);
  });
});
