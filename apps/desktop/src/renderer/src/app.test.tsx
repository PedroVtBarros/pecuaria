import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InfoBackup, InfoSistema } from '@pecuaria/shared-types';
import { App } from './app';
import { ProvedorNotificacoes } from './components/notificacoes';
import { MODULOS } from './modulos';

const info: InfoSistema = {
  versaoApp: '0.1.0',
  versaoElectron: '44.0.0',
  versaoChrome: '1',
  versaoNode: '24',
  versaoSqlite: '3.53.4',
  versaoSchema: 1,
  versaoSchemaSuportada: 1,
  migracoesAplicadas: [
    { versao: 1, nome: 'infraestrutura', aplicadaEm: '2026-10-15T12:00:00.000Z' },
  ],
  caminhos: {
    dados: 'C:\\d',
    banco: 'C:\\d\\dados\\pecuaria.db',
    backups: 'C:\\d\\backups',
    logs: 'C:\\d\\logs',
  },
  empacotado: false,
};

const backup: InfoBackup = {
  id: 'pecuaria_20261015-120000-000_manual.db',
  tipo: 'manual',
  criadoEm: '2026-10-15T15:00:00.000Z',
  tamanhoBytes: 4096,
  hashSha256: 'a'.repeat(64),
  versaoSchema: 1,
  versaoApp: '0.1.0',
  observacao: null,
};

const invocar = vi.fn(async (canal: string, entrada: unknown) => {
  switch (canal) {
    case 'sistema:obterInfo':
      return { ok: true, dados: info };
    case 'backup:listar':
      return { ok: true, dados: [backup] };
    case 'configuracao:obter':
      return { ok: true, dados: { valor: null } };
    case 'configuracao:definir':
    case 'log:registrar':
      return { ok: true, dados: null };
    case 'propriedade:listar':
      return { ok: true, dados: [] };
    default:
      return {
        ok: false,
        erro: {
          codigo: 'ERRO_INTERNO',
          mensagem: `não simulado: ${canal} ${JSON.stringify(entrada)}`,
        },
      };
  }
});

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

describe('App', () => {
  beforeEach(() => {
    invocar.mockClear();
    Object.defineProperty(window, 'api', { value: { invocar }, configurable: true });
  });

  afterEach(() => cleanup());

  it('mostra todos os módulos na navegação', () => {
    renderizar('/');
    const nav = screen.getByRole('navigation', { name: 'Módulos' });
    for (const m of MODULOS) {
      expect(within(nav).getByText(m.titulo)).toBeTruthy();
    }
  });

  it('painel exibe a versão do schema vinda do processo principal', async () => {
    renderizar('/');
    expect(await screen.findByText('Schema versão 1')).toBeTruthy();
  });

  it('módulos de fases futuras mostram a fase planejada e nenhuma funcionalidade', () => {
    renderizar('/simulador');
    expect(screen.getByText('Planejado para a Fase 9')).toBeTruthy();
    expect(
      screen.getByText('Nenhuma funcionalidade de negócio está ativa nesta fase.'),
    ).toBeTruthy();
  });

  it('configurações lista backups e o seletor de tema grava no banco', async () => {
    renderizar('/configuracoes');
    expect(await screen.findByText('Manual')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('radio', { name: 'Escuro' })[0]!);
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith('configuracao:definir', {
        chave: 'interface.tema',
        valor: 'escuro',
      }),
    );
  });

  it('rota desconhecida mostra página não encontrada', () => {
    renderizar('/nao-existe');
    expect(screen.getByText('Página não encontrada.')).toBeTruthy();
  });
});
