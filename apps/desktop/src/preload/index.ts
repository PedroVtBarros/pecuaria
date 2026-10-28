/**
 * Preload em sandbox. Expõe ao renderer uma única função, `window.api.invocar`,
 * restrita à lista fechada de canais. Não expõe ipcRenderer, Node, fs nem
 * qualquer outro objeto do Electron.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { ehCanalApi } from '@pecuaria/shared-types/canais';
import type { ApiPreload } from '@pecuaria/shared-types';

const invocar = (canal: unknown, entrada: unknown): Promise<unknown> => {
  if (!ehCanalApi(canal)) {
    return Promise.reject(new Error(`Canal não permitido: ${String(canal)}`));
  }
  return ipcRenderer.invoke(canal, entrada);
};

const api = { invocar: invocar as ApiPreload['invocar'] } satisfies ApiPreload;

contextBridge.exposeInMainWorld('api', api);
