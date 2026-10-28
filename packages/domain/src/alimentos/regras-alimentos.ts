import {
  ORIGENS_BIBLIOGRAFICAS,
  ORIGENS_DA_PROPRIEDADE,
  TIPOS_VALOR_GARANTIA,
  type BaseNutricional,
  type DirecaoConservadora,
  type GrupoNutriente,
  type NaturezaValor,
  type OrigemFonte,
  type TipoValor,
} from './enumeracoes';
import {
  DEFINICOES_UNIDADE,
  dentroDaFaixaDaUnidade,
  descreverFaixa,
  mesmaGrandeza,
  type UnidadeNutricional,
} from './unidades';

/**
 * Regras puras do banco de alimentos (Fase 5A). Os mesmos limites estão nos CHECK e gatilhos da
 * migration 0012; aqui ficam as mensagens e a regra que o serviço aplica antes de gravar.
 */

export function origemBibliografica(origem: OrigemFonte): boolean {
  return (ORIGENS_BIBLIOGRAFICAS as readonly OrigemFonte[]).includes(origem);
}

/** Laudo e medição própria: dados da propriedade, não científicos (D5-9). */
export function origemDaPropriedade(origem: OrigemFonte): boolean {
  return (ORIGENS_DA_PROPRIEDADE as readonly OrigemFonte[]).includes(origem);
}

/** Tabela compilada e estudo têm página ou tabela; registro sem ela não é rastreável. */
export function exigeReferenciaLocal(origem: OrigemFonte): boolean {
  return origemBibliografica(origem);
}

export function exigeDataAmostra(origem: OrigemFonte): boolean {
  return origemDaPropriedade(origem);
}

/**
 * Tipos de valor por origem. Rótulo só tem garantias (mínimo ou máximo garantido), nunca
 * composição típica; as demais origens nunca têm garantias (MODELOS_NUTRICIONAIS.md, seção 6).
 */
export function tiposValorPermitidos(origem: OrigemFonte): readonly TipoValor[] {
  if (origem === 'rotulo_comercial') return TIPOS_VALOR_GARANTIA;
  // Laudo e medição: uma amostra (valor único) ou a média de repetições informada pelo usuário.
  if (origem === 'laboratorial' || origem === 'medicao_propria') return ['valor_unico', 'media'];
  return ['valor_unico', 'media', 'mediana'];
}

/** Rótulo: garantias por kg de produto, gravadas na base MN, como no rótulo (plano, seção 4). */
export function basesPermitidas(origem: OrigemFonte): readonly BaseNutricional[] {
  return origem === 'rotulo_comercial' ? ['mn'] : ['ms', 'mn'];
}

/** Medição própria só registra matéria seca (MODELOS_NUTRICIONAIS.md, seção 3; D5-8). */
export function grupoPermitidoNaOrigem(origem: OrigemFonte, grupo: GrupoNutriente): boolean {
  return origem !== 'medicao_propria' || grupo === 'fracao_seca';
}

/**
 * Direção conservadora sugerida pelo grupo, pela regra aprovada em MODELOS_NUTRICIONAIS.md,
 * seção 5.4: energia, proteína, minerais, digestibilidade e MS → menor; fibras (e lignina) →
 * maior. Grupos que a regra não cobre ficam "não definida".
 */
export function direcaoSugeridaPorGrupo(grupo: GrupoNutriente): DirecaoConservadora {
  switch (grupo) {
    case 'fracao_seca':
    case 'proteina':
    case 'energia':
    case 'mineral_macro':
    case 'mineral_micro':
    case 'digestibilidade':
      return 'menor';
    case 'fibra':
      return 'maior';
    case 'outro':
      return 'nao_definida';
  }
}

/**
 * Variantes de método nunca são equivalentes automaticamente (decisão do usuário, 2026-10-21):
 * duas definições só valem como o mesmo nutriente se forem a mesma definição. Não há tabela de
 * equivalência entre códigos (FDN e FDN corrigida são nutrientes diferentes).
 */
export function mesmaDefinicao(a: { id: string }, b: { id: string }): boolean {
  return a.id === b.id;
}

/** Código de fonte ou nutriente: letra inicial, letras, dígitos e "_" (ex.: CQBAL_4_0, PB). */
export const PADRAO_CODIGO = /^[A-Za-z][A-Za-z0-9_]{0,29}$/;

/** Chave de unicidade do código, sem diferença de maiúsculas. */
export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

/** Definição "fundamentada" exige método, fonte e página ou tabela (D5-2). */
export function fundamentacaoCompleta(d: {
  metodoAnalitico: string | null;
  fundamentacaoFonteId: string | null;
  fundamentacaoReferencia: string | null;
}): boolean {
  return Boolean(
    d.metodoAnalitico?.trim() && d.fundamentacaoFonteId && d.fundamentacaoReferencia?.trim(),
  );
}

export interface ValorParaConferir {
  valor: number;
  unidade: UnidadeNutricional;
  base: BaseNutricional;
  tipoValor: TipoValor;
  desvioPadrao: number | null;
  minimo: number | null;
  maximo: number | null;
  nObservacoes: number | null;
}

export interface ContextoDoValor {
  origem: OrigemFonte;
  grupo: GrupoNutriente;
  unidadeReferencia: UnidadeNutricional;
  codigoNutriente: string;
  /** Migration 0018: equivalente proteico (N × 6,25) não tem teto de 100 %. */
  naturezaValor?: NaturezaValor;
}

/**
 * Problemas de um valor antes de gravar. Lista vazia = aceito. Não converte nada (regra 3c): só
 * confere se o valor cabe na unidade em que foi publicado e se combina com a origem e a definição.
 */
export function problemasDoValor(v: ValorParaConferir, ctx: ContextoDoValor): string[] {
  const problemas: string[] = [];
  const simbolo = DEFINICOES_UNIDADE[v.unidade].simbolo;
  if (!mesmaGrandeza(v.unidade, ctx.unidadeReferencia))
    problemas.push(
      `A unidade ${simbolo} não é da mesma grandeza da unidade de referência de ${ctx.codigoNutriente} (${DEFINICOES_UNIDADE[ctx.unidadeReferencia].simbolo}).`,
    );
  for (const [rotulo, numero] of [
    ['O valor', v.valor],
    ['O mínimo', v.minimo],
    ['O máximo', v.maximo],
  ] as const)
    if (numero !== null && !dentroDaFaixaDaNatureza(numero, v.unidade, ctx.naturezaValor))
      problemas.push(
        ctx.naturezaValor && ctx.naturezaValor !== 'fracao_massica'
          ? `${rotulo} de equivalente proteico (N × 6,25) não pode ser negativo.`
          : `${rotulo} deve estar ${descreverFaixa(v.unidade) ?? 'na faixa da unidade'}.`,
      );
  if (v.desvioPadrao !== null && !(v.desvioPadrao >= 0))
    problemas.push('O desvio-padrão não pode ser negativo.');
  if (v.minimo !== null && v.maximo !== null && v.minimo > v.maximo)
    problemas.push('O mínimo publicado é maior que o máximo.');
  if (v.nObservacoes !== null && !(Number.isInteger(v.nObservacoes) && v.nObservacoes >= 1))
    problemas.push('O número de observações deve ser inteiro e maior que zero.');
  if (!tiposValorPermitidos(ctx.origem).includes(v.tipoValor))
    problemas.push(
      ctx.origem === 'rotulo_comercial'
        ? 'Rótulo comercial só registra mínimo ou máximo garantido.'
        : 'Mínimo e máximo garantidos são exclusivos de rótulo comercial.',
    );
  if (!basesPermitidas(ctx.origem).includes(v.base))
    problemas.push('Garantias de rótulo ficam na base matéria natural, como no rótulo.');
  if (!grupoPermitidoNaOrigem(ctx.origem, ctx.grupo))
    problemas.push('Medição própria registra somente matéria seca.');
  return problemas;
}

/**
 * Faixa pela natureza do valor: fração mássica pela unidade; equivalente proteico (PB total ou
 * parcela de NNP, N × 6,25) só não pode ser negativo, porque pode passar de 100 % (ureia).
 */
export function dentroDaFaixaDaNatureza(
  valor: number,
  unidade: UnidadeNutricional,
  natureza: NaturezaValor = 'fracao_massica',
): boolean {
  if (natureza === 'fracao_massica') return dentroDaFaixaDaUnidade(valor, unidade);
  return Number.isFinite(valor) && valor >= 0;
}

/** Campos da fonte que dependem da origem (mesmas regras dos CHECK da tabela `fonte`). */
export interface CamposFonteParaConferir {
  origem: OrigemFonte;
  codigo: string | null;
  autores: string | null;
  ano: number | null;
  laboratorio: string | null;
  numeroLaudo: string | null;
  dataLaudo: string | null;
  fabricante: string | null;
  registroProduto: string | null;
  metodoMedicao: string | null;
  limitacoesMedicao: string | null;
  propriedadeId: string | null;
}

export type CampoFonte = keyof CamposFonteParaConferir;

/** Problemas por campo. Lista vazia = fonte aceita. */
export function problemasDaFonte(
  f: CamposFonteParaConferir,
): { campo: CampoFonte; mensagem: string }[] {
  const p: { campo: CampoFonte; mensagem: string }[] = [];
  const exigir = (campo: CampoFonte, mensagem: string) => {
    if (f[campo] === null) p.push({ campo, mensagem });
  };
  const proibir = (campos: CampoFonte[], mensagem: string) => {
    for (const campo of campos) if (f[campo] !== null) p.push({ campo, mensagem });
  };
  if (f.origem === 'sistema_exigencias')
    p.push({ campo: 'origem', mensagem: 'Origem reservada para a Fase 6.' });
  if (origemBibliografica(f.origem)) {
    exigir('codigo', 'Publicação científica exige um código (ex.: CQBAL_4_0).');
    exigir('autores', 'Publicação científica exige os autores.');
    exigir('ano', 'Publicação científica exige o ano.');
  }
  if (origemDaPropriedade(f.origem))
    exigir('propriedadeId', 'Laudo e medição própria pertencem a uma propriedade.');
  else proibir(['propriedadeId'], 'Só laudo e medição própria pertencem a uma propriedade.');
  if (f.origem === 'laboratorial') exigir('laboratorio', 'Informe o laboratório.');
  else
    proibir(['laboratorio', 'numeroLaudo', 'dataLaudo'], 'Campo exclusivo de laudo laboratorial.');
  if (f.origem === 'rotulo_comercial') exigir('fabricante', 'Informe o fabricante.');
  else proibir(['fabricante', 'registroProduto'], 'Campo exclusivo de rótulo comercial.');
  if (f.origem === 'medicao_propria') {
    exigir('metodoMedicao', 'Descreva o método de medição.');
    exigir('limitacoesMedicao', 'Descreva as limitações do método.');
  } else proibir(['metodoMedicao', 'limitacoesMedicao'], 'Campo exclusivo de medição própria.');
  if (f.codigo !== null && !PADRAO_CODIGO.test(f.codigo))
    p.push({
      campo: 'codigo',
      mensagem: 'Código: comece com letra e use só letras sem acento, dígitos e "_" (até 30).',
    });
  return p;
}
