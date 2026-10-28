import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import { DATA_DO_RELOGIO, criarPropriedade } from './apoio-teste';

/**
 * Volume sintético (RNF-03): 100.000 movimentos de estoque (consumos) em 10 itens. Valida os
 * resultados das consultas de custo apropriado; os tempos são medidos e registrados no relatório,
 * sem limite frágil na suíte.
 */
let amb: AmbienteIpc;
beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
});
afterEach(() => amb.encerrar());

describe('volume de consumos', () => {
  it('resume e lista 100.000 consumos', { timeout: 180_000 }, async () => {
    const prop = (await criarPropriedade(amb, 'Fazenda volume')).id;
    const db = amb.gerenciador.conexao;
    const agora = '2026-10-16T12:00:00.000Z';
    const itens: string[] = [];
    for (let k = 0; k < 10; k++) {
      const id = gerarUuidV7();
      itens.push(id);
      db.prepare(
        "INSERT INTO estoque_item(id,propriedade_id,nome,nome_normalizado,tipo,unidade_base,base_materia,controle_lote,created_at,updated_at) VALUES(?,?,?,?,'racao','kg','mn',0,?,?)",
      ).run(id, prop, `Item ${k}`, `item ${k}`, agora, agora);
    }
    const inserir = db.prepare(
      `INSERT INTO movimentacao_estoque(id,estoque_item_id,data,ordem,tipo,quantidade_milesimos,unidade_base,custo_apropriado_centavos,destino,requisicao_id,created_at,updated_at)
       VALUES(?,?,?,?,'saida_consumo',1000,'kg',?,'propriedade',?,?,?)`,
    );
    const N = 100_000;
    let semCusto = 0;
    let soma = 0;
    db.transaction(() => {
      for (let i = 0; i < N; i++) {
        const dia = String((i % 28) + 1).padStart(2, '0');
        const custo = i % 50 === 0 ? null : 100 + (i % 7);
        if (custo === null) semCusto += 1;
        else soma += custo;
        inserir.run(
          gerarUuidV7(),
          itens[i % 10],
          `2026-09-${dia}`,
          i + 1,
          custo,
          `r-${i}`,
          agora,
          agora,
        );
      }
    })();
    const medir = async <T>(rotulo: string, f: () => Promise<T>) => {
      const t = performance.now();
      const r = await f();
      console.warn(`[volume consumo] ${rotulo}: ${Math.round(performance.now() - t)} ms`);
      return r;
    };
    const resumo = await medir('resumo (100 mil consumos)', () =>
      amb.ok('consumo:resumo', { propriedadeId: prop }),
    );
    expect(resumo.total).toMatchObject({
      estado: 'parcial',
      valorConhecidoCentavos: soma,
      componentesDesconhecidos: semCusto,
      componentesConhecidos: N - semCusto,
    });
    expect(resumo.porItem).toHaveLength(10);
    const pagina = await medir('página de consumos', () =>
      amb.ok('consumo:listar', { propriedadeId: prop, pagina: 1, tamanhoPagina: 50 }),
    );
    expect(pagina.total).toBe(N);
    expect(pagina.itens).toHaveLength(50);
    await medir('resumo de um dia', () =>
      amb.ok('consumo:resumo', {
        propriedadeId: prop,
        dataInicial: '2026-09-05',
        dataFinal: '2026-09-05',
      }),
    );
    const pend = await medir('pendências', () =>
      amb.ok('auditoria:pendencias', { propriedadeId: prop }),
    );
    expect(pend.consumosSemCusto).toBe(semCusto);
  });
});
