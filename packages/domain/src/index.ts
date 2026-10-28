/**
 * Núcleo de regras puras (Core). Sem Electron, React ou SQLite (CLAUDE.md, regra 8).
 * Reaproveitável pelo processo principal, pela interface e por um futuro app móvel.
 */
export * from './comum/uuid';
export * from './comum/texto';
export * from './comum/datas';
export * from './comum/numeros';
export * from './rebanho/enumeracoes';
export * from './rebanho/regras-animal';
export * from './rebanho/gmd';
export * from './rebanho/alertas-pesagem';
export * from './rebanho/evolucao-lote';
export * from './rebanho/permanencia-lote';
export * from './rebanho/importacao-csv';
export * from './sanidade/enumeracoes';
export * from './sanidade/regras-sanidade';

export * from './estoque/regras-estoque';

export * from './financeiro/enumeracoes';
export * from './financeiro/dinheiro';
export * from './financeiro/proporcional';
export * from './financeiro/parcelas';
export * from './financeiro/situacao';
export * from './financeiro/apuracao';
export * from './financeiro/fluxo';
export * from './financeiro/negociacao';
export * from './financeiro/devolucao';
export * from './financeiro/custo-animal';
export * from './financeiro/custo-insumos';
export * from './financeiro/apropriacao';
export * from './financeiro/rateio';
export * from './suporte-teste/gerador-deterministico';
export * from './financeiro/producao';
export * from './financeiro/resultado';

export * from './alimentos/enumeracoes';
export * from './alimentos/valor-publicado';
export * from './alimentos/valor-nao-quantificado';
export * from './alimentos/origem-dados';
export * from './alimentos/unidades';
export * from './alimentos/conferencia';
export * from './alimentos/regras-alimentos';
export * from './alimentos/catalogo-inicial';
export * from './alimentos/pacote-curadoria';
export * from './alimentos/pacotes';
export * from './alimentos/selecao';
