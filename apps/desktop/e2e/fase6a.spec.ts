import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { abrirApp, chamarApi, criarPastaDados, fecharApp } from './apoio';

/*
 * Fase 6A-7: tela de exigências nutricionais pelo BR-CORTE 2023. Entradas do exemplo T-04
 * (p. 432–434); os números conferidos são os impressos no livro. Nada é gravado no banco.
 * Com PECUARIA_CAPTURAS=<pasta>, grava capturas em claro e escuro, em 1280 e 900 px.
 */
const CAPTURAS = process.env['PECUARIA_CAPTURAS'];

async function capturar(j: Page, nome: string) {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  // O app rola dentro de um contêiner: aumenta a janela até caber o conteúdo e depois volta.
  const tamanho = j.viewportSize()!;
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

test.describe('Fase 6A-7: exigências nutricionais', () => {
  test('T-04 pela tela, como foi calculado, fora do escopo e do domínio, claro e escuro a 900 px', async () => {
    const pasta = criarPastaDados();
    const aberto = await abrirApp(pasta.caminho);
    const j = aberto.janela;
    try {
      await j
        .getByRole('navigation', { name: 'Módulos' })
        .getByRole('link', { name: /^Nutrição de corte/ })
        .click();
      await expect(
        j.getByRole('heading', { name: 'Exigências do animal', level: 2 }),
      ).toBeVisible();
      await expect(j.getByText('Exigência não é dieta')).toBeVisible();

      await j.getByLabel(/^Peso corporal médio/).fill('520');
      await j.getByLabel(/^Ganho médio diário/).fill('1,4');
      await j.getByRole('button', { name: /Calcular exigências/ }).click();
      await expect(j.getByTestId('resultados-exigencias')).toBeVisible();

      // T-04 (p. 432–434), valores impressos.
      await expect(j.getByTestId('linha-CMS')).toContainText('10,62 kg/dia');
      await expect(j.getByTestId('linha-EMtotal')).toContainText('27,18 Mcal/dia');
      await expect(j.getByTestId('linha-NDT')).toContainText('7,31 kg/dia');
      await expect(j.getByTestId('linha-PB')).toContainText('1.135 g/dia');
      await expect(j.getByTestId('linha-Ca')).toContainText('27,24');
      await expect(j.getByTestId('linha-P')).toContainText('10,35');
      await expect(j.getByTestId('cms-usado')).toContainText('BRC23-C-01-03');

      await j.getByTestId('linha-PB').getByRole('button', { name: 'Como foi calculado?' }).click();
      const detalhe = j.getByTestId('detalhe-calculo');
      await expect(detalhe).toContainText('BRC23-R-10');
      await expect(detalhe).toContainText('cap. 9, p. 227');
      await expect(detalhe).toContainText('não é a proteína nem o NDT ofertados');

      for (const [t, larguras] of [
        ['claro', [1280, 900]],
        ['escuro', [1280, 900]],
      ] as const) {
        if (t === 'escuro') {
          await tema(j, 'escuro');
          await j.getByLabel(/^Peso corporal médio/).fill('520');
          await j.getByLabel(/^Ganho médio diário/).fill('1,4');
          await j.getByRole('button', { name: /Calcular exigências/ }).click();
          await expect(j.getByTestId('resultados-exigencias')).toBeVisible();
          await j
            .getByTestId('linha-Ca')
            .getByRole('button', { name: 'Como foi calculado?' })
            .click();
        }
        for (const largura of larguras) {
          await j.setViewportSize({ width: largura, height: 900 });
          await semRolagemHorizontal(j);
          await capturar(j, `exigencias-t04-${t}-${largura}`);
        }
      }

      // Fora do escopo a pasto (fêmea): aviso antes e itens sem valor, com o motivo.
      await j.setViewportSize({ width: 900, height: 900 });
      await j.getByLabel(/^Sistema de produção/).selectOption('pasto');
      await j.getByLabel(/^Classe sexual/).selectOption('femea');
      await expect(j.getByText('Categoria fora do escopo a pasto')).toBeVisible();
      await j.getByLabel(/^Consumo de suplemento/).fill('1');
      await j.getByRole('button', { name: /Calcular exigências/ }).click();
      await expect(j.getByTestId('linha-EMtotal')).toContainText('Não calculado');
      await expect(j.getByTestId('linha-EMtotal')).toContainText('Fora do escopo');
      await expect(j.getByText('Nada foi calculado para esta categoria')).toBeVisible();
      await semRolagemHorizontal(j);
      await capturar(j, 'exigencias-fora-escopo-escuro-900');

      // Fora do domínio: zebuína confinada de 500 kg; valor só no detalhe, como análise.
      await tema(j, 'claro');
      await j.getByLabel(/^Classe sexual/).selectOption('femea');
      await j.getByLabel(/^Peso corporal médio/).fill('500');
      await j.getByLabel(/^Ganho médio diário/).fill('0,8');
      await j.getByRole('button', { name: /Calcular exigências/ }).click();
      await expect(j.getByTestId('linha-EMtotal')).toContainText('Não usar para decisão');
      await j
        .getByTestId('linha-EMtotal')
        .getByRole('button', { name: 'Como foi calculado?' })
        .click();
      await expect(j.getByTestId('detalhe-calculo')).toContainText('valor só para análise');
      await semRolagemHorizontal(j);
      await capturar(j, 'exigencias-fora-dominio-claro-900');

      expect(aberto.errosNoConsole).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });
});
