import { expect, test, type Page } from '@playwright/test';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { Lote, Propriedade } from '@pecuaria/shared-types';
import { abrirApp, chamarApi, criarPastaDados, fecharApp } from './apoio';

async function api<T>(janela: Page, canal: string, entrada: unknown): Promise<T> {
  const r = (await chamarApi(janela, canal, entrada)) as { ok: boolean; dados: T; erro: unknown };
  if (!r.ok) throw new Error(`${canal}: ${JSON.stringify(r.erro)}`);
  return r.dados;
}
async function ir(j: Page, rota: string, titulo: string | RegExp) {
  await j.evaluate((r) => {
    window.location.hash = `#${r}`;
  }, rota);
  await expect(j.getByRole('heading', { name: titulo, level: 2 })).toBeVisible();
}
function emDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const animalDados = (identificacao: string) => ({
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
type Lancamento = {
  pagoCentavos: number;
  compensadoCentavos: number;
  saldoEmAbertoCentavos: number | null;
  parcelas: { id: string; numero: number; saldoCentavos: number }[];
};

test.describe('Fase 4 (ajustes): devolução de animais', () => {
  test('venda parcialmente recebida devolvida pela tela, devolução ao fornecedor, cancelamento, reinício, backup e restauração', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    let j = aberto.janela;
    try {
      const p = await api<Propriedade>(j, 'propriedade:criar', {
        dados: {
          nome: 'Fazenda Devolução',
          municipio: null,
          uf: null,
          areaTotalHa: null,
          tipoExploracao: 'corte',
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
      const compra = await api<{
        id: string;
        lancamentoId: string;
        itens: { id: string; animalId: string; animalIdentificacao: string }[];
      }>(j, 'negociacao:registrarCompra', {
        requisicaoId: gerarUuidV7(),
        propriedadeId: p.id,
        data: emDias(-20),
        pessoaId: null,
        atividade: 'corte',
        observacoes: null,
        valorTotalCentavos: 400000,
        unidadePreco: 'total',
        precoUnitarioCentavos: null,
        criterio: 'igual',
        condicao: { tipo: 'a_vista', vencimento: emDias(30), pagamento: null },
        loteId: lote.id,
        animais: ['a1', 'a2', 'a3', 'b1'].map((n) => ({
          dados: animalDados(n),
          pesoVivoKg: null,
          metodoPesagem: null,
          pesoCarcacaKg: null,
          valorManualCentavos: null,
        })),
      });
      const id = Object.fromEntries(compra.itens.map((i) => [i.animalIdentificacao, i.animalId]));
      // Exemplo do usuário: venda de R$ 3.000,00 com R$ 1.000,00 recebidos.
      const venda = await api<{ id: string; lancamentoId: string }>(
        j,
        'negociacao:registrarVenda',
        {
          requisicaoId: gerarUuidV7(),
          propriedadeId: p.id,
          data: emDias(-5),
          pessoaId: null,
          atividade: 'corte',
          observacoes: null,
          valorTotalCentavos: 300000,
          unidadePreco: 'total',
          precoUnitarioCentavos: null,
          criterio: 'igual',
          condicao: {
            tipo: 'parcelado',
            parcelas: [
              { vencimento: emDias(-5), valorCentavos: 100000 },
              { vencimento: emDias(30), valorCentavos: 200000 },
            ],
          },
          animais: ['a1', 'a2', 'a3'].map((n) => ({
            animalId: id[n],
            pesoVivoKg: null,
            pesoCarcacaKg: null,
            valorManualCentavos: null,
          })),
        },
      );
      const lv = await api<Lancamento>(j, 'lancamento:obter', { id: venda.lancamentoId });
      await api(j, 'pagamento:registrar', {
        parcelaId: lv.parcelas.find((x) => x.numero === 1)!.id,
        requisicaoId: gerarUuidV7(),
        dados: { data: emDias(-5), valorCentavos: 100000, forma: null, observacao: null },
      });

      // Devolução integral pela tela: valores pela sugestão, prévia, reembolso à vista em aberto.
      await j.reload();
      await ir(j, `/financeiro/animais/${venda.id}`, /Venda de 3 animal/);
      await j.getByRole('button', { name: 'Registrar devolução do comprador' }).click();
      const modal = j.getByRole('dialog');
      for (const n of ['a1', 'a2', 'a3']) {
        await modal.getByLabel(new RegExp(`^${n} \\(valor original`)).check();
        await modal
          .getByTestId(`devolver-${n}`)
          .getByRole('button', { name: 'Usar o valor original' })
          .click();
      }
      await modal.getByRole('button', { name: 'Calcular prévia' }).click();
      const previa = modal.getByTestId('previa-devolucao');
      await expect(previa).toContainText(/2\.000,00/);
      await expect(previa).toContainText(/1\.000,00/);
      await modal.getByRole('button', { name: 'Registrar devolução' }).click();
      await expect(modal).toBeHidden();
      await expect(j.getByTestId('secao-devolucoes')).toContainText(/3\.000,00/);

      const vendaDepois = await api<Lancamento>(j, 'lancamento:obter', { id: venda.lancamentoId });
      expect(vendaDepois).toMatchObject({
        pagoCentavos: 100000,
        compensadoCentavos: 200000,
        saldoEmAbertoCentavos: 0,
      });
      for (const n of ['a1', 'a2', 'a3'])
        expect((await api<{ status: string }>(j, 'animal:obter', { id: id[n] })).status).toBe(
          'ativo',
        );

      // Devolução ao fornecedor (pela API): b1 sai e compensa parte da compra em aberto.
      const compraDetalhe = await api<{ itens: { id: string; animalIdentificacao: string }[] }>(
        j,
        'negociacao:obter',
        { id: compra.id },
      );
      const devCompra = await api<{ id: string }>(j, 'devolucao:registrar', {
        requisicaoId: gerarUuidV7(),
        negociacaoId: compra.id,
        data: emDias(-2),
        itens: [
          {
            negociacaoItemId: compraDetalhe.itens.find((i) => i.animalIdentificacao === 'b1')!.id,
            valorCentavos: 90000,
          },
        ],
        loteRetornoId: null,
        condicaoRestante: { tipo: 'nao_informada' },
        observacoes: null,
      });
      expect((await api<{ status: string }>(j, 'animal:obter', { id: id['b1'] })).status).toBe(
        'vendido',
      );

      const P = { propriedadeId: p.id, dataInicial: emDias(-30), dataFinal: emDias(0) };
      const conferir = async () => {
        const conf = await api<{ secoes: { linhas: unknown[][] }[] }>(j, 'relatorio:montar', {
          tipo: 'conferencia',
          filtros: { ...P, loteId: null, animalId: null, incluirDocumentos: false },
        });
        const sit = Object.fromEntries(conf.secoes[0]!.linhas.map((l) => [l[0], l[1]]));
        expect(sit['Devoluções e compensações']).toBe('Fecha');
        expect(sit['Resultado']).toBe('Fecha');
        expect(sit['Caixa']).toBe('Fecha');
      };
      await conferir();
      const backup = await api<{ id: string }>(j, 'backup:criar', { observacao: 'Devoluções' });

      // Cancelar a devolução ao fornecedor pela tela.
      await ir(j, `/financeiro/animais/${compra.id}`, /Compra de 4 animal/);
      const secao = j.getByTestId('secao-devolucoes');
      await secao.getByRole('button', { name: 'Cancelar devolução' }).click();
      const modalCancelar = j.getByRole('dialog');
      await modalCancelar.getByLabel(/Motivo do cancelamento/).fill('Fornecedor não aceitou');
      await modalCancelar.getByRole('button', { name: 'Cancelar devolução' }).click();
      await expect(modalCancelar).toBeHidden();
      await expect(secao).toContainText('Cancelada');
      expect((await api<{ status: string }>(j, 'animal:obter', { id: id['b1'] })).status).toBe(
        'ativo',
      );
      await conferir();

      // Reinício e restauração do backup: a devolução ao fornecedor volta a valer.
      await fecharApp(aberto);
      aberto = await abrirApp(pasta.caminho);
      j = aberto.janela;
      expect(
        (await api<{ cancelada: boolean }>(j, 'devolucao:obter', { id: devCompra.id })).cancelada,
      ).toBe(true);
      await api(j, 'backup:restaurar', { id: backup.id });
      expect(
        (await api<{ cancelada: boolean }>(j, 'devolucao:obter', { id: devCompra.id })).cancelada,
      ).toBe(false);
      expect((await api<{ status: string }>(j, 'animal:obter', { id: id['b1'] })).status).toBe(
        'vendido',
      );
      await conferir();

      await j.setViewportSize({ width: 900, height: 800 });
      await ir(j, `/financeiro/animais/${venda.id}`, /Venda de 3 animal/);
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
