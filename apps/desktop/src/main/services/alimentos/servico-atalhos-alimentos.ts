import {
  type DadosFonteValidados,
  type DadosLaudoValidados,
  type DadosMedicaoMsValidados,
  type DadosRegistroValidados,
  type DadosRotuloValidados,
  type RegistroDetalhe,
} from '@pecuaria/shared-types';
import type { GerenciadorBanco } from '@pecuaria/database';
import {
  BaseServicoAlimentos,
  invalido,
  type OpcoesServicoAlimentos,
  type ServicoAlimentos,
} from './servico-alimentos';
import type { ServicoComposicao } from './servico-composicao';

const FONTE_VAZIA: Omit<DadosFonteValidados, 'origem' | 'titulo'> = {
  codigo: null,
  autores: null,
  ano: null,
  edicaoVersao: null,
  instituicaoEditora: null,
  isbnDoiUrl: null,
  dataAcesso: null,
  experimentoOrigem: null,
  laboratorio: null,
  numeroLaudo: null,
  dataLaudo: null,
  fabricante: null,
  registroProduto: null,
  metodoMedicao: null,
  limitacoesMedicao: null,
  propriedadeId: null,
  observacoes: null,
};

function cabecalho(
  alimentoId: string,
  fonteId: string,
  extra: Partial<DadosRegistroValidados>,
): DadosRegistroValidados {
  return {
    alimentoId,
    fonteId,
    referenciaLocal: null,
    idadeCorteDias: null,
    classeIdadeFonte: null,
    aditivoEnsilagem: null,
    regiao: null,
    estacao: null,
    adubacao: null,
    outrasCondicoes: null,
    nObservacoes: null,
    separadorDecimal: 'virgula',
    dataAmostra: null,
    identificacaoAmostra: null,
    observacoes: null,
    ...extra,
  };
}

const SEM_ESTATISTICA = {
  desvioPadraoPublicado: null,
  minimoPublicado: null,
  maximoPublicado: null,
  nObservacoes: null,
  metodoAnaliticoFonte: null,
  // O atalho não presume a forma de obtenção; o usuário pode informá-la no registro.
  formaObtencao: 'nao_informado',
  descricaoObtencao: null,
  interpretacaoBase: null,
  referenciaLocal: null,
} as const;

/**
 * Atalhos da Fase 5A-4. Cada um grava fonte, registro (rascunho) e valores numa só transação,
 * pelos mesmos serviços e regras do cadastro manual; nada é conferido automaticamente.
 */
export class ServicoAtalhosAlimentos extends BaseServicoAlimentos {
  constructor(
    banco: GerenciadorBanco,
    private readonly alimentos: ServicoAlimentos,
    private readonly composicao: ServicoComposicao,
    opcoes: OpcoesServicoAlimentos = {},
  ) {
    super(banco, opcoes);
  }

  private alimentoAtivo(id: string) {
    const a = this.alimento(id);
    if (a.excluidoEm) invalido('O alimento está excluído.');
    return a;
  }

  /** Produto comercial pelo rótulo: garantias na base MN, como no rótulo (RF-05.7). */
  registrarRotulo(d: DadosRotuloValidados): RegistroDetalhe {
    const id = this.transacao(() => {
      let alimentoId: string;
      if (d.alimentoId) {
        const a = this.alimentoAtivo(d.alimentoId);
        if (!a.comercial) invalido('Rótulo só se registra para alimento comercial.');
        alimentoId = a.id;
      } else alimentoId = this.alimentos.criarAlimento({ ...d.alimento!, comercial: true }).id;
      const fonte = this.alimentos.criarFonte({
        ...FONTE_VAZIA,
        origem: 'rotulo_comercial',
        titulo: d.titulo,
        fabricante: d.fabricante,
        registroProduto: d.registroProduto,
        observacoes: d.observacoes,
      });
      const r = this.composicao.criar(
        cabecalho(alimentoId, fonte.id, { separadorDecimal: d.separadorDecimal }),
      );
      for (const g of d.garantias)
        this.composicao.salvarValor(r.registro.id, null, {
          ...SEM_ESTATISTICA,
          nutrienteId: g.nutrienteId,
          valorPublicado: g.valorPublicado,
          unidade: g.unidade,
          base: 'mn',
          tipoValor: g.tipoValor,
          observacao: g.observacao,
        });
      return r.registro.id;
    }, 'Já existe um alimento com este nome.');
    return this.composicao.obter(id);
  }

  /** Laudo laboratorial de uma amostra da propriedade (dado da propriedade, não científico). */
  registrarLaudo(d: DadosLaudoValidados): RegistroDetalhe {
    const id = this.transacao(() => {
      this.alimentoAtivo(d.alimentoId);
      const fonte = this.alimentos.criarFonte({
        ...FONTE_VAZIA,
        origem: 'laboratorial',
        titulo: d.numeroLaudo
          ? `Laudo ${d.numeroLaudo} (${d.laboratorio})`
          : `Laudo (${d.laboratorio})`,
        laboratorio: d.laboratorio,
        numeroLaudo: d.numeroLaudo,
        dataLaudo: d.dataLaudo,
        propriedadeId: d.propriedadeId,
        observacoes: d.observacoes,
      });
      const r = this.composicao.criar(
        cabecalho(d.alimentoId, fonte.id, {
          separadorDecimal: d.separadorDecimal,
          dataAmostra: d.dataAmostra,
          identificacaoAmostra: d.identificacaoAmostra,
        }),
      );
      for (const v of d.valores)
        this.composicao.salvarValor(r.registro.id, null, {
          ...SEM_ESTATISTICA,
          nutrienteId: v.nutrienteId,
          valorPublicado: v.valorPublicado,
          unidade: v.unidade,
          base: v.base,
          tipoValor: 'valor_unico',
          metodoAnaliticoFonte: v.metodoAnaliticoFonte,
          observacao: v.observacao,
        });
      return r.registro.id;
    });
    return this.composicao.obter(id);
  }

  /**
   * MS medida na fazenda (D5-8): o método e as limitações são os descritos pelo usuário; o sistema
   * não prescreve nem corrige o valor, e a tela marca sempre "método não validado pelo sistema".
   * O valor fica na unidade e na base de referência da definição (MS: % da matéria natural).
   */
  registrarMedicaoMs(d: DadosMedicaoMsValidados): RegistroDetalhe {
    const id = this.transacao(() => {
      this.alimentoAtivo(d.alimentoId);
      const n = this.nutriente(d.nutrienteId);
      if (n.grupo !== 'fracao_seca') invalido('Medição própria registra somente matéria seca.');
      let fonteId: string;
      if (d.fonteId) {
        const f = this.fonte(d.fonteId);
        if (f.origem !== 'medicao_propria' || f.propriedadeId !== d.propriedadeId || f.excluidaEm)
          invalido('Escolha um método de medição ativo desta propriedade.');
        fonteId = f.id;
      } else
        fonteId = this.alimentos.criarFonte({
          ...FONTE_VAZIA,
          origem: 'medicao_propria',
          titulo: d.metodo!.titulo,
          metodoMedicao: d.metodo!.metodoMedicao,
          limitacoesMedicao: d.metodo!.limitacoesMedicao,
          propriedadeId: d.propriedadeId,
        }).id;
      const r = this.composicao.criar(
        cabecalho(d.alimentoId, fonteId, {
          separadorDecimal: d.separadorDecimal,
          dataAmostra: d.dataAmostra,
          identificacaoAmostra: d.identificacaoAmostra,
        }),
      );
      this.composicao.salvarValor(r.registro.id, null, {
        ...SEM_ESTATISTICA,
        nutrienteId: n.id,
        valorPublicado: d.valorPublicado,
        unidade: n.unidadeReferencia,
        base: n.baseReferencia,
        tipoValor: d.tipoValor,
        nObservacoes: d.nObservacoes,
        observacao: d.observacao,
      });
      return r.registro.id;
    });
    return this.composicao.obter(id);
  }
}
