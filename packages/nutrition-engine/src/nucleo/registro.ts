import type { Categoria, Conferencia, ReferenciaFonte, Resultado } from './tipos';
import type { Quantidade, Unidade } from './unidades';
import { exigirUnidade } from './unidades';
import { comUnidade, formatarLimite, formatarValor } from './texto';

/** Faixa de uma entrada no domínio validado, com a fonte da faixa. */
export interface FaixaDominio {
  minimo: number;
  maximo: number;
  fonte: string;
  /** Limite provisório (ex.: banco de dados não descrito na edição usada; P-13). */
  provisorio?: boolean;
}

/**
 * Equação registrada (MODELOS_NUTRICIONAIS.md, 7.3; decisões A1 e A2). A lógica fica em
 * `calcular`; coeficientes vêm de arquivo de dados com a página. O registro confere unidade,
 * escopo e domínio antes de calcular e devolve sempre um Resultado, nunca um número solto.
 */
export interface EquacaoRegistrada {
  id: string;
  descricao: string;
  referencias: readonly ReferenciaFonte[];
  entradas: Readonly<Record<string, Unidade>>;
  saida: Unidade;
  /** null = a categoria está no escopo; texto = por que não está. */
  escopo: (c: Categoria) => string | null;
  /** Faixas validadas por entrada, para a categoria; ausente = sem faixa publicada. */
  dominio: (c: Categoria) => Readonly<Record<string, FaixaDominio>>;
  /**
   * Faixa validada do próprio resultado, quando a equação usa o resultado como variável (ex.: PB
   * em forma fechada, em que o CPB da PBmic é a própria PB; P-06). Ausente = sem faixa.
   */
  dominioSaida?: (c: Categoria) => FaixaDominio | undefined;
  /**
   * Inconsistência do resultado (ex.: PNDR exigida negativa, D-PROT-09): texto = calculado, sem
   * uso operacional, nunca corrigido para outro valor; null = consistente.
   */
  consistenciaSaida?: (
    valor: number,
    e: Readonly<Record<string, number>>,
    k: Readonly<Record<string, number>>,
  ) => string | null;
  /**
   * Categoria no escopo, mas sem banco de dados publicado para esta equação (ex.: ganho mineral de
   * zebuíno castrado a pasto, sem linha na Tabela 10.5): texto = calculado sem uso operacional.
   */
  semDominioPublicado?: (c: Categoria) => string | null;
  /** Entradas fora do escopo (ex.: GMD negativo, P-01); null = no escopo. */
  escopoEntradas?: (e: Readonly<Record<string, number>>) => string | null;
  coeficientes: (c: Categoria) => Readonly<Record<string, number>>;
  calcular: (e: Readonly<Record<string, number>>, k: Readonly<Record<string, number>>) => number;
  conferencia: Conferencia;
  /**
   * Avisos que acompanham todo resultado calculado: limitação científica ou restrição de
   * aplicação (ex.: faixa de validade não tabelada).
   */
  avisosFixos?: readonly string[];
  /** Notas informativas fixas, que não são limitação (ex.: exigência não é oferta da dieta). */
  notasFixas?: readonly string[];
  /** Casos do livro que a equação passa; sem caso, a equação não fica ativa (A2). */
  casosDeTeste: readonly string[];
}

export class ErroRegistro extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroRegistro';
  }
}

/** Equação ativa: transcrita, com ao menos uma conferência na imagem da página e caso de teste. */
export function equacaoAtiva(e: EquacaoRegistrada): boolean {
  return (
    e.conferencia.transcritoPor.trim() !== '' &&
    e.conferencia.conferencias.length > 0 &&
    e.casosDeTeste.length > 0
  );
}

export class RegistroEquacoes {
  private readonly equacoes = new Map<string, EquacaoRegistrada>();

  registrar(e: EquacaoRegistrada): void {
    if (this.equacoes.has(e.id)) throw new ErroRegistro(`Equação repetida: ${e.id}.`);
    if (!equacaoAtiva(e))
      throw new ErroRegistro(`Equação ${e.id} sem transcrição, conferência ou caso de teste.`);
    if (e.referencias.length === 0) throw new ErroRegistro(`Equação ${e.id} sem referência.`);
    this.equacoes.set(e.id, e);
  }

  obter(id: string): EquacaoRegistrada {
    const e = this.equacoes.get(id);
    if (!e) throw new ErroRegistro(`Equação não registrada: ${id}.`);
    return e;
  }

  listar(): EquacaoRegistrada[] {
    return [...this.equacoes.values()];
  }
}

/**
 * Aplica uma equação: confere unidades, escopo da categoria e das entradas, calcula com precisão
 * integral e marca o domínio. Fora do domínio, o valor é calculado mas sem uso operacional (C10).
 */
export function aplicar(
  e: EquacaoRegistrada,
  categoria: Categoria,
  entradas: Readonly<Record<string, Quantidade | null>>,
): Resultado {
  const base = {
    equacaoId: e.id,
    unidade: e.saida,
    coeficientes: {} as Record<string, number>,
    entradas: {} as Resultado['entradas'],
  };
  const faltando = Object.keys(e.entradas).filter((n) => !entradas[n]);
  if (faltando.length)
    return {
      ...base,
      situacao: 'indeterminado',
      valor: null,
      usoOperacional: false,
      motivos: [`Falta ${faltando.join(', ')}.`],
      avisos: [],
      notas: [],
    };
  const valores: Record<string, number> = {};
  for (const [nome, unidade] of Object.entries(e.entradas)) {
    const x = entradas[nome]!;
    valores[nome] = exigirUnidade(nome, x, unidade);
    base.entradas[nome] = { valor: x.valor, unidade: x.unidade };
  }
  const foraEscopo = e.escopo(categoria) ?? e.escopoEntradas?.(valores) ?? null;
  if (foraEscopo)
    return {
      ...base,
      situacao: 'fora_do_escopo',
      valor: null,
      usoOperacional: false,
      motivos: [foraEscopo],
      avisos: [],
      notas: [],
    };
  const k = e.coeficientes(categoria);
  const valor = e.calcular(valores, k);
  if (!Number.isFinite(valor))
    return {
      ...base,
      coeficientes: { ...k },
      situacao: 'fora_do_escopo',
      valor: null,
      usoOperacional: false,
      motivos: ['A equação não é definida para estas entradas.'],
      avisos: [],
      notas: [],
    };
  const motivos: string[] = [];
  const avisos: string[] = [];
  const intervalo = (f: FaixaDominio, unidade: Unidade) =>
    comUnidade(`${formatarLimite(f.minimo)} a ${formatarLimite(f.maximo)}`, unidade);
  for (const [nome, faixa] of Object.entries(e.dominio(categoria))) {
    const v = valores[nome];
    const unidade = e.entradas[nome]!;
    const provisorio = faixa.provisorio ? ', limite provisório' : '';
    if (v !== undefined && (v < faixa.minimo || v > faixa.maximo))
      motivos.push(
        `${nome} = ${comUnidade(formatarValor(v, [faixa.minimo, faixa.maximo]), unidade)} fora do domínio validado (${intervalo(faixa, unidade)}${provisorio}; ${faixa.fonte}).`,
      );
    else if (faixa.provisorio)
      avisos.push(`Domínio de ${nome} provisório (${intervalo(faixa, unidade)}; ${faixa.fonte}).`);
  }
  const semDominio = e.semDominioPublicado?.(categoria);
  if (semDominio) motivos.push(semDominio);
  const inconsistencia = e.consistenciaSaida?.(valor, valores, k);
  if (inconsistencia) motivos.push(`Inconsistência: ${inconsistencia}`);
  const saida = e.dominioSaida?.(categoria);
  if (saida && (valor < saida.minimo || valor > saida.maximo))
    motivos.push(
      `Resultado = ${comUnidade(formatarValor(valor, [saida.minimo, saida.maximo]), e.saida)} fora do domínio validado (${intervalo(saida, e.saida)}; ${saida.fonte}).`,
    );
  return {
    ...base,
    coeficientes: { ...k },
    situacao: motivos.length ? 'fora_do_dominio' : 'valido',
    valor,
    usoOperacional: motivos.length === 0,
    motivos,
    avisos: [...avisos, ...(e.avisosFixos ?? [])],
    notas: [...(e.notasFixas ?? [])],
  };
}
