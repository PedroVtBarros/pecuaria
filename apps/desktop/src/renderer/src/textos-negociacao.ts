import type {
  CriterioAlocacao,
  SituacaoAquisicao,
  SituacaoFormacao,
  UnidadePreco,
} from '@pecuaria/domain';

/** Rótulos de compra e venda de animais e de custo anterior (entregas 4C). */
export const unidadesPreco: Record<UnidadePreco, string> = {
  total: 'Só o valor total (sem preço unitário)',
  cabeca: 'Por cabeça',
  kg_vivo: 'Por kg de peso vivo',
  arroba_vivo: 'Por @ de peso vivo',
  arroba_carcaca: 'Por @ de carcaça',
};
export const unidadesPrecoCurtas: Record<UnidadePreco, string> = {
  total: 'valor total',
  cabeca: 'por cabeça',
  kg_vivo: 'por kg vivo',
  arroba_vivo: 'por @ de peso vivo',
  arroba_carcaca: 'por @ de carcaça',
};
export const criterios: Record<CriterioAlocacao, string> = {
  igual: 'Igual por cabeça',
  peso_vivo: 'Proporcional ao peso vivo',
  peso_carcaca: 'Proporcional ao peso de carcaça',
  manual: 'Valores digitados por animal',
};
export const tiposNegociacao = { compra: 'Compra', venda: 'Venda' } as const;
export const situacoesAquisicao: Record<SituacaoAquisicao, string> = {
  registrada: 'Compra registrada no sistema',
  nao_aplicavel: 'Não aplicável (nascido na propriedade)',
  nao_apurada: 'Não apurada (sem compra registrada)',
};
export const situacoesFormacao: Record<SituacaoFormacao, string> = {
  informada: 'Informada pelo usuário (custo anterior)',
  nao_apurada: 'Não apurada',
  nao_aplicavel: 'Não aplicável',
};
export const textoCusteioAnimal =
  'Custo desconhecido nunca é tratado como zero. O custo anterior ao sistema é informado por você, não entra no caixa e não cria lançamento, parcela nem pagamento.';
export const textoAlocacao =
  'O valor total é o que fica gravado. O preço unitário só é conferido contra ele. Se o critério pede peso e algum animal não tem peso, o sistema bloqueia: nunca divide por igual sem você escolher.';
