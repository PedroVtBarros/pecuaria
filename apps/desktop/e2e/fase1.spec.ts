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

async function irPara(janela: Page, aba: string): Promise<void> {
  await janela
    .getByRole('navigation', { name: 'Módulos' })
    .getByRole('link', { name: /^Propriedades e rebanho/ })
    .click();
  await janela
    .getByRole('navigation', { name: 'Seções do rebanho' })
    .getByRole('link', { name: aba, exact: true })
    .click();
}

async function criarLote(janela: Page, nome: string, formacao: string): Promise<void> {
  await irPara(janela, 'Lotes');
  await janela
    .getByRole('button', { name: /Novo lote|Criar lote/ })
    .first()
    .click();
  const modal = janela.getByRole('dialog');
  await modal.getByLabel('Nome').fill(nome);
  await modal.getByLabel('Data de formação').fill(formacao);
  await modal.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(janela.locator(`tr[data-lote="${nome}"]`)).toBeVisible();
}

test.describe('Fase 1: cadastro e gestão do rebanho', () => {
  test('fluxo completo pela interface e persistência após reiniciar', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    const { janela } = aberto;
    const entrada = dia(-60);
    const segundaPesagem = dia(-30);
    try {
      // Propriedade pelo atalho do cabeçalho
      await janela.getByRole('link', { name: 'Cadastrar propriedade' }).first().click();
      const modalProp = janela.getByRole('dialog');
      await modalProp.getByLabel('Nome').fill('Fazenda E2E');
      await modalProp.getByLabel('UF').selectOption('MG');
      await modalProp.getByRole('button', { name: 'Cadastrar' }).click();
      await expect(janela.getByText('Propriedade cadastrada.')).toBeVisible();
      await expect(janela.getByRole('combobox', { name: 'Propriedade' })).toHaveValue(/.+/);

      await criarLote(janela, 'Recria', dia(-90));
      await criarLote(janela, 'Engorda', dia(-90));

      // Novo animal com peso de entrada
      await irPara(janela, 'Animais');
      await janela.getByRole('button', { name: 'Novo animal' }).click();
      // A troca de tela é uma transição do React Router: espera o formulário antes de
      // preencher, senão o texto cai na busca da lista ("Buscar por identificação").
      await expect(janela.getByRole('heading', { level: 2, name: 'Novo animal' })).toBeVisible();
      await janela.getByLabel('Identificação').fill('BR-E2E-1');
      await janela.getByLabel('Nome', { exact: true }).fill('Estrela');
      await janela.getByLabel('Categoria').selectOption({ label: 'Novilha' });
      await janela.getByLabel('Raça').selectOption({ label: 'Nelore' });
      await janela.getByLabel('Data de nascimento', { exact: true }).fill(dia(-700));
      await janela.getByLabel('Data de entrada').fill(entrada);
      await janela.getByLabel('Lote', { exact: true }).selectOption({ label: 'Recria' });
      await janela.getByLabel('Peso vivo de entrada (kg)').fill('300');
      await janela.getByRole('button', { name: 'Cadastrar animal' }).click();
      await expect(janela.getByRole('heading', { level: 2, name: 'BR-E2E-1' })).toBeVisible();
      await expect(janela.getByText('Último peso vivo:')).toContainText('300 kg');

      // Segunda pesagem e GMD observado: (330 − 300) / 30 dias = 1,000 kg/dia
      await janela.getByRole('tab', { name: 'Pesagens e GMD' }).click();
      await expect(janela.getByText('GMD ainda não disponível')).toBeVisible();
      await janela.getByRole('button', { name: 'Registrar pesagem' }).click();
      const modalPeso = janela.getByRole('dialog');
      await modalPeso.getByLabel('Data').fill(segundaPesagem);
      await modalPeso.getByLabel('Peso vivo (kg)').fill('330');
      await modalPeso.getByRole('button', { name: 'Registrar' }).click();
      await expect(janela.getByText('Pesagem registrada.')).toBeVisible();
      await expect(janela.getByTestId('gmd-valor').first()).toHaveText('1,000 kg/dia');
      await expect(janela.getByTestId('tabela-pesagens').locator('tbody tr')).toHaveCount(2);

      // Entrada inválida: peso não numérico não é enviado
      await janela.getByRole('button', { name: 'Registrar pesagem' }).click();
      const modalInvalido = janela.getByRole('dialog');
      await modalInvalido.getByLabel('Peso vivo (kg)').fill('abc');
      await modalInvalido.getByRole('button', { name: 'Registrar' }).click();
      await expect(modalInvalido.getByText('Peso vivo deve ser um número.')).toBeVisible();
      // Pesagem duplicada na mesma data: recusada pelo processo principal
      await modalInvalido.getByLabel('Data').fill(segundaPesagem);
      await modalInvalido.getByLabel('Peso vivo (kg)').fill('331');
      await modalInvalido.getByRole('button', { name: 'Registrar' }).click();
      await expect(
        modalInvalido.getByText(`Já existe uma pesagem deste animal em ${br(segundaPesagem)}.`),
      ).toBeVisible();
      await modalInvalido.getByRole('button', { name: 'Cancelar' }).click();

      // Transferência de lote
      await janela.getByRole('button', { name: 'Transferir' }).click();
      const modalTransf = janela.getByRole('dialog');
      await modalTransf.getByLabel('Lote de destino').selectOption({ label: 'Engorda (0)' });
      await modalTransf.getByLabel('Motivo').fill('Fim da recria');
      await modalTransf.getByRole('button', { name: 'Transferir' }).click();
      await expect(janela.getByText('Animal transferido.')).toBeVisible();

      // Edição com motivo
      await janela.getByRole('button', { name: 'Editar' }).click();
      await janela.getByLabel('Nome', { exact: true }).fill("Estrela D'Alva");
      await janela.getByLabel('Motivo da alteração').fill('Nome do registro');
      await janela.getByRole('button', { name: 'Salvar alterações' }).click();
      await expect(janela.getByText('Cadastro atualizado.')).toBeVisible();

      // Histórico preserva entrada, transferência, pesagens e alteração
      await janela.getByRole('tab', { name: 'Histórico' }).click();
      const linhaDoTempo = janela.getByTestId('linha-do-tempo');
      await expect(linhaDoTempo).toContainText('Troca de lote');
      await expect(linhaDoTempo).toContainText('Recria → Engorda');
      await expect(linhaDoTempo).toContainText('Fim da recria');
      await expect(linhaDoTempo).toContainText('Entrada no rebanho');
      await expect(linhaDoTempo).toContainText('Cadastro alterado');
      await expect(linhaDoTempo).toContainText("Nome: Estrela → Estrela D'Alva");
      await expect(linhaDoTempo).toContainText('Pesagem: 330 kg');

      // Identificação duplicada (maiúsculas e espaços não diferenciam)
      await irPara(janela, 'Animais');
      await janela.getByRole('button', { name: 'Novo animal' }).click();
      // A troca de tela é uma transição do React Router: espera o formulário antes de
      // preencher, senão o texto cai na busca da lista ("Buscar por identificação").
      await expect(janela.getByRole('heading', { level: 2, name: 'Novo animal' })).toBeVisible();
      await janela.getByLabel('Identificação').fill(' br-e2e-1 ');
      await janela.getByLabel('Categoria').selectOption({ label: 'Vaca' });
      await janela.getByRole('button', { name: 'Cadastrar animal' }).click();
      await expect(
        janela.getByText('Já existe um animal com a identificação "br-e2e-1" nesta propriedade.'),
      ).toBeVisible();
      expect(aberto.errosNoConsole).toEqual([]);
    } finally {
      await fecharApp(aberto);
    }

    // Reinício: tudo continua no banco
    aberto = await abrirApp(pasta.caminho);
    try {
      const j = aberto.janela;
      await expect(j.getByTestId('painel-animais')).toHaveText('1');
      await irPara(j, 'Animais');
      const linha = j.locator('tr[data-animal="BR-E2E-1"]');
      await expect(linha).toContainText("Estrela D'Alva");
      await expect(linha).toContainText('Engorda');
      await expect(linha).toContainText('330 kg');
      await linha.click();
      await j.getByRole('tab', { name: 'Pesagens e GMD' }).click();
      await expect(j.getByTestId('gmd-valor').first()).toHaveText('1,000 kg/dia');
      expect(lerLogs(pasta.caminho).filter((l) => l['nivel'] === 'erro')).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });

  test('transferência em lote pela lista e filtros', async () => {
    const pasta = criarPastaDados();
    const aberto = await abrirApp(pasta.caminho);
    const { janela } = aberto;
    try {
      const prop = (await chamarApi(janela, 'propriedade:criar', {
        dados: {
          nome: 'Sítio',
          municipio: null,
          uf: null,
          areaTotalHa: null,
          tipoExploracao: 'corte',
          observacoes: null,
        },
      })) as { dados: { id: string } };
      const propriedadeId = prop.dados.id;
      const lote = (await chamarApi(janela, 'lote:criar', {
        propriedadeId,
        dados: {
          nome: 'Pasto Novo',
          finalidade: 'engorda',
          dataFormacao: dia(-30),
          areaId: null,
          observacoes: null,
        },
      })) as { dados: { id: string } };
      for (const id of ['A-01', 'A-02', 'A-03']) {
        await chamarApi(janela, 'animal:criar', {
          propriedadeId,
          dados: {
            identificacao: id,
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
          entrada: { data: dia(-20), loteId: null, pesoVivoKg: null, metodoPesagem: null },
        });
      }
      await janela.reload();
      await irPara(janela, 'Animais');
      await expect(janela.locator('tr[data-animal]')).toHaveCount(3);
      await janela.getByLabel('Selecionar A-01').check();
      await janela.getByLabel('Selecionar A-03').check();
      await janela.getByRole('button', { name: 'Transferir (2)' }).click();
      const modal = janela.getByRole('dialog');
      await modal.getByLabel('Lote de destino').selectOption({ label: 'Pasto Novo (0)' });
      await modal.getByRole('button', { name: 'Transferir' }).click();
      await expect(janela.getByText('2 animais transferidos.')).toBeVisible();

      await janela.getByRole('combobox', { name: 'Lote' }).selectOption({ label: 'Pasto Novo' });
      await expect(janela.locator('tr[data-animal]')).toHaveCount(2);
      await janela.getByRole('combobox', { name: 'Lote' }).selectOption({ label: 'Sem lote' });
      await expect(janela.locator('tr[data-animal]')).toHaveCount(1);
      await expect(janela.locator('tr[data-animal="A-02"]')).toBeVisible();

      await irPara(janela, 'Lotes');
      await expect(janela.locator('tr[data-lote="Pasto Novo"]')).toContainText('2');
      void lote;
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });

  test('importação de planilha com prévia, inclusive arquivo salvo pelo Excel em Windows-1252', async () => {
    const pasta = criarPastaDados();
    const aberto = await abrirApp(pasta.caminho);
    const { janela } = aberto;
    try {
      await chamarApi(janela, 'propriedade:criar', {
        dados: {
          nome: 'Fazenda Planilha',
          municipio: null,
          uf: null,
          areaTotalHa: null,
          tipoExploracao: 'corte',
          observacoes: null,
        },
      });
      await janela.reload();
      await irPara(janela, 'Importar planilha');

      const csv =
        'identificacao;nome;sexo;categoria;raca;aptidao;origem;data_entrada;peso_kg\r\n' +
        `P-1;Ação;F;novilha;Guzerá;corte;comprado;${br(dia(-10))};280,5\r\n` +
        `P-2;;F;bezerra;;corte;comprado;${dia(-5)};\r\n`;
      // Windows-1252: os acentos ocupam um byte. Este é o formato padrão do Excel no Brasil.
      const bytes = Buffer.from(csv, 'latin1');
      await janela
        .getByTestId('arquivo-csv')
        .setInputFiles({ name: 'rebanho.csv', mimeType: 'text/csv', buffer: bytes });
      await expect(janela.getByText('2 animal(is) prontos para importar.')).toBeVisible();
      await janela.getByRole('button', { name: 'Importar 2 animal(is)' }).click();
      await expect(janela.getByText('2 animal(is) importado(s) com sucesso.')).toBeVisible();

      await irPara(janela, 'Animais');
      await expect(janela.locator('tr[data-animal="P-1"]')).toContainText('Ação');
      await expect(janela.locator('tr[data-animal="P-1"]')).toContainText('Guzerá');
      await expect(janela.locator('tr[data-animal="P-1"]')).toContainText('280,5 kg');

      // Segunda importação do mesmo arquivo: tudo recusado por duplicidade, nada gravado
      await irPara(janela, 'Importar planilha');
      await janela
        .getByTestId('arquivo-csv')
        .setInputFiles({ name: 'rebanho.csv', mimeType: 'text/csv', buffer: bytes });
      await expect(janela.getByText(/2 de 2 linha\(s\) com problema/)).toBeVisible();
      await expect(janela.getByRole('button', { name: /Importar \d+ animal/ })).toHaveCount(0);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });
});
