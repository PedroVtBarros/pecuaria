import { describe, expect, it } from 'vitest';
import {
  aplicar,
  calcularPeso,
  CLASSES_SEXUAIS,
  confereImpresso,
  EQUACOES_PESO,
  ErroUnidade,
  GPCVZ,
  GRUPOS_GENETICOS,
  PCJ_CRUZADO_LEITE,
  PCJ_ZEBUINO_CRUZADO_CORTE_E_PASTO,
  PCVZ_CONFINAMENTO_EQ,
  PCVZ_EQUIVALENTE,
  PCVZ_MATURIDADE,
  PCVZ_PASTO,
  q,
  registroPeso,
  type Categoria,
  type ClasseSexual,
  type GrupoGenetico,
} from '../src';

/*
 * 6A-2: grupo peso do BR-CORTE 2023 (INVENTARIO_BR_CORTE.md, seção 12). Valores esperados
 * copiados do livro como impressos (texto com vírgula), página citada em cada caso; a comparação
 * usa meia unidade do último algarismo impresso (C8) e precisão integral no cálculo.
 */
const cat = (
  grupo: GrupoGenetico,
  sexo: ClasseSexual = 'macho_nao_castrado',
  sistema: Categoria['sistema'] = 'confinamento',
): Categoria => ({ grupo, sexo, sistema });
const Z = cat('zebuino');
const valor = (e: Parameters<typeof aplicar>[0], c: Categoria, nome: string, x: number) =>
  aplicar(e, c, { [nome]: q(x, e.entradas[nome]!) }).valor!;
function confere(calculado: number, impresso: string, onde: string) {
  expect(
    confereImpresso(calculado, impresso),
    `${onde}: calculado ${calculado}, impresso ${impresso}`,
  ).toBe(true);
}

describe('6A-2: registro das equações de peso', () => {
  it('todas transcritas, conferidas na imagem, com página, caso de teste e aprovação do usuário', () => {
    const r = registroPeso();
    expect(r.listar().map((e) => e.id)).toEqual([
      'BRC23-P-01',
      'BRC23-P-02',
      'BRC23-P-03-08',
      'BRC23-P-09',
      'BRC23-P-10',
      'BRC23-P-11',
    ]);
    for (const e of EQUACOES_PESO) {
      expect(e.conferencia.conferencias[0]!.metodo).toMatch(/imagem da página/);
      expect(e.conferencia.aprovacaoUsuario).toEqual({ por: 'Usuário', data: '2026-10-22' });
      expect(e.referencias.every((x) => x.pagina > 0)).toBe(true);
    }
  });
});

describe('6A-2: casos do livro', () => {
  it('T-07, Tabela 1.5 (p. 8): PCJ pelas Eq. 1.3 e 1.4', () => {
    const pcs = [150, 300, 450, 600];
    const z = ['144,2', '291,5', '439,9', '589,1'];
    const cl = ['144,7', '291,2', '438,3', '585,8'];
    pcs.forEach((pc, i) => {
      confere(valor(PCJ_ZEBUINO_CRUZADO_CORTE_E_PASTO, Z, 'PC', pc), z[i]!, `Eq. 1.3, PC ${pc}`);
      confere(
        valor(PCJ_CRUZADO_LEITE, cat('cruzado_leite'), 'PC', pc),
        cl[i]!,
        `Eq. 1.4, PC ${pc}`,
      );
    });
  });

  // T-08, Tabela 1.7 (p. 9). D-PESO-02: o resultado esperado do motor é o de precisão integral a
  // partir do PC; a reprodução do arredondamento intermediário do livro fica em teste separado.
  const PCS = [150, 300, 450, 600];
  const PCJ_IMPRESSO = [144.2, 291.5, 439.9, 589.1];
  const PASTO_IMPRESSO = ['122,8', '248,3', '374,7', '501,8'];
  const CONF_IMPRESSO = ['125,2', '255,6', '387,9', '521,5'];
  const pastoZ = cat('zebuino', 'macho_nao_castrado', 'pasto');

  it('T-08, Tabela 1.7 (p. 9), precisão integral a partir do PC', () => {
    PCS.forEach((pc, i) => {
      const r = calcularPeso(pastoZ, { PC: q(pc, 'kg'), GMD: q(0.5, 'kg/dia') });
      confere(r.PCVZ.valor!, PASTO_IMPRESSO[i]!, `pasto PC ${pc}`);
    });
    PCS.slice(1).forEach((pc, i) => {
      const r = calcularPeso(Z, { PC: q(pc, 'kg'), GMD: q(1, 'kg/dia') });
      confere(r.PCVZ.valor!, CONF_IMPRESSO[i + 1]!, `confinamento PC ${pc}`);
    });
    // PC 150, confinado: precisão integral dá 125,28 (impresso 125,2, do PCJ arredondado 144,2).
    const pc150 = calcularPeso(Z, { PC: q(150, 'kg'), GMD: q(1, 'kg/dia') }).PCVZ.valor!;
    confere(pc150, '125,3', 'confinamento PC 150, precisão integral');
    expect(confereImpresso(pc150, CONF_IMPRESSO[0]!)).toBe(false);
  });

  it('T-08, Tabela 1.7 (p. 9), etapa a partir do PCJ impresso (arredondamento intermediário do livro)', () => {
    PCJ_IMPRESSO.forEach((pcj, i) =>
      confere(valor(PCVZ_PASTO, pastoZ, 'PCJ', pcj), PASTO_IMPRESSO[i]!, `pasto PCJ ${pcj}`),
    );
    // Só as linhas de PC 150 e 300 do confinamento foram calculadas do PCJ arredondado.
    [0, 1].forEach((i) =>
      confere(
        valor(PCVZ_CONFINAMENTO_EQ, Z, 'PCJ', PCJ_IMPRESSO[i]!),
        CONF_IMPRESSO[i]!,
        `confinamento PCJ ${PCJ_IMPRESSO[i]}`,
      ),
    );
  });

  it('T-09, Tabela 1.8 (p. 10): PCVZ/PCJ de zebuíno não castrado; demais linhas com divergência registrada', () => {
    const razao = (c: Categoria, pcj: number) => valor(PCVZ_CONFINAMENTO_EQ, c, 'PCJ', pcj) / pcj;
    ['0,869', '0,877', '0,882', '0,885'].forEach((r, i) =>
      confere(razao(Z, [150, 300, 450, 600][i]!), r, 'Z MNC'),
    );
    // Divergência D-PESO-01: as Eq. 1.7 a 1.11, com os coeficientes impressos nas Tabelas 1.6, 8.10
    // e 9.13 e na planilha oficial, dão razões 0,001 a 0,002 acima das da Tabela 1.8. Não se ajusta
    // coeficiente: o teste prende o tamanho da diferença para que mudança apareça.
    const impressas: [Categoria, number[]][] = [
      [cat('cruzado_corte'), [0.847, 0.866, 0.877, 0.885]],
      [cat('zebuino', 'macho_castrado'), [0.844, 0.881, 0.904, 0.92]],
      [cat('cruzado_corte', 'macho_castrado'), [0.844, 0.874, 0.892, 0.905]],
      [cat('zebuino', 'femea'), [0.851, 0.892, 0.917, 0.935]],
      [cat('cruzado_corte', 'femea'), [0.852, 0.888, 0.911, 0.927]],
    ];
    for (const [c, linha] of impressas)
      linha.forEach((r, i) => {
        const d = razao(c, [150, 300, 450, 600][i]!) - r;
        expect(d, `${c.grupo} ${c.sexo}`).toBeGreaterThan(0);
        expect(d).toBeLessThan(0.003);
      });
  });

  it('T-10, Tabela 1.9 (p. 11): GPCVZ pela Eq. 1.12', () => {
    const gmd = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75];
    const g = ['0,24', '0,48', '0,72', '0,96', '1,21', '1,45', '1,70'];
    const razao = ['0,943', '0,953', '0,959', '0,963', '0,966', '0,969', '0,971'];
    const reducao = ['5,7', '4,7', '4,1', '3,7', '3,4', '3,1', '2,9'];
    gmd.forEach((x, i) => {
      const v = valor(GPCVZ, Z, 'GMD', x);
      confere(v, g[i]!, `GMD ${x}`);
      confere(v / x, razao[i]!, `razão ${x}`);
      confere((1 - v / x) * 100, reducao[i]!, `redução ${x}`);
    });
  });

  it('T-01 (p. 199), T-03 (p. 264), T-04 (p. 432) e T-11 (p. 192): cadeia de zebuíno não castrado confinado', () => {
    const t01 = calcularPeso(Z, { PC: q(520, 'kg'), GMD: q(1.6, 'kg/dia') });
    confere(t01.PCJ.valor!, '509,5', 'T-01 PCJ');
    confere(t01.PCVZ.valor!, '450,1', 'T-01 PCVZ');
    confere(t01.GPCVZ.valor!, '1,55', 'T-01 GPCVZ');
    confere(t01.PCVZeq.valor!, '450,1', 'T-01 PCVZeq');
    const t03 = calcularPeso(Z, { PC: q(400, 'kg'), GMD: q(1, 'kg/dia') });
    confere(t03.PCJ.valor!, '390,4', 'T-03 PCJ');
    confere(t03.PCVZ.valor!, '344', 'T-03 PCVZ');
    confere(t03.GPCVZ.valor!, '0,963', 'T-03 GPCVZ');
    confere(
      calcularPeso(Z, { PC: q(520, 'kg'), GMD: q(1.4, 'kg/dia') }).GPCVZ.valor!,
      '1,355',
      'T-04',
    );
    // "um animal nelore não-castrado com um peso corporal de 350 kg [...] equivaleria a um PCVZeq de 300 kg"
    confere(
      calcularPeso(Z, { PC: q(350, 'kg'), GMD: q(1, 'kg/dia') }).PCVZeq.valor!,
      '300',
      'T-11',
    );
    for (const r of Object.values(t01))
      expect(r).toMatchObject({ situacao: 'valido', usoOperacional: true });
  });
});

describe('6A-2: planilha oficial BR-CORTE 2023 (T-12, referência independente da transcrição)', () => {
  it('valores salvos na aba "Crescimento" (células D28 a D46), com precisão integral', () => {
    const perto = (calc: number, planilha: number) =>
      expect(Math.abs(calc - planilha) / planilha).toBeLessThan(1e-12);
    perto(valor(PCJ_ZEBUINO_CRUZADO_CORTE_E_PASTO, Z, 'PC', 420), 410.18682052694555);
    perto(valor(PCJ_ZEBUINO_CRUZADO_CORTE_E_PASTO, Z, 'PC', 440), 430.0214897534866);
    const pcj = valor(PCJ_ZEBUINO_CRUZADO_CORTE_E_PASTO, Z, 'PC', 430);
    perto(pcj, 420.10241368497736);
    const pcvz = valor(PCVZ_CONFINAMENTO_EQ, Z, 'PCJ', pcj);
    perto(pcvz, 370.1561369747387);
    perto(valor(PCVZ_CONFINAMENTO_EQ, cat('cruzado_corte'), 'PCJ', pcj), 368.08380861788544);
    perto(valor(GPCVZ, Z, 'GMD', 1.5), 1.4533711137530432);
    perto(valor(PCVZ_EQUIVALENTE, cat('cruzado_corte'), 'PCVZ', pcvz), 341.7334335998927);
    perto(valor(PCVZ_EQUIVALENTE, cat('cruzado_leite'), 'PCVZ', pcvz), 310.66675781808425);
  });
});

describe('6A-2: categorias, escopo, domínio e unidades', () => {
  it('PCVZmat da Tabela 8.5 igual aos divisores da Tabela 9.13; zebuíno não castrado é a referência', () => {
    expect(
      GRUPOS_GENETICOS.map((g) => CLASSES_SEXUAIS.map((s) => PCVZ_MATURIDADE[g][s].valor)),
    ).toEqual([
      [517, 433, 402],
      [560, 482, 417],
      [616, 532, 493],
    ]);
    expect(valor(PCVZ_EQUIVALENTE, Z, 'PCVZ', 450.1)).toBe(450.1);
  });

  it('equação certa por categoria: cruzado de leite confinado usa a Eq. 1.4; a pasto, Eq. 1.3 e 1.5', () => {
    const cl = calcularPeso(cat('cruzado_leite'), { PC: q(400, 'kg'), GMD: q(1, 'kg/dia') });
    expect([cl.PCJ.equacaoId, cl.PCVZ.equacaoId]).toEqual(['BRC23-P-02', 'BRC23-P-03-08']);
    const pasto = calcularPeso(cat('zebuino', 'macho_castrado', 'pasto'), {
      PC: q(400, 'kg'),
      GMD: q(0.5, 'kg/dia'),
    });
    expect([pasto.PCJ.equacaoId, pasto.PCVZ.equacaoId]).toEqual(['BRC23-P-01', 'BRC23-P-09']);
    expect(aplicar(PCJ_CRUZADO_LEITE, Z, { PC: q(400, 'kg') }).situacao).toBe('fora_do_escopo');
    expect(aplicar(PCVZ_PASTO, Z, { PCJ: q(400, 'kg') }).situacao).toBe('fora_do_escopo');
  });

  it('a pasto, fêmeas e cruzados ficam fora do escopo (P-03), sem valor', () => {
    for (const c of [
      cat('zebuino', 'femea', 'pasto'),
      cat('cruzado_corte', 'macho_nao_castrado', 'pasto'),
      cat('cruzado_leite', 'macho_castrado', 'pasto'),
    ]) {
      const r = calcularPeso(c, { PC: q(400, 'kg'), GMD: q(1, 'kg/dia') });
      expect(
        Object.values(r).every((x) => x.situacao === 'fora_do_escopo' && x.valor === null),
      ).toBe(true);
    }
  });

  it('GMD negativo fora do escopo; GMD zero dá GPCVZ zero, válido (P-01)', () => {
    expect(aplicar(GPCVZ, Z, { GMD: q(-0.1, 'kg/dia') })).toMatchObject({
      situacao: 'fora_do_escopo',
      valor: null,
      motivos: ['GMD negativo fora do escopo (P-01).'],
    });
    expect(aplicar(GPCVZ, Z, { GMD: q(0, 'kg/dia') })).toMatchObject({
      situacao: 'valido',
      valor: 0,
    });
  });

  it('fora do domínio: calcula sem uso operacional e propaga; domínio é o mais estreito', () => {
    // Zebuína confinada: PCJ dos dados de 121 a 437 kg (Tabela 8.1); PC 600 → PCJ ~589.
    const r = calcularPeso(cat('zebuino', 'femea'), { PC: q(600, 'kg'), GMD: q(1, 'kg/dia') });
    expect(r.PCJ.situacao).toBe('valido');
    expect(r.PCVZ).toMatchObject({ situacao: 'fora_do_dominio', usoOperacional: false });
    expect(r.PCVZ.motivos[0]).toMatch(
      /fora do domínio validado \(121 a 437 kg, limite provisório; Tabela 1\.2, p\. 5 \(banco de 2016; provisório, P-13\); Tabela 8\.1, p\. 179\)/,
    );
    expect(r.PCJ.avisos[0]).toMatch(/Domínio de PC provisório \(81 a 710 kg; Tabela 1\.2/);
    expect(r.PCVZeq.usoOperacional).toBe(false);
    // GMD acima do máximo da categoria (Z MC confinado: 1,53 kg/dia).
    expect(aplicar(GPCVZ, cat('zebuino', 'macho_castrado'), { GMD: q(2, 'kg/dia') }).situacao).toBe(
      'fora_do_dominio',
    );
    // PC acima da Tabela 1.2 (710 kg).
    expect(aplicar(PCJ_ZEBUINO_CRUZADO_CORTE_E_PASTO, Z, { PC: q(750, 'kg') }).situacao).toBe(
      'fora_do_dominio',
    );
  });

  it('unidades explícitas: PC em kg/dia ou GMD em kg é recusado; ausente fica indeterminado', () => {
    expect(() => calcularPeso(Z, { PC: q(400, 'kg/dia'), GMD: q(1, 'kg/dia') })).toThrow(
      ErroUnidade,
    );
    expect(() => calcularPeso(Z, { PC: q(400, 'kg'), GMD: q(1, 'kg') })).toThrow(ErroUnidade);
    const r = calcularPeso(Z, { PC: null, GMD: q(1, 'kg/dia') });
    expect([r.PCJ.situacao, r.PCVZ.situacao, r.PCVZeq.situacao, r.GPCVZ.situacao]).toEqual([
      'indeterminado',
      'indeterminado',
      'indeterminado',
      'valido',
    ]);
    expect(r.PCJ.valor).toBeNull();
  });

  it('o resultado guarda coeficientes e entradas (A4)', () => {
    const r = calcularPeso(cat('cruzado_corte', 'femea'), {
      PC: q(400, 'kg'),
      GMD: q(1, 'kg/dia'),
    });
    expect(r.PCVZ.coeficientes).toEqual({ a: 0.6314, b: 1.0602 });
    expect(r.PCVZeq.coeficientes).toEqual({ PCVZmat: 417, referencia: 517 });
    expect(r.PCJ.entradas).toEqual({ PC: { valor: 400, unidade: 'kg' } });
  });
});
