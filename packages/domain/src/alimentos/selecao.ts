import { normalizarNome } from '../comum/texto';
import type {
  BaseNutricional,
  DirecaoConservadora,
  FormaConservacao,
  OrigemFonte,
  StatusRegistro,
  TipoValor,
} from './enumeracoes';
import type { FormaObtencao } from './origem-dados';
import { converterUnidade, existeConversao, type UnidadeNutricional } from './unidades';

/**
 * Seleção de composição (Fase 5D; PLANO_FASE_5.md, seção 13; MODELOS_NUTRICIONAIS.md, seções 4
 * e 5). Funções puras: recebem os registros já lidos do banco e devolvem candidatos, níveis,
 * origens independentes, agregação por nutriente e cenários reais. Nada aqui inventa número:
 * a média é das origens elegíveis, os extremos são valores observados e o cenário é o perfil de
 * um registro real. Ausente continua ausente.
 */

export const NIVEIS_CORRESPONDENCIA = ['especifico', 'comparavel', 'geral'] as const;
export type NivelCorrespondencia = (typeof NIVEIS_CORRESPONDENCIA)[number];

export const TIPOS_PERFIL = ['referencia_individual', 'agregado_central', 'cenario_real'] as const;
export type TipoPerfil = (typeof TIPOS_PERFIL)[number];

export const SENTIDOS_CENARIO = ['conservador', 'favoravel'] as const;
export type SentidoCenario = (typeof SENTIDOS_CENARIO)[number];

export const CENARIOS_PERFIL = ['unico', 'central', 'conservador', 'favoravel'] as const;
export type CenarioPerfil = (typeof CENARIOS_PERFIL)[number];

/**
 * Regra de seleção e agregação. O conteúdo é fixo por versão (mudar é versão nova); só vale
 * depois de aprovada pelo usuário no aplicativo. Os perfis gravam a versão usada.
 */
export interface RegraSelecao {
  codigo: string;
  versao: number;
  titulo: string;
  /** Origens independentes mínimas para agregar; abaixo, só referência individual. */
  nMinimoOrigens: number;
  /** Diferença de idade de corte aceita no nível comparável; 0 = nenhuma aproximação. */
  toleranciaIdadeDias: number;
  /**
   * Idade escrita só no texto da classe da fonte (ex.: "CAPIM ... 60 DIAS"), sem idade estruturada.
   * 'ignorada' (versão 1): tratada como idade desconhecida. 'verificada' (versão 2): diferente da
   * buscada exclui; igual fica pendente de validação, sem virar específico nem comparável.
   */
  idadeTextual: 'ignorada' | 'verificada';
  justificativaTolerancia: string | null;
  niveisAgregaveis: readonly NivelCorrespondencia[];
  origensAgregaveis: readonly OrigemFonte[];
  valorCentral: 'media_simples_por_origem';
  extremos: 'minimo_maximo_observados';
  cenarios: 'perfil_real_por_nutriente';
  /** Pares de método tidos como equivalentes, com fundamento. Vazio: método diferente não combina. */
  equivalenciasMetodo: readonly { a: string; b: string; fundamento: string }[];
  basesInferidas: 'somente_validadas';
  usoComCautela: 'fora_da_agregacao';
  /** As decisões do usuário que a regra aplica, como texto, para a tela e o histórico. */
  decisoes: readonly string[];
}

/** Regra da 5D, pelas decisões do usuário ao autorizar a fase (2026-10-21). */
export const REGRA_SELECAO_5D_V1: RegraSelecao = {
  codigo: 'SELECAO_5D',
  versao: 1,
  titulo: 'Seleção e agregação da Fase 5D',
  nMinimoOrigens: 3,
  toleranciaIdadeDias: 0,
  justificativaTolerancia: null,
  idadeTextual: 'ignorada',
  niveisAgregaveis: ['especifico'],
  origensAgregaveis: ['estudo_individual'],
  valorCentral: 'media_simples_por_origem',
  extremos: 'minimo_maximo_observados',
  cenarios: 'perfil_real_por_nutriente',
  equivalenciasMetodo: [],
  basesInferidas: 'somente_validadas',
  usoComCautela: 'fora_da_agregacao',
  decisoes: [
    'Agregação só com pelo menos 3 origens independentes; com menos, referência individual, sem média artificial, identificada como evidência limitada.',
    'Valor central: média simples por origem independente, com a mediana e a cobertura por nutriente.',
    'Extremos: mínimo e máximo observados, nunca intervalo de confiança.',
    'Cenários: perfis reais e coerentes (todos os nutrientes de um mesmo registro), escolhidos pelo extremo de um nutriente e rotulados por ele; nenhum nutriente isolado é tratado como qualidade global.',
    'MO, MM e EE sem direção conservadora: sem cenário por eles.',
    'Bases inferidas só entram na agregação depois de validadas pelo usuário.',
    'Métodos e formas de obtenção diferentes não são combinados sem equivalência fundamentada (nenhuma cadastrada).',
    'Vínculos não descartados agrupam registros de forma transitiva: o grupo conta como uma origem.',
    'Tratamentos do mesmo experimento contam como uma origem; cada tratamento continua separado, e o usuário escolhe qual representa a origem.',
    'Tabelas compiladas não são combinadas entre si nem com estudos individuais: só entram como referência individual.',
    'Registro ou valor marcado "uso com cautela" fica fora da agregação; pode ser usado como referência individual, com aviso.',
    'Correspondência específica exige a mesma idade de corte; aproximação só com tolerância justificada em versão aprovada da regra.',
    'Nunca cruzar espécie, cultivar, forma de conservação, parte da planta ou processamento; entrada sem cultivar da mesma espécie é o nível geral.',
  ],
};

/**
 * Versão 2 (correção da aprovação da 5D, 2026-10-22): idade escrita no texto da classe da fonte
 * não é idade desconhecida. Diferente da buscada: fora. Igual: pendente de validação (o texto não
 * prova a idade; o CQBAL já mostrou classe inconsistente), até a idade ser preenchida numa versão
 * conferida do registro. O texto original é preservado e mostrado.
 */
export const REGRA_SELECAO_5D_V2: RegraSelecao = {
  ...REGRA_SELECAO_5D_V1,
  versao: 2,
  idadeTextual: 'verificada',
  decisoes: [
    ...REGRA_SELECAO_5D_V1.decisoes.filter((d) => !d.startsWith('Correspondência específica')),
    'Correspondência específica exige a mesma idade de corte estruturada; aproximação só com tolerância justificada em versão aprovada da regra.',
    'Sem idade estruturada: idade realmente desconhecida é comparável, com aviso; idade escrita no texto da fonte e diferente da buscada exclui; igual fica pendente de validação, sem virar específico nem comparável, até a idade ser preenchida numa versão conferida do registro.',
  ],
};

export const REGRAS_SELECAO: readonly RegraSelecao[] = [REGRA_SELECAO_5D_V1, REGRA_SELECAO_5D_V2];

/**
 * Idades de corte escritas num texto da fonte ("60 DIAS", "120 dias"). Só leitura do texto: não
 * prova a idade. Vazio se não houver; mais de uma, se o texto citar várias.
 */
export function idadesNoTexto(texto: string | null): number[] {
  if (!texto) return [];
  return [...new Set([...texto.matchAll(/(\d+)\s*DIAS?\b/giu)].map((m) => Number(m[1])))];
}

/** Texto canônico da regra (chaves ordenadas), para o hash gravado na aprovação. */
export function conteudoDaRegra(r: RegraSelecao): string {
  const ordenar = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(ordenar)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, ordenar((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(ordenar(r));
}

// ---------------------------------------------------------------- Entradas

export interface IdentidadeAlimento {
  id: string;
  nome: string;
  especie: string | null;
  cultivar: string | null;
  partePlanta: string | null;
  formaConservacao: FormaConservacao;
  processamento: string | null;
}

export interface ValorCandidato {
  id: string;
  nutrienteId: string;
  valor: number;
  valorPublicado: string;
  unidade: UnidadeNutricional;
  base: BaseNutricional;
  tipoValor: TipoValor;
  nObservacoes: number | null;
  metodoAnaliticoFonte: string | null;
  formaObtencao: FormaObtencao;
  interpretacaoBase: string | null;
  /** O usuário validou a base inferida (avaliação científica ativa). */
  baseValidada: boolean;
  /** Motivo do "uso com cautela" ativo neste valor, se houver. */
  cautela: string | null;
}

export interface RegistroCandidato {
  id: string;
  /** Primeira versão da cadeia: identidade usada pelos vínculos. */
  cadeiaId: string;
  alimento: IdentidadeAlimento;
  fonteId: string;
  fonteDescricao: string;
  fonteOrigem: OrigemFonte;
  experimentoOrigem: string | null;
  referenciaLocal: string | null;
  idadeCorteDias: number | null;
  classeIdadeFonte: string | null;
  status: StatusRegistro;
  /** Não substituído nem descartado. */
  vigente: boolean;
  cautela: string | null;
  valores: readonly ValorCandidato[];
  naoQuantificados: readonly { nutrienteId: string; textoPublicado: string; natureza: string }[];
}

/** Vínculo não descartado entre duas cadeias de registros (qualquer registro do banco). */
export interface ArestaDependencia {
  a: string;
  b: string;
  motivo: string;
}

export interface NutrienteSelecao {
  id: string;
  codigo: string;
  nome: string;
  unidadeReferencia: UnidadeNutricional;
  direcaoConservadora: DirecaoConservadora;
}

export interface BuscaSelecao {
  alimento: IdentidadeAlimento;
  idadeCorteDias: number | null;
}

// ---------------------------------------------------------------- Níveis

export interface ClassificacaoCandidato {
  nivel: NivelCorrespondencia | null;
  diferencas: string[];
  avisos: string[];
  /** Por que o registro não pode ser usado; null = elegível como referência individual. */
  exclusao: string | null;
  /** Idade só no texto da fonte, igual à buscada: aguarda validação do usuário. */
  pendenteValidacaoIdade: boolean;
}

const igual = (a: string | null, b: string | null) =>
  (a === null ? null : normalizarNome(a)) === (b === null ? null : normalizarNome(b));

/**
 * Nível de correspondência do registro para a busca (MODELOS_NUTRICIONAIS.md, 4.2). Espécie,
 * forma, parte da planta e processamento nunca diferem; cultivar diferente nunca entra; entrada
 * sem cultivar da mesma espécie é o nível geral. Idade exata para o específico.
 */
export function classificarCandidato(
  busca: BuscaSelecao,
  r: RegistroCandidato,
  regra: RegraSelecao,
): ClassificacaoCandidato {
  const b = busca.alimento;
  const a = r.alimento;
  const diferencas: string[] = [];
  const avisos: string[] = [];
  const fora = (motivo: string, pendenteValidacaoIdade = false): ClassificacaoCandidato => ({
    nivel: null,
    diferencas,
    avisos,
    exclusao: motivo,
    pendenteValidacaoIdade,
  });
  let geral = false;
  if (a.id !== b.id) {
    if (b.especie === null || a.especie === null || !igual(a.especie, b.especie))
      return fora('Espécie diferente ou não informada.');
    if (a.formaConservacao !== b.formaConservacao) return fora('Forma de conservação diferente.');
    if (!igual(a.partePlanta, b.partePlanta)) return fora('Parte da planta diferente.');
    if (!igual(a.processamento, b.processamento)) return fora('Processamento diferente.');
    if (!igual(a.cultivar, b.cultivar)) {
      if (a.cultivar !== null || b.cultivar === null) return fora('Cultivar diferente.');
      geral = true;
      diferencas.push(`Entrada sem cultivar da espécie (${a.nome}).`);
    }
  }
  if (r.fonteOrigem === 'tabela_compilada')
    avisos.push('Tabela compilada: só como referência individual, nunca somada a outras fontes.');

  const ib = busca.idadeCorteDias;
  const ir = r.idadeCorteDias;
  const textuais = idadesNoTexto(r.classeIdadeFonte);
  if (regra.idadeTextual === 'verificada' && ir !== null && textuais.some((t) => t !== ir))
    avisos.push(
      `O texto da fonte ("${r.classeIdadeFonte}") cita outra idade que a estruturada (${ir} dias).`,
    );
  if (ib === null && ir !== null) diferencas.push(`Idade de corte ${ir} dias (busca sem idade).`);
  else if (ib === null && ir === null && regra.idadeTextual === 'verificada' && textuais.length)
    diferencas.push(
      `Idade só no texto da fonte ("${r.classeIdadeFonte}"), não validada (busca sem idade).`,
    );
  else if (ib !== null && ir === null && regra.idadeTextual === 'verificada' && textuais.length) {
    const texto = `classe da fonte: "${r.classeIdadeFonte}"`;
    if (textuais.length > 1)
      return fora(
        `Idade de corte ambígua no texto da fonte (${texto}): pendente de validação.`,
        true,
      );
    if (textuais[0] !== ib)
      return fora(
        `Idade ${textuais[0]} dias no texto da fonte (${texto}), diferente de ${ib} dias; sem idade estruturada, nada foi deduzido além do texto.`,
      );
    return fora(
      `Idade ${ib} dias só no texto da fonte (${texto}), pendente de validação: o nome não prova a idade. Para usar, preencha a idade de corte numa nova versão do registro e confira.`,
      true,
    );
  } else if (ib !== null && ir === null) {
    diferencas.push(
      `Idade de corte não informada pela fonte${r.classeIdadeFonte ? ` (classe da fonte: "${r.classeIdadeFonte}")` : ''}.`,
    );
    avisos.push(
      r.classeIdadeFonte && regra.idadeTextual === 'ignorada'
        ? 'Sem idade de corte estruturada: a classe da fonte pode indicar outra idade. Confira antes de usar; não serve como correspondência específica.'
        : 'Sem idade de corte: não serve como correspondência específica.',
    );
  } else if (ib !== null && ir !== null && ib !== ir) {
    if (Math.abs(ib - ir) > regra.toleranciaIdadeDias)
      return fora(`Idade de corte ${ir} dias, diferente de ${ib} dias (sem aproximação).`);
    diferencas.push(`Idade de corte ${ir} dias em vez de ${ib}.`);
    avisos.push(
      `Aproximação de idade pela regra ${regra.codigo} v${regra.versao}: ${regra.justificativaTolerancia ?? ''}`,
    );
  }
  const nivel: NivelCorrespondencia = geral
    ? 'geral'
    : diferencas.length
      ? 'comparavel'
      : 'especifico';
  if (r.cautela) avisos.push(`Uso com cautela: ${r.cautela}`);
  if (!r.vigente)
    return {
      nivel,
      diferencas,
      avisos,
      exclusao: 'Versão substituída ou descartada.',
      pendenteValidacaoIdade: false,
    };
  if (r.status !== 'conferido')
    return {
      nivel,
      diferencas,
      avisos,
      pendenteValidacaoIdade: false,
      exclusao: `Não conferido (${r.status}): só registros conferidos são usados.`,
    };
  if (r.valores.length === 0)
    return {
      nivel,
      diferencas,
      avisos,
      exclusao: 'Sem valores numéricos.',
      pendenteValidacaoIdade: false,
    };
  return { nivel, diferencas, avisos, exclusao: null, pendenteValidacaoIdade: false };
}

// ---------------------------------------------------------------- Origens independentes

export interface OrigemIndependente {
  id: string;
  /** Registros candidatos desta origem (tratamentos separados). */
  registros: string[];
  fontes: string[];
  motivos: string[];
}

/**
 * Agrupa as cadeias em origens: mesma publicação de estudo individual, mesmo experimento de
 * origem declarado ou vínculo não descartado (transitivo, também por registros fora da busca).
 * Cada grupo conta como uma só origem.
 */
export function agruparOrigens(
  registros: readonly RegistroCandidato[],
  arestas: readonly ArestaDependencia[],
): { origens: OrigemIndependente[]; origemDoRegistro: Map<string, string> } {
  const pai = new Map<string, string>();
  const raiz = (x: string): string => {
    let r = x;
    while (pai.has(r) && pai.get(r) !== r) r = pai.get(r)!;
    pai.set(x, r);
    return r;
  };
  const motivos = new Map<string, Set<string>>();
  const unir = (x: string, y: string, motivo: string) => {
    if (!pai.has(x)) pai.set(x, x);
    if (!pai.has(y)) pai.set(y, y);
    const [rx, ry] = [raiz(x), raiz(y)];
    const [menor, maior] = rx < ry ? [rx, ry] : [ry, rx];
    if (rx !== ry) pai.set(maior, menor);
    const m = motivos.get(menor) ?? new Set<string>();
    for (const t of [...(motivos.get(maior) ?? []), motivo]) m.add(t);
    motivos.set(menor, m);
    if (rx !== ry) motivos.delete(maior);
  };
  for (const r of registros) if (!pai.has(r.cadeiaId)) pai.set(r.cadeiaId, r.cadeiaId);
  const porFonte = new Map<string, string>();
  const porExperimento = new Map<string, string>();
  for (const r of registros) {
    if (r.fonteOrigem === 'estudo_individual') {
      const outro = porFonte.get(r.fonteId);
      if (outro) unir(outro, r.cadeiaId, `Mesma publicação (${r.fonteDescricao}).`);
      else porFonte.set(r.fonteId, r.cadeiaId);
    }
    if (r.experimentoOrigem) {
      const k = normalizarNome(r.experimentoOrigem);
      const outro = porExperimento.get(k);
      if (outro) unir(outro, r.cadeiaId, `Mesmo experimento de origem ("${r.experimentoOrigem}").`);
      else porExperimento.set(k, r.cadeiaId);
    }
  }
  for (const e of arestas) unir(e.a, e.b, e.motivo);

  const grupos = new Map<string, OrigemIndependente>();
  const origemDoRegistro = new Map<string, string>();
  for (const r of registros) {
    const id = raiz(r.cadeiaId);
    const g = grupos.get(id) ?? { id, registros: [], fontes: [], motivos: [] };
    g.registros.push(r.id);
    if (!g.fontes.includes(r.fonteDescricao)) g.fontes.push(r.fonteDescricao);
    grupos.set(id, g);
    origemDoRegistro.set(r.id, id);
  }
  for (const g of grupos.values()) g.motivos = [...(motivos.get(g.id) ?? [])].sort();
  return {
    origens: [...grupos.values()].sort((x, y) => (x.id < y.id ? -1 : 1)),
    origemDoRegistro,
  };
}

// ---------------------------------------------------------------- Agregação

export interface ValorDeOrigem {
  origemId: string;
  registroId: string;
  valorId: string;
  /** Na unidade da classe (convertida só entre unidades da mesma grandeza). */
  valor: number;
  valorPublicado: string;
  unidadePublicada: UnidadeNutricional;
}

export interface ClasseAgregacao {
  chave: string;
  unidade: UnidadeNutricional;
  base: BaseNutricional;
  tipoValor: TipoValor;
  formaObtencao: FormaObtencao;
  metodo: string | null;
  valores: ValorDeOrigem[];
  nOrigens: number;
  suficiente: boolean;
  media: number | null;
  mediana: number | null;
  minimo: number | null;
  maximo: number | null;
}

export type SituacaoNutriente = 'agregado' | 'insuficiente' | 'classes_distintas' | 'sem_dados';

export interface ResultadoNutriente {
  nutriente: NutrienteSelecao;
  situacao: SituacaoNutriente;
  classes: ClasseAgregacao[];
  /** Origens agregáveis com valor elegível para o nutriente, de quantas consideradas. */
  cobertura: { comValor: number; total: number };
  exclusoes: { registroId: string; valorId: string | null; motivo: string }[];
}

const limpar = (x: number) => Number(x.toPrecision(15));

export function mediaSimples(xs: readonly number[]): number {
  if (!xs.length) throw new Error('Sem valores.');
  return limpar(xs.reduce((s, x) => s + x, 0) / xs.length);
}

export function mediana(xs: readonly number[]): number {
  if (!xs.length) throw new Error('Sem valores.');
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m]! : limpar((o[m - 1]! + o[m]!) / 2);
}

/** Registro que entra na agregação, ou o motivo de ficar só como referência individual. */
function foraDaAgregacao(
  c: { registro: RegistroCandidato; classificacao: ClassificacaoCandidato },
  regra: RegraSelecao,
): string | null {
  const { registro: r, classificacao: k } = c;
  if (k.exclusao) return k.exclusao;
  if (!k.nivel || !regra.niveisAgregaveis.includes(k.nivel))
    return 'Nível de correspondência não agregável: só referência individual.';
  if (!regra.origensAgregaveis.includes(r.fonteOrigem))
    return r.fonteOrigem === 'tabela_compilada'
      ? 'Tabela compilada não é combinada com outras fontes: só referência individual.'
      : 'Origem não agregável pela regra: só referência individual.';
  if (r.cautela) return `Uso com cautela: ${r.cautela}`;
  return null;
}

const normalizarMetodo = (m: string | null) => (m === null ? '' : normalizarNome(m));

export interface CandidatoAvaliado {
  registro: RegistroCandidato;
  classificacao: ClassificacaoCandidato;
  origemId: string;
}

/**
 * Agrega um nutriente entre origens independentes, por classe (unidade, base, tipo de valor,
 * forma de obtenção e método). Classes diferentes nunca se combinam. Origem com mais de um
 * registro elegível na classe só entra com o tratamento escolhido pelo usuário.
 */
export function agregarNutriente(
  nutriente: NutrienteSelecao,
  candidatos: readonly CandidatoAvaliado[],
  regra: RegraSelecao,
  escolhas: ReadonlyMap<string, string>,
): ResultadoNutriente {
  const exclusoes: ResultadoNutriente['exclusoes'] = [];
  const agregaveis = candidatos.filter((c) => foraDaAgregacao(c, regra) === null);
  const totalOrigens = new Set(agregaveis.map((c) => c.origemId)).size;
  const brutos = new Map<
    string,
    {
      classe: Omit<
        ClasseAgregacao,
        'valores' | 'nOrigens' | 'suficiente' | 'media' | 'mediana' | 'minimo' | 'maximo'
      >;
      itens: ValorDeOrigem[];
    }
  >();
  const origensComValor = new Set<string>();
  for (const c of agregaveis)
    for (const v of c.registro.valores.filter((x) => x.nutrienteId === nutriente.id)) {
      if (v.cautela) {
        exclusoes.push({
          registroId: c.registro.id,
          valorId: v.id,
          motivo: `Uso com cautela: ${v.cautela}`,
        });
        continue;
      }
      if (v.interpretacaoBase !== null && !v.baseValidada) {
        exclusoes.push({
          registroId: c.registro.id,
          valorId: v.id,
          motivo: 'Base inferida, não validada: fora da agregação.',
        });
        continue;
      }
      const converte = existeConversao(v.unidade, nutriente.unidadeReferencia);
      const unidade = converte ? nutriente.unidadeReferencia : v.unidade;
      const valor = converte ? converterUnidade(v.valor, v.unidade, unidade) : v.valor;
      const chave = [
        unidade,
        v.base,
        v.tipoValor,
        v.formaObtencao,
        normalizarMetodo(v.metodoAnaliticoFonte),
      ].join('|');
      const b = brutos.get(chave) ?? {
        classe: {
          chave,
          unidade,
          base: v.base,
          tipoValor: v.tipoValor,
          formaObtencao: v.formaObtencao,
          metodo: v.metodoAnaliticoFonte,
        },
        itens: [],
      };
      b.itens.push({
        origemId: c.origemId,
        registroId: c.registro.id,
        valorId: v.id,
        valor,
        valorPublicado: v.valorPublicado,
        unidadePublicada: v.unidade,
      });
      brutos.set(chave, b);
      origensComValor.add(c.origemId);
    }
  // Excluídos como candidatos já aparecem com o motivo na lista de candidatos.
  for (const c of candidatos.filter(
    (x) => !x.classificacao.exclusao && foraDaAgregacao(x, regra) !== null,
  ))
    if (c.registro.valores.some((v) => v.nutrienteId === nutriente.id))
      exclusoes.push({
        registroId: c.registro.id,
        valorId: null,
        motivo: foraDaAgregacao(c, regra)!,
      });

  const classes: ClasseAgregacao[] = [];
  for (const { classe, itens } of [...brutos.values()].sort((x, y) =>
    x.classe.chave < y.classe.chave ? -1 : 1,
  )) {
    const porOrigem = new Map<string, ValorDeOrigem[]>();
    for (const i of itens) porOrigem.set(i.origemId, [...(porOrigem.get(i.origemId) ?? []), i]);
    const valores: ValorDeOrigem[] = [];
    for (const [origemId, vs] of porOrigem) {
      const regs = [...new Set(vs.map((v) => v.registroId))];
      if (regs.length === 1) {
        valores.push(...vs.slice(0, 1));
        continue;
      }
      const escolhido = escolhas.get(origemId);
      const v = escolhido ? vs.find((x) => x.registroId === escolhido) : undefined;
      if (v) valores.push(v);
      else
        for (const x of vs)
          exclusoes.push({
            registroId: x.registroId,
            valorId: x.valorId,
            motivo: `Origem com ${regs.length} tratamentos: escolha qual a representa (cada tratamento é mantido separado).`,
          });
    }
    valores.sort((x, y) => (x.origemId < y.origemId ? -1 : 1));
    const xs = valores.map((v) => v.valor);
    const suficiente = valores.length >= regra.nMinimoOrigens;
    classes.push({
      ...classe,
      valores,
      nOrigens: valores.length,
      suficiente,
      media: suficiente ? mediaSimples(xs) : null,
      mediana: suficiente ? mediana(xs) : null,
      minimo: xs.length ? Math.min(...xs) : null,
      maximo: xs.length ? Math.max(...xs) : null,
    });
  }
  const suficientes = classes.filter((k) => k.suficiente).length;
  const situacao: SituacaoNutriente = !classes.length
    ? 'sem_dados'
    : suficientes === 0
      ? 'insuficiente'
      : suficientes === 1
        ? 'agregado'
        : 'classes_distintas';
  return {
    nutriente,
    situacao,
    classes,
    cobertura: { comValor: origensComValor.size, total: totalOrigens },
    exclusoes,
  };
}

// ---------------------------------------------------------------- Cenários reais

export interface CenarioReal {
  nutriente: NutrienteSelecao;
  sentido: SentidoCenario;
  valor: number;
  /** Registros reais com o valor extremo (empate: o usuário escolhe). */
  registros: string[];
}

/**
 * Para cada nutriente agregado com direção definida, o registro real no extremo desfavorável
 * (conservador) e no favorável. O perfil do cenário é o desse registro inteiro: os nutrientes não
 * se misturam entre fontes. Rótulo pelo nutriente, nunca como qualidade global.
 */
export function cenariosReais(resultados: readonly ResultadoNutriente[]): CenarioReal[] {
  const cenarios: CenarioReal[] = [];
  for (const r of resultados) {
    if (r.situacao !== 'agregado') continue;
    const d = r.nutriente.direcaoConservadora;
    if (d !== 'menor' && d !== 'maior') continue;
    const k = r.classes.find((c) => c.suficiente)!;
    for (const sentido of SENTIDOS_CENARIO) {
      const pegaMenor = (sentido === 'conservador') === (d === 'menor');
      const valor = pegaMenor ? k.minimo! : k.maximo!;
      cenarios.push({
        nutriente: r.nutriente,
        sentido,
        valor,
        registros: k.valores.filter((v) => v.valor === valor).map((v) => v.registroId),
      });
    }
  }
  return cenarios;
}

// ---------------------------------------------------------------- Execução

export interface ResultadoSelecao {
  regra: { codigo: string; versao: number; nMinimoOrigens: number };
  busca: { alimentoId: string; idadeCorteDias: number | null };
  candidatos: (CandidatoAvaliado & { foraDaAgregacao: string | null })[];
  origens: OrigemIndependente[];
  /** Origens com mais de um tratamento agregável: o usuário escolhe um (ou nenhum). */
  origensComTratamentos: { origemId: string; registros: string[] }[];
  /** Origens com ao menos um registro que entra na agregação (as demais só foram encontradas). */
  origensElegiveis: string[];
  nutrientes: ResultadoNutriente[];
  cenarios: CenarioReal[];
}

export function executarSelecao(
  busca: BuscaSelecao,
  registros: readonly RegistroCandidato[],
  arestas: readonly ArestaDependencia[],
  catalogo: readonly NutrienteSelecao[],
  regra: RegraSelecao,
  escolhas: ReadonlyMap<string, string> = new Map(),
): ResultadoSelecao {
  const classificados = registros
    .map((r) => ({ registro: r, classificacao: classificarCandidato(busca, r, regra) }))
    .filter((c) => c.classificacao.nivel !== null || c.registro.alimento.id === busca.alimento.id);
  const { origens, origemDoRegistro } = agruparOrigens(
    classificados.map((c) => c.registro),
    arestas,
  );
  const candidatos = classificados.map((c) => ({
    ...c,
    origemId: origemDoRegistro.get(c.registro.id)!,
    foraDaAgregacao: foraDaAgregacao(c, regra),
  }));
  const tratamentos = new Map<string, string[]>();
  for (const c of candidatos.filter((x) => x.foraDaAgregacao === null))
    tratamentos.set(c.origemId, [...(tratamentos.get(c.origemId) ?? []), c.registro.id]);
  const nutrientes = catalogo
    .map((n) => agregarNutriente(n, candidatos, regra, escolhas))
    .filter((n) => n.situacao !== 'sem_dados' || n.exclusoes.length > 0);
  return {
    regra: { codigo: regra.codigo, versao: regra.versao, nMinimoOrigens: regra.nMinimoOrigens },
    busca: { alimentoId: busca.alimento.id, idadeCorteDias: busca.idadeCorteDias },
    candidatos,
    origens: origens.filter((o) => candidatos.some((c) => c.origemId === o.id)),
    origensElegiveis: origens
      .filter((o) => candidatos.some((c) => c.origemId === o.id && c.foraDaAgregacao === null))
      .map((o) => o.id),
    origensComTratamentos: [...tratamentos]
      .filter(([, rs]) => rs.length > 1)
      .map(([origemId, rs]) => ({ origemId, registros: rs })),
    nutrientes,
    cenarios: cenariosReais(nutrientes),
  };
}

// ---------------------------------------------------------------- Perfis

export interface ValorPerfil {
  nutrienteId: string;
  valor: number;
  /** Texto como publicado (perfil de um registro); null no agregado. */
  valorPublicado: string | null;
  unidade: UnidadeNutricional;
  base: BaseNutricional;
  tipoValor: TipoValor;
  formaObtencao: FormaObtencao;
  metodo: string | null;
  interpretacaoBase: string | null;
  nOrigens: number;
  mediana: number | null;
  minimo: number | null;
  maximo: number | null;
  cobertura: string | null;
  origens: { valorId: string; registroId: string; valor: number }[];
}

export interface PerfilMontado {
  tipo: TipoPerfil;
  cenario: CenarioPerfil;
  nivel: NivelCorrespondencia;
  nutrienteReferenciaId: string | null;
  registroBaseId: string | null;
  valores: ValorPerfil[];
  naoQuantificados: { nutrienteId: string; textoPublicado: string; natureza: string }[];
  diferencas: string[];
  limitacoes: string[];
}

function candidatoElegivel(res: ResultadoSelecao, registroId: string) {
  const c = res.candidatos.find((x) => x.registro.id === registroId);
  if (!c) throw new Error('Registro fora dos candidatos desta seleção.');
  if (c.classificacao.exclusao)
    throw new Error(`Registro não elegível: ${c.classificacao.exclusao}`);
  return c;
}

function perfilDoRegistro(
  c: ResultadoSelecao['candidatos'][number],
  tipo: TipoPerfil,
  cenario: CenarioPerfil,
  nutrienteReferenciaId: string | null,
  limitacoes: string[],
): PerfilMontado {
  const r = c.registro;
  const marcas: string[] = [];
  for (const v of r.valores) {
    if (v.interpretacaoBase !== null)
      marcas.push(
        `Base inferida${v.baseValidada ? ', validada pelo usuário' : ', não validada'} num dos valores: ${v.interpretacaoBase}`,
      );
    if (v.cautela) marcas.push(`Valor com uso com cautela: ${v.cautela}`);
  }
  return {
    tipo,
    cenario,
    nivel: c.classificacao.nivel!,
    nutrienteReferenciaId,
    registroBaseId: r.id,
    valores: r.valores.map((v) => ({
      nutrienteId: v.nutrienteId,
      valor: v.valor,
      valorPublicado: v.valorPublicado,
      unidade: v.unidade,
      base: v.base,
      tipoValor: v.tipoValor,
      formaObtencao: v.formaObtencao,
      metodo: v.metodoAnaliticoFonte,
      interpretacaoBase: v.interpretacaoBase,
      nOrigens: 1,
      mediana: null,
      minimo: null,
      maximo: null,
      cobertura: null,
      origens: [{ valorId: v.id, registroId: r.id, valor: v.valor }],
    })),
    naoQuantificados: [...r.naoQuantificados],
    diferencas: [...c.classificacao.diferencas],
    limitacoes: [
      ...limitacoes,
      `Fonte: ${r.fonteDescricao}${r.referenciaLocal ? `, ${r.referenciaLocal}` : ''}.`,
      ...c.classificacao.avisos,
      ...[...new Set(marcas)],
      'Nutriente que o registro não traz fica ausente; nunca zero.',
    ],
  };
}

/** Perfil de uma referência individual conferida, com as limitações dela. */
export function perfilReferenciaIndividual(
  res: ResultadoSelecao,
  registroId: string,
): PerfilMontado {
  const c = candidatoElegivel(res, registroId);
  return perfilDoRegistro(c, 'referencia_individual', 'unico', null, [
    'Referência individual: evidência limitada (uma origem), sem média nem cenários.',
  ]);
}

/** Perfil central: média simples por origem, só nos nutrientes agregados; o resto fica ausente. */
export function perfilCentral(res: ResultadoSelecao): PerfilMontado {
  const agregados = res.nutrientes.filter((n) => n.situacao === 'agregado');
  if (!agregados.length) throw new Error('Nenhum nutriente com origens independentes suficientes.');
  const limitacoes = [
    'Agregado: média simples por origem independente, nutriente a nutriente. Não é perfil observado de um alimento real.',
    `Regra ${res.regra.codigo} versão ${res.regra.versao}.`,
  ];
  for (const n of res.nutrientes.filter((x) => x.situacao !== 'agregado'))
    limitacoes.push(
      `${n.nutriente.codigo} ausente: ${
        n.situacao === 'classes_distintas'
          ? 'classes de forma ou método diferentes, não combinadas'
          : n.situacao === 'insuficiente'
            ? `no máximo ${Math.max(0, ...n.classes.map((k) => k.nOrigens))} origem(ns) independente(s) numa mesma classe; mínimo ${res.regra.nMinimoOrigens}`
            : 'sem valor elegível'
      }.`,
    );
  return {
    tipo: 'agregado_central',
    cenario: 'central',
    nivel: 'especifico',
    nutrienteReferenciaId: null,
    registroBaseId: null,
    valores: agregados.map((n) => {
      const k = n.classes.find((c) => c.suficiente)!;
      return {
        nutrienteId: n.nutriente.id,
        valor: k.media!,
        valorPublicado: null,
        unidade: k.unidade,
        base: k.base,
        tipoValor: k.tipoValor,
        formaObtencao: k.formaObtencao,
        metodo: k.metodo,
        interpretacaoBase: null,
        nOrigens: k.nOrigens,
        mediana: k.mediana,
        minimo: k.minimo,
        maximo: k.maximo,
        cobertura: `${n.cobertura.comValor} de ${n.cobertura.total} origens`,
        origens: k.valores.map((v) => ({
          valorId: v.valorId,
          registroId: v.registroId,
          valor: v.valor,
        })),
      };
    }),
    naoQuantificados: [],
    diferencas: [],
    limitacoes,
  };
}

/** Perfil real do registro no extremo de um nutriente: todos os nutrientes desse registro. */
export function perfilCenario(
  res: ResultadoSelecao,
  nutrienteId: string,
  sentido: SentidoCenario,
  registroId: string,
): PerfilMontado {
  const cen = res.cenarios.find((c) => c.nutriente.id === nutrienteId && c.sentido === sentido);
  if (!cen) throw new Error('Cenário indisponível para este nutriente.');
  if (!cen.registros.includes(registroId))
    throw new Error('O registro não está no extremo deste cenário.');
  const c = candidatoElegivel(res, registroId);
  const rotulo = sentido === 'conservador' ? 'conservador' : 'favorável';
  return perfilDoRegistro(c, 'cenario_real', sentido, nutrienteId, [
    `Cenário ${rotulo} para ${cen.nutriente.codigo}: perfil real do registro com o ${
      (sentido === 'conservador') === (cen.nutriente.direcaoConservadora === 'menor')
        ? 'menor'
        : 'maior'
    } ${cen.nutriente.codigo} entre as origens agregadas. Vale para ${cen.nutriente.codigo}; não indica qualidade global do alimento nem da dieta.`,
  ]);
}

// ---------------------------------------------------------------- Avaliação científica

/**
 * Avaliação científica, separada da conferência (decisão 11 da 5D): a conferência atesta que a
 * transcrição é fiel à fonte; a avaliação diz se o dado é adequado para uso. "Uso com cautela"
 * vale para o registro ou para um valor; "base validada" só para valor com base inferida.
 */
export const TIPOS_AVALIACAO = ['uso_com_cautela', 'base_validada'] as const;
export type TipoAvaliacao = (typeof TIPOS_AVALIACAO)[number];
