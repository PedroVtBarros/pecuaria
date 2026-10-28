import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { DadosLancamento, DadosMovimentoEstoque } from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import {
  DATA_DO_RELOGIO,
  categoriaPorNome,
  conferirCaixa,
  conferirInvariantes,
  contar,
  criarLancamento,
  criarPropriedade,
  dadosDeLancamento,
} from './apoio-teste';
import { comprar, criarLote, dadosDeCompra } from './apoio-animais';
import { conferirInsumos } from './apoio-insumos';
import { conferirApropriacaoDoBanco } from './apoio-rateio';

/**
 * Entrega 4E: apropriação de custos a lotes e animais e rateio de custos compartilhados. Os valores
 * esperados foram calculados à mão; a soma distribuída é conferida por SQL independente.
 */
let amb: AmbienteIpc;
let prop: string;
let loteA: string;
let loteB: string;
let categoria: string;
const animal: Record<string, string> = {};
const erro = (r: { ok: boolean; erro?: { mensagem: string; detalhes?: string[] } }) => {
  expect(r.ok).toBe(false);
  return [r.erro?.mensagem, ...(r.erro?.detalhes ?? [])].join(' | ');
};

beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
  prop = (await criarPropriedade(amb, 'Fazenda do rateio')).id;
  loteA = (await criarLote(amb, prop, 'Lote A')).id;
  loteB = (await criarLote(amb, prop, 'Lote B')).id;
  categoria = (await categoriaPorNome(amb, 'Alimentação (despesa direta, sem estoque)')).id;
  // Lote A: a1, a2, a3 a R$ 300,00 cada; lote B: b1 a R$ 300,00. Todos entram em 01/10/2026.
  const ca = await comprar(
    amb,
    dadosDeCompra(
      prop,
      [{ identificacao: 'a1' }, { identificacao: 'a2' }, { identificacao: 'a3' }],
      {
        loteId: loteA,
        valorTotalCentavos: 90000,
      },
    ),
  );
  const cb = await comprar(
    amb,
    dadosDeCompra(prop, [{ identificacao: 'b1' }], { loteId: loteB, valorTotalCentavos: 30000 }),
  );
  for (const i of [...ca.itens, ...cb.itens]) animal[i.animalIdentificacao] = i.animalId;
});
afterEach(async () => {
  expect(conferirInvariantes(amb)).toEqual([]);
  expect(conferirInsumos(amb)).toEqual([]);
  expect(await conferirCaixa(amb)).toEqual([]);
  expect(await conferirApropriacaoDoBanco(amb)).toEqual([]);
  amb.encerrar();
});

const despesa = (
  valorTotalCentavos: number,
  destino: DadosLancamento['destino'],
  dataCompetencia = '2026-10-06',
  descricao = 'Despesa',
) =>
  criarLancamento(
    amb,
    dadosDeLancamento(prop, categoria, { valorTotalCentavos, destino, dataCompetencia, descricao }),
  );

const resumo = () => amb.ok('custo:resumo', { propriedadeId: prop });
const totalDo = async (nome: string) =>
  (await amb.ok('custo:animal', { animalId: animal[nome]! })).apuracao.valorConhecidoCentavos;
const lotePorNome = async (nome: string) => (await resumo()).lotes.find((l) => l.loteNome === nome);

function dadosRateio(origemId: string, extra: Record<string, unknown> = {}) {
  return {
    requisicaoId: gerarUuidV7(),
    propriedadeId: prop,
    origemTipo: 'lancamento' as const,
    origemId,
    criterio: 'cabecas' as const,
    dataBase: '2026-10-10',
    periodoInicio: null,
    periodoFim: null,
    idadeMaximaPesagemDias: null,
    manual: [],
    motivo: 'Divisão acordada',
    ...extra,
  };
}
/** A prévia não leva identificador de operação nem motivo. */
const previaDe = (d: ReturnType<typeof dadosRateio>) => {
  const { requisicaoId: _r, motivo: _m, ...resto } = d;
  return resto;
};
const valorPorRotulo = (destinos: { rotulo: string; valorCentavos: number | null }[]) =>
  Object.fromEntries(destinos.map((d) => [d.rotulo, d.valorCentavos]));

async function transferir(nome: string, para: string, data: string) {
  await amb.ok('animal:transferir', {
    animalIds: [animal[nome]!],
    loteDestinoId: para,
    data,
    motivo: null,
  });
}

describe('custo de lote dividido entre os animais presentes', () => {
  it('divide por igual, dia a dia, e o animal que sai do lote deixa de receber a partir do dia da troca', async () => {
    await despesa(10001, { tipo: 'lote', loteId: loteA }, '2026-10-05');
    await despesa(9000, { tipo: 'lote', loteId: loteA }, '2026-10-07');
    await transferir('a3', loteB, '2026-10-08');
    await despesa(9000, { tipo: 'lote', loteId: loteA }, '2026-10-08');

    const a3 = await amb.ok('custo:animal', { animalId: animal['a3']! });
    // a3 estava em A ao fim de 05/10 e 07/10, mas não ao fim de 08/10 (trocou de lote nesse dia).
    expect(a3.linhas.filter((l) => l.via === 'lote').map((l) => l.data)).toEqual([
      '2026-10-05',
      '2026-10-07',
    ]);
    // 10.001 entre 3: duas partes de R$ 33,34 e uma de R$ 33,33; 90,00 entre 3 e entre 2 é exato.
    const a1 = await totalDo('a1');
    const a2 = await totalDo('a2');
    const a3Total = await totalDo('a3');
    expect(a1 + a2 + a3Total).toBe(90000 + 10001 + 9000 + 9000);
    expect(a3Total).toBe(30000 + 3000 + (a3Total - 33000));
    expect([3333, 3334]).toContain(a3Total - 33000);
    expect(a1 - 30000 - 3000 - 4500).toBeGreaterThanOrEqual(3333);
    expect(a1 - 30000 - 3000 - 4500).toBeLessThanOrEqual(3334);
    expect(await totalDo('b1')).toBe(30000);

    const lote = await lotePorNome('Lote A');
    expect(lote).toMatchObject({ diretoCentavos: 28001, rateadoCentavos: 0, totalCentavos: 28001 });
    expect((await resumo()).naoAlocado.apuracao.valorConhecidoCentavos).toBe(0);
  });

  it('custo de lote em dia sem nenhum animal presente não chega a ninguém e fica visível', async () => {
    const vazio = (await criarLote(amb, prop, 'Lote vazio')).id;
    await despesa(5000, { tipo: 'lote', loteId: vazio }, '2026-10-06');
    const r = await resumo();
    const l = r.lotes.find((x) => x.loteNome === 'Lote vazio');
    expect(l).toMatchObject({ totalCentavos: 5000, semAnimaisCentavos: 5000 });
    expect(r.animais.apuracao.valorConhecidoCentavos).toBe(120000);
    expect(r.conferido).toBe(true);
  });

  it('explica de onde veio o valor de cada animal', async () => {
    await despesa(9000, { tipo: 'lote', loteId: loteA }, '2026-10-05', 'Sal mineral');
    const e = await amb.ok('custo:animal', { animalId: animal['a1']! });
    const doLote = e.linhas.find((l) => l.via === 'lote')!;
    expect(doLote).toMatchObject({
      valorCentavos: 3000,
      descricao: 'Sal mineral',
      origem: { tipo: 'lancamento' },
    });
    expect(doLote.explicacao).toMatch(/Lote A.*dividido por igual entre 3 animal/);
    expect(e.linhas.find((l) => l.via === 'direto')).toMatchObject({
      categoria: 'aquisicao',
      valorCentavos: 30000,
      origem: { tipo: 'aquisicao' },
    });
  });
});

describe('custo da propriedade sem rateio', () => {
  it('fica "não alocado", não chega a nenhum animal e aparece entre os pendentes', async () => {
    const l = await despesa(100000, { tipo: 'propriedade' });
    const r = await resumo();
    expect(r.naoAlocado.apuracao.valorConhecidoCentavos).toBe(100000);
    expect(r.animais.apuracao.valorConhecidoCentavos).toBe(120000);
    const p = await amb.ok('rateio:pendentes', { propriedadeId: prop });
    expect(p.itens.map((i) => i.origemId)).toEqual([l.id]);
    expect(p.total).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 100000 });
  });
});

describe('rateio por critério', () => {
  it('cabeças: divisão exata pelo número de animais de cada lote na data-base', async () => {
    const l = await despesa(100001, { tipo: 'propriedade' });
    const previa = await amb.ok('rateio:previa', previaDe(dadosRateio(l.id)));
    expect(previa.erros).toEqual([]);
    // 100.001 em pesos 3 e 1: 75.000,75 e 25.000,25, sobra de 1 centavo para o maior resto.
    expect(valorPorRotulo(previa.destinos)).toEqual({ 'Lote A': 75001, 'Lote B': 25000 });
    expect(previa.somaCentavos).toBe(100001);

    const r = await amb.ok('rateio:criar', dadosRateio(l.id));
    expect(r).toMatchObject({ criterio: 'cabecas', somaCentavos: 100001, baseMudou: false });
    expect(valorPorRotulo(r.destinos)).toEqual({ 'Lote A': 75001, 'Lote B': 25000 });

    const res = await resumo();
    expect(res.naoAlocado.apuracao.valorConhecidoCentavos).toBe(0);
    expect(res.lotes.find((x) => x.loteNome === 'Lote A')?.rateadoCentavos).toBe(75001);
    expect(await totalDo('b1')).toBe(30000 + 25000);
    const doA = (await totalDo('a1')) + (await totalDo('a2')) + (await totalDo('a3'));
    expect(doA).toBe(90000 + 75001);
    expect((await amb.ok('rateio:pendentes', { propriedadeId: prop })).itens).toEqual([]);
    const e = await amb.ok('custo:animal', { animalId: animal['b1']! });
    expect(e.linhas.find((x) => x.via === 'lote')?.explicacao).toMatch(/rateio \(cabeças\)/);
  });

  it('animal-dias: soma os dias de cada animal em cada lote no período, contando o dia da troca para o lote novo', async () => {
    await transferir('a3', loteB, '2026-10-08');
    const l = await despesa(40000, { tipo: 'propriedade' });
    // Período 01 a 10/10: A tem a1 e a2 (10 dias cada) e a3 até 07/10 (7 dias) = 27;
    // B tem b1 (10 dias) e a3 de 08 a 10/10 (3 dias) = 13. 40.000 em 27:13 = 27.000 e 13.000.
    const r = await amb.ok(
      'rateio:criar',
      dadosRateio(l.id, {
        criterio: 'animal_dias',
        periodoInicio: '2026-10-01',
        periodoFim: '2026-10-10',
      }),
    );
    expect(valorPorRotulo(r.destinos)).toEqual({ 'Lote A': 27000, 'Lote B': 13000 });
    expect(r.destinos.map((d) => d.peso).sort((a, b) => a - b)).toEqual([13, 27]);
  });

  it('peso: usa a última pesagem real dos animais e recusa o critério se faltar pesagem recente', async () => {
    const l = await despesa(130000, { tipo: 'propriedade' });
    const pesar = (nome: string, kg: number, data = '2026-10-05') =>
      amb.ok('pesagem:registrar', {
        animalId: animal[nome]!,
        dados: {
          data,
          pesoVivoKg: kg,
          metodo: 'balanca',
          observacao: null,
          escoreCorporal: null,
          escalaEcc: null,
        },
        justificativa: null,
      });
    const comPeso = (idade: number) =>
      dadosRateio(l.id, { criterio: 'peso', idadeMaximaPesagemDias: idade });
    await pesar('a1', 300);
    await pesar('a2', 310);
    await pesar('b1', 400);
    // a3 sem pesagem: o critério fica indisponível e diz quem falta.
    const semA3 = await amb.ok('rateio:previa', previaDe(comPeso(30)));
    expect(semA3.erros.join(' ')).toMatch(/Sem pesagem real de até 30 dia.*a3/);
    expect(semA3.destinos).toEqual([]);
    expect(erro(await amb.chamar('rateio:criar', comPeso(30)))).toMatch(/a3/);

    await pesar('a3', 290);
    // Idade máxima de 2 dias: as pesagens de 05/10 têm 5 dias na data-base 10/10.
    const velha = await amb.ok('rateio:previa', previaDe(comPeso(2)));
    expect(velha.erros.join(' ')).toMatch(/Sem pesagem real de até 2 dia/);
    // A: 300 + 310 + 290 = 900 kg; B: 400 kg. 130.000 em 900:400 = 90.000 e 40.000.
    const r = await amb.ok('rateio:criar', comPeso(30));
    expect(valorPorRotulo(r.destinos)).toEqual({ 'Lote A': 90000, 'Lote B': 40000 });
    expect(r.idadeMaximaPesagemDias).toBe(30);
  });

  it('manual: pesos informados para lote e animal, sem estimativa', async () => {
    const l = await despesa(3000, { tipo: 'propriedade' });
    const r = await amb.ok(
      'rateio:criar',
      dadosRateio(l.id, {
        criterio: 'manual',
        manual: [
          { tipo: 'animal', id: animal['a1']!, peso: 2 },
          { tipo: 'lote', id: loteB, peso: 1 },
        ],
      }),
    );
    expect(valorPorRotulo(r.destinos)).toEqual({ a1: 2000, 'Lote B': 1000 });
    expect(r.baseMudou).toBeNull();
    expect(await totalDo('a1')).toBe(30000 + 2000);
    expect(await totalDo('b1')).toBe(30000 + 1000);
    expect(await totalDo('a2')).toBe(30000);
  });

  it('recusa peso zero, destino repetido, destino de outra propriedade e data-base futura', async () => {
    const l = await despesa(3000, { tipo: 'propriedade' });
    const manual = (m: unknown[]) => dadosRateio(l.id, { criterio: 'manual', manual: m });
    expect(
      erro(await amb.chamar('rateio:criar', manual([{ tipo: 'lote', id: loteA, peso: 0 }]))),
    ).toMatch(/maior que zero/);
    expect(
      erro(
        await amb.chamar(
          'rateio:criar',
          manual([
            { tipo: 'lote', id: loteA, peso: 1 },
            { tipo: 'lote', id: loteA, peso: 1 },
          ]),
        ),
      ),
    ).toMatch(/repetido/);
    const outra = (await criarPropriedade(amb, 'Outra')).id;
    const loteOutra = (await criarLote(amb, outra, 'Lote da outra')).id;
    expect(
      erro(await amb.chamar('rateio:criar', manual([{ tipo: 'lote', id: loteOutra, peso: 1 }]))),
    ).toMatch(/Lote não encontrado nesta propriedade/);
    const futura = await amb.ok(
      'rateio:previa',
      previaDe(dadosRateio(l.id, { dataBase: '2026-12-01' })),
    );
    expect(futura.erros.join(' ')).toMatch(/futura/);
    expect(contar(amb, 'rateio_custo')).toBe(0);
  });

  it('recusa o custo de outra propriedade', async () => {
    const l = await despesa(3000, { tipo: 'propriedade' });
    const outra = (await criarPropriedade(amb, 'Outra')).id;
    expect(
      erro(await amb.chamar('rateio:criar', dadosRateio(l.id, { propriedadeId: outra }))),
    ).toMatch(/outra propriedade/);
  });
});

describe('ciclo de vida do rateio', () => {
  it('revisar cria versão nova, cancela a anterior e o custo continua contado uma só vez', async () => {
    const l = await despesa(100001, { tipo: 'propriedade' });
    const r1 = await amb.ok('rateio:criar', dadosRateio(l.id));
    const r2 = await amb.ok('rateio:revisar', {
      id: r1.id,
      requisicaoId: gerarUuidV7(),
      criterio: 'manual',
      dataBase: '2026-10-10',
      periodoInicio: null,
      periodoFim: null,
      idadeMaximaPesagemDias: null,
      manual: [{ tipo: 'lote', id: loteB, peso: 1 }],
      motivo: 'Todo o custo é do lote B',
    });
    expect(valorPorRotulo(r2.destinos)).toEqual({ 'Lote B': 100001 });
    expect(r2.versoes.map((v) => [v.id, v.cancelado])).toEqual([
      [r1.id, true],
      [r2.id, false],
    ]);
    const antigo = await amb.ok('rateio:obter', { id: r1.id });
    expect(antigo).toMatchObject({ cancelado: true, baseMudou: null });
    expect(antigo.motivoCancelamento).toMatch(/Substituído por revisão/);
    expect(contar(amb, 'rateio_custo', 'deleted_at IS NULL')).toBe(1);
    expect(
      (await amb.ok('rateio:listar', { propriedadeId: prop, incluirCancelados: false })).length,
    ).toBe(1);
    expect(
      (await amb.ok('rateio:listar', { propriedadeId: prop, incluirCancelados: true })).length,
    ).toBe(2);
    expect((await lotePorNome('Lote A'))?.rateadoCentavos ?? 0).toBe(0);
    expect((await lotePorNome('Lote B'))?.rateadoCentavos).toBe(100001);
    // Trilha: criação, cancelamento da versão antiga e criação da nova.
    expect(contar(amb, 'historico_alteracao', "entidade = 'rateio_custo'")).toBe(3);
  });

  it('cancelar devolve o custo a "não alocado" e não se cancela duas vezes', async () => {
    const l = await despesa(5000, { tipo: 'propriedade' });
    const r = await amb.ok('rateio:criar', dadosRateio(l.id));
    expect((await resumo()).naoAlocado.apuracao.valorConhecidoCentavos).toBe(0);
    await amb.ok('rateio:cancelar', { id: r.id, motivo: 'Critério errado' });
    expect((await resumo()).naoAlocado.apuracao.valorConhecidoCentavos).toBe(5000);
    expect((await amb.ok('rateio:pendentes', { propriedadeId: prop })).itens).toHaveLength(1);
    expect(erro(await amb.chamar('rateio:cancelar', { id: r.id, motivo: 'de novo' }))).toMatch(
      /já está cancelado/,
    );
    expect(
      erro(
        await amb.chamar('rateio:revisar', {
          id: r.id,
          requisicaoId: gerarUuidV7(),
          criterio: 'cabecas',
          dataBase: '2026-10-10',
          periodoInicio: null,
          periodoFim: null,
          idadeMaximaPesagemDias: null,
          manual: [],
          motivo: 'x',
        }),
      ),
    ).toMatch(/Só um rateio ativo/);
    // Cancelado, o custo pode ganhar um rateio novo.
    await amb.ok('rateio:criar', dadosRateio(l.id));
  });

  it('um custo não tem dois rateios ativos', async () => {
    const l = await despesa(5000, { tipo: 'propriedade' });
    await amb.ok('rateio:criar', dadosRateio(l.id));
    expect(erro(await amb.chamar('rateio:criar', dadosRateio(l.id)))).toMatch(
      /já tem rateio ativo/,
    );
  });

  it('é idempotente por identificador e recusa o mesmo identificador com outro conteúdo', async () => {
    const l = await despesa(5000, { tipo: 'propriedade' });
    const dados = dadosRateio(l.id);
    const a = await amb.ok('rateio:criar', dados);
    const b = await amb.ok('rateio:criar', dados);
    expect(b.id).toBe(a.id);
    expect(contar(amb, 'rateio_custo')).toBe(1);
    expect(erro(await amb.chamar('rateio:criar', { ...dados, dataBase: '2026-10-09' }))).toMatch(
      /identificador da operação já foi usado/,
    );
  });

  it('lançamento rateado não muda de destino nem de categoria; cancelar o lançamento deixa o rateio sem efeito', async () => {
    const l = await despesa(5000, { tipo: 'propriedade' });
    const r = await amb.ok('rateio:criar', dadosRateio(l.id));
    const edicao = (destino: unknown) => ({
      id: l.id,
      dados: {
        categoriaId: categoria,
        pessoaId: null,
        dataCompetencia: '2026-10-06',
        descricao: 'Despesa',
        documentoNumero: null,
        atividade: 'nao_definida' as const,
        destino,
        quantidade: null,
        comportamentoCusto: null,
        observacoes: null,
      },
      motivo: 'Mudança de destino',
    });
    expect(
      erro(
        await amb.chamar('lancamento:atualizar', edicao({ tipo: 'lote', loteId: loteA }) as never),
      ),
    ).toMatch(/rateado entre lotes ou animais/);
    // Corrigir só a descrição continua permitido.
    await amb.ok('lancamento:atualizar', edicao({ tipo: 'propriedade' }) as never);

    await amb.ok('lancamento:cancelar', { id: l.id, motivo: 'Lançado em duplicidade' });
    const depois = await amb.ok('rateio:obter', { id: r.id });
    expect(depois.origemCancelada).toBe(true);
    const res = await resumo();
    expect(res.naoAlocado.apuracao.valorConhecidoCentavos).toBe(0);
    expect(res.animais.apuracao.valorConhecidoCentavos).toBe(120000);
    expect(
      (await amb.ok('rateio:listar', { propriedadeId: prop, incluirCancelados: false }))[0],
    ).toMatchObject({ origemCancelada: true });
    await amb.ok('rateio:cancelar', { id: r.id, motivo: 'Origem cancelada' });
  });

  it('despesa já lançada a lote ou animal, e compra para estoque, não aceitam rateio', async () => {
    const aLote = await despesa(5000, { tipo: 'lote', loteId: loteA });
    expect(erro(await amb.chamar('rateio:criar', dadosRateio(aLote.id)))).toMatch(
      /já tem lote ou animal como destino/,
    );
    const compra = (
      await categoriaPorNome(amb, 'Insumos para estoque (ração, silagem, suplemento, mineral)')
    ).id;
    const estoque = await criarLancamento(
      amb,
      dadosDeLancamento(prop, compra, { valorTotalCentavos: 1000 }),
    );
    expect(erro(await amb.chamar('rateio:criar', dadosRateio(estoque.id)))).toMatch(
      /Compras para estoque viram custo no consumo/,
    );
  });
});

describe('defesa no banco', () => {
  it('o banco recusa segundo rateio ativo, alteração, exclusão e origem não elegível', async () => {
    const l = await despesa(5000, { tipo: 'propriedade' });
    const r = await amb.ok('rateio:criar', dadosRateio(l.id));
    const db = amb.gerenciador.conexao;
    const agora = '2026-10-16T12:00:00.000Z';
    const inserir = (origemId: string, req = gerarUuidV7()) =>
      db
        .prepare(
          `INSERT INTO rateio_custo(id,propriedade_id,origem_tipo,origem_id,criterio,data_base,motivo,requisicao_id,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          gerarUuidV7(),
          prop,
          'lancamento',
          origemId,
          'cabecas',
          '2026-10-10',
          'm',
          req,
          agora,
          agora,
        );
    expect(() => inserir(l.id)).toThrow(/UNIQUE/);
    expect(() =>
      db.prepare("UPDATE rateio_custo SET criterio = 'manual' WHERE id = ?").run(r.id),
    ).toThrow(/cancelado/);
    expect(() => db.prepare('DELETE FROM rateio_custo WHERE id = ?').run(r.id)).toThrow(
      /Exclusão física proibida/,
    );
    expect(() =>
      db.prepare('UPDATE rateio_custo_item SET peso_relativo = 9 WHERE rateio_id = ?').run(r.id),
    ).toThrow(/não mudam/);
    expect(() => db.prepare('DELETE FROM rateio_custo_item WHERE rateio_id = ?').run(r.id)).toThrow(
      /Exclusão física proibida/,
    );
    const aLote = await despesa(5000, { tipo: 'lote', loteId: loteA });
    expect(() => inserir(aLote.id)).toThrow(/Origem não elegível/);
  });
});

describe('consumo de estoque', () => {
  let racao: string;
  const dados = (
    tipo: DadosMovimentoEstoque['tipo'],
    quantidade: number,
    extra: Partial<DadosMovimentoEstoque> = {},
  ): DadosMovimentoEstoque => ({
    data: '2026-10-01',
    tipo,
    quantidade,
    unidadeBase: 'kg',
    loteEstoqueId: null,
    custoEntradaCentavos: tipo.startsWith('entrada') ? 100000 : null,
    destino: tipo.startsWith('entrada') ? null : 'propriedade',
    loteAnimalId: null,
    animalId: null,
    documentoOrigemId: null,
    motivo: null,
    observacao: null,
    ...extra,
  });
  const mover = (itemId: string, d: DadosMovimentoEstoque) =>
    amb.ok('estoque:registrar', { itemId, requisicaoId: gerarUuidV7(), dados: d });
  async function criarItem(nome: string, extra: Record<string, unknown> = {}) {
    return (
      await amb.ok('estoque:criarItem', {
        propriedadeId: prop,
        dados: {
          nome,
          tipo: 'racao',
          unidadeBase: 'kg',
          controleLote: false,
          estoqueMinimo: null,
          produtoSanitarioId: null,
          ativo: true,
          observacoes: null,
          ...extra,
        } as never,
      })
    ).id;
  }
  beforeEach(async () => {
    racao = await criarItem('Ração');
  });

  it('rateio do consumo da propriedade acompanha a correção retroativa do estoque, sem contar o custo duas vezes', async () => {
    await mover(racao, dados('entrada_compra', 1000));
    const consumo = await mover(racao, dados('saida_consumo', 400, { data: '2026-10-05' }));
    expect(consumo.custoApropriadoCentavos).toBe(40000);

    const pendentes = await amb.ok('rateio:pendentes', { propriedadeId: prop });
    expect(pendentes.itens).toMatchObject([
      { origemTipo: 'movimentacao_estoque', origemId: consumo.id, valorCentavos: 40000 },
    ]);
    const r = await amb.ok(
      'rateio:criar',
      dadosRateio(consumo.id, { origemTipo: 'movimentacao_estoque' }),
    );
    expect(valorPorRotulo(r.destinos)).toEqual({ 'Lote A': 30000, 'Lote B': 10000 });
    expect(await totalDo('b1')).toBe(30000 + 10000);

    // O consumo era de 500 kg: o estoque cria o movimento corrigido e recalcula o custo.
    await amb.ok('estoque:corrigir', {
      id: consumo.id,
      requisicaoId: gerarUuidV7(),
      dados: dados('saida_consumo', 500, { data: '2026-10-05' }),
      motivo: 'Quantidade conferida na balança',
    });
    const depois = await amb.ok('rateio:obter', { id: r.id });
    expect(depois.origem.valorCentavos).toBe(50000);
    expect(valorPorRotulo(depois.destinos)).toEqual({ 'Lote A': 37500, 'Lote B': 12500 });
    expect(await totalDo('b1')).toBe(30000 + 12500);
    expect((await amb.ok('rateio:pendentes', { propriedadeId: prop })).itens).toEqual([]);
    expect((await resumo()).naoAlocado.apuracao.valorConhecidoCentavos).toBe(0);

    // Cancelar o consumo corrigido tira o custo de todo lugar; o rateio sinaliza a origem cancelada.
    const vigente = (await amb.ok('estoque:obter', { id: racao })).movimentos.find(
      (m) => m.tipo === 'saida_consumo' && !m.canceladoEm,
    )!;
    await amb.ok('estoque:cancelar', { id: vigente.id, motivo: 'Consumo lançado por engano' });
    expect((await amb.ok('rateio:obter', { id: r.id })).origemCancelada).toBe(true);
    expect(await totalDo('b1')).toBe(30000);
  });

  it('consumo sem custo conhecido continua desconhecido (nunca zero) até o estoque ser corrigido', async () => {
    const feno = await criarItem('Feno', { tipo: 'volumoso' });
    const entrada = await mover(
      feno,
      dados('entrada_producao', 10, { custoEntradaCentavos: null }),
    );
    const consumo = await mover(feno, dados('saida_consumo', 2, { data: '2026-10-05' }));
    expect(consumo.custoApropriadoCentavos).toBeNull();

    const previa = await amb.ok(
      'rateio:previa',
      previaDe(dadosRateio(consumo.id, { origemTipo: 'movimentacao_estoque' })),
    );
    expect(previa.destinos.map((d) => d.valorCentavos)).toEqual([null, null]);
    expect(previa.somaCentavos).toBeNull();
    const r = await amb.ok(
      'rateio:criar',
      dadosRateio(consumo.id, { origemTipo: 'movimentacao_estoque' }),
    );
    const res = await resumo();
    expect(res.desconhecidosDeOrigem).toBe(1);
    expect(res.lotes.find((l) => l.loteNome === 'Lote A')).toMatchObject({
      desconhecidos: 1,
      rateadoCentavos: 0,
    });
    const a1 = await amb.ok('custo:animal', { animalId: animal['a1']! });
    expect(a1.apuracao).toMatchObject({ estado: 'parcial', valorConhecidoCentavos: 30000 });
    expect(a1.linhas.some((l) => l.valorCentavos === null)).toBe(true);

    // Custo da produção apurado depois: R$ 10,00 em 10 kg; 2 kg custam R$ 2,00, 3:1 entre os lotes.
    await amb.ok('estoque:corrigir', {
      id: entrada.id,
      requisicaoId: gerarUuidV7(),
      dados: dados('entrada_producao', 10, { custoEntradaCentavos: 1000 }),
      motivo: 'Custo da produção apurado',
    });
    const depois = await amb.ok('rateio:obter', { id: r.id });
    expect(depois.origem.valorCentavos).toBe(200);
    expect(valorPorRotulo(depois.destinos)).toEqual({ 'Lote A': 150, 'Lote B': 50 });
    expect((await resumo()).desconhecidosDeOrigem).toBe(0);
  });

  it('consumo lançado ao lote ou ao animal vai direto, sem rateio', async () => {
    await mover(racao, dados('entrada_compra', 1000));
    await mover(
      racao,
      dados('saida_consumo', 100, { data: '2026-10-05', destino: 'lote', loteAnimalId: loteA }),
    );
    await mover(
      racao,
      dados('saida_consumo', 50, {
        data: '2026-10-05',
        destino: 'animal',
        animalId: animal['b1']!,
      }),
    );
    // 100 kg = R$ 100,00 divididos em 3 animais do lote A (33,34 / 33,33 / 33,33); 50 kg = R$ 50,00 ao b1.
    expect(await totalDo('b1')).toBe(30000 + 5000);
    const doA = (await totalDo('a1')) + (await totalDo('a2')) + (await totalDo('a3'));
    expect(doA).toBe(90000 + 10000);
    const e = await amb.ok('custo:animal', { animalId: animal['b1']! });
    expect(e.porCategoria.find((c) => c.categoria === 'alimentacao')?.valorCentavos).toBe(5000);
  });
});

describe('custo sanitário sem duplicação', () => {
  it('o custo do registro vem do estoque, é dividido entre os animais tratados e bate com o card sanitário', async () => {
    const produto = (
      await amb.ok('produtoSanitario:criar', {
        dados: {
          nome: 'Produto',
          tipo: 'outro',
          fabricante: null,
          principioAtivo: null,
          unidadeDose: null,
          carenciaCarneDias: null,
          carenciaLeiteDias: null,
          observacoes: null,
        },
      })
    ).id;
    const medicamento = (
      await amb.ok('estoque:criarItem', {
        propriedadeId: prop,
        dados: {
          nome: 'Medicamento',
          tipo: 'medicamento',
          unidadeBase: 'ml',
          controleLote: false,
          estoqueMinimo: null,
          produtoSanitarioId: produto,
          ativo: true,
          observacoes: null,
        } as never,
      })
    ).id;
    await amb.ok('estoque:registrar', {
      itemId: medicamento,
      requisicaoId: gerarUuidV7(),
      dados: {
        data: '2026-09-01',
        tipo: 'entrada_compra',
        quantidade: 100,
        unidadeBase: 'ml',
        loteEstoqueId: null,
        custoEntradaCentavos: 2000,
        destino: null,
        loteAnimalId: null,
        animalId: null,
        documentoOrigemId: null,
        motivo: null,
        observacao: null,
      },
    });
    const m = await amb.ok('manejoSanitario:registrar', {
      propriedadeId: prop,
      dados: {
        tipo: 'tratamento',
        data: '2026-10-02',
        produtoId: produto,
        descricao: null,
        dose: null,
        unidadeDose: null,
        via: null,
        carenciaCarneDias: null,
        carenciaLeiteDias: null,
        responsavel: null,
        diagnostico: null,
        custoTotalCentavos: 9000,
        observacoes: null,
      },
      animais: [
        { animalId: animal['a1']!, dose: null },
        { animalId: animal['a2']!, dose: null },
      ],
      consumosEstoque: [
        {
          requisicaoId: gerarUuidV7(),
          itemId: medicamento,
          loteEstoqueId: null,
          quantidade: 5,
          unidadeBase: 'ml',
        },
      ],
    });
    // 5 ml a R$ 0,20/ml = R$ 1,00, dividido por igual entre 2 animais; o valor digitado (R$ 90,00)
    // não conta porque já há baixa de estoque.
    const card = await amb.ok('custoSanitario:obter', { manejoId: m.id });
    expect(card.porAnimal.map((p) => p.valorCentavos)).toEqual([50, 50]);
    for (const nome of ['a1', 'a2']) {
      const e = await amb.ok('custo:animal', { animalId: animal[nome]! });
      expect(e.apuracao.valorConhecidoCentavos).toBe(30050);
      expect(e.linhas.find((l) => l.via === 'animais_tratados')).toMatchObject({
        categoria: 'sanidade',
        valorCentavos: 50,
        origem: { tipo: 'manejo_sanitario', id: m.id },
      });
    }
    expect(await totalDo('a3')).toBe(30000);
    expect((await resumo()).totalDeOrigemCentavos).toBe(120000 + 100);

    // O consumo do registro sanitário já tem destino (os animais tratados): não aceita rateio.
    const baixa = (
      await amb.ok('consumo:listar', { propriedadeId: prop, pagina: 1, tamanhoPagina: 50 } as never)
    ).itens.find((c) => c.manejoSanitarioId === m.id)!;
    expect(
      erro(
        await amb.chamar(
          'rateio:criar',
          dadosRateio(baixa.movimentacaoId, { origemTipo: 'movimentacao_estoque' }),
        ),
      ),
    ).toMatch(/registro sanitário/);
  });
});

describe('custo sanitário informado no registro', () => {
  it('conta quando é a única fonte, dividido por igual entre os animais tratados, e sem custo algum o animal não recebe nada', async () => {
    const produto = (
      await amb.ok('produtoSanitario:criar', {
        dados: {
          nome: 'Produto',
          tipo: 'outro',
          fabricante: null,
          principioAtivo: null,
          unidadeDose: null,
          carenciaCarneDias: null,
          carenciaLeiteDias: null,
          observacoes: null,
        },
      })
    ).id;
    const registrar = (custo: number | null, ids: string[]) =>
      amb.ok('manejoSanitario:registrar', {
        propriedadeId: prop,
        dados: {
          tipo: 'tratamento',
          data: '2026-10-02',
          produtoId: produto,
          descricao: null,
          dose: null,
          unidadeDose: null,
          via: null,
          carenciaCarneDias: null,
          carenciaLeiteDias: null,
          responsavel: null,
          diagnostico: null,
          custoTotalCentavos: custo,
          observacoes: null,
        },
        animais: ids.map((animalId) => ({ animalId, dose: null })),
        consumosEstoque: [],
      });
    await registrar(7001, [animal['a1']!, animal['b1']!]);
    // R$ 70,01 em 2 animais: 35,01 e 35,00 (a sobra de 1 centavo é sempre distribuída).
    const a1 = (await totalDo('a1')) - 30000;
    const b1 = (await totalDo('b1')) - 30000;
    expect([a1, b1].sort()).toEqual([3500, 3501]);
    expect((await resumo()).totalDeOrigemCentavos).toBe(120000 + 7001);
    // Registro sem nenhum custo informado: nada é inventado, nem zero.
    await registrar(null, [animal['a2']!]);
    expect(await totalDo('a2')).toBe(30000);
    expect((await resumo()).totalDeOrigemCentavos).toBe(120000 + 7001);
  });
});

describe('custos anteriores ao sistema', () => {
  it('entram no custo do animal uma vez, como custo anterior, sem tocar o caixa', async () => {
    const nascido = await amb.ok('animal:criar', {
      propriedadeId: prop,
      dados: {
        identificacao: 'n1',
        nome: null,
        sexo: 'M',
        condicaoSexual: 'inteiro',
        categoria: 'bezerro',
        aptidao: 'corte',
        racaId: null,
        dataNascimento: '2026-01-10',
        dataNascimentoEstimada: false,
        maeId: null,
        paiId: null,
        origem: 'nascido',
        observacoes: null,
      },
      entrada: { data: '2026-01-10', loteId: loteB, pesoVivoKg: null, metodoPesagem: null },
    });
    const sem = await amb.ok('custo:animal', { animalId: nascido.id });
    expect(sem.apuracao.estado).toBe('nao_apurada');
    expect(sem.avisos.join(' ')).toMatch(/formação anterior ao sistema/);
    await amb.ok('custoAnterior:registrar', {
      requisicaoId: gerarUuidV7(),
      propriedadeId: prop,
      destino: { tipo: 'animal', animalId: nascido.id },
      valorCentavos: 45000,
      dataReferencia: '2026-09-30',
      descricao: 'Criação até o desmame',
      origemInformacao: 'Caderno de campo',
      justificativa: 'Valor informado pelo produtor',
      confirmarSemDuplicidade: true,
    } as never);
    const com = await amb.ok('custo:animal', { animalId: nascido.id });
    expect(com.apuracao).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 45000 });
    expect(com.linhas[0]).toMatchObject({ categoria: 'custo_anterior', valorCentavos: 45000 });
    expect(com.avisos).toEqual([]);
  });
});

describe('listagem de custos por animal', () => {
  it('pagina, filtra por lote e busca, e marca animal sem custo como não apurado', async () => {
    await despesa(9000, { tipo: 'lote', loteId: loteA }, '2026-10-05');
    const todos = await amb.ok('custo:animais', {
      propriedadeId: prop,
      pagina: 1,
      tamanhoPagina: 2,
    });
    expect(todos).toMatchObject({ total: 4, pagina: 1, tamanhoPagina: 2 });
    expect(todos.itens.map((i) => i.identificacao)).toEqual(['a1', 'a2']);
    const doB = await amb.ok('custo:animais', {
      propriedadeId: prop,
      loteId: loteB,
      pagina: 1,
      tamanhoPagina: 50,
    });
    expect(doB.itens.map((i) => i.identificacao)).toEqual(['b1']);
    const busca = await amb.ok('custo:animais', {
      propriedadeId: prop,
      busca: 'A3',
      pagina: 1,
      tamanhoPagina: 50,
    });
    expect(busca.itens.map((i) => i.identificacao)).toEqual(['a3']);
    // No período anterior às compras ninguém tem custo.
    const antes = await amb.ok('custo:animais', {
      propriedadeId: prop,
      dataInicial: '2026-01-01',
      dataFinal: '2026-09-30',
      pagina: 1,
      tamanhoPagina: 50,
    });
    expect(antes.itens.every((i) => i.apuracao.estado === 'nao_apurada')).toBe(true);
  });
});
