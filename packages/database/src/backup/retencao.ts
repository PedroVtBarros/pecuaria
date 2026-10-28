import type { InfoBackup, TipoBackup } from '@pecuaria/shared-types';

/**
 * Política de retenção (ROADMAP.md, seção 4).
 *
 * Os limites contam períodos que têm backup, não dias de calendário.
 * Exemplo: "7 diários" mantém o backup mais recente de cada um dos 7 dias
 * mais recentes em que houve backup. Assim, quem abre o app de vez em quando
 * não perde histórico por causa dos dias sem uso.
 */
export interface PoliticaRetencao {
  diarios: number;
  semanais: number;
  mensais: number;
  /** Quantos backups de cada tipo pré-operação (pré-migração, pré-restauração) manter. */
  preOperacao: number;
}

export const POLITICA_RETENCAO_PADRAO: PoliticaRetencao = {
  diarios: 7,
  semanais: 4,
  mensais: 12,
  preOperacao: 10,
};

/** Backups manuais e importados nunca são removidos automaticamente. */
const TIPOS_PROTEGIDOS: readonly TipoBackup[] = ['manual', 'importado'];

type BackupResumido = Pick<InfoBackup, 'id' | 'tipo' | 'criadoEm'>;

export function chaveDia(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function chaveMes(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

/** Semana ISO 8601 (segunda a domingo), no fuso local. */
export function chaveSemanaIso(data: Date): string {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const diaSemana = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - diaSemana + 3); // quinta-feira da mesma semana
  const anoIso = d.getFullYear();
  const primeiraQuinta = new Date(anoIso, 0, 4);
  const diaPrimeira = (primeiraQuinta.getDay() + 6) % 7;
  primeiraQuinta.setDate(primeiraQuinta.getDate() - diaPrimeira + 3);
  const semana = 1 + Math.round((d.getTime() - primeiraQuinta.getTime()) / (7 * 24 * 3600 * 1000));
  return `${anoIso}-S${String(semana).padStart(2, '0')}`;
}

function maisRecentePrimeiro(a: BackupResumido, b: BackupResumido): number {
  return b.criadoEm.localeCompare(a.criadoEm);
}

function manterMaisRecentePorPeriodo(
  ordenados: readonly BackupResumido[],
  chave: (data: Date) => string,
  limite: number,
  manter: Set<string>,
): void {
  const periodos = new Set<string>();
  for (const backup of ordenados) {
    const periodo = chave(new Date(backup.criadoEm));
    if (periodos.has(periodo)) continue;
    if (periodos.size >= limite) break;
    periodos.add(periodo);
    manter.add(backup.id);
  }
}

/** Retorna os ids que a política manda remover. Função pura. */
export function selecionarBackupsParaRemover(
  backups: readonly BackupResumido[],
  politica: PoliticaRetencao = POLITICA_RETENCAO_PADRAO,
): string[] {
  const manter = new Set<string>();

  const automaticos = backups.filter((b) => b.tipo === 'automatico').sort(maisRecentePrimeiro);
  manterMaisRecentePorPeriodo(automaticos, chaveDia, politica.diarios, manter);
  manterMaisRecentePorPeriodo(automaticos, chaveSemanaIso, politica.semanais, manter);
  manterMaisRecentePorPeriodo(automaticos, chaveMes, politica.mensais, manter);

  for (const tipo of ['pre_migracao', 'pre_restauracao'] as const) {
    backups
      .filter((b) => b.tipo === tipo)
      .sort(maisRecentePrimeiro)
      .slice(0, politica.preOperacao)
      .forEach((b) => manter.add(b.id));
  }

  return backups
    .filter((b) => !TIPOS_PROTEGIDOS.includes(b.tipo) && !manter.has(b.id))
    .map((b) => b.id);
}
