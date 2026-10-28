import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apurarComponentes } from '@pecuaria/domain';
import type { Relatorio } from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import { criarServicosRebanho } from '../rebanho';
import {
  DATA_DO_RELOGIO,
  categoriaPorNome,
  conferirInvariantes,
  contar,
  criarLancamento,
  criarPropriedade,
  dadosDeLancamento,
} from './apoio-teste';
import {
  comprar,
  criarLote,
  dadosDeAnimal,
  dadosDeCompra,
  dadosDeVenda,
  vender,
} from './apoio-animais';

/**
 * Entrega 4H: relatórios gerenciais e exportação. Os números dos relatórios são os mesmos das
 * telas (mesmos serviços); o documento da contraparte só sai com opção explícita; exportar não
 * grava nada no banco.
 */
let amb: AmbienteIpc;
let prop: string;
let loteA: string;
let salvos: { nome: string; formato: 'csv' | 'pdf'; conteudo: string }[];
const animal: Record<string, string> = {};
const P = { dataInicial: '2026-09-01', dataFinal: '2026-10-16' };
const aVista = (data: string) => ({
  tipo: 'a_vista' as const,
  vencimento: data,
  pagamento: { data, forma: null },
});
const filtros = (extra: Record<string, unknown> = {}) => ({
  propriedadeId: prop,
  ...P,
  loteId: null,
  animalId: null,
  incluirDocumentos: false,
  ...extra,
});
const celulasDe = (r: Relatorio, titulo: string) => r.secoes.find((s) => s.titulo === titulo);

beforeEach(async () => {
  salvos = [];
  amb = await criarAmbienteIpc({
    hoje: DATA_DO_RELOGIO,
    dialogos: {
      salvarRelatorio: async (nome, formato, conteudo) => {
        salvos.push({ nome, formato, conteudo });
        return { caminho: `C:/tmp/${nome}.${formato}`, bytes: conteudo.length };
      },
    },
  });
  prop = (await criarPropriedade(amb, 'Fazenda dos relatórios')).id;
  loteA = (await criarLote(amb, prop, 'Lote A')).id;
  const fornecedor = await amb.ok('pessoaComercial:criar', {
    dados: {
      nome: 'Leilões Vale',
      papel: 'fornecedor',
      documento: '12.345.678/0001-90',
      observacoes: null,
      ativo: true,
    },
  });
  const c = await comprar(
    amb,
    dadosDeCompra(prop, [{ identificacao: 'a1' }, { identificacao: 'a2' }], {
      loteId: loteA,
      valorTotalCentavos: 200000,
      data: '2026-09-01',
      pessoaId: fornecedor.id,
      condicao: aVista('2026-09-01'),
    }),
  );
  for (const i of c.itens) animal[i.animalIdentificacao] = i.animalId;
  await criarLancamento(
    amb,
    dadosDeLancamento(
      prop,
      (await categoriaPorNome(amb, 'Alimentação (despesa direta, sem estoque)')).id,
      {
        valorTotalCentavos: 9000,
        dataCompetencia: '2026-09-10',
        descricao: '=HIPERLINK("x")',
        destino: { tipo: 'lote', loteId: loteA },
        condicao: { tipo: 'nao_informada' },
      },
    ),
  );
  await vender(
    amb,
    dadosDeVenda(prop, [{ animalId: animal['a1']!, pesoVivoKg: 450, pesoCarcacaKg: 240 }], {
      valorTotalCentavos: 150000,
      data: '2026-10-10',
      condicao: aVista('2026-10-10'),
    }),
  );
});
afterEach(() => {
  expect(conferirInvariantes(amb)).toEqual([]);
  amb.encerrar();
});

describe('relatórios gerenciais', () => {
  it('o relatório de resultado traz os mesmos números da tela, com a visão no título', async () => {
    const r = await amb.ok('relatorio:montar', { tipo: 'resultado', filtros: filtros() });
    const tela = await amb.ok('resultado:periodo', { propriedadeId: prop, ...P });
    expect(r).toMatchObject({
      titulo: 'Resultado do período',
      visao: 'Caixa e resultado',
      propriedade: 'Fazenda dos relatórios',
      periodo: '01/09/2026 a 16/10/2026',
    });
    const comp = celulasDe(r, 'Competência (resultado)')!;
    expect(comp.indicadores!.find((i) => i.rotulo === 'Receitas (líquidas)')!.valor).toBe(
      tela.competencia.receitas.totalCentavos,
    );
    expect(comp.indicadores!.find((i) => i.rotulo === 'Resultado (margem líquida)')!.valor).toBe(
      tela.competencia.resultadoCentavos,
    );
    // a1: aquisição R$ 1.000,00 + metade de R$ 90,00 do lote = R$ 1.045,00; vendido por R$ 1.500,00.
    const animais = celulasDe(r, 'Animais que saíram')!;
    expect(animais.linhas).toHaveLength(1);
    expect(animais.linhas![0]![0]).toBe('a1');
    expect(animais.linhas![0]![5]).toBe(150000 - 104500);
  });

  it('resultado parcial é sinalizado: animal sem custo de aquisição e venda sem receita registrada', async () => {
    const nascido = await amb.ok('animal:criar', {
      propriedadeId: prop,
      dados: dadosDeAnimal('n1', { origem: 'nascido', dataNascimento: '2026-09-02' }),
      entrada: { data: '2026-09-02', loteId: null, pesoVivoKg: null, metodoPesagem: null },
    });
    await amb.ok('animal:registrarSaida', {
      id: nascido.id,
      tipo: 'morto',
      data: '2026-10-01',
      motivo: null,
    });
    await amb.ok('animal:registrarSaida', {
      id: animal['a2']!,
      tipo: 'vendido',
      data: '2026-10-12',
      motivo: null,
    });
    const r = await amb.ok('relatorio:montar', { tipo: 'resultado', filtros: filtros() });
    expect(r.avisos.join(' ')).toMatch(/1 animal\(is\) saíram sem custo de aquisição/);
    // Mesmo texto da tela (regra e textos centrais): faltam receita e custo, sem limite.
    expect(r.avisos.join(' ')).toMatch(
      /Parcial: 1 venda\(s\) ou descarte\(s\) sem receita registrada e custo desconhecido ou não apurado/,
    );
    const porLote = celulasDe(r, 'Resultado realizado por lote de saída')!;
    const coluna = porLote.colunas!.findIndex((c) => c.rotulo === 'Saídas sem receita registrada');
    const loteDeA = porLote.linhas!.find((l) => l[0] === 'Lote A')!;
    expect(loteDeA[coluna]).toBe(1);
    expect(loteDeA[loteDeA.length - 1]).toBe('Parcial: no mínimo');
    // A competência não se diz "completa" quando falta receita de venda.
    const resultado = celulasDe(r, 'Competência (resultado)')!.indicadores!.find(
      (i) => i.rotulo === 'Resultado (margem líquida)',
    )!;
    expect(resultado.observacao).toBe('Parcial: só o conhecido, não é limite');
    // A receita e o resultado de a2 são ausentes (null), nunca zero; no CSV saem vazios.
    const a2 = celulasDe(r, 'Animais que saíram')!.linhas!.find((l) => l[0] === 'a2')!;
    expect(a2[3]).toBeNull();
    expect(a2[5]).toBeNull();
    expect(a2[6]).toBe('Não apurado');
    await amb.ok('relatorio:exportar', { tipo: 'resultado', formato: 'csv', filtros: filtros() });
    expect(salvos[0]!.conteudo).toMatch(
      /\r\na2;Vendido;2026-10-12;;desconhecido;\d+;[\d,]+;completo;;desconhecido;Não apurado\r\n/,
    );
  });

  it('custos, animal, lote, fluxo e conciliação montam sem recalcular por outro caminho', async () => {
    const custos = await amb.ok('relatorio:montar', {
      tipo: 'custos',
      filtros: filtros({ dataInicial: null, dataFinal: null }),
    });
    expect(custos.periodo).toBe('Todo o histórico');
    expect(celulasDe(custos, 'Por animal')!.linhas!.map((l) => [l[0], l[2]])).toEqual([
      ['a1', 'Vendido'],
      ['a2', 'Ativo'],
    ]);
    const a = await amb.ok('relatorio:montar', {
      tipo: 'animal',
      filtros: filtros({ animalId: animal['a2'] }),
    });
    expect(a.secoes[0]!.titulo).toBe('Animal a2');
    const lote = await amb.ok('relatorio:montar', {
      tipo: 'lote',
      filtros: filtros({ loteId: loteA }),
    });
    expect(lote.secoes[0]!.linhas).toHaveLength(1);
    const fluxo = await amb.ok('relatorio:montar', { tipo: 'fluxo', filtros: filtros() });
    const telaFluxo = await amb.ok('fluxo:obter', { propriedadeId: prop, ...P });
    expect(
      celulasDe(fluxo, 'Realizado')!.indicadores!.find((i) => i.rotulo === 'Saldo do movimento')!
        .valor,
    ).toBe(telaFluxo.realizado.saldoCentavos);
    const conc = await amb.ok('relatorio:montar', { tipo: 'conciliacao', filtros: filtros() });
    expect(celulasDe(conc, 'Linhas')!.linhas!.length).toBe(7);
  });

  it('lançamentos: o documento da contraparte só sai com a opção marcada; saldo desconhecido não vira zero', async () => {
    const sem = await amb.ok('relatorio:montar', { tipo: 'lancamentos', filtros: filtros() });
    const tabela = sem.secoes[0]!;
    expect(tabela.colunas!.map((c) => c.rotulo)).not.toContain('Documento da contraparte');
    expect(JSON.stringify(sem)).not.toContain('12.345.678/0001-90');
    expect(sem.avisos.join(' ')).toMatch(/não foi incluído/);
    // A despesa sem condição de pagamento tem o "em aberto" ausente, nunca zero.
    const indiceAberto = tabela.colunas!.findIndex((c) => c.rotulo === 'Em aberto');
    expect(tabela.linhas!.some((l) => l[indiceAberto] === null)).toBe(true);
    const com = await amb.ok('relatorio:montar', {
      tipo: 'lancamentos',
      filtros: filtros({ incluirDocumentos: true }),
    });
    expect(com.secoes[0]!.colunas!.map((c) => c.rotulo)).toContain('Documento da contraparte');
    expect(JSON.stringify(com)).toContain('12.345.678/0001-90');
  });

  it('conferência integral: todas as verificações fecham e as pendências aparecem', async () => {
    const r = await amb.ok('relatorio:montar', { tipo: 'conferencia', filtros: filtros() });
    const linhas = r.secoes[0]!.linhas!;
    const situacao = Object.fromEntries(linhas.map((l) => [l[0], l[1]]));
    expect(situacao['Apropriação de custos']).toBe('Fecha');
    expect(situacao['Conciliação']).toBe('Fecha');
    expect(situacao['Caixa']).toBe('Fecha');
    expect(situacao['Resultado']).toBe('Fecha');
    expect(situacao['Lançamentos sem condição de pagamento']).toBe('1 lançamento(s)');
    expect(r.avisos).toEqual([]);
  });

  it('conferência denuncia soma que não fecha e não alocado de valor desconhecido (zero não é "nenhum")', () => {
    // Serviços reais sobre o mesmo banco; só a apropriação é adulterada para simular a falha.
    const s = criarServicosRebanho(amb.gerenciador, { relogio: () => DATA_DO_RELOGIO });
    const real = s.apropriacao.resumo.bind(s.apropriacao);
    vi.spyOn(s.apropriacao, 'resumo').mockImplementation((f) => {
      const r = real(f);
      return {
        ...r,
        conferido: false,
        naoAlocado: {
          ...r.naoAlocado,
          apuracao: apurarComponentes([{ tipo: 'desconhecido' }]),
        },
      };
    });
    const r = s.relatorios.montar('conferencia', filtros());
    const situacao = Object.fromEntries(r.secoes[0]!.linhas!.map((l) => [l[0], l[1]]));
    expect(situacao['Apropriação de custos']).toBe('Não fecha');
    expect(situacao['Custo não alocado']).toBe('Há custo sem rateio');
    expect(r.avisos).toEqual(['1 verificação(ões) não fecham: não use os números até corrigir.']);
    const custos = s.relatorios.montar('custos', filtros());
    expect(custos.avisos).toContain(
      'A soma não fecha: não use estes números e registre o problema.',
    );
  });

  it('exige o período onde ele é necessário e o animal ou lote nos relatórios deles', async () => {
    const semPeriodo = await amb.chamar('relatorio:montar', {
      tipo: 'resultado',
      filtros: filtros({ dataInicial: null, dataFinal: null }),
    });
    expect(semPeriodo.ok).toBe(false);
    const semAnimal = await amb.chamar('relatorio:montar', { tipo: 'animal', filtros: filtros() });
    expect(semAnimal.ok).toBe(false);
  });
});

describe('exportação', () => {
  it('CSV e HTML do PDF saem do mesmo modelo, com nome sugerido, e nada é gravado no banco', async () => {
    const antes = ['lancamento_financeiro', 'historico_alteracao', 'movimentacao_estoque'].map(
      (t) => contar(amb, t),
    );
    const csv = await amb.ok('relatorio:exportar', {
      tipo: 'lancamentos',
      formato: 'csv',
      filtros: filtros(),
    });
    expect(csv).toEqual({
      cancelado: false,
      dados: {
        caminho: 'C:/tmp/lancamentos-2026-09-01-a-2026-10-16.csv',
        bytes: expect.any(Number),
      },
    });
    const conteudo = salvos[0]!.conteudo;
    expect(conteudo.startsWith('\uFEFFRelatório;Lançamentos do período\r\n')).toBe(true);
    // Texto livre que parece fórmula é neutralizado; valores seguem exatos em centavos.
    expect(conteudo).toContain(`"'=HIPERLINK(""x"")"`);
    expect(conteudo).toMatch(/;200000;2000,00;/);
    expect(conteudo).not.toContain('12.345.678/0001-90');
    await amb.ok('relatorio:exportar', { tipo: 'resultado', formato: 'pdf', filtros: filtros() });
    expect(salvos[1]).toMatchObject({ nome: 'resultado-2026-09-01-a-2026-10-16', formato: 'pdf' });
    expect(salvos[1]!.conteudo).toMatch(/^<!doctype html>/);
    expect(salvos[1]!.conteudo).toContain('Resultado do período');
    expect(
      ['lancamento_financeiro', 'historico_alteracao', 'movimentacao_estoque'].map((t) =>
        contar(amb, t),
      ),
    ).toEqual(antes);
  });

  it('diálogo cancelado não grava arquivo', async () => {
    const outro = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
    try {
      const p = (await criarPropriedade(outro, 'Outra')).id;
      const r = await outro.ok('relatorio:exportar', {
        tipo: 'custos',
        formato: 'csv',
        filtros: {
          propriedadeId: p,
          dataInicial: null,
          dataFinal: null,
          loteId: null,
          animalId: null,
          incluirDocumentos: false,
        },
      });
      expect(r).toEqual({ cancelado: true });
    } finally {
      outro.encerrar();
    }
  });
});
