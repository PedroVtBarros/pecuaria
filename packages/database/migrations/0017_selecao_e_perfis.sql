-- Fase 5D. Seleção de composição, avaliação científica e perfis (PLANO_FASE_5.md, seção 13).
-- 1. avaliacao_cientifica: "uso com cautela" (registro ou valor) e validação de base inferida
--    (valor). É separada da conferência: a conferência diz que a transcrição é fiel à fonte; a
--    avaliação diz se o dado é adequado para uso. Só por ação do usuário; retirada com motivo.
-- 2. aprovacao_regra_selecao: o conteúdo de cada versão da regra fica no domínio (selecao.ts);
--    aqui fica quem aprovou, quando e o hash do conteúdo aprovado. Sem aprovação, nada é gravado.
-- 3. perfil_composicao, perfil_valor e perfil_valor_origem: resultado imutável de uma seleção,
--    com a regra usada e a origem de cada valor. Nunca alterados nem excluídos.
-- Nenhuma tabela existente é alterada.

CREATE TABLE avaliacao_cientifica (
  id TEXT PRIMARY KEY NOT NULL,
  registro_id TEXT NOT NULL REFERENCES registro_composicao(id),
  valor_id TEXT REFERENCES valor_nutricional(id),
  tipo TEXT NOT NULL CHECK(tipo IN ('uso_com_cautela','base_validada')),
  motivo TEXT NOT NULL CHECK(length(trim(motivo)) BETWEEN 1 AND 1000),
  avaliado_por TEXT NOT NULL CHECK(length(trim(avaliado_por)) BETWEEN 1 AND 120),
  avaliado_em TEXT NOT NULL,
  retirado_por TEXT CHECK(retirado_por IS NULL OR length(trim(retirado_por)) BETWEEN 1 AND 120),
  retirado_em TEXT,
  motivo_retirada TEXT CHECK(motivo_retirada IS NULL OR length(trim(motivo_retirada)) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT CHECK(deleted_at IS NULL),
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK(tipo <> 'base_validada' OR valor_id IS NOT NULL),
  CHECK((retirado_em IS NULL) = (retirado_por IS NULL) AND (retirado_em IS NULL) = (motivo_retirada IS NULL))
) STRICT;
CREATE UNIQUE INDEX ux_avaliacao_ativa ON avaliacao_cientifica(registro_id, ifnull(valor_id, ''), tipo)
  WHERE retirado_em IS NULL;
CREATE INDEX ix_avaliacao_registro ON avaliacao_cientifica(registro_id);

CREATE TRIGGER tg_avaliacao_sem_exclusao BEFORE DELETE ON avaliacao_cientifica
BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_avaliacao_insercao BEFORE INSERT ON avaliacao_cientifica
WHEN NEW.retirado_em IS NOT NULL
  OR (NEW.valor_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM valor_nutricional v WHERE v.id = NEW.valor_id AND v.registro_id = NEW.registro_id))
  OR (NEW.tipo = 'base_validada' AND NOT EXISTS (
        SELECT 1 FROM valor_nutricional v WHERE v.id = NEW.valor_id AND v.interpretacao_base IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Avaliação incoerente: valor de outro registro, base declarada ou já retirada.'); END;
-- Só muda: a retirada, uma vez.
CREATE TRIGGER tg_avaliacao_alteracao BEFORE UPDATE ON avaliacao_cientifica
WHEN OLD.retirado_em IS NOT NULL OR NEW.retirado_em IS NULL
  OR NEW.id <> OLD.id OR NEW.registro_id <> OLD.registro_id OR NEW.valor_id IS NOT OLD.valor_id
  OR NEW.tipo <> OLD.tipo OR NEW.motivo <> OLD.motivo OR NEW.avaliado_por <> OLD.avaliado_por
  OR NEW.avaliado_em <> OLD.avaliado_em OR NEW.created_at <> OLD.created_at
BEGIN SELECT RAISE(ABORT,'A avaliação só pode ser retirada, uma vez.'); END;

CREATE TABLE aprovacao_regra_selecao (
  id TEXT PRIMARY KEY NOT NULL,
  regra_codigo TEXT NOT NULL CHECK(length(regra_codigo) BETWEEN 1 AND 30),
  regra_versao INTEGER NOT NULL CHECK(regra_versao >= 1),
  conteudo_hash TEXT NOT NULL CHECK(length(conteudo_hash) = 64 AND conteudo_hash NOT GLOB '*[^0-9a-f]*'),
  aprovado_por TEXT NOT NULL CHECK(length(trim(aprovado_por)) BETWEEN 1 AND 120),
  aprovado_em TEXT NOT NULL,
  observacao TEXT CHECK(observacao IS NULL OR length(trim(observacao)) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT CHECK(deleted_at IS NULL),
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX ux_aprovacao_regra ON aprovacao_regra_selecao(regra_codigo, regra_versao);
CREATE TRIGGER tg_aprovacao_regra_sem_exclusao BEFORE DELETE ON aprovacao_regra_selecao
BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_aprovacao_regra_imutavel BEFORE UPDATE ON aprovacao_regra_selecao
BEGIN SELECT RAISE(ABORT,'Aprovação de regra não muda.'); END;

CREATE TABLE perfil_composicao (
  id TEXT PRIMARY KEY NOT NULL,
  alimento_id TEXT NOT NULL REFERENCES alimento(id),
  nome TEXT NOT NULL CHECK(length(trim(nome)) BETWEEN 1 AND 120),
  tipo TEXT NOT NULL CHECK(tipo IN ('referencia_individual','agregado_central','cenario_real')),
  cenario TEXT NOT NULL CHECK(cenario IN ('unico','central','conservador','favoravel')),
  nivel TEXT NOT NULL CHECK(nivel IN ('especifico','comparavel','geral')),
  idade_corte_busca_dias INTEGER CHECK(idade_corte_busca_dias IS NULL OR idade_corte_busca_dias >= 1),
  nutriente_referencia_id TEXT REFERENCES nutriente(id),
  registro_base_id TEXT REFERENCES registro_composicao(id),
  regra_codigo TEXT NOT NULL,
  regra_versao INTEGER NOT NULL,
  diferencas_json TEXT NOT NULL CHECK(json_valid(diferencas_json) AND json_type(diferencas_json) = 'array'),
  limitacoes_json TEXT NOT NULL CHECK(json_valid(limitacoes_json) AND json_type(limitacoes_json) = 'array'),
  nao_quantificados_json TEXT NOT NULL CHECK(json_valid(nao_quantificados_json) AND json_type(nao_quantificados_json) = 'array'),
  -- Origens independentes e escolhas de tratamento consideradas, para rastreio.
  selecao_json TEXT NOT NULL CHECK(json_valid(selecao_json) AND json_type(selecao_json) = 'object'),
  criado_por TEXT NOT NULL CHECK(length(trim(criado_por)) BETWEEN 1 AND 120),
  criado_em TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT CHECK(deleted_at IS NULL),
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((tipo = 'referencia_individual') = (cenario = 'unico')),
  CHECK((tipo = 'agregado_central') = (cenario = 'central')),
  CHECK((tipo = 'cenario_real') = (nutriente_referencia_id IS NOT NULL)),
  CHECK((tipo = 'agregado_central') = (registro_base_id IS NULL)),
  FOREIGN KEY (regra_codigo, regra_versao) REFERENCES aprovacao_regra_selecao(regra_codigo, regra_versao)
) STRICT;
CREATE INDEX ix_perfil_alimento ON perfil_composicao(alimento_id);

CREATE TABLE perfil_valor (
  id TEXT PRIMARY KEY NOT NULL,
  perfil_id TEXT NOT NULL REFERENCES perfil_composicao(id),
  nutriente_id TEXT NOT NULL REFERENCES nutriente(id),
  valor REAL NOT NULL,
  valor_publicado TEXT,
  unidade TEXT NOT NULL,
  base TEXT NOT NULL CHECK(base IN ('ms','mn')),
  tipo_valor TEXT NOT NULL,
  forma_obtencao TEXT NOT NULL,
  metodo_analitico_fonte TEXT,
  interpretacao_base TEXT,
  n_origens INTEGER NOT NULL CHECK(n_origens >= 1),
  mediana REAL, minimo REAL, maximo REAL,
  cobertura TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT CHECK(deleted_at IS NULL),
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX ux_perfil_valor ON perfil_valor(perfil_id, nutriente_id, tipo_valor, base);

CREATE TABLE perfil_valor_origem (
  id TEXT PRIMARY KEY NOT NULL,
  perfil_valor_id TEXT NOT NULL REFERENCES perfil_valor(id),
  valor_nutricional_id TEXT NOT NULL REFERENCES valor_nutricional(id),
  registro_id TEXT NOT NULL REFERENCES registro_composicao(id),
  valor_usado REAL NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT CHECK(deleted_at IS NULL),
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX ix_perfil_valor_origem ON perfil_valor_origem(perfil_valor_id);

CREATE TRIGGER tg_perfil_sem_exclusao BEFORE DELETE ON perfil_composicao
BEGIN SELECT RAISE(ABORT,'Perfil de composição não é excluído.'); END;
CREATE TRIGGER tg_perfil_imutavel BEFORE UPDATE ON perfil_composicao
BEGIN SELECT RAISE(ABORT,'Perfil de composição é imutável: grave outro.'); END;
CREATE TRIGGER tg_perfil_valor_sem_exclusao BEFORE DELETE ON perfil_valor
BEGIN SELECT RAISE(ABORT,'Perfil de composição não é excluído.'); END;
CREATE TRIGGER tg_perfil_valor_imutavel BEFORE UPDATE ON perfil_valor
BEGIN SELECT RAISE(ABORT,'Perfil de composição é imutável: grave outro.'); END;
CREATE TRIGGER tg_perfil_origem_sem_exclusao BEFORE DELETE ON perfil_valor_origem
BEGIN SELECT RAISE(ABORT,'Perfil de composição não é excluído.'); END;
CREATE TRIGGER tg_perfil_origem_imutavel BEFORE UPDATE ON perfil_valor_origem
BEGIN SELECT RAISE(ABORT,'Perfil de composição é imutável: grave outro.'); END;
