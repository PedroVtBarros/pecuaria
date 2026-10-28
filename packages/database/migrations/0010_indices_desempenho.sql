-- Fase 4G: índices de desempenho (sem alterar dados nem regras).
--
-- A apropriação segue a cadeia de correções do estoque (`substitui_id`) para achar o movimento
-- vigente de cada rateio e de cada vínculo de produção; sem índice, cada passo varria todas as
-- movimentações. O segundo índice atende a leitura dos destinos de um rateio.
CREATE INDEX ix_estoque_mov_substitui ON movimentacao_estoque(substitui_id) WHERE substitui_id IS NOT NULL;
CREATE INDEX ix_rateio_item_rateio ON rateio_custo_item(rateio_id);
