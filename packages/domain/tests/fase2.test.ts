import { describe, expect, it } from 'vitest';
import {
  alertaConferido,
  analisarEvolucaoGrupo,
  custoPorAnimalCentavos,
  fimCarencia,
  detectarAlertasPesagem,
  emCarencia,
  pesagensDoAlerta,
  situacaoAgenda,
  somarDias,
  validarParametrosAlertas,
  categoriaDoAlerta,
  pesagensNoLote,
  posicaoNoLote,
  reconstruirPermanencias,
  type MovimentacaoParaLote,
  type ParametrosAlertasPesagem,
  type PermanenciaNoLote,
  type PesagemParaGmd,
} from '../src';

function p(
  id: string,
  data: string,
  pesoVivoKg: number,
  metodo: PesagemParaGmd['metodo'] = 'balanca',
): PesagemParaGmd {
  return { id, data, pesoVivoKg, metodo };
}

// Limites de teste, escolhidos só para exercitar as regras (não são referência zootécnica).
const LIMITES: ParametrosAlertasPesagem = {
  gmdMaximoKgDia: 2,
  gmdMinimoKgDia: 0,
  intervaloCurtoDias: null,
};

describe('somarDias', () => {
  it('soma e subtrai dias atravessando mês, ano e 29 de fevereiro', () => {
    expect(somarDias('2026-01-31', 1)).toBe('2026-02-01');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(somarDias('2026-10-15', 0)).toBe('2026-10-15');
  });
});

describe('detectarAlertasPesagem', () => {
  it('sem alertas quando o GMD fica dentro dos limites', () => {
    expect(
      detectarAlertasPesagem(
        [p('a', '2026-01-01', 300), p('b', '2026-01-31', 330), p('c', '2026-03-02', 360)],
        LIMITES,
      ),
    ).toEqual([]);
  });

  it('GMD acima do limite, apontando a pesagem final do intervalo', () => {
    // (450 − 330) / 30 = 4 kg/dia
    const alertas = detectarAlertasPesagem(
      [p('a', '2026-01-01', 300), p('b', '2026-01-31', 330), p('c', '2026-03-02', 450)],
      LIMITES,
    );
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ tipo: 'gmd_acima', pesagemId: 'c', pesoSugeridoKg: null });
    expect(alertas[0]!.intervalo.gmdKgDia).toBe(4);
  });

  it('perda de peso com limite inferior 0', () => {
    const alertas = detectarAlertasPesagem(
      [p('a', '2026-01-01', 300), p('b', '2026-01-31', 290)],
      LIMITES,
    );
    expect(alertas.map((a) => a.tipo)).toEqual(['gmd_abaixo']);
  });

  it('possível erro de digitação: 3300 em vez de 330 sugere 330', () => {
    const alertas = detectarAlertasPesagem(
      [p('a', '2026-01-01', 300), p('b', '2026-01-31', 3300)],
      LIMITES,
    );
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ tipo: 'possivel_digitacao', pesoSugeridoKg: 330 });
  });

  it('vírgula esquecida para menos: 33 em vez de 330', () => {
    const alertas = detectarAlertasPesagem(
      [p('a', '2026-01-01', 300), p('b', '2026-01-31', 33)],
      LIMITES,
    );
    expect(alertas[0]).toMatchObject({ tipo: 'possivel_digitacao', pesoSugeridoKg: 330 });
  });

  it('pico isolado: a pesagem do meio é a suspeita e gera um alerta só', () => {
    const alertas = detectarAlertasPesagem(
      [p('a', '2026-01-01', 300), p('b', '2026-01-31', 400), p('c', '2026-03-02', 360)],
      LIMITES,
    );
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ tipo: 'pico_isolado', pesagemId: 'b' });
    expect(alertas[0]!.intervaloSeguinte?.pesagemFinalId).toBe('c');
  });

  it('pico isolado por digitação sugere o peso que se encaixa nas duas vizinhas', () => {
    const alertas = detectarAlertasPesagem(
      [p('a', '2026-01-01', 300), p('b', '2026-01-31', 3300), p('c', '2026-03-02', 360)],
      LIMITES,
    );
    expect(alertas[0]).toMatchObject({ tipo: 'pico_isolado', pesoSugeridoKg: 330 });
  });

  it('peso repetido em datas diferentes pede conferência', () => {
    const alertas = detectarAlertasPesagem(
      [p('a', '2026-01-01', 300), p('b', '2026-01-31', 300)],
      LIMITES,
    );
    expect(alertas.map((a) => a.tipo)).toEqual(['peso_repetido']);
  });

  it('limites desligados (null) não geram alertas de GMD', () => {
    const alertas = detectarAlertasPesagem([p('a', '2026-01-01', 300), p('b', '2026-01-02', 400)], {
      gmdMaximoKgDia: null,
      gmdMinimoKgDia: null,
      intervaloCurtoDias: null,
    });
    expect(alertas).toEqual([]);
  });

  it('separa conferência (possível erro de registro) de desempenho (peso pode estar certo)', () => {
    expect(categoriaDoAlerta('gmd_acima')).toBe('desempenho');
    expect(categoriaDoAlerta('gmd_abaixo')).toBe('desempenho');
    for (const tipo of ['possivel_digitacao', 'pico_isolado', 'peso_repetido'] as const) {
      expect(categoriaDoAlerta(tipo)).toBe('conferencia');
    }
    const perda = detectarAlertasPesagem(
      [p('a', '2026-01-01', 300), p('b', '2026-01-31', 290)],
      LIMITES,
    );
    expect(perda[0]).toMatchObject({ tipo: 'gmd_abaixo', categoria: 'desempenho' });
    const digitacao = detectarAlertasPesagem(
      [p('a', '2026-01-01', 300), p('b', '2026-01-31', 3300)],
      LIMITES,
    );
    expect(digitacao[0]).toMatchObject({ tipo: 'possivel_digitacao', categoria: 'conferencia' });
  });

  it('marca intervalo curto conforme o parâmetro, sem deixar de avisar', () => {
    const pesagens = [p('a', '2026-01-01', 300), p('b', '2026-01-04', 298)];
    const comMarca = detectarAlertasPesagem(pesagens, { ...LIMITES, intervaloCurtoDias: 7 });
    expect(comMarca).toHaveLength(1);
    expect(comMarca[0]).toMatchObject({ tipo: 'gmd_abaixo', intervaloCurto: true });
    // 3 dias não é curto quando o limite é 3: só intervalos com MENOS dias.
    const limiteIgual = detectarAlertasPesagem(pesagens, { ...LIMITES, intervaloCurtoDias: 3 });
    expect(limiteIgual[0]!.intervaloCurto).toBe(false);
    const desligado = detectarAlertasPesagem(pesagens, LIMITES);
    expect(desligado[0]!.intervaloCurto).toBe(false);
  });

  it('pico isolado é curto se qualquer um dos dois intervalos for curto', () => {
    const alertas = detectarAlertasPesagem(
      [p('a', '2026-01-01', 300), p('b', '2026-01-31', 400), p('c', '2026-02-03', 330)],
      { ...LIMITES, intervaloCurtoDias: 7 },
    );
    expect(alertas[0]).toMatchObject({ tipo: 'pico_isolado', intervaloCurto: true });
  });

  it('mantém a marca de pesagem estimada no intervalo do alerta', () => {
    const alertas = detectarAlertasPesagem(
      [p('a', '2026-01-01', 300, 'fita'), p('b', '2026-01-11', 340)],
      LIMITES,
    );
    expect(alertas[0]!.intervalo.estimado).toBe(true);
  });

  it('alerta conta como conferido se uma das pesagens foi confirmada depois de todas existirem', () => {
    const [alerta] = detectarAlertasPesagem(
      [p('a', '2026-01-01', 300), p('b', '2026-01-31', 450)],
      LIMITES,
    );
    const estado = (conferidaB: string | null, criadoB = '2026-02-01T10:00:00Z') =>
      new Map([
        ['a', { conferidaEm: null, criadoEm: '2026-01-01T10:00:00Z' }],
        ['b', { conferidaEm: conferidaB, criadoEm: criadoB }],
      ]);
    expect(pesagensDoAlerta(alerta!)).toEqual(['a', 'b']);
    expect(alertaConferido(alerta!, estado(null))).toBe(false);
    expect(alertaConferido(alerta!, estado('2026-02-01T10:00:00Z'))).toBe(true);
    // Conferência anterior a uma das pesagens não vale para o novo intervalo.
    const comA = new Map([
      ['a', { conferidaEm: '2026-01-01T10:00:00Z', criadoEm: '2026-01-01T10:00:00Z' }],
      ['b', { conferidaEm: null, criadoEm: '2026-02-01T10:00:00Z' }],
    ]);
    expect(alertaConferido(alerta!, comA)).toBe(false);
  });

  it('valida a coerência dos limites', () => {
    expect(
      validarParametrosAlertas({ ...LIMITES, gmdMaximoKgDia: 1, gmdMinimoKgDia: 1 }),
    ).toHaveLength(1);
    expect(
      validarParametrosAlertas({ ...LIMITES, gmdMaximoKgDia: 1, gmdMinimoKgDia: null }),
    ).toEqual([]);
  });
});

function mov(
  tipo: MovimentacaoParaLote['tipo'],
  data: string,
  loteOrigemId: string | null,
  loteDestinoId: string | null,
): MovimentacaoParaLote {
  return { tipo, data, loteOrigemId, loteDestinoId };
}

describe('reconstruirPermanencias', () => {
  it('entrada no lote, transferência para outro e volta', () => {
    const movs = [
      mov('entrada', '2026-01-01', null, 'A'),
      mov('troca_lote', '2026-03-01', 'A', 'B'),
      mov('troca_lote', '2026-05-01', 'B', 'A'),
    ];
    expect(reconstruirPermanencias(movs, 'A', 'A')).toEqual({
      situacao: 'ok',
      permanencias: [
        { inicio: '2026-01-01', fim: '2026-03-01', inicioEmTroca: false, fimEmTroca: true },
        { inicio: '2026-05-01', fim: null, inicioEmTroca: true, fimEmTroca: false },
      ],
    });
    expect(reconstruirPermanencias(movs, 'B', 'A')).toEqual({
      situacao: 'ok',
      permanencias: [
        { inicio: '2026-03-01', fim: '2026-05-01', inicioEmTroca: true, fimEmTroca: true },
      ],
    });
  });

  it('saída do rebanho encerra a permanência sem ser dia de troca', () => {
    const movs = [mov('entrada', '2026-01-01', null, 'A'), mov('saida', '2026-04-10', 'A', null)];
    expect(reconstruirPermanencias(movs, 'A', null)).toEqual({
      situacao: 'ok',
      permanencias: [
        { inicio: '2026-01-01', fim: '2026-04-10', inicioEmTroca: false, fimEmTroca: false },
      ],
    });
  });

  it('retorno ao rebanho (devolução da venda): o período fora não pertence a nenhum lote', () => {
    const movs = [
      mov('entrada', '2026-01-01', null, 'A'),
      mov('saida', '2026-04-10', 'A', null),
      mov('entrada', '2026-05-20', null, 'B'),
    ];
    expect(reconstruirPermanencias(movs, 'A', 'B')).toEqual({
      situacao: 'ok',
      permanencias: [
        { inicio: '2026-01-01', fim: '2026-04-10', inicioEmTroca: false, fimEmTroca: false },
      ],
    });
    expect(reconstruirPermanencias(movs, 'B', 'B')).toEqual({
      situacao: 'ok',
      permanencias: [{ inicio: '2026-05-20', fim: null, inicioEmTroca: false, fimEmTroca: false }],
    });
    // Venda e devolução no mesmo dia: a nova permanência começa no próprio dia.
    const mesmoDia = [
      mov('entrada', '2026-01-01', null, 'A'),
      mov('saida', '2026-04-10', 'A', null),
      mov('entrada', '2026-04-10', null, 'A'),
    ];
    expect(reconstruirPermanencias(mesmoDia, 'A', 'A')).toEqual({
      situacao: 'ok',
      permanencias: [
        { inicio: '2026-01-01', fim: '2026-04-10', inicioEmTroca: false, fimEmTroca: false },
        { inicio: '2026-04-10', fim: null, inicioEmTroca: false, fimEmTroca: false },
      ],
    });
  });

  it('nova entrada sem saída antes, ou retorno vindo de um lote, é inconsistente', () => {
    const duasEntradas = [
      mov('entrada', '2026-01-01', null, 'A'),
      mov('entrada', '2026-02-01', null, 'A'),
    ];
    expect(reconstruirPermanencias(duasEntradas, 'A', 'A').situacao).toBe('inconsistente');
    const retornoComOrigem = [
      mov('entrada', '2026-01-01', null, 'A'),
      mov('saida', '2026-02-01', 'A', null),
      mov('entrada', '2026-03-01', 'A', 'A'),
    ];
    expect(reconstruirPermanencias(retornoComOrigem, 'A', 'A').situacao).toBe('inconsistente');
  });

  it('animal que nunca esteve no lote não tem permanência', () => {
    const movs = [mov('entrada', '2026-01-01', null, 'B')];
    expect(reconstruirPermanencias(movs, 'A', 'B')).toEqual({ situacao: 'ok', permanencias: [] });
  });

  it('histórico com lacuna ou contradição não é adivinhado', () => {
    const casos: [MovimentacaoParaLote[], string | null][] = [
      [[], 'A'],
      [[mov('troca_lote', '2026-01-01', null, 'A')], 'A'],
      [[mov('entrada', '2026-01-01', null, 'A'), mov('troca_lote', '2026-02-01', 'B', 'A')], 'A'],
      [[mov('entrada', '2026-01-01', null, 'A')], 'B'],
      [
        [
          mov('entrada', '2026-01-01', null, 'A'),
          mov('saida', '2026-02-01', 'A', null),
          mov('troca_lote', '2026-03-01', null, 'A'),
        ],
        'A',
      ],
      [[mov('entrada', '2026-03-01', null, 'A'), mov('troca_lote', '2026-02-01', 'A', 'B')], 'B'],
    ];
    for (const [movs, atual] of casos) {
      expect(reconstruirPermanencias(movs, 'A', atual).situacao).toBe('inconsistente');
    }
  });

  it('posição de uma data: dentro, dia da troca ou fora', () => {
    const permanencias = [
      { inicio: '2026-01-01', fim: '2026-03-01', inicioEmTroca: false, fimEmTroca: true },
    ];
    expect(posicaoNoLote('2025-12-31', permanencias)).toBe('fora');
    expect(posicaoNoLote('2026-01-01', permanencias)).toBe('dentro');
    expect(posicaoNoLote('2026-02-01', permanencias)).toBe('dentro');
    expect(posicaoNoLote('2026-03-01', permanencias)).toBe('dia_da_troca');
    expect(posicaoNoLote('2026-03-02', permanencias)).toBe('fora');
  });
});

/** Animal no lote desde sempre, sem trocas. */
const SEMPRE: PermanenciaNoLote[] = [
  { inicio: '2000-01-01', fim: null, inicioEmTroca: false, fimEmTroca: false },
];

describe('analisarEvolucaoGrupo', () => {
  it('pontos por data usam só os animais pesados naquela data', () => {
    const r = analisarEvolucaoGrupo([
      {
        animalId: '1',
        permanencias: SEMPRE,
        pesagens: [p('1a', '2026-01-01', 300), p('1b', '2026-01-31', 330)],
      },
      { animalId: '2', permanencias: SEMPRE, pesagens: [p('2a', '2026-01-01', 200)] },
    ]);
    expect(r.pontos).toEqual([
      {
        data: '2026-01-01',
        quantidade: 2,
        animaisNoLote: 2,
        mediaKg: 250,
        minimoKg: 200,
        maximoKg: 300,
        estimado: false,
        noDiaDaTroca: 0,
      },
      {
        data: '2026-01-31',
        quantidade: 1,
        animaisNoLote: 2,
        mediaKg: 330,
        minimoKg: 330,
        maximoKg: 330,
        estimado: false,
        noDiaDaTroca: 0,
      },
    ]);
  });

  it('períodos comparam os mesmos animais e não inventam pesos', () => {
    const r = analisarEvolucaoGrupo([
      {
        animalId: '1',
        permanencias: SEMPRE,
        pesagens: [
          p('1a', '2026-01-01', 300),
          p('1b', '2026-01-31', 330),
          p('1c', '2026-03-02', 345),
        ],
      },
      {
        animalId: '2',
        permanencias: SEMPRE,
        pesagens: [p('2a', '2026-01-01', 200), p('2b', '2026-01-31', 245, 'fita')],
      },
    ]);
    expect(r.periodos).toHaveLength(2);
    expect(r.periodos[0]).toMatchObject({
      dataInicial: '2026-01-01',
      dataFinal: '2026-01-31',
      dias: 30,
      quantidade: 2,
      pesoInicialMedioKg: 250,
      pesoFinalMedioKg: 287.5,
      gmdMinimoKgDia: 1,
      gmdMaximoKgDia: 1.5,
      estimado: true,
    });
    expect(r.periodos[0]!.gmdMedioKgDia).toBeCloseTo(1.25, 10);
    expect(r.periodos[1]).toMatchObject({ quantidade: 1, gmdMedioKgDia: 0.5, estimado: false });
    // Animal 1: (345 − 300) / 60 = 0,75; animal 2: (245 − 200) / 30 = 1,5
    expect(r.resumo).toMatchObject({
      quantidade: 2,
      permanencias: 2,
      gmdMinimoKgDia: 0.75,
      gmdMaximoKgDia: 1.5,
    });
    expect(r.resumo!.gmdMedioKgDia).toBeCloseTo(1.125, 10);
  });

  it('grupo sem pesagens: vazio, sem resumo', () => {
    expect(analisarEvolucaoGrupo([{ animalId: '1', permanencias: SEMPRE, pesagens: [] }])).toEqual({
      pontos: [],
      periodos: [],
      resumo: null,
      pesagensNoDiaDaTroca: 0,
      pesagensForaDoLote: 0,
    });
  });

  // Animal X: no lote A até a troca para B em 01/03 (pesado no dia da troca).
  // Animal Y: sempre em B.
  const X = [
    p('x1', '2026-01-01', 300),
    p('x2', '2026-01-31', 330),
    p('x3', '2026-03-01', 360),
    p('x4', '2026-03-31', 390),
  ];
  const Y = [p('y1', '2026-01-01', 250), p('y2', '2026-01-31', 280), p('y3', '2026-03-31', 340)];
  const movsX = [
    mov('entrada', '2026-01-01', null, 'A'),
    mov('troca_lote', '2026-03-01', 'A', 'B'),
  ];
  const movsY = [mov('entrada', '2026-01-01', null, 'B')];
  function membro(id: string, movs: MovimentacaoParaLote[], lote: string, atual: string | null) {
    const r = reconstruirPermanencias(movs, lote, atual);
    if (r.situacao !== 'ok') throw new Error(r.motivo);
    return { animalId: id, permanencias: r.permanencias, pesagens: id === 'X' ? X : Y };
  }

  it('lote de destino: pesagens de antes da transferência não entram', () => {
    const r = analisarEvolucaoGrupo([membro('X', movsX, 'B', 'B'), membro('Y', movsY, 'B', 'B')]);
    expect(r.pontos.map((x) => [x.data, x.quantidade, x.animaisNoLote, x.mediaKg])).toEqual([
      ['2026-01-01', 1, 1, 250],
      ['2026-01-31', 1, 1, 280],
      ['2026-03-01', 1, 2, 360],
      ['2026-03-31', 2, 2, 365],
    ]);
    expect(r.pontos[2]!.noDiaDaTroca).toBe(1);
    expect(r.pesagensForaDoLote).toBe(2); // x1 e x2, feitas no lote A
    expect(r.pesagensNoDiaDaTroca).toBe(1);
    // X só tem o período 01/03 a 31/03 em B; nada entre 31/01 e 01/03.
    expect(r.periodos.map((x) => [x.dataInicial, x.dataFinal, x.quantidade])).toEqual([
      ['2026-01-01', '2026-01-31', 1],
      ['2026-01-31', '2026-03-31', 1], // Y
      ['2026-03-01', '2026-03-31', 1],
    ]);
  });

  it('lote de origem: pesagens depois da transferência não entram', () => {
    const r = analisarEvolucaoGrupo([membro('X', movsX, 'A', 'B'), membro('Y', movsY, 'A', 'B')]);
    expect(r.pontos.map((x) => [x.data, x.quantidade, x.animaisNoLote, x.mediaKg])).toEqual([
      ['2026-01-01', 1, 1, 300],
      ['2026-01-31', 1, 1, 330],
      ['2026-03-01', 1, 1, 360],
    ]);
    expect(r.pesagensForaDoLote).toBe(4); // x4 e as três de Y
    // GMD de X no lote A: (360 − 300) / 59 dias
    expect(r.resumo).toMatchObject({ quantidade: 1, permanencias: 1 });
    expect(r.resumo!.gmdMedioKgDia).toBeCloseTo(60 / 59, 10);
  });

  it('saiu e voltou: o intervalo da ausência não vira período do lote', () => {
    const movs = [
      mov('entrada', '2026-01-01', null, 'A'),
      mov('troca_lote', '2026-02-01', 'A', 'B'),
      mov('troca_lote', '2026-03-01', 'B', 'A'),
    ];
    const r = analisarEvolucaoGrupo([
      {
        animalId: 'Z',
        permanencias: (
          reconstruirPermanencias(movs, 'A', 'A') as { permanencias: PermanenciaNoLote[] }
        ).permanencias,
        pesagens: [
          p('z1', '2026-01-01', 300),
          p('z2', '2026-01-21', 320),
          p('z3', '2026-02-15', 330),
          p('z4', '2026-03-11', 350),
          p('z5', '2026-03-31', 370),
        ],
      },
    ]);
    expect(r.pontos.map((x) => x.data)).toEqual([
      '2026-01-01',
      '2026-01-21',
      '2026-03-11',
      '2026-03-31',
    ]);
    expect(r.periodos.map((x) => [x.dataInicial, x.dataFinal])).toEqual([
      ['2026-01-01', '2026-01-21'],
      ['2026-03-11', '2026-03-31'],
    ]);
    expect(r.resumo).toMatchObject({ quantidade: 1, permanencias: 2, gmdMedioKgDia: 1 });
    expect(r.pesagensForaDoLote).toBe(1);
  });

  it('pesagensNoLote separa as pesagens por permanência', () => {
    const r = pesagensNoLote(membro('X', movsX, 'B', 'B'));
    expect(r.trechos.map((t) => t.map((x) => x.id))).toEqual([['x3', 'x4']]);
    expect([...r.noDiaDaTroca]).toEqual(['x3']);
    expect(r.foraDoLote).toBe(2);
  });
});

describe('sanidade', () => {
  it('fim do prazo soma os dias de carência informados à data da aplicação', () => {
    expect(fimCarencia('2026-10-01', 30)).toBe('2026-10-31');
    expect(fimCarencia('2026-10-01', 0)).toBeNull();
    expect(fimCarencia('2026-10-01', null)).toBeNull();
  });

  it('em carência até o dia anterior ao fim do prazo calculado', () => {
    expect(emCarencia('2026-10-31', '2026-10-30')).toBe(true);
    expect(emCarencia('2026-10-31', '2026-10-31')).toBe(false);
    expect(emCarencia(null, '2026-10-30')).toBe(false);
  });

  it('situação da agenda conforme a antecedência configurada', () => {
    expect(situacaoAgenda('2026-10-14', '2026-10-15', 7)).toBe('atrasado');
    expect(situacaoAgenda('2026-10-15', '2026-10-15', 7)).toBe('hoje');
    expect(situacaoAgenda('2026-10-22', '2026-10-15', 7)).toBe('proximo');
    expect(situacaoAgenda('2026-10-23', '2026-10-15', 7)).toBe('futuro');
    expect(situacaoAgenda('2026-10-16', '2026-10-15', 0)).toBe('futuro');
  });

  it('custo por animal em centavos inteiros', () => {
    expect(custoPorAnimalCentavos(10_000, 3)).toBe(3333);
    expect(custoPorAnimalCentavos(10_000, 0)).toBeNull();
  });
});
