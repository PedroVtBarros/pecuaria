import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  CategoriaFinanceira,
  LancamentoDetalhe,
  LancamentoResumo,
} from '@pecuaria/shared-types';
import { ProvedorNotificacoes } from '../../components/notificacoes';
import { centavosDoTexto } from './campo-dinheiro';
import { condicaoInicial, converterCondicao } from './editor-condicao';
import { ModalLancamento } from './modal-lancamento';
import { ModalDefinirPagamento, ModalPagamento } from './modais-lancamento';
import { PaginaLancamento } from './pagina-lancamento';
import { moeda, sugerirAtividade } from '../../textos-financeiro';

const id = (n: number) => `01a13f6e-0000-7000-8000-${String(n).padStart(12, '0')}`;
const categoriaDespesa: CategoriaFinanceira = {
  id: id(10),
  nome: 'Mão de obra',
  natureza: 'despesa',
  grupo: 'mao_de_obra',
  tratamento: 'resultado',
  comportamentoCusto: 'fixo',
  origemExigida: null,
  origem: 'sugestao',
  ativa: true,
};
const base: LancamentoResumo = {
  id: id(1),
  propriedadeId: id(2),
  categoria: { id: id(10), nome: 'Mão de obra', tratamento: 'resultado', grupo: 'mao_de_obra' },
  pessoa: null,
  natureza: 'despesa',
  tipo: 'normal',
  lancamentoOrigemId: null,
  dataCompetencia: '2026-10-01',
  descricao: 'Salário de outubro',
  documentoNumero: null,
  atividade: 'nao_definida',
  destino: {
    tipo: 'propriedade',
    loteId: null,
    loteNome: null,
    animalId: null,
    animalIdentificacao: null,
  },
  quantidade: null,
  unidadeQuantidade: null,
  condicaoPagamento: 'parcelado',
  comportamentoCusto: 'fixo',
  origemTipo: 'manual',
  origemId: null,
  observacoes: null,
  situacao: 'parcialmente_pago',
  valorOperacaoCentavos: 100000,
  saldoEmAbertoCentavos: 70000,
  pagoCentavos: 30000,
  compensadoCentavos: 0,
  proximoVencimento: '2026-11-10',
  cancelado: false,
  motivoCancelamento: null,
  criadoEm: '2026-10-01T10:00:00.000Z',
};
const detalhe: LancamentoDetalhe = {
  ...base,
  parcelas: [
    {
      id: id(20),
      numero: 1,
      vencimento: '2026-11-10',
      valorCentavos: 50000,
      pagoCentavos: 30000,
      compensadoCentavos: 0,
      saldoCentavos: 20000,
      situacao: 'parcial',
      cancelada: false,
      motivoCancelamento: null,
    },
    {
      id: id(21),
      numero: 2,
      vencimento: '2026-12-10',
      valorCentavos: 50000,
      pagoCentavos: 0,
      compensadoCentavos: 0,
      saldoCentavos: 50000,
      situacao: 'aberta',
      cancelada: false,
      motivoCancelamento: null,
    },
  ],
  pagamentos: [
    {
      id: id(30),
      parcelaId: id(20),
      parcelaNumero: 1,
      data: '2026-10-10',
      valorCentavos: 30000,
      forma: 'PIX',
      observacao: null,
      estornado: false,
      motivoEstorno: null,
      registradoEm: '2026-10-10T10:00:00.000Z',
    },
  ],
  historico: [],
};
const pendente: LancamentoDetalhe = {
  ...detalhe,
  condicaoPagamento: 'nao_informada',
  situacao: 'pendente_definicao',
  saldoEmAbertoCentavos: null,
  pagoCentavos: 0,
  proximoVencimento: null,
  parcelas: [],
  pagamentos: [],
};

function montar(elemento: React.ReactNode, respostas: Record<string, unknown> = {}, rota = '/') {
  const invocar = vi.fn(async (canal: string) => ({
    ok: true,
    dados: respostas[canal] ?? (canal === 'configuracao:obter' ? { valor: null } : []),
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

function pagina(l: LancamentoDetalhe) {
  return montar(
    <Routes>
      <Route path="/financeiro/lancamentos/:id" element={<PaginaLancamento />} />
    </Routes>,
    { 'lancamento:obter': l },
    `/financeiro/lancamentos/${l.id}`,
  );
}

describe('dinheiro digitado', () => {
  it.each([
    ['', null, null],
    ['1.234,56', 123456, null],
    ['R$ 0,10', 10, null],
    ['10', 1000, null],
  ])('"%s" vira %s centavos', (texto, centavos, erro) => {
    expect(centavosDoTexto(texto)).toEqual({ centavos, erro });
  });
  it.each(['1.234', '1,234', '-5', 'abc', '1,2,3'])(
    '"%s" é recusado, nunca adivinhado',
    (texto) => {
      const r = centavosDoTexto(texto);
      expect(r.centavos).toBeNull();
      expect(r.erro).toMatch(/inválido ou ambíguo/);
    },
  );
});

describe('condição de pagamento digitada', () => {
  it('à vista não marcado como pago não cria pagamento; marcado cria, com a data informada', () => {
    const e = condicaoInicial('2026-10-16');
    expect(converterCondicao({ ...e, vencimento: '2026-10-20' }, 1000)).toEqual({
      condicao: { tipo: 'a_vista', vencimento: '2026-10-20', pagamento: null },
      erros: [],
    });
    expect(
      converterCondicao({ ...e, jaPago: true, dataPagamento: '2026-10-15', forma: ' PIX ' }, 1000)
        .condicao,
    ).toEqual({
      tipo: 'a_vista',
      vencimento: '2026-10-16',
      pagamento: { data: '2026-10-15', forma: 'PIX' },
    });
    expect(converterCondicao({ ...e, jaPago: true, dataPagamento: '' }, 1000).erros[0]).toMatch(
      /data do pagamento/,
    );
  });
  it('parcelado exige soma exata e valores válidos', () => {
    const e = {
      ...condicaoInicial('2026-10-16'),
      tipo: 'parcelado' as const,
      parcelas: [
        { vencimento: '2026-11-10', valor: '6,00' },
        { vencimento: '2026-12-10', valor: '4,00' },
      ],
    };
    expect(converterCondicao(e, 1000).condicao).toEqual({
      tipo: 'parcelado',
      parcelas: [
        { vencimento: '2026-11-10', valorCentavos: 600 },
        { vencimento: '2026-12-10', valorCentavos: 400 },
      ],
    });
    expect(converterCondicao(e, 1001).erros[0]).toMatch(/exatamente igual/);
    expect(
      converterCondicao(
        { ...e, parcelas: [{ vencimento: '2026-11-10', valor: 'x' }] },
        1000,
      ).erros.join(),
    ).toMatch(/inválido/);
    expect(converterCondicao({ ...e, parcelas: [] }, 1000).erros[0]).toMatch(/ao menos duas/);
  });
  it('não informada só é aceita onde permitido', () => {
    const e = { ...condicaoInicial('2026-10-16'), tipo: 'nao_informada' as const };
    expect(converterCondicao(e, 1000).condicao).toEqual({ tipo: 'nao_informada' });
    expect(converterCondicao(e, 1000, false).condicao).toBeNull();
  });
  it('ausente é mostrado como "A definir", nunca como zero', () => {
    expect(moeda(null)).toBe('A definir');
    expect(moeda(0)).toBe('R$ 0,00');
    expect(sugerirAtividade('engorda')).toBe('corte');
    expect(sugerirAtividade('lactacao')).toBe('leite');
    expect(sugerirAtividade('outro')).toBeNull();
  });
});

describe('página do lançamento', () => {
  it('mostra valor da operação, a pagar e pago separados, e o pagamento com a sua data', async () => {
    pagina(detalhe);
    expect(await screen.findByTestId('valor-operacao')).toHaveProperty(
      'textContent',
      'R$ 1.000,00',
    );
    expect(screen.getByTestId('saldo-aberto').textContent).toBe('R$ 700,00');
    expect(screen.getByTestId('valor-efetivo').textContent).toBe('R$ 300,00');
    expect(screen.getByTestId('situacao-lancamento').textContent).toBe('Parcialmente pago');
    const pagamentos = screen.getByTestId('tabela-pagamentos');
    expect(within(pagamentos).getByText('10/10/2026')).toBeTruthy();
    expect(within(pagamentos).getByText('PIX')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Registrar pagamento' })).toHaveLength(2);
  });

  it('receita usa recebido e a receber', async () => {
    pagina({
      ...detalhe,
      natureza: 'receita',
      comportamentoCusto: 'nao_se_aplica',
      situacao: 'parcialmente_pago',
    });
    expect((await screen.findAllByText('A receber')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Recebido').length).toBeGreaterThan(0);
    expect(screen.queryByText('A pagar')).toBeNull();
    expect(screen.getByTestId('situacao-lancamento').textContent).toBe('Parcialmente recebido');
  });

  it('condição não informada: saldo "A definir" (não zero), sem parcelas e sem pagamento inventado', async () => {
    pagina(pendente);
    expect(await screen.findByText('Pendente de definição financeira')).toBeTruthy();
    expect(screen.getByTestId('saldo-aberto').textContent).toBe('A definir');
    expect(screen.getByTestId('valor-efetivo').textContent).toBe('R$ 0,00');
    expect(screen.queryByTestId('tabela-parcelas')).toBeNull();
    expect(screen.getByTestId('sem-pagamentos').textContent).toMatch(/Nada é considerado pago/);
    expect(screen.getByRole('button', { name: 'Definir condição de pagamento' })).toBeTruthy();
    expect(screen.getByText(/não significa que não haja obrigação/)).toBeTruthy();
  });

  it('pagamento estornado continua visível, marcado, com o motivo', async () => {
    pagina({
      ...detalhe,
      pagamentos: [{ ...detalhe.pagamentos[0]!, estornado: true, motivoEstorno: 'Duplicado' }],
      pagoCentavos: 0,
      saldoEmAbertoCentavos: 100000,
    });
    expect(await screen.findByText('Estornado: Duplicado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Estornar' })).toBeNull();
  });

  it('lançamento cancelado não oferece ações e mostra o motivo', async () => {
    pagina({
      ...detalhe,
      cancelado: true,
      situacao: 'cancelado',
      motivoCancelamento: 'Lançado por engano',
    });
    expect(await screen.findByText('Lançamento cancelado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Renegociar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar lançamento' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar pagamento' })).toBeNull();
  });
});

describe('modais', () => {
  it('pagamento: valor acima do saldo é recusado antes do IPC; valor válido segue em centavos inteiros', async () => {
    const invocar = montar(
      <ModalPagamento lancamento={detalhe} parcela={detalhe.parcelas[0]!} aoFechar={() => {}} />,
    );
    const valor = screen.getByLabelText(/^Valor/) as HTMLInputElement;
    expect(valor.value).toBe('200,00');
    fireEvent.change(valor, { target: { value: '200,01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pagamento' }));
    expect(await screen.findByText(/excede o saldo da parcela/)).toBeTruthy();
    expect(invocar.mock.calls.some(([c]) => c === 'pagamento:registrar')).toBe(false);
    fireEvent.change(valor, { target: { value: '150,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pagamento' }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'pagamento:registrar',
        expect.objectContaining({
          parcelaId: id(20),
          dados: expect.objectContaining({ valorCentavos: 15050 }),
        }),
      ),
    );
  });

  it('definir condição de um lançamento pendente não oferece "não informada" de novo', () => {
    montar(<ModalDefinirPagamento lancamento={pendente} aoFechar={() => {}} />);
    const select = screen.getByLabelText('Como será') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['a_vista', 'parcelado']);
  });

  it('novo lançamento: converte o valor em centavos e não marca nenhum pagamento por padrão', async () => {
    const invocar = montar(
      <ModalLancamento propriedadeId={id(2)} lancamento={null} aoFechar={() => {}} />,
      { 'categoriaFinanceira:listar': [categoriaDespesa], 'lancamento:criar': detalhe },
    );
    await screen.findByRole('option', { name: 'Mão de obra' });
    fireEvent.change(screen.getByLabelText(/^Categoria/), {
      target: { value: categoriaDespesa.id },
    });
    fireEvent.change(screen.getByLabelText(/^Descrição/), { target: { value: 'Salário' } });
    fireEvent.change(screen.getByLabelText(/^Valor da operação/), {
      target: { value: '1.234,56' },
    });
    expect(screen.getByText(/Nada será registrado como pago sem a sua confirmação/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar lançamento' }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'lancamento:criar',
        expect.objectContaining({
          dados: expect.objectContaining({
            valorTotalCentavos: 123456,
            comportamentoCusto: null,
            condicao: expect.objectContaining({ tipo: 'a_vista', pagamento: null }),
          }),
        }),
      ),
    );
  });

  it('novo lançamento: valor ambíguo é recusado e nada é enviado', async () => {
    const invocar = montar(
      <ModalLancamento propriedadeId={id(2)} lancamento={null} aoFechar={() => {}} />,
      { 'categoriaFinanceira:listar': [categoriaDespesa] },
    );
    await screen.findByRole('option', { name: 'Mão de obra' });
    fireEvent.change(screen.getByLabelText(/^Categoria/), {
      target: { value: categoriaDespesa.id },
    });
    fireEvent.change(screen.getByLabelText(/^Descrição/), { target: { value: 'Salário' } });
    fireEvent.change(screen.getByLabelText(/^Valor da operação/), { target: { value: '1.050' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar lançamento' }));
    expect(await screen.findAllByText(/inválido ou ambíguo/)).not.toHaveLength(0);
    expect(invocar.mock.calls.some(([c]) => c === 'lancamento:criar')).toBe(false);
  });
});
