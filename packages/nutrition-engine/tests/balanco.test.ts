import { describe, expect, it } from 'vitest';
import {
  calcularBalanco,
  calcularMinerais,
  calcularOferta,
  calcularProteina,
  confereImpresso,
  exigenciasParaBalanco,
  fonteCmsDaOferta,
  FRASE_BALANCO,
  NIVEIS_TOXICOS_MACRO,
  q,
  type Categoria,
  type ExigenciasParaBalanco,
  type FonteCms,
  type ItemDieta,
  type PerfilOferta,
  type ResultadoOferta,
  type TipoQuantidade,
  type ValorPerfilOferta,
} from '../src';
import { ALIMENTOS_4_4, CONCENTRADO_4_4, NUTRIENTES_4_4 } from './dados/tabela-4-4';

/*
 * 6B-2: balanço exigência × oferta. Identificação dos casos no nome:
 * - "SINTÉTICO": composição FICTÍCIA, montada a partir da exigência calculada pelo motor só para
 *   pôr a oferta acima, abaixo ou na fronteira da exigência; sem valor nutricional;
 * - "CASO COMPOSTO": exigência do exemplo T-04 (p. 432–434) com a dieta da Tabela 4.4 (p. 102).
 *   Não é exemplo do livro: o livro não traz dieta e exigência juntas (C-6B-17).
 */
const Z: Categoria = { grupo: 'zebuino', sexo: 'macho_nao_castrado', sistema: 'confinamento' };
const ZF: Categoria = { grupo: 'zebuino', sexo: 'femea', sistema: 'confinamento' };

/** Exigências do motor para o animal, com o CMS indicado (normalmente, a MS consumida). */
function exigencias(c: Categoria, PC: number, GMD: number, cms: FonteCms): ExigenciasParaBalanco {
  const PCq = q(PC, 'kg');
  const GMDq = q(GMD, 'kg/dia');
  return exigenciasParaBalanco(
    calcularProteina(c, { PC: PCq, GMD: GMDq, cms }),
    calcularMinerais(c, { PC: PCq, GMD: GMDq }),
  );
}

const valor = (
  nutriente: string,
  v: number,
  extra: Partial<ValorPerfilOferta> = {},
): ValorPerfilOferta => ({
  valorId: `FICT-${nutriente}`,
  nutriente,
  valor: v,
  valorPublicado: String(v),
  unidade: 'pct',
  base: nutriente === 'MS' ? 'mn' : 'ms',
  tipoValor: 'valor_unico',
  formaObtencao: 'medido',
  baseInferida: false,
  baseValidada: false,
  origens: ['FICTÍCIO'],
  ...extra,
});
const perfil = (nome: string, valores: ValorPerfilOferta[]): PerfilOferta => ({
  perfilId: `perfil-FICT-${nome}`,
  alimentoId: `alimento-FICT-${nome}`,
  alimentoNome: `FICTÍCIO ${nome}`,
  regra: { codigo: 'FICT', versao: 1 },
  elegibilidade: { elegivel: true, motivos: [] },
  cautelas: [],
  valores,
  naoQuantificados: [],
});

/** SINTÉTICO: 10 kg de MS consumida (20 kg de MN a 50 % de MS). */
const MS_KG = 10;
const T04 = exigencias(Z, 520, 1.4, { origem: 'informado', CMS: q(MS_KG, 'kg/dia') });
const exigG = (e: ExigenciasParaBalanco, n: 'NDT' | 'PB' | 'Ca' | 'P') =>
  n === 'NDT' ? e.NDT.valor! * 1000 : n === 'PB' ? e.PB.valor! : e.minerais[n].dietetica.valor!;
/** % da MS que dá a oferta = fator × exigência, com 10 kg de MS. */
const pctPara = (n: 'NDT' | 'PB' | 'Ca' | 'P', fator: number) =>
  ((fator * exigG(T04, n)) / (MS_KG * 1000)) * 100;

function ofertaFicticia(
  valores: ValorPerfilOferta[],
  tipo: TipoQuantidade = 'consumo_assumido_sem_sobras',
  extras: ItemDieta[] = [],
): ResultadoOferta {
  return calcularOferta({
    tipo,
    itens: [
      {
        itemId: 'A',
        perfil: perfil('A', [valor('MS', 50), ...valores]),
        quantidade: q(20, 'kg MN/dia'),
      },
      ...extras,
    ],
    nutrientes: ['NDT', 'PB', 'Ca', 'P', 'Mg', 'Na', 'K', 'S'],
  });
}
const comp = (b: ReturnType<typeof calcularBalanco>, n: string) =>
  b.comparacoes.find((c) => c.nutriente === n)!;

describe('6B-2: CMS coerente com o consumo', () => {
  it('fonteCmsDaOferta: a MS consumida vira CMS informado; dieta só oferecida não tem CMS', () => {
    const o = ofertaFicticia([]);
    expect(fonteCmsDaOferta(o)).toEqual({ origem: 'informado', CMS: q(MS_KG, 'kg/dia') });
    expect(fonteCmsDaOferta(ofertaFicticia([], 'oferecido'))).toBeNull();
  });

  it('exigência com outro CMS: NDT e PB indeterminados; minerais (sem CMS) seguem comparáveis', () => {
    const outra = exigencias(Z, 520, 1.4, { origem: 'previsto', equacao: 'confinamento' });
    const o = ofertaFicticia([valor('NDT', pctPara('NDT', 1.2)), valor('Ca', pctPara('Ca', 1.2))]);
    const b = calcularBalanco(outra, o);
    expect(comp(b, 'NDT')).toMatchObject({ situacao: 'indeterminado' });
    expect(comp(b, 'NDT').fundamento).toMatch(/CMS diferente da MS consumida/);
    expect(comp(b, 'Ca').situacao).toBe('cobertura_teorica');
  });

  it('dieta só oferecida: balanço inteiro indeterminado (oferecido não é consumo)', () => {
    const b = calcularBalanco(T04, ofertaFicticia([valor('Ca', pctPara('Ca', 2))], 'oferecido'));
    expect(b.resumo).toEqual({ cobertura_teorica: 0, deficit_estimado: 0, indeterminado: 11 });
    expect(comp(b, 'Ca').fundamento).toMatch(/quantidade oferecida não é consumo/);
  });
});

describe('6B-2 SINTÉTICO: oferta completa', () => {
  it('acima ou igual à exigência: cobertura teórica, com diferença e % de cobertura', () => {
    const b = calcularBalanco(
      T04,
      ofertaFicticia([valor('PB', pctPara('PB', 1.1)), valor('NDT', pctPara('NDT', 1))]),
    );
    expect(comp(b, 'PB')).toMatchObject({ situacao: 'cobertura_teorica' });
    expect(comp(b, 'PB').coberturaPct).toBeCloseTo(110, 9);
    expect(comp(b, 'PB').diferencaGDia).toBeCloseTo(0.1 * exigG(T04, 'PB'), 9);
    expect(comp(b, 'NDT').situacao).toBe('cobertura_teorica');
    expect(comp(b, 'NDT').exigencia.gDia).toBeCloseTo(T04.NDT.valor! * 1000, 9);
  });

  it('abaixo da exigência: déficit estimado', () => {
    const b = calcularBalanco(T04, ofertaFicticia([valor('P', pctPara('P', 0.9))]));
    expect(comp(b, 'P')).toMatchObject({ situacao: 'deficit_estimado' });
    expect(comp(b, 'P').diferencaGDia!).toBeLessThan(0);
  });
});

describe('6B-2 SINTÉTICO: garantias e oferta parcial', () => {
  const garantia = (n: 'PB' | 'Ca', fator: number, tipo: 'minimo_garantido' | 'maximo_garantido') =>
    valor(n, pctPara(n, fator), { tipoValor: tipo });

  it('limite inferior acima da exigência: cobertura; abaixo: indeterminado', () => {
    expect(
      comp(calcularBalanco(T04, ofertaFicticia([garantia('Ca', 1.05, 'minimo_garantido')])), 'Ca'),
    ).toMatchObject({
      situacao: 'cobertura_teorica',
      diferencaGDia: null,
    });
    expect(
      comp(calcularBalanco(T04, ofertaFicticia([garantia('Ca', 0.95, 'minimo_garantido')])), 'Ca')
        .situacao,
    ).toBe('indeterminado');
  });

  it('limite superior abaixo da exigência: déficit; acima: indeterminado', () => {
    expect(
      comp(calcularBalanco(T04, ofertaFicticia([garantia('PB', 0.95, 'maximo_garantido')])), 'PB')
        .situacao,
    ).toBe('deficit_estimado');
    expect(
      comp(calcularBalanco(T04, ofertaFicticia([garantia('PB', 1.05, 'maximo_garantido')])), 'PB')
        .situacao,
    ).toBe('indeterminado');
  });

  it('oferta parcial nunca conclui, mesmo com a soma conhecida acima da exigência', () => {
    const semPb: ItemDieta = {
      itemId: 'B',
      perfil: perfil('B sem PB', [valor('MS', 50)]),
      quantidade: q(2, 'kg MN/dia'),
    };
    const o = ofertaFicticia([valor('PB', pctPara('PB', 3))], 'consumo_assumido_sem_sobras', [
      semPb,
    ]);
    const cms = fonteCmsDaOferta(o)!;
    const b = calcularBalanco(exigencias(Z, 520, 1.4, cms), o);
    expect(comp(b, 'PB')).toMatchObject({
      situacao: 'indeterminado',
      oferta: { situacao: 'parcial', gDia: null },
    });
    expect(comp(b, 'PB').oferta.somaConhecidaGDia!).toBeGreaterThan(comp(b, 'PB').exigencia.gDia!);
    expect(comp(b, 'PB').fundamento).toMatch(
      /soma das contribuições conhecidas não é a oferta total/,
    );
  });

  it('limites mistos: indeterminado', () => {
    const max: ItemDieta = {
      itemId: 'B',
      perfil: perfil('B', [valor('MS', 50), valor('PB', 1, { tipoValor: 'maximo_garantido' })]),
      quantidade: q(2, 'kg MN/dia'),
    };
    const o = ofertaFicticia(
      [garantia('PB', 2, 'minimo_garantido')],
      'consumo_assumido_sem_sobras',
      [max],
    );
    const b = calcularBalanco(exigencias(Z, 520, 1.4, fonteCmsDaOferta(o)!), o);
    expect(comp(b, 'PB')).toMatchObject({
      situacao: 'indeterminado',
      oferta: { situacao: 'limites_mistos' },
    });
  });
});

describe('6B-2 SINTÉTICO: PB com equivalente de NNP', () => {
  it('a comparação de PB mostra a parcela de NNP e avisa que não é proteína verdadeira', () => {
    const ureia: ItemDieta = {
      itemId: 'U',
      perfil: perfil('NNP', [
        valor('MS', 100),
        valor('PB', 200, { naturezaValor: 'equivalente_proteico' }),
        valor('PBeqNNP', 200, { naturezaValor: 'equivalente_proteico_nnp' }),
      ]),
      quantidade: q(0.1, 'kg MN/dia'),
    };
    const o = ofertaFicticia([valor('PB', pctPara('PB', 1))], 'consumo_assumido_sem_sobras', [
      ureia,
    ]);
    const b = calcularBalanco(exigencias(Z, 520, 1.4, fonteCmsDaOferta(o)!), o);
    expect(comp(b, 'PB').oferta.parcelaEquivalenteNnpGDia).toBeCloseTo(200, 9);
    expect(comp(b, 'PB').motivos[0]).toMatch(/equivalente de NNP, que não é proteína verdadeira/);
  });
});

describe('6B-2: decisões da aprovação (D-6B2-01 a 05)', () => {
  it('D-6B2-01: oferta parcial mostra o piso das contribuições conhecidas, sem total nem conclusão', () => {
    const semPb: ItemDieta = {
      itemId: 'B',
      perfil: perfil('B sem PB', [valor('MS', 50)]),
      quantidade: q(2, 'kg MN/dia'),
    };
    const o = ofertaFicticia([valor('PB', pctPara('PB', 3))], 'consumo_assumido_sem_sobras', [
      semPb,
    ]);
    const c = comp(calcularBalanco(exigencias(Z, 520, 1.4, fonteCmsDaOferta(o)!), o), 'PB');
    expect(c).toMatchObject({ situacao: 'indeterminado', oferta: { gDia: null } });
    expect(c.pisoConhecidoGDia).toBe(c.oferta.somaConhecidaGDia);
    expect(c.pisoConhecidoGDia).not.toBeNull();
  });

  it('D-6B2-02: igualdade é cobertura teórica, sem tolerância', () => {
    const c = comp(calcularBalanco(T04, ofertaFicticia([valor('P', pctPara('P', 1))])), 'P');
    expect(c.situacao).toBe('cobertura_teorica');
    expect(c.coberturaPct).toBeCloseTo(100, 9);
  });

  it('D-6B2-03: concentração na MS só como informação, ao lado da comparação em g/dia', () => {
    const c = comp(calcularBalanco(T04, ofertaFicticia([valor('PB', 12)])), 'PB');
    expect(c.concentracao.ofertaPctMs).toBeCloseTo(12, 12);
    expect(c.concentracao.exigenciaPctMs).toBeCloseTo((T04.PB.valor! / (MS_KG * 1000)) * 100, 12);
  });

  it('D-6B2-04: cobertura de PB com NNP é numérica, de PB equivalente; traz a cobertura sem NNP', () => {
    const ureia: ItemDieta = {
      itemId: 'U',
      perfil: perfil('NNP', [
        valor('MS', 100),
        valor('PB', 200, { naturezaValor: 'equivalente_proteico' }),
        valor('PBeqNNP', 200, { naturezaValor: 'equivalente_proteico_nnp' }),
      ]),
      quantidade: q(0.1, 'kg MN/dia'),
    };
    const o = ofertaFicticia([valor('PB', pctPara('PB', 1))], 'consumo_assumido_sem_sobras', [
      ureia,
    ]);
    const c = comp(calcularBalanco(exigencias(Z, 520, 1.4, fonteCmsDaOferta(o)!), o), 'PB');
    expect(c.fundamento).toMatch(
      /Cobertura numérica de PB equivalente.*não afirma atendimento proteico/,
    );
    expect(c.pbEquivalente!.parcelaNnpGDia).toBeCloseTo(200, 9);
    expect(c.pbEquivalente!.coberturaSemNnpPct).toBeLessThan(c.coberturaPct!);
  });

  it('migration 0018: parcela de NNP não calculada deixa a cobertura sem NNP desconhecida', () => {
    const ureia: ItemDieta = {
      itemId: 'U',
      perfil: perfil('NNP', [
        valor('MS', 100),
        valor('PB', 200, { naturezaValor: 'equivalente_proteico' }),
        valor('PBeqNNP', 200, {
          naturezaValor: 'equivalente_proteico_nnp',
          tipoValor: 'maximo_garantido',
        }),
      ]),
      quantidade: q(0.1, 'kg MN/dia'),
    };
    const o = ofertaFicticia([valor('PB', pctPara('PB', 1))], 'consumo_assumido_sem_sobras', [
      ureia,
    ]);
    const c = comp(calcularBalanco(exigencias(Z, 520, 1.4, fonteCmsDaOferta(o)!), o), 'PB');
    expect(c.pbEquivalente).toEqual({ parcelaNnpGDia: null, coberturaSemNnpPct: null });
    expect(c.motivos.join(' ')).toMatch(/cobertura sem NNP fica desconhecida/);
  });

  it('D-6B2-05: Tabela 10.13 (p. 263) transcrita como impressa, com a fonte citada; P não consta', () => {
    expect(
      Object.fromEntries(
        Object.entries(NIVEIS_TOXICOS_MACRO).map(([m, n]) => [
          m,
          [n.gKgMs.impresso, n.fonteCitada],
        ]),
      ),
    ).toEqual({
      Ca: ['44', 'NRC (2000)'],
      K: ['20', 'NASEM (2016)'],
      Mg: ['4', 'NRC (2000)'],
      Na: ['65', 'NRC (2000)'],
      S: ['4', 'NRC (2000)'],
    });
  });

  it('D-6B2-05: alerta só com concentração completa; não muda o balanço nem diagnostica', () => {
    // SINTÉTICO: Ca 5 % da MS = 50 g/kg de MS, acima de 44.
    const b = calcularBalanco(T04, ofertaFicticia([valor('Ca', 5)]));
    expect(b.seguranca.alertas).toHaveLength(1);
    expect(b.seguranca.alertas[0]).toMatchObject({
      mineral: 'Ca',
      nivelToxicoGKgMs: 44,
      fonteCitada: 'NRC (2000)',
    });
    expect(b.seguranca.alertas[0]!.concentracaoGKgMs).toBeCloseTo(50, 9);
    expect(b.seguranca.alertas[0]!.texto).toMatch(/não diagnostica intoxicação/);
    expect(b.seguranca.nota).toMatch(/ausência de alerta não garante segurança/);
    expect(comp(b, 'Ca').situacao).toBe('cobertura_teorica');
    expect(b.seguranca.naoAvaliados).toEqual(['K', 'Mg', 'Na', 'S']);
    // Abaixo do nível: sem alerta. Garantia (limite) ou oferta parcial: não avaliado.
    expect(calcularBalanco(T04, ofertaFicticia([valor('Ca', 1)])).seguranca.alertas).toEqual([]);
    expect(
      calcularBalanco(T04, ofertaFicticia([valor('Ca', 5, { tipoValor: 'minimo_garantido' })]))
        .seguranca.naoAvaliados,
    ).toContain('Ca');
  });
});

describe('6B-2: escopo e limites científicos', () => {
  it('exigência fora do domínio: indisponível para comparação, com o motivo do motor', () => {
    // Zebuína confinada de 500 kg: fora do domínio de energia (Tabela 8.1).
    const e = exigencias(ZF, 500, 0.8, { origem: 'informado', CMS: q(MS_KG, 'kg/dia') });
    const b = calcularBalanco(e, ofertaFicticia([valor('NDT', 90)]));
    expect(comp(b, 'NDT')).toMatchObject({
      situacao: 'indeterminado',
      exigencia: { usoOperacional: false },
    });
    expect(comp(b, 'NDT').fundamento).toMatch(/Exigência indisponível para comparação operacional/);
    expect(comp(b, 'NDT').motivos.length).toBeGreaterThan(0);
  });

  it('PDR, PNDR e PM sempre indeterminados (C5); Mg, Na, K e S sem composição: indeterminados', () => {
    const b = calcularBalanco(T04, ofertaFicticia([valor('PB', pctPara('PB', 1.2))]));
    for (const n of ['PDR', 'PNDR', 'PM'])
      expect(comp(b, n).fundamento, n).toMatch(/degradação ruminal.*\(C5\)/);
    for (const n of ['Mg', 'Na', 'K', 'S']) expect(comp(b, n).situacao, n).toBe('indeterminado');
  });

  it('Ca/P é indicador, não comparação: aparece à parte, sem situação de balanço', () => {
    const b = calcularBalanco(
      T04,
      ofertaFicticia([valor('Ca', pctPara('Ca', 1)), valor('P', pctPara('P', 1))]),
    );
    expect(b.comparacoes.map((c) => c.nutriente)).not.toContain('CaP');
    expect(b.indicadorCaP.exigencia).toBeCloseTo(T04.minerais.CaP.valor!, 12);
    expect(b.indicadorCaP.oferta).toBeCloseTo(T04.minerais.CaP.valor!, 9);
    expect(b.indicadorCaP.motivos[0]).toMatch(/não critério de adequação/);
    expect(calcularBalanco(T04, ofertaFicticia([valor('Ca', 1)])).indicadorCaP.oferta).toBeNull();
  });

  it('nunca declara adequação completa: a frase vale mesmo com todos os comparados cobertos', () => {
    const b = calcularBalanco(
      T04,
      ofertaFicticia(['NDT', 'PB', 'Ca', 'P'].map((n) => valor(n, pctPara(n as 'PB', 1.05)))),
    );
    expect(b.resumo.cobertura_teorica).toBe(4);
    expect(b.avisos[0]).toBe(FRASE_BALANCO);
    expect(b.avisos.join(' ')).toMatch(/Avaliação parcial: 7 de 11 nutrientes sem conclusão/);
    expect(JSON.stringify(b)).not.toMatch(/adequad[ao] (completa|nutricional)[^:]/);
  });

  it('consumo assumido e observado identificados nos avisos', () => {
    expect(calcularBalanco(T04, ofertaFicticia([])).avisos.join(' ')).toMatch(
      /balanço de simulação/,
    );
  });
});

describe('6B-2 CASO COMPOSTO: T-04 (p. 432–434) com a dieta da Tabela 4.4 (p. 102)', () => {
  it('composição da Tabela 4.4 sem NDT, Ca e P e com PB parcial: nada conclui; exigência coerente com a MS consumida', () => {
    // 10,62 kg de MS consumida (CMS do T-04), dieta 50:50 na MS. Consumo assumido sem sobras.
    const kgMs = 10.62;
    const perfil44 = (nome: string): PerfilOferta => {
      const col = ALIMENTOS_4_4[nome]!;
      const valores: ValorPerfilOferta[] = [];
      const naoQuantificados: PerfilOferta['naoQuantificados'][number][] = [];
      for (const n of NUTRIENTES_4_4) {
        const c = col[n];
        if (c === null) continue;
        if (c === '–') naoQuantificados.push({ nutriente: n, textoPublicado: '–' });
        else
          valores.push(
            valor(n, Number(c.replace(',', '.')), {
              valorId: `T44-${nome}-${n}`,
              valorPublicado: c,
              naturezaValor:
                n === 'PBu'
                  ? 'equivalente_proteico_nnp'
                  : n === 'PB'
                    ? 'equivalente_proteico'
                    : 'fracao_massica',
              origens: ['BR-CORTE 2023, Tabela 4.4, p. 102'],
            }),
          );
      }
      return { ...perfil(nome, valores), alimentoNome: nome, naoQuantificados };
    };
    const itens: ItemDieta[] = [
      { itemId: 'Silagem', perfil: perfil44('Silagem'), quantidade: q(kgMs * 0.5, 'kg MS/dia') },
      ...Object.entries(CONCENTRADO_4_4).map(([nome, p]) => ({
        itemId: nome,
        perfil: perfil44(nome),
        quantidade: q(kgMs * 0.5 * p, 'kg MS/dia'),
      })),
    ];
    const o = calcularOferta({
      tipo: 'consumo_assumido_sem_sobras',
      itens,
      nutrientes: ['NDT', 'PB', 'Ca', 'P'],
    });
    const cms = fonteCmsDaOferta(o)!;
    expect(cms.origem === 'informado' && cms.CMS!.valor).toBeCloseTo(kgMs, 12);
    const b = calcularBalanco(exigencias(Z, 520, 1.4, cms), o);
    expect(b.resumo).toEqual({ cobertura_teorica: 0, deficit_estimado: 0, indeterminado: 11 });
    expect(comp(b, 'PB').oferta.situacao).toBe('parcial');
    expect(comp(b, 'NDT').oferta.situacao).toBe('indeterminada');
    // A exigência é a do T-04 com o mesmo CMS: PB 1135 g/dia (p. 433), disponível.
    expect(comp(b, 'PB').exigencia.usoOperacional).toBe(true);
    expect(confereImpresso(comp(b, 'PB').exigencia.gDia!, '1135')).toBe(true);
  });
});
