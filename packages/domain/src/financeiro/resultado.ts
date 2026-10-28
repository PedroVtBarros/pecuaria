import { apurarComponentes, somarApuracoes, type Apuracao } from './apuracao';

/**
 * Resultado, margens e indicadores (entrega 4G). Só aritmética, sem parâmetro científico; a única
 * constante é 1 @ = 15 kg (D-B), aplicada separadamente a peso vivo e a peso de carcaça, nunca
 * convertidos entre si. Valor desconhecido nunca vira zero: deixa o resultado parcial. Custo não
 * classificado nunca entra em silêncio em indicador que dependa da classificação (D-E).
 */
export const GRAMAS_POR_ARROBA = 15_000;

export type Classificacao = 'fixo' | 'variavel' | 'nao_classificado';

export interface ParteClassificada {
  classificacao: Classificacao;
  /** `null` = custo desconhecido. */
  valorCentavos: number | null;
}

/** Divisão inteira com arredondamento ao mais próximo (meio para cima), exata em BigInt. */
export function dividirArredondado(numerador: bigint, denominador: bigint): bigint {
  if (denominador === 0n) throw new Error('Divisão por zero.');
  const negativo = numerador < 0n !== denominador < 0n;
  const n = numerador < 0n ? -numerador : numerador;
  const d = denominador < 0n ? -denominador : denominador;
  const q = (n * 2n + d) / (d * 2n);
  return negativo ? -q : q;
}
const inteiro = (v: bigint): number => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error('Valor fora do limite de precisão.');
  return n;
};

export interface TotaisPorClassificacao {
  apuracao: Apuracao;
  fixoCentavos: number;
  variavelCentavos: number;
  naoClassificadoCentavos: number;
  /** Partes de valor desconhecido, por classificação. */
  desconhecidos: Record<Classificacao, number>;
}

export function totalizarPorClassificacao(
  partes: readonly ParteClassificada[],
): TotaisPorClassificacao {
  const soma: Record<Classificacao, bigint> = { fixo: 0n, variavel: 0n, nao_classificado: 0n };
  const desconhecidos: Record<Classificacao, number> = {
    fixo: 0,
    variavel: 0,
    nao_classificado: 0,
  };
  for (const p of partes) {
    if (p.valorCentavos === null) desconhecidos[p.classificacao] += 1;
    else soma[p.classificacao] += BigInt(p.valorCentavos);
  }
  return {
    apuracao: apurarComponentes(
      partes.map((p) =>
        p.valorCentavos === null
          ? ({ tipo: 'desconhecido' } as const)
          : ({ tipo: 'conhecido', valorCentavos: p.valorCentavos } as const),
      ),
    ),
    fixoCentavos: inteiro(soma.fixo),
    variavelCentavos: inteiro(soma.variavel),
    naoClassificadoCentavos: inteiro(soma.nao_classificado),
    desconhecidos,
  };
}

/**
 * Completude do resultado econômico (regra única para telas e relatórios):
 * - completo: toda receita e todo custo têm valor conhecido;
 * - parcial: falta algum valor, mas há receita conhecida; o valor mostrado é só o conhecido;
 * - nao_apurado: há receita desconhecida e nenhuma receita conhecida: não há resultado a mostrar.
 */
export type EstadoResultado = 'completo' | 'parcial' | 'nao_apurado';
/**
 * Como ler o valor conhecido: exato (completo); no máximo (falta só custo, que só reduz); no
 * mínimo (falta só receita, que só aumenta); sem limite (faltam receita e custo).
 */
export type LimiteResultado = 'exato' | 'no_maximo' | 'no_minimo' | 'sem_limite';

/**
 * Receitas do resultado, por competência. Receita reconhecida e ainda não recebida (venda a prazo,
 * parcela em aberto, condição a definir) é receita conhecida: recebimento é caixa, não completude.
 */
export interface ReceitasDoResultado {
  /** Soma das receitas de valor conhecido. */
  conhecidaCentavos: number;
  /** Quantas receitas de valor conhecido (inclusive zero conhecido, como a morte sem venda). */
  conhecidas: number;
  /** Fatos que geram receita sem valor registrado (ex.: venda registrada só no rebanho). */
  desconhecidas: number;
}

export interface Resultado {
  /** Receita de valor conhecido. */
  receitaCentavos: number;
  receitasDesconhecidas: number;
  custo: Apuracao;
  /** Receita conhecida − custo conhecido + estorno de custo. Só é o resultado quando completo. */
  valorConhecidoCentavos: number;
  /** `null` quando não apurado; nunca trata o desconhecido como zero. */
  resultadoCentavos: number | null;
  estado: EstadoResultado;
  /** `null` quando não apurado. */
  limite: LimiteResultado | null;
}

/**
 * Resultado = receita − (custo − estorno), com a completude das duas pontas. O estorno é custo já
 * levado ao resultado que volta a ser ativo (ex.: a aquisição de um animal devolvido pelo comprador,
 * que retorna ao rebanho): valor conhecido, que não muda a completude.
 */
export function apurarResultado(
  receitas: ReceitasDoResultado,
  custo: Apuracao,
  estornoDeCustoCentavos = 0,
): Resultado {
  if (!Number.isSafeInteger(estornoDeCustoCentavos) || estornoDeCustoCentavos < 0)
    throw new Error('Estorno de custo inválido.');
  for (const n of [receitas.conhecidaCentavos, receitas.conhecidas, receitas.desconhecidas])
    if (!Number.isSafeInteger(n)) throw new Error('Receita inválida.');
  if (receitas.conhecidas < 0 || receitas.desconhecidas < 0)
    throw new Error('Contagem de receitas inválida.');
  const valor = inteiro(
    BigInt(receitas.conhecidaCentavos) -
      BigInt(custo.valorConhecidoCentavos) +
      BigInt(estornoDeCustoCentavos),
  );
  const faltaReceita = receitas.desconhecidas > 0;
  const faltaCusto = custo.estado !== 'completa';
  const base = {
    receitaCentavos: receitas.conhecidaCentavos,
    receitasDesconhecidas: receitas.desconhecidas,
    custo,
    valorConhecidoCentavos: valor,
  };
  if (faltaReceita && receitas.conhecidas === 0)
    return { ...base, resultadoCentavos: null, estado: 'nao_apurado', limite: null };
  if (!faltaReceita && !faltaCusto)
    return { ...base, resultadoCentavos: valor, estado: 'completo', limite: 'exato' };
  return {
    ...base,
    resultadoCentavos: valor,
    estado: 'parcial',
    limite: faltaReceita ? (faltaCusto ? 'sem_limite' : 'no_minimo') : 'no_maximo',
  };
}

export interface MargemBruta {
  receitaCentavos: number;
  variaveisCentavos: number;
  /** Receita − custos variáveis conhecidos. */
  margemCentavos: number;
  /** Calculada só quando todo custo está classificado e tem valor conhecido. */
  estado: 'calculada' | 'parcial';
  coberturaCentavos: { classificado: number; total: number; naoClassificado: number };
  motivos: string[];
}

/** Margem bruta = receita − custos variáveis. Depende da classificação: mostra a cobertura. */
export function apurarMargemBruta(
  receitaCentavos: number,
  partes: readonly ParteClassificada[],
): MargemBruta {
  const t = totalizarPorClassificacao(partes);
  const motivos: string[] = [];
  const naoClassificados = partes.filter((p) => p.classificacao === 'nao_classificado').length;
  if (naoClassificados > 0)
    motivos.push(`${naoClassificados} custo(s) sem classificação de fixo ou variável.`);
  const desconhecidos =
    t.desconhecidos.fixo + t.desconhecidos.variavel + t.desconhecidos.nao_classificado;
  if (desconhecidos > 0) motivos.push(`${desconhecidos} custo(s) de valor desconhecido.`);
  const classificado = t.fixoCentavos + t.variavelCentavos;
  return {
    receitaCentavos,
    variaveisCentavos: t.variavelCentavos,
    margemCentavos: receitaCentavos - t.variavelCentavos,
    estado: motivos.length === 0 ? 'calculada' : 'parcial',
    coberturaCentavos: {
      classificado,
      total: classificado + t.naoClassificadoCentavos,
      naoClassificado: t.naoClassificadoCentavos,
    },
    motivos,
  };
}

export type BaseDeUnidade = 'cabeca' | 'kg_vivo' | 'arroba_vivo' | 'arroba_carcaca';

export interface PontoDeEquilibrio {
  estado: 'calculado' | 'indisponivel';
  /** Quantidade na base escolhida, em milésimos (cabeças, kg ou @). */
  unidadesMilesimos: number | null;
  precoMedioCentavos: number | null;
  custoVariavelPorUnidadeCentavos: number | null;
  motivos: string[];
}

/**
 * Ponto de equilíbrio = custos fixos ÷ (preço médio por unidade − custo variável por unidade).
 * Com preço = receita ÷ unidades e custo variável = variáveis ÷ unidades, fica
 * fixos × unidades ÷ (receita − variáveis). Indisponível sem classificação completa, com custo
 * desconhecido, sem unidade vendida ou com margem de contribuição não positiva.
 */
export function apurarPontoDeEquilibrio(e: {
  partes: readonly ParteClassificada[];
  receitaDasUnidadesCentavos: number;
  unidadesMilesimos: number;
}): PontoDeEquilibrio {
  const t = totalizarPorClassificacao(e.partes);
  const motivos: string[] = [];
  const naoClassificados = e.partes.filter((p) => p.classificacao === 'nao_classificado').length;
  if (naoClassificados > 0)
    motivos.push(`${naoClassificados} custo(s) sem classificação: classifique-os para calcular.`);
  const desconhecidos =
    t.desconhecidos.fixo + t.desconhecidos.variavel + t.desconhecidos.nao_classificado;
  if (desconhecidos > 0) motivos.push(`${desconhecidos} custo(s) de valor desconhecido.`);
  if (e.unidadesMilesimos <= 0)
    motivos.push('Nenhuma unidade vendida na base escolhida no período.');
  const indisponivel = (): PontoDeEquilibrio => ({
    estado: 'indisponivel',
    unidadesMilesimos: null,
    precoMedioCentavos: null,
    custoVariavelPorUnidadeCentavos: null,
    motivos,
  });
  if (motivos.length > 0) return indisponivel();
  const u = BigInt(e.unidadesMilesimos);
  const preco = inteiro(dividirArredondado(BigInt(e.receitaDasUnidadesCentavos) * 1000n, u));
  const cvu = inteiro(dividirArredondado(BigInt(t.variavelCentavos) * 1000n, u));
  const contribuicao = BigInt(e.receitaDasUnidadesCentavos) - BigInt(t.variavelCentavos);
  if (contribuicao <= 0n) {
    motivos.push(
      'A margem de contribuição não é positiva: com estes custos variáveis não há ponto de equilíbrio.',
    );
    return { ...indisponivel(), precoMedioCentavos: preco, custoVariavelPorUnidadeCentavos: cvu };
  }
  return {
    estado: 'calculado',
    unidadesMilesimos: inteiro(dividirArredondado(BigInt(t.fixoCentavos) * u, contribuicao)),
    precoMedioCentavos: preco,
    custoVariavelPorUnidadeCentavos: cvu,
    motivos,
  };
}

export interface AnimalComGanho {
  /** Custo apropriado ao animal no período; `null` = desconhecido. */
  custo: Apuracao;
  ganhoGramas: number;
}

export interface CustoPorKgGanho {
  /** Centavos por kg de peso vivo ganho (arredondado ao centavo); `null` sem ganho positivo. */
  centavosPorKg: number | null;
  animais: number;
  ganhoGramas: number;
  custo: Apuracao;
  estado: 'completo' | 'parcial' | 'indisponivel';
}

/** Custo por kg ganho = Σ custo no período ÷ Σ ganho de peso real, só dos animais com ganho medido. */
export function apurarCustoPorKgGanho(animais: readonly AnimalComGanho[]): CustoPorKgGanho {
  const custo =
    animais.length > 0
      ? somarApuracoes(animais.map((a) => a.custo))
      : apurarComponentes([{ tipo: 'nao_apurado' }]);
  const ganho = animais.reduce((s, a) => s + a.ganhoGramas, 0);
  if (animais.length === 0 || ganho <= 0)
    return {
      centavosPorKg: null,
      animais: animais.length,
      ganhoGramas: ganho,
      custo,
      estado: 'indisponivel',
    };
  return {
    centavosPorKg: inteiro(
      dividirArredondado(BigInt(custo.valorConhecidoCentavos) * 1000n, BigInt(ganho)),
    ),
    animais: animais.length,
    ganhoGramas: ganho,
    custo,
    estado: custo.estado === 'completa' ? 'completo' : 'parcial',
  };
}

/** Valor por @ (15 kg) a partir de um total em centavos e um peso em gramas. `null` sem peso. */
export function valorPorArroba(totalCentavos: number, gramas: number): number | null {
  if (gramas <= 0) return null;
  return inteiro(
    dividirArredondado(BigInt(totalCentavos) * BigInt(GRAMAS_POR_ARROBA), BigInt(gramas)),
  );
}

export interface PremissasDeProjecao {
  /** Data esperada da venda (informativa). */
  data: string;
  unidadePreco: BaseDeUnidade;
  /** Preço esperado por unidade da base. */
  precoUnitarioCentavos: number;
  quantidadeAnimais: number;
  /** Peso vivo esperado por animal, em gramas (exigido para kg vivo e @ vivo). */
  pesoVivoGramasPorAnimal: number | null;
  /** Peso de carcaça esperado por animal, em gramas (exigido para @ de carcaça). Nunca estimado. */
  pesoCarcacaGramasPorAnimal: number | null;
  /** Custos futuros esperados até a venda, informados pelo usuário. */
  custosFuturosCentavos: number;
}

export interface Projecao {
  receitaEsperadaCentavos: number;
  custoAcumulado: Apuracao;
  custosFuturosCentavos: number;
  /** Receita esperada − (custo acumulado conhecido + custos futuros). */
  resultadoProjetadoCentavos: number;
  estado: 'completo' | 'parcial';
  erros: string[];
}

/**
 * Projeção por premissas do usuário (5.10): aritmética simples, nada é gravado nem somado a
 * totais apurados. Não extrapola ganho de peso nem preço; o peso de carcaça nunca é estimado a
 * partir do peso vivo.
 */
export function projetarResultado(p: PremissasDeProjecao, custoAcumulado: Apuracao): Projecao {
  const erros: string[] = [];
  if (!Number.isSafeInteger(p.quantidadeAnimais) || p.quantidadeAnimais <= 0)
    erros.push('Não há animais para projetar.');
  if (!Number.isSafeInteger(p.precoUnitarioCentavos) || p.precoUnitarioCentavos <= 0)
    erros.push('Informe o preço esperado.');
  if (
    (p.unidadePreco === 'kg_vivo' || p.unidadePreco === 'arroba_vivo') &&
    !p.pesoVivoGramasPorAnimal
  )
    erros.push('Informe o peso vivo esperado por animal.');
  if (p.unidadePreco === 'arroba_carcaca' && !p.pesoCarcacaGramasPorAnimal)
    erros.push(
      'Informe o peso de carcaça esperado por animal: ele não é estimado a partir do peso vivo.',
    );
  if (!Number.isSafeInteger(p.custosFuturosCentavos) || p.custosFuturosCentavos < 0)
    erros.push('Custos futuros inválidos.');
  const estado = custoAcumulado.estado === 'completa' ? 'completo' : 'parcial';
  if (erros.length > 0)
    return {
      receitaEsperadaCentavos: 0,
      custoAcumulado,
      custosFuturosCentavos: p.custosFuturosCentavos,
      resultadoProjetadoCentavos: 0,
      estado,
      erros,
    };
  const n = BigInt(p.quantidadeAnimais);
  const preco = BigInt(p.precoUnitarioCentavos);
  let receita: bigint;
  if (p.unidadePreco === 'cabeca') receita = preco * n;
  else if (p.unidadePreco === 'kg_vivo')
    receita = dividirArredondado(preco * BigInt(p.pesoVivoGramasPorAnimal as number) * n, 1000n);
  else if (p.unidadePreco === 'arroba_vivo')
    receita = dividirArredondado(
      preco * BigInt(p.pesoVivoGramasPorAnimal as number) * n,
      BigInt(GRAMAS_POR_ARROBA),
    );
  else
    receita = dividirArredondado(
      preco * BigInt(p.pesoCarcacaGramasPorAnimal as number) * n,
      BigInt(GRAMAS_POR_ARROBA),
    );
  const r = inteiro(receita);
  return {
    receitaEsperadaCentavos: r,
    custoAcumulado,
    custosFuturosCentavos: p.custosFuturosCentavos,
    resultadoProjetadoCentavos: r - custoAcumulado.valorConhecidoCentavos - p.custosFuturosCentavos,
    estado,
    erros,
  };
}
