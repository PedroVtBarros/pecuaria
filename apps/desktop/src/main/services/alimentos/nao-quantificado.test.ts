import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DadosRegistro, DadosValorNaoQuantificado } from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import { dadosAlimento, dadosFonte, dadosNutriente } from './apoio-teste-alimentos';

/*
 * Textos, legendas e números FICTÍCIOS (CLAUDE.md, regra 1): provam o armazenamento do valor
 * não quantificado, não representam composição nem legenda de nenhuma fonte.
 */
let amb: AmbienteIpc;
let fonteId: string;
let alimentoId: string;
let nutA: string;
beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 21, 10) });
  fonteId = (await amb.ok('fonte:criar', { dados: dadosFonte() })).id;
  alimentoId = (await amb.ok('alimento:criar', { dados: dadosAlimento() })).id;
  nutA = (await amb.ok('nutriente:criar', { dados: dadosNutriente() })).id;
});
afterEach(() => amb.encerrar());

function registro(extra: Partial<DadosRegistro> = {}): DadosRegistro {
  return {
    alimentoId,
    fonteId,
    referenciaLocal: 'Tabela fictícia 1',
    idadeCorteDias: null,
    classeIdadeFonte: null,
    aditivoEnsilagem: null,
    regiao: null,
    estacao: null,
    adubacao: null,
    outrasCondicoes: null,
    nObservacoes: null,
    separadorDecimal: 'virgula',
    dataAmostra: null,
    identificacaoAmostra: null,
    observacoes: null,
    ...extra,
  };
}
function nq(extra: Partial<DadosValorNaoQuantificado> = {}): DadosValorNaoQuantificado {
  return {
    nutrienteId: nutA,
    textoPublicado: '<0,01',
    natureza: 'abaixo_do_limite',
    significadoFonte: 'Legenda fictícia da tabela 1: abaixo do limite de quantificação.',
    unidade: 'pct',
    base: 'ms',
    tipoValor: 'media',
    metodoAnaliticoFonte: null,
    referenciaLocal: null,
    observacao: null,
    ...extra,
  };
}
const linhas = (sql: string, ...p: unknown[]) => amb.gerenciador.conexao.prepare(sql).all(...p);

describe('5B-1: valores não quantificados', () => {
  it('grava texto e significado como publicados, sem número, e nada em valor_nutricional', async () => {
    const r = await amb.ok('composicao:criar', { dados: registro() });
    const d = await amb.ok('composicao:salvarNaoQuantificado', {
      registroId: r.registro.id,
      valorId: null,
      dados: nq(),
    });
    expect(d.valores).toEqual([]);
    expect(d.valoresNaoQuantificados).toEqual([
      expect.objectContaining({
        textoPublicado: '<0,01',
        natureza: 'abaixo_do_limite',
        significadoFonte: 'Legenda fictícia da tabela 1: abaixo do limite de quantificação.',
        unidade: 'pct',
        base: 'ms',
      }),
    ]);
    expect(Object.keys(d.valoresNaoQuantificados[0]!)).not.toContain('valor');
    expect(d.registro.nValores).toBe(1);
    expect(linhas('SELECT * FROM valor_nutricional')).toEqual([]);
    // A trilha guarda o que foi incluído.
    const trilha = linhas(
      "SELECT dados_novos_json FROM historico_alteracao WHERE entidade = 'registro_composicao' AND acao = 'alteracao'",
    ) as { dados_novos_json: string }[];
    expect(trilha.at(-1)!.dados_novos_json).toContain('naoQuantificadoIncluido');
  });

  it('recusa número, símbolo trocado, significado vazio e o mesmo nutriente com número', async () => {
    const r = await amb.ok('composicao:criar', { dados: registro() });
    const salvar = (dados: DadosValorNaoQuantificado) =>
      amb.chamar('composicao:salvarNaoQuantificado', {
        registroId: r.registro.id,
        valorId: null,
        dados,
      });
    expect(await salvar(nq({ textoPublicado: '0,01' }))).toMatchObject({
      ok: false,
      erro: { mensagem: expect.stringMatching(/é um número/) },
    });
    expect((await salvar(nq({ textoPublicado: 'ND' }))).ok).toBe(false);
    expect((await salvar(nq({ significadoFonte: '   ' }))).ok).toBe(false);
    await amb.ok('composicao:salvarValor', {
      registroId: r.registro.id,
      valorId: null,
      dados: {
        nutrienteId: nutA,
        valorPublicado: '12,5',
        unidade: 'pct',
        base: 'ms',
        tipoValor: 'media',
        desvioPadraoPublicado: null,
        minimoPublicado: null,
        maximoPublicado: null,
        nObservacoes: null,
        metodoAnaliticoFonte: null,
        referenciaLocal: null,
        observacao: null,
      },
    });
    expect(await salvar(nq())).toMatchObject({
      ok: false,
      erro: { mensagem: expect.stringMatching(/mesmo nutriente, tipo e base/) },
    });
    // Outra base é outro valor publicado.
    expect((await salvar(nq({ base: 'mn' }))).ok).toBe(true);
  });

  it('transcreve só com não quantificado, congela no conferido e copia na nova versão', async () => {
    const r = await amb.ok('composicao:criar', { dados: registro() });
    const d = await amb.ok('composicao:salvarNaoQuantificado', {
      registroId: r.registro.id,
      valorId: null,
      dados: nq(),
    });
    const vId = d.valoresNaoQuantificados[0]!.id;
    await amb.ok('composicao:transcrever', { id: r.registro.id, responsavel: 'Pessoa A' });
    await amb.ok('composicao:conferir', { id: r.registro.id, responsavel: 'Pessoa B' });
    for (const [canal, entrada] of [
      [
        'composicao:salvarNaoQuantificado',
        { registroId: r.registro.id, valorId: vId, dados: nq({ textoPublicado: '<0,02' }) },
      ],
      ['composicao:removerNaoQuantificado', { registroId: r.registro.id, valorId: vId }],
    ] as const)
      expect((await amb.chamar(canal, entrada as never)).ok, canal).toBe(false);
    const nova = await amb.ok('composicao:novaVersao', {
      id: r.registro.id,
      motivo: 'Correção fictícia do significado',
    });
    expect(nova.valoresNaoQuantificados).toHaveLength(1);
    const novoV = nova.valoresNaoQuantificados[0]!;
    expect(novoV.id).not.toBe(vId);
    const editada = await amb.ok('composicao:salvarNaoQuantificado', {
      registroId: nova.registro.id,
      valorId: novoV.id,
      dados: nq({ natureza: 'nao_detectado', textoPublicado: 'ND' }),
    });
    expect(editada.diferencasDaAnterior).toEqual([
      expect.objectContaining({
        campo: 'TESTE_A (média, MS)',
        antes: expect.stringContaining('<0,01 %; não quantificado (abaixo do limite)'),
        depois: expect.stringContaining('ND %; não quantificado (não detectado)'),
      }),
    ]);
    // A versão conferida continua com o texto original.
    const original = await amb.ok('composicao:obter', { id: r.registro.id });
    expect(original.valoresNaoQuantificados[0]!.textoPublicado).toBe('<0,01');
  });

  it('remoção lógica; troca de separador relê o limite; rótulo não aceita', async () => {
    const r = await amb.ok('composicao:criar', { dados: registro() });
    const d = await amb.ok('composicao:salvarNaoQuantificado', {
      registroId: r.registro.id,
      valorId: null,
      dados: nq(),
    });
    // "<0,01" não lê com ponto decimal: a troca é recusada inteira.
    expect(
      (
        await amb.chamar('composicao:atualizar', {
          id: r.registro.id,
          dados: registro({ separadorDecimal: 'ponto' }),
        })
      ).ok,
    ).toBe(false);
    const vId = d.valoresNaoQuantificados[0]!.id;
    const sem = await amb.ok('composicao:removerNaoQuantificado', {
      registroId: r.registro.id,
      valorId: vId,
    });
    expect(sem.valoresNaoQuantificados).toEqual([]);
    expect(linhas('SELECT deleted_at IS NOT NULL AS removido FROM valor_nao_quantificado')).toEqual(
      [{ removido: 1 }],
    );
    const rotulo = await amb.ok('fonte:criar', {
      dados: dadosFonte({
        origem: 'rotulo_comercial',
        codigo: null,
        autores: null,
        ano: null,
        fabricante: 'Fabricante fictício',
      }),
    });
    const rr = await amb.ok('composicao:criar', {
      dados: registro({ fonteId: rotulo.id, referenciaLocal: null }),
    });
    expect(
      (
        await amb.chamar('composicao:salvarNaoQuantificado', {
          registroId: rr.registro.id,
          valorId: null,
          dados: nq({ tipoValor: 'valor_unico', base: 'mn' }),
        })
      ).ok,
    ).toBe(false);
  });

  it('definição com só valor não quantificado conta valores e fica congelada pelo serviço', async () => {
    const r = await amb.ok('composicao:criar', { dados: registro() });
    await amb.ok('composicao:salvarNaoQuantificado', {
      registroId: r.registro.id,
      valorId: null,
      dados: nq(),
    });
    const lista = await amb.ok('nutriente:listar', { incluirInativos: false });
    expect(lista.find((n) => n.id === nutA)!.nValores).toBe(1);
    expect(
      await amb.chamar('nutriente:atualizar', {
        id: nutA,
        dados: dadosNutriente({ unidadeReferencia: 'g_kg' }),
        motivo: 'Teste fictício',
      }),
    ).toMatchObject({
      ok: false,
      erro: { mensagem: expect.stringMatching(/^Esta definição já tem valores/) },
    });
  });
});
