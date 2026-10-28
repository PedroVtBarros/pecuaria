import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

export interface AppAberto {
  app: ElectronApplication;
  janela: Page;
  errosNoConsole: string[];
}

export function criarPastaDados(): { caminho: string; limpar: () => void } {
  const caminho = mkdtempSync(join(tmpdir(), 'pecuaria-e2e-'));
  return {
    caminho,
    limpar: () => {
      try {
        rmSync(caminho, { recursive: true, force: true });
      } catch {
        // Windows pode segurar arquivos por alguns instantes depois de fechar o app
      }
    },
  };
}

/** Abre o aplicativo construído com a pasta de dados indicada. */
export async function abrirApp(pastaDados: string): Promise<AppAberto> {
  const env: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(process.env)) {
    if (
      valor !== undefined &&
      chave !== 'ELECTRON_RENDERER_URL' &&
      chave !== 'ELECTRON_RUN_AS_NODE'
    ) {
      env[chave] = valor;
    }
  }
  env['PECUARIA_DIR_DADOS'] = pastaDados;

  // Janela coberta por outras (comum enquanto se trabalha na máquina) faz o
  // Chromium congelar temporizadores: a notificação não some e cobre botões.
  // As opções do Chromium vêm antes do caminho do app.
  const app = await electron.launch({
    args: [
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-timer-throttling',
      join(__dirname, '..'),
    ],
    env,
  });
  const janela = await app.firstWindow();
  const errosNoConsole: string[] = [];
  janela.on('console', (msg) => {
    if (msg.type() === 'error') errosNoConsole.push(msg.text());
  });
  janela.on('pageerror', (erro) => errosNoConsole.push(erro.message));
  await expect(janela.getByRole('navigation', { name: 'Módulos' })).toBeVisible();
  return { app, janela, errosNoConsole };
}

export async function fecharApp(aberto: AppAberto): Promise<void> {
  await aberto.app.close();
}

/** Chama a API exposta pelo preload, como o renderer faz. */
export function chamarApi(janela: Page, canal: string, entrada: unknown): Promise<unknown> {
  return janela.evaluate(
    ([c, e]) =>
      (
        window as unknown as { api: { invocar: (c: unknown, e: unknown) => Promise<unknown> } }
      ).api.invocar(c, e),
    [canal, entrada] as const,
  );
}

export function lerLogs(pastaDados: string): Record<string, unknown>[] {
  const pasta = join(pastaDados, 'logs');
  return readdirSync(pasta)
    .filter((n) => n.endsWith('.log'))
    .flatMap((n) => readFileSync(join(pasta, n), 'utf8').trim().split('\n'))
    .filter(Boolean)
    .map((linha) => JSON.parse(linha) as Record<string, unknown>);
}
