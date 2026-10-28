import { interpretarData } from '../comum/datas';
import { interpretarNumero } from '../comum/numeros';
import { limparTexto, semAcentos } from '../comum/texto';
import {
  CATEGORIAS_ANIMAL,
  PESO_VIVO_MAXIMO_KG,
  type AptidaoAnimal,
  type CategoriaAnimal,
  type CondicaoSexual,
  type MetodoPesagem,
  type OrigemAnimal,
  type Sexo,
} from './enumeracoes';

export const LIMITE_LINHAS_IMPORTACAO = 5000;

/** Colunas aceitas no CSV de animais, na ordem do modelo. */
export const COLUNAS_IMPORTACAO = [
  'identificacao',
  'nome',
  'sexo',
  'condicao_sexual',
  'categoria',
  'raca',
  'aptidao',
  'data_nascimento',
  'nascimento_estimado',
  'origem',
  'data_entrada',
  'lote',
  'peso_kg',
  'data_pesagem',
  'metodo_pesagem',
  'observacoes',
] as const;
export type ColunaImportacao = (typeof COLUNAS_IMPORTACAO)[number];

const OBRIGATORIAS: readonly ColunaImportacao[] = [
  'identificacao',
  'sexo',
  'categoria',
  'aptidao',
  'origem',
];

export const MODELO_CSV =
  `${COLUNAS_IMPORTACAO.join(';')}\n` +
  'BR-0001;Mimosa;F;femea;vaca;Nelore;corte;2022-03-10;nao;nascido;;Lote Maternidade;420;2026-10-01;balanca;\n' +
  'BR-0002;;M;castrado;garrote;;corte;15/01/2025;sim;comprado;20/05/2025;;;;;Comprado em leilão\n';

/** Separa o texto em linhas e campos (RFC 4180), detectando ; , ou tabulação. */
export function lerCsv(texto: string): string[][] {
  const conteudo = texto.replace(/^\uFEFF/, '');
  const primeiraLinha = conteudo.split(/\r?\n/, 1)[0] ?? '';
  const contar = (c: string): number => primeiraLinha.split(c).length - 1;
  const candidatos: [string, number][] = [
    [';', contar(';')],
    [',', contar(',')],
    ['\t', contar('\t')],
  ];
  const separador = candidatos.sort((a, b) => b[1] - a[1])[0]![0];

  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let entreAspas = false;
  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i]!;
    if (entreAspas) {
      if (c === '"') {
        if (conteudo[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"' && campo === '') {
      entreAspas = true;
    } else if (c === separador) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && conteudo[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((v) => v.trim() !== ''));
}

function chave(valor: string): string {
  return semAcentos(valor)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

const SEXOS_ACEITOS: Record<string, Sexo> = { f: 'F', femea: 'F', m: 'M', macho: 'M' };
const CONDICOES_ACEITAS: Record<string, CondicaoSexual> = {
  femea: 'femea',
  inteiro: 'inteiro',
  castrado: 'castrado',
};
const APTIDOES_ACEITAS: Record<string, AptidaoAnimal> = { corte: 'corte', leite: 'leite' };
const ORIGENS_ACEITAS: Record<string, OrigemAnimal> = {
  nascido: 'nascido',
  nascida: 'nascido',
  comprado: 'comprado',
  comprada: 'comprado',
  compra: 'comprado',
};
const METODOS_ACEITOS: Record<string, MetodoPesagem> = {
  balanca: 'balanca',
  fita: 'fita',
  visual: 'visual',
};
const BOOLEANOS: Record<string, boolean> = {
  sim: true,
  s: true,
  '1': true,
  verdadeiro: true,
  nao: false,
  n: false,
  '0': false,
  falso: false,
};

/** Linha do CSV já interpretada. Raça e lote ainda são nomes; o serviço resolve. */
export interface LinhaAnimalImportada {
  identificacao: string;
  nome: string | null;
  sexo: Sexo;
  condicaoSexual: CondicaoSexual;
  categoria: CategoriaAnimal;
  racaNome: string | null;
  aptidao: AptidaoAnimal;
  dataNascimento: string | null;
  dataNascimentoEstimada: boolean;
  origem: OrigemAnimal;
  dataEntrada: string;
  loteNome: string | null;
  pesoVivoKg: number | null;
  dataPesagem: string | null;
  metodoPesagem: MetodoPesagem | null;
  observacoes: string | null;
}

export interface ResultadoLinha {
  /** Número da linha no arquivo, contando o cabeçalho como linha 1. */
  linha: number;
  dados: LinhaAnimalImportada | null;
  erros: string[];
}

export interface ResultadoLeituraCsv {
  erroGeral: string | null;
  linhas: ResultadoLinha[];
}

/** Interpreta o CSV de animais. Não consulta banco: só formato e valores. */
export function interpretarCsvAnimais(texto: string): ResultadoLeituraCsv {
  const tabela = lerCsv(texto);
  if (tabela.length === 0) return { erroGeral: 'O arquivo está vazio.', linhas: [] };

  const cabecalho = tabela[0]!.map(chave);
  const desconhecidas = cabecalho.filter(
    (c) => c !== '' && !(COLUNAS_IMPORTACAO as readonly string[]).includes(c),
  );
  if (desconhecidas.length > 0) {
    return { erroGeral: `Colunas desconhecidas: ${desconhecidas.join(', ')}.`, linhas: [] };
  }
  const faltando = OBRIGATORIAS.filter((c) => !cabecalho.includes(c));
  if (faltando.length > 0) {
    return { erroGeral: `Colunas obrigatórias ausentes: ${faltando.join(', ')}.`, linhas: [] };
  }
  if (tabela.length - 1 > LIMITE_LINHAS_IMPORTACAO) {
    return {
      erroGeral: `O arquivo tem mais de ${LIMITE_LINHAS_IMPORTACAO} animais. Divida em arquivos menores.`,
      linhas: [],
    };
  }

  const linhas = tabela.slice(1).map((valores, indice): ResultadoLinha => {
    const erros: string[] = [];
    const ler = (coluna: ColunaImportacao): string | null => {
      const posicao = cabecalho.indexOf(coluna);
      return posicao < 0 ? null : limparTexto(valores[posicao] ?? '');
    };
    const escolher = <T>(
      coluna: ColunaImportacao,
      opcoes: Record<string, T>,
      rotulo: string,
    ): T | null => {
      const bruto = ler(coluna);
      if (bruto === null) return null;
      const valor = opcoes[chave(bruto)];
      if (valor === undefined) erros.push(`${rotulo} inválido: "${bruto}".`);
      return valor ?? null;
    };
    const data = (coluna: ColunaImportacao, rotulo: string): string | null => {
      const bruto = ler(coluna);
      if (bruto === null) return null;
      const valor = interpretarData(bruto);
      if (!valor) erros.push(`${rotulo} inválida: "${bruto}". Use AAAA-MM-DD ou DD/MM/AAAA.`);
      return valor;
    };

    const identificacao = ler('identificacao');
    if (!identificacao) erros.push('Identificação é obrigatória.');
    else if (identificacao.length > 40) erros.push('Identificação com mais de 40 caracteres.');

    const sexo = escolher('sexo', SEXOS_ACEITOS, 'Sexo');
    if (!ler('sexo')) erros.push('Sexo é obrigatório (F ou M).');

    let condicaoSexual = escolher('condicao_sexual', CONDICOES_ACEITAS, 'Condição sexual');
    if (!ler('condicao_sexual')) {
      if (sexo === 'F') condicaoSexual = 'femea';
      else if (sexo === 'M')
        erros.push('Para machos, informe a condição sexual (inteiro ou castrado).');
    }

    const categoriaBruta = ler('categoria');
    const categoria = categoriaBruta
      ? (CATEGORIAS_ANIMAL as readonly string[]).includes(chave(categoriaBruta))
        ? (chave(categoriaBruta) as CategoriaAnimal)
        : null
      : null;
    if (!categoriaBruta) erros.push('Categoria é obrigatória.');
    else if (!categoria) erros.push(`Categoria inválida: "${categoriaBruta}".`);

    const aptidao = escolher('aptidao', APTIDOES_ACEITAS, 'Aptidão');
    if (!ler('aptidao')) erros.push('Aptidão é obrigatória (corte ou leite).');

    const origem = escolher('origem', ORIGENS_ACEITAS, 'Origem');
    if (!ler('origem')) erros.push('Origem é obrigatória (nascido ou comprado).');

    const dataNascimento = data('data_nascimento', 'Data de nascimento');
    const estimadoBruto = ler('nascimento_estimado');
    const dataNascimentoEstimada = estimadoBruto === null ? false : BOOLEANOS[chave(estimadoBruto)];
    if (dataNascimentoEstimada === undefined) {
      erros.push(`Nascimento estimado inválido: "${estimadoBruto}". Use sim ou não.`);
    }

    let dataEntrada = data('data_entrada', 'Data de entrada');
    if (!ler('data_entrada')) {
      if (origem === 'nascido' && dataNascimento) dataEntrada = dataNascimento;
      else if (origem === 'comprado')
        erros.push('Para animal comprado, informe a data de entrada.');
    }

    const pesoBruto = ler('peso_kg');
    let pesoVivoKg: number | null = null;
    if (pesoBruto !== null) {
      pesoVivoKg = interpretarNumero(pesoBruto);
      if (pesoVivoKg === null)
        erros.push(`Peso inválido ou ambíguo: "${pesoBruto}". Use 450 ou 450,5.`);
      else if (pesoVivoKg <= 0 || pesoVivoKg > PESO_VIVO_MAXIMO_KG) {
        erros.push(`Peso fora do intervalo aceito (maior que 0 e até ${PESO_VIVO_MAXIMO_KG} kg).`);
      }
    }
    let dataPesagem = data('data_pesagem', 'Data da pesagem');
    let metodoPesagem = escolher('metodo_pesagem', METODOS_ACEITOS, 'Método de pesagem');
    if (pesoVivoKg === null && (ler('data_pesagem') || ler('metodo_pesagem'))) {
      erros.push('Data ou método de pesagem informados sem peso.');
    }
    if (pesoVivoKg !== null) {
      dataPesagem ??= dataEntrada;
      metodoPesagem ??= 'balanca';
    }

    const dados: LinhaAnimalImportada | null =
      erros.length === 0 &&
      identificacao &&
      sexo &&
      condicaoSexual &&
      categoria &&
      aptidao &&
      origem &&
      dataEntrada
        ? {
            identificacao,
            nome: ler('nome'),
            sexo,
            condicaoSexual,
            categoria,
            racaNome: ler('raca'),
            aptidao,
            dataNascimento,
            dataNascimentoEstimada: dataNascimentoEstimada ?? false,
            origem,
            dataEntrada,
            loteNome: ler('lote'),
            pesoVivoKg,
            dataPesagem: pesoVivoKg === null ? null : dataPesagem,
            metodoPesagem: pesoVivoKg === null ? null : metodoPesagem,
            observacoes: ler('observacoes'),
          }
        : null;
    if (!dados && erros.length === 0) erros.push('Linha incompleta.');
    return { linha: indice + 2, dados, erros };
  });

  return { erroGeral: null, linhas };
}
