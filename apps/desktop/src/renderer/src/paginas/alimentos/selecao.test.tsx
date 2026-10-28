import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  executarSelecao,
  REGRA_SELECAO_5D_V2,
  type IdentidadeAlimento,
  type RegistroCandidato,
  type ValorCandidato,
} from '@pecuaria/domain';
import type { ExecucaoSelecao, PerfilDetalhe, RegraSelecaoApi } from '@pecuaria/shared-types';
import { ProvedorNotificacoes } from '../../components/notificacoes';
import { PaginaSelecao } from './pagina-selecao';
import { PaginaPerfil } from './pagina-perfis';

/* Fase 5D, telas de seleção e perfil. Dados FICTÍCIOS (CLAUDE.md, regra 1). */
const id = (n: number) => `01a13f6e-0000-7000-8000-${String(n).padStart(12, '0')}`;
const ALIMENTO: IdentidadeAlimento = {
  id: id(1),
  nome: 'Alimento de teste',
  especie: 'Especie ficticia',
  cultivar: 'Cultivar ficticia',
  partePlanta: null,
  formaConservacao: 'fresco',
  processamento: null,
};
const PB = {
  id: id(2),
  codigo: 'PB',
  nome: 'Proteína bruta',
  unidadeReferencia: 'pct' as const,
  direcaoConservadora: 'menor' as const,
};
const valor = (n: number, v: number): ValorCandidato => ({
  id: id(100 + n),
  nutrienteId: PB.id,
  valor: v,
  valorPublicado: String(v),
  unidade: 'pct',
  base: 'ms',
  tipoValor: 'media',
  nObservacoes: null,
  metodoAnaliticoFonte: null,
  formaObtencao: 'medido',
  interpretacaoBase: null,
  baseValidada: false,
  cautela: null,
});
const reg = (n: number, v: number, extra: Partial<RegistroCandidato> = {}): RegistroCandidato => ({
  id: id(10 + n),
  cadeiaId: id(10 + n),
  alimento: ALIMENTO,
  fonteId: id(30 + n),
  fonteDescricao: `FONTE_${n}`,
  fonteOrigem: 'estudo_individual',
  experimentoOrigem: null,
  referenciaLocal: 'Tabela fictícia',
  idadeCorteDias: 60,
  classeIdadeFonte: null,
  status: 'conferido',
  vigente: true,
  cautela: null,
  valores: [valor(n, v)],
  naoQuantificados: [],
  ...extra,
});
const regra = (aprovada: boolean): RegraSelecaoApi => ({
  regra: REGRA_SELECAO_5D_V2,
  hash: 'a'.repeat(64),
  aprovacao: aprovada
    ? { aprovadoPor: 'Pessoa fictícia', aprovadoEm: '2026-10-22T10:00:00.000Z', observacao: null }
    : null,
});
const execucao = (aprovada: boolean, registros: RegistroCandidato[]): ExecucaoSelecao => ({
  alimento: ALIMENTO,
  regra: regra(aprovada),
  resultado: executarSelecao(
    { alimento: ALIMENTO, idadeCorteDias: 60 },
    registros,
    [],
    [PB],
    REGRA_SELECAO_5D_V2,
  ),
});

function montar(elemento: React.ReactNode, respostas: Record<string, unknown>, rota = '/') {
  const invocar = vi.fn(async (canal: string) => ({
    ok: true,
    dados: respostas[canal] ?? (canal === 'configuracao:obter' ? { valor: null } : []),
  }));
  Object.defineProperty(window, 'api', { value: { invocar }, configurable: true });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[rota]}>
        <ProvedorNotificacoes>
          <Routes>
            <Route path="/perfis/:id" element={elemento} />
            <Route path="*" element={elemento} />
          </Routes>
        </ProvedorNotificacoes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return invocar;
}
async function selecionar() {
  const alimento = await screen.findByLabelText('Alimento');
  await screen.findByRole('option', { name: 'Alimento de teste' });
  fireEvent.change(alimento, { target: { value: ALIMENTO.id } });
  fireEvent.change(screen.getByLabelText('Idade de corte (dias)'), { target: { value: '60' } });
  fireEvent.click(screen.getByText('Selecionar'));
}

const mostrarOriginal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
});
afterAll(() => {
  if (mostrarOriginal)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', mostrarOriginal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
});
afterEach(cleanup);

describe('5D: telas de seleção e perfil', () => {
  it('regra não aprovada: consulta sem gravar; exclusão e evidência limitada visíveis', async () => {
    const invocar = montar(<PaginaSelecao />, {
      'alimento:listar': [
        {
          ...ALIMENTO,
          classe: 'volumoso',
          comercial: false,
          observacoes: null,
          excluidoEm: null,
          nRegistros: 2,
          nConferidos: 1,
        },
      ],
      'selecao:regras': [regra(false)],
      'selecao:executar': execucao(false, [reg(1, 10), reg(2, 12, { status: 'transcrito' })]),
    });
    expect(await screen.findByText('Não aprovada')).toBeTruthy();
    await selecionar();
    const candidatos = await screen.findByTestId('tabela-candidatos');
    expect(candidatos.textContent).toContain('Não conferido');
    expect(screen.getByTestId('contagem-origens').textContent).toBe(
      'Encontradas: 2. Elegíveis para agregação: 1 (mínimo 3).',
    );
    expect(screen.getByTestId('origens').textContent).toContain('Só encontrada');
    expect(screen.queryByText('Usar como referência')).toBeNull();
    expect(screen.getByTestId('tabela-agregacao').textContent).toContain(
      'Evidência limitada: origens insuficientes',
    );
    expect(screen.getByText(/Cenários indisponíveis/)).toBeTruthy();
    expect(invocar.mock.calls.map((c) => c[0])).not.toContain('perfil:gravar');
  });

  it('regra aprovada e 3 origens: média, mediana, extremos, cenários e gravação só pelo botão', async () => {
    const invocar = montar(<PaginaSelecao />, {
      'alimento:listar': [
        {
          ...ALIMENTO,
          classe: 'volumoso',
          comercial: false,
          observacoes: null,
          excluidoEm: null,
          nRegistros: 3,
          nConferidos: 3,
        },
      ],
      'selecao:regras': [regra(true)],
      'selecao:executar': execucao(true, [reg(1, 10), reg(2, 12), reg(3, 20)]),
    });
    await selecionar();
    const tabela = await screen.findByTestId('tabela-agregacao');
    expect(tabela.textContent).toContain('Agregado');
    expect(tabela.textContent).toContain('14');
    expect(tabela.textContent).toContain('10 · 20');
    expect(screen.getByTestId('cenarios').textContent).toContain('Conservador para PB');
    expect(screen.getByTestId('cenarios').textContent).toContain('não para a qualidade global');
    expect(screen.getAllByText('Usar como referência')).toHaveLength(3);
    fireEvent.click(screen.getByText('Gravar perfil central'));
    expect(await screen.findByText(/Não é perfil observado/)).toBeTruthy();
    expect(invocar.mock.calls.map((c) => c[0])).not.toContain('perfil:gravar');
  });

  it('perfil gravado mostra limitações, origens e base inferida', async () => {
    const perfil: PerfilDetalhe = {
      perfil: {
        id: id(50),
        alimentoId: ALIMENTO.id,
        alimentoNome: ALIMENTO.nome,
        nome: 'Perfil fictício',
        tipo: 'referencia_individual',
        cenario: 'unico',
        nivel: 'comparavel',
        idadeCorteBuscaDias: 60,
        nutrienteReferencia: null,
        regraCodigo: 'SELECAO_5D',
        regraVersao: 1,
        nValores: 1,
        criadoPor: 'Pessoa fictícia',
        criadoEm: '2026-10-22T10:00:00.000Z',
      },
      registroBaseId: id(11),
      diferencas: ['Diferença fictícia.'],
      limitacoes: [
        'Referência individual: evidência limitada (uma origem), sem média nem cenários.',
      ],
      naoQuantificados: [],
      selecao: {},
      valores: [
        {
          id: id(60),
          nutriente: { id: PB.id, codigo: 'PB', nome: 'Proteína bruta' },
          valor: 10,
          valorPublicado: '10,0',
          unidade: 'pct',
          base: 'ms',
          tipoValor: 'media',
          formaObtencao: 'medido',
          metodoAnaliticoFonte: null,
          interpretacaoBase: 'Motivo fictício.',
          nOrigens: 1,
          mediana: null,
          minimo: null,
          maximo: null,
          cobertura: null,
          origens: [{ valorNutricionalId: id(101), registroId: id(11), valorUsado: 10 }],
        },
      ],
    };
    montar(<PaginaPerfil />, { 'perfil:obter': perfil }, `/perfis/${id(50)}`);
    expect((await screen.findByTestId('limitacoes-perfil')).textContent).toContain(
      'Diferença fictícia.',
    );
    const valores = screen.getByTestId('tabela-perfil-valores');
    expect(valores.textContent).toContain('10,0 % (MS)');
    expect(valores.textContent).toContain('Base inferida, não declarada pela fonte');
    expect(screen.getByText('Registro de origem (10)')).toBeTruthy();
  });
});
