import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow } from 'electron';

/**
 * PDF do relatório (D-J): o HTML gerado pela função pura é gravado num arquivo temporário e
 * aberto numa janela oculta, com sandbox, isolamento, sem script, sem preload e sem rede (a
 * sessão já bloqueia tudo que não é arquivo local; o HTML ainda traz CSP `default-src 'none'`).
 * Depois de impresso, a janela é destruída e o arquivo temporário apagado.
 */
export async function gerarPdf(html: string, pastaTemporaria: string): Promise<Buffer> {
  const arquivo = join(pastaTemporaria, `relatorio-${randomUUID()}.html`);
  writeFileSync(arquivo, html, 'utf8');
  const janela = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
      spellcheck: false,
      webSecurity: true,
    },
  });
  try {
    await janela.loadFile(arquivo);
    return await janela.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:7pt;width:100%;text-align:center;color:#555;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
  } finally {
    janela.destroy();
    rmSync(arquivo, { force: true });
  }
}
