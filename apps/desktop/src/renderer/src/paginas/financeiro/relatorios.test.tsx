import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProvedorNotificacoes } from '../../components/notificacoes';
import { PaginaRelatorios } from './pagina-relatorios';

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
const relatorio = {
  titulo: 'Lançamentos do período',
  visao: 'Lançamentos',
  propriedade: 'Fazenda Teste',
  periodo: '01/10/2026 a 31/10/2026',
  geradoEm: '17/10/2026',
  avisos: ['O documento (CPF ou CNPJ) das contrapartes não foi incluído.'],
  nomeArquivo: 'lancamentos',
  secoes: [
    {
      titulo: 'Lançamentos',
      colunas: [
        { rotulo: 'Descrição', tipo: 'texto' },
        { rotulo: 'Em aberto', tipo: 'dinheiro' },
      ],
      linhas: [
        ['Ração', 12345],
        ['Energia', null],
      ],
    },
  ],
};

function montar(respostas: Record<string, unknown>) {
  const invocar = vi.fn(async (canal: string, _entrada?: unknown) => ({
    ok: true,
    dados:
      canal === 'configuracao:obter'
        ? { valor: null }
        : canal === 'propriedade:listar'
          ? [propriedade]
          : canal === 'animal:listar'
            ? { itens: [], total: 0 }
            : (respostas[canal] ?? []),
  }));
  Object.defineProperty(window, 'api', { value: { invocar }, configurable: true });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ProvedorNotificacoes>
          <PaginaRelatorios />
        </ProvedorNotificacoes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return invocar;
}
afterEach(cleanup);

describe('relatórios e exportação (tela)', () => {
  it('pré-visualiza o mesmo modelo do arquivo: valor ausente é "Sem dado", nunca R$ 0,00', async () => {
    montar({ 'relatorio:montar': relatorio });
    fireEvent.change(await screen.findByLabelText('Relatório'), {
      target: { value: 'lancamentos' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pré-visualizar' }));
    const previa = await screen.findByTestId('previa-relatorio');
    expect(within(previa).getByText('Lançamentos do período')).toBeTruthy();
    expect(within(previa).getByText('Sem dado')).toBeTruthy();
    expect(within(previa).getByText(/R\$\s*123,45/)).toBeTruthy();
    expect(within(previa).queryByText(/R\$\s*0,00/)).toBeNull();
    expect(within(previa).getByText(/não foi incluído/)).toBeTruthy();
  });

  it('exporta com o período e só pede o documento das contrapartes quando marcado', async () => {
    const invocar = montar({
      'relatorio:exportar': {
        cancelado: false,
        dados: { caminho: 'C:/Docs/lancamentos.csv', bytes: 10 },
      },
    });
    fireEvent.change(await screen.findByLabelText('Relatório'), {
      target: { value: 'lancamentos' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'relatorio:exportar',
        expect.objectContaining({
          tipo: 'lancamentos',
          formato: 'csv',
          filtros: expect.objectContaining({
            propriedadeId: PROP,
            dataInicial: expect.any(String),
            dataFinal: expect.any(String),
            incluirDocumentos: false,
          }),
        }),
      ),
    );
    expect(await screen.findByText('Relatório salvo em C:/Docs/lancamentos.csv.')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Incluir o CPF ou CNPJ/));
    fireEvent.click(screen.getByRole('button', { name: /Exportar PDF/ }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'relatorio:exportar',
        expect.objectContaining({
          formato: 'pdf',
          filtros: expect.objectContaining({ incluirDocumentos: true }),
        }),
      ),
    );
  });

  it('custos podem usar todo o histórico; lote exige a escolha; cancelamento avisa que nada foi salvo', async () => {
    const invocar = montar({ 'relatorio:exportar': { cancelado: true } });
    fireEvent.change(await screen.findByLabelText('Relatório'), { target: { value: 'custos' } });
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'relatorio:exportar',
        expect.objectContaining({
          tipo: 'custos',
          filtros: expect.objectContaining({ dataInicial: null, dataFinal: null }),
        }),
      ),
    );
    expect(await screen.findByText(/nenhum arquivo foi salvo/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Relatório'), { target: { value: 'lote' } });
    invocar.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Exportar PDF/ }));
    expect(await screen.findByText('Escolha o lote.')).toBeTruthy();
    expect(invocar.mock.calls.some(([c]) => c === 'relatorio:exportar')).toBe(false);
  });
});
