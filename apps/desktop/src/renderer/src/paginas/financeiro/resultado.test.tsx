import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProvedorNotificacoes } from '../../components/notificacoes';
import { PaginaConciliacao } from './pagina-conciliacao';
import { PaginaProjecao } from './pagina-projecao';
import { PaginaResultado } from './pagina-resultado';

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
const ap = (estado: string, v: number, k: number, d = 0, n = 0) => ({
  estado,
  valorConhecidoCentavos: v,
  componentesConhecidos: k,
  componentesDesconhecidos: d,
  componentesNaoApurados: n,
});
const resultado = {
  propriedadeId: PROP,
  dataInicial: '2026-10-01',
  dataFinal: '2026-10-31',
  competencia: {
    receitas: {
      vendaAnimaisCentavos: 300000,
      devolucoesVendaCentavos: 0,
      leiteCentavos: 0,
      outrasCentavos: 0,
      recuperadoDevolucaoCompraCentavos: 0,
      totalCentavos: 300000,
    },
    custo: ap('parcial', 360000, 5, 1),
    porCategoria: [{ categoria: 'aquisicao', valorCentavos: 300000 }],
    baixaDeAnimaisCentavos: 300000,
    estornoDeBaixaCentavos: 0,
    naoAlocadoCentavos: 20000,
    animaisSemBase: 1,
    valorConhecidoCentavos: -60000,
    resultadoCentavos: -60000,
    receitasDesconhecidas: 0,
    estado: 'parcial',
    limite: 'no_maximo',
  },
  caixa: { entradasCentavos: 300000, saidasCentavos: 520000, saldoCentavos: -220000 },
  margemBruta: {
    receitaCentavos: 300000,
    variaveisCentavos: 40000,
    fixosCentavos: 20000,
    margemCentavos: 260000,
    estado: 'parcial',
    coberturaCentavos: { classificado: 60000, total: 360000, naoClassificado: 300000 },
    motivos: ['3 custo(s) sem classificação de fixo ou variável.'],
    semClassificacao: [
      {
        data: '2026-10-10',
        descricao: 'Aquisição do animal',
        valorCentavos: 100000,
        origem: { tipo: 'aquisicao', id: uuid(9) },
      },
    ],
    semClassificacaoTruncada: false,
  },
};
const indicadores = {
  propriedadeId: PROP,
  dataInicial: '2026-10-01',
  dataFinal: '2026-10-31',
  custoPorKgGanho: {
    centavosPorKg: null,
    animais: 0,
    ganhoGramas: 0,
    custo: ap('nao_apurada', 0, 0, 0, 1),
    estado: 'indisponivel',
    semPesagens: 4,
    pesagensPorMetodo: {},
  },
  porLote: [],
  carcaca: {
    animais: 2,
    gramas: 480000,
    receitaCentavos: 300000,
    custo: ap('completa', 220000, 2),
    receitaPorArrobaCentavos: 9375,
    custoPorArrobaCentavos: 6875,
    margemPorArrobaCentavos: 2500,
    semPeso: 0,
    estado: 'completo',
  },
  vivo: {
    animais: 0,
    gramas: 0,
    receitaCentavos: 0,
    custo: ap('completa', 0, 0),
    receitaPorArrobaCentavos: null,
    custoPorArrobaCentavos: null,
    margemPorArrobaCentavos: null,
    semPeso: 2,
    estado: 'indisponivel',
  },
  devolucoesVendaNoPeriodo: 0,
  leite: {
    litrosMilesimos: 0,
    receitaCentavos: 0,
    precoPorLitroCentavos: null,
    receitasSemLitros: 0,
  },
};
const realizado = {
  propriedadeId: PROP,
  dataInicial: '2026-10-01',
  dataFinal: '2026-10-31',
  animais: [
    {
      animalId: uuid(30),
      identificacao: 'a4',
      saida: 'vendido',
      data: '2026-10-14',
      lote: null,
      receitaCentavos: null,
      custo: ap('completa', 110000, 2),
      valorConhecidoCentavos: -110000,
      resultadoCentavos: null,
      receitasDesconhecidas: 1,
      estado: 'nao_apurado',
      limite: null,
    },
  ],
  porLote: [],
  totais: {
    loteId: null,
    loteNome: 'Total',
    animais: 1,
    receitaCentavos: 0,
    custo: ap('completa', 110000, 2),
    valorConhecidoCentavos: -110000,
    resultadoCentavos: null,
    receitasDesconhecidas: 1,
    estado: 'nao_apurado',
    limite: null,
    vendidos: 1,
    perdas: 0,
    perdasCentavos: 0,
  },
  devolucoesVenda: [],
  devolucoesCompra: {
    animais: 0,
    recuperadoCentavos: 0,
    custo: ap('completa', 0, 0),
    diferencaCentavos: 0,
  },
};
const equilibrio = {
  base: 'arroba_carcaca',
  estado: 'indisponivel',
  unidadesMilesimos: null,
  precoMedioCentavos: null,
  custoVariavelPorUnidadeCentavos: null,
  unidadesVendidasMilesimos: 32000,
  vendasIncluidas: 2,
  vendasSemPeso: 0,
  receitaDasUnidadesCentavos: 300000,
  fixosCentavos: 20000,
  variaveisCentavos: 40000,
  motivos: ['3 custo(s) sem classificação: classifique-os para calcular.'],
};

function montar(elemento: React.ReactNode, respostas: Record<string, unknown>) {
  const invocar = vi.fn(async (canal: string, _entrada?: unknown) => {
    if (canal === 'projecao:calcular' && respostas['projecao:erro'])
      return {
        ok: false,
        erro: { codigo: 'ENTRADA_INVALIDA', mensagem: respostas['projecao:erro'] as string },
      };
    return {
      ok: true,
      dados:
        canal === 'configuracao:obter'
          ? { valor: null }
          : canal === 'propriedade:listar'
            ? [propriedade]
            : canal === 'animal:listar'
              ? { itens: [], total: 0 }
              : (respostas[canal] ?? []),
    };
  });
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

describe('resultado (tela)', () => {
  const respostas = {
    'resultado:periodo': resultado,
    'resultado:realizado': realizado,
    'resultado:indicadores': indicadores,
    'resultado:pontoEquilibrio': equilibrio,
  };

  it('competência e caixa em blocos separados; resultado com custo parcial é "no máximo"', async () => {
    montar(<PaginaResultado />, respostas);
    const comp = await screen.findByTestId('bloco-resultado-competencia');
    expect(within(comp).getByText(/no máximo -?R\$\s*-?600,00/)).toBeTruthy();
    expect(within(comp).getByText(/1 animal\(is\) saíram sem custo de aquisição/)).toBeTruthy();
    const caixa = screen.getByTestId('bloco-resultado-caixa');
    expect(within(caixa).getByText(/não é lucro/i)).toBeTruthy();
    expect(within(caixa).getByText(/2\.200,00/)).toBeTruthy();
    expect(within(caixa).getByRole('link', { name: /Por que o caixa é diferente/ })).toBeTruthy();
  });

  it('margem bruta parcial mostra a cobertura e lista o que falta classificar', async () => {
    montar(<PaginaResultado />, respostas);
    const mb = await screen.findByTestId('margem-bruta');
    expect(within(mb).getByText('Parcial')).toBeTruthy();
    expect(within(mb).getByText(/Classificados R\$\s*600,00 de R\$\s*3\.600,00/)).toBeTruthy();
    expect(
      within(screen.getByTestId('sem-classificacao')).getByText('Aquisição do animal'),
    ).toBeTruthy();
    expect(within(mb).getByRole('link', { name: 'Classificar custos' })).toBeTruthy();
  });

  it('indicador sem dado diz quantos ficaram de fora; venda sem receita é "Não registrada"', async () => {
    montar(<PaginaResultado />, respostas);
    const ind = await screen.findByTestId('indicadores');
    expect(within(ind).getAllByText('Sem dado').length).toBeGreaterThan(0);
    expect(within(ind).getByText(/4 com custo e sem duas pesagens ficaram de fora/)).toBeTruthy();
    expect(within(ind).getByText(/R\$\s*68,75 \/ @ carcaça/)).toBeTruthy();
    const animais = await screen.findByTestId('realizado-animais');
    expect(within(animais).getByText('Não registrada')).toBeTruthy();
    expect(within(animais).queryByText(/R\$\s*0,00/)).toBeNull();
  });

  it('venda sem receita registrada: realizado "Não apurado", nunca a receita como zero', async () => {
    montar(<PaginaResultado />, respostas);
    const animais = await screen.findByTestId('realizado-animais');
    expect(within(animais).getAllByText('Não apurado').length).toBeGreaterThan(0);
    const realizadoBloco = screen.getByTestId('realizado');
    // O total não mostra −R$ 1.100,00 (seria tratar a receita desconhecida como zero).
    expect(within(realizadoBloco).queryByText(/-R\$\s*1\.100,00/)).toBeNull();
    expect(within(realizadoBloco).getByText(/1 saída\(s\) sem receita registrada/)).toBeTruthy();
  });

  it('competência: venda a prazo conta como receita conhecida; venda sem receita deixa "no mínimo" ou "Não apurado"', async () => {
    const comMinimo = {
      ...resultado,
      competencia: {
        ...resultado.competencia,
        custo: ap('completa', 360000, 5),
        receitasDesconhecidas: 1,
        limite: 'no_minimo',
      },
    };
    montar(<PaginaResultado />, { ...respostas, 'resultado:periodo': comMinimo });
    const comp = await screen.findByTestId('bloco-resultado-competencia');
    expect(within(comp).getByText(/no mínimo -?R\$\s*-?600,00/)).toBeTruthy();
    cleanup();
    const naoApurado = {
      ...resultado,
      competencia: {
        ...resultado.competencia,
        receitas: { ...resultado.competencia.receitas, vendaAnimaisCentavos: 0, totalCentavos: 0 },
        resultadoCentavos: null,
        receitasDesconhecidas: 2,
        estado: 'nao_apurado',
        limite: null,
      },
    };
    montar(<PaginaResultado />, { ...respostas, 'resultado:periodo': naoApurado });
    const comp2 = await screen.findByTestId('bloco-resultado-competencia');
    expect(within(comp2).getByText('Não apurado')).toBeTruthy();
    expect(within(comp2).getByText(/A receita desconhecida não é tratada como zero/)).toBeTruthy();
  });

  it('ponto de equilíbrio indisponível explica o motivo; trocar a base pede de novo', async () => {
    const invocar = montar(<PaginaResultado />, respostas);
    const pe = await screen.findByTestId('ponto-equilibrio');
    expect(await within(pe).findByText(/classifique-os para calcular/)).toBeTruthy();
    fireEvent.change(within(pe).getByLabelText('Base'), { target: { value: 'cabeca' } });
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'resultado:pontoEquilibrio',
        expect.objectContaining({ base: 'cabeca' }),
      ),
    );
  });
});

describe('conciliação (tela)', () => {
  it('mostra cada linha com competência, caixa e diferença, e os totais', async () => {
    montar(<PaginaConciliacao />, {
      'resultado:conciliacao': {
        propriedadeId: PROP,
        dataInicial: '2026-10-01',
        dataFinal: '2026-10-31',
        linhas: [
          {
            chave: 'insumos',
            rotulo: 'Insumos e estoque',
            competencia: {
              receitaCentavos: 0,
              custoCentavos: 40000,
              desconhecidos: 1,
              receitasDesconhecidas: 0,
            },
            caixa: { entradasCentavos: 0, saidasCentavos: 100000 },
            diferencaCentavos: 60000,
            explicacao: 'Consumo contra pagamentos.',
          },
        ],
        totais: {
          resultadoCompetenciaCentavos: -40000,
          caixaLiquidoCentavos: -100000,
          diferencaCentavos: 60000,
        },
        custoDesconhecido: 1,
        competencia: {
          valorConhecidoCentavos: -40000,
          resultadoCentavos: -40000,
          receitasDesconhecidas: 0,
          estado: 'parcial',
          limite: 'no_maximo',
        },
      },
    });
    const linhas = await screen.findByTestId('linhas-conciliacao');
    expect(within(linhas).getByText('Insumos e estoque')).toBeTruthy();
    expect(within(linhas).getByText('1 custo(s) desconhecido(s)')).toBeTruthy();
    expect(
      within(screen.getByTestId('totais-conciliacao')).getAllByText(/600,00/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/ficaram fora das somas da competência/)).toBeTruthy();
    expect(screen.getByText(/o resultado é no máximo o valor mostrado/)).toBeTruthy();
  });
});

describe('projeção (tela)', () => {
  it('exige alvo e preço; envia os valores sem conversão e mostra o rótulo fixo', async () => {
    const invocar = montar(<PaginaProjecao />, {
      'lote:listar': [
        {
          id: uuid(40),
          propriedadeId: PROP,
          nome: 'Lote A',
          finalidade: 'engorda',
          area: null,
          dataFormacao: '2026-01-01',
          ativo: true,
          dataEncerramento: null,
          observacoes: null,
          animaisAtivos: 1,
        },
      ],
      'projecao:calcular': {
        rotulo:
          'Projeção por premissas suas, não é dado apurado. Nada é gravado e o valor não entra em nenhum total.',
        alvo: { tipo: 'lote', id: uuid(40), nome: 'Lote A' },
        animais: 1,
        data: '2026-12-01',
        unidadePreco: 'arroba_vivo',
        receitaEsperadaCentavos: 900000,
        custoAcumulado: ap('parcial', 110000, 2, 1),
        custosFuturosCentavos: 50000,
        resultadoProjetadoCentavos: 740000,
        estado: 'parcial',
        erros: [],
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Calcular projeção' }));
    expect(await screen.findByText('Escolha o lote ou o animal.')).toBeTruthy();
    expect(invocar.mock.calls.some(([c]) => c === 'projecao:calcular')).toBe(false);
    await screen.findByRole('option', { name: 'Lote A' });
    fireEvent.change(screen.getByLabelText(/Lote ou animal/), {
      target: { value: `lote:${uuid(40)}` },
    });
    fireEvent.change(screen.getByLabelText('Preço esperado por unidade'), {
      target: { value: '300,00' },
    });
    fireEvent.change(screen.getByLabelText(/Peso vivo esperado por animal/), {
      target: { value: '450' },
    });
    fireEvent.change(screen.getByLabelText(/Custos futuros esperados/), {
      target: { value: '500,00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular projeção' }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith(
        'projecao:calcular',
        expect.objectContaining({
          alvo: { tipo: 'lote', id: uuid(40) },
          unidadePreco: 'arroba_vivo',
          precoUnitarioCentavos: 30000,
          pesoVivoKgPorAnimal: 450,
          pesoCarcacaKgPorAnimal: null,
          custosFuturosCentavos: 50000,
        }),
      ),
    );
    const r = await screen.findByTestId('resultado-projecao');
    expect(within(r).getByText(/não é dado apurado/)).toBeTruthy();
    expect(within(r).getByText(/no máximo R\$\s*7\.400,00/)).toBeTruthy();
  });
});
