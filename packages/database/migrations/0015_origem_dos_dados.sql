-- Fase 5C-1. Origem dos dados (decisões do usuário ao autorizar a 5C, 2026-10-21):
-- 1. forma de obtenção de cada valor numérico: medido, calculado, estimado por equação, estimado
--    por NIR ou não informado (padrão: nada é presumido medido);
-- 2. vínculo entre registros que podem compartilhar a mesma origem experimental (ex.: tabela
--    compilada que contém os dados de um estudo também cadastrado). Vinculados não são
--    independentes até o usuário descartar o vínculo. Domínio: origem-dados.ts.
-- Nenhuma tabela existente é recriada; valor_nutricional ganha duas colunas.

ALTER TABLE valor_nutricional ADD COLUMN forma_obtencao TEXT NOT NULL DEFAULT 'nao_informado'
  CHECK(forma_obtencao IN ('medido','calculado','estimado_equacao','estimado_nir','nao_informado'));
ALTER TABLE valor_nutricional ADD COLUMN descricao_obtencao TEXT
  CHECK(descricao_obtencao IS NULL OR length(trim(descricao_obtencao)) BETWEEN 1 AND 500);

-- Cálculo e equação só são rastreáveis com a descrição como a fonte informa.
CREATE TRIGGER tg_valor_obtencao_insercao BEFORE INSERT ON valor_nutricional
WHEN NEW.forma_obtencao IN ('calculado','estimado_equacao') AND NEW.descricao_obtencao IS NULL
BEGIN SELECT RAISE(ABORT,'Valor calculado ou estimado por equação exige a descrição da obtenção.'); END;
CREATE TRIGGER tg_valor_obtencao_alteracao BEFORE UPDATE OF forma_obtencao, descricao_obtencao ON valor_nutricional
WHEN NEW.forma_obtencao IN ('calculado','estimado_equacao') AND NEW.descricao_obtencao IS NULL
BEGIN SELECT RAISE(ABORT,'Valor calculado ou estimado por equação exige a descrição da obtenção.'); END;

-- Vínculo declarado entre "este" registro e o "outro". O outro é identificado pela fonte e pela
-- página ou tabela; enquanto não estiver no banco (pacote ainda não importado), relacionado_id
-- fica vazio e é preenchido quando aparecer.
CREATE TABLE vinculo_registro (
  id TEXT PRIMARY KEY NOT NULL,
  registro_id TEXT NOT NULL REFERENCES registro_composicao(id),
  relacionado_id TEXT REFERENCES registro_composicao(id),
  alvo_fonte_codigo TEXT NOT NULL CHECK(length(alvo_fonte_codigo) BETWEEN 1 AND 30 AND alvo_fonte_codigo = upper(alvo_fonte_codigo)),
  alvo_referencia_local TEXT NOT NULL CHECK(length(trim(alvo_referencia_local)) BETWEEN 1 AND 200),
  relacao TEXT NOT NULL CHECK(relacao IN ('mesmos_valores','outro_inclui_este','outro_pode_incluir_este','mesmo_experimento_provavel')),
  evidencia TEXT NOT NULL CHECK(length(trim(evidencia)) BETWEEN 1 AND 2000),
  pacote_codigo TEXT CHECK(pacote_codigo IS NULL OR length(pacote_codigo) BETWEEN 1 AND 30),
  situacao TEXT NOT NULL CHECK(situacao IN ('a_confirmar','confirmado','descartado')),
  decidido_por TEXT CHECK(decidido_por IS NULL OR length(trim(decidido_por)) BETWEEN 1 AND 120),
  decidido_em TEXT,
  motivo_decisao TEXT CHECK(motivo_decisao IS NULL OR length(trim(motivo_decisao)) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT CHECK(deleted_at IS NULL),
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK(relacionado_id IS NULL OR relacionado_id <> registro_id),
  CHECK((situacao = 'a_confirmar') = (decidido_por IS NULL AND decidido_em IS NULL)),
  CHECK(situacao <> 'descartado' OR motivo_decisao IS NOT NULL)
) STRICT;
CREATE UNIQUE INDEX ux_vinculo_registro ON vinculo_registro(registro_id, alvo_fonte_codigo, alvo_referencia_local, relacao);
CREATE INDEX ix_vinculo_relacionado ON vinculo_registro(relacionado_id);
CREATE INDEX ix_vinculo_alvo ON vinculo_registro(alvo_fonte_codigo, alvo_referencia_local) WHERE relacionado_id IS NULL;

CREATE TRIGGER tg_vinculo_sem_exclusao BEFORE DELETE ON vinculo_registro BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_vinculo_insercao BEFORE INSERT ON vinculo_registro
WHEN NEW.situacao <> 'a_confirmar'
BEGIN SELECT RAISE(ABORT,'Vínculo nasce a confirmar.'); END;
-- Só muda: o relacionado, de vazio para o registro encontrado; e a decisão do usuário, uma vez.
CREATE TRIGGER tg_vinculo_alteracao BEFORE UPDATE ON vinculo_registro
WHEN NEW.id <> OLD.id OR NEW.registro_id <> OLD.registro_id OR NEW.alvo_fonte_codigo <> OLD.alvo_fonte_codigo
  OR NEW.alvo_referencia_local <> OLD.alvo_referencia_local OR NEW.relacao <> OLD.relacao
  OR NEW.evidencia <> OLD.evidencia OR NEW.pacote_codigo IS NOT OLD.pacote_codigo OR NEW.created_at <> OLD.created_at
  OR (OLD.relacionado_id IS NOT NULL AND NEW.relacionado_id IS NOT OLD.relacionado_id)
  OR (OLD.situacao <> 'a_confirmar' AND (NEW.situacao <> OLD.situacao OR NEW.decidido_por IS NOT OLD.decidido_por
      OR NEW.decidido_em IS NOT OLD.decidido_em OR NEW.motivo_decisao IS NOT OLD.motivo_decisao))
BEGIN SELECT RAISE(ABORT,'O vínculo só recebe o registro relacionado e a decisão do usuário, uma vez.'); END;
