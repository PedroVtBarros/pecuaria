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
type Competencia = {
  competencia: { estado: string; limite: string | null; resultadoCentavos: number | null };
};

test.describe('Fase 4 (ajustes): completude do resultado', () => {
  test('venda à vista, parcelada e sem receita: tela, relatório, reinício, backup e restauração', async () => {
    const pasta = criarPastaDados();
    let aberto = await abrirApp(pasta.caminho);
    let j = aberto.janela;
    try {
      const p = await api<Propriedade>(j, 'propriedade:criar', {
        dados: {
          nome: 'Fazenda Completude',
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
          condicao: {
            tipo: 'a_vista',
            vencimento: emDias(-10),
            pagamento: { data: emDias(-10), forma: null },
          },
          loteId: lote.id,
          animais: ['a1', 'a2', 'a3'].map((n) => ({
            dados: animalDados(n),
            pesoVivoKg: null,
            metodoPesagem: null,
            pesoCarcacaKg: null,
            valorManualCentavos: null,
          })),
        },
      );
      const id = Object.fromEntries(compra.itens.map((i) => [i.animalIdentificacao, i.animalId]));
      const venda = (animalId: string, condicao: unknown) =>
        api(j, 'negociacao:registrarVenda', {
          requisicaoId: gerarUuidV7(),
          propriedadeId: p.id,
          data: emDias(-3),
          pessoaId: null,
          atividade: 'corte',
          observacoes: null,
          valorTotalCentavos: 150000,
          unidadePreco: 'total',
          precoUnitarioCentavos: null,
          criterio: 'igual',
          condicao,
          animais: [{ animalId, pesoVivoKg: null, pesoCarcacaKg: null, valorManualCentavos: null }],
        });
      // À vista recebida e parcelada (ainda não recebida): receitas conhecidas.
      await venda(id['a1']!, {
        tipo: 'a_vista',
        vencimento: emDias(-3),
        pagamento: { data: emDias(-3), forma: null },
      });
      await venda(id['a2']!, {
        tipo: 'parcelado',
        parcelas: [
          { vencimento: emDias(30), valorCentavos: 75000 },
          { vencimento: emDias(60), valorCentavos: 75000 },
        ],
      });
      const P = { propriedadeId: p.id, dataInicial: emDias(-30), dataFinal: emDias(0) };
      let r = await api<Competencia>(j, 'resultado:periodo', P);
      // 2 × R$ 1.500,00 − 2 × R$ 1.000,00 = R$ 1.000,00, completo (parcelada não é incompleta).
      expect(r.competencia).toMatchObject({ estado: 'completo', resultadoCentavos: 100000 });

      // a3 sai como vendido só no rebanho: receita desconhecida.
      await api(j, 'animal:registrarSaida', {
        id: id['a3'],
        tipo: 'vendido',
        data: emDias(-2),
        motivo: null,
      });
      r = await api<Competencia>(j, 'resultado:periodo', P);
      expect(r.competencia).toMatchObject({
        estado: 'parcial',
        limite: 'no_minimo',
        resultadoCentavos: 0,
      });
      const backup = await api<{ id: string }>(j, 'backup:criar', { observacao: 'Completude' });

      await j.reload();
      await ir(j, '/financeiro/resultado', 'Resultado');
      await j.getByLabel('De', { exact: true }).fill(emDias(-30));
      await j.getByLabel('Até', { exact: true }).fill(emDias(0));
      const comp = j.getByTestId('bloco-resultado-competencia');
      await expect(comp).toContainText(/no mínimo R\$\s*0,00/);
      await expect(comp).toContainText('1 venda(s) ou descarte(s) sem receita registrada');
      const animais = j.getByTestId('realizado-animais');
      await expect(animais.getByRole('row', { name: /a3.*Não apurado/ })).toBeVisible();

      // Cancelar a venda à vista exige estornar o recebimento antes: aqui, a parcelada (sem
      // recebimento) é cancelada; a competência continua parcial (a1 conhecida, a3 sem receita).
      const negs = await api<{ itens: { id: string; tipo: string; valorTotalCentavos: number }[] }>(
        j,
        'negociacao:listar',
        { propriedadeId: p.id, pagina: 1, tamanhoPagina: 50 },
      );
      const vendas = negs.itens.filter((n) => n.tipo === 'venda');
      expect(vendas).toHaveLength(2);
      const detalhes = await Promise.all(
        vendas.map((v) =>
          api<{ id: string; itens: { animalId: string }[] }>(j, 'negociacao:obter', { id: v.id }),
        ),
      );
      const parcelada = detalhes.find((d) => d.itens[0]!.animalId === id['a2'])!;
      await api(j, 'negociacao:cancelar', {
        id: parcelada.id,
        motivo: 'Venda desfeita',
        destino: { tipo: 'origem' },
      });
      r = await api<Competencia>(j, 'resultado:periodo', P);
      // R$ 1.500,00 − baixas de a1 e a3 (R$ 2.000,00) = −R$ 500,00, no mínimo.
      expect(r.competencia).toMatchObject({
        estado: 'parcial',
        limite: 'no_minimo',
        resultadoCentavos: -50000,
      });

      // Reinício e restauração: a completude é derivada e volta com os fatos.
      await fecharApp(aberto);
      aberto = await abrirApp(pasta.caminho);
      j = aberto.janela;
      r = await api<Competencia>(j, 'resultado:periodo', P);
      expect(r.competencia).toMatchObject({ estado: 'parcial', resultadoCentavos: -50000 });
      await api(j, 'backup:restaurar', { id: backup.id });
      r = await api<Competencia>(j, 'resultado:periodo', P);
      expect(r.competencia).toMatchObject({
        estado: 'parcial',
        limite: 'no_minimo',
        resultadoCentavos: 0,
      });
      const conf = await api<{ secoes: { linhas: unknown[][] }[] }>(j, 'relatorio:montar', {
        tipo: 'conferencia',
        filtros: { ...P, loteId: null, animalId: null, incluirDocumentos: false },
      });
      const sit = Object.fromEntries(conf.secoes[0]!.linhas.map((l) => [l[0], l[1]]));
      expect(sit['Resultado']).toBe('Fecha');
      expect(sit['Completude do resultado']).toBe('Parcial: no mínimo');
      expect(aberto.errosNoConsole).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });
});
