import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TIPOS_QUANTIDADE, VERSAO_MOTOR } from '@pecuaria/nutrition-engine';
import {
  TIPOS_QUANTIDADE_DIETA,
  type EntradaAvaliacaoDieta,
  type Nutriente,
  type PerfilDetalhe,
} from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import { dadosAlimento, dadosFonte } from '../alimentos/apoio-teste-alimentos';
import type { ServicoAlimentos } from '../alimentos/servico-alimentos';
import type { ServicoComposicao } from '../alimentos/servico-composicao';
import type { ServicoSelecao } from '../alimentos/servico-selecao';
import { ServicoAvaliacaoDieta } from './servico-avaliacao-dieta';
import { ServicoExigencias } from './servico-exigencias';
import { hashDoRetrato, jsonFiel } from './retrato-avaliacao';

/*
 * 6B-3: avaliação de dieta com perfis gravados. Alimentos, fontes e números FICTÍCIOS
 * (CLAUDE.md, regra 1), num banco de teste: só para provar elegibilidade, rastreio e a ligação
 * com o motor. Nenhuma composição real; nada no banco operacional.
 */
let amb: AmbienteIpc;
let nut: Record<string, Nutriente>;
beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 26, 10) });
  nut = Object.fromEntries(
    (await amb.ok('nutriente:listar', {})).map((n) => [n.codigo, n] as const),
  );
});
afterEach(() => amb.encerrar());

interface ValorTeste {
  codigo: string;
  texto: string;
  base?: 'ms' | 'mn';
  tipo?: 'media' | 'valor_unico' | 'minimo_garantido' | 'maximo_garantido';
  interpretacao?: string | null;
}

/** Registro FICTÍCIO com os valores pedidos; conferido por padrão. */
async function registro(
  alimentoId: string,
  valores: ValorTeste[],
  opcoes: { conferir?: boolean; origem?: 'estudo_individual' | 'rotulo_comercial' } = {},
) {
  const rotulo = opcoes.origem === 'rotulo_comercial';
  const fonte = await amb.ok('fonte:criar', {
    dados: dadosFonte({
      codigo: `FICT_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      titulo: 'Fonte FICTÍCIA de teste',
      ...(rotulo
        ? { origem: 'rotulo_comercial', fabricante: 'Fabricante FICTÍCIO', autores: null }
        : {}),
    }),
  });
  const r = await amb.ok('composicao:criar', {
    dados: {
      alimentoId,
      fonteId: fonte.id,
      referenciaLocal: 'Tabela FICTÍCIA 1',
      idadeCorteDias: rotulo ? null : 60,
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
  for (const v of valores)
    await amb.ok('composicao:salvarValor', {
      registroId: r.registro.id,
      valorId: null,
      dados: {
        nutrienteId: nut[v.codigo]!.id,
        valorPublicado: v.texto,
        unidade: 'pct',
        base: v.base ?? (v.codigo === 'MS' ? 'mn' : 'ms'),
        tipoValor: v.tipo ?? 'media',
        desvioPadraoPublicado: null,
        minimoPublicado: null,
        maximoPublicado: null,
        nObservacoes: null,
        metodoAnaliticoFonte: null,
        formaObtencao: 'medido',
        descricaoObtencao: null,
        interpretacaoBase: v.interpretacao ?? null,
        referenciaLocal: null,
        observacao: null,
      },
    });
  await amb.ok('composicao:transcrever', { id: r.registro.id, responsavel: 'Pessoa A' });
  if (opcoes.conferir !== false)
    await amb.ok('composicao:conferir', { id: r.registro.id, responsavel: 'Pessoa B' });
  return r.registro.id;
}

async function alimento(
  nome: string,
  classe: 'volumoso' | 'concentrado_energetico' | 'suplemento_mineral' = 'volumoso',
) {
  return amb.ok('alimento:criar', {
    dados: dadosAlimento({
      nome,
      especie: 'Especie FICTÍCIA',
      cultivar: null,
      formaConservacao: 'fresco',
      classe,
    }),
  });
}
const aprovar = () =>
  amb.ok('selecao:aprovarRegra', {
    codigo: 'SELECAO_5D',
    versao: 2,
    responsavel: 'Pessoa usuária',
    observacao: null,
  });
const perfil = (alimentoId: string, registroId: string, idade: number | null = 60) =>
  amb.ok('perfil:gravar', {
    alimentoId,
    idadeCorteDias: idade,
    escolhas: [],
    tipo: 'referencia_individual',
    registroId,
    nutrienteId: null,
    sentido: null,
    nome: 'Perfil FICTÍCIO',
    responsavel: 'Pessoa usuária',
  });

const COMPLETO: ValorTeste[] = [
  { codigo: 'MS', texto: '50,0' },
  { codigo: 'NDT', texto: '70,0' },
  { codigo: 'PB', texto: '12,0' },
  { codigo: 'Ca', texto: '0,50' },
  { codigo: 'P', texto: '0,30' },
];
const entrada = (
  itens: EntradaAvaliacaoDieta['dieta']['itens'],
  tipo: EntradaAvaliacaoDieta['dieta']['tipo'] = 'consumo_assumido_sem_sobras',
): EntradaAvaliacaoDieta => ({
  animal: {
    grupo: 'zebuino',
    sexo: 'macho_nao_castrado',
    sistema: 'confinamento',
    pcKg: 400,
    gmdKgDia: 1,
  },
  cmsPrevisto: { fonte: 'confinamento' },
  dieta: { tipo, itens },
});
const item = (perfilId: string, kg = 20) => ({
  perfilId,
  quantidadeKgDia: kg,
  base: 'mn' as const,
  sobrasKgDia: null,
});

describe('6B-3: avaliação com perfil elegível', () => {
  it('perfil conferido com regra vigente aprovada: oferta completa, exigência com a MS consumida e CMS previsto à parte', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO A');
    const r = await registro(a.id, COMPLETO);
    const p = await perfil(a.id, r);
    const av = await amb.ok('nutricao:avaliarDieta', entrada([item(p.perfil.id)]));
    expect(av.perfis[0]).toMatchObject({
      elegivel: true,
      motivosInelegibilidade: [],
      regra: { codigo: 'SELECAO_5D', versao: 2, vigente: true },
      fontes: [
        { registroId: r, fonteTitulo: 'Fonte FICTÍCIA de teste', statusRegistro: 'conferido' },
      ],
    });
    expect(av.oferta.materiaSeca.totalKgMsDia).toBeCloseTo(10, 12);
    expect(av.oferta.nutrientes.find((n) => n.nutriente === 'PB')).toMatchObject({
      situacao: 'completa',
    });
    // Exigência com CMS = 10 kg/dia de MS consumida; CMS previsto (Eq. 2.1) separado.
    expect(av.exigencias.cmsUsado).toEqual({ origem: 'informado', equacaoId: 'CMS-INFORMADO' });
    expect(av.exigencias.grupos.cms[0]!.valor).toBe(10);
    expect(av.cmsPrevisto).toMatchObject({ equacaoId: 'BRC23-C-01-03' });
    expect(av.balanco.cmsExigenciaKgDia).toBe(10);
    expect(av.balanco.comparacoes.find((c) => c.nutriente === 'PB')!.situacao).not.toBe(
      'indeterminado',
    );
    expect(av.balanco.avisos[0]).toMatch(/não é adequação nutricional completa/);
    expect(av.oferta.perfis[0]).toMatchObject({
      perfilId: p.perfil.id,
      regra: { codigo: 'SELECAO_5D', versao: 2 },
    });
  });

  it('nada é gravado nem importado: tabelas de perfil e de composição iguais antes e depois', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO B');
    const p = await perfil(a.id, await registro(a.id, COMPLETO));
    const contar = () =>
      [
        'perfil_composicao',
        'perfil_valor',
        'registro_composicao',
        'valor_nutricional',
        'historico_alteracao',
      ].map(
        (t) =>
          (amb.gerenciador.conexao.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number })
            .n,
      );
    const antes = contar();
    await amb.ok('nutricao:avaliarDieta', entrada([item(p.perfil.id)]));
    expect(contar()).toEqual(antes);
  });

  it('listas de tipos de quantidade iguais às do motor', () => {
    expect([...TIPOS_QUANTIDADE_DIETA]).toEqual([...TIPOS_QUANTIDADE]);
  });
});

describe('6B-3: atualização e substituição de perfis e registros', () => {
  it('registro de origem substituído por versão nova conferida: perfil antigo inelegível, sem uso automático da versão nova', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO C');
    const r = await registro(a.id, COMPLETO);
    const p = await perfil(a.id, r);
    const nova = await amb.ok('composicao:novaVersao', { id: r, motivo: 'Correção FICTÍCIA' });
    await amb.ok('composicao:transcrever', { id: nova.registro.id, responsavel: 'Pessoa A' });
    await amb.ok('composicao:conferir', { id: nova.registro.id, responsavel: 'Pessoa B' });
    const av = await amb.ok('nutricao:avaliarDieta', entrada([item(p.perfil.id)]));
    expect(av.perfis[0]!.elegivel).toBe(false);
    expect(av.perfis[0]!.motivosInelegibilidade.join(' ')).toMatch(
      /substituído por versão nova: o perfil está desatualizado/,
    );
    expect(av.oferta.materiaSeca.totalKgMsDia).toBeNull();
    expect(av.oferta.nutrientes.every((n) => n.situacao === 'indeterminada')).toBe(true);
    // Perfil novo, gravado da versão nova, volta a ser elegível.
    const p2 = await perfil(a.id, nova.registro.id);
    expect(
      (await amb.ok('nutricao:avaliarDieta', entrada([item(p2.perfil.id)]))).perfis[0]!.elegivel,
    ).toBe(true);
  });

  it('versão nova ainda em conferência: perfil segue elegível, com aviso', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO D');
    const r = await registro(a.id, COMPLETO);
    const p = await perfil(a.id, r);
    await amb.ok('composicao:novaVersao', { id: r, motivo: 'Revisão FICTÍCIA' });
    const av = await amb.ok('nutricao:avaliarDieta', entrada([item(p.perfil.id)]));
    expect(av.perfis[0]).toMatchObject({ elegivel: true });
    expect(av.perfis[0]!.avisos.join(' ')).toMatch(/tem versão nova em conferência/);
  });
});

describe('6B-3: fontes incompletas, cautela, base e garantias', () => {
  it('fonte sem NDT, Ca e P: esses nutrientes indeterminados, nunca zero; PB completa', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO E');
    const p = await perfil(
      a.id,
      await registro(a.id, [
        { codigo: 'MS', texto: '50,0' },
        { codigo: 'PB', texto: '12,0' },
      ]),
    );
    const av = await amb.ok('nutricao:avaliarDieta', entrada([item(p.perfil.id)]));
    const sit = Object.fromEntries(av.oferta.nutrientes.map((n) => [n.nutriente, n.situacao]));
    expect(sit).toMatchObject({
      PB: 'completa',
      NDT: 'indeterminada',
      Ca: 'indeterminada',
      P: 'indeterminada',
    });
    expect(av.oferta.nutrientes.find((n) => n.nutriente === 'NDT')!.totalGDia).toBeNull();
    expect(av.balanco.comparacoes.find((c) => c.nutriente === 'NDT')!.situacao).toBe(
      'indeterminado',
    );
  });

  it('dois alimentos, um sem PB: oferta parcial e balanço sem conclusão, com o piso à parte', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO F');
    const b = await alimento('Alimento FICTÍCIO G', 'concentrado_energetico');
    const pa = await perfil(a.id, await registro(a.id, COMPLETO));
    const pb = await perfil(
      b.id,
      await registro(b.id, [
        { codigo: 'MS', texto: '90,0' },
        { codigo: 'NDT', texto: '80,0' },
      ]),
    );
    const av = await amb.ok(
      'nutricao:avaliarDieta',
      entrada([item(pa.perfil.id), item(pb.perfil.id, 2)]),
    );
    const c = av.balanco.comparacoes.find((x) => x.nutriente === 'PB')!;
    expect(c).toMatchObject({
      situacao: 'indeterminado',
      oferta: { situacao: 'parcial', gDia: null },
    });
    expect(c.pisoConhecidoGDia).toBeCloseTo(1200, 9);
  });

  it('"uso com cautela" não bloqueia: vira aviso do perfil e do alimento', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO H');
    const r = await registro(a.id, COMPLETO);
    const p = await perfil(a.id, r);
    await amb.ok('avaliacao:marcar', {
      registroId: r,
      valorId: null,
      tipo: 'uso_com_cautela',
      motivo: 'Motivo FICTÍCIO',
      responsavel: 'Pessoa usuária',
    });
    const av = await amb.ok('nutricao:avaliarDieta', entrada([item(p.perfil.id)]));
    expect(av.perfis[0]).toMatchObject({ elegivel: true });
    expect(av.perfis[0]!.avisos).toContain('Uso com cautela: Motivo FICTÍCIO');
    expect(av.oferta.itens[0]!.avisos).toContain('Uso com cautela: Motivo FICTÍCIO');
  });

  it('base interpretada: sem validação o valor fica desconhecido; validada, entra', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO I');
    const r = await registro(a.id, [
      { codigo: 'MS', texto: '50,0' },
      { codigo: 'PB', texto: '12,0', interpretacao: 'Base inferida FICTÍCIA' },
    ]);
    const p = await perfil(a.id, r);
    const pbDe = async () =>
      (await amb.ok('nutricao:avaliarDieta', entrada([item(p.perfil.id)]))).oferta.nutrientes.find(
        (n) => n.nutriente === 'PB',
      )!;
    expect((await pbDe()).contribuicoes[0]!.motivo).toMatch(/não validada \(C7\)/);
    const valorPb = (await amb.ok('composicao:obter', { id: r })).valores.find(
      (v) => v.nutriente.codigo === 'PB',
    )!;
    await amb.ok('avaliacao:marcar', {
      registroId: r,
      valorId: valorPb.id,
      tipo: 'base_validada',
      motivo: 'Validação FICTÍCIA',
      responsavel: 'Pessoa usuária',
    });
    expect((await pbDe()).situacao).toBe('completa');
  });

  it('rótulo com garantia mínima em base MN: limite inferior; MS garantida não converte', async () => {
    await aprovar();
    const a = await alimento('Produto FICTÍCIO', 'suplemento_mineral');
    const r = await registro(
      a.id,
      [
        { codigo: 'MS', texto: '88,0', base: 'mn', tipo: 'minimo_garantido' },
        { codigo: 'Ca', texto: '10,0', base: 'mn', tipo: 'minimo_garantido' },
      ],
      { origem: 'rotulo_comercial' },
    );
    const p = await perfil(a.id, r, null);
    const av = await amb.ok('nutricao:avaliarDieta', entrada([item(p.perfil.id, 0.1)]));
    const ca = av.oferta.nutrientes.find((n) => n.nutriente === 'Ca')!;
    expect(ca.situacao).toBe('limite_inferior');
    expect(ca.totalGDia).toBeCloseTo(10, 9);
    expect(av.oferta.itens[0]!.motivos[0]).toMatch(/garantia de rótulo \(limite\), não teor/);
  });
});

describe('6B-3: regra de seleção e NNP (serviço com perfis montados no teste)', () => {
  /** Perfil FICTÍCIO montado direto, sem banco: só para casos que a API não permite criar. */
  function servicoCom(p: PerfilDetalhe, aprovada: boolean) {
    const regra = (versao: number) => ({
      regra: { codigo: 'SELECAO_5D', versao } as never,
      hash: 'x'.repeat(64),
      aprovacao: aprovada
        ? { aprovadoPor: 'Pessoa', aprovadoEm: '2026-10-22T10:00:00.000Z', observacao: null }
        : null,
    });
    const selecao = {
      obterPerfil: () => p,
      regras: () => [regra(1), regra(2)],
    } as unknown as ServicoSelecao;
    const composicao = {
      obter: (id: string) => ({
        registro: {
          id,
          status: 'conferido',
          descartadoEm: null,
          sucessorId: null,
          referenciaLocal: null,
        },
        fonte: { titulo: 'Fonte FICTÍCIA', codigo: null },
        avaliacoes: [],
      }),
    } as unknown as ServicoComposicao;
    const alimentos = { listarNutrientes: () => [] } as unknown as ServicoAlimentos;
    return new ServicoAvaliacaoDieta(selecao, composicao, alimentos, new ServicoExigencias());
  }
  const perfilFicticio = (versao: number, pb: number): PerfilDetalhe => ({
    perfil: {
      id: '01a13f6e-0000-7000-8000-000000000001',
      alimentoId: '01a13f6e-0000-7000-8000-000000000002',
      alimentoNome: 'Alimento FICTÍCIO',
      nome: 'Perfil FICTÍCIO',
      tipo: 'referencia_individual',
      cenario: 'unico',
      nivel: 'especifico',
      idadeCorteBuscaDias: null,
      nutrienteReferencia: null,
      regraCodigo: 'SELECAO_5D',
      regraVersao: versao,
      nValores: 2,
      criadoPor: 'Pessoa',
      criadoEm: '2026-10-22T10:00:00.000Z',
    },
    registroBaseId: '01a13f6e-0000-7000-8000-000000000003',
    diferencas: [],
    limitacoes: ['Limitação FICTÍCIA'],
    naoQuantificados: [],
    selecao: {},
    valores: [
      ['MS', 50, 'mn'],
      ['PB', pb, 'ms'],
    ].map(([codigo, valor, base], k) => ({
      id: `01a13f6e-0000-7000-8000-00000000001${k}`,
      nutriente: { id: `n-${codigo}`, codigo: codigo as string, nome: codigo as string },
      valor: valor as number,
      valorPublicado: String(valor),
      unidade: 'pct' as const,
      base: base as 'ms' | 'mn',
      tipoValor: 'media' as const,
      formaObtencao: 'medido' as const,
      metodoAnaliticoFonte: null,
      interpretacaoBase: null,
      nOrigens: 1,
      mediana: null,
      minimo: null,
      maximo: null,
      cobertura: null,
      origens: [
        {
          valorNutricionalId: `v-${k}`,
          registroId: '01a13f6e-0000-7000-8000-000000000003',
          valorUsado: valor as number,
        },
      ],
    })),
  });
  const avaliar = (s: ServicoAvaliacaoDieta) =>
    s.avaliar(entrada([item('01a13f6e-0000-7000-8000-000000000001')]));

  it('perfil gravado com versão histórica da regra (v1): inelegível', () => {
    const av = avaliar(servicoCom(perfilFicticio(1, 12), true));
    expect(av.perfis[0]!.motivosInelegibilidade.join(' ')).toMatch(
      /versão histórica da regra \(v1; vigente v2\)/,
    );
    expect(av.perfis[0]!.regra.vigente).toBe(false);
  });

  it('regra sem aprovação válida (hash diferente): inelegível', () => {
    const av = avaliar(servicoCom(perfilFicticio(2, 12), false));
    expect(av.perfis[0]!.motivosInelegibilidade[0]).toMatch(/sem aprovação válida/);
  });

  it('limitações do perfil viram avisos', () => {
    expect(avaliar(servicoCom(perfilFicticio(2, 12), true)).perfis[0]!.avisos).toContain(
      'Limitação do perfil: Limitação FICTÍCIA',
    );
  });

  it('NNP: sem natureza no metadado (lista de nutrientes vazia), PB acima de 100 % fica desconhecida', () => {
    const av = avaliar(servicoCom(perfilFicticio(2, 260), true));
    const pb = av.oferta.nutrientes.find((n) => n.nutriente === 'PB')!;
    expect(pb.contribuicoes[0]).toMatchObject({ situacao: 'desconhecida', nnpDeclarado: false });
    expect(pb.contribuicoes[0]!.motivo).toMatch(/fora da faixa da unidade/);
    expect(pb.parcelaEquivalenteNnpGDia).toBeNull();
  });
});

describe('migration 0018: PB total e PB equivalente de NNP gravadas (números FICTÍCIOS)', () => {
  it('definições do sistema trazem a natureza; PB 260 só com a parcela de NNP declarada', async () => {
    expect(nut['PB']!.naturezaValor).toBe('equivalente_proteico');
    expect(nut['PBeqNNP']!.naturezaValor).toBe('equivalente_proteico_nnp');
    expect(nut['Ca']!.naturezaValor).toBe('fracao_massica');
    await aprovar();
    const a = await alimento('Fonte de NNP FICTÍCIA', 'suplemento_mineral');
    const r = await registro(a.id, [
      { codigo: 'MS', texto: '100' },
      { codigo: 'PB', texto: '260' },
      { codigo: 'PBeqNNP', texto: '250' },
    ]);
    const p = await perfil(a.id, r, null);
    const av = await amb.ok('nutricao:avaliarDieta', entrada([item(p.perfil.id, 0.1)]));
    const pb = av.oferta.nutrientes.find((n) => n.nutriente === 'PB')!;
    // 0,1 kg de MS × 2.600 g/kg = 260 g de PB total, dos quais 250 g de NNP (contidos, não somados).
    expect(pb.totalGDia).toBeCloseTo(260, 9);
    expect(pb.parcelaEquivalenteNnpGDia).toBeCloseTo(250, 9);
    expect(pb.contribuicoes[0]!.avisos.join(' ')).toMatch(/contida na PB total/);
  });

  it('PB 260 sem parcela de NNP: gravada (natureza permite), mas desconhecida na oferta', async () => {
    await aprovar();
    const a = await alimento('Outra fonte FICTÍCIA', 'suplemento_mineral');
    const r = await registro(a.id, [
      { codigo: 'MS', texto: '100' },
      { codigo: 'PB', texto: '260' },
    ]);
    const p = await perfil(a.id, r, null);
    const av = await amb.ok('nutricao:avaliarDieta', entrada([item(p.perfil.id, 0.1)]));
    expect(av.oferta.nutrientes.find((n) => n.nutriente === 'PB')!.contribuicoes[0]!.motivo).toBe(
      'PB acima de 100 % sem parcela de PB equivalente de NNP declarada no perfil.',
    );
  });
});

describe('6B-3: canal com Zod', () => {
  it('recusa sobras fora do consumo observado, sobras acima do oferecido e CMS previsto informado', async () => {
    const id = '01a13f6e-0000-7000-8000-000000000001';
    const base = entrada([item(id)]);
    expect(
      await amb.chamar('nutricao:avaliarDieta', {
        ...base,
        dieta: { ...base.dieta, itens: [{ ...item(id), sobrasKgDia: 1 }] },
      }),
    ).toMatchObject({ ok: false, erro: { codigo: 'ENTRADA_INVALIDA' } });
    expect(
      await amb.chamar('nutricao:avaliarDieta', {
        ...base,
        dieta: { tipo: 'consumo_observado', itens: [{ ...item(id), sobrasKgDia: 30 }] },
      }),
    ).toMatchObject({ ok: false, erro: { codigo: 'ENTRADA_INVALIDA' } });
    expect(
      await amb.chamar('nutricao:avaliarDieta', {
        ...base,
        cmsPrevisto: { fonte: 'informado', cmsKgDia: 9 },
      }),
    ).toMatchObject({ ok: false, erro: { codigo: 'ENTRADA_INVALIDA' } });
  });

  it('perfil inexistente: erro de não encontrado, sem cálculo parcial silencioso', async () => {
    expect(
      await amb.chamar(
        'nutricao:avaliarDieta',
        entrada([item('01a13f6e-0000-7000-8000-0000000000ff')]),
      ),
    ).toMatchObject({
      ok: false,
      erro: { codigo: 'NAO_ENCONTRADO' },
    });
  });
});

// ---------------------------------------------------------------------------
// 6B-4: avaliação nutricional imutável (migration 0019). Números FICTÍCIOS.
// ---------------------------------------------------------------------------

const contarAvaliacoes = () =>
  ['avaliacao_nutricional', 'avaliacao_nutricional_perfil'].map(
    (t) =>
      (amb.gerenciador.conexao.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n,
  );
/** Como a tela: simula, mostra e grava devolvendo o hash do retrato exibido (D-6B4-02). */
const gravar = async (e: EntradaAvaliacaoDieta, rotulo = 'Avaliação FICTÍCIA') => {
  const exibida = await amb.ok('nutricao:avaliarDieta', e);
  return amb.ok('nutricao:registrarAvaliacao', {
    entrada: e,
    conteudoSha256Exibido: exibida.conteudoSha256!,
    rotulo,
    observacao: null,
    responsavel: 'Pessoa usuária',
  });
};
const H = 'c'.repeat(64);

describe('6B-4: gravação da avaliação', () => {
  it('grava o retrato completo, igual ao calculado: entrada, hipóteses, valores usados, fontes, versões e resultados', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO G1');
    const r = await registro(a.id, COMPLETO);
    const p = await perfil(a.id, r);
    const e = entrada([item(p.perfil.id)]);
    const calculada = await amb.ok('nutricao:avaliarDieta', e);
    const g = await gravar(e);
    expect(g).toMatchObject({
      rotulo: 'Avaliação FICTÍCIA',
      registradoPor: 'Pessoa usuária',
      formatoVersao: 2,
      integridade: 'conferida',
    });
    expect(g.conteudoSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(g.avaliacao).toEqual(calculada);
    // Valores efetivamente usados, como gravados no perfil (com natureza e origem).
    expect(g.avaliacao.perfis[0]!.valores.find((v) => v.nutriente === 'PB')).toMatchObject({
      valor: 12,
      valorPublicado: '12,0',
      unidade: 'pct',
      base: 'ms',
      naturezaValor: 'equivalente_proteico',
      origens: [r],
    });
    expect(g.avaliacao.hipoteses).toMatchObject({
      tipoQuantidade: 'consumo_assumido_sem_sobras',
      cmsExigencia: { origem: 'ms_consumida', cms: { fonte: 'informado', cmsKgDia: 10 } },
      gmd: 'desejado',
    });
    expect(g.avaliacao.hipoteses.textos[0]).toMatch(/simulação, não consumo medido/);
    expect(g.avaliacao.versaoMotor).toBe(VERSAO_MOTOR);
    expect(g.avaliacao.exigencias.grupos.cms[0]!.aprovacao).toBeNull();
    expect(g.avaliacao.cmsPrevisto.aprovacao).not.toBeNull();
    expect(contarAvaliacoes()).toEqual([1, 1]);
    // Trilha na mesma transação, com o resumo (o retrato não é duplicado).
    const h = amb.gerenciador.conexao
      .prepare(
        "SELECT acao, dados_novos_json FROM historico_alteracao WHERE entidade = 'avaliacao_nutricional'",
      )
      .all() as { acao: string; dados_novos_json: string }[];
    expect(h).toHaveLength(1);
    expect(h[0]!.acao).toBe('criacao');
    expect(JSON.parse(h[0]!.dados_novos_json)).toEqual({
      rotulo: 'Avaliação FICTÍCIA',
      versaoMotor: VERSAO_MOTOR,
      tipoQuantidade: 'consumo_assumido_sem_sobras',
      perfis: [p.perfil.id],
      conteudoSha256: g.conteudoSha256,
    });
  });

  it('dieta só oferecida: hipótese do CMS previsto gravada', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO G2');
    const p = await perfil(a.id, await registro(a.id, COMPLETO));
    const g = await gravar(entrada([item(p.perfil.id)], 'oferecido'));
    expect(g.avaliacao.hipoteses.cmsExigencia).toEqual({
      origem: 'cms_previsto',
      cms: { fonte: 'confinamento' },
    });
    expect(g.avaliacao.hipoteses.textos[1]).toMatch(/CMS previsto \(equação de confinamento\)/);
  });

  it('perfil inelegível também fica gravado como foi avaliado, com o motivo', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO G3');
    const r = await registro(a.id, COMPLETO);
    const p = await perfil(a.id, r);
    const nova = await amb.ok('composicao:novaVersao', { id: r, motivo: 'Correção FICTÍCIA' });
    await amb.ok('composicao:transcrever', { id: nova.registro.id, responsavel: 'Pessoa A' });
    await amb.ok('composicao:conferir', { id: nova.registro.id, responsavel: 'Pessoa B' });
    const g = await gravar(entrada([item(p.perfil.id)]));
    expect(g.avaliacao.perfis[0]).toMatchObject({ elegivel: false });
    expect(g.avaliacao.perfis[0]!.motivosInelegibilidade.join(' ')).toMatch(/substituído/);
    expect((await amb.ok('nutricao:listarAvaliacoes', {}))[0]!.perfis[0]!.elegivel).toBe(false);
  });
});

describe('6B-4: imutável mesmo depois de mudanças nos perfis e registros', () => {
  it('registro substituído, perfil novo e reinício do app: a avaliação gravada não muda', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO I1');
    const r = await registro(a.id, COMPLETO);
    const p = await perfil(a.id, r);
    const e = entrada([item(p.perfil.id)]);
    const g = await gravar(e);
    // Depois: versão nova do registro, com outra PB, conferida, e perfil novo.
    const nova = await amb.ok('composicao:novaVersao', { id: r, motivo: 'Correção FICTÍCIA' });
    await amb.ok('composicao:salvarValor', {
      registroId: nova.registro.id,
      valorId: nova.valores.find((v) => v.nutriente.codigo === 'PB')!.id,
      dados: {
        nutrienteId: nut['PB']!.id,
        valorPublicado: '15,0',
        unidade: 'pct',
        base: 'ms',
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
    await amb.ok('composicao:transcrever', { id: nova.registro.id, responsavel: 'Pessoa A' });
    await amb.ok('composicao:conferir', { id: nova.registro.id, responsavel: 'Pessoa B' });
    await perfil(a.id, nova.registro.id);
    // Recalcular agora dá outro resultado (perfil antigo inelegível)...
    expect((await amb.ok('nutricao:avaliarDieta', e)).perfis[0]!.elegivel).toBe(false);
    // ...mas a avaliação gravada continua como foi calculada, também depois de reiniciar.
    await amb.reiniciar();
    const lida = await amb.ok('nutricao:obterAvaliacao', { id: g.id });
    expect(lida).toEqual(g);
    expect(lida.integridade).toBe('conferida');
    expect(lida.avaliacao.perfis[0]).toMatchObject({ elegivel: true });
    expect(lida.avaliacao.perfis[0]!.fontes[0]).toMatchObject({ statusRegistro: 'conferido' });
    expect(
      lida.avaliacao.perfis[0]!.valores.find((v) => v.nutriente === 'PB')!.valorPublicado,
    ).toBe('12,0');
  });

  it('conteúdo alterado por fora do aplicativo: integridade divergente', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO I2');
    const p = await perfil(a.id, await registro(a.id, COMPLETO));
    const g = await gravar(entrada([item(p.perfil.id)]));
    const c = amb.gerenciador.conexao;
    // Simula edição direta do arquivo: só possível removendo o gatilho, fora do aplicativo.
    c.exec('DROP TRIGGER tg_avaliacao_nutricional_imutavel');
    c.prepare(
      "UPDATE avaliacao_nutricional SET resultado_json = json_set(resultado_json, '$.balanco.avisos', json('[]')) WHERE id = ?",
    ).run(g.id);
    expect((await amb.ok('nutricao:obterAvaliacao', { id: g.id })).integridade).toBe('divergente');
  });
});

describe('6B-4: listagem, canal com Zod e falhas', () => {
  it('lista as mais recentes primeiro, com os nomes como estavam ao gravar', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO L1');
    const p = await perfil(a.id, await registro(a.id, COMPLETO));
    const g1 = await gravar(entrada([item(p.perfil.id)]), 'Primeira');
    amb.definirHoje(new Date(2026, 9, 27, 10));
    const g2 = await gravar(entrada([item(p.perfil.id, 10)]), 'Segunda');
    const lista = await amb.ok('nutricao:listarAvaliacoes', {});
    expect(lista.map((l) => l.id)).toEqual([g2.id, g1.id]);
    expect(lista[0]).toMatchObject({
      rotulo: 'Segunda',
      tipoQuantidade: 'consumo_assumido_sem_sobras',
      versaoMotor: VERSAO_MOTOR,
      perfis: [
        {
          perfilId: p.perfil.id,
          nome: 'Perfil FICTÍCIO',
          alimentoNome: 'Alimento FICTÍCIO L1',
          elegivel: true,
        },
      ],
    });
  });

  it('Zod: recusa nome vazio, resultado vindo do renderer e entrada inválida; nada gravado', async () => {
    const e = entrada([item('01a13f6e-0000-7000-8000-000000000001')]);
    const base = {
      entrada: e,
      conteudoSha256Exibido: H,
      rotulo: 'X',
      observacao: null,
      responsavel: 'Pessoa usuária',
    };
    for (const d of [
      { ...base, conteudoSha256Exibido: undefined },
      { ...base, conteudoSha256Exibido: 'C'.repeat(64) },
      { ...base, rotulo: '   ' },
      { ...base, responsavel: '' },
      { ...base, resultado: {} },
      { ...base, entrada: { ...e, cmsPrevisto: { fonte: 'informado', cmsKgDia: 9 } } },
    ])
      expect(
        await amb.chamar('nutricao:registrarAvaliacao', d as never),
        JSON.stringify(Object.keys(d)),
      ).toMatchObject({ ok: false, erro: { codigo: 'ENTRADA_INVALIDA' } });
    expect(contarAvaliacoes()).toEqual([0, 0]);
  });

  it('perfil inexistente e avaliação inexistente: não encontrado, nada gravado', async () => {
    expect(
      await amb.chamar('nutricao:registrarAvaliacao', {
        entrada: entrada([item('01a13f6e-0000-7000-8000-0000000000ff')]),
        conteudoSha256Exibido: H,
        rotulo: 'X',
        observacao: null,
        responsavel: 'Pessoa usuária',
      }),
    ).toMatchObject({ ok: false, erro: { codigo: 'NAO_ENCONTRADO' } });
    expect(contarAvaliacoes()).toEqual([0, 0]);
    expect(
      await amb.chamar('nutricao:obterAvaliacao', { id: '01a13f6e-0000-7000-8000-0000000000fe' }),
    ).toMatchObject({ ok: false, erro: { codigo: 'NAO_ENCONTRADO' } });
  });

  it('JSON sem perda: número não finito e indefinido em lista são recusados', () => {
    expect(jsonFiel({ a: 1, b: undefined, c: [null, 'x'] }, 'x')).toBe('{"a":1,"c":[null,"x"]}');
    expect(() => jsonFiel({ a: Infinity }, 'r')).toThrow('r.a: número não finito (Infinity).');
    expect(() => jsonFiel({ a: [1, NaN] }, 'r')).toThrow('r.a[1]: número não finito (NaN).');
    expect(() => jsonFiel([undefined], 'r')).toThrow('r[0]: valor indefinido em lista.');
  });
});

// ---------------------------------------------------------------------------
// Decisões D-6B4-01 a 04 (aprovação de 2026-10-26). Números FICTÍCIOS.
// ---------------------------------------------------------------------------

describe('D-6B4-01: avaliação parcial gravável; perfil inelegível nunca operacional', () => {
  it('fonte sem Mg, Na, K e S: parcial, com os motivos, mas com uso operacional', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO P1');
    const p = await perfil(a.id, await registro(a.id, COMPLETO));
    const g = await gravar(entrada([item(p.perfil.id)]));
    expect(g.avaliacao.situacao).toMatchObject({ parcial: true, usoOperacional: true });
    expect(g.avaliacao.situacao.motivosParcial.join(' ')).toMatch(/Mg: indeterminado/);
    // PDR, PNDR e PM ficam sempre indeterminadas (C5) e não contam como parcial.
    expect(g.avaliacao.situacao.motivosParcial.join(' ')).not.toMatch(/PDR|PNDR|PM:/);
    expect(g).toMatchObject({ usoOperacional: true, bloqueios: [] });
    expect((await amb.ok('nutricao:listarAvaliacoes', {}))[0]).toMatchObject({
      parcial: true,
      usoOperacional: true,
      anulada: false,
      integridade: 'conferida',
    });
  });

  it('perfil inelegível: gravável, sem uso operacional, com motivos e bloqueios preservados', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO P2');
    const r = await registro(a.id, COMPLETO);
    const p = await perfil(a.id, r);
    const nova = await amb.ok('composicao:novaVersao', { id: r, motivo: 'Correção FICTÍCIA' });
    await amb.ok('composicao:transcrever', { id: nova.registro.id, responsavel: 'Pessoa A' });
    await amb.ok('composicao:conferir', { id: nova.registro.id, responsavel: 'Pessoa B' });
    const g = await gravar(entrada([item(p.perfil.id)]));
    expect(g.avaliacao.situacao.usoOperacional).toBe(false);
    expect(g.usoOperacional).toBe(false);
    expect(g.bloqueios[0]).toMatch(
      /Perfil "Perfil FICTÍCIO" \(Alimento FICTÍCIO P2\) inelegível: .*substituído.*Não produz avaliação operacional \(D-6B4-01\)/,
    );
    expect(g.avaliacao.perfis[0]!.motivosInelegibilidade).toHaveLength(1);
  });
});

describe('D-6B4-02: recálculo comparado com o retrato exibido', () => {
  it('dados mudaram entre a simulação e a gravação: recusa, nada gravado; nova avaliação grava', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO R1');
    const r = await registro(a.id, COMPLETO);
    const p = await perfil(a.id, r);
    const e = entrada([item(p.perfil.id)]);
    const exibida = await amb.ok('nutricao:avaliarDieta', e);
    // Depois de exibir: versão nova do registro em conferência (o perfil ganha um aviso).
    await amb.ok('composicao:novaVersao', { id: r, motivo: 'Revisão FICTÍCIA' });
    const dados = {
      entrada: e,
      conteudoSha256Exibido: exibida.conteudoSha256!,
      rotulo: 'X',
      observacao: null,
      responsavel: 'Pessoa usuária',
    };
    expect(await amb.chamar('nutricao:registrarAvaliacao', dados)).toMatchObject({
      ok: false,
      erro: { codigo: 'DADOS_DESATUALIZADOS', mensagem: expect.stringMatching(/Avalie de novo/) },
    });
    expect(contarAvaliacoes()).toEqual([0, 0]);
    const nova = await amb.ok('nutricao:avaliarDieta', e);
    expect(nova.conteudoSha256).not.toBe(exibida.conteudoSha256);
    const g = await amb.ok('nutricao:registrarAvaliacao', {
      ...dados,
      conteudoSha256Exibido: nova.conteudoSha256!,
    });
    expect(g.conteudoSha256).toBe(nova.conteudoSha256);
  });

  it('hash de outro retrato (mesma entrada) é recusado; sem mudança, o hash se repete', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO R2');
    const p = await perfil(a.id, await registro(a.id, COMPLETO));
    const e = entrada([item(p.perfil.id)]);
    const h1 = (await amb.ok('nutricao:avaliarDieta', e)).conteudoSha256;
    expect((await amb.ok('nutricao:avaliarDieta', e)).conteudoSha256).toBe(h1);
    expect(
      await amb.chamar('nutricao:registrarAvaliacao', {
        entrada: e,
        conteudoSha256Exibido: H,
        rotulo: 'X',
        observacao: null,
        responsavel: 'Pessoa usuária',
      }),
    ).toMatchObject({ ok: false, erro: { codigo: 'DADOS_DESATUALIZADOS' } });
  });
});

describe('D-6B4-03: anulação com motivo, sem modificar o retrato', () => {
  it('anula em registro separado, com histórico; retrato e hash intactos; não anula duas vezes', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO N1');
    const p = await perfil(a.id, await registro(a.id, COMPLETO));
    const g = await gravar(entrada([item(p.perfil.id)]));
    const c = amb.gerenciador.conexao;
    const linhaAntes = c.prepare('SELECT * FROM avaliacao_nutricional WHERE id = ?').get(g.id);
    amb.definirHoje(new Date(2026, 9, 27, 15));
    const n = await amb.ok('nutricao:anularAvaliacao', {
      id: g.id,
      motivo: 'Quantidade digitada errada.',
      responsavel: 'Pessoa usuária',
    });
    expect(n.anulacao).toEqual({
      motivo: 'Quantidade digitada errada.',
      anuladoPor: 'Pessoa usuária',
      anuladoEm: new Date(2026, 9, 27, 15).toISOString(),
    });
    expect(n).toMatchObject({ usoOperacional: false, integridade: 'conferida' });
    expect(n.bloqueios.join(' ')).toMatch(/Anulada por Pessoa usuária.*Quantidade digitada errada/);
    expect(n.avaliacao).toEqual(g.avaliacao);
    expect(n.conteudoSha256).toBe(g.conteudoSha256);
    expect(c.prepare('SELECT * FROM avaliacao_nutricional WHERE id = ?').get(g.id)).toEqual(
      linhaAntes,
    );
    const h = c
      .prepare(
        "SELECT acao, motivo FROM historico_alteracao WHERE entidade = 'avaliacao_nutricional' ORDER BY ocorrido_em",
      )
      .all();
    expect(h).toEqual([
      { acao: 'criacao', motivo: null },
      { acao: 'anulacao', motivo: 'Quantidade digitada errada.' },
    ]);
    expect(
      await amb.chamar('nutricao:anularAvaliacao', {
        id: g.id,
        motivo: 'De novo.',
        responsavel: 'Pessoa usuária',
      }),
    ).toMatchObject({ ok: false, erro: { codigo: 'OPERACAO_INVALIDA' } });
    expect(
      await amb.chamar('nutricao:anularAvaliacao', {
        id: g.id,
        motivo: '  ',
        responsavel: 'Pessoa usuária',
      }),
    ).toMatchObject({ ok: false, erro: { codigo: 'ENTRADA_INVALIDA' } });
    await amb.reiniciar();
    expect((await amb.ok('nutricao:listarAvaliacoes', {}))[0]).toMatchObject({
      anulada: true,
      usoOperacional: false,
    });
    expect((await amb.ok('nutricao:obterAvaliacao', { id: g.id })).anulacao).toEqual(n.anulacao);
  });

  it('backup e restauração preservam avaliação e anulação no estado do backup', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO N2');
    const p = await perfil(a.id, await registro(a.id, COMPLETO));
    const g = await gravar(entrada([item(p.perfil.id)]));
    const antes = await amb.ok('backup:criar', {});
    await amb.ok('nutricao:anularAvaliacao', {
      id: g.id,
      motivo: 'Motivo FICTÍCIO.',
      responsavel: 'Pessoa usuária',
    });
    const depois = await amb.ok('backup:criar', {});
    await amb.ok('backup:restaurar', { id: antes.id });
    const r1 = await amb.ok('nutricao:obterAvaliacao', { id: g.id });
    expect(r1).toEqual(g);
    await amb.ok('backup:restaurar', { id: depois.id });
    const r2 = await amb.ok('nutricao:obterAvaliacao', { id: g.id });
    expect(r2).toMatchObject({ integridade: 'conferida', usoOperacional: false });
    expect(r2.anulacao?.motivo).toBe('Motivo FICTÍCIO.');
    expect(r2.avaliacao).toEqual(g.avaliacao);
  });
});

describe('D-6B4-04: integridade divergente só para investigação', () => {
  it('consultável e listada, mas sem uso operacional; pode ser anulada', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO D1');
    const p = await perfil(a.id, await registro(a.id, COMPLETO));
    const g = await gravar(entrada([item(p.perfil.id)]));
    const c = amb.gerenciador.conexao;
    c.exec('DROP TRIGGER tg_avaliacao_nutricional_imutavel');
    c.prepare("UPDATE avaliacao_nutricional SET rotulo = 'Alterado por fora' WHERE id = ?").run(
      g.id,
    );
    c.prepare(
      "UPDATE avaliacao_nutricional SET entrada_json = json_set(entrada_json, '$.animal.pcKg', 401) WHERE id = ?",
    ).run(g.id);
    const d = await amb.ok('nutricao:obterAvaliacao', { id: g.id });
    expect(d).toMatchObject({ integridade: 'divergente', usoOperacional: false });
    expect(d.bloqueios.join(' ')).toMatch(/Só para investigação, sem uso operacional \(D-6B4-04\)/);
    expect(d.avaliacao.entrada.animal.pcKg).toBe(401);
    expect((await amb.ok('nutricao:listarAvaliacoes', {}))[0]).toMatchObject({
      integridade: 'divergente',
      usoOperacional: false,
    });
    const n = await amb.ok('nutricao:anularAvaliacao', {
      id: g.id,
      motivo: 'Conteúdo alterado.',
      responsavel: 'Pessoa usuária',
    });
    expect(n.bloqueios).toHaveLength(2);
  });
});

describe('6B-4: retrato de formato 1 (sem a situação gravada)', () => {
  it('lido com a situação recalculada do próprio retrato, identificada; hash conferido', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO F1');
    const p = await perfil(a.id, await registro(a.id, COMPLETO));
    const g = await gravar(entrada([item(p.perfil.id)]));
    const c = amb.gerenciador.conexao;
    const l = c.prepare('SELECT * FROM avaliacao_nutricional WHERE id = ?').get(g.id) as Record<
      string,
      string | number
    >;
    const resultado = JSON.parse(l['resultado_json'] as string) as Record<string, unknown>;
    delete resultado['situacao'];
    const partes = {
      formatoVersao: 1,
      versaoMotor: l['versao_motor'] as string,
      tipoQuantidade: l['tipo_quantidade'] as string,
      fonteJson: l['fonte_json'] as string,
      entradaJson: l['entrada_json'] as string,
      hipotesesJson: l['hipoteses_json'] as string,
      perfisJson: l['perfis_json'] as string,
      resultadoJson: JSON.stringify(resultado),
    };
    const id = '01a13f6e-0000-7000-8000-0000000000f1';
    c.prepare(
      `INSERT INTO avaliacao_nutricional(id, rotulo, observacao, formato_versao, versao_motor, tipo_quantidade,
         fonte_json, entrada_json, hipoteses_json, perfis_json, resultado_json, conteudo_sha256,
         registrado_por, registrado_em, created_at, updated_at)
       VALUES (?, 'Formato 1', NULL, 1, ?, ?, ?, ?, ?, ?, ?, ?, 'Pessoa', ?, ?, ?)`,
    ).run(
      id,
      partes.versaoMotor,
      partes.tipoQuantidade,
      partes.fonteJson,
      partes.entradaJson,
      partes.hipotesesJson,
      partes.perfisJson,
      partes.resultadoJson,
      hashDoRetrato(partes),
      l['registrado_em'],
      l['registrado_em'],
      l['registrado_em'],
    );
    const v1 = await amb.ok('nutricao:obterAvaliacao', { id });
    expect(v1).toMatchObject({
      formatoVersao: 1,
      integridade: 'conferida',
      situacaoCalculadaNaLeitura: true,
    });
    expect(v1.avaliacao.situacao).toEqual(g.avaliacao.situacao);
    expect(g.situacaoCalculadaNaLeitura).toBe(false);
  });
});

describe('6B-5: perfis para o seletor da avaliação de dieta', () => {
  it('lista perfis com a elegibilidade de agora; inelegível vem com o motivo', async () => {
    await aprovar();
    const a = await alimento('Alimento FICTÍCIO S1');
    const r = await registro(a.id, COMPLETO);
    const p1 = await perfil(a.id, r);
    const nova = await amb.ok('composicao:novaVersao', { id: r, motivo: 'Correção FICTÍCIA' });
    await amb.ok('composicao:transcrever', { id: nova.registro.id, responsavel: 'Pessoa A' });
    await amb.ok('composicao:conferir', { id: nova.registro.id, responsavel: 'Pessoa B' });
    const p2 = await perfil(a.id, nova.registro.id);
    const lista = await amb.ok('nutricao:perfisParaDieta', {});
    const de = (id: string) => lista.find((p) => p.perfilId === id)!;
    expect(de(p1.perfil.id)).toMatchObject({
      elegivel: false,
      alimentoNome: 'Alimento FICTÍCIO S1',
    });
    expect(de(p1.perfil.id).motivosInelegibilidade.join(' ')).toMatch(/substituído/);
    expect(de(p2.perfil.id)).toMatchObject({ elegivel: true, motivosInelegibilidade: [] });
    expect(de(p2.perfil.id).nutrientes).toEqual(expect.arrayContaining(['MS', 'PB', 'Ca', 'P']));
  });
});
