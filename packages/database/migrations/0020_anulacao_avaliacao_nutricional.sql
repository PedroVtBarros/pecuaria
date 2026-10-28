-- Fase 6B (D-6B4-03, aprovada em 2026-10-26): anulação de avaliação nutricional gravada.
-- Registro separado, com motivo, quem e quando; o retrato original (avaliacao_nutricional) não muda
-- e continua consultável. Uma anulação por avaliação; sem alteração e sem exclusão.
-- Nenhuma tabela existente muda.

CREATE TABLE anulacao_avaliacao_nutricional (
  id TEXT PRIMARY KEY NOT NULL,
  avaliacao_id TEXT NOT NULL REFERENCES avaliacao_nutricional(id),
  motivo TEXT NOT NULL CHECK(length(trim(motivo)) BETWEEN 1 AND 1000 AND motivo = trim(motivo)),
  anulado_por TEXT NOT NULL CHECK(length(trim(anulado_por)) BETWEEN 1 AND 120),
  anulado_em TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT CHECK(deleted_at IS NULL),
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX ux_anulacao_avaliacao ON anulacao_avaliacao_nutricional(avaliacao_id);

CREATE TRIGGER tg_anulacao_avaliacao_sem_exclusao BEFORE DELETE ON anulacao_avaliacao_nutricional
BEGIN SELECT RAISE(ABORT,'Anulação de avaliação não é excluída.'); END;
CREATE TRIGGER tg_anulacao_avaliacao_imutavel BEFORE UPDATE ON anulacao_avaliacao_nutricional
BEGIN SELECT RAISE(ABORT,'Anulação de avaliação não muda.'); END;
