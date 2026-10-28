import { expect, test, type Page } from '@playwright/test';
import { gerarUuidV7 } from '@pecuaria/domain';
import type {
  DetalheItemEstoque,
  ItemEstoque,
  Lote,
  ManejoDetalhe,
  Propriedade,
  DadosMovimentoEstoque,
  ProdutoSanitario,
} from '@pecuaria/shared-types';
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
async function base(j: Page) {
  const p = await api<Propriedade>(j, 'propriedade:criar', {
    dados: {
      nome: 'Fazenda estoque E2E',
      municipio: null,
      uf: null,
      areaTotalHa: null,
      tipoExploracao: 'misto',
      observacoes: null,
    },
  });
  const l = await api<Lote>(j, 'lote:criar', {
    propriedadeId: p.id,
    dados: {
      nome: 'Recria E2E',
      finalidade: 'recria',
      dataFormacao: '2026-01-01',
      areaId: null,
      observacoes: null,
    },
  });
  await api(j, 'configuracao:definir', { chave: 'interface.propriedadeAtual', valor: p.id });
  await j.reload();
  return { p, l };
}
async function movimento(
  j: Page,
  tipo: DadosMovimentoEstoque['tipo'],
  quantidade: string,
  custo?: string,
) {
  await j.getByRole('button', { name: 'Registrar movimento', exact: true }).click();
  const d = j.getByRole('dialog');
  await expect(d).toBeVisible();
  await d.getByLabel('Tipo de movimentação').selectOption(tipo);
  await d.getByLabel('Quantidade (kg)').fill(quantidade);
  if (custo !== undefined) await d.getByLabel('Custo total da entrada (R$)').fill(custo);
  return d;
}
test.describe('Fase 3: estoque', () => {
  test('produção própria, consumo por lote, correção retroativa, backup e reinício', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    let j = aberto.janela;
    try {
      const { l } = await base(j);
      await ir(j, '/estoque', 'Estoque');
      await j.getByRole('button', { name: 'Novo item', exact: true }).click();
      let d = j.getByRole('dialog');
      await d.getByLabel('Nome do item').fill('Silagem própria E2E');
      await d.getByLabel('Tipo de insumo').selectOption('silagem');
      await d.getByLabel('Estoque mínimo').fill('90');
      await d.getByRole('button', { name: 'Salvar item' }).click();
      await expect(d).not.toBeVisible();
      await j.getByRole('link', { name: 'Silagem própria E2E', exact: true }).click();
      await expect(
        j.getByRole('heading', { name: 'Silagem própria E2E', exact: true }),
      ).toBeVisible();
      d = await movimento(j, 'entrada_producao', '100');
      await d.getByRole('button', { name: 'Conferir saldo e valoração' }).click();
      await expect(d.getByTestId('previa-estoque')).toContainText('Valoração incompleta');
      await d.getByRole('button', { name: 'Registrar movimento', exact: true }).click();
      await expect(j.getByTestId('saldo-estoque')).toHaveText('100 kg');
      await expect(
        j.getByRole('status').filter({ hasText: 'Há entrada com custo ainda desconhecido.' }),
      ).toBeVisible();
      d = await movimento(j, 'saida_consumo', '20');
      await d.getByLabel('Destino do consumo ou saída').selectOption('lote');
      await d.getByLabel('Lote de animais de destino').selectOption(l.id);
      await d.getByRole('button', { name: 'Registrar movimento', exact: true }).click();
      await expect(j.getByTestId('saldo-estoque')).toHaveText('80 kg');
      const itemId = await j.evaluate(() => window.location.hash.split('/').at(-1)!);
      const antes = await api<DetalheItemEstoque>(j, 'estoque:obter', { id: itemId });
      expect(antes.movimentos.find((m) => m.tipo === 'saida_consumo')).toMatchObject({
        loteAnimalId: l.id,
        custoApropriadoCentavos: null,
      });
      const linha = j
        .getByTestId('extrato-estoque')
        .getByRole('row')
        .filter({ hasText: 'Produção própria' });
      await linha.getByRole('button', { name: 'Corrigir', exact: true }).click();
      d = j.getByRole('dialog');
      await d.getByLabel('Custo total da entrada (R$)').fill('200,00');
      await d.getByLabel('Motivo da correção').fill('Custo de produção apurado');
      await d.getByRole('button', { name: 'Salvar correção' }).click();
      await expect(d).not.toBeVisible();
      const depois = await api<DetalheItemEstoque>(j, 'estoque:obter', { id: itemId });
      expect(depois.item).toMatchObject({
        saldo: 80,
        valorSaldoCentavos: 16000,
        valoracaoCompleta: true,
      });
      expect(
        depois.movimentos.find((m) => m.tipo === 'saida_consumo')?.custoApropriadoCentavos,
      ).toBe(4000);
      const backup = await api<{ id: string }>(j, 'backup:criar', { observacao: 'Fase 3 E2E' });
      d = await movimento(j, 'saida_perda', '1');
      await d.getByRole('button', { name: 'Registrar movimento', exact: true }).click();
      await expect(j.getByTestId('saldo-estoque')).toHaveText('79 kg');
      await api(j, 'backup:restaurar', { id: backup.id });
      await j.reload();
      await expect(j.getByTestId('saldo-estoque')).toHaveText('80 kg');
      await fecharApp(aberto);
      aberto = await abrirApp(pasta.caminho);
      j = aberto.janela;
      await ir(j, `/estoque/itens/${itemId}`, 'Silagem própria E2E');
      await expect(j.getByTestId('saldo-estoque')).toHaveText('80 kg');
      await j.setViewportSize({ width: 900, height: 800 });
      await expect
        .poll(() => j.locator('main').evaluate((e) => e.scrollWidth - e.clientWidth))
        .toBeLessThanOrEqual(0);
      expect(aberto.errosNoConsole).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });
  test('baixa sanitária explícita, reconciliação e estorno confirmado', async () => {
    const pasta = criarPastaDados();
    const aberto = await abrirApp(pasta.caminho);
    const j = aberto.janela;
    try {
      const { p, l } = await base(j);
      await api(j, 'animal:criar', {
        propriedadeId: p.id,
        dados: {
          identificacao: 'E-1',
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
        entrada: { data: '2026-01-01', loteId: l.id, pesoVivoKg: null, metodoPesagem: null },
      });
      const produto = await api<ProdutoSanitario>(j, 'produtoSanitario:criar', {
        dados: {
          nome: 'Produto do usuário E2E',
          tipo: 'outro',
          fabricante: null,
          principioAtivo: null,
          unidadeDose: null,
          carenciaCarneDias: null,
          carenciaLeiteDias: null,
          observacoes: null,
        },
      });
      const item = await api<ItemEstoque>(j, 'estoque:criarItem', {
        propriedadeId: p.id,
        dados: {
          nome: 'Produto físico E2E',
          tipo: 'medicamento',
          unidadeBase: 'ml',
          controleLote: false,
          estoqueMinimo: null,
          produtoSanitarioId: produto.id,
          ativo: true,
          observacoes: null,
        },
      });
      await api(j, 'estoque:registrar', {
        itemId: item.id,
        requisicaoId: gerarUuidV7(),
        dados: {
          data: '2026-01-01',
          tipo: 'entrada_compra',
          quantidade: 100,
          unidadeBase: 'ml',
          custoEntradaCentavos: 2000,
        },
      });
      await ir(j, `/manejo/sanidade/novo?lote=${l.id}`, 'Novo registro sanitário');
      await j.getByLabel('Produto', { exact: true }).selectOption(produto.id);
      await j.getByRole('button', { name: 'Informar baixa de estoque' }).click();
      await j.getByRole('button', { name: 'Adicionar baixa explícita' }).click();
      await j.getByLabel('Item para baixa').selectOption(item.id);
      await j.getByLabel('Quantidade efetivamente consumida (ml)').fill('5');
      await j.getByRole('button', { name: 'Salvar registro', exact: true }).click();
      await expect(
        j.getByRole('heading', { name: 'Produto do usuário E2E', exact: true }),
      ).toBeVisible();
      const manejoId = await j.evaluate(() => window.location.hash.split('/').at(-1)!);
      expect((await api<DetalheItemEstoque>(j, 'estoque:obter', { id: item.id })).item.saldo).toBe(
        95,
      );
      await j.getByRole('button', { name: 'Corrigir', exact: true }).click();
      let d = j.getByRole('dialog');
      await d.getByLabel('Tratamento do estoque').selectOption('reconciliar');
      await d.getByLabel('Quantidade efetivamente consumida (ml)').fill('8');
      await d.getByLabel('Motivo da correção').fill('Quantidade física conferida');
      await d.getByRole('button', { name: 'Salvar correção' }).click();
      await expect(d).not.toBeVisible();
      expect((await api<DetalheItemEstoque>(j, 'estoque:obter', { id: item.id })).item.saldo).toBe(
        92,
      );
      expect(
        (await api<ManejoDetalhe>(j, 'manejoSanitario:obter', { id: manejoId }))
          .consumosEstoque?.[0]?.quantidade,
      ).toBe(8);
      await j.getByRole('button', { name: 'Excluir registro', exact: true }).click();
      d = j.getByRole('dialog');
      await d.getByLabel('Motivo da exclusão').fill('Registro feito por engano');
      await d.getByRole('button', { name: 'Excluir', exact: true }).click();
      await expect(
        d.getByText('Confirme o tratamento do estoque antes de continuar.'),
      ).toBeVisible();
      await d.getByRole('checkbox').check();
      await d.getByRole('button', { name: 'Excluir', exact: true }).click();
      await expect(d).not.toBeVisible();
      expect((await api<DetalheItemEstoque>(j, 'estoque:obter', { id: item.id })).item.saldo).toBe(
        100,
      );
      expect(aberto.errosNoConsole).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });
});
