import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProvedorNotificacoes } from '../../components/notificacoes';
import { PaginaClassificacoes } from './pagina-classificacoes';
import { PaginaContas } from './pagina-contas';
import { PaginaFluxo } from './pagina-fluxo';
import { PaginaPainelFinanceiro } from './pagina-painel';

const uuid = (n: number) => `01a13f6e-0000-7000-8000-${String(n).padStart(12, '0')}`;
const PROP = uuid(2);
const L1 = uuid(11);
const L9 = uuid(19);
const P1 = uuid(21);
const C1 = uuid(31);
const C2 = uuid(32);
const PESSOA = uuid(41);
const propriedade = {
  id: PROP,
  nome: 'Fazenda Teste',
  municipio: null,
  uf: null,
  areaTotalHa: null,
  tipoExploracao: 'misto',
  observacoes: null,
};

const painel = {
  propriedadeId: PROP,
  dataInicial: '2026-10-01',
  dataFinal: '2026-10-31',
  hoje: '2026-10-16',
  caixa: { entradasCentavos: 50000, saidasCentavos: 110000, saldoCentavos: -60000, movimentos: 3 },
  contas: {
    aReceber: {
      saldoTotalCentavos: 250000,
      emAtrasoCentavos: 250000,
      emAtrasoQuantidade: 1,
      proximos30DiasCentavos: 0,
      proximos30DiasQuantidade: 0,
    },
    aPagar: {
      saldoTotalCentavos: 90000,
      emAtrasoCentavos: 0,
      emAtrasoQuantidade: 0,
      proximos30DiasCentavos: 20000,
      proximos30DiasQuantidade: 1,
    },
  },
  competencia: [
    { natureza: 'despesa', tratamento: 'resultado', totalCentavos: 277700, quantidade: 3 },
    { natureza: 'despesa', tratamento: 'estoque', totalCentavos: 50000, quantidade: 1 },
  ],
  pendencias: {
    pendentesDeDefinicao: {
      quantidade: 1,
      valorOperacaoReceitaCentavos: 0,
      valorOperacaoDespesaCentavos: 77700,
    },
    despesasNaoClassificadas: { quantidade: 3, valorCentavos: 277700 },
  },
};

const fluxo = {
  propriedadeId: PROP,
  dataInicial: '2026-10-01',
  dataFinal: '2026-12-31',
  granularidade: 'mes',
  hoje: '2026-10-16',
  realizado: {
    linhas: [
      {
        chave: '2026-10',
        inicio: '2026-10-01',
        fim: '2026-10-31',
        entradasCentavos: 50000,
        saidasCentavos: 110000,
        saldoDoPeriodoCentavos: -60000,
        acumuladoCentavos: -60000,
        movimentos: 3,
      },
      {
        chave: '2026-11',
        inicio: '2026-11-01',
        fim: '2026-11-30',
        entradasCentavos: 0,
        saidasCentavos: 0,
        saldoDoPeriodoCentavos: 0,
        acumuladoCentavos: -60000,
        movimentos: 0,
      },
    ],
    entradasCentavos: 50000,
    saidasCentavos: 110000,
    saldoCentavos: -60000,
    movimentos: 3,
    porCategoria: [
      {
        categoriaId: C1,
        categoriaNome: 'Mão de obra',
        grupo: 'mao_de_obra',
        tratamento: 'resultado',
        natureza: 'despesa',
        totalCentavos: 110000,
        quantidade: 2,
      },
    ],
  },
  previsto: {
    linhas: [
      {
        chave: '2026-10',
        inicio: '2026-10-01',
        fim: '2026-10-31',
        aReceberCentavos: 250000,
        aPagarCentavos: 0,
        emAtrasoReceberCentavos: 250000,
        emAtrasoPagarCentavos: 0,
        saldoPrevistoCentavos: 250000,
        parcelas: 1,
      },
    ],
    aReceberCentavos: 250000,
    aPagarCentavos: 0,
    emAtrasoReceberCentavos: 250000,
    emAtrasoPagarCentavos: 0,
    saldoPrevistoCentavos: 250000,
    parcelas: 1,
    porCategoria: [],
  },
  pendentesDeDefinicao: {
    quantidade: 1,
    valorOperacaoReceitaCentavos: 0,
    valorOperacaoDespesaCentavos: 77700,
  },
};

const conta = {
  parcelaId: P1,
  lancamentoId: L1,
  numero: 1,
  totalParcelas: 3,
  vencimento: '2026-10-10',
  valorCentavos: 30000,
  pagoCentavos: 10000,
  saldoCentavos: 20000,
  situacao: 'atrasada',
  diasEmAtraso: 6,
  natureza: 'despesa',
  descricao: 'Diaristas de outubro',
  documentoNumero: null,
  categoria: { id: C1, nome: 'Mão de obra' },
  pessoa: { id: PESSOA, nome: 'João' },
  dataCompetencia: '2026-10-01',
  atividade: 'nao_definida',
  destinoDescricao: 'Propriedade',
};
const contas = {
  natureza: 'despesa',
  hoje: '2026-10-16',
  itens: [conta],
  total: 1,
  pagina: 1,
  tamanhoPagina: 50,
  resumo: {
    quantidade: 1,
    saldoTotalCentavos: 20000,
    emAtrasoQuantidade: 1,
    emAtrasoCentavos: 20000,
    aVencerQuantidade: 0,
    aVencerCentavos: 0,
  },
  pendentesDeDefinicao: { quantidade: 1, valorOperacaoCentavos: 77700 },
};

const classificacao = {
  propriedadeId: PROP,
  dataInicial: null,
  dataFinal: null,
  cobertura: {
    totalCentavos: 277700,
    fixoCentavos: 100000,
    variavelCentavos: 0,
    naoClassificadoCentavos: 177700,
    quantidadeTotal: 3,
    quantidadeNaoClassificada: 2,
  },
  porCategoria: [
    {
      categoriaId: C1,
      categoriaNome: 'Mão de obra',
      grupo: 'mao_de_obra',
      tratamento: 'resultado',
      ativa: true,
      padrao: 'fixo',
      fixo: { quantidade: 1, valorCentavos: 100000 },
      variavel: { quantidade: 0, valorCentavos: 0 },
      naoClassificado: { quantidade: 1, valorCentavos: 100000 },
    },
    {
      categoriaId: C2,
      categoriaNome: 'Outras despesas',
      grupo: 'outros',
      tratamento: 'resultado',
      ativa: true,
      padrao: 'nao_classificado',
      fixo: { quantidade: 0, valorCentavos: 0 },
      variavel: { quantidade: 0, valorCentavos: 0 },
      naoClassificado: { quantidade: 1, valorCentavos: 77700 },
    },
  ],
};
const previa = {
  categoriaId: C1,
  categoriaNome: 'Mão de obra',
  padrao: 'fixo',
  quantidade: 1,
  valorCentavos: 100000,
  amostra: [
    {
      id: L1,
      descricao: 'Diaristas de outubro',
      dataCompetencia: '2026-10-01',
      valorCentavos: 100000,
    },
  ],
};

function montar(elemento: React.ReactNode, respostas: Record<string, unknown>) {
  const invocar = vi.fn(async (canal: string) => ({
    ok: true,
    dados:
      canal === 'configuracao:obter'
        ? { valor: null }
        : canal === 'propriedade:listar'
          ? [propriedade]
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
      <MemoryRouter>
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

describe('painel financeiro', () => {
  it('mostra caixa, contas, competência e pendências em blocos separados, com o alerta de saldo desconhecido', async () => {
    montar(<PaginaPainelFinanceiro />, {
      'painel:obter': painel,
      'resultado:periodo': {
        propriedadeId: PROP,
        dataInicial: '2026-10-01',
        dataFinal: '2026-10-31',
        competencia: {
          receitas: {
            vendaAnimaisCentavos: 300000,
            leiteCentavos: 0,
            outrasCentavos: 0,
            totalCentavos: 300000,
          },
          custo: {
            estado: 'parcial',
            valorConhecidoCentavos: 360000,
            componentesConhecidos: 3,
            componentesDesconhecidos: 1,
            componentesNaoApurados: 0,
          },
          porCategoria: [],
          baixaDeAnimaisCentavos: 0,
          naoAlocadoCentavos: 0,
          animaisSemBase: 0,
          valorConhecidoCentavos: -60000,
          resultadoCentavos: -60000,
          receitasDesconhecidas: 0,
          estado: 'parcial',
          limite: 'no_maximo',
        },
        caixa: { entradasCentavos: 0, saidasCentavos: 0, saldoCentavos: 0 },
        margemBruta: {
          receitaCentavos: 0,
          variaveisCentavos: 0,
          fixosCentavos: 0,
          margemCentavos: 0,
          estado: 'parcial',
          coberturaCentavos: { classificado: 0, total: 0, naoClassificado: 0 },
          motivos: [],
          semClassificacao: [],
          semClassificacaoTruncada: false,
        },
      },
      'rateio:pendentes': {
        propriedadeId: PROP,
        itens: [],
        total: {
          estado: 'completa',
          valorConhecidoCentavos: 5000,
          componentesConhecidos: 1,
          componentesDesconhecidos: 0,
          componentesNaoApurados: 0,
        },
        truncado: false,
      },
      'producao:listar': [],
    });
    const resultado = await screen.findByTestId('bloco-resultado');
    // Custo parcial: o resultado é um máximo, nunca apresentado como exato.
    expect(await within(resultado).findByText(/no máximo -?R\$\s*-?600,00/)).toBeTruthy();
    expect(within(screen.getByTestId('bloco-pendencias')).getByText(/não alocados/)).toBeTruthy();
    const caixa = await screen.findByTestId('bloco-caixa');
    expect(within(caixa).getByText('Entradas (recebido)')).toBeTruthy();
    expect(within(caixa).getByText(/não é lucro nem resultado/)).toBeTruthy();
    expect(within(caixa).getAllByText(/R\$\s*500,00/).length).toBeGreaterThan(0);
    const contasBloco = screen.getByTestId('bloco-contas');
    // A receber total e o atraso coincidem neste cenário (R$ 2.500,00 nos dois).
    expect(within(contasBloco).getAllByText(/R\$\s*2\.500,00/)).toHaveLength(2);
    const competencia = screen.getByTestId('bloco-competencia');
    expect(within(competencia).getByText(/Despesa · Resultado/)).toBeTruthy();
    expect(within(competencia).getByText(/Despesa · Estoque/)).toBeTruthy();
    expect(within(competencia).getByText(/Não é o\s+resultado/)).toBeTruthy();
    const pend = screen.getByTestId('bloco-pendencias');
    expect(within(pend).getByText(/saldo a pagar ou receber é desconhecido/)).toBeTruthy();
    expect(within(pend).getByText(/sem classificação em fixa ou variável/)).toBeTruthy();
  });
});

describe('fluxo de caixa', () => {
  it('realizado e previsto em abas separadas; aviso de pendentes só no previsto', async () => {
    montar(<PaginaFluxo />, { 'fluxo:obter': fluxo });
    const realizado = await screen.findByTestId('fluxo-realizado');
    expect(within(realizado).getByText('out/2026')).toBeTruthy();
    // Períodos sem movimento ficam ocultos até o usuário pedir para vê-los.
    expect(within(realizado).queryByText('nov/2026')).toBeNull();
    fireEvent.click(screen.getByLabelText('Mostrar períodos sem movimento'));
    expect(within(realizado).getByText('nov/2026')).toBeTruthy();
    expect(within(realizado).queryByText(/sem condição de pagamento definida/)).toBeNull();
    expect(screen.queryByTestId('fluxo-previsto')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Previsto/ }));
    const previsto = await screen.findByTestId('fluxo-previsto');
    expect(within(previsto).getByText(/previsão, nunca soma com o realizado/)).toBeTruthy();
    expect(
      within(previsto).getByText(/Há lançamentos sem condição de pagamento definida/),
    ).toBeTruthy();
    expect(within(previsto).getByText(/o saldo deles é desconhecido, não zero/)).toBeTruthy();
    expect(screen.queryByTestId('fluxo-realizado')).toBeNull();
  });

  it('período sem pagamentos diz que nada foi registrado, em vez de mostrar um saldo', async () => {
    montar(<PaginaFluxo />, {
      'fluxo:obter': {
        ...fluxo,
        realizado: { ...fluxo.realizado, linhas: [], movimentos: 0, porCategoria: [] },
      },
    });
    expect(await screen.findByText('Nenhum pagamento ou recebimento no período')).toBeTruthy();
  });
});

describe('contas a pagar e a receber', () => {
  it('lista a parcela com atraso em dias e registra o pagamento pelo lançamento', async () => {
    const detalhe = {
      id: L1,
      natureza: 'despesa',
      parcelas: [
        {
          id: P1,
          numero: 1,
          vencimento: '2026-10-10',
          valorCentavos: 30000,
          pagoCentavos: 10000,
          saldoCentavos: 20000,
          situacao: 'atrasada',
          cancelada: false,
          motivoCancelamento: null,
        },
      ],
      pagamentos: [],
      historico: [],
    };
    const invocar = montar(<PaginaContas />, {
      'conta:listar': contas,
      'lancamento:obter': detalhe,
      'pagamento:registrar': detalhe,
    });
    const tabela = await screen.findByTestId('tabela-contas');
    expect(within(tabela).getByText('Diaristas de outubro')).toBeTruthy();
    expect(within(tabela).getByText('Atrasada há 6 dia(s)')).toBeTruthy();
    expect(within(tabela).getByText('1/3')).toBeTruthy();
    const resumo = screen.getByTestId('resumo-contas');
    expect(within(resumo).getByText('Total a pagar')).toBeTruthy();
    expect(screen.getByText(/Saldo desconhecido em alguns lançamentos/)).toBeTruthy();

    fireEvent.click(within(tabela).getByRole('button', { name: 'Registrar pagamento' }));
    const botao = await screen.findByRole('button', { name: 'Registrar pagamento', hidden: false });
    expect(botao).toBeTruthy();
    expect(await screen.findByText(/Saldo da parcela: R\$\s*200,00/)).toBeTruthy();
    expect(invocar).toHaveBeenCalledWith('lancamento:obter', { id: L1 });
  });

  it('a aba "A receber" pede a natureza receita', async () => {
    const invocar = montar(<PaginaContas />, {
      'conta:listar': { ...contas, natureza: 'receita', itens: [], total: 0 },
    });
    await screen.findByTestId('resumo-contas');
    fireEvent.click(screen.getByRole('tab', { name: 'A receber' }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'conta:listar',
        expect.objectContaining({ natureza: 'receita', pagina: 1 }),
      ),
    );
    expect(await screen.findByText('Nada a receber')).toBeTruthy();
  });
});

describe('classificações', () => {
  it('mostra a cobertura, oferece aplicar só quando há padrão e confirma pela prévia', async () => {
    const invocar = montar(<PaginaClassificacoes />, {
      'classificacao:resumo': classificacao,
      'classificacao:previa': previa,
      'classificacao:aplicarCategoria': {
        categoriaId: C1,
        comportamento: 'fixo',
        quantidadeAlterada: 1,
        valorCentavos: 100000,
      },
      'lancamento:listar': { itens: [], total: 0, pagina: 1, tamanhoPagina: 20 },
    });
    const cobertura = await screen.findByTestId('cobertura-classificacao');
    expect(within(cobertura).getByText('Sem classificação')).toBeTruthy();
    const tabela = screen.getByTestId('tabela-classificacao-categorias');
    // Só a categoria com padrão definido oferece a ação em lote.
    expect(within(tabela).getAllByRole('button', { name: 'Aplicar o padrão' })).toHaveLength(1);
    expect(within(tabela).getByText(/Defina em/)).toBeTruthy();

    fireEvent.click(within(tabela).getByRole('button', { name: 'Aplicar o padrão' }));
    const bloco = await screen.findByTestId('previa-classificacao');
    expect(within(bloco).getByText(/passarão de "Não classificado" para/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar classificação' }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith('classificacao:aplicarCategoria', {
        propriedadeId: PROP,
        categoriaId: C1,
        comportamento: 'fixo',
        quantidadeEsperada: 1,
        motivo: null,
      }),
    );
  });

  it('lista de despesas sem classificação classifica um lançamento isolado', async () => {
    const invocar = montar(<PaginaClassificacoes />, {
      'classificacao:resumo': classificacao,
      'classificacao:definirLancamento': {},
      'lancamento:listar': {
        itens: [
          {
            id: L9,
            descricao: 'Conserto da cerca',
            dataCompetencia: '2026-10-01',
            categoria: {
              id: C2,
              nome: 'Outras despesas',
              tratamento: 'resultado',
              grupo: 'outros',
            },
            valorOperacaoCentavos: 77700,
          },
        ],
        total: 1,
        pagina: 1,
        tamanhoPagina: 20,
      },
    });
    const seletor = await screen.findByLabelText('Classificar Conserto da cerca');
    fireEvent.change(seletor, { target: { value: 'variavel' } });
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith('classificacao:definirLancamento', {
        id: L9,
        comportamento: 'variavel',
        motivo: null,
      }),
    );
  });
});
