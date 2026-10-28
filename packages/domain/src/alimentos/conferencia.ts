import { normalizarNome } from '../comum/texto';
import type { StatusRegistro } from './enumeracoes';

/**
 * Fluxo de conferência de um registro de composição (decisões D5-4 e D5-5; RF-05.10).
 *
 *   rascunho ──transcrever──▶ transcrito ──conferir──▶ conferido ──(versão nova conferida)──▶ substituido
 *      ▲                         │  │
 *      └──────devolver───────────┘  └──rejeitar──▶ rejeitado ──reabrir──▶ rascunho
 *
 * Só o rascunho é editável. O conferido é imutável: correção só por nova versão. Só registros
 * conferidos poderão entrar em cálculo (Fase 6).
 */
export type AcaoConferencia = 'transcrever' | 'devolver' | 'conferir' | 'rejeitar' | 'reabrir';

export const TRANSICOES_CONFERENCIA: Readonly<
  Record<AcaoConferencia, { de: StatusRegistro; para: StatusRegistro }>
> = {
  transcrever: { de: 'rascunho', para: 'transcrito' },
  devolver: { de: 'transcrito', para: 'rascunho' },
  conferir: { de: 'transcrito', para: 'conferido' },
  rejeitar: { de: 'transcrito', para: 'rejeitado' },
  reabrir: { de: 'rejeitado', para: 'rascunho' },
};

/** Pares (de, para) aceitos, incluindo a substituição feita pela versão nova. Igual ao gatilho. */
export const PARES_DE_STATUS_PERMITIDOS: readonly (readonly [StatusRegistro, StatusRegistro])[] = [
  ...Object.values(TRANSICOES_CONFERENCIA).map((t) => [t.de, t.para] as const),
  ['conferido', 'substituido'],
];

export function transicaoPermitida(de: StatusRegistro, para: StatusRegistro): boolean {
  return PARES_DE_STATUS_PERMITIDOS.some(([a, b]) => a === de && b === para);
}

export function statusDepois(acao: AcaoConferencia, atual: StatusRegistro): StatusRegistro {
  const t = TRANSICOES_CONFERENCIA[acao];
  if (t.de !== atual) throw new Error(mensagemTransicaoInvalida(acao, atual));
  return t.para;
}

const NOMES_STATUS: Record<StatusRegistro, string> = {
  rascunho: 'rascunho',
  transcrito: 'transcrito',
  conferido: 'conferido',
  rejeitado: 'rejeitado',
  substituido: 'substituído',
};

function mensagemTransicaoInvalida(acao: AcaoConferencia, atual: StatusRegistro): string {
  if (atual === 'conferido' || atual === 'substituido')
    return `Registro ${NOMES_STATUS[atual]} não muda. Para corrigir, crie uma nova versão.`;
  const exigido = NOMES_STATUS[TRANSICOES_CONFERENCIA[acao].de];
  return `Esta ação exige o registro em ${exigido}; ele está ${NOMES_STATUS[atual]}.`;
}

export function acoesDisponiveis(status: StatusRegistro): AcaoConferencia[] {
  return (Object.keys(TRANSICOES_CONFERENCIA) as AcaoConferencia[]).filter(
    (a) => TRANSICOES_CONFERENCIA[a].de === status,
  );
}

export function registroEditavel(status: StatusRegistro): boolean {
  return status === 'rascunho';
}

/** Descartar é exclusão lógica, só antes da conferência. */
export function registroDescartavel(status: StatusRegistro): boolean {
  return status === 'rascunho' || status === 'transcrito' || status === 'rejeitado';
}

/** Nova versão só a partir do conferido vigente. */
export function aceitaNovaVersao(status: StatusRegistro): boolean {
  return status === 'conferido';
}

/**
 * A mesma pessoa transcreveu e conferiu? Permitido (sistema de um usuário só), mas a tela avisa.
 * Compara os nomes digitados sem diferença de maiúsculas e espaços.
 */
export function mesmaPessoa(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  return normalizarNome(a) === normalizarNome(b);
}
