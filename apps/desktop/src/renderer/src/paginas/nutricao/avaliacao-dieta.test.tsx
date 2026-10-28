import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Nutriente } from '@pecuaria/shared-types';
// Só no teste: banco de teste real atrás do IPC, como no app (o renderer não acessa o banco).
// Fontes, alimentos e números FICTÍCIOS (CLAUDE.md, regra 1); nada no banco operacional.
import { criarAmbienteIpc, type AmbienteIpc } from '../../../../main/teste/ambiente-ipc';
import {
  dadosAlimento,
  dadosFonte,
} from '../../../../main/services/alimentos/apoio-teste-alimentos';
import { ProvedorNotificacoes } from '../../components/notificacoes';
import { LayoutNutricao } from './layout-nutricao';
import { PaginaAvaliarDieta } from './pagina-avaliar-dieta';
import { PaginaAvaliacao, PaginaAvaliacoes } from './pagina-avaliacoes';

/* Fase 6B-5: tela de avaliação de dietas, ponta a ponta até o banco de teste. */
let amb: AmbienteIpc;
let nut: Record<string, Nutriente>;

beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 27, 10) });
  nut = Object.fromEntries(
    (await amb.ok('nutriente:listar', {})).map((n) => [n.codigo, n] as const),
  );
  Object.defineProperty(window, 'api', {
    value: {
      invocar: (canal: string, entrada: unknown) => amb.chamar(canal as never, entrada as never),
    },
    configurable: true,
  });
});
afterEach(() => {
  cleanup();
  amb.encerrar();
});

/** Registro FICTÍCIO conferido; devolve o id. */
async function registro(alimentoId: string, valores: [string, string][]) {
  const fonte = await amb.ok('fonte:criar', {
    dados: dadosFonte({
      codigo: `FICT_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      titulo: 'Fonte FICTÍCIA de teste',
    }),
  });
  const r = await amb.ok('composicao:criar', {
    dados: {
      alimentoId,
      fonteId: fonte.id,
      referenciaLocal: 'Tabela FICTÍCIA 1',
      idadeCorteDias: 60,
      classeIdadeFonte: null,
      aditivoEnsilagem: null,
      regiao: null,
      estacao: null,
      adubacao: null,
      outrasCondicoes: null,
      nObservacoes: null,
      separadorDecimal: 'virgula',
      dataAmostra: null,
      identificacaoAmostra: null,
      observacoes: null,
    },
  });
  for (const [codigo, texto] of valores)
    await amb.ok('composicao:salvarValor', {
      registroId: r.registro.id,
      valorId: null,
      dados: {
        nutrienteId: nut[codigo]!.id,
        valorPublicado: texto,
        unidade: 'pct',
        base: codigo === 'MS' ? 'mn' : 'ms',
        tipoValor: 'media',
        desvioPadraoPublicado: null,
        minimoPublicado: null,
        maximoPublicado: null,
        nObservacoes: null,
        metodoAnaliticoFonte: null,
        formaObtencao: 'medido',
        descricaoObtencao: null,
        interpretacaoBase: null,
        referenciaLocal: null,
        observacao: null,
      },
    });
  await amb.ok('composicao:transcrever', { id: r.registro.id, responsavel: 'Pessoa A' });
  await amb.ok('composicao:conferir', { id: r.registro.id, responsavel: 'Pessoa B' });
  return r.registro.id;
}

/** Alimento FICTÍCIO com perfil gravado; devolve ids. */
async function alimentoComPerfil(nome: string) {
  const a = await amb.ok('alimento:criar', {
    dados: dadosAlimento({
      nome,
      especie: 'Especie FICTÍCIA',
      cultivar: null,
      formaConservacao: 'fresco',
      classe: 'volumoso',
    }),
  });
  const r = await registro(a.id, [
    ['MS', '50,0'],
    ['NDT', '70,0'],
    ['PB', '12,0'],
    ['Ca', '0,50'],
    ['P', '0,30'],
  ]);
  const p = await amb.ok('perfil:gravar', {
    alimentoId: a.id,
    idadeCorteDias: 60,
    escolhas: [],
    tipo: 'referencia_individual',
    registroId: r,
    nutrienteId: null,
    sentido: null,
    nome: `Perfil ${nome}`,
    responsavel: 'Pessoa usuária',
  });
  return { alimentoId: a.id, registroId: r, perfilId: p.perfil.id };
}
const aprovar = () =>
  amb.ok('selecao:aprovarRegra', {
    codigo: 'SELECAO_5D',
    versao: 2,
    responsavel: 'Pessoa usuária',
    observacao: null,
  });

function montar(rota = '/nutricao/dieta') {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProvedorNotificacoes>
        <MemoryRouter initialEntries={[rota]}>
          <Routes>
            <Route path="/nutricao" element={<LayoutNutricao />}>
              <Route path="dieta" element={<PaginaAvaliarDieta />} />
              <Route path="avaliacoes" element={<PaginaAvaliacoes />} />
              <Route path="avaliacoes/:id" element={<PaginaAvaliacao />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ProvedorNotificacoes>
    </QueryClientProvider>,
  );
}
const preencher = (rotulo: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

async function simular(perfilId: string, quantidade = '20') {
  preencher(/^Peso corporal médio/, '400');
  preencher(/^Ganho médio diário/, '1');
  await waitFor(() =>
    expect(
      within(screen.getByLabelText(/^Alimento 1: perfil/)).queryByRole('option', {
        name: /Perfil/,
      }),
    ).not.toBeNull(),
  );
  preencher(/^Alimento 1: perfil/, perfilId);
  preencher(/^Quantidade \(kg\/dia\)/, quantidade);
  fireEvent.click(screen.getByRole('button', { name: /Avaliar \(simular, sem gravar\)/ }));
  await screen.findByTestId('resultado-avaliacao');
}
async function gravarPelaTela(rotulo = 'Dieta FICTÍCIA') {
  fireEvent.click(screen.getByRole('button', { name: /Gravar avaliação/ }));
  const modal = await screen.findByRole('dialog', { hidden: true });
  fireEvent.change(within(modal).getByLabelText(/^Nome da avaliação/), {
    target: { value: rotulo },
  });
  fireEvent.change(within(modal).getByLabelText(/^Nome de quem grava/), {
    target: { value: 'Pessoa usuária' },
  });
  fireEvent.click(within(modal).getByRole('button', { name: 'Gravar', hidden: true }));
}
const contarGravadas = async () => (await amb.ok('nutricao:listarAvaliacoes', {})).length;

describe('6B-5: seleção de perfis e simulação', () => {
  it('só perfis elegíveis no seletor; inelegível explicado com o motivo', async () => {
    await aprovar();
    const x = await alimentoComPerfil('Volumoso FICTÍCIO X');
    const nova = await amb.ok('composicao:novaVersao', { id: x.registroId, motivo: 'Correção' });
    await amb.ok('composicao:transcrever', { id: nova.registro.id, responsavel: 'Pessoa A' });
    await amb.ok('composicao:conferir', { id: nova.registro.id, responsavel: 'Pessoa B' });
    const y = await alimentoComPerfil('Volumoso FICTÍCIO Y');
    montar();
    const seletor = screen.getByLabelText(/^Alimento 1: perfil/);
    await waitFor(() =>
      expect(
        within(seletor)
          .getAllByRole('option')
          .map((o) => (o as HTMLOptionElement).value),
      ).toEqual(['', y.perfilId]),
    );
    fireEvent.click(screen.getByRole('button', { name: /Por que 1 perfil\(is\) não aparece/ }));
    expect(screen.getByTestId('perfis-inelegiveis').textContent).toMatch(
      /Volumoso FICTÍCIO X.*substituído/,
    );
  });

  it('simula sem gravar: situação, hipóteses, balanço, oferta e perfis, com o hash do retrato', async () => {
    await aprovar();
    const x = await alimentoComPerfil('Volumoso FICTÍCIO S');
    montar();
    await simular(x.perfilId);
    expect(screen.getByTestId('situacao-avaliacao').textContent).toMatch(/Parcial.*Pode ser usada/);
    expect(screen.getByTestId('hipoteses').textContent).toMatch(/simulação, não consumo medido/);
    expect(
      within(screen.getByTestId('balanco-PB')).getByText(/Cobertura teórica|Déficit estimado/),
    ).toBeTruthy();
    expect(within(screen.getByTestId('balanco-Mg')).getByText('Indeterminado')).toBeTruthy();
    expect(screen.getByTestId('materia-seca-total').textContent).toMatch(/10 kg MS\/dia/);
    expect(screen.getAllByText(/não é adequação nutricional completa/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('versoes-avaliacao').textContent).toMatch(/SHA-256: [0-9a-f]{64}/);
    fireEvent.click(
      within(screen.getByTestId('balanco-PB')).getByRole('button', { name: 'Por quê?' }),
    );
    expect(screen.getByTestId('detalhe-balanco').textContent).toMatch(/Volumoso FICTÍCIO S/);
    expect(await contarGravadas()).toBe(0);
  });

  it('oferta, consumo observado e consumo assumido distintos; sobras só no observado', async () => {
    await aprovar();
    const x = await alimentoComPerfil('Volumoso FICTÍCIO T');
    montar();
    expect(screen.queryByLabelText(/^Sobras medidas/)).toBeNull();
    preencher(/^O que a quantidade representa/, 'consumo_observado');
    expect(screen.getByLabelText(/^Sobras medidas/)).toBeTruthy();
    preencher(/^O que a quantidade representa/, 'oferecido');
    expect(screen.queryByLabelText(/^Sobras medidas/)).toBeNull();
    expect(screen.getByText(/não é o que o animal comeu/)).toBeTruthy();
    await simular(x.perfilId);
    expect(screen.getByTestId('hipoteses').textContent).toMatch(
      /não consumo: o balanço não conclui/,
    );
    expect(within(screen.getByTestId('balanco-PB')).getByText('Indeterminado')).toBeTruthy();
  });
});

describe('6B-5: gravação, recálculo divergente, histórico e anulação', () => {
  it('grava pela tela e abre o retrato gravado; aparece no histórico', async () => {
    await aprovar();
    const x = await alimentoComPerfil('Volumoso FICTÍCIO G');
    montar();
    await simular(x.perfilId);
    await gravarPelaTela('Dieta FICTÍCIA G');
    await screen.findByRole('heading', { name: 'Dieta FICTÍCIA G' });
    const lista = await amb.ok('nutricao:listarAvaliacoes', {});
    expect(lista).toHaveLength(1);
    const g = await amb.ok('nutricao:obterAvaliacao', { id: lista[0]!.id });
    expect(screen.getByTestId('hash-avaliacao').textContent).toContain(g.conteudoSha256);
    expect(screen.getByTestId('hash-avaliacao').textContent).toMatch(/conferido/);
    // Aba da seção (o "voltar" do cabeçalho leva ao mesmo lugar).
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Seções da nutrição' })).getByRole('link', {
        name: 'Avaliações gravadas',
      }),
    );
    const linha = await screen.findByTestId(`avaliacao-${g.id}`);
    expect(linha.textContent).toMatch(/Dieta FICTÍCIA G.*Parcial.*Pode ser usada/);
  });

  it('dados mudam entre simular e gravar: recusa, nada gravado, exige nova avaliação', async () => {
    await aprovar();
    const x = await alimentoComPerfil('Volumoso FICTÍCIO D');
    montar();
    await simular(x.perfilId);
    // Mudança fora da tela depois da simulação: versão nova do registro em conferência.
    await amb.ok('composicao:novaVersao', { id: x.registroId, motivo: 'Revisão FICTÍCIA' });
    await gravarPelaTela();
    await screen.findByText('Avalie de novo antes de gravar');
    expect(
      (screen.getByRole('button', { name: /Gravar avaliação/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(await contarGravadas()).toBe(0);
    // Nova avaliação libera a gravação, com o retrato novo.
    fireEvent.click(screen.getByRole('button', { name: /Avaliar \(simular, sem gravar\)/ }));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /Gravar avaliação/ }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    await gravarPelaTela('Depois da revisão');
    await screen.findByRole('heading', { name: 'Depois da revisão' });
    expect(await contarGravadas()).toBe(1);
  });

  it('anula com motivo: identificada como anulada, retrato e hash intactos; sobrevive ao reinício', async () => {
    await aprovar();
    const x = await alimentoComPerfil('Volumoso FICTÍCIO N');
    const e = {
      animal: {
        grupo: 'zebuino' as const,
        sexo: 'macho_nao_castrado' as const,
        sistema: 'confinamento' as const,
        pcKg: 400,
        gmdKgDia: 1,
      },
      cmsPrevisto: { fonte: 'confinamento' as const },
      dieta: {
        tipo: 'consumo_assumido_sem_sobras' as const,
        itens: [
          { perfilId: x.perfilId, quantidadeKgDia: 20, base: 'mn' as const, sobrasKgDia: null },
        ],
      },
    };
    const c = await amb.ok('nutricao:avaliarDieta', e);
    const g = await amb.ok('nutricao:registrarAvaliacao', {
      entrada: e,
      conteudoSha256Exibido: c.conteudoSha256!,
      rotulo: 'Para anular',
      observacao: null,
      responsavel: 'Pessoa usuária',
    });
    await amb.reiniciar();
    montar(`/nutricao/avaliacoes/${g.id}`);
    await screen.findByRole('heading', { name: 'Para anular' });
    fireEvent.click(screen.getByRole('button', { name: 'Anular' }));
    const modal = await screen.findByRole('dialog', { hidden: true });
    fireEvent.change(within(modal).getByLabelText(/^Motivo da anulação/), {
      target: { value: 'Quantidade errada.' },
    });
    fireEvent.change(within(modal).getByLabelText(/^Nome de quem anula/), {
      target: { value: 'Pessoa usuária' },
    });
    fireEvent.click(within(modal).getByRole('button', { name: 'Anular', hidden: true }));
    await screen.findByText('Avaliação anulada');
    // Motivo no aviso de anulação e na lista de bloqueios do uso operacional.
    expect(screen.getAllByText(/Quantidade errada\./).length).toBe(2);
    expect(screen.queryByRole('button', { name: 'Anular' })).toBeNull();
    expect(screen.getByTestId('hash-avaliacao').textContent).toContain(g.conteudoSha256);
    const lida = await amb.ok('nutricao:obterAvaliacao', { id: g.id });
    expect(lida.avaliacao).toEqual(g.avaliacao);
    expect(lida.anulacao?.motivo).toBe('Quantidade errada.');
  });

  it('integridade divergente: consultável, identificada e sem uso operacional', async () => {
    await aprovar();
    const x = await alimentoComPerfil('Volumoso FICTÍCIO V');
    const e = {
      animal: {
        grupo: 'zebuino' as const,
        sexo: 'macho_nao_castrado' as const,
        sistema: 'confinamento' as const,
        pcKg: 400,
        gmdKgDia: 1,
      },
      cmsPrevisto: { fonte: 'confinamento' as const },
      dieta: {
        tipo: 'consumo_assumido_sem_sobras' as const,
        itens: [
          { perfilId: x.perfilId, quantidadeKgDia: 20, base: 'mn' as const, sobrasKgDia: null },
        ],
      },
    };
    const c = await amb.ok('nutricao:avaliarDieta', e);
    const g = await amb.ok('nutricao:registrarAvaliacao', {
      entrada: e,
      conteudoSha256Exibido: c.conteudoSha256!,
      rotulo: 'Alterada por fora',
      observacao: null,
      responsavel: 'Pessoa usuária',
    });
    const db = amb.gerenciador.conexao;
    db.exec('DROP TRIGGER tg_avaliacao_nutricional_imutavel');
    db.prepare("UPDATE avaliacao_nutricional SET observacao = 'mexida' WHERE id = ?").run(g.id);
    db.prepare(
      "UPDATE avaliacao_nutricional SET resultado_json = json_set(resultado_json, '$.balanco.avisos', json('[]')) WHERE id = ?",
    ).run(g.id);
    montar('/nutricao/avaliacoes');
    const linha = await screen.findByTestId(`avaliacao-${g.id}`);
    expect(linha.textContent).toMatch(/Integridade divergente.*Sem uso operacional/);
    fireEvent.click(within(linha).getByRole('link', { name: 'Alterada por fora' }));
    await screen.findByText('Integridade divergente: só para investigação');
    expect(screen.getByTestId('hash-avaliacao').textContent).toMatch(/divergente/);
  });
});
