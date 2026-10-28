import { expect, test, type Page } from '@playwright/test';
import { abrirApp, chamarApi, criarPastaDados, fecharApp, lerLogs } from './apoio';

/** Data local AAAA-MM-DD, deslocada em dias a partir de hoje. */
function dia(deslocamento: number): string {
  const d = new Date();
  d.setDate(d.getDate() + deslocamento);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function br(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

async function api<T>(janela: Page, canal: string, entrada: unknown): Promise<T> {
  const r = (await chamarApi(janela, canal, entrada)) as { ok: boolean; dados: T; erro?: unknown };
  if (!r.ok) throw new Error(`${canal}: ${JSON.stringify(r.erro)}`);
  return r.dados;
}

async function irParaManejo(janela: Page, aba: string): Promise<void> {
  await janela
    .getByRole('navigation', { name: 'Módulos' })
    .getByRole('link', { name: /^Sanidade e manejo/ })
    .click();
  await janela
    .getByRole('navigation', { name: 'Seções de sanidade e manejo' })
    .getByRole('link', { name: aba, exact: true })
    .click();
}

/** Navega dentro do app (mudança de hash), como os links do HashRouter. */
async function irParaLote(janela: Page, loteId: string, nome = 'Recria'): Promise<void> {
  await janela.evaluate((id) => {
    window.location.hash = `#/rebanho/lotes/${id}`;
  }, loteId);
  await expect(janela.getByRole('heading', { level: 2, name: nome })).toBeVisible();
}

test.describe('Fase 2: pesagens, evolução e sanidade', () => {
  test('pesagem em lote, alertas, gráficos, sanidade coletiva e persistência', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    const { janela } = aberto;
    const entrada = dia(-60);
    let loteId = '';
    try {
      // Base mínima pela API (o cadastro pela interface já é testado na Fase 1).
      const propriedade = await api<{ id: string }>(janela, 'propriedade:criar', {
        dados: {
          nome: 'Fazenda Fase 2',
          municipio: null,
          uf: null,
          areaTotalHa: null,
          tipoExploracao: 'corte',
          observacoes: null,
        },
      });
      const lote = await api<{ id: string }>(janela, 'lote:criar', {
        propriedadeId: propriedade.id,
        dados: {
          nome: 'Recria',
          finalidade: 'recria',
          dataFormacao: dia(-90),
          areaId: null,
          observacoes: null,
        },
      });
      loteId = lote.id;
      const ids: Record<string, string> = {};
      for (const [identificacao, peso] of [
        ['R-1', 300],
        ['R-2', 280],
        ['R-3', 260],
      ] as const) {
        ids[identificacao] = (
          await api<{ id: string }>(janela, 'animal:criar', {
            propriedadeId: propriedade.id,
            dados: {
              identificacao,
              nome: null,
              sexo: 'M',
              condicaoSexual: 'castrado',
              categoria: 'garrote',
              aptidao: 'corte',
              racaId: null,
              dataNascimento: null,
              dataNascimentoEstimada: false,
              maeId: null,
              paiId: null,
              origem: 'comprado',
              observacoes: null,
            },
            entrada: { data: entrada, loteId, pesoVivoKg: peso, metodoPesagem: 'balanca' },
          })
        ).id;
      }
      await janela.reload();

      // Pesagem em lote a partir do lote
      await irParaLote(janela, loteId);
      await janela.getByRole('link', { name: 'Pesar lote' }).click();
      await expect(janela.getByRole('heading', { name: 'Pesagem em lote' })).toBeVisible();
      await janela.getByLabel('Peso de R-1').fill('330');
      await janela.getByLabel('Peso de R-1').press('Enter');
      await expect(janela.getByLabel('Peso de R-2')).toBeFocused();
      await janela.getByLabel('Peso de R-2').fill('3100'); // digitação: 310
      await expect(janela.getByTestId('contador-pesagem')).toHaveText('2 de 3 com peso');

      // Conferir antes de salvar: o peso fora do limite (e acima de 2000 kg) é recusado
      await janela.getByRole('button', { name: 'Conferir' }).click();
      await expect(janela.getByTestId('erros-R-2')).toContainText('O peso deve ficar entre');
      await janela.getByLabel('Peso de R-2').fill('31');
      await janela.getByRole('button', { name: 'Conferir' }).click();
      await expect(janela.getByTestId('alertas-R-2')).toContainText('quis dizer 310 kg?');
      await janela.getByLabel('Peso de R-2').fill('310');
      await janela.getByRole('button', { name: 'Salvar 2 pesagens' }).click();
      await expect(janela.getByText('2 pesagens registradas.')).toBeVisible();

      // Evolução do lote: gráfico e comparação entre períodos com os mesmos animais
      await irParaLote(janela, loteId);
      await expect(janela.getByTestId('grafico-evolucao-lote')).toBeVisible();
      const periodos = janela.getByTestId('tabela-periodos-lote');
      await expect(periodos).toContainText(`${br(entrada)} a ${br(dia(0))}`);
      // (330 + 310)/2 − (300 + 280)/2 = 30 kg em 60 dias = 0,500 kg/dia
      await expect(periodos).toContainText('0,500 kg/dia');
      await expect(janela.getByTestId('gmd-medio-lote')).toHaveText('0,500 kg/dia');

      // Animal: gráfico individual
      await janela.getByRole('row').filter({ hasText: 'R-1' }).first().click();
      await janela.getByRole('tab', { name: 'Pesagens e GMD' }).click();
      await expect(janela.getByTestId('grafico-peso-animal')).toBeVisible();
      await expect(janela.getByTestId('grafico-gmd-intervalos')).toBeVisible();

      // Pesagem individual atípica gera alerta sem bloquear; confirmação com justificativa
      await janela.getByRole('button', { name: 'Registrar pesagem' }).click();
      const modal = janela.getByRole('dialog');
      await modal.getByLabel('Data').fill(dia(-1));
      await modal.getByLabel('Peso vivo (kg)').fill('400');
      const previa = modal.getByTestId('alertas-previa');
      await expect(previa).toContainText('Perda de peso');
      // Perda de um dia para o outro: alerta de desempenho, em intervalo curto.
      await expect(previa).toContainText('Desempenho');
      await expect(previa).toContainText('Intervalo curto');
      await modal.getByLabel(/Justificativa/).fill('Pesado duas vezes, valor confirmado');
      await modal.getByRole('button', { name: 'Registrar' }).click();
      await expect(janela.getByText('Pesagem registrada.')).toBeVisible();
      // O alerta (perda até hoje) conta como conferido pela justificativa da pesagem nova.
      await expect(janela.getByTestId('tabela-pesagens')).toBeVisible();
      await expect(janela.getByText(/alertas? de pesagem em aberto/)).toHaveCount(0);
      await expect(
        janela.getByTestId('tabela-pesagens').locator(`tr[data-pesagem="${dia(-1)}"]`),
      ).toContainText('Conferida');

      // Registro sanitário coletivo do lote, com carência e próxima aplicação
      await irParaManejo(janela, 'Registros sanitários');
      await janela.getByRole('link', { name: 'Novo registro' }).first().click();
      await expect(
        janela.getByRole('heading', { level: 2, name: 'Novo registro sanitário' }),
      ).toBeVisible();
      await janela.getByLabel('Descrição').fill('Vacina conforme orientação do veterinário');
      await janela.getByLabel('Lote', { exact: true }).selectOption({ label: 'Recria (3)' });
      await expect(
        janela.getByTestId('tabela-animais-tratados').locator('tr[data-animal]'),
      ).toHaveCount(3);
      await janela.getByLabel('Carência para carne (dias)').fill('30');
      await janela.getByLabel('Custo total (R$)').fill('90,00');
      await janela.locator('input[type="date"]').nth(1).fill(dia(30));
      await janela.getByRole('button', { name: 'Salvar registro' }).click();
      await expect(janela.getByText('Registro salvo para 3 animais.')).toBeVisible();
      await expect(janela.getByTestId('tabela-animais-registro').locator('tbody tr')).toHaveCount(
        3,
      );
      await expect(janela.getByText('R$ 30,00 por animal')).toBeVisible();

      // Agenda e carência
      await irParaManejo(janela, 'Agenda e alertas');
      await expect(janela.getByTestId('tabela-agenda')).toContainText(br(dia(30)));
      await expect(janela.getByTestId('resumo-carencia')).toHaveText('3');
      await expect(janela.getByTestId('tabela-carencias')).toContainText(br(dia(30)));
      await expect(janela.getByTestId('aviso-carencia')).toContainText(
        'Não são garantia de liberação',
      );

      // Histórico sanitário no animal
      await janela.getByRole('link', { name: 'R-3' }).first().click();
      await janela.getByRole('tab', { name: 'Sanidade' }).click();
      await expect(janela.getByTestId('tabela-sanidade-animal')).toContainText('Vacina conforme');
      await expect(janela.getByTestId('carencias-animal')).toContainText(br(dia(30)));

      // Transferência: o lote novo não herda as pesagens de antes da entrada
      const terminacao = await api<{ id: string }>(janela, 'lote:criar', {
        propriedadeId: propriedade.id,
        dados: {
          nome: 'Terminação',
          finalidade: 'engorda',
          dataFormacao: dia(-90),
          areaId: null,
          observacoes: null,
        },
      });
      await api(janela, 'animal:transferir', {
        animalIds: [ids['R-2']],
        loteDestinoId: terminacao.id,
        data: dia(0),
        motivo: null,
      });
      await irParaLote(janela, terminacao.id, 'Terminação');
      const pontos = janela.getByTestId('tabela-pontos-lote').locator('tbody tr');
      await expect(pontos).toHaveCount(1); // só a pesagem do dia da entrada (310 kg)
      await expect(pontos.first()).toContainText('310 kg');
      await expect(janela.getByTestId('aviso-dia-da-troca')).toBeVisible();
      await expect(janela.getByTestId('gmd-medio-lote')).toHaveText('—');
      // O lote de origem continua com a história de quando R-2 estava nele.
      await irParaLote(janela, loteId);
      await expect(janela.getByTestId('gmd-medio-lote')).toHaveText('0,500 kg/dia');
      await janela.getByTestId('animais-que-passaram').locator('summary').click();
      await expect(
        janela.getByTestId('animais-que-passaram').getByRole('row').filter({ hasText: 'R-2' }),
      ).toContainText('Em outro lote ou sem lote');

      // Janela estreita: os gráficos encolhem e a página não rola para o lado.
      await janela.setViewportSize({ width: 900, height: 800 });
      await expect
        .poll(() =>
          janela.evaluate(() => {
            const main = document.querySelector('main')!;
            return main.scrollWidth - main.clientWidth;
          }),
        )
        .toBeLessThanOrEqual(0);

      // Configurações também precisam caber com os caminhos e a migration da Fase 2.
      await janela.evaluate(() => {
        window.location.hash = '#/configuracoes';
      });
      await expect(
        janela.getByText('Parâmetros operacionais, não limites científicos', { exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          janela.evaluate(() => {
            const main = document.querySelector('main')!;
            return main.scrollWidth - main.clientWidth;
          }),
        )
        .toBeLessThanOrEqual(0);
      expect(aberto.errosNoConsole).toEqual([]);
    } finally {
      await fecharApp(aberto);
    }

    // Reinício: pesagens, registros e agenda continuam no banco
    aberto = await abrirApp(pasta.caminho);
    try {
      const j = aberto.janela;
      await expect(j.getByTestId('resumo-carencia')).toHaveText('3');
      await expect(j.getByTestId('resumo-alertas-pesagem')).toHaveText('0');
      await irParaLote(j, loteId);
      await expect(j.getByTestId('gmd-medio-lote')).toBeVisible();
      await irParaManejo(j, 'Registros sanitários');
      await expect(j.getByTestId('tabela-registros').locator('tbody tr')).toHaveCount(1);
      expect(lerLogs(pasta.caminho).filter((l) => l['nivel'] === 'erro')).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });
});
