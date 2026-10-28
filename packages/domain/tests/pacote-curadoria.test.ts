import { describe, expect, it } from 'vitest';
import {
  contarPacote,
  DEFINICOES_6B,
  DEFINICOES_CURADORIA_5B,
  DEFINICOES_DO_SISTEMA,
  DEFINICOES_INICIAIS_NUTRIENTES,
  direcaoSugeridaPorGrupo,
  PACOTES_CURADORIA,
  problemasDoPacote,
  type PacoteCuradoria,
} from '../src';

/*
 * Pacote FICTÍCIO (CLAUDE.md, regra 1): nomes de teste e números sem relação com composição real.
 */
const pacote = (extra: Partial<PacoteCuradoria> = {}): PacoteCuradoria => ({
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
      formaConservacao: 'outro',
      processamento: null,
      classe: 'outro',
      observacoes: null,
    },
  ],
  registros: [
    {
      alimento: 'a',
      referenciaLocal: 'Tabela fictícia 1',
      idadeCorteDias: null,
      classeIdadeFonte: null,
      separadorDecimal: 'ponto',
      observacoes: null,
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
          observacao: null,
        },
        {
          nutriente: 'TESTE_B',
          valorPublicado: '1.00',
          unidade: 'pct',
          base: 'ms',
          tipoValor: 'media',
          nObservacoes: null,
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
});
const catalogo = new Set(['TESTE_A', 'TESTE_B']);
const comValor = (v: Partial<PacoteCuradoria['registros'][number]['valores'][number]>) => {
  const p = pacote();
  return pacote({
    registros: [{ ...p.registros[0]!, valores: [{ ...p.registros[0]!.valores[0]!, ...v }] }],
  });
};

describe('pacote de curadoria (5B-2)', () => {
  it('pacote coerente não tem problemas e é contado', () => {
    expect(problemasDoPacote(pacote(), catalogo)).toEqual([]);
    expect(contarPacote(pacote())).toEqual({
      alimentos: 1,
      registros: 1,
      valores: 2,
      bloqueados: 0,
    });
  });

  it('número como publicado, com o separador da fonte, sem espaços e na faixa', () => {
    expect(problemasDoPacote(comValor({ valorPublicado: '10,50' }), catalogo)[0]).toMatch(
      /ponto decimal/,
    );
    expect(problemasDoPacote(comValor({ valorPublicado: 'ND' }), catalogo)).toHaveLength(1);
    expect(problemasDoPacote(comValor({ valorPublicado: ' 10.5' }), catalogo)[0]).toMatch(
      /espaços/,
    );
    expect(problemasDoPacote(comValor({ valorPublicado: '100.5' }), catalogo)[0]).toMatch(
      /fora da faixa/,
    );
    expect(problemasDoPacote(comValor({ nObservacoes: 0 }), catalogo)[0]).toMatch(/observações/);
  });

  it('base interpretada: null quando a fonte declara; se informada, com o motivo', () => {
    expect(
      problemasDoPacote(comValor({ interpretacaoBase: 'Motivo fictício.' }), catalogo),
    ).toEqual([]);
    expect(problemasDoPacote(comValor({ interpretacaoBase: '  ' }), catalogo)[0]).toMatch(
      /interpretação da base/,
    );
    expect(
      problemasDoPacote(comValor({ interpretacaoBase: 'x'.repeat(501) }), catalogo)[0],
    ).toMatch(/interpretação da base/);
  });

  it('definição precisa existir; valor repetido e registro sem valores são recusados', () => {
    expect(problemasDoPacote(comValor({ nutriente: 'TESTE_X' }), catalogo)[0]).toMatch(
      /definição inexistente/,
    );
    // Código sem diferença de maiúsculas.
    expect(problemasDoPacote(comValor({ nutriente: 'teste_a' }), catalogo)).toEqual([]);
    const p = pacote();
    const r = p.registros[0]!;
    expect(
      problemasDoPacote(
        pacote({ registros: [{ ...r, valores: [r.valores[0]!, r.valores[0]!] }] }),
        catalogo,
      )[0],
    ).toMatch(/repetido/);
    expect(
      problemasDoPacote(pacote({ registros: [{ ...r, valores: [] }] }), catalogo),
    ).toContainEqual(expect.stringMatching(/sem valores/));
  });

  it('alimento, referência e fonte coerentes', () => {
    const p = pacote();
    const r = p.registros[0]!;
    expect(
      problemasDoPacote(pacote({ registros: [{ ...r, alimento: 'x' }] }), catalogo),
    ).toContainEqual(expect.stringMatching(/alimento fora do pacote/));
    expect(
      problemasDoPacote(pacote({ registros: [{ ...r, referenciaLocal: ' ' }] }), catalogo)[0],
    ).toMatch(/página ou tabela/);
    expect(
      problemasDoPacote(
        pacote({ alimentos: [...p.alimentos, { ...p.alimentos[0]!, chave: 'b' }] }),
        catalogo,
      ),
    ).toEqual(
      expect.arrayContaining([
        'Nome de alimento repetido no pacote: Alimento de teste.',
        'Alimento sem registro no pacote: Alimento de teste.',
      ]),
    );
    expect(
      problemasDoPacote(pacote({ fonte: { ...p.fonte, autores: null as never } }), catalogo)[0],
    ).toMatch(/^Fonte: /);
    expect(problemasDoPacote(pacote({ transcritoPor: ' ' }), catalogo)[0]).toMatch(/transcreveu/);
    expect(problemasDoPacote(pacote({ codigo: 'com espaço' }), catalogo)[0]).toMatch(/Código/);
  });

  it('registro bloqueado fica no pacote, com motivo, e sai da contagem do que se importa', () => {
    const p = pacote();
    const r = p.registros[0]!;
    const comBloqueio = pacote({
      registros: [r, { ...r, referenciaLocal: 'Tabela fictícia 2', bloqueio: 'Motivo fictício.' }],
    });
    expect(problemasDoPacote(comBloqueio, catalogo)).toEqual([]);
    expect(contarPacote(comBloqueio)).toEqual({
      alimentos: 1,
      registros: 1,
      valores: 2,
      bloqueados: 1,
    });
    expect(
      problemasDoPacote(pacote({ registros: [{ ...r, bloqueio: ' ' }] }), catalogo)[0],
    ).toMatch(/motivo do bloqueio/);
  });

  it('vínculos declarados: registro importável do pacote, outra fonte, evidência, sem repetição', () => {
    const p = pacote();
    const r = p.registros[0]!;
    const base = {
      registro: r.referenciaLocal,
      outraFonte: 'OUTRA_FONTE',
      outroRegistro: 'Tabela fictícia 9',
      relacao: 'mesmos_valores' as const,
      evidencia: 'Evidência fictícia.',
    };
    expect(problemasDoPacote(pacote({ vinculos: [base] }), catalogo)).toEqual([]);
    const problemas = (v: Partial<typeof base>) =>
      problemasDoPacote(pacote({ vinculos: [{ ...base, ...v }] }), catalogo);
    expect(problemas({ registro: 'Tabela inexistente' })[0]).toMatch(/ausente ou bloqueado/);
    expect(problemas({ outraFonte: 'teste_fonte' })[0]).toMatch(/própria fonte/);
    expect(problemas({ evidencia: ' ' })[0]).toMatch(/evidência obrigatória/);
    expect(problemas({ relacao: 'parecido' as never })[0]).toMatch(/relação desconhecida/);
    expect(problemasDoPacote(pacote({ vinculos: [base, base] }), catalogo)).toContainEqual(
      expect.stringMatching(/repetido/),
    );
    expect(
      problemasDoPacote(
        pacote({ registros: [{ ...r, bloqueio: 'Motivo fictício.' }], vinculos: [base] }),
        catalogo,
      ),
    ).toContainEqual(expect.stringMatching(/ausente ou bloqueado/));
  });

  it('FDNcp é definição própria, sem método, direção pela regra do grupo, id seguinte', () => {
    expect(DEFINICOES_CURADORIA_5B).toEqual([
      {
        id: '01929c20-0000-7000-8000-000000000012',
        codigo: 'FDNcp',
        nome: 'Fibra em detergente neutro corrigida para cinzas e proteína',
        grupo: 'fibra',
        unidadeReferencia: 'pct',
        baseReferencia: 'ms',
        direcaoConservadora: direcaoSugeridaPorGrupo('fibra'),
        metodoAnalitico: null,
        situacaoFundamentacao: 'pendente',
        naturezaValor: 'fracao_massica',
      },
    ]);
    // Migration 0018: PBeqNNP, parcela de NNP contida na PB total; PB passa a equivalente proteico.
    expect(DEFINICOES_6B).toEqual([
      {
        id: '01929c20-0000-7000-8000-000000000013',
        codigo: 'PBeqNNP',
        nome: 'Proteína bruta equivalente de nitrogênio não proteico (N × 6,25)',
        grupo: 'proteina',
        unidadeReferencia: 'pct',
        baseReferencia: 'ms',
        direcaoConservadora: 'menor',
        metodoAnalitico: null,
        situacaoFundamentacao: 'pendente',
        naturezaValor: 'equivalente_proteico_nnp',
      },
    ]);
    expect(
      DEFINICOES_DO_SISTEMA.filter((d) => d.naturezaValor !== 'fracao_massica').map(
        (d) => d.codigo,
      ),
    ).toEqual(['PB', 'PBeqNNP']);
    expect(DEFINICOES_DO_SISTEMA).toEqual([
      ...DEFINICOES_INICIAIS_NUTRIENTES,
      ...DEFINICOES_CURADORIA_5B,
      ...DEFINICOES_6B,
    ]);
    expect(new Set(DEFINICOES_DO_SISTEMA.map((d) => d.codigo.toUpperCase())).size).toBe(
      DEFINICOES_DO_SISTEMA.length,
    );
  });

  it('todo pacote embutido é coerente com o catálogo do sistema', () => {
    const codigos = new Set(DEFINICOES_DO_SISTEMA.map((d) => d.codigo));
    for (const p of PACOTES_CURADORIA) expect(problemasDoPacote(p, codigos), p.codigo).toEqual([]);
  });
});
