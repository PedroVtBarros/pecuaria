import { expect, test, type Locator, type Page } from '@playwright/test';
import type {
  InfoBackup,
  ItemEstoque,
  Nutriente,
  Propriedade,
  RegistroDetalhe,
  ResumoAlimento,
} from '@pecuaria/shared-types';
import { abrirApp, chamarApi, criarPastaDados, fecharApp } from './apoio';

/* Nomes e números FICTÍCIOS (CLAUDE.md, regra 1): provam o fluxo, não composição. */
async function api<T>(janela: Page, canal: string, entrada: unknown): Promise<T> {
  const r = (await chamarApi(janela, canal, entrada)) as { ok: boolean; dados: T; erro: unknown };
  if (!r.ok) throw new Error(`${canal}: ${JSON.stringify(r.erro)}`);
  return r.dados;
}
async function ir(j: Page, rota: string, titulo: string) {
  await j.evaluate((r) => {
    window.location.hash = `#${r}`;
  }, rota);
  await expect(j.getByRole('heading', { name: titulo, exact: true, level: 2 })).toBeVisible();
}
async function base(j: Page) {
  const p = await api<Propriedade>(j, 'propriedade:criar', {
    dados: {
      nome: 'Fazenda alimentos E2E',
      municipio: null,
      uf: null,
      areaTotalHa: null,
      tipoExploracao: 'misto',
      observacoes: null,
    },
  });
  await api(j, 'configuracao:definir', { chave: 'interface.propriedadeAtual', valor: p.id });
  await j.reload();
  return p;
}
/** Rótulo do campo com ou sem o asterisco de obrigatório. */
function campo(d: Locator, rotulo: string): Locator {
  const escapado = rotulo.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
  return d.getByLabel(new RegExp(`^${escapado}\\*?$`));
}
async function semRolagemHorizontal(j: Page) {
  const largura = await j.evaluate(() => ({
    pagina: document.documentElement.scrollWidth,
    janela: window.innerWidth,
  }));
  expect(largura.pagina).toBeLessThanOrEqual(largura.janela);
}

test.describe('Fase 5A: banco de alimentos', () => {
  test('fonte, alimento, registro, valor, conferência, imutabilidade, nova versão, reinício e backup', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    let j = aberto.janela;
    try {
      await base(j);
      // Fonte pela tela.
      await ir(j, '/alimentos/fontes', 'Fontes');
      await j.getByRole('button', { name: 'Nova fonte', exact: true }).click();
      let d = j.getByRole('dialog');
      await campo(d, 'Origem').selectOption('estudo_individual');
      await campo(d, 'Título').fill('Fonte fictícia E2E');
      await campo(d, 'Código').fill('TESTE_E2E');
      await campo(d, 'Autores').fill('Autoria fictícia');
      await campo(d, 'Ano').fill('2020');
      await d.getByRole('button', { name: 'Salvar', exact: true }).click();
      await expect(d).not.toBeVisible();
      await expect(j.getByTestId('tabela-fontes')).toContainText('Fonte fictícia E2E');

      // Alimento pela tela; nada vem preenchido.
      await ir(j, '/alimentos', 'Banco de alimentos');
      await expect(
        j.getByText('Nenhuma tabela de referência vem preenchida.', { exact: false }),
      ).toBeVisible();
      await j.getByRole('button', { name: 'Novo alimento', exact: true }).click();
      d = j.getByRole('dialog');
      await campo(d, 'Nome').fill('Alimento de teste E2E');
      await campo(d, 'Forma de conservação').selectOption('ensilado');
      await campo(d, 'Classe').selectOption('volumoso');
      await d.getByRole('button', { name: 'Salvar', exact: true }).click();
      await expect(d).not.toBeVisible();
      await j.getByRole('link', { name: 'Alimento de teste E2E', exact: true }).click();
      await expect(
        j.getByRole('heading', { name: 'Alimento de teste E2E', level: 2 }),
      ).toBeVisible();

      // Registro e valor como publicado.
      await j.getByRole('button', { name: 'Novo registro', exact: true }).click();
      d = j.getByRole('dialog');
      await campo(d, 'Fonte').selectOption({
        label: 'Estudo individual: TESTE_E2E · Fonte fictícia E2E',
      });
      await campo(d, 'Página ou tabela').fill('Tabela fictícia 1');
      await d.getByRole('button', { name: 'Salvar', exact: true }).click();
      await expect(
        j.getByRole('heading', { name: 'Registro de composição: Alimento de teste E2E' }),
      ).toBeVisible();
      await j.getByRole('button', { name: 'Novo valor', exact: true }).click();
      d = j.getByRole('dialog');
      await campo(d, 'Nutriente (definição)').selectOption({ label: 'PB · Proteína bruta' });
      await campo(d, 'Valor como publicado').fill('12,50');
      await expect(d.getByText('Lido como 12,5 (2 casas decimais).')).toBeVisible();
      await campo(d, 'Unidade publicada').selectOption({ label: '%' });
      await campo(d, 'Base publicada').selectOption('ms');
      await campo(d, 'Tipo de valor').selectOption('media');
      await d.getByRole('button', { name: 'Salvar', exact: true }).click();
      await expect(d).not.toBeVisible();
      await expect(j.getByTestId('tabela-valores')).toContainText('12,50 % (MS)');
      const registroId = await j.evaluate(() => window.location.hash.split('/').at(-1)!);

      // Transcrever, conferir pela fila.
      await j.getByRole('button', { name: 'Marcar como transcrito', exact: true }).click();
      d = j.getByRole('dialog');
      await campo(d, 'Nome de quem transcreveu').fill('Pessoa A');
      await d.getByRole('button', { name: 'Marcar como transcrito', exact: true }).click();
      await expect(d).not.toBeVisible();
      await ir(j, '/alimentos/conferencia', 'Conferência');
      await j
        .getByTestId('tabela-conferencia')
        .getByRole('link', { name: 'Alimento de teste E2E' })
        .click();
      await j.getByRole('button', { name: 'Conferir', exact: true }).click();
      d = j.getByRole('dialog');
      await expect(d).toContainText('Tabela fictícia 1');
      await campo(d, 'Nome de quem conferiu').fill('Pessoa B');
      await d.getByRole('button', { name: 'Confirmar conferência', exact: true }).click();
      await expect(d).not.toBeVisible();
      await expect(j.getByText('Registro conferido não muda.', { exact: false })).toBeVisible();
      await expect(j.getByRole('button', { name: 'Novo valor' })).toHaveCount(0);

      // O conferido não muda nem pela API.
      const tentativa = (await chamarApi(j, 'composicao:atualizar', {
        id: registroId,
        dados: {
          alimentoId: (await api<RegistroDetalhe>(j, 'composicao:obter', { id: registroId }))
            .registro.alimentoId,
          fonteId: (await api<RegistroDetalhe>(j, 'composicao:obter', { id: registroId })).registro
            .fonte.id,
          referenciaLocal: 'Outra tabela',
          idadeCorteDias: null,
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
      })) as { ok: boolean };
      expect(tentativa.ok).toBe(false);

      // Nova versão pela tela.
      await j.getByRole('button', { name: 'Nova versão', exact: true }).click();
      d = j.getByRole('dialog');
      await campo(d, 'Motivo da correção').fill('Correção fictícia');
      await d.getByRole('button', { name: 'Criar nova versão', exact: true }).click();
      await expect(j.getByRole('button', { name: 'Novo valor', exact: true })).toBeVisible();
      await expect(j.getByTestId('tabela-valores')).toContainText('12,50 % (MS)');

      // Reinício: tudo continua, o original segue conferido até a nova versão ser conferida.
      await fecharApp(aberto);
      aberto = await abrirApp(pasta.caminho);
      j = aberto.janela;
      const original = await api<RegistroDetalhe>(j, 'composicao:obter', { id: registroId });
      expect(original.registro.status).toBe('conferido');
      expect(original.registro.sucessorId).not.toBeNull();

      // Backup e restauração.
      const backup = await api<InfoBackup>(j, 'backup:criar', { observacao: 'E2E 5A' });
      await api(j, 'composicao:descartar', {
        id: original.registro.sucessorId,
        motivo: 'Depois do backup',
      });
      await api(j, 'backup:restaurar', { id: backup.id });
      await j.reload();
      const restaurado = await api<RegistroDetalhe>(j, 'composicao:obter', {
        id: original.registro.sucessorId,
      });
      expect(restaurado.registro.descartadoEm).toBeNull();

      // 900 px sem rolagem horizontal da página.
      await j.setViewportSize({ width: 900, height: 800 });
      await ir(
        j,
        `/alimentos/registros/${registroId}`,
        'Registro de composição: Alimento de teste E2E',
      );
      await semRolagemHorizontal(j);
      await ir(j, '/alimentos/nutrientes', 'Definições de nutrientes');
      await expect(j.getByTestId('tabela-nutrientes')).toContainText(
        'Método pendente de fundamentação',
      );
      await semRolagemHorizontal(j);
      expect(aberto.errosNoConsole).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });

  test('rótulo pela tela, laudo e MS medida da propriedade e vínculo com o estoque', async () => {
    const pasta = criarPastaDados();
    const aberto = await abrirApp(pasta.caminho);
    const j = aberto.janela;
    try {
      const p = await base(j);
      const nutrientes = await api<Nutriente[]>(j, 'nutriente:listar', {});
      const ca = nutrientes.find((n) => n.codigo === 'Ca')!;
      // Rótulo pela tela.
      await ir(j, '/alimentos/produtos', 'Produtos comerciais');
      await j.getByRole('button', { name: 'Novo produto pelo rótulo', exact: true }).click();
      const d = j.getByRole('dialog');
      await campo(d, 'Nome').fill('Produto de teste E2E');
      await campo(d, 'Classe').selectOption('suplemento_mineral');
      await campo(d, 'Título do rótulo').fill('Rótulo fictício E2E');
      await campo(d, 'Fabricante').fill('Fabricante fictício');
      await campo(d, 'Nutriente 1').selectOption(ca.id);
      await campo(d, 'Valor no rótulo').fill('120');
      await campo(d, 'Unidade').selectOption({ label: 'g/kg' });
      await campo(d, 'Garantia').selectOption('minimo_garantido');
      await d.getByRole('button', { name: 'Registrar rótulo', exact: true }).click();
      await expect(
        j
          .getByText('Rótulo comercial: os valores são níveis de garantia', { exact: false })
          .first(),
      ).toBeVisible();
      await expect(j.getByTestId('tabela-valores')).toContainText('120 g/kg (MN)');

      // Laudo e MS medida pela API; aparecem só na propriedade.
      const alimento = await api<ResumoAlimento>(j, 'alimento:criar', {
        dados: {
          nome: 'Silagem de teste E2E',
          especie: null,
          cultivar: null,
          partePlanta: null,
          formaConservacao: 'ensilado',
          processamento: null,
          classe: 'volumoso',
          comercial: false,
          observacoes: null,
        },
      });
      const ms = nutrientes.find((n) => n.codigo === 'MS')!;
      await api(j, 'medicaoMs:registrar', {
        propriedadeId: p.id,
        alimentoId: alimento.id,
        fonteId: null,
        metodo: {
          titulo: 'Método fictício de secagem',
          metodoMedicao: 'Descrição fictícia',
          limitacoesMedicao: 'Limitações fictícias',
        },
        nutrienteId: ms.id,
        dataAmostra: '2026-10-05',
        identificacaoAmostra: null,
        separadorDecimal: 'virgula',
        valorPublicado: '31,4',
        tipoValor: 'valor_unico',
        nObservacoes: null,
        observacao: null,
      });
      const pb = nutrientes.find((n) => n.codigo === 'PB')!;
      await api(j, 'laudo:registrar', {
        propriedadeId: p.id,
        alimentoId: alimento.id,
        laboratorio: 'Laboratório fictício',
        numeroLaudo: 'L-E2E',
        dataLaudo: null,
        dataAmostra: '2026-10-06',
        identificacaoAmostra: null,
        observacoes: null,
        separadorDecimal: 'virgula',
        valores: [
          {
            nutrienteId: pb.id,
            valorPublicado: '8,3',
            unidade: 'pct',
            base: 'ms',
            metodoAnaliticoFonte: null,
            observacao: null,
          },
        ],
      });
      await j.reload();
      await ir(j, '/alimentos/propriedade', 'Laudos e MS medida · Fazenda alimentos E2E');
      await expect(j.getByTestId('tabela-propriedade').getByRole('row')).toHaveCount(3);
      await expect(j.getByTestId('tabela-propriedade')).toContainText('Laudo L-E2E');
      // Na ficha sem propriedade escolhida o laudo não aparece; com ela, aparece separado por origem.
      expect(
        (await api<{ registros: unknown[] }>(j, 'alimento:obter', { id: alimento.id })).registros,
      ).toEqual([]);
      await j
        .getByTestId('tabela-propriedade')
        .getByRole('row')
        .filter({ hasText: 'Medição própria' })
        .getByRole('link', { name: 'Silagem de teste E2E' })
        .click();
      await expect(
        j.getByText('Método não validado pelo sistema.', { exact: false }),
      ).toBeVisible();
      await expect(j.getByTestId('tabela-valores')).toContainText('31,4 % (MN)');

      // Vínculo com o item de estoque pela tela.
      const item = await api<ItemEstoque>(j, 'estoque:criarItem', {
        propriedadeId: p.id,
        dados: {
          nome: 'Silagem do estoque E2E',
          tipo: 'silagem',
          unidadeBase: 'kg',
          controleLote: false,
          estoqueMinimo: null,
          produtoSanitarioId: null,
          ativo: true,
          observacoes: null,
        },
      });
      // Alimento e item criados pela API, fora da tela: recarregar descarta o cache das listas.
      await j.reload();
      await ir(j, `/estoque/itens/${item.id}`, 'Silagem do estoque E2E');
      const cartao = j.getByTestId('alimento-do-item');
      await campo(cartao, 'Alimento').selectOption(alimento.id);
      await cartao.getByRole('button', { name: 'Salvar vínculo' }).click();
      await expect(cartao).toContainText('Vinculado a Silagem de teste E2E');
      expect(
        await api<{ itensEstoque: unknown[] }>(j, 'alimento:obter', { id: alimento.id }),
      ).toMatchObject({
        itensEstoque: [{ id: item.id }],
      });
      expect(aberto.errosNoConsole).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });
});
