-- Migration 0001: infraestrutura da Fase 0.
-- Contém apenas tabelas técnicas. Tabelas de negócio entram nas fases seguintes.
-- Regra: migration aplicada nunca é editada. Mudanças vão em uma nova migration.
-- Regra: não usar BEGIN/COMMIT aqui. O migrador envolve cada arquivo em transação.

-- Preferências e parâmetros do aplicativo, em formato chave-valor.
CREATE TABLE configuracao (
  chave TEXT PRIMARY KEY NOT NULL CHECK (length(chave) BETWEEN 1 AND 64),
  valor_json TEXT NOT NULL CHECK (json_valid(valor_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
