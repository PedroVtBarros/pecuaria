import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  AlertasPesagem,
  AnimalDetalhe,
  AnimalResumo,
  EvolucaoLote,
  Lote,
  Pesagem,
  PesagensDoAnimal,
  Propriedade,
  ResultadoPesagemLote,
  ResumoSanidade,
} from '@pecuaria/shared-types';
import { analisarEvolucaoGrupo, analisarGmd, detectarAlertasPesagem } from '@pecuaria/domain';
import { App } from '../../app';
import { ProvedorNotificacoes } from '../../components/notificacoes';
import { casasDasMarcas, GraficoLinhas, marcasBonitas } from '../../components/graficos/graficos';

const ID = (n: number) => `01a13f6e-0000-7000-8000-${String(n).padStart(12, '0')}`;

const PROPRIEDADE: Propriedade = {
  id: ID(1),
  nome: 'Fazenda Teste',
  municipio: null,
  uf: null,
  areaTotalHa: null,
  tipoExploracao: 'corte',
  observacoes: null,
  animaisAtivos: 3,
  lotesAtivos: 1,
  criadoEm: '2026-10-15T12:00:00.000Z',
  atualizadoEm: '2026-10-15T12:00:00.000Z',
};

const LOTE: Lote = {
  id: ID(2),
  propriedadeId: ID(1),
  nome: 'Recria',
  finalidade: 'recria',
  area: null,
  dataFormacao: '2026-01-01',
  ativo: true,
  dataEncerramento: null,
  observacoes: null,
  animaisAtivos: 3,
};

function resumo(n: number, identificacao: string, peso: number | null): AnimalResumo {
  return {
    id: ID(10 + n),
    identificacao,
    nome: null,
    sexo: 'M',
    categoria: 'garrote',
    raca: null,
    lote: { id: LOTE.id, nome: LOTE.nome },
    dataNascimento: null,
    status: 'ativo',
    ultimaPesagem: peso ? { data: '2026-09-15', pesoVivoKg: peso, metodo: 'balanca' } : null,
  };
}

const ANIMAIS = [resumo(1, 'A-1', 300), resumo(2, 'A-2', 280), resumo(3, 'A-3', null)];

function pesagem(
  n: number,
  data: string,
  pesoVivoKg: number,
  extra: Partial<Pesagem> = {},
): Pesagem {
  return {
    id: ID(100 + n),
    animalId: ANIMAIS[0]!.id,
    data,
    pesoVivoKg,
    metodo: 'balanca',
    observacao: null,
    escoreCorporal: null,
    escalaEcc: null,
    conferidaEm: null,
    justificativaConferencia: null,
    criadoEm: '2026-10-15T12:00:00.000Z',
    ...extra,
  };
}

let chamadas: { canal: string; entrada: unknown }[] = [];

function simularApi(respostas: Record<string, unknown | ((entrada: unknown) => unknown)>) {
  const invocar = vi.fn(async (canal: string, entrada: unknown) => {
    chamadas.push({ canal, entrada });
    if (canal in respostas) {
      const r = respostas[canal];
      return {
        ok: true,
        dados: typeof r === 'function' ? (r as (e: unknown) => unknown)(entrada) : r,
      };
    }
    if (canal === 'configuracao:obter') return { ok: true, dados: { valor: null } };
    if (canal === 'propriedade:listar') return { ok: true, dados: [PROPRIEDADE] };
    if (canal === 'lote:listar') return { ok: true, dados: [LOTE] };
    if (canal === 'produtoSanitario:listar') return { ok: true, dados: [] };
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

beforeEach(() => {
  chamadas = [];
});

afterEach(() => {
  cleanup();
});

describe('gráficos', () => {
  it('marcas do eixo são números redondos que cobrem o intervalo', () => {
    expect(marcasBonitas(283, 452)).toEqual([250, 300, 350, 400, 450, 500]);
    expect(marcasBonitas(-0.4, 1.2, 4)).toEqual([-0.5, 0, 0.5, 1, 1.5]);
    expect(marcasBonitas(300, 300).length).toBeGreaterThan(1);
  });

  it('o eixo usa casas suficientes para não arredondar as marcas', () => {
    expect(casasDasMarcas([0, 0.25, 0.5, 0.75, 1])).toBe(2);
    expect(casasDasMarcas([-0.5, 0, 0.5, 1])).toBe(1);
    expect(casasDasMarcas([250, 300, 350])).toBe(0);
  });

  it('desenha um marcador por pesagem, vazado quando estimado, e a dica pelo teclado', () => {
    render(
      <GraficoLinhas
        rotulo="Peso"
        series={[
          {
            id: 's',
            destaque: true,
            pontos: [
              { dia: 100, valor: 300 },
              { dia: 130, valor: 330, vazado: true },
            ],
          },
        ]}
        diasDica={[100, 130]}
        dica={(dia) => <span>dica {dia}</span>}
      />,
    );
    const grafico = screen.getByRole('img', { name: 'Peso' });
    const marcadores = grafico.querySelectorAll('circle');
    expect(marcadores).toHaveLength(2);
    expect(marcadores[1]!.getAttribute('class')).toContain('fill-superficie');
    fireEvent.keyDown(grafico, { key: 'ArrowRight' });
    expect(screen.getByText('dica 100')).toBeTruthy();
    fireEvent.keyDown(grafico, { key: 'ArrowRight' });
    expect(screen.getByText('dica 130')).toBeTruthy();
  });
});

describe('ficha do animal: pesagens com gráfico e alerta', () => {
  const detalhe: AnimalDetalhe = {
    ...ANIMAIS[0]!,
    propriedadeId: PROPRIEDADE.id,
    condicaoSexual: 'castrado',
    aptidao: 'corte',
    dataNascimentoEstimada: false,
    mae: null,
    pai: null,
    origem: 'comprado',
    dataEntrada: '2026-01-01',
    dataSaida: null,
    motivoSaida: null,
    observacoes: null,
    criadoEm: '2026-10-15T12:00:00.000Z',
    atualizadoEm: '2026-10-15T12:00:00.000Z',
  };
  const parametros = { gmdMaximoKgDia: 2, gmdMinimoKgDia: 0, intervaloCurtoDias: 7 };
  const lista = [pesagem(1, '2026-01-01', 300), pesagem(2, '2026-01-31', 450)];
  const dados: PesagensDoAnimal = {
    pesagens: lista,
    gmd: analisarGmd(lista),
    alertas: detectarAlertasPesagem(lista, parametros),
    parametrosAlertas: parametros,
  };

  it('mostra o gráfico, marca a pesagem atípica e oferece confirmar com justificativa', async () => {
    simularApi({ 'animal:obter': detalhe, 'pesagem:listar': dados, 'pesagem:conferir': lista[1] });
    renderizar(`/rebanho/animais/${detalhe.id}`);
    fireEvent.click(await screen.findByRole('tab', { name: 'Pesagens e GMD' }));
    expect(await screen.findByTestId('grafico-peso-animal')).toBeTruthy();
    expect(screen.getByText('1 alerta de pesagem em aberto')).toBeTruthy();
    // GMD alto é alerta de desempenho: o peso pode estar certo.
    expect(screen.getByText(/^Desempenho \(1\): .*o peso pode estar certo/i)).toBeTruthy();
    const linha = screen
      .getByTestId('tabela-pesagens')
      .querySelector('tr[data-pesagem="2026-01-31"]');
    expect(linha?.textContent).toContain('GMD acima da faixa');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pesagem de 31/01/2026' }));
    const modal = await screen.findByRole('dialog', { hidden: true });
    fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar valor', hidden: true }));
    expect(await within(modal).findByText('Justificativa é obrigatório.')).toBeTruthy();
    fireEvent.change(within(modal).getByLabelText(/Justificativa/), {
      target: { value: 'Pesado duas vezes' },
    });
    fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar valor', hidden: true }));
    await waitFor(() =>
      expect(chamadas.find((c) => c.canal === 'pesagem:conferir')?.entrada).toEqual({
        id: lista[1]!.id,
        justificativa: 'Pesado duas vezes',
      }),
    );
  });

  it('o modal de pesagem avisa antes de salvar e a correção exige motivo', async () => {
    const normais = [pesagem(1, '2026-01-01', 300), pesagem(2, '2026-01-31', 330)];
    simularApi({
      'animal:obter': detalhe,
      'pesagem:listar': {
        pesagens: normais,
        gmd: analisarGmd(normais),
        alertas: [],
        parametrosAlertas: parametros,
      } satisfies PesagensDoAnimal,
    });
    renderizar(`/rebanho/animais/${detalhe.id}`);
    fireEvent.click(await screen.findByRole('tab', { name: 'Pesagens e GMD' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Corrigir pesagem de 31/01/2026' }));
    const modal = await screen.findByRole('dialog', { hidden: true });
    fireEvent.change(within(modal).getByLabelText(/Peso vivo/), { target: { value: '3300' } });
    // 3300 kg em 31/01 depois de 300 em 01/01: fora do limite; 330 kg se encaixa
    expect(within(modal).getByTestId('alertas-previa').textContent).toMatch(/330 kg\?/);
    fireEvent.click(within(modal).getByRole('button', { name: 'Salvar correção', hidden: true }));
    expect(await within(modal).findByText('Motivo é obrigatório.')).toBeTruthy();
    expect(chamadas.some((c) => c.canal === 'pesagem:atualizar')).toBe(false);
  });
});

describe('pesagem em lote', () => {
  beforeEach(() => {
    // Controla só Date; os temporizadores de React Query continuam reais.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 15, 12, 0, 0) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('envia só os animais com peso digitado e mostra o erro de cada um', async () => {
    const resposta: ResultadoPesagemLote = {
      confirmado: false,
      comErro: 1,
      comAlerta: 0,
      gravadas: 0,
      itens: [
        {
          animalId: ANIMAIS[0]!.id,
          identificacao: 'A-1',
          data: '2026-10-15',
          pesoVivoKg: 320,
          erros: [],
          alertas: [],
          anterior: null,
        },
        {
          animalId: ANIMAIS[2]!.id,
          identificacao: 'A-3',
          data: '2026-10-15',
          pesoVivoKg: 250,
          erros: ['Já existe uma pesagem deste animal em 15/10/2026.'],
          alertas: [],
          anterior: null,
        },
      ],
    };
    simularApi({
      'animal:listar': { itens: ANIMAIS, total: 3, pagina: 1, tamanhoPagina: 5000 },
      'pesagem:registrarLote': resposta,
    });
    renderizar(`/manejo/pesagem?lote=${LOTE.id}`);
    const peso1 = await screen.findByLabelText('Peso de A-1');
    fireEvent.change(peso1, { target: { value: '320' } });
    fireEvent.change(screen.getByLabelText('Peso de A-3'), { target: { value: '250' } });
    expect(screen.getByTestId('contador-pesagem').textContent).toBe('2 de 3 com peso');
    // Prévia local do GMD contra a última pesagem (15/09): +20 kg em 30 dias
    expect(peso1.closest('tr')?.textContent).toContain('+20 kg em 30 d');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar 2 pesagens' }));
    await waitFor(() =>
      expect(chamadas.some((c) => c.canal === 'pesagem:registrarLote')).toBe(true),
    );
    const entrada = chamadas.find((c) => c.canal === 'pesagem:registrarLote')!.entrada as {
      pesagem: { itens: { animalId: string; pesoVivoKg: number }[] };
      confirmar: boolean;
    };
    expect(entrada.confirmar).toBe(true);
    expect(entrada.pesagem.itens.map((i) => [i.animalId, i.pesoVivoKg])).toEqual([
      [ANIMAIS[0]!.id, 320],
      [ANIMAIS[2]!.id, 250],
    ]);
    expect((await screen.findByTestId('erros-A-3')).textContent).toContain('Já existe uma pesagem');
    expect(screen.getByText(/Nada foi gravado/)).toBeTruthy();
  });

  it('recusa peso inválido antes de enviar', async () => {
    simularApi({ 'animal:listar': { itens: ANIMAIS, total: 3, pagina: 1, tamanhoPagina: 5000 } });
    renderizar('/manejo/pesagem');
    fireEvent.change(await screen.findByLabelText('Peso de A-2'), { target: { value: '1.050' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 pesagem' }));
    expect((await screen.findByTestId('erros-A-2')).textContent).toContain('Peso inválido');
    expect(chamadas.some((c) => c.canal === 'pesagem:registrarLote')).toBe(false);
  });
});

describe('registro sanitário coletivo', () => {
  it('marca todos os animais do lote, permite desmarcar e envia só os tratados', async () => {
    simularApi({
      'animal:listar': { itens: ANIMAIS, total: 3, pagina: 1, tamanhoPagina: 5000 },
      'manejoSanitario:registrar': { id: ID(500), quantidadeAnimais: 2 },
    });
    renderizar(`/manejo/sanidade/novo?lote=${LOTE.id}`);
    expect(await screen.findByText(/nada é sugerido automaticamente/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Vacina X' } });
    const tratado = await screen.findByLabelText('Tratado: A-2');
    expect((tratado as HTMLInputElement).checked).toBe(true);
    fireEvent.click(tratado);
    expect(screen.getByText('2 animais selecionados')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar registro' }));
    await waitFor(() =>
      expect(chamadas.some((c) => c.canal === 'manejoSanitario:registrar')).toBe(true),
    );
    const entrada = chamadas.find((c) => c.canal === 'manejoSanitario:registrar')!.entrada as {
      animais: { animalId: string }[];
      loteId: string;
      dados: { descricao: string; tipo: string };
    };
    expect(entrada.animais.map((a) => a.animalId)).toEqual([ANIMAIS[0]!.id, ANIMAIS[2]!.id]);
    expect(entrada.loteId).toBe(LOTE.id);
    expect(entrada.dados).toMatchObject({ descricao: 'Vacina X', tipo: 'vacinacao' });
  });

  it('sem produto e sem descrição, o formulário não envia', async () => {
    simularApi({ 'animal:listar': { itens: ANIMAIS, total: 3, pagina: 1, tamanhoPagina: 5000 } });
    renderizar(`/manejo/sanidade/novo?lote=${LOTE.id}`);
    await screen.findByLabelText('Tratado: A-1');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar registro' }));
    expect(await screen.findByText('Escolha o produto ou descreva o que foi feito.')).toBeTruthy();
    expect(chamadas.some((c) => c.canal === 'manejoSanitario:registrar')).toBe(false);
  });
});

describe('configurações de alerta', () => {
  it('recusa limite superior menor que o inferior', async () => {
    simularApi({});
    renderizar('/configuracoes');
    const maximo = await screen.findByLabelText(/passar de/);
    fireEvent.change(maximo, { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/abaixo de/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar critérios' }));
    expect(
      await screen.findByText('O limite superior do GMD precisa ser maior que o limite inferior.'),
    ).toBeTruthy();
    expect(chamadas.some((c) => c.canal === 'configuracao:definir')).toBe(false);
  });

  it('apresenta os valores como parâmetros operacionais e salva o intervalo curto', async () => {
    simularApi({ 'configuracao:definir': null });
    renderizar('/configuracoes');
    expect(
      await screen.findByText('Parâmetros operacionais, não limites científicos'),
    ).toBeTruthy();
    // Sem configuração gravada, vale o valor inicial (2,5 / 0 / 7).
    expect((screen.getByLabelText(/passar de/) as HTMLInputElement).value).toBe('2,5');
    const curto = screen.getByLabelText(/intervalo curto/) as HTMLInputElement;
    expect(curto.value).toBe('7');
    fireEvent.change(curto, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar critérios' }));
    await waitFor(() =>
      expect(
        chamadas.find(
          (c) =>
            c.canal === 'configuracao:definir' &&
            (c.entrada as { chave: string }).chave === 'alertas.pesagem',
        )?.entrada,
      ).toEqual({
        chave: 'alertas.pesagem',
        valor: { gmdMaximoKgDia: 2.5, gmdMinimoKgDia: 0, intervaloCurtoDias: 10 },
      }),
    );
  });
});

describe('alertas de pesagem: conferência e desempenho', () => {
  it('separa as categorias, marca intervalo curto e filtra por tipo', async () => {
    const parametros = { gmdMaximoKgDia: 2, gmdMinimoKgDia: 0, intervaloCurtoDias: 7 };
    const perda = [pesagem(1, '2026-01-01', 300), pesagem(2, '2026-01-04', 298)];
    const digitacao = [pesagem(3, '2026-01-01', 300), pesagem(4, '2026-01-31', 3300)];
    const [alertaPerda] = detectarAlertasPesagem(perda, parametros);
    const [alertaDigitacao] = detectarAlertasPesagem(digitacao, parametros);
    const animal = (n: number) => ({
      id: ANIMAIS[n]!.id,
      identificacao: ANIMAIS[n]!.identificacao,
      nome: null,
      lote: null,
    });
    const dados: AlertasPesagem = {
      parametros,
      itens: [
        { alerta: alertaPerda!, animal: animal(0), pesagem: perda[1]!, conferida: false },
        { alerta: alertaDigitacao!, animal: animal(1), pesagem: digitacao[1]!, conferida: false },
      ],
    };
    simularApi({ 'pesagem:alertas': dados });
    renderizar('/manejo/alertas');
    const tabela = await screen.findByTestId('tabela-alertas-pesagem');
    await waitFor(() => expect(tabela.querySelector('tr[data-alerta="A-1"]')).not.toBeNull());
    const linhaPerda = tabela.querySelector('tr[data-alerta="A-1"]')!;
    expect(linhaPerda.textContent).toContain('Desempenho');
    expect(linhaPerda.textContent).toContain('Intervalo curto');
    expect(linhaPerda.textContent).toContain('O peso pode estar certo');
    const linhaDigitacao = tabela.querySelector('tr[data-alerta="A-2"]')!;
    expect(linhaDigitacao.textContent).toContain('Conferência');
    expect(linhaDigitacao.textContent).not.toContain('Intervalo curto');
    expect(screen.getByTestId('explicacao-categorias').textContent).toContain(
      'perda ou ganho alto também acontecem de verdade',
    );

    fireEvent.change(screen.getByLabelText('Tipo de alerta'), {
      target: { value: 'conferencia' },
    });
    expect(tabela.querySelector('tr[data-alerta="A-1"]')).toBeNull();
    expect(tabela.querySelector('tr[data-alerta="A-2"]')).not.toBeNull();
  });
});

describe('evolução histórica do lote', () => {
  it('mostra quantos animais do lote entraram em cada média, o dia da troca e quem ficou de fora', async () => {
    // A-1 entrou no lote por transferência em 01/03 (pesado nesse dia); A-2 sempre esteve.
    const permA1 = [{ inicio: '2026-03-01', fim: null, inicioEmTroca: true, fimEmTroca: false }];
    const permA2 = [{ inicio: '2026-01-01', fim: null, inicioEmTroca: false, fimEmTroca: false }];
    const pesagensA1 = [
      pesagem(1, '2026-01-01', 300),
      pesagem(2, '2026-03-01', 360),
      pesagem(3, '2026-03-31', 390),
    ];
    const pesagensA2 = [pesagem(4, '2026-01-01', 250), pesagem(5, '2026-03-31', 340)];
    const membros = [
      { animalId: ANIMAIS[0]!.id, permanencias: permA1, pesagens: pesagensA1 },
      { animalId: ANIMAIS[1]!.id, permanencias: permA2, pesagens: pesagensA2 },
    ];
    const peso = (p: Pesagem) => ({ data: p.data, pesoVivoKg: p.pesoVivoKg, metodo: p.metodo });
    const evolucao: EvolucaoLote = {
      loteId: LOTE.id,
      animais: [
        {
          id: ANIMAIS[0]!.id,
          identificacao: 'A-1',
          nome: null,
          status: 'ativo',
          noLoteAgora: true,
          permanencias: permA1,
          trechos: [pesagensA1.slice(1).map(peso)],
          pesagensForaDoLote: 1,
        },
        {
          id: ANIMAIS[1]!.id,
          identificacao: 'A-2',
          nome: null,
          status: 'ativo',
          noLoteAgora: true,
          permanencias: permA2,
          trechos: [pesagensA2.map(peso)],
          pesagensForaDoLote: 0,
        },
      ],
      semReconstrucao: [
        {
          id: ANIMAIS[2]!.id,
          identificacao: 'A-3',
          nome: null,
          motivo: 'o lote atual do cadastro não confere com o histórico de movimentações.',
        },
      ],
      analise: analisarEvolucaoGrupo(membros),
    };
    simularApi({ 'lote:obter': { ...LOTE, movimentacoesArea: [] }, 'lote:evolucao': evolucao });
    renderizar(`/rebanho/lotes/${LOTE.id}`);

    const tabela = await screen.findByTestId('tabela-pontos-lote');
    const celulas = (data: string) =>
      [...tabela.querySelectorAll('tbody tr')]
        .find((tr) => tr.textContent?.startsWith(data))!
        .querySelectorAll('td');
    // 01/01: só A-2 estava no lote; a pesagem de A-1 nessa data não entra.
    expect(celulas('01/01/2026')[1]!.textContent).toBe('1');
    expect(celulas('01/01/2026')[2]!.textContent).toBe('1');
    expect(celulas('01/01/2026')[3]!.textContent).toBe('250 kg');
    expect(celulas('01/03/2026')[1]!.textContent).toBe('1(1 no dia da troca)');
    expect(celulas('01/03/2026')[2]!.textContent).toBe('2');
    expect(celulas('31/03/2026')[3]!.textContent).toBe('365 kg');
    expect(screen.getByTestId('aviso-dia-da-troca').textContent).toContain('sem a hora');
    expect(screen.getByTestId('lote-sem-reconstrucao').textContent).toContain(
      'não usa esses dados',
    );
    expect(screen.getByText(/o lote atual do cadastro não confere/)).toBeTruthy();
    // A ficha de cada animal continua acessível a partir da lista.
    const lista = screen.getByTestId('animais-que-passaram');
    expect(lista.textContent).toContain('desde 01/03/2026');
    expect(within(lista).getByRole('link', { name: 'A-1', hidden: true })).toBeTruthy();
  });
});

describe('carências', () => {
  it('apresenta fim de prazo calculado, carne e leite separados, sem prometer liberação', async () => {
    const resumoSanidade: ResumoSanidade = {
      antecedenciaDias: 7,
      agendaAtrasada: 0,
      agendaProxima: 0,
      alertasPesagemPendentes: 0,
      emCarencia: [
        {
          animalId: ANIMAIS[0]!.id,
          identificacao: 'A-1',
          nome: null,
          lote: null,
          carne: { fimPrazo: '2026-11-09', manejoId: ID(50), produto: 'Produto X' },
          leite: { fimPrazo: '2026-10-20', manejoId: ID(51), produto: 'Produto Y' },
        },
      ],
    };
    simularApi({ 'sanidade:resumo': resumoSanidade, 'agendaSanitaria:listar': [] });
    renderizar('/manejo/agenda');
    await screen.findByText('09/11/2026 (Produto X)');
    const tabela = screen.getByTestId('tabela-carencias');
    const cabecalho = tabela.querySelector('thead')!.textContent;
    expect(cabecalho).toContain('Carência carne: fim do prazo calculado');
    expect(cabecalho).toContain('Carência leite: fim do prazo calculado');
    expect(tabela.querySelector('tbody')!.textContent).toContain('09/11/2026 (Produto X)');
    expect(tabela.querySelector('tbody')!.textContent).toContain('20/10/2026 (Produto Y)');
    const aviso = screen.getByTestId('aviso-carencia').textContent;
    expect(aviso).toContain('Não são garantia de liberação');
    expect(aviso).toContain('bula do produto');
    expect(aviso).toContain('orientação do médico-veterinário');
    expect(document.body.textContent).not.toMatch(/liberad[oa] a partir/);
  });
});
