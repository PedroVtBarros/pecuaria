import { z } from 'zod';
import {
  APTIDOES_ANIMAL,
  APTIDOES_RACA,
  CATEGORIAS_ANIMAL,
  CONDICOES_SEXUAIS,
  ehDataIso,
  ESCALAS_ECC,
  FINALIDADES_LOTE,
  LIMITES_ESCALA_ECC,
  PARAMETROS_ALERTAS_PESAGEM_INICIAIS,
  validarParametrosAlertas,
  type EscalaEcc,
  GRUPOS_GENETICOS,
  limparTexto,
  METODOS_PESAGEM,
  ORIGENS_ANIMAL,
  PADRAO_UUID,
  PESO_VIVO_MAXIMO_KG,
  SEXOS,
  STATUS_ANIMAL,
  TIPOS_AREA,
  TIPOS_EXPLORACAO,
  TIPOS_SAIDA,
  UFS,
} from '@pecuaria/domain';

// ---------------------------------------------------------------------------
// Campos reutilizáveis. Validam formato e limites; regras entre campos ficam
// no núcleo (packages/domain) e nos serviços do processo principal.
// ---------------------------------------------------------------------------

/** Lista de opções com mensagem em português. */
function opcao<const T extends readonly [string, ...string[]]>(valores: T, rotulo: string) {
  return z.enum(valores, `Selecione ${rotulo}.`);
}

export const esquemaId = z.string().regex(PADRAO_UUID, 'Identificador inválido.');
export const esquemaIdOpcional = esquemaId.nullable();

export const esquemaData = z
  .string()
  .refine((v) => ehDataIso(v), 'Data inválida. Use uma data real no formato AAAA-MM-DD.');
export const esquemaDataOpcional = esquemaData.nullable();

/** Texto obrigatório: espaços extras removidos, não pode ficar vazio. */
export function textoObrigatorio(maximo: number, rotulo: string) {
  return z
    .string()
    .transform((v) => limparTexto(v) ?? '')
    .refine((v) => v.length > 0, `${rotulo} é obrigatório.`)
    .refine((v) => v.length <= maximo, `${rotulo} pode ter no máximo ${maximo} caracteres.`);
}

/** Texto opcional: vazio vira null. */
export function textoOpcional(maximo: number, rotulo: string) {
  return z
    .string()
    .nullable()
    .transform((v) => limparTexto(v))
    .refine(
      (v) => v === null || v.length <= maximo,
      `${rotulo} pode ter no máximo ${maximo} caracteres.`,
    );
}

function numeroPositivo(maximo: number, rotulo: string) {
  return z
    .number({
      error: (problema) =>
        problema.input === null || problema.input === undefined
          ? `${rotulo} é obrigatório.`
          : `${rotulo} deve ser um número.`,
    })
    .finite(`${rotulo} deve ser um número.`)
    .positive(`${rotulo} deve ser maior que zero.`)
    .max(maximo, `${rotulo} deve ser no máximo ${maximo.toLocaleString('pt-BR')}.`);
}

export const esquemaPesoVivoKg = numeroPositivo(PESO_VIVO_MAXIMO_KG, 'Peso vivo');

// ---------------------------------------------------------------------------
// Propriedade, área, raça
// ---------------------------------------------------------------------------

export const esquemaDadosPropriedade = z
  .object({
    nome: textoObrigatorio(120, 'Nome'),
    municipio: textoOpcional(120, 'Município'),
    uf: opcao(UFS, 'uma UF válida').nullable(),
    areaTotalHa: numeroPositivo(1_000_000, 'Área total').nullable(),
    tipoExploracao: opcao(TIPOS_EXPLORACAO, 'o tipo de exploração'),
    observacoes: textoOpcional(1000, 'Observações'),
  })
  .strict();
export type DadosPropriedade = z.input<typeof esquemaDadosPropriedade>;

export const esquemaDadosArea = z
  .object({
    nome: textoObrigatorio(80, 'Nome'),
    tipo: opcao(TIPOS_AREA, 'o tipo de área'),
    areaHa: numeroPositivo(1_000_000, 'Área').nullable(),
    observacoes: textoOpcional(1000, 'Observações'),
  })
  .strict();
export type DadosArea = z.input<typeof esquemaDadosArea>;

export const esquemaDadosRaca = z
  .object({
    nome: textoObrigatorio(60, 'Nome'),
    aptidao: opcao(APTIDOES_RACA, 'a aptidão'),
    grupoGenetico: opcao(GRUPOS_GENETICOS, 'o grupo genético'),
  })
  .strict();
export type DadosRaca = z.input<typeof esquemaDadosRaca>;

// ---------------------------------------------------------------------------
// Lote
// ---------------------------------------------------------------------------

export const esquemaDadosLote = z
  .object({
    nome: textoObrigatorio(80, 'Nome'),
    finalidade: opcao(FINALIDADES_LOTE, 'a finalidade'),
    dataFormacao: esquemaData,
    areaId: esquemaIdOpcional,
    observacoes: textoOpcional(1000, 'Observações'),
  })
  .strict();
export type DadosLote = z.input<typeof esquemaDadosLote>;

/** Na edição, a área muda por "mover lote", que registra histórico. */
export const esquemaEdicaoLote = esquemaDadosLote.omit({ areaId: true });
export type EdicaoLote = z.input<typeof esquemaEdicaoLote>;

// ---------------------------------------------------------------------------
// Animal
// ---------------------------------------------------------------------------

export const esquemaDadosAnimal = z
  .object({
    identificacao: textoObrigatorio(40, 'Identificação'),
    nome: textoOpcional(80, 'Nome'),
    sexo: opcao(SEXOS, 'o sexo'),
    condicaoSexual: opcao(CONDICOES_SEXUAIS, 'a condição sexual'),
    categoria: opcao(CATEGORIAS_ANIMAL, 'a categoria'),
    aptidao: opcao(APTIDOES_ANIMAL, 'a aptidão'),
    racaId: esquemaIdOpcional,
    dataNascimento: esquemaDataOpcional,
    dataNascimentoEstimada: z.boolean(),
    maeId: esquemaIdOpcional,
    paiId: esquemaIdOpcional,
    origem: opcao(ORIGENS_ANIMAL, 'a origem'),
    observacoes: textoOpcional(1000, 'Observações'),
  })
  .strict();
export type DadosAnimal = z.input<typeof esquemaDadosAnimal>;

/** Entrada no rebanho: data, lote inicial e peso de entrada opcional. */
export const esquemaEntradaAnimal = z
  .object({
    data: esquemaData,
    loteId: esquemaIdOpcional,
    pesoVivoKg: esquemaPesoVivoKg.nullable(),
    metodoPesagem: opcao(METODOS_PESAGEM, 'o método da pesagem').nullable(),
  })
  .strict()
  .refine((e) => (e.pesoVivoKg === null) === (e.metodoPesagem === null), {
    message: 'Informe o método da pesagem junto com o peso de entrada.',
    path: ['metodoPesagem'],
  });
export type EntradaAnimal = z.input<typeof esquemaEntradaAnimal>;

export const ORDENACOES_ANIMAL = [
  'identificacao',
  'nome',
  'categoria',
  'lote',
  'nascimento',
] as const;

export const esquemaFiltrosAnimal = z
  .object({
    busca: z.string().max(80).optional(),
    status: z.enum([...STATUS_ANIMAL, 'todos']).optional(),
    loteId: z.union([esquemaId, z.literal('sem_lote')]).optional(),
    sexo: z.enum(SEXOS).optional(),
    categoria: z.enum(CATEGORIAS_ANIMAL).optional(),
    racaId: esquemaId.optional(),
    ordenacao: z.enum(ORDENACOES_ANIMAL).optional(),
    pagina: z.number().int().min(1).optional(),
    // Até 5000: pesagem em lote e aplicação coletiva mostram o lote inteiro.
    tamanhoPagina: z.number().int().min(1).max(5000).optional(),
  })
  .strict();
export type FiltrosAnimal = z.input<typeof esquemaFiltrosAnimal>;

export const esquemaMotivo = textoOpcional(500, 'Motivo');
export const esquemaMotivoObrigatorio = textoObrigatorio(500, 'Motivo');

// ---------------------------------------------------------------------------
// Pesagem
// ---------------------------------------------------------------------------

export const esquemaEscalaEcc = opcao(ESCALAS_ECC, 'a escala do escore corporal');

const esquemaEscoreCorporal = z
  .number({ error: 'Escore corporal deve ser um número.' })
  .finite('Escore corporal deve ser um número.')
  .positive('Escore corporal deve ser maior que zero.');

/** Escore e escala andam juntos, e a nota precisa caber na escala. */
function validarEcc(
  escore: number | null,
  escala: EscalaEcc | null,
  ctx: z.RefinementCtx,
  caminho: (string | number)[],
): void {
  if (escore === null) return;
  if (escala === null) {
    ctx.addIssue({
      code: 'custom',
      message: 'Escolha a escala do escore corporal.',
      path: [...caminho, 'escalaEcc'],
    });
    return;
  }
  const { minimo, maximo } = LIMITES_ESCALA_ECC[escala];
  if (escore < minimo || escore > maximo) {
    ctx.addIssue({
      code: 'custom',
      message: `Na escala de ${minimo} a ${maximo}, o escore deve ficar entre ${minimo} e ${maximo}.`,
      path: [...caminho, 'escoreCorporal'],
    });
  }
}

export const esquemaDadosPesagem = z
  .object({
    data: esquemaData,
    pesoVivoKg: esquemaPesoVivoKg,
    metodo: opcao(METODOS_PESAGEM, 'o método da pesagem'),
    observacao: textoOpcional(500, 'Observação'),
    escoreCorporal: esquemaEscoreCorporal.nullable().default(null),
    escalaEcc: esquemaEscalaEcc.nullable().default(null),
  })
  .strict()
  .superRefine((d, ctx) => validarEcc(d.escoreCorporal, d.escalaEcc, ctx, []));
export type DadosPesagem = z.input<typeof esquemaDadosPesagem>;

/** Justificativa de uma pesagem com alerta que o usuário conferiu. */
export const esquemaJustificativa = textoOpcional(500, 'Justificativa');
export const esquemaJustificativaObrigatoria = textoObrigatorio(500, 'Justificativa');

/** Uma linha da pesagem em lote. Data individual vazia = data geral do lote. */
export const esquemaItemPesagemLote = z
  .object({
    animalId: esquemaId,
    pesoVivoKg: esquemaPesoVivoKg,
    data: esquemaDataOpcional.default(null),
    escoreCorporal: esquemaEscoreCorporal.nullable().default(null),
    observacao: textoOpcional(500, 'Observação').default(null),
    justificativa: esquemaJustificativa.default(null),
  })
  .strict();
export type ItemPesagemLote = z.input<typeof esquemaItemPesagemLote>;

export const LIMITE_ITENS_PESAGEM_LOTE = 2000;

export const esquemaPesagemLote = z
  .object({
    data: esquemaData,
    metodo: opcao(METODOS_PESAGEM, 'o método da pesagem'),
    escalaEcc: esquemaEscalaEcc.nullable().default(null),
    itens: z
      .array(esquemaItemPesagemLote)
      .min(1, 'Informe o peso de pelo menos um animal.')
      .max(LIMITE_ITENS_PESAGEM_LOTE, `No máximo ${LIMITE_ITENS_PESAGEM_LOTE} animais por vez.`),
  })
  .strict()
  .superRefine((d, ctx) =>
    d.itens.forEach((item, i) => validarEcc(item.escoreCorporal, d.escalaEcc, ctx, ['itens', i])),
  );
export type PesagemLote = z.input<typeof esquemaPesagemLote>;

/**
 * Limites de conferência do GMD (Configurações). Não são referências
 * zootécnicas; ver packages/domain, alertas-pesagem.ts.
 */
const esquemaLimiteGmd = z
  .number({ error: 'O limite deve ser um número.' })
  .finite('O limite deve ser um número.')
  .min(-10, 'O limite deve ficar entre -10 e 10 kg/dia.')
  .max(10, 'O limite deve ficar entre -10 e 10 kg/dia.')
  .nullable();

export const esquemaParametrosAlertasPesagem = z
  .object({
    gmdMaximoKgDia: esquemaLimiteGmd,
    gmdMinimoKgDia: esquemaLimiteGmd,
    // Configurações gravadas antes deste campo recebem o valor inicial.
    intervaloCurtoDias: z
      .number({ error: 'Informe um número inteiro de dias.' })
      .int('Informe um número inteiro de dias.')
      .min(1, 'O intervalo deve ficar entre 1 e 365 dias.')
      .max(365, 'O intervalo deve ficar entre 1 e 365 dias.')
      .nullable()
      .default(PARAMETROS_ALERTAS_PESAGEM_INICIAIS.intervaloCurtoDias),
  })
  .strict()
  .superRefine((p, ctx) => {
    for (const mensagem of validarParametrosAlertas(p)) {
      ctx.addIssue({ code: 'custom', message: mensagem, path: ['gmdMaximoKgDia'] });
    }
  });

// ---------------------------------------------------------------------------
// Entradas dos canais
// ---------------------------------------------------------------------------

export const entradasRebanho = {
  'propriedade:listar': z.object({}).strict(),
  'propriedade:criar': z.object({ dados: esquemaDadosPropriedade }).strict(),
  'propriedade:atualizar': z.object({ id: esquemaId, dados: esquemaDadosPropriedade }).strict(),
  'propriedade:excluir': z.object({ id: esquemaId }).strict(),

  'area:listar': z.object({ propriedadeId: esquemaId }).strict(),
  'area:criar': z.object({ propriedadeId: esquemaId, dados: esquemaDadosArea }).strict(),
  'area:atualizar': z.object({ id: esquemaId, dados: esquemaDadosArea }).strict(),
  'area:excluir': z.object({ id: esquemaId }).strict(),

  'raca:listar': z.object({}).strict(),
  'raca:criar': z.object({ dados: esquemaDadosRaca }).strict(),
  'raca:atualizar': z.object({ id: esquemaId, dados: esquemaDadosRaca }).strict(),
  'raca:excluir': z.object({ id: esquemaId }).strict(),

  'lote:listar': z
    .object({ propriedadeId: esquemaId, incluirEncerrados: z.boolean().optional() })
    .strict(),
  'lote:obter': z.object({ id: esquemaId }).strict(),
  'lote:criar': z.object({ propriedadeId: esquemaId, dados: esquemaDadosLote }).strict(),
  'lote:atualizar': z.object({ id: esquemaId, dados: esquemaEdicaoLote }).strict(),
  'lote:moverArea': z
    .object({
      id: esquemaId,
      areaId: esquemaIdOpcional,
      data: esquemaData,
      observacao: textoOpcional(500, 'Observação'),
    })
    .strict(),
  'lote:encerrar': z.object({ id: esquemaId, data: esquemaData }).strict(),
  'lote:reabrir': z.object({ id: esquemaId }).strict(),

  'animal:listar': z.object({ propriedadeId: esquemaId, filtros: esquemaFiltrosAnimal }).strict(),
  'animal:obter': z.object({ id: esquemaId }).strict(),
  'animal:criar': z
    .object({ propriedadeId: esquemaId, dados: esquemaDadosAnimal, entrada: esquemaEntradaAnimal })
    .strict(),
  'animal:atualizar': z
    .object({ id: esquemaId, dados: esquemaDadosAnimal, motivo: esquemaMotivo.optional() })
    .strict(),
  'animal:transferir': z
    .object({
      animalIds: z.array(esquemaId).min(1, 'Selecione ao menos um animal.').max(5000),
      loteDestinoId: esquemaIdOpcional,
      data: esquemaData,
      motivo: esquemaMotivo,
    })
    .strict(),
  'animal:registrarSaida': z
    .object({
      id: esquemaId,
      tipo: opcao(TIPOS_SAIDA, 'o tipo de saída'),
      data: esquemaData,
      motivo: esquemaMotivo,
    })
    .strict(),
  'animal:excluir': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
  'animal:historico': z.object({ id: esquemaId }).strict(),
  'animal:importarCsv': z
    .object({
      propriedadeId: esquemaId,
      conteudo: z.string().max(2_000_000, 'Arquivo grande demais (máximo de 2 MB).'),
      confirmar: z.boolean(),
    })
    .strict(),
  'animal:salvarModeloCsv': z.object({}).strict(),

  'pesagem:listar': z.object({ animalId: esquemaId }).strict(),
  'pesagem:registrar': z
    .object({
      animalId: esquemaId,
      dados: esquemaDadosPesagem,
      justificativa: esquemaJustificativa.default(null),
    })
    .strict(),
  // Correção de pesagem exige motivo: a alteração fica auditável (Fase 2).
  'pesagem:atualizar': z
    .object({
      id: esquemaId,
      dados: esquemaDadosPesagem,
      motivo: esquemaMotivoObrigatorio,
      justificativa: esquemaJustificativa.default(null),
    })
    .strict(),
  'pesagem:excluir': z.object({ id: esquemaId, motivo: esquemaMotivoObrigatorio }).strict(),
  'pesagem:conferir': z
    .object({ id: esquemaId, justificativa: esquemaJustificativaObrigatoria })
    .strict(),
  'pesagem:registrarLote': z
    .object({ propriedadeId: esquemaId, pesagem: esquemaPesagemLote, confirmar: z.boolean() })
    .strict(),
  'pesagem:alertas': z
    .object({ propriedadeId: esquemaId, incluirConferidas: z.boolean().default(false) })
    .strict(),
  'lote:evolucao': z.object({ id: esquemaId }).strict(),
} as const;

// ---------------------------------------------------------------------------
// Tipos já validados (saída dos esquemas), usados pelos serviços do main.
// ---------------------------------------------------------------------------

export type DadosPropriedadeValidados = z.output<typeof esquemaDadosPropriedade>;
export type DadosAreaValidados = z.output<typeof esquemaDadosArea>;
export type DadosRacaValidados = z.output<typeof esquemaDadosRaca>;
export type DadosLoteValidados = z.output<typeof esquemaDadosLote>;
export type EdicaoLoteValidada = z.output<typeof esquemaEdicaoLote>;
export type DadosAnimalValidados = z.output<typeof esquemaDadosAnimal>;
export type EntradaAnimalValidada = z.output<typeof esquemaEntradaAnimal>;
export type FiltrosAnimalValidados = z.output<typeof esquemaFiltrosAnimal>;
export type DadosPesagemValidados = z.output<typeof esquemaDadosPesagem>;
export type PesagemLoteValidada = z.output<typeof esquemaPesagemLote>;
