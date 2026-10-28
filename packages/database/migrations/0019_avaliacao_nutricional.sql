-- Fase 6B-4 (A-6B-01 a 07; C-6B-01, C-6B-05 e C-6B-08): avaliação nutricional imutável.
-- Grava, só por ação do usuário, o retrato completo de uma avaliação de dieta: entrada (animal,
-- CMS previsto escolhido, dieta), hipóteses, perfis com os valores efetivamente usados (unidade,
-- base, tipo, forma de obtenção, natureza, origens, elegibilidade, avisos e fontes), versões
-- (motor, obra e edição, regra de seleção, aprovação de cada equação) e resultados (CMS previsto,
-- exigências, oferta e balanço), separados como foram calculados (regra 3e). Nada é recalculado
-- ao ler: o que muda depois nos perfis, registros ou no motor não altera a avaliação gravada.
-- Conteúdo em JSON, validado no banco; SHA-256 do conteúdo gravado para conferir a integridade.
-- Sem alteração nem exclusão. Nenhuma tabela existente muda.

CREATE TABLE avaliacao_nutricional (
  id TEXT PRIMARY KEY NOT NULL,
  rotulo TEXT NOT NULL CHECK(length(trim(rotulo)) BETWEEN 1 AND 120 AND rotulo = trim(rotulo)),
  observacao TEXT CHECK(observacao IS NULL OR (length(trim(observacao)) BETWEEN 1 AND 1000 AND observacao = trim(observacao))),
  -- Versão do formato do retrato (o que cada coluna JSON contém); 1 na 6B-4.
  formato_versao INTEGER NOT NULL CHECK(formato_versao >= 1),
  versao_motor TEXT NOT NULL CHECK(length(versao_motor) BETWEEN 1 AND 30),
  tipo_quantidade TEXT NOT NULL CHECK(tipo_quantidade IN ('oferecido','consumo_observado','consumo_assumido_sem_sobras')),
  -- Obra, edição, ano e DOI do modelo de exigências.
  fonte_json TEXT NOT NULL CHECK(json_valid(fonte_json) AND json_type(fonte_json) = 'object'),
  entrada_json TEXT NOT NULL CHECK(json_valid(entrada_json) AND json_type(entrada_json) = 'object'),
  hipoteses_json TEXT NOT NULL CHECK(json_valid(hipoteses_json) AND json_type(hipoteses_json) = 'object'),
  perfis_json TEXT NOT NULL CHECK(json_valid(perfis_json) AND json_type(perfis_json) = 'array' AND json_array_length(perfis_json) >= 1),
  resultado_json TEXT NOT NULL CHECK(json_valid(resultado_json) AND json_type(resultado_json) = 'object'),
  conteudo_sha256 TEXT NOT NULL CHECK(length(conteudo_sha256) = 64 AND conteudo_sha256 NOT GLOB '*[^0-9a-f]*'),
  registrado_por TEXT NOT NULL CHECK(length(trim(registrado_por)) BETWEEN 1 AND 120),
  registrado_em TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT CHECK(deleted_at IS NULL),
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX ix_avaliacao_nutricional_registro ON avaliacao_nutricional(registrado_em);

-- Perfis usados, para consulta e para a chave estrangeira (o perfil gravado existe e é imutável).
CREATE TABLE avaliacao_nutricional_perfil (
  id TEXT PRIMARY KEY NOT NULL,
  avaliacao_id TEXT NOT NULL REFERENCES avaliacao_nutricional(id),
  perfil_id TEXT NOT NULL REFERENCES perfil_composicao(id),
  ordem INTEGER NOT NULL CHECK(ordem >= 1),
  elegivel INTEGER NOT NULL CHECK(elegivel IN (0, 1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT CHECK(deleted_at IS NULL),
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX ux_avaliacao_perfil ON avaliacao_nutricional_perfil(avaliacao_id, perfil_id);
CREATE UNIQUE INDEX ux_avaliacao_perfil_ordem ON avaliacao_nutricional_perfil(avaliacao_id, ordem);
CREATE INDEX ix_avaliacao_perfil_perfil ON avaliacao_nutricional_perfil(perfil_id);

CREATE TRIGGER tg_avaliacao_nutricional_sem_exclusao BEFORE DELETE ON avaliacao_nutricional
BEGIN SELECT RAISE(ABORT,'Avaliação nutricional não é excluída.'); END;
CREATE TRIGGER tg_avaliacao_nutricional_imutavel BEFORE UPDATE ON avaliacao_nutricional
BEGIN SELECT RAISE(ABORT,'Avaliação nutricional é imutável: grave outra.'); END;
CREATE TRIGGER tg_avaliacao_perfil_sem_exclusao BEFORE DELETE ON avaliacao_nutricional_perfil
BEGIN SELECT RAISE(ABORT,'Avaliação nutricional não é excluída.'); END;
CREATE TRIGGER tg_avaliacao_perfil_imutavel BEFORE UPDATE ON avaliacao_nutricional_perfil
BEGIN SELECT RAISE(ABORT,'Avaliação nutricional é imutável: grave outra.'); END;
-- O perfil listado tem de estar no retrato, na mesma posição.
CREATE TRIGGER tg_avaliacao_perfil_coerente BEFORE INSERT ON avaliacao_nutricional_perfil
WHEN NOT EXISTS(SELECT 1 FROM avaliacao_nutricional a, json_each(a.perfis_json) p
  WHERE a.id = NEW.avaliacao_id AND p.key = NEW.ordem - 1
    AND json_extract(p.value, '$.perfilId') = NEW.perfil_id
    AND json_extract(p.value, '$.elegivel') = NEW.elegivel)
BEGIN SELECT RAISE(ABORT,'Perfil fora do retrato da avaliação.'); END;
