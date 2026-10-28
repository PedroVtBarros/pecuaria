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

test.describe('Fase 4E: rateio de custos e custo por lote e animal', () => {
  test('rateio por cabeças, custo por lote e animal, origem do valor, cancelamento e reinício', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    let j = aberto.janela;
    try {
      const p = await api<Propriedade>(j, 'propriedade:criar', {
        dados: {
          nome: 'Fazenda do rateio E2E',
          municipio: null,
          uf: null,
          areaTotalHa: null,
          tipoExploracao: 'misto',
          observacoes: null,
        },
      });
      await api(j, 'configuracao:definir', { chave: 'interface.propriedadeAtual', valor: p.id });
      const lote = (nome: string) =>
        api<Lote>(j, 'lote:criar', {
          propriedadeId: p.id,
          dados: {
            nome,
            finalidade: 'engorda',
            dataFormacao: '2026-01-01',
            areaId: null,
            observacoes: null,
          },
        });
      const a = await lote('Lote A');
      const b = await lote('Lote B');
      const animais: Record<string, string> = {};
      for (const [identificacao, loteId] of [
        ['a1', a.id],
        ['a2', a.id],
        ['a3', a.id],
        ['b1', b.id],
      ] as const) {
        animais[identificacao] = (
          await api<{ id: string }>(j, 'animal:criar', {
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
            entrada: { data: '2026-01-01', loteId, pesoVivoKg: null, metodoPesagem: null },
          })
        ).id;
      }
      const categorias = await api<CategoriaFinanceira[]>(j, 'categoriaFinanceira:listar', {
        incluirInativas: false,
      });
      const energia = categorias.find((c) => c.nome.startsWith('Alimentação (despesa direta'))!;
      await api(j, 'lancamento:criar', {
        requisicaoId: gerarUuidV7(),
        dados: {
          propriedadeId: p.id,
          categoriaId: energia.id,
          pessoaId: null,
          dataCompetencia: hoje(),
          valorTotalCentavos: 100001,
          descricao: 'Energia da sede',
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

      // Antes do rateio, o custo da propriedade está "não alocado" e não chega a nenhum animal.
      await ir(j, '/financeiro/custos', 'Custos por lote e animal');
      await expect(j.getByTestId('resumo-custos')).toContainText('R$ 1.000,01');
      await expect(j.getByTestId('conferencia-custos')).toContainText('Conferido');

      // Rateio por cabeças: 3 contra 1, R$ 750,01 e R$ 250,00 (a sobra de 1 centavo vai ao maior resto).
      await ir(j, '/financeiro/rateio', 'Rateio de custos');
      await expect(j.getByTestId('tabela-pendentes-rateio')).toContainText('Energia da sede');
      await j.getByRole('button', { name: 'Ratear Energia da sede' }).click();
      let d = j.getByRole('dialog');
      const previa = d.getByTestId('previa-rateio');
      await expect(previa).toContainText('R$ 750,01');
      await expect(previa).toContainText('R$ 250,00');
      await expect(previa).toContainText('exatamente R$ 1.000,01');
      await d.getByRole('button', { name: 'Criar rateio' }).click();
      await expect(d.getByText('Informe o motivo do rateio.')).toBeVisible();
      await d.getByLabel(/Motivo do rateio/).fill('Divisão pelo número de animais');
      await d.getByRole('button', { name: 'Criar rateio' }).click();
      await expect(d).not.toBeVisible();
      await expect(j.getByTestId('tabela-rateios')).toContainText('Ativo');
      await expect(j.getByText('Nenhum custo compartilhado sem rateio')).toBeVisible();

      // Custo por lote e por animal.
      await ir(j, '/financeiro/custos', 'Custos por lote e animal');
      const lotes = j.getByTestId('tabela-custo-lotes');
      await expect(lotes).toContainText('R$ 750,01');
      await expect(lotes).toContainText('R$ 250,00');
      await expect(j.getByTestId('conferencia-custos')).toContainText('Conferido');
      await j.getByRole('button', { name: 'De onde veio o custo de b1' }).click();
      d = j.getByRole('dialog');
      await expect(d.getByTestId('linhas-origem-animal')).toContainText('rateio (cabeças)');
      await expect(d.getByTestId('linhas-origem-animal')).toContainText('R$ 250,00');
      await j.keyboard.press('Escape');

      // O mesmo resultado, direto da API, e nada foi gravado como valor: só pesos.
      const resumo = await api<{
        totalDeOrigemCentavos: number;
        conferido: boolean;
        animais: { apuracao: { valorConhecidoCentavos: number } };
      }>(j, 'custo:resumo', { propriedadeId: p.id });
      expect(resumo).toMatchObject({ totalDeOrigemCentavos: 100001, conferido: true });
      expect(resumo.animais.apuracao.valorConhecidoCentavos).toBe(100001);

      // Cancelar o rateio devolve o custo a "não alocado".
      await ir(j, '/financeiro/rateio', 'Rateio de custos');
      await j.getByRole('button', { name: /Detalhes do rateio de Energia da sede/ }).click();
      d = j.getByRole('dialog');
      await expect(d.getByTestId('destinos-rateio')).toContainText('Lote A');
      await d.getByRole('button', { name: 'Cancelar rateio' }).click();
      d = j.getByRole('dialog').filter({ hasText: 'O custo volta a ficar sem destino' });
      await d.getByLabel('Motivo').fill('Critério errado');
      await d.getByRole('button', { name: 'Cancelar rateio' }).click();
      await expect(j.getByTestId('tabela-pendentes-rateio')).toContainText('Energia da sede');

      // Reinício: o rateio cancelado e a trilha persistem.
      await fecharApp(aberto);
      aberto = await abrirApp(pasta.caminho);
      j = aberto.janela;
      const todos = await api<{ cancelado: boolean }[]>(j, 'rateio:listar', {
        propriedadeId: p.id,
        incluirCancelados: true,
      });
      expect(todos).toHaveLength(1);
      expect(todos[0]!.cancelado).toBe(true);
      await ir(j, '/financeiro/custos', 'Custos por lote e animal');
      await expect(j.getByTestId('resumo-custos')).toContainText('R$ 1.000,01');

      // Sem rolagem horizontal em janela estreita.
      await j.setViewportSize({ width: 900, height: 800 });
      for (const [rota, titulo] of [
        ['/financeiro/rateio', 'Rateio de custos'],
        ['/financeiro/custos', 'Custos por lote e animal'],
      ] as const) {
        await ir(j, rota, titulo);
        await expect
          .poll(() => j.locator('main').evaluate((e) => e.scrollWidth - e.clientWidth))
          .toBeLessThanOrEqual(0);
      }
      expect(aberto.errosNoConsole).toEqual([]);
      expect(Object.keys(animais)).toHaveLength(4);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });
});
