# BANCO_DE_DADOS.md — Modelo Inicial de Dados

## 1. Convenções Gerais

- **SGBD:** SQLite 3, acessado pelo processo Main via `better-sqlite3`.
- **Pragmas obrigatórios na abertura:** `foreign_keys = ON`, `journal_mode = WAL`, `synchronous = NORMAL`.
- **Chave primária:** `id TEXT` contendo UUID v7 (ordenável por tempo). UUID em vez de inteiro autoincremento evita colisão quando houver sincronização entre dispositivos no futuro.
- **Colunas de controle** em toda tabela transacional:
  - `created_at TEXT NOT NULL` (ISO 8601 UTC)
  - `updated_at TEXT NOT NULL`
  - `deleted_at TEXT NULL` (soft delete)
  - `sync_version INTEGER NOT NULL DEFAULT 0` (reservado para sync futura, não usado agora)
- **Dinheiro:** armazenado em **centavos** como `INTEGER` (`valor_centavos`). Nunca `REAL` para valores monetários.
- **Grandezas físicas:** `REAL`, com a unidade explícita no nome da coluna (`peso_kg`, `volume_l`, `quantidade_kg_mn_cab_dia`). Valores nutricionais guardam unidade e base em colunas próprias (ver 3.7).
- **Datas sem hora:** `TEXT` no formato `YYYY-MM-DD`.
- **Enumerações:** `TEXT` com `CHECK (... IN (...))`.
- **Nomes:** tabelas e colunas em português, `snake_case`, sem acentos.
- **Migrations:** arquivos SQL numerados e imutáveis em `packages/database/migrations/` (`0001_infraestrutura.sql`, `0002_...`). Uma migration aplicada nunca é editada. A versão corrente fica em `PRAGMA user_version`, e cada migration aplicada fica em `_migracoes` com checksum SHA-256. Migration editada depois de aplicada impede a abertura do banco. O arquivo não pode conter `BEGIN`/`COMMIT`: o migrador já usa uma transação por arquivo.
- **Tabelas `STRICT`:** todas as tabelas novas usam `STRICT`, para o SQLite recusar tipo errado.
- **Identidade do arquivo:** `PRAGMA application_id = 0x50454355` ("PECU"). Arquivos SQLite sem esse identificador são recusados na abertura e na restauração.

- **Composição nutricional em formato longo:** um valor por linha, com nutriente, unidade e base (MN ou MS) explícitos. Isso permite rastrear fonte, método e estatística de cada valor individualmente, como exige MODELOS_NUTRICIONAIS.md.

Tabelas de **catálogo de referência científica** (fontes, nutrientes, registros de composição de publicações) são carregadas por seeds versionados e não são editáveis pelo usuário. O usuário cria registros próprios, como produtos comerciais e análises, marcados com a origem correspondente.

---

## 2. Diagrama de Entidades (visão resumida)

```
propriedade 1───N area (piquete/instalação)
propriedade 1───N lote
lote        1───N animal ───N movimentacao_animal
animal      1───N pesagem
animal      1───N evento_sanitario ───N produto_sanitario (via estoque_item)
animal      1───N ordenha
animal      N───1 animal (mae_id / pai_id)

fonte            1───N registro_composicao
alimento         1───N registro_composicao   (um estudo, tabela, laudo ou rótulo, com condições)
registro_composicao 1───N valor_nutricional N───1 nutriente
regra_agregacao  1───N perfil_composicao
alimento         1───N perfil_composicao     (resultado imutável da seleção, por cenário)
perfil_composicao 1───N perfil_valor ───N registro_composicao (via perfil_valor_origem)

dieta 1───N dieta_ingrediente N───1 perfil_composicao
dieta 1───N avaliacao_dieta (snapshot do motor, com versões)
avaliacao_dieta 1───N projecao_desempenho N───1 lote | animal
lote  1───N dieta_aplicada  N───1 dieta

estoque_item 1───N movimentacao_estoque
estoque_item N───1 alimento (opcional: quando o insumo é um alimento)

categoria_financeira 1───N lancamento_financeiro
lancamento_financeiro N───1 (animal | lote | propriedade | estoque_item)  [vínculo opcional]

venda_leite, cenario_simulacao, configuracao, _migracoes (backups: manifestos JSON, ver 3.9)
```

---

## 3. Tabelas

### 3.1 Estrutura física

**propriedade**
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | UUID v7 |
| nome | TEXT NOT NULL | |
| municipio, uf | TEXT | |
| area_total_ha | REAL | |
| tipo_exploracao | TEXT | CHECK IN ('corte','leite','misto') |
| observacoes | TEXT | |
| + colunas de controle | | |

**area** (piquete, curral, baia)
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| propriedade_id | TEXT FK → propriedade | |
| nome | TEXT NOT NULL | |
| tipo | TEXT | CHECK IN ('piquete','curral','baia','confinamento','outro') |
| area_ha | REAL | |
| forrageira_alimento_id | TEXT FK → alimento NULL | pastagem predominante |

**lote**
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| propriedade_id | TEXT FK | |
| area_id | TEXT FK NULL | local atual |
| nome | TEXT NOT NULL | |
| finalidade | TEXT | CHECK IN ('cria','recria','engorda','lactacao','seca','outro') |
| data_formacao | TEXT | |
| ativo | INTEGER | 0/1 |

### 3.2 Animais

**raca** (catálogo editável)
| id | nome | aptidao (CHECK IN 'corte','leite','dupla') | grupo_genetico (ex.: 'zebuino','taurino','cruzado') |

O `grupo_genetico` é usado pelo motor nutricional, pois o BR-CORTE diferencia exigências por grupo genético.

**animal**
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| propriedade_id | TEXT FK | |
| lote_id | TEXT FK NULL | |
| identificacao | TEXT NOT NULL | brinco/chip; UNIQUE por propriedade entre animais não excluídos |
| nome | TEXT | |
| sexo | TEXT | CHECK IN ('M','F') |
| condicao_sexual | TEXT | CHECK IN ('inteiro','castrado','femea') |
| raca_id | TEXT FK | |
| data_nascimento | TEXT NULL | |
| data_nascimento_estimada | INTEGER | 0/1 |
| categoria | TEXT | CHECK IN ('bezerro','bezerra','garrote','novilha','novilho','boi','touro','vaca') |
| aptidao | TEXT | 'corte' / 'leite' (separa os modelos nutricionais) |
| mae_id, pai_id | TEXT FK → animal NULL | |
| origem | TEXT | CHECK IN ('nascido','comprado') |
| status | TEXT | CHECK IN ('ativo','vendido','morto','descartado') |
| data_saida | TEXT NULL | |

**movimentacao_animal**
| id | animal_id | tipo (CHECK IN 'entrada','troca_lote','troca_area','saida') | data | lote_origem_id | lote_destino_id | motivo | lancamento_financeiro_id NULL |

**pesagem**
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| animal_id | TEXT FK | |
| data | TEXT NOT NULL | |
| peso_kg | REAL NOT NULL | CHECK > 0 |
| metodo | TEXT | CHECK IN ('balanca','fita','visual') |
| escore_corporal | REAL NULL | escala 1–5 ou 1–9, gravada em `escala_ecc` |
| escala_ecc | TEXT NULL | |
| observacao | TEXT | |

O GMD é **calculado**, nunca armazenado: deriva-se das pesagens consecutivas. Isso evita inconsistência quando uma pesagem é corrigida.

### 3.3 Sanidade

**evento_sanitario**
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| animal_id | TEXT FK NULL | um dos dois é obrigatório |
| lote_id | TEXT FK NULL | aplicação em lote |
| tipo | TEXT | CHECK IN ('vacina','vermifugo','tratamento','exame','outro') |
| data | TEXT NOT NULL | |
| estoque_item_id | TEXT FK NULL | produto usado |
| dose | REAL NULL | |
| unidade_dose | TEXT NULL | |
| via | TEXT NULL | |
| carencia_dias | INTEGER NULL | carência de abate/leite |
| proxima_aplicacao | TEXT NULL | gera alerta |
| responsavel | TEXT | |
| diagnostico, observacao | TEXT | |

Quando aplicado a um lote, o serviço gera um evento por animal ativo no lote. Assim o histórico individual fica completo.

### 3.4 Produção leiteira

**ordenha**
| id | animal_id NULL | lote_id NULL | data | turno (CHECK IN 'manha','tarde','noite') | volume_l REAL | observacao |

**lactacao**
| id | animal_id | data_parto | data_secagem NULL | numero_lactacao |

Dias em lactação e produção acumulada são calculados a partir de `lactacao` e `ordenha`.

**venda_leite**
| id | propriedade_id | data | volume_l | preco_litro_centavos | comprador | lancamento_financeiro_id |

### 3.5 Estoque

**estoque_item**
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| propriedade_id | TEXT FK | |
| nome | TEXT NOT NULL | |
| tipo | TEXT | CHECK IN ('racao','silagem','volumoso','suplemento','mineral','medicamento','vacina','semen','outro') |
| alimento_id | TEXT FK NULL | liga o insumo ao banco de alimentos |
| perfil_padrao_id | TEXT FK NULL | perfil de composição sugerido ao usar este item em dietas |
| unidade | TEXT | 'kg','t','l','dose','un' |
| estoque_minimo | REAL NULL | |

**movimentacao_estoque**
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| estoque_item_id | TEXT FK | |
| tipo | TEXT | CHECK IN ('entrada_compra','entrada_producao','saida_consumo','saida_perda','saida_venda','ajuste') |
| data | TEXT | |
| quantidade | REAL | sempre positiva; o sinal vem do tipo |
| custo_unitario_centavos | INTEGER NULL | obrigatório em entradas |
| lote_fabricacao, validade | TEXT NULL | |
| lote_id | TEXT FK NULL | destino do consumo |
| lancamento_financeiro_id | TEXT FK NULL | |

Saldo e custo médio ponderado são calculados por consulta (ou por view `vw_saldo_estoque`). Se o volume crescer, cria-se uma tabela de saldo materializada.

### 3.6 Financeiro

**categoria_financeira**
| id | nome | natureza (CHECK IN 'receita','despesa') | grupo (ex.: 'alimentacao','sanidade','mao_de_obra','infraestrutura','animais','leite','impostos','outros') | categoria_pai_id NULL |

**lancamento_financeiro**
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| propriedade_id | TEXT FK | |
| categoria_id | TEXT FK | |
| data_competencia | TEXT | quando o fato ocorreu |
| data_pagamento | TEXT NULL | fluxo de caixa |
| descricao | TEXT | |
| valor_centavos | INTEGER NOT NULL | sempre positivo; o sinal vem da natureza |
| animal_id | TEXT FK NULL | custo/receita direta |
| lote_id | TEXT FK NULL | |
| quantidade, unidade | REAL/TEXT NULL | ex.: 15,3 arrobas |
| status | TEXT | CHECK IN ('previsto','realizado','cancelado') |

**rateio_lancamento** (custos indiretos distribuídos)
| id | lancamento_id | lote_id NULL | animal_id NULL | percentual REAL | criterio (CHECK IN 'cabecas','peso','dias','manual') |

Compra e venda de animais são lançamentos financeiros com `animal_id` preenchido e uma `movimentacao_animal` vinculada.

### 3.7 Banco de Alimentos e Rastreabilidade

A estrutura separa quatro coisas: **o que é o alimento**, **de onde veio cada dado**, **cada valor medido ou publicado** e **o conjunto de valores escolhido para uma dieta**.

**fonte** (de qualquer origem)
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | identificador estável, ex.: `CQBAL_4_0`, `BRCORTE_ED_X` |
| origem | TEXT | CHECK IN ('tabela_compilada','estudo_individual','sistema_exigencias','laboratorial','rotulo_comercial','medicao_propria') |
| titulo | TEXT NOT NULL | |
| autores | TEXT | obrigatório para origens bibliográficas |
| ano | INTEGER | |
| edicao_versao | TEXT | |
| instituicao_editora | TEXT | |
| isbn_doi_url | TEXT | |
| data_acesso | TEXT NULL | fontes online |
| experimento_origem | TEXT NULL | identifica o mesmo experimento publicado em veículos diferentes, para evitar dupla contagem |
| laboratorio, numero_laudo, data_laudo | TEXT NULL | origem laboratorial |
| fabricante, registro_produto | TEXT NULL | origem rótulo comercial |
| arquivo_anexo_path | TEXT NULL | PDF do laudo ou foto do rótulo |

**nutriente** (catálogo)
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | código, ex.: `MS`, `PB`, `FDN`, `FDNcp`, `NDT` |
| nome | TEXT | |
| unidade_canonica | TEXT | ex.: `pct`, `mcal_kg`, `g_kg`, `mg_kg` |
| base_canonica | TEXT | CHECK IN ('MS','MN','nao_aplicavel') |
| metodo_analitico | TEXT NULL | variantes de método são nutrientes distintos |
| direcao_conservadora | TEXT | CHECK IN ('menor','maior','nao_aplicavel'), usada nos cenários |
| grupo | TEXT | 'fracao_seca','proteina','fibra','energia','mineral_macro','mineral_micro','digestibilidade','outro' |

O catálogo de nutrientes é definido pelo que os modelos do BR-CORTE e as fontes de composição usam. Ele será fechado nas Fases 5A e 6.

**alimento** (identidade, sem composição)
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| nome_comum | TEXT NOT NULL | |
| especie | TEXT NULL | nome científico |
| cultivar | TEXT NULL | ex.: BRS Capiaçu |
| parte_planta | TEXT NULL | planta inteira, grão, folha |
| forma_conservacao | TEXT | CHECK IN ('fresco','pastejo','ensilado','pre_secado','feno','grao','farelo','mistura_comercial','mineral','outro') |
| processamento | TEXT NULL | moído, laminado, reidratado |
| classe | TEXT | CHECK IN ('volumoso','pastagem','concentrado_energetico','concentrado_proteico','suplemento_mineral','suplemento_proteico','suplemento_proteico_energetico','aditivo','subproduto','outro') |
| comercial | INTEGER | 0/1 |

Fresco e ensilado da mesma cultivar são **alimentos diferentes**. A idade de corte não é identidade do alimento. Ela é condição do registro.

**registro_composicao** (um estudo, uma linha de tabela, um laudo ou um rótulo)
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| alimento_id | TEXT FK | |
| fonte_id | TEXT FK NOT NULL | **sem fonte, sem dado** |
| referencia_local | TEXT NULL | página, tabela ou identificador; obrigatório quando a fonte tiver |
| idade_corte_dias | INTEGER NULL | |
| classe_idade_fonte | TEXT NULL | quando a fonte agrupa por classe de idade |
| aditivo_ensilagem | TEXT NULL | |
| regiao, estacao | TEXT NULL | |
| adubacao | TEXT NULL | |
| outras_condicoes_json | TEXT NULL | condições específicas da fonte |
| n_observacoes | INTEGER NULL | |
| status_conferencia | TEXT | CHECK IN ('rascunho','transcrito','conferido','rejeitado') |
| transcrito_por, conferido_por, data_conferencia | TEXT NULL | |
| versao_seed | TEXT NULL | seeds de referência |

Somente registros `conferido` participam de cálculos.

**valor_nutricional** (formato longo, um valor por linha)
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| registro_id | TEXT FK | |
| nutriente_id | TEXT FK | |
| valor | REAL NOT NULL | exatamente como na fonte |
| unidade | TEXT NOT NULL | como na fonte |
| base | TEXT NOT NULL | CHECK IN ('MS','MN') |
| tipo_valor | TEXT | CHECK IN ('valor_unico','media','mediana','minimo_garantido','maximo_garantido') |
| desvio_padrao | REAL NULL | |
| n_observacoes | INTEGER NULL | sobrepõe o do registro quando difere por nutriente |
| minimo, maximo | REAL NULL | quando publicados |
| metodo_analitico | TEXT NULL | |
| referencia_local | TEXT NULL | quando difere da do registro |
| observacao | TEXT NULL | |

UNIQUE (registro_id, nutriente_id, tipo_valor). Nutriente ausente na fonte simplesmente não tem linha. Nunca se grava zero no lugar de ausência.

**regra_agregacao** (critérios aprovados de compatibilidade e estatística)
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| versao | TEXT | |
| descricao | TEXT | |
| criterios_compatibilidade_json | TEXT | condições que podem variar e quanto |
| n_minimo_registros | INTEGER | fixado na Fase 5D |
| metodo_medio | TEXT | ex.: 'media_ponderada_n','mediana' |
| metodo_cenarios | TEXT | ex.: 'percentis','media_dp_publicada','coerente_por_indicador' |
| parametros_json | TEXT | |
| justificativa | TEXT NOT NULL | com referência, quando houver |
| aprovada_em | TEXT NULL | sem aprovação, a regra não é usada |

**perfil_composicao** (resultado imutável da seleção, usado pelas dietas)
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| alimento_id | TEXT FK | |
| criterios_busca_json | TEXT | cultivar, idade, forma e demais escolhas do usuário |
| nivel_correspondencia | TEXT | CHECK IN ('especifico','comparavel','geral','laboratorial','rotulo') |
| diferencas_json | TEXT NULL | condições que diferem da busca, no nível comparável |
| cenario | TEXT | CHECK IN ('medio','conservador','favoravel','unico') |
| metodo_obtencao | TEXT | CHECK IN ('registro_unico','agregacao','rotulo','laboratorial') |
| regra_agregacao_id | TEXT FK NULL | |
| limitacoes | TEXT NULL | texto exibido ao usuário |
| escolhido_manualmente | INTEGER | 0/1 |

**perfil_valor**
| id | perfil_id | nutriente_id | valor | unidade | base | n_registros_usados | observacao |

**perfil_valor_origem** (de onde saiu cada valor do perfil)
| perfil_valor_id | valor_nutricional_id | peso_na_agregacao REAL NULL |

Perfis não são alterados depois de usados em uma avaliação. Mudança de dado gera novo perfil.

### 3.8 Nutrição

**dieta**
| id | nome | aptidao (CHECK IN 'corte','leite') | sistema_criacao (CHECK IN 'pasto','semiconfinamento','confinamento') | objetivo | observacao | status (CHECK IN 'rascunho','ativa','arquivada') |

**dieta_ingrediente**
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| dieta_id | TEXT FK | |
| alimento_id | TEXT FK | |
| perfil_composicao_id | TEXT FK NOT NULL | fixa os dados de composição usados |
| quantidade_kg_mn_cab_dia | REAL NULL | como o produtor fornece |
| inclusao_pct_ms | REAL NULL | alternativa; um dos dois é obrigatório |
| min_pct_ms, max_pct_ms | REAL NULL | limites para formulação |
| preco_centavos_kg_mn | INTEGER NULL | sobrepõe o custo médio do estoque |
| origem_preco | TEXT | CHECK IN ('estoque','informado') |

**avaliacao_dieta** (snapshot imutável)
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| dieta_id | TEXT FK | |
| data_calculo | TEXT | |
| motor_versao | TEXT | versão do pacote `nutrition-engine` |
| brcorte_edicao | TEXT | edição principal usada |
| regras_versao_json | TEXT | versões das regras de agregação envolvidas |
| animal_json | TEXT | categoria, sexo, grupo genético, peso, GMD desejado, sistema |
| perfis_json | TEXT | IDs e valores dos perfis usados |
| exigencias_json | TEXT | **exigência calculada** |
| oferta_json | TEXT | **dieta formulada**: oferta por nutriente e cenário |
| balanco_json | TEXT | atende, déficit, excesso, indeterminado |
| desempenho_previsto_json | TEXT NULL | **desempenho previsto**, quando o modelo permite |
| custos_json | TEXT | |
| indeterminados_json | TEXT | cálculos bloqueados e o dado que faltou |
| avisos_json | TEXT | extrapolação, hipóteses, nível de correspondência |

**projecao_desempenho** (para comparar previsto e observado)
| coluna | tipo | observação |
|---|---|---|
| id | TEXT PK | |
| avaliacao_id | TEXT FK | |
| lote_id | TEXT FK NULL | um dos dois |
| animal_id | TEXT FK NULL | |
| data_inicio | TEXT | |
| peso_inicial_kg | REAL | |
| gmd_previsto_kg_dia_json | TEXT | por cenário |
| data_fim | TEXT NULL | |

O desempenho observado não é armazenado em separado. Ele é calculado a partir de `pesagem`.

**dieta_aplicada**
| id | dieta_id | lote_id | data_inicio | data_fim NULL | projecao_id NULL |

### 3.9 Simulador, Backup e Configuração

**cenario_simulacao**
| id | nome | tipo (CHECK IN 'alimentacao','precos','comparativo') | parametros_json | resultados_json | modelo_versao | created_at |

**Registro de backups: sem tabela.** A tabela `backup_registro` prevista no planejamento foi substituída na Fase 0 por um manifesto JSON ao lado de cada arquivo de backup (`pecuaria_AAAAMMDD-HHMMSS-mmm_tipo.json`). Motivo: ao restaurar um backup antigo, a tabela voltaria junto e perderia o registro dos backups mais novos. O manifesto guarda id, tipo (`automatico`, `manual`, `pre_migracao`, `pre_restauracao`, `importado`), data, tamanho, hash SHA-256, versão do schema, versão do app e observação.

**configuracao** (implementada na migration 0001)
| coluna | tipo | observação |
|---|---|---|
| chave | TEXT PK | 1 a 64 caracteres; formato validado no contrato IPC |
| valor_json | TEXT NOT NULL | CHECK `json_valid` |
| created_at, updated_at | TEXT NOT NULL | ISO 8601 UTC |

Tabela `STRICT`. Não tem `deleted_at` nem `sync_version`, porque guarda preferências locais do aplicativo, não dados de negócio.

**_migracoes** (controle, criada pelo migrador fora das migrations numeradas)
| versao INTEGER PK | nome TEXT | checksum_sha256 TEXT | aplicada_em TEXT |

---

## 4. Índices Iniciais

- `animal(propriedade_id, status)`, `animal(lote_id)`, índice único parcial em `animal(propriedade_id, identificacao) WHERE deleted_at IS NULL`.
- `pesagem(animal_id, data)`.
- `evento_sanitario(animal_id, data)`, `evento_sanitario(proxima_aplicacao)`.
- `ordenha(animal_id, data)`, `ordenha(data)`.
- `movimentacao_estoque(estoque_item_id, data)`.
- `lancamento_financeiro(propriedade_id, data_competencia)`, `lancamento_financeiro(lote_id)`, `lancamento_financeiro(animal_id)`.
- `alimento(especie, cultivar, forma_conservacao)`.
- `registro_composicao(alimento_id, status_conferencia)`, `registro_composicao(fonte_id)`.
- `valor_nutricional(registro_id, nutriente_id)`, `valor_nutricional(nutriente_id)`.
- `perfil_valor(perfil_id)`.
- `projecao_desempenho(lote_id)`, `projecao_desempenho(animal_id)`.

## 5. Views Planejadas

- `vw_saldo_estoque`: saldo e custo médio ponderado por item.
- `vw_gmd_animal`: GMD entre pesagens consecutivas.
- `vw_custo_lote`: custos diretos mais rateados por lote e período.
- `vw_producao_leite_diaria`: soma de ordenhas por dia, lote e animal.
- `vw_valor_nutricional_ms`: valores convertidos para base MS usando a MS do próprio registro. Valores sem MS no registro ficam fora dessa view.
- `vw_previsto_observado`: GMD observado nas pesagens do período de cada projeção, ao lado do GMD previsto por cenário.

## 6. Dados de Referência (Seeds)

- Seeds ficam em `packages/database/seeds/`, um arquivo por fonte, ex.: `cqbal-4.0.json`, `embrapa-capiacu-<publicacao>.json`.
- Cada arquivo traz cabeçalho com fonte, versão, data de transcrição, quem transcreveu e quem conferiu.
- Os valores são transcritos da fonte primária exatamente como publicados: mesma unidade, mesma base, mesmo tipo de estatística. Conversões acontecem só no cálculo.
- O seed do catálogo de nutrientes vem antes dos seeds de composição.
- Testes automáticos garantem: todo registro tem fonte, unidade e base; percentuais entre 0 e 100; nenhum zero onde a fonte não trouxe dado; registro com status diferente de `conferido` não é carregado em produção.
- Nenhum seed de composição será criado antes de a fonte correspondente estar disponível e verificada.

---

## 7. Implementado na Fase 1 (migration 0002_rebanho)

O arquivo `packages/database/migrations/0002_rebanho.sql` é a referência exata. Esta seção registra o que mudou em relação ao modelo planejado na seção 3.

### 7.1 Tabelas criadas

`propriedade`, `area`, `raca`, `lote`, `movimentacao_lote`, `animal`, `movimentacao_animal`, `pesagem` e `historico_alteracao`. Todas `STRICT`, com UUID v7 e as colunas de controle da seção 1, exceto a trilha de alterações, que é só de inserção.

### 7.2 Diferenças em relação ao planejado

| Item | Planejado | Implementado | Motivo |
|---|---|---|---|
| Unicidade de nomes | Índice no nome | Coluna `nome_normalizado` (e `identificacao_normalizada` no animal) com índice único parcial | "Lote A" e "lote  a" não podem coexistir; acentos continuam distinguindo nomes |
| Lote | `ativo` | `ativo` + `data_encerramento`, com CHECK entre os dois | Encerramento com data, reabertura possível |
| Local do lote | Só `area_id` | `area_id` + tabela `movimentacao_lote` | Histórico de locais (RF-01.4) |
| Animal | Sem data de entrada | `data_entrada` e `motivo_saida` | Validar datas de pesagens e transferências sem consultar o histórico a cada vez |
| Animal | `raca_id` obrigatório | `raca_id` opcional | Raça desconhecida é comum em animal comprado |
| Movimentação | Tipos `entrada`, `troca_lote`, `troca_area`, `saida` | `entrada`, `troca_lote`, `saida` | O local do animal vem do lote; mudança de área é registrada no lote |
| Pesagem | `peso_kg`, ECC | `peso_vivo_kg`, sem ECC | Deixar explícito que é peso vivo; ECC fica para a Fase 2 |
| Pesagem | Sem restrição de data | Uma pesagem por animal por data | O GMD precisa de intervalos reais |
| Método de pesagem | `balanca`, `fita`, `visual` | Igual | Fita e visual marcam o GMD como estimado |
| Área | `forrageira_alimento_id` | Não criado | A tabela de alimentos só existe na Fase 5 |
| Movimentação animal | `lancamento_financeiro_id` | Não criado | A tabela financeira só existe na Fase 4; será adicionada por nova migration |
| Raça | Catálogo editável | Catálogo editável com `origem` (`sugestao` ou `usuario`) e 17 raças sugeridas | Classificação geral; grupo genético será revisado com o BR-CORTE na Fase 6 |
| Auditoria | `created_at`/`updated_at` | Mais a tabela `historico_alteracao` com estado anterior e novo de cada operação | Rastreabilidade das alterações pedida na Fase 1 |

### 7.3 Proteções no próprio banco

- Gatilhos impedem exclusão física em todas as tabelas do rebanho. Exclusão é sempre lógica, por `deleted_at`.
- Gatilhos impedem alterar ou apagar registros de `historico_alteracao`.
- CHECK garante sexo coerente com condição sexual, status coerente com data de saída, peso vivo positivo e animal que não é pai nem mãe de si mesmo.
- Identificação única por propriedade entre animais não excluídos, inclusive vendidos e mortos.
- Uma pesagem por animal por data entre pesagens não excluídas.

### 7.4 O que fica calculado, não gravado

- GMD observado: calculado das pesagens a cada consulta (`packages/domain`, função de análise do GMD).
- Idade: calculada da data de nascimento.
- Contagens de animais e lotes ativos: calculadas nas consultas.

---

## 8. Implementado na Fase 2 (migration 0003_sanidade_e_manejo)

O arquivo `packages/database/migrations/0003_sanidade_e_manejo.sql` é a referência exata.

### 8.1 Mudanças e tabelas novas

- **pesagem:** novas colunas `escore_corporal`, `escala_ecc` (`1_5` ou `1_9`), `conferida_em` e `justificativa_conferencia`. Gatilhos de inserção e alteração exigem escore e escala juntos, nota dentro da escala e conferência sempre com justificativa.
- **historico_alteracao:** recriada com cópia integral das linhas, para aceitar as entidades `produto_sanitario`, `manejo_sanitario` e `agenda_sanitaria` e as ações `conferencia`, `remocao_animal`, `cancelamento` e `conclusao`. Os gatilhos que impedem alterar e apagar foram recriados.
- **produto_sanitario:** catálogo do usuário, com nome único, tipo, fabricante, princípio ativo, unidade da dose e carências para carne e leite em dias. Sem dados carregados.
- **manejo_sanitario:** um registro sanitário (aplicação, tratamento ou exame), individual ou coletivo, com tipo, data, produto ou descrição, dose e unidade, via, lote de referência, carências, responsável, diagnóstico, custo em centavos e observações.
- **evento_sanitario:** um animal tratado num registro, com dose individual opcional. Único por registro e animal entre os não excluídos.
- **agenda_sanitaria:** evento previsto para o rebanho, um lote ou um animal, com status `pendente`, `realizado` ou `cancelado`, registro de origem, registro que o realizou, data de conclusão e motivo de cancelamento.
- Todas as tabelas novas são `STRICT`, com UUID v7, colunas de controle e gatilho que proíbe exclusão física.

### 8.2 Diferenças em relação ao planejado (seção 3.3)

| Item | Planejado | Implementado | Motivo |
|---|---|---|---|
| Evento sanitário | Tabela única `evento_sanitario` com animal ou lote | `manejo_sanitario` com os dados comuns e `evento_sanitario` por animal | Corrigir uma aplicação coletiva de uma vez e manter o histórico individual completo |
| Produto | `estoque_item_id` | `produto_id` para o catálogo `produto_sanitario` | O estoque só existe na Fase 3; a ligação entra por nova migration |
| Carência | `carencia_dias` | `carencia_carne_dias` e `carencia_leite_dias` | Bulas trazem carências diferentes para carne e leite |
| Próxima aplicação | Coluna `proxima_aplicacao` | Tabela `agenda_sanitaria` | Agendar sem aplicação anterior, concluir e cancelar com histórico |
| Tipos | `vacina`, `vermifugo`, `tratamento`, `exame`, `outro` | `vacinacao`, `vermifugacao`, `controle_ectoparasitas`, `tratamento`, `exame`, `outro` | Controle de carrapatos e moscas é manejo frequente e separado |
| Custo | Não previsto | `custo_total_centavos` opcional | Preparar a integração financeira da Fase 4 |
| ECC | `escore_corporal` e `escala_ecc` | Igual, com gatilhos de consistência | ALTER TABLE não aceita CHECK entre colunas novas |

### 8.3 O que fica calculado, não gravado

- Alertas de pesagem e sua categoria (conferência ou desempenho): a cada consulta, com os parâmetros de `configuracao` (`alertas.pesagem`: `gmdMaximoKgDia`, `gmdMinimoKgDia` e `intervaloCurtoDias`; valor gravado sem `intervaloCurtoDias` recebe o inicial, 7).
- Fim do prazo de carência: data da aplicação mais os dias informados, separado para carne e leite. É uma conta, não uma liberação.
- Situação da agenda (atrasado, hoje, próximo, agendado): com a antecedência de `configuracao` (`alertas.sanidade`).
- Evolução histórica e comparação entre períodos do lote: as permanências de cada animal no lote são reconstruídas de `movimentacao_animal` (em ordem de data e de registro) e só as pesagens dentro delas entram. Nenhuma tabela nova; os ajustes da aprovação da Fase 2 não mudaram o schema (continua na versão 3).

## 9. Implementado na Fase 3 (migration 0004_estoque.sql)

Referência exata: packages/database/migrations/0004_estoque.sql. Esta seção descreve o schema implementado, que substitui o desenho inicial de estoque da seção 3.5. Migrations 0001–0003 permanecem intactas. O schema passa de 3 para 4; o gerenciador existente cria backup antes de migrar banco existente.

### 9.1 Tabelas e relacionamentos

| Tabela | Conteúdo |
|---|---|
| estoque_item | propriedade_id, nome e nome_normalizado, tipo, unidade_base, base_materia (mn/nao_aplicavel), controle_lote, estoque_minimo_milesimos NULL, produto_sanitario_id NULL, ativo, observacoes e colunas de controle |
| estoque_lote | estoque_item_id, codigo e codigo_normalizado, validade NULL e colunas de controle. Lote físico distinto de lote de animais |
| movimentacao_estoque | estoque_item_id, lote_estoque_id NULL, data, ordem, tipo, quantidade_milesimos, unidade_base, custo_entrada_centavos NULL, custo_apropriado_centavos NULL, destino NULL/propriedade/lote/animal, lote_animal_id NULL, animal_id NULL, manejo_sanitario_id NULL, requisicao_id, documento_origem_id NULL, substitui_id NULL, motivo, observacao e colunas de controle |

- Todas são STRICT, com IDs UUID v7 gerados no main, timestamps, exclusão lógica e gatilho contra DELETE. Não existe comando de exclusão física; item sem saldo pode ser inativado.
- Nome único por propriedade, código de lote físico único por item e um vínculo de produto sanitário ativo por propriedade. O catálogo produto_sanitario segue global.
- FKs apontam para propriedade, estoque_item, estoque_lote, lote, animal, manejo_sanitario e para o movimento substituído. Documento de origem é um identificador opcional, sem FK para tabela financeira inexistente. A associação futura com alimento/perfil não é criada antes da Fase 5.
- Requisição única inclusive entre cancelados impede reutilizar a operação. Ordem única entre movimentos ativos do item, atribuída dentro da transação; substituição conserva a ordem original. Índices para item/data/ordem, manejo, destinos e validade.
- Gatilhos conferem unidade e lote físico na inserção e impedem edição dos campos centrais do movimento. Correção é cancelamento lógico e nova linha. SQL valida quantidades/valores/tipos/destinos; serviços validam datas, propriedade dos vínculos, unidade contável, saldo não negativo em todos os prefixos e idempotência.
- historico_alteracao é recriada pela migration para adicionar estoque_item, estoque_lote e movimentacao_estoque ao CHECK. Todas as linhas anteriores são copiadas e os gatilhos de imutabilidade são recriados. Cada escrita de negócio e cada custo apropriado alterado no recálculo geram trilha na mesma transação.

### 9.2 Quantidade, custo e recálculo

Quantidade física é INTEGER em milésimos da unidade explícita: 1,125 kg é gravado como 1125, sem converter kg para g ou MN para MS. un/ui exigem números inteiros. Limite por movimento: 1.000.000.000 unidades físicas. Estoque mínimo também usa milésimos e aceita zero ou NULL. Essa representação substitui quantidade REAL prevista inicialmente para estoque. `estoque_minimo_milesimos` NULL desliga o alerta; zero avisa só com saldo zerado; maior que zero avisa com saldo menor ou igual (regra `abaixoDoMinimo`, em inteiros).

Ajuste pós-Fase 3, sem migration: a consistência entre `movimentacao_estoque.animal_id` / `lote_animal_id` e as datas do animal e do lote é conferida pelos serviços nas mudanças retroativas (saída do animal, encerramento e formação do lote), considerando só movimentos com `deleted_at` nulo. O banco não ganhou gatilho para isso.

Dinheiro é INTEGER em centavos. Custo de entrada NULL significa desconhecido; zero significa zero conhecido, inclusive para produção própria. Custo apropriado é recalculado pela média móvel por item, com aritmética BigInt no domínio. Saída: arredondar ao centavo mais próximo, meio para cima. Última saída absorve o restante do valor, sem resíduo. A ordem é data/ordem/id. Lotes físicos controlam quantidade, mas compartilham a média do item.

Entradas com custo desconhecido tornam indeterminada a valoração da mistura e das saídas seguintes até zerar ou corrigir a origem. Saldo zerado tem valor zero; os custos passados ausentes não são preenchidos por isso. Correção/cancelamento simula e recalcula a sequência inteira; qualquer saldo negativo de item ou lote físico aborta a transação. O custo apropriado recalculado fica persistido e auditado; saldo, valor e média são derivados. Não foi criada a view vw_saldo_estoque inicialmente sugerida nem tabela de saldo materializado. O repositório fornece uma projeção pequena do histórico para os cálculos.

### 9.3 Sanidade, persistência e backup

Baixa sanitária fica em movimentacao_estoque.manejo_sanitario_id. Produto do cabeçalho, item da propriedade, quantidade física, lote e unidade precisam ser explícitos e compatíveis. Não há conversão dose × animais ou frasco/unidade. Sanidade, eventos de animais, agenda, baixas e trilha compartilham a conexão e a transação. Registros antigos não recebem baixas na migration.

Correção com baixa exige decisão explícita; mudança de data/produto exige reconciliação. Retirada de animal confirma manutenção do consumo total; exclusão confirma estorno integral. As baixas originais ficam canceladas, nunca apagadas. O custo sanitário informado é independente do custo apropriado e não gera movimento financeiro.

Testes aplicam do zero e de 3→4, preservam integralmente propriedade, lote, animal, pesagem com ECC, produto, manejo, evento, agenda e trilha. Backup da versão 3 é criado e restaurado pelo serviço existente, reaplicando 0004 e validando integridade/FKs sem inventar consumo. Reinício e restauração da versão 4 conferem quantidades, valores, histórico e vínculos sanitários. Todos usam pastas temporárias.

## 10. Implementado na Fase 4A (migration 0005_financeiro_base.sql)

O arquivo `packages/database/migrations/0005_financeiro_base.sql` é a referência exata. Todas as tabelas são `STRICT`, com UUID v7, `created_at`, `updated_at`, `deleted_at` e `sync_version`. Dinheiro é `INTEGER` em centavos (de 1 a 1.000.000.000.000 por valor).

### 10.1 Tabelas

- `pessoa_comercial`: contraparte (fornecedor, comprador, frigorífico, laticínio, prestador ou outro). Nome único entre não excluídos.
- `categoria_financeira`: natureza, grupo, `tratamento` (`resultado`, `estoque`, `ativo_animal`, `fora_resultado`), `comportamento_custo` padrão (`variavel`, `fixo`, `nao_classificado` para despesa; `nao_se_aplica` para receita, garantido por CHECK) e `origem_exigida` (categoria que só aceita lançamentos de outro módulo). 15 categorias sugeridas, editáveis, inseridas pela migration. Sem hierarquia por enquanto.
- `lancamento_financeiro`: o fato econômico. Um só destino (`propriedade`, `lote`, `animal` ou `nenhum`, com CHECK entre o tipo e as colunas `lote_id` e `animal_id`), atividade, condição de pagamento (`a_vista`, `parcelado`, `nao_informada`), classificação do custo, quantidade informativa com unidade que carrega a base (peso vivo ou carcaça), `origem_tipo` e `origem_id` (CHECK: manual se, e só se, sem origem), `tipo` (`normal` ou `devolucao`, com `lancamento_origem_id`), `requisicao_id` único e cancelamento lógico (`deleted_at` e `motivo_cancelamento` andam juntos).
- `parcela_financeira`: número único por lançamento (nunca reaproveitado), vencimento e valor. Parcela substituída em renegociação fica cancelada, com motivo.
- `pagamento_financeiro`: data realizada, valor, forma, `requisicao_id` único e estorno lógico com motivo.

### 10.2 Proteções no próprio banco

Exclusão física proibida em todas as tabelas. Gatilhos: natureza do lançamento igual à da categoria; lote e animal da mesma propriedade do lançamento; campos imutáveis do lançamento e lançamento cancelado congelado; lançamento não é cancelado com pagamento ativo; parcela só em lançamento ativo com condição definida, com vencimento e número imutáveis, nunca abaixo do valor pago e nunca cancelada com pagamento ativo; pagamento só em parcela e lançamento ativos, nunca acima do saldo da parcela, e só pode ser estornado (nunca alterado nem reativado). A soma das parcelas ativas igual ao total do lançamento é conferida pelo serviço e por teste de conservação (o SQLite não confere somas entre linhas em um gatilho de inserção).

### 10.3 Trilha de alterações (decisão D-I)

A migration recria `historico_alteracao` sem lista fechada de entidades e ações: o banco só confere o formato (1 a 60 caracteres, minúsculas e "_"), mantém `json_valid` e os gatilhos de só inserção. Todas as linhas anteriores são copiadas na ordem original (o teste compara linha a linha e por SHA-256). O catálogo válido é `ENTIDADES_HISTORICO` e `ACOES_HISTORICO`, em `repositorio-historico.ts`, única porta de escrita.

### 10.4 O que fica calculado, não gravado

Situação da parcela e do lançamento, saldo a pagar ou receber, valor efetivamente pago, próximo vencimento. Pendência de definição financeira é o lançamento com condição `nao_informada`: seu saldo é desconhecido (`null` na API), não zero.

### 10.5 Diferenças em relação ao planejado (seção 3.6) e ao PLANO_FASE_4.md

Não foram criadas nesta migration: `classificacao_custo_origem` (entra com a tela de classificações), `negociacao_animal`, `custo_anterior`, `rateio_custo`, `centro_producao` e `lancamento_item` (entregas 4C a 4F). A coluna `lancamento_financeiro_id` prevista em `movimentacao_animal` **não será criada**: o vínculo ficará em `negociacao_animal_item`. `venda_leite` continua para a Fase 7; o leite entra na 4A como receita lançada, com quantidade em litros opcional.

Testes: migration do zero, da versão 4 com dados preservando a trilha, da versão 3 pela cadeia 4 e 5, falha no passo final com reversão total, backup pré-migração e restauração, e as proteções acima.

## 11. Fase 4B: sem alteração de schema

A entrega 4B (fluxo de caixa, contas, painel e classificação) não tem migration: só lê as tabelas da 0005 e altera `comportamento_custo` de lançamentos ativos. A trilha ganhou a ação `classificacao_lote` no catálogo do `RepositorioHistorico` (o banco só confere o formato). Consultas agregam pagamentos por dia, natureza e categoria, e parcelas em aberto por vencimento, usando os índices `ix_pagamento_data` e `ix_parcela_vencimento`.

## 12. Implementado na Fase 4C (migration 0006_compra_venda_animais.sql)

Tabelas `STRICT`, UUID v7, dinheiro em centavos, pesos em gramas inteiras, cancelamento lógico com motivo e exclusão física proibida por gatilho.

- **`negociacao_animal`**: propriedade, tipo (compra ou venda), data, contraparte, `lancamento_id` único (o lançamento é dono do dinheiro), valor total, critério de alocação (igual, peso vivo, peso de carcaça, manual), unidade do preço (total, cabeça, kg vivo, @ de peso vivo, @ de carcaça) e preço unitário opcional, `requisicao_id` único. Gatilhos: o lançamento precisa ter origem na negociação, natureza e valor certos; campos imutáveis; cancelar exige o lançamento já cancelado.
- **`negociacao_animal_item`**: animal, movimentação de entrada ou saída (única), valor alocado, pesos vivo e de carcaça em gramas. Índice único parcial: um item ativo por animal e tipo. Item só é cancelado junto com a negociação.
- **`custo_anterior`** e **`custo_anterior_item`**: custo informado pelo usuário, por animal ou lote, com data de referência, origem da informação e justificativa; a distribuição por animal e o peso relativo usado ficam gravados. Não cria lançamento, parcela nem pagamento.
- Trilha: entidades `negociacao_animal` e `custo_anterior`; ação `reversao_saida` (desfazer saída, que também cancela logicamente a movimentação de saída em `movimentacao_animal`, sem alterar o esquema dessa tabela).

## 13. Implementado na Fase 4D (migration 0007_insumos_e_classificacao.sql)

- **`lancamento_item`**: item de uma compra de insumos: lançamento, item de estoque, quantidade em milésimos e unidade, valor (custo de entrada, com a parte do frete) e a entrada de compra do estoque (`movimentacao_estoque_id`, única). Gatilhos: lançamento de compra para estoque da mesma propriedade; entrada de compra ativa do mesmo item, quantidade e custo conhecido iguais; imutável, salvo cancelamento (com a entrada já cancelada) e correção que aponta para o movimento substituto com os novos valores; lançamento com itens ativos só é cancelado depois deles.
- **`classificacao_custo_origem`**: classificação padrão (fixo, variável ou não classificado) de custos que não são lançamentos, por propriedade e escopo (item de estoque, aquisição de animal, custo anterior); índice único por propriedade, escopo e referência.
- Índices `ix_estoque_mov_custo` (cobertura das somas de consumo) e `ix_estoque_mov_saidas_data` (parcial sobre as saídas, para ordenar por data).
- Trilha: entidade `classificacao_origem`.

## 14. Implementado na Fase 4E (migration 0008_rateio_de_custos.sql)

- **`rateio_custo`**: decisão de distribuir um custo da propriedade: propriedade, origem (`lancamento` ou `movimentacao_estoque`, esta pelo movimento original da cadeia de correções), critério (`cabecas`, `animal_dias`, `peso`, `manual`), data-base, período (só animal-dias), idade máxima da pesagem em dias (só peso), motivo, `substitui_id`, `requisicao_id` único, cancelamento lógico com motivo. Índice único parcial: um rateio ativo por origem. Gatilhos: origem elegível; imutável salvo cancelamento; exclusão física proibida.
- **`rateio_custo_item`**: destino (lote ou animal, exclusivos) com `peso_relativo` inteiro positivo e a descrição da base usada; índices únicos por destino; gatilho de consistência (mesma propriedade, rateio ativo); imutável.
- Valores nunca são gravados: são calculados na leitura. Trilha: entidade `rateio_custo`.

## 15. Implementado na Fase 4F (migration 0009_producao_propria.sql)

- **`centro_producao`**: propriedade, nome (único entre os ativos), tipo (`volumoso`, `outro`), área opcional, `data_inicio`, item de estoque produzido, situação (`aberto`, `encerrado`) e o retrato do encerramento (`data_fim`, `quantidade_produzida_milesimos`, `movimentacao_estoque_id` da entrada gerada, `custo_conhecido_centavos`, `componentes_desconhecidos`, `custo_total_centavos` só quando nenhum componente é desconhecido), `requisicao_id` único, cancelamento lógico com motivo. CHECKs amarram os campos do encerramento à situação.
- **`centro_producao_consumo`** e **`centro_producao_lancamento`**: vínculos de consumos de estoque e de despesas ao centro; índice único parcial: um centro ativo por custo.
- Gatilhos: consistência de item e área; encerramento só com a entrada de produção correspondente; centro encerrado imutável; cancelamento só aberto e sem vínculos; vínculos só com o centro aberto e sem rateio ativo; o vínculo de consumo só acompanha a correção do próprio movimento; movimento e despesa de centro encerrado não são cancelados nem alterados; exclusão física proibida. `tg_rateio_origem` recriado para recusar custo vinculado a centro.
- Trilha: entidade `centro_producao`.

## 16. Implementado na Fase 4G (migration 0010_indices_desempenho.sql)

- Só índices, sem tabela nova nem alteração de dados: `ix_estoque_mov_substitui` (parcial, sobre `movimentacao_estoque.substitui_id`, para seguir a cadeia de correções do estoque) e `ix_rateio_item_rateio` (destinos de um rateio).
- Resultado, margens, indicadores, conciliação e projeção são derivados; nada é gravado.

## 18. Implementado na revisão final da Fase 4 (migration 0011_devolucao_animais.sql)

- **`devolucao_animal`**: tipo da negociação devolvida (venda ou compra), negociação original, data, lançamento de devolução (`UNIQUE`), valor acordado, requisição, cancelamento lógico com motivo.
- **`devolucao_animal_item`**: item da negociação original, animal, movimentação (entrada de retorno ou saída ao fornecedor, `UNIQUE`), valor acordado. Índice único parcial: um item ativo por item de negociação.
- **`compensacao_financeira`**: devolução, parcela de origem (negociação original), parcela da devolução, data, valor; cancelamento lógico. Não é pagamento nem caixa.
- Gatilhos: consistência da devolução com a negociação e o lançamento (tipo `devolucao`, ligado ao original, natureza oposta, mesmo valor, data não anterior); itens e compensações compatíveis; imutabilidade (só cancelamento); exclusão física proibida; negociação, parcela e lançamento com devolução ou compensação ativa não são cancelados; desfazer a devolução de uma venda com outra venda vigente do animal é recusado.
- O índice `ux_negociacao_item_ativo` (0006) foi trocado pelo gatilho `tg_negociacao_item_unico`, que ignora itens devolvidos, e por um índice simples.
- Categorias "Devolução de venda de animais" (despesa) e "Devolução de compra de animais" (receita), com origem exigida `negociacao_animal`; se já existir categoria do usuário com o mesmo nome, a do sistema recebe "(sistema)".
- Nenhuma tabela existente foi recriada e nenhum dado antigo foi alterado (teste por hash).

## 17. Fase 4H (relatórios e exportação): sem migration

- Nenhuma tabela, índice ou dado novo. Os relatórios são montados na hora a partir dos mesmos serviços das telas; exportar não grava nada no banco (teste conta lançamentos, trilha e movimentos antes e depois).
- O schema da Fase 4 termina na versão 10 (migrations 0005 a 0010). Os ajustes da revisão final (ROADMAP, seção 20) também não têm migration: a completude do resultado é derivada.

## 19. Implementado na Fase 5A (migration 0012_banco_alimentos.sql)

O arquivo `packages/database/migrations/0012_banco_alimentos.sql` é a referência exata. Plano e decisões em PLANO_FASE_5.md (D5-1 a D5-9). Todas as tabelas `STRICT`, UUID v7, colunas de controle e exclusão física proibida por gatilho. Nenhuma tabela existente foi alterada (teste por hash a partir da versão 11).

### 19.1 Tabelas

- **`fonte`**: origem (`tabela_compilada`, `estudo_individual`, `laboratorial`, `rotulo_comercial`, `medicao_propria`; `sistema_exigencias` aceita pelo banco e reservada para a Fase 6), `codigo` com `codigo_normalizado` único entre as ativas (D5-1), metadados bibliográficos, de laudo, de rótulo e de medição própria (método e limitações, D5-8), `propriedade_id` só (e sempre) para laudo e medição própria (D5-9). Sem anexo (D5-7). CHECKs por origem: publicação exige código, autores e ano; laudo exige laboratório; rótulo exige fabricante; campos exclusivos de uma origem ficam nulos nas outras.
- **`nutriente`**: definição com código único (sem diferença de maiúsculas), nome, grupo, unidade e base de referência, método analítico, situação da fundamentação (`pendente` ou `fundamentada`, esta só com método, fonte e referência), direção conservadora (`menor`, `maior`, `nao_definida`), origem da definição (`sistema` ou `usuario`) e `ativo`. **Catálogo inicial de 11 definições** (MS, MO, MM, PB, EE, FDN, FDA, LIG, NDT, Ca, P), igual a `DEFINICOES_INICIAIS_NUTRIENTES` do domínio, todas sem método e pendentes (D5-2). Nenhum valor de composição é semeado (teste varre a migration).
- **`alimento`**: identidade (nome único entre os ativos, espécie, cultivar, parte da planta, forma de conservação, processamento, classe, comercial); exclusão lógica com motivo.
- **`registro_composicao`**: alimento, fonte, página ou tabela, condições (idade de corte, classe de idade, aditivo, região, estação, adubação, `outras_condicoes_json` objeto), n, **separador decimal da fonte**, data e identificação da amostra, status (`rascunho`, `transcrito`, `conferido`, `rejeitado`, `substituido`) com quem e quando transcreveu, conferiu ou rejeitou, `substitui_id` com motivo da versão, descarte lógico com motivo. Índice único: no máximo um sucessor ativo por registro.
- **`valor_nutricional`**: `valor_publicado` (texto como impresso) e `valor` REAL derivado (D5-3), idem para desvio-padrão, mínimo e máximo; unidade (`pct`, `g_kg`, `mg_kg`, `ppm`, `mcal_kg`, `ui_kg`), base (`ms`, `mn`), tipo de valor, n, método **informado pela fonte**, referência local e observação. Único por registro, nutriente, tipo e base entre os ativos.
- **`estoque_item_alimento`**: vínculo de um item de estoque de alimentação com um alimento; um ativo por item; desfazer é exclusão lógica.

### 19.2 Proteções no próprio banco

Origem e propriedade da fonte não mudam; fonte e alimento com registros (ou vínculos, ou fundamentação) não são excluídos; excluídos ficam congelados. Definição do sistema mantém código, nome, grupo, unidade e base; definição com valores não muda grupo, unidade, base, método nem fundamentação; a fundamentação aponta para fonte bibliográfica ativa. Identidade do alimento com registros não muda. Registro nasce rascunho, de fonte e alimento ativos; publicação exige página ou tabela; laudo e medição exigem data da amostra; conteúdo só muda em rascunho; transições fora do fluxo são recusadas; sem valores não é transcrito; conferido é imutável e só passa a substituído quando a versão nova (do mesmo alimento e fonte) é conferida. Valores só entram e mudam em rascunho, com definição ativa e unidade da mesma grandeza da referência; faixas por unidade; garantias só (e sempre) em rótulo e na base MN; laudo e medição só valor único ou média; medição própria só fração seca. Vínculo só com item de ração, silagem, volumoso, suplemento, mineral ou outro.

### 19.3 Trilha

Entidades novas no catálogo: `fonte`, `nutriente`, `alimento`, `registro_composicao`, `estoque_item_alimento`. Ações novas: `transcricao`, `retorno_rascunho`, `rejeicao`, `reabertura_rascunho`, `nova_versao`, `substituicao`, `vinculacao`, `desvinculacao`. O banco de alimentos lê a trilha por `listarEmOrdem` (desempate pela ordem de inserção).

### 19.4 Entregas 5A-3 a 5A-5: sem migration

Registros, conferência, atalhos (rótulo, laudo, MS medida) e o vínculo com o estoque usam só as tabelas da 0012. O número derivado (`valor`) é sempre produzido no processo principal a partir de `valor_publicado` e do separador decimal do registro.

## 20. Implementado na Fase 5B-1 (migration 0013_valores_nao_quantificados.sql)

Ajuste pedido pelo usuário na aprovação da 5A (2026-10-21): valores como "<0,01", "ND" e "traços" não viram número, mas o texto original e o seu significado ficam preservados e rastreáveis. O arquivo da migration é a referência exata. Nenhuma tabela existente foi recriada (teste por hash a partir da versão 12).

- **`valor_nao_quantificado`**: registro, nutriente, `texto_publicado` (exatamente como impresso), `natureza` (`abaixo_do_limite`, `acima_do_limite`, `nao_detectado`, `tracos`, `nao_determinado`, `simbolo_sem_definicao`), `significado_fonte` obrigatório (legenda, nota ou texto da fonte, ou onde o símbolo aparece sem definição), unidade e base da coluna publicada, tipo de valor (`valor_unico`, `media`, `mediana`), método informado pela fonte, referência local e observação. **Não tem coluna numérica**: nem o valor nem o limite de "<0,01" são gravados como número, e nada que leia `valor_nutricional` encontra estes registros.
- CHECKs: limite começa com `<`/`≤` ou `>`/`≥` conforme a natureza; as demais naturezas não começam com símbolo de comparação; textos sem espaço nas pontas.
- Gatilhos: só em registro rascunho, com definição ativa; unidade da mesma grandeza da referência; só tabela compilada, estudo individual e laudo (laudo sem mediana); exclusão física proibida. Para o mesmo registro, nutriente, tipo e base existe **ou** um valor numérico **ou** um não quantificado, nunca os dois (gatilhos nas duas tabelas).
- Gatilhos da 0012 substituídos (DROP e CREATE nesta migration): `tg_registro_transcricao_sem_valores` aceita registro só com valores não quantificados; `tg_nutriente_com_valores` congela a definição que tenha valores de qualquer tipo.
- Trilha: sem entidade nova; inclusão, alteração e remoção ficam em `registro_composicao` (`naoQuantificadoIncluido`, `naoQuantificado`, `naoQuantificadoRemovido`), e a nova versão registra quantos foram copiados.

## 21. Implementado na Fase 5B-2 (migration 0014_curadoria.sql)

- **`importacao_curadoria`**: uma linha por pacote de curadoria importado (código e versão únicos), com a fonte usada, quantos alimentos foram criados, quantos registros e valores entraram, `resumo_json` (objeto com os ids da fonte, dos alimentos e dos registros, para rastrear de qual pacote veio cada registro, e os registros bloqueados com o motivo) e a data. Imutável e sem exclusão (gatilhos). O pacote em si fica no código do aplicativo (`packages/domain/src/alimentos/pacotes/`); o banco só recebe o que o usuário mandar importar.
- **Definição `FDNcp`** (Fibra em detergente neutro corrigida para cinzas e proteína, %, base MS, grupo fibra, direção "maior" pela regra do grupo, método pendente), do sistema, com id fixo, igual a `DEFINICOES_CURADORIA_5B` do domínio. Variante da FDN, nunca equivalente a ela (PLANO_FASE_5.md, seção 3.1).
- Trilha: entidade nova `importacao_curadoria`, ação `importacao` (já existente). Fonte, alimentos, registros e valores criados pela importação têm a trilha normal de cada um.

## 22. Implementado na Fase 5C-1 (migration 0015_origem_dos_dados.sql)

- **`valor_nutricional.forma_obtencao`** (`medido`, `calculado`, `estimado_equacao`, `estimado_nir`, `nao_informado`; padrão `nao_informado`, nunca presumido medido) e **`descricao_obtencao`** (a equação, o cálculo ou a calibração como a fonte informa). Gatilhos: cálculo e equação exigem a descrição. Os valores já gravados passam a "não informado" (teste a partir da versão 14).
- **`vinculo_registro`**: vínculo declarado entre um registro ("este") e outro, identificado pelo código da fonte e pela página ou tabela (`alvo_*`) até ser localizado no banco (`relacionado_id`). Relação (`mesmos_valores`, `outro_inclui_este`, `outro_pode_incluir_este`, `mesmo_experimento_provavel`), evidência obrigatória, pacote de origem, situação (`a_confirmar`, `confirmado`, `descartado`) com quem decidiu, quando e o motivo (obrigatório no descarte). Nasce a confirmar; só recebe o relacionado (uma vez) e a decisão (uma vez); sem exclusão. O vínculo aponta para a primeira versão do registro e vale para toda a cadeia de versões.
- Trilha: entidade `vinculo_registro`; ações `criacao`, `vinculacao` (outro lado localizado), `confirmacao` e `descarte` (novas).

## 23. Implementado nos ajustes da aprovação da 5C (migration 0016_base_interpretada.sql)

- **`valor_nutricional.interpretacao_base`** (texto até 500 caracteres, opcional): vazio, a base gravada é a declarada pela fonte; preenchido, a fonte não declara a base e o texto guarda a interpretação e o motivo (ex.: "% da MS inferida por consistência dos dados"). Os valores já gravados ficam vazios (teste a partir da versão 15). Copiado com o valor numa versão nova do registro e incluído nas diferenças da conferência.
- **Atualização de pacote** (sem mudança de schema): a importação da versão nova grava em `importacao_curadoria.resumo_json` o item `atualizacao` (versão de origem, campos da fonte alterados e o que aconteceu com cada registro). Trilha: entidade `importacao_curadoria`, ação `atualizacao` (nova). As correções nos registros usam as ações já existentes (`retorno_rascunho`, `alteracao`, `transcricao`, `nova_versao`).

## 24. Implementado na Fase 5D (migration 0017_selecao_e_perfis.sql)

- **`avaliacao_cientifica`**: avaliação do usuário, separada da conferência. `tipo` `uso_com_cautela` (registro inteiro, `valor_id` vazio, ou um valor) ou `base_validada` (só valor com `interpretacao_base`); motivo, quem e quando. Uma ativa por alvo e tipo (índice único parcial). Só muda a retirada, uma vez, com quem, quando e motivo. Gatilho confere que o valor é do registro. Sem exclusão.
- **`aprovacao_regra_selecao`**: o conteúdo de cada versão da regra fica no domínio (`selecao.ts`); a tabela guarda código, versão, SHA-256 do conteúdo, quem aprovou e quando. Aprovação de conteúdo diferente do hash não vale. Imutável.
- **`perfil_composicao`** (tipo, cenário, nível, idade buscada, nutriente de referência do cenário, registro base, regra e versão com chave estrangeira para a aprovação, diferenças, limitações, não quantificados e as origens consideradas em JSON), **`perfil_valor`** (valor, texto publicado quando vem de um registro, unidade, base, tipo, forma, método, base interpretada, n de origens, mediana, mínimo, máximo, cobertura) e **`perfil_valor_origem`** (cada valor conferido usado). As três são imutáveis e sem exclusão; CHECKs amarram tipo, cenário, nutriente de referência e registro base.
- Trilha: entidades `avaliacao_cientifica`, `aprovacao_regra_selecao` e `perfil_composicao`; ações `avaliacao`, `retirada` e `aprovacao` (novas).
- Diferenças em relação ao esboço da seção 3.7: a regra não é tabela (o conteúdo versionado fica no código, e o banco guarda a aprovação com hash); o perfil guarda o tipo e as limitações como lista.

## 25. Implementado na Fase 6B (migration 0018_pb_equivalente_nnp.sql)

- **`nutriente.natureza_valor`**: `fracao_massica` (padrão), `equivalente_proteico` (PB do sistema, N × 6,25) ou `equivalente_proteico_nnp` (definição do sistema PBeqNNP, parcela da PB total contida nela). Gatilhos: definição do usuário só é fração mássica; a natureza não muda.
- **`valor_nutricional` reconstruída** (mesmas colunas, linhas e `rowid`; índices e gatilhos com o texto da versão 17): o CHECK de faixa por unidade ficou só com o piso (≥ 0, exceto Mcal/kg, como antes); o teto da fração mássica (100 %, 1.000 g/kg, 1.000.000 mg/kg ou ppm) passou para os gatilhos `tg_valor_faixa_insercao` e `tg_valor_faixa_alteracao`, que consultam a natureza da definição. Chaves estrangeiras de `avaliacao_cientifica` e `perfil_valor_origem` adiadas até o fim da transação e conferidas por teste.
- Nenhuma fonte, alimento, registro, valor ou perfil criado ou alterado.

## 26. Implementado na Fase 6B-4 (migration 0019_avaliacao_nutricional.sql)

- **`avaliacao_nutricional`**: rótulo, observação, `formato_versao`, `versao_motor`, `tipo_quantidade` e o retrato em JSON validado (`fonte_json`, `entrada_json`, `hipoteses_json`, `perfis_json` com os valores efetivamente usados, `resultado_json` com CMS previsto, exigências, oferta e balanço separados), `conteudo_sha256`, quem e quando. Sem alteração e sem exclusão.
- **`avaliacao_nutricional_perfil`**: perfis usados (ordem e elegibilidade), com chave estrangeira para `perfil_composicao`; gatilho confere a coerência com o retrato. Sem alteração e sem exclusão.
- Trilha: entidade `avaliacao_nutricional` (nova), ação `criacao`, com o resumo e o hash.

## 27. Implementado na Fase 6B (migration 0020_anulacao_avaliacao_nutricional.sql)

- **`anulacao_avaliacao_nutricional`**: avaliação (única, chave estrangeira), motivo, quem e quando. Sem alteração e sem exclusão. A avaliação anulada continua imutável e consultável.
- Trilha: ação nova `anulacao` (entidade `avaliacao_nutricional`), com o motivo.
