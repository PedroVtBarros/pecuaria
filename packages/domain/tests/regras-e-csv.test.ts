import { describe, expect, it } from 'vitest';
import {
  interpretarCsvAnimais,
  lerCsv,
  MODELO_CSV,
  validarConsistenciaAnimal,
  validarDataDeEvento,
} from '../src';

const HOJE = '2026-10-15';

describe('validarConsistenciaAnimal', () => {
  const base = {
    sexo: 'F' as const,
    condicaoSexual: 'femea' as const,
    categoria: 'novilha' as const,
    origem: 'comprado' as const,
    dataNascimento: '2024-05-01',
    dataEntrada: '2025-01-10',
  };

  it('aceita dados coerentes', () => {
    expect(validarConsistenciaAnimal(base, HOJE)).toEqual([]);
  });

  it('recusa categoria de sexo diferente', () => {
    expect(validarConsistenciaAnimal({ ...base, categoria: 'boi' }, HOJE)).toHaveLength(1);
  });

  it('recusa condição sexual incoerente com o sexo', () => {
    expect(validarConsistenciaAnimal({ ...base, condicaoSexual: 'castrado' }, HOJE)).toHaveLength(
      1,
    );
    expect(
      validarConsistenciaAnimal(
        { ...base, sexo: 'M', categoria: 'boi', condicaoSexual: 'femea' },
        HOJE,
      ),
    ).toHaveLength(1);
  });

  it('recusa datas no futuro e entrada antes do nascimento', () => {
    expect(
      validarConsistenciaAnimal({ ...base, dataNascimento: '2026-10-16' }, HOJE).length,
    ).toBeGreaterThan(0);
    expect(validarConsistenciaAnimal({ ...base, dataEntrada: '2024-04-30' }, HOJE)).toHaveLength(1);
  });

  it('exige nascimento para animal nascido na propriedade', () => {
    expect(
      validarConsistenciaAnimal({ ...base, origem: 'nascido', dataNascimento: null }, HOJE),
    ).toHaveLength(1);
  });
});

describe('validarDataDeEvento', () => {
  it('recusa evento no futuro, antes da entrada e antes da última movimentação', () => {
    const limites = { dataEntrada: '2026-01-01', hoje: HOJE, ultimoEvento: '2026-06-01' };
    expect(validarDataDeEvento('2026-07-01', limites, 'da transferência')).toEqual([]);
    expect(validarDataDeEvento('2026-10-16', limites, 'da transferência')).toHaveLength(1);
    expect(validarDataDeEvento('2025-12-31', limites, 'da transferência').length).toBeGreaterThan(
      0,
    );
    expect(validarDataDeEvento('2026-05-31', limites, 'da transferência')).toHaveLength(1);
  });
});

describe('lerCsv', () => {
  it('detecta ponto e vírgula, respeita aspas, BOM e linhas vazias', () => {
    const texto = '\uFEFFa;b;c\r\n1;"x;y";"diz ""oi"""\r\n\r\n2;;\n';
    expect(lerCsv(texto)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x;y', 'diz "oi"'],
      ['2', '', ''],
    ]);
  });

  it('detecta vírgula como separador', () => {
    expect(lerCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('interpretarCsvAnimais', () => {
  it('o modelo fornecido ao usuário é válido', () => {
    const r = interpretarCsvAnimais(MODELO_CSV);
    expect(r.erroGeral).toBeNull();
    expect(r.linhas.map((l) => l.erros)).toEqual([[], []]);
    expect(r.linhas[0]?.dados).toMatchObject({
      identificacao: 'BR-0001',
      sexo: 'F',
      condicaoSexual: 'femea',
      dataEntrada: '2022-03-10',
      pesoVivoKg: 420,
      metodoPesagem: 'balanca',
      loteNome: 'Lote Maternidade',
    });
    expect(r.linhas[1]?.dados).toMatchObject({
      dataNascimento: '2025-01-15',
      dataNascimentoEstimada: true,
      dataEntrada: '2025-05-20',
      pesoVivoKg: null,
    });
  });

  it('aceita cabeçalho com acentos e maiúsculas', () => {
    const r = interpretarCsvAnimais(
      'Identificação;Sexo;Categoria;Aptidão;Origem;Data entrada\nA1;Fêmea;Novilha;Corte;Comprado;01/02/2026',
    );
    expect(r.erroGeral).toBeNull();
    expect(r.linhas[0]?.erros).toEqual([]);
  });

  it('aponta colunas desconhecidas e obrigatórias ausentes', () => {
    expect(interpretarCsvAnimais('identificacao;cor\nA;preta').erroGeral).toMatch(
      /desconhecidas: cor/,
    );
    expect(interpretarCsvAnimais('identificacao;sexo\nA;F').erroGeral).toMatch(
      /obrigatórias ausentes/,
    );
  });

  it('lista os erros de cada linha com o número da linha no arquivo', () => {
    const r = interpretarCsvAnimais(
      'identificacao;sexo;categoria;aptidao;origem;data_entrada;peso_kg\n' +
        ';X;cavalo;corte;comprado;31/02/2026;1.050\n' +
        'A2;M;boi;corte;comprado;2026-01-01;\n',
    );
    const [l2, l3] = r.linhas;
    expect(l2?.linha).toBe(2);
    expect(l2?.dados).toBeNull();
    expect(l2?.erros.join(' ')).toMatch(/Identificação é obrigatória/);
    expect(l2?.erros.join(' ')).toMatch(/Sexo inválido/);
    expect(l2?.erros.join(' ')).toMatch(/Categoria inválida/);
    expect(l2?.erros.join(' ')).toMatch(/Data de entrada inválida/);
    expect(l2?.erros.join(' ')).toMatch(/ambíguo/);
    expect(l3?.erros).toEqual(['Para machos, informe a condição sexual (inteiro ou castrado).']);
  });
});
