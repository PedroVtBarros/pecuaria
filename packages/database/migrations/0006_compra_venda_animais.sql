-- Fase 4C: compra e venda de animais e custo anterior ao sistema.
--
-- A negociação é a dona do fato "compra/venda de animal": o dinheiro (valor, parcelas e
-- pagamentos) continua nas tabelas financeiras da 0005, ligado por `lancamento_id`; os animais
-- continuam nas tabelas do rebanho, ligados pelos itens. Nada aqui altera tabelas existentes.
-- Exclusão física é proibida; cancelamento é lógico, com motivo.

CREATE TABLE negociacao_animal (
  id TEXT PRIMARY KEY NOT NULL,
  propriedade_id TEXT NOT NULL REFERENCES propriedade(id),
  tipo TEXT NOT NULL CHECK(tipo IN ('compra','venda')),
  data TEXT NOT NULL CHECK(data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  pessoa_id TEXT REFERENCES pessoa_comercial(id),
  -- O lançamento financeiro é do usuário: valor da operação, parcelas e pagamentos moram lá.
  lancamento_id TEXT NOT NULL UNIQUE REFERENCES lancamento_financeiro(id),
  valor_total_centavos INTEGER NOT NULL CHECK(valor_total_centavos > 0 AND valor_total_centavos <= 1000000000000),
  criterio_alocacao TEXT NOT NULL CHECK(criterio_alocacao IN ('igual','peso_vivo','peso_carcaca','manual')),
  -- Unidade em que o preço foi negociado (D-B: peso vivo e carcaça são grandezas distintas).
  unidade_preco TEXT NOT NULL CHECK(unidade_preco IN ('total','cabeca','kg_vivo','arroba_vivo','arroba_carcaca')),
  preco_unitario_centavos INTEGER CHECK(preco_unitario_centavos IS NULL OR (preco_unitario_centavos > 0 AND preco_unitario_centavos <= 1000000000000)),
  observacoes TEXT CHECK(observacoes IS NULL OR length(observacoes) <= 1000),
  requisicao_id TEXT NOT NULL UNIQUE,
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((unidade_preco = 'total') = (preco_unitario_centavos IS NULL)),
  CHECK((deleted_at IS NULL) = (motivo_cancelamento IS NULL))
) STRICT;
CREATE INDEX ix_negociacao_propriedade_data ON negociacao_animal(propriedade_id, data);

CREATE TABLE negociacao_animal_item (
  id TEXT PRIMARY KEY NOT NULL,
  negociacao_id TEXT NOT NULL REFERENCES negociacao_animal(id),
  -- Copiado da negociação para permitir a unicidade abaixo; um gatilho confere a igualdade.
  tipo TEXT NOT NULL CHECK(tipo IN ('compra','venda')),
  animal_id TEXT NOT NULL REFERENCES animal(id),
  movimentacao_animal_id TEXT NOT NULL UNIQUE REFERENCES movimentacao_animal(id),
  -- Parte do valor da operação atribuída ao animal. A soma dos itens ativos é o total.
  valor_alocado_centavos INTEGER NOT NULL CHECK(valor_alocado_centavos >= 0 AND valor_alocado_centavos <= 1000000000000),
  -- Pesos do documento, em gramas inteiros (a divisão proporcional é exata). Peso de carcaça
  -- só existe quando foi informado; nunca é estimado a partir do peso vivo.
  peso_vivo_g INTEGER CHECK(peso_vivo_g IS NULL OR peso_vivo_g > 0),
  peso_carcaca_g INTEGER CHECK(peso_carcaca_g IS NULL OR peso_carcaca_g > 0),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX ux_negociacao_item_animal ON negociacao_animal_item(negociacao_id, animal_id);
-- Um animal tem no máximo uma compra e uma venda ativas ao mesmo tempo.
CREATE UNIQUE INDEX ux_negociacao_item_ativo ON negociacao_animal_item(animal_id, tipo) WHERE deleted_at IS NULL;
CREATE INDEX ix_negociacao_item_negociacao ON negociacao_animal_item(negociacao_id);

-- Custo anterior ao sistema (D-G): registro próprio, informado pelo usuário, sem movimento de
-- caixa, parcela, pagamento nem lançamento. Aparece só em custos apropriados.
CREATE TABLE custo_anterior (
  id TEXT PRIMARY KEY NOT NULL,
  propriedade_id TEXT NOT NULL REFERENCES propriedade(id),
  destino TEXT NOT NULL CHECK(destino IN ('animal','lote')),
  animal_id TEXT REFERENCES animal(id),
  lote_id TEXT REFERENCES lote(id),
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos > 0 AND valor_centavos <= 1000000000000),
  -- Data até a qual o valor foi acumulado; define quem estava no lote.
  data_referencia TEXT NOT NULL CHECK(data_referencia GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  descricao TEXT NOT NULL CHECK(length(descricao) BETWEEN 1 AND 200),
  origem_informacao TEXT NOT NULL CHECK(length(origem_informacao) BETWEEN 1 AND 200),
  justificativa TEXT NOT NULL CHECK(length(justificativa) BETWEEN 1 AND 500),
  requisicao_id TEXT NOT NULL UNIQUE,
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((destino = 'animal' AND animal_id IS NOT NULL AND lote_id IS NULL)
     OR (destino = 'lote' AND lote_id IS NOT NULL AND animal_id IS NULL)),
  CHECK((deleted_at IS NULL) = (motivo_cancelamento IS NULL))
) STRICT;
CREATE INDEX ix_custo_anterior_animal ON custo_anterior(animal_id) WHERE animal_id IS NOT NULL;
CREATE INDEX ix_custo_anterior_lote ON custo_anterior(lote_id) WHERE lote_id IS NOT NULL;

-- Distribuição do custo anterior entre os animais (sempre existe, mesmo para um só animal).
CREATE TABLE custo_anterior_item (
  id TEXT PRIMARY KEY NOT NULL,
  custo_anterior_id TEXT NOT NULL REFERENCES custo_anterior(id),
  animal_id TEXT NOT NULL REFERENCES animal(id),
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos >= 0 AND valor_centavos <= 1000000000000),
  -- Peso relativo usado na divisão (1 para o rateio igualitário), gravado para auditoria.
  peso_relativo INTEGER NOT NULL CHECK(peso_relativo > 0),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX ux_custo_anterior_item ON custo_anterior_item(custo_anterior_id, animal_id);
CREATE INDEX ix_custo_anterior_item_animal ON custo_anterior_item(animal_id);

-- Exclusão física proibida.
CREATE TRIGGER tg_negociacao_sem_exclusao BEFORE DELETE ON negociacao_animal BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_negociacao_item_sem_exclusao BEFORE DELETE ON negociacao_animal_item BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_custo_anterior_sem_exclusao BEFORE DELETE ON custo_anterior BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_custo_anterior_item_sem_exclusao BEFORE DELETE ON custo_anterior_item BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;

-- Negociação: o lançamento precisa ser dela (origem), da natureza certa e da mesma propriedade.
CREATE TRIGGER tg_negociacao_lancamento BEFORE INSERT ON negociacao_animal
WHEN NOT EXISTS (
  SELECT 1 FROM lancamento_financeiro l
  WHERE l.id = NEW.lancamento_id AND l.deleted_at IS NULL
    AND l.origem_tipo = 'negociacao_animal' AND l.origem_id = NEW.id
    AND l.propriedade_id = NEW.propriedade_id
    AND l.natureza = CASE NEW.tipo WHEN 'compra' THEN 'despesa' ELSE 'receita' END
    AND l.valor_total_centavos = NEW.valor_total_centavos)
BEGIN SELECT RAISE(ABORT,'O lançamento não pertence a esta negociação, tem outra natureza, propriedade ou valor.'); END;
-- Campos que nunca mudam; negociação cancelada fica congelada.
CREATE TRIGGER tg_negociacao_imutavel BEFORE UPDATE ON negociacao_animal
WHEN NEW.id <> OLD.id OR NEW.propriedade_id <> OLD.propriedade_id OR NEW.tipo <> OLD.tipo
  OR NEW.data <> OLD.data OR NEW.pessoa_id IS NOT OLD.pessoa_id OR NEW.lancamento_id <> OLD.lancamento_id
  OR NEW.valor_total_centavos <> OLD.valor_total_centavos OR NEW.criterio_alocacao <> OLD.criterio_alocacao
  OR NEW.unidade_preco <> OLD.unidade_preco OR NEW.preco_unitario_centavos IS NOT OLD.preco_unitario_centavos
  OR NEW.requisicao_id <> OLD.requisicao_id OR OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Negociação só pode ser cancelada; os demais campos são imutáveis.'); END;
-- Cancelar a negociação exige o lançamento já cancelado (e este, os pagamentos estornados).
CREATE TRIGGER tg_negociacao_cancelar BEFORE UPDATE OF deleted_at ON negociacao_animal
WHEN NEW.deleted_at IS NOT NULL
  AND (SELECT deleted_at FROM lancamento_financeiro WHERE id = NEW.lancamento_id) IS NULL
BEGIN SELECT RAISE(ABORT,'Cancele o lançamento da negociação junto com ela.'); END;

-- Item: mesmo tipo e propriedade da negociação; só pode ser cancelado, com a negociação.
CREATE TRIGGER tg_negociacao_item_consistencia BEFORE INSERT ON negociacao_animal_item
WHEN NEW.tipo IS NOT (SELECT tipo FROM negociacao_animal WHERE id = NEW.negociacao_id)
  OR (SELECT propriedade_id FROM animal WHERE id = NEW.animal_id)
     IS NOT (SELECT propriedade_id FROM negociacao_animal WHERE id = NEW.negociacao_id)
  OR (SELECT deleted_at FROM negociacao_animal WHERE id = NEW.negociacao_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Item incompatível com a negociação (tipo, propriedade ou negociação cancelada).'); END;
CREATE TRIGGER tg_negociacao_item_imutavel BEFORE UPDATE ON negociacao_animal_item
WHEN NEW.id <> OLD.id OR NEW.negociacao_id <> OLD.negociacao_id OR NEW.tipo <> OLD.tipo
  OR NEW.animal_id <> OLD.animal_id OR NEW.movimentacao_animal_id <> OLD.movimentacao_animal_id
  OR NEW.valor_alocado_centavos <> OLD.valor_alocado_centavos
  OR NEW.peso_vivo_g IS NOT OLD.peso_vivo_g OR NEW.peso_carcaca_g IS NOT OLD.peso_carcaca_g
  OR OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Item de negociação só pode ser cancelado.'); END;
CREATE TRIGGER tg_negociacao_item_cancelar BEFORE UPDATE OF deleted_at ON negociacao_animal_item
WHEN NEW.deleted_at IS NOT NULL
  AND (SELECT deleted_at FROM negociacao_animal WHERE id = NEW.negociacao_id) IS NULL
BEGIN SELECT RAISE(ABORT,'Cancele a negociação inteira, não um item isolado.'); END;

-- Custo anterior: destino da mesma propriedade; só cancelamento depois de criado.
CREATE TRIGGER tg_custo_anterior_consistencia BEFORE INSERT ON custo_anterior
WHEN (NEW.animal_id IS NOT NULL AND NEW.propriedade_id IS NOT (SELECT propriedade_id FROM animal WHERE id = NEW.animal_id))
  OR (NEW.lote_id IS NOT NULL AND NEW.propriedade_id IS NOT (SELECT propriedade_id FROM lote WHERE id = NEW.lote_id))
BEGIN SELECT RAISE(ABORT,'Animal ou lote de outra propriedade.'); END;
CREATE TRIGGER tg_custo_anterior_imutavel BEFORE UPDATE ON custo_anterior
WHEN NEW.id <> OLD.id OR NEW.propriedade_id <> OLD.propriedade_id OR NEW.destino <> OLD.destino
  OR NEW.animal_id IS NOT OLD.animal_id OR NEW.lote_id IS NOT OLD.lote_id
  OR NEW.valor_centavos <> OLD.valor_centavos OR NEW.data_referencia <> OLD.data_referencia
  OR NEW.descricao <> OLD.descricao OR NEW.origem_informacao <> OLD.origem_informacao
  OR NEW.justificativa <> OLD.justificativa OR NEW.requisicao_id <> OLD.requisicao_id
  OR OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Custo anterior só pode ser cancelado.'); END;
CREATE TRIGGER tg_custo_anterior_item_consistencia BEFORE INSERT ON custo_anterior_item
WHEN (SELECT propriedade_id FROM animal WHERE id = NEW.animal_id)
     IS NOT (SELECT propriedade_id FROM custo_anterior WHERE id = NEW.custo_anterior_id)
  OR (SELECT deleted_at FROM custo_anterior WHERE id = NEW.custo_anterior_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Animal de outra propriedade ou custo anterior cancelado.'); END;
CREATE TRIGGER tg_custo_anterior_item_imutavel BEFORE UPDATE ON custo_anterior_item
BEGIN SELECT RAISE(ABORT,'A distribuição do custo anterior não pode ser alterada.'); END;

-- O valor do lançamento de uma negociação acompanha o da negociação (a alocação aos animais
-- depende dele). Renegociar parcelas é permitido; mudar o total não.
CREATE TRIGGER tg_lancamento_negociacao_total BEFORE UPDATE OF valor_total_centavos ON lancamento_financeiro
WHEN NEW.origem_tipo = 'negociacao_animal' AND NEW.valor_total_centavos <> OLD.valor_total_centavos
BEGIN SELECT RAISE(ABORT,'O valor de uma negociação de animais não pode ser alterado pelo lançamento.'); END;
