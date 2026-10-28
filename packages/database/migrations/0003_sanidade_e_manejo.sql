-- Migration 0003: sanidade e manejo (Fase 2).
-- Escore de condição corporal e conferência de pesagens; produtos sanitários,
-- registros sanitários (individuais e coletivos), eventos por animal e agenda.
-- Nenhum produto, dose, carência ou calendário vem pronto: tudo é informado
-- pelo usuário conforme a bula e a orientação do veterinário.
-- Regra: não usar controle de transação aqui; o migrador usa uma transação por arquivo.

-- ---------------------------------------------------------------------------
-- Pesagem: escore de condição corporal (ECC) e conferência de alerta
-- ---------------------------------------------------------------------------

-- A nota é gravada na escala usada (1 a 5 ou 1 a 9), sem conversão.
ALTER TABLE pesagem ADD COLUMN escore_corporal REAL;
ALTER TABLE pesagem ADD COLUMN escala_ecc TEXT CHECK (escala_ecc IS NULL OR escala_ecc IN ('1_5', '1_9'));
-- Pesagem com alerta que o usuário conferiu e confirmou, com a justificativa.
ALTER TABLE pesagem ADD COLUMN conferida_em TEXT;
ALTER TABLE pesagem ADD COLUMN justificativa_conferencia TEXT;

-- Regras entre colunas (ALTER TABLE não aceita CHECK entre colunas novas).
CREATE TRIGGER tg_pesagem_consistencia_ins BEFORE INSERT ON pesagem
WHEN (NEW.escore_corporal IS NULL) <> (NEW.escala_ecc IS NULL)
  OR (NEW.escala_ecc = '1_5' AND NEW.escore_corporal NOT BETWEEN 1 AND 5)
  OR (NEW.escala_ecc = '1_9' AND NEW.escore_corporal NOT BETWEEN 1 AND 9)
  OR (NEW.conferida_em IS NULL) <> (NEW.justificativa_conferencia IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'Pesagem inconsistente: escore corporal fora da escala ou conferência sem justificativa.');
END;

CREATE TRIGGER tg_pesagem_consistencia_upd BEFORE UPDATE ON pesagem
WHEN (NEW.escore_corporal IS NULL) <> (NEW.escala_ecc IS NULL)
  OR (NEW.escala_ecc = '1_5' AND NEW.escore_corporal NOT BETWEEN 1 AND 5)
  OR (NEW.escala_ecc = '1_9' AND NEW.escore_corporal NOT BETWEEN 1 AND 9)
  OR (NEW.conferida_em IS NULL) <> (NEW.justificativa_conferencia IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'Pesagem inconsistente: escore corporal fora da escala ou conferência sem justificativa.');
END;

-- ---------------------------------------------------------------------------
-- Trilha de alterações: novas entidades e ações.
-- SQLite não altera CHECK; a tabela é recriada e todas as linhas são copiadas.
-- ---------------------------------------------------------------------------

DROP TRIGGER tg_historico_sem_alteracao;
DROP TRIGGER tg_historico_sem_exclusao;

CREATE TABLE historico_alteracao_nova (
  id TEXT PRIMARY KEY NOT NULL,
  entidade TEXT NOT NULL CHECK (entidade IN (
    'propriedade', 'area', 'raca', 'lote', 'animal', 'pesagem',
    'produto_sanitario', 'manejo_sanitario', 'agenda_sanitaria')),
  entidade_id TEXT NOT NULL,
  acao TEXT NOT NULL CHECK (acao IN (
    'criacao', 'alteracao', 'exclusao', 'transferencia', 'saida', 'encerramento', 'reabertura',
    'mudanca_area', 'importacao', 'conferencia', 'remocao_animal', 'cancelamento', 'conclusao')),
  dados_anteriores_json TEXT CHECK (dados_anteriores_json IS NULL OR json_valid(dados_anteriores_json)),
  dados_novos_json TEXT CHECK (dados_novos_json IS NULL OR json_valid(dados_novos_json)),
  motivo TEXT,
  ocorrido_em TEXT NOT NULL
) STRICT;

INSERT INTO historico_alteracao_nova
  (id, entidade, entidade_id, acao, dados_anteriores_json, dados_novos_json, motivo, ocorrido_em)
SELECT id, entidade, entidade_id, acao, dados_anteriores_json, dados_novos_json, motivo, ocorrido_em
FROM historico_alteracao;

DROP TABLE historico_alteracao;
ALTER TABLE historico_alteracao_nova RENAME TO historico_alteracao;

CREATE INDEX ix_historico_entidade ON historico_alteracao (entidade, entidade_id, ocorrido_em);

CREATE TRIGGER tg_historico_sem_alteracao BEFORE UPDATE ON historico_alteracao
BEGIN
  SELECT RAISE(ABORT, 'A trilha de alterações não pode ser modificada.');
END;

CREATE TRIGGER tg_historico_sem_exclusao BEFORE DELETE ON historico_alteracao
BEGIN
  SELECT RAISE(ABORT, 'A trilha de alterações não pode ser apagada.');
END;

-- ---------------------------------------------------------------------------
-- Produtos sanitários (catálogo do usuário). Carências copiadas da bula pelo
-- usuário; servem de sugestão ao registrar uma aplicação.
-- A ligação com o estoque entra na Fase 3.
-- ---------------------------------------------------------------------------

CREATE TABLE produto_sanitario (
  id TEXT PRIMARY KEY NOT NULL,
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 120),
  nome_normalizado TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('vacina', 'vermifugo', 'ectoparasiticida', 'antimicrobiano',
    'anti_inflamatorio', 'vitamina_mineral', 'outro')),
  fabricante TEXT CHECK (fabricante IS NULL OR length(fabricante) <= 120),
  principio_ativo TEXT CHECK (principio_ativo IS NULL OR length(principio_ativo) <= 200),
  unidade_dose TEXT CHECK (unidade_dose IS NULL OR unidade_dose IN ('ml', 'dose', 'g', 'mg', 'ui', 'unidade')),
  carencia_carne_dias INTEGER CHECK (carencia_carne_dias IS NULL OR carencia_carne_dias BETWEEN 0 AND 3650),
  carencia_leite_dias INTEGER CHECK (carencia_leite_dias IS NULL OR carencia_leite_dias BETWEEN 0 AND 3650),
  observacoes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE UNIQUE INDEX ux_produto_sanitario_nome ON produto_sanitario (nome_normalizado) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Registro sanitário: uma aplicação, exame ou tratamento, para um ou vários
-- animais. Os dados comuns ficam aqui; cada animal tratado tem uma linha em
-- evento_sanitario, para o histórico individual ficar completo.
-- ---------------------------------------------------------------------------

CREATE TABLE manejo_sanitario (
  id TEXT PRIMARY KEY NOT NULL,
  propriedade_id TEXT NOT NULL REFERENCES propriedade (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('vacinacao', 'vermifugacao', 'controle_ectoparasitas',
    'tratamento', 'exame', 'outro')),
  data TEXT NOT NULL,
  produto_id TEXT REFERENCES produto_sanitario (id),
  descricao TEXT CHECK (descricao IS NULL OR length(descricao) <= 200),
  dose REAL CHECK (dose IS NULL OR dose > 0),
  unidade_dose TEXT CHECK (unidade_dose IS NULL OR unidade_dose IN ('ml', 'dose', 'g', 'mg', 'ui', 'unidade')),
  via TEXT CHECK (via IS NULL OR via IN ('subcutanea', 'intramuscular', 'intravenosa', 'oral',
    'topica', 'pour_on', 'intramamaria', 'intranasal', 'outra')),
  abrangencia TEXT NOT NULL CHECK (abrangencia IN ('individual', 'coletiva')),
  lote_id TEXT REFERENCES lote (id),
  carencia_carne_dias INTEGER CHECK (carencia_carne_dias IS NULL OR carencia_carne_dias BETWEEN 0 AND 3650),
  carencia_leite_dias INTEGER CHECK (carencia_leite_dias IS NULL OR carencia_leite_dias BETWEEN 0 AND 3650),
  responsavel TEXT CHECK (responsavel IS NULL OR length(responsavel) <= 120),
  diagnostico TEXT CHECK (diagnostico IS NULL OR length(diagnostico) <= 500),
  -- Custo informado pelo usuário, em centavos. A ligação com o financeiro entra na Fase 4.
  custo_total_centavos INTEGER CHECK (custo_total_centavos IS NULL OR custo_total_centavos >= 0),
  observacoes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK (produto_id IS NOT NULL OR descricao IS NOT NULL),
  -- Unidade sem dose comum é permitida: as doses podem ser individuais (evento_sanitario).
  CHECK (dose IS NULL OR unidade_dose IS NOT NULL)
) STRICT;

CREATE INDEX ix_manejo_sanitario_propriedade ON manejo_sanitario (propriedade_id, data);
CREATE INDEX ix_manejo_sanitario_lote ON manejo_sanitario (lote_id);

-- Um animal tratado num registro sanitário. `dose` só é preenchida quando
-- difere da dose comum do registro (ex.: dose conforme o peso do animal).
CREATE TABLE evento_sanitario (
  id TEXT PRIMARY KEY NOT NULL,
  manejo_id TEXT NOT NULL REFERENCES manejo_sanitario (id),
  animal_id TEXT NOT NULL REFERENCES animal (id),
  dose REAL CHECK (dose IS NULL OR dose > 0),
  observacao TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE UNIQUE INDEX ux_evento_sanitario ON evento_sanitario (manejo_id, animal_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_evento_sanitario_animal ON evento_sanitario (animal_id);

-- ---------------------------------------------------------------------------
-- Agenda sanitária: próximos eventos definidos pelo usuário. Pode nascer de
-- uma aplicação ("próxima dose em") ou ser criada à parte.
-- ---------------------------------------------------------------------------

CREATE TABLE agenda_sanitaria (
  id TEXT PRIMARY KEY NOT NULL,
  propriedade_id TEXT NOT NULL REFERENCES propriedade (id),
  data_prevista TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('vacinacao', 'vermifugacao', 'controle_ectoparasitas',
    'tratamento', 'exame', 'outro')),
  produto_id TEXT REFERENCES produto_sanitario (id),
  descricao TEXT CHECK (descricao IS NULL OR length(descricao) <= 200),
  lote_id TEXT REFERENCES lote (id),
  animal_id TEXT REFERENCES animal (id),
  manejo_origem_id TEXT REFERENCES manejo_sanitario (id),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'realizado', 'cancelado')),
  manejo_realizado_id TEXT REFERENCES manejo_sanitario (id),
  data_conclusao TEXT,
  motivo_cancelamento TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK (produto_id IS NOT NULL OR descricao IS NOT NULL),
  CHECK (lote_id IS NULL OR animal_id IS NULL),
  CHECK ((status = 'pendente' AND data_conclusao IS NULL AND manejo_realizado_id IS NULL)
      OR (status = 'realizado' AND data_conclusao IS NOT NULL AND manejo_realizado_id IS NOT NULL)
      OR (status = 'cancelado' AND data_conclusao IS NOT NULL AND manejo_realizado_id IS NULL))
) STRICT;

CREATE INDEX ix_agenda_sanitaria ON agenda_sanitaria (propriedade_id, status, data_prevista);

-- Exclusão física proibida, como no rebanho.
CREATE TRIGGER tg_produto_sanitario_sem_exclusao BEFORE DELETE ON produto_sanitario
BEGIN
  SELECT RAISE(ABORT, 'Exclusão física proibida. Use exclusão lógica (deleted_at).');
END;

CREATE TRIGGER tg_manejo_sanitario_sem_exclusao BEFORE DELETE ON manejo_sanitario
BEGIN
  SELECT RAISE(ABORT, 'Exclusão física proibida. Use exclusão lógica (deleted_at).');
END;

CREATE TRIGGER tg_evento_sanitario_sem_exclusao BEFORE DELETE ON evento_sanitario
BEGIN
  SELECT RAISE(ABORT, 'Exclusão física proibida. Use exclusão lógica (deleted_at).');
END;

CREATE TRIGGER tg_agenda_sanitaria_sem_exclusao BEFORE DELETE ON agenda_sanitaria
BEGIN
  SELECT RAISE(ABORT, 'Exclusão física proibida. Use exclusão lógica (deleted_at).');
END;
