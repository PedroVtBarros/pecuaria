-- Fase 4D: compra de insumos ligada às entradas físicas do estoque e classificação de custos
-- que não são lançamentos.
--
-- Um fato, um dono: a nota de insumos é um lançamento financeiro (dono do dinheiro) com itens; cada
-- item é dono do vínculo com UMA entrada de estoque (dona da quantidade e do custo médio). Nenhuma
-- despesa de resultado nasce da entrada nem do consumo: a compra vira custo só quando consumida.

CREATE TABLE lancamento_item (
  id TEXT PRIMARY KEY NOT NULL,
  lancamento_id TEXT NOT NULL REFERENCES lancamento_financeiro(id),
  estoque_item_id TEXT NOT NULL REFERENCES estoque_item(id),
  quantidade_milesimos INTEGER NOT NULL CHECK(quantidade_milesimos > 0 AND quantidade_milesimos <= 1000000000000),
  unidade_base TEXT NOT NULL CHECK(unidade_base IN ('kg','g','t','l','ml','dose','un','ui')),
  -- Valor do item (inclui a parte do frete rateado, quando houve). É o custo de entrada do estoque.
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos >= 0 AND valor_centavos <= 1000000000000),
  -- A entrada física: única. Em correção, aponta para o movimento que substituiu o anterior.
  movimentacao_estoque_id TEXT NOT NULL UNIQUE REFERENCES movimentacao_estoque(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX ix_lancamento_item_lancamento ON lancamento_item(lancamento_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_lancamento_item_estoque ON lancamento_item(estoque_item_id);

-- Classificação padrão (fixo ou variável) de custos que não são lançamentos (D-E). Ausência de
-- linha equivale a "não classificado" (que também pode ser gravado, para desfazer uma escolha);
-- nunca é presumido fixo nem variável.
CREATE TABLE classificacao_custo_origem (
  id TEXT PRIMARY KEY NOT NULL,
  propriedade_id TEXT NOT NULL REFERENCES propriedade(id),
  escopo TEXT NOT NULL CHECK(escopo IN ('estoque_item','aquisicao_animal','custo_anterior')),
  -- Item de estoque quando o escopo é `estoque_item`; nulo nos demais.
  referencia_id TEXT,
  comportamento_custo TEXT NOT NULL CHECK(comportamento_custo IN ('variavel','fixo','nao_classificado')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((escopo = 'estoque_item') = (referencia_id IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX ux_classificacao_origem ON classificacao_custo_origem(propriedade_id, escopo, COALESCE(referencia_id, ''));

CREATE TRIGGER tg_lancamento_item_sem_exclusao BEFORE DELETE ON lancamento_item BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_classificacao_origem_sem_exclusao BEFORE DELETE ON classificacao_custo_origem BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;

-- Item: lançamento ativo de despesa de compra para estoque, na mesma propriedade do item; a
-- entrada precisa ser uma compra do mesmo item, mesma quantidade e unidade, com custo conhecido
-- igual ao valor do item (custo desconhecido não é vinculado: seria dinheiro inventado).
CREATE TRIGGER tg_lancamento_item_consistencia BEFORE INSERT ON lancamento_item
WHEN NOT EXISTS (
    SELECT 1 FROM lancamento_financeiro l
    JOIN categoria_financeira c ON c.id = l.categoria_id
    JOIN estoque_item i ON i.id = NEW.estoque_item_id
    WHERE l.id = NEW.lancamento_id AND l.deleted_at IS NULL AND l.natureza = 'despesa'
      AND c.tratamento = 'estoque' AND l.propriedade_id = i.propriedade_id)
  OR NOT EXISTS (
    SELECT 1 FROM movimentacao_estoque m
    WHERE m.id = NEW.movimentacao_estoque_id AND m.deleted_at IS NULL AND m.tipo = 'entrada_compra'
      AND m.estoque_item_id = NEW.estoque_item_id AND m.quantidade_milesimos = NEW.quantidade_milesimos
      AND m.unidade_base = NEW.unidade_base AND m.custo_entrada_centavos = NEW.valor_centavos)
BEGIN SELECT RAISE(ABORT,'Item incompatível: lançamento de compra para estoque da mesma propriedade e entrada de compra do mesmo item, quantidade e custo.'); END;

-- Campos fixos. Só dois caminhos de alteração: cancelamento (com a entrada já cancelada) e
-- correção, em que o item passa a apontar para o movimento que substituiu o anterior, com a nova
-- quantidade e o novo valor iguais aos do novo movimento.
CREATE TRIGGER tg_lancamento_item_imutavel BEFORE UPDATE ON lancamento_item
WHEN NEW.id <> OLD.id OR NEW.lancamento_id <> OLD.lancamento_id OR NEW.estoque_item_id <> OLD.estoque_item_id
  OR NEW.unidade_base <> OLD.unidade_base OR OLD.deleted_at IS NOT NULL
  OR (NEW.movimentacao_estoque_id = OLD.movimentacao_estoque_id AND (NEW.quantidade_milesimos <> OLD.quantidade_milesimos OR NEW.valor_centavos <> OLD.valor_centavos))
  OR (NEW.movimentacao_estoque_id <> OLD.movimentacao_estoque_id AND NOT EXISTS (
        SELECT 1 FROM movimentacao_estoque m
        WHERE m.id = NEW.movimentacao_estoque_id AND m.substitui_id = OLD.movimentacao_estoque_id
          AND m.deleted_at IS NULL AND m.quantidade_milesimos = NEW.quantidade_milesimos
          AND m.custo_entrada_centavos = NEW.valor_centavos))
BEGIN SELECT RAISE(ABORT,'Item de compra só muda por cancelamento ou por correção auditada da entrada.'); END;
CREATE TRIGGER tg_lancamento_item_cancelar BEFORE UPDATE OF deleted_at ON lancamento_item
WHEN NEW.deleted_at IS NOT NULL
  AND (SELECT deleted_at FROM movimentacao_estoque WHERE id = OLD.movimentacao_estoque_id) IS NULL
BEGIN SELECT RAISE(ABORT,'Cancele a entrada de estoque antes do item de compra.'); END;

-- Lançamento com itens vinculados só é cancelado depois de seus itens (e das entradas).
CREATE TRIGGER tg_lancamento_com_itens_cancelar BEFORE UPDATE OF deleted_at ON lancamento_financeiro
WHEN NEW.deleted_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM lancamento_item WHERE lancamento_id = NEW.id AND deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Cancele pela compra de insumos: as entradas de estoque ligadas precisam ser canceladas junto.'); END;

-- Consultas de custo apropriado (consumos): cobertura do resumo por item, tipo e destino e
-- ordenação da lista por data sem varrer todo o histórico do estoque.
CREATE INDEX ix_estoque_mov_custo ON movimentacao_estoque(estoque_item_id, tipo, data, destino, custo_apropriado_centavos)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_estoque_mov_saidas_data ON movimentacao_estoque(data DESC, ordem DESC)
  WHERE deleted_at IS NULL AND tipo IN ('saida_consumo','saida_perda','ajuste_saida','saida_venda');
