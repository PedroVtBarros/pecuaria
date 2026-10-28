import { afterEach, describe, expect, it } from 'vitest';
import type {
  PacoteCuradoria,
  RegistroPacoteCuradoria,
  ValorPacoteCuradoria,
} from '@pecuaria/domain';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import { dadosNutriente } from './apoio-teste-alimentos';

/*
 * Atualização de pacote já importado (aprovação da 5C). Pacotes FICTÍCIOS (CLAUDE.md, regra 1):
 * nomes de teste e números sem relação com composição real.
 */
const valor = (extra: Partial<ValorPacoteCuradoria> = {}): ValorPacoteCuradoria => ({
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
  observacao: null,
  ...extra,
});
const registro = (
  n: number,
  extra: Partial<RegistroPacoteCuradoria> = {},
): RegistroPacoteCuradoria => ({
  alimento: 'a',
  referenciaLocal: `Relatório fictício ${n}`,
  idadeCorteDias: null,
  classeIdadeFonte: null,
  separadorDecimal: 'ponto',
  observacoes: null,
  bloqueio: null,
  valores: [valor(), valor({ nutriente: 'TESTE_B', valorPublicado: '1.00', nObservacoes: 1 })],
  ...extra,
});
const base = (versao: number, extra: Partial<PacoteCuradoria>): PacoteCuradoria => ({
  codigo: 'TESTE_PACOTE',
  versao,
  titulo: 'Pacote fictício de teste',
  descricao: 'Só para provar a atualização.',
  transcritoPor: 'Transcritor fictício',
  fonte: {
    origem: 'tabela_compilada',
    codigo: 'TESTE_FONTE',
    titulo: 'Fonte fictícia de teste',
    autores: 'Autoria fictícia',
    ano: 2020,
    edicaoVersao: null,
    instituicaoEditora: null,
    isbnDoiUrl: null,
    dataAcesso: '2026-10-21',
    observacoes: null,
  },
  alimentos: [
    {
      chave: 'a',
      nome: 'Alimento de teste',
      especie: null,
      cultivar: null,
      partePlanta: null,
      formaConservacao: 'fresco',
      processamento: null,
      classe: 'volumoso',
      observacoes: null,
    },
  ],
  registros: [],
  vinculos: [],
  ...extra,
});

const MUDADO = valor({
  formaObtencao: 'medido',
  interpretacaoBase: 'Interpretação fictícia da base.',
  observacao: 'Observação fictícia nova.',
});
const VINCULO = {
  outraFonte: 'OUTRA_FONTE',
  outroRegistro: 'Tabela fictícia',
  relacao: 'mesmos_valores' as const,
  evidencia: 'Evidência fictícia.',
};
// Versão 1: oito registros. Versão 2: muda 1 a 5, mantém 6, bloqueia 7, omite 8 e traz o 9.
const V1 = base(1, {
  registros: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => registro(n)),
  vinculos: [{ registro: 'Relatório fictício 6', ...VINCULO }],
});
const V2 = base(2, {
  fonte: { ...V1.fonte, observacoes: 'Observação fictícia nova da fonte.' },
  registros: [
    registro(1, { idadeCorteDias: 30, valores: [MUDADO, V1.registros[0]!.valores[1]!] }),
    registro(2, { valores: [MUDADO] }),
    ...[3, 4, 5].map((n) => registro(n, { valores: [MUDADO] })),
    registro(6),
    registro(7, { bloqueio: 'Bloqueio fictício.' }),
    registro(9),
  ],
  vinculos: [
    { registro: 'Relatório fictício 6', ...VINCULO },
    { registro: 'Relatório fictício 1', ...VINCULO },
    { registro: 'Relatório fictício 2', ...VINCULO },
  ],
});

let amb: AmbienteIpc;
async function preparar(pacotes: PacoteCuradoria[] = [V1, V2]) {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 21, 10), pacotesCuradoria: pacotes });
  await amb.ok('nutriente:criar', { dados: dadosNutriente() });
  await amb.ok('nutriente:criar', {
    dados: dadosNutriente({ codigo: 'TESTE_B', nome: 'Nutriente de teste B' }),
  });
}
afterEach(() => amb.encerrar());
const contar = (t: string) =>
  (amb.gerenciador.conexao.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
const acoes = (entidade: string, id: string) =>
  (
    amb.gerenciador.conexao
      .prepare(
        'SELECT acao FROM historico_alteracao WHERE entidade = ? AND entidade_id = ? ORDER BY rowid',
      )
      .all(entidade, id) as { acao: string }[]
  ).map((l) => l.acao);

/** Importa a versão 1 e deixa cada registro no estado que o teste precisa. */
async function importarV1() {
  const r = await amb.ok('curadoria:importar', { codigo: 'TESTE_PACOTE', versao: 1 });
  const id = (n: number) =>
    r.registros.find((x) => x.referenciaLocal === `Relatório fictício ${n}`)!.id;
  await amb.ok('composicao:conferir', { id: id(2), responsavel: 'Pessoa usuária' });
  await amb.ok('composicao:devolver', { id: id(3), motivo: 'Edição fictícia do usuário.' });
  await amb.ok('composicao:rejeitar', {
    id: id(4),
    responsavel: 'Pessoa usuária',
    motivo: 'Rejeição fictícia.',
  });
  await amb.ok('composicao:descartar', { id: id(5), motivo: 'Descarte fictício.' });
  return id;
}

describe('aprovação da 5C: atualização de pacote já importado', () => {
  it('cada registro segue sua situação; nada é duplicado e o conferido ganha versão nova', async () => {
    await preparar();
    const id = await importarV1();
    expect(contar('registro_composicao')).toBe(8);
    const conferidoAntes = await amb.ok('composicao:obter', { id: id(2) });

    const r = await amb.ok('curadoria:atualizar', { codigo: 'TESTE_PACOTE', versao: 2 });
    const situacao = (n: number) =>
      r.atualizacao.itens.find((i) => i.referenciaLocal === `Relatório fictício ${n}`)?.situacao;
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(situacao)).toEqual([
      'atualizado',
      'nova_versao',
      'mantido_em_edicao',
      'mantido_rejeitado',
      'mantido_descartado',
      'sem_mudanca',
      'bloqueado_ja_importado',
      'fora_da_versao',
      'novo',
    ]);
    expect(r.atualizacao).toMatchObject({ deVersao: 1, fonteAlterada: ['observacoes'] });
    // 8 da versão 1 + a versão nova do conferido + o registro novo.
    expect(contar('registro_composicao')).toBe(10);

    // Transcrito pelo pacote: corrigido no próprio registro, com trilha, e transcrito de novo.
    const um = await amb.ok('composicao:obter', { id: id(1) });
    expect(um.registro).toMatchObject({
      status: 'transcrito',
      transcritoPor: 'Transcritor fictício',
      idadeCorteDias: 30,
    });
    expect(um.valores.find((v) => v.nutriente.codigo === 'TESTE_A')).toMatchObject({
      formaObtencao: 'medido',
      interpretacaoBase: 'Interpretação fictícia da base.',
      observacao: 'Observação fictícia nova.',
    });
    // Criação e valores da importação; depois, volta a rascunho, cabeçalho, valor e nova transcrição.
    expect(acoes('registro_composicao', id(1)).slice(3)).toEqual([
      'transcricao',
      'retorno_rascunho',
      'alteracao',
      'alteracao',
      'transcricao',
    ]);
    expect(r.atualizacao.itens[0]!.mudancas).toEqual([
      'Registro: idade de corte',
      'TESTE_A: forma de obtenção, interpretação da base, observação',
    ]);

    // Conferido: não muda; a versão nova traz as mudanças e o substitui ao ser conferida.
    expect(await amb.ok('composicao:obter', { id: id(2) })).toMatchObject({
      registro: { status: 'conferido' },
      valores: conferidoAntes.valores,
    });
    const nova = await amb.ok('composicao:obter', { id: r.atualizacao.itens[1]!.registroId! });
    expect(nova.registro).toMatchObject({ status: 'transcrito', substituiId: id(2) });
    expect(nova.valores.map((v) => [v.nutriente.codigo, v.interpretacaoBase])).toEqual([
      ['TESTE_A', 'Interpretação fictícia da base.'],
    ]);
    expect(nova.diferencasDaAnterior.length).toBeGreaterThan(0);
    await amb.ok('composicao:conferir', { id: nova.registro.id, responsavel: 'Pessoa usuária' });
    expect((await amb.ok('composicao:obter', { id: id(2) })).registro.status).toBe('substituido');

    // Em edição, rejeitado e descartado: nada muda, e as mudanças ficam listadas.
    for (const n of [3, 4, 5]) {
      const d = await amb.ok('composicao:obter', { id: id(n) });
      expect(d.valores.every((v) => v.formaObtencao === 'nao_informado')).toBe(true);
    }
    expect(r.atualizacao.itens[2]!.mudancas).toContain('TESTE_B: fora da versão nova (removido)');

    // Fonte com trilha e motivo; importação da versão 2 registrada como atualização.
    const fonte = await amb.ok('fonte:obter', { id: r.importacao.fonteId });
    expect(fonte.fonte.observacoes).toBe('Observação fictícia nova da fonte.');
    expect(acoes('fonte', r.importacao.fonteId)).toEqual(['criacao', 'alteracao']);
    expect(acoes('importacao_curadoria', r.importacao.id)).toEqual(['atualizacao']);
  });

  it('vínculo já existente não é recriado; os novos apontam para a primeira versão', async () => {
    await preparar();
    const id = await importarV1();
    expect(contar('vinculo_registro')).toBe(1);
    const r = await amb.ok('curadoria:atualizar', { codigo: 'TESTE_PACOTE', versao: 2 });
    expect(contar('vinculo_registro')).toBe(3);
    const um = await amb.ok('composicao:obter', { id: id(1) });
    expect(um.vinculosOrigem).toHaveLength(1);
    // O 2 estava conferido e ganhou versão nova: o vínculo fica na primeira e vale para as duas.
    expect(
      amb.gerenciador.conexao
        .prepare('SELECT registro_id AS r FROM vinculo_registro ORDER BY rowid')
        .all()
        .map((l) => (l as { r: string }).r),
    ).toEqual([id(6), id(1), id(2)]);
    const nova = await amb.ok('composicao:obter', { id: r.atualizacao.itens[1]!.registroId! });
    expect(nova.vinculosOrigem).toHaveLength(1);
  });

  it('a tela sabe qual versão está no banco e o que a atualização fez', async () => {
    await preparar();
    await importarV1();
    let [v1, v2] = await amb.ok('curadoria:listar', {});
    expect(v2).toMatchObject({ importacao: null, versaoImportada: 1, atualizacao: null });
    await amb.ok('curadoria:atualizar', { codigo: 'TESTE_PACOTE', versao: 2 });
    [v1, v2] = await amb.ok('curadoria:listar', {});
    expect(v1!.versaoImportada).toBe(2);
    expect(v2!.importacao).not.toBeNull();
    expect(v2!.atualizacao!.itens).toHaveLength(9);
  });

  it('recusas: importar versão nova, atualizar sem importação, atualizar duas vezes', async () => {
    await preparar();
    expect(
      await amb.chamar('curadoria:atualizar', { codigo: 'TESTE_PACOTE', versao: 2 }),
    ).toMatchObject({ ok: false, erro: { mensagem: expect.stringMatching(/Nenhuma versão/) } });
    await importarV1();
    expect(
      await amb.chamar('curadoria:importar', { codigo: 'TESTE_PACOTE', versao: 2 }),
    ).toMatchObject({ ok: false, erro: { mensagem: expect.stringMatching(/Atualizar/) } });
    await amb.ok('curadoria:atualizar', { codigo: 'TESTE_PACOTE', versao: 2 });
    expect(
      await amb.chamar('curadoria:atualizar', { codigo: 'TESTE_PACOTE', versao: 2 }),
    ).toMatchObject({ ok: false, erro: { mensagem: expect.stringMatching(/já está no banco/) } });
    expect(contar('registro_composicao')).toBe(10);
  });

  it('falha no meio desfaz tudo: alimento novo com identidade divergente', async () => {
    const V2_RUIM = base(2, {
      fonte: V2.fonte,
      alimentos: [
        ...V1.alimentos,
        {
          ...V1.alimentos[0]!,
          chave: 'b',
          nome: 'Outro alimento de teste',
          especie: 'Espécie fictícia',
        },
      ],
      registros: [...V2.registros, registro(10, { alimento: 'b' })],
    });
    await preparar([V1, V2_RUIM]);
    await amb.ok('alimento:criar', {
      dados: {
        nome: 'Outro alimento de teste',
        especie: null,
        cultivar: null,
        partePlanta: null,
        formaConservacao: 'fresco',
        processamento: null,
        classe: 'volumoso',
        comercial: false,
        observacoes: null,
      },
    });
    const id = await importarV1();
    const historico = contar('historico_alteracao');
    expect(
      await amb.chamar('curadoria:atualizar', { codigo: 'TESTE_PACOTE', versao: 2 }),
    ).toMatchObject({ ok: false, erro: { mensagem: expect.stringMatching(/outra identidade/) } });
    expect(contar('registro_composicao')).toBe(8);
    expect(contar('importacao_curadoria')).toBe(1);
    expect(contar('historico_alteracao')).toBe(historico);
    expect((await amb.ok('composicao:obter', { id: id(1) })).registro.idadeCorteDias).toBeNull();
  });
});
