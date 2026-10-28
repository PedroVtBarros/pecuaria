import { expect, test, type Page } from '@playwright/test';
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
/** Data AAAA-MM-DD daqui a N dias, pelo relógio real do computador (o app usa o mesmo). */
function emDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.describe('Fase 4A: base financeira', () => {
  test('lançamento parcelado, pagamento parcial, estorno, renegociação, pendente de definição e reinício', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    let j = aberto.janela;
    try {
      const p = await api<Propriedade>(j, 'propriedade:criar', {
        dados: {
          nome: 'Fazenda financeira E2E',
          municipio: null,
          uf: null,
          areaTotalHa: null,
          tipoExploracao: 'misto',
          observacoes: null,
        },
      });
      await api(j, 'configuracao:definir', { chave: 'interface.propriedadeAtual', valor: p.id });
      await j.reload();

      // Navegação: o módulo está ativo e tem as três seções.
      await ir(j, '/financeiro/lancamentos', 'Lançamentos');
      await expect(j.getByRole('navigation', { name: 'Seções do financeiro' })).toBeVisible();
      await expect(j.getByText('Nenhum lançamento encontrado')).toBeVisible();

      // Novo lançamento parcelado em duas vezes, com vencimentos futuros.
      await j.getByRole('button', { name: 'Novo lançamento', exact: true }).click();
      let d = j.getByRole('dialog');
      await expect(d).toBeVisible();
      await d.getByLabel('Categoria').selectOption({ label: 'Mão de obra' });
      await d.getByLabel('Descrição').fill('Salário do vaqueiro E2E');
      await d.getByLabel('Valor da operação').fill('1.000,00');
      await d.getByLabel('Como será').selectOption('parcelado');
      await d.getByLabel('Primeiro vencimento').fill(emDias(40));
      await d.getByRole('button', { name: 'Gerar parcelas iguais' }).click();
      await expect(d.getByTestId('soma-parcelas')).toContainText('confere com o total');
      await d.getByRole('button', { name: 'Registrar lançamento' }).click();

      // Detalhe: valor da operação, a pagar e pago são números diferentes.
      await expect(
        j.getByRole('heading', { name: 'Salário do vaqueiro E2E', level: 2 }),
      ).toBeVisible();
      await expect(j.getByTestId('valor-operacao')).toHaveText('R$ 1.000,00');
      await expect(j.getByTestId('saldo-aberto')).toHaveText('R$ 1.000,00');
      await expect(j.getByTestId('valor-efetivo')).toHaveText('R$ 0,00');
      await expect(j.getByTestId('sem-pagamentos')).toBeVisible();
      await expect(j.getByTestId('situacao-lancamento')).toHaveText('A vencer');

      // Pagamento parcial (R$ 200,00 de uma parcela de R$ 500,00).
      await j.getByRole('button', { name: 'Registrar pagamento' }).first().click();
      d = j.getByRole('dialog');
      await d.getByLabel(/^Valor/).fill('200,00');
      await d.getByRole('button', { name: 'Registrar pagamento' }).click();
      await expect(d).not.toBeVisible();
      await expect(j.getByTestId('valor-efetivo')).toHaveText('R$ 200,00');
      await expect(j.getByTestId('saldo-aberto')).toHaveText('R$ 800,00');
      await expect(j.getByTestId('valor-operacao')).toHaveText('R$ 1.000,00');
      await expect(j.getByTestId('situacao-lancamento')).toHaveText('Parcialmente pago');

      // Estorno auditável: o pagamento continua visível, marcado como estornado.
      await j.getByRole('button', { name: 'Estornar', exact: true }).click();
      d = j.getByRole('dialog');
      await d.getByRole('textbox', { name: 'Motivo' }).fill('Valor lançado em duplicidade');
      await d.getByRole('button', { name: 'Estornar', exact: true }).click();
      await expect(d).not.toBeVisible();
      await expect(j.getByTestId('valor-efetivo')).toHaveText('R$ 0,00');
      await expect(j.getByTestId('tabela-pagamentos')).toContainText(
        'Estornado: Valor lançado em duplicidade',
      );

      // Paga de novo e renegocia o que está em aberto.
      await j.getByRole('button', { name: 'Registrar pagamento' }).first().click();
      d = j.getByRole('dialog');
      await d.getByLabel(/^Valor/).fill('200,00');
      await d.getByRole('button', { name: 'Registrar pagamento' }).click();
      await expect(d).not.toBeVisible();
      await expect(j.getByTestId('valor-efetivo')).toHaveText('R$ 200,00');
      await j.getByRole('button', { name: 'Renegociar', exact: true }).click();
      d = j.getByRole('dialog');
      await expect(d.getByTestId('resumo-renegociacao')).toContainText('R$ 800,00');
      await d.getByLabel('Primeiro vencimento').fill(emDias(70));
      await d.getByRole('button', { name: 'Gerar parcelas iguais' }).click();
      await expect(d.getByTestId('soma-parcelas')).toContainText('confere com o total');
      await d.getByLabel('Motivo da renegociação').fill('Novo prazo combinado');
      await d.getByRole('button', { name: 'Renegociar', exact: true }).click();
      await expect(d).not.toBeVisible();
      await expect(j.getByTestId('valor-operacao')).toHaveText('R$ 1.000,00');
      await expect(j.getByTestId('valor-efetivo')).toHaveText('R$ 200,00');
      await expect(j.getByTestId('saldo-aberto')).toHaveText('R$ 800,00');
      await expect(j.getByTestId('tabela-parcelas')).toContainText('Substituída');
      const id = await j.evaluate(() => window.location.hash.split('/').at(-1)!);

      // Condição de pagamento não informada: pendente de definição, nunca zero.
      await ir(j, '/financeiro/lancamentos', 'Lançamentos');
      await j.getByRole('button', { name: 'Novo lançamento', exact: true }).click();
      d = j.getByRole('dialog');
      await d.getByLabel('Categoria').selectOption({ label: 'Outras despesas' });
      await d.getByLabel('Descrição').fill('Despesa sem condição E2E');
      await d.getByLabel('Valor da operação').fill('350,00');
      await d.getByLabel('Como será').selectOption('nao_informada');
      await expect(
        d.getByText('O lançamento ficará pendente de definição financeira'),
      ).toBeVisible();
      await d.getByRole('button', { name: 'Registrar lançamento' }).click();
      await expect(
        j.getByText('Pendente de definição financeira', { exact: true }).first(),
      ).toBeVisible();
      await expect(j.getByTestId('saldo-aberto')).toHaveText('A definir');
      await expect(j.getByTestId('valor-efetivo')).toHaveText('R$ 0,00');
      await expect(j.getByTestId('tabela-parcelas')).toHaveCount(0);
      const idPendente = await j.evaluate(() => window.location.hash.split('/').at(-1)!);

      // Lista: os dois lançamentos, cada um com seus três valores.
      await ir(j, '/financeiro/lancamentos', 'Lançamentos');
      const tabela = j.getByTestId('tabela-lancamentos');
      await expect(tabela.getByRole('row')).toHaveCount(3);
      await expect(
        tabela.getByRole('row').filter({ hasText: 'Despesa sem condição E2E' }),
      ).toContainText('A definir');
      await expect(
        tabela.getByRole('row').filter({ hasText: 'Salário do vaqueiro E2E' }),
      ).toContainText('R$ 800,00');

      // Categorias sugeridas e contrapartes (cadastro começa vazio).
      await ir(j, '/financeiro/categorias', 'Categorias');
      await expect(j.getByTestId('tabela-categorias')).toContainText('Compra de animais');
      await ir(j, '/financeiro/contrapartes', 'Contrapartes');
      await expect(j.getByText('Nenhuma contraparte cadastrada')).toBeVisible();

      // Reinício: tudo persiste.
      await fecharApp(aberto);
      aberto = await abrirApp(pasta.caminho);
      j = aberto.janela;
      await ir(j, `/financeiro/lancamentos/${id}`, 'Salário do vaqueiro E2E');
      await expect(j.getByTestId('valor-operacao')).toHaveText('R$ 1.000,00');
      await expect(j.getByTestId('valor-efetivo')).toHaveText('R$ 200,00');
      await expect(j.getByTestId('saldo-aberto')).toHaveText('R$ 800,00');
      await ir(j, `/financeiro/lancamentos/${idPendente}`, 'Despesa sem condição E2E');
      await expect(j.getByTestId('saldo-aberto')).toHaveText('A definir');

      // Integridade pelo banco e nada financeiro criado por conta própria.
      const lista = await api<{ total: number }>(j, 'lancamento:listar', { propriedadeId: p.id });
      expect(lista.total).toBe(2);

      // Sem rolagem horizontal da página em janela estreita.
      await j.setViewportSize({ width: 900, height: 800 });
      for (const [rota, titulo] of [
        ['/financeiro/lancamentos', 'Lançamentos'],
        [`/financeiro/lancamentos/${id}`, 'Salário do vaqueiro E2E'],
        ['/financeiro/categorias', 'Categorias'],
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
