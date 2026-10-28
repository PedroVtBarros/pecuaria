import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DadosLaudo, DadosMedicaoMs, DadosRotulo } from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import { criarPropriedade, dadosAlimento, dadosNutriente, ID_MS } from './apoio-teste-alimentos';

/*
 * Nomes e números FICTÍCIOS (CLAUDE.md, regra 1): rótulo, laudo e medição de teste.
 */
let amb: AmbienteIpc;
let prop: string;
let outra: string;
let nut: string;
let alimentoId: string;
beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 21, 10) });
  prop = (await criarPropriedade(amb, 'Fazenda 1')).id;
  outra = (await criarPropriedade(amb, 'Fazenda 2')).id;
  nut = (await amb.ok('nutriente:criar', { dados: dadosNutriente() })).id;
  alimentoId = (await amb.ok('alimento:criar', { dados: dadosAlimento() })).id;
});
afterEach(() => amb.encerrar());

const contar = (t: string) =>
  (amb.gerenciador.conexao.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;

function rotulo(extra: Partial<DadosRotulo> = {}): DadosRotulo {
  return {
    alimentoId: null,
    alimento: dadosAlimento({
      nome: 'Produto comercial de teste',
      formaConservacao: 'mistura_comercial',
      classe: 'suplemento_mineral',
      comercial: false,
    }),
    titulo: 'Rótulo fictício de teste',
    fabricante: 'Fabricante fictício',
    registroProduto: 'REG-TESTE-1',
    observacoes: null,
    separadorDecimal: 'virgula',
    garantias: [
      {
        nutrienteId: nut,
        valorPublicado: '120',
        unidade: 'g_kg',
        tipoValor: 'minimo_garantido',
        observacao: null,
      },
      {
        nutrienteId: nut,
        valorPublicado: '150',
        unidade: 'g_kg',
        tipoValor: 'maximo_garantido',
        observacao: null,
      },
    ],
    ...extra,
  };
}

function laudo(extra: Partial<DadosLaudo> = {}): DadosLaudo {
  return {
    propriedadeId: prop,
    alimentoId,
    laboratorio: 'Laboratório fictício',
    numeroLaudo: 'L-0001',
    dataLaudo: '2026-10-10',
    dataAmostra: '2026-10-01',
    identificacaoAmostra: 'Amostra 1',
    observacoes: null,
    separadorDecimal: 'virgula',
    valores: [
      {
        nutrienteId: nut,
        valorPublicado: '8,3',
        unidade: 'pct',
        base: 'ms',
        metodoAnaliticoFonte: 'Método fictício do laudo',
        observacao: null,
      },
    ],
    ...extra,
  };
}

function medicao(extra: Partial<DadosMedicaoMs> = {}): DadosMedicaoMs {
  return {
    propriedadeId: prop,
    alimentoId,
    fonteId: null,
    metodo: {
      titulo: 'Método fictício de secagem',
      metodoMedicao: 'Descrição fictícia do procedimento',
      limitacoesMedicao: 'Limitações fictícias declaradas',
    },
    nutrienteId: ID_MS,
    dataAmostra: '2026-10-05',
    identificacaoAmostra: null,
    separadorDecimal: 'virgula',
    valorPublicado: '31,4',
    tipoValor: 'valor_unico',
    nObservacoes: null,
    observacao: null,
    ...extra,
  };
}

describe('5A-4: produto comercial pelo rótulo', () => {
  it('cria alimento comercial, fonte de rótulo e registro em rascunho com garantias em MN', async () => {
    const r = await amb.ok('rotulo:registrar', rotulo());
    expect(r.registro.status).toBe('rascunho');
    expect(r.fonte).toMatchObject({
      origem: 'rotulo_comercial',
      fabricante: 'Fabricante fictício',
      propriedadeId: null,
    });
    expect(r.valores.map((v) => [v.tipoValor, v.valorPublicado, v.unidade, v.base])).toEqual([
      ['minimo_garantido', '120', 'g_kg', 'mn'],
      ['maximo_garantido', '150', 'g_kg', 'mn'],
    ]);
    const a = (await amb.ok('alimento:obter', { id: r.registro.alimentoId })).alimento;
    expect(a).toMatchObject({ comercial: true, classe: 'suplemento_mineral' });
    // Passa pelo mesmo fluxo de conferência.
    await amb.ok('composicao:transcrever', { id: r.registro.id, responsavel: 'Pessoa A' });
    const c = await amb.ok('composicao:conferir', { id: r.registro.id, responsavel: 'Pessoa B' });
    expect(c.registro.status).toBe('conferido');
    // Segundo rótulo do mesmo produto: escolhe o alimento existente.
    const r2 = await amb.ok('rotulo:registrar', {
      ...rotulo({ titulo: 'Rótulo fictício, nova embalagem' }),
      alimentoId: a.id,
      alimento: null,
    });
    expect(r2.registro.alimentoId).toBe(a.id);
    expect(
      (await amb.ok('composicao:listar', { origem: 'rotulo_comercial' })).map((x) => x.id).sort(),
    ).toEqual([r.registro.id, r2.registro.id].sort());
  });

  it('erro em qualquer garantia desfaz tudo; alimento não comercial e repetições recusados', async () => {
    const antes = ['alimento', 'fonte', 'registro_composicao', 'valor_nutricional'].map(contar);
    const ruim = rotulo();
    ruim.garantias[1] = { ...ruim.garantias[1]!, valorPublicado: 'ND' };
    expect(await amb.chamar('rotulo:registrar', ruim)).toMatchObject({
      ok: false,
      erro: { codigo: 'OPERACAO_INVALIDA' },
    });
    expect(['alimento', 'fonte', 'registro_composicao', 'valor_nutricional'].map(contar)).toEqual(
      antes,
    );
    expect(
      await amb.chamar('rotulo:registrar', { ...rotulo(), alimentoId, alimento: null }),
    ).toMatchObject({ ok: false, erro: { codigo: 'OPERACAO_INVALIDA' } });
    const repetida = rotulo();
    repetida.garantias[1] = { ...repetida.garantias[0]! };
    expect(await amb.chamar('rotulo:registrar', repetida)).toMatchObject({
      ok: false,
      erro: { codigo: 'ENTRADA_INVALIDA' },
    });
    expect(await amb.chamar('rotulo:registrar', { ...rotulo(), alimentoId })).toMatchObject({
      ok: false,
      erro: { codigo: 'ENTRADA_INVALIDA' },
    });
    expect(['alimento', 'fonte', 'registro_composicao'].map(contar)).toEqual(antes.slice(0, 3));
  });
});

describe('5A-4: laudo laboratorial', () => {
  it('pertence à propriedade e à amostra; não aparece na outra propriedade', async () => {
    const r = await amb.ok('laudo:registrar', laudo());
    expect(r.fonte).toMatchObject({
      origem: 'laboratorial',
      laboratorio: 'Laboratório fictício',
      numeroLaudo: 'L-0001',
      propriedadeId: prop,
    });
    expect(r.registro).toMatchObject({
      dataAmostra: '2026-10-01',
      identificacaoAmostra: 'Amostra 1',
    });
    expect(r.valores[0]).toMatchObject({
      tipoValor: 'valor_unico',
      valorPublicado: '8,3',
      metodoAnaliticoFonte: 'Método fictício do laudo',
    });
    const de = async (propriedadeId: string) =>
      (await amb.ok('composicao:listar', { propriedadeId, somenteDaPropriedade: true })).map(
        (x) => x.id,
      );
    expect(await de(prop)).toEqual([r.registro.id]);
    expect(await de(outra)).toEqual([]);
    expect((await amb.ok('alimento:obter', { id: alimentoId })).registros).toEqual([]);
    expect(
      (await amb.ok('alimento:obter', { id: alimentoId, propriedadeId: outra })).registros,
    ).toEqual([]);
    expect(
      (await amb.ok('alimento:obter', { id: alimentoId, propriedadeId: prop })).registros,
    ).toHaveLength(1);
  });

  it('valor inválido desfaz o laudo inteiro; propriedade inexistente é recusada', async () => {
    const antes = ['fonte', 'registro_composicao'].map(contar);
    const ruim = laudo();
    ruim.valores.push({ ...ruim.valores[0]!, base: 'mn', valorPublicado: '101' });
    expect((await amb.chamar('laudo:registrar', ruim)).ok).toBe(false);
    expect(
      (
        await amb.chamar(
          'laudo:registrar',
          laudo({ propriedadeId: '01929c20-0000-7000-8000-0000000000ff' }),
        )
      ).ok,
    ).toBe(false);
    expect(['fonte', 'registro_composicao'].map(contar)).toEqual(antes);
  });
});

describe('5A-4: MS medida na fazenda', () => {
  it('grava método e limitações do usuário; valor em % da MN; método reaproveitado', async () => {
    const r = await amb.ok('medicaoMs:registrar', medicao());
    expect(r.fonte).toMatchObject({
      origem: 'medicao_propria',
      metodoMedicao: 'Descrição fictícia do procedimento',
      limitacoesMedicao: 'Limitações fictícias declaradas',
      propriedadeId: prop,
    });
    expect(r.valores[0]).toMatchObject({
      nutriente: { codigo: 'MS' },
      valorPublicado: '31,4',
      valor: 31.4,
      unidade: 'pct',
      base: 'mn',
    });
    const r2 = await amb.ok('medicaoMs:registrar', {
      ...medicao({ dataAmostra: '2026-10-12', valorPublicado: '29,9' }),
      fonteId: r.fonte.id,
      metodo: null,
    });
    expect(r2.fonte.id).toBe(r.fonte.id);
    expect(contar('fonte')).toBe(1);
  });

  it('só matéria seca; método de outra propriedade recusado; faixa conferida', async () => {
    expect(await amb.chamar('medicaoMs:registrar', medicao({ nutrienteId: nut }))).toMatchObject({
      ok: false,
      erro: { codigo: 'OPERACAO_INVALIDA' },
    });
    const r = await amb.ok('medicaoMs:registrar', medicao());
    expect(
      (
        await amb.chamar('medicaoMs:registrar', {
          ...medicao({ propriedadeId: outra }),
          fonteId: r.fonte.id,
          metodo: null,
        })
      ).ok,
    ).toBe(false);
    expect((await amb.chamar('medicaoMs:registrar', medicao({ valorPublicado: '100,5' }))).ok).toBe(
      false,
    );
    expect(
      (await amb.chamar('medicaoMs:registrar', { ...medicao(), fonteId: r.fonte.id })).ok,
    ).toBe(false);
  });
});
