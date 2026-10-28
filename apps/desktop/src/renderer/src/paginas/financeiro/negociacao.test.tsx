import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AnimalDetalhe, CustoDoAnimal, NegociacaoDetalhe } from '@pecuaria/shared-types';
import { ProvedorNotificacoes } from '../../components/notificacoes';
import { condicaoInicial } from './editor-condicao';
import {
  estadoNegocioInicial,
  interpretar,
  quilosDoTexto,
  totalSugerido,
} from './formulario-negociacao';
import { CustoDoAnimalAba } from './custo-do-animal';
import { ModalCompra } from './modal-compra';
import { ModalVenda } from './modal-venda';
import { PaginaNegociacao } from './pagina-negociacao';

const uuid = (n: number) => `01a13f6e-0000-7000-8000-${String(n).padStart(12, '0')}`;
const PROP = uuid(2);

const estado = (extra = {}) => ({
  ...estadoNegocioInicial('2026-10-16', condicaoInicial('2026-10-16')),
  ...extra,
});
const linha = (rotulo: string, extra = {}) => ({
  chave: rotulo,
  rotulo,
  pesoVivo: '',
  pesoCarcaca: '',
  valorManual: '',
  ...extra,
});

describe('interpretação do formulário de negociação', () => {
  it('quilos: vírgula ou ponto, até três casas; vazio é nulo; lixo é inválido', () => {
    expect(quilosDoTexto('312,5')).toBe(312.5);
    expect(quilosDoTexto('312.500')).toBe(312.5);
    expect(quilosDoTexto('')).toBeNull();
    expect(Number.isNaN(quilosDoTexto('3,1234'))).toBe(true);
    expect(Number.isNaN(quilosDoTexto('abc'))).toBe(true);
  });
  it('divide o total por igual e fecha exatamente, com o resto no menor id', () => {
    const r = interpretar(
      estado({ total: '100,00' }),
      [linha('a'), linha('b'), linha('c')],
      'despesa',
    );
    expect(r.erros).toEqual([]);
    expect([...r.valores!.values()].sort()).toEqual([3333, 3333, 3334]);
    expect([...r.valores!.values()].reduce((s, v) => s + v, 0)).toBe(10000);
  });
  it('peso faltando bloqueia (não cai em "igual")', () => {
    const r = interpretar(
      estado({ total: '100,00', criterio: 'peso_vivo' }),
      [linha('a', { pesoVivo: '300' }), linha('b')],
      'despesa',
    );
    expect(r.valores).toBeNull();
    expect(r.erros.join(' ')).toMatch(/exige o peso vivo de todos os animais\. Falta em: b/);
  });
  it('preço unitário que não bate com o total é apontado', () => {
    const r = interpretar(
      estado({ total: '10,00', unidadePreco: 'cabeca', preco: '3,00' }),
      [linha('a'), linha('b')],
      'despesa',
    );
    expect(r.erros.join(' ')).toMatch(/diferença de 400 centavos/);
  });
  it('total vazio, preço ambíguo e lista vazia são recusados', () => {
    expect(interpretar(estado(), [linha('a')], 'despesa').erros.join(' ')).toMatch(
      /Informe o valor total/,
    );
    expect(
      interpretar(estado({ total: '1.234' }), [linha('a')], 'despesa').erros.join(' '),
    ).toMatch(/inválido ou ambíguo/);
    expect(interpretar(estado({ total: '10,00' }), [], 'despesa').erros.join(' ')).toMatch(
      /ao menos um animal/,
    );
  });
  it('sugere o total pelo preço por @ de peso vivo: 750 kg = 50 @ a R$ 160,00', () => {
    const e = estado({ unidadePreco: 'arroba_vivo', preco: '160,00' });
    expect(
      totalSugerido(e, [linha('a', { pesoVivo: '450' }), linha('b', { pesoVivo: '300' })]),
    ).toBe(800000);
    expect(totalSugerido(e, [linha('a', { pesoVivo: '450' }), linha('b')])).toBeNull();
  });
});

function montar(elemento: React.ReactNode, respostas: Record<string, unknown> = {}, rota = '/') {
  const invocar = vi.fn(async (canal: string, _entrada?: unknown) => ({
    ok: true,
    dados:
      canal === 'configuracao:obter'
        ? { valor: null }
        : (respostas[canal] ??
          (canal === 'animal:listar' ? { itens: [], total: 0, pagina: 1, tamanhoPagina: 50 } : [])),
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

const negociacao = (extra: Partial<NegociacaoDetalhe> = {}): NegociacaoDetalhe => ({
  id: uuid(50),
  propriedadeId: PROP,
  tipo: 'venda',
  data: '2026-10-10',
  pessoa: { id: uuid(60), nome: 'Frigorífico Sul' },
  lancamentoId: uuid(70),
  valorTotalCentavos: 800000,
  criterio: 'peso_vivo',
  unidadePreco: 'arroba_vivo',
  precoUnitarioCentavos: 16000,
  quantidadeAnimais: 2,
  observacoes: null,
  cancelada: false,
  motivoCancelamento: null,
  criadoEm: '2026-10-10T10:00:00.000Z',
  situacaoFinanceira: 'a_vencer',
  saldoEmAbertoCentavos: 800000,
  pagoCentavos: 0,
  compensadoCentavos: 0,
  devolucoes: [],
  atividade: 'corte',
  itens: [
    {
      id: uuid(51),
      animalId: uuid(81),
      animalIdentificacao: 'V-1',
      valorAlocadoCentavos: 480000,
      pesoVivoKg: 450,
      pesoCarcacaKg: null,
      cancelado: false,
      devolucao: null,
    },
    {
      id: uuid(52),
      animalId: uuid(82),
      animalIdentificacao: 'V-2',
      valorAlocadoCentavos: 320000,
      pesoVivoKg: 300,
      pesoCarcacaKg: null,
      cancelado: false,
      devolucao: null,
    },
  ],
  ...extra,
});

describe('compra de animais (tela)', () => {
  it('gera identificações, mostra a prévia que fecha com o total e envia a compra', async () => {
    const aoRegistrar = vi.fn();
    const invocar = montar(
      <ModalCompra propriedadeId={PROP} aoFechar={() => undefined} aoRegistrar={aoRegistrar} />,
      { 'negociacao:registrarCompra': negociacao({ tipo: 'compra' }) },
    );
    const total = screen.getByLabelText(/Valor total da operação/);
    fireEvent.change(total, { target: { value: '100,00' } });
    fireEvent.change(screen.getByLabelText('Prefixo da identificação'), {
      target: { value: 'B-' },
    });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar identificações' }));
    const previa = await screen.findByTestId('previa-alocacao');
    expect(within(previa).getByTestId('soma-alocacao').textContent).toMatch(/R\$\s*100,00/);
    expect(within(previa).getByText('B-1')).toBeTruthy();
    expect(within(previa).getByText('B-3')).toBeTruthy();
    // À vista não pago: nenhum pagamento é criado sem confirmação.
    fireEvent.click(screen.getByRole('button', { name: 'Registrar compra' }));
    await waitFor(() => expect(aoRegistrar).toHaveBeenCalled());
    const chamada = invocar.mock.calls.find((c) => c[0] === 'negociacao:registrarCompra')![1] as {
      valorTotalCentavos: number;
      criterio: string;
      condicao: { tipo: string; pagamento: unknown };
      animais: { dados: { identificacao: string; origem: string } }[];
    };
    expect(chamada).toMatchObject({ valorTotalCentavos: 10000, criterio: 'igual' });
    expect(chamada.condicao).toMatchObject({ tipo: 'a_vista', pagamento: null });
    expect(chamada.animais.map((a) => a.dados.identificacao)).toEqual(['B-1', 'B-2', 'B-3']);
    expect(chamada.animais.every((a) => a.dados.origem === 'comprado')).toBe(true);
  });

  it('critério por peso sem peso nos animais mostra o bloqueio e não envia', async () => {
    const invocar = montar(
      <ModalCompra propriedadeId={PROP} aoFechar={() => undefined} aoRegistrar={() => undefined} />,
    );
    fireEvent.change(screen.getByLabelText(/Valor total da operação/), {
      target: { value: '100,00' },
    });
    fireEvent.change(screen.getByLabelText('Unidade do preço negociado'), {
      target: { value: 'kg_vivo' },
    });
    fireEvent.change(screen.getByLabelText('Preço unitário'), { target: { value: '1,00' } });
    fireEvent.change(screen.getByLabelText('Identificação 1'), { target: { value: 'X-1' } });
    const previa = await screen.findByTestId('previa-alocacao');
    expect(within(previa).getByText(/exige o peso vivo de todos os animais/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar compra' }));
    await waitFor(() => expect(screen.getAllByText(/exige o peso vivo/).length).toBeGreaterThan(0));
    expect(invocar.mock.calls.some((c) => c[0] === 'negociacao:registrarCompra')).toBe(false);
  });
});

describe('venda de animais (tela)', () => {
  it('escolhe animais ativos, sugere o peso da última pesagem sem impô-lo e envia a venda', async () => {
    const aoRegistrar = vi.fn();
    const invocar = montar(
      <ModalVenda propriedadeId={PROP} aoFechar={() => undefined} aoRegistrar={aoRegistrar} />,
      {
        'animal:listar': {
          itens: [
            {
              id: uuid(81),
              identificacao: 'V-1',
              nome: null,
              sexo: 'M',
              categoria: 'garrote',
              raca: null,
              lote: { id: uuid(9), nome: 'Engorda' },
              dataNascimento: null,
              status: 'ativo',
              ultimaPesagem: { pesoVivoKg: 450, data: '2026-10-01', metodo: 'balanca' },
            },
          ],
          total: 1,
          pagina: 1,
          tamanhoPagina: 5000,
        },
        'negociacao:registrarVenda': negociacao(),
      },
    );
    const lista = await screen.findByTestId('animais-disponiveis');
    fireEvent.click(within(lista).getByRole('button', { name: /V-1/ }));
    const escolhidos = screen.getByTestId('animais-da-venda');
    expect(
      (within(escolhidos).getByLabelText('Peso vivo na venda (kg)') as HTMLInputElement).value,
    ).toBe('450');
    fireEvent.change(screen.getByLabelText(/Valor total da operação/), {
      target: { value: '5.000,00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venda' }));
    await waitFor(() => expect(aoRegistrar).toHaveBeenCalled());
    const chamada = invocar.mock.calls.find((c) => c[0] === 'negociacao:registrarVenda')![1] as {
      valorTotalCentavos: number;
      animais: { animalId: string; pesoVivoKg: number | null; pesoCarcacaKg: number | null }[];
    };
    expect(chamada.valorTotalCentavos).toBe(500000);
    expect(chamada.animais).toEqual([
      { animalId: uuid(81), pesoVivoKg: 450, pesoCarcacaKg: null, valorManualCentavos: null },
    ]);
  });
});

describe('detalhe da negociação', () => {
  const rota = (n: NegociacaoDetalhe) =>
    montar(
      <Routes>
        <Route path="/financeiro/animais/:id" element={<PaginaNegociacao />} />
      </Routes>,
      {
        'negociacao:obter': n,
        'negociacao:cancelar': { ...n, cancelada: true },
        'lote:listar': [],
      },
      `/financeiro/animais/${n.id}`,
    );

  it('mostra os três valores separados e o valor alocado a cada animal', async () => {
    rota(negociacao({ pagoCentavos: 100000, saldoEmAbertoCentavos: 700000 }));
    const valores = await screen.findByTestId('valores-negociacao');
    expect(within(valores).getByText('Valor da operação')).toBeTruthy();
    expect(within(valores).getByText('A receber')).toBeTruthy();
    expect(within(valores).getByText('Recebido')).toBeTruthy();
    expect(within(valores).getByText(/R\$\s*8\.000,00/)).toBeTruthy();
    expect(within(valores).getByText(/R\$\s*7\.000,00/)).toBeTruthy();
    const itens = screen.getByTestId('tabela-itens-negociacao');
    expect(within(itens).getByText(/R\$\s*4\.800,00/)).toBeTruthy();
    expect(within(itens).getByText(/R\$\s*3\.200,00/)).toBeTruthy();
  });

  it('cancelar venda exige motivo e deixa escolher o destino dos animais', async () => {
    const invocar = rota(negociacao());
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar venda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar negociação' }));
    expect(await screen.findByText('Informe o motivo do cancelamento.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Motivo do cancelamento/), {
      target: { value: 'Comprador desistiu' },
    });
    fireEvent.change(screen.getByLabelText('Para onde os animais voltam'), {
      target: { value: 'sem_lote' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar negociação' }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith('negociacao:cancelar', {
        id: uuid(50),
        motivo: 'Comprador desistiu',
        destino: { tipo: 'sem_lote' },
      }),
    );
  });

  it('devolução: o valor original é só sugestão; prévia antes de registrar; restante com condição', async () => {
    const n = negociacao();
    const previa = {
      tipo: 'venda',
      itens: [],
      valorTotalCentavos: 470000,
      originalCentavos: 480000,
      diferencaDoOriginalCentavos: 10000,
      emAbertoNaOriginalCentavos: 300000,
      liquidadoNaOriginalCentavos: 500000,
      compensadoCentavos: 300000,
      restanteCentavos: 170000,
      avisos: [
        'R$ 3.000,00 em aberto na venda original serão liquidados por compensação, sem caixa.',
      ],
    };
    const invocar = montar(
      <Routes>
        <Route path="/financeiro/animais/:id" element={<PaginaNegociacao />} />
      </Routes>,
      {
        'negociacao:obter': n,
        'lote:listar': [],
        'devolucao:prever': previa,
        'devolucao:registrar': { id: uuid(90) },
      },
      `/financeiro/animais/${n.id}`,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Registrar devolução do comprador' }),
    );
    fireEvent.click(screen.getByLabelText(/V-1 \(valor original/));
    const valor = screen.getByLabelText(/Valor acordado de V-1/) as HTMLInputElement;
    // Nada é confirmado sozinho: o campo começa vazio e a prévia sem valor é recusada.
    expect(valor.value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Calcular prévia' }));
    expect(
      await screen.findByText('Informe o valor acordado de cada animal escolhido.'),
    ).toBeTruthy();
    expect(invocar.mock.calls.some(([c]) => c === 'devolucao:prever')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Usar o valor original' }));
    expect(valor.value).toBe('4.800,00');
    fireEvent.change(valor, { target: { value: '4.700,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular prévia' }));
    const bloco = await screen.findByTestId('previa-devolucao');
    expect(within(bloco).getByText(/R\$\s*1\.700,00/)).toBeTruthy();
    expect(within(bloco).getByText(/liquidados por compensação/)).toBeTruthy();
    // Com compensação, o restante não pode ficar "ainda não informado".
    expect(within(bloco).queryByRole('option', { name: 'Ainda não informada' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar devolução' }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'devolucao:registrar',
        expect.objectContaining({
          negociacaoId: n.id,
          itens: [{ negociacaoItemId: uuid(51), valorCentavos: 470000 }],
          loteRetornoId: null,
          condicaoRestante: expect.objectContaining({ tipo: 'a_vista', pagamento: null }),
        }),
      ),
    );
  });

  it('lista as devoluções com compensado e restante separados, e o animal devolvido', async () => {
    rota(
      negociacao({
        compensadoCentavos: 300000,
        situacaoFinanceira: 'quitado',
        saldoEmAbertoCentavos: 0,
        itens: [
          {
            id: uuid(51),
            animalId: uuid(81),
            animalIdentificacao: 'V-1',
            valorAlocadoCentavos: 480000,
            pesoVivoKg: 450,
            pesoCarcacaKg: null,
            cancelado: false,
            devolucao: { id: uuid(90), data: '2026-10-12', valorCentavos: 470000 },
          },
        ],
        devolucoes: [
          {
            id: uuid(90),
            tipo: 'venda',
            negociacaoId: uuid(50),
            data: '2026-10-12',
            lancamentoId: uuid(91),
            valorTotalCentavos: 470000,
            compensadoCentavos: 300000,
            restanteCentavos: 170000,
            liquidadoEmCaixaCentavos: 0,
            restanteEmAbertoCentavos: 170000,
            situacaoFinanceira: 'a_vencer',
            diferencaDoOriginalCentavos: 10000,
            itens: [],
            compensacoes: [],
            observacoes: null,
            cancelada: false,
            motivoCancelamento: null,
            criadoEm: '2026-10-12T10:00:00.000Z',
          },
        ],
      }),
    );
    const secao = await screen.findByTestId('secao-devolucoes');
    expect(within(secao).getByText(/R\$\s*3\.000,00/)).toBeTruthy();
    expect(within(secao).getAllByText(/R\$\s*1\.700,00/).length).toBe(2);
    expect(within(secao).getByRole('button', { name: 'Cancelar devolução' })).toBeTruthy();
    // Quitada em parte por compensação: não é "Recebido"; e não se cancela a venda com devolução ativa.
    expect(screen.getByText('Liquidado com compensação')).toBeTruthy();
    expect(screen.queryByText('Recebido', { selector: 'span' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar venda' })).toBeNull();
    expect(
      within(screen.getByTestId('valores-negociacao')).getByText('Compensado em devoluções'),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('tabela-itens-negociacao')).getByText(/12\/10\/2026/),
    ).toBeTruthy();
  });

  it('negociação cancelada mostra o motivo e não oferece cancelar de novo', async () => {
    rota(negociacao({ cancelada: true, motivoCancelamento: 'Compra duplicada' }));
    expect(await screen.findByText(/Compra duplicada/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar venda' })).toBeNull();
  });
});

describe('custo do animal (aba)', () => {
  const animal = { id: uuid(90), propriedadeId: PROP, identificacao: 'N-1' } as AnimalDetalhe;
  const custo = (extra: Partial<CustoDoAnimal> = {}): CustoDoAnimal => ({
    animalId: uuid(90),
    identificacao: 'N-1',
    origem: 'nascido',
    aquisicao: { situacao: 'nao_aplicavel', valorCentavos: null, negociacao: null },
    formacao: { situacao: 'nao_apurada', valorCentavos: null },
    custosAnteriores: [],
    acessorios: [],
    apuracao: {
      estado: 'nao_apurada',
      valorConhecidoCentavos: 0,
      componentesConhecidos: 0,
      componentesNaoApurados: 1,
    },
    venda: null,
    observacao: 'Consumo de estoque, sanidade e rateios são somados nas próximas entregas.',
    ...extra,
  });

  it('nascido sem custo anterior: nada de zero, tudo "não apurado"', async () => {
    montar(<CustoDoAnimalAba animal={animal} />, { 'custoAnimal:obter': custo() });
    const aba = await screen.findByTestId('custo-do-animal');
    expect(within(aba).getAllByText('Sem valor')).toHaveLength(2);
    expect(within(aba).getByText('Não apurado')).toBeTruthy();
    expect(within(aba).getByText(/Não aplicável \(nascido na propriedade\)/)).toBeTruthy();
    expect(within(aba).queryByText(/R\$\s*0,00/)).toBeNull();
    expect(within(aba).getByRole('button', { name: 'Informar custo anterior' })).toBeTruthy();
  });

  it('comprado com compra registrada: mostra a aquisição, o link e não oferece custo anterior', async () => {
    montar(<CustoDoAnimalAba animal={animal} />, {
      'custoAnimal:obter': custo({
        origem: 'comprado',
        aquisicao: {
          situacao: 'registrada',
          valorCentavos: 300000,
          negociacao: { id: uuid(50), data: '2026-10-01', fornecedor: 'Fazenda Boa' },
        },
        formacao: { situacao: 'nao_aplicavel', valorCentavos: null },
        apuracao: {
          estado: 'completa',
          valorConhecidoCentavos: 300000,
          componentesConhecidos: 1,
          componentesNaoApurados: 0,
        },
      }),
    });
    const aba = await screen.findByTestId('custo-do-animal');
    expect(within(aba).getAllByText(/R\$\s*3\.000,00/).length).toBeGreaterThan(0);
    expect(within(aba).getByText(/de Fazenda Boa/)).toBeTruthy();
    expect(within(aba).queryByRole('button', { name: 'Informar custo anterior' })).toBeNull();
  });
});
