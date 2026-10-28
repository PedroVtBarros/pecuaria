import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { abrirApp, chamarApi, criarPastaDados, fecharApp, lerLogs } from './apoio';

/** Versão do schema depois da Fase 1 (migrations 0001 e 0002). */
const VERSAO_SCHEMA = 20;

const TITULOS_MODULOS = [
  'Painel',
  'Propriedades e rebanho',
  'Sanidade e manejo',
  'Produção leiteira',
  'Estoque',
  'Financeiro',
  'Banco de alimentos',
  'Nutrição de corte',
  'Simulador econômico',
  'Relatórios',
  'Configurações e backup',
];

function sha256(caminho: string): string {
  return createHash('sha256').update(readFileSync(caminho)).digest('hex');
}

test.describe('Fase 0: infraestrutura', () => {
  test('1. o aplicativo inicia, cria o banco fora do código e navega entre os módulos', async () => {
    const pasta = criarPastaDados();
    const aberto = await abrirApp(pasta.caminho);
    try {
      const { janela } = aberto;
      await expect(janela).toHaveTitle('Gestão Pecuária');
      await expect(janela.getByTestId('painel-schema')).toHaveText(
        `Schema versão ${VERSAO_SCHEMA}`,
      );

      const banco = join(pasta.caminho, 'dados', 'pecuaria.db');
      expect(existsSync(banco)).toBe(true);
      expect(banco.toLowerCase()).not.toContain('\\dev\\pecuaria\\');

      const nav = janela.getByRole('navigation', { name: 'Módulos' });
      await expect(nav.getByRole('link')).toHaveCount(TITULOS_MODULOS.length);
      for (const titulo of TITULOS_MODULOS) {
        await nav.getByRole('link', { name: new RegExp(`^${titulo}`) }).click();
        await expect(janela.getByRole('heading', { level: 1 })).toHaveText(titulo);
      }

      const logs = lerLogs(pasta.caminho);
      expect(logs.some((l) => l['mensagem'] === 'Banco de dados aberto')).toBe(true);
      expect(logs.filter((l) => l['nivel'] === 'erro')).toEqual([]);
      expect(aberto.errosNoConsole).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });

  test('2. o renderer fica isolado do banco, do Node e da rede', async () => {
    const pasta = criarPastaDados();
    const aberto = await abrirApp(pasta.caminho);
    try {
      const { janela, app } = aberto;

      const globais = await janela.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        return {
          require: typeof w['require'],
          process: typeof w['process'],
          module: typeof w['module'],
          Buffer: typeof w['Buffer'],
          global: typeof w['global'],
          ipcRenderer: typeof w['ipcRenderer'],
          electron: typeof w['electron'],
          chavesApi: Object.keys(w['api'] as object),
        };
      });
      expect(globais).toEqual({
        require: 'undefined',
        process: 'undefined',
        module: 'undefined',
        Buffer: 'undefined',
        global: 'undefined',
        ipcRenderer: 'undefined',
        electron: 'undefined',
        chavesApi: ['invocar'],
      });

      const canalInexistente = await janela.evaluate(async () => {
        try {
          await (
            window as unknown as { api: { invocar: (c: string, e: unknown) => Promise<unknown> } }
          ).api.invocar('banco:executarSql', { sql: 'DROP TABLE configuracao' });
          return 'aceito';
        } catch (erro) {
          return String(erro);
        }
      });
      expect(canalInexistente).toContain('Canal não permitido');

      expect(
        await chamarApi(janela, 'configuracao:definir', { chave: '../../x', valor: 1 }),
      ).toMatchObject({
        ok: false,
        erro: { codigo: 'ENTRADA_INVALIDA' },
      });
      expect(
        await chamarApi(janela, 'backup:restaurar', { id: '..\\..\\dados\\pecuaria.db' }),
      ).toMatchObject({ ok: false, erro: { codigo: 'ENTRADA_INVALIDA' } });

      const rede = await janela.evaluate(async () => {
        try {
          await fetch('https://example.com/');
          return 'conectou';
        } catch {
          return 'bloqueado';
        }
      });
      expect(rede).toBe('bloqueado');
      expect(await janela.evaluate(() => window.open('https://example.com/') === null)).toBe(true);

      const preferencias = await app.evaluate(({ BrowserWindow }) => {
        // getLastWebPreferences existe em tempo de execução, mas não está nos tipos
        // públicos do Electron 44. Usado só neste teste. Se sumir, o teste falha.
        const conteudo = BrowserWindow.getAllWindows()[0]?.webContents as unknown as {
          getLastWebPreferences: () => Record<string, unknown>;
        };
        const p = conteudo.getLastWebPreferences();
        return {
          contextIsolation: p?.contextIsolation,
          nodeIntegration: p?.nodeIntegration,
          sandbox: p?.sandbox,
          webSecurity: p?.webSecurity,
        };
      });
      expect(preferencias).toEqual({
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      });
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });

  test('3. dados persistem entre execuções e migrations não são reaplicadas', async () => {
    const pasta = criarPastaDados();

    // Primeira execução: banco novo
    let aberto = await abrirApp(pasta.caminho);
    try {
      await aberto.janela
        .getByRole('navigation', { name: 'Módulos' })
        .getByRole('link', { name: /^Configurações e backup/ })
        .click();
      await aberto.janela.getByRole('radio', { name: 'Escuro' }).first().click();
      await expect(aberto.janela.locator('html')).toHaveClass(/dark/);
      expect(
        await chamarApi(aberto.janela, 'configuracao:definir', {
          chave: 'teste.persistencia',
          valor: { numero: 42, texto: 'ção' },
        }),
      ).toEqual({ ok: true, dados: null });
    } finally {
      await fecharApp(aberto);
    }

    // Segunda e terceira execuções: mesmo banco
    for (const execucao of [2, 3]) {
      aberto = await abrirApp(pasta.caminho);
      try {
        await expect(aberto.janela.locator('html')).toHaveClass(/dark/);
        expect(
          await chamarApi(aberto.janela, 'configuracao:obter', { chave: 'teste.persistencia' }),
        ).toEqual({ ok: true, dados: { valor: { numero: 42, texto: 'ção' } } });
        const info = (await chamarApi(aberto.janela, 'sistema:obterInfo', {})) as {
          dados: { versaoSchema: number; migracoesAplicadas: unknown[] };
        };
        expect(info.dados.versaoSchema).toBe(VERSAO_SCHEMA);
        expect(info.dados.migracoesAplicadas).toHaveLength(VERSAO_SCHEMA);

        // Backup automático: um por dia, a partir da segunda abertura (banco já existente).
        await expect
          .poll(async () => {
            const r = (await chamarApi(aberto.janela, 'backup:listar', {})) as {
              dados: { tipo: string }[];
            };
            return r.dados.filter((b) => b.tipo === 'automatico').length;
          })
          .toBe(1);
        expect(execucao).toBeGreaterThan(1);
      } finally {
        await fecharApp(aberto);
      }
    }

    const aberturas = lerLogs(pasta.caminho).filter(
      (l) => l['mensagem'] === 'Banco de dados aberto',
    );
    expect(aberturas).toHaveLength(3);
    const contextos = aberturas.map(
      (l) => l['contexto'] as { bancoNovo: boolean; migracoesAplicadas: string[] },
    );
    expect(contextos.map((c) => c.bancoNovo)).toEqual([true, false, false]);
    expect(contextos.map((c) => c.migracoesAplicadas)).toEqual([
      [
        '1_infraestrutura',
        '2_rebanho',
        '3_sanidade_e_manejo',
        '4_estoque',
        '5_financeiro_base',
        '6_compra_venda_animais',
        '7_insumos_e_classificacao',
        '8_rateio_de_custos',
        '9_producao_propria',
        '10_indices_desempenho',
        '11_devolucao_animais',
        '12_banco_alimentos',
        '13_valores_nao_quantificados',
        '14_curadoria',
        '15_origem_dos_dados',
        '16_base_interpretada',
        '17_selecao_e_perfis',
        '18_pb_equivalente_nnp',
        '19_avaliacao_nutricional',
        '20_anulacao_avaliacao_nutricional',
      ],
      [],
      [],
    ]);
    const backups = readdirSync(join(pasta.caminho, 'backups'));
    expect(backups.filter((n) => n.includes('_pre_migracao'))).toEqual([]);
    pasta.limpar();
  });

  test('4. backup, restauração, exportação e importação preservam os dados', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    const { janela, app } = aberto;
    const exportado = join(pasta.caminho, 'exportado-pelo-usuario.db');
    try {
      await chamarApi(janela, 'configuracao:definir', { chave: 'teste.valor', valor: 'A' });
      await janela
        .getByRole('navigation', { name: 'Módulos' })
        .getByRole('link', { name: /^Configurações e backup/ })
        .click();

      // Criar backup pela interface
      await janela.getByRole('button', { name: 'Criar backup agora' }).click();
      await expect(janela.getByText('Backup criado e verificado.')).toBeVisible();
      const linhaManual = janela.locator('tr[data-tipo="manual"]');
      await expect(linhaManual).toHaveCount(1);

      // Alterar e restaurar
      await chamarApi(janela, 'configuracao:definir', { chave: 'teste.valor', valor: 'B' });
      await linhaManual.getByRole('button', { name: 'Restaurar' }).click();
      const dialogo = janela.getByRole('dialog');
      await expect(dialogo).toBeVisible();
      await dialogo.getByRole('button', { name: 'Restaurar' }).click();
      await expect(janela.getByText(/^Backup restaurado\./)).toBeVisible();
      expect(await chamarApi(janela, 'configuracao:obter', { chave: 'teste.valor' })).toEqual({
        ok: true,
        dados: { valor: 'A' },
      });
      await expect(janela.locator('tr[data-tipo="pre_restauracao"]')).toHaveCount(1);

      // Exportar (diálogo nativo substituído no processo principal)
      await app.evaluate(({ dialog }, destino) => {
        dialog.showSaveDialog = (async () => ({
          canceled: false,
          filePath: destino,
        })) as typeof dialog.showSaveDialog;
      }, exportado);
      await linhaManual.getByRole('button', { name: 'Exportar' }).click();
      await expect(janela.getByText(/^Backup exportado para/)).toBeVisible();
      const idManual = await linhaManual.getAttribute('data-backup-id');
      const manifesto = JSON.parse(
        readFileSync(
          join(pasta.caminho, 'backups', String(idManual).replace(/\.db$/, '.json')),
          'utf8',
        ),
      ) as { hashSha256: string };
      expect(sha256(exportado)).toBe(manifesto.hashSha256);

      // Importar arquivo externo e restaurar
      await chamarApi(janela, 'configuracao:definir', { chave: 'teste.valor', valor: 'C' });
      await app.evaluate(({ dialog }, origem) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [origem],
        })) as typeof dialog.showOpenDialog;
      }, exportado);
      await janela.getByRole('button', { name: 'Restaurar de arquivo…' }).click();
      await expect(janela.locator('tr[data-tipo="importado"]')).toHaveCount(1);
      expect(await chamarApi(janela, 'configuracao:obter', { chave: 'teste.valor' })).toEqual({
        ok: true,
        dados: { valor: 'A' },
      });
    } finally {
      await fecharApp(aberto);
    }

    // Dados restaurados continuam lá depois de reiniciar
    aberto = await abrirApp(pasta.caminho);
    try {
      expect(
        await chamarApi(aberto.janela, 'configuracao:obter', { chave: 'teste.valor' }),
      ).toEqual({
        ok: true,
        dados: { valor: 'A' },
      });
      expect(lerLogs(pasta.caminho).filter((l) => l['nivel'] === 'erro')).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });
});
