import { describe, expect, it } from 'vitest';
import {
  acoesDisponiveis,
  aceitaNovaVersao,
  basesPermitidas,
  converterUnidade,
  DEFINICOES_INICIAIS_NUTRIENTES,
  DEFINICOES_UNIDADE,
  dentroDaFaixaDaUnidade,
  direcaoSugeridaPorGrupo,
  existeConversao,
  exigeDataAmostra,
  exigeReferenciaLocal,
  exigirNumeroPublicado,
  fundamentacaoCompleta,
  GRUPOS_NUTRIENTE,
  lerNumeroPublicado,
  mesmaDefinicao,
  mesmaPessoa,
  normalizarCodigo,
  ORIGENS_FONTE,
  ORIGENS_FONTE_CADASTRAVEIS,
  PADRAO_CODIGO,
  PARES_DE_STATUS_PERMITIDOS,
  problemasDoValor,
  registroDescartavel,
  registroEditavel,
  STATUS_REGISTRO,
  statusDepois,
  tiposValorPermitidos,
  transicaoPermitida,
  UNIDADES_NUTRICIONAIS,
  type ContextoDoValor,
  type ValorParaConferir,
} from '../src';

/*
 * Os números destes testes são sintéticos: provam a leitura e as regras de armazenamento, não
 * representam composição de nenhum alimento (CLAUDE.md, regra 1).
 */

describe('número publicado (D5-3)', () => {
  it('lê vírgula decimal e preserva o texto e as casas decimais', () => {
    expect(lerNumeroPublicado('12,50', 'virgula')).toEqual({
      ok: true,
      numero: { texto: '12,50', valor: 12.5, casasDecimais: 2 },
    });
    expect(lerNumeroPublicado(' 12,5 ', 'virgula')).toEqual({
      ok: true,
      numero: { texto: '12,5', valor: 12.5, casasDecimais: 1 },
    });
    // Mesmo valor, precisões diferentes: o texto distingue.
    const a = exigirNumeroPublicado('3,0', 'virgula');
    const b = exigirNumeroPublicado('3', 'virgula');
    expect(a.valor).toBe(b.valor);
    expect([a.casasDecimais, b.casasDecimais]).toEqual([1, 0]);
  });

  it('o separador decimal da fonte decide "1.050" sem adivinhar', () => {
    expect(exigirNumeroPublicado('1.050', 'virgula').valor).toBe(1050);
    expect(exigirNumeroPublicado('1.050', 'ponto').valor).toBe(1.05);
    expect(exigirNumeroPublicado('1.050,25', 'virgula')).toEqual({
      texto: '1.050,25',
      valor: 1050.25,
      casasDecimais: 2,
    });
    expect(exigirNumeroPublicado('1,050.25', 'ponto').valor).toBe(1050.25);
    expect(exigirNumeroPublicado('12.345.678', 'virgula').valor).toBe(12345678);
    expect(exigirNumeroPublicado('0,125', 'virgula').casasDecimais).toBe(3);
    expect(exigirNumeroPublicado('-1,5', 'virgula').valor).toBe(-1.5);
  });

  it('recusa texto malformado, censurado ou qualitativo, e nunca devolve zero no lugar', () => {
    for (const texto of [
      '',
      '   ',
      'ND',
      'traços',
      '<0,01',
      '> 2',
      '1,2,3',
      '12.5', // ponto com fonte de vírgula decimal e sem grupo de milhar válido
      '1.05', // idem
      '1.0500',
      ',5',
      '5,',
      '+5',
      '1 050',
      '1e3',
      'NaN',
      'Infinity',
      '0x10',
      '1'.repeat(31),
    ])
      expect(lerNumeroPublicado(texto, 'virgula').ok, texto).toBe(false);
    for (const texto of ['12,5', '1.05,0', '1,05', '5.', '.5'])
      expect(lerNumeroPublicado(texto, 'ponto').ok, texto).toBe(false);
    expect(() => exigirNumeroPublicado('ND', 'virgula')).toThrow(/valor não quantificado/);
  });

  it('zero publicado é zero (dado presente), e "-0" não guarda sinal', () => {
    expect(exigirNumeroPublicado('0', 'virgula').valor).toBe(0);
    expect(Object.is(exigirNumeroPublicado('-0,0', 'virgula').valor, 0)).toBe(true);
  });

  it('ida e volta: o texto canônico de qualquer número aceito é lido de volta igual', () => {
    for (let i = 0; i < 500; i++) {
      const inteiro = (i * 7919) % 100000;
      const casas = i % 5;
      const frac = String((i * 104729) % 10 ** Math.max(casas, 1)).padStart(casas, '0');
      const texto = casas === 0 ? String(inteiro) : `${inteiro},${frac.slice(0, casas)}`;
      const lido = exigirNumeroPublicado(texto, 'virgula');
      expect(lido.texto).toBe(texto);
      expect(lido.casasDecimais).toBe(casas);
      expect(lido.valor).toBe(Number(texto.replace(',', '.')));
      expect(exigirNumeroPublicado(texto.replace(',', '.'), 'ponto').valor).toBe(lido.valor);
    }
  });
});

describe('unidades e conversões explícitas', () => {
  it('fatores exatos entre %, g/kg, mg/kg e ppm, sem ruído binário', () => {
    expect(converterUnidade(1, 'pct', 'g_kg')).toBe(10);
    expect(converterUnidade(1, 'pct', 'mg_kg')).toBe(10000);
    expect(converterUnidade(0.07, 'pct', 'g_kg')).toBe(0.7);
    expect(converterUnidade(0.07, 'pct', 'mg_kg')).toBe(700);
    expect(converterUnidade(7, 'g_kg', 'pct')).toBe(0.7);
    expect(converterUnidade(3, 'mg_kg', 'pct')).toBe(0.0003);
    expect(converterUnidade(250, 'ppm', 'mg_kg')).toBe(250);
    expect(converterUnidade(42, 'pct', 'pct')).toBe(42);
  });

  it('ida e volta devolve o valor original', () => {
    const fracoes = UNIDADES_NUTRICIONAIS.filter(
      (u) => DEFINICOES_UNIDADE[u].grandeza === 'fracao_massica',
    );
    for (let i = 1; i <= 300; i++) {
      const valor = Number(((i * 37) / 100).toFixed(2));
      for (const de of fracoes)
        for (const para of fracoes)
          expect(converterUnidade(converterUnidade(valor, de, para), para, de)).toBe(valor);
    }
  });

  it('grandezas diferentes e unidades sem conversão definida são recusadas', () => {
    expect(existeConversao('pct', 'mcal_kg')).toBe(false);
    expect(existeConversao('ui_kg', 'mg_kg')).toBe(false);
    expect(existeConversao('mcal_kg', 'mcal_kg')).toBe(true);
    expect(() => converterUnidade(1, 'pct', 'mcal_kg')).toThrow(/Não há conversão definida/);
    expect(() => converterUnidade(1, 'ui_kg', 'mg_kg')).toThrow(/Não há conversão definida/);
    expect(() => converterUnidade(Number.NaN, 'pct', 'g_kg')).toThrow();
  });

  it('faixas pela definição da unidade', () => {
    expect(dentroDaFaixaDaUnidade(0, 'pct')).toBe(true);
    expect(dentroDaFaixaDaUnidade(100, 'pct')).toBe(true);
    expect(dentroDaFaixaDaUnidade(100.01, 'pct')).toBe(false);
    expect(dentroDaFaixaDaUnidade(-0.01, 'pct')).toBe(false);
    expect(dentroDaFaixaDaUnidade(1000, 'g_kg')).toBe(true);
    expect(dentroDaFaixaDaUnidade(1000.5, 'g_kg')).toBe(false);
    expect(dentroDaFaixaDaUnidade(1_000_001, 'mg_kg')).toBe(false);
    expect(dentroDaFaixaDaUnidade(-1, 'ui_kg')).toBe(false);
    expect(dentroDaFaixaDaUnidade(-1, 'mcal_kg')).toBe(true);
    expect(dentroDaFaixaDaUnidade(Number.POSITIVE_INFINITY, 'mcal_kg')).toBe(false);
  });
});

describe('fluxo de conferência (D5-4, D5-5)', () => {
  it('transições do fluxo e mensagens', () => {
    expect(statusDepois('transcrever', 'rascunho')).toBe('transcrito');
    expect(statusDepois('conferir', 'transcrito')).toBe('conferido');
    expect(statusDepois('rejeitar', 'transcrito')).toBe('rejeitado');
    expect(statusDepois('devolver', 'transcrito')).toBe('rascunho');
    expect(statusDepois('reabrir', 'rejeitado')).toBe('rascunho');
    expect(() => statusDepois('conferir', 'rascunho')).toThrow(/exige o registro em transcrito/);
    expect(() => statusDepois('devolver', 'conferido')).toThrow(/crie uma nova versão/);
    expect(() => statusDepois('transcrever', 'substituido')).toThrow(/não muda/);
  });

  it('nenhum caminho sai do conferido, exceto a substituição pela versão nova', () => {
    for (const para of STATUS_REGISTRO)
      expect(transicaoPermitida('conferido', para)).toBe(para === 'substituido');
    for (const para of STATUS_REGISTRO) expect(transicaoPermitida('substituido', para)).toBe(false);
    expect(transicaoPermitida('rascunho', 'conferido')).toBe(false);
    expect(transicaoPermitida('rejeitado', 'conferido')).toBe(false);
    expect(PARES_DE_STATUS_PERMITIDOS).toHaveLength(6);
    expect(acoesDisponiveis('conferido')).toEqual([]);
    expect(acoesDisponiveis('transcrito').sort()).toEqual(['conferir', 'devolver', 'rejeitar']);
  });

  it('edição, descarte e nova versão por status', () => {
    expect(STATUS_REGISTRO.filter(registroEditavel)).toEqual(['rascunho']);
    expect(STATUS_REGISTRO.filter(registroDescartavel)).toEqual([
      'rascunho',
      'transcrito',
      'rejeitado',
    ]);
    expect(STATUS_REGISTRO.filter(aceitaNovaVersao)).toEqual(['conferido']);
  });

  it('mesma pessoa é detectada sem diferença de maiúsculas e espaços', () => {
    expect(mesmaPessoa('Pessoa  Teste', ' pessoa teste')).toBe(true);
    expect(mesmaPessoa('Pessoa A', 'Pessoa B')).toBe(false);
    expect(mesmaPessoa(null, 'Pessoa A')).toBe(false);
  });
});

describe('regras por origem e definição', () => {
  const base: ValorParaConferir = {
    valor: 10,
    unidade: 'pct',
    base: 'ms',
    tipoValor: 'valor_unico',
    desvioPadrao: null,
    minimo: null,
    maximo: null,
    nObservacoes: null,
  };
  const ctx: ContextoDoValor = {
    origem: 'estudo_individual',
    grupo: 'outro',
    unidadeReferencia: 'pct',
    codigoNutriente: 'TESTE_A',
  };

  it('sistema_exigencias é reservada e não é cadastrável na Fase 5', () => {
    expect(ORIGENS_FONTE).toContain('sistema_exigencias');
    expect(ORIGENS_FONTE_CADASTRAVEIS as readonly string[]).not.toContain('sistema_exigencias');
  });

  it('referência local, data da amostra e tipos de valor por origem', () => {
    expect(ORIGENS_FONTE.filter(exigeReferenciaLocal)).toEqual([
      'tabela_compilada',
      'estudo_individual',
    ]);
    expect(ORIGENS_FONTE.filter(exigeDataAmostra)).toEqual(['laboratorial', 'medicao_propria']);
    expect(tiposValorPermitidos('rotulo_comercial')).toEqual([
      'minimo_garantido',
      'maximo_garantido',
    ]);
    expect(tiposValorPermitidos('tabela_compilada')).not.toContain('minimo_garantido');
    expect(basesPermitidas('rotulo_comercial')).toEqual(['mn']);
  });

  it('valor aceito e cada problema detectado', () => {
    expect(problemasDoValor(base, ctx)).toEqual([]);
    expect(problemasDoValor({ ...base, valor: 101 }, ctx)).toEqual([
      'O valor deve estar de 0 a 100 %.',
    ]);
    expect(problemasDoValor({ ...base, unidade: 'mcal_kg' }, ctx)[0]).toMatch(/mesma grandeza/);
    expect(problemasDoValor({ ...base, unidade: 'g_kg', valor: 100 }, ctx)).toEqual([]);
    // Migration 0018: equivalente proteico (N × 6,25) passa de 100 %; só o piso vale.
    for (const naturezaValor of ['equivalente_proteico', 'equivalente_proteico_nnp'] as const) {
      expect(problemasDoValor({ ...base, valor: 260 }, { ...ctx, naturezaValor })).toEqual([]);
      expect(problemasDoValor({ ...base, valor: -1 }, { ...ctx, naturezaValor })).toEqual([
        'O valor de equivalente proteico (N × 6,25) não pode ser negativo.',
      ]);
    }
    expect(
      problemasDoValor({ ...base, valor: 101 }, { ...ctx, naturezaValor: 'fracao_massica' }),
    ).toEqual(['O valor deve estar de 0 a 100 %.']);
    expect(problemasDoValor({ ...base, desvioPadrao: -1 }, ctx)).toEqual([
      'O desvio-padrão não pode ser negativo.',
    ]);
    expect(problemasDoValor({ ...base, minimo: 5, maximo: 4 }, ctx)).toEqual([
      'O mínimo publicado é maior que o máximo.',
    ]);
    expect(problemasDoValor({ ...base, nObservacoes: 0 }, ctx)).toHaveLength(1);
    expect(problemasDoValor({ ...base, nObservacoes: 2.5 }, ctx)).toHaveLength(1);
    expect(problemasDoValor({ ...base, tipoValor: 'minimo_garantido' }, ctx)).toEqual([
      'Mínimo e máximo garantidos são exclusivos de rótulo comercial.',
    ]);
    const rotulo = { ...ctx, origem: 'rotulo_comercial' as const };
    expect(problemasDoValor(base, rotulo)).toEqual([
      'Rótulo comercial só registra mínimo ou máximo garantido.',
      'Garantias de rótulo ficam na base matéria natural, como no rótulo.',
    ]);
    expect(
      problemasDoValor({ ...base, tipoValor: 'maximo_garantido', base: 'mn' }, rotulo),
    ).toEqual([]);
    const medicao = { ...ctx, origem: 'medicao_propria' as const };
    expect(problemasDoValor(base, medicao)).toEqual([
      'Medição própria registra somente matéria seca.',
    ]);
    expect(problemasDoValor(base, { ...medicao, grupo: 'fracao_seca' })).toEqual([]);
  });

  it('direção conservadora pela regra da seção 5.4', () => {
    expect(direcaoSugeridaPorGrupo('fibra')).toBe('maior');
    expect(direcaoSugeridaPorGrupo('outro')).toBe('nao_definida');
    for (const g of GRUPOS_NUTRIENTE.filter((g) => g !== 'fibra' && g !== 'outro'))
      expect(direcaoSugeridaPorGrupo(g)).toBe('menor');
  });

  it('variantes de método nunca são equivalentes: só a mesma definição', () => {
    expect(mesmaDefinicao({ id: 'a' }, { id: 'a' })).toBe(true);
    expect(mesmaDefinicao({ id: 'a' }, { id: 'b' })).toBe(false);
  });

  it('código e fundamentação', () => {
    for (const c of ['CQBAL_4_0', 'PB', 'FDNcp', 'TESTE_A'])
      expect(PADRAO_CODIGO.test(c)).toBe(true);
    for (const c of ['', '4PB', 'P B', 'PB-1', 'Á', 'A'.repeat(31)])
      expect(PADRAO_CODIGO.test(c), c).toBe(false);
    expect(normalizarCodigo(' fdnCp ')).toBe('FDNCP');
    expect(
      fundamentacaoCompleta({
        metodoAnalitico: 'Método fictício',
        fundamentacaoFonteId: 'f',
        fundamentacaoReferencia: 'p. 1',
      }),
    ).toBe(true);
    for (const falta of [
      { metodoAnalitico: null, fundamentacaoFonteId: 'f', fundamentacaoReferencia: 'p. 1' },
      { metodoAnalitico: ' ', fundamentacaoFonteId: 'f', fundamentacaoReferencia: 'p. 1' },
      { metodoAnalitico: 'M', fundamentacaoFonteId: null, fundamentacaoReferencia: 'p. 1' },
      { metodoAnalitico: 'M', fundamentacaoFonteId: 'f', fundamentacaoReferencia: '' },
    ])
      expect(fundamentacaoCompleta(falta)).toBe(false);
  });
});

describe('catálogo inicial de definições (D5-2)', () => {
  it('só definições: sem método, nada fundamentado, códigos e ids únicos', () => {
    const c = DEFINICOES_INICIAIS_NUTRIENTES;
    expect(c.map((d) => d.codigo)).toEqual([
      'MS',
      'MO',
      'MM',
      'PB',
      'EE',
      'FDN',
      'FDA',
      'LIG',
      'NDT',
      'Ca',
      'P',
    ]);
    expect(new Set(c.map((d) => normalizarCodigo(d.codigo))).size).toBe(c.length);
    expect(new Set(c.map((d) => d.id)).size).toBe(c.length);
    for (const d of c) {
      expect(d.metodoAnalitico).toBeNull();
      expect(d.situacaoFundamentacao).toBe('pendente');
      expect(d.unidadeReferencia).toBe('pct');
      expect(d.direcaoConservadora).toBe(direcaoSugeridaPorGrupo(d.grupo));
      expect(d.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(PADRAO_CODIGO.test(d.codigo)).toBe(true);
      // Nenhuma definição carrega número: o catálogo não é composição.
      expect(Object.values(d).some((v) => typeof v === 'number')).toBe(false);
    }
    expect(c.find((d) => d.codigo === 'MS')).toMatchObject({
      baseReferencia: 'mn',
      grupo: 'fracao_seca',
    });
    expect(c.filter((d) => d.codigo !== 'MS').every((d) => d.baseReferencia === 'ms')).toBe(true);
  });
});
