import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DadosManejo, PesagemLote, Resultado } from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';

// "Hoje" nos testes: 15/10/2026. Limites de alerta definidos no próprio teste
// (critérios de conferência, não referência zootécnica).
let amb: AmbienteIpc;
let propriedadeId: string;

function codigo<T>(r: Resultado<T>): string | null {
  return r.ok ? null : r.erro.codigo;
}

async function criarLote(nome: string) {
  return amb.ok('lote:criar', {
    propriedadeId,
    dados: {
      nome,
      finalidade: 'recria',
      dataFormacao: '2026-01-01',
      areaId: null,
      observacoes: null,
    },
  });
}

async function criarAnimal(
  identificacao: string,
  opcoes: { loteId?: string | null; data?: string; peso?: number } = {},
) {
  return amb.ok('animal:criar', {
    propriedadeId,
    dados: {
      identificacao,
      nome: null,
      sexo: 'M',
      condicaoSexual: 'castrado',
      categoria: 'garrote',
      aptidao: 'corte',
      racaId: null,
      dataNascimento: null,
      dataNascimentoEstimada: false,
      maeId: null,
      paiId: null,
      origem: 'comprado',
      observacoes: null,
    },
    entrada: {
      data: opcoes.data ?? '2026-01-01',
      loteId: opcoes.loteId ?? null,
      pesoVivoKg: opcoes.peso ?? null,
      metodoPesagem: opcoes.peso ? 'balanca' : null,
    },
  });
}

function pesagem(data: string, pesoVivoKg: number) {
  return { data, pesoVivoKg, metodo: 'balanca' as const, observacao: null };
}

function manejo(extra: Partial<DadosManejo> = {}): DadosManejo {
  return {
    tipo: 'vacinacao',
    data: '2026-10-01',
    produtoId: null,
    descricao: 'Vacina informada pelo usuário',
    dose: null,
    unidadeDose: null,
    via: null,
    carenciaCarneDias: null,
    carenciaLeiteDias: null,
    responsavel: null,
    diagnostico: null,
    custoTotalCentavos: null,
    observacoes: null,
    ...extra,
  };
}

beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 15, 10, 0, 0) });
  const p = await amb.ok('propriedade:criar', {
    dados: {
      nome: 'Fazenda Fase 2',
      municipio: null,
      uf: null,
      areaTotalHa: null,
      tipoExploracao: 'corte',
      observacoes: null,
    },
  });
  propriedadeId = p.id;
  await amb.ok('configuracao:definir', {
    chave: 'alertas.pesagem',
    valor: { gmdMaximoKgDia: 2, gmdMinimoKgDia: 0 },
  });
});

afterEach(() => {
  amb.encerrar();
});

describe('pesagem individual: escore corporal, correção e conferência', () => {
  it('grava o escore na escala usada e recusa nota fora da escala ou sem escala', async () => {
    const a = await criarAnimal('A', { peso: 300 });
    const p = await amb.ok('pesagem:registrar', {
      animalId: a.id,
      dados: { ...pesagem('2026-02-01', 320), escoreCorporal: 3.5, escalaEcc: '1_5' },
    });
    expect(p).toMatchObject({ escoreCorporal: 3.5, escalaEcc: '1_5' });
    for (const ecc of [
      { escoreCorporal: 6, escalaEcc: '1_5' as const },
      { escoreCorporal: 3, escalaEcc: null },
    ]) {
      const r = await amb.chamar('pesagem:registrar', {
        animalId: a.id,
        dados: { ...pesagem('2026-03-01', 330), ...ecc },
      });
      expect(codigo(r)).toBe('ENTRADA_INVALIDA');
    }
  });

  it('correção de pesagem anterior exige motivo e fica na trilha com antes e depois', async () => {
    const a = await criarAnimal('A', { peso: 300 });
    const p = await amb.ok('pesagem:registrar', {
      animalId: a.id,
      dados: pesagem('2026-01-31', 360),
    });
    expect(
      codigo(
        await amb.chamar('pesagem:atualizar', {
          id: p.id,
          dados: pesagem('2026-01-31', 330),
          motivo: '',
        }),
      ),
    ).toBe('ENTRADA_INVALIDA');
    await amb.ok('pesagem:atualizar', {
      id: p.id,
      dados: pesagem('2026-01-31', 330),
      motivo: 'Erro de digitação',
    });
    const linha = amb.gerenciador.conexao
      .prepare(
        "SELECT dados_anteriores_json, dados_novos_json, motivo FROM historico_alteracao WHERE entidade_id = ? AND acao = 'alteracao'",
      )
      .get(p.id) as { dados_anteriores_json: string; dados_novos_json: string; motivo: string };
    expect(JSON.parse(linha.dados_anteriores_json)).toMatchObject({ pesoVivoKg: 360 });
    expect(JSON.parse(linha.dados_novos_json)).toMatchObject({ pesoVivoKg: 330 });
    expect(linha.motivo).toBe('Erro de digitação');
  });

  it('alerta de GMD atípico não bloqueia; a conferência fica auditada e cai se o valor mudar', async () => {
    const a = await criarAnimal('A', { peso: 300 });
    // (450 − 300) / 30 = 5 kg/dia, acima do limite de teste (2)
    const p = await amb.ok('pesagem:registrar', {
      animalId: a.id,
      dados: pesagem('2026-01-31', 450),
    });
    let lista = await amb.ok('pesagem:listar', { animalId: a.id });
    expect(lista.alertas.map((x) => [x.tipo, x.pesagemId])).toEqual([['gmd_acima', p.id]]);
    // Configuração gravada sem o campo novo recebe o valor inicial do intervalo curto.
    expect(lista.parametrosAlertas).toEqual({
      gmdMaximoKgDia: 2,
      gmdMinimoKgDia: 0,
      intervaloCurtoDias: 7,
    });
    expect(lista.alertas[0]).toMatchObject({ categoria: 'desempenho', intervaloCurto: false });

    let alertas = await amb.ok('pesagem:alertas', { propriedadeId });
    expect(alertas.itens).toHaveLength(1);
    expect(alertas.itens[0]!.animal.identificacao).toBe('A');

    expect(codigo(await amb.chamar('pesagem:conferir', { id: p.id, justificativa: ' ' }))).toBe(
      'ENTRADA_INVALIDA',
    );
    const conferida = await amb.ok('pesagem:conferir', {
      id: p.id,
      justificativa: 'Animal recém-chegado, pesado em jejum na entrada',
    });
    expect(conferida.conferidaEm).not.toBeNull();
    expect((await amb.ok('pesagem:alertas', { propriedadeId })).itens).toHaveLength(0);
    alertas = await amb.ok('pesagem:alertas', { propriedadeId, incluirConferidas: true });
    expect(alertas.itens[0]!.conferida).toBe(true);

    // Corrigir o valor descarta a conferência anterior.
    await amb.ok('pesagem:atualizar', {
      id: p.id,
      dados: pesagem('2026-01-31', 460),
      motivo: 'Releitura da balança',
    });
    lista = await amb.ok('pesagem:listar', { animalId: a.id });
    expect(lista.pesagens.find((x) => x.id === p.id)?.conferidaEm).toBeNull();
    expect((await amb.ok('pesagem:alertas', { propriedadeId })).itens).toHaveLength(1);

    const historico = await amb.ok('animal:historico', { id: a.id });
    expect(
      historico.eventos.some(
        (e) => e.tipo === 'alteracao' && e.entidade === 'pesagem' && e.acao === 'conferencia',
      ),
    ).toBe(true);
  });

  it('justificativa de uma pesagem retroativa encerra o alerta que ela cria com a seguinte', async () => {
    const pesarRetroativo = async (identificacao: string, justificativa: string | null) => {
      const a = await criarAnimal(identificacao, { peso: 300 });
      await amb.ok('pesagem:registrar', { animalId: a.id, dados: pesagem('2026-03-01', 330) });
      // 400 em 28/02 e 330 em 01/03: perda de 70 kg em 1 dia, alerta na pesagem de 01/03.
      await amb.ok('pesagem:registrar', {
        animalId: a.id,
        dados: pesagem('2026-02-28', 400),
        justificativa,
      });
      return a;
    };
    await pesarRetroativo('SEM', null);
    await pesarRetroativo('COM', 'Pesagem de 28/02 conferida no caderno de campo');
    const pendentes = await amb.ok('pesagem:alertas', { propriedadeId });
    expect(pendentes.itens.map((i) => [i.animal.identificacao, i.alerta.tipo])).toEqual([
      ['SEM', 'gmd_abaixo'],
    ]);
  });

  it('limites alterados nas configurações mudam os alertas; limites incoerentes são recusados', async () => {
    const a = await criarAnimal('A', { peso: 300 });
    await amb.ok('pesagem:registrar', { animalId: a.id, dados: pesagem('2026-01-31', 390) });
    expect((await amb.ok('pesagem:listar', { animalId: a.id })).alertas).toHaveLength(1);
    await amb.ok('configuracao:definir', {
      chave: 'alertas.pesagem',
      valor: { gmdMaximoKgDia: 4, gmdMinimoKgDia: null },
    });
    expect((await amb.ok('pesagem:listar', { animalId: a.id })).alertas).toHaveLength(0);
    expect(
      codigo(
        await amb.chamar('configuracao:definir', {
          chave: 'alertas.pesagem',
          valor: { gmdMaximoKgDia: 1, gmdMinimoKgDia: 2 },
        }),
      ),
    ).toBe('ENTRADA_INVALIDA');
  });
});

describe('pesagem em lote', () => {
  async function prepararLote() {
    const lote = await criarLote('Recria');
    const a = await criarAnimal('A', { loteId: lote.id, peso: 300 });
    const b = await criarAnimal('B', { loteId: lote.id, peso: 250 });
    const c = await criarAnimal('C', { loteId: lote.id });
    return { lote, a, b, c };
  }

  it('prévia mostra peso anterior e alertas por animal, sem gravar nada', async () => {
    const { a, b } = await prepararLote();
    const entrada: PesagemLote = {
      data: '2026-01-31',
      metodo: 'balanca',
      itens: [
        { animalId: a.id, pesoVivoKg: 330 },
        { animalId: b.id, pesoVivoKg: 28 }, // digitação: 280
      ],
    };
    const previa = await amb.ok('pesagem:registrarLote', {
      propriedadeId,
      pesagem: entrada,
      confirmar: false,
    });
    expect(previa).toMatchObject({ confirmado: false, comErro: 0, comAlerta: 1, gravadas: 0 });
    expect(previa.itens[0]).toMatchObject({
      identificacao: 'A',
      anterior: { data: '2026-01-01', pesoVivoKg: 300 },
      alertas: [],
    });
    expect(previa.itens[1]!.alertas[0]).toMatchObject({
      tipo: 'possivel_digitacao',
      pesoSugeridoKg: 280,
    });
    expect((await amb.ok('pesagem:listar', { animalId: a.id })).pesagens).toHaveLength(1);
  });

  it('com qualquer erro nada é gravado, e cada animal mostra seu problema', async () => {
    const { a, b, c } = await prepararLote();
    await amb.ok('pesagem:registrar', { animalId: c.id, dados: pesagem('2026-01-31', 200) });
    const r = await amb.ok('pesagem:registrarLote', {
      propriedadeId,
      pesagem: {
        data: '2026-01-31',
        metodo: 'balanca',
        itens: [
          { animalId: a.id, pesoVivoKg: 330 },
          { animalId: a.id, pesoVivoKg: 331 },
          { animalId: b.id, pesoVivoKg: 280, data: '2026-10-20' },
          { animalId: c.id, pesoVivoKg: 210 },
        ],
      },
      confirmar: true,
    });
    expect(r.confirmado).toBe(false);
    expect(r.gravadas).toBe(0);
    expect(r.itens.map((i) => i.erros.length > 0)).toEqual([false, true, true, true]);
    expect(r.itens[1]!.erros.join(' ')).toMatch(/repetido/);
    expect(r.itens[2]!.erros.join(' ')).toMatch(/futuro/);
    expect(r.itens[3]!.erros.join(' ')).toMatch(/Já existe uma pesagem/);
    expect((await amb.ok('pesagem:listar', { animalId: a.id })).pesagens).toHaveLength(1);
  });

  it('grava todos de uma vez, com data individual, escore e justificativa; animal não pesado não ganha peso', async () => {
    const { lote, a, b, c } = await prepararLote();
    const r = await amb.ok('pesagem:registrarLote', {
      propriedadeId,
      pesagem: {
        data: '2026-01-31',
        metodo: 'balanca',
        escalaEcc: '1_9',
        itens: [
          { animalId: a.id, pesoVivoKg: 330, escoreCorporal: 5 },
          {
            animalId: b.id,
            pesoVivoKg: 330,
            data: '2026-02-01',
            justificativa: 'Animal conferido no curral',
          },
        ],
      },
      confirmar: true,
    });
    expect(r).toMatchObject({ confirmado: true, gravadas: 2 });
    const pa = await amb.ok('pesagem:listar', { animalId: a.id });
    expect(pa.pesagens.at(-1)).toMatchObject({
      data: '2026-01-31',
      pesoVivoKg: 330,
      escoreCorporal: 5,
      escalaEcc: '1_9',
    });
    const pb = await amb.ok('pesagem:listar', { animalId: b.id });
    expect(pb.pesagens.at(-1)).toMatchObject({ data: '2026-02-01', pesoVivoKg: 330 });
    expect(pb.pesagens.at(-1)?.justificativaConferencia).toBe('Animal conferido no curral');
    // B: (330 − 250) / 31 ≈ 2,58 kg/dia, acima do limite, mas já conferido.
    expect((await amb.ok('pesagem:alertas', { propriedadeId })).itens).toHaveLength(0);
    expect((await amb.ok('pesagem:listar', { animalId: c.id })).pesagens).toHaveLength(0);

    const evolucao = await amb.ok('lote:evolucao', { id: lote.id });
    expect(evolucao.animais.map((x) => x.identificacao)).toEqual(['A', 'B', 'C']);
    expect(evolucao.analise.pontos.map((p) => [p.data, p.quantidade, p.mediaKg])).toEqual([
      ['2026-01-01', 2, 275],
      ['2026-01-31', 1, 330],
      ['2026-02-01', 1, 330],
    ]);
    expect(
      evolucao.analise.periodos.map((p) => [p.dataInicial, p.dataFinal, p.quantidade]),
    ).toEqual([
      ['2026-01-01', '2026-01-31', 1],
      ['2026-01-01', '2026-02-01', 1],
    ]);
    expect(evolucao.analise.resumo).toMatchObject({ quantidade: 2, gmdMinimoKgDia: 1 });
    expect(evolucao.animais[0]!.permanencias).toEqual([
      { inicio: '2026-01-01', fim: null, inicioEmTroca: false, fimEmTroca: false },
    ]);
    expect(evolucao.analise.pontos.map((p) => p.animaisNoLote)).toEqual([3, 3, 3]);

    const trilha = amb.gerenciador.conexao
      .prepare(
        "SELECT count(*) AS n FROM historico_alteracao WHERE entidade = 'pesagem' AND motivo = 'Pesagem em lote'",
      )
      .get() as { n: number };
    expect(trilha.n).toBe(2);
  });

  it('recusa entrada inválida no contrato: lista vazia, peso zero, escore sem escala', async () => {
    const { a } = await prepararLote();
    for (const pesagemLote of [
      { data: '2026-01-31', metodo: 'balanca' as const, itens: [] },
      {
        data: '2026-01-31',
        metodo: 'balanca' as const,
        itens: [{ animalId: a.id, pesoVivoKg: 0 }],
      },
      {
        data: '2026-01-31',
        metodo: 'balanca' as const,
        itens: [{ animalId: a.id, pesoVivoKg: 300, escoreCorporal: 3 }],
      },
    ]) {
      expect(
        codigo(
          await amb.chamar('pesagem:registrarLote', {
            propriedadeId,
            pesagem: pesagemLote,
            confirmar: true,
          }),
        ),
      ).toBe('ENTRADA_INVALIDA');
    }
  });
});

describe('evolução histórica do lote (transferências e saídas)', () => {
  async function pesar(animalId: string, data: string, peso: number) {
    await amb.ok('pesagem:registrar', { animalId, dados: pesagem(data, peso) });
  }

  /**
   * X: entra no lote A em 01/01, vai para B em 01/03 (pesado no dia da troca).
   * Y: sempre em B. Z: no lote A, vendido em 15/02.
   * W: entra no rebanho sem lote, pesado em 01/01, entra em A em 01/02.
   */
  async function prepararHistorico() {
    const loteA = await criarLote('Lote A');
    const loteB = await criarLote('Lote B');
    const x = await criarAnimal('X', { loteId: loteA.id, peso: 300 });
    const y = await criarAnimal('Y', { loteId: loteB.id, peso: 250 });
    const z = await criarAnimal('Z', { loteId: loteA.id, peso: 310 });
    const w = await criarAnimal('W', { peso: 280 });
    await pesar(x.id, '2026-01-31', 330);
    await pesar(y.id, '2026-01-31', 280);
    await pesar(z.id, '2026-01-31', 340);
    await amb.ok('animal:transferir', {
      animalIds: [w.id],
      loteDestinoId: loteA.id,
      data: '2026-02-01',
      motivo: null,
    });
    await pesar(z.id, '2026-02-15', 355);
    await amb.ok('animal:registrarSaida', {
      id: z.id,
      tipo: 'vendido',
      data: '2026-02-15',
      motivo: null,
    });
    await pesar(w.id, '2026-02-20', 300);
    await amb.ok('animal:transferir', {
      animalIds: [x.id],
      loteDestinoId: loteB.id,
      data: '2026-03-01',
      motivo: 'Mudança de fase',
    });
    await pesar(x.id, '2026-03-01', 360);
    await pesar(x.id, '2026-03-31', 390);
    await pesar(y.id, '2026-03-31', 340);
    return { loteA, loteB, x, y, z, w };
  }

  it('lote de destino não recebe pesagens de antes da transferência', async () => {
    const { loteB, x } = await prepararHistorico();
    const e = await amb.ok('lote:evolucao', { id: loteB.id });
    expect(e.semReconstrucao).toEqual([]);
    expect(e.animais.map((a) => [a.identificacao, a.noLoteAgora])).toEqual([
      ['X', true],
      ['Y', true],
    ]);
    expect(e.analise.pontos.map((p) => [p.data, p.quantidade, p.animaisNoLote, p.mediaKg])).toEqual(
      [
        ['2026-01-01', 1, 1, 250],
        ['2026-01-31', 1, 1, 280],
        ['2026-03-01', 1, 2, 360],
        ['2026-03-31', 2, 2, 365],
      ],
    );
    expect(e.analise.pontos[2]!.noDiaDaTroca).toBe(1);
    const animalX = e.animais.find((a) => a.id === x.id)!;
    expect(animalX.trechos).toHaveLength(1);
    expect(animalX.trechos[0]!.map((p) => p.data)).toEqual(['2026-03-01', '2026-03-31']);
    expect(animalX.pesagensForaDoLote).toBe(2);
    // Nenhum período de X atravessa a transferência.
    expect(
      e.analise.periodos.filter((p) => p.dataInicial < '2026-03-01' && p.dataFinal >= '2026-03-01'),
    ).toEqual([
      expect.objectContaining({
        dataInicial: '2026-01-31',
        dataFinal: '2026-03-31',
        quantidade: 1,
      }),
    ]); // só Y, que já estava em B
  });

  it('lote de origem mantém ex-integrantes (transferidos e vendidos) só até a saída', async () => {
    const { loteA, x, z, w } = await prepararHistorico();
    const e = await amb.ok('lote:evolucao', { id: loteA.id });
    expect(e.animais.map((a) => [a.identificacao, a.status, a.noLoteAgora])).toEqual([
      ['W', 'ativo', true],
      ['X', 'ativo', false],
      ['Z', 'vendido', false],
    ]);
    expect(e.analise.pontos.map((p) => [p.data, p.quantidade, p.animaisNoLote, p.mediaKg])).toEqual(
      [
        ['2026-01-01', 2, 2, 305], // X 300 e Z 310; W ainda não estava em A
        ['2026-01-31', 2, 2, 335],
        ['2026-02-15', 1, 3, 355], // Z no dia da venda; W e X no lote, sem pesagem
        ['2026-02-20', 1, 2, 300], // Z já vendido
        ['2026-03-01', 1, 2, 360], // X no dia da troca
      ],
    );
    const animalW = e.animais.find((a) => a.id === w.id)!;
    expect(animalW.permanencias).toEqual([
      { inicio: '2026-02-01', fim: null, inicioEmTroca: true, fimEmTroca: false },
    ]);
    expect(animalW.pesagensForaDoLote).toBe(1); // 01/01, antes de entrar em A
    expect(e.animais.find((a) => a.id === z.id)!.permanencias).toEqual([
      { inicio: '2026-01-01', fim: '2026-02-15', inicioEmTroca: false, fimEmTroca: false },
    ]);
    expect(e.animais.find((a) => a.id === x.id)!.permanencias[0]).toMatchObject({
      fim: '2026-03-01',
      fimEmTroca: true,
    });
    expect(e.analise.pesagensNoDiaDaTroca).toBe(1);
  });

  it('o histórico individual continua completo na ficha do animal', async () => {
    const { x } = await prepararHistorico();
    const p = await amb.ok('pesagem:listar', { animalId: x.id });
    expect(p.pesagens.map((x) => x.data)).toEqual([
      '2026-01-01',
      '2026-01-31',
      '2026-03-01',
      '2026-03-31',
    ]);
    expect(p.gmd.intervalos).toHaveLength(3);
  });

  it('histórico de movimentações inconsistente: animal fora das médias, com o motivo', async () => {
    const { loteA, loteB, y } = await prepararHistorico();
    // Simula um banco com o lote atual divergente do histórico (sem movimentação).
    amb.gerenciador.conexao
      .prepare('UPDATE animal SET lote_id = ? WHERE id = ?')
      .run(loteA.id, y.id);
    const a = await amb.ok('lote:evolucao', { id: loteA.id });
    expect(a.semReconstrucao.map((s) => s.identificacao)).toEqual(['Y']);
    expect(a.semReconstrucao[0]!.motivo).toMatch(/não confere/);
    expect(a.animais.map((x) => x.identificacao)).not.toContain('Y');
    const b = await amb.ok('lote:evolucao', { id: loteB.id });
    expect(b.semReconstrucao.map((s) => s.identificacao)).toEqual(['Y']);
    expect(b.analise.pontos.map((p) => [p.data, p.quantidade])).toEqual([
      ['2026-03-01', 1],
      ['2026-03-31', 1],
    ]);
  });
});

describe('sanidade', () => {
  it('cadastro de produtos: nome único e exclusão bloqueada quando em uso', async () => {
    const dados = {
      nome: 'Produto X',
      tipo: 'vacina' as const,
      fabricante: null,
      principioAtivo: null,
      unidadeDose: 'ml' as const,
      carenciaCarneDias: 0,
      carenciaLeiteDias: null,
      observacoes: null,
    };
    const p = await amb.ok('produtoSanitario:criar', { dados });
    expect(
      codigo(
        await amb.chamar('produtoSanitario:criar', { dados: { ...dados, nome: ' produto  x ' } }),
      ),
    ).toBe('DUPLICADO');
    const a = await criarAnimal('A');
    await amb.ok('manejoSanitario:registrar', {
      propriedadeId,
      dados: manejo({ produtoId: p.id, descricao: null }),
      animais: [{ animalId: a.id }],
    });
    expect(codigo(await amb.chamar('produtoSanitario:excluir', { id: p.id }))).toBe(
      'OPERACAO_INVALIDA',
    );
    expect((await amb.ok('produtoSanitario:listar', {}))[0]!.usos).toBe(1);
  });

  it('vacinação coletiva do lote cria um evento por animal e entra no histórico de cada um', async () => {
    const lote = await criarLote('Engorda');
    const animais = await Promise.all(
      ['V1', 'V2', 'V3'].map((id) => criarAnimal(id, { loteId: lote.id })),
    );
    const registro = await amb.ok('manejoSanitario:registrar', {
      propriedadeId,
      dados: manejo({ dose: 2, unidadeDose: 'ml', via: 'subcutanea', custoTotalCentavos: 4500 }),
      animais: animais.map((a) => ({ animalId: a.id })),
      loteId: lote.id,
    });
    expect(registro).toMatchObject({
      abrangencia: 'coletiva',
      quantidadeAnimais: 3,
      lote: { nome: 'Engorda' },
      custoTotalCentavos: 4500,
    });
    for (const a of animais) {
      const s = await amb.ok('sanidade:doAnimal', { animalId: a.id });
      expect(s.eventos).toHaveLength(1);
      expect(s.eventos[0]).toMatchObject({ tipo: 'vacinacao', dose: 2, unidadeDose: 'ml' });
      const h = await amb.ok('animal:historico', { id: a.id });
      expect(h.eventos.some((e) => e.tipo === 'sanidade')).toBe(true);
    }
    const lista = await amb.ok('manejoSanitario:listar', {
      propriedadeId,
      filtros: { loteId: lote.id },
    });
    expect(lista.total).toBe(1);
  });

  it('tudo ou nada: um animal inválido impede o registro de todos', async () => {
    const a = await criarAnimal('A', { data: '2026-01-01' });
    const b = await criarAnimal('B', { data: '2026-10-05' });
    const r = await amb.chamar('manejoSanitario:registrar', {
      propriedadeId,
      dados: manejo({ data: '2026-10-01' }),
      animais: [{ animalId: a.id }, { animalId: b.id }],
    });
    expect(codigo(r)).toBe('ENTRADA_INVALIDA');
    expect(r.ok ? [] : r.erro.detalhes).toEqual([
      'B: a aplicação é anterior à entrada do animal (05/10/2026).',
    ]);
    expect((await amb.ok('sanidade:doAnimal', { animalId: a.id })).eventos).toHaveLength(0);
  });

  it('recusa data futura, dose sem unidade e animal repetido', async () => {
    const a = await criarAnimal('A');
    const casos = [
      { dados: manejo({ data: '2026-10-16' }), animais: [{ animalId: a.id }] },
      { dados: manejo({ dose: 5 }), animais: [{ animalId: a.id }] },
      { dados: manejo(), animais: [{ animalId: a.id, dose: 3 }] },
      { dados: manejo(), animais: [{ animalId: a.id }, { animalId: a.id }] },
      { dados: manejo({ descricao: null }), animais: [{ animalId: a.id }] },
    ];
    for (const caso of casos) {
      expect(
        codigo(await amb.chamar('manejoSanitario:registrar', { propriedadeId, ...caso })),
      ).toBe('ENTRADA_INVALIDA');
    }
  });

  it('carência informada vira fim de prazo calculado; animal em carência aparece no resumo', async () => {
    const a = await criarAnimal('A');
    await amb.ok('manejoSanitario:registrar', {
      propriedadeId,
      dados: manejo({
        tipo: 'tratamento',
        data: '2026-10-10',
        descricao: 'Tratamento indicado pelo veterinário',
        carenciaCarneDias: 30,
        carenciaLeiteDias: 4,
      }),
      animais: [{ animalId: a.id }],
    });
    const s = await amb.ok('sanidade:doAnimal', { animalId: a.id });
    expect(s.eventos[0]).toMatchObject({
      fimCarenciaCarne: '2026-11-09',
      fimCarenciaLeite: '2026-10-14',
    });
    expect(s.carenciaCarne?.fimPrazo).toBe('2026-11-09');
    expect(s.carenciaLeite).toBeNull(); // prazo informado terminou em 14/10, hoje é 15/10
    const resumo = await amb.ok('sanidade:resumo', { propriedadeId });
    expect(resumo.emCarencia).toHaveLength(1);
    expect(resumo.emCarencia[0]).toMatchObject({ identificacao: 'A', leite: null });
  });

  it('próxima aplicação vai para a agenda; registrar pela agenda conclui; excluir o registro reabre', async () => {
    const lote = await criarLote('Cria');
    const a = await criarAnimal('A', { loteId: lote.id });
    const primeira = await amb.ok('manejoSanitario:registrar', {
      propriedadeId,
      dados: manejo({ data: '2026-09-01' }),
      animais: [{ animalId: a.id }],
      loteId: lote.id,
      proximaAplicacao: { data: '2026-10-01', observacoes: 'Reforço' },
    });
    expect(primeira.proximaAgendada).toMatchObject({
      dataPrevista: '2026-10-01',
      situacao: 'atrasado',
      lote: { nome: 'Cria' },
    });
    let resumo = await amb.ok('sanidade:resumo', { propriedadeId });
    expect(resumo).toMatchObject({ agendaAtrasada: 1, agendaProxima: 0 });
    expect((await amb.ok('sanidade:doAnimal', { animalId: a.id })).agenda).toHaveLength(1);

    const agendaId = primeira.proximaAgendada!.id;
    const segunda = await amb.ok('manejoSanitario:registrar', {
      propriedadeId,
      dados: manejo({ data: '2026-10-14' }),
      animais: [{ animalId: a.id }],
      loteId: lote.id,
      agendaId,
    });
    resumo = await amb.ok('sanidade:resumo', { propriedadeId });
    expect(resumo.agendaAtrasada).toBe(0);
    let agenda = await amb.ok('agendaSanitaria:listar', { propriedadeId, incluirConcluidos: true });
    expect(agenda.find((x) => x.id === agendaId)).toMatchObject({
      status: 'realizado',
      manejoRealizadoId: segunda.id,
    });
    expect(
      codigo(
        await amb.chamar('manejoSanitario:registrar', {
          propriedadeId,
          dados: manejo({ data: '2026-10-14' }),
          animais: [{ animalId: a.id }],
          agendaId,
        }),
      ),
    ).toBe('ENTRADA_INVALIDA');

    await amb.ok('manejoSanitario:excluir', { id: segunda.id, motivo: 'Lançado em duplicidade' });
    agenda = await amb.ok('agendaSanitaria:listar', { propriedadeId });
    expect(agenda.map((x) => [x.id, x.status])).toEqual([[agendaId, 'pendente']]);
  });

  it('agenda: criação, antecedência configurável, alteração e cancelamento com motivo', async () => {
    const item = await amb.ok('agendaSanitaria:criar', {
      propriedadeId,
      dados: {
        dataPrevista: '2026-10-20',
        tipo: 'vermifugacao',
        produtoId: null,
        descricao: 'Vermifugação do rebanho',
        loteId: null,
        animalId: null,
        observacoes: null,
      },
    });
    expect(item.situacao).toBe('proximo');
    await amb.ok('configuracao:definir', {
      chave: 'alertas.sanidade',
      valor: { antecedenciaDias: 2 },
    });
    expect((await amb.ok('agendaSanitaria:listar', { propriedadeId }))[0]!.situacao).toBe('futuro');
    amb.definirHoje(new Date(2026, 9, 21, 10, 0, 0));
    expect((await amb.ok('agendaSanitaria:listar', { propriedadeId }))[0]!.situacao).toBe(
      'atrasado',
    );
    expect(codigo(await amb.chamar('agendaSanitaria:cancelar', { id: item.id, motivo: '' }))).toBe(
      'ENTRADA_INVALIDA',
    );
    const cancelado = await amb.ok('agendaSanitaria:cancelar', {
      id: item.id,
      motivo: 'Veterinário adiou para o próximo mês',
    });
    expect(cancelado).toMatchObject({ status: 'cancelado', situacao: null });
    expect(await amb.ok('agendaSanitaria:listar', { propriedadeId })).toHaveLength(0);
  });

  it('correção do registro exige motivo; remover um animal fica no histórico dele', async () => {
    const a = await criarAnimal('A');
    const b = await criarAnimal('B');
    const r = await amb.ok('manejoSanitario:registrar', {
      propriedadeId,
      dados: manejo(),
      animais: [{ animalId: a.id }, { animalId: b.id }],
    });
    expect(
      codigo(
        await amb.chamar('manejoSanitario:atualizar', {
          id: r.id,
          dados: manejo({ responsavel: 'João' }),
          motivo: '',
        }),
      ),
    ).toBe('ENTRADA_INVALIDA');
    await amb.ok('manejoSanitario:atualizar', {
      id: r.id,
      dados: manejo({ responsavel: 'João' }),
      motivo: 'Faltou o responsável',
    });
    const semB = await amb.ok('manejoSanitario:removerAnimal', {
      manejoId: r.id,
      animalId: b.id,
      motivo: 'B não estava no curral',
    });
    expect(semB.animais.map((x) => x.identificacao)).toEqual(['A']);
    expect(
      codigo(
        await amb.chamar('manejoSanitario:removerAnimal', {
          manejoId: r.id,
          animalId: a.id,
          motivo: 'teste',
        }),
      ),
    ).toBe('OPERACAO_INVALIDA');
    expect((await amb.ok('sanidade:doAnimal', { animalId: b.id })).eventos).toHaveLength(0);
    const hb = await amb.ok('animal:historico', { id: b.id });
    expect(
      hb.eventos.find((e) => e.tipo === 'alteracao' && e.acao === 'remocao_animal'),
    ).toMatchObject({ motivo: 'B não estava no curral', dataReferencia: '2026-10-01' });
    const ha = await amb.ok('animal:historico', { id: a.id });
    expect(
      ha.eventos.find((e) => e.tipo === 'alteracao' && e.entidade === 'manejo_sanitario'),
    ).toMatchObject({ motivo: 'Faltou o responsável' });
  });
});

describe('persistência e integridade', () => {
  it('pesagens em lote, registros sanitários e agenda continuam lá depois de reiniciar', async () => {
    const lote = await criarLote('L');
    const a = await criarAnimal('A', { loteId: lote.id, peso: 300 });
    await amb.ok('pesagem:registrarLote', {
      propriedadeId,
      pesagem: { data: '2026-02-01', metodo: 'fita', itens: [{ animalId: a.id, pesoVivoKg: 320 }] },
      confirmar: true,
    });
    await amb.ok('manejoSanitario:registrar', {
      propriedadeId,
      dados: manejo(),
      animais: [{ animalId: a.id }],
      proximaAplicacao: { data: '2026-12-01' },
    });

    await amb.reiniciar();

    const pesagens = await amb.ok('pesagem:listar', { animalId: a.id });
    expect(pesagens.pesagens.map((p) => [p.pesoVivoKg, p.metodo])).toEqual([
      [300, 'balanca'],
      [320, 'fita'],
    ]);
    expect(pesagens.gmd.periodoTotal?.estimado).toBe(true);
    expect((await amb.ok('sanidade:doAnimal', { animalId: a.id })).eventos).toHaveLength(1);
    expect(await amb.ok('agendaSanitaria:listar', { propriedadeId })).toHaveLength(1);
    expect(amb.gerenciador.conexao.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(amb.gerenciador.conexao.pragma('foreign_key_check')).toEqual([]);
  });
});
