import { expect, test, type Page } from '@playwright/test';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { CategoriaFinanceira, Propriedade } from '@pecuaria/shared-types';
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

test.describe('Fase 4B: fluxo de caixa, contas, classificação e painel', () => {
  test('painel, fluxo realizado e previsto, contas, pagamento pela lista e classificação em lote', async () => {
    const pasta = criarPastaDados();
    const aberto = await abrirApp(pasta.caminho);
    const j = aberto.janela;
    try {
      const p = await api<Propriedade>(j, 'propriedade:criar', {
        dados: {
          nome: 'Fazenda do caixa E2E',
          municipio: null,
          uf: null,
          areaTotalHa: null,
          tipoExploracao: 'misto',
          observacoes: null,
        },
      });
      await api(j, 'configuracao:definir', { chave: 'interface.propriedadeAtual', valor: p.id });
      const categorias = await api<CategoriaFinanceira[]>(j, 'categoriaFinanceira:listar', {
        incluirInativas: false,
      });
      const cat = (nome: string) => categorias.find((c) => c.nome === nome)!;
      const maoDeObra = cat('Mão de obra');
      await api(j, 'categoriaFinanceira:atualizar', {
        id: maoDeObra.id,
        dados: {
          nome: maoDeObra.nome,
          natureza: maoDeObra.natureza,
          grupo: maoDeObra.grupo,
          tratamento: maoDeObra.tratamento,
          comportamentoCusto: 'fixo',
          ativa: true,
        },
        motivo: null,
      });
      const base = {
        propriedadeId: p.id,
        pessoaId: null,
        dataCompetencia: emDias(0),
        documentoNumero: null,
        atividade: 'nao_definida',
        destino: { tipo: 'propriedade' },
        quantidade: null,
        comportamentoCusto: null,
        observacoes: null,
      };
      const criar = (extra: Record<string, unknown>) =>
        api(j, 'lancamento:criar', { requisicaoId: gerarUuidV7(), dados: { ...base, ...extra } });
      // Despesa à vista já paga hoje (sem classificação).
      await criar({
        categoriaId: cat('Outras despesas').id,
        descricao: 'Conserto da cerca E2E',
        valorTotalCentavos: 100000,
        condicao: {
          tipo: 'a_vista',
          vencimento: emDias(0),
          pagamento: { data: emDias(0), forma: 'PIX' },
        },
      });
      // Despesa parcelada em duas de R$ 500,00, ainda sem pagamento.
      await criar({
        categoriaId: maoDeObra.id,
        descricao: 'Salário E2E',
        // Lançado antes de a categoria ter padrão: continua sem classificação até a ação em lote.
        comportamentoCusto: 'nao_classificado',
        valorTotalCentavos: 100000,
        condicao: {
          tipo: 'parcelado',
          parcelas: [
            { vencimento: emDias(10), valorCentavos: 50000 },
            { vencimento: emDias(40), valorCentavos: 50000 },
          ],
        },
      });
      // Receita vencida há 3 dias e nunca recebida.
      await criar({
        categoriaId: cat('Outras receitas').id,
        descricao: 'Venda de esterco E2E',
        valorTotalCentavos: 250000,
        condicao: { tipo: 'a_vista', vencimento: emDias(-3), pagamento: null },
      });
      // Despesa sem condição de pagamento definida.
      await criar({
        categoriaId: cat('Outras despesas').id,
        descricao: 'Serviço sem condição E2E',
        valorTotalCentavos: 35000,
        condicao: { tipo: 'nao_informada' },
      });
      await j.reload();

      // Painel: caixa, contas, competência e pendências em blocos separados.
      await ir(j, '/financeiro', 'Painel financeiro');
      await expect(j.getByTestId('bloco-caixa')).toContainText('R$ 1.000,00');
      await expect(j.getByTestId('bloco-contas')).toContainText('R$ 2.500,00');
      await expect(j.getByTestId('bloco-contas')).toContainText('R$ 1.000,00');
      await expect(j.getByTestId('bloco-pendencias')).toContainText(
        'saldo a pagar ou receber é desconhecido',
      );
      await expect(j.getByTestId('bloco-pendencias')).toContainText('sem classificação');

      // Fluxo: números pelo canal e estrutura pela tela.
      const fluxo = await api<{
        realizado: { saidasCentavos: number; entradasCentavos: number };
        previsto: {
          aPagarCentavos: number;
          aReceberCentavos: number;
          emAtrasoReceberCentavos: number;
        };
        pendentesDeDefinicao: { quantidade: number };
      }>(j, 'fluxo:obter', {
        propriedadeId: p.id,
        dataInicial: emDias(-30),
        dataFinal: emDias(60),
        granularidade: 'mes',
      });
      expect(fluxo.realizado).toMatchObject({ saidasCentavos: 100000, entradasCentavos: 0 });
      expect(fluxo.previsto).toMatchObject({
        aPagarCentavos: 100000,
        aReceberCentavos: 250000,
        emAtrasoReceberCentavos: 250000,
      });
      expect(fluxo.pendentesDeDefinicao.quantidade).toBe(1);
      await ir(j, '/financeiro/fluxo', 'Fluxo de caixa');
      await expect(j.getByTestId('fluxo-realizado')).toContainText('não é lucro nem resultado');
      await j.getByRole('tab', { name: /Previsto/ }).click();
      await expect(j.getByTestId('fluxo-previsto')).toContainText('nunca soma com o realizado');
      await expect(j.getByTestId('fluxo-previsto')).toContainText(
        'Há lançamentos sem condição de pagamento definida',
      );

      // Contas a pagar: registra um pagamento parcial direto da lista.
      await ir(j, '/financeiro/contas', 'Contas a pagar e a receber');
      const tabela = j.getByTestId('tabela-contas');
      await expect(tabela.getByRole('row')).toHaveCount(3);
      await tabela.getByRole('button', { name: 'Registrar pagamento' }).first().click();
      const d = j.getByRole('dialog');
      await expect(d).toBeVisible();
      await d.getByLabel(/^Valor/).fill('200,00');
      await d.getByRole('button', { name: 'Registrar pagamento' }).click();
      await expect(d).not.toBeVisible();
      await expect(tabela.getByRole('row').nth(1)).toContainText('R$ 300,00');
      await expect(j.getByTestId('resumo-contas')).toContainText('R$ 800,00');

      // Contas a receber: a parcela vencida aparece com o atraso em dias.
      await j.getByRole('tab', { name: 'A receber' }).click();
      await expect(j.getByTestId('tabela-contas')).toContainText('Venda de esterco E2E');
      await expect(j.getByTestId('tabela-contas')).toContainText('Atrasada há 3 dia(s)');

      // Classificação em lote: a prévia mostra o que muda e a cobertura passa a refletir.
      await ir(j, '/financeiro/classificacoes', 'Classificação de despesas');
      await expect(j.getByTestId('cobertura-classificacao')).toContainText('Sem classificação');
      await j
        .getByTestId('tabela-classificacao-categorias')
        .getByRole('button', { name: 'Aplicar o padrão' })
        .click();
      const dialogo = j.getByRole('dialog');
      await expect(dialogo.getByTestId('previa-classificacao')).toContainText('1 lançamento(s)');
      await dialogo.getByRole('button', { name: 'Aplicar classificação' }).click();
      await expect(dialogo).not.toBeVisible();
      await expect(j.getByTestId('cobertura-classificacao')).toContainText('R$ 1.000,00');
      // Classifica o restante um a um.
      await j.getByLabel('Classificar Conserto da cerca E2E').selectOption('variavel');
      await expect(j.getByLabel('Classificar Conserto da cerca E2E')).toHaveCount(0);

      // Sem rolagem horizontal em janela estreita.
      await j.setViewportSize({ width: 900, height: 800 });
      for (const [rota, titulo] of [
        ['/financeiro', 'Painel financeiro'],
        ['/financeiro/fluxo', 'Fluxo de caixa'],
        ['/financeiro/contas', 'Contas a pagar e a receber'],
        ['/financeiro/classificacoes', 'Classificação de despesas'],
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
