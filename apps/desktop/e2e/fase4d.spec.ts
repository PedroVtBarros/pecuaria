import { expect, test, type Page } from '@playwright/test';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { Propriedade } from '@pecuaria/shared-types';
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
function emDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.describe('Fase 4D: compra de insumos e estoque', () => {
  test('compra, consumo como custo, correção, vínculo retroativo, custo sanitário e reinício', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    let j = aberto.janela;
    try {
      const p = await api<Propriedade>(j, 'propriedade:criar', {
        dados: {
          nome: 'Fazenda dos insumos E2E',
          municipio: null,
          uf: null,
          areaTotalHa: null,
          tipoExploracao: 'misto',
          observacoes: null,
        },
      });
      await api(j, 'configuracao:definir', { chave: 'interface.propriedadeAtual', valor: p.id });
      const racao = await api<{ id: string }>(j, 'estoque:criarItem', {
        propriedadeId: p.id,
        dados: {
          nome: 'Ração E2E',
          tipo: 'racao',
          unidadeBase: 'kg',
          controleLote: false,
          estoqueMinimo: null,
          produtoSanitarioId: null,
          ativo: true,
          observacoes: null,
        },
      });
      await j.reload();

      // Compra de 1.000 kg por R$ 1.000,00 pela tela.
      await ir(j, '/financeiro/insumos', 'Compras de insumos');
      await expect(j.getByText('Nenhuma compra de insumos registrada')).toBeVisible();
      await j.getByRole('button', { name: 'Registrar compra' }).click();
      let d = j.getByRole('dialog');
      await d.getByLabel(/Categoria da compra/).selectOption({ index: 1 });
      await d.getByLabel('Item 1', { exact: true }).selectOption({ label: 'Ração E2E (kg)' });
      await d
        .getByLabel(/Quantidade/)
        .first()
        .fill('1000');
      await d.getByLabel('Valor do item').fill('1.000,00');
      await expect(d.getByTestId('total-compra')).toContainText('R$ 1.000,00');
      await d.getByRole('button', { name: 'Registrar compra' }).click();
      await expect(
        j.getByRole('heading', { name: /Compra de insumos: Ração E2E/, level: 2 }),
      ).toBeVisible();
      await expect(j.getByTestId('valores-compra-insumos')).toContainText('R$ 1.000,00');
      const idCompra = await j.evaluate(() => window.location.hash.split('/').at(-1)!);
      // Nada além da compra: um lançamento, nenhum pagamento.
      const lanc = await api<{ total: number }>(j, 'lancamento:listar', { propriedadeId: p.id });
      expect(lanc.total).toBe(1);
      const l1 = await api<{ pagoCentavos: number }>(j, 'lancamento:obter', { id: idCompra });
      expect(l1.pagoCentavos).toBe(0);

      // Consumo de 400 kg: custo apropriado de R$ 400,00, sem despesa nova.
      await api(j, 'estoque:registrar', {
        itemId: racao.id,
        requisicaoId: gerarUuidV7(),
        dados: {
          data: hoje(),
          tipo: 'saida_consumo',
          quantidade: 400,
          unidadeBase: 'kg',
          loteEstoqueId: null,
          custoEntradaCentavos: null,
          destino: 'propriedade',
          loteAnimalId: null,
          animalId: null,
          documentoOrigemId: null,
          motivo: null,
          observacao: null,
        },
      });
      await ir(j, '/financeiro/consumo', 'Custos de consumo');
      await expect(j.getByTestId('resumo-consumos')).toContainText('R$ 400,00');
      await expect(j.getByTestId('resumo-consumos')).toContainText('Completo');
      expect(
        (await api<{ total: number }>(j, 'lancamento:listar', { propriedadeId: p.id })).total,
      ).toBe(1);

      // Correção do valor da compra: R$ 1.200,00; os 400 kg passam a custar R$ 480,00.
      await ir(j, `/financeiro/insumos/${idCompra}`, 'Compra de insumos: Ração E2E');
      await j.getByRole('button', { name: 'Corrigir' }).click();
      d = j.getByRole('dialog');
      await d.getByLabel(/Valor do item/).fill('1.200,00');
      await expect(d.getByTestId('resumo-correcao')).toContainText('R$ 1.200,00');
      await d.getByLabel('Primeiro vencimento').fill(emDias(30));
      await d.getByRole('button', { name: 'Gerar parcelas iguais' }).click();
      await d.getByLabel('Motivo da correção').fill('Valor da nota estava errado');
      await d.getByRole('button', { name: 'Corrigir item' }).click();
      await expect(d).not.toBeVisible();
      await expect(j.getByTestId('valores-compra-insumos')).toContainText('R$ 1.200,00');
      await ir(j, '/financeiro/consumo', 'Custos de consumo');
      await expect(j.getByTestId('resumo-consumos')).toContainText('R$ 480,00');

      // A tela de estoque recusa mexer na entrada ligada.
      const detalhe = await api<{ movimentos: { id: string; tipo: string }[] }>(
        j,
        'estoque:obter',
        { id: racao.id },
      );
      const entrada = detalhe.movimentos.find((m) => m.tipo === 'entrada_compra' && true)!;
      const recusa = (await chamarApi(j, 'estoque:cancelar', { id: entrada.id, motivo: 'x' })) as {
        ok: boolean;
        erro: { mensagem: string };
      };
      expect(recusa.ok).toBe(false);
      expect(recusa.erro.mensagem).toMatch(/pertence a uma compra de insumos/);

      // Entrada antiga sem documento: aparece em Pendências e é ligada por um novo lançamento.
      await api(j, 'estoque:registrar', {
        itemId: racao.id,
        requisicaoId: gerarUuidV7(),
        dados: {
          data: hoje(),
          tipo: 'entrada_compra',
          quantidade: 200,
          unidadeBase: 'kg',
          loteEstoqueId: null,
          custoEntradaCentavos: 50000,
          destino: null,
          loteAnimalId: null,
          animalId: null,
          documentoOrigemId: null,
          motivo: null,
          observacao: null,
        },
      });
      await ir(j, '/financeiro/pendencias', 'Pendências de estoque e financeiro');
      const tabela = j.getByTestId('tabela-entradas-sem-documento');
      await expect(tabela).toContainText('Ração E2E');
      await tabela.getByRole('button', { name: 'Ligar' }).click();
      d = j.getByRole('dialog');
      await d.getByLabel('O que fazer').selectOption('criar');
      await d.getByLabel('Categoria').selectOption({ index: 1 });
      await d.getByRole('button', { name: 'Criar lançamento e ligar' }).click();
      await expect(d).not.toBeVisible();
      await expect(j.getByText('Nada a conferir')).toBeVisible();

      // Custo sanitário: registro antigo com custo digitado conta quando não há baixa nem serviço.
      const produto = await api<{ id: string }>(j, 'produtoSanitario:criar', {
        dados: {
          nome: 'Produto E2E',
          tipo: 'outro',
          fabricante: null,
          principioAtivo: null,
          unidadeDose: null,
          carenciaCarneDias: null,
          carenciaLeiteDias: null,
          observacoes: null,
        },
      });
      const animal = await api<{ id: string }>(j, 'animal:criar', {
        propriedadeId: p.id,
        dados: {
          identificacao: 'S-1',
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
        entrada: { data: '2026-01-01', loteId: null, pesoVivoKg: null, metodoPesagem: null },
      });
      const manejo = await api<{ id: string }>(j, 'manejoSanitario:registrar', {
        propriedadeId: p.id,
        dados: {
          tipo: 'tratamento',
          data: hoje(),
          produtoId: produto.id,
          descricao: null,
          dose: null,
          unidadeDose: null,
          via: null,
          carenciaCarneDias: null,
          carenciaLeiteDias: null,
          responsavel: null,
          diagnostico: null,
          custoTotalCentavos: 7000,
          observacoes: null,
        },
        animais: [{ animalId: animal.id, dose: null }],
        consumosEstoque: [],
      });
      await j.evaluate((r) => {
        window.location.hash = `#${r}`;
      }, `/manejo/sanidade/${manejo.id}`);
      const cartao = j.getByTestId('custo-sanitario');
      await expect(cartao).toContainText('Custo apurado');
      await expect(cartao).toContainText('conta, porque não há baixa nem serviço');

      // Reinício: tudo persiste.
      await fecharApp(aberto);
      aberto = await abrirApp(pasta.caminho);
      j = aberto.janela;
      await ir(j, `/financeiro/insumos/${idCompra}`, 'Compra de insumos: Ração E2E');
      await expect(j.getByTestId('valores-compra-insumos')).toContainText('R$ 1.200,00');

      // Sem rolagem horizontal em janela estreita.
      await j.setViewportSize({ width: 900, height: 800 });
      for (const [rota, titulo] of [
        ['/financeiro/insumos', 'Compras de insumos'],
        [`/financeiro/insumos/${idCompra}`, 'Compra de insumos: Ração E2E'],
        ['/financeiro/consumo', 'Custos de consumo'],
        ['/financeiro/pendencias', 'Pendências de estoque e financeiro'],
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
