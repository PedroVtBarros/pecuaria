import { gerarUuidV7 } from '@pecuaria/domain';
import type {
  DadosAnimal,
  DadosCompraAnimais,
  DadosVendaAnimais,
  Lote,
  NegociacaoDetalhe,
} from '@pecuaria/shared-types';
import type { AmbienteIpc } from '../../teste/ambiente-ipc';

/** Apoio aos testes de compra e venda de animais (entrega 4C). */
export async function criarLote(
  amb: AmbienteIpc,
  propriedadeId: string,
  nome: string,
  dataFormacao = '2026-01-01',
): Promise<Lote> {
  return amb.ok('lote:criar', {
    propriedadeId,
    dados: { nome, finalidade: 'engorda', dataFormacao, areaId: null, observacoes: null },
  });
}

export function dadosDeAnimal(
  identificacao: string,
  extra: Partial<DadosAnimal> = {},
): DadosAnimal {
  return {
    identificacao,
    nome: null,
    sexo: 'M',
    condicaoSexual: 'inteiro',
    categoria: 'garrote',
    aptidao: 'corte',
    racaId: null,
    dataNascimento: null,
    dataNascimentoEstimada: false,
    maeId: null,
    paiId: null,
    origem: 'comprado',
    observacoes: null,
    ...extra,
  };
}

export interface AnimalDaCompra {
  identificacao: string;
  pesoVivoKg?: number | null;
  pesoCarcacaKg?: number | null;
  valorManualCentavos?: number | null;
  dados?: Partial<DadosAnimal>;
}

export function dadosDeCompra(
  propriedadeId: string,
  animais: AnimalDaCompra[],
  extra: Partial<DadosCompraAnimais> = {},
): DadosCompraAnimais {
  // As parcelas padrão somam 9.000,00; para outro total, o padrão é à vista (sem pagamento).
  const aVista = extra.condicao === undefined && extra.valorTotalCentavos !== undefined;
  return {
    requisicaoId: gerarUuidV7(),
    propriedadeId,
    data: '2026-10-01',
    pessoaId: null,
    atividade: 'corte',
    observacoes: null,
    valorTotalCentavos: 900000,
    unidadePreco: 'total',
    precoUnitarioCentavos: null,
    criterio: 'igual',
    condicao: {
      tipo: 'parcelado',
      parcelas: [
        { vencimento: '2026-11-10', valorCentavos: 300000 },
        { vencimento: '2026-12-10', valorCentavos: 300000 },
        { vencimento: '2027-01-10', valorCentavos: 300000 },
      ],
    },
    loteId: null,
    animais: animais.map((a) => ({
      dados: dadosDeAnimal(a.identificacao, a.dados),
      pesoVivoKg: a.pesoVivoKg ?? null,
      metodoPesagem: a.pesoVivoKg ? ('balanca' as const) : null,
      pesoCarcacaKg: a.pesoCarcacaKg ?? null,
      valorManualCentavos: a.valorManualCentavos ?? null,
    })),
    ...(aVista
      ? { condicao: { tipo: 'a_vista' as const, vencimento: '2026-10-20', pagamento: null } }
      : {}),
    ...extra,
  };
}

export function dadosDeVenda(
  propriedadeId: string,
  animais: {
    animalId: string;
    pesoVivoKg?: number | null;
    pesoCarcacaKg?: number | null;
    valorManualCentavos?: number | null;
  }[],
  extra: Partial<DadosVendaAnimais> = {},
): DadosVendaAnimais {
  return {
    requisicaoId: gerarUuidV7(),
    propriedadeId,
    data: '2026-10-10',
    pessoaId: null,
    atividade: 'corte',
    observacoes: null,
    valorTotalCentavos: 800000,
    unidadePreco: 'total',
    precoUnitarioCentavos: null,
    criterio: 'igual',
    condicao: { tipo: 'a_vista', vencimento: '2026-10-20', pagamento: null },
    animais: animais.map((a) => ({
      animalId: a.animalId,
      pesoVivoKg: a.pesoVivoKg ?? null,
      pesoCarcacaKg: a.pesoCarcacaKg ?? null,
      valorManualCentavos: a.valorManualCentavos ?? null,
    })),
    ...extra,
  };
}

export async function comprar(
  amb: AmbienteIpc,
  dados: DadosCompraAnimais,
): Promise<NegociacaoDetalhe> {
  return amb.ok('negociacao:registrarCompra', dados);
}
export async function vender(
  amb: AmbienteIpc,
  dados: DadosVendaAnimais,
): Promise<NegociacaoDetalhe> {
  return amb.ok('negociacao:registrarVenda', dados);
}
