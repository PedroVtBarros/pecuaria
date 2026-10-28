-- Fase 4, entrega 4A: base financeira.
-- Dinheiro em centavos inteiros. Competência (lançamento), caixa (pagamento) e custo apropriado
-- (fases seguintes) são coisas distintas: nada aqui cria pagamento, receita ou despesa por conta
-- própria, e a ausência de condição de pagamento não é tratada como ausência de obrigação.
-- Não cria tabelas das entregas seguintes (negociação de animais, rateio, produção própria).

CREATE TABLE pessoa_comercial (
  id TEXT PRIMARY KEY NOT NULL,
  nome TEXT NOT NULL CHECK(length(nome) BETWEEN 1 AND 120),
  nome_normalizado TEXT NOT NULL,
  papel TEXT NOT NULL CHECK(papel IN ('fornecedor','comprador','frigorifico','laticinio','prestador','outro')),
  documento TEXT CHECK(documento IS NULL OR length(documento) BETWEEN 1 AND 30),
  observacoes TEXT CHECK(observacoes IS NULL OR length(observacoes) <= 1000),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX ux_pessoa_comercial_nome ON pessoa_comercial(nome_normalizado) WHERE deleted_at IS NULL;

CREATE TABLE categoria_financeira (
  id TEXT PRIMARY KEY NOT NULL,
  nome TEXT NOT NULL CHECK(length(nome) BETWEEN 1 AND 120),
  nome_normalizado TEXT NOT NULL,
  natureza TEXT NOT NULL CHECK(natureza IN ('receita','despesa')),
  grupo TEXT NOT NULL CHECK(grupo IN ('animais','alimentacao','sanidade','mao_de_obra','infraestrutura','impostos','leite','producao_propria','outros')),
  tratamento TEXT NOT NULL CHECK(tratamento IN ('resultado','estoque','ativo_animal','fora_resultado')),
  -- Classificação padrão, copiada para cada lançamento novo (decisão D-E). Receita não é custo.
  comportamento_custo TEXT NOT NULL DEFAULT 'nao_classificado' CHECK(comportamento_custo IN ('variavel','fixo','nao_classificado','nao_se_aplica')),
  -- Categoria que só aceita lançamentos criados por outro módulo (ex.: compra de animais).
  origem_exigida TEXT CHECK(origem_exigida IS NULL OR origem_exigida IN ('compra_estoque','negociacao_animal','sanitario','producao')),
  origem TEXT NOT NULL CHECK(origem IN ('sugestao','usuario')),
  ativa INTEGER NOT NULL DEFAULT 1 CHECK(ativa IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((natureza = 'despesa' AND comportamento_custo IN ('variavel','fixo','nao_classificado'))
     OR (natureza = 'receita' AND comportamento_custo = 'nao_se_aplica'))
) STRICT;
CREATE UNIQUE INDEX ux_categoria_financeira_nome ON categoria_financeira(natureza, nome_normalizado) WHERE deleted_at IS NULL;

CREATE TABLE lancamento_financeiro (
  id TEXT PRIMARY KEY NOT NULL,
  propriedade_id TEXT NOT NULL REFERENCES propriedade(id),
  categoria_id TEXT NOT NULL REFERENCES categoria_financeira(id),
  pessoa_id TEXT REFERENCES pessoa_comercial(id),
  natureza TEXT NOT NULL CHECK(natureza IN ('receita','despesa')),
  tipo TEXT NOT NULL DEFAULT 'normal' CHECK(tipo IN ('normal','devolucao')),
  lancamento_origem_id TEXT REFERENCES lancamento_financeiro(id),
  data_competencia TEXT NOT NULL CHECK(data_competencia GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  valor_total_centavos INTEGER NOT NULL CHECK(valor_total_centavos > 0 AND valor_total_centavos <= 1000000000000),
  descricao TEXT NOT NULL CHECK(length(descricao) BETWEEN 1 AND 200),
  documento_numero TEXT CHECK(documento_numero IS NULL OR length(documento_numero) BETWEEN 1 AND 60),
  atividade TEXT NOT NULL CHECK(atividade IN ('corte','leite','compartilhada','nao_definida')),
  destino_tipo TEXT NOT NULL CHECK(destino_tipo IN ('propriedade','lote','animal','nenhum')),
  lote_id TEXT REFERENCES lote(id),
  animal_id TEXT REFERENCES animal(id),
  -- Informativas: nunca são base de cálculo do valor.
  quantidade_milesimos INTEGER CHECK(quantidade_milesimos IS NULL OR (quantidade_milesimos > 0 AND quantidade_milesimos <= 1000000000000)),
  unidade_quantidade TEXT CHECK(unidade_quantidade IS NULL OR unidade_quantidade IN ('cabeca','kg','kg_vivo','kg_carcaca','arroba_vivo','arroba_carcaca','litro')),
  condicao_pagamento TEXT NOT NULL CHECK(condicao_pagamento IN ('a_vista','parcelado','nao_informada')),
  comportamento_custo TEXT NOT NULL CHECK(comportamento_custo IN ('variavel','fixo','nao_classificado','nao_se_aplica')),
  origem_tipo TEXT NOT NULL DEFAULT 'manual' CHECK(origem_tipo IN ('manual','compra_estoque','negociacao_animal','sanitario','producao')),
  origem_id TEXT,
  requisicao_id TEXT NOT NULL UNIQUE,
  observacoes TEXT CHECK(observacoes IS NULL OR length(observacoes) <= 1000),
  -- Cancelamento lógico: deleted_at e motivo andam juntos.
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((destino_tipo = 'lote' AND lote_id IS NOT NULL AND animal_id IS NULL)
     OR (destino_tipo = 'animal' AND animal_id IS NOT NULL AND lote_id IS NULL)
     OR (destino_tipo IN ('propriedade','nenhum') AND lote_id IS NULL AND animal_id IS NULL)),
  CHECK((quantidade_milesimos IS NULL) = (unidade_quantidade IS NULL)),
  CHECK((natureza = 'despesa' AND comportamento_custo IN ('variavel','fixo','nao_classificado'))
     OR (natureza = 'receita' AND comportamento_custo = 'nao_se_aplica')),
  CHECK((origem_tipo = 'manual') = (origem_id IS NULL)),
  CHECK((tipo = 'devolucao') = (lancamento_origem_id IS NOT NULL)),
  CHECK((deleted_at IS NULL) = (motivo_cancelamento IS NULL))
) STRICT;
CREATE INDEX ix_lancamento_propriedade_data ON lancamento_financeiro(propriedade_id, data_competencia);
CREATE INDEX ix_lancamento_categoria ON lancamento_financeiro(categoria_id);
CREATE INDEX ix_lancamento_lote ON lancamento_financeiro(lote_id, data_competencia) WHERE lote_id IS NOT NULL;
CREATE INDEX ix_lancamento_animal ON lancamento_financeiro(animal_id, data_competencia) WHERE animal_id IS NOT NULL;
CREATE INDEX ix_lancamento_pessoa ON lancamento_financeiro(pessoa_id) WHERE pessoa_id IS NOT NULL;
CREATE INDEX ix_lancamento_origem ON lancamento_financeiro(origem_tipo, origem_id) WHERE origem_id IS NOT NULL;

CREATE TABLE parcela_financeira (
  id TEXT PRIMARY KEY NOT NULL,
  lancamento_id TEXT NOT NULL REFERENCES lancamento_financeiro(id),
  numero INTEGER NOT NULL CHECK(numero > 0),
  vencimento TEXT NOT NULL CHECK(vencimento GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos > 0 AND valor_centavos <= 1000000000000),
  -- Parcela substituída em renegociação: cancelamento lógico com motivo.
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((deleted_at IS NULL) = (motivo_cancelamento IS NULL))
) STRICT;
CREATE UNIQUE INDEX ux_parcela_numero ON parcela_financeira(lancamento_id, numero);
CREATE INDEX ix_parcela_vencimento ON parcela_financeira(vencimento) WHERE deleted_at IS NULL;

CREATE TABLE pagamento_financeiro (
  id TEXT PRIMARY KEY NOT NULL,
  parcela_id TEXT NOT NULL REFERENCES parcela_financeira(id),
  data TEXT NOT NULL CHECK(data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos > 0 AND valor_centavos <= 1000000000000),
  forma TEXT CHECK(forma IS NULL OR length(forma) BETWEEN 1 AND 40),
  observacao TEXT CHECK(observacao IS NULL OR length(observacao) <= 500),
  requisicao_id TEXT NOT NULL UNIQUE,
  -- Estorno: cancelamento lógico com motivo; o pagamento original nunca é apagado.
  motivo_estorno TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  sync_version INTEGER NOT NULL DEFAULT 0,
  CHECK((deleted_at IS NULL) = (motivo_estorno IS NULL))
) STRICT;
CREATE INDEX ix_pagamento_parcela ON pagamento_financeiro(parcela_id);
CREATE INDEX ix_pagamento_data ON pagamento_financeiro(data) WHERE deleted_at IS NULL;

-- Categorias sugeridas (RF-02.2). Todas editáveis; nenhuma é dado científico.
INSERT INTO categoria_financeira(id,nome,nome_normalizado,natureza,grupo,tratamento,comportamento_custo,origem_exigida,origem,ativa,created_at,updated_at) VALUES
('01929c10-0000-7000-8000-000000000001','Compra de animais','compra de animais','despesa','animais','ativo_animal','nao_classificado','negociacao_animal','sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-000000000002','Frete, comissão e despesas da compra de animais','frete, comissao e despesas da compra de animais','despesa','animais','ativo_animal','nao_classificado',NULL,'sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-000000000003','Insumos para estoque (ração, silagem, suplemento, mineral)','insumos para estoque (racao, silagem, suplemento, mineral)','despesa','alimentacao','estoque','nao_classificado',NULL,'sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-000000000004','Medicamentos e vacinas para estoque','medicamentos e vacinas para estoque','despesa','sanidade','estoque','nao_classificado',NULL,'sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-000000000005','Alimentação (despesa direta, sem estoque)','alimentacao (despesa direta, sem estoque)','despesa','alimentacao','resultado','nao_classificado',NULL,'sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-000000000006','Sanidade (serviços e despesas diretas)','sanidade (servicos e despesas diretas)','despesa','sanidade','resultado','nao_classificado',NULL,'sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-000000000007','Mão de obra','mao de obra','despesa','mao_de_obra','resultado','nao_classificado',NULL,'sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-000000000008','Infraestrutura e manutenção','infraestrutura e manutencao','despesa','infraestrutura','resultado','nao_classificado',NULL,'sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-000000000009','Impostos e taxas','impostos e taxas','despesa','impostos','resultado','nao_classificado',NULL,'sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-00000000000a','Juros e multas','juros e multas','despesa','outros','resultado','nao_classificado',NULL,'sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-00000000000b','Despesas da venda de animais (frete, comissão)','despesas da venda de animais (frete, comissao)','despesa','animais','resultado','nao_classificado',NULL,'sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-00000000000c','Outras despesas','outras despesas','despesa','outros','resultado','nao_classificado',NULL,'sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-00000000000d','Venda de animais','venda de animais','receita','animais','resultado','nao_se_aplica','negociacao_animal','sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-00000000000e','Venda de leite','venda de leite','receita','leite','resultado','nao_se_aplica',NULL,'sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z'),
('01929c10-0000-7000-8000-00000000000f','Outras receitas','outras receitas','receita','outros','resultado','nao_se_aplica',NULL,'sugestao',1,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z');

-- Exclusão física proibida em todas as tabelas financeiras.
CREATE TRIGGER tg_pessoa_comercial_sem_exclusao BEFORE DELETE ON pessoa_comercial BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_categoria_financeira_sem_exclusao BEFORE DELETE ON categoria_financeira BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_lancamento_sem_exclusao BEFORE DELETE ON lancamento_financeiro BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_parcela_sem_exclusao BEFORE DELETE ON parcela_financeira BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;
CREATE TRIGGER tg_pagamento_sem_exclusao BEFORE DELETE ON pagamento_financeiro BEGIN SELECT RAISE(ABORT,'Exclusão física proibida.'); END;

-- Lançamento: natureza igual à da categoria; lote e animal da mesma propriedade.
CREATE TRIGGER tg_lancamento_consistencia_insert BEFORE INSERT ON lancamento_financeiro
WHEN NEW.natureza IS NOT (SELECT natureza FROM categoria_financeira WHERE id = NEW.categoria_id)
  OR (NEW.lote_id IS NOT NULL AND NEW.propriedade_id IS NOT (SELECT propriedade_id FROM lote WHERE id = NEW.lote_id))
  OR (NEW.animal_id IS NOT NULL AND NEW.propriedade_id IS NOT (SELECT propriedade_id FROM animal WHERE id = NEW.animal_id))
BEGIN SELECT RAISE(ABORT,'Categoria, lote ou animal incompatível com o lançamento.'); END;
CREATE TRIGGER tg_lancamento_consistencia_update BEFORE UPDATE ON lancamento_financeiro
WHEN NEW.natureza IS NOT (SELECT natureza FROM categoria_financeira WHERE id = NEW.categoria_id)
  OR (NEW.lote_id IS NOT NULL AND NEW.propriedade_id IS NOT (SELECT propriedade_id FROM lote WHERE id = NEW.lote_id))
  OR (NEW.animal_id IS NOT NULL AND NEW.propriedade_id IS NOT (SELECT propriedade_id FROM animal WHERE id = NEW.animal_id))
BEGIN SELECT RAISE(ABORT,'Categoria, lote ou animal incompatível com o lançamento.'); END;
-- Campos que nunca mudam; lançamento cancelado fica congelado.
CREATE TRIGGER tg_lancamento_imutavel BEFORE UPDATE ON lancamento_financeiro
WHEN NEW.id <> OLD.id OR NEW.propriedade_id <> OLD.propriedade_id OR NEW.natureza <> OLD.natureza
  OR NEW.tipo <> OLD.tipo OR NEW.lancamento_origem_id IS NOT OLD.lancamento_origem_id
  OR NEW.origem_tipo <> OLD.origem_tipo OR NEW.origem_id IS NOT OLD.origem_id
  OR NEW.requisicao_id <> OLD.requisicao_id
  OR OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Campo imutável ou lançamento cancelado.'); END;
CREATE TRIGGER tg_lancamento_cancelar_sem_pagamentos BEFORE UPDATE OF deleted_at ON lancamento_financeiro
WHEN NEW.deleted_at IS NOT NULL AND EXISTS (
  SELECT 1 FROM pagamento_financeiro g JOIN parcela_financeira p ON p.id = g.parcela_id
  WHERE p.lancamento_id = NEW.id AND g.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Estorne os pagamentos antes de cancelar o lançamento.'); END;

-- Parcela: só em lançamento ativo com condição definida; vencimento e número imutáveis;
-- nunca abaixo do valor já pago nem cancelada com pagamento ativo.
CREATE TRIGGER tg_parcela_condicao BEFORE INSERT ON parcela_financeira
WHEN (SELECT condicao_pagamento FROM lancamento_financeiro WHERE id = NEW.lancamento_id) = 'nao_informada'
  OR (SELECT deleted_at FROM lancamento_financeiro WHERE id = NEW.lancamento_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Defina a condição de pagamento de um lançamento ativo antes de criar parcelas.'); END;
CREATE TRIGGER tg_parcela_imutavel BEFORE UPDATE ON parcela_financeira
WHEN NEW.id <> OLD.id OR NEW.lancamento_id <> OLD.lancamento_id OR NEW.numero <> OLD.numero
  OR NEW.vencimento <> OLD.vencimento OR OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Parcela só pode ser reduzida ao valor pago ou cancelada na renegociação.'); END;
CREATE TRIGGER tg_parcela_cobre_pagamentos BEFORE UPDATE OF valor_centavos, deleted_at ON parcela_financeira
WHEN COALESCE((SELECT SUM(valor_centavos) FROM pagamento_financeiro WHERE parcela_id = NEW.id AND deleted_at IS NULL), 0) > NEW.valor_centavos
  OR (NEW.deleted_at IS NOT NULL AND EXISTS (SELECT 1 FROM pagamento_financeiro WHERE parcela_id = NEW.id AND deleted_at IS NULL))
BEGIN SELECT RAISE(ABORT,'Parcela com pagamentos não pode ficar abaixo do valor pago nem ser cancelada.'); END;

-- Pagamento: só em parcela e lançamento ativos, nunca acima do saldo; só pode ser estornado.
CREATE TRIGGER tg_pagamento_parcela_ativa BEFORE INSERT ON pagamento_financeiro
WHEN NOT EXISTS (
  SELECT 1 FROM parcela_financeira p JOIN lancamento_financeiro l ON l.id = p.lancamento_id
  WHERE p.id = NEW.parcela_id AND p.deleted_at IS NULL AND l.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Parcela ou lançamento indisponível para pagamento.'); END;
CREATE TRIGGER tg_pagamento_dentro_do_saldo BEFORE INSERT ON pagamento_financeiro
WHEN NEW.valor_centavos > (
  SELECT p.valor_centavos - COALESCE((SELECT SUM(g.valor_centavos) FROM pagamento_financeiro g WHERE g.parcela_id = p.id AND g.deleted_at IS NULL), 0)
  FROM parcela_financeira p WHERE p.id = NEW.parcela_id)
BEGIN SELECT RAISE(ABORT,'O pagamento é maior que o saldo da parcela.'); END;
CREATE TRIGGER tg_pagamento_imutavel BEFORE UPDATE ON pagamento_financeiro
WHEN NEW.id <> OLD.id OR NEW.parcela_id <> OLD.parcela_id OR NEW.data <> OLD.data
  OR NEW.valor_centavos <> OLD.valor_centavos OR NEW.requisicao_id <> OLD.requisicao_id
  OR NEW.forma IS NOT OLD.forma OR NEW.observacao IS NOT OLD.observacao
  OR OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Pagamento só pode ser estornado, nunca alterado.'); END;

-- Decisão D-I: a trilha deixa de ter lista fechada de entidades e ações no banco. O catálogo
-- válido passa a ser o tipo do repositório de trilha (única porta de escrita), com validação em
-- tempo de execução; o banco só confere o formato (minúsculas e "_"). Todas as linhas anteriores
-- são copiadas na mesma ordem e os gatilhos de imutabilidade são recriados.
DROP TRIGGER tg_historico_sem_alteracao;
DROP TRIGGER tg_historico_sem_exclusao;
CREATE TABLE historico_alteracao_nova (
  id TEXT PRIMARY KEY NOT NULL,
  entidade TEXT NOT NULL CHECK(length(entidade) BETWEEN 1 AND 60 AND entidade NOT GLOB '*[^a-z_]*'),
  entidade_id TEXT NOT NULL,
  acao TEXT NOT NULL CHECK(length(acao) BETWEEN 1 AND 60 AND acao NOT GLOB '*[^a-z_]*'),
  dados_anteriores_json TEXT CHECK(dados_anteriores_json IS NULL OR json_valid(dados_anteriores_json)),
  dados_novos_json TEXT CHECK(dados_novos_json IS NULL OR json_valid(dados_novos_json)),
  motivo TEXT,
  ocorrido_em TEXT NOT NULL
) STRICT;
INSERT INTO historico_alteracao_nova SELECT * FROM historico_alteracao ORDER BY rowid;
DROP TABLE historico_alteracao;
ALTER TABLE historico_alteracao_nova RENAME TO historico_alteracao;
CREATE INDEX ix_historico_entidade ON historico_alteracao(entidade, entidade_id, ocorrido_em);
CREATE TRIGGER tg_historico_sem_alteracao BEFORE UPDATE ON historico_alteracao BEGIN SELECT RAISE(ABORT,'A trilha de alterações não pode ser modificada.'); END;
CREATE TRIGGER tg_historico_sem_exclusao BEFORE DELETE ON historico_alteracao BEGIN SELECT RAISE(ABORT,'A trilha de alterações não pode ser apagada.'); END;
