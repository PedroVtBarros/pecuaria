import { expect, test, type Locator, type Page } from '@playwright/test';
import type {
  Nutriente,
  Propriedade,
  RegistroDetalhe,
  ResumoAlimento,
} from '@pecuaria/shared-types';
import { abrirApp, chamarApi, criarPastaDados, fecharApp } from './apoio';

/*
 * Versão pública: o teste do pacote CQBAL saiu com os dados restritos (uso pessoal). O laudo do
 * teste é FICTÍCIO (CLAUDE.md, regra 1).
 */
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
      nome: 'Fazenda curadoria E2E',
      municipio: null,
      uf: null,
      areaTotalHa: null,
      tipoExploracao: 'misto',
      observacoes: null,
    },
  });
  await api(j, 'configuracao:definir', { chave: 'interface.propriedadeAtual', valor: p.id });
  await j.reload();
  return p;
}
function campo(d: Locator, rotulo: string): Locator {
  const escapado = rotulo.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
  return d.getByLabel(new RegExp(`^${escapado}\\*?$`));
}
test.describe('Fase 5B: curadoria e valores não quantificados', () => {
  test('valor não quantificado pela tela: texto, significado da fonte, conferência e ficha', async () => {
    const pasta = criarPastaDados();
    const aberto = await abrirApp(pasta.caminho);
    const j = aberto.janela;
    try {
      const p = await base(j);
      const nutrientes = await api<Nutriente[]>(j, 'nutriente:listar', {});
      const pb = nutrientes.find((n) => n.codigo === 'PB')!;
      const alimento = await api<ResumoAlimento>(j, 'alimento:criar', {
        dados: {
          nome: 'Alimento de teste E2E',
          especie: null,
          cultivar: null,
          partePlanta: null,
          formaConservacao: 'outro',
          processamento: null,
          classe: 'outro',
          comercial: false,
          observacoes: null,
        },
      });
      const laudo = await api<RegistroDetalhe>(j, 'laudo:registrar', {
        propriedadeId: p.id,
        alimentoId: alimento.id,
        laboratorio: 'Laboratório fictício',
        numeroLaudo: 'L-E2E',
        dataLaudo: null,
        dataAmostra: '2026-10-06',
        identificacaoAmostra: null,
        observacoes: null,
        separadorDecimal: 'virgula',
        valores: [
          {
            nutrienteId: pb.id,
            valorPublicado: '8,3',
            unidade: 'pct',
            base: 'ms',
            metodoAnaliticoFonte: null,
            observacao: null,
          },
        ],
      });
      await ir(
        j,
        `/alimentos/registros/${laudo.registro.id}`,
        'Registro de composição: Alimento de teste E2E',
      );
      await j.getByRole('button', { name: 'Valor não quantificado', exact: true }).click();
      const d = j.getByRole('dialog');
      await campo(d, 'Nutriente (definição)').selectOption({ label: 'EE · Extrato etéreo' });
      await campo(d, 'Natureza (pela legenda da fonte)').selectOption('abaixo_do_limite');
      await campo(d, 'Unidade da coluna').selectOption({ label: '%' });
      await campo(d, 'Base publicada').selectOption('ms');
      await campo(d, 'Tipo de valor').selectOption('valor_unico');
      await campo(d, 'Texto como publicado').fill('0,01');
      await expect(d.getByText('O texto é um número: registre como valor numérico.')).toBeVisible();
      await campo(d, 'Texto como publicado').fill('<0,01');
      await expect(d.getByText('Será gravado como texto, sem número.')).toBeVisible();
      await campo(d, 'Significado segundo a fonte').fill(
        'Legenda fictícia do laudo: abaixo do limite de quantificação.',
      );
      await d.getByRole('button', { name: 'Salvar', exact: true }).click();
      await expect(d).not.toBeVisible();
      const nq = j.getByTestId('tabela-nao-quantificados');
      await expect(nq).toContainText('<0,01 % (MS)');
      await expect(nq).toContainText('Abaixo do limite');
      await expect(nq).toContainText('Legenda fictícia do laudo');
      const detalhe = await api<RegistroDetalhe>(j, 'composicao:obter', { id: laudo.registro.id });
      expect(detalhe.valores.map((v) => v.nutriente.codigo)).toEqual(['PB']);

      // Transcrever e conferir; a ficha mostra o não quantificado e não o lista como ausente.
      await j.getByRole('button', { name: 'Marcar como transcrito', exact: true }).click();
      let m = j.getByRole('dialog');
      await campo(m, 'Nome de quem transcreveu').fill('Pessoa A');
      await m.getByRole('button', { name: 'Marcar como transcrito', exact: true }).click();
      await expect(m).not.toBeVisible();
      await j.getByRole('button', { name: 'Conferir', exact: true }).click();
      m = j.getByRole('dialog');
      await expect(m.getByTestId('tabela-nao-quantificados')).toContainText('<0,01');
      await campo(m, 'Nome de quem conferiu').fill('Pessoa B');
      await m.getByRole('button', { name: 'Confirmar conferência', exact: true }).click();
      await expect(m).not.toBeVisible();
      await expect(j.getByRole('button', { name: 'Valor não quantificado' })).toHaveCount(0);
      await ir(j, `/alimentos/itens/${alimento.id}`, 'Alimento de teste E2E');
      const cartao = j.getByTestId('cartao-registro');
      await expect(cartao.getByTestId('tabela-nao-quantificados')).toContainText('<0,01');
      await expect(cartao).toContainText('Não informado pela fonte');
      await expect(cartao).not.toContainText(/Não informado pela fonte:[^.]*\bEE\b/);
      expect(aberto.errosNoConsole).toEqual([]);
    } finally {
      await fecharApp(aberto);
      pasta.limpar();
    }
  });
});
