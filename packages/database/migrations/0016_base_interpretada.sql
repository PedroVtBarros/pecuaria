-- Fase 5C, ajustes da aprovação (2026-10-21). Base nutricional interpretada.
-- Quando a fonte não declara a base de um valor (ex.: "%" sem "da MS" ou "da MN"), a base gravada é
-- uma interpretação técnica, não uma confirmação da fonte. Esta coluna guarda essa interpretação e
-- o motivo dela; vazia, a base é a declarada pela fonte. A tela mostra a diferença, e a agregação
-- (Fase 5D) poderá tratar os dois casos de forma distinta. Nenhuma tabela é recriada.

ALTER TABLE valor_nutricional ADD COLUMN interpretacao_base TEXT
  CHECK(interpretacao_base IS NULL OR length(trim(interpretacao_base)) BETWEEN 1 AND 500);
