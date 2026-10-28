import {
  calcularBalanco,
  calcularMinerais,
  calcularOferta,
  calcularProteina,
  exigenciasParaBalanco,
  fonteCmsDaOferta,
  q,
  type Categoria,
  type ItemDieta,
  type PerfilOferta,
  type ValorPerfilOferta,
} from '@pecuaria/nutrition-engine';
import type { NaturezaValor } from '@pecuaria/domain';
import type {
  AvaliacaoDietaCalculada,
  EntradaAvaliacaoDieta,
  EntradaExigencias,
  FonteDoPerfil,
  HipotesesAvaliacao,
  PerfilAvaliado,
  PerfilDetalhe,
  PerfilParaDieta,
  RegistroDetalhe,
} from '@pecuaria/shared-types';
import type { ServicoAlimentos } from '../alimentos/servico-alimentos';
import type { ServicoComposicao } from '../alimentos/servico-composicao';
import type { ServicoSelecao } from '../alimentos/servico-selecao';
import type { ServicoExigencias } from './servico-exigencias';
import { hashDoRetrato, partesDoRetrato, situacaoDoCalculo } from './retrato-avaliacao';

/*
 * Fase 6B-3: avaliação de dieta com perfis gravados (Fase 5D). Lê os perfis do banco, decide a
 * elegibilidade de cada um e entrega ao motor a composição como publicada, com origem, base e
 * avaliação científica. Nada é gravado aqui (a gravação imutável é do ServicoRegistroAvaliacao, 6B-4) e nada é importado.
 *
 * Elegível (D-6B1-05): perfil gravado com a versão vigente da regra de seleção, aprovada (hash
 * conferido); todos os registros de origem conferidos, não substituídos e não descartados.
 * "Uso com cautela" não bloqueia: vira aviso. Base interpretada só vale validada (C7).
 *
 * PB equivalente de NNP (D-6B1-04, migration 0018): pela natureza do valor gravada na definição do
 * nutriente, nunca pelo nome ou código. A parcela de NNP fica contida na PB total.
 */

const TEXTO_TIPO: Record<EntradaAvaliacaoDieta['dieta']['tipo'], string> = {
  oferecido: 'Quantidade oferecida no cocho, não consumo: o balanço não conclui (D-6B3-04).',
  consumo_observado: 'Consumo observado: oferecido menos as sobras medidas de cada alimento.',
  consumo_assumido_sem_sobras:
    'Consumo assumido igual ao oferecido, sem sobras: simulação, não consumo medido.',
};
const ROTULO_CMS: Record<EntradaAvaliacaoDieta['cmsPrevisto']['fonte'], string> = {
  confinamento: 'equação de confinamento',
  concentrado: 'equação com o teor de concentrado',
  pasto: 'equação de pasto com suplemento',
  terminacao_intensiva_pasto: 'equação de terminação intensiva a pasto',
};

/** Nutrientes pedidos à oferta: os do balanço que podem vir da composição (C-6B-02 a 04). */
const NUTRIENTES_OFERTA = ['NDT', 'PB', 'Ca', 'P', 'Mg', 'Na', 'K', 'S'] as const;

interface PerfilLido {
  avaliado: PerfilAvaliado;
  oferta: PerfilOferta;
}

export class ServicoAvaliacaoDieta {
  constructor(
    private readonly selecao: ServicoSelecao,
    private readonly composicao: ServicoComposicao,
    private readonly alimentos: ServicoAlimentos,
    private readonly exigencias: ServicoExigencias,
  ) {}

  /**
   * Perfis gravados com a elegibilidade de agora (6B-5, seletor da tela): os inelegíveis vêm com
   * os motivos, para a tela explicar por que não podem ser escolhidos.
   */
  perfisParaDieta(): PerfilParaDieta[] {
    const { codigos, naturezas } = this.definicoes();
    const regras = this.selecao.regras();
    return this.selecao.listarPerfis(null).map((r) => {
      const {
        valores,
        naoQuantificados: _nq,
        ...a
      } = this.lerPerfil(this.selecao.obterPerfil(r.id), codigos, naturezas, regras).avaliado;
      return { ...a, nutrientes: [...new Set(valores.map((v) => v.nutriente))] };
    });
  }

  private definicoes() {
    const nutrientes = this.alimentos.listarNutrientes(true);
    return {
      codigos: new Map(nutrientes.map((n) => [n.id, n.codigo])),
      naturezas: new Map(nutrientes.map((n) => [n.id, n.naturezaValor])),
    };
  }

  avaliar(entrada: EntradaAvaliacaoDieta): AvaliacaoDietaCalculada {
    const { codigos, naturezas } = this.definicoes();
    const regras = this.selecao.regras();
    const lidos = new Map<string, PerfilLido>();
    for (const i of entrada.dieta.itens)
      if (!lidos.has(i.perfilId))
        lidos.set(
          i.perfilId,
          this.lerPerfil(this.selecao.obterPerfil(i.perfilId), codigos, naturezas, regras),
        );

    const itens: ItemDieta[] = entrada.dieta.itens.map((i, k) => {
      const unidade = i.base === 'mn' ? 'kg MN/dia' : 'kg MS/dia';
      return {
        itemId: `item-${k + 1}`,
        perfil: lidos.get(i.perfilId)!.oferta,
        quantidade: q(i.quantidadeKgDia, unidade),
        ...(i.sobrasKgDia === null ? {} : { sobras: q(i.sobrasKgDia, unidade) }),
      };
    });
    const oferta = calcularOferta({
      tipo: entrada.dieta.tipo,
      itens,
      nutrientes: NUTRIENTES_OFERTA,
    });

    const a = entrada.animal;
    const c: Categoria = { grupo: a.grupo, sexo: a.sexo, sistema: a.sistema };
    const PC = q(a.pcKg, 'kg');
    const GMD = q(a.gmdKgDia, 'kg/dia');
    // Exigência com a MS consumida como CMS; dieta só oferecida: CMS previsto, identificado.
    const consumida = fonteCmsDaOferta(oferta);
    const cmsExigencia: EntradaExigencias['cms'] =
      consumida && consumida.origem === 'informado' && consumida.CMS
        ? { fonte: 'informado', cmsKgDia: consumida.CMS.valor }
        : entrada.cmsPrevisto;
    const daMsConsumida = cmsExigencia.fonte === 'informado';
    const hipoteses: HipotesesAvaliacao = {
      tipoQuantidade: entrada.dieta.tipo,
      cmsExigencia: { origem: daMsConsumida ? 'ms_consumida' : 'cms_previsto', cms: cmsExigencia },
      gmd: 'desejado',
      textos: [
        TEXTO_TIPO[entrada.dieta.tipo],
        daMsConsumida
          ? 'Exigências calculadas com a MS consumida como CMS informado.'
          : `Exigências calculadas com o CMS previsto (${ROTULO_CMS[entrada.cmsPrevisto.fonte]}): a dieta é só oferecida ou a MS consumida não é conhecida.`,
        'CMS previsto mostrado à parte, nunca no lugar do consumo (C-6B-01).',
        'GMD desejado (planejado), informado pelo usuário; não é o GMD observado nas pesagens.',
        'Composição dos perfis gravados, como publicada; ausente, traço e não quantificado não viram zero.',
      ],
    };
    const exigencias = this.exigencias.calcular({ ...a, cms: cmsExigencia });
    const previsto = this.exigencias.calcular({ ...a, cms: entrada.cmsPrevisto });
    const proteina = calcularProteina(c, { PC, GMD, cms: this.fonteMotor(cmsExigencia) });
    const balanco = calcularBalanco(
      exigenciasParaBalanco(proteina, calcularMinerais(c, { PC, GMD })),
      oferta,
    );
    const perfis = [...lidos.values()].map((p) => p.avaliado);
    const calculo = {
      fonte: exigencias.fonte,
      versaoMotor: exigencias.versaoMotor,
      entrada,
      hipoteses,
      cmsPrevisto: previsto.grupos.cms[0]!,
      exigencias,
      perfis,
      oferta,
      balanco,
      situacao: situacaoDoCalculo(perfis, balanco),
    };
    // D-6B4-02: hash do retrato que seria gravado, para a tela devolver ao gravar.
    try {
      return {
        ...calculo,
        conteudoSha256: hashDoRetrato(partesDoRetrato(calculo)),
        naoGravavel: null,
      };
    } catch (e) {
      return {
        ...calculo,
        conteudoSha256: null,
        naoGravavel: `O retrato não cabe em JSON sem perda: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  private fonteMotor(cms: EntradaExigencias['cms']) {
    switch (cms.fonte) {
      case 'confinamento':
        return { origem: 'previsto', equacao: 'confinamento' } as const;
      case 'concentrado':
        return { origem: 'previsto', equacao: 'concentrado', NC: q(cms.ncPctMs, '% MS') } as const;
      case 'pasto':
        return { origem: 'previsto', equacao: 'pasto', CMSs: q(cms.cmssKgDia, 'kg/dia') } as const;
      case 'terminacao_intensiva_pasto':
        return { origem: 'previsto', equacao: 'terminacao_intensiva_pasto' } as const;
      case 'informado':
        return { origem: 'informado', CMS: q(cms.cmsKgDia, 'kg/dia') } as const;
    }
  }

  private lerPerfil(
    p: PerfilDetalhe,
    codigos: ReadonlyMap<string, string>,
    naturezas: ReadonlyMap<string, NaturezaValor>,
    regras: ReturnType<ServicoSelecao['regras']>,
  ): PerfilLido {
    const motivos: string[] = [];
    const avisos: string[] = [];

    // Regra: aprovada (hash conferido) e na versão vigente.
    const mesmas = regras.filter((r) => r.regra.codigo === p.perfil.regraCodigo);
    const vigente = Math.max(0, ...mesmas.map((r) => r.regra.versao));
    const regra = mesmas.find((r) => r.regra.versao === p.perfil.regraVersao);
    if (!regra?.aprovacao)
      motivos.push(
        `Regra de seleção ${p.perfil.regraCodigo} v${p.perfil.regraVersao} sem aprovação válida.`,
      );
    if (p.perfil.regraVersao !== vigente)
      motivos.push(
        `Perfil gravado com versão histórica da regra (v${p.perfil.regraVersao}; vigente v${vigente}): grave um perfil novo.`,
      );

    // Registros de origem: conferidos, não substituídos, não descartados.
    const ids = new Set<string>(p.valores.flatMap((v) => v.origens.map((o) => o.registroId)));
    if (p.registroBaseId) ids.add(p.registroBaseId);
    const registros = new Map<string, RegistroDetalhe>();
    for (const id of ids) registros.set(id, this.composicao.obter(id));
    const fontes: FonteDoPerfil[] = [];
    for (const [id, d] of registros) {
      const r = d.registro;
      fontes.push({
        registroId: id,
        fonteTitulo: d.fonte.titulo,
        fonteCodigo: d.fonte.codigo,
        referenciaLocal: r.referenciaLocal,
        statusRegistro: r.status,
      });
      const qual = `Registro de ${d.fonte.titulo}${r.referenciaLocal ? `, ${r.referenciaLocal}` : ''}`;
      if (r.descartadoEm) motivos.push(`${qual} descartado.`);
      else if (r.status === 'substituido')
        motivos.push(
          `${qual} substituído por versão nova: o perfil está desatualizado; grave um perfil novo.`,
        );
      else if (r.status !== 'conferido') motivos.push(`${qual} não conferido (${r.status}).`);
      else if (r.sucessorId) avisos.push(`${qual} tem versão nova em conferência.`);
    }

    // Avaliação científica ativa: cautela vira aviso; base validada por valor de origem.
    const ativas = [...registros.values()].flatMap((d) =>
      d.avaliacoes.filter((x) => x.retiradoEm === null),
    );
    for (const x of ativas.filter((x) => x.tipo === 'uso_com_cautela'))
      avisos.push(`Uso com cautela: ${x.motivo}`);
    const validados = new Set(
      ativas.filter((x) => x.tipo === 'base_validada').map((x) => x.valorId),
    );
    for (const l of p.limitacoes) avisos.push(`Limitação do perfil: ${l}`);

    const valores: ValorPerfilOferta[] = p.valores.map((v) => ({
      valorId: v.id,
      nutriente: v.nutriente.codigo,
      naturezaValor: naturezas.get(v.nutriente.id) ?? 'fracao_massica',
      valor: v.valor,
      valorPublicado: v.valorPublicado,
      unidade: v.unidade,
      base: v.base,
      tipoValor: v.tipoValor,
      formaObtencao: v.formaObtencao,
      baseInferida: v.interpretacaoBase !== null,
      baseValidada:
        v.interpretacaoBase !== null && v.origens.every((o) => validados.has(o.valorNutricionalId)),
      origens: v.origens.map((o) => o.registroId),
    }));
    const naoQuantificados = p.naoQuantificados.map((n) => ({
      nutriente: codigos.get(n.nutrienteId) ?? n.nutrienteId,
      textoPublicado: n.textoPublicado,
      natureza: n.natureza,
    }));
    const elegivel = motivos.length === 0;
    return {
      avaliado: {
        perfilId: p.perfil.id,
        nome: p.perfil.nome,
        alimentoId: p.perfil.alimentoId,
        alimentoNome: p.perfil.alimentoNome,
        tipo: p.perfil.tipo,
        cenario: p.perfil.cenario,
        nivel: p.perfil.nivel,
        regra: {
          codigo: p.perfil.regraCodigo,
          versao: p.perfil.regraVersao,
          aprovadaEm: regra?.aprovacao?.aprovadoEm ?? null,
          vigente: p.perfil.regraVersao === vigente,
        },
        criadoEm: p.perfil.criadoEm,
        elegivel,
        motivosInelegibilidade: motivos,
        avisos,
        fontes,
        valores,
        naoQuantificados,
      },
      oferta: {
        perfilId: p.perfil.id,
        alimentoId: p.perfil.alimentoId,
        alimentoNome: p.perfil.alimentoNome,
        regra: { codigo: p.perfil.regraCodigo, versao: p.perfil.regraVersao },
        elegibilidade: { elegivel, motivos },
        cautelas: avisos,
        valores,
        naoQuantificados,
      },
    };
  }
}
