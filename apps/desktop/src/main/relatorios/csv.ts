import type { Apuracao } from '@pecuaria/domain';
import { AVISO_FIXO, type Celula, type Coluna, type Relatorio } from './modelo';

/**
 * CSV do relatório (D-J): UTF-8 com BOM, separador ";", quebra CRLF, para abrir corretamente no
 * Excel em pt-BR. Dinheiro sai em centavos inteiros e em reais ("1234,56", sem separador de
 * milhar); valor desconhecido sai vazio em centavos e "desconhecido" em reais, nunca zero. Texto
 * livre é protegido contra injeção de fórmula; colunas numéricas tipadas ficam fora da proteção.
 */
const BOM = '﻿';
const SEP = ';';
const CRLF = '\r\n';
const INICIO_PERIGOSO = /^[=+\-@\t\r]/;

/** Protege texto livre: prefixo "'" contra fórmula e aspas quando há ";", aspas ou quebra. */
export function textoCsv(valor: string): string {
  const seguro = INICIO_PERIGOSO.test(valor) ? `'${valor}` : valor;
  return /[;"\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/** Centavos em reais com vírgula decimal e sem separador de milhar ("-1234,05"). */
export function reaisCsv(centavos: number): string {
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const inteiro = Math.floor(abs / 100);
  const resto = String(abs % 100).padStart(2, '0');
  return `${negativo ? '-' : ''}${inteiro},${resto}`;
}

const SITUACAO: Record<Apuracao['estado'], string> = {
  completa: 'completo',
  parcial: 'parcial (no mínimo)',
  desconhecida: 'desconhecido',
  nao_apurada: 'não apurado',
};

function cabecalhos(c: Coluna): string[] {
  if (c.tipo === 'dinheiro') return [`${c.rotulo} (centavos)`, `${c.rotulo} (R$)`];
  if (c.tipo === 'apuracao')
    return [`${c.rotulo} (centavos)`, `${c.rotulo} (R$)`, `${c.rotulo} (situação)`];
  return [c.rotulo];
}

function celulas(c: Coluna, v: Celula): string[] {
  if (c.tipo === 'dinheiro') {
    if (v === null || typeof v !== 'number') return ['', 'desconhecido'];
    return [String(v), reaisCsv(v)];
  }
  if (c.tipo === 'apuracao') {
    if (v === null || typeof v !== 'object') return ['', 'desconhecido', 'desconhecido'];
    const a = v.apuracao;
    const conhecido = a.estado === 'completa' || a.estado === 'parcial';
    return [
      conhecido ? String(a.valorConhecidoCentavos) : '',
      conhecido ? reaisCsv(a.valorConhecidoCentavos) : SITUACAO[a.estado],
      SITUACAO[a.estado],
    ];
  }
  if (v === null) return [''];
  if (c.tipo === 'quantidade' && typeof v === 'number') return [String(v).replace('.', ',')];
  if (c.tipo === 'inteiro' && typeof v === 'number') return [String(v)];
  if (c.tipo === 'data') return [textoCsv(String(v))];
  return [textoCsv(String(v))];
}

const linha = (campos: string[]) => campos.join(SEP) + CRLF;

export function gerarCsv(r: Relatorio): string {
  let s = BOM;
  s += linha([textoCsv('Relatório'), textoCsv(r.titulo)]);
  s += linha([textoCsv('Visão'), textoCsv(r.visao)]);
  s += linha([textoCsv('Propriedade'), textoCsv(r.propriedade)]);
  s += linha([textoCsv('Período'), textoCsv(r.periodo)]);
  s += linha([textoCsv('Gerado em'), textoCsv(r.geradoEm)]);
  s += linha([textoCsv('Aviso'), textoCsv(AVISO_FIXO)]);
  for (const a of r.avisos) s += linha([textoCsv('Atenção'), textoCsv(a)]);
  for (const secao of r.secoes) {
    s += CRLF;
    s += linha([textoCsv(secao.titulo)]);
    for (const i of secao.indicadores ?? []) {
      const col: Coluna = { rotulo: i.rotulo, tipo: i.tipo };
      s += linha([
        textoCsv(i.rotulo),
        ...celulas(col, i.valor),
        ...(i.observacao ? [textoCsv(i.observacao)] : []),
      ]);
    }
    if (secao.colunas && secao.linhas) {
      s += linha(secao.colunas.flatMap(cabecalhos).map(textoCsv));
      if (secao.linhas.length === 0 && secao.vazio) s += linha([textoCsv(secao.vazio)]);
      for (const l of secao.linhas)
        s += linha(secao.colunas.flatMap((c, k) => celulas(c, l[k] ?? null)));
    }
  }
  return s;
}
