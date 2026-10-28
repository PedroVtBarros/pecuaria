import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { app, dialog, ipcMain, Menu, session, shell } from 'electron';
import {
  GerenciadorBanco,
  MIGRACOES_DO_PROJETO,
  RepositorioConfiguracao,
  ServicoBackup,
} from '@pecuaria/database';
import { escolherPastaDeDados, resolverCaminhos, validarLocalDoBanco } from './caminhos';
import { criarLoggerArquivo } from './logger';
import { aplicarSeguranca, remetenteAutorizado, type OrigemRenderer } from './seguranca';
import { criarJanelaPrincipal } from './janela';
import { criarExecutores, registrarIpc, type Dialogos } from './ipc/registrar-ipc';
import { ServicoConfiguracao } from './services/servico-configuracao';
import { ServicoSistema } from './services/servico-sistema';
import { criarServicosRebanho } from './services/rebanho';
import { gerarPdf } from './relatorios/pdf';

// ---------------------------------------------------------------------------
// Antes de app.whenReady(): pasta de dados e log
// ---------------------------------------------------------------------------

const pastaDados = escolherPastaDeDados({
  pastaAppData: app.getPath('appData'),
  empacotado: app.isPackaged,
  env: process.env,
});
app.setPath('userData', pastaDados);
const caminhos = resolverCaminhos(pastaDados);

const logger = criarLoggerArquivo({
  pasta: caminhos.logs,
  nivelMinimo: app.isPackaged ? 'info' : 'debug',
  espelharNoConsole: !app.isPackaged,
});

process.on('uncaughtException', (erro) => {
  logger.erro('Exceção não tratada no processo principal', { erro });
});
process.on('unhandledRejection', (motivo) => {
  logger.erro('Promessa rejeitada sem tratamento no processo principal', { erro: motivo });
});

const origem: OrigemRenderer = {
  urlDesenvolvimento: !app.isPackaged ? (process.env['ELECTRON_RENDERER_URL'] ?? null) : null,
  arquivoIndex: join(__dirname, '../renderer/index.html'),
};

let janelaPrincipal: BrowserWindow | null = null;
let gerenciador: GerenciadorBanco | null = null;

function encerrarComErro(titulo: string, mensagem: string): void {
  dialog.showErrorBox(
    titulo,
    `${mensagem}\n\nO aplicativo será encerrado.\n\nRegistro de erros:\n${caminhos.logs}\n\nBackups:\n${caminhos.backups}`,
  );
  app.exit(1);
}

const dialogos: Dialogos = {
  async escolherDestinoExportacao(nomeSugerido) {
    const resultado = await dialog.showSaveDialog({
      title: 'Exportar backup',
      defaultPath: join(app.getPath('documents'), nomeSugerido),
      filters: [{ name: 'Backup do Gestão Pecuária', extensions: ['db'] }],
    });
    return resultado.canceled || !resultado.filePath ? null : resultado.filePath;
  },
  async escolherArquivoParaImportar() {
    const resultado = await dialog.showOpenDialog({
      title: 'Restaurar a partir de arquivo',
      properties: ['openFile'],
      filters: [{ name: 'Backup do Gestão Pecuária', extensions: ['db'] }],
    });
    return resultado.canceled ? null : (resultado.filePaths[0] ?? null);
  },
  async salvarArquivoDeTexto(nomeSugerido, conteudo) {
    const resultado = await dialog.showSaveDialog({
      title: 'Salvar modelo de planilha',
      defaultPath: join(app.getPath('documents'), nomeSugerido),
      filters: [{ name: 'Planilha CSV', extensions: ['csv'] }],
    });
    if (resultado.canceled || !resultado.filePath) return null;
    writeFileSync(resultado.filePath, conteudo, 'utf8');
    return resultado.filePath;
  },
  async salvarRelatorio(nomeSugerido, formato, conteudo) {
    const resultado = await dialog.showSaveDialog({
      title: 'Salvar relatório',
      defaultPath: join(app.getPath('documents'), `${nomeSugerido}.${formato}`),
      filters:
        formato === 'csv'
          ? [{ name: 'Planilha CSV', extensions: ['csv'] }]
          : [{ name: 'Documento PDF', extensions: ['pdf'] }],
    });
    if (resultado.canceled || !resultado.filePath) return null;
    if (formato === 'csv') {
      writeFileSync(resultado.filePath, conteudo, 'utf8');
      return { caminho: resultado.filePath, bytes: Buffer.byteLength(conteudo, 'utf8') };
    }
    const pdf = await gerarPdf(conteudo, app.getPath('temp'));
    writeFileSync(resultado.filePath, pdf);
    return { caminho: resultado.filePath, bytes: pdf.length };
  },
};

async function iniciar(): Promise<void> {
  await app.whenReady();
  app.setAppUserModelId('br.local.gestaopecuaria');
  if (app.isPackaged) Menu.setApplicationMenu(null);

  logger.info('Aplicativo iniciando', {
    versao: app.getVersion(),
    electron: process.versions.electron,
    empacotado: app.isPackaged,
    pastaDados,
  });

  aplicarSeguranca(app, session.defaultSession, origem, logger);

  const local = validarLocalDoBanco(caminhos, app.getAppPath());
  for (const aviso of local.avisos) logger.aviso(aviso, { banco: caminhos.banco });
  if (local.erro) {
    logger.erro(local.erro);
    encerrarComErro('Local do banco de dados inválido', local.erro);
    return;
  }

  // Banco e backup ligados: o gerenciador chama o backup antes de migrar.
  let servicoBackup: ServicoBackup | null = null;
  const banco = new GerenciadorBanco({
    caminhoBanco: caminhos.banco,
    migracoes: MIGRACOES_DO_PROJETO,
    logger,
    antesDeMigrar: async (db, estado) => {
      await servicoBackup?.criarDaConexao(
        db,
        'pre_migracao',
        `Antes de atualizar o banco da versão ${estado.versaoAtual}`,
      );
    },
  });
  gerenciador = banco;
  servicoBackup = new ServicoBackup({
    gerenciador: banco,
    pastaBackups: caminhos.backups,
    versaoApp: app.getVersion(),
    logger,
  });

  let bancoNovo: boolean;
  try {
    bancoNovo = (await banco.abrir()).bancoNovo;
  } catch (erro) {
    logger.erro('Falha ao abrir o banco de dados', { erro });
    encerrarComErro(
      'Não foi possível abrir o banco de dados',
      erro instanceof Error ? erro.message : String(erro),
    );
    return;
  }

  if (!bancoNovo) {
    servicoBackup.backupAutomaticoDiario().catch((erro: unknown) => {
      logger.erro('Falha no backup automático diário', { erro });
    });
  }

  const executores = criarExecutores(
    {
      sistema: new ServicoSistema(banco, caminhos, {
        versaoApp: app.getVersion(),
        empacotado: app.isPackaged,
        versoes: {
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
        },
        abrirPastaNoSistema: (caminho) => shell.openPath(caminho),
      }),
      configuracao: new ServicoConfiguracao(new RepositorioConfiguracao(() => banco.conexao)),
      backup: servicoBackup,
      ...criarServicosRebanho(banco),
    },
    dialogos,
    logger,
  );

  registrarIpc(ipcMain, executores, {
    logger,
    validarRemetente: (evento) =>
      remetenteAutorizado(evento, janelaPrincipal?.webContents.id ?? null, origem),
  });

  janelaPrincipal = criarJanelaPrincipal({
    caminhoPreload: join(__dirname, '../preload/index.js'),
    origem,
    ferramentasDev: !app.isPackaged,
    logger,
  });
  janelaPrincipal.on('closed', () => {
    janelaPrincipal = null;
  });
}

if (!app.requestSingleInstanceLock()) {
  logger.info('Outra instância já está aberta; encerrando esta.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!janelaPrincipal) return;
    if (janelaPrincipal.isMinimized()) janelaPrincipal.restore();
    janelaPrincipal.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    gerenciador?.fechar();
    logger.info('Aplicativo encerrado');
  });
  iniciar().catch((erro: unknown) => {
    logger.erro('Falha na inicialização', { erro });
    encerrarComErro('Falha na inicialização', erro instanceof Error ? erro.message : String(erro));
  });
}
