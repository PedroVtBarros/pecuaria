import type { LinhaPreviaImportacao, ResultadoImportacao } from '@pecuaria/shared-types';
import {
  diasEntre,
  interpretarCsvAnimais,
  normalizarIdentificacao,
  normalizarNome,
} from '@pecuaria/domain';
import { naoEncontrado, type ContextoRebanho } from './contexto';
import type { NovoAnimalPreparado, ServicoAnimais } from './servico-animais';

/**
 * Importação de animais por planilha CSV (ROADMAP, Fase 1).
 * Primeiro valida e mostra a prévia; só grava quando o usuário confirma e
 * não há nenhum erro. A gravação é tudo ou nada.
 * Raças e lotes são procurados pelo nome e precisam já existir.
 */
export class ServicoImportacao {
  constructor(
    private readonly ctx: ContextoRebanho,
    private readonly animais: ServicoAnimais,
  ) {}

  importar(propriedadeId: string, conteudo: string, confirmar: boolean): ResultadoImportacao {
    if (!this.ctx.propriedades.obter(propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    const leitura = interpretarCsvAnimais(conteudo);
    const vazio: ResultadoImportacao = {
      confirmado: false,
      erroGeral: leitura.erroGeral,
      totalLinhas: leitura.linhas.length,
      linhasValidas: 0,
      linhasComErro: [],
      importados: 0,
    };
    if (leitura.erroGeral) return vazio;
    if (leitura.linhas.length === 0)
      return { ...vazio, erroGeral: 'O arquivo não tem nenhum animal.' };

    const hoje = this.ctx.hoje();
    const vistos = new Map<string, number>();
    const preparados: NovoAnimalPreparado[] = [];
    const linhasComErro: LinhaPreviaImportacao[] = [];

    for (const linha of leitura.linhas) {
      const erros = [...linha.erros];
      const dados = linha.dados;
      if (dados) {
        const chave = normalizarIdentificacao(dados.identificacao);
        const anterior = vistos.get(chave);
        if (anterior !== undefined)
          erros.push(`Identificação repetida no arquivo (também na linha ${anterior}).`);
        else vistos.set(chave, linha.linha);

        let racaId: string | null = null;
        if (dados.racaNome) {
          const raca = this.ctx.racas.obterPorNome(normalizarNome(dados.racaNome));
          if (!raca) erros.push(`Raça não cadastrada: "${dados.racaNome}".`);
          else racaId = raca.id;
        }
        let loteId: string | null = null;
        if (dados.loteNome) {
          const lote = this.ctx.lotes.obterAtivoPorNome(
            propriedadeId,
            normalizarNome(dados.loteNome),
          );
          if (!lote) erros.push(`Lote ativo não encontrado: "${dados.loteNome}".`);
          else loteId = lote.id;
        }
        if (dados.dataPesagem) {
          if (diasEntre(dados.dataEntrada, dados.dataPesagem) < 0) {
            erros.push('A data da pesagem não pode ser anterior à data de entrada.');
          }
          if (diasEntre(hoje, dados.dataPesagem) > 0)
            erros.push('A data da pesagem não pode ser no futuro.');
        }

        if (erros.length === 0) {
          const resultado = this.animais.prepararNovo(
            propriedadeId,
            {
              identificacao: dados.identificacao,
              nome: dados.nome,
              sexo: dados.sexo,
              condicaoSexual: dados.condicaoSexual,
              categoria: dados.categoria,
              aptidao: dados.aptidao,
              racaId,
              dataNascimento: dados.dataNascimento,
              dataNascimentoEstimada: dados.dataNascimentoEstimada,
              maeId: null,
              paiId: null,
              origem: dados.origem,
              observacoes: dados.observacoes,
            },
            {
              data: dados.dataEntrada,
              loteId,
              pesoVivoKg: dados.pesoVivoKg,
              metodoPesagem: dados.metodoPesagem,
            },
          );
          erros.push(...resultado.erros);
          if (resultado.preparado) {
            if (resultado.preparado.pesagem && dados.dataPesagem) {
              resultado.preparado.pesagem.data = dados.dataPesagem;
            }
            preparados.push(resultado.preparado);
          }
        }
      }
      if (erros.length > 0) {
        linhasComErro.push({
          linha: linha.linha,
          identificacao: dados?.identificacao ?? null,
          erros,
        });
      }
    }

    const resultado: ResultadoImportacao = {
      confirmado: false,
      erroGeral: null,
      totalLinhas: leitura.linhas.length,
      linhasValidas: leitura.linhas.length - linhasComErro.length,
      linhasComErro,
      importados: 0,
    };
    if (!confirmar || linhasComErro.length > 0) return resultado;

    this.ctx.transacao(() => {
      for (const novo of preparados) this.animais.gravarNovo(novo, 'importacao');
    });
    return { ...resultado, confirmado: true, importados: preparados.length };
  }
}
