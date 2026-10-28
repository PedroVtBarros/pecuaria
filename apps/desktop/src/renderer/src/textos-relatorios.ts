import type { TipoRelatorio } from '@pecuaria/shared-types';

/** Textos da entrega 4H: relatórios e exportação. */
export const tiposRelatorio: Record<
  TipoRelatorio,
  { titulo: string; descricao: string; periodo: 'obrigatorio' | 'opcional' }
> = {
  resultado: {
    titulo: 'Resultado do período',
    descricao:
      'Competência e caixa lado a lado, composição do custo, margem bruta, indicadores e animais que saíram.',
    periodo: 'obrigatorio',
  },
  custos: {
    titulo: 'Custos por lote e animal',
    descricao:
      'Custo apropriado acumulado por lote e por animal, com o não alocado e a conferência da soma.',
    periodo: 'opcional',
  },
  animal: {
    titulo: 'Custo de um animal',
    descricao: 'De onde veio cada valor do custo do animal.',
    periodo: 'opcional',
  },
  lote: {
    titulo: 'Composição do custo de um lote',
    descricao: 'Custos lançados ao lote e recebidos por rateio.',
    periodo: 'opcional',
  },
  lancamentos: {
    titulo: 'Lançamentos do período',
    descricao: 'Valor da operação, pago ou recebido e em aberto, separados.',
    periodo: 'obrigatorio',
  },
  fluxo: {
    titulo: 'Fluxo de caixa',
    descricao: 'Realizado e previsto por mês, nunca somados.',
    periodo: 'obrigatorio',
  },
  conciliacao: {
    titulo: 'Conciliação',
    descricao: 'Por que o caixa é diferente do resultado, linha a linha.',
    periodo: 'obrigatorio',
  },
  conferencia: {
    titulo: 'Conferência financeira',
    descricao:
      'Verifica se apropriação, conciliação, caixa e resultado fecham, e lista as pendências.',
    periodo: 'obrigatorio',
  },
};
export const textoExportacao =
  'Os arquivos são gerados no computador, sem internet. O CSV abre no Excel (separador ";", acentos preservados, dinheiro em centavos e em reais). O PDF traz a visão no título e o aviso de que é relatório gerencial, não documento fiscal nem contábil.';
export const textoDocumentos =
  'Incluir o CPF ou CNPJ das contrapartes (dado pessoal: só marque se for necessário).';
