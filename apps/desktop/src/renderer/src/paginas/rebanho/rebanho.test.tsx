import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AnimalResumo, PaginaAnimais, Propriedade } from '@pecuaria/shared-types';
import { App } from '../../app';
import { ProvedorNotificacoes } from '../../components/notificacoes';

const PROPRIEDADE: Propriedade = {
  id: '01a13f6e-0000-7000-8000-000000000001',
  nome: 'Fazenda Teste',
  municipio: null,
  uf: null,
  areaTotalHa: null,
  tipoExploracao: 'corte',
  observacoes: null,
  animaisAtivos: 1,
  lotesAtivos: 0,
  criadoEm: '2026-10-15T12:00:00.000Z',
  atualizadoEm: '2026-10-15T12:00:00.000Z',
};

const ANIMAL: AnimalResumo = {
  id: '01a13f6e-0000-7000-8000-000000000002',
  identificacao: 'BR-777',
  nome: 'Mimosa',
  sexo: 'F',
  categoria: 'vaca',
  raca: { id: '01a13f6e-fa00-7c30-bd5e-5033735815f6', nome: 'Nelore' },
  lote: null,
  dataNascimento: '2022-01-10',
  status: 'ativo',
  ultimaPesagem: { data: '2026-09-01', pesoVivoKg: 452.5, metodo: 'balanca' },
};

let chamadas: { canal: string; entrada: unknown }[] = [];

function simularApi(respostas: Record<string, unknown>) {
  const invocar = vi.fn(async (canal: string, entrada: unknown) => {
    chamadas.push({ canal, entrada });
    if (canal in respostas) return { ok: true, dados: respostas[canal] };
    if (canal === 'configuracao:obter') return { ok: true, dados: { valor: null } };
    return { ok: true, dados: null };
  });
  Object.defineProperty(window, 'api', { value: { invocar }, configurable: true });
  return invocar;
}

function renderizar(rota: string) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <ProvedorNotificacoes>
        <MemoryRouter initialEntries={[rota]}>
          <App />
        </MemoryRouter>
      </ProvedorNotificacoes>
    </QueryClientProvider>,
  );
}

describe('telas do rebanho', () => {
  beforeEach(() => {
    chamadas = [];
  });
  afterEach(() => cleanup());

  it('sem propriedade, convida a cadastrar a primeira', async () => {
    simularApi({ 'propriedade:listar': [] });
    renderizar('/rebanho/animais');
    expect(await screen.findByText('Cadastre sua primeira propriedade')).toBeTruthy();
  });

  it('lista os animais vindos do banco, com peso vivo em kg', async () => {
    const pagina: PaginaAnimais = { itens: [ANIMAL], total: 1, pagina: 1, tamanhoPagina: 50 };
    simularApi({ 'propriedade:listar': [PROPRIEDADE], 'animal:listar': pagina, 'lote:listar': [] });
    renderizar('/rebanho/animais');
    const linha = (await screen.findByText('BR-777')).closest('tr')!;
    expect(within(linha).getByText('Mimosa')).toBeTruthy();
    expect(within(linha).getByText(/452,5 kg/)).toBeTruthy();
    expect(screen.getByText('1 animal(is) encontrado(s)')).toBeTruthy();
    // A consulta foi feita para a propriedade em uso, com o filtro padrão de ativos.
    const consulta = chamadas.find((c) => c.canal === 'animal:listar');
    expect(consulta?.entrada).toMatchObject({
      propriedadeId: PROPRIEDADE.id,
      filtros: { status: 'ativo' },
    });
  });

  it('formulário de animal mostra erros e não envia dados inválidos', async () => {
    simularApi({ 'propriedade:listar': [PROPRIEDADE], 'raca:listar': [], 'lote:listar': [] });
    renderizar('/rebanho/animais/novo');
    const botao = await screen.findByRole('button', { name: 'Cadastrar animal' });
    fireEvent.click(botao);
    expect(await screen.findByText('Identificação é obrigatório.')).toBeTruthy();
    expect(screen.getByText('Selecione a categoria.')).toBeTruthy();
    expect(chamadas.some((c) => c.canal === 'animal:criar')).toBe(false);
  });

  it('formulário de animal envia os dados convertidos quando válidos', async () => {
    simularApi({
      'propriedade:listar': [PROPRIEDADE],
      'raca:listar': [],
      'lote:listar': [],
      'animal:criar': { id: ANIMAL.id, identificacao: 'BR-900' },
    });
    renderizar('/rebanho/animais/novo');
    fireEvent.change(await screen.findByLabelText(/Identificação/), {
      target: { value: ' BR-900 ' },
    });
    fireEvent.change(screen.getByLabelText(/Categoria/), { target: { value: 'novilha' } });
    fireEvent.change(screen.getByLabelText(/Peso vivo de entrada/), { target: { value: '310,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar animal' }));
    await waitFor(() => expect(chamadas.some((c) => c.canal === 'animal:criar')).toBe(true));
    const envio = chamadas.find((c) => c.canal === 'animal:criar')?.entrada as {
      dados: Record<string, unknown>;
      entrada: Record<string, unknown>;
    };
    expect(envio.dados).toMatchObject({
      identificacao: 'BR-900',
      sexo: 'F',
      condicaoSexual: 'femea',
      categoria: 'novilha',
    });
    expect(envio.entrada).toMatchObject({
      pesoVivoKg: 310.5,
      metodoPesagem: 'balanca',
      loteId: null,
    });
  });

  it('pesagem sem peso informa que o campo é obrigatório', async () => {
    simularApi({
      'propriedade:listar': [PROPRIEDADE],
      'animal:obter': {
        ...ANIMAL,
        propriedadeId: PROPRIEDADE.id,
        condicaoSexual: 'femea',
        aptidao: 'corte',
        dataNascimentoEstimada: false,
        mae: null,
        pai: null,
        origem: 'comprado',
        dataEntrada: '2026-01-01',
        dataSaida: null,
        motivoSaida: null,
        observacoes: null,
        criadoEm: '2026-01-01T00:00:00.000Z',
        atualizadoEm: '2026-01-01T00:00:00.000Z',
      },
    });
    renderizar(`/rebanho/animais/${ANIMAL.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Pesar' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { hidden: true })).getByRole('button', {
        name: 'Registrar',
        hidden: true,
      }),
    );
    expect(await screen.findByText('Peso vivo é obrigatório.')).toBeTruthy();
    expect(chamadas.some((c) => c.canal === 'pesagem:registrar')).toBe(false);
  });

  it('peso ambíguo como "1.050" é recusado no formulário', async () => {
    simularApi({ 'propriedade:listar': [PROPRIEDADE], 'raca:listar': [], 'lote:listar': [] });
    renderizar('/rebanho/animais/novo');
    fireEvent.change(await screen.findByLabelText(/Identificação/), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText(/Categoria/), { target: { value: 'vaca' } });
    fireEvent.change(screen.getByLabelText(/Peso vivo de entrada/), { target: { value: '1.050' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar animal' }));
    expect(await screen.findByText('Peso vivo deve ser um número.')).toBeTruthy();
    expect(chamadas.some((c) => c.canal === 'animal:criar')).toBe(false);
  });
});
