-- Fase 4F: produção própria (centros de produção).
--
-- Um centro de produção (ex.: capim para silagem) reúne os custos de produzir um item de estoque:
-- despesas lançadas (diesel, mão de obra, semente comprada direto) e insumos do estoque consumidos
-- (adubo, semente do estoque). Esses custos NÃO viram custo de lote nem de animal enquanto estão no
-- centro: "um fato, um dono". Ao encerrar, o custo total vira o custo de entrada de uma
-- `entrada_producao` no estoque (com a quantidade colhida informada pelo usuário); o custo chega
-- aos animais depois, quando o volumoso é consumido, pelo custo médio do estoque. Custo
-- desconhecido de algum componente deixa a entrada com custo desconhecido, nunca zero.
--
-- Os vínculos ficam em tabelas próprias para não recriar `lancamento_financeiro` nem
-- `movimentacao_estoque`.

CREATE TABLE centro_producao (
  id TEXT PRIMARY KEY NOT NULL,
  propriedade_id TEXT NOT NULL REFERENCES propriedade(id),
  nome TEXT NOT NULL CHECK(length(nome) BETWEEN 1 AND 120),
  nome_normalizado TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('volumoso','outro')),
  area_id TEXT REFERENCES area(id),
  data_inicio TEXT NOT NULL CHECK(data_inicio GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- Preenchidos só enquanto encerrado (retrato do encerramento).
  data_fim TEXT CHECK(data_fim IS NULL OR data_fim GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  estoque_item_id TEXT NOT NULL REFERENCES estoque_item(id),
  status TEXT NOT NULL DEFAULT 'aberto' CHECK(status IN ('aberto','encerrado')),
  quantidade_produzida_milesimos INTEGER CHECK(quantidade_produzida_milesimos IS NULL OR quantidade_produzida_milesimos > 0),
  movimentacao_estoque_id TEXT REFERENCES movimentacao_estoque(id),
  -- Soma dos componentes de valor conhecido e quantos componentes tinham custo desconhecido.
  custo_conhecido_centavos INTEGER CHECK(custo_conhecido_centavos IS NULL OR custo_conhecido_centavos >= 0),
  componentes_desconhecidos INTEGER CHECK(componentes_desconhecidos IS NULL OR componentes_desconhecidos >= 0),
  -- Só existe quando nenhum componente é desconhecido; NULL = a entrada ficou com custo desconhecido.
  custo_total_centavos INTEGER CHECK(custo_total_centavos IS NULL OR custo_total_centavos >= 0),
  observacoes TEXT,
  requisicao_id TEXT NOT NULL UNIQUE,
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((status = 'encerrado') = (data_fim IS NOT NULL)),
  CHECK((status = 'encerrado') = (quantidade_produzida_milesimos IS NOT NULL)),
  CHECK((status = 'encerrado') = (movimentacao_estoque_id IS NOT NULL)),
  CHECK((status = 'encerrado') = (custo_conhecido_centavos IS NOT NULL)),
  CHECK((status = 'encerrado') = (componentes_desconhecidos IS NOT NULL)),
  CHECK(status = 'aberto' OR ((componentes_desconhecidos = 0) = (custo_total_centavos IS NOT NULL))),
  CHECK(custo_total_centavos IS NULL OR custo_total_centavos = custo_conhecido_centavos),
  CHECK(data_fim IS NULL OR data_fim >= data_inicio),
  CHECK((deleted_at IS NULL) = (motivo_cancelamento IS NULL))
) STRICT;
CREATE UNIQUE INDEX ux_centro_producao_nome ON centro_producao(propriedade_id, nome_normalizado) WHERE deleted_at IS NULL;
CREATE INDEX ix_centro_producao_propriedade ON centro_producao(propriedade_id, status);
CREATE UNIQUE INDEX ux_centro_producao_entrada ON centro_producao(movimentacao_estoque_id) WHERE movimentacao_estoque_id IS NOT NULL;

CREATE TABLE centro_producao_consumo (
  id TEXT PRIMARY KEY NOT NULL,
  centro_id TEXT NOT NULL REFERENCES centro_producao(id),
  movimentacao_estoque_id TEXT NOT NULL REFERENCES movimentacao_estoque(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
-- Um consumo pertence a um só centro.
CREATE UNIQUE INDEX ux_centro_consumo_ativo ON centro_producao_consumo(movimentacao_estoque_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_centro_consumo_centro ON centro_producao_consumo(centro_id) WHERE deleted_at IS NULL;

CREATE TABLE centro_producao_lancamento (
  id TEXT PRIMARY KEY NOT NULL,
  centro_id TEXT NOT NULL REFERENCES centro_producao(id),
  lancamento_id TEXT NOT NULL REFERENCES lancamento_financeiro(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX ux_centro_lancamento_ativo ON centro_producao_lancamento(lancamento_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_centro_lancamento_centro ON centro_producao_lancamento(centro_id) WHERE deleted_at IS NULL;

CREATE TRIGGER tg_centro_producao_sem_exclusao BEFORE DELETE ON centro_producao BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_centro_consumo_sem_exclusao BEFORE DELETE ON centro_producao_consumo BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_centro_lancamento_sem_exclusao BEFORE DELETE ON centro_producao_lancamento BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;

-- Item produzido e área da mesma propriedade; o centro nasce aberto.
CREATE TRIGGER tg_centro_producao_consistencia BEFORE INSERT ON centro_producao
WHEN NEW.status <> 'aberto'
  OR (SELECT propriedade_id FROM estoque_item WHERE id = NEW.estoque_item_id) IS NOT NEW.propriedade_id
  OR (NEW.area_id IS NOT NULL AND (SELECT propriedade_id FROM area WHERE id = NEW.area_id) IS NOT NEW.propriedade_id)
BEGIN SELECT RAISE(ABORT,'Centro de produção incompatível: item ou área de outra propriedade, ou já encerrado.'); END;

CREATE TRIGGER tg_centro_producao_imutavel BEFORE UPDATE ON centro_producao
WHEN NEW.id <> OLD.id OR NEW.propriedade_id <> OLD.propriedade_id OR NEW.estoque_item_id <> OLD.estoque_item_id
  OR NEW.requisicao_id <> OLD.requisicao_id OR OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Centro de produção cancelado ou com campo imutável: nada mais muda.'); END;

-- Encerrado, só se pode reabrir: nenhum outro campo muda.
CREATE TRIGGER tg_centro_producao_encerrado_fixo BEFORE UPDATE ON centro_producao
WHEN OLD.status = 'encerrado' AND NEW.status = 'encerrado' AND (
  NEW.nome <> OLD.nome OR NEW.tipo <> OLD.tipo OR NEW.area_id IS NOT OLD.area_id
  OR NEW.data_inicio <> OLD.data_inicio OR NEW.data_fim IS NOT OLD.data_fim
  OR NEW.movimentacao_estoque_id IS NOT OLD.movimentacao_estoque_id
  OR NEW.quantidade_produzida_milesimos IS NOT OLD.quantidade_produzida_milesimos
  OR NEW.custo_conhecido_centavos IS NOT OLD.custo_conhecido_centavos
  OR NEW.componentes_desconhecidos IS NOT OLD.componentes_desconhecidos
  OR NEW.custo_total_centavos IS NOT OLD.custo_total_centavos
  OR NEW.observacoes IS NOT OLD.observacoes OR NEW.deleted_at IS NOT OLD.deleted_at)
BEGIN SELECT RAISE(ABORT,'Centro de produção encerrado: reabra para alterar.'); END;

-- O encerramento só vale com a entrada de produção correspondente já criada no estoque.
CREATE TRIGGER tg_centro_producao_encerrar BEFORE UPDATE ON centro_producao
WHEN OLD.status = 'aberto' AND NEW.status = 'encerrado' AND NOT EXISTS (
  SELECT 1 FROM movimentacao_estoque m
  WHERE m.id = NEW.movimentacao_estoque_id AND m.tipo = 'entrada_producao'
    AND m.estoque_item_id = NEW.estoque_item_id AND m.deleted_at IS NULL
    AND m.documento_origem_id = NEW.id AND m.quantidade_milesimos = NEW.quantidade_produzida_milesimos
    AND m.custo_entrada_centavos IS NEW.custo_total_centavos AND m.data = NEW.data_fim)
BEGIN SELECT RAISE(ABORT,'Encerramento sem a entrada de produção correspondente no estoque.'); END;

-- Cancelar o centro: só aberto e sem custos vinculados.
CREATE TRIGGER tg_centro_producao_cancelar BEFORE UPDATE OF deleted_at ON centro_producao
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND (
  OLD.status <> 'aberto'
  OR EXISTS (SELECT 1 FROM centro_producao_consumo WHERE centro_id = OLD.id AND deleted_at IS NULL)
  OR EXISTS (SELECT 1 FROM centro_producao_lancamento WHERE centro_id = OLD.id AND deleted_at IS NULL))
BEGIN SELECT RAISE(ABORT,'Só um centro aberto e sem custos vinculados pode ser cancelado.'); END;

-- Consumo vinculável: saída de consumo, perda ou ajuste da propriedade, sem registro sanitário,
-- de outro item que o produzido, sem rateio ativo e com o centro aberto.
CREATE TRIGGER tg_centro_consumo_consistencia BEFORE INSERT ON centro_producao_consumo
WHEN NOT EXISTS (
  SELECT 1 FROM centro_producao c, movimentacao_estoque m JOIN estoque_item i ON i.id = m.estoque_item_id
  WHERE c.id = NEW.centro_id AND c.status = 'aberto' AND c.deleted_at IS NULL
    AND m.id = NEW.movimentacao_estoque_id AND m.deleted_at IS NULL
    AND i.propriedade_id = c.propriedade_id AND m.estoque_item_id <> c.estoque_item_id
    AND m.destino = 'propriedade' AND m.manejo_sanitario_id IS NULL
    AND m.tipo IN ('saida_consumo','saida_perda','ajuste_saida')
    AND NOT EXISTS (SELECT 1 FROM rateio_custo r WHERE r.origem_tipo = 'movimentacao_estoque'
                    AND r.origem_id = m.id AND r.deleted_at IS NULL))
BEGIN SELECT RAISE(ABORT,'Consumo não vinculável ao centro: precisa ser consumo da propriedade, de outro item, sem rateio, com o centro aberto.'); END;

-- Vínculo de consumo: só se desfaz ou acompanha a correção do movimento, com o centro aberto.
CREATE TRIGGER tg_centro_consumo_imutavel BEFORE UPDATE ON centro_producao_consumo
WHEN NEW.id <> OLD.id OR NEW.centro_id <> OLD.centro_id OR OLD.deleted_at IS NOT NULL
  OR (SELECT status FROM centro_producao WHERE id = OLD.centro_id) <> 'aberto'
  OR (NEW.movimentacao_estoque_id <> OLD.movimentacao_estoque_id AND
      (SELECT substitui_id FROM movimentacao_estoque WHERE id = NEW.movimentacao_estoque_id) IS NOT OLD.movimentacao_estoque_id)
BEGIN SELECT RAISE(ABORT,'Vínculo de consumo: só se desfaz (com o centro aberto) ou acompanha a correção do movimento.'); END;

-- Despesa vinculável: despesa manual de resultado, da propriedade, sem lote nem animal, sem rateio ativo.
CREATE TRIGGER tg_centro_lancamento_consistencia BEFORE INSERT ON centro_producao_lancamento
WHEN NOT EXISTS (
  SELECT 1 FROM centro_producao c, lancamento_financeiro l JOIN categoria_financeira k ON k.id = l.categoria_id
  WHERE c.id = NEW.centro_id AND c.status = 'aberto' AND c.deleted_at IS NULL
    AND l.id = NEW.lancamento_id AND l.deleted_at IS NULL AND l.propriedade_id = c.propriedade_id
    AND l.natureza = 'despesa' AND l.origem_tipo = 'manual' AND l.destino_tipo IN ('propriedade','nenhum')
    AND k.tratamento = 'resultado'
    AND NOT EXISTS (SELECT 1 FROM rateio_custo r WHERE r.origem_tipo = 'lancamento'
                    AND r.origem_id = l.id AND r.deleted_at IS NULL))
BEGIN SELECT RAISE(ABORT,'Despesa não vinculável ao centro: precisa ser despesa manual de resultado da propriedade, sem rateio, com o centro aberto.'); END;

CREATE TRIGGER tg_centro_lancamento_imutavel BEFORE UPDATE ON centro_producao_lancamento
WHEN NEW.id <> OLD.id OR NEW.centro_id <> OLD.centro_id OR NEW.lancamento_id <> OLD.lancamento_id
  OR OLD.deleted_at IS NOT NULL OR (SELECT status FROM centro_producao WHERE id = OLD.centro_id) <> 'aberto'
BEGIN SELECT RAISE(ABORT,'Vínculo de despesa: só se desfaz, com o centro aberto.'); END;

-- Custo de centro encerrado já virou entrada de estoque: não muda por baixo.
CREATE TRIGGER tg_movimento_de_centro_encerrado BEFORE UPDATE OF deleted_at ON movimentacao_estoque
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND (
  EXISTS (SELECT 1 FROM centro_producao WHERE movimentacao_estoque_id = OLD.id AND status = 'encerrado')
  OR EXISTS (SELECT 1 FROM centro_producao_consumo v JOIN centro_producao c ON c.id = v.centro_id
             WHERE v.movimentacao_estoque_id = OLD.id AND v.deleted_at IS NULL AND c.status = 'encerrado'))
BEGIN SELECT RAISE(ABORT,'Este movimento pertence a um centro de produção encerrado: reabra o centro antes.'); END;

CREATE TRIGGER tg_lancamento_de_centro_encerrado BEFORE UPDATE ON lancamento_financeiro
WHEN ((NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
      OR NEW.valor_total_centavos <> OLD.valor_total_centavos OR NEW.categoria_id <> OLD.categoria_id
      OR NEW.destino_tipo <> OLD.destino_tipo)
  AND EXISTS (SELECT 1 FROM centro_producao_lancamento v JOIN centro_producao c ON c.id = v.centro_id
              WHERE v.lancamento_id = OLD.id AND v.deleted_at IS NULL AND c.status = 'encerrado')
BEGIN SELECT RAISE(ABORT,'Esta despesa pertence a um centro de produção encerrado: reabra o centro antes.'); END;

-- O rateio de custos da 4E não aceita custo que já está num centro de produção.
DROP TRIGGER tg_rateio_origem;
CREATE TRIGGER tg_rateio_origem BEFORE INSERT ON rateio_custo
WHEN NOT (
  (NEW.origem_tipo = 'lancamento' AND EXISTS (
    SELECT 1 FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id
    WHERE l.id = NEW.origem_id AND l.propriedade_id = NEW.propriedade_id AND l.deleted_at IS NULL
      AND l.natureza = 'despesa' AND l.destino_tipo IN ('propriedade','nenhum') AND l.origem_tipo = 'manual'
      AND c.tratamento IN ('resultado','ativo_animal')
      AND NOT EXISTS (SELECT 1 FROM centro_producao_lancamento v WHERE v.lancamento_id = l.id AND v.deleted_at IS NULL)))
  OR
  (NEW.origem_tipo = 'movimentacao_estoque' AND EXISTS (
    SELECT 1 FROM movimentacao_estoque m JOIN estoque_item i ON i.id = m.estoque_item_id
    WHERE m.id = NEW.origem_id AND i.propriedade_id = NEW.propriedade_id AND m.deleted_at IS NULL
      AND m.destino = 'propriedade' AND m.manejo_sanitario_id IS NULL
      AND m.tipo IN ('saida_consumo','saida_perda','ajuste_saida')
      AND NOT EXISTS (SELECT 1 FROM centro_producao_consumo v WHERE v.movimentacao_estoque_id = m.id AND v.deleted_at IS NULL)))
)
BEGIN SELECT RAISE(ABORT,'Origem não elegível ao rateio: só custos da propriedade, sem destino definido, fora de centro de produção e ainda ativos.'); END;
