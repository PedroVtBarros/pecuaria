import { describe, expect, it } from 'vitest';
import {
  aplicar,
  APROVACAO_PROTEINA,
  calcularProteina,
  confereImpresso,
  EQUACOES_PROTEINA,
  K_PROTEINA_EQ,
  PB_EQ,
  PB_PCT_MS_EQ,
  PBMIC_EQ,
  PDR_PCT_PB_EQ,
  PLG_EQ,
  PMG_EQ,
  PMM_EQ,
  PMT_EQ,
  PNDR_EQ,
  q,
  registroProteina,
  type Categoria,
  type ClasseSexual,
  type FonteCms,
  type GrupoGenetico,
} from '../src';
import { TABELAS_17_PROTEINA } from './dados/tabelas-17-proteina';

/*
 * 6A-5: exigências de proteína do BR-CORTE 2023 (INVENTARIO_BR_CORTE.md, seções 3.4, 10 e 16).
 * Valores esperados como impressos, página citada; precisão integral (D-PESO-02). Reprodução de
 * etapas arredondadas pelo livro fica em teste separado.
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
const CONF: FonteCms = { origem: 'previsto', equacao: 'confinamento' };
const TIP: FonteCms = { origem: 'previsto', equacao: 'terminacao_intensiva_pasto' };
const informado = (CMS: number): FonteCms => ({ origem: 'informado', CMS: q(CMS, 'kg/dia') });
const proteina = (c: Categoria, PC: number, GMD: number, cms: FonteCms = CONF) =>
  calcularProteina(c, { PC: q(PC, 'kg'), GMD: q(GMD, 'kg/dia'), cms });

describe('6A-5: registro das equações de proteína', () => {
  it('transcritas, conferidas na imagem (Tabela 9.14, p. 227), com caso de teste; aprovadas pelo usuário', () => {
    expect(
      registroProteina()
        .listar()
        .map((e) => e.id),
    ).toEqual([
      'BRC23-R-01-02',
      'BRC23-R-03',
      'BRC23-R-04',
      'BRC23-R-05',
      'BRC23-R-06',
      'BRC23-R-07',
      'BRC23-R-08',
      'BRC23-R-09',
      'BRC23-R-10',
      'BRC23-R-11',
      'BRC23-R-12',
      'BRC23-R-13',
    ]);
    for (const e of EQUACOES_PROTEINA) {
      expect(e.conferencia.conferencias[0]!.paginas).toContain(227);
      expect(e.conferencia.aprovacaoUsuario).toEqual(APROVACAO_PROTEINA);
    }
    expect(PMM_EQ.coeficientes(Z)).toEqual({ a: 3.6, expoente: 0.75 });
    expect(PMM_EQ.coeficientes(cat('zebuino', 'macho_castrado', 'pasto'))).toEqual({
      a: 3.9,
      expoente: 0.75,
    });
    expect(PBMIC_EQ.coeficientes(Z)).toEqual({
      a: -53.07,
      bCPB: 304.9,
      bCNDT: 90.8,
      bCNDT2: -3.13,
    });
  });
});

describe('6A-5: k e o limite de PCJ 340 kg (p. 218; P-02)', () => {
  const k = (PCJ: number, PCVZeq: number) =>
    aplicar(K_PROTEINA_EQ, Z, { PCJ: q(PCJ, 'kg'), PCVZeq: q(PCVZeq, 'kg') }).valor;
  it('PCJ < 340 kg: 84,665 – 0,1179 × PCVZeq; PCJ ≥ 340 kg: 47,4', () => {
    // p. 218: "animal de 150 kg de PCVZeq [...] a eficiência seria de 67%".
    confere(k(200, 150), '67', 'k com PCVZeq 150');
    expect(k(339.999, 300)).toBeCloseTo(84.665 - 0.1179 * 300, 12);
    expect(k(340, 300)).toBe(47.4);
    expect(k(509.5, 450.1)).toBe(47.4);
  });

  it('D-PROT-02: em PCJ 340 kg a equação dá mais que 47,4 (descontinuidade registrada)', () => {
    // Zebuíno não castrado confinado com PCJ 340 kg (PC pela inversa da Eq. 1.3).
    const r = proteina(Z, (340 / 0.8915) ** (1 / 1.0151), 1);
    expect(r.PCJ.valor).toBeCloseTo(340, 9);
    expect(r.PCVZeq.valor).toBeCloseTo(298.729, 3);
    // Logo abaixo de 340 kg vale a equação (49,445 %); a partir de 340 kg, 47,4 %: salto de ~2 pontos.
    expect(k(339.999, r.PCVZeq.valor!)).toBeCloseTo(49.445, 3);
    expect(k(340, r.PCVZeq.valor!)).toBe(47.4);
  });
});

describe('6A-5: exemplos do livro em precisão integral', () => {
  it('T-04 (p. 433): zebuíno não castrado confinado, 520 kg, 1,4 kg/dia, CMS previsto', () => {
    const r = proteina(Z, 520, 1.4);
    confere(r.PMm.valor, '386,1', 'PMm');
    confere(r.PLg.valor, '187,5', 'PLg');
    expect(r.kProteina.valor).toBe(47.4);
    confere(r.PMg.valor, '395,6', 'PMg');
    confere(r.PMt.valor, '781,7', 'PMt');
    confere(r.PBmic.valor, '789,3', 'PBmic');
    confere(r.PDR.valor, '789,3', 'PDR');
    confere(r.PNDR.valor, '345,6', 'PNDR');
    confere(r.PB.valor, '1135', 'PB');
    expect(r.PB).toMatchObject({ situacao: 'valido', unidade: 'g/dia' });
    expect(r.PB.notas).toContain('CMS usado: previsto pelo motor (BRC23-C-01-03).');
  });

  it('T-02 (p. 227): 520 kg, 1,6 kg/dia, com o CMS do T-01 (10,87 kg/dia, p. 200)', () => {
    const r = proteina(Z, 520, 1.6, informado(10.87));
    confere(r.PMm.valor, '386,1', 'PMm');
    expect(r.kProteina.valor).toBe(47.4);
    // D-PROT-03: o livro calcula com GPCVZ 1,55 arredondado e com CPB 1,215; em precisão integral
    // (GPCVZ 1,5518) PLg 214,46, PMg 452,45, PMt 838,51, PBmic 838,66, PNDR 377,20 e PB 1215,87.
    // Impressos: 214,2; 451,9; 838; 838,5; 376,7; 1215 (teste de etapas abaixo).
    confere(r.PLg.valor, '214,46', 'PLg integral');
    confere(r.PMg.valor, '452,45', 'PMg integral');
    confere(r.PMt.valor, '838,51', 'PMt integral');
    confere(r.PBmic.valor, '838,66', 'PBmic integral');
    confere(r.PNDR.valor, '377,20', 'PNDR integral');
    confere(r.PB.valor, '1215,87', 'PB integral');
  });

  it('T-02, etapas a partir dos valores impressos (arredondamento intermediário do livro)', () => {
    const v = (e: typeof PLG_EQ, entradas: Record<string, ReturnType<typeof q>>) =>
      aplicar(e, Z, entradas).valor!;
    confere(v(PLG_EQ, { GPCVZ: q(1.55, 'kg/dia'), PCVZeq: q(450.1, 'kg') }), '214,2', 'PLg');
    confere(v(PMG_EQ, { PLg: q(214.2, 'g/dia'), k: q(47.4, '%') }), '451,9', 'PMg');
    confere(v(PMT_EQ, { PMm: q(386.1, 'g/dia'), PMg: q(451.9, 'g/dia') }), '838', 'PMt');
    confere(v(PBMIC_EQ, { PB: q(1215, 'g/dia'), CNDT: q(7.88, 'kg/dia') }), '838,5', 'PBmic');
    confere(v(PNDR_EQ, { PMt: q(838, 'g/dia'), PBmic: q(838.5, 'g/dia') }), '376,7', 'PNDR');
    confere(838.5 + 376.7, '1215', 'PB = PDR + PNDR');
    // Forma fechada com as entradas impressas (CNDT 7,88; PMt 838): seção 10 do inventário.
    confere(v(PB_EQ, { PMt: q(838, 'g/dia'), CNDT: q(7.88, 'kg/dia') }), '1215,22', 'PB fechada');
  });

  it('T-12, planilha oficial (aba Crescimento, Q24 a Q27): PC médio 430 kg, GMD 1,5', () => {
    const r = proteina(Z, 430, 1.5);
    expect(r.PMm.valor).toBeCloseTo(334.0556975504249, 10);
    expect(r.PLg.valor).toBeCloseTo(208.46292899452487, 10);
    expect(r.PMg.valor).toBeCloseTo(439.79520884920856, 10);
    expect(r.PMt.valor).toBeCloseTo(773.8509063996335, 10);
    // D-PROT-04: a planilha usa 304,89 e 90,79 na PBmic (PB 1118,7994, Q33, por 100 iterações);
    // com os coeficientes impressos (304,9 e 90,8), PB 1118,8161.
    confere(r.PB.valor, '1118,816', 'PB com os coeficientes do livro');
  });

  it('forma fechada = ponto fixo da planilha oficial (método, com os coeficientes dela)', () => {
    const r = proteina(Z, 430, 1.5);
    const k = { ...PB_EQ.coeficientes(Z), bCPB: 304.89, bCNDT: 90.79 };
    // Aba "PBmic Cresc e Term", célula B102 (× 1000): 100 iterações de PB → PBmic → PB.
    expect(PB_EQ.calcular({ PMt: r.PMt.valor!, CNDT: r.NDT.valor! }, k)).toBeCloseTo(
      1118.799373801186,
      9,
    );
  });

  it('PB = PDR + PNDR e PBmic(CPB = PB) fecham sem iteração', () => {
    const r = proteina(Z, 520, 1.4);
    expect(r.PDR.valor! + r.PNDR.valor!).toBeCloseTo(r.PB.valor!, 10);
    const pbmic = aplicar(PBMIC_EQ, Z, {
      PB: q(r.PB.valor!, 'g/dia'),
      CNDT: q(r.NDT.valor!, 'kg/dia'),
    }).valor!;
    expect(pbmic).toBeCloseTo(r.PBmic.valor!, 10);
  });
});

/**
 * D-PROT-04: células das Tabelas 17.xa que não fecham com os coeficientes impressos da PBmic
 * (304,9 e 90,8), por meio grama no arredondamento; todas fecham com os da planilha oficial
 * (304,89 e 90,79). Lista presa: qualquer mudança aparece. Chave: "PC/GMD/coluna".
 */
const DIVERGENTES_PBMIC_IMPRESSA: Readonly<Record<string, readonly string[]>> = {
  '17.3a': ['210/1.8/PDR', '330/0.8/PNDR', '390/1.8/PDR', '450/1.3/PDR'],
  '17.4a': [
    '210/1.3/PDR',
    '210/1.8/PDR',
    '270/1.8/PDR',
    '510/1.8/PDR',
    '630/0.3/PNDR',
    '630/1.3/PNDR',
  ],
  '17.5a': ['210/0.3/PNDR', '450/0.8/PNDR', '510/1.3/PNDR', '570/0.8/PNDR'],
  '17.6a': ['630/1.3/PDR', '630/1.3/PNDR'],
  '17.7a': [
    '210/0.8/PDR',
    '270/0.8/PNDR',
    '270/1.8/PNDR',
    '330/1.3/PB',
    '390/0.8/PNDR',
    '510/1.3/PDR',
  ],
  '17.8a': ['210/0.3/PNDR', '270/0.3/PNDR', '270/1.3/PDR', '330/0.8/PDR', '390/1.3/PNDR'],
  '17.9a': ['330/0.8/PNDR', '330/1.8/PNDR', '390/1.8/PNDR'],
  '17.10a': [
    '210/1.3/PB',
    '210/1.8/PB',
    '270/0.3/PNDR',
    '270/1.3/PB',
    '330/1.3/PDR',
    '450/0.8/PDR',
    '510/1.3/PDR',
    '570/1.3/PDR',
  ],
  '17.11a': [
    '330/1.3/PDR',
    '390/0.3/PDR',
    '450/1.3/PNDR',
    '510/1.8/PNDR',
    '570/0.3/PDR',
    '570/0.8/PNDR',
    '630/1.8/PDR',
  ],
  '17.12a': ['390/0.3/PNDR', '570/1.3/PDR'],
};

describe('6A-5: Tabelas 17.3a a 17.12a (p. 441–468), PDR, PNDR e PB', () => {
  it('coeficientes impressos: 913 de 960 células; as 47 divergentes presas, todas abaixo de 0,6 g/dia', () => {
    let iguais = 0;
    for (const t of TABELAS_17_PROTEINA) {
      const c = cat(t.grupo, t.sexo, t.sistema);
      const divergentes = DIVERGENTES_PBMIC_IMPRESSA[t.tabela] ?? [];
      for (const [PC, GMD, pdr, pndr, pb] of t.linhas) {
        const r = proteina(c, PC, GMD, t.sistema === 'pasto' ? TIP : CONF);
        for (const [nome, v, impresso] of [
          ['PDR', r.PDR.valor!, pdr],
          ['PNDR', r.PNDR.valor!, pndr],
          ['PB', r.PB.valor!, pb],
        ] as const) {
          const chave = `${PC}/${GMD}/${nome}`;
          const bate = confereImpresso(v, impresso);
          expect(bate, `${t.tabela} ${chave}: ${v} vs ${impresso}`).toBe(
            !divergentes.includes(chave),
          );
          expect(Math.abs(v - Number(impresso)), chave).toBeLessThan(0.6);
          if (bate) iguais++;
        }
      }
    }
    expect(iguais).toBe(913);
  });

  for (const t of TABELAS_17_PROTEINA)
    it(`Tabela ${t.tabela} (p. ${t.pagina}), compatibilidade com a planilha oficial (304,89 e 90,79): todas as células`, () => {
      // Valida a cadeia (peso, energia, CMS, PMt e forma fechada) contra a tabela; o motor não
      // usa os coeficientes da planilha (D-PROT-04).
      const c = cat(t.grupo, t.sexo, t.sistema);
      const k = { ...PB_EQ.coeficientes(c), bCPB: 304.89, bCNDT: 90.79 };
      for (const [PC, GMD, pdr, pndr, pb, pbPct, pdrPct, pndrPct] of t.linhas) {
        const onde = `PC ${PC}, GMD ${GMD}`;
        const r = proteina(c, PC, GMD, t.sistema === 'pasto' ? TIP : CONF);
        const PB = PB_EQ.calcular({ PMt: r.PMt.valor!, CNDT: r.NDT.valor! }, k);
        const PBmic = PBMIC_EQ.calcular({ PB, CNDT: r.NDT.valor! }, k);
        const PNDR = PNDR_EQ.calcular({ PMt: r.PMt.valor!, PBmic }, PNDR_EQ.coeficientes(c));
        confere(PBmic, pdr, `PDR ${onde}`);
        confere(PNDR, pndr, `PNDR ${onde}`);
        confere(PB, pb, `PB ${onde}`);
        confere(PB_PCT_MS_EQ.calcular({ PB, CMS: r.CMS.valor! }, {}), pbPct, `PB % ${onde}`);
        confere(PDR_PCT_PB_EQ.calcular({ PDR: PBmic, PB }, {}), pdrPct, `PDR % PB ${onde}`);
        confere((PNDR / PB) * 100, pndrPct, `PNDR % PB ${onde}`);
      }
    });
});

/**
 * R-11 a R-13 com os coeficientes impressos: as 48 células que não fecham (24 pares PDR % e
 * PNDR % na borda do arredondamento), presas; todas fecham com os da planilha (D-PROT-04).
 */
const DIVERGENTES_PCT: Readonly<Record<string, readonly string[]>> = {
  '17.3a': ['210/0.3', '510/1.3', '570/0.3'],
  '17.5a': ['510/0.8', '570/1.8'],
  '17.6a': ['210/0.3', '210/1.3', '210/1.8', '270/0.8', '390/0.3', '450/1.8', '630/1.8'],
  '17.7a': ['390/1.3'],
  '17.8a': ['450/1.8'],
  '17.9a': ['210/1.3', '210/1.8', '270/0.3', '270/1.3', '330/0.8', '510/0.3'],
  '17.10a': ['330/1.8'],
  '17.12a': ['210/0.3', '390/1.8', '450/1.8'],
};

describe('6A-5: R-11 a R-13, indicadores derivados (D-PROT-08)', () => {
  it('Tabelas 17.3a a 17.12a com os coeficientes impressos: 912 de 960; PB % todas; divergentes presas', () => {
    let iguais = 0;
    for (const t of TABELAS_17_PROTEINA) {
      const c = cat(t.grupo, t.sexo, t.sistema);
      for (const [PC, GMD, , , , pbPct, pdrPct, pndrPct] of t.linhas) {
        const r = proteina(c, PC, GMD, t.sistema === 'pasto' ? TIP : CONF);
        const chave = `${PC}/${GMD}`;
        const diverge = (DIVERGENTES_PCT[t.tabela] ?? []).includes(chave);
        confere(r.PBpctMS.valor, pbPct, `${t.tabela} ${chave} PB %`);
        for (const [v, impresso] of [
          [r.PDRpctPB.valor!, pdrPct],
          [r.PNDRpctPB.valor!, pndrPct],
        ] as const) {
          const bate = confereImpresso(v, impresso);
          expect(bate, `${t.tabela} ${chave}: ${v} vs ${impresso}`).toBe(!diverge);
          expect(Math.abs(v - Number(impresso.replace(',', '.'))), chave).toBeLessThan(0.06);
          if (bate) iguais++;
        }
        iguais++;
        expect(r.PDRpctPB.valor! + r.PNDRpctPB.valor!).toBeCloseTo(100, 10);
      }
    }
    expect(iguais).toBe(912);
  });

  it('unidades e dependências: PB % da MS usa o CMS; PDR e PNDR % da PB, com o aviso do CMS usado', () => {
    const r = proteina(Z, 510, 1.3);
    expect(r.PBpctMS).toMatchObject({ unidade: '% MS', situacao: 'valido' });
    expect(r.PDRpctPB.unidade).toBe('% PB');
    expect(r.PBpctMS.valor).toBeCloseTo(r.PB.valor! / 10 / r.CMS.valor!, 12);
    expect(r.PNDRpctPB.notas).toContain('CMS usado: previsto pelo motor (BRC23-C-01-03).');
    const semCms = proteina(Z, 510, 1.3, { origem: 'informado', CMS: null });
    for (const id of ['PBpctMS', 'PDRpctPB', 'PNDRpctPB'] as const)
      expect(semCms[id], id).toMatchObject({ situacao: 'indeterminado', valor: null });
  });

  it('denominador zero não calcula (fora do escopo, nunca infinito)', () => {
    expect(aplicar(PB_PCT_MS_EQ, Z, { PB: q(1000, 'g/dia'), CMS: q(0, 'kg/dia') }).situacao).toBe(
      'fora_do_escopo',
    );
    expect(aplicar(PDR_PCT_PB_EQ, Z, { PDR: q(700, 'g/dia'), PB: q(0, 'g/dia') }).situacao).toBe(
      'fora_do_escopo',
    );
  });
});

describe('6A-5: PNDR negativa (D-PROT-09)', () => {
  it('PNDR negativa: calculada, sinalizada como inconsistência, sem uso operacional, nunca zero', () => {
    const r = aplicar(PNDR_EQ, Z, { PMt: q(300, 'g/dia'), PBmic: q(700, 'g/dia') });
    expect(r).toMatchObject({ situacao: 'fora_do_dominio', usoOperacional: false });
    expect(r.valor).toBeCloseTo((300 - 700 * 0.64) / 0.8, 12);
    expect(r.motivos[0]).toMatch(/^Inconsistência: PNDR exigida negativa.*D-PROT-09/);
    expect(aplicar(PNDR_EQ, Z, { PMt: q(800, 'g/dia'), PBmic: q(700, 'g/dia') }).situacao).toBe(
      'valido',
    );
  });

  it('PB abaixo da PBmic (PNDR implícita negativa) também sinalizada na PB', () => {
    const r = aplicar(PB_EQ, Z, { PMt: q(100, 'g/dia'), CNDT: q(8, 'kg/dia') });
    expect(r.usoOperacional).toBe(false);
    expect(r.motivos.join(' ')).toMatch(/Inconsistência: PNDR exigida negativa/);
  });
});

describe('6A-5: escopo, domínio, unidades e dependências', () => {
  it('sem CMS: PMm a PMt calculadas; PB, PBmic, PDR e PNDR indeterminados, nunca zero', () => {
    const r = proteina(Z, 400, 1, { origem: 'informado', CMS: null });
    expect(r.PMt.situacao).toBe('valido');
    for (const id of ['PB', 'PBmic', 'PDR', 'PNDR'] as const)
      expect(r[id], id).toMatchObject({ situacao: 'indeterminado', valor: null });
  });

  it('GMD zero: PMm válida, PLg e PMg zero; PB fora do escopo porque o NDT não sai (D-EN-04)', () => {
    const r = proteina(Z, 400, 0);
    expect(r.PMm.situacao).toBe('valido');
    expect(r.PLg.valor).toBe(0);
    expect(r.PMt.valor).toBe(r.PMm.valor);
    expect(r.PB).toMatchObject({ situacao: 'fora_do_escopo', valor: null });
  });

  it('domínio de PCJ da categoria (Tabelas 9.2 a 9.5): fora dele, sem uso operacional', () => {
    const r = proteina(cat('zebuino', 'femea'), 500, 0.8);
    expect(r.PMm).toMatchObject({ situacao: 'fora_do_dominio', usoOperacional: false });
    expect(r.PMm.motivos[0]).toMatch(/PCJ = .* \(129 a 437 kg; Tabela 9\.2, p\. 208\)/);
    expect(r.PB.usoOperacional).toBe(false);
  });

  it('PLg e k: domínio provisório (D-PROT-01), com aviso', () => {
    const r = proteina(Z, 400, 1);
    expect(r.PLg.avisos[0]).toMatch(/Domínio de GPCVZ provisório.*Costa e Silva/);
    expect(r.kProteina.avisos[0]).toMatch(/Domínio de PCJ provisório.*BR-CORTE 2010/);
  });

  it('PB fora da faixa de CPB da Tabela 3.7 (p. 60) perde uso operacional', () => {
    const r = aplicar(PB_EQ, Z, { PMt: q(100, 'g/dia'), CNDT: q(1, 'kg/dia') });
    expect(r).toMatchObject({ situacao: 'fora_do_dominio', usoOperacional: false });
    expect(r.motivos[0]).toMatch(/Resultado = .* \(590 a 4\.390 g\/dia; Tabela 3\.7/);
  });

  it('exigência, não oferta: avisos em PB e PBmic; PDR sem dado de degradação de alimento', () => {
    const r = proteina(Z, 520, 1.4);
    expect(r.PB.notas.join(' ')).toMatch(/não é a proteína nem o NDT ofertados/);
    expect(r.PB.avisos).toEqual([]);
    expect(r.PBmic.avisos.join(' ')).toMatch(/extrato etéreo médio de 2,83/);
    expect(r.PDR.avisos.join(' ')).toMatch(/Não usa dado de degradação ruminal/);
    expect(Object.keys(r.PB.entradas)).toEqual(['PMt', 'CNDT']);
  });

  it('pasto: PMm com 3,9; fêmea a pasto fora do escopo (restrição do projeto)', () => {
    const r = proteina(cat('zebuino', 'macho_nao_castrado', 'pasto'), 300, 0.5, TIP);
    expect(r.PMm.coeficientes['a']).toBe(3.9);
    expect(proteina(cat('zebuino', 'femea', 'pasto'), 300, 0.5, TIP).PMm.situacao).toBe(
      'fora_do_escopo',
    );
  });

  it('unidades explícitas', () => {
    expect(() => aplicar(PNDR_EQ, Z, { PMt: q(800, 'kg/dia'), PBmic: q(700, 'g/dia') })).toThrow();
    expect(PLG_EQ.saida).toBe('g/dia');
    expect(K_PROTEINA_EQ.saida).toBe('%');
  });
});
