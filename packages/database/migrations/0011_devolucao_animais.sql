-- Fase 4 (revisão final): devolução de animais vendidos (pelo comprador) e comprados (ao
-- fornecedor), com compensação financeira sem caixa.
--
-- A devolução é uma operação própria, vinculada à negociação original, que fica preservada:
-- - venda devolvida: o animal volta ao rebanho na data da devolução por uma nova entrada; a saída
--   da venda continua no histórico (nada é reconstruído para trás);
-- - compra devolvida: o animal sai do rebanho na data da devolução, pelo fluxo de saída.
-- O valor acordado mora num lançamento do tipo "devolucao" ligado ao lançamento original. O que
-- ainda estava em aberto na negociação original é liquidado por compensação (sem pagamento e sem
-- caixa); só o restante vira reembolso a pagar (venda) ou valor a recuperar (compra).
-- Nenhuma tabela existente é recriada; nada é apagado.

CREATE TABLE devolucao_animal (
  id TEXT PRIMARY KEY NOT NULL,
  propriedade_id TEXT NOT NULL REFERENCES propriedade(id),
  -- Tipo da negociação devolvida: 'venda' (o comprador devolve) ou 'compra' (devolve-se ao fornecedor).
  tipo TEXT NOT NULL CHECK(tipo IN ('venda','compra')),
  negociacao_id TEXT NOT NULL REFERENCES negociacao_animal(id),
  data TEXT NOT NULL CHECK(data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  lancamento_id TEXT NOT NULL UNIQUE REFERENCES lancamento_financeiro(id),
  -- Valor acordado da devolução (soma dos itens), informado pelo usuário.
  valor_total_centavos INTEGER NOT NULL CHECK(valor_total_centavos > 0 AND valor_total_centavos <= 1000000000000),
  observacoes TEXT CHECK(observacoes IS NULL OR length(observacoes) <= 1000),
  requisicao_id TEXT NOT NULL UNIQUE,
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((deleted_at IS NULL) = (motivo_cancelamento IS NULL))
) STRICT;
CREATE INDEX ix_devolucao_negociacao ON devolucao_animal(negociacao_id);
CREATE INDEX ix_devolucao_propriedade_data ON devolucao_animal(propriedade_id, data);

CREATE TABLE devolucao_animal_item (
  id TEXT PRIMARY KEY NOT NULL,
  devolucao_id TEXT NOT NULL REFERENCES devolucao_animal(id),
  -- Item da negociação original devolvido (um animal).
  negociacao_item_id TEXT NOT NULL REFERENCES negociacao_animal_item(id),
  animal_id TEXT NOT NULL REFERENCES animal(id),
  -- Venda devolvida: a entrada de retorno; compra devolvida: a saída do rebanho.
  movimentacao_animal_id TEXT NOT NULL UNIQUE REFERENCES movimentacao_animal(id),
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos > 0 AND valor_centavos <= 1000000000000),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
-- O mesmo animal não é devolvido duas vezes pela mesma negociação.
CREATE UNIQUE INDEX ux_devolucao_item_ativo ON devolucao_animal_item(negociacao_item_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_devolucao_item_devolucao ON devolucao_animal_item(devolucao_id);
CREATE INDEX ix_devolucao_item_animal ON devolucao_animal_item(animal_id);

-- Compensação: liquida, sem caixa, parte de uma parcela em aberto da negociação original contra
-- uma parcela do lançamento da devolução. Não é pagamento nem recebimento.
CREATE TABLE compensacao_financeira (
  id TEXT PRIMARY KEY NOT NULL,
  devolucao_id TEXT NOT NULL REFERENCES devolucao_animal(id),
  parcela_origem_id TEXT NOT NULL REFERENCES parcela_financeira(id),
  parcela_devolucao_id TEXT NOT NULL REFERENCES parcela_financeira(id),
  data TEXT NOT NULL CHECK(data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos > 0 AND valor_centavos <= 1000000000000),
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((deleted_at IS NULL) = (motivo_cancelamento IS NULL))
) STRICT;
CREATE INDEX ix_compensacao_origem ON compensacao_financeira(parcela_origem_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_compensacao_devolucao_parcela ON compensacao_financeira(parcela_devolucao_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_compensacao_devolucao ON compensacao_financeira(devolucao_id);

-- Um item de negociação ativo por animal e tipo, exceto os já devolvidos: o animal devolvido pelo
-- comprador pode ser vendido de novo, e a venda original continua no histórico. O índice único da
-- 0006 vira gatilho porque a regra depende da tabela de devoluções.
DROP INDEX ux_negociacao_item_ativo;
CREATE INDEX ix_negociacao_item_animal_tipo ON negociacao_animal_item(animal_id, tipo) WHERE deleted_at IS NULL;
CREATE TRIGGER tg_negociacao_item_unico BEFORE INSERT ON negociacao_animal_item
WHEN EXISTS (
  SELECT 1 FROM negociacao_animal_item i
  WHERE i.animal_id = NEW.animal_id AND i.tipo = NEW.tipo AND i.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM devolucao_animal_item d WHERE d.negociacao_item_id = i.id AND d.deleted_at IS NULL))
BEGIN SELECT RAISE(ABORT,'O animal já tem uma negociação ativa deste tipo.'); END;

-- Exclusão física proibida.
CREATE TRIGGER tg_devolucao_sem_exclusao BEFORE DELETE ON devolucao_animal BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_devolucao_item_sem_exclusao BEFORE DELETE ON devolucao_animal_item BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_compensacao_sem_exclusao BEFORE DELETE ON compensacao_financeira BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;

-- Devolução: negociação ativa, do mesmo tipo e propriedade; lançamento de devolução ligado ao
-- lançamento original, da natureza oposta à da negociação original e com o mesmo valor.
CREATE TRIGGER tg_devolucao_consistencia BEFORE INSERT ON devolucao_animal
WHEN NOT EXISTS (
  SELECT 1 FROM negociacao_animal n JOIN lancamento_financeiro l ON l.id = NEW.lancamento_id
  WHERE n.id = NEW.negociacao_id AND n.deleted_at IS NULL AND n.tipo = NEW.tipo
    AND n.propriedade_id = NEW.propriedade_id
    AND l.deleted_at IS NULL AND l.tipo = 'devolucao' AND l.lancamento_origem_id = n.lancamento_id
    AND l.propriedade_id = NEW.propriedade_id
    AND l.natureza = CASE NEW.tipo WHEN 'venda' THEN 'despesa' ELSE 'receita' END
    AND l.valor_total_centavos = NEW.valor_total_centavos
    AND NEW.data >= n.data)
BEGIN SELECT RAISE(ABORT,'Devolução incompatível com a negociação ou com o lançamento.'); END;
CREATE TRIGGER tg_devolucao_imutavel BEFORE UPDATE ON devolucao_animal
WHEN NEW.id <> OLD.id OR NEW.propriedade_id <> OLD.propriedade_id OR NEW.tipo <> OLD.tipo
  OR NEW.negociacao_id <> OLD.negociacao_id OR NEW.data <> OLD.data
  OR NEW.lancamento_id <> OLD.lancamento_id OR NEW.valor_total_centavos <> OLD.valor_total_centavos
  OR NEW.requisicao_id <> OLD.requisicao_id OR OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Devolução só pode ser cancelada; os demais campos são imutáveis.'); END;
CREATE TRIGGER tg_devolucao_cancelar BEFORE UPDATE OF deleted_at ON devolucao_animal
WHEN NEW.deleted_at IS NOT NULL
  AND ((SELECT deleted_at FROM lancamento_financeiro WHERE id = NEW.lancamento_id) IS NULL
    OR EXISTS (SELECT 1 FROM compensacao_financeira k WHERE k.devolucao_id = NEW.id AND k.deleted_at IS NULL))
BEGIN SELECT RAISE(ABORT,'Cancele as compensações e o lançamento da devolução junto com ela.'); END;

-- Item: pertence à negociação da devolução, é do mesmo animal e a devolução está ativa.
CREATE TRIGGER tg_devolucao_item_consistencia BEFORE INSERT ON devolucao_animal_item
WHEN NOT EXISTS (
  SELECT 1 FROM devolucao_animal d JOIN negociacao_animal_item i ON i.id = NEW.negociacao_item_id
  WHERE d.id = NEW.devolucao_id AND d.deleted_at IS NULL
    AND i.negociacao_id = d.negociacao_id AND i.deleted_at IS NULL AND i.animal_id = NEW.animal_id)
BEGIN SELECT RAISE(ABORT,'Item de devolução incompatível com a negociação original.'); END;
CREATE TRIGGER tg_devolucao_item_imutavel BEFORE UPDATE ON devolucao_animal_item
WHEN NEW.id <> OLD.id OR NEW.devolucao_id <> OLD.devolucao_id
  OR NEW.negociacao_item_id <> OLD.negociacao_item_id OR NEW.animal_id <> OLD.animal_id
  OR NEW.movimentacao_animal_id <> OLD.movimentacao_animal_id
  OR NEW.valor_centavos <> OLD.valor_centavos OR OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Item de devolução só pode ser cancelado.'); END;
-- Desfazer a devolução de uma venda não pode deixar duas vendas vigentes do mesmo animal.
CREATE TRIGGER tg_devolucao_item_cancelar BEFORE UPDATE OF deleted_at ON devolucao_animal_item
WHEN NEW.deleted_at IS NOT NULL AND (
  (SELECT deleted_at FROM devolucao_animal WHERE id = NEW.devolucao_id) IS NULL
  OR EXISTS (
    SELECT 1 FROM negociacao_animal_item o JOIN negociacao_animal_item i ON i.id = NEW.negociacao_item_id
    WHERE o.animal_id = i.animal_id AND o.tipo = i.tipo AND o.id <> i.id AND o.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM devolucao_animal_item x WHERE x.negociacao_item_id = o.id AND x.deleted_at IS NULL)))
BEGIN SELECT RAISE(ABORT,'Cancele a devolução inteira; e não com outra negociação ativa do animal depois dela.'); END;

-- Compensação: parcela de origem da negociação original e parcela da devolução, ambas ativas.
CREATE TRIGGER tg_compensacao_consistencia BEFORE INSERT ON compensacao_financeira
WHEN NOT EXISTS (
  SELECT 1 FROM devolucao_animal d
  JOIN negociacao_animal n ON n.id = d.negociacao_id
  JOIN parcela_financeira po ON po.id = NEW.parcela_origem_id
  JOIN parcela_financeira pd ON pd.id = NEW.parcela_devolucao_id
  WHERE d.id = NEW.devolucao_id AND d.deleted_at IS NULL
    AND po.lancamento_id = n.lancamento_id AND po.deleted_at IS NULL
    AND pd.lancamento_id = d.lancamento_id AND pd.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Compensação incompatível com a devolução ou com as parcelas.'); END;
CREATE TRIGGER tg_compensacao_imutavel BEFORE UPDATE ON compensacao_financeira
WHEN NEW.id <> OLD.id OR NEW.devolucao_id <> OLD.devolucao_id
  OR NEW.parcela_origem_id <> OLD.parcela_origem_id OR NEW.parcela_devolucao_id <> OLD.parcela_devolucao_id
  OR NEW.data <> OLD.data OR NEW.valor_centavos <> OLD.valor_centavos OR OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Compensação só pode ser cancelada.'); END;

-- A negociação original não é cancelada enquanto houver devolução ativa dela.
CREATE TRIGGER tg_negociacao_cancelar_com_devolucao BEFORE UPDATE OF deleted_at ON negociacao_animal
WHEN NEW.deleted_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM devolucao_animal d WHERE d.negociacao_id = NEW.id AND d.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Cancele antes as devoluções desta negociação.'); END;
-- Parcela e lançamento com compensação ativa não são cancelados (a compensação sairia órfã).
CREATE TRIGGER tg_parcela_cancelar_com_compensacao BEFORE UPDATE OF deleted_at ON parcela_financeira
WHEN NEW.deleted_at IS NOT NULL AND EXISTS (
  SELECT 1 FROM compensacao_financeira k
  WHERE (k.parcela_origem_id = NEW.id OR k.parcela_devolucao_id = NEW.id) AND k.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'A parcela tem compensação ativa de uma devolução.'); END;
CREATE TRIGGER tg_lancamento_cancelar_com_compensacao BEFORE UPDATE OF deleted_at ON lancamento_financeiro
WHEN NEW.deleted_at IS NOT NULL AND EXISTS (
  SELECT 1 FROM compensacao_financeira k JOIN parcela_financeira p
    ON p.id = k.parcela_origem_id OR p.id = k.parcela_devolucao_id
  WHERE p.lancamento_id = NEW.id AND k.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'O lançamento tem compensação ativa de uma devolução.'); END;

-- Categorias das devoluções (só aceitam lançamentos do módulo de animais; o serviço as acha pelo
-- id). Nenhum dado científico. Se o usuário já tiver uma categoria com o mesmo nome, a do sistema
-- recebe o sufixo "(sistema)", para a migration nunca falhar por causa do nome.
INSERT INTO categoria_financeira(id,nome,nome_normalizado,natureza,grupo,tratamento,comportamento_custo,origem_exigida,origem,ativa,created_at,updated_at)
SELECT '01929c10-0000-7000-8000-000000000010',
  CASE WHEN EXISTS (SELECT 1 FROM categoria_financeira WHERE natureza = 'despesa' AND nome_normalizado = 'devolucao de venda de animais' AND deleted_at IS NULL)
    THEN 'Devolução de venda de animais (sistema)' ELSE 'Devolução de venda de animais' END,
  CASE WHEN EXISTS (SELECT 1 FROM categoria_financeira WHERE natureza = 'despesa' AND nome_normalizado = 'devolucao de venda de animais' AND deleted_at IS NULL)
    THEN 'devolucao de venda de animais (sistema)' ELSE 'devolucao de venda de animais' END,
  'despesa','animais','resultado','nao_classificado','negociacao_animal','sugestao',1,'2026-10-18T00:00:00.000Z','2026-10-18T00:00:00.000Z';
INSERT INTO categoria_financeira(id,nome,nome_normalizado,natureza,grupo,tratamento,comportamento_custo,origem_exigida,origem,ativa,created_at,updated_at)
SELECT '01929c10-0000-7000-8000-000000000011',
  CASE WHEN EXISTS (SELECT 1 FROM categoria_financeira WHERE natureza = 'receita' AND nome_normalizado = 'devolucao de compra de animais' AND deleted_at IS NULL)
    THEN 'Devolução de compra de animais (sistema)' ELSE 'Devolução de compra de animais' END,
  CASE WHEN EXISTS (SELECT 1 FROM categoria_financeira WHERE natureza = 'receita' AND nome_normalizado = 'devolucao de compra de animais' AND deleted_at IS NULL)
    THEN 'devolucao de compra de animais (sistema)' ELSE 'devolucao de compra de animais' END,
  'receita','animais','resultado','nao_se_aplica','negociacao_animal','sugestao',1,'2026-10-18T00:00:00.000Z','2026-10-18T00:00:00.000Z';
