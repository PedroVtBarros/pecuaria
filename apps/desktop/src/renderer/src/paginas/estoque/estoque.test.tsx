import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MovimentoEstoque, ResumoItemEstoque } from '@pecuaria/shared-types';
import { ModalMovimentoEstoque } from './modais-estoque';
import { ConsumoSanitario, converterConsumos } from './consumo-sanitario';
import { ModalMotivo } from '../manejo/modais-sanidade';
import { ProvedorNotificacoes } from '../../components/notificacoes';
import { ajudaEstoqueMinimo, explicacaoEstoqueMinimo, valorEstoque } from '../../textos-estoque';
const id = (n: number) => `01a13f6e-0000-7000-8000-${String(n).padStart(12, '0')}`;
const item: ResumoItemEstoque = {
  id: id(1),
  propriedadeId: id(2),
  nome: 'Silagem',
  tipo: 'silagem',
  unidadeBase: 'kg',
  baseMateria: 'mn',
  controleLote: false,
  estoqueMinimo: null,
  produtoSanitarioId: null,
  ativo: true,
  observacoes: null,
  saldo: 0,
  valorSaldoCentavos: null,
  valoracaoCompleta: false,
  abaixoMinimo: false,
};
function montar(elemento: React.ReactNode, respostas: Record<string, unknown> = {}) {
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
describe('estoque: interface e entradas explícitas', () => {
  it('mostra desconhecido e zero como condições diferentes', () => {
    expect(valorEstoque(null)).toBe('Valoração incompleta');
    expect(valorEstoque(0)).toMatch(/0,00/);
  });
  it('explica o estoque mínimo em branco, zero e maior que zero', () => {
    const ajuda = ajudaEstoqueMinimo('kg');
    expect(ajuda).toContain('Em branco: sem alerta');
    expect(ajuda).toContain('Zero: avisa só quando o saldo chegar a zero');
    expect(explicacaoEstoqueMinimo(0, 'kg')).toContain('saldo zerado');
    expect(explicacaoEstoqueMinimo(2.5, 'kg')).toContain('2,5 kg');
  });
  it.each([
    ['', null],
    ['0', 0],
  ] as const)('produção própria preserva custo "%s"', async (texto, custo) => {
    const invocar = montar(
      <ModalMovimentoEstoque item={item} lotes={[]} movimento={null} aoFechar={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText('Tipo de movimentação'), {
      target: { value: 'entrada_producao' },
    });
    fireEvent.change(screen.getByLabelText('Quantidade (kg)'), { target: { value: '2,125' } });
    fireEvent.change(screen.getByLabelText('Custo total da entrada (R$)'), {
      target: { value: texto },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimento' }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'estoque:registrar',
        expect.objectContaining({
          dados: expect.objectContaining({
            quantidade: 2.125,
            custoEntradaCentavos: custo,
            tipo: 'entrada_producao',
          }),
        }),
      ),
    );
  });
  it('recusa quantidade ambígua antes do IPC', async () => {
    const invocar = montar(
      <ModalMovimentoEstoque item={item} lotes={[]} movimento={null} aoFechar={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText('Quantidade (kg)'), { target: { value: '1.050' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimento' }));
    expect(await screen.findByText(/Quantidade: número inválido ou ambíguo/)).toBeTruthy();
    expect(invocar.mock.calls.some(([c]) => c === 'estoque:registrar')).toBe(false);
  });
  it('prévia não registra movimento e mostra valoração incompleta', async () => {
    const invocar = montar(
      <ModalMovimentoEstoque item={item} lotes={[]} movimento={null} aoFechar={() => {}} />,
      {
        'estoque:prever': {
          saldo: 10,
          valorSaldoCentavos: null,
          valoracaoCompleta: false,
          custoMovimentoCentavos: null,
          movimentosRecalculados: 0,
        },
      },
    );
    fireEvent.change(screen.getByLabelText('Quantidade (kg)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir saldo e valoração' }));
    expect((await screen.findByTestId('previa-estoque')).textContent).toContain(
      'Valoração incompleta',
    );
    expect(invocar.mock.calls.some(([c]) => c === 'estoque:registrar')).toBe(false);
  });
  it('correção de quantidade com três casas usa vírgula e exige motivo', async () => {
    const movimento: MovimentoEstoque = {
      id: id(3),
      itemId: item.id,
      data: '2026-10-01',
      ordem: 1,
      tipo: 'entrada_producao',
      quantidade: 1.125,
      unidadeBase: 'kg',
      loteEstoqueId: null,
      custoEntradaCentavos: null,
      custoApropriadoCentavos: null,
      destino: null,
      loteAnimalId: null,
      animalId: null,
      manejoSanitarioId: null,
      requisicaoId: id(4),
      documentoOrigemId: null,
      substituiId: null,
      motivo: null,
      observacao: null,
      canceladoEm: null,
    };
    const invocar = montar(
      <ModalMovimentoEstoque item={item} lotes={[]} movimento={movimento} aoFechar={() => {}} />,
    );
    expect((screen.getByLabelText('Quantidade (kg)') as HTMLInputElement).value).toBe('1,125');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' }));
    expect(await screen.findByText('Informe o motivo da correção.')).toBeTruthy();
    expect(invocar.mock.calls.some(([c]) => c === 'estoque:corrigir')).toBe(false);
  });
  it('baixa sanitária não é inferida e pede unidade física explícita', async () => {
    const mudar = vi.fn();
    const sanit = { ...item, produtoSanitarioId: id(5), unidadeBase: 'ml' as const };
    montar(
      <ConsumoSanitario
        propriedadeId={item.propriedadeId}
        produtoId={id(5)}
        linhas={[]}
        aoMudar={mudar}
      />,
      { 'estoque:listar': [sanit] },
    );
    expect(screen.queryByLabelText('Item para baixa')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Informar baixa de estoque' }));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Adicionar baixa explícita' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar baixa explícita' }));
    expect(mudar.mock.calls[0]![0][0].quantidade).toBe('');
    expect(() => converterConsumos(mudar.mock.calls[0]![0])).toThrow(/Confira/);
  });
  it('estorno exige confirmação além do motivo', async () => {
    const confirmar = vi.fn();
    montar(
      <ModalMotivo
        titulo="Excluir registro"
        descricao="Conferência"
        textoEnviar="Excluir"
        confirmacao="Conferi o estorno integral"
        enviando={false}
        aoFechar={() => {}}
        aoConfirmar={confirmar}
      />,
    );
    const dialogo = within(screen.getByRole('dialog'));
    fireEvent.change(dialogo.getByRole('textbox', { name: 'Motivo' }), {
      target: { value: 'Registro duplicado' },
    });
    fireEvent.click(dialogo.getByRole('button', { name: 'Excluir' }));
    expect(confirmar).not.toHaveBeenCalled();
    fireEvent.click(dialogo.getByLabelText('Conferi o estorno integral'));
    fireEvent.click(dialogo.getByRole('button', { name: 'Excluir' }));
    expect(confirmar).toHaveBeenCalledOnce();
  });
});
