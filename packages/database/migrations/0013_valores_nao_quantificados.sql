-- Fase 5B-1. Valores não quantificados ("<0,01", "ND", "traços"): ajuste do usuário na aprovação
-- da 5A (2026-10-21). O texto publicado e o significado que a fonte dá a ele são preservados e
-- NUNCA convertidos em número, nem o limite de "<0,01". Tabela própria, sem coluna numérica:
-- nada que leia valor_nutricional os encontra. Domínio: valor-nao-quantificado.ts.
-- Nenhuma tabela existente é recriada; dois gatilhos da 0012 são substituídos para contar também
-- estes valores.

CREATE TABLE valor_nao_quantificado (
  id TEXT PRIMARY KEY NOT NULL,
  registro_id TEXT NOT NULL REFERENCES registro_composicao(id),
  nutriente_id TEXT NOT NULL REFERENCES nutriente(id),
  texto_publicado TEXT NOT NULL CHECK(length(texto_publicado) BETWEEN 1 AND 30 AND texto_publicado = trim(texto_publicado)),
  natureza TEXT NOT NULL CHECK(natureza IN ('abaixo_do_limite','acima_do_limite','nao_detectado','tracos','nao_determinado','simbolo_sem_definicao')),
  significado_fonte TEXT NOT NULL CHECK(length(trim(significado_fonte)) BETWEEN 1 AND 500),
  unidade TEXT NOT NULL CHECK(unidade IN ('pct','g_kg','mg_kg','ppm','mcal_kg','ui_kg')),
  base TEXT NOT NULL CHECK(base IN ('ms','mn')),
  tipo_valor TEXT NOT NULL CHECK(tipo_valor IN ('valor_unico','media','mediana')),
  metodo_analitico_fonte TEXT CHECK(metodo_analitico_fonte IS NULL OR length(trim(metodo_analitico_fonte)) BETWEEN 1 AND 500),
  referencia_local TEXT CHECK(referencia_local IS NULL OR length(trim(referencia_local)) BETWEEN 1 AND 200),
  observacao TEXT CHECK(observacao IS NULL OR length(trim(observacao)) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  -- Limite com o símbolo da fonte; as demais naturezas sem símbolo de comparação.
  CHECK(natureza <> 'abaixo_do_limite' OR substr(texto_publicado, 1, 1) IN ('<','≤')),
  CHECK(natureza <> 'acima_do_limite' OR substr(texto_publicado, 1, 1) IN ('>','≥')),
  CHECK(natureza IN ('abaixo_do_limite','acima_do_limite') OR substr(texto_publicado, 1, 1) NOT IN ('<','≤','>','≥'))
) STRICT;
CREATE UNIQUE INDEX ux_valor_nao_quantificado ON valor_nao_quantificado(registro_id, nutriente_id, tipo_valor, base) WHERE deleted_at IS NULL;
CREATE INDEX ix_valor_nao_quantificado_nutriente ON valor_nao_quantificado(nutriente_id) WHERE deleted_at IS NULL;

CREATE TRIGGER tg_vnq_sem_exclusao BEFORE DELETE ON valor_nao_quantificado BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;

-- Mesmas regras de vida do valor numérico: só em rascunho, com definição ativa.
CREATE TRIGGER tg_vnq_insercao BEFORE INSERT ON valor_nao_quantificado
WHEN NOT EXISTS(SELECT 1 FROM registro_composicao r WHERE r.id = NEW.registro_id AND r.status = 'rascunho' AND r.deleted_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM nutriente n WHERE n.id = NEW.nutriente_id AND n.ativo = 1)
  OR NEW.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Valores só entram em registro em rascunho, com definição de nutriente ativa.'); END;
CREATE TRIGGER tg_vnq_alteracao BEFORE UPDATE ON valor_nao_quantificado
WHEN OLD.deleted_at IS NOT NULL OR NEW.id <> OLD.id OR NEW.registro_id <> OLD.registro_id OR NEW.created_at <> OLD.created_at
  OR NOT EXISTS(SELECT 1 FROM registro_composicao r WHERE r.id = OLD.registro_id AND r.status = 'rascunho' AND r.deleted_at IS NULL)
  OR (NEW.nutriente_id <> OLD.nutriente_id AND NOT EXISTS(SELECT 1 FROM nutriente n WHERE n.id = NEW.nutriente_id AND n.ativo = 1))
BEGIN SELECT RAISE(ABORT,'Valores só mudam em registro em rascunho. Conferido: crie uma nova versão.'); END;

-- Unidade da mesma grandeza da definição; só tabela, estudo e laudo; laudo sem mediana.
CREATE TRIGGER tg_vnq_regras_insercao BEFORE INSERT ON valor_nao_quantificado
WHEN (CASE NEW.unidade WHEN 'pct' THEN 'f' WHEN 'g_kg' THEN 'f' WHEN 'mg_kg' THEN 'f' WHEN 'ppm' THEN 'f' WHEN 'mcal_kg' THEN 'e' ELSE 'a' END)
  <> (SELECT CASE n.unidade_referencia WHEN 'pct' THEN 'f' WHEN 'g_kg' THEN 'f' WHEN 'mg_kg' THEN 'f' WHEN 'ppm' THEN 'f' WHEN 'mcal_kg' THEN 'e' ELSE 'a' END FROM nutriente n WHERE n.id = NEW.nutriente_id)
  OR (SELECT f.origem FROM registro_composicao r JOIN fonte f ON f.id = r.fonte_id WHERE r.id = NEW.registro_id) NOT IN ('tabela_compilada','estudo_individual','laboratorial')
  OR ((SELECT f.origem FROM registro_composicao r JOIN fonte f ON f.id = r.fonte_id WHERE r.id = NEW.registro_id) = 'laboratorial' AND NEW.tipo_valor = 'mediana')
BEGIN SELECT RAISE(ABORT,'Valor não quantificado incompatível com a definição ou com a origem.'); END;
CREATE TRIGGER tg_vnq_regras_alteracao BEFORE UPDATE ON valor_nao_quantificado
WHEN NEW.deleted_at IS NULL AND (
  (CASE NEW.unidade WHEN 'pct' THEN 'f' WHEN 'g_kg' THEN 'f' WHEN 'mg_kg' THEN 'f' WHEN 'ppm' THEN 'f' WHEN 'mcal_kg' THEN 'e' ELSE 'a' END)
  <> (SELECT CASE n.unidade_referencia WHEN 'pct' THEN 'f' WHEN 'g_kg' THEN 'f' WHEN 'mg_kg' THEN 'f' WHEN 'ppm' THEN 'f' WHEN 'mcal_kg' THEN 'e' ELSE 'a' END FROM nutriente n WHERE n.id = NEW.nutriente_id)
  OR ((SELECT f.origem FROM registro_composicao r JOIN fonte f ON f.id = r.fonte_id WHERE r.id = NEW.registro_id) = 'laboratorial' AND NEW.tipo_valor = 'mediana'))
BEGIN SELECT RAISE(ABORT,'Valor não quantificado incompatível com a definição ou com a origem.'); END;

-- Um nutriente, tipo e base por registro: ou número, ou não quantificado, nunca os dois.
CREATE TRIGGER tg_vnq_exclusivo_insercao BEFORE INSERT ON valor_nao_quantificado
WHEN EXISTS(SELECT 1 FROM valor_nutricional v WHERE v.registro_id = NEW.registro_id AND v.nutriente_id = NEW.nutriente_id
  AND v.tipo_valor = NEW.tipo_valor AND v.base = NEW.base AND v.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'O registro já tem valor numérico para o mesmo nutriente, tipo e base.'); END;
CREATE TRIGGER tg_vnq_exclusivo_alteracao BEFORE UPDATE ON valor_nao_quantificado
WHEN NEW.deleted_at IS NULL AND EXISTS(SELECT 1 FROM valor_nutricional v WHERE v.registro_id = NEW.registro_id AND v.nutriente_id = NEW.nutriente_id
  AND v.tipo_valor = NEW.tipo_valor AND v.base = NEW.base AND v.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'O registro já tem valor numérico para o mesmo nutriente, tipo e base.'); END;
CREATE TRIGGER tg_valor_exclusivo_insercao BEFORE INSERT ON valor_nutricional
WHEN EXISTS(SELECT 1 FROM valor_nao_quantificado q WHERE q.registro_id = NEW.registro_id AND q.nutriente_id = NEW.nutriente_id
  AND q.tipo_valor = NEW.tipo_valor AND q.base = NEW.base AND q.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'O registro já tem valor não quantificado para o mesmo nutriente, tipo e base.'); END;
CREATE TRIGGER tg_valor_exclusivo_alteracao BEFORE UPDATE ON valor_nutricional
WHEN NEW.deleted_at IS NULL AND EXISTS(SELECT 1 FROM valor_nao_quantificado q WHERE q.registro_id = NEW.registro_id AND q.nutriente_id = NEW.nutriente_id
  AND q.tipo_valor = NEW.tipo_valor AND q.base = NEW.base AND q.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'O registro já tem valor não quantificado para o mesmo nutriente, tipo e base.'); END;

-- Substituições: transcrever exige ao menos um valor de qualquer tipo; definição com valores de
-- qualquer tipo fica congelada (mesmas mensagens da 0012).
DROP TRIGGER tg_registro_transcricao_sem_valores;
CREATE TRIGGER tg_registro_transcricao_sem_valores BEFORE UPDATE OF status ON registro_composicao
WHEN OLD.status = 'rascunho' AND NEW.status = 'transcrito'
  AND NOT EXISTS(SELECT 1 FROM valor_nutricional v WHERE v.registro_id = NEW.id AND v.deleted_at IS NULL)
  AND NOT EXISTS(SELECT 1 FROM valor_nao_quantificado q WHERE q.registro_id = NEW.id AND q.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Registro sem valores não é transcrito.'); END;

DROP TRIGGER tg_nutriente_com_valores;
CREATE TRIGGER tg_nutriente_com_valores BEFORE UPDATE ON nutriente
WHEN (NEW.grupo <> OLD.grupo OR NEW.unidade_referencia <> OLD.unidade_referencia OR NEW.base_referencia <> OLD.base_referencia
     OR NEW.metodo_analitico IS NOT OLD.metodo_analitico OR NEW.situacao_fundamentacao <> OLD.situacao_fundamentacao
     OR NEW.fundamentacao_fonte_id IS NOT OLD.fundamentacao_fonte_id OR NEW.fundamentacao_referencia IS NOT OLD.fundamentacao_referencia)
  AND (EXISTS(SELECT 1 FROM valor_nutricional v WHERE v.nutriente_id = OLD.id AND v.deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM valor_nao_quantificado q WHERE q.nutriente_id = OLD.id AND q.deleted_at IS NULL))
BEGIN SELECT RAISE(ABORT,'Definição com valores não muda grupo, unidade, base, método nem fundamentação: cadastre a variante como nova definição.'); END;
