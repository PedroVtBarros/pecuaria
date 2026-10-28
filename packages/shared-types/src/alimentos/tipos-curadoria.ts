import type { ResumoRegistro } from './tipos-composicao';

/** Importação de um pacote de curadoria já feita (migration 0014). */
export interface ImportacaoCuradoria {
  id: string;
  pacoteCodigo: string;
  pacoteVersao: number;
  fonteId: string;
  nAlimentosCriados: number;
  nRegistros: number;
  nValores: number;
  importadoEm: string;
}

/** Pacote embutido no aplicativo, com o que ele traria e se já foi importado. */
export interface ResumoPacoteCuradoria {
  codigo: string;
  versao: number;
  titulo: string;
  descricao: string;
  transcritoPor: string;
  fonte: {
    codigo: string;
    titulo: string;
    autores: string;
    ano: number;
    edicaoVersao: string | null;
    isbnDoiUrl: string | null;
    dataAcesso: string | null;
  };
  /** Registros e valores importáveis por alimento; bloqueados à parte. */
  alimentos: { nome: string; registros: number; valores: number; bloqueados: number }[];
  /** Registros que ficam no pacote mas não são importados, com o motivo. */
  bloqueados: { alimento: string; referenciaLocal: string; motivo: string }[];
  nutrientes: string[];
  contagem: { alimentos: number; registros: number; valores: number; bloqueados: number };
  importacao: ImportacaoCuradoria | null;
  /** Maior versão deste pacote já importada (esta ou outra); null se nenhuma. */
  versaoImportada: number | null;
  /** Quando esta versão entrou por atualização de uma anterior: o que aconteceu com cada registro. */
  atualizacao: AtualizacaoCuradoria | null;
}

export interface ResultadoImportacaoCuradoria {
  importacao: ImportacaoCuradoria;
  registros: ResumoRegistro[];
}

/**
 * Atualização de um pacote já importado para a versão nova (aprovação da 5C). Nada é duplicado:
 * cada registro do pacote é casado pela página ou tabela com o que já está no banco.
 * - atualizado: ainda transcrito pelo pacote; volta a rascunho, recebe as mudanças e é transcrito
 *   de novo, tudo no histórico;
 * - nova_versao: já conferido (imutável); as mudanças entram numa versão nova, transcrita, que o
 *   usuário confere e que então substitui a anterior;
 * - novo: registro que a versão anterior não trazia;
 * - mantido_*: o usuário está editando, rejeitou ou descartou o registro; nada é alterado e as
 *   mudanças ficam listadas para ele decidir;
 * - bloqueado_ja_importado: a versão nova bloqueia um registro que já entrou; nada é alterado;
 * - fora_da_versao: registro importado antes que a versão nova não traz; nada é alterado.
 */
export const SITUACOES_ATUALIZACAO = [
  'atualizado',
  'nova_versao',
  'novo',
  'sem_mudanca',
  'mantido_em_edicao',
  'mantido_rejeitado',
  'mantido_descartado',
  'bloqueado_ja_importado',
  'fora_da_versao',
] as const;
export type SituacaoAtualizacao = (typeof SITUACOES_ATUALIZACAO)[number];

export interface ItemAtualizacaoCuradoria {
  referenciaLocal: string;
  alimento: string;
  situacao: SituacaoAtualizacao;
  /** Registro afetado (a versão nova, quando criada); null se nada existe no banco. */
  registroId: string | null;
  /** O que muda, por campo ("MS: interpretação da base"), ou o motivo de nada ser alterado. */
  mudancas: string[];
}

export interface AtualizacaoCuradoria {
  deVersao: number;
  fonteAlterada: string[];
  itens: ItemAtualizacaoCuradoria[];
}

export interface ResultadoAtualizacaoCuradoria {
  importacao: ImportacaoCuradoria;
  atualizacao: AtualizacaoCuradoria;
}
