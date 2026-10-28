import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProvedorNotificacoes } from '../../components/notificacoes';
import { PaginaCustos } from './pagina-custos';
import { PaginaRateio } from './pagina-rateio';

const uuid = (n: number) => `01a13f6e-0000-7000-8000-${String(n).padStart(12, '0')}`;
const PROP = uuid(2);
const propriedade = {
  id: PROP,
  nome: 'Fazenda Teste',
  municipio: null,
  uf: null,
  areaTotalHa: null,
  tipoExploracao: 'misto',
  observacoes: null,
};
const lote = (n: number, nome: string) => ({
  id: uuid(n),
  propriedadeId: PROP,
  nome,
  finalidade: 'engorda',
  area: null,
  dataFormacao: '2026-01-01',
  ativo: true,
  dataEncerramento: null,
  observacoes: null,
  animaisAtivos: 3,
});
const zero = { componentesNaoApurados: 0 };

function montar(elemento: React.ReactNode, respostas: Record<string, unknown> = {}, rota = '/') {
  const invocar = vi.fn(async (canal: string, _entrada?: unknown) => ({
    ok: true,
    dados:
      canal === 'configuracao:obter'
        ? { valor: null }
        : canal === 'propriedade:listar'
          ? [propriedade]
          : canal === 'lote:listar'
            ? [lote(30, 'Lote A'), lote(31, 'Lote B')]
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
        <ProvedorNotificacoes>{elemento}</ProvedorNotificacoes>
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

const pendentes = {
  propriedadeId: PROP,
  itens: [
    {
      origemTipo: 'lancamento',
      origemId: uuid(100),
      data: '2026-10-06',
      descricao: 'Energia da sede',
      valorCentavos: 100001,
    },
    {
      origemTipo: 'movimentacao_estoque',
      origemId: uuid(101),
      data: '2026-10-05',
      descricao: 'Consumo de Feno (2 kg)',
      valorCentavos: null,
    },
  ],
  total: {
    estado: 'parcial',
    valorConhecidoCentavos: 100001,
    componentesConhecidos: 1,
    componentesDesconhecidos: 1,
    ...zero,
  },
  truncado: false,
};
const previa = {
  origem: { data: '2026-10-06', descricao: 'Energia da sede', valorCentavos: 100001, ativa: true },
  destinos: [
    {
      tipo: 'lote',
      id: uuid(30),
      rotulo: 'Lote A',
      peso: 3,
      base: '3 cabeça(s)',
      valorCentavos: 75001,
    },
    {
      tipo: 'lote',
      id: uuid(31),
      rotulo: 'Lote B',
      peso: 1,
      base: '1 cabeça(s)',
      valorCentavos: 25000,
    },
  ],
  erros: [],
  somaCentavos: 100001,
};

describe('rateio de custos (tela)', () => {
  it('custo desconhecido aparece como "Custo desconhecido", nunca R$ 0,00, e o total é parcial', async () => {
    montar(<PaginaRateio />, { 'rateio:pendentes': pendentes, 'rateio:listar': [] });
    const kpis = await screen.findByTestId('resumo-pendentes');
    expect(within(kpis).getByText(/no mínimo R\$\s*1\.000,01/)).toBeTruthy();
    const tabela = await screen.findByTestId('tabela-pendentes-rateio');
    expect(within(tabela).getByText('Custo desconhecido')).toBeTruthy();
    expect(within(tabela).queryByText(/R\$\s*0,00/)).toBeNull();
  });

  it('abre a prévia calculada pelo servidor e só cria com motivo', async () => {
    const invocar = montar(<PaginaRateio />, {
      'rateio:pendentes': pendentes,
      'rateio:listar': [],
      'rateio:previa': previa,
      'rateio:criar': { id: uuid(200) },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ratear Energia da sede' }));
    const painel = await screen.findByTestId('previa-rateio');
    await waitFor(() => expect(within(painel).getByText('Lote A')).toBeTruthy());
    expect(within(painel).getByText('R$ 750,01')).toBeTruthy();
    expect(within(painel).getByText('R$ 250,00')).toBeTruthy();
    expect(within(painel).getByText(/exatamente R\$\s*1\.000,01/)).toBeTruthy();
    expect(invocar).toHaveBeenCalledWith(
      'rateio:previa',
      expect.objectContaining({
        propriedadeId: PROP,
        origemTipo: 'lancamento',
        origemId: uuid(100),
        criterio: 'cabecas',
        manual: [],
      }),
    );

    // Sem motivo, nada é criado.
    fireEvent.click(screen.getByRole('button', { name: 'Criar rateio' }));
    expect(await screen.findByText('Informe o motivo do rateio.')).toBeTruthy();
    expect(invocar.mock.calls.some(([c]) => c === 'rateio:criar')).toBe(false);

    fireEvent.change(screen.getByLabelText(/Motivo do rateio/), {
      target: { value: 'Divisão pelo número de animais' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar rateio' }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'rateio:criar',
        expect.objectContaining({
          propriedadeId: PROP,
          origemTipo: 'lancamento',
          origemId: uuid(100),
          criterio: 'cabecas',
          motivo: 'Divisão pelo número de animais',
          requisicaoId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      ),
    );
  });

  it('critério por peso não pede prévia nem cria sem a idade máxima da pesagem, que é escolha do usuário', async () => {
    const invocar = montar(<PaginaRateio />, {
      'rateio:pendentes': pendentes,
      'rateio:listar': [],
      'rateio:previa': previa,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ratear Energia da sede' }));
    await screen.findByTestId('previa-rateio');
    invocar.mockClear();
    fireEvent.change(screen.getByLabelText(/Critério/), { target: { value: 'peso' } });
    const idade = await screen.findByLabelText(/Idade máxima da pesagem/);
    expect((idade as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/Preencha os campos para ver/)).toBeTruthy();
    expect(invocar.mock.calls.some(([c]) => c === 'rateio:previa')).toBe(false);
    fireEvent.change(idade, { target: { value: '30' } });
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'rateio:previa',
        expect.objectContaining({ criterio: 'peso', idadeMaximaPesagemDias: 30 }),
      ),
    );
  });

  it('mostra por que o critério não pôde ser calculado e impede a criação', async () => {
    const invocar = montar(<PaginaRateio />, {
      'rateio:pendentes': pendentes,
      'rateio:listar': [],
      'rateio:previa': {
        ...previa,
        destinos: [],
        somaCentavos: null,
        erros: ['Sem pesagem real de até 30 dia(s): a3.'],
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ratear Energia da sede' }));
    expect(await screen.findByText(/Sem pesagem real de até 30 dia\(s\): a3\./)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Motivo do rateio/), { target: { value: 'Teste' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar rateio' }));
    await waitFor(() =>
      expect(
        screen.getAllByText(/Sem pesagem real de até 30 dia\(s\): a3\./).length,
      ).toBeGreaterThan(1),
    );
    expect(invocar.mock.calls.some(([c]) => c === 'rateio:criar')).toBe(false);
  });
});

describe('custos por lote e animal (tela)', () => {
  const resumo = {
    propriedadeId: PROP,
    dataInicial: null,
    dataFinal: null,
    lotes: [
      {
        loteId: uuid(30),
        loteNome: 'Lote A',
        diretoCentavos: 28001,
        rateadoCentavos: 75001,
        totalCentavos: 103002,
        desconhecidos: 1,
        porCategoria: [],
        apuracao: {
          estado: 'parcial',
          valorConhecidoCentavos: 103002,
          componentesConhecidos: 2,
          componentesDesconhecidos: 1,
          ...zero,
        },
        semAnimaisCentavos: 0,
      },
    ],
    naoAlocado: {
      apuracao: {
        estado: 'completa',
        valorConhecidoCentavos: 5000,
        componentesConhecidos: 1,
        componentesDesconhecidos: 0,
        ...zero,
      },
      porCategoria: [],
    },
    animais: {
      quantidade: 4,
      apuracao: {
        estado: 'parcial',
        valorConhecidoCentavos: 120000,
        componentesConhecidos: 4,
        componentesDesconhecidos: 0,
        componentesNaoApurados: 1,
      },
    },
    emProducao: {
      estado: 'completa',
      valorConhecidoCentavos: 0,
      componentesConhecidos: 0,
      componentesDesconhecidos: 0,
      componentesNaoApurados: 0,
    },
    totalDeOrigemCentavos: 125000,
    desconhecidosDeOrigem: 1,
    conferido: true,
    avisos: [],
  };
  const animais = {
    itens: [
      {
        animalId: uuid(40),
        identificacao: 'a1',
        loteId: uuid(30),
        loteNome: 'Lote A',
        status: 'ativo',
        apuracao: {
          estado: 'nao_apurada',
          valorConhecidoCentavos: 0,
          componentesConhecidos: 0,
          componentesDesconhecidos: 0,
          componentesNaoApurados: 1,
        },
        porCategoria: [],
      },
    ],
    total: 1,
    pagina: 1,
    tamanhoPagina: 25,
  };

  it('mostra a conferência, o custo parcial como "no mínimo" e animal sem custo como não apurado', async () => {
    montar(<PaginaCustos />, { 'custo:resumo': resumo, 'custo:animais': animais });
    const kpis = await screen.findByTestId('resumo-custos');
    expect(within(kpis).getByText(/no mínimo R\$\s*1\.200,00/)).toBeTruthy();
    expect(within(kpis).getByText(/1 custo\(s\) desconhecido\(s\) fora da soma/)).toBeTruthy();
    expect(screen.getByTestId('conferencia-custos').textContent).toMatch(/Conferido/);
    const lotes = await screen.findByTestId('tabela-custo-lotes');
    expect(within(lotes).getByText('Lote A')).toBeTruthy();
    const tabela = await screen.findByTestId('tabela-custo-animais');
    expect(within(tabela).getByText('Não apurado')).toBeTruthy();
    expect(within(tabela).queryByText(/R\$\s*0,00/)).toBeNull();
  });

  it('avisa quando a soma não fecha e lista animais fora da divisão por lote', async () => {
    montar(<PaginaCustos />, {
      'custo:resumo': {
        ...resumo,
        conferido: false,
        avisos: ['a9: há movimentação depois da saída do rebanho.'],
      },
      'custo:animais': animais,
    });
    expect((await screen.findByTestId('conferencia-custos')).textContent).toMatch(/Não fecha/);
    expect(await screen.findByText(/a9: há movimentação depois da saída/)).toBeTruthy();
  });

  it('"De onde veio?" explica cada parte, inclusive a de valor desconhecido, com link para a origem', async () => {
    const invocar = montar(<PaginaCustos />, {
      'custo:resumo': resumo,
      'custo:animais': animais,
      'custo:animal': {
        animalId: uuid(40),
        identificacao: 'a1',
        apuracao: {
          estado: 'parcial',
          valorConhecidoCentavos: 33000,
          componentesConhecidos: 2,
          componentesDesconhecidos: 1,
          componentesNaoApurados: 0,
        },
        porCategoria: [
          { categoria: 'aquisicao', valorCentavos: 30000 },
          { categoria: 'alimentacao', valorCentavos: 3000 },
        ],
        linhas: [
          {
            via: 'direto',
            categoria: 'aquisicao',
            data: '2026-10-01',
            valorCentavos: 30000,
            descricao: 'Aquisição do animal',
            origem: { tipo: 'aquisicao', id: uuid(60) },
            explicacao: 'Lançado diretamente a este animal.',
          },
          {
            via: 'lote',
            categoria: 'alimentacao',
            data: '2026-10-05',
            valorCentavos: 3000,
            descricao: 'Sal mineral',
            origem: { tipo: 'lancamento', id: uuid(61) },
            explicacao:
              'Custo do lote Lote A (R$ 90,00 em 05/10/2026) dividido por igual entre 3 animal(is) presente(s) no lote nesse dia.',
          },
          {
            via: 'rateio',
            categoria: 'alimentacao',
            data: '2026-10-05',
            valorCentavos: null,
            descricao: 'Consumo de Feno',
            origem: null,
            explicacao: 'Parte de um custo da propriedade distribuído por rateio (cabeças).',
          },
        ],
        avisos: [],
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'De onde veio o custo de a1' }));
    const linhas = await screen.findByTestId('linhas-origem-animal');
    expect(within(linhas).getByText(/dividido por igual entre 3 animal/)).toBeTruthy();
    expect(within(linhas).getByText('Custo desconhecido')).toBeTruthy();
    expect(within(linhas).getByText('Sal mineral').closest('a')?.getAttribute('href')).toBe(
      `/financeiro/lancamentos/${uuid(61)}`,
    );
    expect(within(linhas).getByText('Aquisição do animal').closest('a')?.getAttribute('href')).toBe(
      `/financeiro/animais/${uuid(60)}`,
    );
    expect(invocar).toHaveBeenCalledWith('custo:animal', { animalId: uuid(40) });
  });

  it('o período só vai ao servidor quando o usuário o limita', async () => {
    const invocar = montar(<PaginaCustos />, { 'custo:resumo': resumo, 'custo:animais': animais });
    await screen.findByTestId('resumo-custos');
    expect(invocar).toHaveBeenCalledWith('custo:resumo', { propriedadeId: PROP });
    fireEvent.click(screen.getByLabelText('Limitar a um período'));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'custo:resumo',
        expect.objectContaining({ dataInicial: expect.any(String), dataFinal: expect.any(String) }),
      ),
    );
  });
});
