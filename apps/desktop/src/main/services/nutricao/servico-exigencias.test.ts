import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLASSES_SEXUAIS,
  confereImpresso,
  GRUPOS_GENETICOS,
  SISTEMAS,
  VERSAO_MOTOR,
} from '@pecuaria/nutrition-engine';
import {
  GRUPOS_EXIGENCIA,
  SEXOS_EXIGENCIA,
  SISTEMAS_EXIGENCIA,
  type EntradaExigencias,
  type ExigenciasCalculadas,
} from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import { ServicoExigencias } from './servico-exigencias';

/* 6A-7: o serviço só traduz a entrada para o motor e devolve resultados explicáveis. */
const servico = new ServicoExigencias();
const T04: EntradaExigencias = {
  grupo: 'zebuino',
  sexo: 'macho_nao_castrado',
  sistema: 'confinamento',
  pcKg: 520,
  gmdKgDia: 1.4,
  cms: { fonte: 'confinamento' },
};
const achar = (r: ExigenciasCalculadas, chave: string) =>
  Object.values(r.grupos)
    .flat()
    .find((i) => i.chave === chave)!;

describe('ServicoExigencias', () => {
  it('listas da entrada iguais às do motor', () => {
    expect([...GRUPOS_EXIGENCIA]).toEqual([...GRUPOS_GENETICOS]);
    expect([...SEXOS_EXIGENCIA]).toEqual([...CLASSES_SEXUAIS]);
    expect([...SISTEMAS_EXIGENCIA]).toEqual([...SISTEMAS]);
  });

  it('T-04 (p. 432–434): valores do livro, CMS previsto identificado, fonte e versão', () => {
    const r = servico.calcular(T04);
    expect(r.fonte).toMatchObject({ edicao: '4ª edição', ano: 2023 });
    expect(r.versaoMotor).toBe(VERSAO_MOTOR);
    expect(r.cmsUsado).toEqual({ origem: 'previsto', equacaoId: 'BRC23-C-01-03' });
    for (const [chave, impresso] of [
      ['PCVZ', '450,1'],
      ['CMS', '10,62'],
      ['EMtotal', '27,18'],
      ['NDT', '7,31'],
      ['PB', '1135'],
      ['Ca.dietetica', '27,24'],
      ['S.dietetica', '19,08'],
      ['CaP', '2,63'],
    ] as const)
      expect(confereImpresso(achar(r, chave).valor!, impresso), chave).toBe(true);
    const cms = achar(r, 'CMS');
    expect(cms.descricao).toMatch(/Eq\. 2\.1/);
    expect(cms.referencias.map((x) => x.pagina)).toContain(25);
    expect(cms.aprovacao).not.toBeNull();
    expect(achar(r, 'NDT').notas).toContain('CMS usado: previsto pelo motor (BRC23-C-01-03).');
    expect(r.resumo.total).toBe(
      r.resumo.valido + r.resumo.fora_do_dominio + r.resumo.fora_do_escopo + r.resumo.indeterminado,
    );
    expect(r.grupos.minerais).toHaveLength(25);
  });

  it('CMS informado: nó sem aprovação de equação (não é do livro), identificado', () => {
    const r = servico.calcular({ ...T04, cms: { fonte: 'informado', cmsKgDia: 10.62 } });
    expect(r.cmsUsado).toEqual({ origem: 'informado', equacaoId: 'CMS-INFORMADO' });
    expect(achar(r, 'CMS').aprovacao).toBeNull();
    expect(achar(r, 'ED').notas).toContain('CMS usado: informado pelo usuário.');
  });

  it('fora do escopo e indeterminados chegam com motivo, sem valor', () => {
    const r = servico.calcular({ ...T04, sexo: 'femea', sistema: 'pasto' });
    expect(achar(r, 'EMtotal')).toMatchObject({ situacao: 'fora_do_escopo', valor: null });
    expect(achar(r, 'EMtotal').motivos[0]).toMatch(/restrição do projeto/);
    expect(r.resumo.valido).toBe(0);
    const zero = servico.calcular({ ...T04, gmdKgDia: 0 });
    expect(achar(zero, 'ELm').situacao).toBe('valido');
    expect(achar(zero, 'NDT')).toMatchObject({ situacao: 'fora_do_escopo', valor: null });
  });
});

describe('canal nutricao:calcularExigencias', () => {
  let amb: AmbienteIpc;
  beforeEach(async () => {
    amb = await criarAmbienteIpc();
  });
  afterEach(() => amb.encerrar());

  it('calcula pela API e recusa entrada inválida (Zod no main)', async () => {
    const r = await amb.ok('nutricao:calcularExigencias', T04);
    expect(confereImpresso(achar(r, 'CMS').valor!, '10,62')).toBe(true);
    expect(await amb.chamar('nutricao:calcularExigencias', { ...T04, pcKg: -1 })).toMatchObject({
      ok: false,
      erro: { codigo: 'ENTRADA_INVALIDA' },
    });
    expect(
      await amb.chamar('nutricao:calcularExigencias', {
        ...T04,
        // @ts-expect-error vaca leiteira não é categoria do BR-CORTE (A6)
        grupo: 'holandes',
      }),
    ).toMatchObject({ ok: false, erro: { codigo: 'ENTRADA_INVALIDA' } });
  });
});
