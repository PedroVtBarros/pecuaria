-- Fase 4E: rateio de custos compartilhados.
--
-- Um rateio é a decisão, auditável e revisável, de distribuir um custo da propriedade (despesa
-- sem destino ou consumo de estoque sem destino) entre lotes ou animais. Grava-se o PESO de cada
-- destino, nunca o valor: o valor é calculado a cada leitura a partir do valor atual da origem,
-- por divisão proporcional exata. Assim uma correção retroativa do estoque ou do lançamento
-- continua fechando, sem rateio "desatualizado". Revisar é criar uma versão nova, que aponta a
-- anterior, e cancelar a anterior com motivo; nada é apagado.

CREATE TABLE rateio_custo (
  id TEXT PRIMARY KEY NOT NULL,
  propriedade_id TEXT NOT NULL REFERENCES propriedade(id),
  origem_tipo TEXT NOT NULL CHECK(origem_tipo IN ('lancamento','movimentacao_estoque')),
  -- Em consumo de estoque corrigido, a origem é o movimento original; a leitura segue a cadeia de
  -- substituição até o movimento vigente.
  origem_id TEXT NOT NULL,
  criterio TEXT NOT NULL CHECK(criterio IN ('cabecas','animal_dias','peso','manual')),
  -- Data usada por cabeças e peso (lotes e animais presentes ao fim desse dia).
  data_base TEXT NOT NULL CHECK(data_base GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  periodo_inicio TEXT CHECK(periodo_inicio IS NULL OR periodo_inicio GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  periodo_fim TEXT CHECK(periodo_fim IS NULL OR periodo_fim GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- Idade máxima da pesagem aceita no critério "peso", escolhida pelo usuário.
  idade_maxima_pesagem_dias INTEGER CHECK(idade_maxima_pesagem_dias IS NULL OR idade_maxima_pesagem_dias >= 0),
  motivo TEXT NOT NULL CHECK(length(motivo) BETWEEN 1 AND 500),
  substitui_id TEXT REFERENCES rateio_custo(id),
  requisicao_id TEXT NOT NULL UNIQUE,
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((criterio = 'animal_dias') = (periodo_inicio IS NOT NULL AND periodo_fim IS NOT NULL)),
  CHECK(periodo_inicio IS NULL OR periodo_inicio <= periodo_fim),
  CHECK((criterio = 'peso') = (idade_maxima_pesagem_dias IS NOT NULL)),
  CHECK((deleted_at IS NULL) = (motivo_cancelamento IS NULL))
) STRICT;
-- Um custo só é distribuído uma vez: no máximo um rateio ativo por origem.
CREATE UNIQUE INDEX ux_rateio_origem_ativo ON rateio_custo(origem_tipo, origem_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_rateio_propriedade ON rateio_custo(propriedade_id, deleted_at);
CREATE INDEX ix_rateio_substitui ON rateio_custo(substitui_id) WHERE substitui_id IS NOT NULL;

CREATE TABLE rateio_custo_item (
  id TEXT PRIMARY KEY NOT NULL,
  rateio_id TEXT NOT NULL REFERENCES rateio_custo(id),
  lote_id TEXT REFERENCES lote(id),
  animal_id TEXT REFERENCES animal(id),
  -- Peso relativo (inteiro positivo): cabeças, animal-dias, gramas ou valor manual.
  peso_relativo INTEGER NOT NULL CHECK(peso_relativo > 0 AND peso_relativo <= 1000000000000),
  -- Retrato da base usada (ex.: "12 cabeça(s)"), para auditoria.
  base_descricao TEXT NOT NULL CHECK(length(base_descricao) <= 200),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((lote_id IS NOT NULL) <> (animal_id IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX ux_rateio_item_lote ON rateio_custo_item(rateio_id, lote_id) WHERE lote_id IS NOT NULL;
CREATE UNIQUE INDEX ux_rateio_item_animal ON rateio_custo_item(rateio_id, animal_id) WHERE animal_id IS NOT NULL;

CREATE TRIGGER tg_rateio_custo_sem_exclusao BEFORE DELETE ON rateio_custo BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_rateio_custo_item_sem_exclusao BEFORE DELETE ON rateio_custo_item BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;

-- Origem elegível: despesa ativa da propriedade, sem destino de animal ou lote e fora das compras
-- para estoque (essas viram custo no consumo); ou saída de estoque ativa com destino à
-- propriedade, sem registro sanitário (que já tem destino: os animais tratados).
CREATE TRIGGER tg_rateio_origem BEFORE INSERT ON rateio_custo
WHEN NOT (
  (NEW.origem_tipo = 'lancamento' AND EXISTS (
    SELECT 1 FROM lancamento_financeiro l JOIN categoria_financeira c ON c.id = l.categoria_id
    WHERE l.id = NEW.origem_id AND l.propriedade_id = NEW.propriedade_id AND l.deleted_at IS NULL
      AND l.natureza = 'despesa' AND l.destino_tipo IN ('propriedade','nenhum') AND l.origem_tipo = 'manual'
      AND c.tratamento IN ('resultado','ativo_animal')))
  OR
  (NEW.origem_tipo = 'movimentacao_estoque' AND EXISTS (
    SELECT 1 FROM movimentacao_estoque m JOIN estoque_item i ON i.id = m.estoque_item_id
    WHERE m.id = NEW.origem_id AND i.propriedade_id = NEW.propriedade_id AND m.deleted_at IS NULL
      AND m.destino = 'propriedade' AND m.manejo_sanitario_id IS NULL
      AND m.tipo IN ('saida_consumo','saida_perda','ajuste_saida')))
)
BEGIN SELECT RAISE(ABORT,'Origem não elegível ao rateio: só custos da propriedade, sem destino definido e ainda ativos.'); END;

CREATE TRIGGER tg_rateio_custo_imutavel BEFORE UPDATE ON rateio_custo
WHEN NEW.id <> OLD.id OR NEW.propriedade_id <> OLD.propriedade_id OR NEW.origem_tipo <> OLD.origem_tipo
  OR NEW.origem_id <> OLD.origem_id OR NEW.criterio <> OLD.criterio OR NEW.data_base <> OLD.data_base
  OR NEW.periodo_inicio IS NOT OLD.periodo_inicio OR NEW.periodo_fim IS NOT OLD.periodo_fim
  OR NEW.idade_maxima_pesagem_dias IS NOT OLD.idade_maxima_pesagem_dias OR NEW.motivo <> OLD.motivo
  OR NEW.substitui_id IS NOT OLD.substitui_id OR NEW.requisicao_id <> OLD.requisicao_id
  OR OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Rateio só pode ser cancelado; para mudar, crie uma versão nova.'); END;

-- Destinos do rateio: da mesma propriedade e só enquanto o rateio está ativo.
CREATE TRIGGER tg_rateio_custo_item_consistencia BEFORE INSERT ON rateio_custo_item
WHEN (SELECT deleted_at FROM rateio_custo WHERE id = NEW.rateio_id) IS NOT NULL
  OR (NEW.lote_id IS NOT NULL AND (SELECT propriedade_id FROM lote WHERE id = NEW.lote_id)
      IS NOT (SELECT propriedade_id FROM rateio_custo WHERE id = NEW.rateio_id))
  OR (NEW.animal_id IS NOT NULL AND (SELECT propriedade_id FROM animal WHERE id = NEW.animal_id)
      IS NOT (SELECT propriedade_id FROM rateio_custo WHERE id = NEW.rateio_id))
BEGIN SELECT RAISE(ABORT,'Destino de outra propriedade ou rateio cancelado.'); END;
CREATE TRIGGER tg_rateio_custo_item_imutavel BEFORE UPDATE ON rateio_custo_item
BEGIN SELECT RAISE(ABORT,'Os pesos de um rateio não mudam; crie uma versão nova.'); END;
