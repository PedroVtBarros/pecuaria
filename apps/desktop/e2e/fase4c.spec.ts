import { expect, test, type Page } from '@playwright/test';
import type { AnimalResumo, Lote, NegociacaoDetalhe, Propriedade } from '@pecuaria/shared-types';
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

test.describe('Fase 4C: compra e venda de animais', () => {
  test('compra, venda, cancelamento da venda, custo anterior, desfazer saída e reinício', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    let j = aberto.janela;
    try {
      const p = await api<Propriedade>(j, 'propriedade:criar', {
        dados: {
          nome: 'Fazenda dos animais E2E',
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
          nome: 'Engorda E2E',
          finalidade: 'engorda',
          dataFormacao: '2026-01-01',
          areaId: null,
          observacoes: null,
        },
      });
      await j.reload();

      // Compra de dois animais por R$ 1.000,00, com identificações geradas.
      await ir(j, '/financeiro/animais', 'Compras e vendas de animais');
      await expect(j.getByText('Nenhuma negociação encontrada')).toBeVisible();
      await j.getByRole('button', { name: 'Registrar compra' }).click();
      let d = j.getByRole('dialog');
      await d.getByLabel('Valor total da operação').fill('1.000,00');
      await d.getByLabel('Lote de destino (opcional)').selectOption({ label: 'Engorda E2E' });
      await d.getByLabel('Prefixo da identificação').fill('E2E-');
      await d.getByLabel('Quantidade').fill('2');
      await d.getByRole('button', { name: 'Gerar identificações' }).click();
      await expect(d.getByTestId('soma-alocacao')).toHaveText('R$ 1.000,00');
      await d.getByRole('button', { name: 'Registrar compra' }).click();
      await expect(
        j.getByRole('heading', { name: 'Compra de 2 animal(is)', level: 2 }),
      ).toBeVisible();
      const valores = j.getByTestId('valores-negociacao');
      await expect(valores).toContainText('R$ 1.000,00');
      await expect(valores).toContainText('A pagar');
      await expect(j.getByTestId('tabela-itens-negociacao')).toContainText('R$ 500,00');

      // Nenhum pagamento foi criado sozinho.
      const compra = (
        await api<{ itens: { id: string; lancamentoId: string }[] }>(j, 'negociacao:listar', {
          propriedadeId: p.id,
        })
      ).itens[0]!;
      const lancamento = await api<{ pagoCentavos: number; saldoEmAbertoCentavos: number }>(
        j,
        'lancamento:obter',
        { id: compra.lancamentoId },
      );
      expect(lancamento).toMatchObject({ pagoCentavos: 0, saldoEmAbertoCentavos: 100000 });

      // Venda de um dos animais por R$ 700,00.
      await ir(j, '/financeiro/animais', 'Compras e vendas de animais');
      await j.getByRole('button', { name: 'Registrar venda' }).click();
      d = j.getByRole('dialog');
      await d.getByRole('button', { name: /E2E-1/ }).click();
      await d.getByLabel('Valor total da operação').fill('700,00');
      await d.getByRole('button', { name: 'Registrar venda' }).click();
      await expect(
        j.getByRole('heading', { name: 'Venda de 1 animal(is)', level: 2 }),
      ).toBeVisible();
      await expect(j.getByTestId('valores-negociacao')).toContainText('R$ 700,00');
      const idVenda = await j.evaluate(() => window.location.hash.split('/').at(-1)!);
      const animais = await api<{ itens: AnimalResumo[] }>(j, 'animal:listar', {
        propriedadeId: p.id,
        filtros: { status: 'todos' },
      });
      const e1 = animais.itens.find((a) => a.identificacao === 'E2E-1')!;
      expect(e1.status).toBe('vendido');

      // Cancelar a venda devolve o animal ao lote, sem apagar a saída.
      await j.getByRole('button', { name: 'Cancelar venda' }).click();
      d = j.getByRole('dialog');
      await d.getByLabel(/Motivo do cancelamento/).fill('Comprador desistiu');
      await d.getByRole('button', { name: 'Cancelar negociação' }).click();
      await expect(d).not.toBeVisible();
      await expect(j.getByText('Negociação cancelada')).toBeVisible();
      const depois = await api<{ status: string; lote: { id: string } | null }>(j, 'animal:obter', {
        id: e1.id,
      });
      expect(depois.status).toBe('ativo');
      expect(depois.lote?.id).toBe(lote.id);

      // Aba Custo do animal comprado.
      await ir(j, `/rebanho/animais/${e1.id}`, 'E2E-1');
      await j.getByRole('tab', { name: 'Custo' }).click();
      await expect(j.getByTestId('custo-do-animal')).toContainText('Compra registrada no sistema');
      await expect(j.getByTestId('custo-do-animal')).toContainText('R$ 500,00');

      // Animal nascido: formação não apurada; custo anterior informado pela tela.
      const nascido = await api<{ id: string }>(j, 'animal:criar', {
        propriedadeId: p.id,
        dados: {
          identificacao: 'NASC-1',
          nome: null,
          sexo: 'F',
          condicaoSexual: 'femea',
          categoria: 'bezerra',
          aptidao: 'leite',
          racaId: null,
          dataNascimento: '2026-01-10',
          dataNascimentoEstimada: false,
          maeId: null,
          paiId: null,
          origem: 'nascido',
          observacoes: null,
        },
        entrada: { data: '2026-01-10', loteId: null, pesoVivoKg: null, metodoPesagem: null },
      });
      await ir(j, `/rebanho/animais/${nascido.id}`, 'NASC-1');
      await j.getByRole('tab', { name: 'Custo' }).click();
      const aba = j.getByTestId('custo-do-animal');
      await expect(aba).toContainText('Não aplicável (nascido na propriedade)');
      await expect(aba).toContainText('Não apurado');
      await aba.getByRole('button', { name: 'Informar custo anterior' }).click();
      d = j.getByRole('dialog');
      await d.getByLabel('Valor acumulado').fill('250,00');
      await d.getByLabel('Data de referência').fill(hoje());
      await d.getByLabel('Descrição').fill('Criação até o cadastro');
      await d.getByLabel('Origem da informação').fill('Caderno de campo');
      await d.getByLabel('Justificativa').fill('Nascida antes do sistema');
      await d.getByRole('button', { name: 'Registrar custo anterior' }).click();
      await expect(d).not.toBeVisible();
      await expect(aba).toContainText('Informada pelo usuário (custo anterior)');
      await expect(aba).toContainText('R$ 250,00');
      // Custo anterior não é lançamento: o caixa continua vazio.
      const fluxo = await api<{
        realizado: { movimentos: number };
        previsto: { parcelas: number };
      }>(j, 'fluxo:obter', {
        propriedadeId: p.id,
        dataInicial: '2026-01-01',
        dataFinal: hoje(),
        granularidade: 'mes',
      });
      expect(fluxo.realizado.movimentos).toBe(0);

      // Desfazer saída (animal morto) pela tela.
      await api(j, 'animal:registrarSaida', {
        id: e1.id,
        tipo: 'morto',
        data: hoje(),
        motivo: 'Acidente',
      });
      await ir(j, `/rebanho/animais/${e1.id}`, 'E2E-1');
      await j.getByRole('button', { name: 'Desfazer saída' }).click();
      d = j.getByRole('dialog');
      await d.getByLabel('Motivo').fill('Registro por engano');
      await d.getByRole('button', { name: 'Desfazer saída' }).click();
      await expect(d).not.toBeVisible();
      await expect(j.getByRole('button', { name: 'Desfazer saída' })).toHaveCount(0);

      // Reinício: tudo persiste.
      await fecharApp(aberto);
      aberto = await abrirApp(pasta.caminho);
      j = aberto.janela;
      await ir(j, `/financeiro/animais/${idVenda}`, 'Venda de 1 animal(is)');
      await expect(j.getByText('Negociação cancelada')).toBeVisible();
      const lista = await api<{ total: number }>(j, 'negociacao:listar', {
        propriedadeId: p.id,
        incluirCanceladas: true,
      });
      expect(lista.total).toBe(2);
      const detalhe = await api<NegociacaoDetalhe>(j, 'negociacao:obter', { id: compra.id });
      expect(detalhe.itens.map((i) => i.valorAlocadoCentavos)).toEqual([50000, 50000]);

      // Sem rolagem horizontal em janela estreita.
      await j.setViewportSize({ width: 900, height: 800 });
      for (const [rota, titulo] of [
        ['/financeiro/animais', 'Compras e vendas de animais'],
        [`/financeiro/animais/${compra.id}`, 'Compra de 2 animal(is)'],
        ['/financeiro/custo-anterior', 'Custo anterior ao sistema'],
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
