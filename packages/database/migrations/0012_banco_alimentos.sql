-- Fase 5A. Banco de alimentos: estrutura e rastreabilidade (PLANO_FASE_5.md, seção 4).
-- Nenhum valor de composição é semeado. O catálogo inicial traz só DEFINIÇÕES de nutrientes, com
-- método analítico pendente de fundamentação (decisão D5-2), iguais a
-- DEFINICOES_INICIAIS_NUTRIENTES do domínio. Nenhuma tabela existente é alterada.

-- Fonte de qualquer origem. Fontes são globais; laudo e medição própria pertencem a uma
-- propriedade (D5-9). Sem anexos (D5-7).
CREATE TABLE fonte (
  id TEXT PRIMARY KEY NOT NULL,
  origem TEXT NOT NULL CHECK(origem IN ('tabela_compilada','estudo_individual','laboratorial','rotulo_comercial','medicao_propria','sistema_exigencias')),
  codigo TEXT CHECK(codigo IS NULL OR (length(codigo) BETWEEN 1 AND 30 AND codigo GLOB '[A-Za-z]*' AND codigo NOT GLOB '*[^A-Za-z0-9_]*')),
  codigo_normalizado TEXT,
  titulo TEXT NOT NULL CHECK(length(trim(titulo)) BETWEEN 1 AND 300),
  autores TEXT CHECK(autores IS NULL OR length(trim(autores)) BETWEEN 1 AND 1000),
  ano INTEGER CHECK(ano IS NULL OR ano BETWEEN 1800 AND 2200),
  edicao_versao TEXT CHECK(edicao_versao IS NULL OR length(trim(edicao_versao)) BETWEEN 1 AND 120),
  instituicao_editora TEXT CHECK(instituicao_editora IS NULL OR length(trim(instituicao_editora)) BETWEEN 1 AND 200),
  isbn_doi_url TEXT CHECK(isbn_doi_url IS NULL OR length(trim(isbn_doi_url)) BETWEEN 1 AND 300),
  data_acesso TEXT CHECK(data_acesso IS NULL OR date(data_acesso) IS data_acesso),
  experimento_origem TEXT CHECK(experimento_origem IS NULL OR length(trim(experimento_origem)) BETWEEN 1 AND 200),
  laboratorio TEXT CHECK(laboratorio IS NULL OR length(trim(laboratorio)) BETWEEN 1 AND 200),
  numero_laudo TEXT CHECK(numero_laudo IS NULL OR length(trim(numero_laudo)) BETWEEN 1 AND 100),
  data_laudo TEXT CHECK(data_laudo IS NULL OR date(data_laudo) IS data_laudo),
  fabricante TEXT CHECK(fabricante IS NULL OR length(trim(fabricante)) BETWEEN 1 AND 200),
  registro_produto TEXT CHECK(registro_produto IS NULL OR length(trim(registro_produto)) BETWEEN 1 AND 100),
  metodo_medicao TEXT CHECK(metodo_medicao IS NULL OR length(trim(metodo_medicao)) BETWEEN 1 AND 2000),
  limitacoes_medicao TEXT CHECK(limitacoes_medicao IS NULL OR length(trim(limitacoes_medicao)) BETWEEN 1 AND 2000),
  propriedade_id TEXT REFERENCES propriedade(id),
  observacoes TEXT CHECK(observacoes IS NULL OR length(trim(observacoes)) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((codigo IS NULL) = (codigo_normalizado IS NULL)),
  CHECK(codigo_normalizado IS NULL OR codigo_normalizado = upper(codigo)),
  -- Publicação científica: código, autores e ano obrigatórios.
  CHECK(origem NOT IN ('tabela_compilada','estudo_individual') OR (codigo IS NOT NULL AND autores IS NOT NULL AND ano IS NOT NULL)),
  -- Dado da propriedade se, e só se, laudo ou medição própria.
  CHECK((origem IN ('laboratorial','medicao_propria')) = (propriedade_id IS NOT NULL)),
  CHECK(origem <> 'laboratorial' OR laboratorio IS NOT NULL),
  CHECK(origem = 'laboratorial' OR (laboratorio IS NULL AND numero_laudo IS NULL AND data_laudo IS NULL)),
  CHECK(origem <> 'rotulo_comercial' OR fabricante IS NOT NULL),
  CHECK(origem = 'rotulo_comercial' OR (fabricante IS NULL AND registro_produto IS NULL)),
  -- Medição própria: método e limitações descritos pelo usuário (D5-8).
  CHECK((origem = 'medicao_propria') = (metodo_medicao IS NOT NULL AND limitacoes_medicao IS NOT NULL)),
  CHECK(origem = 'medicao_propria' OR (metodo_medicao IS NULL AND limitacoes_medicao IS NULL))
) STRICT;
CREATE UNIQUE INDEX ux_fonte_codigo ON fonte(codigo_normalizado) WHERE deleted_at IS NULL AND codigo_normalizado IS NOT NULL;
CREATE INDEX ix_fonte_origem ON fonte(origem, propriedade_id);

-- Definição de nutriente (catálogo). Variantes de método são definições distintas e nunca
-- equivalentes automaticamente. "fundamentada" exige método, fonte e página ou tabela (D5-2).
CREATE TABLE nutriente (
  id TEXT PRIMARY KEY NOT NULL,
  codigo TEXT NOT NULL CHECK(length(codigo) BETWEEN 1 AND 30 AND codigo GLOB '[A-Za-z]*' AND codigo NOT GLOB '*[^A-Za-z0-9_]*'),
  codigo_normalizado TEXT NOT NULL,
  nome TEXT NOT NULL CHECK(length(trim(nome)) BETWEEN 1 AND 120),
  grupo TEXT NOT NULL CHECK(grupo IN ('fracao_seca','proteina','fibra','energia','mineral_macro','mineral_micro','digestibilidade','outro')),
  unidade_referencia TEXT NOT NULL CHECK(unidade_referencia IN ('pct','g_kg','mg_kg','ppm','mcal_kg','ui_kg')),
  base_referencia TEXT NOT NULL CHECK(base_referencia IN ('ms','mn')),
  metodo_analitico TEXT CHECK(metodo_analitico IS NULL OR length(trim(metodo_analitico)) BETWEEN 1 AND 500),
  situacao_fundamentacao TEXT NOT NULL CHECK(situacao_fundamentacao IN ('pendente','fundamentada')),
  fundamentacao_fonte_id TEXT REFERENCES fonte(id),
  fundamentacao_referencia TEXT CHECK(fundamentacao_referencia IS NULL OR length(trim(fundamentacao_referencia)) BETWEEN 1 AND 200),
  direcao_conservadora TEXT NOT NULL CHECK(direcao_conservadora IN ('menor','maior','nao_definida')),
  origem_definicao TEXT NOT NULL CHECK(origem_definicao IN ('sistema','usuario')),
  descricao TEXT CHECK(descricao IS NULL OR length(trim(descricao)) BETWEEN 1 AND 1000),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT CHECK(deleted_at IS NULL),
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK(codigo_normalizado = upper(codigo)),
  CHECK(situacao_fundamentacao = 'pendente' OR (metodo_analitico IS NOT NULL AND fundamentacao_fonte_id IS NOT NULL AND fundamentacao_referencia IS NOT NULL)),
  CHECK((fundamentacao_fonte_id IS NULL) = (fundamentacao_referencia IS NULL))
) STRICT;
CREATE UNIQUE INDEX ux_nutriente_codigo ON nutriente(codigo_normalizado);

-- Identidade do alimento, sem composição. Fresco e ensilado são alimentos diferentes; idade de
-- corte é condição do registro, não identidade.
CREATE TABLE alimento (
  id TEXT PRIMARY KEY NOT NULL,
  nome TEXT NOT NULL CHECK(length(trim(nome)) BETWEEN 1 AND 160),
  nome_normalizado TEXT NOT NULL,
  especie TEXT CHECK(especie IS NULL OR length(trim(especie)) BETWEEN 1 AND 160),
  cultivar TEXT CHECK(cultivar IS NULL OR length(trim(cultivar)) BETWEEN 1 AND 120),
  parte_planta TEXT CHECK(parte_planta IS NULL OR length(trim(parte_planta)) BETWEEN 1 AND 120),
  forma_conservacao TEXT NOT NULL CHECK(forma_conservacao IN ('fresco','pastejo','ensilado','pre_secado','feno','grao','farelo','mistura_comercial','mineral','outro')),
  processamento TEXT CHECK(processamento IS NULL OR length(trim(processamento)) BETWEEN 1 AND 120),
  classe TEXT NOT NULL CHECK(classe IN ('volumoso','pastagem','concentrado_energetico','concentrado_proteico','suplemento_mineral','suplemento_proteico','suplemento_proteico_energetico','aditivo','subproduto','outro')),
  comercial INTEGER NOT NULL CHECK(comercial IN (0,1)),
  observacoes TEXT CHECK(observacoes IS NULL OR length(trim(observacoes)) BETWEEN 1 AND 2000),
  motivo_exclusao TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((deleted_at IS NULL) = (motivo_exclusao IS NULL))
) STRICT;
CREATE UNIQUE INDEX ux_alimento_nome ON alimento(nome_normalizado) WHERE deleted_at IS NULL;

-- Um estudo, uma linha de tabela, um laudo, um rótulo ou uma medição. Sem fonte, sem dado.
CREATE TABLE registro_composicao (
  id TEXT PRIMARY KEY NOT NULL,
  alimento_id TEXT NOT NULL REFERENCES alimento(id),
  fonte_id TEXT NOT NULL REFERENCES fonte(id),
  referencia_local TEXT CHECK(referencia_local IS NULL OR length(trim(referencia_local)) BETWEEN 1 AND 200),
  idade_corte_dias INTEGER CHECK(idade_corte_dias IS NULL OR idade_corte_dias BETWEEN 1 AND 3650),
  classe_idade_fonte TEXT CHECK(classe_idade_fonte IS NULL OR length(trim(classe_idade_fonte)) BETWEEN 1 AND 120),
  aditivo_ensilagem TEXT CHECK(aditivo_ensilagem IS NULL OR length(trim(aditivo_ensilagem)) BETWEEN 1 AND 200),
  regiao TEXT CHECK(regiao IS NULL OR length(trim(regiao)) BETWEEN 1 AND 200),
  estacao TEXT CHECK(estacao IS NULL OR length(trim(estacao)) BETWEEN 1 AND 120),
  adubacao TEXT CHECK(adubacao IS NULL OR length(trim(adubacao)) BETWEEN 1 AND 500),
  outras_condicoes_json TEXT CHECK(outras_condicoes_json IS NULL OR (json_valid(outras_condicoes_json) AND json_type(outras_condicoes_json) = 'object')),
  n_observacoes INTEGER CHECK(n_observacoes IS NULL OR n_observacoes >= 1),
  separador_decimal TEXT NOT NULL CHECK(separador_decimal IN ('virgula','ponto')),
  data_amostra TEXT CHECK(data_amostra IS NULL OR date(data_amostra) IS data_amostra),
  identificacao_amostra TEXT CHECK(identificacao_amostra IS NULL OR length(trim(identificacao_amostra)) BETWEEN 1 AND 120),
  observacoes TEXT CHECK(observacoes IS NULL OR length(trim(observacoes)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL CHECK(status IN ('rascunho','transcrito','conferido','rejeitado','substituido')),
  transcrito_por TEXT CHECK(transcrito_por IS NULL OR length(trim(transcrito_por)) BETWEEN 1 AND 120),
  transcrito_em TEXT,
  conferido_por TEXT CHECK(conferido_por IS NULL OR length(trim(conferido_por)) BETWEEN 1 AND 120),
  conferido_em TEXT,
  rejeitado_por TEXT CHECK(rejeitado_por IS NULL OR length(trim(rejeitado_por)) BETWEEN 1 AND 120),
  rejeitado_em TEXT,
  motivo_rejeicao TEXT CHECK(motivo_rejeicao IS NULL OR length(trim(motivo_rejeicao)) BETWEEN 1 AND 1000),
  substitui_id TEXT REFERENCES registro_composicao(id),
  motivo_versao TEXT CHECK(motivo_versao IS NULL OR length(trim(motivo_versao)) BETWEEN 1 AND 1000),
  substituido_em TEXT,
  motivo_descarte TEXT CHECK(motivo_descarte IS NULL OR length(trim(motivo_descarte)) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((substitui_id IS NULL) = (motivo_versao IS NULL)),
  CHECK(substitui_id IS NULL OR substitui_id <> id),
  CHECK((status IN ('transcrito','conferido','rejeitado','substituido')) = (transcrito_por IS NOT NULL AND transcrito_em IS NOT NULL)),
  CHECK((transcrito_por IS NULL) = (transcrito_em IS NULL)),
  CHECK((status IN ('conferido','substituido')) = (conferido_por IS NOT NULL AND conferido_em IS NOT NULL)),
  CHECK((conferido_por IS NULL) = (conferido_em IS NULL)),
  CHECK((status = 'rejeitado') = (rejeitado_por IS NOT NULL AND rejeitado_em IS NOT NULL AND motivo_rejeicao IS NOT NULL)),
  CHECK(rejeitado_por IS NOT NULL OR (rejeitado_em IS NULL AND motivo_rejeicao IS NULL)),
  CHECK((status = 'substituido') = (substituido_em IS NOT NULL)),
  CHECK((deleted_at IS NULL) = (motivo_descarte IS NULL)),
  CHECK(deleted_at IS NULL OR status IN ('rascunho','transcrito','rejeitado'))
) STRICT;
CREATE INDEX ix_registro_alimento ON registro_composicao(alimento_id, status) WHERE deleted_at IS NULL;
CREATE INDEX ix_registro_fonte ON registro_composicao(fonte_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_registro_status ON registro_composicao(status, transcrito_em) WHERE deleted_at IS NULL;
-- Uma versão em aberto (ou já conferida) por registro: correções formam uma cadeia, não um leque.
CREATE UNIQUE INDEX ux_registro_sucessor ON registro_composicao(substitui_id) WHERE substitui_id IS NOT NULL AND deleted_at IS NULL;

-- Um valor por linha, como publicado (D5-3): texto e número derivado, unidade, base e estatística.
-- Nutriente ausente na fonte não tem linha; nunca se grava zero no lugar.
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
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((desvio_padrao_publicado IS NULL) = (desvio_padrao IS NULL)),
  CHECK((minimo_publicado IS NULL) = (minimo IS NULL)),
  CHECK((maximo_publicado IS NULL) = (maximo IS NULL)),
  CHECK(minimo IS NULL OR maximo IS NULL OR minimo <= maximo),
  -- Faixas pela definição da unidade (domínio: DEFINICOES_UNIDADE).
  CHECK(unidade <> 'pct' OR (valor BETWEEN 0 AND 100 AND coalesce(minimo, 0) BETWEEN 0 AND 100 AND coalesce(maximo, 0) BETWEEN 0 AND 100)),
  CHECK(unidade <> 'g_kg' OR (valor BETWEEN 0 AND 1000 AND coalesce(minimo, 0) BETWEEN 0 AND 1000 AND coalesce(maximo, 0) BETWEEN 0 AND 1000)),
  CHECK(unidade NOT IN ('mg_kg','ppm') OR (valor BETWEEN 0 AND 1000000 AND coalesce(minimo, 0) BETWEEN 0 AND 1000000 AND coalesce(maximo, 0) BETWEEN 0 AND 1000000)),
  CHECK(unidade <> 'ui_kg' OR (valor >= 0 AND coalesce(minimo, 0) >= 0 AND coalesce(maximo, 0) >= 0))
) STRICT;
CREATE UNIQUE INDEX ux_valor_nutricional ON valor_nutricional(registro_id, nutriente_id, tipo_valor, base) WHERE deleted_at IS NULL;
CREATE INDEX ix_valor_nutriente ON valor_nutricional(nutriente_id) WHERE deleted_at IS NULL;

-- Vínculo do item de estoque com um alimento do banco. Não copia composição e não altera o
-- estoque nem o financeiro.
CREATE TABLE estoque_item_alimento (
  id TEXT PRIMARY KEY NOT NULL,
  estoque_item_id TEXT NOT NULL REFERENCES estoque_item(id),
  alimento_id TEXT NOT NULL REFERENCES alimento(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX ux_estoque_item_alimento ON estoque_item_alimento(estoque_item_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_estoque_item_alimento_alimento ON estoque_item_alimento(alimento_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------------------------

CREATE TRIGGER tg_fonte_sem_exclusao BEFORE DELETE ON fonte BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_nutriente_sem_exclusao BEFORE DELETE ON nutriente BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_alimento_sem_exclusao BEFORE DELETE ON alimento BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_registro_sem_exclusao BEFORE DELETE ON registro_composicao BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_valor_sem_exclusao BEFORE DELETE ON valor_nutricional BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_estoque_alimento_sem_exclusao BEFORE DELETE ON estoque_item_alimento BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;

-- Fonte: origem e propriedade são identidade; excluída fica congelada; não se exclui com uso.
CREATE TRIGGER tg_fonte_identidade BEFORE UPDATE ON fonte
WHEN NEW.id <> OLD.id OR NEW.origem <> OLD.origem OR NEW.propriedade_id IS NOT OLD.propriedade_id OR NEW.created_at <> OLD.created_at
BEGIN SELECT RAISE(ABORT,'Origem e propriedade da fonte não mudam.'); END;
CREATE TRIGGER tg_fonte_excluida BEFORE UPDATE ON fonte
WHEN OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Fonte excluída não muda.'); END;
CREATE TRIGGER tg_fonte_exclusao_em_uso BEFORE UPDATE OF deleted_at ON fonte
WHEN NEW.deleted_at IS NOT NULL AND (
  EXISTS(SELECT 1 FROM registro_composicao r WHERE r.fonte_id = NEW.id AND r.deleted_at IS NULL)
  OR EXISTS(SELECT 1 FROM nutriente n WHERE n.fundamentacao_fonte_id = NEW.id))
BEGIN SELECT RAISE(ABORT,'Fonte com registros ou definições vinculados não pode ser excluída.'); END;

-- Nutriente: código e origem não mudam; definição do sistema mantém nome, grupo, unidade e base;
-- fundamentação só com fonte bibliográfica ativa; definição com valores não muda o que dá
-- sentido a eles (D5-2).
CREATE TRIGGER tg_nutriente_identidade BEFORE UPDATE ON nutriente
WHEN NEW.id <> OLD.id OR NEW.codigo <> OLD.codigo OR NEW.origem_definicao <> OLD.origem_definicao OR NEW.created_at <> OLD.created_at
  OR (OLD.origem_definicao = 'sistema' AND (NEW.nome <> OLD.nome OR NEW.grupo <> OLD.grupo OR NEW.unidade_referencia <> OLD.unidade_referencia OR NEW.base_referencia <> OLD.base_referencia))
BEGIN SELECT RAISE(ABORT,'Código, origem e, nas definições do sistema, nome, grupo, unidade e base não mudam.'); END;
CREATE TRIGGER tg_nutriente_fundamentacao_insercao BEFORE INSERT ON nutriente
WHEN NEW.fundamentacao_fonte_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fonte f WHERE f.id = NEW.fundamentacao_fonte_id AND f.deleted_at IS NULL AND f.origem IN ('tabela_compilada','estudo_individual'))
BEGIN SELECT RAISE(ABORT,'A fundamentação exige uma fonte bibliográfica ativa.'); END;
CREATE TRIGGER tg_nutriente_fundamentacao_alteracao BEFORE UPDATE OF fundamentacao_fonte_id ON nutriente
WHEN NEW.fundamentacao_fonte_id IS NOT NULL AND NEW.fundamentacao_fonte_id IS NOT OLD.fundamentacao_fonte_id AND NOT EXISTS(SELECT 1 FROM fonte f WHERE f.id = NEW.fundamentacao_fonte_id AND f.deleted_at IS NULL AND f.origem IN ('tabela_compilada','estudo_individual'))
BEGIN SELECT RAISE(ABORT,'A fundamentação exige uma fonte bibliográfica ativa.'); END;
CREATE TRIGGER tg_nutriente_com_valores BEFORE UPDATE ON nutriente
WHEN (NEW.grupo <> OLD.grupo OR NEW.unidade_referencia <> OLD.unidade_referencia OR NEW.base_referencia <> OLD.base_referencia
     OR NEW.metodo_analitico IS NOT OLD.metodo_analitico OR NEW.situacao_fundamentacao <> OLD.situacao_fundamentacao
     OR NEW.fundamentacao_fonte_id IS NOT OLD.fundamentacao_fonte_id OR NEW.fundamentacao_referencia IS NOT OLD.fundamentacao_referencia)
  AND EXISTS(SELECT 1 FROM valor_nutricional v WHERE v.nutriente_id = OLD.id AND v.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Definição com valores não muda grupo, unidade, base, método nem fundamentação: cadastre a variante como nova definição.'); END;

-- Alimento: identidade imutável com registros; excluído congelado; não se exclui com uso.
CREATE TRIGGER tg_alimento_excluido BEFORE UPDATE ON alimento
WHEN OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Alimento excluído não muda.'); END;
CREATE TRIGGER tg_alimento_identidade BEFORE UPDATE ON alimento
WHEN NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at
  OR ((NEW.especie IS NOT OLD.especie OR NEW.cultivar IS NOT OLD.cultivar OR NEW.parte_planta IS NOT OLD.parte_planta
       OR NEW.forma_conservacao <> OLD.forma_conservacao OR NEW.processamento IS NOT OLD.processamento
       OR NEW.classe <> OLD.classe OR NEW.comercial <> OLD.comercial)
      AND EXISTS(SELECT 1 FROM registro_composicao r WHERE r.alimento_id = OLD.id AND r.deleted_at IS NULL))
BEGIN SELECT RAISE(ABORT,'A identidade de um alimento com registros não muda: cadastre outro alimento.'); END;
CREATE TRIGGER tg_alimento_exclusao_em_uso BEFORE UPDATE OF deleted_at ON alimento
WHEN NEW.deleted_at IS NOT NULL AND (
  EXISTS(SELECT 1 FROM registro_composicao r WHERE r.alimento_id = NEW.id AND r.deleted_at IS NULL)
  OR EXISTS(SELECT 1 FROM estoque_item_alimento e WHERE e.alimento_id = NEW.id AND e.deleted_at IS NULL))
BEGIN SELECT RAISE(ABORT,'Alimento com registros ou itens de estoque vinculados não pode ser excluído.'); END;

-- Registro: nasce rascunho, de fonte e alimento ativos; página ou tabela para publicação
-- científica; data da amostra só (e sempre) para laudo e medição própria; versão nova só de um
-- conferido, do mesmo alimento e da mesma fonte.
CREATE TRIGGER tg_registro_insercao BEFORE INSERT ON registro_composicao
WHEN NEW.status <> 'rascunho'
  OR NOT EXISTS(SELECT 1 FROM fonte f WHERE f.id = NEW.fonte_id AND f.deleted_at IS NULL AND f.origem <> 'sistema_exigencias')
  OR NOT EXISTS(SELECT 1 FROM alimento a WHERE a.id = NEW.alimento_id AND a.deleted_at IS NULL)
  OR (NEW.substitui_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM registro_composicao o WHERE o.id = NEW.substitui_id AND o.status = 'conferido' AND o.alimento_id = NEW.alimento_id AND o.fonte_id = NEW.fonte_id))
BEGIN SELECT RAISE(ABORT,'Registro nasce em rascunho, de fonte e alimento ativos; versão nova só de registro conferido do mesmo alimento e fonte.'); END;
CREATE TRIGGER tg_registro_exigencias_insercao BEFORE INSERT ON registro_composicao
WHEN ((SELECT origem FROM fonte WHERE id = NEW.fonte_id) IN ('tabela_compilada','estudo_individual') AND NEW.referencia_local IS NULL)
  OR (((SELECT origem FROM fonte WHERE id = NEW.fonte_id) IN ('laboratorial','medicao_propria')) <> (NEW.data_amostra IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Publicação científica exige página ou tabela; laudo e medição própria exigem a data da amostra (e só eles a têm).'); END;
CREATE TRIGGER tg_registro_exigencias_alteracao BEFORE UPDATE OF referencia_local, data_amostra ON registro_composicao
WHEN ((SELECT origem FROM fonte WHERE id = NEW.fonte_id) IN ('tabela_compilada','estudo_individual') AND NEW.referencia_local IS NULL)
  OR (((SELECT origem FROM fonte WHERE id = NEW.fonte_id) IN ('laboratorial','medicao_propria')) <> (NEW.data_amostra IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Publicação científica exige página ou tabela; laudo e medição própria exigem a data da amostra (e só eles a têm).'); END;
-- Descartado fica congelado.
CREATE TRIGGER tg_registro_descartado BEFORE UPDATE ON registro_composicao
WHEN OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Registro descartado não muda.'); END;
-- Conteúdo só muda em rascunho (e o registro continua rascunho).
CREATE TRIGGER tg_registro_conteudo BEFORE UPDATE ON registro_composicao
WHEN (OLD.status <> 'rascunho' OR NEW.status <> 'rascunho')
  AND (NEW.id <> OLD.id OR NEW.alimento_id <> OLD.alimento_id OR NEW.fonte_id <> OLD.fonte_id
    OR NEW.referencia_local IS NOT OLD.referencia_local OR NEW.idade_corte_dias IS NOT OLD.idade_corte_dias
    OR NEW.classe_idade_fonte IS NOT OLD.classe_idade_fonte OR NEW.aditivo_ensilagem IS NOT OLD.aditivo_ensilagem
    OR NEW.regiao IS NOT OLD.regiao OR NEW.estacao IS NOT OLD.estacao OR NEW.adubacao IS NOT OLD.adubacao
    OR NEW.outras_condicoes_json IS NOT OLD.outras_condicoes_json OR NEW.n_observacoes IS NOT OLD.n_observacoes
    OR NEW.separador_decimal <> OLD.separador_decimal OR NEW.data_amostra IS NOT OLD.data_amostra
    OR NEW.identificacao_amostra IS NOT OLD.identificacao_amostra OR NEW.observacoes IS NOT OLD.observacoes
    OR NEW.substitui_id IS NOT OLD.substitui_id OR NEW.motivo_versao IS NOT OLD.motivo_versao OR NEW.created_at <> OLD.created_at)
BEGIN SELECT RAISE(ABORT,'O registro só é editado em rascunho. Conferido: crie uma nova versão.'); END;
CREATE TRIGGER tg_registro_fonte_alimento BEFORE UPDATE OF fonte_id, alimento_id ON registro_composicao
WHEN NEW.fonte_id <> OLD.fonte_id OR NEW.alimento_id <> OLD.alimento_id
BEGIN SELECT RAISE(ABORT,'Fonte e alimento do registro não mudam: descarte e registre de novo.'); END;
-- Transições do fluxo (domínio: PARES_DE_STATUS_PERMITIDOS).
CREATE TRIGGER tg_registro_transicao BEFORE UPDATE OF status ON registro_composicao
WHEN NEW.status <> OLD.status AND NOT (
     (OLD.status = 'rascunho' AND NEW.status = 'transcrito')
  OR (OLD.status = 'transcrito' AND NEW.status IN ('rascunho','conferido','rejeitado'))
  OR (OLD.status = 'rejeitado' AND NEW.status = 'rascunho')
  OR (OLD.status = 'conferido' AND NEW.status = 'substituido'))
BEGIN SELECT RAISE(ABORT,'Transição de status fora do fluxo de conferência.'); END;
CREATE TRIGGER tg_registro_transcricao_sem_valores BEFORE UPDATE OF status ON registro_composicao
WHEN OLD.status = 'rascunho' AND NEW.status = 'transcrito'
  AND NOT EXISTS(SELECT 1 FROM valor_nutricional v WHERE v.registro_id = NEW.id AND v.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Registro sem valores não é transcrito.'); END;
CREATE TRIGGER tg_registro_substituicao BEFORE UPDATE OF status ON registro_composicao
WHEN NEW.status = 'substituido' AND OLD.status <> 'substituido'
  AND NOT EXISTS(SELECT 1 FROM registro_composicao s WHERE s.substitui_id = NEW.id AND s.status = 'conferido' AND s.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Só a versão nova conferida substitui o registro.'); END;
-- Conferido e substituído: congelados (o conferido só passa a substituído).
CREATE TRIGGER tg_registro_conferido_imutavel BEFORE UPDATE ON registro_composicao
WHEN OLD.status IN ('conferido','substituido') AND NOT (
  OLD.status = 'conferido' AND NEW.status = 'substituido' AND NEW.substituido_em IS NOT NULL
  AND NEW.transcrito_por IS OLD.transcrito_por AND NEW.transcrito_em IS OLD.transcrito_em
  AND NEW.conferido_por IS OLD.conferido_por AND NEW.conferido_em IS OLD.conferido_em
  AND NEW.rejeitado_por IS OLD.rejeitado_por AND NEW.rejeitado_em IS OLD.rejeitado_em
  AND NEW.motivo_rejeicao IS OLD.motivo_rejeicao AND NEW.deleted_at IS OLD.deleted_at
  AND NEW.motivo_descarte IS OLD.motivo_descarte AND NEW.sync_version = OLD.sync_version)
BEGIN SELECT RAISE(ABORT,'Registro conferido é imutável. Para corrigir, crie uma nova versão.'); END;

-- Valores: só em registro rascunho; nutriente ativo, unidade da mesma grandeza da referência;
-- garantias só (e sempre) em rótulo, na base MN; medição própria só fração seca.
CREATE TRIGGER tg_valor_insercao BEFORE INSERT ON valor_nutricional
WHEN NOT EXISTS(SELECT 1 FROM registro_composicao r WHERE r.id = NEW.registro_id AND r.status = 'rascunho' AND r.deleted_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM nutriente n WHERE n.id = NEW.nutriente_id AND n.ativo = 1)
  OR NEW.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Valores só entram em registro em rascunho, com definição de nutriente ativa.'); END;
CREATE TRIGGER tg_valor_alteracao BEFORE UPDATE ON valor_nutricional
WHEN OLD.deleted_at IS NOT NULL OR NEW.id <> OLD.id OR NEW.registro_id <> OLD.registro_id OR NEW.created_at <> OLD.created_at
  OR NOT EXISTS(SELECT 1 FROM registro_composicao r WHERE r.id = OLD.registro_id AND r.status = 'rascunho' AND r.deleted_at IS NULL)
  OR (NEW.nutriente_id <> OLD.nutriente_id AND NOT EXISTS(SELECT 1 FROM nutriente n WHERE n.id = NEW.nutriente_id AND n.ativo = 1))
BEGIN SELECT RAISE(ABORT,'Valores só mudam em registro em rascunho. Conferido: crie uma nova versão.'); END;
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

-- Vínculo com estoque: item de alimentação ativo e alimento ativo; só se desfaz (exclusão lógica).
CREATE TRIGGER tg_estoque_alimento_insercao BEFORE INSERT ON estoque_item_alimento
WHEN NEW.deleted_at IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM estoque_item i WHERE i.id = NEW.estoque_item_id AND i.deleted_at IS NULL AND i.tipo IN ('racao','silagem','volumoso','suplemento','mineral','outro'))
  OR NOT EXISTS(SELECT 1 FROM alimento a WHERE a.id = NEW.alimento_id AND a.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Só itens de alimentação (ração, silagem, volumoso, suplemento, mineral ou outro) se vinculam a um alimento ativo.'); END;
CREATE TRIGGER tg_estoque_alimento_imutavel BEFORE UPDATE ON estoque_item_alimento
WHEN OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL OR NEW.id <> OLD.id OR NEW.estoque_item_id <> OLD.estoque_item_id
  OR NEW.alimento_id <> OLD.alimento_id OR NEW.created_at <> OLD.created_at
BEGIN SELECT RAISE(ABORT,'O vínculo não muda: desfaça e vincule de novo.'); END;

-- Catálogo inicial de definições (D5-2): sem método, pendentes de fundamentação, sem valores.
INSERT INTO nutriente(id,codigo,codigo_normalizado,nome,grupo,unidade_referencia,base_referencia,metodo_analitico,situacao_fundamentacao,direcao_conservadora,origem_definicao,created_at,updated_at) VALUES
('01929c20-0000-7000-8000-000000000001','MS','MS','Matéria seca','fracao_seca','pct','mn',NULL,'pendente','menor','sistema','2026-10-21T00:00:00.000Z','2026-10-21T00:00:00.000Z'),
('01929c20-0000-7000-8000-000000000002','MO','MO','Matéria orgânica','outro','pct','ms',NULL,'pendente','nao_definida','sistema','2026-10-21T00:00:00.000Z','2026-10-21T00:00:00.000Z'),
('01929c20-0000-7000-8000-000000000003','MM','MM','Matéria mineral','outro','pct','ms',NULL,'pendente','nao_definida','sistema','2026-10-21T00:00:00.000Z','2026-10-21T00:00:00.000Z'),
('01929c20-0000-7000-8000-000000000004','PB','PB','Proteína bruta','proteina','pct','ms',NULL,'pendente','menor','sistema','2026-10-21T00:00:00.000Z','2026-10-21T00:00:00.000Z'),
('01929c20-0000-7000-8000-000000000005','EE','EE','Extrato etéreo','outro','pct','ms',NULL,'pendente','nao_definida','sistema','2026-10-21T00:00:00.000Z','2026-10-21T00:00:00.000Z'),
('01929c20-0000-7000-8000-000000000006','FDN','FDN','Fibra em detergente neutro','fibra','pct','ms',NULL,'pendente','maior','sistema','2026-10-21T00:00:00.000Z','2026-10-21T00:00:00.000Z'),
('01929c20-0000-7000-8000-000000000007','FDA','FDA','Fibra em detergente ácido','fibra','pct','ms',NULL,'pendente','maior','sistema','2026-10-21T00:00:00.000Z','2026-10-21T00:00:00.000Z'),
('01929c20-0000-7000-8000-000000000008','LIG','LIG','Lignina','fibra','pct','ms',NULL,'pendente','maior','sistema','2026-10-21T00:00:00.000Z','2026-10-21T00:00:00.000Z'),
('01929c20-0000-7000-8000-000000000009','NDT','NDT','Nutrientes digestíveis totais','energia','pct','ms',NULL,'pendente','menor','sistema','2026-10-21T00:00:00.000Z','2026-10-21T00:00:00.000Z'),
('01929c20-0000-7000-8000-000000000010','Ca','CA','Cálcio','mineral_macro','pct','ms',NULL,'pendente','menor','sistema','2026-10-21T00:00:00.000Z','2026-10-21T00:00:00.000Z'),
('01929c20-0000-7000-8000-000000000011','P','P','Fósforo','mineral_macro','pct','ms',NULL,'pendente','menor','sistema','2026-10-21T00:00:00.000Z','2026-10-21T00:00:00.000Z');
