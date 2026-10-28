import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import {
  DATA_DO_RELOGIO,
  HOJE,
  categoriaPorNome,
  conferirInvariantes,
  contar,
  criarLancamento,
  criarPropriedade,
  dadosDeLancamento,
  parcelasDe,
} from './apoio-teste';

let amb: AmbienteIpc;
let prop: string;
let despesa: string;
let receita: string;
const texto = (r: { ok: boolean; erro?: { mensagem: string; detalhes?: string[] } }) => {
  expect(r.ok).toBe(false);
  return [r.erro?.mensagem, ...(r.erro?.detalhes ?? [])].join(' | ');
};
const dados = (extra: Parameters<typeof dadosDeLancamento>[2] = {}) =>
  dadosDeLancamento(prop, despesa, extra);

beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
  prop = (await criarPropriedade(amb, 'Fazenda financeira')).id;
  despesa = (await categoriaPorNome(amb, 'Outras despesas')).id;
  receita = (await categoriaPorNome(amb, 'Outras receitas')).id;
});
afterEach(() => {
  expect(conferirInvariantes(amb)).toEqual([]);
  amb.encerrar();
});

describe('contrapartes e categorias', () => {
  it('categorias sugeridas existem, são editáveis e receita nunca tem classificação de custo', async () => {
    const todas = await amb.ok('categoriaFinanceira:listar', { incluirInativas: false });
    // 15 da 0005 + 2 da 0011 (devoluções de venda e de compra de animais).
    expect(todas).toHaveLength(17);
    expect(
      todas
        .filter((c) => c.natureza === 'receita')
        .every((c) => c.comportamentoCusto === 'nao_se_aplica'),
    ).toBe(true);
    const nova = await amb.ok('categoriaFinanceira:criar', {
      dados: {
        nome: 'Arrendamento',
        natureza: 'despesa',
        grupo: 'infraestrutura',
        tratamento: 'resultado',
        comportamentoCusto: 'fixo',
        ativa: true,
      },
    });
    expect(nova).toMatchObject({
      comportamentoCusto: 'fixo',
      origem: 'usuario',
      origemExigida: null,
    });
    const receitaNova = await amb.ok('categoriaFinanceira:criar', {
      dados: {
        nome: 'Aluguel de pasto',
        natureza: 'receita',
        grupo: 'outros',
        tratamento: 'resultado',
        comportamentoCusto: 'variavel',
        ativa: true,
      },
    });
    expect(receitaNova.comportamentoCusto).toBe('nao_se_aplica');
    const duplicada = await amb.chamar('categoriaFinanceira:criar', {
      dados: {
        nome: '  arrendamento ',
        natureza: 'despesa',
        grupo: 'outros',
        tratamento: 'resultado',
        comportamentoCusto: 'nao_classificado',
        ativa: true,
      },
    });
    expect(duplicada.ok).toBe(false);
  });

  it('estrutura da categoria fica travada depois de usada, mas a classificação padrão pode mudar', async () => {
    const c = await categoriaPorNome(amb, 'Mão de obra');
    await criarLancamento(amb, dados({ categoriaId: c.id }));
    const base = {
      nome: c.nome,
      natureza: c.natureza,
      grupo: c.grupo,
      tratamento: c.tratamento,
      ativa: true,
    };
    expect(
      texto(
        await amb.chamar('categoriaFinanceira:atualizar', {
          id: c.id,
          dados: { ...base, tratamento: 'estoque', comportamentoCusto: 'fixo' },
          motivo: null,
        }),
      ),
    ).toMatch(/já tem lançamentos/);
    const mudou = await amb.ok('categoriaFinanceira:atualizar', {
      id: c.id,
      dados: { ...base, comportamentoCusto: 'fixo' },
      motivo: 'Mão de obra fixa',
    });
    expect(mudou.comportamentoCusto).toBe('fixo');
    // Categorias de outro módulo também têm a estrutura travada.
    const compra = await categoriaPorNome(amb, 'Compra de animais');
    expect(
      (
        await amb.chamar('categoriaFinanceira:atualizar', {
          id: compra.id,
          dados: {
            nome: compra.nome,
            natureza: 'despesa',
            grupo: 'animais',
            tratamento: 'resultado',
            comportamentoCusto: 'nao_classificado',
            ativa: true,
          },
          motivo: null,
        })
      ).ok,
    ).toBe(false);
  });

  it('contraparte: cadastro, duplicidade, inativação e trilha', async () => {
    const p = await amb.ok('pessoaComercial:criar', {
      dados: {
        nome: 'Casa Agro',
        papel: 'fornecedor',
        documento: null,
        observacoes: null,
        ativo: true,
      },
    });
    expect(
      (
        await amb.chamar('pessoaComercial:criar', {
          dados: {
            nome: 'CASA AGRO',
            papel: 'outro',
            documento: null,
            observacoes: null,
            ativo: true,
          },
        })
      ).ok,
    ).toBe(false);
    const inativa = await amb.ok('pessoaComercial:atualizar', {
      id: p.id,
      dados: {
        nome: 'Casa Agro',
        papel: 'fornecedor',
        documento: null,
        observacoes: null,
        ativo: false,
      },
      motivo: 'Não compra mais',
    });
    expect(inativa.ativo).toBe(false);
    expect(await amb.ok('pessoaComercial:listar', { incluirInativas: false })).toEqual([]);
    expect(await amb.ok('pessoaComercial:listar', { incluirInativas: true })).toHaveLength(1);
    expect(
      texto(
        await amb.chamar('lancamento:criar', {
          requisicaoId: gerarUuidV7(),
          dados: dados({ pessoaId: p.id }),
        }),
      ),
    ).toMatch(/inativa/);
    expect(contar(amb, 'historico_alteracao', "entidade = 'pessoa_comercial'")).toBe(2);
  });
});

describe('lançamentos: valor da operação, a pagar/receber e pago/recebido', () => {
  it('à vista não pago: uma parcela aberta, saldo igual ao valor e nenhum pagamento criado', async () => {
    const l = await criarLancamento(amb, dados());
    expect(l).toMatchObject({
      condicaoPagamento: 'a_vista',
      situacao: 'a_vencer',
      valorOperacaoCentavos: 100000,
      saldoEmAbertoCentavos: 100000,
      pagoCentavos: 0,
      proximoVencimento: '2026-10-20',
      natureza: 'despesa',
      comportamentoCusto: 'nao_classificado',
    });
    expect(l.parcelas).toHaveLength(1);
    expect(l.pagamentos).toEqual([]);
    expect(contar(amb, 'pagamento_financeiro')).toBe(0);
  });

  it('à vista usa a competência como vencimento quando nenhum é informado', async () => {
    const l = await criarLancamento(
      amb,
      dados({
        dataCompetencia: '2026-10-05',
        condicao: { tipo: 'a_vista', vencimento: null, pagamento: null },
      }),
    );
    expect(l.parcelas[0]).toMatchObject({ vencimento: '2026-10-05', situacao: 'atrasada' });
    expect(l.situacao).toBe('vencido');
  });

  it('à vista pago só existe quando o usuário informa; caixa e competência ficam em datas distintas', async () => {
    const l = await criarLancamento(
      amb,
      dados({
        dataCompetencia: '2026-10-01',
        condicao: {
          tipo: 'a_vista',
          vencimento: '2026-10-01',
          pagamento: { data: '2026-10-10', forma: 'PIX' },
        },
      }),
    );
    expect(l).toMatchObject({
      situacao: 'quitado',
      saldoEmAbertoCentavos: 0,
      pagoCentavos: 100000,
    });
    expect(l.dataCompetencia).toBe('2026-10-01');
    expect(l.pagamentos).toHaveLength(1);
    expect(l.pagamentos[0]).toMatchObject({
      data: '2026-10-10',
      valorCentavos: 100000,
      forma: 'PIX',
    });
  });

  it('pagamento com data futura é recusado e não deixa lançamento pela metade', async () => {
    const r = await amb.chamar('lancamento:criar', {
      requisicaoId: gerarUuidV7(),
      dados: dados({
        condicao: {
          tipo: 'a_vista',
          vencimento: '2026-10-20',
          pagamento: { data: '2026-10-17', forma: null },
        },
      }),
    });
    expect(texto(r)).toMatch(/data futura/);
    expect(contar(amb, 'lancamento_financeiro')).toBe(0);
    expect(contar(amb, 'parcela_financeira')).toBe(0);
    expect(contar(amb, 'historico_alteracao', "entidade = 'lancamento_financeiro'")).toBe(0);
  });

  it('parcelado exige soma exata; vencimentos futuros são permitidos', async () => {
    const l = await criarLancamento(
      amb,
      dados({ condicao: { tipo: 'parcelado', parcelas: parcelasDe([33333, 33333, 33334]) } }),
    );
    expect(l).toMatchObject({
      condicaoPagamento: 'parcelado',
      situacao: 'a_vencer',
      saldoEmAbertoCentavos: 100000,
    });
    expect(l.parcelas.map((p) => p.numero)).toEqual([1, 2, 3]);
    const errada = await amb.chamar('lancamento:criar', {
      requisicaoId: gerarUuidV7(),
      dados: dados({
        condicao: { tipo: 'parcelado', parcelas: parcelasDe([33333, 33333, 33333]) },
      }),
    });
    expect(texto(errada)).toMatch(/exatamente igual/);
    const umaSo = await amb.chamar('lancamento:criar', {
      requisicaoId: gerarUuidV7(),
      dados: dados({ condicao: { tipo: 'parcelado', parcelas: parcelasDe([100000]) } }),
    });
    expect(umaSo.ok).toBe(false);
    expect(contar(amb, 'lancamento_financeiro')).toBe(1);
  });

  it('condição não informada: pendente de definição, saldo desconhecido (nunca zero) e sem parcela', async () => {
    const l = await criarLancamento(amb, dados({ condicao: { tipo: 'nao_informada' } }));
    expect(l).toMatchObject({
      condicaoPagamento: 'nao_informada',
      situacao: 'pendente_definicao',
      valorOperacaoCentavos: 100000,
      saldoEmAbertoCentavos: null,
      pagoCentavos: 0,
      proximoVencimento: null,
    });
    expect(l.parcelas).toEqual([]);
    expect(contar(amb, 'parcela_financeira')).toBe(0);
    expect(contar(amb, 'pagamento_financeiro')).toBe(0);
    const pendentes = await amb.ok('lancamento:listar', {
      propriedadeId: prop,
      situacao: 'pendente_definicao',
    });
    expect(pendentes.itens.map((i) => i.id)).toEqual([l.id]);
  });

  it('definir o pagamento de um lançamento pendente cria parcelas só quando o usuário decide', async () => {
    const l = await criarLancamento(amb, dados({ condicao: { tipo: 'nao_informada' } }));
    const futuro = await amb.chamar('lancamento:definirPagamento', {
      id: l.id,
      condicao: {
        tipo: 'a_vista',
        vencimento: '2026-10-20',
        pagamento: { data: '2026-10-30', forma: null },
      },
    });
    expect(texto(futuro)).toMatch(/data futura/);
    expect((await amb.ok('lancamento:obter', { id: l.id })).parcelas).toEqual([]);
    const definido = await amb.ok('lancamento:definirPagamento', {
      id: l.id,
      condicao: { tipo: 'parcelado', parcelas: parcelasDe([40000, 60000]) },
    });
    expect(definido).toMatchObject({
      condicaoPagamento: 'parcelado',
      saldoEmAbertoCentavos: 100000,
      pagoCentavos: 0,
    });
    expect(
      texto(
        await amb.chamar('lancamento:definirPagamento', {
          id: l.id,
          condicao: { tipo: 'a_vista', vencimento: null, pagamento: null },
        }),
      ),
    ).toMatch(/já foi definida/);
    expect(contar(amb, 'pagamento_financeiro')).toBe(0);
    expect(
      (await amb.ok('lancamento:obter', { id: l.id })).historico.some(
        (h) => h.acao === 'definicao_condicao',
      ),
    ).toBe(true);
  });

  it('nada financeiro é criado por eventos de outros módulos', async () => {
    const lote = await amb.ok('lote:criar', {
      propriedadeId: prop,
      dados: {
        nome: 'L',
        finalidade: 'recria',
        dataFormacao: '2026-01-01',
        areaId: null,
        observacoes: null,
      },
    });
    await amb.ok('animal:criar', {
      propriedadeId: prop,
      dados: {
        identificacao: 'N-1',
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
      entrada: { data: '2026-01-01', loteId: lote.id, pesoVivoKg: 300, metodoPesagem: 'balanca' },
    });
    const item = await amb.ok('estoque:criarItem', {
      propriedadeId: prop,
      dados: {
        nome: 'Silagem',
        tipo: 'silagem',
        unidadeBase: 'kg',
        controleLote: false,
        estoqueMinimo: null,
        produtoSanitarioId: null,
        ativo: true,
        observacoes: null,
      },
    });
    await amb.ok('estoque:registrar', {
      itemId: item.id,
      requisicaoId: gerarUuidV7(),
      dados: {
        data: '2026-10-01',
        tipo: 'entrada_compra',
        quantidade: 100,
        unidadeBase: 'kg',
        loteEstoqueId: null,
        custoEntradaCentavos: 50000,
        destino: null,
        loteAnimalId: null,
        animalId: null,
        documentoOrigemId: null,
        motivo: null,
        observacao: null,
      },
    });
    await amb.ok('estoque:registrar', {
      itemId: item.id,
      requisicaoId: gerarUuidV7(),
      dados: {
        data: '2026-10-02',
        tipo: 'saida_consumo',
        quantidade: 10,
        unidadeBase: 'kg',
        loteEstoqueId: null,
        custoEntradaCentavos: null,
        destino: 'lote',
        loteAnimalId: lote.id,
        animalId: null,
        documentoOrigemId: null,
        motivo: null,
        observacao: null,
      },
    });
    for (const t of ['lancamento_financeiro', 'parcela_financeira', 'pagamento_financeiro'])
      expect(contar(amb, t)).toBe(0);
  });
});

describe('lançamentos: validações de valores, datas e vínculos', () => {
  it('recusa valores que não são centavos inteiros positivos', async () => {
    for (const valorTotalCentavos of [0, -1, 1.5, 1_000_000_000_001, Number.NaN]) {
      const r = await amb.chamar('lancamento:criar', {
        requisicaoId: gerarUuidV7(),
        dados: dados({ valorTotalCentavos }),
      });
      expect(r.ok, String(valorTotalCentavos)).toBe(false);
    }
    expect(contar(amb, 'lancamento_financeiro')).toBe(0);
  });

  it('competência não pode ser futura; categoria e natureza são conferidas', async () => {
    expect(
      texto(
        await amb.chamar('lancamento:criar', {
          requisicaoId: gerarUuidV7(),
          dados: dados({ dataCompetencia: '2026-10-17' }),
        }),
      ),
    ).toMatch(/futura/);
    const compra = await categoriaPorNome(amb, 'Compra de animais');
    expect(
      texto(
        await amb.chamar('lancamento:criar', {
          requisicaoId: gerarUuidV7(),
          dados: dados({ categoriaId: compra.id }),
        }),
      ),
    ).toMatch(/módulo correspondente/);
    expect(
      (
        await amb.chamar('lancamento:criar', {
          requisicaoId: gerarUuidV7(),
          dados: dados({ categoriaId: gerarUuidV7() }),
        })
      ).ok,
    ).toBe(false);
    const l = await criarLancamento(amb, dados());
    expect(
      texto(
        await amb.chamar('lancamento:atualizar', {
          id: l.id,
          dados: {
            categoriaId: receita,
            pessoaId: null,
            dataCompetencia: '2026-10-01',
            descricao: 'x',
            documentoNumero: null,
            atividade: 'nao_definida',
            destino: { tipo: 'propriedade' },
            quantidade: null,
            comportamentoCusto: null,
            observacoes: null,
          },
          motivo: 'teste',
        }),
      ),
    ).toMatch(/mesma natureza/);
  });

  it('classificação copiada da categoria na criação, editável e não reescrita depois (D-E)', async () => {
    const c = await amb.ok('categoriaFinanceira:criar', {
      dados: {
        nome: 'Energia',
        natureza: 'despesa',
        grupo: 'infraestrutura',
        tratamento: 'resultado',
        comportamentoCusto: 'fixo',
        ativa: true,
      },
    });
    const herdado = await criarLancamento(amb, dados({ categoriaId: c.id }));
    expect(herdado.comportamentoCusto).toBe('fixo');
    const propria = await criarLancamento(
      amb,
      dados({ categoriaId: c.id, comportamentoCusto: 'variavel' }),
    );
    expect(propria.comportamentoCusto).toBe('variavel');
    const naoClassificado = await criarLancamento(
      amb,
      dados({ categoriaId: c.id, comportamentoCusto: 'nao_classificado' }),
    );
    expect(naoClassificado.comportamentoCusto).toBe('nao_classificado');
    await amb.ok('categoriaFinanceira:atualizar', {
      id: c.id,
      dados: {
        nome: 'Energia',
        natureza: 'despesa',
        grupo: 'infraestrutura',
        tratamento: 'resultado',
        comportamentoCusto: 'variavel',
        ativa: true,
      },
      motivo: null,
    });
    expect((await amb.ok('lancamento:obter', { id: herdado.id })).comportamentoCusto).toBe('fixo');
    expect(
      (await criarLancamento(amb, dados({ categoriaId: c.id, descricao: 'Nova' })))
        .comportamentoCusto,
    ).toBe('variavel');
    const receitaVariavel = await amb.chamar('lancamento:criar', {
      requisicaoId: gerarUuidV7(),
      dados: dadosDeLancamento(prop, receita, { comportamentoCusto: 'variavel' }),
    });
    expect(texto(receitaVariavel)).toMatch(/Receita não tem classificação/);
    expect((await criarLancamento(amb, dadosDeLancamento(prop, receita))).comportamentoCusto).toBe(
      'nao_se_aplica',
    );
  });

  it('destino em lote ou animal: mesma propriedade e dentro do período', async () => {
    const outra = await criarPropriedade(amb, 'Outra fazenda');
    const mk = (propriedadeId: string) =>
      amb.ok('lote:criar', {
        propriedadeId,
        dados: {
          nome: 'Lote',
          finalidade: 'engorda',
          dataFormacao: '2026-03-01',
          areaId: null,
          observacoes: null,
        },
      });
    const lote = await mk(prop);
    const loteOutra = await mk(outra.id);
    const ok = await criarLancamento(
      amb,
      dados({ destino: { tipo: 'lote', loteId: lote.id }, atividade: 'corte' }),
    );
    expect(ok.destino).toMatchObject({ tipo: 'lote', loteId: lote.id, loteNome: 'Lote' });
    expect(
      texto(
        await amb.chamar('lancamento:criar', {
          requisicaoId: gerarUuidV7(),
          dados: dados({ destino: { tipo: 'lote', loteId: loteOutra.id } }),
        }),
      ),
    ).toMatch(/nesta propriedade/);
    expect(
      texto(
        await amb.chamar('lancamento:criar', {
          requisicaoId: gerarUuidV7(),
          dados: dados({
            dataCompetencia: '2026-02-01',
            destino: { tipo: 'lote', loteId: lote.id },
          }),
        }),
      ),
    ).toMatch(/não existia/);
    expect(
      (
        await amb.chamar('lancamento:criar', {
          requisicaoId: gerarUuidV7(),
          dados: dados({ destino: { tipo: 'animal', animalId: gerarUuidV7() } }),
        })
      ).ok,
    ).toBe(false);
  });

  it('quantidade informativa: três casas, cabeça inteira e unidade com a base explícita', async () => {
    const ok = await criarLancamento(
      amb,
      dados({ quantidade: { valor: 15.5, unidade: 'arroba_carcaca' } }),
    );
    expect(ok).toMatchObject({ quantidade: 15.5, unidadeQuantidade: 'arroba_carcaca' });
    expect(
      texto(
        await amb.chamar('lancamento:criar', {
          requisicaoId: gerarUuidV7(),
          dados: dados({ quantidade: { valor: 2.5, unidade: 'cabeca' } }),
        }),
      ),
    ).toMatch(/inteira/);
    expect(
      (
        await amb.chamar('lancamento:criar', {
          requisicaoId: gerarUuidV7(),
          dados: dados({ quantidade: { valor: 1, unidade: 'arroba' as never } }),
        })
      ).ok,
    ).toBe(false);
  });

  it('isolamento por propriedade na listagem e no destino', async () => {
    const outra = await criarPropriedade(amb, 'Outra fazenda');
    await criarLancamento(amb, dados({ descricao: 'Da primeira' }));
    await criarLancamento(amb, dadosDeLancamento(outra.id, despesa, { descricao: 'Da segunda' }));
    const a = await amb.ok('lancamento:listar', { propriedadeId: prop });
    const b = await amb.ok('lancamento:listar', { propriedadeId: outra.id });
    expect(a.itens.map((i) => i.descricao)).toEqual(['Da primeira']);
    expect(b.itens.map((i) => i.descricao)).toEqual(['Da segunda']);
    expect((await amb.chamar('lancamento:listar', { propriedadeId: gerarUuidV7() })).ok).toBe(
      false,
    );
  });

  it('repetição com o mesmo identificador não duplica; conteúdo diferente é recusado', async () => {
    const requisicaoId = gerarUuidV7();
    const d = dados({ condicao: { tipo: 'parcelado', parcelas: parcelasDe([50000, 50000]) } });
    const a = await amb.ok('lancamento:criar', { requisicaoId, dados: d });
    const b = await amb.ok('lancamento:criar', { requisicaoId, dados: d });
    expect(b.id).toBe(a.id);
    expect(contar(amb, 'lancamento_financeiro')).toBe(1);
    expect(contar(amb, 'parcela_financeira')).toBe(2);
    expect(
      texto(
        await amb.chamar('lancamento:criar', {
          requisicaoId,
          dados: { ...d, valorTotalCentavos: 100001 },
        }),
      ),
    ).toMatch(/outro conteúdo/);
    expect(contar(amb, 'lancamento_financeiro')).toBe(1);
  });

  it('listagem filtra por período, natureza, situação e busca sem acento, e pagina', async () => {
    const pessoa = await amb.ok('pessoaComercial:criar', {
      dados: {
        nome: 'Cooperativa Água Viva',
        papel: 'fornecedor',
        documento: null,
        observacoes: null,
        ativo: true,
      },
    });
    await criarLancamento(
      amb,
      dados({ descricao: 'Ração de outubro', dataCompetencia: '2026-10-02', pessoaId: pessoa.id }),
    );
    await criarLancamento(
      amb,
      dados({
        descricao: 'Vacina',
        dataCompetencia: '2026-09-02',
        condicao: { tipo: 'a_vista', vencimento: '2026-09-10', pagamento: null },
      }),
    );
    await criarLancamento(
      amb,
      dadosDeLancamento(prop, receita, { descricao: 'Leite', dataCompetencia: '2026-10-03' }),
    );
    const todos = await amb.ok('lancamento:listar', { propriedadeId: prop });
    expect(todos.total).toBe(3);
    expect(todos.itens.map((i) => i.descricao)).toEqual(['Leite', 'Ração de outubro', 'Vacina']);
    const outubro = await amb.ok('lancamento:listar', {
      propriedadeId: prop,
      dataInicial: '2026-10-01',
      dataFinal: '2026-10-31',
    });
    expect(outubro.total).toBe(2);
    expect(
      (await amb.ok('lancamento:listar', { propriedadeId: prop, natureza: 'receita' })).total,
    ).toBe(1);
    expect(
      (await amb.ok('lancamento:listar', { propriedadeId: prop, busca: 'racao' })).itens,
    ).toHaveLength(1);
    expect(
      (await amb.ok('lancamento:listar', { propriedadeId: prop, busca: 'AGUA viva' })).itens,
    ).toHaveLength(1);
    expect(
      (await amb.ok('lancamento:listar', { propriedadeId: prop, situacao: 'vencido' })).total,
    ).toBe(1);
    const pagina = await amb.ok('lancamento:listar', {
      propriedadeId: prop,
      pagina: 2,
      tamanhoPagina: 2,
    });
    expect(pagina).toMatchObject({ total: 3, pagina: 2 });
    expect(pagina.itens).toHaveLength(1);
    expect(
      (
        await amb.chamar('lancamento:listar', {
          propriedadeId: prop,
          dataInicial: '2026-11-01',
          dataFinal: '2026-10-01',
        })
      ).ok,
    ).toBe(false);
  });
});

describe('pagamentos parciais e estornos', () => {
  it('pagamento parcial, estorno auditável e idempotência', async () => {
    const l = await criarLancamento(amb, dados());
    const parcela = l.parcelas[0]!;
    const req = gerarUuidV7();
    const dp = { data: '2026-10-15', valorCentavos: 30000, forma: 'Dinheiro', observacao: null };
    const parcial = await amb.ok('pagamento:registrar', {
      parcelaId: parcela.id,
      requisicaoId: req,
      dados: dp,
    });
    expect(parcial).toMatchObject({
      situacao: 'parcialmente_pago',
      saldoEmAbertoCentavos: 70000,
      pagoCentavos: 30000,
    });
    expect(parcial.parcelas[0]).toMatchObject({
      situacao: 'parcial',
      pagoCentavos: 30000,
      saldoCentavos: 70000,
    });
    // Repetição idêntica: nenhum pagamento novo.
    const repetido = await amb.ok('pagamento:registrar', {
      parcelaId: parcela.id,
      requisicaoId: req,
      dados: dp,
    });
    expect(repetido.pagamentos).toHaveLength(1);
    expect(contar(amb, 'pagamento_financeiro')).toBe(1);
    expect(
      texto(
        await amb.chamar('pagamento:registrar', {
          parcelaId: parcela.id,
          requisicaoId: req,
          dados: { ...dp, valorCentavos: 30001 },
        }),
      ),
    ).toMatch(/outro conteúdo/);
    // Acima do saldo.
    expect(
      texto(
        await amb.chamar('pagamento:registrar', {
          parcelaId: parcela.id,
          requisicaoId: gerarUuidV7(),
          dados: { ...dp, valorCentavos: 70001 },
        }),
      ),
    ).toMatch(/excede o saldo/);
    const resto = await amb.ok('pagamento:registrar', {
      parcelaId: parcela.id,
      requisicaoId: gerarUuidV7(),
      dados: { ...dp, valorCentavos: 70000 },
    });
    expect(resto).toMatchObject({
      situacao: 'quitado',
      saldoEmAbertoCentavos: 0,
      pagoCentavos: 100000,
    });
    // Estorno devolve o saldo e preserva o pagamento original.
    const primeiro = resto.pagamentos[0]!;
    const estornado = await amb.ok('pagamento:estornar', {
      id: primeiro.id,
      motivo: 'Valor lançado em duplicidade',
    });
    expect(estornado).toMatchObject({
      situacao: 'parcialmente_pago',
      pagoCentavos: 70000,
      saldoEmAbertoCentavos: 30000,
    });
    const marcado = estornado.pagamentos.find((g) => g.id === primeiro.id)!;
    expect(marcado).toMatchObject({
      estornado: true,
      motivoEstorno: 'Valor lançado em duplicidade',
      valorCentavos: 30000,
    });
    expect(
      texto(await amb.chamar('pagamento:estornar', { id: primeiro.id, motivo: 'de novo' })),
    ).toMatch(/já foi estornado/);
    expect(
      estornado.historico.some(
        (h) => h.acao === 'estorno' && h.motivo === 'Valor lançado em duplicidade',
      ),
    ).toBe(true);
    // Repetir a requisição de um pagamento estornado não recria o pagamento.
    expect(
      (
        await amb.chamar('pagamento:registrar', {
          parcelaId: parcela.id,
          requisicaoId: req,
          dados: dp,
        })
      ).ok,
    ).toBe(false);
    expect(contar(amb, 'pagamento_financeiro', 'deleted_at IS NULL')).toBe(1);
  });

  it('pagamento futuro, parcela inexistente e lançamento cancelado são recusados', async () => {
    const l = await criarLancamento(amb, dados());
    const p = l.parcelas[0]!;
    const base = { data: '2026-10-16', valorCentavos: 1000, forma: null, observacao: null };
    expect(
      texto(
        await amb.chamar('pagamento:registrar', {
          parcelaId: p.id,
          requisicaoId: gerarUuidV7(),
          dados: { ...base, data: '2026-10-17' },
        }),
      ),
    ).toMatch(/data futura/);
    expect(
      (
        await amb.chamar('pagamento:registrar', {
          parcelaId: gerarUuidV7(),
          requisicaoId: gerarUuidV7(),
          dados: base,
        })
      ).ok,
    ).toBe(false);
    await amb.ok('lancamento:cancelar', { id: l.id, motivo: 'Lançado por engano' });
    expect(
      texto(
        await amb.chamar('pagamento:registrar', {
          parcelaId: p.id,
          requisicaoId: gerarUuidV7(),
          dados: base,
        }),
      ),
    ).toMatch(/cancelado/);
    expect(contar(amb, 'pagamento_financeiro')).toBe(0);
  });

  it('cancelar exige estorno prévio, congela o lançamento e some da listagem padrão', async () => {
    const l = await criarLancamento(amb, dados());
    const pago = await amb.ok('pagamento:registrar', {
      parcelaId: l.parcelas[0]!.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-10', valorCentavos: 100000, forma: null, observacao: null },
    });
    expect(texto(await amb.chamar('lancamento:cancelar', { id: l.id, motivo: 'engano' }))).toMatch(
      /Estorne os pagamentos/,
    );
    await amb.ok('pagamento:estornar', { id: pago.pagamentos[0]!.id, motivo: 'Pagamento errado' });
    const cancelado = await amb.ok('lancamento:cancelar', {
      id: l.id,
      motivo: 'Lançado por engano',
    });
    expect(cancelado).toMatchObject({
      situacao: 'cancelado',
      cancelado: true,
      motivoCancelamento: 'Lançado por engano',
    });
    expect(contar(amb, 'lancamento_financeiro')).toBe(1);
    expect((await amb.ok('lancamento:listar', { propriedadeId: prop })).total).toBe(0);
    expect(
      (await amb.ok('lancamento:listar', { propriedadeId: prop, incluirCancelados: true })).total,
    ).toBe(1);
    expect(
      (await amb.ok('lancamento:listar', { propriedadeId: prop, situacao: 'cancelado' })).total,
    ).toBe(1);
    expect(texto(await amb.chamar('lancamento:cancelar', { id: l.id, motivo: 'de novo' }))).toMatch(
      /cancelado/,
    );
  });
});

describe('edição e renegociação', () => {
  const edicao = (extra: Record<string, unknown> = {}) => ({
    categoriaId: despesa,
    pessoaId: null,
    dataCompetencia: '2026-10-01',
    descricao: 'Despesa de teste',
    documentoNumero: null,
    atividade: 'nao_definida' as const,
    destino: { tipo: 'propriedade' as const },
    quantidade: null,
    comportamentoCusto: null,
    observacoes: null,
    ...extra,
  });

  it('edita campos com motivo e trilha; sem mudança real não grava trilha', async () => {
    const l = await criarLancamento(amb, dados());
    const antes = contar(amb, 'historico_alteracao');
    await amb.ok('lancamento:atualizar', { id: l.id, dados: edicao(), motivo: 'Sem mudança' });
    expect(contar(amb, 'historico_alteracao')).toBe(antes);
    const novo = await amb.ok('lancamento:atualizar', {
      id: l.id,
      dados: edicao({
        descricao: 'Corrigida',
        atividade: 'corte',
        comportamentoCusto: 'fixo',
        documentoNumero: 'NF 10',
      }),
      motivo: 'Corrigir descrição',
    });
    expect(novo).toMatchObject({
      descricao: 'Corrigida',
      atividade: 'corte',
      comportamentoCusto: 'fixo',
      documentoNumero: 'NF 10',
    });
    const h = novo.historico.find((x) => x.acao === 'alteracao')!;
    expect(h.motivo).toBe('Corrigir descrição');
    expect(h.dadosAnteriores).toMatchObject({
      descricao: 'Despesa de teste',
      comportamentoCusto: 'nao_classificado',
    });
    expect(h.dadosNovos).toMatchObject({ descricao: 'Corrigida', comportamentoCusto: 'fixo' });
    // Editar não muda valor nem parcelas.
    expect(novo).toMatchObject({ valorOperacaoCentavos: 100000, saldoEmAbertoCentavos: 100000 });
    expect(novo.parcelas).toHaveLength(1);
  });

  it('renegocia só o que está em aberto, preserva pagamentos e fecha centavo a centavo', async () => {
    const l = await criarLancamento(
      amb,
      dados({ condicao: { tipo: 'parcelado', parcelas: parcelasDe([30000, 30000, 40000]) } }),
    );
    const [p1, p2] = l.parcelas;
    const pagar = (parcelaId: string, valorCentavos: number) =>
      amb.ok('pagamento:registrar', {
        parcelaId,
        requisicaoId: gerarUuidV7(),
        dados: { data: '2026-10-12', valorCentavos, forma: null, observacao: null },
      });
    await pagar(p1!.id, 30000);
    await pagar(p2!.id, 10000);
    const pagamentosAntes = (await amb.ok('lancamento:obter', { id: l.id })).pagamentos.map(
      (g) => g.id,
    );

    const novas = [
      { vencimento: '2027-01-10', valorCentavos: 30000 },
      { vencimento: '2027-02-10', valorCentavos: 30001 },
    ];
    expect(
      texto(
        await amb.chamar('lancamento:renegociar', {
          id: l.id,
          novasParcelas: novas,
          novoTotalCentavos: null,
          motivo: 'Somas erradas',
        }),
      ),
    ).toMatch(/exatamente igual/);
    const r = await amb.ok('lancamento:renegociar', {
      id: l.id,
      novasParcelas: [novas[0]!, { ...novas[1]!, valorCentavos: 30000 }],
      novoTotalCentavos: null,
      motivo: 'Acordo com o fornecedor',
    });
    const ativas = r.parcelas.filter((p) => !p.cancelada);
    expect(ativas.map((p) => [p.numero, p.valorCentavos, p.pagoCentavos])).toEqual([
      [1, 30000, 30000],
      [2, 10000, 10000],
      [4, 30000, 0],
      [5, 30000, 0],
    ]);
    expect(r.parcelas.find((p) => p.numero === 3)).toMatchObject({ cancelada: true });
    expect(r).toMatchObject({
      valorOperacaoCentavos: 100000,
      pagoCentavos: 40000,
      saldoEmAbertoCentavos: 60000,
      condicaoPagamento: 'parcelado',
    });
    expect(r.pagamentos.map((g) => g.id)).toEqual(pagamentosAntes);
    expect(r.pagamentos.every((g) => !g.estornado)).toBe(true);
    const h = r.historico.find((x) => x.acao === 'renegociacao')!;
    expect(h.motivo).toBe('Acordo com o fornecedor');
    expect(h.dadosAnteriores).toMatchObject({ valorTotalCentavos: 100000 });
    expect(h.dadosNovos).toMatchObject({ valorTotalCentavos: 100000 });
  });

  it('ajuste do total na renegociação respeita o já pago', async () => {
    const l = await criarLancamento(
      amb,
      dados({ condicao: { tipo: 'parcelado', parcelas: parcelasDe([50000, 50000]) } }),
    );
    await amb.ok('pagamento:registrar', {
      parcelaId: l.parcelas[0]!.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-12', valorCentavos: 50000, forma: null, observacao: null },
    });
    const nova = [{ vencimento: '2027-01-10', valorCentavos: 30000 }];
    expect(
      texto(
        await amb.chamar('lancamento:renegociar', {
          id: l.id,
          novasParcelas: nova,
          novoTotalCentavos: 40000,
          motivo: 'x',
        }),
      ),
    ).toMatch(/menor do que o valor já pago/);
    const r = await amb.ok('lancamento:renegociar', {
      id: l.id,
      novasParcelas: nova,
      novoTotalCentavos: 80000,
      motivo: 'Desconto de 200',
    });
    expect(r).toMatchObject({
      valorOperacaoCentavos: 80000,
      pagoCentavos: 50000,
      saldoEmAbertoCentavos: 30000,
    });
    // Total igual ao pago: não há o que parcelar.
    const quitar = await amb.ok('lancamento:renegociar', {
      id: l.id,
      novasParcelas: [],
      novoTotalCentavos: 50000,
      motivo: 'Abatimento final',
    });
    expect(quitar).toMatchObject({
      valorOperacaoCentavos: 50000,
      situacao: 'quitado',
      saldoEmAbertoCentavos: 0,
    });
    expect(
      texto(
        await amb.chamar('lancamento:renegociar', {
          id: l.id,
          novasParcelas: nova,
          novoTotalCentavos: null,
          motivo: 'x',
        }),
      ),
    ).toMatch(/Não há saldo a parcelar|exatamente/);
  });

  it('não renegocia lançamento pendente de definição nem cancelado', async () => {
    const p = await criarLancamento(amb, dados({ condicao: { tipo: 'nao_informada' } }));
    expect(
      texto(
        await amb.chamar('lancamento:renegociar', {
          id: p.id,
          novasParcelas: parcelasDe([100000]),
          novoTotalCentavos: null,
          motivo: 'x',
        }),
      ),
    ).toMatch(/Defina a condição/);
    const c = await criarLancamento(amb, dados({ descricao: 'Outra' }));
    await amb.ok('lancamento:cancelar', { id: c.id, motivo: 'engano' });
    expect(
      texto(
        await amb.chamar('lancamento:renegociar', {
          id: c.id,
          novasParcelas: parcelasDe([100000]),
          novoTotalCentavos: null,
          motivo: 'x',
        }),
      ),
    ).toMatch(/cancelado/);
  });
});

describe('mudanças retroativas em outros módulos respeitam o financeiro', () => {
  async function animalELote() {
    const lote = await amb.ok('lote:criar', {
      propriedadeId: prop,
      dados: {
        nome: 'Terminação',
        finalidade: 'engorda',
        dataFormacao: '2026-01-01',
        areaId: null,
        observacoes: null,
      },
    });
    const animal = await amb.ok('animal:criar', {
      propriedadeId: prop,
      dados: {
        identificacao: 'F-1',
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
      entrada: { data: '2026-01-01', loteId: null, pesoVivoKg: null, metodoPesagem: null },
    });
    return { lote, animal };
  }

  it('saída de animal anterior a lançamento ativo é recusada; cancelado ou na mesma data não impede', async () => {
    const { animal } = await animalELote();
    const l = await criarLancamento(
      amb,
      dados({
        dataCompetencia: '2026-06-10',
        descricao: 'Veterinário',
        destino: { tipo: 'animal', animalId: animal.id },
      }),
    );
    const recusa = texto(
      await amb.chamar('animal:registrarSaida', {
        id: animal.id,
        tipo: 'vendido',
        data: '2026-06-01',
        motivo: null,
      }),
    );
    expect(recusa).toMatch(/lançamento financeiro com competência depois da data de saída/);
    expect(recusa).toContain('10/06/2026: Veterinário, R$ 1.000,00');
    expect(recusa).toMatch(/não são alterados automaticamente/);
    expect((await amb.ok('animal:obter', { id: animal.id })).status).toBe('ativo');
    expect((await amb.ok('lancamento:obter', { id: l.id })).situacao).not.toBe('cancelado');
    // Na mesma data da competência a saída é válida.
    await amb.ok('lancamento:cancelar', { id: l.id, motivo: 'Lançado no animal errado' });
    expect(
      (
        await amb.ok('animal:registrarSaida', {
          id: animal.id,
          tipo: 'vendido',
          data: '2026-06-01',
          motivo: null,
        })
      ).status,
    ).toBe('vendido');
  });

  it('saída na mesma data da competência é aceita; novo lançamento depois da saída é recusado', async () => {
    const { animal } = await animalELote();
    await criarLancamento(
      amb,
      dados({ dataCompetencia: '2026-06-10', destino: { tipo: 'animal', animalId: animal.id } }),
    );
    await amb.ok('animal:registrarSaida', {
      id: animal.id,
      tipo: 'morto',
      data: '2026-06-10',
      motivo: null,
    });
    expect(
      texto(
        await amb.chamar('lancamento:criar', {
          requisicaoId: gerarUuidV7(),
          dados: dados({
            dataCompetencia: '2026-06-11',
            destino: { tipo: 'animal', animalId: animal.id },
          }),
        }),
      ),
    ).toMatch(/não estava no rebanho/);
  });

  it('encerramento e formação de lote não deixam lançamento fora do período', async () => {
    const { lote } = await animalELote();
    await criarLancamento(
      amb,
      dados({
        dataCompetencia: '2026-05-10',
        atividade: 'corte',
        destino: { tipo: 'lote', loteId: lote.id },
      }),
    );
    expect(texto(await amb.chamar('lote:encerrar', { id: lote.id, data: '2026-05-01' }))).toMatch(
      /lançamento financeiro com competência depois da data de encerramento/,
    );
    const dadosLote = { nome: 'Terminação', finalidade: 'engorda' as const, observacoes: null };
    expect(
      texto(
        await amb.chamar('lote:atualizar', {
          id: lote.id,
          dados: { ...dadosLote, dataFormacao: '2026-06-01' },
        }),
      ),
    ).toMatch(/competência antes da nova data de formação/);
    expect(
      (
        await amb.ok('lote:atualizar', {
          id: lote.id,
          dados: { ...dadosLote, nome: 'Terminação 2', dataFormacao: '2026-01-01' },
        })
      ).nome,
    ).toBe('Terminação 2');
    expect((await amb.ok('lote:encerrar', { id: lote.id, data: '2026-05-10' })).ativo).toBe(false);
  });

  it('animal e propriedade com lançamento não podem ser excluídos', async () => {
    const { animal } = await animalELote();
    await criarLancamento(
      amb,
      dados({ dataCompetencia: '2026-06-10', destino: { tipo: 'animal', animalId: animal.id } }),
    );
    expect(texto(await amb.chamar('animal:excluir', { id: animal.id, motivo: 'engano' }))).toMatch(
      /lançamento financeiro vinculado/,
    );
    const vazia = await criarPropriedade(amb, 'Só financeiro');
    await criarLancamento(amb, dadosDeLancamento(vazia.id, despesa));
    expect(texto(await amb.chamar('propriedade:excluir', { id: vazia.id }))).toMatch(
      /lançamentos financeiros/,
    );
  });
});

describe('persistência e integridade', () => {
  it('dados financeiros sobrevivem ao reinício e à restauração de backup', async () => {
    const l = await criarLancamento(
      amb,
      dados({ condicao: { tipo: 'parcelado', parcelas: parcelasDe([60000, 40000]) } }),
    );
    await amb.ok('pagamento:registrar', {
      parcelaId: l.parcelas[0]!.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-12', valorCentavos: 25000, forma: null, observacao: null },
    });
    const antes = await amb.ok('lancamento:obter', { id: l.id });
    const backup = await amb.ok('backup:criar', {});
    await amb.reiniciar();
    expect(await amb.ok('lancamento:obter', { id: l.id })).toEqual(antes);
    await amb.ok('pagamento:registrar', {
      parcelaId: l.parcelas[1]!.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-13', valorCentavos: 40000, forma: null, observacao: null },
    });
    expect((await amb.ok('lancamento:obter', { id: l.id })).pagoCentavos).toBe(65000);
    await amb.ok('backup:restaurar', { id: backup.id });
    expect(await amb.ok('lancamento:obter', { id: l.id })).toEqual(antes);
    expect(conferirInvariantes(amb)).toEqual([]);
  });

  it('toda escrita de negócio deixa trilha na mesma transação e a trilha só usa o catálogo', async () => {
    const l = await criarLancamento(
      amb,
      dados({
        condicao: {
          tipo: 'a_vista',
          vencimento: '2026-10-10',
          pagamento: { data: '2026-10-10', forma: null },
        },
      }),
    );
    const d = await amb.ok('lancamento:obter', { id: l.id });
    const acoes = d.historico.map((h) => `${h.entidade}:${h.acao}`).sort();
    expect(acoes).toEqual(['lancamento_financeiro:criacao', 'pagamento_financeiro:criacao']);
    const criacao = d.historico.find((h) => h.entidade === 'lancamento_financeiro')!;
    expect(criacao.dadosNovos).toMatchObject({
      valorTotalCentavos: 100000,
      condicaoPagamento: 'a_vista',
    });
    expect(criacao.dadosNovos!['parcelas']).toEqual([
      { numero: 1, vencimento: '2026-10-10', valorCentavos: 100000 },
    ]);
  });

  it('data de hoje controlada: o relógio decide o que é futuro', async () => {
    expect(HOJE).toBe('2026-10-16');
    amb.definirHoje(new Date(2026, 9, 20, 9));
    const l = await criarLancamento(amb, dados({ dataCompetencia: '2026-10-18' }));
    expect(l.dataCompetencia).toBe('2026-10-18');
  });
});
