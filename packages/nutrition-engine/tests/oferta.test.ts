import { describe, expect, it } from 'vitest';
import {
  calcularOferta,
  confereImpresso,
  ErroOferta,
  ErroUnidade,
  q,
  type DietaOferta,
  type ItemDieta,
  type PerfilOferta,
  type TipoQuantidade,
  type ValorPerfilOferta,
} from '../src';
import {
  ALIMENTOS_4_4,
  CONCENTRADO_4_4,
  DIETA_4_4,
  NUTRIENTES_4_4,
  type Nutriente44,
} from './dados/tabela-4-4';

/*
 * 6B-1: oferta nutricional. Dois tipos de caso, sempre identificados no nome:
 * - "Tabela 4.4 (p. 102)": composição impressa no livro, só para a aritmética (C-6B-19);
 * - "SINTÉTICO": números FICTÍCIOS, escolhidos para testar regras, sem valor nutricional.
 * Esperado do motor em precisão integral; células impressas divergentes ficam presas (C-6B-18).
 */
const num = (s: string) => Number(s.replace(',', '.'));
const pct = (gDia: number | null, kgMs: number) =>
  gDia === null ? null : (gDia / (kgMs * 1000)) * 100;
function confere(calculado: number | null, impresso: string, onde: string) {
  expect(calculado, onde).not.toBeNull();
  expect(
    confereImpresso(calculado!, impresso),
    `${onde}: calculado ${calculado}, impresso ${impresso}`,
  ).toBe(true);
}
function diverge(calculado: number | null, impresso: string, onde: string) {
  expect(calculado, onde).not.toBeNull();
  expect(
    confereImpresso(calculado!, impresso),
    `${onde}: esperava divergência; calculado ${calculado}, impresso ${impresso}`,
  ).toBe(false);
}

/** Perfil a partir de uma coluna da Tabela 4.4: traço e branco viram "sem valor", nunca zero. */
function perfil44(nome: string, extra: Partial<PerfilOferta> = {}): PerfilOferta {
  const col = ALIMENTOS_4_4[nome]!;
  const valores: ValorPerfilOferta[] = [];
  const naoQuantificados: { nutriente: string; textoPublicado: string }[] = [];
  for (const n of NUTRIENTES_4_4) {
    const c = col[n];
    if (c === null) continue;
    if (c === '–') naoQuantificados.push({ nutriente: n, textoPublicado: '–' });
    else
      valores.push({
        valorId: `T44-${nome}-${n}`,
        nutriente: n,
        valor: num(c),
        valorPublicado: c,
        unidade: 'pct',
        base: n === 'MS' ? 'mn' : 'ms',
        tipoValor: 'valor_unico',
        formaObtencao: 'medido',
        baseInferida: false,
        baseValidada: false,
        naturezaValor:
          n === 'PBu'
            ? 'equivalente_proteico_nnp'
            : n === 'PB'
              ? 'equivalente_proteico'
              : 'fracao_massica',
        origens: ['BR-CORTE 2023, Tabela 4.4, p. 102'],
      });
  }
  return {
    perfilId: `perfil-T44-${nome}`,
    alimentoId: `alimento-T44-${nome}`,
    alimentoNome: nome,
    regra: { codigo: 'TESTE_TABELA_4_4', versao: 1 },
    elegibilidade: { elegivel: true, motivos: [] },
    cautelas: [],
    valores,
    naoQuantificados,
    ...extra,
  };
}
const item = (nome: string, kgMs: number): ItemDieta => ({
  itemId: nome,
  perfil: perfil44(nome),
  quantidade: q(kgMs, 'kg MS/dia'),
});
const dieta = (
  itens: ItemDieta[],
  tipo: TipoQuantidade = 'consumo_assumido_sem_sobras',
): DietaOferta => ({
  tipo,
  itens,
  nutrientes: NUTRIENTES_4_4,
});
const nut = (r: ReturnType<typeof calcularOferta>, n: Nutriente44) =>
  r.nutrientes.find((x) => x.nutriente === n)!;

/** 1 kg de MS de concentrado (proporções da p. 102). */
const concentrado = (kgMs: number) =>
  Object.entries(CONCENTRADO_4_4).map(([nome, p]) => item(nome, kgMs * p));

describe('6B-1: Tabela 4.4 (p. 102), concentrado', () => {
  const r = calcularOferta(dieta(concentrado(1)));

  it('MS do concentrado pela soma das MN (88,118); impresso 88,11 (divergência presa)', () => {
    expect(r.materiaSeca.totalKgMsDia).toBeCloseTo(1, 12);
    diverge(r.materiaSeca.msPctMnDieta, '88,11', 'MS');
    confere(r.materiaSeca.msPctMnDieta, '88,118', 'MS integral');
  });

  it('MO completa: o "0" impresso da mistura mineral é zero publicado; 95,206 (impresso 95,20)', () => {
    const mo = nut(r, 'MO');
    expect(mo.situacao).toBe('completa');
    diverge(mo.concentracaoPctMs, '95,20', 'MO');
    confere(mo.concentracaoPctMs, '95,206', 'MO integral');
  });

  it('traços da U:SA e da mistura mineral não viram zero: EE, fibras, CNF, PIDN e PIDA parciais', () => {
    for (const n of ['EE', 'FDNcp', 'LIG', 'CNF', 'PIDN', 'PIDA'] as const) {
      const o = nut(r, n);
      expect(o.situacao, n).toBe('parcial');
      expect(o.totalGDia, n).toBeNull();
      expect(o.concentracaoPctMs, n).toBeNull();
      expect(o.motivos[0], n).toMatch(
        /U:SA, MM: a soma das contribuições conhecidas não é a oferta total/,
      );
    }
    // FDA em branco (ausência de informação) na U:SA e na mistura mineral.
    expect(
      nut(r, 'FDA')
        .contribuicoes.filter((c) => c.situacao === 'desconhecida')
        .map((c) => c.motivo),
    ).toEqual([
      'FDA sem valor no perfil (campo vazio ou não informado pela fonte); não vira zero.',
      'FDA sem valor no perfil (campo vazio ou não informado pela fonte); não vira zero.',
    ]);
  });

  it('a soma das contribuições conhecidas reproduz a coluna impressa (o livro soma os traços como zero)', () => {
    const impresso = ALIMENTOS_4_4['Concentrado']!;
    for (const n of ['EE', 'FDNcp', 'FDA', 'LIG', 'CNF', 'PIDN', 'PIDA'] as const)
      confere(pct(nut(r, n).somaConhecidaGDia, 1), impresso[n]!, `${n} (soma conhecida)`);
  });

  it('PB parcial (mistura mineral sem PB publicada); soma conhecida 16,686, impresso 16,70 (divergência presa)', () => {
    const pb = nut(r, 'PB');
    expect(pb.situacao).toBe('parcial');
    expect(pb.contribuicoes.find((c) => c.alimentoNome === 'MM')!.motivo).toMatch(
      /Publicado sem número \("–"\)/,
    );
    diverge(pct(pb.somaConhecidaGDia, 1), '16,70', 'PB');
    confere(pct(pb.somaConhecidaGDia, 1), '16,686', 'PB integral');
    // PB 260 % da U:SA: N × 6,25, aceita acima de 100 % só com a parcela de NNP (PBu) declarada.
    const usa = pb.contribuicoes.find((c) => c.alimentoNome === 'U:SA')!;
    expect(usa.situacao).toBe('conhecida');
    expect(usa.avisos.join(' ')).toMatch(/não é proteína verdadeira/);
  });
});

describe('6B-1: Tabela 4.4 (p. 102), dieta 50:50 na MS', () => {
  const r = calcularOferta(dieta([item('Silagem', 0.5), ...concentrado(0.5)]));

  it('MS da dieta = MS total / MN total: 45,777; impresso 45,80 (divergência presa)', () => {
    expect(r.materiaSeca.totalKgMsDia).toBeCloseTo(1, 12);
    expect(r.materiaSeca.totalKgMnDia).toBeCloseTo(0.5 / 0.3092 + 0.5 / 0.88118, 3);
    diverge(r.materiaSeca.msPctMnDieta, DIETA_4_4.MS, 'MS');
    confere(r.materiaSeca.msPctMnDieta, '45,777', 'MS integral');
  });

  it('MO completa bate com o impresso (94,97)', () => {
    expect(nut(r, 'MO').situacao).toBe('completa');
    confere(nut(r, 'MO').concentracaoPctMs, DIETA_4_4.MO, 'MO');
  });

  it('soma conhecida em precisão integral: FDNcp, FDA e CNF batem; PB, EE, LIG, PIDN e PIDA divergem', () => {
    for (const n of ['FDNcp', 'FDA', 'CNF'] as const)
      confere(pct(nut(r, n).somaConhecidaGDia, 1), DIETA_4_4[n], n);
    // EE integral 3,42495 (impresso 3,43): 0,00005 além da meia unidade.
    for (const n of ['PB', 'EE', 'LIG', 'PIDN', 'PIDA'] as const)
      diverge(pct(nut(r, n).somaConhecidaGDia, 1), DIETA_4_4[n], n);
    for (const n of ['PB', 'EE', 'FDNcp', 'FDA', 'LIG', 'CNF', 'PIDN', 'PIDA'] as const)
      expect(nut(r, n).situacao, n).toBe('parcial');
  });

  it('por etapas: com a coluna "Concentrado" impressa, LIG, PIDN e PIDA batem; PB e MS seguem divergentes', () => {
    const etapas = calcularOferta(dieta([item('Silagem', 0.5), item('Concentrado', 0.5)]));
    for (const n of ['LIG', 'PIDN', 'PIDA', 'EE', 'FDNcp', 'FDA', 'CNF', 'MO'] as const)
      confere(nut(etapas, n).concentracaoPctMs, DIETA_4_4[n], `${n} por etapas`);
    // 0,5 × 7,26 + 0,5 × 16,70 = 11,98 (impresso 12,00); MS com 88,11 = 45,776 (impresso 45,80).
    confere(nut(etapas, 'PB').concentracaoPctMs, '11,98', 'PB por etapas');
    diverge(nut(etapas, 'PB').concentracaoPctMs, DIETA_4_4.PB, 'PB por etapas');
    diverge(etapas.materiaSeca.msPctMnDieta, DIETA_4_4.MS, 'MS por etapas');
  });

  it('PBu (parcela de NNP, p. 102): soma conhecida 1,95 (impresso 1,95); por etapas, 0,5 × 3,90 = 1,95', () => {
    confere(pct(nut(r, 'PBu').somaConhecidaGDia, 1), DIETA_4_4.PBu, 'PBu');
    const etapas = calcularOferta(dieta([item('Silagem', 0.5), item('Concentrado', 0.5)]));
    confere(pct(nut(etapas, 'PBu').somaConhecidaGDia, 1), DIETA_4_4.PBu, 'PBu por etapas');
    // A coluna "Concentrado" declara PB 16,70 e PBu 3,90: a parcela de 19,5 g está contida nos
    // 83,5 g de PB do concentrado, não somada a eles.
    const pb = nut(etapas, 'PB');
    expect(pb.parcelaEquivalenteNnpGDia).toBeCloseTo(19.5, 9);
    expect(pb.contribuicoes.find((c) => c.alimentoNome === 'Concentrado')!.gDia).toBeCloseTo(
      83.5,
      9,
    );
  });

  it('rastreio: perfis, regra e o valor de cada contribuição', () => {
    expect(r.perfis).toHaveLength(5);
    expect(r.perfis[0]).toEqual({
      perfilId: 'perfil-T44-Silagem',
      alimentoId: 'alimento-T44-Silagem',
      regra: { codigo: 'TESTE_TABELA_4_4', versao: 1 },
    });
    const c = nut(r, 'MO').contribuicoes[0]!;
    expect(c).toMatchObject({ valorId: 'T44-Silagem-MO', tipoValor: 'valor_unico' });
    expect(r.avisos[0]).toMatch(/Consumo assumido sem sobras: simulação/);
  });
});

// ---------------------------------------------------------------------------
// SINTÉTICO: números FICTÍCIOS, só para as regras (sem valor nutricional).
// ---------------------------------------------------------------------------

const valor = (
  nutriente: string,
  v: number,
  extra: Partial<ValorPerfilOferta> = {},
): ValorPerfilOferta => ({
  valorId: `FICT-${nutriente}-${v}`,
  nutriente,
  valor: v,
  valorPublicado: String(v).replace('.', ','),
  unidade: 'pct',
  base: nutriente === 'MS' ? 'mn' : 'ms',
  tipoValor: 'valor_unico',
  formaObtencao: 'medido',
  baseInferida: false,
  baseValidada: false,
  origens: ['FICTÍCIO'],
  ...extra,
});
function ficticio(
  nome: string,
  valores: ValorPerfilOferta[],
  extra: Partial<PerfilOferta> = {},
): PerfilOferta {
  return {
    perfilId: `perfil-FICT-${nome}`,
    alimentoId: `alimento-FICT-${nome}`,
    alimentoNome: `FICTÍCIO ${nome}`,
    regra: { codigo: 'FICT', versao: 1 },
    elegibilidade: { elegivel: true, motivos: [] },
    cautelas: [],
    valores,
    naoQuantificados: [],
    ...extra,
  };
}
const umItem = (p: PerfilOferta, kg = 10, unidade: 'kg MN/dia' | 'kg MS/dia' = 'kg MN/dia') => ({
  itemId: p.perfilId,
  perfil: p,
  quantidade: q(kg, unidade),
});
const oferta = (itens: ItemDieta[], nutrientes: string[], tipo: TipoQuantidade = 'oferecido') =>
  calcularOferta({ tipo, itens, nutrientes });

describe('6B-1 SINTÉTICO: MN, MS e tipos de quantidade', () => {
  const A = ficticio('A', [valor('MS', 50), valor('PB', 10)]);

  it('kg de MN → kg de MS pela MS do perfil; PB em base MS sobre a MS', () => {
    const r = oferta([umItem(A, 10)], ['PB']);
    expect(r.itens[0]).toMatchObject({ oferecidoKgMnDia: 10, oferecidoKgMsDia: 5, msPctMn: 50 });
    expect(r.nutrientes[0]).toMatchObject({
      situacao: 'completa',
      totalGDia: 500,
      concentracaoPctMs: 10,
    });
    expect(r.avisos[0]).toMatch(/Quantidade oferecida no cocho; não é o consumo/);
  });

  it('kg de MS → kg de MN pela mesma MS', () => {
    const r = oferta([umItem(A, 5, 'kg MS/dia')], ['PB']);
    expect(r.itens[0]).toMatchObject({ oferecidoKgMnDia: 10, oferecidoKgMsDia: 5 });
  });

  it('consumo observado = oferecido − sobras; o oferecido fica preservado; aviso sobre as sobras', () => {
    const r = oferta(
      [{ ...umItem(A, 10), sobras: q(2, 'kg MN/dia') }],
      ['PB'],
      'consumo_observado',
    );
    expect(r.itens[0]).toMatchObject({ oferecidoKgMnDia: 10, usadoKgMnDia: 8, usadoKgMsDia: 4 });
    expect(r.nutrientes[0]!.totalGDia).toBe(400);
    expect(r.avisos[0]).toMatch(/oferecido menos sobras medidas.*estimativas.*selecionar/);
    expect(r.naturezaConsumo).toBe('consumo_estimado_por_sobras');
    expect(() => oferta([umItem(A, 10)], ['PB'], 'consumo_observado')).toThrow(ErroOferta);
    expect(() =>
      oferta([{ ...umItem(A, 10), sobras: q(11, 'kg MN/dia') }], ['PB'], 'consumo_observado'),
    ).toThrow(/entre zero e o oferecido/);
    expect(() =>
      oferta([{ ...umItem(A, 10), sobras: q(1, 'kg MN/dia') }], ['PB'], 'oferecido'),
    ).toThrow(/Sobras só entram no consumo observado/);
  });

  it('unidade da quantidade explícita: kg/dia sem base é recusado; sobras em outra base também', () => {
    expect(() => oferta([{ ...umItem(A), quantidade: q(10, 'kg/dia') }], ['PB'])).toThrow(
      ErroOferta,
    );
    expect(() =>
      oferta([{ ...umItem(A, 10), sobras: q(1, 'kg MS/dia') }], ['PB'], 'consumo_observado'),
    ).toThrow(ErroUnidade);
  });
});

describe('6B-1 SINTÉTICO: ausência, zero e não quantificado nunca viram zero', () => {
  const comPb = ficticio('com PB', [valor('MS', 50), valor('PB', 10)]);
  const semPb = ficticio('sem PB', [valor('MS', 50)]);
  const nd = ficticio('ND', [valor('MS', 50)], {
    naoQuantificados: [{ nutriente: 'PB', textoPublicado: 'ND' }],
  });

  it('alimento sem o nutriente: oferta parcial, sem total; soma conhecida identificada', () => {
    const o = oferta([umItem(comPb), umItem(semPb)], ['PB']).nutrientes[0]!;
    expect(o).toMatchObject({
      situacao: 'parcial',
      totalGDia: null,
      somaConhecidaGDia: 500,
      concentracaoPctMs: null,
    });
    expect(o.contribuicoes[1]).toMatchObject({ situacao: 'desconhecida', gDia: null });
  });

  it('"ND" publicado: desconhecido, com o texto; todos desconhecidos: indeterminada, sem soma', () => {
    const o = oferta([umItem(nd)], ['PB']).nutrientes[0]!;
    expect(o).toMatchObject({
      situacao: 'indeterminada',
      totalGDia: null,
      somaConhecidaGDia: null,
    });
    expect(o.contribuicoes[0]!.motivo).toBe('Publicado sem número ("ND"); não vira zero.');
  });

  it('zero só com comprovação: "0" publicado vale; zero sem texto publicado fica desconhecido', () => {
    const zeroPublicado = ficticio('zero publicado', [
      valor('MS', 50),
      valor('PB', 0, { valorPublicado: '0,00' }),
    ]);
    const zeroSemFonte = ficticio('zero sem fonte', [
      valor('MS', 50),
      valor('PB', 0, { valorPublicado: null }),
    ]);
    expect(oferta([umItem(zeroPublicado)], ['PB']).nutrientes[0]).toMatchObject({
      situacao: 'completa',
      totalGDia: 0,
    });
    const o = oferta([umItem(zeroSemFonte)], ['PB']).nutrientes[0]!;
    expect(o.situacao).toBe('indeterminada');
    expect(o.contribuicoes[0]!.motivo).toMatch(/Zero sem comprovação explícita/);
  });

  it('percentual acima de 100 em fração mássica (natureza padrão): desconhecido', () => {
    const p = ficticio('acima', [valor('MS', 50), valor('PB', 150)]);
    expect(oferta([umItem(p)], ['PB']).nutrientes[0]!.contribuicoes[0]!.motivo).toMatch(
      /fora da faixa da unidade/,
    );
  });

  it('energia em Mcal/kg: sem conversão para massa nesta etapa (C-6B-16)', () => {
    const p = ficticio('energia', [valor('MS', 50), valor('EM', 2, { unidade: 'mcal_kg' })]);
    expect(oferta([umItem(p)], ['EM']).nutrientes[0]!.contribuicoes[0]!.motivo).toMatch(/C-6B-16/);
  });

  it('dieta vazia: tudo indeterminado', () => {
    const r = oferta([], ['PB']);
    expect(r.materiaSeca).toMatchObject({ totalKgMsDia: null, msPctMnDieta: null });
    expect(r.nutrientes[0]!.situacao).toBe('indeterminada');
  });
});

describe('6B-1 SINTÉTICO: decisões da aprovação (D-6B1-01 a 06)', () => {
  it('D-6B1-02: zero publicado aceito, com ressalva de arredondamento', () => {
    const p = ficticio('zero', [valor('MS', 50), valor('PB', 0, { valorPublicado: '0' })]);
    const c = oferta([umItem(p)], ['PB']).nutrientes[0]!.contribuicoes[0]!;
    expect(c.situacao).toBe('conhecida');
    expect(c.avisos.join(' ')).toMatch(/pode ser valor arredondado; não prova ausência absoluta/);
  });

  it('D-6B1-03: traço (com a legenda da fonte) e campo vazio ficam distintos', () => {
    const traco = ficticio('traço', [valor('MS', 50)], {
      naoQuantificados: [
        {
          nutriente: 'PB',
          textoPublicado: '–',
          natureza: 'tracos',
          significadoFonte: 'FICTÍCIO: legenda',
        },
      ],
    });
    const vazio = ficticio('vazio', [valor('MS', 50)]);
    const [a, b] = oferta([umItem(traco), umItem(vazio)], ['PB']).nutrientes[0]!.contribuicoes;
    expect(a!.motivo).toBe(
      'Publicado sem número ("–"; natureza: tracos; legenda da fonte: FICTÍCIO: legenda); não vira zero.',
    );
    expect(b!.motivo).toBe(
      'PB sem valor no perfil (campo vazio ou não informado pela fonte); não vira zero.',
    );
  });

  it('D-6B1-04: PB equivalente de NNP identificada à parte (Tabela 4.4, linha PBu da U:SA)', () => {
    const r = calcularOferta(dieta(concentrado(1)));
    const pb = r.nutrientes.find((n) => n.nutriente === 'PB')!;
    // 0,015 kg de MS × 2.600 g/kg = 39 g de PB equivalente de NNP por kg de MS do concentrado.
    expect(pb.parcelaEquivalenteNnpGDia).toBeCloseTo(39, 9);
    expect(pb.parcelaNnpIncompleta).toBe(false);
    expect(
      pb.contribuicoes.filter((c) => c.parcelaNnpGDia !== null).map((c) => c.alimentoNome),
    ).toEqual(['U:SA']);
    expect(r.nutrientes.find((n) => n.nutriente === 'EE')!.parcelaEquivalenteNnpGDia).toBeNull();
  });

  it('D-6B1-05: "uso com cautela" não bloqueia; perfil não elegível bloqueia', () => {
    const cautela = ficticio('cautela', [valor('MS', 50), valor('PB', 10)], {
      cautelas: ['Uso com cautela: FICTÍCIO.'],
    });
    expect(oferta([umItem(cautela)], ['PB']).nutrientes[0]!.situacao).toBe('completa');
  });

  it('D-6B1-06: garantia com contribuição desconhecida não vira limite: fica parcial, sem total', () => {
    const garantia = ficticio('garantia', [
      valor('MS', 50),
      valor('PB', 10, { tipoValor: 'minimo_garantido' }),
    ]);
    const semPb = ficticio('sem PB', [valor('MS', 50)]);
    expect(oferta([umItem(garantia), umItem(semPb)], ['PB']).nutrientes[0]).toMatchObject({
      situacao: 'parcial',
      totalGDia: null,
      somaConhecidaGDia: 0,
    });
  });
});

describe('migration 0018 SINTÉTICO: PB total e parcela de NNP, sem dupla contagem', () => {
  const pbTotal = (v: number) => valor('PB', v, { naturezaValor: 'equivalente_proteico' });
  const nnp = (v: number, extra: Partial<ValorPerfilOferta> = {}) =>
    valor('PBeqNNP', v, { naturezaValor: 'equivalente_proteico_nnp', ...extra });
  const pbDe = (p: PerfilOferta, kg = 1) => oferta([umItem(p, kg)], ['PB']).nutrientes[0]!;

  it('a parcela de NNP fica contida na PB total: o total é só a PB', () => {
    const o = pbDe(ficticio('N', [valor('MS', 100), pbTotal(200), nnp(150)]));
    expect(o.totalGDia).toBeCloseTo(2000, 9);
    expect(o.parcelaEquivalenteNnpGDia).toBeCloseTo(1500, 9);
    expect(o.contribuicoes[0]!.avisos.join(' ')).toMatch(/contida na PB total/);
  });

  it('PB acima de 100 % sem parcela de NNP declarada: desconhecida', () => {
    const o = pbDe(ficticio('N', [valor('MS', 100), pbTotal(200)]));
    expect(o.contribuicoes[0]!.motivo).toBe(
      'PB acima de 100 % sem parcela de PB equivalente de NNP declarada no perfil.',
    );
  });

  it('parcela de NNP maior que a PB total: inconsistência, desconhecida', () => {
    const o = pbDe(ficticio('N', [valor('MS', 100), pbTotal(20), nnp(30)]));
    expect(o.contribuicoes[0]!.motivo).toMatch(/maior que a PB total: inconsistência/);
  });

  it('parcela de NNP sem PB total: a PB fica desconhecida, a parcela não a substitui', () => {
    const o = pbDe(ficticio('N', [valor('MS', 100), nnp(30)]));
    expect(o.situacao).toBe('indeterminada');
    expect(o.contribuicoes[0]!.motivo).toMatch(/não substitui a PB total/);
  });

  it('identificação pela natureza, nunca pelo código: "PBeqNNP" em fração mássica não é parcela', () => {
    const o = pbDe(ficticio('N', [valor('MS', 100), pbTotal(20), valor('PBeqNNP', 10)]));
    expect(o.parcelaEquivalenteNnpGDia).toBeNull();
    expect(o.parcelaNnpIncompleta).toBe(false);
  });

  it('parcela de NNP em garantia de rótulo: não entra como valor; parcela total desconhecida', () => {
    const o = pbDe(
      ficticio('N', [valor('MS', 100), pbTotal(40), nnp(10, { tipoValor: 'maximo_garantido' })]),
    );
    expect(o.totalGDia).toBeCloseTo(400, 9);
    expect(o.parcelaEquivalenteNnpGDia).toBeNull();
    expect(o.parcelaNnpIncompleta).toBe(true);
  });

  it('duas parcelas de NNP no mesmo perfil: ambígua, parcela total desconhecida', () => {
    const o = pbDe(
      ficticio('N', [valor('MS', 100), pbTotal(40), nnp(10), nnp(12, { valorId: 'outro' })]),
    );
    expect(o.parcelaNnpIncompleta).toBe(true);
    expect(o.contribuicoes[0]!.avisos.join(' ')).toMatch(/Parcela de NNP não calculada/);
  });
});

describe('6B-1 SINTÉTICO: MS, base e elegibilidade', () => {
  it('6B-3: dois valores do mesmo nutriente no perfil (bases diferentes): desconhecido, sem escolha implícita', () => {
    const p = ficticio('ambíguo', [
      valor('MS', 50),
      valor('PB', 10),
      valor('PB', 5, { base: 'mn', valorId: 'FICT-PB-mn' }),
    ]);
    expect(oferta([umItem(p)], ['PB']).nutrientes[0]!.contribuicoes[0]!.motivo).toMatch(
      /Mais de um valor de PB no perfil/,
    );
    const ms = ficticio('MS dupla', [
      valor('MS', 50),
      valor('MS', 40, { tipoValor: 'mediana', valorId: 'FICT-MS-2' }),
    ]);
    expect(oferta([umItem(ms)], []).itens[0]!.motivos[0]).toMatch(/Mais de um valor de MS/);
  });

  it('sem MS: kg de MS desconhecido; nutriente em base MS desconhecido; MS total da dieta indeterminada', () => {
    const p = ficticio('sem MS', [valor('PB', 10)]);
    const r = oferta([umItem(p)], ['PB']);
    expect(r.itens[0]).toMatchObject({ oferecidoKgMsDia: null, msPctMn: null });
    expect(r.materiaSeca.totalKgMsDia).toBeNull();
    expect(r.nutrientes[0]!.contribuicoes[0]!.motivo).toMatch(
      /Falta converter a quantidade para a base MS/,
    );
  });

  it('MS com base interpretada e não validada não converte (C7); validada converte', () => {
    const inferida = (validada: boolean) =>
      ficticio('MS inferida', [
        valor('MS', 50, { baseInferida: true, baseValidada: validada }),
        valor('PB', 10),
      ]);
    expect(oferta([umItem(inferida(false))], ['PB']).itens[0]!.motivos[0]).toMatch(
      /não validada \(C7\)/,
    );
    expect(oferta([umItem(inferida(true))], ['PB']).nutrientes[0]!.situacao).toBe('completa');
  });

  it('rótulo: MS garantida não converte; nutriente em base MN com garantia mínima vira limite inferior', () => {
    const rotulo = ficticio('rótulo', [
      valor('MS', 88, { tipoValor: 'minimo_garantido' }),
      valor('Ca', 150, { unidade: 'g_kg', base: 'mn', tipoValor: 'minimo_garantido' }),
      valor('PB', 20, { tipoValor: 'minimo_garantido' }),
    ]);
    const r = oferta([umItem(rotulo, 0.1)], ['Ca', 'PB']);
    expect(r.itens[0]!.motivos[0]).toMatch(/garantia de rótulo \(limite\), não teor/);
    const ca = r.nutrientes[0]!;
    expect(ca).toMatchObject({ situacao: 'limite_inferior', concentracaoPctMs: null });
    expect(ca.totalGDia).toBeCloseTo(15, 12);
    expect(ca.contribuicoes[0]!.avisos.join(' ')).toMatch(/limite, não teor exato/);
    // PB em base MS precisaria da MS: desconhecida.
    expect(r.nutrientes[1]!.situacao).toBe('indeterminada');
  });

  it('garantia mínima e máxima juntas: limites mistos, sem total', () => {
    const min = ficticio('mínimo', [
      valor('MS', 50),
      valor('PB', 10, { tipoValor: 'minimo_garantido' }),
    ]);
    const max = ficticio('máximo', [
      valor('MS', 50),
      valor('PB', 10, { tipoValor: 'maximo_garantido' }),
    ]);
    expect(oferta([umItem(max)], ['PB']).nutrientes[0]!.situacao).toBe('limite_superior');
    expect(oferta([umItem(min), umItem(max)], ['PB']).nutrientes[0]).toMatchObject({
      situacao: 'limites_mistos',
      totalGDia: null,
    });
  });

  it('perfil não elegível: nenhuma contribuição nem MS dele entra', () => {
    const p = ficticio('não elegível', [valor('MS', 50), valor('PB', 10)], {
      elegibilidade: { elegivel: false, motivos: ['Regra de seleção não aprovada.'] },
    });
    const r = oferta([umItem(p)], ['PB']);
    expect(r.materiaSeca.totalKgMsDia).toBeNull();
    expect(r.nutrientes[0]!.contribuicoes[0]!.motivo).toBe(
      'Perfil não elegível: Regra de seleção não aprovada.',
    );
  });

  it('cautelas do perfil acompanham o alimento', () => {
    const p = ficticio('cautela', [valor('MS', 50)], { cautelas: ['Uso com cautela: FICTÍCIO.'] });
    expect(oferta([umItem(p)], []).itens[0]!.avisos).toEqual(['Uso com cautela: FICTÍCIO.']);
  });
});
