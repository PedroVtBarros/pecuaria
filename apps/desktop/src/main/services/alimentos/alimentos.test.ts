import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFINICOES_DO_SISTEMA } from '@pecuaria/domain';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import {
  criarPropriedade,
  dadosAlimento,
  dadosFonte,
  dadosNutriente,
  ID_MS,
} from './apoio-teste-alimentos';

let amb: AmbienteIpc;
beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 21, 10) });
});
afterEach(() => amb.encerrar());

const contar = (tabela: string) =>
  (amb.gerenciador.conexao.prepare(`SELECT count(*) AS n FROM ${tabela}`).get() as { n: number }).n;

describe('5A-2: fontes', () => {
  it('cadastro por origem com as exigências de cada uma, nos dois lados do IPC', async () => {
    const prop = await criarPropriedade(amb);
    const estudo = await amb.ok('fonte:criar', { dados: dadosFonte() });
    expect(estudo).toMatchObject({
      origem: 'estudo_individual',
      codigo: 'TESTE_ESTUDO',
      nRegistros: 0,
    });
    // Publicação sem autores e sem código.
    const semAutores = await amb.chamar('fonte:criar', {
      dados: dadosFonte({ codigo: null, autores: null }),
    });
    expect(semAutores).toMatchObject({ ok: false, erro: { codigo: 'ENTRADA_INVALIDA' } });
    // Laudo sem propriedade; laudo com propriedade; rótulo com propriedade (recusado).
    const laudo = dadosFonte({
      origem: 'laboratorial',
      codigo: null,
      autores: null,
      ano: null,
      laboratorio: 'Laboratório fictício',
      numeroLaudo: '0001',
      dataLaudo: '2026-10-01',
    });
    expect((await amb.chamar('fonte:criar', { dados: laudo })).ok).toBe(false);
    const fLaudo = await amb.ok('fonte:criar', { dados: { ...laudo, propriedadeId: prop.id } });
    expect(fLaudo.propriedadeNome).toBe('Fazenda de teste');
    expect(
      (
        await amb.chamar('fonte:criar', {
          dados: dadosFonte({
            origem: 'rotulo_comercial',
            codigo: null,
            autores: null,
            ano: null,
            fabricante: 'Fabricante fictício',
            propriedadeId: prop.id,
          }),
        })
      ).ok,
    ).toBe(false);
    // Medição própria exige método e limitações (D5-8).
    const medicao = dadosFonte({
      origem: 'medicao_propria',
      codigo: null,
      autores: null,
      ano: null,
      propriedadeId: prop.id,
      metodoMedicao: 'Método fictício',
    });
    expect((await amb.chamar('fonte:criar', { dados: medicao })).ok).toBe(false);
    await amb.ok('fonte:criar', {
      dados: { ...medicao, limitacoesMedicao: 'Limitações fictícias' },
    });
    // Origem reservada da Fase 6 não é aceita.
    const reservada = await amb.chamar('fonte:criar', {
      dados: { ...dadosFonte(), origem: 'sistema_exigencias' as never },
    });
    expect(reservada).toMatchObject({ ok: false, erro: { codigo: 'ENTRADA_INVALIDA' } });
    expect(contar('fonte')).toBe(3);
  });

  it('código único sem diferença de maiúsculas; origem e propriedade não mudam; trilha', async () => {
    const f = await amb.ok('fonte:criar', { dados: dadosFonte() });
    const dup = await amb.chamar('fonte:criar', { dados: dadosFonte({ codigo: 'teste_estudo' }) });
    expect(dup).toMatchObject({ ok: false, erro: { codigo: 'DUPLICADO' } });
    const outra = await amb.chamar('fonte:atualizar', {
      id: f.id,
      dados: dadosFonte({ origem: 'tabela_compilada' }),
      motivo: 'Teste',
    });
    expect(outra).toMatchObject({ ok: false, erro: { codigo: 'OPERACAO_INVALIDA' } });
    await amb.ok('fonte:atualizar', {
      id: f.id,
      dados: dadosFonte({ titulo: 'Fonte fictícia corrigida' }),
      motivo: 'Correção do título',
    });
    const det = await amb.ok('fonte:obter', { id: f.id });
    expect(det.fonte.titulo).toBe('Fonte fictícia corrigida');
    expect(det.historico.map((h) => [h.acao, h.motivo])).toEqual([
      ['criacao', null],
      ['alteracao', 'Correção do título'],
    ]);
  });

  it('laudos e medições ficam isolados na propriedade; globais aparecem em todas', async () => {
    const p1 = await criarPropriedade(amb, 'Fazenda 1');
    const p2 = await criarPropriedade(amb, 'Fazenda 2');
    await amb.ok('fonte:criar', { dados: dadosFonte() });
    const laudo = (propriedadeId: string, numero: string) =>
      amb.ok('fonte:criar', {
        dados: dadosFonte({
          origem: 'laboratorial',
          codigo: null,
          autores: null,
          ano: null,
          laboratorio: 'Laboratório fictício',
          numeroLaudo: numero,
          propriedadeId,
        }),
      });
    await laudo(p1.id, '1');
    await laudo(p2.id, '2');
    const de = async (propriedadeId: string | null) =>
      (await amb.ok('fonte:listar', { propriedadeId })).map((f) => f.numeroLaudo ?? f.codigo);
    expect(await de(null)).toEqual(['TESTE_ESTUDO']);
    expect((await de(p1.id)).sort()).toEqual(['1', 'TESTE_ESTUDO']);
    expect((await de(p2.id)).sort()).toEqual(['2', 'TESTE_ESTUDO']);
    expect(
      (await amb.ok('fonte:listar', { propriedadeId: p1.id, origem: 'laboratorial' })).length,
    ).toBe(1);
  });

  it('exclusão lógica com motivo; excluída some da lista e não muda', async () => {
    const f = await amb.ok('fonte:criar', { dados: dadosFonte() });
    const ex = await amb.ok('fonte:excluir', { id: f.id, motivo: 'Cadastro de teste' });
    expect(ex.excluidaEm).not.toBeNull();
    expect(await amb.ok('fonte:listar', {})).toEqual([]);
    expect((await amb.ok('fonte:listar', { incluirExcluidas: true })).length).toBe(1);
    expect(
      (await amb.chamar('fonte:atualizar', { id: f.id, dados: dadosFonte(), motivo: 'x' })).ok,
    ).toBe(false);
    // O código fica livre para uma fonte nova.
    await amb.ok('fonte:criar', { dados: dadosFonte() });
    expect(contar('fonte')).toBe(2);
  });
});

describe('5A-2: definições de nutrientes', () => {
  it('catálogo inicial vem semeado, sem método e pendente; nada fundamentado', async () => {
    const lista = await amb.ok('nutriente:listar', {});
    expect(lista.map((n) => n.codigo)).toEqual(DEFINICOES_DO_SISTEMA.map((d) => d.codigo));
    for (const n of lista) {
      expect(n).toMatchObject({
        metodoAnalitico: null,
        situacaoFundamentacao: 'pendente',
        fundamentacaoFonte: null,
        origemDefinicao: 'sistema',
        nValores: 0,
      });
      expect(n.direcaoConservadora).toBe(n.direcaoSugerida);
    }
  });

  it('definição do sistema mantém nome, grupo, unidade e base; aceita descrição', async () => {
    const ms = (await amb.ok('nutriente:listar', {})).find((n) => n.id === ID_MS)!;
    const base = {
      codigo: ms.codigo,
      nome: ms.nome,
      grupo: ms.grupo,
      unidadeReferencia: ms.unidadeReferencia,
      baseReferencia: ms.baseReferencia,
      direcaoConservadora: ms.direcaoConservadora,
      metodoAnalitico: null,
      situacaoFundamentacao: 'pendente' as const,
      fundamentacaoFonteId: null,
      fundamentacaoReferencia: null,
      descricao: null,
      ativo: true,
    };
    for (const mudanca of [
      { nome: 'Outro nome' },
      { unidadeReferencia: 'g_kg' as const },
      { baseReferencia: 'ms' as const },
      { codigo: 'MSX' },
    ])
      expect(
        (
          await amb.chamar('nutriente:atualizar', {
            id: ID_MS,
            dados: { ...base, ...mudanca },
            motivo: 'x',
          })
        ).ok,
        JSON.stringify(mudanca),
      ).toBe(false);
    const ok = await amb.ok('nutriente:atualizar', {
      id: ID_MS,
      dados: { ...base, descricao: 'Descrição de teste' },
      motivo: 'Teste',
    });
    expect(ok.descricao).toBe('Descrição de teste');
  });

  it('fundamentada exige método, fonte bibliográfica ativa e página; nunca de laudo', async () => {
    const criar = (extra: Parameters<typeof dadosNutriente>[0]) =>
      amb.chamar('nutriente:criar', { dados: dadosNutriente(extra) });
    expect(
      await criar({ situacaoFundamentacao: 'fundamentada', metodoAnalitico: 'Método fictício' }),
    ).toMatchObject({ ok: false, erro: { codigo: 'ENTRADA_INVALIDA' } });
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
    const comLaudo = await criar({
      situacaoFundamentacao: 'fundamentada',
      metodoAnalitico: 'Método fictício',
      fundamentacaoFonteId: laudo.id,
      fundamentacaoReferencia: 'p. 1',
    });
    expect(comLaudo).toMatchObject({ ok: false, erro: { codigo: 'OPERACAO_INVALIDA' } });
    const estudo = await amb.ok('fonte:criar', { dados: dadosFonte() });
    const n = await amb.ok('nutriente:criar', {
      dados: dadosNutriente({
        situacaoFundamentacao: 'fundamentada',
        metodoAnalitico: 'Método fictício',
        fundamentacaoFonteId: estudo.id,
        fundamentacaoReferencia: 'p. 1',
      }),
    });
    expect(n).toMatchObject({
      situacaoFundamentacao: 'fundamentada',
      origemDefinicao: 'usuario',
      fundamentacaoFonte: { id: estudo.id, codigo: 'TESTE_ESTUDO' },
    });
    // A fonte que fundamenta não é excluída.
    expect((await amb.chamar('fonte:excluir', { id: estudo.id, motivo: 'x' })).ok).toBe(false);
    // Código único sem diferença de maiúsculas, também contra o catálogo do sistema.
    expect(await criar({ codigo: 'teste_a' })).toMatchObject({
      ok: false,
      erro: { codigo: 'DUPLICADO' },
    });
    expect(await criar({ codigo: 'pb' })).toMatchObject({
      ok: false,
      erro: { codigo: 'DUPLICADO' },
    });
  });

  it('desativar some da lista padrão, com trilha', async () => {
    const n = await amb.ok('nutriente:criar', { dados: dadosNutriente() });
    await amb.ok('nutriente:atualizar', {
      id: n.id,
      dados: dadosNutriente({ ativo: false }),
      motivo: 'Não usar',
    });
    expect((await amb.ok('nutriente:listar', {})).some((x) => x.id === n.id)).toBe(false);
    expect(
      (await amb.ok('nutriente:listar', { incluirInativos: true })).some((x) => x.id === n.id),
    ).toBe(true);
    const trilha = amb.gerenciador.conexao
      .prepare(
        "SELECT acao FROM historico_alteracao WHERE entidade = 'nutriente' AND entidade_id = ?",
      )
      .all(n.id);
    expect(trilha).toEqual([{ acao: 'criacao' }, { acao: 'alteracao' }]);
  });
});

describe('5A-2: alimentos', () => {
  it('cadastro, busca, filtros e nome único', async () => {
    await amb.ok('alimento:criar', {
      dados: dadosAlimento({
        nome: 'Alimento de teste ensilado',
        especie: 'Espécie fictícia',
        cultivar: 'Cultivar fictícia',
        formaConservacao: 'ensilado',
        classe: 'volumoso',
      }),
    });
    await amb.ok('alimento:criar', {
      dados: dadosAlimento({ nome: 'Alimento de teste fresco', formaConservacao: 'fresco' }),
    });
    expect(
      await amb.chamar('alimento:criar', {
        dados: dadosAlimento({ nome: ' alimento de TESTE fresco ' }),
      }),
    ).toMatchObject({ ok: false, erro: { codigo: 'DUPLICADO' } });
    const nomes = async (f: object) => (await amb.ok('alimento:listar', f)).map((a) => a.nome);
    expect(await nomes({})).toEqual(['Alimento de teste ensilado', 'Alimento de teste fresco']);
    expect(await nomes({ formaConservacao: 'ensilado' })).toEqual(['Alimento de teste ensilado']);
    expect(await nomes({ busca: 'cultivar fic' })).toEqual(['Alimento de teste ensilado']);
    expect(await nomes({ busca: '100%_' })).toEqual([]);
    expect(await nomes({ classe: 'volumoso' })).toEqual(['Alimento de teste ensilado']);
  });

  it('edição com motivo e trilha; exclusão lógica; excluído não muda', async () => {
    const a = await amb.ok('alimento:criar', { dados: dadosAlimento() });
    expect(a).toMatchObject({ nRegistros: 0, nConferidos: 0, comercial: false });
    await amb.ok('alimento:atualizar', {
      id: a.id,
      dados: dadosAlimento({ formaConservacao: 'feno' }),
      motivo: 'Forma corrigida',
    });
    await amb.ok('alimento:excluir', { id: a.id, motivo: 'Cadastro de teste' });
    expect(await amb.ok('alimento:listar', {})).toEqual([]);
    expect(
      (await amb.chamar('alimento:atualizar', { id: a.id, dados: dadosAlimento(), motivo: 'x' }))
        .ok,
    ).toBe(false);
    const det = await amb.ok('alimento:obter', { id: a.id });
    expect(det.historico.map((h) => h.acao)).toEqual(['criacao', 'alteracao', 'exclusao']);
    expect(det.alimento.excluidoEm).not.toBeNull();
  });

  it('entradas inválidas são recusadas pelo contrato', async () => {
    for (const [canal, entrada] of [
      ['alimento:criar', { dados: { ...dadosAlimento(), formaConservacao: 'liofilizado' } }],
      ['alimento:criar', { dados: { ...dadosAlimento(), nome: '   ' } }],
      ['alimento:obter', { id: 'nao-uuid' }],
      ['fonte:criar', { dados: { ...dadosFonte(), codigo: 'com espaço' } }],
      ['fonte:criar', { dados: { ...dadosFonte(), extra: 1 } }],
      ['nutriente:criar', { dados: { ...dadosNutriente(), unidadeReferencia: 'kg' } }],
    ] as const)
      expect(
        (await amb.chamar(canal as 'alimento:criar', entrada as never)).ok,
        `${canal} ${JSON.stringify(entrada)}`,
      ).toBe(false);
    expect(contar('alimento') + contar('fonte')).toBe(0);
  });

  it('nada do banco de alimentos sobrevive mal a um reinício e a backup e restauração', async () => {
    const f = await amb.ok('fonte:criar', { dados: dadosFonte() });
    const a = await amb.ok('alimento:criar', { dados: dadosAlimento() });
    const backup = await amb.ok('backup:criar', { observacao: 'teste 5A-2' });
    await amb.ok('alimento:excluir', { id: a.id, motivo: 'Depois do backup' });
    await amb.reiniciar();
    expect(await amb.ok('alimento:listar', {})).toEqual([]);
    await amb.ok('backup:restaurar', { id: backup.id });
    expect((await amb.ok('alimento:listar', {})).map((x) => x.id)).toEqual([a.id]);
    expect((await amb.ok('fonte:obter', { id: f.id })).fonte.codigo).toBe('TESTE_ESTUDO');
    expect((await amb.ok('nutriente:listar', {})).length).toBe(DEFINICOES_DO_SISTEMA.length);
  });
});
