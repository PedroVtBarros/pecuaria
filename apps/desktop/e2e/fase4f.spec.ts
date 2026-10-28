import { expect, test, type Page } from '@playwright/test';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { CategoriaFinanceira, Lote, Propriedade } from '@pecuaria/shared-types';
import { abrirApp, chamarApi, criarPastaDados, fecharApp } from './apoio';

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
function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const movimento = (tipo: string, quantidade: number, extra: Record<string, unknown> = {}) => ({
  data: hoje(),
  tipo,
  quantidade,
  unidadeBase: 'kg',
  loteEstoqueId: null,
  custoEntradaCentavos: null,
  destino: tipo.startsWith('entrada') ? null : 'propriedade',
  loteAnimalId: null,
  animalId: null,
  documentoOrigemId: null,
  motivo: null,
  observacao: null,
  ...extra,
});

test.describe('Fase 4F: produção própria', () => {
  test('centro de produção, vínculo de custos, encerramento no estoque, consumo pelos animais e reinício', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    let j = aberto.janela;
    try {
      const p = await api<Propriedade>(j, 'propriedade:criar', {
        dados: {
          nome: 'Fazenda da capineira E2E',
          municipio: null,
          uf: null,
          areaTotalHa: null,
          tipoExploracao: 'misto',
          observacoes: null,
        },
      });
      await api(j, 'configuracao:definir', { chave: 'interface.propriedadeAtual', valor: p.id });
      const lote = await api<Lote>(j, 'lote:criar', {
        propriedadeId: p.id,
        dados: {
          nome: 'Lote A',
          finalidade: 'engorda',
          dataFormacao: '2026-01-01',
          areaId: null,
          observacoes: null,
        },
      });
      for (const identificacao of ['a1', 'a2'])
        await api(j, 'animal:criar', {
          propriedadeId: p.id,
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
          entrada: { data: '2026-01-01', loteId: lote.id, pesoVivoKg: null, metodoPesagem: null },
        });
      const item = (nome: string, tipo: string) =>
        api<{ id: string }>(j, 'estoque:criarItem', {
          propriedadeId: p.id,
          dados: {
            nome,
            tipo,
            unidadeBase: 'kg',
            controleLote: false,
            estoqueMinimo: null,
            produtoSanitarioId: null,
            ativo: true,
            observacoes: null,
          },
        });
      const adubo = await item('Adubo E2E', 'outro');
      const silagem = await item('Silagem E2E', 'silagem');
      await api(j, 'estoque:registrar', {
        itemId: adubo.id,
        requisicaoId: gerarUuidV7(),
        dados: movimento('entrada_compra', 1000, { custoEntradaCentavos: 100000 }),
      });
      await api(j, 'estoque:registrar', {
        itemId: adubo.id,
        requisicaoId: gerarUuidV7(),
        dados: movimento('saida_consumo', 200),
      });
      const categorias = await api<CategoriaFinanceira[]>(j, 'categoriaFinanceira:listar', {
        incluirInativas: false,
      });
      await api(j, 'lancamento:criar', {
        requisicaoId: gerarUuidV7(),
        dados: {
          propriedadeId: p.id,
          categoriaId: categorias.find((c) => c.nome.startsWith('Alimentação (despesa direta'))!.id,
          pessoaId: null,
          dataCompetencia: hoje(),
          valorTotalCentavos: 30000,
          descricao: 'Diesel E2E',
          documentoNumero: null,
          atividade: 'nao_definida',
          destino: { tipo: 'propriedade' },
          quantidade: null,
          comportamentoCusto: null,
          observacoes: null,
          condicao: { tipo: 'nao_informada' },
        },
      });
      await j.reload();

      // Centro de produção pela tela.
      await ir(j, '/financeiro/producao', 'Produção própria');
      await expect(j.getByText('Nenhum centro de produção')).toBeVisible();
      await j.getByRole('button', { name: 'Novo centro' }).click();
      let d = j.getByRole('dialog');
      await d.getByLabel(/^Nome/).fill('Capineira E2E');
      await d.getByLabel(/Item produzido/).selectOption({ label: 'Silagem E2E (kg)' });
      await d.getByRole('button', { name: 'Criar centro' }).click();
      await expect(j.getByRole('heading', { name: 'Capineira E2E', level: 2 })).toBeVisible();
      await expect(j.getByRole('button', { name: 'Encerrar' })).toBeDisabled();

      // Vincula a despesa e o consumo de adubo: R$ 300,00 + R$ 200,00.
      await j.getByRole('button', { name: 'Vincular custos' }).click();
      d = j.getByRole('dialog');
      await d.getByRole('button', { name: 'Vincular Diesel E2E' }).click();
      await d.getByRole('button', { name: /Vincular consumo de Adubo E2E/ }).click();
      await expect(d.getByText('Nenhuma despesa disponível.')).toBeVisible();
      await j.keyboard.press('Escape');
      await expect(j.getByTestId('custo-centro')).toContainText('R$ 500,00');
      const custos = await api<{ naoAlocado: { apuracao: { valorConhecidoCentavos: number } } }>(
        j,
        'custo:resumo',
        { propriedadeId: p.id },
      );
      expect(custos.naoAlocado.apuracao.valorConhecidoCentavos).toBe(0);

      // Encerrar com 10.000 kg colhidos: entrada de produção de R$ 500,00 no estoque.
      await j.getByRole('button', { name: 'Encerrar' }).click();
      d = j.getByRole('dialog');
      await d.getByLabel(/Quantidade colhida/).fill('10000');
      await d.getByRole('button', { name: 'Encerrar e lançar no estoque' }).click();
      await expect(d).not.toBeVisible();
      await expect(j.getByText('Encerrado', { exact: true })).toBeVisible();
      await expect(j.getByTestId('custo-centro')).toContainText('10.000 kg');
      const est = await api<{ item: { saldo: number; valorSaldoCentavos: number } }>(
        j,
        'estoque:obter',
        {
          id: silagem.id,
        },
      );
      expect(est.item).toMatchObject({ saldo: 10000, valorSaldoCentavos: 50000 });

      // 1.000 kg no lote: R$ 50,00 chegam aos animais pelo consumo, uma só vez.
      await api(j, 'estoque:registrar', {
        itemId: silagem.id,
        requisicaoId: gerarUuidV7(),
        dados: movimento('saida_consumo', 1000, { destino: 'lote', loteAnimalId: lote.id }),
      });
      const depois = await api<{ animais: { apuracao: { valorConhecidoCentavos: number } } }>(
        j,
        'custo:resumo',
        { propriedadeId: p.id },
      );
      expect(depois.animais.apuracao.valorConhecidoCentavos).toBe(5000);

      // Reabrir é recusado: o produto já foi consumido além do que sobraria.
      await j.getByRole('button', { name: 'Reabrir' }).click();
      d = j.getByRole('dialog');
      await d.getByLabel('Motivo').fill('Revisar custos');
      await d.getByRole('button', { name: 'Reabrir' }).click();
      await expect(d.getByText(/negativ/i)).toBeVisible();
      await j.keyboard.press('Escape');

      // Reinício: tudo persiste.
      await fecharApp(aberto);
      aberto = await abrirApp(pasta.caminho);
      j = aberto.janela;
      await ir(j, '/financeiro/producao', 'Produção própria');
      await expect(j.getByTestId('tabela-centros')).toContainText('Encerrado');
      await expect(j.getByTestId('tabela-centros')).toContainText('R$ 500,00');

      await j.setViewportSize({ width: 900, height: 800 });
      await j.getByRole('link', { name: 'Capineira E2E' }).click();
      await expect(j.getByRole('heading', { name: 'Capineira E2E', level: 2 })).toBeVisible();
      for (const [rota, titulo] of [
        ['/financeiro/producao', 'Produção própria'],
        ['/financeiro/custos', 'Custos por lote e animal'],
      ] as const) {
        await ir(j, rota, titulo);
        await expect
          .poll(() => j.locator('main').evaluate((e) => e.scrollWidth - e.clientWidth))
          .toBeLessThanOrEqual(0);
      }
      expect(aberto.errosNoConsole).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });
});
