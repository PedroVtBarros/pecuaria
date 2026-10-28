-- Migration 0002: rebanho (Fase 1).
-- Propriedades, áreas, raças, lotes, animais, movimentações, pesagens e trilha de alterações.
-- Convenções (BANCO_DE_DADOS.md, seção 1): UUID v7 em TEXT, datas AAAA-MM-DD,
-- instantes ISO 8601 UTC, exclusão lógica por deleted_at, unidade no nome da coluna.
-- Regra: não usar controle de transação aqui; o migrador usa uma transação por arquivo.

CREATE TABLE propriedade (
  id TEXT PRIMARY KEY NOT NULL,
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 120),
  nome_normalizado TEXT NOT NULL,
  municipio TEXT CHECK (municipio IS NULL OR length(municipio) <= 120),
  uf TEXT CHECK (uf IS NULL OR length(uf) = 2),
  area_total_ha REAL CHECK (area_total_ha IS NULL OR area_total_ha > 0),
  tipo_exploracao TEXT NOT NULL CHECK (tipo_exploracao IN ('corte', 'leite', 'misto')),
  observacoes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE UNIQUE INDEX ux_propriedade_nome ON propriedade (nome_normalizado) WHERE deleted_at IS NULL;

-- Piquete, curral, baia ou confinamento. A forrageira (ligação com o banco de
-- alimentos) entra na Fase 5, quando a tabela de alimentos existir.
CREATE TABLE area (
  id TEXT PRIMARY KEY NOT NULL,
  propriedade_id TEXT NOT NULL REFERENCES propriedade (id),
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 80),
  nome_normalizado TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('piquete', 'curral', 'baia', 'confinamento', 'outro')),
  area_ha REAL CHECK (area_ha IS NULL OR area_ha > 0),
  observacoes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE UNIQUE INDEX ux_area_nome ON area (propriedade_id, nome_normalizado) WHERE deleted_at IS NULL;
CREATE INDEX ix_area_propriedade ON area (propriedade_id);

-- grupo_genetico será usado pelo motor de nutrição (Fase 6) e revisado contra
-- as categorias do BR-CORTE quando o livro for consultado.
CREATE TABLE raca (
  id TEXT PRIMARY KEY NOT NULL,
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 60),
  nome_normalizado TEXT NOT NULL,
  aptidao TEXT NOT NULL CHECK (aptidao IN ('corte', 'leite', 'dupla')),
  grupo_genetico TEXT NOT NULL CHECK (grupo_genetico IN ('zebuino', 'taurino', 'cruzado', 'indefinido')),
  origem TEXT NOT NULL CHECK (origem IN ('sugestao', 'usuario')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE UNIQUE INDEX ux_raca_nome ON raca (nome_normalizado) WHERE deleted_at IS NULL;

CREATE TABLE lote (
  id TEXT PRIMARY KEY NOT NULL,
  propriedade_id TEXT NOT NULL REFERENCES propriedade (id),
  area_id TEXT REFERENCES area (id),
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 80),
  nome_normalizado TEXT NOT NULL,
  finalidade TEXT NOT NULL CHECK (finalidade IN ('cria', 'recria', 'engorda', 'lactacao', 'seca', 'outro')),
  data_formacao TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  data_encerramento TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK ((ativo = 1 AND data_encerramento IS NULL) OR (ativo = 0 AND data_encerramento IS NOT NULL))
) STRICT;

-- Nome único entre lotes ativos da propriedade. Lotes encerrados liberam o nome.
CREATE UNIQUE INDEX ux_lote_nome ON lote (propriedade_id, nome_normalizado) WHERE deleted_at IS NULL AND ativo = 1;
CREATE INDEX ix_lote_propriedade ON lote (propriedade_id, ativo);

-- Histórico de locais do lote.
CREATE TABLE movimentacao_lote (
  id TEXT PRIMARY KEY NOT NULL,
  lote_id TEXT NOT NULL REFERENCES lote (id),
  data TEXT NOT NULL,
  area_origem_id TEXT REFERENCES area (id),
  area_destino_id TEXT REFERENCES area (id),
  observacao TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX ix_movimentacao_lote ON movimentacao_lote (lote_id, data);

-- O lote atual do animal fica em lote_id para consulta rápida; o histórico
-- completo fica em movimentacao_animal e nunca é apagado.
CREATE TABLE animal (
  id TEXT PRIMARY KEY NOT NULL,
  propriedade_id TEXT NOT NULL REFERENCES propriedade (id),
  lote_id TEXT REFERENCES lote (id),
  identificacao TEXT NOT NULL CHECK (length(identificacao) BETWEEN 1 AND 40),
  identificacao_normalizada TEXT NOT NULL,
  nome TEXT CHECK (nome IS NULL OR length(nome) <= 80),
  sexo TEXT NOT NULL CHECK (sexo IN ('F', 'M')),
  condicao_sexual TEXT NOT NULL CHECK (condicao_sexual IN ('femea', 'inteiro', 'castrado')),
  categoria TEXT NOT NULL CHECK (categoria IN ('bezerra', 'novilha', 'vaca', 'bezerro', 'garrote', 'novilho', 'boi', 'touro')),
  aptidao TEXT NOT NULL CHECK (aptidao IN ('corte', 'leite')),
  raca_id TEXT REFERENCES raca (id),
  data_nascimento TEXT,
  data_nascimento_estimada INTEGER NOT NULL DEFAULT 0 CHECK (data_nascimento_estimada IN (0, 1)),
  mae_id TEXT REFERENCES animal (id),
  pai_id TEXT REFERENCES animal (id),
  origem TEXT NOT NULL CHECK (origem IN ('nascido', 'comprado')),
  data_entrada TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'vendido', 'morto', 'descartado')),
  data_saida TEXT,
  motivo_saida TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK ((sexo = 'F' AND condicao_sexual = 'femea') OR (sexo = 'M' AND condicao_sexual IN ('inteiro', 'castrado'))),
  CHECK ((status = 'ativo' AND data_saida IS NULL) OR (status <> 'ativo' AND data_saida IS NOT NULL)),
  CHECK (mae_id IS NULL OR mae_id <> id),
  CHECK (pai_id IS NULL OR pai_id <> id)
) STRICT;

-- Identificação única por propriedade entre animais não excluídos, inclusive
-- vendidos e mortos, para o histórico nunca ficar ambíguo.
CREATE UNIQUE INDEX ux_animal_identificacao ON animal (propriedade_id, identificacao_normalizada) WHERE deleted_at IS NULL;
CREATE INDEX ix_animal_propriedade_status ON animal (propriedade_id, status);
CREATE INDEX ix_animal_lote ON animal (lote_id);
CREATE INDEX ix_animal_mae ON animal (mae_id);
CREATE INDEX ix_animal_pai ON animal (pai_id);

-- Entrada, troca de lote e saída. A ligação com lançamentos financeiros
-- (compra e venda) entra na Fase 4.
CREATE TABLE movimentacao_animal (
  id TEXT PRIMARY KEY NOT NULL,
  animal_id TEXT NOT NULL REFERENCES animal (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'troca_lote', 'saida')),
  data TEXT NOT NULL,
  lote_origem_id TEXT REFERENCES lote (id),
  lote_destino_id TEXT REFERENCES lote (id),
  motivo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX ix_movimentacao_animal ON movimentacao_animal (animal_id, data);
CREATE INDEX ix_movimentacao_lote_destino ON movimentacao_animal (lote_destino_id);

-- Peso vivo em kg. Arroba de carcaça não é armazenada nem calculada aqui:
-- depende do rendimento de carcaça, que é outra medida.
CREATE TABLE pesagem (
  id TEXT PRIMARY KEY NOT NULL,
  animal_id TEXT NOT NULL REFERENCES animal (id),
  data TEXT NOT NULL,
  peso_vivo_kg REAL NOT NULL CHECK (peso_vivo_kg > 0),
  metodo TEXT NOT NULL CHECK (metodo IN ('balanca', 'fita', 'visual')),
  observacao TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;

-- Uma pesagem por animal por dia: o GMD precisa de intervalos de tempo reais.
CREATE UNIQUE INDEX ux_pesagem_animal_data ON pesagem (animal_id, data) WHERE deleted_at IS NULL;

-- Trilha de alterações: cada criação, edição, transferência, saída e exclusão
-- guarda o estado anterior e o novo. Só aceita inserção.
CREATE TABLE historico_alteracao (
  id TEXT PRIMARY KEY NOT NULL,
  entidade TEXT NOT NULL CHECK (entidade IN ('propriedade', 'area', 'raca', 'lote', 'animal', 'pesagem')),
  entidade_id TEXT NOT NULL,
  acao TEXT NOT NULL CHECK (acao IN ('criacao', 'alteracao', 'exclusao', 'transferencia', 'saida', 'encerramento', 'reabertura', 'mudanca_area', 'importacao')),
  dados_anteriores_json TEXT CHECK (dados_anteriores_json IS NULL OR json_valid(dados_anteriores_json)),
  dados_novos_json TEXT CHECK (dados_novos_json IS NULL OR json_valid(dados_novos_json)),
  motivo TEXT,
  ocorrido_em TEXT NOT NULL
) STRICT;

CREATE INDEX ix_historico_entidade ON historico_alteracao (entidade, entidade_id, ocorrido_em);

CREATE TRIGGER tg_historico_sem_alteracao BEFORE UPDATE ON historico_alteracao
BEGIN
  SELECT RAISE(ABORT, 'A trilha de alterações não pode ser modificada.');
END;

CREATE TRIGGER tg_historico_sem_exclusao BEFORE DELETE ON historico_alteracao
BEGIN
  SELECT RAISE(ABORT, 'A trilha de alterações não pode ser apagada.');
END;

-- Exclusão física proibida nos registros do rebanho: usa-se deleted_at.
CREATE TRIGGER tg_propriedade_sem_exclusao BEFORE DELETE ON propriedade
BEGIN
  SELECT RAISE(ABORT, 'Exclusão física proibida. Use exclusão lógica (deleted_at).');
END;

CREATE TRIGGER tg_area_sem_exclusao BEFORE DELETE ON area
BEGIN
  SELECT RAISE(ABORT, 'Exclusão física proibida. Use exclusão lógica (deleted_at).');
END;

CREATE TRIGGER tg_raca_sem_exclusao BEFORE DELETE ON raca
BEGIN
  SELECT RAISE(ABORT, 'Exclusão física proibida. Use exclusão lógica (deleted_at).');
END;

CREATE TRIGGER tg_lote_sem_exclusao BEFORE DELETE ON lote
BEGIN
  SELECT RAISE(ABORT, 'Exclusão física proibida. Use exclusão lógica (deleted_at).');
END;

CREATE TRIGGER tg_movimentacao_lote_sem_exclusao BEFORE DELETE ON movimentacao_lote
BEGIN
  SELECT RAISE(ABORT, 'Exclusão física proibida. Use exclusão lógica (deleted_at).');
END;

CREATE TRIGGER tg_animal_sem_exclusao BEFORE DELETE ON animal
BEGIN
  SELECT RAISE(ABORT, 'Exclusão física proibida. Use exclusão lógica (deleted_at).');
END;

CREATE TRIGGER tg_movimentacao_animal_sem_exclusao BEFORE DELETE ON movimentacao_animal
BEGIN
  SELECT RAISE(ABORT, 'Exclusão física proibida. Use exclusão lógica (deleted_at).');
END;

CREATE TRIGGER tg_pesagem_sem_exclusao BEFORE DELETE ON pesagem
BEGIN
  SELECT RAISE(ABORT, 'Exclusão física proibida. Use exclusão lógica (deleted_at).');
END;

-- Raças sugeridas, todas editáveis pelo usuário (origem = 'sugestao').
-- Classificação geral de aptidão e grupo genético; não é dado de cálculo.
INSERT INTO raca (id, nome, nome_normalizado, aptidao, grupo_genetico, origem, created_at, updated_at) VALUES
  ('01a13f6e-fa00-7c30-bd5e-5033735815f6', 'Nelore', 'nelore', 'corte', 'zebuino', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa01-7c6c-93f1-2116342667ce', 'Gir', 'gir', 'dupla', 'zebuino', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa02-7cc3-b40e-08c310ae8093', 'Guzerá', 'guzerá', 'dupla', 'zebuino', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa03-75d6-9bb2-aefa2417e175', 'Tabapuã', 'tabapuã', 'corte', 'zebuino', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa04-707d-8154-986d4c05fc93', 'Brahman', 'brahman', 'corte', 'zebuino', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa05-775a-adcd-8969acb11bb8', 'Sindi', 'sindi', 'dupla', 'zebuino', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa06-77e0-9244-ef3583663464', 'Angus', 'angus', 'corte', 'taurino', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa07-7a65-a106-ae0bf4ba1e04', 'Hereford', 'hereford', 'corte', 'taurino', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa08-791a-83c4-b15056eedf0a', 'Senepol', 'senepol', 'corte', 'taurino', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa09-7a59-bd6e-fafc79f7faee', 'Holandesa', 'holandesa', 'leite', 'taurino', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa0a-725f-b37e-49b8c4316fe0', 'Jersey', 'jersey', 'leite', 'taurino', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa0b-7b2f-9b84-d83dfc789d6b', 'Pardo-Suíça', 'pardo-suíça', 'dupla', 'taurino', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa0c-7fba-b9bd-b7df85b38780', 'Girolando', 'girolando', 'leite', 'cruzado', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa0d-780d-87f7-ec174490c347', 'Brangus', 'brangus', 'corte', 'cruzado', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa0e-74fa-afad-2873074ae228', 'Braford', 'braford', 'corte', 'cruzado', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa0f-712a-8256-da4859d2c93b', 'Canchim', 'canchim', 'corte', 'cruzado', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z'),
  ('01a13f6e-fa10-728c-ae79-6b97e16230ef', 'Sem raça definida', 'sem raça definida', 'dupla', 'indefinido', 'sugestao', '2026-10-15T12:00:00.000Z', '2026-10-15T12:00:00.000Z');
