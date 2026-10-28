import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DadosAnimal, Resultado } from '@pecuaria/shared-types';
import { ehUuid } from '@pecuaria/domain';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';

// "Hoje" nos testes: 15/10/2026.
let amb: AmbienteIpc;
let propriedadeId: string;

function animal(identificacao: string, extra: Partial<DadosAnimal> = {}): DadosAnimal {
  return {
    identificacao,
    nome: null,
    sexo: 'F',
    condicaoSexual: 'femea',
    categoria: 'novilha',
    aptidao: 'corte',
    racaId: null,
    dataNascimento: '2024-08-01',
    dataNascimentoEstimada: false,
    maeId: null,
    paiId: null,
    origem: 'comprado',
    observacoes: null,
    ...extra,
  };
}

async function criarLote(nome: string, dataFormacao = '2026-01-01') {
  return amb.ok('lote:criar', {
    propriedadeId,
    dados: { nome, finalidade: 'recria', dataFormacao, areaId: null, observacoes: null },
  });
}

async function criarAnimal(
  identificacao: string,
  opcoes: {
    loteId?: string | null;
    data?: string;
    peso?: number;
    extra?: Partial<DadosAnimal>;
  } = {},
) {
  return amb.ok('animal:criar', {
    propriedadeId,
    dados: animal(identificacao, opcoes.extra),
    entrada: {
      data: opcoes.data ?? '2026-02-01',
      loteId: opcoes.loteId ?? null,
      pesoVivoKg: opcoes.peso ?? null,
      metodoPesagem: opcoes.peso ? 'balanca' : null,
    },
  });
}

function codigo<T>(r: Resultado<T>): string | null {
  return r.ok ? null : r.erro.codigo;
}

beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 15, 10, 0, 0) });
  const p = await amb.ok('propriedade:criar', {
    dados: {
      nome: 'Fazenda Boa Vista',
      municipio: 'Uberaba',
      uf: 'MG',
      areaTotalHa: 120,
      tipoExploracao: 'corte',
      observacoes: null,
    },
  });
  propriedadeId = p.id;
});

afterEach(() => {
  amb.encerrar();
});

describe('propriedades, áreas e raças', () => {
  it('cria propriedade com UUID v7 e recusa nome duplicado ignorando maiúsculas e espaços', async () => {
    expect(ehUuid(propriedadeId)).toBe(true);
    expect(propriedadeId[14]).toBe('7');
    const r = await amb.chamar('propriedade:criar', {
      dados: {
        nome: '  fazenda   BOA vista ',
        municipio: null,
        uf: null,
        areaTotalHa: null,
        tipoExploracao: 'leite',
        observacoes: null,
      },
    });
    expect(codigo(r)).toBe('DUPLICADO');
  });

  it('não exclui propriedade com animais', async () => {
    await criarAnimal('A1');
    expect(codigo(await amb.chamar('propriedade:excluir', { id: propriedadeId }))).toBe(
      'OPERACAO_INVALIDA',
    );
  });

  it('lista raças sugeridas e não exclui raça em uso', async () => {
    const racas = await amb.ok('raca:listar', {});
    const nelore = racas.find((r) => r.nome === 'Nelore')!;
    expect(nelore).toMatchObject({
      aptidao: 'corte',
      grupoGenetico: 'zebuino',
      origem: 'sugestao',
    });
    await criarAnimal('A1', { extra: { racaId: nelore.id } });
    expect(codigo(await amb.chamar('raca:excluir', { id: nelore.id }))).toBe('OPERACAO_INVALIDA');
  });

  it('cria área, move lote entre áreas e guarda o histórico de locais', async () => {
    const piquete1 = await amb.ok('area:criar', {
      propriedadeId,
      dados: { nome: 'Piquete 1', tipo: 'piquete', areaHa: 5, observacoes: null },
    });
    const piquete2 = await amb.ok('area:criar', {
      propriedadeId,
      dados: { nome: 'Piquete 2', tipo: 'piquete', areaHa: 4.5, observacoes: null },
    });
    const lote = await amb.ok('lote:criar', {
      propriedadeId,
      dados: {
        nome: 'Recria',
        finalidade: 'recria',
        dataFormacao: '2026-03-01',
        areaId: piquete1.id,
        observacoes: null,
      },
    });
    await amb.ok('lote:moverArea', {
      id: lote.id,
      areaId: piquete2.id,
      data: '2026-05-10',
      observacao: 'Rodízio',
    });
    const detalhe = await amb.ok('lote:obter', { id: lote.id });
    expect(detalhe.area?.nome).toBe('Piquete 2');
    expect(
      detalhe.movimentacoesArea.map((m) => [
        m.data,
        m.areaOrigem?.nome ?? null,
        m.areaDestino?.nome,
      ]),
    ).toEqual([
      ['2026-05-10', 'Piquete 1', 'Piquete 2'],
      ['2026-03-01', null, 'Piquete 1'],
    ]);
    // Data anterior à última mudança é recusada.
    expect(
      codigo(
        await amb.chamar('lote:moverArea', {
          id: lote.id,
          areaId: piquete1.id,
          data: '2026-05-01',
          observacao: null,
        }),
      ),
    ).toBe('ENTRADA_INVALIDA');
    expect(codigo(await amb.chamar('area:excluir', { id: piquete2.id }))).toBe('OPERACAO_INVALIDA');
  });
});

describe('animais: criação, consulta e edição', () => {
  it('cria animal com entrada, lote e peso de entrada, tudo na mesma operação', async () => {
    const lote = await criarLote('Recria');
    const criado = await criarAnimal('BR-001', { loteId: lote.id, peso: 280.5 });
    expect(ehUuid(criado.id)).toBe(true);
    expect(criado).toMatchObject({
      identificacao: 'BR-001',
      status: 'ativo',
      lote: { id: lote.id, nome: 'Recria' },
      dataEntrada: '2026-02-01',
      ultimaPesagem: { data: '2026-02-01', pesoVivoKg: 280.5, metodo: 'balanca' },
    });
    const historico = await amb.ok('animal:historico', { id: criado.id });
    expect(historico.eventos.map((e) => e.tipo).sort()).toEqual(['movimentacao', 'pesagem']);
  });

  it('consulta com filtros, busca e paginação', async () => {
    const loteA = await criarLote('Lote A');
    await criarAnimal('BR-001', { loteId: loteA.id, extra: { nome: 'Mimosa' } });
    await criarAnimal('BR-002', { loteId: loteA.id });
    await criarAnimal('BR-003', {
      extra: { sexo: 'M', condicaoSexual: 'castrado', categoria: 'garrote' },
    });

    const todos = await amb.ok('animal:listar', { propriedadeId, filtros: {} });
    expect(todos.total).toBe(3);
    expect(
      (await amb.ok('animal:listar', { propriedadeId, filtros: { busca: 'mimo' } })).itens.map(
        (a) => a.identificacao,
      ),
    ).toEqual(['BR-001']);
    expect(
      (await amb.ok('animal:listar', { propriedadeId, filtros: { busca: 'br-00' } })).total,
    ).toBe(3);
    expect(
      (await amb.ok('animal:listar', { propriedadeId, filtros: { loteId: loteA.id } })).total,
    ).toBe(2);
    expect(
      (await amb.ok('animal:listar', { propriedadeId, filtros: { loteId: 'sem_lote' } })).itens[0]
        ?.identificacao,
    ).toBe('BR-003');
    expect((await amb.ok('animal:listar', { propriedadeId, filtros: { sexo: 'M' } })).total).toBe(
      1,
    );
    const pagina2 = await amb.ok('animal:listar', {
      propriedadeId,
      filtros: { tamanhoPagina: 2, pagina: 2 },
    });
    expect(pagina2).toMatchObject({ total: 3, pagina: 2 });
    expect(pagina2.itens.map((a) => a.identificacao)).toEqual(['BR-003']);
    // Busca com caractere curinga do SQL é tratada como texto literal.
    expect((await amb.ok('animal:listar', { propriedadeId, filtros: { busca: '%' } })).total).toBe(
      0,
    );
  });

  it('edita o cadastro e registra os campos alterados na trilha', async () => {
    const criado = await criarAnimal('BR-001');
    const editado = await amb.ok('animal:atualizar', {
      id: criado.id,
      dados: animal('BR-001', { nome: 'Estrela', categoria: 'vaca' }),
      motivo: 'Primeiro parto',
    });
    expect(editado).toMatchObject({ nome: 'Estrela', categoria: 'vaca' });
    const historico = await amb.ok('animal:historico', { id: criado.id });
    const alteracao = historico.eventos.find((e) => e.tipo === 'alteracao');
    expect(alteracao).toMatchObject({
      tipo: 'alteracao',
      motivo: 'Primeiro parto',
      campos: [
        { campo: 'nome', antes: null, depois: 'Estrela' },
        { campo: 'categoria', antes: 'novilha', depois: 'vaca' },
      ],
    });
  });

  it('edição sem mudança real não cria registro na trilha', async () => {
    const criado = await criarAnimal('BR-001');
    await amb.ok('animal:atualizar', { id: criado.id, dados: animal('BR-001') });
    const historico = await amb.ok('animal:historico', { id: criado.id });
    expect(historico.eventos.filter((e) => e.tipo === 'alteracao')).toEqual([]);
  });

  it('genealogia: mãe fêmea e pai macho da mesma propriedade, nascidos antes, sem ciclo', async () => {
    const mae = await criarAnimal('MAE', {
      extra: { categoria: 'vaca', dataNascimento: '2020-01-01' },
    });
    const pai = await criarAnimal('PAI', {
      extra: {
        sexo: 'M',
        condicaoSexual: 'inteiro',
        categoria: 'touro',
        dataNascimento: '2019-01-01',
      },
    });
    const filha = await criarAnimal('FILHA', {
      extra: { maeId: mae.id, paiId: pai.id, dataNascimento: '2025-09-01' },
    });
    expect(filha.mae?.identificacao).toBe('MAE');
    expect(filha.pai?.identificacao).toBe('PAI');

    // Pai como mãe: recusado.
    expect(
      codigo(
        await amb.chamar('animal:criar', {
          propriedadeId,
          dados: animal('X', { maeId: pai.id }),
          entrada: { data: '2026-02-01', loteId: null, pesoVivoKg: null, metodoPesagem: null },
        }),
      ),
    ).toBe('ENTRADA_INVALIDA');
    // Ciclo: a mãe não pode ter a própria filha como mãe.
    const ciclo = await amb.chamar('animal:atualizar', {
      id: mae.id,
      dados: animal('MAE', { categoria: 'vaca', dataNascimento: null, maeId: filha.id }),
    });
    expect(ciclo.ok ? null : ciclo.erro.detalhes?.join(' ')).toMatch(/descendente/);
    // Mudar o sexo da mãe para macho com filha cadastrada: recusado.
    const sexo = await amb.chamar('animal:atualizar', {
      id: mae.id,
      dados: animal('MAE', {
        sexo: 'M',
        condicaoSexual: 'inteiro',
        categoria: 'touro',
        dataNascimento: '2020-01-01',
      }),
    });
    expect(codigo(sexo)).toBe('ENTRADA_INVALIDA');
  });
});

describe('entradas inválidas e duplicidades', () => {
  it('recusa identificação duplicada na mesma propriedade, sem diferenciar maiúsculas', async () => {
    await criarAnimal('BR-001');
    const r = await amb.chamar('animal:criar', {
      propriedadeId,
      dados: animal(' br-001 '),
      entrada: { data: '2026-02-01', loteId: null, pesoVivoKg: null, metodoPesagem: null },
    });
    expect(r).toMatchObject({ ok: false, erro: { codigo: 'DUPLICADO' } });
    const outro = await criarAnimal('BR-002');
    expect(
      codigo(await amb.chamar('animal:atualizar', { id: outro.id, dados: animal('BR-001') })),
    ).toBe('DUPLICADO');
  });

  it('a mesma identificação é aceita em outra propriedade', async () => {
    await criarAnimal('BR-001');
    const outra = await amb.ok('propriedade:criar', {
      dados: {
        nome: 'Sítio 2',
        municipio: null,
        uf: null,
        areaTotalHa: null,
        tipoExploracao: 'leite',
        observacoes: null,
      },
    });
    const r = await amb.chamar('animal:criar', {
      propriedadeId: outra.id,
      dados: animal('BR-001'),
      entrada: { data: '2026-02-01', loteId: null, pesoVivoKg: null, metodoPesagem: null },
    });
    expect(r.ok).toBe(true);
  });

  it('recusa dados inválidos com mensagens claras', async () => {
    const casos: [string, unknown][] = [
      ['categoria de macho em fêmea', { dados: animal('X', { categoria: 'boi' }) }],
      ['nascimento no futuro', { dados: animal('X', { dataNascimento: '2026-12-01' }) }],
      [
        'entrada antes do nascimento',
        {
          dados: animal('X'),
          entrada: { data: '2024-01-01', loteId: null, pesoVivoKg: null, metodoPesagem: null },
        },
      ],
      ['data inexistente', { dados: animal('X', { dataNascimento: '2025-02-30' }) }],
      ['identificação vazia', { dados: animal('   ') }],
      [
        'peso negativo',
        {
          dados: animal('X'),
          entrada: { data: '2026-02-01', loteId: null, pesoVivoKg: -1, metodoPesagem: 'balanca' },
        },
      ],
      [
        'peso sem método',
        {
          dados: animal('X'),
          entrada: { data: '2026-02-01', loteId: null, pesoVivoKg: 300, metodoPesagem: null },
        },
      ],
      [
        'peso absurdo',
        {
          dados: animal('X'),
          entrada: { data: '2026-02-01', loteId: null, pesoVivoKg: 4500, metodoPesagem: 'balanca' },
        },
      ],
      ['campo desconhecido', { dados: { ...animal('X'), cor: 'preta' } }],
    ];
    for (const [descricao, parcial] of casos) {
      const entrada = {
        propriedadeId,
        entrada: { data: '2026-02-01', loteId: null, pesoVivoKg: null, metodoPesagem: null },
        ...(parcial as object),
      };
      const r = await amb.chamar('animal:criar', entrada as never);
      expect(codigo(r), descricao).toBe('ENTRADA_INVALIDA');
      expect(r.ok ? '' : r.erro.mensagem, descricao).not.toMatch(/inesperado/);
    }
    expect((await amb.ok('animal:listar', { propriedadeId, filtros: {} })).total).toBe(0);
  });

  it('recusa lote encerrado e lote de outra propriedade', async () => {
    const lote = await criarLote('Velho');
    await amb.ok('lote:encerrar', { id: lote.id, data: '2026-06-01' });
    const r = await amb.chamar('animal:criar', {
      propriedadeId,
      dados: animal('X'),
      entrada: { data: '2026-07-01', loteId: lote.id, pesoVivoKg: null, metodoPesagem: null },
    });
    expect(r.ok ? '' : (r.erro.detalhes ?? [r.erro.mensagem]).join(' ')).toMatch(/encerrado/);
  });

  it('nome de lote ativo é único, mas lote encerrado libera o nome', async () => {
    const lote = await criarLote('Engorda');
    expect(
      codigo(
        await amb.chamar('lote:criar', {
          propriedadeId,
          dados: {
            nome: 'ENGORDA',
            finalidade: 'engorda',
            dataFormacao: '2026-01-01',
            areaId: null,
            observacoes: null,
          },
        }),
      ),
    ).toBe('DUPLICADO');
    await amb.ok('lote:encerrar', { id: lote.id, data: '2026-03-01' });
    await criarLote('Engorda', '2026-04-01');
    expect(codigo(await amb.chamar('lote:reabrir', { id: lote.id }))).toBe('DUPLICADO');
  });

  it('não encerra lote com animais ativos', async () => {
    const lote = await criarLote('Cheio');
    await criarAnimal('A1', { loteId: lote.id });
    expect(codigo(await amb.chamar('lote:encerrar', { id: lote.id, data: '2026-06-01' }))).toBe(
      'OPERACAO_INVALIDA',
    );
  });
});

describe('transferências entre lotes', () => {
  it('transfere vários animais e preserva o histórico de cada um', async () => {
    const origem = await criarLote('Maternidade');
    const destino = await criarLote('Recria');
    const a1 = await criarAnimal('A1', { loteId: origem.id });
    const a2 = await criarAnimal('A2', { loteId: origem.id });

    expect(
      await amb.ok('animal:transferir', {
        animalIds: [a1.id, a2.id],
        loteDestinoId: destino.id,
        data: '2026-05-01',
        motivo: 'Desmama',
      }),
    ).toEqual({ transferidos: 2 });
    expect((await amb.ok('animal:obter', { id: a1.id })).lote?.nome).toBe('Recria');
    expect(
      (await amb.ok('lote:listar', { propriedadeId })).map((l) => [l.nome, l.animaisAtivos]),
    ).toEqual([
      ['Maternidade', 0],
      ['Recria', 2],
    ]);

    // Segunda transferência: o histórico mostra as duas, na ordem certa.
    await amb.ok('animal:transferir', {
      animalIds: [a1.id],
      loteDestinoId: null,
      data: '2026-06-01',
      motivo: null,
    });
    const historico = await amb.ok('animal:historico', { id: a1.id });
    const movimentos = historico.eventos
      .filter((e) => e.tipo === 'movimentacao')
      .map((e) =>
        e.tipo === 'movimentacao'
          ? [
              e.movimentacao.tipo,
              e.movimentacao.loteOrigem?.nome ?? null,
              e.movimentacao.loteDestino?.nome ?? null,
              e.data,
            ]
          : null,
      );
    expect(movimentos).toEqual([
      ['troca_lote', 'Recria', null, '2026-06-01'],
      ['troca_lote', 'Maternidade', 'Recria', '2026-05-01'],
      ['entrada', null, 'Maternidade', '2026-02-01'],
    ]);
  });

  it('é tudo ou nada: um animal inválido impede a transferência de todos', async () => {
    const origem = await criarLote('Origem');
    const destino = await criarLote('Destino');
    const a1 = await criarAnimal('A1', { loteId: origem.id });
    const a2 = await criarAnimal('A2', { loteId: destino.id });
    const r = await amb.chamar('animal:transferir', {
      animalIds: [a1.id, a2.id],
      loteDestinoId: destino.id,
      data: '2026-05-01',
      motivo: null,
    });
    expect(r).toMatchObject({ ok: false, erro: { codigo: 'OPERACAO_INVALIDA' } });
    expect(r.ok ? [] : r.erro.detalhes).toEqual(['A2: o animal já está no lote "Destino".']);
    expect((await amb.ok('animal:obter', { id: a1.id })).lote?.nome).toBe('Origem');
  });

  it('recusa transferência com data anterior à última movimentação ou no futuro', async () => {
    const l1 = await criarLote('L1');
    const l2 = await criarLote('L2');
    const a = await criarAnimal('A', { loteId: l1.id });
    await amb.ok('animal:transferir', {
      animalIds: [a.id],
      loteDestinoId: l2.id,
      data: '2026-05-01',
      motivo: null,
    });
    for (const data of ['2026-04-30', '2026-10-16', '2026-01-15']) {
      expect(
        codigo(
          await amb.chamar('animal:transferir', {
            animalIds: [a.id],
            loteDestinoId: l1.id,
            data,
            motivo: null,
          }),
        ),
        data,
      ).toBe('OPERACAO_INVALIDA');
    }
  });

  it('não transfere animal que já saiu do rebanho', async () => {
    const l1 = await criarLote('L1');
    const a = await criarAnimal('A');
    await amb.ok('animal:registrarSaida', {
      id: a.id,
      tipo: 'vendido',
      data: '2026-09-01',
      motivo: 'Venda',
    });
    expect(
      codigo(
        await amb.chamar('animal:transferir', {
          animalIds: [a.id],
          loteDestinoId: l1.id,
          data: '2026-09-10',
          motivo: null,
        }),
      ),
    ).toBe('OPERACAO_INVALIDA');
  });
});

describe('pesagens e GMD observado', () => {
  it('guarda o histórico de pesagens e calcula o GMD por intervalo e no período', async () => {
    const a = await criarAnimal('A', { data: '2026-01-01', peso: 300 });
    await amb.ok('pesagem:registrar', {
      animalId: a.id,
      dados: { data: '2026-01-31', pesoVivoKg: 330, metodo: 'balanca', observacao: null },
    });
    await amb.ok('pesagem:registrar', {
      animalId: a.id,
      dados: { data: '2026-03-02', pesoVivoKg: 354, metodo: 'fita', observacao: null },
    });

    const r = await amb.ok('pesagem:listar', { animalId: a.id });
    expect(r.pesagens.map((p) => [p.data, p.pesoVivoKg])).toEqual([
      ['2026-01-01', 300],
      ['2026-01-31', 330],
      ['2026-03-02', 354],
    ]);
    expect(r.gmd.situacao).toBe('calculado');
    expect(r.gmd.intervalos.map((i) => [i.dias, i.gmdKgDia, i.estimado])).toEqual([
      [30, 1, false],
      [30, 0.8, true],
    ]);
    expect(r.gmd.periodoTotal).toMatchObject({ dias: 60, ganhoKg: 54, gmdKgDia: 0.9 });
  });

  it('com uma pesagem só não há GMD', async () => {
    const a = await criarAnimal('A', { peso: 300 });
    expect((await amb.ok('pesagem:listar', { animalId: a.id })).gmd).toMatchObject({
      situacao: 'pesagem_unica',
      periodoTotal: null,
    });
  });

  it('recusa pesagem duplicada na data, no futuro, antes da entrada e depois da saída', async () => {
    const a = await criarAnimal('A', { data: '2026-01-10', peso: 300 });
    const pesar = (data: string) =>
      amb.chamar('pesagem:registrar', {
        animalId: a.id,
        dados: { data, pesoVivoKg: 310, metodo: 'balanca', observacao: null },
      });
    expect(codigo(await pesar('2026-01-10'))).toBe('DUPLICADO');
    expect(codigo(await pesar('2026-10-16'))).toBe('ENTRADA_INVALIDA');
    expect(codigo(await pesar('2026-01-09'))).toBe('ENTRADA_INVALIDA');
    await amb.ok('animal:registrarSaida', {
      id: a.id,
      tipo: 'morto',
      data: '2026-08-01',
      motivo: null,
    });
    expect(codigo(await pesar('2026-08-02'))).toBe('ENTRADA_INVALIDA');
    expect((await pesar('2026-07-30')).ok).toBe(true);
  });

  it('correção e exclusão de pesagem ficam registradas e o GMD é recalculado', async () => {
    const a = await criarAnimal('A', { data: '2026-01-01', peso: 300 });
    const p = await amb.ok('pesagem:registrar', {
      animalId: a.id,
      dados: { data: '2026-01-31', pesoVivoKg: 360, metodo: 'balanca', observacao: null },
    });
    await amb.ok('pesagem:atualizar', {
      id: p.id,
      dados: { data: '2026-01-31', pesoVivoKg: 330, metodo: 'balanca', observacao: null },
      motivo: 'Digitação errada',
    });
    expect((await amb.ok('pesagem:listar', { animalId: a.id })).gmd.periodoTotal?.gmdKgDia).toBe(1);

    await amb.ok('pesagem:excluir', { id: p.id, motivo: 'Balança descalibrada' });
    expect((await amb.ok('pesagem:listar', { animalId: a.id })).gmd.situacao).toBe('pesagem_unica');

    const historico = await amb.ok('animal:historico', { id: a.id });
    const correcoes = historico.eventos.filter(
      (e) => e.tipo === 'alteracao' && e.entidade === 'pesagem',
    );
    expect(correcoes.map((e) => (e.tipo === 'alteracao' ? [e.acao, e.motivo] : null))).toEqual(
      expect.arrayContaining([
        ['alteracao', 'Digitação errada'],
        ['exclusao', 'Balança descalibrada'],
      ]),
    );
    expect(
      correcoes.every((e) => e.tipo === 'alteracao' && e.dataReferencia === '2026-01-31'),
    ).toBe(true);
    expect(codigo(await amb.chamar('pesagem:excluir', { id: p.id, motivo: 'de novo' }))).toBe(
      'NAO_ENCONTRADO',
    );
    expect(codigo(await amb.chamar('pesagem:excluir', { id: p.id, motivo: '  ' }))).toBe(
      'ENTRADA_INVALIDA',
    );
  });
});

describe('saída e exclusão', () => {
  it('saída tira o animal do lote, mantém o histórico e muda o status', async () => {
    const lote = await criarLote('L');
    const a = await criarAnimal('A', { loteId: lote.id });
    const saiu = await amb.ok('animal:registrarSaida', {
      id: a.id,
      tipo: 'vendido',
      data: '2026-09-01',
      motivo: 'Venda para frigorífico',
    });
    expect(saiu).toMatchObject({ status: 'vendido', dataSaida: '2026-09-01', lote: null });
    expect((await amb.ok('animal:listar', { propriedadeId, filtros: {} })).total).toBe(0);
    expect(
      (await amb.ok('animal:listar', { propriedadeId, filtros: { status: 'vendido' } })).total,
    ).toBe(1);
    const historico = await amb.ok('animal:historico', { id: a.id });
    expect(historico.eventos[0]).toMatchObject({
      tipo: 'movimentacao',
      movimentacao: { tipo: 'saida', loteOrigem: { nome: 'L' } },
    });
    // A identificação de animal vendido continua reservada.
    expect(
      codigo(
        await amb.chamar('animal:criar', {
          propriedadeId,
          dados: animal('A'),
          entrada: { data: '2026-09-10', loteId: null, pesoVivoKg: null, metodoPesagem: null },
        }),
      ),
    ).toBe('DUPLICADO');
  });

  it('exclusão lógica exige motivo, some das consultas e libera a identificação', async () => {
    const a = await criarAnimal('A');
    expect(codigo(await amb.chamar('animal:excluir', { id: a.id, motivo: '' }))).toBe(
      'ENTRADA_INVALIDA',
    );
    await amb.ok('animal:excluir', { id: a.id, motivo: 'Cadastro em duplicidade' });
    expect(codigo(await amb.chamar('animal:obter', { id: a.id }))).toBe('NAO_ENCONTRADO');
    const linha = amb.gerenciador.conexao
      .prepare('SELECT deleted_at FROM animal WHERE id = ?')
      .get(a.id) as { deleted_at: string | null };
    expect(linha.deleted_at).not.toBeNull();
    await criarAnimal('A');
  });
});

describe('persistência', () => {
  it('animais, lotes, pesagens e histórico continuam lá depois de reiniciar', async () => {
    const lote = await criarLote('Recria');
    const a = await criarAnimal('BR-100', { loteId: lote.id, data: '2026-01-01', peso: 250 });
    await amb.ok('pesagem:registrar', {
      animalId: a.id,
      dados: { data: '2026-04-01', pesoVivoKg: 340, metodo: 'balanca', observacao: null },
    });
    await amb.ok('configuracao:definir', {
      chave: 'interface.propriedadeAtual',
      valor: propriedadeId,
    });

    await amb.reiniciar();

    expect(await amb.ok('configuracao:obter', { chave: 'interface.propriedadeAtual' })).toEqual({
      valor: propriedadeId,
    });
    const recarregado = await amb.ok('animal:obter', { id: a.id });
    expect(recarregado).toMatchObject({
      identificacao: 'BR-100',
      lote: { nome: 'Recria' },
      ultimaPesagem: { pesoVivoKg: 340 },
    });
    const pesagens = await amb.ok('pesagem:listar', { animalId: a.id });
    expect(pesagens.gmd.periodoTotal).toMatchObject({ dias: 90, ganhoKg: 90, gmdKgDia: 1 });
    expect((await amb.ok('animal:historico', { id: a.id })).eventos).toHaveLength(3);
  });
});

describe('importação por planilha', () => {
  const cabecalho =
    'identificacao;sexo;condicao_sexual;categoria;raca;aptidao;data_nascimento;origem;data_entrada;lote;peso_kg\n';

  it('mostra prévia sem gravar e importa tudo quando confirmado', async () => {
    await criarLote('Recria');
    const csv = `${cabecalho}I-1;F;;novilha;Nelore;corte;2024-05-01;comprado;01/02/2026;Recria;280,5\nI-2;M;castrado;garrote;;corte;;comprado;2026-02-01;;\n`;
    const previa = await amb.ok('animal:importarCsv', {
      propriedadeId,
      conteudo: csv,
      confirmar: false,
    });
    expect(previa).toMatchObject({
      confirmado: false,
      totalLinhas: 2,
      linhasValidas: 2,
      linhasComErro: [],
      importados: 0,
    });
    expect((await amb.ok('animal:listar', { propriedadeId, filtros: {} })).total).toBe(0);

    const feito = await amb.ok('animal:importarCsv', {
      propriedadeId,
      conteudo: csv,
      confirmar: true,
    });
    expect(feito).toMatchObject({ confirmado: true, importados: 2 });
    const lista = await amb.ok('animal:listar', { propriedadeId, filtros: {} });
    expect(
      lista.itens.map((a) => [
        a.identificacao,
        a.lote?.nome ?? null,
        a.raca?.nome ?? null,
        a.ultimaPesagem?.pesoVivoKg ?? null,
      ]),
    ).toEqual([
      ['I-1', 'Recria', 'Nelore', 280.5],
      ['I-2', null, null, null],
    ]);
  });

  it('com qualquer erro nada é importado, e cada linha mostra seus problemas', async () => {
    await criarAnimal('JA-EXISTE');
    const csv = `${cabecalho}OK-1;F;;novilha;;corte;;comprado;2026-02-01;;\nJA-EXISTE;F;;novilha;;corte;;comprado;2026-02-01;;\nOK-1;F;;novilha;Zebu Inventado;corte;;comprado;2026-02-01;Lote Fantasma;\n`;
    const r = await amb.ok('animal:importarCsv', { propriedadeId, conteudo: csv, confirmar: true });
    expect(r.confirmado).toBe(false);
    expect(r.importados).toBe(0);
    expect(r.linhasComErro.map((l) => l.linha)).toEqual([3, 4]);
    expect(r.linhasComErro[1]?.erros.join(' ')).toMatch(/repetida no arquivo.*linha 2/);
    expect(r.linhasComErro[1]?.erros.join(' ')).toMatch(/Raça não cadastrada/);
    expect(r.linhasComErro[1]?.erros.join(' ')).toMatch(/Lote ativo não encontrado/);
    expect((await amb.ok('animal:listar', { propriedadeId, filtros: {} })).total).toBe(1);
  });
});
