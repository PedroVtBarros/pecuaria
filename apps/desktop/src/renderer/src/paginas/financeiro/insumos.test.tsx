import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  CompraInsumosDetalhe,
  CustoSanitarioRegistro,
  PendenciasEstoqueFinanceiro,
  ResumoConsumos,
} from '@pecuaria/shared-types';
import { ProvedorNotificacoes } from '../../components/notificacoes';
import { CartaoCustoSanitario } from './cartao-custo-sanitario';
import { ModalCompraInsumos } from './modal-compra-insumos';
import { PaginaCompraInsumos } from './pagina-compra-insumos';
import { PaginaCustosConsumo } from './pagina-custos-consumo';
import { PaginaPendencias } from './pagina-pendencias';

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
const itemRacao = {
  id: uuid(10),
  propriedadeId: PROP,
  nome: 'Ração',
  tipo: 'racao',
  unidadeBase: 'kg',
  baseMateria: 'mn',
  controleLote: false,
  estoqueMinimo: null,
  produtoSanitarioId: null,
  ativo: true,
  observacoes: null,
  saldo: 0,
  valorSaldoCentavos: 0,
  valoracaoCompleta: true,
  abaixoMinimo: false,
};
const itemSilagem = { ...itemRacao, id: uuid(11), nome: 'Silagem' };
const categoriaEstoque = {
  id: uuid(20),
  nome: 'Insumos para estoque',
  natureza: 'despesa',
  grupo: 'alimentacao',
  tratamento: 'estoque',
  comportamentoCusto: 'nao_classificado',
  origemExigida: null,
  origem: 'sugestao',
  ativa: true,
};
const categoriaOutra = {
  ...categoriaEstoque,
  id: uuid(21),
  nome: 'Outras despesas',
  tratamento: 'resultado',
};

function montar(elemento: React.ReactNode, respostas: Record<string, unknown> = {}, rota = '/') {
  const invocar = vi.fn(async (canal: string, _entrada?: unknown) => ({
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

const compra = (extra: Partial<CompraInsumosDetalhe> = {}): CompraInsumosDetalhe => ({
  lancamentoId: uuid(70),
  data: '2026-10-01',
  descricao: 'Compra de insumos: Ração',
  documentoNumero: 'NF-1',
  pessoaNome: 'Casa Agro',
  valorTotalCentavos: 100000,
  quantidadeItens: 1,
  somaItensCentavos: 100000,
  diferencaCentavos: 0,
  origem: 'compra_estoque',
  cancelada: false,
  itens: [
    {
      id: uuid(71),
      estoqueItemId: uuid(10),
      estoqueItemNome: 'Ração',
      quantidade: 1000,
      unidadeBase: 'kg',
      valorCentavos: 100000,
      movimentacaoId: uuid(72),
      cancelado: false,
    },
  ],
  situacaoFinanceira: 'a_vencer',
  saldoEmAbertoCentavos: 100000,
  pagoCentavos: 0,
  condicaoPagamento: 'a_vista',
  ...extra,
});

describe('compra de insumos (tela)', () => {
  it('mostra o custo de entrada de cada item com o frete rateado por valor e o total que fecha', async () => {
    const invocar = montar(
      <ModalCompraInsumos
        propriedadeId={PROP}
        aoFechar={() => undefined}
        aoRegistrar={() => undefined}
      />,
      {
        'estoque:listar': [itemRacao, itemSilagem],
        'categoriaFinanceira:listar': [categoriaEstoque, categoriaOutra],
        'compraInsumo:registrar': compra(),
      },
    );
    await screen.findByText('Ração (kg)');
    // Só categorias de compra para estoque.
    const categoria = screen.getByLabelText(/Categoria da compra/) as HTMLSelectElement;
    expect([...categoria.options].map((o) => o.textContent)).toEqual([
      'Escolher…',
      'Insumos para estoque',
    ]);
    fireEvent.change(categoria, { target: { value: categoriaEstoque.id } });
    fireEvent.change(screen.getByLabelText(/Frete/), { target: { value: '90,00' } });
    const linhas = screen.getAllByTestId('linha-compra');
    fireEvent.change(within(linhas[0]!).getByLabelText('Item 1'), {
      target: { value: itemRacao.id },
    });
    fireEvent.change(within(linhas[0]!).getByLabelText(/Quantidade/), { target: { value: '500' } });
    fireEvent.change(within(linhas[0]!).getByLabelText('Valor do item'), {
      target: { value: '600,00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar item/ }));
    const segunda = screen.getAllByTestId('linha-compra')[1]!;
    fireEvent.change(within(segunda).getByLabelText('Item 2'), {
      target: { value: itemSilagem.id },
    });
    fireEvent.change(within(segunda).getByLabelText(/Quantidade/), { target: { value: '1000' } });
    fireEvent.change(within(segunda).getByLabelText('Valor do item'), {
      target: { value: '300,00' },
    });
    // Frete de R$ 90,00 sobre R$ 600,00 e R$ 300,00: 60,00 e 30,00.
    await waitFor(() =>
      expect(screen.getByTestId('total-compra').textContent).toMatch(/R\$\s*990,00/),
    );
    expect(
      within(screen.getAllByTestId('linha-compra')[0]!).getByText(/R\$\s*660,00/),
    ).toBeTruthy();
    expect(
      within(screen.getAllByTestId('linha-compra')[1]!).getByText(/R\$\s*330,00/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar compra' }));
    await waitFor(() =>
      expect(invocar.mock.calls.some((c) => c[0] === 'compraInsumo:registrar')).toBe(true),
    );
    const enviado = invocar.mock.calls.find((c) => c[0] === 'compraInsumo:registrar')![1] as {
      freteCentavos: number;
      condicao: { pagamento: unknown };
      itens: { valorCentavos: number; quantidade: number }[];
    };
    expect(enviado.freteCentavos).toBe(9000);
    expect(enviado.condicao).toMatchObject({ tipo: 'a_vista', pagamento: null });
    expect(enviado.itens.map((i) => [i.valorCentavos, i.quantidade])).toEqual([
      [60000, 500],
      [30000, 1000],
    ]);
  });

  it('item que controla lote exige o lote físico antes de enviar', async () => {
    const vacina = {
      ...itemRacao,
      id: uuid(12),
      nome: 'Vacina',
      unidadeBase: 'dose',
      controleLote: true,
    };
    const invocar = montar(
      <ModalCompraInsumos
        propriedadeId={PROP}
        aoFechar={() => undefined}
        aoRegistrar={() => undefined}
      />,
      {
        'estoque:listar': [vacina],
        'estoque:obter': { item: vacina, lotes: [], movimentos: [], historico: [] },
        'categoriaFinanceira:listar': [categoriaEstoque],
      },
    );
    await screen.findByText('Vacina (dose)');
    fireEvent.change(screen.getByLabelText(/Categoria da compra/), {
      target: { value: categoriaEstoque.id },
    });
    const linha = screen.getAllByTestId('linha-compra')[0]!;
    fireEvent.change(within(linha).getByLabelText('Item 1'), { target: { value: vacina.id } });
    fireEvent.change(within(linha).getByLabelText(/Quantidade/), { target: { value: '20' } });
    fireEvent.change(within(linha).getByLabelText('Valor do item'), { target: { value: '40,00' } });
    expect(await within(linha).findByLabelText(/Lote físico/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar compra' }));
    expect(await screen.findByText('Linha 1: informe o lote físico.')).toBeTruthy();
    expect(invocar.mock.calls.some((c) => c[0] === 'compraInsumo:registrar')).toBe(false);
  });
});

describe('detalhe da compra de insumos', () => {
  const rota = (c: CompraInsumosDetalhe) =>
    montar(
      <Routes>
        <Route path="/financeiro/insumos/:id" element={<PaginaCompraInsumos />} />
      </Routes>,
      {
        'compraInsumo:obter': c,
        'lancamento:obter': { id: c.lancamentoId, motivoCancelamento: null },
      },
      `/financeiro/insumos/${c.lancamentoId}`,
    );

  it('mostra operação, a pagar, pago e soma dos itens separados, e a diferença como pendência', async () => {
    rota(compra({ valorTotalCentavos: 110000, diferencaCentavos: 10000, origem: 'manual' }));
    const valores = await screen.findByTestId('valores-compra-insumos');
    expect(within(valores).getByText('Valor da operação')).toBeTruthy();
    expect(within(valores).getByText('A pagar')).toBeTruthy();
    expect(within(valores).getByText(/Diferença com a operação/)).toBeTruthy();
    expect(screen.getByText(/ligado depois às entradas de estoque/)).toBeTruthy();
  });

  it('corrigir mostra o novo total e exige o motivo; correção sem parcelas novas é recusada pela tela quando o total muda', async () => {
    const invocar = rota(compra());
    fireEvent.click(await screen.findByRole('button', { name: 'Corrigir' }));
    fireEvent.change(screen.getByLabelText(/Valor do item/), { target: { value: '1.200,00' } });
    await waitFor(() =>
      expect(screen.getByTestId('resumo-correcao').textContent).toMatch(/R\$\s*1\.200,00/),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Corrigir item' }));
    expect(await screen.findByText('Informe o motivo da correção.')).toBeTruthy();
    expect(invocar.mock.calls.some((c) => c[0] === 'compraInsumo:corrigirItem')).toBe(false);
  });

  it('cancelada: sem ações e com o aviso', async () => {
    rota(compra({ cancelada: true, quantidadeItens: 0, situacaoFinanceira: 'cancelado' }));
    expect(await screen.findByText('Compra cancelada')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar compra' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Corrigir' })).toBeNull();
  });
});

describe('pendências de estoque e financeiro', () => {
  const pendencias: PendenciasEstoqueFinanceiro = {
    propriedadeId: PROP,
    entradasSemDocumento: {
      total: 2,
      itens: [
        {
          movimentacaoId: uuid(80),
          data: '2026-09-15',
          estoqueItemId: uuid(10),
          estoqueItemNome: 'Ração',
          quantidade: 100,
          unidadeBase: 'kg',
          custoEntradaCentavos: 20000,
          documentoOrfao: false,
        },
        {
          movimentacaoId: uuid(81),
          data: '2026-09-16',
          estoqueItemId: uuid(11),
          estoqueItemNome: 'Silagem',
          quantidade: 50,
          unidadeBase: 'kg',
          custoEntradaCentavos: null,
          documentoOrfao: true,
        },
      ],
    },
    comprasSemEntrada: [
      { id: uuid(90), data: '2026-10-01', descricao: 'Ração do mês', valorCentavos: 50000 },
    ],
    diferencas: [
      {
        id: uuid(91),
        data: '2026-10-02',
        descricao: 'Nota com frete',
        totalCentavos: 25000,
        somaItensCentavos: 20000,
      },
    ],
    consumosSemCusto: 3,
    total: 7,
  };
  it('lista cada tipo de pendência; custo desconhecido aparece como tal e não vira zero', async () => {
    montar(<PaginaPendencias />, { 'auditoria:pendencias': pendencias });
    const entradas = await screen.findByTestId('tabela-entradas-sem-documento');
    expect(within(entradas).getByText('Custo desconhecido')).toBeTruthy();
    expect(within(entradas).getByText(/aponta para um documento que não existe/i)).toBeTruthy();
    expect(screen.getByTestId('tabela-compras-sem-entrada')).toBeTruthy();
    const dif = screen.getByTestId('tabela-diferencas');
    expect(within(dif).getAllByText(/R\$\s*50,00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/3 consumo\(s\) sem custo conhecido/)).toBeTruthy();
  });
  it('sem pendências diz que nada há a conferir', async () => {
    montar(<PaginaPendencias />, {
      'auditoria:pendencias': {
        ...pendencias,
        entradasSemDocumento: { total: 0, itens: [] },
        comprasSemEntrada: [],
        diferencas: [],
        consumosSemCusto: 0,
        total: 0,
      },
    });
    expect(await screen.findByText('Nada a conferir')).toBeTruthy();
  });
});

describe('custos de consumo', () => {
  const zero = { componentesNaoApurados: 0 };
  const resumo: ResumoConsumos = {
    propriedadeId: PROP,
    total: {
      estado: 'parcial',
      valorConhecidoCentavos: 5000,
      componentesConhecidos: 2,
      componentesDesconhecidos: 1,
      ...zero,
    },
    naoAlocado: {
      estado: 'completa',
      valorConhecidoCentavos: 1000,
      componentesConhecidos: 1,
      componentesDesconhecidos: 0,
      ...zero,
    },
    porDestino: [
      {
        chave: 'lote',
        rotulo: 'Lote de animais',
        apuracao: {
          estado: 'parcial',
          valorConhecidoCentavos: 4000,
          componentesConhecidos: 1,
          componentesDesconhecidos: 1,
          ...zero,
        },
      },
    ],
    porTipo: [],
    porItem: [
      {
        chave: uuid(10),
        rotulo: 'Ração',
        apuracao: {
          estado: 'completa',
          valorConhecidoCentavos: 5000,
          componentesConhecidos: 2,
          componentesDesconhecidos: 0,
          ...zero,
        },
        classificacao: 'nao_classificado',
      },
      {
        chave: uuid(11),
        rotulo: 'Silagem',
        apuracao: {
          estado: 'desconhecida',
          valorConhecidoCentavos: 0,
          componentesConhecidos: 0,
          componentesDesconhecidos: 1,
          ...zero,
        },
        classificacao: 'variavel',
      },
    ],
  };
  it('total parcial mostra "no mínimo"; consumo sem custo é "custo desconhecido", nunca R$ 0,00', async () => {
    montar(<PaginaCustosConsumo />, {
      'consumo:resumo': resumo,
      'consumo:listar': {
        itens: [
          {
            movimentacaoId: uuid(100),
            data: '2026-10-05',
            tipo: 'saida_consumo',
            estoqueItemId: uuid(11),
            estoqueItemNome: 'Silagem',
            quantidade: 20,
            unidadeBase: 'kg',
            destino: 'lote',
            destinoDescricao: 'Lote Engorda',
            manejoSanitarioId: null,
            custoApropriadoCentavos: null,
          },
        ],
        total: 1,
        pagina: 1,
        tamanhoPagina: 30,
      },
    });
    const kpis = await screen.findByTestId('resumo-consumos');
    expect(within(kpis).getByText(/no mínimo R\$\s*50,00/)).toBeTruthy();
    expect(within(kpis).getByText(/Parcial: há custo sem valor/)).toBeTruthy();
    const tabela = await screen.findByTestId('tabela-consumos');
    expect(within(tabela).getByText('Custo desconhecido')).toBeTruthy();
    expect(within(tabela).queryByText(/R\$\s*0,00/)).toBeNull();
    const porItem = screen.getByTestId('tabela-consumo-por-item');
    expect(within(porItem).getByText('Custo desconhecido')).toBeTruthy();
  });
  it('classificar um item de estoque envia o escopo e a referência', async () => {
    const invocar = montar(<PaginaCustosConsumo />, {
      'consumo:resumo': resumo,
      'consumo:listar': { itens: [], total: 0, pagina: 1, tamanhoPagina: 30 },
      'classificacaoOrigem:definir': [],
    });
    const seletor = await screen.findByLabelText('Classificar Ração');
    fireEvent.change(seletor, { target: { value: 'fixo' } });
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith('classificacaoOrigem:definir', {
        propriedadeId: PROP,
        escopo: 'estoque_item',
        referenciaId: uuid(10),
        comportamento: 'fixo',
      }),
    );
  });
});

describe('custo do registro sanitário (cartão)', () => {
  const custo = (extra: Partial<CustoSanitarioRegistro> = {}): CustoSanitarioRegistro => ({
    manejoId: uuid(200),
    data: '2026-10-01',
    apuracao: {
      estado: 'completa',
      valorConhecidoCentavos: 100,
      componentesConhecidos: 1,
      componentesDesconhecidos: 0,
      componentesNaoApurados: 0,
    },
    estoque: {
      quantidade: 1,
      conhecidoCentavos: 100,
      desconhecidos: 0,
      baixas: [{ id: uuid(201), custoApropriadoCentavos: 100 }],
    },
    servicos: [],
    servicosCentavos: 0,
    informadoCentavos: 9000,
    informadoContado: false,
    informadoNaoContadoCentavos: 9000,
    porAnimal: [
      { animalId: uuid(202), identificacao: 'A-1', valorCentavos: 50 },
      { animalId: uuid(203), identificacao: 'A-2', valorCentavos: 50 },
    ],
    observacao: 'Nota.',
    ...extra,
  });
  it('o valor digitado fica "informado, não contado" quando há baixa de estoque', async () => {
    montar(<CartaoCustoSanitario manejoId={uuid(200)} />, { 'custoSanitario:obter': custo() });
    const cartao = await screen.findByTestId('custo-sanitario');
    expect(within(cartao).getByText(/Custo apurado/)).toBeTruthy();
    expect(within(cartao).getByText(/informado, não contado/)).toBeTruthy();
    expect(within(cartao).getByText(/R\$\s*0,50/)).toBeTruthy();
  });
  it('sem nenhum componente: custo não apurado, sem valor por animal', async () => {
    montar(<CartaoCustoSanitario manejoId={uuid(200)} />, {
      'custoSanitario:obter': custo({
        apuracao: {
          estado: 'nao_apurada',
          valorConhecidoCentavos: 0,
          componentesConhecidos: 0,
          componentesDesconhecidos: 0,
          componentesNaoApurados: 1,
        },
        estoque: { quantidade: 0, conhecidoCentavos: 0, desconhecidos: 0, baixas: [] },
        informadoCentavos: null,
        informadoNaoContadoCentavos: null,
        porAnimal: [],
      }),
    });
    const cartao = await screen.findByTestId('custo-sanitario');
    expect(within(cartao).getByText('Custo não apurado')).toBeTruthy();
    expect(within(cartao).queryByText(/R\$\s*0,00/)).toBeNull();
    expect(within(cartao).getByText(/não informado/)).toBeTruthy();
  });
});
