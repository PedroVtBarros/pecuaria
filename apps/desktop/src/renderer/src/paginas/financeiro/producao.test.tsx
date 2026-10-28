import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProvedorNotificacoes } from '../../components/notificacoes';
import { PaginaCentroProducao } from './pagina-centro-producao';
import { PaginaProducao } from './pagina-producao';

const uuid = (n: number) => `01a13f6e-0000-7000-8000-${String(n).padStart(12, '0')}`;
const PROP = uuid(2);
const CENTRO = uuid(50);
const propriedade = {
  id: PROP,
  nome: 'Fazenda Teste',
  municipio: null,
  uf: null,
  areaTotalHa: null,
  tipoExploracao: 'misto',
  observacoes: null,
};
const apuracao = (estado: string, valor: number, k: number, d = 0, n = 0) => ({
  estado,
  valorConhecidoCentavos: valor,
  componentesConhecidos: k,
  componentesDesconhecidos: d,
  componentesNaoApurados: n,
});
const resumo = {
  id: CENTRO,
  propriedadeId: PROP,
  nome: 'Capineira 1',
  tipo: 'volumoso',
  area: null,
  dataInicio: '2026-09-01',
  dataFim: null,
  item: { id: uuid(60), nome: 'Silagem de capim', unidadeBase: 'kg' },
  status: 'aberto',
  cancelado: false,
  apuracao: apuracao('parcial', 30000, 1, 1),
  componentes: 2,
};
const detalhe = {
  ...resumo,
  observacoes: null,
  motivoCancelamento: null,
  criadoEm: '2026-09-01T10:00:00.000Z',
  despesas: [
    {
      id: uuid(70),
      data: '2026-09-10',
      descricao: 'Diesel',
      valorCentavos: 30000,
      cancelada: false,
    },
  ],
  consumos: [
    {
      movimentacaoId: uuid(71),
      data: '2026-09-05',
      itemNome: 'Semente',
      quantidade: 10,
      unidadeBase: 'kg',
      custoCentavos: null,
    },
  ],
  custo: {
    apuracao: apuracao('parcial', 30000, 1, 1),
    conhecidoCentavos: 30000,
    desconhecidos: 1,
    completo: false,
    podeEncerrar: true,
    custoDaEntradaCentavos: null,
  },
  encerramento: null,
  observacao: 'Os custos vinculados ficam no centro.',
};

function montar(elemento: React.ReactNode, respostas: Record<string, unknown>, rota = '/') {
  const invocar = vi.fn(async (canal: string, _entrada?: unknown) => ({
    ok: true,
    dados:
      canal === 'configuracao:obter'
        ? { valor: null }
        : canal === 'propriedade:listar'
          ? [propriedade]
          : canal === 'estoque:obter'
            ? { item: { controleLote: false }, lotes: [], movimentos: [], historico: [] }
            : (respostas[canal] ?? []),
  }));
  Object.defineProperty(window, 'api', { value: { invocar }, configurable: true });
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter initialEntries={[rota]}>
        <ProvedorNotificacoes>
          <Routes>
            <Route path="/" element={elemento} />
            <Route path="/financeiro/producao/:id" element={elemento} />
          </Routes>
        </ProvedorNotificacoes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return invocar;
}
const mostrarOriginal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const fecharOriginal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
    },
  });
});
afterAll(() => {
  if (mostrarOriginal)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', mostrarOriginal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (fecharOriginal) Object.defineProperty(HTMLDialogElement.prototype, 'close', fecharOriginal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
afterEach(cleanup);

describe('produção própria (telas)', () => {
  it('lista os centros com o custo parcial como "no mínimo"', async () => {
    montar(<PaginaProducao />, { 'producao:listar': [resumo] });
    const tabela = await screen.findByTestId('tabela-centros');
    expect(await within(tabela).findByText('Capineira 1')).toBeTruthy();
    expect(within(tabela).getByText(/no mínimo R\$\s*300,00/)).toBeTruthy();
    expect(within(tabela).getByText('Aberto')).toBeTruthy();
  });

  it('detalhe mostra o custo desconhecido como tal, avisa que a entrada ficará desconhecida e desvincula', async () => {
    const invocar = montar(
      <PaginaCentroProducao />,
      { 'producao:obter': detalhe, 'producao:desvincular': detalhe },
      `/financeiro/producao/${CENTRO}`,
    );
    const consumos = await screen.findByTestId('consumos-centro');
    expect(within(consumos).getByText('Custo desconhecido')).toBeTruthy();
    expect(within(consumos).queryByText(/R\$\s*0,00/)).toBeNull();
    expect(within(screen.getByTestId('custo-centro')).getByText('Custo desconhecido')).toBeTruthy();
    expect(
      screen.getAllByText(/entrada de produção ficará com custo desconhecido/).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Desvincular Diesel' }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith('producao:desvincular', {
        id: CENTRO,
        tipo: 'lancamento',
        origemId: uuid(70),
      }),
    );
  });

  it('encerrar exige a quantidade colhida e envia o número, sem converter unidade', async () => {
    const invocar = montar(
      <PaginaCentroProducao />,
      { 'producao:obter': detalhe, 'producao:encerrar': { ...detalhe, status: 'encerrado' } },
      `/financeiro/producao/${CENTRO}`,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar' }));
    const enviar = await screen.findByRole('button', { name: 'Encerrar e lançar no estoque' });
    fireEvent.click(enviar);
    expect(await screen.findByText(/Informe a quantidade colhida/)).toBeTruthy();
    expect(invocar.mock.calls.some(([c]) => c === 'producao:encerrar')).toBe(false);
    fireEvent.change(screen.getByLabelText(/Quantidade colhida \(kg\)/), {
      target: { value: '12500,5' },
    });
    fireEvent.click(enviar);
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'producao:encerrar',
        expect.objectContaining({ id: CENTRO, quantidade: 12500.5, loteEstoqueId: null }),
      ),
    );
  });

  it('sem custo vinculado o botão de encerrar fica desabilitado; centro encerrado só reabre', async () => {
    montar(
      <PaginaCentroProducao />,
      {
        'producao:obter': {
          ...detalhe,
          despesas: [],
          consumos: [],
          custo: {
            ...detalhe.custo,
            podeEncerrar: false,
            desconhecidos: 0,
            apuracao: apuracao('nao_apurada', 0, 0, 0, 1),
          },
        },
      },
      `/financeiro/producao/${CENTRO}`,
    );
    expect(
      ((await screen.findByRole('button', { name: 'Encerrar' })) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Vincule ao menos uma despesa ou consumo/)).toBeTruthy();
    cleanup();
    montar(
      <PaginaCentroProducao />,
      {
        'producao:obter': {
          ...detalhe,
          status: 'encerrado',
          dataFim: '2026-09-30',
          encerramento: {
            movimentacaoId: uuid(80),
            quantidade: 10000,
            custoConhecidoCentavos: 30000,
            componentesDesconhecidos: 1,
            custoTotalCentavos: null,
          },
        },
      },
      `/financeiro/producao/${CENTRO}`,
    );
    expect(await screen.findByRole('button', { name: 'Reabrir' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Vincular custos' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Desvincular/ })).toBeNull();
  });

  it('vincular custo pelo modal de candidatos', async () => {
    const invocar = montar(
      <PaginaCentroProducao />,
      {
        'producao:obter': detalhe,
        'producao:candidatos': {
          despesas: [
            { id: uuid(90), data: '2026-09-12', descricao: 'Mão de obra', valorCentavos: 20000 },
          ],
          consumos: [],
        },
        'producao:vincular': detalhe,
      },
      `/financeiro/producao/${CENTRO}`,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Vincular custos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Vincular Mão de obra' }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith('producao:vincular', {
        id: CENTRO,
        tipo: 'lancamento',
        origemId: uuid(90),
      }),
    );
  });
});
