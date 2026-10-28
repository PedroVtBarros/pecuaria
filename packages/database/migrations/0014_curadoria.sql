-- Fase 5B-2. Importação de pacotes de curadoria e a definição FDNcp.
-- O pacote (valores transcritos de uma fonte publicada) vem embutido no aplicativo e só entra no
-- banco por ação do usuário; os registros entram "transcritos" e passam pela conferência dele.
-- Esta tabela guarda que o pacote foi importado, quando, com qual fonte e o que foi criado, e
-- impede a importação repetida da mesma versão. Nenhuma tabela existente é alterada.

CREATE TABLE importacao_curadoria (
  id TEXT PRIMARY KEY NOT NULL,
  pacote_codigo TEXT NOT NULL CHECK(length(pacote_codigo) BETWEEN 1 AND 30 AND pacote_codigo GLOB '[A-Za-z]*' AND pacote_codigo NOT GLOB '*[^A-Za-z0-9_]*'),
  pacote_versao INTEGER NOT NULL CHECK(pacote_versao >= 1),
  fonte_id TEXT NOT NULL REFERENCES fonte(id),
  n_alimentos_criados INTEGER NOT NULL CHECK(n_alimentos_criados >= 0),
  n_registros INTEGER NOT NULL CHECK(n_registros >= 1),
  n_valores INTEGER NOT NULL CHECK(n_valores >= 1),
  -- Ids criados ou reaproveitados (fonte, alimentos, registros), para rastrear a origem.
  resumo_json TEXT NOT NULL CHECK(json_valid(resumo_json) AND json_type(resumo_json) = 'object'),
  importado_em TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT CHECK(deleted_at IS NULL),
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX ux_importacao_curadoria ON importacao_curadoria(pacote_codigo, pacote_versao);

CREATE TRIGGER tg_importacao_curadoria_sem_exclusao BEFORE DELETE ON importacao_curadoria BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_importacao_curadoria_imutavel BEFORE UPDATE ON importacao_curadoria
BEGIN SELECT RAISE(ABORT,'O registro de importação não muda.'); END;

-- Variante de método como definição própria (PLANO_FASE_5.md, seção 3.1), igual a
-- DEFINICOES_CURADORIA_5B do domínio: nome, unidade e base pela página "Dados cadastrados" do
-- CQBAL 4.0 (consultada em 2026-10-21); método pendente, nada fundamentado.
INSERT INTO nutriente(id,codigo,codigo_normalizado,nome,grupo,unidade_referencia,base_referencia,metodo_analitico,situacao_fundamentacao,direcao_conservadora,origem_definicao,created_at,updated_at) VALUES
('01929c20-0000-7000-8000-000000000012','FDNcp','FDNCP','Fibra em detergente neutro corrigida para cinzas e proteína','fibra','pct','ms',NULL,'pendente','maior','sistema','2026-10-21T00:00:00.000Z','2026-10-21T00:00:00.000Z');
