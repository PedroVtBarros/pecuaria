import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { abrirApp, chamarApi, criarPastaDados, fecharApp, type AppAberto } from './apoio';

/*
 * Fase 6B-5: avaliação de dietas pela tela, no app construído. Fonte, alimento e números
 * FICTÍCIOS (CLAUDE.md, regra 1), gravados pela API num banco de teste: nada no banco operacional.
 * Fluxo: simular sem gravar, gravar, consultar, anular, reiniciar, backup e restauração.
 * Com PECUARIA_CAPTURAS=<pasta>, grava capturas em claro e escuro, em 1280 e 900 px.
 */
const CAPTURAS = process.env['PECUARIA_CAPTURAS'];

async function capturar(j: Page, nome: string) {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  const tamanho = j.viewportSize() ?? { width: 1280, height: 900 };
  const altura = await j.evaluate(() =>
    Math.max(...[...document.querySelectorAll('*')].map((e) => e.scrollHeight)),
  );
  await j.setViewportSize({ width: tamanho.width, height: Math.min(altura + 50, 8000) });
  await j.screenshot({ path: join(CAPTURAS, `${nome}.png`) });
  await j.setViewportSize(tamanho);
}
async function semRolagemHorizontal(j: Page) {
  const largura = await j.evaluate(() => ({
    pagina: document.documentElement.scrollWidth,
    janela: window.innerWidth,
  }));
  expect(largura.pagina).toBeLessThanOrEqual(largura.janela);
}
async function tema(j: Page, valor: 'claro' | 'escuro') {
  await chamarApi(j, 'configuracao:definir', { chave: 'interface.tema', valor });
  await j.reload();
  if (valor === 'escuro') await expect(j.locator('html')).toHaveClass(/dark/);
  else await expect(j.locator('html')).not.toHaveClass(/dark/);
}
async function ok<T>(j: Page, canal: string, entrada: unknown): Promise<T> {
  const r = (await chamarApi(j, canal, entrada)) as
    { ok: true; dados: T } | { ok: false; erro: { mensagem: string } };
  if (!r.ok) throw new Error(`${canal}: ${r.erro.mensagem}`);
  return r.dados;
}

/** Perfil FICTÍCIO a partir de um registro conferido; devolve o id do perfil. */
async function semear(j: Page): Promise<string> {
  const nut = Object.fromEntries(
    (await ok<{ id: string; codigo: string }[]>(j, 'nutriente:listar', {})).map((n) => [
      n.codigo,
      n.id,
    ]),
  );
  const fonte = await ok<{ id: string }>(j, 'fonte:criar', {
    dados: {
      origem: 'estudo_individual',
      codigo: 'FICT_E2E',
      titulo: 'Fonte FICTÍCIA de teste E2E',
      autores: 'Autoria FICTÍCIA',
      ano: 2020,
      edicaoVersao: null,
      instituicaoEditora: null,
      isbnDoiUrl: null,
      dataAcesso: null,
      experimentoOrigem: null,
      laboratorio: null,
      numeroLaudo: null,
      dataLaudo: null,
      fabricante: null,
      registroProduto: null,
      metodoMedicao: null,
      limitacoesMedicao: null,
      propriedadeId: null,
      observacoes: null,
    },
  });
  const alimento = await ok<{ id: string }>(j, 'alimento:criar', {
    dados: {
      nome: 'Volumoso FICTÍCIO E2E',
      especie: 'Especie FICTÍCIA',
      cultivar: null,
      partePlanta: null,
      formaConservacao: 'fresco',
      processamento: null,
      classe: 'volumoso',
      comercial: false,
      observacoes: null,
    },
  });
  const r = await ok<{ registro: { id: string } }>(j, 'composicao:criar', {
    dados: {
      alimentoId: alimento.id,
      fonteId: fonte.id,
      referenciaLocal: 'Tabela FICTÍCIA 1',
      idadeCorteDias: 60,
      classeIdadeFonte: null,
      aditivoEnsilagem: null,
      regiao: null,
      estacao: null,
      adubacao: null,
      outrasCondicoes: null,
      nObservacoes: null,
      separadorDecimal: 'virgula',
      dataAmostra: null,
      identificacaoAmostra: null,
      observacoes: null,
    },
  });
  for (const [codigo, texto] of [
    ['MS', '50,0'],
    ['NDT', '70,0'],
    ['PB', '12,0'],
    ['Ca', '0,50'],
    ['P', '0,30'],
  ] as const)
    await ok(j, 'composicao:salvarValor', {
      registroId: r.registro.id,
      valorId: null,
      dados: {
        nutrienteId: nut[codigo],
        valorPublicado: texto,
        unidade: 'pct',
        base: codigo === 'MS' ? 'mn' : 'ms',
        tipoValor: 'media',
        desvioPadraoPublicado: null,
        minimoPublicado: null,
        maximoPublicado: null,
        nObservacoes: null,
        metodoAnaliticoFonte: null,
        formaObtencao: 'medido',
        descricaoObtencao: null,
        interpretacaoBase: null,
        referenciaLocal: null,
        observacao: null,
      },
    });
  await ok(j, 'composicao:transcrever', { id: r.registro.id, responsavel: 'Pessoa A' });
  await ok(j, 'composicao:conferir', { id: r.registro.id, responsavel: 'Pessoa B' });
  await ok(j, 'selecao:aprovarRegra', {
    codigo: 'SELECAO_5D',
    versao: 2,
    responsavel: 'Pessoa usuária',
    observacao: null,
  });
  const p = await ok<{ perfil: { id: string } }>(j, 'perfil:gravar', {
    alimentoId: alimento.id,
    idadeCorteDias: 60,
    escolhas: [],
    tipo: 'referencia_individual',
    registroId: r.registro.id,
    nutrienteId: null,
    sentido: null,
    nome: 'Perfil FICTÍCIO E2E',
    responsavel: 'Pessoa usuária',
  });
  return p.perfil.id;
}

async function irParaDieta(j: Page) {
  await j
    .getByRole('navigation', { name: 'Módulos' })
    .getByRole('link', { name: /^Nutrição de corte/ })
    .click();
  await j
    .getByRole('navigation', { name: 'Seções da nutrição' })
    .getByRole('link', { name: 'Avaliar dieta' })
    .click();
  await expect(j.getByRole('heading', { name: 'Avaliar dieta', level: 2 })).toBeVisible();
}
async function preencherESimular(j: Page, perfilId: string) {
  await j.getByLabel(/^Peso corporal médio/).fill('400');
  await j.getByLabel(/^Ganho médio diário/).fill('1');
  await j.getByLabel(/^Alimento 1: perfil/).selectOption(perfilId);
  await j.getByLabel(/^Quantidade \(kg\/dia\)/).fill('20');
  await j.getByRole('button', { name: /Avaliar \(simular, sem gravar\)/ }).click();
  await expect(j.getByTestId('resultado-avaliacao')).toBeVisible();
}

test.describe('Fase 6B-5: avaliação de dietas', () => {
  test('simular, gravar, anular, reiniciar, backup e restauração; claro e escuro a 900 px', async () => {
    const pasta = criarPastaDados();
    let aberto: AppAberto = await abrirApp(pasta.caminho);
    let j = aberto.janela;
    try {
      const perfilId = await semear(j);
      await irParaDieta(j);
      await preencherESimular(j, perfilId);
      await expect(j.getByTestId('situacao-avaliacao')).toContainText('Parcial');
      await expect(j.getByTestId('balanco-Mg')).toContainText('Indeterminado');
      await expect(j.getByTestId('versoes-avaliacao')).toContainText('SHA-256');
      expect(await ok<unknown[]>(j, 'nutricao:listarAvaliacoes', {})).toEqual([]);

      for (const t of ['claro', 'escuro'] as const) {
        if (t === 'escuro') {
          await tema(j, 'escuro');
          await preencherESimular(j, perfilId);
        }
        await j.getByTestId('balanco-PB').getByRole('button', { name: 'Por quê?' }).click();
        for (const largura of [1280, 900]) {
          await j.setViewportSize({ width: largura, height: 900 });
          await semRolagemHorizontal(j);
          await capturar(j, `dieta-simulacao-${t}-${largura}`);
        }
      }
      await tema(j, 'claro');
      await preencherESimular(j, perfilId);

      // Gravação explícita.
      await j.getByRole('button', { name: /Gravar avaliação/ }).click();
      const modal = j.getByRole('dialog');
      await modal.getByLabel(/^Nome da avaliação/).fill('Dieta FICTÍCIA E2E');
      await modal.getByLabel(/^Nome de quem grava/).fill('Pessoa usuária');
      await capturar(j, 'dieta-gravar-claro-1280');
      await modal.getByRole('button', { name: 'Gravar' }).click();
      await expect(j.getByRole('heading', { name: 'Dieta FICTÍCIA E2E', level: 2 })).toBeVisible();
      const hash = (await j.getByTestId('hash-avaliacao').textContent()) ?? '';
      expect(hash).toMatch(/[0-9a-f]{64} \(conferido\)/);
      const [gravada] = await ok<{ id: string }[]>(j, 'nutricao:listarAvaliacoes', {});
      const backup = await ok<{ id: string }>(j, 'backup:criar', {});

      // Anulação com motivo.
      await j.getByRole('button', { name: 'Anular' }).click();
      await j
        .getByRole('dialog')
        .getByLabel(/^Motivo da anulação/)
        .fill('Quantidade errada.');
      await j
        .getByRole('dialog')
        .getByLabel(/^Nome de quem anula/)
        .fill('Pessoa usuária');
      await j.getByRole('dialog').getByRole('button', { name: 'Anular' }).click();
      await expect(j.getByText('Avaliação anulada', { exact: true })).toBeVisible();
      await expect(j.getByTestId('hash-avaliacao')).toHaveText(hash);
      for (const t of ['claro', 'escuro'] as const) {
        if (t === 'escuro') await tema(j, 'escuro');
        for (const largura of [1280, 900]) {
          await j.setViewportSize({ width: largura, height: 900 });
          await semRolagemHorizontal(j);
          await capturar(j, `dieta-gravada-anulada-${t}-${largura}`);
        }
      }
      await tema(j, 'claro');

      // Reinício: a anulação e o retrato persistem.
      await fecharApp(aberto);
      aberto = await abrirApp(pasta.caminho);
      j = aberto.janela;
      await j
        .getByRole('navigation', { name: 'Módulos' })
        .getByRole('link', { name: /^Nutrição de corte/ })
        .click();
      await j
        .getByRole('navigation', { name: 'Seções da nutrição' })
        .getByRole('link', { name: 'Avaliações gravadas' })
        .click();
      const linha = j.getByTestId(`avaliacao-${gravada!.id}`);
      await expect(linha).toContainText('Anulada');
      await capturar(j, 'dieta-historico-claro-1280');

      // Restauração do backup anterior à anulação: avaliação de volta, sem a anulação.
      await ok(j, 'backup:restaurar', { id: backup.id });
      await j.reload();
      await expect(j.getByTestId(`avaliacao-${gravada!.id}`)).not.toContainText('Anulada');
      await j.getByTestId(`avaliacao-${gravada!.id}`).getByRole('link').click();
      await expect(j.getByTestId('hash-avaliacao')).toHaveText(hash);
      expect(aberto.errosNoConsole).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });
});
