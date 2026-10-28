import { BrowserWindow } from 'electron';
import type { Logger } from '@pecuaria/database';
import type { OrigemRenderer } from './seguranca';

export function criarJanelaPrincipal(opcoes: {
  caminhoPreload: string;
  origem: OrigemRenderer;
  ferramentasDev: boolean;
  logger: Logger;
}): BrowserWindow {
  const janela = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Gestão Pecuária',
    backgroundColor: '#f5f6f2',
    autoHideMenuBar: true,
    webPreferences: {
      preload: opcoes.caminhoPreload,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      devTools: opcoes.ferramentasDev,
    },
  });

  janela.once('ready-to-show', () => janela.show());

  janela.webContents.on('render-process-gone', (_evento, detalhes) => {
    opcoes.logger.erro('Processo de interface encerrado inesperadamente', { ...detalhes });
  });
  janela.webContents.on('unresponsive', () => {
    opcoes.logger.aviso('A interface parou de responder');
  });
  janela.webContents.on('preload-error', (_evento, caminho, erro) => {
    opcoes.logger.erro('Erro no preload', { caminho, erro });
  });

  if (opcoes.origem.urlDesenvolvimento) {
    void janela.loadURL(opcoes.origem.urlDesenvolvimento);
  } else {
    void janela.loadFile(opcoes.origem.arquivoIndex);
  }

  return janela;
}
