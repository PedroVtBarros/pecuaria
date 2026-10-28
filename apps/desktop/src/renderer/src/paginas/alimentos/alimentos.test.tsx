import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFINICOES_INICIAIS_NUTRIENTES } from '@pecuaria/domain';
import type {
  Nutriente,
  ResumoPacoteCuradoria,
  RegistroDetalhe,
  ValorNaoQuantificadoApi,
  ValorNutricionalApi,
} from '@pecuaria/shared-types';
import { ProvedorNotificacoes } from '../../components/notificacoes';
import { PaginaRegistro, TabelaValores } from './pagina-registro';
import { PaginaNutrientes } from './pagina-nutrientes';
import { ModalNaoQuantificado, ModalValor } from './formularios-registro';
import { QuadroCuradorias } from './quadro-curadorias';

/* Dados FICTÍCIOS de interface (CLAUDE.md, regra 1). */
const id = (n: number) => `01a13f6e-0000-7000-8000-${String(n).padStart(12, '0')}`;

const nutrientes: Nutriente[] = DEFINICOES_INICIAIS_NUTRIENTES.map((d) => ({
  id: d.id,
  codigo: d.codigo,
  nome: d.nome,
  grupo: d.grupo,
  unidadeReferencia: d.unidadeReferencia,
  baseReferencia: d.baseReferencia,
  metodoAnalitico: null,
  situacaoFundamentacao: 'pendente',
  fundamentacaoFonte: null,
  fundamentacaoReferencia: null,
  direcaoConservadora: d.direcaoConservadora,
  direcaoSugerida: d.direcaoConservadora,
  origemDefinicao: 'sistema',
  descricao: null,
  naturezaValor: d.naturezaValor,
  ativo: true,
  nValores: 0,
}));

const valor: ValorNutricionalApi = {
  id: id(10),
  nutriente: {
    id: nutrientes[3]!.id,
    codigo: 'PB',
    nome: 'Proteína bruta',
    grupo: 'proteina',
    unidadeReferencia: 'pct',
    baseReferencia: 'ms',
    situacaoFundamentacao: 'pendente',
  },
  valorPublicado: '12,50',
  valor: 12.5,
  casasDecimais: 2,
  unidade: 'pct',
  base: 'ms',
  tipoValor: 'media',
  desvioPadraoPublicado: '1,0',
  desvioPadrao: 1,
  minimoPublicado: null,
  minimo: null,
  maximoPublicado: null,
  maximo: null,
  nObservacoes: 4,
  metodoAnaliticoFonte: null,
  formaObtencao: 'nao_informado',
  descricaoObtencao: null,
  interpretacaoBase: null,
  referenciaLocal: null,
  observacao: null,
};

const naoQuantificado: ValorNaoQuantificadoApi = {
  id: id(11),
  nutriente: { ...valor.nutriente, id: nutrientes[4]!.id, codigo: 'EE', nome: 'Extrato etéreo' },
  textoPublicado: '<0,01',
  natureza: 'abaixo_do_limite',
  significadoFonte: 'Legenda fictícia: abaixo do limite de quantificação.',
  unidade: 'pct',
  base: 'ms',
  tipoValor: 'media',
  metodoAnaliticoFonte: null,
  referenciaLocal: null,
  observacao: null,
};

function detalhe(extra: {
  origem?: RegistroDetalhe['registro']['fonte']['origem'];
  status?: RegistroDetalhe['registro']['status'];
  mesmaPessoa?: boolean;
  naoQuantificados?: ValorNaoQuantificadoApi[];
  vinculos?: RegistroDetalhe['vinculosOrigem'];
  avaliacoes?: RegistroDetalhe['avaliacoes'];
  valores?: ValorNutricionalApi[];
}): RegistroDetalhe {
  const origem = extra.origem ?? 'estudo_individual';
  const status = extra.status ?? 'conferido';
  const fonte = {
    id: id(2),
    origem,
    codigo: 'TESTE',
    titulo: 'Fonte fictícia de teste',
    propriedadeId: null,
    propriedadeNome: null,
  };
  return {
    registro: {
      id: id(1),
      alimentoId: id(3),
      alimentoNome: 'Alimento de teste',
      fonte,
      referenciaLocal: 'Tabela fictícia 1',
      idadeCorteDias: null,
      dataAmostra: null,
      status,
      nValores: 1,
      transcritoPor: 'Pessoa A',
      transcritoEm: '2026-10-21T10:00:00.000Z',
      conferidoPor: status === 'conferido' ? 'Pessoa A' : null,
      conferidoEm: status === 'conferido' ? '2026-10-21T11:00:00.000Z' : null,
      substituiId: null,
      sucessorId: null,
      mesmaPessoa: extra.mesmaPessoa ?? false,
      descartadoEm: null,
      classeIdadeFonte: null,
      aditivoEnsilagem: null,
      regiao: null,
      estacao: null,
      adubacao: null,
      outrasCondicoes: null,
      nObservacoes: null,
      separadorDecimal: 'virgula',
      identificacaoAmostra: null,
      observacoes: null,
      rejeitadoPor: null,
      rejeitadoEm: null,
      motivoRejeicao: null,
      motivoVersao: null,
      substituidoEm: null,
      motivoDescarte: null,
    },
    fonte: {
      ...fonte,
      autores: 'Autoria fictícia',
      ano: 2020,
      edicaoVersao: null,
      metodoMedicao: origem === 'medicao_propria' ? 'Método fictício descrito' : null,
      limitacoesMedicao: origem === 'medicao_propria' ? 'Limitações fictícias' : null,
      laboratorio: null,
      numeroLaudo: null,
      fabricante: null,
    },
    valores: extra.valores ?? [valor],
    valoresNaoQuantificados: extra.naoQuantificados ?? [],
    vinculosOrigem: extra.vinculos ?? [],
    avaliacoes: extra.avaliacoes ?? [],
    acoes: status === 'rascunho' ? ['transcrever'] : [],
    editavel: status === 'rascunho',
    descartavel: status === 'rascunho',
    aceitaNovaVersao: status === 'conferido',
    versoes: [],
    diferencasDaAnterior: [],
    historico: [],
  };
}

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
            <Route path="/registros/:id" element={elemento} />
            <Route path="*" element={elemento} />
          </Routes>
        </ProvedorNotificacoes>
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

describe('banco de alimentos: interface', () => {
  it('valor sempre com o texto publicado, a unidade e a base; ausente explicado, nunca zero', () => {
    montar(<TabelaValores valores={[valor]} />, {});
    expect(screen.getByText('12,50 % (MS)')).toBeTruthy();
    expect(screen.getByText('Método da definição pendente')).toBeTruthy();
    expect(screen.getByText(/DP 1,0 · n 4/)).toBeTruthy();
    cleanup();
    montar(<TabelaValores valores={[]} />, {});
    expect(screen.getByText(/nunca grava zero/)).toBeTruthy();
  });

  it('base inferida aparece como inferida, com o motivo; nunca como base da fonte', () => {
    montar(
      <TabelaValores valores={[{ ...valor, interpretacaoBase: 'Motivo fictício da base.' }]} />,
      {},
    );
    expect(screen.getByTestId('base-interpretada').textContent).toBe(
      'Base inferida, não declarada pela fonte',
    );
    expect(screen.getByText('Base: Motivo fictício da base.')).toBeTruthy();
    cleanup();
    montar(<TabelaValores valores={[valor]} />, {});
    expect(screen.queryByTestId('base-interpretada')).toBeNull();
  });

  it('registro conferido: sem edição, com aviso de imutável e nova versão disponível', async () => {
    montar(
      <PaginaRegistro />,
      { 'composicao:obter': detalhe({ mesmaPessoa: true }) },
      `/registros/${id(1)}`,
    );
    expect(await screen.findByText(/Registro conferido não muda/)).toBeTruthy();
    expect(screen.queryByText('Novo valor')).toBeNull();
    expect(screen.queryByText('Editar cabeçalho')).toBeNull();
    expect(screen.getByText('Nova versão')).toBeTruthy();
    expect(screen.getByText(/A mesma pessoa transcreveu e conferiu/)).toBeTruthy();
  });

  it('rótulo e medição própria trazem o aviso fixo da origem', async () => {
    montar(
      <PaginaRegistro />,
      { 'composicao:obter': detalhe({ origem: 'rotulo_comercial', status: 'rascunho' }) },
      `/registros/${id(1)}`,
    );
    expect(await screen.findByText(/Não são composição típica/)).toBeTruthy();
    expect(screen.getByText('Novo valor')).toBeTruthy();
    cleanup();
    montar(
      <PaginaRegistro />,
      { 'composicao:obter': detalhe({ origem: 'medicao_propria' }) },
      `/registros/${id(1)}`,
    );
    expect(await screen.findByText(/Método não validado pelo sistema/)).toBeTruthy();
    expect(screen.getByText('Método fictício descrito')).toBeTruthy();
    expect(screen.getByText('Limitações fictícias')).toBeTruthy();
  });

  it('o número digitado é lido na hora com o separador do registro; texto censurado é recusado', async () => {
    montar(
      <ModalValor
        registroId={id(1)}
        origem="estudo_individual"
        separador="virgula"
        valor={null}
        aoFechar={() => undefined}
      />,
      { 'nutriente:listar': nutrientes },
    );
    const campo = await screen.findByLabelText(/Valor como publicado/);
    fireEvent.change(campo, { target: { value: '1.050' } });
    expect(screen.getByText(/Lido como 1\.050 \(0 casas decimais\)/)).toBeTruthy();
    fireEvent.change(campo, { target: { value: '<0,01' } });
    expect(screen.getByText(/Número inválido para fonte com vírgula decimal/)).toBeTruthy();
  });

  it('não quantificado: texto e significado da fonte, sem número; botão só nas origens que publicam', async () => {
    montar(
      <PaginaRegistro />,
      {
        'composicao:obter': detalhe({ status: 'rascunho', naoQuantificados: [naoQuantificado] }),
      },
      `/registros/${id(1)}`,
    );
    expect(await screen.findByText('<0,01 % (MS)')).toBeTruthy();
    expect(screen.getByText('Abaixo do limite')).toBeTruthy();
    expect(screen.getByText(/abaixo do limite de quantificação/)).toBeTruthy();
    expect(screen.getAllByText(/nunca entra em cálculo como valor/).length).toBeGreaterThan(0);
    expect(screen.getByText('Valor não quantificado')).toBeTruthy();
    cleanup();
    montar(
      <PaginaRegistro />,
      { 'composicao:obter': detalhe({ origem: 'rotulo_comercial', status: 'rascunho' }) },
      `/registros/${id(1)}`,
    );
    expect(await screen.findByText('Novo valor')).toBeTruthy();
    expect(screen.queryByText('Valor não quantificado')).toBeNull();
  });

  it('formulário do não quantificado confere o texto na hora e recusa número', async () => {
    montar(
      <ModalNaoQuantificado
        registroId={id(1)}
        origem="laboratorial"
        separador="virgula"
        valor={null}
        aoFechar={() => undefined}
      />,
      { 'nutriente:listar': nutrientes },
    );
    const nutriente = await screen.findByLabelText(/Nutriente/);
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(5));
    fireEvent.change(nutriente, { target: { value: nutrientes[3]!.id } });
    fireEvent.change(screen.getByLabelText(/Natureza \(pela legenda da fonte\)/), {
      target: { value: 'abaixo_do_limite' },
    });
    fireEvent.change(screen.getByLabelText(/Unidade da coluna/), { target: { value: 'pct' } });
    fireEvent.change(screen.getByLabelText(/Tipo de valor/), { target: { value: 'valor_unico' } });
    const texto = screen.getByLabelText(/Texto como publicado/);
    fireEvent.change(texto, { target: { value: '<0,01' } });
    expect(screen.getByText('Será gravado como texto, sem número.')).toBeTruthy();
    fireEvent.change(texto, { target: { value: '0,01' } });
    expect(screen.getByText('O texto é um número: registre como valor numérico.')).toBeTruthy();
  });

  it('curadoria: mostra fonte e contagem; importar só por botão; importado leva à conferência', async () => {
    const pacote: ResumoPacoteCuradoria = {
      codigo: 'TESTE_PACOTE',
      versao: 1,
      titulo: 'Pacote fictício de teste',
      descricao: 'Descrição fictícia.',
      transcritoPor: 'Transcritor fictício',
      fonte: {
        codigo: 'TESTE_FONTE',
        titulo: 'Fonte fictícia de teste',
        autores: 'Autoria fictícia',
        ano: 2020,
        edicaoVersao: null,
        isbnDoiUrl: 'endereço fictício',
        dataAcesso: '2026-10-21',
      },
      alimentos: [{ nome: 'Alimento de teste', registros: 2, valores: 5, bloqueados: 1 }],
      bloqueados: [
        {
          alimento: 'Alimento de teste',
          referenciaLocal: 'Relatório fictício 3',
          motivo: 'Correspondência fictícia não conferida.',
        },
      ],
      nutrientes: ['TESTE_A'],
      contagem: { alimentos: 1, registros: 2, valores: 5, bloqueados: 1 },
      importacao: null,
      versaoImportada: null,
      atualizacao: null,
    };
    const invocar = montar(<QuadroCuradorias />, { 'curadoria:listar': [pacote] });
    expect(await screen.findByText('Pacote fictício de teste')).toBeTruthy();
    expect(screen.getByText(/Consultado em 21\/10\/2026/)).toBeTruthy();
    expect(screen.getByText(/1 alimentos, 2 registros e 5 valores/)).toBeTruthy();
    expect(screen.getByText('Não importado')).toBeTruthy();
    expect(screen.getByText('1 registro bloqueado para importação')).toBeTruthy();
    expect(screen.getByTestId('curadoria-bloqueados').textContent).toContain(
      'Correspondência fictícia não conferida.',
    );
    expect(invocar.mock.calls.map((c) => c[0])).not.toContain('curadoria:importar');
    fireEvent.click(screen.getByText('Importar para conferência'));
    expect(await screen.findByText(/Nada é conferido automaticamente/)).toBeTruthy();
    cleanup();
    montar(<QuadroCuradorias />, {
      'curadoria:listar': [
        {
          ...pacote,
          importacao: {
            id: id(20),
            pacoteCodigo: 'TESTE_PACOTE',
            pacoteVersao: 1,
            fonteId: id(2),
            nAlimentosCriados: 1,
            nRegistros: 2,
            nValores: 5,
            importadoEm: '2026-10-21T12:00:00.000Z',
          },
        },
      ],
    });
    expect(await screen.findByText('Importado')).toBeTruthy();
    expect(screen.getByText('Conferir na aba Conferência')).toBeTruthy();
    expect(screen.queryByText('Importar para conferência')).toBeNull();

    // Versão nova de pacote já importado: só atualização, nunca nova importação.
    cleanup();
    const invocar2 = montar(<QuadroCuradorias />, {
      'curadoria:listar': [{ ...pacote, versao: 2, versaoImportada: 1 }],
    });
    expect(await screen.findByText('Versão 1 importada')).toBeTruthy();
    expect(screen.queryByText('Importar para conferência')).toBeNull();
    fireEvent.click(screen.getByText('Atualizar para a versão 2'));
    expect(await screen.findByText(/não duplica registros/)).toBeTruthy();
    expect(invocar2.mock.calls.map((c) => c[0])).not.toContain('curadoria:atualizar');
    cleanup();
    montar(<QuadroCuradorias />, {
      'curadoria:listar': [
        {
          ...pacote,
          versao: 2,
          versaoImportada: 2,
          importacao: {
            id: id(21),
            pacoteCodigo: 'TESTE_PACOTE',
            pacoteVersao: 2,
            fonteId: id(2),
            nAlimentosCriados: 0,
            nRegistros: 2,
            nValores: 5,
            importadoEm: '2026-10-21T13:00:00.000Z',
          },
          atualizacao: {
            deVersao: 1,
            fonteAlterada: [],
            itens: [
              {
                referenciaLocal: 'Relatório fictício 1',
                alimento: 'Alimento de teste',
                situacao: 'nova_versao',
                registroId: id(22),
                mudancas: ['TESTE_A: interpretação da base'],
              },
              {
                referenciaLocal: 'Relatório fictício 2',
                alimento: 'Alimento de teste',
                situacao: 'sem_mudanca',
                registroId: id(23),
                mudancas: [],
              },
            ],
          },
        },
      ],
    });
    const resumo = await screen.findByTestId('curadoria-atualizacao');
    expect(resumo.textContent).toContain('Atualizado da versão 1');
    expect(resumo.textContent).toContain('Nova versão, a conferir (1); Sem mudança (1)');
    expect(resumo.textContent).toContain('TESTE_A: interpretação da base');
  });

  it('avaliação científica separada da conferência; validar base só em base inferida', async () => {
    const valorInferido = { ...valor, id: id(41), interpretacaoBase: 'Motivo fictício da base.' };
    const invocar = montar(
      <PaginaRegistro />,
      {
        'composicao:obter': detalhe({
          status: 'conferido',
          valores: [valorInferido],
          avaliacoes: [
            {
              id: id(40),
              registroId: id(1),
              valorId: null,
              tipo: 'uso_com_cautela',
              motivo: 'Cautela fictícia.',
              avaliadoPor: 'Pessoa fictícia',
              avaliadoEm: '2026-10-22T10:00:00.000Z',
              retiradoPor: null,
              retiradoEm: null,
              motivoRetirada: null,
            },
          ],
        }),
      },
      `/registros/${id(1)}`,
    );
    const tabela = await screen.findByTestId('tabela-avaliacao-valores');
    expect(tabela.textContent).toContain('Inferida, não validada');
    expect(screen.getByText('Validar base')).toBeTruthy();
    expect(screen.queryByText('Marcar registro como uso com cautela')).toBeNull();
    expect(screen.getByTestId('avaliacoes').textContent).toContain(
      'Uso com cautela · Registro inteiro',
    );
    expect(screen.getByText(/fica fora da agregação automática/)).toBeTruthy();
    fireEvent.click(screen.getByText('Validar base'));
    expect(await screen.findByText(/continua marcada como inferida/)).toBeTruthy();
    expect(invocar.mock.calls.map((c) => c[0])).not.toContain('avaliacao:marcar');
  });

  it('forma de obtenção ao lado do método; vínculo de origem com decisão só quando o outro existe', async () => {
    montar(
      <PaginaRegistro />,
      {
        'composicao:obter': detalhe({
          status: 'transcrito',
          valores: [
            {
              ...valor,
              formaObtencao: 'estimado_equacao',
              descricaoObtencao: 'Equação fictícia (Autor fictício, 2000).',
              interpretacaoBase: null,
            },
          ],
          vinculos: [
            {
              id: id(30),
              lado: 'outro',
              relacao: 'outro_inclui_este',
              evidencia: 'Evidência fictícia.',
              pacoteCodigo: 'TESTE_PACOTE',
              situacao: 'a_confirmar',
              decididoPor: null,
              decididoEm: null,
              motivoDecisao: null,
              outro: {
                registroId: id(31),
                alimentoNome: 'Alimento de teste',
                fonteCodigo: 'TESTE_B',
                referenciaLocal: 'Tabela fictícia B1',
                status: 'transcrito',
              },
            },
            {
              id: id(32),
              lado: 'este',
              relacao: 'mesmos_valores',
              evidencia: 'Outra evidência fictícia.',
              pacoteCodigo: 'TESTE_PACOTE',
              situacao: 'a_confirmar',
              decididoPor: null,
              decididoEm: null,
              motivoDecisao: null,
              outro: {
                registroId: null,
                alimentoNome: null,
                fonteCodigo: 'TESTE_C',
                referenciaLocal: 'Tabela fictícia C1',
                status: null,
              },
            },
          ],
        }),
      },
      `/registros/${id(1)}`,
    );
    expect(
      await screen.findByText(/Obtenção: Estimado por equação · Equação fictícia/),
    ).toBeTruthy();
    const lista = screen.getByTestId('vinculos-origem');
    expect(lista.textContent).toContain(
      'Este registro é uma média ou compilação que inclui os dados do outro',
    );
    expect(lista.textContent).toContain('TESTE_C · Tabela fictícia C1 (ainda não importado)');
    expect(screen.getAllByText('Confirmar mesma origem')).toHaveLength(1);
    expect(screen.getByText(/não são independentes/)).toBeTruthy();
    fireEvent.click(screen.getByText('Descartar vínculo'));
    expect(await screen.findByText(/devolve a independência/)).toBeTruthy();
  });

  it('catálogo mostra as definições sem método como pendentes de fundamentação', async () => {
    montar(<PaginaNutrientes />, { 'nutriente:listar': nutrientes });
    await waitFor(() =>
      expect(screen.getAllByText('Método pendente de fundamentação').length).toBe(
        nutrientes.length,
      ),
    );
    expect(screen.getAllByText('Catálogo inicial').length).toBe(nutrientes.length);
  });
});
