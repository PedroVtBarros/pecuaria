import { normalizarNome } from '../comum/texto';
import type {
  BaseNutricional,
  ClasseAlimento,
  FormaConservacao,
  SeparadorDecimal,
  TipoValor,
} from './enumeracoes';
import {
  problemasDaObtencao,
  RELACOES_VINCULO,
  type FormaObtencao,
  type RelacaoVinculo,
} from './origem-dados';
import { normalizarCodigo, PADRAO_CODIGO, problemasDaFonte } from './regras-alimentos';
import { dentroDaFaixaDaUnidade, descreverFaixa, type UnidadeNutricional } from './unidades';
import { lerNumeroPublicado } from './valor-publicado';

/**
 * Pacote de curadoria (Fase 5B): valores transcritos de uma fonte publicada, embutidos no
 * aplicativo e importados SÓ por ação do usuário. Cada registro entra como "transcrito" e só vale
 * para cálculo depois que o usuário o conferir contra a fonte (D5-4, RF-05.10).
 *
 * O pacote guarda o número exatamente como a fonte o exibe (texto e separador), a unidade e a base
 * publicadas, o tipo de estatística e o n. Nada é convertido, agregado ou completado: nutriente
 * que a fonte não traz não tem linha (regras 2, 3c e 3d).
 */
export interface FontePacoteCuradoria {
  origem: 'tabela_compilada' | 'estudo_individual';
  codigo: string;
  titulo: string;
  autores: string;
  ano: number;
  edicaoVersao: string | null;
  instituicaoEditora: string | null;
  isbnDoiUrl: string | null;
  dataAcesso: string | null;
  observacoes: string | null;
}

export interface AlimentoPacoteCuradoria {
  /** Chave só dentro do pacote, para ligar os registros. */
  chave: string;
  nome: string;
  especie: string | null;
  cultivar: string | null;
  partePlanta: string | null;
  formaConservacao: FormaConservacao;
  processamento: string | null;
  classe: ClasseAlimento;
  observacoes: string | null;
}

export interface ValorPacoteCuradoria {
  /** Código da definição no catálogo (ex.: PB, FDNcp). */
  nutriente: string;
  valorPublicado: string;
  unidade: UnidadeNutricional;
  base: BaseNutricional;
  tipoValor: TipoValor;
  nObservacoes: number | null;
  /** Método analítico como a fonte informa (nunca presumido). */
  metodoAnaliticoFonte: string | null;
  formaObtencao: FormaObtencao;
  descricaoObtencao: string | null;
  /**
   * Base não declarada pela fonte: a interpretação e o motivo (nunca apresentada como da fonte).
   * Null: a fonte declara a base.
   */
  interpretacaoBase: string | null;
  /** Rótulo do nutriente como na fonte e estatísticas que não têm campo próprio. */
  observacao: string | null;
}

/**
 * Vínculo declarado pelo pacote entre um registro dele ("este", pela página ou tabela) e um
 * registro de outra fonte ("outro", pelo código da fonte e pela página ou tabela). Resolvido na
 * importação, ou depois, quando o outro registro entrar no banco.
 */
export interface VinculoPacoteCuradoria {
  registro: string;
  outraFonte: string;
  outroRegistro: string;
  relacao: RelacaoVinculo;
  evidencia: string;
}

export interface RegistroPacoteCuradoria {
  alimento: string;
  referenciaLocal: string;
  idadeCorteDias: number | null;
  classeIdadeFonte: string | null;
  separadorDecimal: SeparadorDecimal;
  observacoes: string | null;
  /**
   * Motivo do bloqueio, quando a correspondência do registro ainda não foi conferida (ex.: espécie
   * divergente). Registro bloqueado fica no pacote, para rastreio, mas não é importado.
   */
  bloqueio: string | null;
  valores: readonly ValorPacoteCuradoria[];
}

export interface PacoteCuradoria {
  codigo: string;
  versao: number;
  titulo: string;
  descricao: string;
  /** Quem transcreveu, gravado em cada registro. A conferência é sempre do usuário. */
  transcritoPor: string;
  fonte: FontePacoteCuradoria;
  alimentos: readonly AlimentoPacoteCuradoria[];
  registros: readonly RegistroPacoteCuradoria[];
  vinculos: readonly VinculoPacoteCuradoria[];
}

/** O que a importação grava: alimentos, registros e valores importáveis; bloqueados à parte. */
export interface ContagemPacote {
  alimentos: number;
  registros: number;
  valores: number;
  bloqueados: number;
}

export function registrosImportaveis(p: PacoteCuradoria): readonly RegistroPacoteCuradoria[] {
  return p.registros.filter((r) => r.bloqueio === null);
}

export function contarPacote(p: PacoteCuradoria): ContagemPacote {
  const importaveis = registrosImportaveis(p);
  return {
    alimentos: new Set(importaveis.map((r) => r.alimento)).size,
    registros: importaveis.length,
    valores: importaveis.reduce((s, r) => s + r.valores.length, 0),
    bloqueados: p.registros.length - importaveis.length,
  };
}

/**
 * Problemas do pacote antes de importar. Lista vazia = coerente. Confere o que não depende do
 * banco; unidade, grandeza e origem são conferidas de novo, valor a valor, pelo mesmo serviço do
 * cadastro manual.
 */
export function problemasDoPacote(
  p: PacoteCuradoria,
  codigosNutriente: ReadonlySet<string>,
): string[] {
  const erros: string[] = [];
  if (!PADRAO_CODIGO.test(p.codigo)) erros.push(`Código de pacote inválido: ${p.codigo}.`);
  if (!Number.isInteger(p.versao) || p.versao < 1) erros.push('Versão do pacote inválida.');
  if (!p.transcritoPor.trim() || p.transcritoPor.length > 120)
    erros.push('Informe quem transcreveu (até 120 caracteres).');
  for (const f of problemasDaFonte({
    ...p.fonte,
    laboratorio: null,
    numeroLaudo: null,
    dataLaudo: null,
    fabricante: null,
    registroProduto: null,
    metodoMedicao: null,
    limitacoesMedicao: null,
    propriedadeId: null,
  }))
    erros.push(`Fonte: ${f.mensagem}`);

  const chaves = new Set<string>();
  const nomes = new Set<string>();
  for (const a of p.alimentos) {
    if (chaves.has(a.chave)) erros.push(`Alimento repetido no pacote: ${a.chave}.`);
    chaves.add(a.chave);
    const nome = normalizarNome(a.nome);
    if (nomes.has(nome)) erros.push(`Nome de alimento repetido no pacote: ${a.nome}.`);
    nomes.add(nome);
  }
  const codigos = new Set([...codigosNutriente].map(normalizarCodigo));
  const usados = new Set<string>();
  p.registros.forEach((r, i) => {
    const onde = `Registro ${i + 1} (${r.alimento}, ${r.referenciaLocal})`;
    if (!chaves.has(r.alimento)) erros.push(`${onde}: alimento fora do pacote.`);
    usados.add(r.alimento);
    if (!r.referenciaLocal.trim() || r.referenciaLocal.length > 200)
      erros.push(`${onde}: página ou tabela obrigatória (até 200 caracteres).`);
    if (r.valores.length === 0) erros.push(`${onde}: sem valores.`);
    if (r.bloqueio !== null && (!r.bloqueio.trim() || r.bloqueio.length > 500))
      erros.push(`${onde}: motivo do bloqueio vazio ou longo demais.`);
    const vistos = new Set<string>();
    for (const v of r.valores) {
      const rotulo = `${onde}, ${v.nutriente}`;
      if (!codigos.has(normalizarCodigo(v.nutriente)))
        erros.push(`${rotulo}: definição inexistente no catálogo.`);
      const chave = `${normalizarCodigo(v.nutriente)}|${v.tipoValor}|${v.base}`;
      if (vistos.has(chave)) erros.push(`${rotulo}: valor repetido (mesmo tipo e base).`);
      vistos.add(chave);
      const l = lerNumeroPublicado(v.valorPublicado, r.separadorDecimal);
      if (!l.ok) erros.push(`${rotulo}: ${l.motivo}`);
      else if (l.numero.texto !== v.valorPublicado)
        erros.push(`${rotulo}: o texto publicado tem espaços nas pontas.`);
      else if (!dentroDaFaixaDaUnidade(l.numero.valor, v.unidade))
        erros.push(`${rotulo}: fora da faixa (${descreverFaixa(v.unidade) ?? 'da unidade'}).`);
      if (v.nObservacoes !== null && !(Number.isInteger(v.nObservacoes) && v.nObservacoes >= 1))
        erros.push(`${rotulo}: número de observações inválido.`);
      for (const o of problemasDaObtencao(v.formaObtencao, v.descricaoObtencao))
        erros.push(`${rotulo}: ${o}`);
      if (
        v.interpretacaoBase !== null &&
        (!v.interpretacaoBase.trim() || v.interpretacaoBase.length > 500)
      )
        erros.push(
          `${rotulo}: interpretação da base vazia ou longa demais (use null quando a fonte declara a base).`,
        );
      if (v.metodoAnaliticoFonte !== null && !v.metodoAnaliticoFonte.trim())
        erros.push(`${rotulo}: método vazio (use null quando a fonte não informa).`);
    }
  });
  for (const a of p.alimentos)
    if (!usados.has(a.chave)) erros.push(`Alimento sem registro no pacote: ${a.nome}.`);
  const importaveis = new Set(registrosImportaveis(p).map((r) => r.referenciaLocal));
  const referencias = p.registros.map((r) => r.referenciaLocal);
  if (new Set(referencias).size !== referencias.length)
    erros.push('Página ou tabela repetida entre registros: os vínculos não saberiam qual é.');
  const vistosVinculos = new Set<string>();
  for (const v of p.vinculos) {
    const onde = `Vínculo de "${v.registro}" com ${v.outraFonte} "${v.outroRegistro}"`;
    if (!importaveis.has(v.registro)) erros.push(`${onde}: registro ausente ou bloqueado.`);
    if (!PADRAO_CODIGO.test(v.outraFonte)) erros.push(`${onde}: código de fonte inválido.`);
    if (normalizarCodigo(v.outraFonte) === normalizarCodigo(p.fonte.codigo))
      erros.push(`${onde}: vínculo com a própria fonte não é declarado no pacote.`);
    if (!v.outroRegistro.trim() || v.outroRegistro.length > 200)
      erros.push(`${onde}: página ou tabela do outro registro inválida.`);
    if (!(RELACOES_VINCULO as readonly string[]).includes(v.relacao))
      erros.push(`${onde}: relação desconhecida.`);
    if (!v.evidencia.trim() || v.evidencia.length > 2000)
      erros.push(`${onde}: evidência obrigatória (até 2000 caracteres).`);
    const chave = `${v.registro}|${normalizarCodigo(v.outraFonte)}|${v.outroRegistro}|${v.relacao}`;
    if (vistosVinculos.has(chave)) erros.push(`${onde}: repetido.`);
    vistosVinculos.add(chave);
  }
  return erros;
}
