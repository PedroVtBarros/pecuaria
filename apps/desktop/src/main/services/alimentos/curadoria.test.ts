import { afterEach, describe, expect, it } from 'vitest';
import type { PacoteCuradoria } from '@pecuaria/domain';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import { dadosAlimento, dadosFonte, dadosNutriente } from './apoio-teste-alimentos';

/*
 * Pacote FICTÍCIO (CLAUDE.md, regra 1): nomes de teste e números sem relação com composição real.
 * O pacote real da 5B-3 tem teste próprio.
 */
function pacote(extra: Partial<PacoteCuradoria> = {}): PacoteCuradoria {
  return {
    codigo: 'TESTE_PACOTE',
    versao: 1,
    titulo: 'Pacote fictício de teste',
    descricao: 'Só para provar a importação.',
    transcritoPor: 'Transcritor fictício',
    fonte: {
      origem: 'tabela_compilada',
      codigo: 'TESTE_FONTE',
      titulo: 'Fonte fictícia de teste',
      autores: 'Autoria fictícia',
      ano: 2020,
      edicaoVersao: 'versão fictícia',
      instituicaoEditora: null,
      isbnDoiUrl: null,
      dataAcesso: '2026-10-21',
      observacoes: null,
    },
    alimentos: [
      {
        chave: 'a',
        nome: 'Alimento de teste',
        especie: 'Espécie fictícia',
        cultivar: null,
        partePlanta: null,
        formaConservacao: 'fresco',
        processamento: null,
        classe: 'volumoso',
        observacoes: null,
      },
      {
        chave: 'b',
        nome: 'Outro alimento de teste',
        especie: null,
        cultivar: null,
        partePlanta: null,
        formaConservacao: 'grao',
        processamento: null,
        classe: 'concentrado_energetico',
        observacoes: null,
      },
    ],
    registros: [
      {
        alimento: 'a',
        referenciaLocal: 'Relatório fictício 1',
        idadeCorteDias: 60,
        classeIdadeFonte: 'Classe fictícia 60',
        separadorDecimal: 'ponto',
        observacoes: 'Observação fictícia do registro.',
        bloqueio: null,
        valores: [
          {
            nutriente: 'TESTE_A',
            valorPublicado: '10.50',
            unidade: 'pct',
            base: 'ms',
            tipoValor: 'media',
            nObservacoes: 3,
            metodoAnaliticoFonte: null,
            formaObtencao: 'nao_informado',
            descricaoObtencao: null,
            interpretacaoBase: null,
            observacao: 'Na fonte: rótulo fictício.',
          },
          {
            nutriente: 'TESTE_B',
            valorPublicado: '1.00',
            unidade: 'pct',
            base: 'ms',
            tipoValor: 'media',
            nObservacoes: 1,
            metodoAnaliticoFonte: null,
            formaObtencao: 'nao_informado',
            descricaoObtencao: null,
            interpretacaoBase: null,
            observacao: null,
          },
        ],
      },
      {
        alimento: 'b',
        referenciaLocal: 'Relatório fictício 2',
        idadeCorteDias: null,
        classeIdadeFonte: null,
        separadorDecimal: 'ponto',
        observacoes: null,
        bloqueio: null,
        valores: [
          {
            nutriente: 'TESTE_A',
            valorPublicado: '20.25',
            unidade: 'pct',
            base: 'ms',
            tipoValor: 'media',
            nObservacoes: 2,
            metodoAnaliticoFonte: null,
            formaObtencao: 'nao_informado',
            descricaoObtencao: null,
            interpretacaoBase: null,
            observacao: null,
          },
        ],
      },
    ],
    vinculos: [],
    ...extra,
  };
}

let amb: AmbienteIpc;
async function preparar(pacotes: PacoteCuradoria[] = [pacote()]) {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 21, 10), pacotesCuradoria: pacotes });
  await amb.ok('nutriente:criar', { dados: dadosNutriente() });
  await amb.ok('nutriente:criar', {
    dados: dadosNutriente({ codigo: 'TESTE_B', nome: 'Nutriente de teste B' }),
  });
}
afterEach(() => amb.encerrar());
const linhas = (sql: string, ...p: unknown[]) => amb.gerenciador.conexao.prepare(sql).all(...p);
const contar = (t: string) =>
  (amb.gerenciador.conexao.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;

describe('5B-2: importação de pacote de curadoria', () => {
  it('lista o pacote sem importar nada; importar é ação explícita', async () => {
    await preparar();
    const [p] = await amb.ok('curadoria:listar', {});
    expect(p).toMatchObject({
      codigo: 'TESTE_PACOTE',
      versao: 1,
      contagem: { alimentos: 2, registros: 2, valores: 3, bloqueados: 0 },
      alimentos: [
        { nome: 'Alimento de teste', registros: 1, valores: 2, bloqueados: 0 },
        { nome: 'Outro alimento de teste', registros: 1, valores: 1, bloqueados: 0 },
      ],
      nutrientes: ['TESTE_A', 'TESTE_B'],
      importacao: null,
    });
    for (const t of ['fonte', 'alimento', 'registro_composicao', 'valor_nutricional'])
      expect(contar(t), t).toBe(0);
  });

  it('cria fonte, alimentos e registros transcritos, com o texto publicado e a trilha', async () => {
    await preparar();
    const r = await amb.ok('curadoria:importar', { codigo: 'TESTE_PACOTE', versao: 1 });
    expect(r.importacao).toMatchObject({ nAlimentosCriados: 2, nRegistros: 2, nValores: 3 });
    expect(r.registros.map((x) => [x.alimentoNome, x.status, x.transcritoPor])).toEqual([
      ['Alimento de teste', 'transcrito', 'Transcritor fictício'],
      ['Outro alimento de teste', 'transcrito', 'Transcritor fictício'],
    ]);
    const d = await amb.ok('composicao:obter', { id: r.registros[0]!.id });
    expect(d.registro).toMatchObject({
      referenciaLocal: 'Relatório fictício 1',
      idadeCorteDias: 60,
      classeIdadeFonte: 'Classe fictícia 60',
      separadorDecimal: 'ponto',
      observacoes: 'Observação fictícia do registro.',
      conferidoPor: null,
    });
    expect(d.fonte).toMatchObject({ codigo: 'TESTE_FONTE', origem: 'tabela_compilada' });
    expect(
      d.valores.map((v) => [
        v.nutriente.codigo,
        v.valorPublicado,
        v.valor,
        v.casasDecimais,
        v.nObservacoes,
        v.observacao,
      ]),
    ).toEqual([
      ['TESTE_A', '10.50', 10.5, 2, 3, 'Na fonte: rótulo fictício.'],
      ['TESTE_B', '1.00', 1, 2, 1, null],
    ]);
    // Nada conferido: só a conferência do usuário libera para cálculo.
    expect(linhas("SELECT 1 FROM registro_composicao WHERE status = 'conferido'")).toEqual([]);
    expect(
      linhas(
        "SELECT entidade, acao FROM historico_alteracao WHERE entidade = 'importacao_curadoria'",
      ),
    ).toEqual([{ entidade: 'importacao_curadoria', acao: 'importacao' }]);
    const resumo = JSON.parse(
      (linhas('SELECT resumo_json FROM importacao_curadoria')[0] as { resumo_json: string })
        .resumo_json,
    ) as { registros: string[] };
    expect(resumo.registros).toEqual(r.registros.map((x) => x.id));
    // Listagem mostra a importação; a segunda importação é recusada, também depois de reiniciar.
    await amb.reiniciar();
    expect((await amb.ok('curadoria:listar', {}))[0]!.importacao).toMatchObject({
      nRegistros: 2,
    });
    expect(
      await amb.chamar('curadoria:importar', { codigo: 'TESTE_PACOTE', versao: 1 }),
    ).toMatchObject({
      ok: false,
      erro: { mensagem: expect.stringMatching(/já foi importado/) },
    });
    expect(contar('registro_composicao')).toBe(2);
  });

  it('o usuário confere o registro importado pelo fluxo normal, sem aviso de mesma pessoa', async () => {
    await preparar();
    const r = await amb.ok('curadoria:importar', { codigo: 'TESTE_PACOTE', versao: 1 });
    const c = await amb.ok('composicao:conferir', {
      id: r.registros[0]!.id,
      responsavel: 'Pessoa usuária',
    });
    expect(c.registro).toMatchObject({ status: 'conferido', mesmaPessoa: false });
    // Também pode rejeitar outro, com motivo.
    const rej = await amb.ok('composicao:rejeitar', {
      id: r.registros[1]!.id,
      responsavel: 'Pessoa usuária',
      motivo: 'Valor diferente da fonte (teste fictício).',
    });
    expect(rej.registro.status).toBe('rejeitado');
  });

  it('reaproveita fonte e alimento já cadastrados com o mesmo código e a mesma identidade', async () => {
    await preparar();
    const f = await amb.ok('fonte:criar', {
      dados: dadosFonte({ origem: 'tabela_compilada', codigo: 'teste_fonte' }),
    });
    const a = await amb.ok('alimento:criar', {
      dados: dadosAlimento({
        nome: 'alimento de teste',
        especie: 'Espécie fictícia',
        formaConservacao: 'fresco',
        classe: 'volumoso',
      }),
    });
    const r = await amb.ok('curadoria:importar', { codigo: 'TESTE_PACOTE', versao: 1 });
    expect(r.importacao).toMatchObject({ fonteId: f.id, nAlimentosCriados: 1 });
    expect(r.registros[0]!.alimentoId).toBe(a.id);
    expect(contar('fonte')).toBe(1);
  });

  it('identidade diferente, fonte de outra origem ou valor inválido: nada é importado', async () => {
    await preparar();
    await amb.ok('alimento:criar', {
      dados: dadosAlimento({ nome: 'Alimento de teste', formaConservacao: 'ensilado' }),
    });
    expect(
      await amb.chamar('curadoria:importar', { codigo: 'TESTE_PACOTE', versao: 1 }),
    ).toMatchObject({
      ok: false,
      erro: { mensagem: expect.stringMatching(/outra identidade/) },
    });
    expect([
      contar('fonte'),
      contar('registro_composicao'),
      contar('importacao_curadoria'),
    ]).toEqual([0, 0, 0]);
    amb.encerrar();

    await preparar();
    await amb.ok('fonte:criar', { dados: dadosFonte({ codigo: 'TESTE_FONTE' }) });
    expect((await amb.chamar('curadoria:importar', { codigo: 'TESTE_PACOTE', versao: 1 })).ok).toBe(
      false,
    );
    expect(contar('alimento')).toBe(0);
    amb.encerrar();

    // Unidade de outra grandeza só é pega pelo serviço de valor: desfaz tudo.
    const p = pacote();
    const r0 = p.registros[1]!;
    await preparar([
      pacote({
        registros: [
          p.registros[0]!,
          { ...r0, valores: [{ ...r0.valores[0]!, unidade: 'mcal_kg' }] },
        ],
      }),
    ]);
    expect((await amb.chamar('curadoria:importar', { codigo: 'TESTE_PACOTE', versao: 1 })).ok).toBe(
      false,
    );
    expect([contar('fonte'), contar('alimento'), contar('registro_composicao')]).toEqual([0, 0, 0]);
  });

  it('definição ausente do catálogo ou pacote inexistente são recusados', async () => {
    await preparar([pacote({ codigo: 'OUTRO_PACOTE' })]);
    expect(
      await amb.chamar('curadoria:importar', { codigo: 'NAO_EXISTE', versao: 1 }),
    ).toMatchObject({
      ok: false,
      erro: { codigo: 'NAO_ENCONTRADO' },
    });
    await amb.ok('nutriente:atualizar', {
      id: (await amb.ok('nutriente:listar', { incluirInativos: false })).find(
        (n) => n.codigo === 'TESTE_B',
      )!.id,
      dados: dadosNutriente({ codigo: 'TESTE_B', nome: 'Nutriente de teste B', ativo: false }),
      motivo: 'Teste fictício',
    });
    expect(
      await amb.chamar('curadoria:importar', { codigo: 'OUTRO_PACOTE', versao: 1 }),
    ).toMatchObject({
      ok: false,
      erro: { mensagem: expect.stringMatching(/definição inexistente/) },
    });
  });

  it('registro bloqueado não é importado; alimento só com registro bloqueado não é criado', async () => {
    const p = pacote();
    await preparar([
      pacote({
        registros: [
          p.registros[0]!,
          { ...p.registros[1]!, bloqueio: 'Correspondência fictícia não conferida.' },
        ],
      }),
    ]);
    const [resumo] = await amb.ok('curadoria:listar', {});
    expect(resumo).toMatchObject({
      contagem: { alimentos: 1, registros: 1, valores: 2, bloqueados: 1 },
      bloqueados: [
        {
          alimento: 'Outro alimento de teste',
          referenciaLocal: 'Relatório fictício 2',
          motivo: 'Correspondência fictícia não conferida.',
        },
      ],
    });
    const r = await amb.ok('curadoria:importar', { codigo: 'TESTE_PACOTE', versao: 1 });
    expect(r.importacao).toMatchObject({ nAlimentosCriados: 1, nRegistros: 1, nValores: 2 });
    expect(r.registros.map((x) => x.alimentoNome)).toEqual(['Alimento de teste']);
    expect(contar('alimento')).toBe(1);
    const resumoJson = JSON.parse(
      (linhas('SELECT resumo_json FROM importacao_curadoria')[0] as { resumo_json: string })
        .resumo_json,
    ) as { bloqueados: unknown[] };
    expect(resumoJson.bloqueados).toEqual([
      {
        referenciaLocal: 'Relatório fictício 2',
        motivo: 'Correspondência fictícia não conferida.',
      },
    ]);
  });

  it('versão nova de pacote já importado em outra versão é recusada, para não duplicar registros', async () => {
    await preparar([pacote(), pacote({ versao: 2 })]);
    await amb.ok('curadoria:importar', { codigo: 'TESTE_PACOTE', versao: 1 });
    expect(
      await amb.chamar('curadoria:importar', { codigo: 'TESTE_PACOTE', versao: 2 }),
    ).toMatchObject({
      ok: false,
      erro: { mensagem: expect.stringMatching(/versão 1 deste pacote já foi importada/) },
    });
    expect(contar('registro_composicao')).toBe(2);
  });
});
