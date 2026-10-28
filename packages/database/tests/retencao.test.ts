import { describe, expect, it } from 'vitest';
import type { TipoBackup } from '@pecuaria/shared-types';
import {
  chaveDia,
  chaveSemanaIso,
  selecionarBackupsParaRemover,
  type PoliticaRetencao,
} from '../src/backup/retencao';

function backup(id: string, tipo: TipoBackup, data: Date) {
  return { id, tipo, criadoEm: data.toISOString() };
}

describe('chaves de período', () => {
  it('semana ISO 8601 em viradas de ano conhecidas', () => {
    expect(chaveSemanaIso(new Date(2024, 11, 30))).toBe('2025-S01'); // segunda-feira
    expect(chaveSemanaIso(new Date(2026, 0, 1))).toBe('2026-S01'); // quinta-feira
    expect(chaveSemanaIso(new Date(2027, 0, 1))).toBe('2026-S53'); // sexta-feira
    expect(chaveSemanaIso(new Date(2026, 9, 12))).toBe(chaveSemanaIso(new Date(2026, 9, 18)));
    expect(chaveSemanaIso(new Date(2026, 9, 18))).not.toBe(chaveSemanaIso(new Date(2026, 9, 19)));
  });

  it('dia no fuso local', () => {
    expect(chaveDia(new Date(2026, 9, 15, 23, 59))).toBe('2026-10-15');
  });
});

describe('selecionarBackupsParaRemover', () => {
  const politica: PoliticaRetencao = { diarios: 2, semanais: 1, mensais: 1, preOperacao: 1 };

  it('mantém o mais recente de cada dia dentro do limite', () => {
    const lista = [
      backup('d1-manha', 'automatico', new Date(2026, 9, 15, 8)),
      backup('d1-tarde', 'automatico', new Date(2026, 9, 15, 18)),
      backup('d2', 'automatico', new Date(2026, 9, 14, 8)),
      backup('d3', 'automatico', new Date(2026, 9, 13, 8)),
    ];
    const remover = selecionarBackupsParaRemover(lista, {
      diarios: 2,
      semanais: 0,
      mensais: 0,
      preOperacao: 0,
    });
    expect(remover.sort()).toEqual(['d1-manha', 'd3']);
  });

  it('regras semanal e mensal guardam backups mais antigos', () => {
    const lista = [
      backup('hoje', 'automatico', new Date(2026, 9, 15)),
      backup('ontem', 'automatico', new Date(2026, 9, 14)),
      backup('semana-passada', 'automatico', new Date(2026, 9, 7)),
      backup('mes-passado', 'automatico', new Date(2026, 8, 10)),
      backup('dois-meses', 'automatico', new Date(2026, 7, 10)),
    ];
    const remover = selecionarBackupsParaRemover(lista, {
      diarios: 2,
      semanais: 2,
      mensais: 2,
      preOperacao: 0,
    });
    // diários: hoje, ontem. semanais: semana de hoje (hoje) e semana anterior (semana-passada).
    // mensais: outubro (hoje) e setembro (mes-passado).
    expect(remover).toEqual(['dois-meses']);
  });

  it('nunca remove manuais nem importados', () => {
    const lista = [
      backup('m1', 'manual', new Date(2020, 0, 1)),
      backup('i1', 'importado', new Date(2020, 0, 2)),
      backup('a1', 'automatico', new Date(2026, 9, 15)),
    ];
    expect(
      selecionarBackupsParaRemover(lista, { ...politica, diarios: 0, semanais: 0, mensais: 0 }),
    ).toEqual(['a1']);
  });

  it('mantém os N mais recentes de cada tipo pré-operação', () => {
    const lista = [
      backup('pm-antigo', 'pre_migracao', new Date(2026, 0, 1)),
      backup('pm-novo', 'pre_migracao', new Date(2026, 5, 1)),
      backup('pr-antigo', 'pre_restauracao', new Date(2026, 0, 1)),
      backup('pr-novo', 'pre_restauracao', new Date(2026, 5, 1)),
    ];
    expect(selecionarBackupsParaRemover(lista, politica).sort()).toEqual([
      'pm-antigo',
      'pr-antigo',
    ]);
  });
});
