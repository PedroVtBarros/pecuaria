import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { Nutriente } from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import { dadosAlimento, dadosFonte } from './apoio-teste-alimentos';

/*
 * Fase 5D: serviço de seleção, perfis e avaliação científica. Alimentos, fontes e números
 * FICTÍCIOS (CLAUDE.md, regra 1), só para ter resultado conhecido.
 */
let amb: AmbienteIpc;
let nut: Record<string, Nutriente>;
beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 21, 10) });
  nut = Object.fromEntries(
    (await amb.ok('nutriente:listar', {})).map((n) => [n.codigo, n] as const),
  );
});
afterEach(() => amb.encerrar());
const sql = (s: string, ...p: unknown[]) => amb.gerenciador.conexao.prepare(s).all(...p);
const exec = (s: string, ...p: unknown[]) => amb.gerenciador.conexao.prepare(s).run(...p);
const hashTabelas = (tabelas: string[]) =>
  tabelas.map((t) =>
    createHash('sha256')
      .update(JSON.stringify(sql(`SELECT * FROM ${t} ORDER BY rowid`)))
      .digest('hex'),
  );

const IDENTIDADE = {
  especie: 'Especie ficticia',
  cultivar: 'Cultivar ficticia',
  formaConservacao: 'fresco' as const,
  classe: 'volumoso' as const,
};

async function alimento(nome = 'Alimento de teste', extra = {}) {
  return amb.ok('alimento:criar', { dados: dadosAlimento({ nome, ...IDENTIDADE, ...extra }) });
}

/** Registro conferido de uma fonte própria, com PB e FDN. */
async function registro(
  alimentoId: string,
  codigoFonte: string,
  pb: string,
  fdn: string,
  extra: {
    idade?: number | null;
    conferir?: boolean;
    interpretacaoPb?: string | null;
    fonteId?: string;
    ref?: string;
  } = {},
) {
  const fonteId =
    extra.fonteId ??
    (
      await amb.ok('fonte:criar', {
        dados: dadosFonte({ codigo: codigoFonte, titulo: `Fonte fictícia ${codigoFonte}` }),
      })
    ).id;
  const r = await amb.ok('composicao:criar', {
    dados: {
      alimentoId,
      fonteId,
      referenciaLocal: extra.ref ?? 'Tabela fictícia 1',
      idadeCorteDias: extra.idade === undefined ? 60 : extra.idade,
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
    },
  });
  const valor = (n: Nutriente, texto: string, interpretacao: string | null = null) => ({
    nutrienteId: n.id,
    valorPublicado: texto,
    unidade: 'pct' as const,
    base: 'ms' as const,
    tipoValor: 'media' as const,
    desvioPadraoPublicado: null,
    minimoPublicado: null,
    maximoPublicado: null,
    nObservacoes: null,
    metodoAnaliticoFonte: null,
    formaObtencao: 'medido' as const,
    descricaoObtencao: null,
    interpretacaoBase: interpretacao,
    referenciaLocal: null,
    observacao: null,
  });
  await amb.ok('composicao:salvarValor', {
    registroId: r.registro.id,
    valorId: null,
    dados: valor(nut['PB']!, pb, extra.interpretacaoPb ?? null),
  });
  await amb.ok('composicao:salvarValor', {
    registroId: r.registro.id,
    valorId: null,
    dados: valor(nut['FDN']!, fdn),
  });
  await amb.ok('composicao:transcrever', { id: r.registro.id, responsavel: 'Pessoa A' });
  if (extra.conferir !== false)
    await amb.ok('composicao:conferir', { id: r.registro.id, responsavel: 'Pessoa B' });
  return { id: r.registro.id, fonteId };
}

async function aprovar() {
  return amb.ok('selecao:aprovarRegra', {
    codigo: 'SELECAO_5D',
    versao: 2,
    responsavel: 'Pessoa usuária',
    observacao: null,
  });
}
const PERFIL = {
  escolhas: [],
  nutrienteId: null,
  sentido: null,
  nome: 'Perfil fictício',
  responsavel: 'Pessoa usuária',
};

describe('5D: regra de seleção', () => {
  it('nasce sem aprovação; aprovar é ação do usuário, uma vez, com hash e trilha', async () => {
    const regras = await amb.ok('selecao:regras', {});
    expect(regras.map((x) => x.regra.versao)).toEqual([1, 2]);
    expect(regras[1]).toMatchObject({
      regra: { codigo: 'SELECAO_5D', versao: 2, nMinimoOrigens: 3, idadeTextual: 'verificada' },
      aprovacao: null,
    });
    // A versão 1 é só histórica: não recebe aprovação nova.
    expect(
      await amb.chamar('selecao:aprovarRegra', {
        codigo: 'SELECAO_5D',
        versao: 1,
        responsavel: 'X',
        observacao: null,
      }),
    ).toMatchObject({ ok: false, erro: { mensagem: expect.stringMatching(/só histórica/) } });
    const a = await aprovar();
    expect(a.aprovacao).toMatchObject({ aprovadoPor: 'Pessoa usuária' });
    expect(sql('SELECT conteudo_hash AS h FROM aprovacao_regra_selecao')).toEqual([{ h: a.hash }]);
    expect(
      (
        await amb.chamar('selecao:aprovarRegra', {
          codigo: 'SELECAO_5D',
          versao: 2,
          responsavel: 'X',
          observacao: null,
        })
      ).ok,
    ).toBe(false);
    expect(
      sql("SELECT acao FROM historico_alteracao WHERE entidade = 'aprovacao_regra_selecao'"),
    ).toEqual([{ acao: 'aprovacao' }]);
    expect(() => exec("UPDATE aprovacao_regra_selecao SET aprovado_por = 'Y'")).toThrow(/não muda/);
  });
});

describe('5D: seleção e perfis', () => {
  it('só conferido é elegível; 3 origens agregam; nada é gravado sem regra aprovada e ação do usuário', async () => {
    const a = await alimento();
    const r1 = await registro(a.id, 'F_UM', '10,0', '60,0');
    await registro(a.id, 'F_DOIS', '12,0', '70,0');
    await registro(a.id, 'F_TRES', '14,0', '65,0');
    const pendente = await registro(a.id, 'F_QUATRO', '99,0', '99,0', { conferir: false });
    const antes = hashTabelas(['registro_composicao', 'valor_nutricional']);

    const e = await amb.ok('selecao:executar', {
      alimentoId: a.id,
      idadeCorteDias: 60,
      escolhas: [],
    });
    const c = e.resultado.candidatos.find((x) => x.registro.id === pendente.id)!;
    expect(c.classificacao.exclusao).toMatch(/Não conferido/);
    const pb = e.resultado.nutrientes.find((n) => n.nutriente.codigo === 'PB')!;
    expect(pb).toMatchObject({ situacao: 'agregado', cobertura: { comValor: 3, total: 3 } });
    expect(pb.classes[0]).toMatchObject({
      nOrigens: 3,
      media: 12,
      mediana: 12,
      minimo: 10,
      maximo: 14,
    });
    expect(e.resultado.cenarios.map((x) => [x.nutriente.codigo, x.sentido, x.valor])).toEqual([
      ['PB', 'conservador', 10],
      ['PB', 'favoravel', 14],
      ['FDN', 'conservador', 70],
      ['FDN', 'favoravel', 60],
    ]);

    const semRegra = await amb.chamar('perfil:gravar', {
      alimentoId: a.id,
      idadeCorteDias: 60,
      tipo: 'agregado_central',
      registroId: null,
      ...PERFIL,
    });
    expect(semRegra).toMatchObject({
      ok: false,
      erro: { mensagem: expect.stringMatching(/não foi aprovada/) },
    });
    await aprovar();
    const central = await amb.ok('perfil:gravar', {
      alimentoId: a.id,
      idadeCorteDias: 60,
      tipo: 'agregado_central',
      registroId: null,
      ...PERFIL,
    });
    expect(central.perfil).toMatchObject({
      tipo: 'agregado_central',
      cenario: 'central',
      nivel: 'especifico',
      regraVersao: 2,
    });
    expect(
      central.valores.map((v) => [v.nutriente.codigo, v.valor, v.nOrigens, v.origens.length]),
    ).toEqual([
      ['PB', 12, 3, 3],
      ['FDN', 65, 3, 3],
    ]);
    const cen = await amb.ok('perfil:gravar', {
      ...PERFIL,
      alimentoId: a.id,
      idadeCorteDias: 60,
      tipo: 'cenario_real',
      registroId: r1.id,
      nutrienteId: nut['PB']!.id,
      sentido: 'conservador',
    });
    // Perfil real: PB e FDN do mesmo registro, nunca combinados de fontes diferentes.
    expect(
      cen.valores.map((v) => [v.nutriente.codigo, v.valorPublicado, v.origens[0]!.registroId]),
    ).toEqual([
      ['PB', '10,0', r1.id],
      ['FDN', '60,0', r1.id],
    ]);
    expect(cen.limitacoes[0]).toMatch(/Cenário conservador para PB.*não indica qualidade global/);
    const ind = await amb.ok('perfil:gravar', {
      ...PERFIL,
      alimentoId: a.id,
      idadeCorteDias: 60,
      tipo: 'referencia_individual',
      registroId: r1.id,
    });
    expect(ind.limitacoes[0]).toMatch(/evidência limitada/);
    expect(
      (
        await amb.chamar('perfil:gravar', {
          ...PERFIL,
          alimentoId: a.id,
          idadeCorteDias: 60,
          tipo: 'referencia_individual',
          registroId: pendente.id,
        })
      ).ok,
    ).toBe(false);

    expect((await amb.ok('perfil:listar', { alimentoId: a.id })).map((p) => p.tipo)).toEqual([
      'referencia_individual',
      'cenario_real',
      'agregado_central',
    ]);
    expect(await amb.ok('perfil:obter', { id: central.perfil.id })).toEqual(central);
    // Imutável e sem efeito nos registros.
    expect(() => exec('UPDATE perfil_valor SET valor = 0')).toThrow(/imutável/);
    expect(() => exec('DELETE FROM perfil_composicao')).toThrow(/não é excluído/);
    expect(hashTabelas(['registro_composicao', 'valor_nutricional'])).toEqual(antes);
  });

  it('idade diferente fica fora; sem idade é comparável; outra cultivar nunca aparece', async () => {
    const a = await alimento();
    const outra = await alimento('Outro alimento de teste', { cultivar: 'Outra cultivar' });
    const geral = await alimento('Alimento geral de teste', { cultivar: null });
    const r60 = await registro(a.id, 'F_UM', '10,0', '60,0');
    const r90 = await registro(a.id, 'F_DOIS', '12,0', '70,0', { idade: 90 });
    const sem = await registro(a.id, 'F_TRES', '14,0', '65,0', { idade: null });
    await registro(outra.id, 'F_QUATRO', '15,0', '66,0');
    const rg = await registro(geral.id, 'F_CINCO', '16,0', '67,0');
    const e = await amb.ok('selecao:executar', {
      alimentoId: a.id,
      idadeCorteDias: 60,
      escolhas: [],
    });
    const k = (id: string) =>
      e.resultado.candidatos.find((c) => c.registro.id === id)?.classificacao;
    expect(k(r60.id)).toMatchObject({ nivel: 'especifico', exclusao: null });
    expect(k(r90.id)!.exclusao).toMatch(/90 dias, diferente de 60/);
    expect(k(sem.id)).toMatchObject({ nivel: 'comparavel', exclusao: null });
    expect(k(rg.id)).toMatchObject({ nivel: 'geral', exclusao: null });
    expect(e.resultado.candidatos).toHaveLength(4);
  });

  it('base inferida só agrega validada; uso com cautela tira da agregação; retirar devolve', async () => {
    const a = await alimento();
    const r1 = await registro(a.id, 'F_UM', '10,0', '60,0', {
      interpretacaoPb: 'Base fictícia inferida.',
    });
    const r2 = await registro(a.id, 'F_DOIS', '12,0', '70,0');
    await registro(a.id, 'F_TRES', '14,0', '65,0');
    const pb = async () =>
      (
        await amb.ok('selecao:executar', { alimentoId: a.id, idadeCorteDias: 60, escolhas: [] })
      ).resultado.nutrientes.find((n) => n.nutriente.codigo === 'PB')!;
    expect((await pb()).situacao).toBe('insuficiente');
    const valorPb = (await amb.ok('composicao:obter', { id: r1.id })).valores.find(
      (v) => v.nutriente.codigo === 'PB',
    )!;
    const valorFdn = (await amb.ok('composicao:obter', { id: r1.id })).valores.find(
      (v) => v.nutriente.codigo === 'FDN',
    )!;
    expect(
      (
        await amb.chamar('avaliacao:marcar', {
          registroId: r1.id,
          valorId: valorFdn.id,
          tipo: 'base_validada',
          motivo: 'Motivo fictício.',
          responsavel: 'Pessoa usuária',
        })
      ).ok,
    ).toBe(false);
    const validado = await amb.ok('avaliacao:marcar', {
      registroId: r1.id,
      valorId: valorPb.id,
      tipo: 'base_validada',
      motivo: 'Validação fictícia.',
      responsavel: 'Pessoa usuária',
    });
    expect(validado.avaliacoes).toHaveLength(1);
    expect(validado.registro.status).toBe('conferido');
    expect((await pb()).situacao).toBe('agregado');

    const cautela = await amb.ok('avaliacao:marcar', {
      registroId: r2.id,
      valorId: null,
      tipo: 'uso_com_cautela',
      motivo: 'Cautela fictícia.',
      responsavel: 'Pessoa usuária',
    });
    expect((await pb()).situacao).toBe('insuficiente');
    expect(
      (
        await amb.chamar('avaliacao:marcar', {
          registroId: r2.id,
          valorId: null,
          tipo: 'uso_com_cautela',
          motivo: 'De novo.',
          responsavel: 'Pessoa usuária',
        })
      ).ok,
    ).toBe(false);
    await amb.ok('avaliacao:retirar', {
      registroId: r2.id,
      avaliacaoId: cautela.avaliacoes[0]!.id,
      motivo: 'Retirada fictícia.',
      responsavel: 'Pessoa usuária',
    });
    expect((await pb()).situacao).toBe('agregado');
    expect(
      sql(
        "SELECT acao FROM historico_alteracao WHERE entidade = 'avaliacao_cientifica' ORDER BY rowid",
      ).map((l) => (l as { acao: string }).acao),
    ).toEqual(['avaliacao', 'avaliacao', 'retirada']);
  });

  it('vínculo não descartado e mesma publicação contam uma origem; tratamentos pedem escolha', async () => {
    const a = await alimento();
    const r1 = await registro(a.id, 'F_UM', '10,0', '60,0');
    await registro(a.id, 'F_UM_B', '10,0', '60,0', { fonteId: undefined });
    const outro = await registro(a.id, 'F_DOIS', '12,0', '70,0');
    const t2 = await registro(a.id, 'F_TRES', '14,0', '65,0');
    const t3 = await registro(a.id, '', '16,0', '66,0', {
      fonteId: t2.fonteId,
      ref: 'Tabela fictícia 2',
    });
    const copia = (await amb.ok('composicao:listar', { alimentoId: a.id })).find(
      (r) => r.fonte.codigo === 'F_UM_B',
    )!;
    exec(
      `INSERT INTO vinculo_registro(id, registro_id, relacionado_id, alvo_fonte_codigo, alvo_referencia_local, relacao,
         evidencia, situacao, created_at, updated_at)
       VALUES ('01929c20-0000-7000-8000-00000000f001', ?, ?, 'F_UM', 'Tabela fictícia 1', 'mesmos_valores',
         'Evidência fictícia.', 'a_confirmar', '2026-10-21', '2026-10-21')`,
      copia.id,
      r1.id,
    );
    let e = await amb.ok('selecao:executar', {
      alimentoId: a.id,
      idadeCorteDias: 60,
      escolhas: [],
    });
    expect(e.resultado.origens).toHaveLength(3);
    expect(e.resultado.origensComTratamentos.map((o) => o.registros.length)).toEqual([2, 2]);
    const pb = () => e.resultado.nutrientes.find((n) => n.nutriente.codigo === 'PB')!;
    expect(pb().situacao).toBe('insuficiente');
    const escolhas = e.resultado.origensComTratamentos.map((o) => ({
      origemId: o.origemId,
      registroId: o.registros[0]!,
    }));
    e = await amb.ok('selecao:executar', { alimentoId: a.id, idadeCorteDias: 60, escolhas });
    expect(pb().classes[0]!.nOrigens).toBe(3);
    expect(outro.id).not.toBe(t3.id);
  });
});
