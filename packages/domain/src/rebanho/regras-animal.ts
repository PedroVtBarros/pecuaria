import { diasEntre } from '../comum/datas';
import {
  SEXO_DA_CATEGORIA,
  type CategoriaAnimal,
  type CondicaoSexual,
  type OrigemAnimal,
  type Sexo,
} from './enumeracoes';

export interface DadosConsistenciaAnimal {
  sexo: Sexo;
  condicaoSexual: CondicaoSexual;
  categoria: CategoriaAnimal;
  origem: OrigemAnimal;
  dataNascimento: string | null;
  /** Data de entrada no rebanho. Ausente na edição, quando não é alterada. */
  dataEntrada?: string | null;
}

/**
 * Regras que envolvem mais de um campo do animal. Formatos e valores
 * permitidos já foram validados pelo contrato. Retorna a lista de problemas.
 */
export function validarConsistenciaAnimal(dados: DadosConsistenciaAnimal, hoje: string): string[] {
  const erros: string[] = [];

  if (SEXO_DA_CATEGORIA[dados.categoria] !== dados.sexo) {
    erros.push(
      dados.sexo === 'F'
        ? 'A categoria escolhida é de macho, mas o sexo informado é fêmea.'
        : 'A categoria escolhida é de fêmea, mas o sexo informado é macho.',
    );
  }
  if (dados.sexo === 'F' && dados.condicaoSexual !== 'femea') {
    erros.push('Para fêmeas, a condição sexual deve ser "fêmea".');
  }
  if (dados.sexo === 'M' && dados.condicaoSexual === 'femea') {
    erros.push('Para machos, a condição sexual deve ser "inteiro" ou "castrado".');
  }
  if (dados.dataNascimento && diasEntre(hoje, dados.dataNascimento) > 0) {
    erros.push('A data de nascimento não pode ser no futuro.');
  }
  if (dados.dataEntrada) {
    if (diasEntre(hoje, dados.dataEntrada) > 0) {
      erros.push('A data de entrada não pode ser no futuro.');
    }
    if (dados.dataNascimento && diasEntre(dados.dataNascimento, dados.dataEntrada) < 0) {
      erros.push('A data de entrada não pode ser anterior ao nascimento.');
    }
  }
  if (dados.origem === 'nascido' && !dados.dataNascimento) {
    erros.push('Para animal nascido na propriedade, informe a data de nascimento.');
  }
  return erros;
}

/**
 * Data de um evento do animal (pesagem, transferência, saída) precisa estar
 * entre a entrada no rebanho e hoje.
 */
export function validarDataDeEvento(
  data: string,
  limites: { dataEntrada: string; hoje: string; ultimoEvento?: string | null },
  descricao: string,
): string[] {
  const erros: string[] = [];
  if (diasEntre(limites.hoje, data) > 0) erros.push(`A data ${descricao} não pode ser no futuro.`);
  if (diasEntre(limites.dataEntrada, data) < 0) {
    erros.push(`A data ${descricao} não pode ser anterior à entrada do animal no rebanho.`);
  }
  if (limites.ultimoEvento && diasEntre(limites.ultimoEvento, data) < 0) {
    erros.push(
      `A data ${descricao} não pode ser anterior à última movimentação do animal (${limites.ultimoEvento}).`,
    );
  }
  return erros;
}
