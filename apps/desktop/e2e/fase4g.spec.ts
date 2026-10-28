import { expect, test, type Page } from '@playwright/test';
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
async function periodo(j: Page) {
  await j.getByLabel('De', { exact: true }).fill(emDias(-30));
  await j.getByLabel('Até', { exact: true }).fill(emDias(0));
}
const aVista = (data: string) => ({
  tipo: 'a_vista',
  vencimento: data,
  pagamento: { data, forma: null },
});
const dadosAnimal = (identificacao: string) => ({
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
});

test.describe('Fase 4G: resultado, indicadores, conciliação e projeção', () => {
  test('resultado por competência e caixa, realizado, conciliação, projeção e reinício', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    let j = aberto.janela;
    try {
      const p = await api<Propriedade>(j, 'propriedade:criar', {
        dados: {
          nome: 'Fazenda do resultado E2E',
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
      // 3 animais por R$ 3.000,00, pagos à vista.
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
          valorTotalCentavos: 300000,
          unidadePreco: 'total',
          precoUnitarioCentavos: null,
          criterio: 'igual',
          condicao: aVista(emDias(-10)),
          loteId: lote.id,
          animais: ['a1', 'a2', 'a3'].map((n) => ({
            dados: dadosAnimal(n),
            pesoVivoKg: null,
            metodoPesagem: null,
            pesoCarcacaKg: null,
            valorManualCentavos: null,
          })),
        },
      );
      const id = Object.fromEntries(compra.itens.map((i) => [i.animalIdentificacao, i.animalId]));
      // 60 kg de ração (R$ 60,00) no lote: R$ 20,00 por animal.
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
      const mov = (dados: Record<string, unknown>) =>
        api(j, 'estoque:registrar', {
          itemId: racao.id,
          requisicaoId: gerarUuidV7(),
          dados: {
            unidadeBase: 'kg',
            loteEstoqueId: null,
            custoEntradaCentavos: null,
            destino: null,
            loteAnimalId: null,
            animalId: null,
            documentoOrigemId: null,
            motivo: null,
            observacao: null,
            ...dados,
          },
        });
      await mov({
        data: emDias(-10),
        tipo: 'entrada_compra',
        quantidade: 100,
        custoEntradaCentavos: 10000,
      });
      await mov({
        data: emDias(-8),
        tipo: 'saida_consumo',
        quantidade: 60,
        destino: 'lote',
        loteAnimalId: lote.id,
      });
      // a1 vendido por R$ 1.500,00 (recebido); a2 morre.
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
      await api(j, 'animal:registrarSaida', {
        id: id['a2'],
        tipo: 'morto',
        data: emDias(-1),
        motivo: null,
      });
      await j.reload();

      // Resultado: competência e caixa lado a lado.
      await ir(j, '/financeiro/resultado', 'Resultado');
      await periodo(j);
      const comp = j.getByTestId('bloco-resultado-competencia');
      await expect(comp).toContainText('R$ 1.500,00');
      // Custo: ração R$ 60,00 + aquisição de a1 e a2 R$ 2.000,00 = R$ 2.060,00; resultado −R$ 560,00.
      await expect(comp).toContainText('2.060,00');
      await expect(comp).toContainText('560,00');
      const caixa = j.getByTestId('bloco-resultado-caixa');
      await expect(caixa).toContainText('3.000,00');
      await expect(caixa).toContainText('1.500,00');
      const realizado = j.getByTestId('realizado-animais');
      await expect(realizado).toContainText('a1');
      await expect(realizado).toContainText('480,00');
      await expect(realizado).toContainText('Morte (perda)');
      await expect(j.getByTestId('indicadores')).toContainText('@ carcaça');

      // Conciliação: R$ 940,00 de diferença = −R$ 60,00 de ração não paga + R$ 1.000,00 do animal ativo.
      await ir(j, '/financeiro/conciliacao', 'Conciliação');
      await periodo(j);
      await expect(j.getByTestId('totais-conciliacao')).toContainText('940,00');
      await expect(j.getByTestId('linhas-conciliacao')).toContainText('Aquisição de animais');

      // Projeção do lote (a3): 450 kg = 30 @ × R$ 300,00 = R$ 9.000,00 − R$ 1.020,00 acumulados.
      await ir(j, '/financeiro/projecao', 'Projeção');
      await j.getByLabel(/Lote ou animal/).selectOption({ label: 'Lote A' });
      await j.getByLabel('Preço esperado por unidade').fill('300,00');
      await j.getByLabel(/Peso vivo esperado por animal/).fill('450');
      await j.getByRole('button', { name: 'Calcular projeção' }).click();
      const proj = j.getByTestId('resultado-projecao');
      await expect(proj).toContainText('não é dado apurado');
      await expect(proj).toContainText('7.980,00');

      // Reinício: nada da projeção foi gravado; o resultado continua o mesmo.
      const antes = await api<{ total: number }>(j, 'lancamento:listar', { propriedadeId: p.id });
      await fecharApp(aberto);
      aberto = await abrirApp(pasta.caminho);
      j = aberto.janela;
      expect(
        (await api<{ total: number }>(j, 'lancamento:listar', { propriedadeId: p.id })).total,
      ).toBe(antes.total);
      const r = await api<{ competencia: { resultadoCentavos: number } }>(j, 'resultado:periodo', {
        propriedadeId: p.id,
        dataInicial: emDias(-30),
        dataFinal: emDias(0),
      });
      expect(r.competencia.resultadoCentavos).toBe(-56000);

      await j.setViewportSize({ width: 900, height: 800 });
      for (const [rota, titulo] of [
        ['/financeiro/resultado', 'Resultado'],
        ['/financeiro/conciliacao', 'Conciliação'],
        ['/financeiro/projecao', 'Projeção'],
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
