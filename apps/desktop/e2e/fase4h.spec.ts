import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { Lote, Propriedade } from '@pecuaria/shared-types';
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
function emDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
async function salvarEm(app: ElectronApplication, destino: string) {
  await app.evaluate(({ dialog }, caminho) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath: caminho,
    })) as typeof dialog.showSaveDialog;
  }, destino);
}
const aVista = (data: string) => ({
  tipo: 'a_vista',
  vencimento: data,
  pagamento: { data, forma: null },
});

test.describe('Fase 4H: relatórios, exportação e fechamento', () => {
  test('fluxo completo, exportação CSV e PDF reais, conferência, backup, restauração e reinício', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    let j = aberto.janela;
    try {
      const p = await api<Propriedade>(j, 'propriedade:criar', {
        dados: {
          nome: 'Fazenda São Jorge; "Sede"',
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
      const compra = await api<{ itens: { animalId: string; animalIdentificacao: string }[] }>(
        j,
        'negociacao:registrarCompra',
        {
          requisicaoId: gerarUuidV7(),
          propriedadeId: p.id,
          data: emDias(-10),
          pessoaId: null,
          atividade: 'corte',
          observacoes: null,
          valorTotalCentavos: 200000,
          unidadePreco: 'total',
          precoUnitarioCentavos: null,
          criterio: 'igual',
          condicao: aVista(emDias(-10)),
          loteId: lote.id,
          animais: ['a1', 'a2'].map((n) => ({
            dados: {
              identificacao: n,
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
            pesoVivoKg: null,
            metodoPesagem: null,
            pesoCarcacaKg: null,
            valorManualCentavos: null,
          })),
        },
      );
      const id = Object.fromEntries(compra.itens.map((i) => [i.animalIdentificacao, i.animalId]));
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
      const categorias = await api<{ id: string; nome: string }[]>(
        j,
        'categoriaFinanceira:listar',
        { incluirInativas: false },
      );
      await api(j, 'compraInsumo:registrar', {
        requisicaoId: gerarUuidV7(),
        propriedadeId: p.id,
        data: emDias(-9),
        pessoaId: null,
        categoriaId: categorias.find((c) => c.nome.startsWith('Insumos para estoque'))!.id,
        documentoNumero: 'NF-1',
        atividade: 'corte',
        observacoes: null,
        freteCentavos: 0,
        condicao: aVista(emDias(-9)),
        itens: [
          {
            estoqueItemId: racao.id,
            quantidade: 100,
            unidadeBase: 'kg',
            valorCentavos: 10000,
            loteFisico: null,
          },
        ],
      });
      await api(j, 'estoque:registrar', {
        itemId: racao.id,
        requisicaoId: gerarUuidV7(),
        dados: {
          data: emDias(-8),
          tipo: 'saida_consumo',
          quantidade: 40,
          unidadeBase: 'kg',
          loteEstoqueId: null,
          custoEntradaCentavos: null,
          destino: 'lote',
          loteAnimalId: lote.id,
          animalId: null,
          documentoOrigemId: null,
          motivo: null,
          observacao: null,
        },
      });
      await api(j, 'negociacao:registrarVenda', {
        requisicaoId: gerarUuidV7(),
        propriedadeId: p.id,
        data: emDias(-2),
        pessoaId: null,
        atividade: 'corte',
        observacoes: null,
        valorTotalCentavos: 150000,
        unidadePreco: 'total',
        precoUnitarioCentavos: null,
        criterio: 'igual',
        condicao: aVista(emDias(-2)),
        animais: [
          { animalId: id['a1'], pesoVivoKg: 450, pesoCarcacaKg: 240, valorManualCentavos: null },
        ],
      });
      await j.reload();

      // Exportação pela tela: CSV real.
      await ir(j, '/financeiro/relatorios', 'Relatórios e exportação');
      await j.getByLabel('De', { exact: true }).fill(emDias(-30));
      await j.getByLabel('Até', { exact: true }).fill(emDias(0));
      const csv = join(pasta.caminho, 'resultado.csv');
      await salvarEm(aberto.app, csv);
      await j.getByRole('button', { name: /Exportar CSV/ }).click();
      await expect(j.getByText(/^Relatório salvo em/)).toBeVisible();
      const texto = readFileSync(csv, 'utf8');
      expect(texto.charCodeAt(0)).toBe(0xfeff);
      expect(texto).toContain('Relatório;Resultado do período\r\n');
      expect(texto).toContain('Propriedade;"Fazenda São Jorge; ""Sede"""\r\n');
      expect(texto).toContain('Receitas (líquidas);150000;1500,00');

      // PDF real, impresso pela janela oculta.
      const pdf = join(pasta.caminho, 'resultado.pdf');
      await salvarEm(aberto.app, pdf);
      await j.getByRole('button', { name: /Exportar PDF/ }).click();
      await expect(j.getByText(/resultado\.pdf/)).toBeVisible();
      const bytes = readFileSync(pdf);
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(bytes.length).toBeGreaterThan(5000);
      expect(bytes.toString('latin1')).toMatch(/\/Type\s*\/Page[^s]/);

      // Pré-visualização e conferência integral.
      await j.getByLabel('Relatório').selectOption('conferencia');
      await j.getByRole('button', { name: 'Pré-visualizar' }).click();
      const previa = j.getByTestId('previa-relatorio');
      await expect(previa).toContainText('Conferência financeira');
      await expect(previa.getByRole('row', { name: /Apropriação de custos.*Fecha/ })).toBeVisible();
      await expect(previa.getByRole('row', { name: /Conciliação.*Fecha/ })).toBeVisible();
      await expect(previa).not.toContainText('Não fecha');

      // Backup e restauração preservam os números financeiros.
      const periodo = { propriedadeId: p.id, dataInicial: emDias(-30), dataFinal: emDias(0) };
      const antes = await api<{ competencia: { resultadoCentavos: number } }>(
        j,
        'resultado:periodo',
        periodo,
      );
      const backup = await api<{ id: string }>(j, 'backup:criar', {
        observacao: 'Antes de lançar a despesa',
      });
      await api(j, 'lancamento:criar', {
        requisicaoId: gerarUuidV7(),
        dados: {
          propriedadeId: p.id,
          categoriaId: categorias.find((c) => c.nome.startsWith('Alimentação (despesa direta'))!.id,
          pessoaId: null,
          dataCompetencia: emDias(-1),
          valorTotalCentavos: 777,
          descricao: 'Despesa depois do backup',
          documentoNumero: null,
          atividade: 'nao_definida',
          destino: { tipo: 'propriedade' },
          quantidade: null,
          comportamentoCusto: null,
          observacoes: null,
          condicao: { tipo: 'nao_informada' },
        },
      });
      const depois = await api<{ competencia: { resultadoCentavos: number } }>(
        j,
        'resultado:periodo',
        periodo,
      );
      expect(depois.competencia.resultadoCentavos).toBe(antes.competencia.resultadoCentavos - 777);
      await api(j, 'backup:restaurar', { id: backup.id });
      const restaurado = await api<{ competencia: { resultadoCentavos: number } }>(
        j,
        'resultado:periodo',
        periodo,
      );
      expect(restaurado.competencia.resultadoCentavos).toBe(antes.competencia.resultadoCentavos);

      // Reinício: relatórios continuam disponíveis e iguais.
      await fecharApp(aberto);
      aberto = await abrirApp(pasta.caminho);
      j = aberto.janela;
      const conf = await api<{ secoes: { linhas: unknown[][] }[] }>(j, 'relatorio:montar', {
        tipo: 'conferencia',
        filtros: { ...periodo, loteId: null, animalId: null, incluirDocumentos: false },
      });
      expect(conf.secoes[0]!.linhas.filter((l) => l[1] === 'Não fecha')).toEqual([]);

      await j.setViewportSize({ width: 900, height: 800 });
      await ir(j, '/financeiro/relatorios', 'Relatórios e exportação');
      await expect
        .poll(() => j.locator('main').evaluate((e) => e.scrollWidth - e.clientWidth))
        .toBeLessThanOrEqual(0);
      expect(aberto.errosNoConsole).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });
});
