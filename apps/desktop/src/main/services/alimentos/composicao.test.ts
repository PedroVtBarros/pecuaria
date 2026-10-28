import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DadosRegistro, DadosValor } from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import {
  criarPropriedade,
  dadosAlimento,
  dadosFonte,
  dadosNutriente,
  ID_MS,
} from './apoio-teste-alimentos';

/*
 * Números e nomes FICTÍCIOS (CLAUDE.md, regra 1): provam armazenamento e fluxo, não composição.
 */
let amb: AmbienteIpc;
let fonteId: string;
let alimentoId: string;
let nutA: string;
let nutB: string;
beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 21, 10) });
  fonteId = (await amb.ok('fonte:criar', { dados: dadosFonte() })).id;
  alimentoId = (await amb.ok('alimento:criar', { dados: dadosAlimento() })).id;
  nutA = (await amb.ok('nutriente:criar', { dados: dadosNutriente() })).id;
  nutB = (
    await amb.ok('nutriente:criar', {
      dados: dadosNutriente({ codigo: 'TESTE_B', nome: 'Nutriente de teste B' }),
    })
  ).id;
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
function valor(extra: Partial<DadosValor> = {}): DadosValor {
  return {
    nutrienteId: nutA,
    valorPublicado: '12,50',
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
    ...extra,
  };
}
async function criar(extra: Partial<DadosRegistro> = {}) {
  return amb.ok('composicao:criar', { dados: registro(extra) });
}
async function comValor(extra: Partial<DadosValor> = {}) {
  const r = await criar();
  return amb.ok('composicao:salvarValor', {
    registroId: r.registro.id,
    valorId: null,
    dados: valor(extra),
  });
}
async function conferido() {
  const r = await comValor();
  await amb.ok('composicao:transcrever', { id: r.registro.id, responsavel: 'Pessoa A' });
  return amb.ok('composicao:conferir', { id: r.registro.id, responsavel: 'Pessoa B' });
}
const linhas = (sql: string, ...p: unknown[]) => amb.gerenciador.conexao.prepare(sql).all(...p);

describe('5A-3: cabeçalho do registro', () => {
  it('publicação exige página ou tabela; laudo exige data da amostra e só ele a tem', async () => {
    const semPagina = await amb.chamar('composicao:criar', {
      dados: registro({ referenciaLocal: null }),
    });
    expect(semPagina).toMatchObject({ ok: false, erro: { codigo: 'OPERACAO_INVALIDA' } });
    expect(
      (await amb.chamar('composicao:criar', { dados: registro({ dataAmostra: '2026-10-01' }) })).ok,
    ).toBe(false);
    const prop = await criarPropriedade(amb);
    const laudo = await amb.ok('fonte:criar', {
      dados: dadosFonte({
        origem: 'laboratorial',
        codigo: null,
        autores: null,
        ano: null,
        laboratorio: 'Laboratório fictício',
        propriedadeId: prop.id,
      }),
    });
    expect(
      (
        await amb.chamar('composicao:criar', {
          dados: registro({ fonteId: laudo.id, referenciaLocal: null }),
        })
      ).ok,
    ).toBe(false);
    const r = await criar({ fonteId: laudo.id, referenciaLocal: null, dataAmostra: '2026-10-01' });
    expect(r.registro).toMatchObject({ status: 'rascunho', dataAmostra: '2026-10-01' });
    expect(r.fonte).toMatchObject({ origem: 'laboratorial', propriedadeNome: 'Fazenda de teste' });
    expect(r.acoes).toEqual(['transcrever']);
    expect(r.editavel).toBe(true);
  });

  it('condições guardadas como informadas; fonte e alimento não mudam no rascunho', async () => {
    const r = await criar({
      idadeCorteDias: 90,
      aditivoEnsilagem: 'Aditivo fictício',
      outrasCondicoes: { Irrigação: 'sim (fictício)' },
    });
    expect(r.registro).toMatchObject({
      idadeCorteDias: 90,
      aditivoEnsilagem: 'Aditivo fictício',
      outrasCondicoes: { Irrigação: 'sim (fictício)' },
    });
    const outro = (
      await amb.ok('alimento:criar', { dados: dadosAlimento({ nome: 'Outro de teste' }) })
    ).id;
    expect(
      (
        await amb.chamar('composicao:atualizar', {
          id: r.registro.id,
          dados: registro({ alimentoId: outro }),
        })
      ).ok,
    ).toBe(false);
  });

  it('fonte e alimento excluídos não recebem registro', async () => {
    const f2 = await amb.ok('fonte:criar', { dados: dadosFonte({ codigo: 'OUTRA' }) });
    await amb.ok('fonte:excluir', { id: f2.id, motivo: 'Teste' });
    expect((await amb.chamar('composicao:criar', { dados: registro({ fonteId: f2.id }) })).ok).toBe(
      false,
    );
  });
});

describe('5A-3: valores como publicados', () => {
  it('texto, precisão, unidade e base preservados; número derivado pelo separador do registro', async () => {
    const r = await comValor({
      valorPublicado: ' 12,50 ',
      desvioPadraoPublicado: '1,0',
      minimoPublicado: '10',
      maximoPublicado: '14,25',
      nObservacoes: 8,
      metodoAnaliticoFonte: 'Método fictício informado pela fonte',
    });
    expect(r.valores).toHaveLength(1);
    expect(r.valores[0]).toMatchObject({
      valorPublicado: '12,50',
      valor: 12.5,
      casasDecimais: 2,
      unidade: 'pct',
      base: 'ms',
      tipoValor: 'media',
      desvioPadraoPublicado: '1,0',
      desvioPadrao: 1,
      minimo: 10,
      maximo: 14.25,
      nObservacoes: 8,
      metodoAnaliticoFonte: 'Método fictício informado pela fonte',
      nutriente: { codigo: 'TESTE_A', situacaoFundamentacao: 'pendente' },
    });
    // Mesmo número em outra unidade fica na unidade publicada: nada é convertido ao gravar.
    const g = await amb.ok('composicao:salvarValor', {
      registroId: r.registro.id,
      valorId: null,
      dados: valor({ nutrienteId: nutB, valorPublicado: '1.000', unidade: 'g_kg' }),
    });
    expect(g.valores.find((v) => v.nutriente.id === nutB)).toMatchObject({
      valorPublicado: '1.000',
      valor: 1000,
      unidade: 'g_kg',
    });
  });

  it('recusa texto não numérico, fora da faixa, de outra grandeza e duplicado; aceita outra base', async () => {
    const r = await comValor();
    const id = r.registro.id;
    const tentar = (extra: Partial<DadosValor>) =>
      amb.chamar('composicao:salvarValor', { registroId: id, valorId: null, dados: valor(extra) });
    for (const extra of [
      { valorPublicado: 'ND' },
      { valorPublicado: '<0,01' },
      { valorPublicado: 'traços' },
      { valorPublicado: '12.5' },
      { valorPublicado: '100,1', base: 'mn' as const },
      { unidade: 'mcal_kg' as const, base: 'mn' as const },
      { tipoValor: 'minimo_garantido' as const, base: 'mn' as const },
      { minimoPublicado: '5', maximoPublicado: '4', base: 'mn' as const },
      { desvioPadraoPublicado: '-1', base: 'mn' as const },
    ])
      expect(await tentar(extra), JSON.stringify(extra)).toMatchObject({
        ok: false,
        erro: { codigo: 'OPERACAO_INVALIDA' },
      });
    expect(await tentar({})).toMatchObject({ ok: false, erro: { codigo: 'DUPLICADO' } });
    expect((await tentar({ base: 'mn' })).ok).toBe(true);
    // Ausente é ausente: só as linhas informadas existem; nenhum zero inventado.
    expect(
      linhas('SELECT valor FROM valor_nutricional WHERE registro_id = ? ORDER BY rowid', id),
    ).toEqual([{ valor: 12.5 }, { valor: 12.5 }]);
  });

  it('editar e remover valor em rascunho, com trilha; remoção é lógica', async () => {
    const r = await comValor();
    const v = r.valores[0]!;
    const e = await amb.ok('composicao:salvarValor', {
      registroId: r.registro.id,
      valorId: v.id,
      dados: valor({ valorPublicado: '13' }),
    });
    expect(e.valores[0]).toMatchObject({ id: v.id, valorPublicado: '13', casasDecimais: 0 });
    const sem = await amb.ok('composicao:removerValor', {
      registroId: r.registro.id,
      valorId: v.id,
    });
    expect(sem.valores).toEqual([]);
    expect(linhas('SELECT deleted_at IS NOT NULL AS removido FROM valor_nutricional')).toEqual([
      { removido: 1 },
    ]);
    expect(sem.historico.map((h) => h.acao)).toEqual([
      'criacao',
      'alteracao',
      'alteracao',
      'alteracao',
    ]);
  });
});

describe('5A-3: separador decimal', () => {
  it('a troca relê os valores ou é recusada inteira', async () => {
    const r = await criar();
    const id = r.registro.id;
    await amb.ok('composicao:salvarValor', {
      registroId: id,
      valorId: null,
      dados: valor({ valorPublicado: '1.050', unidade: 'mg_kg' }),
    });
    expect((await amb.ok('composicao:obter', { id })).valores[0]!.valor).toBe(1050);
    const ponto = await amb.ok('composicao:atualizar', {
      id,
      dados: registro({ separadorDecimal: 'ponto' }),
    });
    expect(ponto.valores[0]).toMatchObject({ valorPublicado: '1.050', valor: 1.05 });
    await amb.ok('composicao:salvarValor', {
      registroId: id,
      valorId: null,
      dados: valor({ nutrienteId: nutB, valorPublicado: '2.5' }),
    });
    // "2.5" não é número válido com vírgula decimal: a troca de volta é recusada e nada muda.
    const volta = await amb.chamar('composicao:atualizar', {
      id,
      dados: registro({ separadorDecimal: 'virgula' }),
    });
    expect(volta).toMatchObject({ ok: false, erro: { codigo: 'OPERACAO_INVALIDA' } });
    const atual = await amb.ok('composicao:obter', { id });
    expect(atual.registro.separadorDecimal).toBe('ponto');
    expect(atual.valores.map((v) => v.valor)).toEqual([1.05, 2.5]);
  });
});

describe('5A-3: fluxo de conferência', () => {
  it('transcrever, devolver, rejeitar, reabrir e conferir, com quem e quando', async () => {
    const vazio = await criar();
    expect(
      await amb.chamar('composicao:transcrever', {
        id: vazio.registro.id,
        responsavel: 'Pessoa A',
      }),
    ).toMatchObject({ ok: false, erro: { codigo: 'OPERACAO_INVALIDA' } });
    const r = await comValor();
    const id = r.registro.id;
    expect(await amb.chamar('composicao:conferir', { id, responsavel: 'Pessoa B' })).toMatchObject({
      ok: false,
      erro: { codigo: 'OPERACAO_INVALIDA' },
    });
    const t = await amb.ok('composicao:transcrever', { id, responsavel: 'Pessoa A' });
    expect(t.registro).toMatchObject({ status: 'transcrito', transcritoPor: 'Pessoa A' });
    expect(t.acoes.sort()).toEqual(['conferir', 'devolver', 'rejeitar']);
    expect(t.editavel).toBe(false);
    // Transcrito não edita valor nem cabeçalho.
    expect(
      (
        await amb.chamar('composicao:salvarValor', {
          registroId: id,
          valorId: null,
          dados: valor({ nutrienteId: nutB }),
        })
      ).ok,
    ).toBe(false);
    expect(
      (await amb.chamar('composicao:atualizar', { id, dados: registro({ regiao: 'x' }) })).ok,
    ).toBe(false);
    await amb.ok('composicao:devolver', { id, motivo: 'Faltou conferir a página' });
    await amb.ok('composicao:transcrever', { id, responsavel: 'Pessoa A' });
    const rej = await amb.ok('composicao:rejeitar', {
      id,
      responsavel: 'Pessoa B',
      motivo: 'Valor lido da linha errada',
    });
    expect(rej.registro).toMatchObject({
      status: 'rejeitado',
      rejeitadoPor: 'Pessoa B',
      motivoRejeicao: 'Valor lido da linha errada',
    });
    const re = await amb.ok('composicao:reabrir', { id });
    expect(re.registro).toMatchObject({
      status: 'rascunho',
      motivoRejeicao: null,
      transcritoPor: null,
    });
    await amb.ok('composicao:transcrever', { id, responsavel: 'Pessoa A' });
    const c = await amb.ok('composicao:conferir', { id, responsavel: ' pessoa a ' });
    expect(c.registro).toMatchObject({
      status: 'conferido',
      conferidoPor: 'pessoa a',
      mesmaPessoa: true,
    });
    expect(c.acoes).toEqual([]);
    expect(c.aceitaNovaVersao).toBe(true);
    expect(c.historico.map((h) => h.acao)).toEqual([
      'criacao',
      'alteracao',
      'transcricao',
      'retorno_rascunho',
      'transcricao',
      'rejeicao',
      'reabertura_rascunho',
      'transcricao',
      'conferencia',
    ]);
  });

  it('conferido é imutável: valores, cabeçalho, status e descarte recusados', async () => {
    const c = await conferido();
    const id = c.registro.id;
    for (const [canal, entrada] of [
      [
        'composicao:salvarValor',
        { registroId: id, valorId: c.valores[0]!.id, dados: valor({ valorPublicado: '99' }) },
      ],
      [
        'composicao:salvarValor',
        { registroId: id, valorId: null, dados: valor({ nutrienteId: nutB }) },
      ],
      ['composicao:removerValor', { registroId: id, valorId: c.valores[0]!.id }],
      ['composicao:atualizar', { id, dados: registro({ referenciaLocal: 'Outra tabela' }) }],
      ['composicao:devolver', { id, motivo: 'x' }],
      ['composicao:rejeitar', { id, responsavel: 'P', motivo: 'x' }],
      ['composicao:descartar', { id, motivo: 'x' }],
    ] as const)
      expect((await amb.chamar(canal as 'composicao:devolver', entrada as never)).ok, canal).toBe(
        false,
      );
    expect((await amb.ok('composicao:obter', { id })).valores[0]!.valorPublicado).toBe('12,50');
  });

  it('nova versão: cópia em rascunho, uma por vez, diferenças e substituição ao conferir', async () => {
    const c = await conferido();
    const antigo = c.registro.id;
    const nova = await amb.ok('composicao:novaVersao', {
      id: antigo,
      motivo: 'Erro de transcrição',
    });
    expect(nova.registro).toMatchObject({
      status: 'rascunho',
      substituiId: antigo,
      motivoVersao: 'Erro de transcrição',
    });
    expect(nova.valores.map((v) => v.valorPublicado)).toEqual(['12,50']);
    expect(nova.diferencasDaAnterior).toEqual([]);
    expect(
      await amb.chamar('composicao:novaVersao', { id: antigo, motivo: 'Outra' }),
    ).toMatchObject({ ok: false, erro: { codigo: 'OPERACAO_INVALIDA' } });
    // A anterior continua conferida (e vigente) enquanto a nova não é conferida.
    expect((await amb.ok('composicao:obter', { id: antigo })).registro.status).toBe('conferido');
    const editada = await amb.ok('composicao:salvarValor', {
      registroId: nova.registro.id,
      valorId: nova.valores[0]!.id,
      dados: valor({ valorPublicado: '12,05' }),
    });
    expect(editada.diferencasDaAnterior).toEqual([
      { campo: 'TESTE_A (média, MS)', antes: '12,50 %', depois: '12,05 %' },
    ]);
    await amb.ok('composicao:transcrever', { id: nova.registro.id, responsavel: 'Pessoa A' });
    const conf = await amb.ok('composicao:conferir', {
      id: nova.registro.id,
      responsavel: 'Pessoa B',
    });
    expect(conf.versoes.map((v) => [v.id, v.status])).toEqual([
      [antigo, 'substituido'],
      [nova.registro.id, 'conferido'],
    ]);
    const velho = await amb.ok('composicao:obter', { id: antigo });
    expect(velho.registro.status).toBe('substituido');
    expect(velho.registro.substituidoEm).not.toBeNull();
    expect(velho.valores[0]!.valorPublicado).toBe('12,50');
    expect(velho.aceitaNovaVersao).toBe(false);
    expect(velho.historico.map((h) => [h.acao, h.motivo])).toContainEqual([
      'substituicao',
      'Erro de transcrição',
    ]);
    // A cadeia continua: a versão conferida aceita nova versão.
    expect(conf.aceitaNovaVersao).toBe(true);
  });

  it('versão nova descartada deixa a anterior vigente e livre para outra versão', async () => {
    const c = await conferido();
    const nova = await amb.ok('composicao:novaVersao', { id: c.registro.id, motivo: 'Teste' });
    const desc = await amb.ok('composicao:descartar', { id: nova.registro.id, motivo: 'Desisti' });
    expect(desc.registro.descartadoEm).not.toBeNull();
    expect(desc.acoes).toEqual([]);
    expect((await amb.ok('composicao:obter', { id: c.registro.id })).aceitaNovaVersao).toBe(true);
    await amb.ok('composicao:novaVersao', { id: c.registro.id, motivo: 'Outra tentativa' });
  });
});

describe('5A-3: listas, fila e isolamento por propriedade', () => {
  it('fila de conferência, ficha do alimento e laudos só na própria propriedade', async () => {
    const p1 = await criarPropriedade(amb, 'Fazenda 1');
    const p2 = await criarPropriedade(amb, 'Fazenda 2');
    const laudo = await amb.ok('fonte:criar', {
      dados: dadosFonte({
        origem: 'laboratorial',
        codigo: null,
        autores: null,
        ano: null,
        laboratorio: 'Laboratório fictício',
        propriedadeId: p1.id,
      }),
    });
    const global = await comValor();
    await amb.ok('composicao:transcrever', { id: global.registro.id, responsavel: 'Pessoa A' });
    const doLaudo = await criar({
      fonteId: laudo.id,
      referenciaLocal: null,
      dataAmostra: '2026-10-02',
    });
    await amb.ok('composicao:salvarValor', {
      registroId: doLaudo.registro.id,
      valorId: null,
      dados: valor({ tipoValor: 'valor_unico' }),
    });
    const ids = (l: { id: string }[]) => l.map((x) => x.id);
    expect(ids(await amb.ok('composicao:listar', { status: 'transcrito' }))).toEqual([
      global.registro.id,
    ]);
    expect(ids(await amb.ok('composicao:listar', { alimentoId }))).toEqual([global.registro.id]);
    expect(
      ids(await amb.ok('composicao:listar', { alimentoId, propriedadeId: p1.id })).sort(),
    ).toEqual([global.registro.id, doLaudo.registro.id].sort());
    expect(ids(await amb.ok('composicao:listar', { alimentoId, propriedadeId: p2.id }))).toEqual([
      global.registro.id,
    ]);
    expect(
      ids(await amb.ok('composicao:listar', { propriedadeId: p1.id, somenteDaPropriedade: true })),
    ).toEqual([doLaudo.registro.id]);
    expect((await amb.chamar('composicao:listar', { somenteDaPropriedade: true })).ok).toBe(false);
    const ficha = await amb.ok('alimento:obter', { id: alimentoId, propriedadeId: p2.id });
    expect(ficha.registros.map((r) => r.id)).toEqual([global.registro.id]);
    expect(
      (await amb.ok('alimento:obter', { id: alimentoId, propriedadeId: p1.id })).registros,
    ).toHaveLength(2);
  });

  it('fonte e alimento com registro só se excluem depois do descarte', async () => {
    const r = await criar();
    expect((await amb.chamar('fonte:excluir', { id: fonteId, motivo: 'x' })).ok).toBe(false);
    expect((await amb.chamar('alimento:excluir', { id: alimentoId, motivo: 'x' })).ok).toBe(false);
    await amb.ok('composicao:descartar', { id: r.registro.id, motivo: 'Cadastro de teste' });
    await amb.ok('alimento:excluir', { id: alimentoId, motivo: 'Teste' });
    await amb.ok('fonte:excluir', { id: fonteId, motivo: 'Teste' });
  });

  it('definição com valores não muda; variante vira nova definição', async () => {
    await comValor();
    const mudar = await amb.chamar('nutriente:atualizar', {
      id: nutA,
      dados: dadosNutriente({ metodoAnalitico: 'Outro método fictício' }),
      motivo: 'x',
    });
    expect(mudar).toMatchObject({ ok: false, erro: { codigo: 'OPERACAO_INVALIDA' } });
    await amb.ok('nutriente:criar', {
      dados: dadosNutriente({ codigo: 'TESTE_Acp', metodoAnalitico: 'Outro método fictício' }),
    });
    expect((await amb.ok('nutriente:listar', {})).find((n) => n.id === nutA)!.nValores).toBe(1);
  });

  it('medição própria só aceita matéria seca', async () => {
    const prop = await criarPropriedade(amb);
    const med = await amb.ok('fonte:criar', {
      dados: dadosFonte({
        origem: 'medicao_propria',
        codigo: null,
        autores: null,
        ano: null,
        propriedadeId: prop.id,
        metodoMedicao: 'Método fictício descrito pelo usuário',
        limitacoesMedicao: 'Limitações fictícias',
      }),
    });
    const r = await criar({ fonteId: med.id, referenciaLocal: null, dataAmostra: '2026-10-03' });
    const tentar = (extra: Partial<DadosValor>) =>
      amb.chamar('composicao:salvarValor', {
        registroId: r.registro.id,
        valorId: null,
        dados: valor({ tipoValor: 'valor_unico', base: 'mn', ...extra }),
      });
    expect((await tentar({})).ok).toBe(false);
    expect((await tentar({ nutrienteId: ID_MS })).ok).toBe(true);
  });
});
