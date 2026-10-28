-- Fase 6B (decisão D-6B1-04; D-6B3-05 aprovada em 2026-10-26): identificação explícita de PB
-- equivalente de nitrogênio não proteico (NNP), sem dupla contagem com a PB total.
-- 1. natureza_valor em nutriente: metadado explícito do que o número representa.
--    'fracao_massica' (padrão): massa do nutriente por massa do alimento, de 0 a 100 %.
--    'equivalente_proteico': PB total, N × 6,25; pode passar de 100 % (ex.: ureia).
--    'equivalente_proteico_nnp': parcela da PB total que vem de NNP (N × 6,25); está CONTIDA na
--    PB total, nunca somada a ela.
-- 2. PB (definição do sistema) passa a 'equivalente_proteico': a PB é N × 6,25 por definição.
-- 3. Definição do sistema PBeqNNP, com identificador fixo (como a FDNcp da migration 0014).
-- 4. valor_nutricional é reconstruída, só para trocar o teto fixo de 100 % (CHECK da 0012, que
--    não se altera no lugar) por gatilhos que consultam a natureza da definição. Todas as linhas
--    são copiadas com o mesmo rowid; índices e gatilhos são recriados com o texto da versão 17.
--    As chaves estrangeiras que apontam para valor_nutricional (avaliacao_cientifica e
--    perfil_valor_origem) ficam adiadas até o fim da transação da migration e voltam a casar.
-- Nenhuma fonte, alimento, registro, valor ou perfil é criado, alterado ou excluído.

ALTER TABLE nutriente ADD COLUMN natureza_valor TEXT NOT NULL DEFAULT 'fracao_massica'
  CHECK(natureza_valor IN ('fracao_massica','equivalente_proteico','equivalente_proteico_nnp'));

UPDATE nutriente SET natureza_valor = 'equivalente_proteico'
  WHERE id = '01929c20-0000-7000-8000-000000000004';

INSERT INTO nutriente(id,codigo,codigo_normalizado,nome,grupo,unidade_referencia,base_referencia,metodo_analitico,situacao_fundamentacao,direcao_conservadora,origem_definicao,descricao,natureza_valor,created_at,updated_at) VALUES
('01929c20-0000-7000-8000-000000000013','PBeqNNP','PBEQNNP','Proteína bruta equivalente de nitrogênio não proteico (N × 6,25)','proteina','pct','ms',NULL,'pendente','menor','sistema','Parcela da PB total que vem de nitrogênio não proteico; está contida na PB total e não é proteína verdadeira nem PM.','equivalente_proteico_nnp','2026-10-26T00:00:00.000Z','2026-10-26T00:00:00.000Z');

-- Só a definição do sistema PBeqNNP tem essa natureza; a PB do sistema é a única
-- 'equivalente_proteico'. Definições do usuário continuam fração mássica.
CREATE TRIGGER tg_nutriente_natureza_insercao BEFORE INSERT ON nutriente
WHEN NEW.natureza_valor <> 'fracao_massica'
BEGIN SELECT RAISE(ABORT,'Natureza de valor reservada às definições do sistema.'); END;
CREATE TRIGGER tg_nutriente_natureza_alteracao BEFORE UPDATE OF natureza_valor ON nutriente
WHEN NEW.natureza_valor IS NOT OLD.natureza_valor
BEGIN SELECT RAISE(ABORT,'A natureza do valor de uma definição não muda.'); END;

-- Reconstrução de valor_nutricional.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE _valor_nutricional_0017 AS SELECT rowid AS rowid_original, * FROM valor_nutricional;
DROP TABLE valor_nutricional;
CREATE TABLE valor_nutricional (
  id TEXT PRIMARY KEY NOT NULL,
  registro_id TEXT NOT NULL REFERENCES registro_composicao(id),
  nutriente_id TEXT NOT NULL REFERENCES nutriente(id),
  valor_publicado TEXT NOT NULL CHECK(length(valor_publicado) BETWEEN 1 AND 30 AND valor_publicado GLOB '*[0-9]*' AND valor_publicado NOT GLOB '*[^0-9.,-]*'),
  valor REAL NOT NULL,
  unidade TEXT NOT NULL CHECK(unidade IN ('pct','g_kg','mg_kg','ppm','mcal_kg','ui_kg')),
  base TEXT NOT NULL CHECK(base IN ('ms','mn')),
  tipo_valor TEXT NOT NULL CHECK(tipo_valor IN ('valor_unico','media','mediana','minimo_garantido','maximo_garantido')),
  desvio_padrao_publicado TEXT CHECK(desvio_padrao_publicado IS NULL OR (length(desvio_padrao_publicado) BETWEEN 1 AND 30 AND desvio_padrao_publicado GLOB '*[0-9]*' AND desvio_padrao_publicado NOT GLOB '*[^0-9.,]*')),
  desvio_padrao REAL CHECK(desvio_padrao IS NULL OR desvio_padrao >= 0),
  minimo_publicado TEXT CHECK(minimo_publicado IS NULL OR (length(minimo_publicado) BETWEEN 1 AND 30 AND minimo_publicado GLOB '*[0-9]*' AND minimo_publicado NOT GLOB '*[^0-9.,-]*')),
  minimo REAL,
  maximo_publicado TEXT CHECK(maximo_publicado IS NULL OR (length(maximo_publicado) BETWEEN 1 AND 30 AND maximo_publicado GLOB '*[0-9]*' AND maximo_publicado NOT GLOB '*[^0-9.,-]*')),
  maximo REAL,
  n_observacoes INTEGER CHECK(n_observacoes IS NULL OR n_observacoes >= 1),
  metodo_analitico_fonte TEXT CHECK(metodo_analitico_fonte IS NULL OR length(trim(metodo_analitico_fonte)) BETWEEN 1 AND 500),
  referencia_local TEXT CHECK(referencia_local IS NULL OR length(trim(referencia_local)) BETWEEN 1 AND 200),
  observacao TEXT CHECK(observacao IS NULL OR length(trim(observacao)) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0, forma_obtencao TEXT NOT NULL DEFAULT 'nao_informado'
  CHECK(forma_obtencao IN ('medido','calculado','estimado_equacao','estimado_nir','nao_informado')), descricao_obtencao TEXT
  CHECK(descricao_obtencao IS NULL OR length(trim(descricao_obtencao)) BETWEEN 1 AND 500), interpretacao_base TEXT
  CHECK(interpretacao_base IS NULL OR length(trim(interpretacao_base)) BETWEEN 1 AND 500),
  CHECK((desvio_padrao_publicado IS NULL) = (desvio_padrao IS NULL)),
  CHECK((minimo_publicado IS NULL) = (minimo IS NULL)),
  CHECK((maximo_publicado IS NULL) = (maximo IS NULL)),
  CHECK(minimo IS NULL OR maximo IS NULL OR minimo <= maximo),
  -- Faixas pela definição da unidade (domínio: DEFINICOES_UNIDADE).
  -- Migration 0018: o teto da fração mássica (100 %, 1.000 g/kg, 1.000.000 mg/kg) depende da
  -- natureza da definição e passou para os gatilhos tg_valor_faixa_*; aqui fica o piso (>= 0).
  CHECK(unidade = 'mcal_kg' OR (valor >= 0 AND coalesce(minimo, 0) >= 0 AND coalesce(maximo, 0) >= 0))
) STRICT;
INSERT INTO valor_nutricional(rowid, id, registro_id, nutriente_id, valor_publicado, valor, unidade, base, tipo_valor, desvio_padrao_publicado, desvio_padrao, minimo_publicado, minimo, maximo_publicado, maximo, n_observacoes, metodo_analitico_fonte, referencia_local, observacao, created_at, updated_at, deleted_at, sync_version, forma_obtencao, descricao_obtencao, interpretacao_base)
  SELECT rowid_original, id, registro_id, nutriente_id, valor_publicado, valor, unidade, base, tipo_valor, desvio_padrao_publicado, desvio_padrao, minimo_publicado, minimo, maximo_publicado, maximo, n_observacoes, metodo_analitico_fonte, referencia_local, observacao, created_at, updated_at, deleted_at, sync_version, forma_obtencao, descricao_obtencao, interpretacao_base FROM _valor_nutricional_0017 ORDER BY rowid_original;
DROP TABLE _valor_nutricional_0017;
CREATE UNIQUE INDEX ux_valor_nutricional ON valor_nutricional(registro_id, nutriente_id, tipo_valor, base) WHERE deleted_at IS NULL;
CREATE INDEX ix_valor_nutriente ON valor_nutricional(nutriente_id) WHERE deleted_at IS NULL;

CREATE TRIGGER tg_valor_alteracao BEFORE UPDATE ON valor_nutricional
WHEN OLD.deleted_at IS NOT NULL OR NEW.id <> OLD.id OR NEW.registro_id <> OLD.registro_id OR NEW.created_at <> OLD.created_at
  OR NOT EXISTS(SELECT 1 FROM registro_composicao r WHERE r.id = OLD.registro_id AND r.status = 'rascunho' AND r.deleted_at IS NULL)
  OR (NEW.nutriente_id <> OLD.nutriente_id AND NOT EXISTS(SELECT 1 FROM nutriente n WHERE n.id = NEW.nutriente_id AND n.ativo = 1))
BEGIN SELECT RAISE(ABORT,'Valores só mudam em registro em rascunho. Conferido: crie uma nova versão.'); END;
CREATE TRIGGER tg_valor_exclusivo_alteracao BEFORE UPDATE ON valor_nutricional
WHEN NEW.deleted_at IS NULL AND EXISTS(SELECT 1 FROM valor_nao_quantificado q WHERE q.registro_id = NEW.registro_id AND q.nutriente_id = NEW.nutriente_id
  AND q.tipo_valor = NEW.tipo_valor AND q.base = NEW.base AND q.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'O registro já tem valor não quantificado para o mesmo nutriente, tipo e base.'); END;
CREATE TRIGGER tg_valor_exclusivo_insercao BEFORE INSERT ON valor_nutricional
WHEN EXISTS(SELECT 1 FROM valor_nao_quantificado q WHERE q.registro_id = NEW.registro_id AND q.nutriente_id = NEW.nutriente_id
  AND q.tipo_valor = NEW.tipo_valor AND q.base = NEW.base AND q.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'O registro já tem valor não quantificado para o mesmo nutriente, tipo e base.'); END;
CREATE TRIGGER tg_valor_insercao BEFORE INSERT ON valor_nutricional
WHEN NOT EXISTS(SELECT 1 FROM registro_composicao r WHERE r.id = NEW.registro_id AND r.status = 'rascunho' AND r.deleted_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM nutriente n WHERE n.id = NEW.nutriente_id AND n.ativo = 1)
  OR NEW.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Valores só entram em registro em rascunho, com definição de nutriente ativa.'); END;
CREATE TRIGGER tg_valor_obtencao_alteracao BEFORE UPDATE OF forma_obtencao, descricao_obtencao ON valor_nutricional
WHEN NEW.forma_obtencao IN ('calculado','estimado_equacao') AND NEW.descricao_obtencao IS NULL
BEGIN SELECT RAISE(ABORT,'Valor calculado ou estimado por equação exige a descrição da obtenção.'); END;
CREATE TRIGGER tg_valor_obtencao_insercao BEFORE INSERT ON valor_nutricional
WHEN NEW.forma_obtencao IN ('calculado','estimado_equacao') AND NEW.descricao_obtencao IS NULL
BEGIN SELECT RAISE(ABORT,'Valor calculado ou estimado por equação exige a descrição da obtenção.'); END;
CREATE TRIGGER tg_valor_regras_alteracao BEFORE UPDATE ON valor_nutricional
WHEN NEW.deleted_at IS NULL AND (
  (CASE NEW.unidade WHEN 'pct' THEN 'f' WHEN 'g_kg' THEN 'f' WHEN 'mg_kg' THEN 'f' WHEN 'ppm' THEN 'f' WHEN 'mcal_kg' THEN 'e' ELSE 'a' END)
  <> (SELECT CASE n.unidade_referencia WHEN 'pct' THEN 'f' WHEN 'g_kg' THEN 'f' WHEN 'mg_kg' THEN 'f' WHEN 'ppm' THEN 'f' WHEN 'mcal_kg' THEN 'e' ELSE 'a' END FROM nutriente n WHERE n.id = NEW.nutriente_id)
  OR ((SELECT f.origem FROM registro_composicao r JOIN fonte f ON f.id = r.fonte_id WHERE r.id = NEW.registro_id) = 'rotulo_comercial')
     <> (NEW.tipo_valor IN ('minimo_garantido','maximo_garantido'))
  OR (NEW.tipo_valor IN ('minimo_garantido','maximo_garantido') AND NEW.base <> 'mn')
  OR ((SELECT f.origem FROM registro_composicao r JOIN fonte f ON f.id = r.fonte_id WHERE r.id = NEW.registro_id) IN ('laboratorial','medicao_propria') AND NEW.tipo_valor NOT IN ('valor_unico','media'))
  OR ((SELECT f.origem FROM registro_composicao r JOIN fonte f ON f.id = r.fonte_id WHERE r.id = NEW.registro_id) = 'medicao_propria'
      AND (SELECT n.grupo FROM nutriente n WHERE n.id = NEW.nutriente_id) <> 'fracao_seca'))
BEGIN SELECT RAISE(ABORT,'Valor incompatível com a definição ou com a origem (unidade, garantia de rótulo, base ou matéria seca da medição própria).'); END;
CREATE TRIGGER tg_valor_regras_insercao BEFORE INSERT ON valor_nutricional
WHEN (CASE NEW.unidade WHEN 'pct' THEN 'f' WHEN 'g_kg' THEN 'f' WHEN 'mg_kg' THEN 'f' WHEN 'ppm' THEN 'f' WHEN 'mcal_kg' THEN 'e' ELSE 'a' END)
  <> (SELECT CASE n.unidade_referencia WHEN 'pct' THEN 'f' WHEN 'g_kg' THEN 'f' WHEN 'mg_kg' THEN 'f' WHEN 'ppm' THEN 'f' WHEN 'mcal_kg' THEN 'e' ELSE 'a' END FROM nutriente n WHERE n.id = NEW.nutriente_id)
  OR ((SELECT f.origem FROM registro_composicao r JOIN fonte f ON f.id = r.fonte_id WHERE r.id = NEW.registro_id) = 'rotulo_comercial')
     <> (NEW.tipo_valor IN ('minimo_garantido','maximo_garantido'))
  OR (NEW.tipo_valor IN ('minimo_garantido','maximo_garantido') AND NEW.base <> 'mn')
  OR ((SELECT f.origem FROM registro_composicao r JOIN fonte f ON f.id = r.fonte_id WHERE r.id = NEW.registro_id) IN ('laboratorial','medicao_propria') AND NEW.tipo_valor NOT IN ('valor_unico','media'))
  OR ((SELECT f.origem FROM registro_composicao r JOIN fonte f ON f.id = r.fonte_id WHERE r.id = NEW.registro_id) = 'medicao_propria'
      AND (SELECT n.grupo FROM nutriente n WHERE n.id = NEW.nutriente_id) <> 'fracao_seca')
BEGIN SELECT RAISE(ABORT,'Valor incompatível com a definição ou com a origem (unidade, garantia de rótulo, base ou matéria seca da medição própria).'); END;
CREATE TRIGGER tg_valor_sem_exclusao BEFORE DELETE ON valor_nutricional BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;

-- Teto da fração mássica pela natureza da definição (equivalente proteico só tem o piso).
CREATE TRIGGER tg_valor_faixa_insercao BEFORE INSERT ON valor_nutricional
WHEN (SELECT n.natureza_valor FROM nutriente n WHERE n.id = NEW.nutriente_id) = 'fracao_massica'
  AND (CASE NEW.unidade WHEN 'pct' THEN 100 WHEN 'g_kg' THEN 1000 WHEN 'mg_kg' THEN 1000000 WHEN 'ppm' THEN 1000000 END) IS NOT NULL
  AND max(NEW.valor, coalesce(NEW.minimo, 0), coalesce(NEW.maximo, 0))
      > (CASE NEW.unidade WHEN 'pct' THEN 100 WHEN 'g_kg' THEN 1000 WHEN 'mg_kg' THEN 1000000 WHEN 'ppm' THEN 1000000 END)
BEGIN SELECT RAISE(ABORT,'Valor acima do teto da unidade para fração mássica (só equivalente proteico passa de 100 %).'); END;
CREATE TRIGGER tg_valor_faixa_alteracao BEFORE UPDATE ON valor_nutricional
WHEN NEW.deleted_at IS NULL AND (SELECT n.natureza_valor FROM nutriente n WHERE n.id = NEW.nutriente_id) = 'fracao_massica'
  AND (CASE NEW.unidade WHEN 'pct' THEN 100 WHEN 'g_kg' THEN 1000 WHEN 'mg_kg' THEN 1000000 WHEN 'ppm' THEN 1000000 END) IS NOT NULL
  AND max(NEW.valor, coalesce(NEW.minimo, 0), coalesce(NEW.maximo, 0))
      > (CASE NEW.unidade WHEN 'pct' THEN 100 WHEN 'g_kg' THEN 1000 WHEN 'mg_kg' THEN 1000000 WHEN 'ppm' THEN 1000000 END)
BEGIN SELECT RAISE(ABORT,'Valor acima do teto da unidade para fração mássica (só equivalente proteico passa de 100 %).'); END;
