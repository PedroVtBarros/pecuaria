import {
  contarPacote,
  normalizarCodigo,
  normalizarNome,
  problemasDoPacote,
  registrosImportaveis,
  type PacoteCuradoria,
  type RegistroPacoteCuradoria,
  type ValorPacoteCuradoria,
} from '@pecuaria/domain';
import {
  ErroAplicacao,
  type Alimento,
  type AtualizacaoCuradoria,
  type DadosValorValidados,
  type ImportacaoCuradoria,
  type ItemAtualizacaoCuradoria,
  type RegistroDetalhe,
  type ResultadoAtualizacaoCuradoria,
  type ResultadoImportacaoCuradoria,
  type ResumoPacoteCuradoria,
  type ValorNutricionalApi,
} from '@pecuaria/shared-types';
import {
  RepositorioComposicao,
  RepositorioCuradoria,
  type GerenciadorBanco,
} from '@pecuaria/database';
import {
  BaseServicoAlimentos,
  invalido,
  type OpcoesServicoAlimentos,
  type ServicoAlimentos,
} from './servico-alimentos';
import type { ServicoComposicao } from './servico-composicao';

/** Campos de identidade que precisam coincidir para reaproveitar um alimento já cadastrado. */
const IDENTIDADE = [
  'especie',
  'cultivar',
  'partePlanta',
  'formaConservacao',
  'processamento',
  'classe',
] as const;

/** Campos da fonte que o pacote define; a atualização só mexe neles. */
const CAMPOS_FONTE = [
  'titulo',
  'autores',
  'ano',
  'edicaoVersao',
  'instituicaoEditora',
  'isbnDoiUrl',
  'dataAcesso',
  'observacoes',
] as const;

/** Campos de um valor comparados na atualização (o pacote não tem DP, mínimo, máximo nem página). */
const CAMPOS_VALOR: readonly [keyof ValorPacoteCuradoria & keyof ValorNutricionalApi, string][] = [
  ['valorPublicado', 'valor publicado'],
  ['unidade', 'unidade'],
  ['nObservacoes', 'número de observações'],
  ['metodoAnaliticoFonte', 'método'],
  ['formaObtencao', 'forma de obtenção'],
  ['descricaoObtencao', 'descrição da obtenção'],
  ['interpretacaoBase', 'interpretação da base'],
  ['observacao', 'observação'],
];

const chaveValor = (codigo: string, tipo: string, base: string) =>
  `${normalizarCodigo(codigo)}|${tipo}|${base}`;

/**
 * Pacotes de curadoria (Fase 5B-2). Importar é ação do usuário: cria (ou reaproveita) a fonte e os
 * alimentos e grava cada registro pelos mesmos serviços do cadastro manual, com as mesmas
 * conferências; ao fim, cada registro fica "transcrito" em nome de quem transcreveu o pacote e
 * espera a conferência do usuário. Nada é conferido automaticamente; tudo numa transação.
 * Versão nova de um pacote já importado entra por atualização (aprovação da 5C), nunca por nova
 * importação: os registros são casados pela página ou tabela e corrigidos com trilha, sem duplicar.
 */
export class ServicoCuradoria extends BaseServicoAlimentos {
  private readonly importacoes: RepositorioCuradoria;

  constructor(
    banco: GerenciadorBanco,
    private readonly alimentos: ServicoAlimentos,
    private readonly composicao: ServicoComposicao,
    private readonly pacotes: readonly PacoteCuradoria[],
    opcoes: OpcoesServicoAlimentos = {},
  ) {
    super(banco, opcoes);
    this.importacoes = new RepositorioCuradoria(() => banco.conexao);
  }

  listar(): ResumoPacoteCuradoria[] {
    const todas = this.importacoes.listar();
    return this.pacotes.map((p) => {
      const importacao = this.importacoes.obter(p.codigo, p.versao);
      const versoes = todas.filter((i) => i.pacoteCodigo === p.codigo).map((i) => i.pacoteVersao);
      const resumo = importacao ? this.importacoes.resumo(importacao.id) : {};
      return {
        codigo: p.codigo,
        versao: p.versao,
        titulo: p.titulo,
        descricao: p.descricao,
        transcritoPor: p.transcritoPor,
        fonte: {
          codigo: p.fonte.codigo,
          titulo: p.fonte.titulo,
          autores: p.fonte.autores,
          ano: p.fonte.ano,
          edicaoVersao: p.fonte.edicaoVersao,
          isbnDoiUrl: p.fonte.isbnDoiUrl,
          dataAcesso: p.fonte.dataAcesso,
        },
        alimentos: p.alimentos.map((a) => {
          const regs = registrosImportaveis(p).filter((r) => r.alimento === a.chave);
          return {
            nome: a.nome,
            registros: regs.length,
            valores: regs.reduce((s, r) => s + r.valores.length, 0),
            bloqueados: p.registros.filter((r) => r.alimento === a.chave && r.bloqueio !== null)
              .length,
          };
        }),
        bloqueados: p.registros
          .filter((r) => r.bloqueio !== null)
          .map((r) => ({
            alimento: this.nomeAlimento(p, r),
            referenciaLocal: r.referenciaLocal,
            motivo: r.bloqueio!,
          })),
        nutrientes: [...new Set(p.registros.flatMap((r) => r.valores.map((v) => v.nutriente)))],
        contagem: contarPacote(p),
        importacao,
        versaoImportada: versoes.length ? Math.max(...versoes) : null,
        atualizacao: (resumo['atualizacao'] as AtualizacaoCuradoria | undefined) ?? null,
      };
    });
  }

  importar(codigo: string, versao: number): ResultadoImportacaoCuradoria {
    const p = this.pacote(codigo, versao);
    const importacao = this.transacao(() => {
      if (this.importacoes.obter(p.codigo, p.versao))
        invalido('Este pacote já foi importado. Os registros estão no banco de alimentos.');
      // Versões do mesmo pacote trazem os mesmos registros: importar outra duplicaria tudo.
      const outra = this.importacoes.listar().find((i) => i.pacoteCodigo === p.codigo);
      if (outra)
        invalido(
          `A versão ${outra.pacoteVersao} deste pacote já foi importada. Use "Atualizar": os registros existentes são corrigidos com trilha, sem duplicar.`,
        );
      const porCodigo = this.conferirPacote(p);

      const fonteId = this.fonteDoPacote(p);
      const importaveis = registrosImportaveis(p);
      const { ids: alimentosIds, criados } = this.alimentosDoPacote(
        p,
        new Set(importaveis.map((r) => r.alimento)),
      );
      const registros = importaveis.map((r) =>
        this.criarRegistro(p, r, alimentosIds.get(r.alimento)!, fonteId, porCodigo),
      );
      const porReferencia = new Map(importaveis.map((r, i) => [r.referenciaLocal, registros[i]!]));
      const vinculos = this.criarVinculos(p, porReferencia, new Set());
      const resolvidos = this.resolverPendentes();

      const contagem = contarPacote(p);
      const i: ImportacaoCuradoria = {
        id: this.gerarId(),
        pacoteCodigo: p.codigo,
        pacoteVersao: p.versao,
        fonteId,
        nAlimentosCriados: criados,
        nRegistros: contagem.registros,
        nValores: contagem.valores,
        importadoEm: this.agora(),
      };
      const resumo = {
        fonteId,
        alimentos: Object.fromEntries(alimentosIds),
        registros,
        vinculos,
        vinculosResolvidosDeOutrosPacotes: resolvidos,
        bloqueados: p.registros
          .filter((r) => r.bloqueio !== null)
          .map((r) => ({ referenciaLocal: r.referenciaLocal, motivo: r.bloqueio })),
      };
      this.importacoes.inserir(i, resumo, this.agora());
      this.auditar('importacao_curadoria', i.id, 'importacao', null, { ...i, ...resumo });
      return i;
    });
    const registros = new RepositorioComposicao(() => this.banco.conexao).listar({
      alimentoId: null,
      fonteId: importacao.fonteId,
      status: null,
      origem: null,
      propriedadeId: null,
      somenteDaPropriedade: false,
    });
    return { importacao, registros };
  }

  /**
   * Leva um pacote já importado para a versão nova (SITUACOES_ATUALIZACAO). Só a fonte e os
   * registros que o pacote importou são tocados; o que o usuário está editando, rejeitou ou
   * descartou fica como está, com as mudanças listadas. Conferido nunca muda: recebe versão nova.
   */
  atualizar(codigo: string, versao: number): ResultadoAtualizacaoCuradoria {
    const p = this.pacote(codigo, versao);
    return this.transacao(() => {
      if (this.importacoes.obter(p.codigo, p.versao))
        invalido('Esta versão do pacote já está no banco.');
      const anteriores = this.importacoes.listar().filter((i) => i.pacoteCodigo === p.codigo);
      if (!anteriores.length)
        invalido('Nenhuma versão deste pacote foi importada: use "Importar para conferência".');
      const ultima = anteriores.reduce((a, b) => (b.pacoteVersao > a.pacoteVersao ? b : a));
      if (ultima.pacoteVersao > p.versao)
        invalido(`A versão ${ultima.pacoteVersao}, mais nova, já foi importada.`);
      const porCodigo = this.conferirPacote(p);
      const fonteId = ultima.fonteId;
      const fonteAlterada = this.atualizarFonte(p, fonteId, ultima.pacoteVersao);
      const motivo = `Atualização do pacote ${p.codigo} da versão ${ultima.pacoteVersao} para a ${p.versao}.`;

      // Registro vigente (última versão da cadeia) de cada página ou tabela já importada.
      const vigentes = new Map<string, RegistroDetalhe>();
      for (const i of anteriores)
        for (const id of (this.importacoes.resumo(i.id)['registros'] as string[] | undefined) ??
          []) {
          let d = this.composicao.obter(id);
          const raiz = d.registro.referenciaLocal ?? '';
          while (d.registro.sucessorId) d = this.composicao.obter(d.registro.sucessorId);
          vigentes.set(raiz, d);
        }

      const novos = registrosImportaveis(p).filter((r) => !vigentes.has(r.referenciaLocal));
      const { ids: alimentosIds, criados } = this.alimentosDoPacote(
        p,
        new Set(novos.map((r) => r.alimento)),
      );
      const itens: ItemAtualizacaoCuradoria[] = [];
      const atuais = new Map<string, string>();
      for (const r of p.registros) {
        const atual = vigentes.get(r.referenciaLocal);
        const item = (
          situacao: ItemAtualizacaoCuradoria['situacao'],
          registroId: string | null,
          mudancas: string[],
        ) =>
          itens.push({
            referenciaLocal: r.referenciaLocal,
            alimento: this.nomeAlimento(p, r),
            situacao,
            registroId,
            mudancas,
          });
        if (r.bloqueio !== null) {
          if (atual) item('bloqueado_ja_importado', atual.registro.id, [r.bloqueio]);
          continue;
        }
        if (!atual) {
          const id = this.criarRegistro(p, r, alimentosIds.get(r.alimento)!, fonteId, porCodigo);
          atuais.set(r.referenciaLocal, id);
          item('novo', id, []);
          continue;
        }
        atuais.set(r.referenciaLocal, atual.registro.id);
        const mudancas = this.diferencas(atual, r);
        const reg = atual.registro;
        if (!mudancas.length) item('sem_mudanca', reg.id, []);
        else if (reg.descartadoEm) item('mantido_descartado', reg.id, mudancas);
        else if (reg.status === 'rejeitado') item('mantido_rejeitado', reg.id, mudancas);
        else if (reg.status === 'conferido') {
          const nova = this.composicao.novaVersao(reg.id, motivo);
          this.aplicar(nova, r, porCodigo);
          this.composicao.transcrever(nova.registro.id, p.transcritoPor);
          atuais.set(r.referenciaLocal, nova.registro.id);
          item('nova_versao', nova.registro.id, mudancas);
        } else if (reg.status === 'transcrito' && reg.transcritoPor === p.transcritoPor) {
          this.composicao.devolver(reg.id, motivo);
          this.aplicar(this.composicao.obter(reg.id), r, porCodigo);
          this.composicao.transcrever(reg.id, p.transcritoPor);
          item('atualizado', reg.id, mudancas);
        } else item('mantido_em_edicao', reg.id, mudancas);
      }
      const doPacote = new Set(p.registros.map((r) => r.referenciaLocal));
      for (const [referencia, d] of vigentes)
        if (!doPacote.has(referencia))
          itens.push({
            referenciaLocal: referencia,
            alimento: d.registro.alimentoNome,
            situacao: 'fora_da_versao',
            registroId: d.registro.id,
            mudancas: [],
          });

      // Vínculos que a versão nova declara e que nenhuma versão do registro ainda tem.
      const existentes = new Set<string>();
      for (const [referencia, id] of atuais)
        for (const v of this.composicao.vinculos.porRegistros(this.idsDasCadeias([id])))
          existentes.add(
            `${referencia}|${v.alvoFonteCodigo}|${v.alvoReferenciaLocal}|${v.relacao}`,
          );
      // Como na importação, o vínculo aponta para a primeira versão e vale para a cadeia toda.
      const raizes = new Map(
        [...atuais].map(([referencia, id]) => [referencia, this.idsDasCadeias([id]).at(-1)!]),
      );
      const vinculos = this.criarVinculos(p, raizes, existentes);
      const resolvidos = this.resolverPendentes();

      const contagem = contarPacote(p);
      const atualizacao: AtualizacaoCuradoria = {
        deVersao: ultima.pacoteVersao,
        fonteAlterada,
        itens,
      };
      const i: ImportacaoCuradoria = {
        id: this.gerarId(),
        pacoteCodigo: p.codigo,
        pacoteVersao: p.versao,
        fonteId,
        nAlimentosCriados: criados,
        nRegistros: contagem.registros,
        nValores: contagem.valores,
        importadoEm: this.agora(),
      };
      const resumo = {
        fonteId,
        alimentos: Object.fromEntries(alimentosIds),
        registros: [...atuais.values()],
        vinculos,
        vinculosResolvidosDeOutrosPacotes: resolvidos,
        atualizacao,
      };
      this.importacoes.inserir(i, resumo, this.agora());
      this.auditar('importacao_curadoria', i.id, 'atualizacao', null, { ...i, ...resumo }, motivo);
      return { importacao: i, atualizacao };
    });
  }

  private pacote(codigo: string, versao: number): PacoteCuradoria {
    const p = this.pacotes.find((x) => x.codigo === codigo && x.versao === versao);
    if (!p) throw new ErroAplicacao('NAO_ENCONTRADO', 'Pacote de curadoria não encontrado.');
    return p;
  }

  private nomeAlimento(p: PacoteCuradoria, r: RegistroPacoteCuradoria): string {
    return p.alimentos.find((a) => a.chave === r.alimento)?.nome ?? r.alimento;
  }

  /** Recusa pacote incoerente; devolve o id de cada definição pelo código. */
  private conferirPacote(p: PacoteCuradoria): Map<string, string> {
    const catalogo = this.repo.listarNutrientes(false);
    const problemas = problemasDoPacote(p, new Set(catalogo.map((n) => n.codigo)));
    if (problemas.length) invalido(`Pacote incoerente: ${problemas.join(' ')}`);
    return new Map(catalogo.map((n) => [n.codigo.toUpperCase(), n.id]));
  }

  /** Alimentos usados (reaproveitados ou criados); alimento só com registros bloqueados não é criado. */
  private alimentosDoPacote(
    p: PacoteCuradoria,
    usados: ReadonlySet<string>,
  ): { ids: Map<string, string>; criados: number } {
    const ids = new Map<string, string>();
    let criados = 0;
    for (const a of p.alimentos.filter((x) => usados.has(x.chave))) {
      const existente = this.repo.alimentoPorNome(normalizarNome(a.nome));
      if (existente) {
        this.conferirIdentidade(a, existente);
        ids.set(a.chave, existente.id);
      } else {
        const { chave: _chave, ...dados } = a;
        ids.set(a.chave, this.alimentos.criarAlimento({ ...dados, comercial: false }).id);
        criados++;
      }
    }
    return { ids, criados };
  }

  private dadosValor(v: ValorPacoteCuradoria, porCodigo: Map<string, string>): DadosValorValidados {
    return {
      nutrienteId: porCodigo.get(v.nutriente.toUpperCase())!,
      valorPublicado: v.valorPublicado,
      unidade: v.unidade,
      base: v.base,
      tipoValor: v.tipoValor,
      desvioPadraoPublicado: null,
      minimoPublicado: null,
      maximoPublicado: null,
      nObservacoes: v.nObservacoes,
      metodoAnaliticoFonte: v.metodoAnaliticoFonte,
      formaObtencao: v.formaObtencao,
      descricaoObtencao: v.descricaoObtencao,
      interpretacaoBase: v.interpretacaoBase,
      referenciaLocal: null,
      observacao: v.observacao,
    };
  }

  /** Grava um registro do pacote e o deixa transcrito em nome de quem transcreveu o pacote. */
  private criarRegistro(
    p: PacoteCuradoria,
    r: RegistroPacoteCuradoria,
    alimentoId: string,
    fonteId: string,
    porCodigo: Map<string, string>,
  ): string {
    const criado = this.composicao.criar({
      alimentoId,
      fonteId,
      referenciaLocal: r.referenciaLocal,
      idadeCorteDias: r.idadeCorteDias,
      classeIdadeFonte: r.classeIdadeFonte,
      aditivoEnsilagem: null,
      regiao: null,
      estacao: null,
      adubacao: null,
      outrasCondicoes: null,
      nObservacoes: null,
      separadorDecimal: r.separadorDecimal,
      dataAmostra: null,
      identificacaoAmostra: null,
      observacoes: r.observacoes,
    });
    for (const v of r.valores)
      this.composicao.salvarValor(criado.registro.id, null, this.dadosValor(v, porCodigo));
    this.composicao.transcrever(criado.registro.id, p.transcritoPor);
    return criado.registro.id;
  }

  /** O que o pacote muda no registro do banco, campo a campo (vazio: nada). */
  private diferencas(d: RegistroDetalhe, r: RegistroPacoteCuradoria): string[] {
    const m: string[] = [];
    const reg = d.registro;
    if (reg.idadeCorteDias !== r.idadeCorteDias) m.push('Registro: idade de corte');
    if (reg.classeIdadeFonte !== r.classeIdadeFonte) m.push('Registro: classe de idade da fonte');
    if (reg.separadorDecimal !== r.separadorDecimal) m.push('Registro: separador decimal');
    if (reg.observacoes !== r.observacoes) m.push('Registro: observações');
    const banco = new Map(
      d.valores.map((v) => [chaveValor(v.nutriente.codigo, v.tipoValor, v.base), v]),
    );
    const pacote = new Map(r.valores.map((v) => [chaveValor(v.nutriente, v.tipoValor, v.base), v]));
    for (const [k, v] of pacote) {
      const b = banco.get(k);
      if (!b) {
        m.push(`${v.nutriente}: valor novo`);
        continue;
      }
      const campos = CAMPOS_VALOR.filter(([c]) => (b[c] ?? null) !== (v[c] ?? null)).map(
        ([, rotulo]) => rotulo,
      );
      if (b.desvioPadraoPublicado || b.minimoPublicado || b.maximoPublicado || b.referenciaLocal)
        campos.push('estatísticas ou página fora do pacote');
      if (campos.length) m.push(`${v.nutriente}: ${campos.join(', ')}`);
    }
    for (const [k, b] of banco)
      if (!pacote.has(k)) m.push(`${b.nutriente.codigo}: fora da versão nova (removido)`);
    return m;
  }

  /** Leva o registro (editável, em rascunho) ao conteúdo do pacote; cada passo vai ao histórico. */
  private aplicar(
    d: RegistroDetalhe,
    r: RegistroPacoteCuradoria,
    porCodigo: Map<string, string>,
  ): void {
    const reg = d.registro;
    if (
      reg.idadeCorteDias !== r.idadeCorteDias ||
      reg.classeIdadeFonte !== r.classeIdadeFonte ||
      reg.separadorDecimal !== r.separadorDecimal ||
      reg.observacoes !== r.observacoes
    )
      this.composicao.atualizar(reg.id, {
        alimentoId: reg.alimentoId,
        fonteId: reg.fonte.id,
        referenciaLocal: reg.referenciaLocal,
        idadeCorteDias: r.idadeCorteDias,
        classeIdadeFonte: r.classeIdadeFonte,
        aditivoEnsilagem: reg.aditivoEnsilagem,
        regiao: reg.regiao,
        estacao: reg.estacao,
        adubacao: reg.adubacao,
        outrasCondicoes: reg.outrasCondicoes,
        nObservacoes: reg.nObservacoes,
        separadorDecimal: r.separadorDecimal,
        dataAmostra: reg.dataAmostra,
        identificacaoAmostra: reg.identificacaoAmostra,
        observacoes: r.observacoes,
      });
    const banco = new Map(
      d.valores.map((v) => [chaveValor(v.nutriente.codigo, v.tipoValor, v.base), v]),
    );
    const pacote = new Set<string>();
    for (const v of r.valores) {
      const k = chaveValor(v.nutriente, v.tipoValor, v.base);
      pacote.add(k);
      const b = banco.get(k);
      const igual =
        b &&
        CAMPOS_VALOR.every(([c]) => (b[c] ?? null) === (v[c] ?? null)) &&
        !b.desvioPadraoPublicado &&
        !b.minimoPublicado &&
        !b.maximoPublicado &&
        !b.referenciaLocal;
      if (!igual) this.composicao.salvarValor(reg.id, b?.id ?? null, this.dadosValor(v, porCodigo));
    }
    for (const [k, b] of banco) if (!pacote.has(k)) this.composicao.removerValor(reg.id, b.id);
  }

  /** Campos da fonte que o pacote mudou, aplicados com trilha; vazio se nada mudou. */
  private atualizarFonte(p: PacoteCuradoria, fonteId: string, deVersao: number): string[] {
    const f = this.alimentos.obterFonte(fonteId).fonte;
    const mudados = CAMPOS_FONTE.filter((c) => f[c] !== p.fonte[c]);
    if (!mudados.length) return [];
    if (f.excluidaEm) invalido('A fonte do pacote foi excluída: restaure-a antes de atualizar.');
    this.alimentos.atualizarFonte(
      fonteId,
      {
        origem: f.origem as PacoteCuradoria['fonte']['origem'],
        codigo: f.codigo,
        titulo: p.fonte.titulo,
        autores: p.fonte.autores,
        ano: p.fonte.ano,
        edicaoVersao: p.fonte.edicaoVersao,
        instituicaoEditora: p.fonte.instituicaoEditora,
        isbnDoiUrl: p.fonte.isbnDoiUrl,
        dataAcesso: p.fonte.dataAcesso,
        experimentoOrigem: f.experimentoOrigem,
        laboratorio: f.laboratorio,
        numeroLaudo: f.numeroLaudo,
        dataLaudo: f.dataLaudo,
        fabricante: f.fabricante,
        registroProduto: f.registroProduto,
        metodoMedicao: f.metodoMedicao,
        limitacoesMedicao: f.limitacoesMedicao,
        propriedadeId: f.propriedadeId,
        observacoes: p.fonte.observacoes,
      },
      `Atualização do pacote ${p.codigo} da versão ${deVersao} para a ${p.versao}.`,
    );
    return [...mudados];
  }

  /** Ids de todas as versões (anteriores e seguintes) dos registros dados. */
  private idsDasCadeias(ids: readonly string[]): string[] {
    const todos = new Set<string>();
    for (const id of ids) {
      let d = this.composicao.obter(id);
      todos.add(d.registro.id);
      while (d.registro.substituiId) {
        d = this.composicao.obter(d.registro.substituiId);
        todos.add(d.registro.id);
      }
    }
    return [...todos];
  }

  /**
   * Vínculos declarados pelo pacote; o outro lado é resolvido se já estiver no banco. Os que já
   * existem em alguma versão do registro (página|alvo|página do alvo|relação) não são recriados.
   */
  private criarVinculos(
    p: PacoteCuradoria,
    porReferencia: Map<string, string>,
    existentes: ReadonlySet<string>,
  ): string[] {
    const vinc = this.composicao.vinculos;
    const ids: string[] = [];
    for (const v of p.vinculos) {
      const alvo = normalizarCodigo(v.outraFonte);
      if (existentes.has(`${v.registro}|${alvo}|${v.outroRegistro}|${v.relacao}`)) continue;
      const registroId = porReferencia.get(v.registro);
      if (!registroId) continue;
      const id = this.gerarId();
      vinc.inserir(
        id,
        {
          registroId,
          alvoFonteCodigo: alvo,
          alvoReferenciaLocal: v.outroRegistro,
          relacao: v.relacao,
          evidencia: v.evidencia,
          pacoteCodigo: p.codigo,
        },
        this.agora(),
      );
      this.auditar('vinculo_registro', id, 'criacao', null, vinc.obter(id));
      ids.push(id);
    }
    return ids;
  }

  /** Vínculos ainda sem o outro lado (deste ou de pacotes anteriores) cujo alvo já está no banco. */
  private resolverPendentes(): string[] {
    const vinc = this.composicao.vinculos;
    const resolvidos: string[] = [];
    for (const v of vinc.pendentes()) {
      const alvo = vinc.localizarAlvo(v.alvoFonteCodigo, v.alvoReferenciaLocal);
      if (!alvo || alvo === v.registroId) continue;
      vinc.resolver(v.id, alvo, this.agora());
      this.auditar(
        'vinculo_registro',
        v.id,
        'vinculacao',
        { relacionadoId: null },
        {
          relacionadoId: alvo,
        },
      );
      resolvidos.push(v.id);
    }
    return resolvidos;
  }

  /**
   * Fonte com o código do pacote: reaproveitada se já cadastrada como publicação do mesmo tipo
   * (o usuário pode tê-la criado à mão); senão, criada com os dados do pacote.
   */
  private fonteDoPacote(p: PacoteCuradoria): string {
    const existente = this.repo.fontePorCodigo(p.fonte.codigo, null);
    if (existente) {
      if (existente.origem !== p.fonte.origem)
        invalido(
          `Já existe a fonte ${p.fonte.codigo} com outra origem. Corrija o código dela antes de importar.`,
        );
      return existente.id;
    }
    return this.alimentos.criarFonte({
      ...p.fonte,
      experimentoOrigem: null,
      laboratorio: null,
      numeroLaudo: null,
      dataLaudo: null,
      fabricante: null,
      registroProduto: null,
      metodoMedicao: null,
      limitacoesMedicao: null,
      propriedadeId: null,
    }).id;
  }

  /** Alimento de mesmo nome só é reaproveitado com a mesma identidade; senão, nada é importado. */
  private conferirIdentidade(a: PacoteCuradoria['alimentos'][number], existente: Alimento): void {
    const diferentes: string[] = IDENTIDADE.filter((c) => a[c] !== existente[c]);
    if (existente.comercial) diferentes.push('comercial');
    if (diferentes.length)
      invalido(
        `Já existe o alimento "${existente.nome}" com outra identidade (${diferentes.join(', ')}). Renomeie-o antes de importar.`,
      );
  }
}
