import {
  acoesDisponiveis,
  DEFINICOES_UNIDADE,
  aceitaNovaVersao,
  exigeDataAmostra,
  exigeReferenciaLocal,
  lerNumeroPublicado,
  problemasDaObtencao,
  problemasDoNaoQuantificado,
  problemasDoValor,
  registroDescartavel,
  registroEditavel,
  statusDepois,
  type AcaoConferencia,
  type NaturezaNaoQuantificado,
  type NumeroPublicado,
  type SeparadorDecimal,
} from '@pecuaria/domain';
import {
  ErroAplicacao,
  type DadosRegistroValidados,
  type DadosValorNaoQuantificadoValidados,
  type DadosValorValidados,
  type DiferencaVersao,
  type FiltrosRegistros,
  type Fonte,
  type RegistroComposicao,
  type RegistroDetalhe,
  type ResumoRegistro,
  type ValorNaoQuantificadoApi,
  type ValorNutricionalApi,
  type VinculoOrigemApi,
} from '@pecuaria/shared-types';
import {
  RepositorioComposicao,
  RepositorioSelecao,
  RepositorioVinculos,
  type GerenciadorBanco,
  type MudancaStatus,
  type NaoQuantificadoParaGravar,
  type ValorParaGravar,
} from '@pecuaria/database';
import { BaseServicoAlimentos, invalido, type OpcoesServicoAlimentos } from './servico-alimentos';

const ROTULOS_CABECALHO: Partial<Record<keyof RegistroComposicao, string>> = {
  referenciaLocal: 'Página ou tabela',
  idadeCorteDias: 'Idade de corte (dias)',
  classeIdadeFonte: 'Classe de idade da fonte',
  aditivoEnsilagem: 'Aditivo de ensilagem',
  regiao: 'Região',
  estacao: 'Estação',
  adubacao: 'Adubação',
  nObservacoes: 'Número de observações',
  separadorDecimal: 'Separador decimal',
  dataAmostra: 'Data da amostra',
  identificacaoAmostra: 'Identificação da amostra',
  observacoes: 'Observações',
};

const NOMES_TIPO: Record<ValorNutricionalApi['tipoValor'], string> = {
  valor_unico: 'valor único',
  media: 'média',
  mediana: 'mediana',
  minimo_garantido: 'mínimo garantido',
  maximo_garantido: 'máximo garantido',
};

const NOMES_NATUREZA: Record<NaturezaNaoQuantificado, string> = {
  abaixo_do_limite: 'abaixo do limite',
  acima_do_limite: 'acima do limite',
  nao_detectado: 'não detectado',
  tracos: 'traços',
  nao_determinado: 'não determinado',
  simbolo_sem_definicao: 'símbolo sem definição na fonte',
};

function comoTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/**
 * Registros de composição e valores (Fase 5A-3): cadastro como publicado, fluxo de conferência e
 * versões. Nada é convertido ao gravar (regra 3c); nutriente ausente simplesmente não tem linha.
 */
export class ServicoComposicao extends BaseServicoAlimentos {
  readonly comp: RepositorioComposicao;
  readonly vinculos: RepositorioVinculos;
  readonly selecao: RepositorioSelecao;

  constructor(banco: GerenciadorBanco, opcoes: OpcoesServicoAlimentos = {}) {
    super(banco, opcoes);
    this.comp = new RepositorioComposicao(() => banco.conexao);
    this.vinculos = new RepositorioVinculos(() => banco.conexao);
    this.selecao = new RepositorioSelecao(() => banco.conexao);
  }

  private registro(id: string): RegistroComposicao {
    const r = this.comp.obter(id);
    if (!r) throw new ErroAplicacao('NAO_ENCONTRADO', 'Registro de composição não encontrado.');
    return r;
  }

  private ativo(id: string): RegistroComposicao {
    const r = this.registro(id);
    if (r.descartadoEm) invalido('Registro descartado não muda.');
    return r;
  }

  private valores(r: RegistroComposicao): ValorNutricionalApi[] {
    const casas = (texto: string) => {
      const l = lerNumeroPublicado(texto, r.separadorDecimal);
      return l.ok ? l.numero.casasDecimais : 0;
    };
    return this.comp.valores(r.id, casas);
  }

  // ----- Consulta -----

  listar(filtros: FiltrosRegistros): ResumoRegistro[] {
    if (filtros.propriedadeId && !this.propriedades.obter(filtros.propriedadeId))
      throw new ErroAplicacao('NAO_ENCONTRADO', 'Propriedade não encontrada.');
    return this.comp.listar(filtros);
  }

  obter(id: string): RegistroDetalhe {
    const registro = this.registro(id);
    const fonte = this.fonte(registro.fonte.id);
    const valores = this.valores(registro);
    const naoQuantificados = this.comp.naoQuantificados(id);
    const versoes = this.versoes(registro);
    const ativo = registro.descartadoEm === null;
    return {
      registro,
      fonte: {
        ...registro.fonte,
        autores: fonte.autores,
        ano: fonte.ano,
        edicaoVersao: fonte.edicaoVersao,
        metodoMedicao: fonte.metodoMedicao,
        limitacoesMedicao: fonte.limitacoesMedicao,
        laboratorio: fonte.laboratorio,
        numeroLaudo: fonte.numeroLaudo,
        fabricante: fonte.fabricante,
      },
      valores,
      valoresNaoQuantificados: naoQuantificados,
      vinculosOrigem: this.vinculosDe(versoes),
      avaliacoes: this.selecao.avaliacoesDe([id]),
      acoes: ativo ? acoesDisponiveis(registro.status) : [],
      editavel: ativo && registroEditavel(registro.status),
      descartavel: ativo && registroDescartavel(registro.status),
      aceitaNovaVersao: ativo && aceitaNovaVersao(registro.status) && registro.sucessorId === null,
      versoes,
      diferencasDaAnterior: this.diferencas(registro, valores, naoQuantificados),
      historico: this.trilha('registro_composicao', [id]),
    };
  }

  private versoes(r: RegistroComposicao): ResumoRegistro[] {
    const anteriores: ResumoRegistro[] = [];
    let atual: RegistroComposicao | null = r;
    while (atual?.substituiId) {
      atual = this.comp.obter(atual.substituiId);
      if (atual) anteriores.unshift(atual);
    }
    const posteriores: ResumoRegistro[] = [];
    let seguinte = r.sucessorId ? this.comp.obter(r.sucessorId) : null;
    while (seguinte) {
      posteriores.push(seguinte);
      seguinte = seguinte.sucessorId ? this.comp.obter(seguinte.sucessorId) : null;
    }
    return [...anteriores, r, ...posteriores];
  }

  /**
   * Vínculos de possível mesma origem de qualquer versão deste registro. O outro lado aparece na
   * versão mais nova da cadeia dele; se ainda não está no banco, pela fonte e página declaradas.
   */
  private vinculosDe(versoes: ResumoRegistro[]): VinculoOrigemApi[] {
    const ids = versoes.map((v) => v.id);
    return this.vinculos.porRegistros(ids).map((v) => {
      const lado = ids.includes(v.registroId) ? 'este' : 'outro';
      const outroId = lado === 'este' ? v.relacionadoId : v.registroId;
      const outro = outroId ? this.comp.obter(outroId) : null;
      const vigente = outro ? (this.versoes(outro).at(-1) ?? outro) : null;
      return {
        id: v.id,
        lado,
        relacao: v.relacao,
        evidencia: v.evidencia,
        pacoteCodigo: v.pacoteCodigo,
        situacao: v.situacao,
        decididoPor: v.decididoPor,
        decididoEm: v.decididoEm,
        motivoDecisao: v.motivoDecisao,
        outro: {
          registroId: vigente?.id ?? null,
          alimentoNome: vigente?.alimentoNome ?? null,
          fonteCodigo: vigente?.fonte.codigo ?? v.alvoFonteCodigo,
          referenciaLocal: vigente?.referenciaLocal ?? v.alvoReferenciaLocal,
          status: vigente?.status ?? null,
        },
      };
    });
  }

  /** Decisão do usuário sobre um vínculo (confirmar ou descartar), uma vez, com trilha. */
  decidirVinculo(
    registroId: string,
    vinculoId: string,
    decisao: 'confirmado' | 'descartado',
    responsavel: string,
    motivo: string | null,
  ): RegistroDetalhe {
    this.transacao(() => {
      const r = this.registro(registroId);
      const ids = this.versoes(r).map((x) => x.id);
      const v = this.vinculos.obter(vinculoId);
      if (!v || !(ids.includes(v.registroId) || (v.relacionadoId && ids.includes(v.relacionadoId))))
        throw new ErroAplicacao('NAO_ENCONTRADO', 'Vínculo não encontrado neste registro.');
      if (v.relacionadoId === null)
        invalido(
          'O outro registro deste vínculo ainda não está no banco: importe-o antes de decidir.',
        );
      if (v.situacao !== 'a_confirmar') invalido('A decisão sobre este vínculo já foi tomada.');
      if (decisao === 'descartado' && !motivo) invalido('Informe o motivo do descarte.');
      this.vinculos.decidir(vinculoId, decisao, responsavel, motivo, this.agora());
      this.auditar(
        'vinculo_registro',
        vinculoId,
        decisao === 'confirmado' ? 'confirmacao' : 'descarte',
        { situacao: v.situacao },
        this.vinculos.obter(vinculoId),
        motivo,
      );
    });
    return this.obter(registroId);
  }

  /** O que mudou desde a versão anterior: cabeçalho e cada valor (como publicado). */
  private diferencas(
    r: RegistroComposicao,
    valores: ValorNutricionalApi[],
    naoQuantificados: ValorNaoQuantificadoApi[],
  ): DiferencaVersao[] {
    if (!r.substituiId) return [];
    const anterior = this.comp.obter(r.substituiId);
    if (!anterior) return [];
    const difs: DiferencaVersao[] = [];
    for (const [campo, rotulo] of Object.entries(ROTULOS_CABECALHO)) {
      const antes = comoTexto(anterior[campo as keyof RegistroComposicao]);
      const depois = comoTexto(r[campo as keyof RegistroComposicao]);
      if (antes !== depois) difs.push({ campo: rotulo!, antes, depois });
    }
    if (comoTexto(anterior.outrasCondicoes) !== comoTexto(r.outrasCondicoes))
      difs.push({
        campo: 'Outras condições',
        antes: comoTexto(anterior.outrasCondicoes),
        depois: comoTexto(r.outrasCondicoes),
      });
    // Número e não quantificado dividem a chave: nunca coexistem no mesmo registro.
    type Item = ValorNutricionalApi | ValorNaoQuantificadoApi;
    const chave = (v: Item) => `${v.nutriente.id}|${v.tipoValor}|${v.base}`;
    const descrever = (v: Item) =>
      ('valorPublicado' in v
        ? [
            `${v.valorPublicado} ${DEFINICOES_UNIDADE[v.unidade].simbolo}`,
            v.desvioPadraoPublicado ? `DP ${v.desvioPadraoPublicado}` : null,
            v.minimoPublicado ? `mín. ${v.minimoPublicado}` : null,
            v.maximoPublicado ? `máx. ${v.maximoPublicado}` : null,
            v.nObservacoes !== null ? `n ${v.nObservacoes}` : null,
            v.formaObtencao !== 'nao_informado'
              ? `obtenção: ${v.formaObtencao}${v.descricaoObtencao ? ` (${v.descricaoObtencao})` : ''}`
              : null,
            v.interpretacaoBase ? `base interpretada: ${v.interpretacaoBase}` : null,
          ]
        : [
            `${v.textoPublicado} ${DEFINICOES_UNIDADE[v.unidade].simbolo}`,
            `não quantificado (${NOMES_NATUREZA[v.natureza]}): ${v.significadoFonte}`,
          ]
      )
        .concat(
          v.metodoAnaliticoFonte ? `método: ${v.metodoAnaliticoFonte}` : null,
          v.referenciaLocal ? `ref.: ${v.referenciaLocal}` : null,
        )
        .filter(Boolean)
        .join('; ');
    const mapa = (itens: Item[]) => new Map(itens.map((v) => [chave(v), v]));
    const antes = mapa([...this.valores(anterior), ...this.comp.naoQuantificados(anterior.id)]);
    const depois = mapa([...valores, ...naoQuantificados]);
    for (const k of new Set([...antes.keys(), ...depois.keys()])) {
      const a = antes.get(k);
      const d = depois.get(k);
      const textoA = a ? descrever(a) : null;
      const textoD = d ? descrever(d) : null;
      if (textoA !== textoD) {
        const v = (d ?? a)!;
        difs.push({
          campo: `${v.nutriente.codigo} (${NOMES_TIPO[v.tipoValor]}, ${v.base.toUpperCase()})`,
          antes: textoA,
          depois: textoD,
        });
      }
    }
    return difs;
  }

  // ----- Cabeçalho -----

  private conferirCabecalho(d: DadosRegistroValidados): Fonte {
    const fonte = this.fonte(d.fonteId);
    if (fonte.excluidaEm) invalido('A fonte está excluída.');
    if (fonte.origem === 'sistema_exigencias') invalido('Origem reservada para a Fase 6.');
    const alimento = this.alimento(d.alimentoId);
    if (alimento.excluidoEm) invalido('O alimento está excluído.');
    if (exigeReferenciaLocal(fonte.origem) && !d.referenciaLocal)
      invalido('Informe a página ou tabela da publicação.');
    if (exigeDataAmostra(fonte.origem) && !d.dataAmostra) invalido('Informe a data da amostra.');
    if (!exigeDataAmostra(fonte.origem) && d.dataAmostra)
      invalido('Data da amostra só se aplica a laudo e medição própria.');
    return fonte;
  }

  criar(d: DadosRegistroValidados): RegistroDetalhe {
    const id = this.gerarId();
    this.transacao(() => {
      this.conferirCabecalho(d);
      this.comp.inserir(id, d, this.agora());
      this.auditar('registro_composicao', id, 'criacao', null, this.registro(id));
    });
    return this.obter(id);
  }

  atualizar(id: string, d: DadosRegistroValidados): RegistroDetalhe {
    this.transacao(() => {
      const antes = this.ativo(id);
      if (!registroEditavel(antes.status))
        invalido('O registro só é editado em rascunho. Conferido: crie uma nova versão.');
      if (d.fonteId !== antes.fonte.id || d.alimentoId !== antes.alimentoId)
        invalido('Fonte e alimento do registro não mudam: descarte e registre de novo.');
      this.conferirCabecalho(d);
      const agora = this.agora();
      this.comp.atualizar(id, d, agora);
      if (d.separadorDecimal !== antes.separadorDecimal)
        this.rederivar(antes, d.separadorDecimal, agora);
      this.auditar('registro_composicao', id, 'alteracao', antes, this.registro(id));
    });
    return this.obter(id);
  }

  /** O separador decimal mudou: relê todos os textos publicados; um que não leia recusa tudo. */
  private rederivar(r: RegistroComposicao, separador: SeparadorDecimal, agora: string): void {
    for (const v of this.valores(r)) {
      const ler = (texto: string | null, rotulo: string) =>
        texto === null
          ? null
          : this.ler(texto, separador, `${v.nutriente.codigo}, ${rotulo}`).valor;
      const valor = ler(v.valorPublicado, 'valor')!;
      const numeros = {
        valor,
        desvioPadrao: ler(v.desvioPadraoPublicado, 'desvio-padrão'),
        minimo: ler(v.minimoPublicado, 'mínimo'),
        maximo: ler(v.maximoPublicado, 'máximo'),
      };
      const problemas = problemasDoValor(
        {
          ...numeros,
          unidade: v.unidade,
          base: v.base,
          tipoValor: v.tipoValor,
          nObservacoes: v.nObservacoes,
        },
        {
          origem: r.fonte.origem,
          grupo: v.nutriente.grupo,
          unidadeReferencia: v.nutriente.unidadeReferencia,
          codigoNutriente: v.nutriente.codigo,
          naturezaValor: this.nutriente(v.nutriente.id).naturezaValor,
        },
      );
      if (problemas.length) invalido(`${v.nutriente.codigo}: ${problemas.join(' ')}`);
      this.comp.rederivarValor(v.id, numeros, agora);
    }
    // Não quantificado não tem número, mas o limite de "<0,01" precisa ler com o separador novo.
    for (const q of this.comp.naoQuantificados(r.id)) {
      const problemas = problemasDoNaoQuantificado(q, {
        origem: r.fonte.origem,
        unidadeReferencia: q.nutriente.unidadeReferencia,
        codigoNutriente: q.nutriente.codigo,
        separador,
      });
      if (problemas.length) invalido(`${q.nutriente.codigo}: ${problemas.join(' ')}`);
    }
  }

  private ler(texto: string, separador: SeparadorDecimal, rotulo: string): NumeroPublicado {
    const l = lerNumeroPublicado(texto, separador);
    if (!l.ok) invalido(`${rotulo}: ${l.motivo}`);
    return l.numero;
  }

  // ----- Valores -----

  private prepararValor(r: RegistroComposicao, d: DadosValorValidados): ValorParaGravar {
    const n = this.nutriente(d.nutrienteId);
    if (!n.ativo) invalido(`A definição ${n.codigo} está inativa.`);
    const sep = r.separadorDecimal;
    const valor = this.ler(d.valorPublicado, sep, 'Valor');
    const dp =
      d.desvioPadraoPublicado === null
        ? null
        : this.ler(d.desvioPadraoPublicado, sep, 'Desvio-padrão');
    const min = d.minimoPublicado === null ? null : this.ler(d.minimoPublicado, sep, 'Mínimo');
    const max = d.maximoPublicado === null ? null : this.ler(d.maximoPublicado, sep, 'Máximo');
    const problemas = problemasDoValor(
      {
        valor: valor.valor,
        unidade: d.unidade,
        base: d.base,
        tipoValor: d.tipoValor,
        desvioPadrao: dp?.valor ?? null,
        minimo: min?.valor ?? null,
        maximo: max?.valor ?? null,
        nObservacoes: d.nObservacoes,
      },
      {
        origem: r.fonte.origem,
        grupo: n.grupo,
        unidadeReferencia: n.unidadeReferencia,
        codigoNutriente: n.codigo,
        naturezaValor: n.naturezaValor,
      },
    );
    problemas.push(...problemasDaObtencao(d.formaObtencao, d.descricaoObtencao));
    if (problemas.length) invalido(problemas.join(' '));
    return {
      nutrienteId: n.id,
      valorPublicado: valor.texto,
      valor: valor.valor,
      unidade: d.unidade,
      base: d.base,
      tipoValor: d.tipoValor,
      desvioPadraoPublicado: dp?.texto ?? null,
      desvioPadrao: dp?.valor ?? null,
      minimoPublicado: min?.texto ?? null,
      minimo: min?.valor ?? null,
      maximoPublicado: max?.texto ?? null,
      maximo: max?.valor ?? null,
      nObservacoes: d.nObservacoes,
      metodoAnaliticoFonte: d.metodoAnaliticoFonte,
      formaObtencao: d.formaObtencao,
      descricaoObtencao: d.descricaoObtencao,
      interpretacaoBase: d.interpretacaoBase,
      referenciaLocal: d.referenciaLocal,
      observacao: d.observacao,
    };
  }

  salvarValor(registroId: string, valorId: string | null, d: DadosValorValidados): RegistroDetalhe {
    this.transacao(() => {
      const r = this.ativo(registroId);
      if (!registroEditavel(r.status))
        invalido('Valores só mudam em rascunho. Conferido: crie uma nova versão.');
      const v = this.prepararValor(r, d);
      const agora = this.agora();
      if (valorId === null) {
        const id = this.gerarId();
        this.comp.inserirValor(id, registroId, v, agora);
        this.auditar('registro_composicao', registroId, 'alteracao', null, {
          valorIncluido: { id, ...v },
        });
      } else {
        const atual = this.comp.obterValor(valorId);
        if (!atual || atual.registroId !== registroId || atual.deletedAt)
          throw new ErroAplicacao('NAO_ENCONTRADO', 'Valor não encontrado neste registro.');
        const antes = this.valores(r).find((x) => x.id === valorId) ?? null;
        this.comp.atualizarValor(valorId, v, agora);
        this.auditar(
          'registro_composicao',
          registroId,
          'alteracao',
          { valor: antes },
          {
            valor: { id: valorId, ...v },
          },
        );
      }
    }, 'Este registro já tem um valor para o mesmo nutriente, tipo e base.');
    return this.obter(registroId);
  }

  removerValor(registroId: string, valorId: string): RegistroDetalhe {
    this.transacao(() => {
      const r = this.ativo(registroId);
      if (!registroEditavel(r.status))
        invalido('Valores só mudam em rascunho. Conferido: crie uma nova versão.');
      const antes = this.valores(r).find((x) => x.id === valorId);
      if (!antes) throw new ErroAplicacao('NAO_ENCONTRADO', 'Valor não encontrado neste registro.');
      this.comp.removerValor(valorId, this.agora());
      this.auditar('registro_composicao', registroId, 'alteracao', { valorRemovido: antes }, null);
    });
    return this.obter(registroId);
  }

  // ----- Valores não quantificados -----

  private prepararNaoQuantificado(
    r: RegistroComposicao,
    d: DadosValorNaoQuantificadoValidados,
  ): NaoQuantificadoParaGravar {
    const n = this.nutriente(d.nutrienteId);
    if (!n.ativo) invalido(`A definição ${n.codigo} está inativa.`);
    const problemas = problemasDoNaoQuantificado(d, {
      origem: r.fonte.origem,
      unidadeReferencia: n.unidadeReferencia,
      codigoNutriente: n.codigo,
      separador: r.separadorDecimal,
    });
    if (problemas.length) invalido(problemas.join(' '));
    return { ...d, nutrienteId: n.id };
  }

  salvarNaoQuantificado(
    registroId: string,
    valorId: string | null,
    d: DadosValorNaoQuantificadoValidados,
  ): RegistroDetalhe {
    this.transacao(() => {
      const r = this.ativo(registroId);
      if (!registroEditavel(r.status))
        invalido('Valores só mudam em rascunho. Conferido: crie uma nova versão.');
      const q = this.prepararNaoQuantificado(r, d);
      const agora = this.agora();
      if (valorId === null) {
        const id = this.gerarId();
        this.comp.inserirNaoQuantificado(id, registroId, q, agora);
        this.auditar('registro_composicao', registroId, 'alteracao', null, {
          naoQuantificadoIncluido: { id, ...q },
        });
      } else {
        const atual = this.comp.obterNaoQuantificado(valorId);
        if (!atual || atual.registroId !== registroId || atual.deletedAt)
          throw new ErroAplicacao('NAO_ENCONTRADO', 'Valor não encontrado neste registro.');
        const antes = this.comp.naoQuantificados(registroId).find((x) => x.id === valorId);
        this.comp.atualizarNaoQuantificado(valorId, q, agora);
        this.auditar(
          'registro_composicao',
          registroId,
          'alteracao',
          { naoQuantificado: antes ?? null },
          { naoQuantificado: { id: valorId, ...q } },
        );
      }
    }, 'Este registro já tem um valor para o mesmo nutriente, tipo e base.');
    return this.obter(registroId);
  }

  removerNaoQuantificado(registroId: string, valorId: string): RegistroDetalhe {
    this.transacao(() => {
      const r = this.ativo(registroId);
      if (!registroEditavel(r.status))
        invalido('Valores só mudam em rascunho. Conferido: crie uma nova versão.');
      const antes = this.comp.naoQuantificados(registroId).find((x) => x.id === valorId);
      if (!antes) throw new ErroAplicacao('NAO_ENCONTRADO', 'Valor não encontrado neste registro.');
      this.comp.removerNaoQuantificado(valorId, this.agora());
      this.auditar(
        'registro_composicao',
        registroId,
        'alteracao',
        { naoQuantificadoRemovido: antes },
        null,
      );
    });
    return this.obter(registroId);
  }

  // ----- Fluxo de conferência -----

  private passo(
    id: string,
    acao: AcaoConferencia,
    montar: (r: RegistroComposicao, agora: string) => MudancaStatus,
    trilha: Parameters<BaseServicoAlimentos['auditar']>[2],
    motivo: string | null,
    depois?: (r: RegistroComposicao, agora: string) => void,
  ): RegistroDetalhe {
    this.transacao(() => {
      const antes = this.ativo(id);
      try {
        statusDepois(acao, antes.status);
      } catch (e) {
        invalido(e instanceof Error ? e.message : 'Transição inválida.');
      }
      const agora = this.agora();
      this.comp.mudarStatus(id, montar(antes, agora), agora);
      this.auditar(
        'registro_composicao',
        id,
        trilha,
        { status: antes.status },
        this.registro(id),
        motivo,
      );
      depois?.(antes, agora);
    });
    return this.obter(id);
  }

  transcrever(id: string, responsavel: string): RegistroDetalhe {
    const r = this.ativo(id);
    if (r.nValores === 0)
      invalido(
        'Registro sem valores não é transcrito. Nutriente que a fonte não traz fica sem linha.',
      );
    return this.passo(
      id,
      'transcrever',
      (_r, agora) => ({
        status: 'transcrito',
        transcritoPor: responsavel,
        transcritoEm: agora,
        conferidoPor: null,
        conferidoEm: null,
        rejeitadoPor: null,
        rejeitadoEm: null,
        motivoRejeicao: null,
      }),
      'transcricao',
      null,
    );
  }

  devolver(id: string, motivo: string): RegistroDetalhe {
    return this.passo(id, 'devolver', () => rascunhoLimpo(), 'retorno_rascunho', motivo);
  }

  reabrir(id: string): RegistroDetalhe {
    return this.passo(id, 'reabrir', () => rascunhoLimpo(), 'reabertura_rascunho', null);
  }

  rejeitar(id: string, responsavel: string, motivo: string): RegistroDetalhe {
    return this.passo(
      id,
      'rejeitar',
      (r, agora) => ({
        status: 'rejeitado',
        transcritoPor: r.transcritoPor,
        transcritoEm: r.transcritoEm,
        conferidoPor: null,
        conferidoEm: null,
        rejeitadoPor: responsavel,
        rejeitadoEm: agora,
        motivoRejeicao: motivo,
      }),
      'rejeicao',
      motivo,
    );
  }

  /** Conferir uma versão nova substitui, na mesma transação, a versão que ela corrige. */
  conferir(id: string, responsavel: string): RegistroDetalhe {
    return this.passo(
      id,
      'conferir',
      (r, agora) => ({
        status: 'conferido',
        transcritoPor: r.transcritoPor,
        transcritoEm: r.transcritoEm,
        conferidoPor: responsavel,
        conferidoEm: agora,
        rejeitadoPor: null,
        rejeitadoEm: null,
        motivoRejeicao: null,
      }),
      'conferencia',
      null,
      (r, agora) => {
        if (!r.substituiId) return;
        const anterior = this.registro(r.substituiId);
        if (anterior.status !== 'conferido')
          invalido('A versão anterior não está conferida; não há o que substituir.');
        this.comp.substituir(anterior.id, agora);
        this.auditar(
          'registro_composicao',
          anterior.id,
          'substituicao',
          { status: 'conferido' },
          { status: 'substituido', substituidoPor: id },
          r.motivoVersao,
        );
      },
    );
  }

  novaVersao(id: string, motivo: string): RegistroDetalhe {
    const novoId = this.gerarId();
    this.transacao(() => {
      const r = this.ativo(id);
      if (!aceitaNovaVersao(r.status))
        invalido('Só um registro conferido vigente recebe nova versão.');
      if (r.sucessorId) invalido('Já existe uma versão nova em aberto para este registro.');
      const agora = this.agora();
      this.comp.inserir(
        novoId,
        {
          alimentoId: r.alimentoId,
          fonteId: r.fonte.id,
          referenciaLocal: r.referenciaLocal,
          idadeCorteDias: r.idadeCorteDias,
          classeIdadeFonte: r.classeIdadeFonte,
          aditivoEnsilagem: r.aditivoEnsilagem,
          regiao: r.regiao,
          estacao: r.estacao,
          adubacao: r.adubacao,
          outrasCondicoes: r.outrasCondicoes,
          nObservacoes: r.nObservacoes,
          separadorDecimal: r.separadorDecimal,
          dataAmostra: r.dataAmostra,
          identificacaoAmostra: r.identificacaoAmostra,
          observacoes: r.observacoes,
        },
        agora,
        { substituiId: id, motivo },
      );
      const copiados = this.comp.copiarValores(id, novoId, this.gerarId, agora);
      const naoQuantificadosCopiados = this.comp.copiarNaoQuantificados(
        id,
        novoId,
        this.gerarId,
        agora,
      );
      this.auditar(
        'registro_composicao',
        novoId,
        'nova_versao',
        null,
        { ...this.registro(novoId), valoresCopiados: copiados, naoQuantificadosCopiados },
        motivo,
      );
    });
    return this.obter(novoId);
  }

  descartar(id: string, motivo: string): RegistroDetalhe {
    this.transacao(() => {
      const r = this.ativo(id);
      if (!registroDescartavel(r.status))
        invalido('Registro conferido não é descartado. Para corrigir, crie uma nova versão.');
      this.comp.descartar(id, motivo, this.agora());
      this.auditar('registro_composicao', id, 'exclusao', { status: r.status }, null, motivo);
    });
    return this.obter(id);
  }
}

function rascunhoLimpo(): MudancaStatus {
  return {
    status: 'rascunho',
    transcritoPor: null,
    transcritoEm: null,
    conferidoPor: null,
    conferidoEm: null,
    rejeitadoPor: null,
    rejeitadoEm: null,
    motivoRejeicao: null,
  };
}
