import { describe, expect, it } from 'vitest';
import {
  agruparOrigens,
  cenariosReais,
  classificarCandidato,
  conteudoDaRegra,
  criarGeradorDeterministico,
  executarSelecao,
  mediana,
  mediaSimples,
  perfilCenario,
  perfilCentral,
  perfilReferenciaIndividual,
  idadesNoTexto,
  REGRA_SELECAO_5D_V1,
  REGRA_SELECAO_5D_V2,
  REGRAS_SELECAO,
  SEMENTES_PADRAO,
  type ArestaDependencia,
  type IdentidadeAlimento,
  type NutrienteSelecao,
  type RegistroCandidato,
  type RegraSelecao,
  type ValorCandidato,
} from '../src';

/*
 * Fase 5D, domínio da seleção. Casos SINTÉTICOS (CLAUDE.md, regra 1): alimentos, fontes e números
 * fictícios, escolhidos só para ter resultado conhecido; nenhum é dado de composição.
 */
const R = REGRA_SELECAO_5D_V2;
const ALIMENTO: IdentidadeAlimento = {
  id: 'al-x',
  nome: 'Alimento X',
  especie: 'Especie ficticia',
  cultivar: 'Cultivar A',
  partePlanta: null,
  formaConservacao: 'fresco',
  processamento: null,
};
const N_A: NutrienteSelecao = {
  id: 'n-a',
  codigo: 'TA',
  nome: 'Nutriente A',
  unidadeReferencia: 'pct',
  direcaoConservadora: 'menor',
};
const N_B: NutrienteSelecao = { ...N_A, id: 'n-b', codigo: 'TB', direcaoConservadora: 'maior' };
const N_C: NutrienteSelecao = {
  ...N_A,
  id: 'n-c',
  codigo: 'TC',
  direcaoConservadora: 'nao_definida',
};
const CATALOGO = [N_A, N_B, N_C];

let seq = 0;
const valor = (
  nutrienteId: string,
  v: number,
  extra: Partial<ValorCandidato> = {},
): ValorCandidato => ({
  id: `v${++seq}`,
  nutrienteId,
  valor: v,
  valorPublicado: String(v).replace('.', ','),
  unidade: 'pct',
  base: 'ms',
  tipoValor: 'media',
  nObservacoes: null,
  metodoAnaliticoFonte: null,
  formaObtencao: 'medido',
  interpretacaoBase: null,
  baseValidada: false,
  cautela: null,
  ...extra,
});
const reg = (id: string, extra: Partial<RegistroCandidato> = {}): RegistroCandidato => ({
  id,
  cadeiaId: id,
  alimento: ALIMENTO,
  fonteId: `f-${id}`,
  fonteDescricao: `Fonte fictícia ${id}`,
  fonteOrigem: 'estudo_individual',
  experimentoOrigem: null,
  referenciaLocal: 'Tabela fictícia',
  idadeCorteDias: 60,
  classeIdadeFonte: null,
  status: 'conferido',
  vigente: true,
  cautela: null,
  valores: [valor('n-a', 10), valor('n-b', 50)],
  naoQuantificados: [],
  ...extra,
});
const BUSCA = { alimento: ALIMENTO, idadeCorteDias: 60 };
const selecionar = (
  registros: RegistroCandidato[],
  arestas: ArestaDependencia[] = [],
  escolhas = new Map<string, string>(),
  regra: RegraSelecao = R,
) => executarSelecao(BUSCA, registros, arestas, CATALOGO, regra, escolhas);
const nut = (res: ReturnType<typeof selecionar>, id: string) =>
  res.nutrientes.find((n) => n.nutriente.id === id)!;

describe('5D: regra de seleção', () => {
  it('versão 1 aplica as decisões do usuário e tem texto canônico estável', () => {
    expect(R).toMatchObject({
      nMinimoOrigens: 3,
      toleranciaIdadeDias: 0,
      niveisAgregaveis: ['especifico'],
      origensAgregaveis: ['estudo_individual'],
      equivalenciasMetodo: [],
      basesInferidas: 'somente_validadas',
      usoComCautela: 'fora_da_agregacao',
    });
    expect(REGRAS_SELECAO.map((r) => `${r.codigo}:${r.versao}`)).toEqual([
      'SELECAO_5D:1',
      'SELECAO_5D:2',
    ]);
    expect([REGRA_SELECAO_5D_V1.idadeTextual, R.idadeTextual]).toEqual(['ignorada', 'verificada']);
    expect(conteudoDaRegra(REGRA_SELECAO_5D_V1)).not.toBe(conteudoDaRegra(R));
    expect(conteudoDaRegra({ ...R })).toBe(conteudoDaRegra(R));
    expect(conteudoDaRegra({ ...R, nMinimoOrigens: 2 })).not.toBe(conteudoDaRegra(R));
  });
});

describe('5D v2: idade escrita só no texto da fonte', () => {
  const k = (r: RegistroCandidato, regra: RegraSelecao = R, idade: number | null = 60) =>
    classificarCandidato({ alimento: ALIMENTO, idadeCorteDias: idade }, r, regra);
  const semIdade = (classe: string | null) =>
    reg('t', { idadeCorteDias: null, classeIdadeFonte: classe });
  it('lê só o texto, sem validar: números seguidos de "dias"', () => {
    expect(idadesNoTexto('CLASSE FICTÍCIA 60 DIAS')).toEqual([60]);
    expect(idadesNoTexto('Classe fictícia 120 dias silagem')).toEqual([120]);
    expect(idadesNoTexto('Classe fictícia 50/70 DIAS')).toEqual([70]);
    expect(idadesNoTexto('Classe 50 DIAS e 70 DIAS')).toEqual([50, 70]);
    expect(idadesNoTexto('Classe fictícia sem idade')).toEqual([]);
    expect(idadesNoTexto(null)).toEqual([]);
  });

  it('diferente da buscada: fora, com o texto original; igual: pendente, sem nível', () => {
    const outra = k(semIdade('CLASSE FICTÍCIA 90 DIAS'));
    expect(outra).toMatchObject({ nivel: null, pendenteValidacaoIdade: false });
    expect(outra.exclusao).toMatch(
      /Idade 90 dias no texto da fonte \(classe da fonte: "CLASSE FICTÍCIA 90 DIAS"\), diferente de 60/,
    );
    const igual = k(semIdade('CLASSE FICTÍCIA 60 DIAS'));
    expect(igual).toMatchObject({ nivel: null, pendenteValidacaoIdade: true });
    expect(igual.exclusao).toMatch(/pendente de validação: o nome não prova a idade/);
    expect(k(semIdade('Classe 60 DIAS e 70 DIAS'))).toMatchObject({
      nivel: null,
      pendenteValidacaoIdade: true,
    });
  });

  it('idade realmente desconhecida continua comparável; versão 1 preservada', () => {
    expect(k(semIdade('Classe fictícia'))).toMatchObject({ nivel: 'comparavel', exclusao: null });
    expect(k(semIdade(null))).toMatchObject({ nivel: 'comparavel', exclusao: null });
    expect(k(semIdade('CLASSE FICTÍCIA 90 DIAS'), REGRA_SELECAO_5D_V1)).toMatchObject({
      nivel: 'comparavel',
      exclusao: null,
    });
  });

  it('idade estruturada igual continua específica; texto divergente vira aviso', () => {
    const c = k(reg('t', { idadeCorteDias: 60, classeIdadeFonte: 'CLASSE FICTÍCIA 50 DIAS' }));
    expect(c).toMatchObject({ nivel: 'especifico', exclusao: null });
    expect(c.avisos.join(' ')).toMatch(/cita outra idade que a estruturada \(60 dias\)/);
  });

  it('pendente e excluído pelo texto não entram nas origens elegíveis', () => {
    const res = selecionar([
      reg('a', { valores: [valor('n-a', 10)] }),
      reg('b', {
        idadeCorteDias: null,
        classeIdadeFonte: 'CLASSE 60 DIAS',
        valores: [valor('n-a', 12)],
      }),
      reg('c', {
        idadeCorteDias: null,
        classeIdadeFonte: 'CLASSE 90 DIAS',
        valores: [valor('n-a', 14)],
      }),
    ]);
    expect(res.origens).toHaveLength(3);
    expect(res.origensElegiveis).toEqual(['a']);
  });
});

describe('5D: níveis de correspondência', () => {
  const k = (r: RegistroCandidato, regra: RegraSelecao = R) =>
    classificarCandidato(BUSCA, r, regra);
  it('específico com a mesma idade; sem idade na fonte é comparável, com aviso', () => {
    expect(k(reg('a'))).toMatchObject({ nivel: 'especifico', diferencas: [], exclusao: null });
    const semIdade = k(reg('b', { idadeCorteDias: null, classeIdadeFonte: 'Classe fictícia' }));
    expect(semIdade.nivel).toBe('comparavel');
    expect(semIdade.diferencas[0]).toMatch(/não informada.*Classe fictícia/);
    expect(semIdade.avisos).toContainEqual(
      expect.stringMatching(/não serve como correspondência específica/),
    );
  });

  it('idade diferente fica fora sem tolerância; com tolerância justificada vira comparável com aviso', () => {
    expect(k(reg('a', { idadeCorteDias: 61 })).exclusao).toMatch(/61 dias, diferente de 60/);
    const tolerante = {
      ...R,
      versao: 99,
      toleranciaIdadeDias: 5,
      justificativaTolerancia: 'Justificativa fictícia.',
    };
    const c = k(reg('a', { idadeCorteDias: 63 }), tolerante);
    expect(c).toMatchObject({ nivel: 'comparavel', exclusao: null });
    expect(c.avisos.join(' ')).toMatch(/Aproximação de idade.*Justificativa fictícia/);
  });

  it('nunca cruza espécie, forma, parte, processamento ou cultivar; sem cultivar é geral', () => {
    const outro = (x: Partial<IdentidadeAlimento>) =>
      reg('o', { alimento: { ...ALIMENTO, id: 'al-o', nome: 'Outro', ...x } });
    expect(k(outro({ especie: 'Outra especie' })).exclusao).toMatch(/Espécie/);
    expect(k(outro({ formaConservacao: 'ensilado' })).exclusao).toMatch(/Forma/);
    expect(k(outro({ partePlanta: 'folha' })).exclusao).toMatch(/Parte/);
    expect(k(outro({ processamento: 'moído' })).exclusao).toMatch(/Processamento/);
    expect(k(outro({ cultivar: 'Cultivar B' })).exclusao).toMatch(/Cultivar/);
    expect(k(outro({ cultivar: null }))).toMatchObject({ nivel: 'geral', exclusao: null });
  });

  it('não conferido, substituído e sem valores são excluídos; compilada só com aviso', () => {
    expect(k(reg('a', { status: 'transcrito' })).exclusao).toMatch(/Não conferido/);
    expect(k(reg('a', { vigente: false })).exclusao).toMatch(/substituída/);
    expect(k(reg('a', { valores: [] })).exclusao).toMatch(/Sem valores/);
    expect(k(reg('a', { fonteOrigem: 'tabela_compilada' })).avisos[0]).toMatch(/Tabela compilada/);
  });
});

describe('5D: origens independentes', () => {
  it('mesma publicação, mesmo experimento e vínculo transitivo (também por fora da busca) são uma origem', () => {
    const regs = [
      reg('a', { fonteId: 'f1' }),
      reg('b', { fonteId: 'f1' }),
      reg('c', { experimentoOrigem: 'Experimento Fictício' }),
      reg('d', { experimentoOrigem: 'experimento fictício' }),
      reg('e'),
      reg('f'),
      reg('g'),
    ];
    const { origens } = agruparOrigens(regs, [
      { a: 'e', b: 'x-fora', motivo: 'Vínculo fictício 1.' },
      { a: 'x-fora', b: 'f', motivo: 'Vínculo fictício 2.' },
    ]);
    expect(origens.map((o) => o.registros.sort())).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g'],
    ]);
    expect(origens[2]!.motivos).toEqual(['Vínculo fictício 1.', 'Vínculo fictício 2.']);
  });

  it('registros da mesma tabela compilada não são agrupados por fonte', () => {
    const { origens } = agruparOrigens(
      [
        reg('a', { fonteId: 'fc', fonteOrigem: 'tabela_compilada' }),
        reg('b', { fonteId: 'fc', fonteOrigem: 'tabela_compilada' }),
      ],
      [],
    );
    expect(origens).toHaveLength(2);
  });
});

describe('5D: agregação', () => {
  it('3 origens: média simples, mediana, mínimo e máximo observados; 2 origens: insuficiente, sem média', () => {
    const tres = selecionar([
      reg('a', { valores: [valor('n-a', 10)] }),
      reg('b', { valores: [valor('n-a', 12)] }),
      reg('c', { valores: [valor('n-a', 20)] }),
    ]);
    expect(nut(tres, 'n-a')).toMatchObject({
      situacao: 'agregado',
      cobertura: { comValor: 3, total: 3 },
    });
    expect(nut(tres, 'n-a').classes[0]).toMatchObject({
      nOrigens: 3,
      media: 14,
      mediana: 12,
      minimo: 10,
      maximo: 20,
    });
    const dois = selecionar([
      reg('a', { valores: [valor('n-a', 10)] }),
      reg('b', { valores: [valor('n-a', 12)] }),
    ]);
    expect(nut(dois, 'n-a').situacao).toBe('insuficiente');
    expect(nut(dois, 'n-a').classes[0]).toMatchObject({
      media: null,
      mediana: null,
      minimo: 10,
      maximo: 12,
    });
  });

  it('origens dependentes contam uma vez: 3 registros ligados por vínculo não agregam', () => {
    const res = selecionar(
      [
        reg('a', { valores: [valor('n-a', 10)] }),
        reg('b', { valores: [valor('n-a', 10)] }),
        reg('c', { valores: [valor('n-a', 20)] }),
      ],
      [{ a: 'a', b: 'b', motivo: 'Mesmos valores (fictício).' }],
    );
    expect(res.origens).toHaveLength(2);
    expect(nut(res, 'n-a').situacao).toBe('insuficiente');
    expect(res.origensComTratamentos).toEqual([{ origemId: 'a', registros: ['a', 'b'] }]);
  });

  it('formas e métodos diferentes não se combinam; duas classes suficientes não viram uma', () => {
    const regs = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) =>
      reg(id, { valores: [valor('n-a', 10 + i, i < 3 ? {} : { formaObtencao: 'estimado_nir' })] }),
    );
    const res = selecionar(regs);
    expect(nut(res, 'n-a').situacao).toBe('classes_distintas');
    expect(nut(res, 'n-a').classes.map((k) => [k.formaObtencao, k.nOrigens])).toEqual([
      ['estimado_nir', 3],
      ['medido', 3],
    ]);
    const metodo = selecionar(
      ['a', 'b', 'c'].map((id, i) =>
        reg(id, {
          valores: [
            valor('n-a', 10, { metodoAnaliticoFonte: i ? 'Método fictício' : 'Outro método' }),
          ],
        }),
      ),
    );
    expect(nut(metodo, 'n-a').situacao).toBe('insuficiente');
  });

  it('converte só entre unidades compatíveis; base diferente não se combina', () => {
    const res = selecionar([
      reg('a', { valores: [valor('n-a', 10)] }),
      reg('b', { valores: [valor('n-a', 120, { unidade: 'g_kg' })] }),
      reg('c', { valores: [valor('n-a', 14)] }),
      reg('d', { valores: [valor('n-a', 3, { base: 'mn' })] }),
    ]);
    const k = nut(res, 'n-a').classes.find((x) => x.base === 'ms')!;
    expect(k).toMatchObject({ unidade: 'pct', nOrigens: 3, media: 12 });
    expect(nut(res, 'n-a').classes.find((x) => x.base === 'mn')!.suficiente).toBe(false);
  });

  it('base inferida só entra validada; uso com cautela e tabela compilada ficam fora', () => {
    const base = [
      reg('a', { valores: [valor('n-a', 10)] }),
      reg('b', { valores: [valor('n-a', 12)] }),
    ];
    const inferida = (validada: boolean) =>
      selecionar([
        ...base,
        reg('c', {
          valores: [
            valor('n-a', 14, { interpretacaoBase: 'Motivo fictício.', baseValidada: validada }),
          ],
        }),
      ]);
    expect(nut(inferida(false), 'n-a').situacao).toBe('insuficiente');
    expect(nut(inferida(false), 'n-a').exclusoes[0]!.motivo).toMatch(/Base inferida, não validada/);
    expect(nut(inferida(true), 'n-a').situacao).toBe('agregado');
    for (const terceiro of [
      reg('c', { cautela: 'Motivo fictício.', valores: [valor('n-a', 14)] }),
      reg('c', { valores: [valor('n-a', 14, { cautela: 'Motivo fictício.' })] }),
      reg('c', { fonteOrigem: 'tabela_compilada', valores: [valor('n-a', 14)] }),
      reg('c', { idadeCorteDias: null, valores: [valor('n-a', 14)] }),
    ])
      expect(nut(selecionar([...base, terceiro]), 'n-a').situacao).toBe('insuficiente');
  });

  it('tratamentos do mesmo experimento: sem escolha a origem fica fora; com escolha entra um só', () => {
    const regs = [
      reg('t1', { fonteId: 'fe', valores: [valor('n-a', 10)] }),
      reg('t2', { fonteId: 'fe', valores: [valor('n-a', 30)] }),
      reg('b', { valores: [valor('n-a', 12)] }),
      reg('c', { valores: [valor('n-a', 14)] }),
    ];
    const sem = selecionar(regs);
    expect(nut(sem, 'n-a').situacao).toBe('insuficiente');
    expect(nut(sem, 'n-a').exclusoes.map((e) => e.registroId)).toEqual(['t1', 't2']);
    const com = selecionar(regs, [], new Map([['t1', 't2']]));
    expect(nut(com, 'n-a').classes[0]).toMatchObject({ nOrigens: 3, media: 18.6666666666667 });
    expect(nut(com, 'n-a').classes[0]!.valores.map((v) => v.registroId)).toEqual(['b', 'c', 't2']);
  });
});

describe('5D: cenários reais e perfis', () => {
  const regs = [
    reg('a', { valores: [valor('n-a', 10), valor('n-b', 40), valor('n-c', 1)] }),
    reg('b', { valores: [valor('n-a', 12), valor('n-b', 60), valor('n-c', 2)] }),
    reg('c', { valores: [valor('n-a', 10), valor('n-b', 50)] }),
  ];

  it('extremo pela direção do nutriente; empate lista os dois; sem direção, sem cenário', () => {
    const res = selecionar(regs);
    const cen = (id: string, s: string) =>
      res.cenarios.find((c) => c.nutriente.id === id && c.sentido === s);
    expect(cen('n-a', 'conservador')).toMatchObject({ valor: 10, registros: ['a', 'c'] });
    expect(cen('n-a', 'favoravel')).toMatchObject({ valor: 12, registros: ['b'] });
    expect(cen('n-b', 'conservador')).toMatchObject({ valor: 60, registros: ['b'] });
    expect(res.cenarios.some((c) => c.nutriente.id === 'n-c')).toBe(false);
    expect(cenariosReais(res.nutrientes)).toEqual(res.cenarios);
  });

  it('cenário é o registro inteiro, rotulado pelo nutriente; fora do extremo é recusado', () => {
    const res = selecionar(regs);
    const p = perfilCenario(res, 'n-b', 'conservador', 'b');
    expect(p.valores.map((v) => [v.nutrienteId, v.valor])).toEqual([
      ['n-a', 12],
      ['n-b', 60],
      ['n-c', 2],
    ]);
    expect(p.limitacoes[0]).toMatch(/Cenário conservador para TB.*não indica qualidade global/);
    expect(() => perfilCenario(res, 'n-b', 'conservador', 'a')).toThrow(/extremo/);
    expect(() => perfilCenario(res, 'n-c', 'conservador', 'a')).toThrow(/indisponível/);
  });

  it('central: só nutrientes agregados, ausente nunca zero; individual: só o registro, evidência limitada', () => {
    const res = selecionar(regs);
    const central = perfilCentral(res);
    expect(central.valores.map((v) => v.nutrienteId)).toEqual(['n-a', 'n-b']);
    expect(central.valores[0]).toMatchObject({
      valor: mediaSimples([10, 12, 10]),
      nOrigens: 3,
      cobertura: '3 de 3 origens',
    });
    expect(central.limitacoes.join(' ')).toMatch(/TC ausente: no máximo 2 origem/);
    expect(central.limitacoes[0]).toMatch(/Não é perfil observado/);
    const ind = perfilReferenciaIndividual(res, 'c');
    expect(ind.valores.map((v) => v.nutrienteId)).toEqual(['n-a', 'n-b']);
    expect(ind.limitacoes[0]).toMatch(/evidência limitada/);
    expect(() => perfilCentral(selecionar(regs.slice(0, 2)))).toThrow(/suficientes/);
    expect(() =>
      perfilReferenciaIndividual(selecionar([reg('z', { status: 'transcrito' })]), 'z'),
    ).toThrow(/não elegível/);
  });
});

describe('5D: propriedades', () => {
  it('ordem não muda o resultado; dependente não muda o n; central entre os extremos', () => {
    for (const semente of SEMENTES_PADRAO) {
      const g = criarGeradorDeterministico(semente);
      for (let rodada = 0; rodada < 30; rodada++) {
        const n = g.inteiro(1, 8);
        const regs = Array.from({ length: n }, (_, i) =>
          reg(`r${i}`, { valores: [valor('n-a', g.inteiro(1, 900) / 10)] }),
        );
        const base = selecionar(regs);
        const embaralhado = selecionar(g.embaralhar(regs));
        expect(nut(embaralhado, 'n-a').classes, `semente ${semente}`).toEqual(
          nut(base, 'n-a').classes,
        );
        const k = nut(base, 'n-a').classes[0]!;
        expect(k.nOrigens).toBe(n);
        if (k.media !== null) {
          expect(k.media).toBeGreaterThanOrEqual(k.minimo!);
          expect(k.media).toBeLessThanOrEqual(k.maximo!);
          expect(k.mediana).toBe(mediana(k.valores.map((v) => v.valor)));
        }
        const dependente = reg('dep', { valores: [valor('n-a', g.inteiro(1, 900) / 10)] });
        const comDependente = selecionar(
          [...regs, dependente],
          [{ a: 'dep', b: 'r0', motivo: 'Fictício.' }],
        );
        expect(comDependente.origens).toHaveLength(n);
        expect(
          comDependente.nutrientes.every((x) =>
            x.classes.every((c) => c.valores.every((v) => v.valor !== 0)),
          ),
        ).toBe(true);
      }
    }
  });
});
