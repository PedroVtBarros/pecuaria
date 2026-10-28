import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import { DATA_DO_RELOGIO, categoriaPorNome, criarPropriedade } from './apoio-teste';
import { conferirApropriacaoDoBanco } from './apoio-rateio';

/**
 * Volume sintético (RNF-03, meta do plano 9.5): 5.000 animais em 30 lotes, com trocas de lote, 100.000 consumos de
 * estoque, 20.000 despesas e 100 rateios. Valida a conservação e mede o tempo das consultas de
 * custo por lote e por animal; os tempos ficam no relatório, sem limite frágil na suíte.
 */
let amb: AmbienteIpc;
beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
});
afterEach(() => amb.encerrar());

describe('volume de apropriação e rateio', () => {
  it(
    'apropria 120.000 custos entre 5.000 animais e fecha com a soma de origem',
    { timeout: 300_000 },
    async () => {
      const prop = (await criarPropriedade(amb, 'Fazenda volume')).id;
      const categoria = (await categoriaPorNome(amb, 'Alimentação (despesa direta, sem estoque)'))
        .id;
      const db = amb.gerenciador.conexao;
      const agora = '2026-10-16T12:00:00.000Z';
      const LOTES = 30;
      const ANIMAIS = 5000;
      const lotes: string[] = [];
      for (let k = 0; k < LOTES; k++) {
        const id = gerarUuidV7();
        lotes.push(id);
        db.prepare(
          "INSERT INTO lote(id,propriedade_id,nome,nome_normalizado,finalidade,data_formacao,created_at,updated_at) VALUES(?,?,?,?,'engorda','2026-01-01',?,?)",
        ).run(id, prop, `Lote ${k}`, `lote ${k}`, agora, agora);
      }
      const item = gerarUuidV7();
      db.prepare(
        "INSERT INTO estoque_item(id,propriedade_id,nome,nome_normalizado,tipo,unidade_base,base_materia,controle_lote,created_at,updated_at) VALUES(?,?,'Ração','racao','racao','kg','mn',0,?,?)",
      ).run(item, prop, agora, agora);

      const animais: string[] = [];
      db.transaction(() => {
        for (let i = 0; i < ANIMAIS; i++) {
          const id = gerarUuidV7();
          animais.push(id);
          const inicial = lotes[i % LOTES]!;
          // Um terço dos animais troca de lote em 01/09.
          const troca = i % 3 === 0;
          const atual = troca ? lotes[(i + 1) % LOTES]! : inicial;
          db.prepare(
            "INSERT INTO animal(id,propriedade_id,lote_id,identificacao,identificacao_normalizada,sexo,condicao_sexual,categoria,aptidao,origem,data_entrada,created_at,updated_at) VALUES(?,?,?,?,?,'M','castrado','garrote','corte','comprado','2026-01-01',?,?)",
          ).run(id, prop, atual, `A${i}`, `a${i}`, agora, agora);
          db.prepare(
            "INSERT INTO movimentacao_animal(id,animal_id,tipo,data,lote_origem_id,lote_destino_id,created_at,updated_at) VALUES(?,?,'entrada','2026-01-01',NULL,?,?,?)",
          ).run(gerarUuidV7(), id, inicial, agora, agora);
          if (troca)
            db.prepare(
              "INSERT INTO movimentacao_animal(id,animal_id,tipo,data,lote_origem_id,lote_destino_id,created_at,updated_at) VALUES(?,?,'troca_lote','2026-09-01',?,?,?,?)",
            ).run(gerarUuidV7(), id, inicial, atual, agora, agora);
        }
      })();

      const inserirConsumo = db.prepare(
        `INSERT INTO movimentacao_estoque(id,estoque_item_id,data,ordem,tipo,quantidade_milesimos,unidade_base,custo_apropriado_centavos,destino,lote_animal_id,requisicao_id,created_at,updated_at)
       VALUES(?,?,?,?,'saida_consumo',1000,'kg',?,?,?,?,?,?)`,
      );
      const consumosDaPropriedade: string[] = [];
      db.transaction(() => {
        for (let i = 0; i < 100_000; i++) {
          const dia = String((i % 28) + 1).padStart(2, '0');
          const id = gerarUuidV7();
          const aoLote = i % 2 === 0;
          if (!aoLote) consumosDaPropriedade.push(id);
          inserirConsumo.run(
            id,
            item,
            `2026-09-${dia}`,
            i + 1,
            i % 40 === 0 ? null : 100 + (i % 7),
            aoLote ? 'lote' : 'propriedade',
            aoLote ? lotes[i % LOTES]! : null,
            `r-${i}`,
            agora,
            agora,
          );
        }
      })();
      const inserirLancamento = db.prepare(
        `INSERT INTO lancamento_financeiro(id,propriedade_id,categoria_id,natureza,data_competencia,valor_total_centavos,descricao,atividade,destino_tipo,lote_id,condicao_pagamento,comportamento_custo,requisicao_id,created_at,updated_at)
       VALUES(?,?,?,'despesa',?,?,?,'nao_definida',?,?,'nao_informada','nao_classificado',?,?,?)`,
      );
      const despesasDaPropriedade: string[] = [];
      db.transaction(() => {
        for (let i = 0; i < 20_000; i++) {
          const id = gerarUuidV7();
          const aoLote = i % 2 === 0;
          if (!aoLote) despesasDaPropriedade.push(id);
          inserirLancamento.run(
            id,
            prop,
            categoria,
            `2026-10-${String((i % 15) + 1).padStart(2, '0')}`,
            1000 + (i % 977),
            `Despesa ${i}`,
            aoLote ? 'lote' : 'propriedade',
            aoLote ? lotes[i % LOTES]! : null,
            `rq-${i}`,
            agora,
            agora,
          );
        }
      })();

      const medir = async <T>(rotulo: string, f: () => Promise<T>) => {
        const t = performance.now();
        const r = await f();
        console.warn(`[volume rateio] ${rotulo}: ${Math.round(performance.now() - t)} ms`);
        return r;
      };
      const pendentes = await medir('pendentes de rateio', () =>
        amb.ok('rateio:pendentes', { propriedadeId: prop }),
      );
      expect(pendentes.itens).toHaveLength(200);
      expect(pendentes.truncado).toBe(true);

      // 100 rateios por cabeças, pelo serviço (validações e pesos reais), sobre custos da propriedade.
      await medir('100 rateios por cabeças', async () => {
        for (let k = 0; k < 100; k++) {
          const origemTipo = k % 2 === 0 ? 'lancamento' : 'movimentacao_estoque';
          const origemId = (k % 2 === 0 ? despesasDaPropriedade : consumosDaPropriedade)[k]!;
          await amb.ok('rateio:criar', {
            requisicaoId: gerarUuidV7(),
            propriedadeId: prop,
            origemTipo,
            origemId,
            criterio: 'cabecas',
            dataBase: '2026-10-10',
            periodoInicio: null,
            periodoFim: null,
            idadeMaximaPesagemDias: null,
            manual: [],
            motivo: 'Volume',
          });
        }
      });

      // A primeira consulta depois de uma escrita recalcula tudo (fria); as seguintes, sem escrita no
      // meio, reaproveitam as linhas de custo memorizadas (quentes).
      const resumo = await medir('resumo, fria (120.000 custos, 5.000 animais)', () =>
        amb.ok('custo:resumo', { propriedadeId: prop }),
      );
      expect(resumo.conferido).toBe(true);
      expect(resumo.animais.quantidade).toBe(ANIMAIS);
      // Os lotes 3, 9, 15, 21 e 27 não têm animais depois de 01/09 nem custo direto: não aparecem.
      // Os lotes 0, 6, 12, 18 e 24 recebem custo direto em setembro, quando já estão vazios.
      expect(resumo.lotes).toHaveLength(LOTES - 5);
      expect(resumo.lotes.filter((l) => l.semAnimaisCentavos > 0)).toHaveLength(5);
      expect(resumo.avisos).toEqual([]);
      expect(await conferirApropriacaoDoBanco(amb)).toEqual([]);

      const pagina = await medir('página de 50 animais', () =>
        amb.ok('custo:animais', { propriedadeId: prop, pagina: 1, tamanhoPagina: 50 }),
      );
      expect(pagina).toMatchObject({ total: ANIMAIS });
      expect(pagina.itens).toHaveLength(50);
      const um = await medir('custo de um animal (de onde veio)', () =>
        amb.ok('custo:animal', { animalId: animais[1]! }),
      );
      expect(um.linhas.length).toBeGreaterThan(0);
      await medir('custo de um lote', () => amb.ok('custo:lote', { loteId: lotes[0]! }));
      await medir('resumo de uma semana', () =>
        amb.ok('custo:resumo', {
          propriedadeId: prop,
          dataInicial: '2026-09-01',
          dataFinal: '2026-09-07',
        }),
      );
      // Resultado (4G) sobre o mesmo volume.
      const P = { propriedadeId: prop, dataInicial: '2026-09-01', dataFinal: '2026-10-16' };
      const escrever = () =>
        amb.ok('lancamento:criar', {
          requisicaoId: gerarUuidV7(),
          dados: {
            propriedadeId: prop,
            categoriaId: categoria,
            pessoaId: null,
            dataCompetencia: '2026-10-15',
            valorTotalCentavos: 100,
            descricao: 'Escrita para medir a consulta fria',
            documentoNumero: null,
            atividade: 'nao_definida',
            destino: { tipo: 'propriedade' },
            quantidade: null,
            comportamentoCusto: null,
            observacoes: null,
            condicao: { tipo: 'nao_informada' },
          },
        });
      await escrever();
      const res = await medir('resultado do período, fria', () => amb.ok('resultado:periodo', P));
      await medir('resultado do período, quente', () => amb.ok('resultado:periodo', P));
      expect(res.competencia.custo.componentesDesconhecidos).toBeGreaterThan(0);
      await medir('resultado realizado', () => amb.ok('resultado:realizado', P));
      await medir('indicadores', () => amb.ok('resultado:indicadores', P));
      const conc = await medir('conciliação', () => amb.ok('resultado:conciliacao', P));
      expect(conc.totais.resultadoCompetenciaCentavos).toBe(res.competencia.valorConhecidoCentavos);
    },
  );
});
