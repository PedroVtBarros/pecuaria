import { describe, expect, it } from 'vitest';
import {
  aplicar,
  APROVACAO_CMS,
  CLASSES_SEXUAIS,
  calcularEnergia,
  CMS_CONCENTRADO_EQ,
  CMS_CONFINAMENTO_EQ,
  CMS_PASTO_EQ,
  CMS_TIP_EQ,
  confereImpresso,
  EQUACOES_CMS,
  ErroUnidade,
  q,
  registroCms,
  type Categoria,
  type ClasseSexual,
  type FonteCms,
  type GrupoGenetico,
} from '../src';
import { TABELA_2_10, TABELA_2_14, TABELA_2_4 } from './dados/tabelas-cms';
import { TABELAS_17_CMS } from './dados/tabelas-17-cms';

/*
 * 6A-4: consumo de matéria seca do BR-CORTE 2023 (INVENTARIO_BR_CORTE.md, seções 3.3 e 15).
 * Valores esperados como impressos, página citada; precisão integral (D-PESO-02).
 */
const cat = (
  grupo: GrupoGenetico,
  sexo: ClasseSexual = 'macho_nao_castrado',
  sistema: Categoria['sistema'] = 'confinamento',
): Categoria => ({ grupo, sexo, sistema });
const Z = cat('zebuino');
const ZP = cat('zebuino', 'macho_nao_castrado', 'pasto');
function confere(calculado: number | null, impresso: string, onde: string) {
  expect(calculado, onde).not.toBeNull();
  expect(
    confereImpresso(calculado!, impresso),
    `${onde}: calculado ${calculado}, impresso ${impresso}`,
  ).toBe(true);
}
const CONF: FonteCms = { origem: 'previsto', equacao: 'confinamento' };
const TIP: FonteCms = { origem: 'previsto', equacao: 'terminacao_intensiva_pasto' };
const energia = (c: Categoria, PC: number, GMD: number, cms: FonteCms = CONF) =>
  calcularEnergia(c, { PC: q(PC, 'kg'), GMD: q(GMD, 'kg/dia'), cms });
const cmsConf = (c: Categoria, PC: number, GMD: number) =>
  aplicar(CMS_CONFINAMENTO_EQ, c, { PC: q(PC, 'kg'), GMD: q(GMD, 'kg/dia') });

describe('6A-4: registro das equações de CMS', () => {
  it('transcritas, conferidas na imagem (p. 38 e a página da equação), com caso de teste; aprovadas pelo usuário', () => {
    expect(
      registroCms()
        .listar()
        .map((e) => e.id),
    ).toEqual(['BRC23-C-01-03', 'BRC23-C-04-05', 'BRC23-C-06', 'BRC23-C-01-TIP']);
    for (const e of EQUACOES_CMS) {
      expect(e.conferencia.conferencias[0]!.paginas).toContain(38);
      expect(e.conferencia.aprovacaoUsuario).toEqual(APROVACAO_CMS);
    }
    expect(CMS_CONFINAMENTO_EQ.coeficientes(cat('cruzado_leite'))).toEqual({
      b0: -2.8836,
      bPC: 0.08435,
      expoentePC: 0.75,
      bGMD: 4.5145,
      bGMD2: -0.9631,
    });
  });
});

describe('D-CMS-04: Eq. 2.1 a 2.5 sem coeficiente por classe sexual', () => {
  it('mesmos coeficientes e mesmo CMS para não castrados, castrados e fêmeas do grupo', () => {
    for (const grupo of ['zebuino', 'cruzado_corte', 'cruzado_leite'] as const) {
      const ref = CMS_CONFINAMENTO_EQ.coeficientes(cat(grupo));
      for (const sexo of CLASSES_SEXUAIS) {
        expect(CMS_CONFINAMENTO_EQ.coeficientes(cat(grupo, sexo)), `${grupo} ${sexo}`).toEqual(ref);
        expect(cmsConf(cat(grupo, sexo), 400, 1).valor).toBe(cmsConf(cat(grupo), 400, 1).valor);
      }
    }
    for (const sexo of CLASSES_SEXUAIS)
      expect(CMS_CONCENTRADO_EQ.coeficientes(cat('zebuino', sexo))).toEqual(
        CMS_CONCENTRADO_EQ.coeficientes(Z),
      );
  });
});

describe('6A-4: tabelas do capítulo 2 em precisão integral', () => {
  it('Tabela 2.4 (p. 28): Eq. 2.1, 2.2 e 2.3, 35 linhas', () => {
    expect(TABELA_2_4).toHaveLength(35);
    for (const [PC, GMD, z, cc, cl] of TABELA_2_4) {
      confere(cmsConf(Z, PC, GMD).valor, z, `Z PC ${PC}, GMD ${GMD}`);
      confere(cmsConf(cat('cruzado_corte'), PC, GMD).valor, cc, `CC PC ${PC}, GMD ${GMD}`);
      confere(cmsConf(cat('cruzado_leite'), PC, GMD).valor, cl, `CL PC ${PC}, GMD ${GMD}`);
    }
  });

  it('Tabela 2.10 (p. 33): Eq. 2.4 e 2.5 com NC 30, 60 e 90 %, 36 linhas', () => {
    expect(TABELA_2_10).toHaveLength(36);
    const v = (c: Categoria, PC: number, GMD: number, NC: number) =>
      aplicar(CMS_CONCENTRADO_EQ, c, {
        PC: q(PC, 'kg'),
        GMD: q(GMD, 'kg/dia'),
        NC: q(NC, '% MS'),
      }).valor;
    for (const [PC, GMD, NC, z, cc] of TABELA_2_10) {
      confere(v(Z, PC, GMD, NC), z, `Z PC ${PC}, GMD ${GMD}, NC ${NC}`);
      confere(v(cat('cruzado_corte'), PC, GMD, NC), cc, `CC PC ${PC}, GMD ${GMD}, NC ${NC}`);
    }
  });

  it('Tabela 2.14 (p. 37): Eq. 2.6, zebuínos a pasto, 36 linhas, inclusive GMD zero', () => {
    expect(TABELA_2_14).toHaveLength(36);
    for (const [PC, GMD, CMSs, z] of TABELA_2_14) {
      const r = aplicar(CMS_PASTO_EQ, ZP, {
        PC: q(PC, 'kg'),
        GMD: q(GMD, 'kg/dia'),
        CMSs: q(CMSs, 'kg/dia'),
      });
      confere(r.valor, z, `PC ${PC}, GMD ${GMD}, CMSs ${CMSs}`);
      expect(r.situacao).toBe('valido');
    }
  });
});

describe('6A-4: exemplos do livro e planilha oficial', () => {
  it('T-04 (p. 432–433): CMS previsto 10,62; ED, NDT e NDT % com o CMS previsto', () => {
    const r = energia(Z, 520, 1.4);
    confere(r.CMS.valor, '10,62', 'CMS');
    expect(r.CMS).toMatchObject({ equacaoId: 'BRC23-C-01-03', situacao: 'valido' });
    confere(r.ED.valor, '32,15', 'ED');
    confere(r.NDT.valor, '7,31', 'NDT');
    confere(r.NDTpct.valor, '68,8', 'NDT %');
    for (const id of ['ED', 'NDT', 'NDTpct'] as const)
      expect(r[id].notas, id).toContain('CMS usado: previsto pelo motor (BRC23-C-01-03).');
  });

  it('T-01 (p. 199–200): CMS previsto 10,87 kg/dia (520 kg, 1,6 kg/dia)', () => {
    confere(cmsConf(Z, 520, 1.6).valor, '10,87', 'CMS');
  });

  it('T-12, planilha oficial (aba Crescimento, Q10, D62, Q20, Q21): PC médio 430 kg, GMD 1,5', () => {
    const r = energia(Z, 430, 1.5);
    expect(r.CMS.valor).toBeCloseTo(9.54606661698927, 12);
    expect(r.EMtotal.valor).toBeCloseTo(25.115582469058765, 12);
    expect(r.ED.valor).toBeCloseTo(29.624484259471085, 12);
    expect(r.NDT.valor).toBeCloseTo(6.732837331697973, 12);
    expect(r.NDTpct.valor).toBeCloseTo(70.5299638252623, 12);
  });
});

describe('6A-4: Tabelas 17.3a a 17.12a (p. 441–468), CMS, NDT e NDT % (D-EN-02)', () => {
  for (const t of TABELAS_17_CMS)
    it(`Tabela ${t.tabela} (p. ${t.pagina}): ${t.grupo}, ${t.sexo}, ${t.sistema}`, () => {
      const c = cat(t.grupo, t.sexo, t.sistema);
      for (const [PC, GMD, cms, ndt, ndtPct] of t.linhas) {
        const onde = `PC ${PC}, GMD ${GMD}`;
        // A Tabela 17.12a (pasto) usa o CMS da Eq. 2.1 na terminação intensiva a pasto (p. 37;
        // D-CMS-01); a energia continua a de pasto.
        const r = energia(c, PC, GMD, t.sistema === 'pasto' ? TIP : CONF);
        expect(r.CMS.equacaoId).toBe(t.sistema === 'pasto' ? 'BRC23-C-01-TIP' : 'BRC23-C-01-03');
        confere(r.CMS.valor, cms, `CMS ${onde}`);
        confere(r.NDT.valor, ndt, `NDT ${onde}`);
        confere(r.NDTpct.valor, ndtPct, `NDT % ${onde}`);
      }
    });
});

describe('6A-4: escopo, domínio, unidades e identificação do CMS', () => {
  it('opção de confinamento a pasto fica fora do escopo e indica a TIP (D-CMS-01); ED e NDT também', () => {
    const r = energia(ZP, 400, 0.8);
    expect(r.CMS).toMatchObject({ situacao: 'fora_do_escopo', valor: null });
    expect(r.CMS.motivos[0]).toMatch(/BRC23-C-01-TIP.*D-CMS-01/);
    for (const id of ['ED', 'NDT', 'NDTpct'] as const)
      expect(r[id], id).toMatchObject({ situacao: 'fora_do_escopo', valor: null });
    expect(r.EMtotal.situacao).toBe('valido');
  });

  it('TIP (D-CMS-01): Eq. 2.1 com aviso e domínio da Tabela 2.1; sistema continua pasto', () => {
    const r = energia(ZP, 520, 1.4, TIP);
    expect(r.CMS.valor).toBe(cmsConf(Z, 520, 1.4).valor);
    expect(r.CMS).toMatchObject({ equacaoId: 'BRC23-C-01-TIP', situacao: 'valido' });
    expect(r.CMS.avisos[0]).toMatch(/terminação intensiva a pasto.*p. 37/);
    expect(r.NDT.notas).toContain('CMS usado: previsto pelo motor (BRC23-C-01-TIP).');
    // Peso e energia continuam de pasto: PCVZ da Eq. 1.5, ELg da Eq. 8.21 e km com θ = 0,92.
    expect(r.PCVZ.equacaoId).toBe(
      energia(ZP, 520, 1.4, { origem: 'informado', CMS: q(9, 'kg/dia') }).PCVZ.equacaoId,
    );
    expect(r.ELg.coeficientes).toMatchObject({ b0: 0.052, b1: 1.062 });
    expect(r.km.coeficientes).toMatchObject({ theta: 0.92 });
    expect(r.EMtotal.valor).not.toBe(energia(Z, 520, 1.4).EMtotal.valor);
    const fora = aplicar(CMS_TIP_EQ, ZP, { PC: q(100, 'kg'), GMD: q(1, 'kg/dia') });
    expect(fora).toMatchObject({ situacao: 'fora_do_dominio', usoOperacional: false });
    expect(fora.motivos[0]).toMatch(/Tabela 2.1/);
  });

  it('TIP só para zebuínos machos a pasto: fêmea (D-CMS-03), cruzado e confinamento fora do escopo', () => {
    const femea = energia(cat('zebuino', 'femea', 'pasto'), 400, 1, TIP).CMS;
    expect(femea.situacao).toBe('fora_do_escopo');
    expect(femea.motivos[0]).toMatch(/restrição do projeto.*D-CMS-03/);
    expect(energia(cat('cruzado_corte', 'macho_castrado', 'pasto'), 400, 1, TIP).CMS.situacao).toBe(
      'fora_do_escopo',
    );
    expect(energia(Z, 400, 1, TIP).CMS.situacao).toBe('fora_do_escopo');
    expect(energia(cat('zebuino', 'macho_castrado', 'pasto'), 400, 1, TIP).CMS.situacao).toBe(
      'valido',
    );
  });

  it('Eq. 2.6 a pasto: CMS, ED e NDT calculados; em confinamento, fora do escopo', () => {
    const pasto: FonteCms = { origem: 'previsto', equacao: 'pasto', CMSs: q(1.2, 'kg/dia') };
    const r = energia(ZP, 300, 0.5, pasto);
    confere(r.CMS.valor, '5,98', 'CMS (Tabela 2.14, p. 37)');
    expect(r.CMS.avisos).toEqual(expect.arrayContaining([expect.stringMatching(/p\. 35/)]));
    expect(r.ED.valor).not.toBeNull();
    expect(r.NDT.notas).toContain('CMS usado: previsto pelo motor (BRC23-C-06).');
    expect(energia(Z, 300, 0.5, pasto).CMS.situacao).toBe('fora_do_escopo');
  });

  it('pasto: só zebuínos machos (P-03); cruzado de leite (Eq. 2.7) e fêmea fora do escopo', () => {
    const pasto: FonteCms = { origem: 'previsto', equacao: 'pasto', CMSs: q(1, 'kg/dia') };
    expect(
      energia(cat('cruzado_leite', 'macho_nao_castrado', 'pasto'), 300, 0.5, pasto).CMS.motivos[0],
    ).toMatch(/Eq\. 2\.7/);
    expect(energia(cat('zebuino', 'femea', 'pasto'), 300, 0.5, pasto).CMS.situacao).toBe(
      'fora_do_escopo',
    );
  });

  it('Eq. 2.4 e 2.5: sem equação para cruzado de leite; NC fora da Tabela 2.7 perde uso operacional', () => {
    const nc = (NC: number): FonteCms => ({
      origem: 'previsto',
      equacao: 'concentrado',
      NC: q(NC, '% MS'),
    });
    expect(energia(cat('cruzado_leite'), 400, 1, nc(60)).CMS).toMatchObject({
      situacao: 'fora_do_escopo',
    });
    const r = energia(Z, 400, 1, nc(90));
    expect(r.CMS).toMatchObject({ situacao: 'fora_do_dominio', usoOperacional: false });
    expect(r.CMS.motivos[0]).toMatch(/NC = 90.*Tabela 2\.7/);
    expect(r.ED.usoOperacional).toBe(false);
    expect(r.NDT.usoOperacional).toBe(false);
    expect(energia(Z, 400, 1, nc(60)).NDT.usoOperacional).toBe(true);
  });

  it('D-CMS-02: Eq. 2.6 com GMD acima de 1,34 ou CMSs acima de 5,32 kg/dia perde uso operacional', () => {
    const r = (GMD: number, CMSs: number) =>
      aplicar(CMS_PASTO_EQ, ZP, {
        PC: q(300, 'kg'),
        GMD: q(GMD, 'kg/dia'),
        CMSs: q(CMSs, 'kg/dia'),
      });
    expect(r(1.34, 5.32).situacao).toBe('valido');
    expect(r(1.4, 1).situacao).toBe('fora_do_dominio');
    expect(r(1, 5.5).situacao).toBe('fora_do_dominio');
  });

  it('GMD negativo fora do escopo (P-01); GMD zero calculado', () => {
    expect(cmsConf(Z, 400, -0.1).situacao).toBe('fora_do_escopo');
    const r = energia(Z, 400, 0);
    expect(r.CMS).toMatchObject({ situacao: 'valido' });
    // Sem ERprot com ganho zero (D-EN-04), ED e NDT ficam fora do escopo.
    expect(r.ED).toMatchObject({ situacao: 'fora_do_escopo', valor: null });
  });

  it('D-CMS-05: PC fora da Tabela 2.1 calculado só para análise, sem uso operacional, e propaga', () => {
    const r = energia(cat('cruzado_corte'), 200, 1);
    expect(r.CMS).toMatchObject({ situacao: 'fora_do_dominio', usoOperacional: false });
    expect(r.CMS.motivos[0]).toMatch(/Tabela 2\.1/);
    expect(r.NDTpct.usoOperacional).toBe(false);
  });

  it('falta de NC ou CMSs deixa CMS, ED e NDT indeterminados, nunca zero', () => {
    const r = energia(Z, 400, 1, { origem: 'previsto', equacao: 'concentrado', NC: null });
    for (const id of ['CMS', 'ED', 'NDT', 'NDTpct'] as const)
      expect(r[id], id).toMatchObject({ situacao: 'indeterminado', valor: null });
  });

  it('CMS informado identificado; CMS informado zero fora do escopo', () => {
    const r = energia(Z, 400, 1, { origem: 'informado', CMS: q(8.5, 'kg/dia') });
    expect(r.CMS).toMatchObject({ equacaoId: 'CMS-INFORMADO', valor: 8.5 });
    expect(r.CMS.notas[0]).toMatch(/informado pelo usuário/);
    expect(r.CMS.avisos).toEqual([]);
    expect(r.ED.entradas['CMS']).toEqual({ valor: 8.5, unidade: 'kg/dia' });
    expect(energia(Z, 400, 1, { origem: 'informado', CMS: q(0, 'kg/dia') }).CMS.situacao).toBe(
      'fora_do_escopo',
    );
  });

  it('unidades explícitas: NC em % (sem base) e CMSs em kg são recusados', () => {
    expect(() =>
      energia(Z, 400, 1, { origem: 'previsto', equacao: 'concentrado', NC: q(60, '%') }),
    ).toThrow(ErroUnidade);
    expect(() =>
      energia(ZP, 300, 0.5, { origem: 'previsto', equacao: 'pasto', CMSs: q(1, 'kg') }),
    ).toThrow(ErroUnidade);
  });
});
