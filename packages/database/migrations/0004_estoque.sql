-- Fase 3. Quantidades em milésimos da unidade física explícita do item.
-- Sem composição nutricional, conversões implícitas ou lançamentos financeiros.
CREATE TABLE estoque_item (
  id TEXT PRIMARY KEY NOT NULL,
  propriedade_id TEXT NOT NULL REFERENCES propriedade(id),
  nome TEXT NOT NULL CHECK(length(nome) BETWEEN 1 AND 120),
  nome_normalizado TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('racao','silagem','volumoso','suplemento','mineral','medicamento','vacina','semen','outro')),
  unidade_base TEXT NOT NULL CHECK(unidade_base IN ('kg','g','t','l','ml','dose','un','ui')),
  base_materia TEXT NOT NULL CHECK(base_materia IN ('mn','nao_aplicavel')),
  controle_lote INTEGER NOT NULL CHECK(controle_lote IN (0,1)),
  estoque_minimo_milesimos INTEGER CHECK(estoque_minimo_milesimos IS NULL OR estoque_minimo_milesimos >= 0),
  produto_sanitario_id TEXT REFERENCES produto_sanitario(id),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
  observacoes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX ux_estoque_item_nome ON estoque_item(propriedade_id,nome_normalizado) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_estoque_item_produto ON estoque_item(propriedade_id,produto_sanitario_id) WHERE deleted_at IS NULL AND ativo = 1 AND produto_sanitario_id IS NOT NULL;
CREATE INDEX ix_estoque_item_propriedade ON estoque_item(propriedade_id,ativo);

CREATE TABLE estoque_lote (
  id TEXT PRIMARY KEY NOT NULL,
  estoque_item_id TEXT NOT NULL REFERENCES estoque_item(id),
  codigo TEXT NOT NULL CHECK(length(codigo) BETWEEN 1 AND 100),
  codigo_normalizado TEXT NOT NULL,
  validade TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX ux_estoque_lote_codigo ON estoque_lote(estoque_item_id,codigo_normalizado) WHERE deleted_at IS NULL;
CREATE INDEX ix_estoque_lote_validade ON estoque_lote(validade);

CREATE TABLE movimentacao_estoque (
  id TEXT PRIMARY KEY NOT NULL,
  estoque_item_id TEXT NOT NULL REFERENCES estoque_item(id),
  lote_estoque_id TEXT REFERENCES estoque_lote(id),
  data TEXT NOT NULL,
  ordem INTEGER NOT NULL CHECK(ordem > 0),
  tipo TEXT NOT NULL CHECK(tipo IN ('entrada_compra','entrada_producao','entrada_inicial','saida_consumo','saida_perda','saida_venda','ajuste_entrada','ajuste_saida')),
  quantidade_milesimos INTEGER NOT NULL CHECK(quantidade_milesimos > 0 AND quantidade_milesimos <= 1000000000000),
  unidade_base TEXT NOT NULL CHECK(unidade_base IN ('kg','g','t','l','ml','dose','un','ui')),
  custo_entrada_centavos INTEGER CHECK(custo_entrada_centavos IS NULL OR custo_entrada_centavos BETWEEN 0 AND 1000000000000),
  custo_apropriado_centavos INTEGER CHECK(custo_apropriado_centavos IS NULL OR custo_apropriado_centavos >= 0),
  destino TEXT CHECK(destino IN ('propriedade','lote','animal')),
  lote_animal_id TEXT REFERENCES lote(id),
  animal_id TEXT REFERENCES animal(id),
  manejo_sanitario_id TEXT REFERENCES manejo_sanitario(id),
  requisicao_id TEXT NOT NULL UNIQUE,
  documento_origem_id TEXT,
  substitui_id TEXT REFERENCES movimentacao_estoque(id),
  motivo TEXT,
  observacao TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((destino IS NULL AND lote_animal_id IS NULL AND animal_id IS NULL)
     OR (destino = 'propriedade' AND lote_animal_id IS NULL AND animal_id IS NULL)
     OR (destino = 'lote' AND lote_animal_id IS NOT NULL AND animal_id IS NULL)
     OR (destino = 'animal' AND animal_id IS NOT NULL AND lote_animal_id IS NULL)),
  CHECK((tipo IN ('entrada_compra','entrada_producao','entrada_inicial','ajuste_entrada') AND destino IS NULL)
     OR (tipo IN ('saida_consumo','saida_perda','saida_venda','ajuste_saida') AND destino IS NOT NULL AND custo_entrada_centavos IS NULL))
) STRICT;
CREATE UNIQUE INDEX ux_estoque_mov_ordem ON movimentacao_estoque(estoque_item_id,ordem) WHERE deleted_at IS NULL;
CREATE INDEX ix_estoque_mov_data ON movimentacao_estoque(estoque_item_id,data,ordem);
CREATE INDEX ix_estoque_mov_manejo ON movimentacao_estoque(manejo_sanitario_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_estoque_mov_destino_lote ON movimentacao_estoque(lote_animal_id,data);
CREATE INDEX ix_estoque_mov_destino_animal ON movimentacao_estoque(animal_id,data);

CREATE TRIGGER tg_estoque_item_sem_exclusao BEFORE DELETE ON estoque_item BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_estoque_lote_sem_exclusao BEFORE DELETE ON estoque_lote BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_estoque_mov_sem_exclusao BEFORE DELETE ON movimentacao_estoque BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_estoque_mov_consistencia BEFORE INSERT ON movimentacao_estoque
WHEN NEW.unidade_base <> (SELECT unidade_base FROM estoque_item WHERE id = NEW.estoque_item_id)
  OR (NEW.lote_estoque_id IS NOT NULL AND NEW.estoque_item_id <> (SELECT estoque_item_id FROM estoque_lote WHERE id = NEW.lote_estoque_id))
  OR ((SELECT controle_lote FROM estoque_item WHERE id = NEW.estoque_item_id) = 1 AND NEW.lote_estoque_id IS NULL)
BEGIN SELECT RAISE(ABORT,'Unidade ou lote físico incompatível com o item.'); END;
CREATE TRIGGER tg_estoque_mov_imutavel BEFORE UPDATE ON movimentacao_estoque
WHEN NEW.id <> OLD.id OR NEW.estoque_item_id <> OLD.estoque_item_id
  OR NEW.data <> OLD.data OR NEW.ordem <> OLD.ordem OR NEW.tipo <> OLD.tipo
  OR NEW.quantidade_milesimos <> OLD.quantidade_milesimos OR NEW.unidade_base <> OLD.unidade_base
  OR NEW.custo_entrada_centavos IS NOT OLD.custo_entrada_centavos
  OR NEW.lote_estoque_id IS NOT OLD.lote_estoque_id
  OR NEW.destino IS NOT OLD.destino OR NEW.lote_animal_id IS NOT OLD.lote_animal_id OR NEW.animal_id IS NOT OLD.animal_id
  OR NEW.manejo_sanitario_id IS NOT OLD.manejo_sanitario_id OR NEW.requisicao_id <> OLD.requisicao_id
  OR NEW.documento_origem_id IS NOT OLD.documento_origem_id OR NEW.substitui_id IS NOT OLD.substitui_id
BEGIN SELECT RAISE(ABORT,'Corrija por cancelamento e substituição auditada.'); END;

-- Amplia a trilha preservando integralmente seus registros e gatilhos.
DROP TRIGGER tg_historico_sem_alteracao;
DROP TRIGGER tg_historico_sem_exclusao;
CREATE TABLE historico_alteracao_estoque (
  id TEXT PRIMARY KEY NOT NULL,
  entidade TEXT NOT NULL CHECK(entidade IN ('propriedade','area','raca','lote','animal','pesagem','produto_sanitario','manejo_sanitario','agenda_sanitaria','estoque_item','estoque_lote','movimentacao_estoque')),
  entidade_id TEXT NOT NULL,
  acao TEXT NOT NULL CHECK(acao IN ('criacao','alteracao','exclusao','transferencia','saida','encerramento','reabertura','mudanca_area','importacao','conferencia','remocao_animal','cancelamento','conclusao')),
  dados_anteriores_json TEXT CHECK(dados_anteriores_json IS NULL OR json_valid(dados_anteriores_json)),
  dados_novos_json TEXT CHECK(dados_novos_json IS NULL OR json_valid(dados_novos_json)),
  motivo TEXT,
  ocorrido_em TEXT NOT NULL
) STRICT;
INSERT INTO historico_alteracao_estoque SELECT * FROM historico_alteracao;
DROP TABLE historico_alteracao;
ALTER TABLE historico_alteracao_estoque RENAME TO historico_alteracao;
CREATE INDEX ix_historico_entidade ON historico_alteracao(entidade,entidade_id,ocorrido_em);
CREATE TRIGGER tg_historico_sem_alteracao BEFORE UPDATE ON historico_alteracao BEGIN SELECT RAISE(ABORT,'A trilha de alterações não pode ser modificada.'); END;
CREATE TRIGGER tg_historico_sem_exclusao BEFORE DELETE ON historico_alteracao BEGIN SELECT RAISE(ABORT,'A trilha de alterações não pode ser apagada.'); END;
