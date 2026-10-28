import { describe, expect, it } from 'vitest';
import {
  aplicar,
  APROVACAO_MINERAIS,
  calcularMinerais,
  confereImpresso,
  EQUACOES_MINERAIS,
  ErroUnidade,
  MACROMINERAIS,
  q,
  registroMinerais,
  RELACAO_CA_P_EQ,
  type Categoria,
  type ClasseSexual,
  type GrupoGenetico,
  type Macromineral,
} from '../src';
import { TABELAS_17_MINERAIS } from './dados/tabelas-17-minerais';

/*
 * 6A-6: macrominerais do BR-CORTE 2023 (INVENTARIO_BR_CORTE.md, seções 3.5 e 17). Valores
 * esperados como impressos, página citada; precisão integral (D-PESO-02). Reprodução de etapas
 * arredondadas pelo livro fica em teste separado.
 */
const cat = (
  grupo: GrupoGenetico,
  sexo: ClasseSexual = 'macho_nao_castrado',
  sistema: Categoria['sistema'] = 'confinamento',
): Categoria => ({ grupo, sexo, sistema });
const Z = cat('zebuino');
function confere(calculado: number | null, impresso: string, onde: string) {
  expect(calculado, onde).not.toBeNull();
  expect(
    confereImpresso(calculado!, impresso),
    `${onde}: calculado ${calculado}, impresso ${impresso}`,
  ).toBe(true);
}
const minerais = (c: Categoria, PC: number, GMD: number) =>
  calcularMinerais(c, { PC: q(PC, 'kg'), GMD: q(GMD, 'kg/dia') });
/** [mantença, ganho, líquida, dietética] como impressos. */
type Linha = readonly [string, string, string, string];
function confereMineral(r: ReturnType<typeof minerais>, m: Macromineral, l: Linha, onde: string) {
  confere(r[m].mantenca.valor, l[0], `${onde} ${m} mantença`);
  confere(r[m].ganho.valor, l[1], `${onde} ${m} ganho`);
  confere(r[m].liquida.valor, l[2], `${onde} ${m} líquida`);
  confere(r[m].dietetica.valor, l[3], `${onde} ${m} dietética`);
}

describe('6A-6: registro das equações de macrominerais', () => {
  it('24 equações (mantença, ganho, líquida e dietética de Ca, P, Mg, Na, K e S); aprovadas pelo usuário', () => {
    const ids = registroMinerais()
      .listar()
      .map((e) => e.id);
    expect(ids).toHaveLength(25);
    expect(ids[24]).toBe('BRC23-M-CaP');
    expect(RELACAO_CA_P_EQ.conferencia.aprovacaoUsuario).toEqual(APROVACAO_MINERAIS);
    expect(ids.slice(0, 4)).toEqual([
      'BRC23-M-Ca-1',
      'BRC23-M-Ca-2',
      'BRC23-M-Ca-3',
      'BRC23-M-Ca-4',
    ]);
    for (const m of MACROMINERAIS)
      for (const e of EQUACOES_MINERAIS[m]) {
        expect(e.conferencia.conferencias[0]!.paginas).toContain(264);
        expect(e.conferencia.aprovacaoUsuario).toEqual(APROVACAO_MINERAIS);
        expect(e.saida).toBe('g/dia');
      }
  });

  it('coeficientes da Tabela 10.14 (p. 264): mantença, retenção, ganho e plateau por grupo', () => {
    const [mt, gn, , dt] = EQUACOES_MINERAIS.Ca;
    expect(mt.coeficientes(Z)).toEqual({ mgPorKgPC: 11.7 });
    expect(dt.coeficientes(Z)).toEqual({ retencaoPct: 56.8 });
    expect(gn.coeficientes(Z)).toEqual({ a: 147, b: -0.5, plateauPCVZ: 462 });
    expect(gn.coeficientes(cat('cruzado_corte'))).toEqual({ a: 66, b: -0.32, plateauPCVZ: 453 });
    // "Cruzado": corte e leite com a mesma equação (p. 242; A-04).
    expect(gn.coeficientes(cat('cruzado_leite', 'femea'))).toEqual(
      gn.coeficientes(cat('cruzado_corte')),
    );
    expect(EQUACOES_MINERAIS.P[1].coeficientes(Z)).toEqual({ a: 38.6, b: -0.36, plateauPCVZ: 445 });
    expect(EQUACOES_MINERAIS.Mg[1].coeficientes(cat('cruzado_leite'))).toEqual({
      a: 1.0597,
      b: -0.2386,
    });
    expect(EQUACOES_MINERAIS.S[1].coeficientes(Z)).toEqual(
      EQUACOES_MINERAIS.S[1].coeficientes(cat('cruzado_corte')),
    );
    const ret = MACROMINERAIS.map((m) => EQUACOES_MINERAIS[m][3].coeficientes(Z)['retencaoPct']);
    expect(ret).toEqual([56.8, 67.8, 35.5, 37.1, 48.4, 77.3]);
    const mant = MACROMINERAIS.map((m) => EQUACOES_MINERAIS[m][0].coeficientes(Z)['mgPorKgPC']);
    expect(mant).toEqual([11.7, 13.5, 5.9, 6.3, 23.5, 10.4]);
  });
});

describe('6A-6: exemplos do livro', () => {
  it('T-04 (p. 433–434): zebuíno não castrado confinado, 520 kg, 1,4 kg/dia, em precisão integral', () => {
    const r = minerais(Z, 520, 1.4);
    // Ca: o livro imprime ganho 9,39 na linha e 9,38 na soma, e líquida 15,47 na soma e 15,46 na
    // divisão (A-10); em precisão integral, 9,389 e 15,473.
    confereMineral(r, 'Ca', ['6,08', '9,39', '15,47', '27,24'], 'T-04');
    // P: PCVZ 450,1 kg acima do plateau de zebuínos (445 kg): ganho zero.
    confereMineral(r, 'P', ['7,02', '0,0', '7,02', '10,35'], 'T-04');
    expect(r.P.ganho.valor).toBe(0);
    confereMineral(r, 'Mg', ['3,07', '0,50', '3,57', '10,06'], 'T-04');
    confereMineral(r, 'Na', ['3,28', '1,21', '4,49', '12,10'], 'T-04');
    confereMineral(r, 'K', ['12,2', '2,70', '14,92', '30,82'], 'T-04');
    confereMineral(r, 'S', ['5,41', '9,34', '14,75', '19,08'], 'T-04');
    for (const m of MACROMINERAIS) expect(r[m].dietetica.situacao, m).toBe('valido');
    // p. 433: "Relação Ca/P = 27,24/10,35 = 2,63".
    confere(r.CaP.valor, '2,63', 'Ca/P');
    expect(r.CaP).toMatchObject({ unidade: 'adimensional', situacao: 'valido' });
  });

  it('T-03 (p. 264–265): 400 kg, 1,0 kg/dia, em precisão integral (PCVZ 343,62; o livro usa 344)', () => {
    const r = minerais(Z, 400, 1);
    confere(r.PCVZ.valor, '343,62', 'PCVZ');
    confere(r.GPCVZ.valor, '0,963', 'GPCVZ');
    // D-MIN-04: valores integrais; os impressos vêm de PCVZ 344 e de etapas arredondadas.
    confereMineral(r, 'Ca', ['4,68', '7,637', '12,317', '21,684'], 'T-03');
    confereMineral(r, 'P', ['5,40', '4,542', '9,942', '14,663'], 'T-03');
    confereMineral(r, 'Mg', ['2,36', '0,3565', '2,7165', '7,652'], 'T-03');
    confereMineral(r, 'Na', ['2,52', '0,9355', '3,4555', '9,314'], 'T-03');
    confereMineral(r, 'K', ['9,40', '1,854', '11,254', '23,251'], 'T-03');
    confereMineral(r, 'S', ['4,16', '5,222', '9,382', '12,137'], 'T-03');
    // p. 265: "Relação Ca/P = 21,67/14,66 = 1,48"; integral 21,684 / 14,663 = 1,479.
    confere(r.CaP.valor, '1,48', 'Ca/P');
  });

  it('T-03, etapas a partir dos valores impressos (PCVZ 344; arredondamento intermediário)', () => {
    const ganho = (m: Macromineral) =>
      aplicar(EQUACOES_MINERAIS[m][1], Z, { GPCVZ: q(0.963, 'kg/dia'), PCVZ: q(344, 'kg') }).valor!;
    const diet = (m: Macromineral, liquida: number) =>
      aplicar(EQUACOES_MINERAIS[m][3], Z, { liquida: q(liquida, 'g/dia') }).valor!;
    const passos: [Macromineral, string, number, string][] = [
      ['Ca', '7,63', 12.31, '21,67'],
      ['P', '4,54', 9.94, '14,66'],
      ['Mg', '0,36', 2.72, '7,66'],
      ['Na', '0,94', 3.46, '9,33'],
      ['K', '1,85', 11.25, '23,24'],
      ['S', '5,23', 9.39, '12,15'],
    ];
    for (const [m, g, liq, d] of passos) {
      confere(ganho(m), g, `${m} ganho`);
      confere(diet(m, liq), d, `${m} dietética`);
    }
    // D-MIN-05: o livro imprime 12,19 para o S, mas 9,39 / 0,773 = 12,147.
    expect(confereImpresso(diet('S', 9.39), '12,19')).toBe(false);
    // D-MIN-06: Na impresso "6,3 × 400 = 2511 mg = 2,52 g/dia"; 6,3 × 400 = 2520 mg.
    confere(minerais(Z, 400, 1).Na.mantenca.valor, '2,520', 'Na mantença');
  });
});

describe('6A-6: Tabelas 17.3b a 17.12b (p. 442–469), exigências dietéticas', () => {
  const COLUNAS = ['Ca', 'P', 'Mg', 'Na', 'K', 'S'] as const;
  for (const t of TABELAS_17_MINERAIS)
    it(`Tabela ${t.tabela} (p. ${t.pagina}): ${t.grupo}, ${t.sexo}, ${t.sistema}: Ca, P, Mg, Na, K e S`, () => {
      const c = cat(t.grupo, t.sexo, t.sistema);
      for (const [PC, GMD, ca, p, caP, mg, na, k, s] of t.linhas) {
        const r = minerais(c, PC, GMD);
        if (t.tabela === '17.8b' && PC === 510 && GMD === 1.8) {
          // D-MIN-12: a tabela imprime Ca/P 24,3 (repete o P, 24,31); 10,51 / 24,31 = 0,432.
          expect(caP).toBe('24,3');
          confere(r.CaP.valor, '0,432', 'Ca/P recalculada');
        } else confere(r.CaP.valor, caP, `PC ${PC}, GMD ${GMD}, Ca/P`);
        const impressos = [ca, p, mg, na, k, s];
        COLUNAS.forEach((m, i) =>
          confere(r[m].dietetica.valor, impressos[i]!, `PC ${PC}, GMD ${GMD}, ${m}`),
        );
      }
    });
});

describe('6A-6: plateau, escopo, domínio e unidades', () => {
  it('plateau de Ca e P: ganho zero a partir do PCVZ do plateau (Tabelas 10.8 e 10.9)', () => {
    const g = (m: 'Ca' | 'P', c: Categoria, PCVZ: number) =>
      aplicar(EQUACOES_MINERAIS[m][1], c, { GPCVZ: q(1, 'kg/dia'), PCVZ: q(PCVZ, 'kg') }).valor;
    expect(g('Ca', Z, 461.9)).toBeGreaterThan(0);
    expect(g('Ca', Z, 462)).toBe(0);
    expect(g('Ca', cat('cruzado_leite'), 453)).toBe(0);
    expect(g('Ca', cat('cruzado_leite'), 452.9)).toBeGreaterThan(0);
    expect(g('P', Z, 445)).toBe(0);
    expect(g('P', cat('cruzado_corte'), 478.9)).toBeGreaterThan(0);
    expect(g('P', cat('cruzado_corte'), 479)).toBe(0);
  });

  it('GMD zero: ganho zero e dietética só de mantença; GMD negativo fora do escopo', () => {
    const r = minerais(Z, 400, 0);
    for (const m of MACROMINERAIS) {
      expect(r[m].ganho.valor, m).toBe(0);
      expect(r[m].dietetica.situacao, m).toBe('valido');
    }
    expect(minerais(Z, 400, -0.1).Ca.ganho.situacao).toBe('fora_do_escopo');
    expect(minerais(Z, 400, -0.1).Ca.mantenca.situacao).toBe('valido');
  });

  it('mantença: PC fora da Tabela 10.3 (125 a 557 kg) sem uso operacional', () => {
    const r = minerais(Z, 600, 1);
    expect(r.K.mantenca).toMatchObject({ situacao: 'fora_do_dominio', usoOperacional: false });
    expect(r.K.mantenca.motivos[0]).toMatch(
      /PC = 600 kg .*\(125 a 557 kg; Tabela 10\.3, p\. 240\)/,
    );
    expect(r.K.dietetica.usoOperacional).toBe(false);
  });

  it('ganho: PCVZ e GPCVZ da categoria (Tabela 10.5) e do S (Tabela 10.6)', () => {
    // Zebuína confinada: PCVZ dos dados até 368 kg.
    const r = minerais(cat('zebuino', 'femea'), 500, 0.8);
    expect(r.Ca.ganho.situacao).toBe('fora_do_dominio');
    expect(r.Ca.ganho.motivos[0]).toMatch(/Tabela 10\.5, p\. 243/);
    expect(r.S.ganho.motivos[0] ?? '').not.toMatch(/Tabela 10\.5/);
  });

  it('D-MIN-03: zebuíno castrado a pasto sem linha na Tabela 10.5: ganho sem uso operacional', () => {
    const r = minerais(cat('zebuino', 'macho_castrado', 'pasto'), 350, 0.5);
    expect(r.Ca.ganho).toMatchObject({ situacao: 'fora_do_dominio', usoOperacional: false });
    expect(r.Ca.ganho.motivos[0]).toMatch(/Sem banco de dados publicado.*D-MIN-03/);
    expect(r.Ca.mantenca.situacao).toBe('valido');
    expect(r.S.ganho.situacao).toBe('valido');
  });

  it('fêmea a pasto fora do escopo (restrição do projeto)', () => {
    expect(minerais(cat('zebuino', 'femea', 'pasto'), 350, 0.5).Ca.dietetica.situacao).toBe(
      'fora_do_escopo',
    );
  });

  it('Ca/P: razão de exigências, com aviso; P zero não calcula; sem P, indeterminada', () => {
    const r = minerais(Z, 400, 1);
    expect(r.CaP.valor).toBeCloseTo(r.Ca.dietetica.valor! / r.P.dietetica.valor!, 12);
    expect(r.CaP.notas.join(' ')).toMatch(/não é a relação Ca\/P da dieta/);
    expect(aplicar(RELACAO_CA_P_EQ, Z, { Ca: q(20, 'g/dia'), P: q(0, 'g/dia') }).situacao).toBe(
      'fora_do_escopo',
    );
    expect(calcularMinerais(Z, { PC: null, GMD: q(1, 'kg/dia') }).CaP.situacao).toBe(
      'indeterminado',
    );
    // Fora do domínio na mantença (PC 600) propaga à Ca/P.
    expect(minerais(Z, 600, 1).CaP.usoOperacional).toBe(false);
  });

  it('sem PC: tudo indeterminado, nunca zero', () => {
    const r = calcularMinerais(Z, { PC: null, GMD: q(1, 'kg/dia') });
    expect(r.Ca.mantenca).toMatchObject({ situacao: 'indeterminado', valor: null });
    expect(r.Ca.dietetica).toMatchObject({ situacao: 'indeterminado', valor: null });
  });

  it('unidades explícitas', () => {
    expect(() => aplicar(EQUACOES_MINERAIS.Ca[0], Z, { PC: q(400, 'kg/dia') })).toThrow(
      ErroUnidade,
    );
    expect(minerais(Z, 400, 1).Ca.dietetica.notas.join(' ')).toMatch(/não é oferta da dieta/);
  });
});
