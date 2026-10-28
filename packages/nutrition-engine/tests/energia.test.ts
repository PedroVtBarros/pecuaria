import { describe, expect, it } from 'vitest';
import {
  aplicar,
  APROVACAO_ENERGIA,
  calcularEnergia,
  confereImpresso,
  EMG_EQ,
  EMM_EQ,
  EMTOTAL_EQ,
  EQUACOES_ENERGIA,
  ErroUnidade,
  KM_EQ,
  q,
  registroEnergia,
  type Categoria,
  type ClasseSexual,
  type GrupoGenetico,
} from '../src';
import { TABELAS_17_EM } from './dados/tabelas-17-em';

/*
 * 6A-3: grupo energia do BR-CORTE 2023 (INVENTARIO_BR_CORTE.md, seção 3.2). Valores esperados
 * como impressos, página citada; precisão integral no cálculo (D-PESO-02). Reprodução de etapas
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
const energia = (c: Categoria, PC: number, GMD: number, CMS: number | null) =>
  calcularEnergia(c, {
    PC: q(PC, 'kg'),
    GMD: q(GMD, 'kg/dia'),
    cms: { origem: 'informado', CMS: CMS === null ? null : q(CMS, 'kg/dia') },
  });

describe('6A-3: registro das equações de energia', () => {
  it('todas transcritas, conferidas na imagem, com página e caso de teste; aprovadas pelo usuário', () => {
    expect(
      registroEnergia()
        .listar()
        .map((e) => e.id),
    ).toEqual([
      'BRC23-E-01',
      'BRC23-E-02-03',
      'BRC23-E-04',
      'BRC23-E-05',
      'BRC23-E-06-09',
      'BRC23-E-10',
      'BRC23-E-11',
      'BRC23-E-12',
      'BRC23-E-13',
      'BRC23-E-14',
      'BRC23-E-15',
    ]);
    for (const e of EQUACOES_ENERGIA) {
      expect(e.conferencia.conferencias[0]!.paginas).toEqual(expect.arrayContaining([198, 199]));
      expect(e.conferencia.aprovacaoUsuario).toEqual(APROVACAO_ENERGIA);
    }
  });

  it('km por grupo e sistema: β2 0,100 / 0,073 / 0,010 com θ = 1; pasto β2 0,100 com θ = 0,92', () => {
    expect(KM_EQ.coeficientes(Z)).toMatchObject({ b2: 0.1, theta: 1 });
    expect(KM_EQ.coeficientes(cat('cruzado_corte'))).toMatchObject({ b2: 0.073, theta: 1 });
    expect(KM_EQ.coeficientes(cat('cruzado_leite'))).toMatchObject({ b2: 0.01, theta: 1 });
    expect(KM_EQ.coeficientes(cat('zebuino', 'macho_castrado', 'pasto'))).toMatchObject({
      b2: 0.1,
      theta: 0.92,
    });
  });
});

describe('6A-3: exemplos do livro em precisão integral', () => {
  it('T-04 (p. 432–433): zebuíno não castrado confinado, 520 kg, 1,4 kg/dia, CMS 10,62 kg/dia', () => {
    const r = energia(Z, 520, 1.4, 10.62);
    confere(r.ELg.valor, '8,16', 'ELg');
    confere(r.ERprot.valor, '0,148', 'ERprot');
    confere(r.kg.valor, '0,476', 'kg');
    confere(r.EMg.valor, '17,15', 'EMg');
    confere(r.ELm.valor, '7,33', 'ELm');
    confere(r.km.valor, '0,73', 'km');
    confere(r.EMm.valor, '10,03', 'EMm');
    confere(r.EMtotal.valor, '27,18', 'EMtotal');
    confere(r.ED.valor, '32,15', 'ED');
    confere(r.NDT.valor, '7,31', 'NDT');
    confere(r.NDTpct.valor, '68,8', 'NDT %');
    expect(r.EMtotal).toMatchObject({ situacao: 'valido', unidade: 'Mcal/dia' });
    expect(r.CMS).toMatchObject({ equacaoId: 'CMS-INFORMADO', valor: 10.62 });
    for (const id of ['ED', 'NDT', 'NDTpct'] as const)
      expect(r[id].notas, id).toContain('CMS usado: informado pelo usuário.');
  });

  it('T-01 (p. 199–200): 520 kg, 1,6 kg/dia, CMS 10,87 kg/dia; ED e NDT da p. 200', () => {
    const r = energia(Z, 520, 1.6, 10.87);
    // D-EN-05: o livro imprime ELg 9,40; nenhuma combinação de valores impressos ou integrais
    // reproduz esse número (integral 9,393; com 450,1 e 1,55, 9,382). Esperado: 9,39.
    confere(r.ELg.valor, '9,39', 'ELg integral');
    confere(r.ERprot.valor, '0,147', 'ERprot');
    confere(r.kg.valor, '0,48', 'kg');
    confere(r.ELm.valor, '7,33', 'ELm');
    confere(r.km.valor, '0,75', 'km');
    confere(r.ED.valor, '34,7', 'ED');
    confere(r.NDT.valor, '7,88', 'NDT');
    // D-EN-03: em precisão integral EMg, EMm e EMtotal dão 19,71, 9,76 e 29,47; o livro imprime
    // 19,6, 9,77 e 29,4 porque divide pelos valores arredondados (teste separado abaixo).
    confere(r.EMg.valor, '19,71', 'EMg integral');
    confere(r.EMm.valor, '9,76', 'EMm integral');
    confere(r.EMtotal.valor, '29,47', 'EMtotal integral');
  });

  it('T-01, etapas a partir dos valores impressos (arredondamento intermediário do livro)', () => {
    const v = (e: typeof EMG_EQ, entradas: Record<string, ReturnType<typeof q>>) =>
      aplicar(e, Z, entradas).valor!;
    confere(v(EMG_EQ, { ELg: q(9.4, 'Mcal/dia'), kg: q(0.48, 'fração') }), '19,6', 'EMg');
    confere(v(EMM_EQ, { ELm: q(7.33, 'Mcal/dia'), km: q(0.75, 'fração') }), '9,77', 'EMm');
    confere(
      v(EMTOTAL_EQ, { EMm: q(9.77, 'Mcal/dia'), EMg: q(19.6, 'Mcal/dia') }),
      '29,4',
      'EMtotal',
    );
  });
});

describe('6A-3: Tabelas 17.3a a 17.12a (p. 441–468), EM em precisão integral', () => {
  for (const t of TABELAS_17_EM)
    it(`Tabela ${t.tabela} (p. ${t.pagina}): ${t.grupo}, ${t.sexo}, ${t.sistema}`, () => {
      const c = cat(t.grupo, t.sexo, t.sistema);
      for (const [PC, GMD, impresso] of t.linhas)
        confere(energia(c, PC, GMD, null).EMtotal.valor, impresso, `PC ${PC}, GMD ${GMD}`);
    });
});

describe('6A-3: escopo, domínio, unidades e GMD zero', () => {
  it('GMD zero: ELm válida; ERprot indefinida e o que depende dela fica fora do escopo (P-01)', () => {
    const r = energia(Z, 400, 0, 8);
    expect(r.ELm).toMatchObject({ situacao: 'valido' });
    expect(r.ELg.valor).toBe(0);
    expect(r.ERprot).toMatchObject({ situacao: 'fora_do_escopo', valor: null });
    expect(r.ERprot.motivos[0]).toMatch(/0\/0/);
    for (const id of ['kg', 'km', 'EMm', 'EMg', 'EMtotal', 'ED', 'NDT', 'NDTpct'] as const)
      expect(r[id], id).toMatchObject({ situacao: 'fora_do_escopo', valor: null });
  });

  it('sem CMS: EM calculada; ED, NDT e NDT % indeterminados, nunca zero', () => {
    const r = energia(Z, 400, 1, null);
    expect(r.EMtotal.situacao).toBe('valido');
    for (const id of ['ED', 'NDT', 'NDTpct'] as const)
      expect(r[id], id).toMatchObject({ situacao: 'indeterminado', valor: null });
  });

  it('fora do domínio da categoria: calcula sem uso operacional, e propaga', () => {
    // Zebuínos a pasto: GPCVZ dos dados até 0,81 kg/dia (Tabela 8.4); GMD 1,8 → GPCVZ ~1,74.
    const r = energia(cat('zebuino', 'macho_nao_castrado', 'pasto'), 400, 1.8, 9);
    expect(r.ELg).toMatchObject({ situacao: 'fora_do_dominio', usoOperacional: false });
    expect(r.EMtotal.usoOperacional).toBe(false);
    expect(r.NDT.usoOperacional).toBe(false);
  });

  it('categorias fora do escopo (pasto: fêmeas e cruzados) não calculam energia', () => {
    const r = energia(cat('cruzado_corte', 'femea', 'pasto'), 400, 1, 9);
    expect(r.EMtotal).toMatchObject({ situacao: 'fora_do_escopo', valor: null });
  });

  it('unidades explícitas: CMS em kg é recusado', () => {
    expect(() =>
      calcularEnergia(Z, {
        PC: q(400, 'kg'),
        GMD: q(1, 'kg/dia'),
        cms: { origem: 'informado', CMS: q(9, 'kg') },
      }),
    ).toThrow(ErroUnidade);
  });

  it('resultado guarda coeficientes da categoria (A4)', () => {
    const r = energia(cat('cruzado_leite', 'femea'), 300, 1, 8);
    expect(r.km.coeficientes).toEqual({ b0: 0.513, b1: 0.173, b2: 0.01, theta: 1 });
    expect(r.ELg.coeficientes).toEqual({ b0: 0.061, expoentePCVZeq: 0.75, b1: 1.035 });
    expect(r.ED.coeficientes).toEqual({ inclinacao: 0.9455, intercepto: 0.3032 });
  });
});
