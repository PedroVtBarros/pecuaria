import { afterEach, describe, expect, it } from 'vitest';
import { registrosIndependentes, type PacoteCuradoria } from '@pecuaria/domain';
import type { DadosValor } from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import { dadosNutriente } from './apoio-teste-alimentos';

/*
 * Pacotes FICTÍCIOS (CLAUDE.md, regra 1): nomes de teste e números sem relação com composição real.
 * A compilação "A" contém os dados do estudo "B"; B declara o vínculo.
 */
function pacote(
  codigo: string,
  fonte: string,
  referencia: string,
  extra: Partial<PacoteCuradoria> = {},
): PacoteCuradoria {
  return {
    codigo,
    versao: 1,
    titulo: `Pacote fictício ${codigo}`,
    descricao: 'Só para provar os vínculos.',
    transcritoPor: 'Transcritor fictício',
    fonte: {
      origem: 'estudo_individual',
      codigo: fonte,
      titulo: 'Fonte fictícia de teste',
      autores: 'Autoria fictícia',
      ano: 2020,
      edicaoVersao: null,
      instituicaoEditora: null,
      isbnDoiUrl: null,
      dataAcesso: null,
      observacoes: null,
    },
    alimentos: [
      {
        chave: 'a',
        nome: 'Alimento de teste',
        especie: null,
        cultivar: null,
        partePlanta: null,
        formaConservacao: 'outro',
        processamento: null,
        classe: 'outro',
        observacoes: null,
      },
    ],
    registros: [
      {
        alimento: 'a',
        referenciaLocal: referencia,
        idadeCorteDias: null,
        classeIdadeFonte: null,
        separadorDecimal: 'virgula',
        observacoes: null,
        bloqueio: null,
        valores: [
          {
            nutriente: 'TESTE_A',
            valorPublicado: '10,5',
            unidade: 'pct',
            base: 'ms',
            tipoValor: 'media',
            nObservacoes: null,
            metodoAnaliticoFonte: 'Método fictício informado',
            formaObtencao: 'estimado_equacao',
            descricaoObtencao: 'Equação fictícia (Autor fictício, 2000).',
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
const A = pacote('PACOTE_A', 'FONTE_A', 'Tabela fictícia A1');
const B = pacote('PACOTE_B', 'FONTE_B', 'Tabela fictícia B1', {
  vinculos: [
    {
      registro: 'Tabela fictícia B1',
      outraFonte: 'fonte_a',
      outroRegistro: 'Tabela fictícia A1',
      relacao: 'outro_inclui_este',
      evidencia: 'Evidência fictícia: a média de A coincide com B.',
    },
  ],
});

let amb: AmbienteIpc;
async function preparar() {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 21, 10), pacotesCuradoria: [A, B] });
  await amb.ok('nutriente:criar', { dados: dadosNutriente() });
}
afterEach(() => amb.encerrar());
const importar = (codigo: string) => amb.ok('curadoria:importar', { codigo, versao: 1 });
const linhas = (sql: string) => amb.gerenciador.conexao.prepare(sql).all();

describe('5C-1: vínculos de possível mesma origem', () => {
  it('importado antes do outro lado: fica pendente, sem decisão; resolve quando o outro chega', async () => {
    await preparar();
    const rb = (await importar('PACOTE_B')).registros[0]!;
    let db = await amb.ok('composicao:obter', { id: rb.id });
    expect(db.vinculosOrigem).toEqual([
      expect.objectContaining({
        lado: 'este',
        relacao: 'outro_inclui_este',
        situacao: 'a_confirmar',
        pacoteCodigo: 'PACOTE_B',
        outro: {
          registroId: null,
          alimentoNome: null,
          fonteCodigo: 'FONTE_A',
          referenciaLocal: 'Tabela fictícia A1',
          status: null,
        },
      }),
    ]);
    expect(
      await amb.chamar('vinculoOrigem:decidir', {
        registroId: rb.id,
        vinculoId: db.vinculosOrigem[0]!.id,
        decisao: 'confirmado',
        responsavel: 'Pessoa usuária',
        motivo: null,
      }),
    ).toMatchObject({
      ok: false,
      erro: { mensagem: expect.stringMatching(/ainda não está no banco/) },
    });
    const ra = (await importar('PACOTE_A')).registros[0]!;
    db = await amb.ok('composicao:obter', { id: rb.id });
    expect(db.vinculosOrigem[0]!.outro).toMatchObject({
      registroId: ra.id,
      fonteCodigo: 'FONTE_A',
    });
    const da = await amb.ok('composicao:obter', { id: ra.id });
    expect(da.vinculosOrigem).toEqual([
      expect.objectContaining({
        lado: 'outro',
        outro: expect.objectContaining({ registroId: rb.id }),
      }),
    ]);
    expect(
      linhas(
        "SELECT acao FROM historico_alteracao WHERE entidade = 'vinculo_registro' ORDER BY rowid",
      ),
    ).toEqual([{ acao: 'criacao' }, { acao: 'vinculacao' }]);
  });

  it('outro lado já no banco: resolve na hora; decisão única, com trilha; descarte exige motivo', async () => {
    await preparar();
    const ra = (await importar('PACOTE_A')).registros[0]!;
    const rb = (await importar('PACOTE_B')).registros[0]!;
    const db = await amb.ok('composicao:obter', { id: rb.id });
    const vinculoId = db.vinculosOrigem[0]!.id;
    expect(db.vinculosOrigem[0]!.outro.registroId).toBe(ra.id);
    expect(
      (
        await amb.chamar('vinculoOrigem:decidir', {
          registroId: ra.id,
          vinculoId,
          decisao: 'descartado',
          responsavel: 'Pessoa usuária',
          motivo: null,
        })
      ).ok,
    ).toBe(false);
    const confirmado = await amb.ok('vinculoOrigem:decidir', {
      registroId: ra.id,
      vinculoId,
      decisao: 'confirmado',
      responsavel: 'Pessoa usuária',
      motivo: null,
    });
    expect(confirmado.vinculosOrigem[0]).toMatchObject({
      situacao: 'confirmado',
      decididoPor: 'Pessoa usuária',
    });
    expect(
      await amb.chamar('vinculoOrigem:decidir', {
        registroId: rb.id,
        vinculoId,
        decisao: 'descartado',
        responsavel: 'Pessoa usuária',
        motivo: 'Teste fictício',
      }),
    ).toMatchObject({ ok: false, erro: { mensagem: expect.stringMatching(/já foi tomada/) } });
    const trilha = linhas(
      "SELECT acao FROM historico_alteracao WHERE entidade = 'vinculo_registro' AND acao = 'confirmacao'",
    );
    expect(trilha).toHaveLength(1);
    // Independência só pelo descarte (regra do domínio, para a 5D).
    const gravados = linhas(
      'SELECT registro_id, relacionado_id, situacao FROM vinculo_registro',
    ) as {
      registro_id: string;
      relacionado_id: string;
      situacao: 'confirmado';
    }[];
    expect(
      registrosIndependentes(
        ra.id,
        rb.id,
        gravados.map((g) => ({
          registroId: g.registro_id,
          relacionadoId: g.relacionado_id,
          situacao: g.situacao,
        })),
      ),
    ).toBe(false);
  });

  it('a nova versão herda o vínculo pela cadeia; vínculo de outro registro é recusado', async () => {
    await preparar();
    const ra = (await importar('PACOTE_A')).registros[0]!;
    await importar('PACOTE_B');
    await amb.ok('composicao:conferir', { id: ra.id, responsavel: 'Pessoa usuária' });
    const nova = await amb.ok('composicao:novaVersao', { id: ra.id, motivo: 'Correção fictícia' });
    expect(nova.vinculosOrigem).toHaveLength(1);
    const outro = await amb.ok('composicao:criar', {
      dados: {
        alimentoId: nova.registro.alimentoId,
        fonteId: nova.registro.fonte.id,
        referenciaLocal: 'Tabela fictícia A2',
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
      },
    });
    expect(
      await amb.chamar('vinculoOrigem:decidir', {
        registroId: outro.registro.id,
        vinculoId: nova.vinculosOrigem[0]!.id,
        decisao: 'confirmado',
        responsavel: 'Pessoa usuária',
        motivo: null,
      }),
    ).toMatchObject({ ok: false, erro: { codigo: 'NAO_ENCONTRADO' } });
  });
});

describe('5C-1: forma de obtenção do valor', () => {
  it('importada do pacote; exigências da equação; copiada na nova versão; nas diferenças', async () => {
    await preparar();
    const ra = (await importar('PACOTE_A')).registros[0]!;
    const d = await amb.ok('composicao:obter', { id: ra.id });
    expect(d.valores[0]).toMatchObject({
      formaObtencao: 'estimado_equacao',
      descricaoObtencao: 'Equação fictícia (Autor fictício, 2000).',
      interpretacaoBase: null,
      metodoAnaliticoFonte: 'Método fictício informado',
    });
    await amb.ok('composicao:conferir', { id: ra.id, responsavel: 'Pessoa usuária' });
    const nova = await amb.ok('composicao:novaVersao', { id: ra.id, motivo: 'Correção fictícia' });
    expect(nova.valores[0]).toMatchObject({ formaObtencao: 'estimado_equacao' });
    const dados = (extra: Partial<DadosValor>): DadosValor => ({
      nutrienteId: nova.valores[0]!.nutriente.id,
      valorPublicado: '10,5',
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
    });
    expect(
      (
        await amb.chamar('composicao:salvarValor', {
          registroId: nova.registro.id,
          valorId: nova.valores[0]!.id,
          dados: dados({ formaObtencao: 'calculado', descricaoObtencao: null }),
        })
      ).ok,
    ).toBe(false);
    const alterado = await amb.ok('composicao:salvarValor', {
      registroId: nova.registro.id,
      valorId: nova.valores[0]!.id,
      dados: dados({ formaObtencao: 'medido' }),
    });
    expect(alterado.valores[0]).toMatchObject({ formaObtencao: 'medido', descricaoObtencao: null });
    expect(alterado.diferencasDaAnterior).toEqual([
      expect.objectContaining({
        antes: expect.stringContaining('obtenção: estimado_equacao'),
        depois: expect.stringContaining('obtenção: medido'),
      }),
    ]);
    // Sem informar, o valor é "não informado", nunca presumido medido.
    const padrao = await amb.ok('composicao:salvarValor', {
      registroId: nova.registro.id,
      valorId: nova.valores[0]!.id,
      dados: dados({}),
    });
    expect(padrao.valores[0]!.formaObtencao).toBe('nao_informado');
  });
});
