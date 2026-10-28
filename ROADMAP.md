# ROADMAP.md — Planejamento Incremental

## 1. Princípios do Plano

- Cada fase entrega algo **usável** e testado antes da próxima começar.
- Cada fase termina com: testes passando, backup funcionando, revisão do usuário.
- Módulos que dependem de outros vêm depois deles. Exemplo: financeiro precisa de animais e estoque; simulador precisa de nutrição e financeiro.
- O motor nutricional avança em paralelo, porque depende de transcrição e conferência das fontes, que é trabalho lento.

---

## 2. Fases

### Fase 0 — Fundação

> **Situação em 2026-10-15: aprovada e encerrada no commit `9e04975` (marca `fase-0`).**
> Código em `C:\dev\pecuaria`. Relatório de verificação e decisões técnicas na seção 7.

**Objetivo:** esqueleto rodando, sem funcionalidade de negócio.
- Monorepo com workspaces, TypeScript estrito, ESLint, Prettier.
- Electron + Vite + React abrindo janela, com `contextIsolation` e preload tipado.
- Conexão SQLite, runner de migrations, `PRAGMA user_version`.
- Backup manual e automático na inicialização (ver seção 4).
- Layout base: barra lateral de módulos, cabeçalho com seletor de propriedade, tema claro e escuro.
- Vitest configurado em todos os pacotes. Playwright abrindo o app.
- Gerador de instalador Windows funcionando.

**Pronto quando:** o instalador gera, o app abre, cria o banco, faz backup e os testes rodam.

**Fora da Fase 0:** tabelas de alimentos, nutrientes, seeds científicos e qualquer parte do motor de nutrição. A atualização do motor nutricional não muda o escopo desta fase.

### Fase 1 — Propriedades, Animais e Lotes (RF-01)

> **Situação em 2026-10-15: aprovada e encerrada no commit `fe110e5` (marca `fase-1`).** Relatório na seção 8.

- CRUD de propriedade, área, lote, raça, animal.
- Movimentação de animais entre lotes, com histórico.
- Listagem com busca, filtros e paginação.
- Ficha do animal com linha do tempo.
- Importação de animais por planilha CSV.
- **Antecipado da Fase 2, a pedido do usuário em 2026-10-15:** pesagem individual, histórico de pesagens e GMD observado (RF-07.3 e parte de RF-07.5). O peso de entrada do animal virou a primeira pesagem.

### Fase 2 — Sanidade e manejo (RF-07)

> **Situação em 2026-10-15: aprovada e encerrada no commit com a marca `fase-2`, depois dos ajustes pedidos na aprovação condicional (seção 9.7).** Relatório na seção 9.

- Pesagem em lote (tela de "dia de pesagem").
- Gráfico de evolução de peso (RF-07.4).
- Escore de condição corporal nas pesagens.
- Eventos sanitários individuais e por lote.
- Calendário sanitário e alertas de próxima aplicação e carência.
- **Incluído na aprovação da fase:** alertas de pesagem atípica com conferência auditável, e correção de pesagem com motivo obrigatório.

### Fase 3 — Estoque (RF-03)

> **Aprovada pelo usuário e encerrada com a marca `fase-3`.** Relatório na seção 10.

- Cadastro de itens, entradas e saídas.
- Saldo, custo médio ponderado, validade, alerta de estoque mínimo.
- Integração: evento sanitário dá baixa no produto em estoque. O produto sanitário da Fase 2 (`produto_sanitario`) será ligado ao item de estoque por nova migration.

### Fase 4 — Financeiro (RF-02)

> **Plano detalhado em PLANO_FASE_4.md (commit `a12ec68`), em oito entregas (4A a 4H). Decisões D-A a D-K aprovadas em 2026-10-16. Em 2026-10-16 o usuário autorizou a fase inteira, com commit por entrega. As oito entregas estão implementadas (relatórios nas seções 11 a 18; fechamento, commits, migrations e pendências na seção 19; ajustes da revisão final na seção 20; devolução de animais na seção 21, migration 0011). Fase aprovada pelo usuário; tag `fase-4` criada em 2026-10-21 no commit `3287b46`.**

- Categorias, lançamentos, fluxo de caixa.
- Compra e venda de animais integradas à movimentação.
- Vincular compras de insumos aos fatos financeiros e às entradas físicas, por identificadores de origem. Não gerar despesa duplicada a partir de cada entrada ou consumo; produção própria e saldo inicial exigem tratamento distinto.
- Rateio de custos indiretos por lote.
- Custo por animal e por lote, margem, custo por arroba produzida.

### Fase 5 — Banco de Alimentos (RF-05, RF-05A)

Dividida em quatro etapas. A estrutura vem antes dos dados, e os dados vêm antes da agregação.

Plano detalhado e decisões D5-1 a D5-9 aprovados em 2026-10-21: [PLANO_FASE_5.md](PLANO_FASE_5.md).

**5A — Estrutura e rastreabilidade**
- Tabelas de fonte, nutriente, alimento, registro de composição, valor nutricional e vínculo com o item de estoque (migration 0012). Perfis ficam na 5D.
- Catálogo inicial de **definições** de nutrientes (código, nome, grupo, unidade e base de referência, direção conservadora pela regra aprovada), com o método analítico pendente de fundamentação. Nenhum valor de composição semeado.
- Valor gravado como publicado (texto, precisão, unidade e base), com número derivado para cálculo.
- Cadastro manual com fonte obrigatória e fluxo de conferência: rascunho, transcrito, conferido.
- Cadastro de produtos comerciais pelo rótulo, com níveis de garantia.
- Cadastro opcional de análise laboratorial e de MS medida na fazenda.
- Tela de consulta com fonte, base e unidade sempre visíveis.
- Vínculo entre item de estoque e alimento.

**5B — Curadoria do CQBAL 4.0**
- Portão: formato de acesso, estrutura e termos de uso verificados.
- Transcrição dos alimentos que o usuário de fato usa: silagem de milho, milho, farelo de soja, demais concentrados e volumosos.
- Conferência de cada registro antes de entrar em produção.

**5C — Curadoria Embrapa e estudos individuais**
- Portão: publicações levantadas e disponíveis em arquivo.
- BRS Capiaçu fresco e ensilado, por idade de corte.
- Pastagens e silagens complementares.

**5D — Seleção automática e cenários**
- Portão: regra de agregação aprovada pelo usuário, com número mínimo de registros, método da média, estatística dos cenários e abordagem de coerência.
- Seletor com os três níveis de correspondência, lista de candidatos e escolha registrada (não antecipado na 5A, decisão D5-6).
- Valor representativo e cenários conservador, médio e favorável.
- Tabelas de regra de agregação e de perfil; geração de perfis de composição imutáveis.

A Fase 5 pode avançar parcialmente. Se uma etapa de curadoria estiver bloqueada por falta de fonte, as outras seguem.

### Fase 6 — Nutrição de Corte: Avaliação (RF-04.1 a 04.13, 04.16)

**6.0 — Portões científicos, sem código**
- Usuário fornece o PDF do BR-CORTE.
- Confirmação de título, edição, ano e ISBN. Registro da edição principal.
- Inventário das equações aplicáveis por categoria, com páginas, variáveis, unidades, coeficientes, hipóteses e faixas de validade, em documento próprio.
- Seleção dos exemplos numéricos publicados que servirão de teste.
- Aprovação do inventário pelo usuário.

**6A — Exigências**
- Registro de equações, tipos de unidade e grafo de dependências.
- Equações de exigência transcritas, conferidas e testadas contra o livro.

**6B — Avaliação de dieta**
- Montagem de dieta em kg de MN por cabeça e dia, com perfis de composição.
- Oferta e balanço por nutriente e por cenário.
- Bloqueio parcial quando falta nutriente.
- Tela "Como foi calculado?" e snapshot em `avaliacao_dieta`.

**6C — Desempenho previsto**
- Desempenho previsto, somente nas categorias em que o modelo permite.
- Exibição de hipóteses, limitações e incertezas.

**6D — Custos**
- Custo por kg de MS, por cabeça e dia, e por kg de ganho previsto.

**6E — Previsto e observado**
- Aplicação de dieta a lote com projeção gravada.
- Comparação com pesagens reais da Fase 2.

**6F — Vacas e bezerros** (cap. 11 e 12 do BR-CORTE), se aprovado.

Numeração revista em 2026-10-26 a pedido do usuário (PLANO_FASE_6.md, seção 9.7).

### Fase 7 — Produção Leiteira (RF-06)
- Lactações, ordenhas diárias (tela rápida de lançamento por lote), vendas de leite.
- Curva de lactação por vaca.
- Custo alimentar real por litro, usando consumo de estoque.
- Rentabilidade da atividade leiteira.

### Fase 8 — Nutrição de Corte: Formulação (RF-04.14, 04.15)
- Formulação de mínimo custo por programação linear.
- Escolha do cenário de composição a atender, por exemplo o conservador.
- Iteração consumo × dieta.
- Comparação de formulações.

### Fase 9 — Simulador Econômico (RF-08)
- Cenários de alimentação com projeção de peso, prazo e custo, por cenário de composição.
- Sensibilidade a preços de insumos, arroba e leite.
- Comparação entre lotes reais.
- Cenários salvos.

### Fase 10 — Dashboard e Relatórios (RF-09)
- Painel de indicadores por propriedade, com filtros globais.
- Gráficos temporais.
- Relatórios em PDF, XLSX e CSV.

O dashboard começa simples na Fase 1 (contagem de animais) e ganha indicadores ao fim de cada fase. A Fase 10 consolida e refina.

### Fase futura — Mobile e Sincronização (fora do escopo atual)
Ver seção 5.

---

## 3. Estratégia de Testes

| Nível | Ferramenta | O que cobre | Meta |
|---|---|---|---|
| Unitário de domínio | Vitest | Regras de negócio puras: GMD, custo médio, rateio, margens | Cobertura alta nos pacotes `domain` e `nutrition-engine` |
| Validação científica | Vitest + fast-check | Equações contra valores publicados, testes de propriedade, testes de dados dos seeds | Toda equação ativa tem casos publicados |
| Repositório | Vitest + SQLite em memória | SQL, constraints, migrations | Toda migration testada do zero e incremental |
| Migração | Vitest | Banco da versão N migra para N+1 sem perda | Uma cópia de banco de cada versão publicada fica como fixture |
| IPC | Vitest | Validação de payload nos handlers | Todo canal rejeita payload inválido |
| Componentes | Vitest + Testing Library | Formulários e telas críticas | Fluxos principais de cada módulo |
| Ponta a ponta | Playwright para Electron | App empacotado: cadastrar animal, pesar, lançar despesa, avaliar dieta | Um fluxo feliz por módulo |

Regras:
- Dinheiro sempre em centavos inteiros. Testes de arredondamento explícitos.
- Datas testadas com fuso fixo, para evitar erros de virada de dia.
- Nenhuma fase fecha com teste falhando ou desativado sem justificativa registrada.

---

## 4. Estratégia de Backup

**Local do banco:** pasta de dados do usuário do Electron (`app.getPath('userData')`), fora da pasta do OneDrive. Arquivos SQLite em modo WAL sincronizados pelo OneDrive enquanto estão abertos podem corromper.

**Backups:**
- **Automático na inicialização**, no máximo um por dia.
- **Antes de toda migration**, sempre.
- **Manual**, por botão, com escolha de destino (pendrive, pasta do OneDrive, HD externo).
- Feito pela API de backup online do SQLite (`db.backup()` do better-sqlite3), que gera cópia consistente com o banco aberto. Nunca por cópia simples do arquivo.
- Cada backup tem um manifesto JSON ao lado do arquivo, com hash SHA-256, versão do schema, versão do app e tipo. O manifesto fica fora do banco de propósito: restaurar um backup antigo não pode apagar o registro dos backups mais novos. Decisão da Fase 0, substitui a tabela `backup_registro`.
- Cada backup é convertido para arquivo único (`journal_mode=DELETE`) e verificado com `integrity_check` e `application_id` antes de ser registrado.

**Retenção padrão:** 7 diários, 4 semanais, 12 mensais, contando períodos que têm backup. Pré-migração e pré-restauração: os 10 mais recentes de cada. Backups manuais e importados nunca são apagados automaticamente. A política ainda não é ajustável pela interface.

**Pasta espelho opcional (pendente, fora da Fase 0):** o usuário poderá indicar uma pasta (ex.: dentro do OneDrive) para onde cada backup é copiado depois de pronto. Essa cópia é segura porque o arquivo já está fechado. Enquanto isso, o botão "Exportar" copia um backup para qualquer pasta.

**Restauração:**
- Tela que lista backups com data, tamanho e versão.
- Antes de restaurar, faz backup do estado atual.
- Verifica integridade com `PRAGMA integrity_check` e hash.
- Se o backup for de versão de schema mais antiga, aplica migrations depois de restaurar.

**Exportação aberta (pendente, a partir da Fase 1):** exportação completa em JSON ou CSV por tabela, para o usuário nunca ficar preso ao app. Só faz sentido quando houver tabelas de negócio.

---

## 5. Evolução Futura para Dispositivos Móveis

Nada disso será implementado agora. O que fica preparado desde já:

| Preparação | Onde |
|---|---|
| Domínio e motor nutricional em TypeScript puro, sem Electron | `packages/domain`, `packages/nutrition-engine` |
| UUID v7 como chave primária | Todas as tabelas |
| `created_at`, `updated_at`, `deleted_at`, `sync_version` | Tabelas transacionais |
| Soft delete em vez de exclusão física | Repositórios |
| API tipada única entre UI e dados | Preload / IPC |
| Snapshots imutáveis de cálculo | `avaliacao_dieta`, `cenario_simulacao` |

Caminho provável quando chegar a hora:
1. App móvel em React Native (Expo) com SQLite local, reaproveitando `domain`, `nutrition-engine` e `shared-types`.
2. Foco do mobile em lançamentos de campo: pesagem, ordenha, sanidade, movimentação. Tudo funcionando offline.
3. Sincronização via um backend leve, ou via arquivo exportado e importado entre dispositivos como primeiro passo sem servidor.
4. Resolução de conflitos por registro, usando `updated_at` e `sync_version`. A estratégia exata será decidida nessa fase.

---

## 6. Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Erro de transcrição de equação ou tabela | Conferência dupla, testes contra valores publicados, regressão |
| Erros de extração de PDF: sinais, expoentes, vírgula decimal, tabelas | Conferência de cada equação contra a imagem da página e confirmação do usuário |
| Acesso às fontes e termos de uso do CQBAL 4.0 | Portão explícito na Fase 5B |
| Edição do BR-CORTE sem ficha catalográfica no arquivo | O PDF (capítulos 1 a 17) indica a 4ª edição, 2023, pelo DOI e pelas referências internas, mas não tem capa nem ficha; decisão C1 do PLANO_FASE_6.md |
| Poucos estudos compatíveis para capiaçu por idade | Nível de correspondência visível; cenários só com dados suficientes; nunca interpolar |
| Dados de referência muito diferentes do alimento real, sobretudo MS de silagem | Cenários, aviso de sensibilidade à MS, opção de medir MS na fazenda, comparação previsto e observado |
| Dupla contagem de estudos já incluídos em tabelas compiladas | Tabela compilada nunca agregada a estudo individual; campo de experimento de origem |
| Banco corrompido pelo OneDrive | Banco fora do OneDrive; só backups fechados vão para lá |
| Escopo grande para uso pessoal | Fases curtas, cada uma usável sozinha |
| Mudança de edição do BR-CORTE | Equações versionadas por edição, snapshots com versão |

---

## 7. Fase 0: Relatório de Entrega

Executado em 2026-10-15, no Windows 11, com o código em `C:\dev\pecuaria`.

### 7.1 Verificações executadas

| # | Verificação pedida | Como foi verificada | Resultado |
|---|---|---|---|
| 1 | O aplicativo inicia | Playwright abre o app construído, confere título, navegação e os 11 módulos. Também foi aberto o app empacotado (`win-unpacked`) duas vezes e o modo de desenvolvimento | Aprovado |
| 2 | SQLite cria e abre o banco | Testes de unidade do gerenciador e teste E2E que confere o arquivo em `<pasta de dados>\dados\pecuaria.db` | Aprovado |
| 3 | Migrations seguras ao repetir | Testes do migrador: reexecução sem efeito, migration alterada detectada por checksum, falha desfeita por inteiro, banco mais novo recusado. E2E abre o mesmo banco 3 vezes e confere no log que só a primeira aplicou migration | Aprovado |
| 4 | Persistência após fechar e abrir | E2E grava tema e um valor, fecha, reabre duas vezes e lê de volta. App empacotado também testado em duas execuções | Aprovado |
| 5 | Backup e restauração preservam dados | Testes de unidade (hash, adulteração, importação, schema antigo e mais novo, concorrência, retenção) e E2E pela interface: criar, restaurar, exportar e importar, com conferência do hash | Aprovado |
| 6 | Renderer isolado | E2E confere que `require`, `process`, `Buffer` e `ipcRenderer` não existem na página, que `window.api` só tem `invocar`, que canal fora da lista é recusado, que entrada inválida é recusada, que a rede é bloqueada e que a janela tem sandbox e isolamento de contexto. ESLint proíbe imports de Electron, Node e banco no renderer | Aprovado |
| 7 | Compilação TypeScript | `npm run typecheck` em todos os pacotes | Aprovado, sem erros |

Totais: 82 testes de unidade e integração e 4 testes ponta a ponta, todos aprovados. ESLint e Prettier sem pendências.

Checagem de mutação: com o sandbox da janela desligado de propósito, o teste E2E de isolamento falhou, como deveria. A alteração foi desfeita.

### 7.2 Não verificado ou pendente

- **Instalador NSIS:** gerado (`apps\desktop\release\GestaoPecuaria-0.1.0-instalador.exe`), mas não executado, para não instalar nada no Windows sem pedido. O app empacotado sem instalador foi testado.
- **Modo de desenvolvimento:** o processo inicia, abre o banco e não registra bloqueios. A interface nesse modo foi inspecionada visualmente no início da Fase 1 (seção 8.3).
- **Ícone do aplicativo:** usa o ícone padrão do Electron.
- **Assinatura de código:** o instalador não é assinado. O Windows SmartScreen vai avisar na instalação.
- **Falha ao abrir o banco:** o app mostra a mensagem com os caminhos de log e de backups e encerra. Ainda não há modo de recuperação com tela para restaurar backup nesse caso.
- **Pasta espelho de backups** e **exportação aberta em JSON/CSV:** ficaram para depois (seção 4).
- **Vulnerabilidades do npm:** `npm audit` aponta avisos de severidade moderada em dependências de desenvolvimento. Não afetam o app empacotado, que só leva o better-sqlite3 em node_modules.

### 7.3 Decisões técnicas da Fase 0

As decisões estão detalhadas em ARQUITETURA.md, seção 7. Resumo:

- Electron 44, electron-vite 5, Vite 7, React 19.2, TypeScript 6.0 (o typescript-eslint ainda não suporta o 7), Tailwind 4, React Router 7, TanStack Query 5, Zod 4, Vitest 4, Playwright 1.63.
- better-sqlite3 13, que traz binário N-API pré-compilado: o mesmo binário funciona no Node dos testes e no Electron, sem compilador C++.
- Migrations em SQL, embutidas no bundle, com runner próprio, checksum e `PRAGMA user_version`. Tabelas `STRICT`. Arquivo marcado com `PRAGMA application_id`.
- Manifesto JSON por backup em vez da tabela `backup_registro`.
- API IPC com um único método exposto e lista fechada de canais, validação Zod nos dois lados e respostas sempre no formato `Resultado`.
- Pasta de dados em `%APPDATA%\GestaoPecuaria` (instalado) e `%APPDATA%\GestaoPecuaria-dev` (desenvolvimento).

---

## 8. Fase 1: Relatório de Entrega

Executado em 2026-10-15. Commit de encerramento da Fase 0: `9e04975`, com a marca `fase-0`.

### 8.1 O que foi entregue

- **Migration 0002 (rebanho):** propriedade, área, raça, lote, movimentação de lote, animal, movimentação de animal, pesagem e trilha de alterações. Detalhes em BANCO_DE_DADOS.md, seção 7.
- **Núcleo (`packages/domain`):** UUID v7, normalização de nomes e identificações, datas, números em formato brasileiro, regras de consistência do animal, cálculo do GMD observado e leitura de planilha CSV.
- **Dados (`packages/database`):** repositórios do rebanho e transação no gerenciador do banco.
- **Main:** serviços de propriedades, áreas, raças, lotes, animais, pesagens e importação, com transações e trilha de alterações. 33 canais IPC novos.
- **Interface:** módulo "Propriedades e rebanho" com abas Animais, Lotes, Áreas, Propriedades, Raças e Importar planilha; ficha do animal com Resumo, Pesagens e GMD, e Histórico; seletor de propriedade no cabeçalho; resumo do rebanho no painel.

### 8.2 Testes executados

| Pedido | Como foi testado | Resultado |
|---|---|---|
| Criação, edição e consulta de animais e lotes | Testes de serviço pelos canais IPC com banco real; E2E pela interface | Aprovado |
| Transferências | Individual, em lote, "tudo ou nada", datas inválidas, animal fora do rebanho; E2E com seleção na lista | Aprovado |
| Persistência após reiniciar | Teste de serviço fecha e reabre o banco; E2E fecha e reabre o aplicativo | Aprovado |
| Histórico de pesagens | Registro, correção com motivo, exclusão com motivo e linha do tempo | Aprovado |
| GMD com intervalos diferentes | 1 dia, 30 dias, 60 dias, 91 dias com ano bissexto, intervalos desiguais, perda de peso, pesagem estimada | Aprovado |
| Entradas inválidas e duplicadas | Identificação repetida, nome repetido, pesagem na mesma data, datas futuras ou impossíveis, peso ambíguo, campos desconhecidos | Aprovado |
| Testes existentes | Todos os da Fase 0, ajustados para o schema versão 2 | Aprovado |
| Verificação visual | 16 capturas em modo de desenvolvimento, temas claro e escuro, sem mensagens no console | Aprovado, com correções (8.3) |

Totais: 158 testes de unidade e integração e 7 testes ponta a ponta, todos aprovados. Tipos, lint e formatação sem pendências. Checagem de mutação: com a fórmula do GMD alterada de propósito, 8 testes falharam; a alteração foi desfeita.

### 8.3 Problemas encontrados e corrigidos durante a fase

- **Título do cabeçalho em telas internas:** mostrava o nome genérico do aplicativo. Corrigido no início da fase.
- **Caminhos de arquivo cortados no fim:** agora são encurtados no meio.
- **Aviso de segurança no modo de desenvolvimento:** faltava Content Security Policy. Criada uma política específica para o servidor do Vite.
- **Recusas esperadas registradas como erro no log:** a interface passou a registrar só falhas inesperadas.
- **Mensagem de peso vazio:** dizia "deve ser um número"; agora diz "é obrigatório".
- **Filtros cortados na lista de animais**, **espaço antes de vírgula** e **pesagem corrigida sem data** na linha do tempo.

### 8.4 Limitações conhecidas

- Transferência entre propriedades não existe: o animal sai de uma e entra na outra como cadastro novo.
- A data de entrada do animal não pode ser editada depois do cadastro.
- A saída do rebanho não pode ser desfeita pela interface.
- Mãe e pai não entram pela planilha; são informados depois, na ficha.
- O GMD não tem alerta de valor improvável. Um limite exigiria critério documentado, que não foi definido.
- Arroba de carcaça não é calculada: depende do rendimento de carcaça, que é outra medida.
- Gráfico de evolução de peso, pesagem em lote e escore corporal ficaram na Fase 2.
- Exportação aberta dos dados em JSON ou CSV ainda não existe.

---

## 9. Fase 2: Relatório de Entrega

Executado em 2026-10-15. Commit de encerramento da Fase 1: `fe110e5`, com a marca `fase-1`. A Fase 2 foi aprovada com ajustes (seção 9.7) e encerrada no commit com a marca `fase-2`. As seções 9.2 a 9.6 já descrevem o estado depois dos ajustes.

### 9.1 Já existia desde a Fase 1 e não foi refeito

Pesagem individual com data, peso vivo em kg e método; correção e exclusão com trilha; histórico de pesagens; GMD observado por intervalo e no período total, com marca de estimado para fita e avaliação visual. A Fase 2 foi construída em cima disso.

### 9.2 O que foi entregue

- **Migration 0003 (sanidade e manejo):** escore corporal e conferência na pesagem; produtos sanitários; registros sanitários com um evento por animal; agenda sanitária; trilha de alterações ampliada. Detalhes em BANCO_DE_DADOS.md, seção 8.
- **Evolução de peso:** gráfico de peso vivo e gráfico de GMD por intervalo na ficha do animal; no lote, evolução histórica com os animais que pertenciam ao lote em cada data (reconstruída pelo histórico de movimentações), gráfico com a média de cada data e a linha de cada animal enquanto esteve no lote, tabela de médias por data com quantos animais foram pesados e quantos estavam no lote, GMD médio, menor e maior GMD, e tabela de comparação entre períodos com os mesmos animais nas duas datas. Só registros reais; nada é interpolado nem projetado.
- **Pesagem em lote:** tela de "dia de pesagem" por lote, sem lote ou rebanho inteiro, com Enter para ir ao próximo animal, busca, prévia do ganho e do GMD em cada linha, data individual opcional, escore corporal opcional, botão "Conferir" (prévia no processo principal) e gravação tudo ou nada. Animal em branco não recebe pesagem.
- **Alertas de pesagem atípica:** em duas categorias. Conferência (possível erro de registro): possível erro de digitação (vírgula fora do lugar, com sugestão do valor), pesagem fora da tendência (sobe e desce em relação às vizinhas) e peso igual ao anterior. Desempenho (o peso pode estar certo): GMD acima ou abaixo da faixa configurada. Intervalos mais curtos que o configurado aparecem marcados como curtos. Aparecem antes de salvar, na ficha, na tela "Alertas de pesagem" (com filtro por categoria) e no painel. Nunca bloqueiam. O usuário corrige (com motivo obrigatório) ou confirma o valor com justificativa; tudo fica na trilha e na linha do tempo do animal.
- **Datas inconsistentes e duplicidade:** pesagem no futuro, antes da entrada, depois da saída, na mesma data de outra ou com o mesmo animal duas vezes no lote continuam recusadas (não são só avisos).
- **Sanidade:** catálogo de produtos do usuário (começa vazio); registro individual ou coletivo de vacinação, vermifugação, controle de carrapatos e moscas, tratamento, exame e outros, com produto ou descrição, dose e unidade, via, dose individual opcional por animal, responsável, diagnóstico, custo em centavos e carências para carne e leite informadas pelo usuário. Na aplicação coletiva, todos os animais ativos do lote vêm marcados e cada um recebe o evento no seu histórico. Correção com motivo, retirada de um animal com motivo e exclusão com motivo.
- **Agenda e alertas sanitários:** próxima aplicação a partir de um registro ou agendamento avulso para o rebanho, um lote ou um animal; situação atrasado, hoje, próximo ou agendado conforme antecedência configurável; registrar a aplicação a partir da agenda conclui o evento; cancelar exige motivo; excluir o registro que realizou um evento devolve o evento para pendente. Lista de animais dentro do prazo de carência informado, com o fim do prazo calculado separado para carne e para leite e o aviso de que a data não é garantia de liberação.
- **Painel:** eventos atrasados, eventos próximos, animais em carência informada e alertas de pesagem.
- **Configurações:** faixa de GMD dos alertas de desempenho, intervalo considerado curto e antecedência dos avisos da agenda, apresentados como parâmetros operacionais.

### 9.3 Testes executados

| Pedido | Como foi testado | Resultado |
|---|---|---|
| Evolução de peso e GMD | Domínio: pontos por data só com animais pesados, períodos com os mesmos animais, GMD médio, menor e maior, grupo vazio. Integração: evolução do lote com datas individuais. Interface: marcas dos eixos, marcadores vazados para peso estimado, dica pelo teclado | Aprovado |
| Pesagens individuais e em lote | Escore na escala, prévia sem gravar, gravação tudo ou nada, data individual, justificativa, animal em branco sem pesagem, trilha "Pesagem em lote"; interface envia só os animais com peso e mostra o erro de cada um; E2E com Enter, Conferir e Salvar | Aprovado |
| Alterações de pesagens anteriores | Correção exige motivo; estado anterior e novo na trilha; correção descarta a conferência anterior; interface recusa correção sem motivo | Aprovado |
| Valores atípicos | GMD acima e abaixo, digitação ×10 e ÷10, pico isolado, peso repetido, limites desligados, peso estimado, regra de conferência, pesagem retroativa com justificativa, limites alterados nas configurações e limites incoerentes recusados | Aprovado |
| Histórico sanitário | Evento no histórico e na linha do tempo de cada animal; correção e retirada aparecem no histórico do animal | Aprovado |
| Aplicações coletivas de vacinas | Lote inteiro, desmarcar animais, um evento por animal, tudo ou nada quando um animal não pode receber a aplicação | Aprovado |
| Persistência | Integração e E2E reiniciam e conferem pesagens em lote, registros, agenda e carências | Aprovado |
| Validações de entrada | Data futura, dose sem unidade, animal repetido, sem produto e sem descrição, escore fora da escala, peso zero e ambíguo, lista vazia, motivo vazio | Aprovado |
| Integridade do banco | Migration 0003 sobre banco da versão 2 com dados, sem perda; trilha recriada continua só de inserção; gatilhos de escore e conferência; exclusão física proibida nas tabelas novas; `integrity_check` e `foreign_key_check` | Aprovado |
| Testes existentes | Todos os da Fase 0 e da Fase 1 | Aprovado (dois ajustes de versão do schema) |
| Verificação visual | 26 capturas do app construído, temas claro e escuro e janela estreita, sem mensagens no console | Aprovado, com correções (9.4) |

Totais: 210 testes de unidade e integração (52 novos) e 8 testes ponta a ponta (1 novo), todos aprovados. Tipos, lint e formatação sem pendências. Checagem de mutação: com a gravação em lote aceitando gravar mesmo com erros, e com a regra de conferência ignorando a ordem no tempo, os testes falharam; as duas alterações foram desfeitas.

### 9.4 Problemas encontrados e corrigidos durante a fase

- **Justificativa que não encerrava o alerta:** uma pesagem retroativa confirmada criava um alerta preso à pesagem seguinte. Passou a valer a regra comum da decisão D35.
- **Rótulos repetidos no gráfico de períodos:** dois períodos terminando na mesma data tinham o mesmo rótulo; agora o rótulo mostra o intervalo.
- **Legendas incompletas:** faltavam a chave de peso estimado no gráfico do lote e a de coluna clara no GMD.
- **"Lote Lote 1":** nomes de lote que começam com "Lote" ficavam repetidos; o rótulo virou "Lote: nome".
- **Abas quebrando em janela estreita:** agora rolam na horizontal.
- **Contraste dos gráficos:** o verde da marca com laranja reprovou no teste de daltonismo; os gráficos usam azul e laranja, validados nos dois temas.

### 9.5 Limitações conhecidas

- **Parâmetros dos alertas:** 2,5 kg/dia acima e 0 kg/dia abaixo, mantidos pelo usuário na aprovação, e intervalo curto abaixo de 7 dias, escolhido pelo sistema. São parâmetros operacionais, declarados assim na tela; não são referência zootécnica. O intervalo curto só marca o alerta, não o esconde.
- **Atribuição do alerta:** num intervalo isolado, o sistema aponta a pesagem mais recente; a sugestão de digitação só testa ×10 e ÷10.
- **Carência:** o fim do prazo é a aplicação mais os dias informados pelo usuário, uma conta e não uma liberação. O sistema não lê bula nem confere a carência com o produto. Não há bloqueio de venda nem de ordenha em carência (venda é Fase 4, leite é Fase 7).
- **Evolução do lote:** movimentações têm só data, sem hora. A pesagem feita no dia de uma troca de lote conta para o lote de origem e para o de destino, e a tela avisa quantas são. Animal com histórico de movimentações incoerente fica fora das médias, com o motivo na tela. Animais excluídos por engano não entram. Animais pesados em datas diferentes formam períodos separados.
- **Escore corporal:** guardado na escala usada, sem conversão entre escalas e sem interpretação da nota.
- **Agenda:** sem repetição automática (cada próxima data é informada) e sem notificação fora do aplicativo.
- **Custos sanitários:** registrados em centavos, sem lançamento financeiro nem baixa de estoque (Fases 3 e 4).
- **Reprodução (RF-07.6):** opcional e de fase posterior; não implementada.
- **Pesagem em lote:** sem leitura automática de balança ou de brinco eletrônico; a lista mostra até 5000 animais.
- **Desempenho:** não medido com rebanho de milhares de animais; os alertas da propriedade são calculados a cada consulta.
- Continuam as limitações da seção 8.4 que não eram desta fase.

### 9.6 Decisões técnicas da Fase 2

Detalhadas em ARQUITETURA.md, seção 10 (D33 a D52).

### 9.7 Ajustes da aprovação condicional

Pedidos pelo usuário em 2026-10-15, antes do commit da fase.

**Correções realizadas**

- **Alertas de GMD:** limites mantidos em 0 e 2,5 kg/dia. Cada alerta passou a ter categoria: conferência (possível erro de registro) ou desempenho (GMD fora da faixa; o peso pode estar certo). Novo parâmetro "intervalo curto" (inicial 7 dias): o alerta aparece marcado e o texto explica que o GMD pode não representar o período. Configurações, tela de alertas, ficha do animal, pesagem individual e pesagem em lote dizem que os valores são parâmetros operacionais, não limites científicos. Nada é bloqueado. Configurações gravadas antes recebem o valor inicial do intervalo curto.
- **Evolução histórica do lote:** antes considerava os integrantes atuais com todas as pesagens. Agora reconstrói as permanências de cada animal pelo histórico de movimentações (entrada, troca de lote e saída) e só usa as pesagens feitas enquanto ele pertencia ao lote. Entram também os animais que já saíram (transferidos, vendidos, mortos). Cada data mostra quantos animais foram pesados e quantos estavam no lote. Períodos e GMD nunca atravessam uma ausência. Pesagem no dia de uma troca conta para os dois lotes, com aviso. Se o histórico de um animal for incoerente, ele fica fora das médias e a tela mostra o motivo, em vez de gerar média errada. A lista "Animais considerados" leva à ficha de cada um, onde o histórico completo continua.
- **Carências:** a data deixou de ser chamada de liberação. A tela mostra "fim do prazo calculado", com carne e leite em colunas e linhas separadas, e um aviso fixo: é a conta "aplicação + dias informados", não é garantia de liberação nem autorização para vender, abater ou entregar leite, e o prazo correto é o da bula e da orientação do médico-veterinário. No código, `dataLiberacao` virou `fimCarencia`.

**Testes executados**

| Pedido | Como foi testado | Resultado |
|---|---|---|
| Transferências e pesagens antes e depois | Domínio: reconstrução das permanências (troca, volta, saída, lote nunca visitado), posição de uma data, lote de destino sem as pesagens anteriores, lote de origem sem as posteriores, saída e volta sem período atravessando a ausência. Integração: dois lotes com transferência, venda e entrada tardia; ficha individual com todas as pesagens; histórico incoerente fora das médias. Interface: tabela por data com pesados e no lote, aviso do dia da troca e do animal sem reconstrução. E2E: animal transferido, lote novo só com a pesagem do dia da entrada, lote antigo mantendo a história | Aprovado |
| Alertas de conferência e de desempenho | Categoria de cada tipo, intervalo curto com o limite exato, pico isolado curto, configuração antiga sem o campo novo, filtro por categoria na tela, salvar o parâmetro nas Configurações, E2E com perda em um dia marcada como desempenho e intervalo curto | Aprovado |
| Carências | Interface: cabeçalhos separados de carne e leite, aviso com bula e médico-veterinário, nenhuma ocorrência de "liberado a partir de". E2E: aviso visível na agenda | Aprovado |
| Regressão | Todos os testes anteriores | Aprovado |
| Verificação visual | 25 capturas do app construído (dois lotes com transferência, venda, alerta de desempenho em intervalo curto, alerta de digitação, carência de carne e leite), temas claro e escuro e janela de 900 px, sem mensagens no console; rolagem horizontal medida em cinco telas | Aprovado, com correções abaixo |
| Integridade dos dados | Sem migration nova nesta etapa: o schema continua na versão 3, já testado sobre banco da versão 2 com dados. Testes de integridade do banco reexecutados. Não há banco do aplicativo nesta máquina (nem de uso nem de desenvolvimento) | Aprovado |

Totais finais: 231 testes de unidade e integração (21 novos nesta etapa: 12 de domínio, 4 de integração e 5 de interface) e 8 testes ponta a ponta, todos aprovados. Depois das correções de estabilidade abaixo, a suíte ponta a ponta passou em 5 execuções seguidas (4 isoladas e 1 dentro da verificação completa). Checagem de mutação: ignorar as permanências, tirar a categoria de desempenho e não conferir o lote atual com o histórico fizeram os testes falhar (8, 4 e 2 falhas); as três alterações foram desfeitas.

**Problemas encontrados e corrigidos**

- **Teste ponta a ponta da Fase 1 instável:** falhava em boa parte das execuções completas, por dois motivos do próprio teste. (1) Com a janela de teste coberta por outras, o Chromium congelava os temporizadores; a notificação de sucesso não sumia e cobria o botão "Cadastrar animal". A abertura do app nos testes passou a desligar esse congelamento. (2) O teste preenchia o formulário logo depois de clicar em "Novo animal", antes de a tela trocar; o texto caía na busca da lista ("Buscar por identificação") e no filtro "Categoria". O teste agora espera o título do formulário; o mesmo cuidado foi posto no registro sanitário da Fase 2.
- **Não explicado:** numa execução da verificação completa, o app de teste fechou 3,6 s depois de abrir, no meio do teste da Fase 1. O registro do app mostra um encerramento normal (banco fechado, "Aplicativo encerrado"), sem erro, o que só acontece quando a janela é fechada. Nada no teste fecha a janela nesse ponto; a hipótese é a janela ter sido fechada de fora (por exemplo, manualmente, já que as janelas de teste aparecem na tela). Não se repetiu nas 5 execuções seguintes. Sem causa confirmada.
- **Gráficos estourando em janela estreita:** abaixo de 1280 px, o gráfico não encolhia e a página rolava para o lado (já acontecia antes desta etapa). A grade dos gráficos ganhou uma coluna que encolhe; o E2E agora mede a rolagem horizontal em 900 px.
- **Eixo do gráfico de GMD arredondado:** marcas como 0,25 e 0,75 apareciam como "0,3" e "0,8". O eixo agora usa as casas necessárias.
- **Coluna de detalhe espremida** na tela de alertas em janela estreita: ganhou largura mínima.

**Decisões técnicas:** D47 a D52 em ARQUITETURA.md, seção 10.

### 9.8 Revalidação de continuidade com Codex (2026-10-16)

Base conferida: commit `576bc19`, com a marca `fase-2`, sobre `fe110e5` (`fase-1`). A árvore de trabalho estava limpa no início. O código e a documentação já continham os ajustes da seção 9.7; não foi necessário reimplementá-los.

**Alterações desta revalidação**

- Criado `AGENTS.md` conciso, que remete às regras existentes de `CLAUDE.md` e aos documentos do projeto.
- Removido o comentário antigo de `ServicoPesagens.evolucaoLote` que ainda descrevia somente os integrantes atuais. A lógica histórica foi preservada.
- Corrigida uma dependência da data real no teste de interface da pesagem em lote: em 16/10/2026 ele calculava corretamente 31 dias desde 15/09, mas o teste esperava 30. O grupo de testes passou a controlar apenas `Date`, em 15/10/2026 às 12h locais, mantendo os temporizadores reais e restaurando o relógio ao terminar. Nenhuma fórmula de GMD foi alterada.
- Corrigida rolagem horizontal de 6 px nas Configurações em janela de 900 px: a grade da seção Sistema agora define uma coluna que pode encolher antes do breakpoint de duas colunas. O E2E existente da Fase 2 passou a verificar também a largura dessa tela.

**Verificações efetivamente executadas nesta sessão**

| Verificação | Resultado |
|---|---|
| `npm.cmd run verify`: tipos, ESLint, Vitest, build e Playwright | Aprovado após as correções acima |
| Unidade e integração (21 arquivos) | 231 testes aprovados |
| Ponta a ponta, incluindo a nova checagem de largura | 8 testes aprovados; sem repetição automática |
| `npm.cmd run format:check` e checagem explícita do novo `AGENTS.md` | Aprovado |
| Conferência visual com dados fictícios em banco temporário | 12 capturas: lotes de origem e destino, pesagens do animal, alertas, agenda/carências e configurações; tema claro em 1440 px e escuro em 900 px |
| Largura e console das seis telas nas duas configurações visuais | Sem rolagem horizontal da página após estabilizar o layout; sem erros no console. Tabelas e abas largas mantêm sua rolagem interna |

Os testes de integração e E2E usaram bancos temporários. A inspeção visual também redirecionou `PECUARIA_DIR_DADOS` para uma pasta temporária própria, removida após fechar o app. Nenhum banco operacional foi aberto ou alterado; nenhuma migration foi criada ou modificada. O schema continua na versão 3.

Avisos não bloqueantes observados: `scrollTo` não implementado pelo jsdom, anotações `@__PURE__` da dependência Zod no build e conflito de variáveis de cor no terminal. Esses avisos não foram tratados como erros do console do aplicativo.

O encerramento inesperado isolado citado na seção 9.7 não ocorreu nesta revalidação; sua causa anterior continua não confirmada. Não houve instalação de dependências, geração de instalador, commit ou tag. As alterações desta sessão ficam locais para revisão. A Fase 3 não foi iniciada.

## 10. Fase 3 — Planejamento aprovado e acompanhamento

Autorizada em 2026-10-16, sobre o commit 42a892d. As orientações adicionais do usuário integram as seis entregas: (1) regras, contratos e migration 0004_estoque.sql; (2) itens e saldo inicial; (3) movimentações e custo médio; (4) lotes físicos, validade e mínimo; (5) integração sanitária; (6) regressão, persistência, backup/restauração e inspeção visual. Nenhum commit final ou início da Fase 4 está autorizado.

### 10.1 Regras incorporadas antes da implementação

- Consumo com destino explícito: propriedade, lote de animais ou animal. Preservar data, quantidade física, unidade e custo apropriado, sem rateio financeiro automático. Compra, entrada, consumo e fato financeiro são conceitos separados; IDs de operação e de origem permitirão a vinculação futura sem duplicação.
- Produção própria é uma origem válida. Custo não informado fica NULL, diferente de zero conhecido. Uma entrada sem custo torna a valoração do saldo e das saídas posteriores indeterminada até esgotar o saldo ou corrigir a entrada; não se inventa proporção conhecida/desconhecida. Quantidades continuam disponíveis.
- Alimentos em massa são matéria natural. Itens não contêm composição nutricional. A associação com alimentos e perfis será adicionada na Fase 5, sem FK para tabelas inexistentes. Não converter automaticamente entre unidades físicas ou comerciais.
- Quantidades com até três casas decimais na unidade do item, representadas internamente em milésimos inteiros; unidades contáveis inteiras. Dinheiro em centavos inteiros. Custo médio móvel conserva a razão valor/quantidade; custo de saída arredondado ao centavo mais próximo, meio para cima, com aritmética inteira. A última saída absorve o valor remanescente, sem resíduo.
- Ordem de cálculo: data do movimento e sequência de registro atribuída na transação. Correção mantém a sequência original; cancelamento lógico e substituição ficam auditados. Recalcular toda a sequência afetada, incluindo custos apropriados alterados, e recusar qualquer saldo negativo por item ou lote físico, inclusive em datas intermediárias.
- Lotes físicos de estoque são distintos dos lotes de animais. Validade ausente não significa prazo válido. Alertas operacionais são configuráveis e não prescrevem uso.
- Catálogo sanitário global; vínculo com item de estoque específico da propriedade. Consumo sanitário exige quantidades e unidades explícitas, sem dose × animais ou conversão de frascos. Baixas são transacionais e idempotentes. Registros anteriores permanecem sem consumo inventado. Correções e exclusões de manejos com baixa exigem reconciliação explícita; remover um animal não estorna quantidade proporcional automaticamente.

### 10.2 Limites

Sem receitas/despesas, fluxo de caixa, rateio por animal, composições científicas, conversão MN/MS, avaliação ou formulação de dieta. Sem alteração dos bancos operacionais durante desenvolvimento e testes. Migrations anteriores permanecem imutáveis.

### 10.3 Situação das entregas

As seis entregas foram implementadas e aprovadas pelo usuário. Validações registradas na seção 10.4; encerramento autorizado com commit final e marca `fase-3`.

| Entrega | Implementação e validação específica |
|---|---|
| 1. Regras, contratos e migration | Domínio puro para quantidade e média móvel; Zod e IPC tipados; 0004 cria três tabelas STRICT e amplia a trilha. Testes de arredondamento, ordem, custo ausente/zero e negativo; migration do zero, reaplicação e 3→4 com dados |
| 2. Cadastro e saldo inicial | Itens por propriedade, unidade, base MN quando alimento, vínculo sanitário, mínimo e ativação; entrada inicial explícita e auditada; testes de duplicidade, isolamento, edição e inativação |
| 3. Movimentações e valoração | Compra, produção própria, consumo, perda, venda física e ajustes; destino geral/lote/animal; prévia sem gravar, correção por substituição, cancelamento e recálculo transacional; testes de custos, idempotência e rollback |
| 4. Lotes físicos e alertas | Código, validade opcional, saldo por lote, mínimo e antecedência configurável (inicial 7 dias, operacional). Testes de lote incorreto, lote esgotado, vencimento e edição auditada |
| 5. Sanidade | Baixas físicas explícitas na mesma transação de manejo, animais e agenda; reconciliação e estorno confirmados; testes de repetição, falha parcial, unidade, retirada de animal, mesma data e custo recalculado |
| 6. Validação e documentação | Regressão completa, novos E2E, reinício, backup/restauração, pré-migração, integridade, 100 mil movimentos sintéticos, inspeção visual e atualização dos documentos |

### 10.4 Verificações da Fase 3 (2026-10-16)

Verificações efetivamente executadas nesta sessão, sobre o código final:

| Verificação | Resultado |
|---|---|
| npm.cmd run verify (TypeScript, ESLint, Vitest, build e Playwright) | Aprovado |
| Unidade e integração | 279 testes em 28 arquivos; 48 novos testes da Fase 3, mantendo os 231 anteriores |
| Ponta a ponta no Electron construído | 10 testes aprovados, incluindo 2 novos da Fase 3; sem repetição automática |
| npm.cmd run format:check | Aprovado |
| Migration | Do zero, reaplicação sem efeito e 3→4; preservação de propriedade, lote, animal, pesagem/ECC, produto, manejo, evento, agenda e trilha |
| Backup/restauração e reinício | Versão 4 com vínculos sanitários, custos e trilha preservados; backup anterior da versão 3 restaurado e migrado para 4; backup pré-migração e pré-restauração conferidos |
| Integridade e FKs | integrity_check = ok e foreign_key_check vazio nos bancos temporários verificados |
| Inspeção visual | 20 capturas conferidas: lista, alertas, detalhe, extrato, lote físico, movimento, consumo sanitário, detalhe sanitário, reconciliação e estorno; tema claro em 1440×900 e escuro em 900×900 |
| Layout e console | Sem rolagem horizontal da página; tabelas largas mantêm rolagem própria; sem erros no console. E2E também mede o detalhe do estoque em viewport de 900 px |
| Git e escopo | HEAD continua 42a892d; commit 576bc19 e todas as tags preservados; somente código, testes, migration 0004 e documentação na árvore de alterações. Sem commit final |

Medição sintética com 100.000 movimentos de um item, nesta máquina, na execução final: extrato paginado 29 ms, detalhe 157 ms, prévia 109 ms e registro de saída 106 ms (arredondados). A medição inicial mostrou 346 ms no detalhe e 312 ms no registro; a projeção SQL mínima e a remoção de uma busca quadrática na prévia reduziram o trabalho. São medidas do serviço/IPC de teste, sem tempo de renderização; não validam toda a RNF-03 nem todos os cenários de 5.000 animais, múltiplos itens ou correção que revalora milhares de saídas. O teste de volume valida resultados e paginação sem impor um limite de tempo frágil na suíte.

Todos os bancos de teste e de inspeção visual são temporários; o banco operacional não foi aberto. Capturas e medições ficaram fora do repositório, na pasta temporária desta tarefa. Nenhuma dependência instalada, PDF de referência incluído, tag criada/movida ou commit feito. Arquivos package.json, package-lock.json, AGENTS.md e migrations anteriores não foram alterados.

Avisos não bloqueantes: scrollTo ausente no jsdom, comentários @__PURE__ da dependência Zod no build e conflito NO_COLOR/FORCE_COLOR no terminal. Não são erros de console do aplicativo. Nas verificações intermediárias foram corrigidas expectativas de schema/módulo futuro, suporte ao dialog nativo no teste jsdom e seletores de título/aviso no E2E. Nenhum teste foi desativado.

O usuário aprovou a conclusão da Fase 3 e autorizou o commit final e a marca `fase-3`. Antes do registro, o caminho, o diff, os arquivos candidatos e a preservação das referências anteriores foram conferidos; a suíte verify e a formatação foram reexecutadas para o estado de encerramento. Nenhum banco operacional, backup, arquivo pessoal ou referência bibliográfica faz parte do commit. O planejamento da Fase 4 será apresentado separadamente; sua implementação ainda depende de aprovação explícita.

### 10.5 Decisões e limitações

- A unidade do item é fixa depois do primeiro movimento, assim como tipo, vínculo sanitário e controle obrigatório de lote. Mudar esses atributos exige outro item; nenhum fator de conversão é presumido. Quantidade até 1 bilhão por movimento, com três casas decimais; un/ui inteiras. As operações recusam acumulados fora da precisão inteira segura.
- Custo médio é por item e propriedade, considerando todos os lotes físicos; a quantidade disponível também é conferida em cada lote. Não há FIFO/FEFO nem seleção automática do lote a consumir. Validade ausente não é presumida válida; aviso de vencimento não prescreve uso nem bloqueia registro histórico.
- Custo total da entrada pode ser conhecido (inclusive zero) ou desconhecido. Um saldo misturado com custo ausente fica sem valoração até esgotar ou corrigir a origem. Esgotar o saldo restabelece valor zero do saldo; não completa artificialmente os custos das saídas passadas.
- Mesma data é resolvida pela sequência de registro (desempate técnico por ID); não se inventa horário de consumo. Correção mantém a sequência original e guarda vínculo entre movimento antigo e substituto. Na reconciliação sanitária com várias baixas, a correspondência preserva a ordem das linhas; linhas adicionais recebem sequência nova. A data corrigida prevalece na ordenação.
- Consulta do extrato é paginada no SQL, 50 por página na interface (até 200 na API). Detalhe devolve até 200 movimentos recentes; painel de auditoria mostra as últimas 100 alterações. Os registros completos permanecem no banco/backup. Lista de itens e recálculo percorrem o histórico ativo; não há saldo materializado.
- Sanidade sem baixa mantém o comportamento anterior. Baixa com requisição repetida e mesmo conteúdo devolve o registro existente; conteúdo diferente, identificador cancelado ou baixa parcial são recusados. Registro sem baixa não ganha idempotência nova nem consumo retroativo automático. Correção de manejo requer manter consumo conferido ou fornecer as baixas substitutas; lista vazia explícita estorna as baixas. Retirar um animal exige confirmar o consumo total mantido; excluir o manejo exige confirmar estorno integral. Alterações e seus motivos ficam na trilha.
- Catálogo sanitário continua global, estoque é por propriedade. Um produto pode ser ligado a um item ativo por propriedade; um item admite vários lotes físicos. Mudanças de produto ou data com baixa vinculada exigem reconciliação, não edição direta do consumo.
- Documento de origem opcional, requisição única, ID do movimento, destino, vínculo sanitário e substituição preparam a integração financeira; ainda não existe compra formal, conta a pagar, pagamento, rateio ou relatório de custo alimentar. O custo sanitário informado permanece separado do custo apropriado do estoque.
- Itens alimentares têm base física MN, sem composição, perfil ou conversão para MS. O vínculo alimento/perfil será adicionado na Fase 5 por nova migration quando essas tabelas existirem. Nenhum PDF de referência foi lido e nenhum dado científico foi incluído.
- Sem importação/exportação específica de estoque, instalador novo ou validação com dados reais. Backup integral continua pelo mecanismo SQLite já existente. Não há código funcional das Fases 4, 5 ou 6.

### 10.6 Revalidação antes do encerramento aprovado

Nesta sessão de encerramento, o usuário autorizou o commit final e a tag fase-3. Foram conferidos C:\dev\pecuaria, git status, git diff e os 49 arquivos candidatos. A lista contém somente Markdown, TypeScript/TSX e a migration SQL; nenhum banco, backup, dado pessoal ou referência bibliográfica. Não houve alteração de funcionalidades para este encerramento; somente atualização dos registros de aprovação.

A primeira execução de npm.cmd run verify passou em tipos, lint, 279 testes de unidade/integração e 9 dos 10 E2E; o fluxo antigo da Fase 1 falhou porque uma notificação de sucesso interceptou o clique em Salvar alterações. O cenário passou na execução isolada seguinte. Depois, uma nova execução completa de verify passou em todas as etapas: 279 testes em 28 arquivos e 10 E2E, sem repetição automática. A formatação também passou. Nenhum teste foi desativado ou alterado para esse resultado. A falha de interação foi intermitente; sua causa além da sobreposição da notificação não foi confirmada, e fica registrada como limitação da automação existente.

Os arquivos de código, testes e migration continuaram idênticos aos conferidos antes da revalidação (SHA-256); somente esta nota documental foi acrescentada após os testes. O commit de encerramento será identificado pela tag anotada fase-3. Os commits anteriores e os objetos das tags fase-0, fase-1 e fase-2 serão preservados. O planejamento da Fase 4 será apresentado ao usuário sem implementação nem nova migration nesta sessão.

### 10.7 Ajustes de integridade pós-Fase 3 (2026-10-16)

Pedidos pelo usuário (opção B) depois da revisão de continuidade do commit `f2468c8` (marca `fase-3`, preservados). Commit separado; sem migration nova (o schema continua na versão 4).

**Corrigido**

- **Saída retroativa de animal:** `registrarSaida` recusa data anterior a consumo de estoque ativo desse animal. A mensagem lista até três movimentos (data, item, quantidade), informa quantos mais existem e orienta a corrigir ou cancelar os movimentos na tela de Estoque. Consumo na mesma data da saída continua válido.
- **Encerramento retroativo de lote de animais:** `encerrar` recusa data anterior a consumo ativo com destino ao lote.
- **Mesma classe de problema, incluída por coerência:** trocar a data de formação do lote para depois de consumo já registrado também é recusado (só quando a data muda).
- Em todos os casos só movimentos ativos contam; cancelados e substituídos não impedem. Nada é cancelado, recalculado ou alterado automaticamente.
- **Repetição idempotente:** `JSON.stringify` foi trocado por comparação campo a campo (`mesmosDadosDoMovimento`), com lista de campos tipada.
- **Estoque mínimo:** regra única `abaixoDoMinimo` no domínio, em milésimos inteiros. Em branco desliga; zero avisa só com saldo zerado; maior que zero avisa com saldo menor ou igual. O comportamento anterior já era esse; ficou explícito no código, nos testes e na interface (campo, aviso do item e texto da lista de alertas).

**Testes novos (20):** 16 de serviço em `integridade-historica.test.ts` (consumo válido, consumo na data limite, consumo posterior, muitos conflitos, movimentos cancelados, consumo corrigido para antes da saída, consumo de outro destino, histórico idêntico antes e depois da recusa, formação do lote, repetição idempotente com propriedades em outra ordem, estoque mínimo nos três casos e na lista de alertas), 3 de domínio e 1 de interface. Checagem de mutação: com as três conferências desativadas, 5 testes falharam; a alteração foi desfeita.

**Verificações executadas nesta sessão:** tipos, ESLint, formatação, 299 testes de unidade e integração em 29 arquivos e 10 testes ponta a ponta, todos aprovados. Bancos temporários; nenhum banco operacional aberto.

**Continua como limitação:** não há transferência entre lotes físicos; o consumo sanitário tem destino "propriedade" e se liga aos animais pelo registro sanitário.

## 11. Fase 4, entrega 4A: base financeira (2026-10-16)

Autorizada pelo usuário em 2026-10-16, sobre o commit `a12ec68`, depois da aprovação das decisões D-A a D-K (PLANO_FASE_4.md, seção 3). **Implementada e aprovada; registrada no commit `8fe7caa`.** As entregas 4B a 4H não foram iniciadas. Nenhum dado científico foi usado e nenhuma dependência foi instalada.

### 11.1 O que foi entregue

- **Domínio puro** (`packages/domain/src/financeiro`): dinheiro em centavos (leitura de texto sem ponto flutuante, formatação), divisão proporcional por maior resto, geração e validação de parcelas, situação derivada de parcela e de lançamento, estado de apuração (completa, parcial, desconhecida, não apurada) e gerador pseudoaleatório determinístico para testes.
- **Migration 0005** (`0005_financeiro_base.sql`): contrapartes, categorias (15 sugeridas), lançamentos, parcelas e pagamentos, com os gatilhos de integridade descritos em BANCO_DE_DADOS.md, seção 10, e a recriação da trilha de alterações (D-I).
- **Contratos e IPC:** 15 canais novos (contrapartes, categorias, lançamentos, pagamentos), com esquemas Zod nos dois lados.
- **Serviço financeiro:** cadastros, lançamento à vista, parcelado e com condição não informada, edição com motivo, cancelamento, definição posterior da condição, renegociação das parcelas abertas, pagamento parcial e estorno, tudo transacional, idempotente e na trilha.
- **Retro-guardas:** saída de animal, encerramento e formação de lote, exclusão de animal e de propriedade consideram lançamentos ativos.
- **Trilha tipada:** `ENTIDADES_HISTORICO` e `ACOES_HISTORICO` como catálogo fechado, validado em execução, única porta de escrita.
- **Interface:** módulo Financeiro ativo, com Lançamentos (lista com filtros, novo lançamento, detalhe com parcelas, pagamentos, estorno, renegociação, definição de condição, cancelamento e histórico), Categorias e Contrapartes. Valor da operação, a pagar ou receber e pago ou recebido sempre separados; saldo desconhecido aparece como "A definir".

### 11.2 Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| TypeScript (todos os pacotes), ESLint, formatação | Aprovado |
| Unidade e integração | 448 testes em 37 arquivos aprovados (299 anteriores mais 149 novos) |
| Ponta a ponta no Electron construído | 11 testes aprovados (10 anteriores mais 1 novo) |
| Domínio (47 testes) e propriedades determinísticas (24 testes, 1.000 casos por propriedade e por semente, 3 sementes) | Aprovado, inclusive a guarda de abrangência dos geradores |
| Migration | Do zero; da versão 4 com dados preservando a trilha (linhas na ordem e SHA-256); da versão 3 pela cadeia 4 e 5; falha no passo final desfaz tudo; backup pré-migração e restauração; 14 testes de proteções do banco |
| Trilha (D-I) | 4 testes: catálogo contém todos os valores antigos, escrita recusada fora do catálogo, formato conferido pelo banco, varredura do código garante escritor único |
| Serviço e IPC (33 testes) | À vista, parcelado e não informado; pagamento parcial, futuro, acima do saldo; estorno; idempotência; cancelamento; edição; renegociação; retro-guardas; persistência e backup; "nada fictício" |
| Sequências de operações (D-K) | 3 sementes, 100 sequências de até 30 passos cada, com invariantes depois de cada passo, recusa sem rastro e redução automática do caso que falha |
| Interface (22 testes) | Dinheiro digitado, condição de pagamento, página do lançamento, modais, "A definir" |
| Volume (20.000 lançamentos) | Página da lista 13 ms; filtro por situação 148 a 178 ms e busca por texto 238 ms (em memória); medido nesta máquina, sem rendering |
| Inspeção visual | 10 capturas do app construído (lista, detalhe parcial, detalhe pendente, renegociação, pagamento, novo lançamento, categorias, contrapartes; claro 1440 px e escuro 900 px) |
| Checagem de mutação | Divisão sem distribuir o resto, saldo desconhecido virando zero, renegociação sem reduzir a parcela parcial e pagamento fictício na criação à vista: todas detectadas; as alterações foram desfeitas |

Os testes usaram bancos e pastas temporários. Nenhum banco operacional foi aberto.

### 11.3 Decisões técnicas

ARQUITETURA.md, seção 12 (D67 a D77). Diferenças em relação ao plano em PLANO_FASE_4.md, seção 3.5.

### 11.4 Problemas encontrados durante a entrega e corrigidos

- Os testes das migrations 0004 e do E2E da Fase 0 assumiam "última versão = 4"; foram ajustados para a lista de migrations atual (como fez a Fase 3). O teste que exigia que a trilha recusasse entidade desconhecida no banco passou a conferir o formato no banco e o catálogo no repositório (decisão D-I).
- `DELETE` em tabela vazia não dispara gatilho de linha: o teste de exclusão física foi corrigido para ter registros.
- A busca sem acento falhou porque `normalizarNome` mantém acentos; a busca passou a usar `semAcentos`.
- O cabeçalho do PLANO_FASE_4.md no commit `a12ec68` ainda dizia "proposta para aprovação" (uma edição não foi aplicada); corrigido.
- Inspeção visual: texto repetido "Mão de obra (Mão de obra)" e valores monetários que quebravam linha em janela estreita foram corrigidos; a dica do número de parcelas na renegociação aceita 1.

### 11.5 Limitações conhecidas

- Não há fluxo de caixa, contas a pagar e receber nem painel (4B); os totais por período ainda não existem.
- Competência, caixa e custo apropriado: a 4A só implementa competência e caixa. Nenhum custo é apropriado a animal ou lote ainda.
- Lançamento em categoria de tratamento "estoque" ou "animais" (exceto compra e venda de animais, bloqueadas) pode ser feito à mão, mas ainda não se liga a entradas de estoque nem a animais (4C e 4D). Quem registrar uma compra de insumo à mão hoje poderá vinculá-la depois pelo vínculo retroativo planejado.
- Classificações padrão por item de estoque e por origem, e a ação em lote "aplicar a classificação da categoria", ficam para a 4B (tela de classificações) e a 4G.
- A data do pagamento não é comparada com a competência (adiantamento é permitido). A competência do lançamento com destino em animal ou lote é conferida contra as datas do animal ou do lote, mas pagamento não.
- Juros, multas e descontos não são calculados nem embutidos no pagamento; vão em lançamento próprio.
- Filtro por situação e busca por texto usam memória: com 20.000 lançamentos custam 150 a 240 ms; acima disso será preciso materializar a situação.
- Os testes de sequências levam cerca de 30 s dos 48 s da suíte de unidade; o modo longo (`PECUARIA_CASOS_LONGOS`, `PECUARIA_SEQUENCIAS`) não roda no verify.
- Pessoa comercial: CPF/CNPJ é texto livre, sem validação e sem exportação.
- Avisos não bloqueantes de sempre (`scrollTo` no jsdom, anotações do Zod no build, NO_COLOR/FORCE_COLOR).

## 12. Fase 4, entrega 4B: fluxo de caixa (2026-10-16)

Autorizada pelo usuário em 2026-10-16 junto com a Fase 4 inteira (4B a 4H, sem aprovação entre as entregas, respeitando o `PLANO_FASE_4.md`). A 4A foi registrada antes, no commit `8fe7caa`. **Sem migration nova**: a 4B só lê as tabelas da 0005 e acrescenta uma ação ao catálogo da trilha.

### 12.1 O que foi entregue

- **Domínio puro** (`packages/domain/src/financeiro/fluxo.ts`): períodos por dia, semana (começa na segunda) e mês; fluxo **realizado** (pagamentos e recebimentos efetivos, por data de pagamento) e fluxo **previsto** (saldo de parcelas em aberto, por vencimento, com a parte em atraso). Limite de 400 períodos por consulta.
- **Serviço de caixa** (`ServicoCaixa`, somente leitura): `fluxo:obter`, `conta:listar` (a pagar e a receber, sempre em abas separadas) e `painel:obter`.
- **Serviço de classificação** (`ServicoClassificacao`, decisão D-E): cobertura das despesas do resultado em fixas, variáveis e sem classificação; prévia e aplicação do padrão da categoria aos não classificados (com conferência de quantidade e de padrão, uma entrada de trilha por lançamento e uma da categoria); classificação isolada de um lançamento. Filtros novos (`comportamentoCusto`, `tratamento`) em `lancamento:listar`.
- **7 canais IPC novos** (`fluxo:obter`, `conta:listar`, `painel:obter`, `classificacao:resumo|previa|aplicarCategoria|definirLancamento`), validados com Zod nos dois lados.
- **Interface**: Painel financeiro (caixa, contas em aberto, lançado na competência, pendências), Fluxo de caixa (abas Realizado e Previsto, agrupar por dia, semana ou mês, filtros, total por categoria), Contas a pagar e a receber (registro de pagamento direto da lista), Classificações. A tela de lançamentos passou para `/financeiro/lancamentos`; o painel é a página inicial do módulo.
- **Trilha**: nova ação `classificacao_lote` no catálogo `ACOES_HISTORICO`.

### 12.2 Regras garantidas

- Realizado e previsto aparecem em quadros separados e nunca são somados. Caixa não é apresentado como lucro (texto fixo nas telas).
- Lançamento sem condição de pagamento (saldo desconhecido) **não entra** no previsto, nas contas nem nos totais do painel: é sinalizado à parte, com a quantidade e o valor da operação, e nunca vira zero.
- Períodos sem pagamento mostram "zero registrado" (é o que o sistema sabe) e ficam ocultos por padrão; o usuário pode mostrá-los.
- Consultar não cria nada (teste compara as contagens de lançamentos, parcelas, pagamentos e trilha).
- O padrão da categoria vale só para lançamentos novos; a ação em lote é explícita, mostra a prévia, recusa se o padrão ou a quantidade mudaram e só altera os não classificados.
- A classificação cobre as despesas de tratamento "resultado". Compras de estoque e aquisição de animais são classificadas na origem, nas entregas 4C e 4D (tabela `classificacao_custo_origem`, criada pela migration da entrega que a usar).

### 12.3 Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| Domínio do fluxo (19 testes: períodos, realizado, previsto e propriedades com 1.000 casos por semente e 3 sementes, mais guarda de abrangência) | Aprovado |
| Serviço e IPC (22 testes novos: valores calculados à mão, estorno, filtros, isolamento entre propriedades, "consultar não cria nada", classificação, recusas) | Aprovado |
| Conservação independente do caixa (`conferirCaixa`): valor da operação = pago + em aberto; fluxo, contas e painel iguais às somas feitas direto no banco; roda ao fim de cada sequência de operações e após cada teste | Aprovado |
| Interface (7 testes novos) | Aprovado |
| E2E no Electron (`fase4b.spec.ts`: painel, fluxo, pagamento pela lista de contas, classificação em lote, largura de 900 px sem rolagem horizontal) | Aprovado |
| Volume (20.000 lançamentos) | Fluxo de 2 meses 91 ms; contas a pagar página 1 135 ms; painel 103 ms; resumo de classificação 11 ms |
| Mutações (vencimento igual a hoje contado como atraso; aplicar classificação sem conferir a quantidade; fluxo realizado contando pagamento estornado) | Todas detectadas; alterações desfeitas |
| Inspeção visual | 10 capturas (painel, fluxo realizado e previsto, contas e classificações; claro 1440 px e escuro 900 px) |
| Suíte completa depois da entrega | 496 testes de unidade e integração em 40 arquivos (448 anteriores mais 48 novos); 12 testes E2E; tipos, lint e formatação aprovados |

Os testes usaram bancos e pastas temporários.

### 12.4 Limitações conhecidas

- Fluxo realizado e previsto cobrem só lançamentos manuais (a 4A). Compra e venda de animais, insumos e produção entram nas entregas 4C a 4F.
- Não há saldo bancário nem conciliação com extrato; o "acumulado na consulta" é a soma dos saldos do período, não saldo de conta.
- Classificação padrão por item de estoque e por origem (aquisição, custo anterior) ainda não existe; depende das entregas 4C e 4D.
- Listagens de contas filtram e paginam em memória (parcelas em aberto); com 20.000 lançamentos a primeira página leva 135 ms.
- Juros, multas e descontos continuam sendo lançamentos próprios, informados pelo usuário.

## 13. Fase 4, entrega 4C: compra e venda de animais (2026-10-16)

Autorizada pelo usuário com a Fase 4 inteira (ver seção 12). **Migration 0006** (`0006_compra_venda_animais.sql`), a segunda da Fase 4, sem alterar nenhuma tabela existente. A 4B está no commit `3c0e4d2`.

### 13.1 O que foi entregue

- **Domínio puro**: alocação do valor entre os animais (`alocarPrecoDeAnimais`: igual por cabeça, por peso vivo, por peso de carcaça ou manual, pelo maior resto, soma sempre exata); critério padrão derivado da unidade do preço (D-D); conferência do preço unitário contra o total (kg vivo, @ de peso vivo e @ de carcaça, com 15 kg por @ e tolerância de 1 centavo); custo de aquisição e formação do animal (`apurarAquisicaoEFormacao`, D-F e D-G).
- **Migration 0006**: `negociacao_animal`, `negociacao_animal_item`, `custo_anterior` e `custo_anterior_item`, com gatilhos (lançamento próprio, da natureza, propriedade e valor certos; itens do mesmo tipo e propriedade; um item ativo por animal e tipo; cancelamento só na ordem lançamento, negociação, itens; campos imutáveis; exclusão física proibida; valor do lançamento da negociação não muda).
- **Compra**: uma transação cria o lançamento (despesa "Compra de animais", pelo valor total, à vista, parcelado ou pendente de definição), a negociação, os animais (pelo mesmo cadastro do rebanho, origem "comprado", entrada na data da compra, peso de entrada como pesagem) e a alocação do valor.
- **Venda**: uma transação cria o lançamento (receita "Venda de animais"), dá a saída dos animais pelo fluxo de saída do rebanho (todas as conferências de data, pesagem, estoque e financeiro continuam valendo) e grava a negociação e a alocação. Peso de carcaça só existe se informado.
- **Cancelar venda**: exige os recebimentos estornados; cancela a receita e desfaz a saída de cada animal (D-H). **Cancelar compra**: só se os animais não têm nenhum fato depois da entrada (pesagem, movimentação, consumo, lançamento, sanidade, filhos, venda, custo anterior); os cadastros ficam logicamente excluídos, nada é apagado.
- **Desfazer saída (D-H)**: reversão auditável com motivo; a movimentação de saída é cancelada logicamente; o usuário escolhe o destino quando o lote de origem foi encerrado (reabri-lo, outro lote ativo ou sem lote) e a troca é registrada na data da saída. Saída que veio de venda registrada só se desfaz cancelando a venda.
- **Custo anterior ao sistema (D-G)**: registro próprio, informado, sem caixa, parcela, pagamento nem lançamento, por animal ou por lote. Para lote, divisão igual entre os animais presentes ao fim do dia da data de referência (permanências reconstruídas), só com confirmação explícita do rateio; conferência contra lançamentos e consumos já registrados até a data (pede confirmação para evitar dupla contagem); animal com compra registrada é recusado.
- **Custo do animal**: aquisição (compra registrada, não aplicável para nascido, não apurada para cadastro antigo), formação (informada ou não apurada), acessórios lançados direto ao animal e estado de apuração; nunca zero para o que é desconhecido.
- **10 canais IPC novos**; trilha com as entidades `negociacao_animal` e `custo_anterior` e a ação `reversao_saida`.
- **Interface**: Financeiro > "Animais: compras e vendas" (lista, registrar compra e venda com prévia da alocação, detalhe com cancelamento e escolha do destino dos animais), "Custo anterior"; página do animal ganhou a aba "Custo" e o botão "Desfazer saída".

### 13.2 Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| Domínio (28 testes novos: critérios, preço unitário, aquisição e formação; propriedades com 1.000 casos por semente e 3 sementes) | Aprovado |
| Migration 0006 (10 testes: do zero, da versão 5 preservando dados, falha no passo final com reversão, backup pré-migração e restauração, proteções do banco) | Aprovado |
| Serviço e IPC (36 testes: compra, venda, atomicidade, idempotência, cancelamentos, desfazer saída, custo anterior, persistência, volume) | Aprovado |
| Sequências de operações com animais (3 sementes, 40 sequências de até 25 passos: compra, venda, recebimento, estorno, cancelamento, morte, desfazer, custo anterior, lote; invariantes após cada passo e caixa conferido ao fim) | Aprovado |
| Interface (14 testes novos) | Aprovado |
| E2E no Electron (`fase4c.spec.ts`: compra e venda pela tela, cancelamento, aba Custo, custo anterior, desfazer saída, reinício, largura de 900 px) | Aprovado |
| Volume | Compra de 500 animais 383 ms; venda de 500 em 1,2 s; cancelamento da venda de 500 em 0,9 s |
| Mutações (peso ausente não bloqueia; cancelar sem exigir estorno; desfazer saída sem cancelar a movimentação; rateio de lote sem confirmação) | Todas detectadas; alterações desfeitas |
| Inspeção visual | 8 capturas (lista, detalhe, modal de compra e aba Custo; claro 1440 px e escuro 900 px) |
| Suíte completa depois da entrega | 588 testes de unidade e integração em 45 arquivos; tipos, lint e formatação aprovados |

### 13.3 Decisões e diferenças em relação ao plano

ARQUITETURA.md, seção 12 (D81 a D86). Diferenças: a coluna `negociacao_origem_id` e o desenho de **devolução de animais** não foram implementados, porque a lista de entregas autorizada pelo usuário cobre "desfazer saídas e cancelar vendas" e não a devolução (fica registrada como pendência para decisão, não improvisada); `negociacao_animal_item` ganhou a coluna `tipo` (para a unicidade de um item ativo por animal e tipo) e `custo_anterior_item` guarda a distribuição do custo anterior (também para um só animal).

### 13.4 Limitações conhecidas

- O custo do animal desta entrega reúne só aquisição, custo anterior e acessórios lançados direto ao animal. Consumo de estoque, sanidade e rateios entram nas entregas 4D a 4G; despesas lançadas a um **lote** ainda não são distribuídas aos animais (4E).
- Sem devolução de animais (comprados ou vendidos) como operação própria: cancelar a venda desfaz a saída; devolver parte dos animais de uma venda exige cancelar e registrar de novo.
- Cancelar compra é recusado se o animal teve qualquer fato depois da entrada; nesse caso o caminho é tratar cada fato antes.
- A conferência do preço unitário usa o peso informado na operação, que pode diferir do peso da balança (são dados distintos, como no plano).
- Custo anterior de lote só é possível se o histórico de movimentação permite reconstruir quem estava no lote na data; senão, é recusado e pede registro animal a animal.

## 14. Fase 4, entrega 4D: integração com estoque (2026-10-16)

Autorizada com a Fase 4 inteira (seção 12). **Migration 0007** (`0007_insumos_e_classificacao.sql`). A 4C está no commit `ff8e646`. Nenhuma tabela existente foi alterada.

### 14.1 O que foi entregue

- **Domínio puro** (`custo-insumos.ts`): rateio do frete por valor (maior resto; item sem valor impede o rateio em vez de inventar critério), apuração por contagens (`apuracaoDeContagens`) e custo sanitário por componentes com precedência (`apurarCustoSanitario`), com divisão igual entre os animais tratados.
- **Migration 0007**: `lancamento_item` (item da nota, ligado a UMA entrada de compra do estoque, com gatilhos: lançamento de compra para estoque da mesma propriedade, entrada do mesmo item, quantidade e custo conhecido iguais; imutável salvo cancelamento ou correção auditada; lançamento com itens ativos só é cancelado depois dos itens e das entradas), `classificacao_custo_origem` (fixo ou variável por item de estoque, aquisição de animal e custo anterior; ausência = não classificado) e dois índices de cobertura para as consultas de consumo.
- **Compra de insumos**: uma transação cria o lançamento (categoria de tratamento "estoque"), as entradas de compra no estoque (pelo mesmo serviço do estoque, com o item como documento de origem) e os itens. Frete rateado por valor entra no custo de entrada. Itens que controlam lote exigem o lote físico (novo ou existente). **Nenhuma despesa de resultado nasce da entrada nem do consumo.**
- **Correções e cancelamentos pela compra**: a tela de estoque recusa corrigir ou cancelar entrada ligada e orienta a usar a compra. Corrigir um item repassa ao estoque pela correção auditada (recalcula o custo médio e o custo apropriado dos consumos; o estoque recusa se o saldo ficaria negativo e nada muda), ajusta o total e as parcelas do que está em aberto (informadas pelo usuário) e nunca baixa o total abaixo do já pago. Cancelar a compra cancela as entradas e o lançamento (exige pagamentos estornados).
- **Vínculo retroativo**: entradas de compra antigas sem documento aparecem em Pendências e podem ser ligadas a um lançamento existente (nada é alterado, a diferença vira pendência) ou originar um lançamento novo. Entrada de custo desconhecido não é ligada a valor inventado.
- **Auditor de consistência** (`auditoria:pendencias`): entradas sem documento (e documentos órfãos), compras para estoque sem entrada, notas cujo total difere da soma dos itens e consumos sem custo.
- **Consumo como custo apropriado**: lista e resumo por destino, item e tipo, lidos do custo médio do estoque; consumo sem custo conhecido aparece como "custo desconhecido" e torna o total parcial; consumo da propriedade fica em "não alocado" até o rateio (4E). Classificação fixo ou variável por item de estoque.
- **Custo sanitário sem duplicação**: componentes com fonte única (baixa de estoque, serviços lançados e, só se não houver nenhum dos dois, o valor digitado no registro); o valor digitado que ficou de fora aparece como "informado, não contado"; sem componente, "não apurado". Lançamento de serviço ligado ao registro (origem `sanitario`).
- **14 canais IPC novos**; trilha com a entidade `classificacao_origem`.
- **Interface**: Financeiro > Compras de insumos (lista, registrar compra com prévia do custo de entrada e frete rateado, detalhe com correção e cancelamento), Custos de consumo (resumo parcial/completo, por item com classificação, por destino e tipo), Pendências; cartão "Custo do registro (Financeiro)" na página do registro sanitário.

### 14.2 Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| Domínio (14 testes novos: frete, apuração por contagens, precedência sanitária; propriedades com 1.000 casos por semente e 3 sementes) | Aprovado |
| Migration 0007 (8 testes: do zero, da versão 6 preservando dados, falha no passo final com reversão, backup pré-migração e restauração, proteções) | Aprovado |
| Serviço e IPC (23 testes: compra, frete, lote físico, atomicidade, idempotência, guardas do estoque, correção com recálculo retroativo, recusa pelo estoque, cancelamento, vínculo retroativo, auditor, consumos, classificação, custo sanitário) | Aprovado |
| Conservação independente do estoque: custo das entradas ativas = valor do saldo + custo apropriado dos consumos ativos, conferida após cada passo das sequências | Aprovado |
| Sequências de operações de insumos (3 sementes, 40 sequências de até 25 passos: compra com frete, consumo, correção, cancelamentos, pagamento e estorno) | Aprovado |
| Interface (11 testes novos) | Aprovado |
| E2E no Electron (`fase4d.spec.ts`: compra pela tela, consumo, correção, recusa do estoque, vínculo retroativo, custo sanitário, reinício, 900 px) | Aprovado |
| Volume (100.000 consumos em 10 itens) | Resumo 78 ms; página de consumos 240 ms; pendências 31 ms (depois de dois índices de cobertura) |
| Mutações (frete sem resto, valor informado sempre contado, guarda do estoque removida, cancelamento sem exigir estorno, consulta incluindo consumo cancelado) | Todas detectadas; alterações desfeitas |
| Inspeção visual | 8 capturas (lista, detalhe, custos de consumo e pendências; claro 1440 px e escuro 900 px) |
| Suíte completa depois da entrega | 649 testes de unidade e integração em 51 arquivos; 14 testes E2E; tipos, lint e formatação aprovados |

### 14.3 Decisões e diferenças em relação ao plano

ARQUITETURA.md, seção 12 (D87 a D91). Diferenças: o plano falava em `lancamento_item.movimentacao_estoque_id` NULL até a entrada ser criada; como o item nasce junto da entrada (mesma transação) a coluna é `NOT NULL`. A origem `compra_estoque` do lançamento guarda um identificador da nota (não há tabela de nota: o lançamento é a nota). `classificacao_custo_origem` foi criada aqui (a 4B a deixara para a entrega que a usasse), com os escopos item de estoque, aquisição de animal e custo anterior; a ação em lote por categoria continua como na 4B.

### 14.4 Limitações conhecidas

- A correção de um item só muda quantidade e valor; mudar a data da entrada ou o lote físico exige cancelar a compra e registrá-la de novo.
- Consumo com destino "lote" ainda não é distribuído aos animais do lote (4E); consumo da propriedade fica "não alocado" até o rateio.
- O custo sanitário por animal é a divisão igual do custo conhecido, sem dose por peso (não há critério científico a usar). Despesas sanitárias lançadas sem ligação a um registro ficam como despesas diretas comuns.
- O vínculo retroativo liga entrada e lançamento 1:1; uma nota antiga que reúne várias entradas é ligada entrada a entrada, e a diferença com o total fica como pendência.
- Consumos de estoque que não são lançamentos continuam sem aparecer no caixa (corretamente): só o pagamento da compra aparece.

## 15. Fase 4, entrega 4E: rateio de custos (2026-10-16)

Autorizada com a Fase 4 inteira (seção 12). **Migration 0008** (`0008_rateio_de_custos.sql`). A 4D está no commit `e9b1c54`. Nenhuma tabela existente foi alterada.

### 15.1 O que foi entregue

- **Domínio puro** (`apropriacao.ts`, `rateio.ts`): apropria cada custo a animal, lote ou "não alocado", com a conservação *soma dos animais + lotes sem animais + não alocado = soma dos custos de origem*; critérios de rateio (cabeças, animal-dias, peso, manual) que geram só pesos inteiros.
- **Migration 0008**: `rateio_custo` (decisão auditável, versionada por `substitui_id`, idempotente por `requisicao_id`, cancelamento lógico com motivo, no máximo um rateio ativo por custo) e `rateio_custo_item` (peso de cada lote ou animal). Gatilhos: origem elegível, destinos da mesma propriedade, rateio e pesos imutáveis, exclusão física proibida.
- **O rateio guarda pesos, nunca valores.** O valor de cada destino é recalculado a cada leitura, por divisão proporcional exata (maior resto), a partir do valor atual da origem. Correção ou cancelamento retroativo do lançamento ou do consumo continua fechando, sem rateio "desatualizado".
- **Custo por lote e por animal** (`custo:resumo`, `custo:animais`, `custo:animal`, `custo:lote`): custo lançado ao lote é dividido por igual, dia a dia, entre os animais presentes ao fim do dia (o dia da troca ou da saída já não conta para o lote antigo); custo da propriedade só chega a lotes e animais por rateio; custo de registro sanitário é dividido entre os animais tratados, com a mesma fonte única da 4D. Cada valor pode ser explicado ("De onde veio este número?") com link para a origem.
- **Elegibilidade**: rateiam-se despesas manuais da propriedade (sem lote nem animal) e consumos de estoque da propriedade. Compra para estoque (vira custo no consumo), consumo de registro sanitário (já tem destino) e despesas de outros módulos não aceitam rateio. O lançamento rateado não muda de destino nem de categoria enquanto o rateio estiver ativo.
- **Estados honestos**: custo desconhecido nunca vira zero (aparece como "custo desconhecido" e deixa o total parcial); animal sem custo de aquisição nem custo anterior informado tem apuração parcial ou "não apurada"; animal com histórico de lote inconsistente fica fora da divisão por lote, com aviso; consumo ou despesa cancelados deixam o rateio sem efeito, sinalizado.
- **11 canais IPC novos** (`rateio:*`, `custo:*`); trilha com a entidade `rateio_custo`.
- **Interface**: Financeiro > Rateio de custos (pendentes, prévia calculada pelo servidor, criar, revisar, cancelar, versões) e Custos por lote e animal (resumo conferido, por lote, por animal paginado, composição do lote, "De onde veio?"); link a partir da aba Custo do animal.

### 15.2 Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| Domínio (21 testes novos: apropriação com conservação, rateio por critério, propriedades) | Aprovado |
| Migration 0008 (10 testes: do zero, da versão 7 preservando dados, falha no passo final com reversão, backup pré-migração e restauração, proteções) | Aprovado |
| Serviço e IPC (24 testes: lote dia a dia com fronteira de troca, não alocado, cabeças, animal-dias, peso, manual, revisão, cancelamento, duplicidade, idempotência, guarda do lançamento, consumo com correção retroativa, custo desconhecido, sanitário sem duplicação, custo anterior, listagem) | Aprovado |
| Conservação independente por SQL após cada passo das sequências (3 sementes, 20 sequências de até 30 passos: despesas, consumos, compras, trocas de lote, saídas, rateios, revisões, cancelamentos e correções) | Aprovado |
| Interface (8 testes novos) | Aprovado |
| E2E no Electron (`fase4e.spec.ts`: rateio pela tela, custo por lote e animal, origem do valor, cancelamento, reinício, 900 px) | Aprovado |
| Volume (3.000 animais, 30 lotes, 60.000 consumos, 6.000 despesas, 100 rateios) | Resumo ~0,7 s; página de animais ~0,7 s; "de onde veio" ~0,7 s; criar um rateio ~0,13 s |
| Mutações (valor desconhecido virando zero, fronteira do dia da troca, consumo sanitário contado duas vezes, rateio sem seguir a cadeia de correções, rateio duplicado aceito, guarda do lançamento removida, divisão que perde animais, critério de peso sem limite de idade, valor sanitário informado ignorado) | Todas detectadas; alterações desfeitas |
| Inspeção visual | Capturas de rateio, custos, composição e modal manual em claro e escuro, 1280, 900 e 640 px |
| Suíte completa depois da entrega | 717 testes de unidade e integração em 58 arquivos; 15 testes E2E; tipos e formatação aprovados; lint sem erros (2 avisos antigos de `console` em testes de volume) |

### 15.3 Decisões e diferenças em relação ao plano

ARQUITETURA.md, seção 12 (D92 a D97). Diferença: o plano previa rateio de custo de produção própria; ele entra na 4F, pois depende do centro de produção. O critério por peso exige que o usuário informe a idade máxima da pesagem (o sistema não escolhe esse limite).

### 15.4 Limitações conhecidas

- Os critérios automáticos geram pesos por lote (cabeças, animal-dias, peso); só o critério manual aceita animal como destino.
- Se a composição dos lotes mudar depois do rateio (por exemplo, correção de movimentação), o rateio mantém os pesos gravados e sinaliza "base mudou"; refazer é uma revisão explícita.
- O resumo recalcula tudo a cada consulta (cerca de 0,7 s com 66.000 custos e 3.000 animais); sem cache, para nunca mostrar valor desatualizado.
- Custo de produção própria, resultado econômico, margens e indicadores vêm nas entregas 4F e 4G.

## 16. Fase 4, entrega 4F: produção própria (2026-10-16)

Autorizada com a Fase 4 inteira (seção 12). **Migration 0009** (`0009_producao_propria.sql`). A 4E está no commit `1cd4907`. Nenhuma tabela existente foi alterada; o gatilho de elegibilidade do rateio (`tg_rateio_origem`) foi recriado para recusar custo que está num centro de produção.

### 16.1 O que foi entregue

- **Domínio puro** (`producao.ts`): custo do centro por componentes (despesas e consumos vinculados); sem componente é "não apurado" e não encerra; com algum consumo de custo desconhecido, a entrada de produção leva custo desconhecido, e o valor conhecido fica registrado à parte.
- **Migration 0009**: `centro_producao` (item produzido, área opcional, período, situação aberto/encerrado e o retrato do encerramento: quantidade colhida, entrada gerada, custo conhecido, componentes desconhecidos e custo total), `centro_producao_consumo` e `centro_producao_lancamento` (vínculos, um centro por custo). Gatilhos: item e área da mesma propriedade; encerrar só com a entrada `entrada_producao` correspondente (mesmo item, quantidade, custo, data e documento de origem = centro); centro encerrado não muda; vínculo só com o centro aberto e nunca com rateio ativo; movimento ou despesa de centro encerrado não é cancelado nem alterado; exclusão física proibida.
- **Um dono por custo**: despesa ou consumo vinculado sai do "não alocado" e da apropriação a lotes e animais e não pode ser rateado. Ao encerrar, o custo total vira o custo de entrada do item produzido no estoque (pelo serviço do estoque, com a quantidade colhida informada pelo usuário); o custo chega aos animais quando o volumoso é consumido, pelo custo médio. Enquanto o centro está aberto, o resumo de custos mostra o valor "em centros de produção abertos"; depois de encerrado, ele é valor de estoque e não aparece duas vezes.
- **Correções e cancelamentos**: com o centro aberto, corrigir o consumo vinculado leva o vínculo ao movimento corrigido (o custo é refeito); cancelar a despesa ou o consumo tira o custo do centro; mudar o destino do consumo ou da despesa exige desvincular antes. Com o centro encerrado, nada disso é aceito: reabrir cancela a entrada no estoque (o estoque recusa se o produto já foi consumido além do saldo) e o recálculo retroativo propaga.
- **Tela de consumos** (4D): consumo vinculado aparece como "Centro de produção …" e sai do "não alocado".
- **10 canais IPC novos** (`producao:*`); trilha com a entidade `centro_producao` (criação, alteração, vínculos, encerramento, reabertura, cancelamento).
- **Interface**: Financeiro > Produção própria (lista, novo centro) e página do centro (custos vinculados, vincular, desvincular, encerrar com a quantidade colhida, reabrir com motivo, cancelar); indicador "Em centros de produção abertos" em Custos por lote e animal.

### 16.2 Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| Domínio (5 testes novos) | Aprovado |
| Migration 0009 (9 testes: do zero, da versão 8 preservando dados e o rateio, falha no passo final com reversão inclusive do gatilho recriado, backup pré-migração e restauração, proteções) | Aprovado |
| Serviço e IPC (8 testes: ciclo completo com valores à mão, proteções do centro encerrado, reabertura recusada com produto consumido, correção acompanhando o vínculo, custo desconhecido, centro sem custo, elegibilidade, cancelamentos, idempotência, tela de consumos) | Aprovado |
| Conferência independente da produção (custo de entrada = soma dos vínculos, ou desconhecido; nenhum custo em centro e rateio; nenhum vínculo para custo cancelado) e da apropriação, após cada passo das sequências | Aprovado |
| Sequências (3 sementes, 20 sequências de até 30 passos, agora com criar centro, vincular, desvincular, encerrar, consumir o volumoso e reabrir; também 60 por semente uma vez) | Aprovado |
| Interface (5 testes novos) | Aprovado |
| E2E no Electron (`fase4f.spec.ts`: centro pela tela, vínculos, encerramento no estoque, consumo pelos animais, reabertura recusada, reinício, 900 px) | Aprovado |
| Volume | Resumo de 100.000 consumos 77 ms e pendências 36 ms (uma primeira versão com subconsulta por linha subia para 300 ms; corrigida somando os vinculados à parte) |
| Mutações (custo desconhecido virando valor na entrada e no retrato, completo com desconhecido, apropriação contando consumo vinculado, vínculo sem acompanhar correção, despesa cancelada sem desvincular, centro encerrado contado como em produção, encerrar sem componente, guarda do estoque removida) | Todas detectadas; alterações desfeitas |
| Inspeção visual | Lista e página do centro em claro e escuro, 1280 e 900 px; modal de reabertura |
| Suíte completa depois da entrega | 744 testes de unidade e integração em 62 arquivos; 16 testes E2E; tipos e formatação aprovados; lint sem erros (2 avisos antigos) |

### 16.3 Decisões e diferenças em relação ao plano

ARQUITETURA.md, seção 12 (D98 a D102). Diferenças: o plano previa as tabelas da 4F na 0007; ficaram na 0009, que também recria o gatilho de elegibilidade do rateio. O vínculo de consumo acompanha a correção do movimento (em vez de seguir a cadeia de correções na leitura). Centro sem nenhum custo vinculado não encerra (não há como dizer que o custo é zero); quem quiser registrar uma produção de custo desconhecido sem centro usa a entrada de produção direto no Estoque, como antes.

### 16.4 Limitações conhecidas

- Uma despesa ou consumo pertence a um único centro; não há rateio de um custo entre vários centros.
- O centro gera uma única entrada de produção (uma colheita). Várias colheitas pedem centros separados ou reabrir e encerrar de novo com o total.
- O custo do centro não é dividido entre subprodutos; o item produzido recebe todo o custo.
- Indicadores de produtividade da área (custo por hectare, por tonelada de matéria seca) ficam para a 4G ou para o módulo de nutrição, sem dados inventados.

## 17. Fase 4, entrega 4G: custo acumulado, resultado, indicadores, conciliação e projeção (2026-10-17)

Autorizada com a Fase 4 inteira (seção 12). **Migration 0010** (`0010_indices_desempenho.sql`), só com dois índices de desempenho; nenhuma tabela nova e nenhum dado alterado. A 4F está no commit `decee7e`. Tudo o que esta entrega mostra é derivado; nada é gravado.

### 17.1 O que foi entregue

- **Domínio puro** (`resultado.ts`): divisão inteira arredondada em BigInt, totais por classificação, resultado (com custo parcial é um máximo), margem bruta com cobertura, ponto de equilíbrio (fixos × unidades ÷ margem de contribuição), custo por kg ganho, valor por @ (15 kg, D-B, por base) e projeção por premissas. A apropriação (4E) passou a carregar, em cada linha de custo, as partes classificadas (fixo, variável ou não classificado) e o grupo de conciliação, e pode acumular o custo de cada animal até uma data (custo até a saída) sem tocar a conservação.
- **Resultado do período** (`resultado:periodo`): competência e caixa lado a lado, nunca somados. Competência = receitas de resultado − (consumos, despesas inclusive as não alocadas, custos sanitários e aquisição ou custo anterior dos animais que saíram no período). Animal comprado e ainda no rebanho é ativo, não custo. Saída sem custo de aquisição nem custo anterior deixa o resultado parcial. Caixa = recebimentos − pagamentos do período (o mesmo do fluxo da 4B).
- **Resultado realizado** (`resultado:realizado`): por animal (receita da venda − custo acumulado até a saída; morte é perda; venda ou descarte sem negociação ficam com receita "não registrada", nunca zero) e por lote de saída, com totais.
- **Margem bruta** com cobertura de classificação e a lista do que falta classificar; **margem líquida** (resultado) independe da classificação.
- **Ponto de equilíbrio** (`resultado:pontoEquilibrio`) por cabeça, kg vivo, @ viva ou @ de carcaça; indisponível, com o motivo, sem classificação completa, com custo desconhecido, sem o peso da base em todas as vendas ou com margem de contribuição não positiva.
- **Indicadores** (`resultado:indicadores`): custo por kg de peso vivo ganho (só animais com duas pesagens no período, sem aquisição, com quem ficou de fora e os métodos de pesagem usados), também por lote atual; receita, custo e margem por @ de carcaça e por @ viva vendida (bases nunca convertidas); preço médio do litro de leite vendido (só receitas com litros informados).
- **Conciliação** (`resultado:conciliacao`): por linha (venda de animais, leite e outras receitas, despesas, insumos e estoque, aquisição de animais, produção própria, fora do resultado), competência contra caixa, com a diferença e a explicação; as diferenças somadas fecham a diferença total.
- **Projeção** (`projecao:calcular`): premissas digitadas (data, unidade e preço, pesos esperados, custos futuros), sobre o custo acumulado do animal ou dos animais ativos do lote; rótulo fixo; nada é gravado; peso de carcaça nunca é estimado do peso vivo.
- **Desempenho**: índice em `movimentacao_estoque.substitui_id` (a cadeia de correções era varrida a cada passo) e em `rateio_custo_item.rateio_id`; itens e movimentos vigentes dos rateios em consultas únicas; linhas de custo memorizadas por propriedade com chave na conexão e no contador de escritas (`total_changes()`): qualquer escrita, restauração ou reabertura recalcula.
- **6 canais IPC novos**. **Interface**: Financeiro > Resultado (competência e caixa, comparação com o período anterior, composição do custo, margem bruta, indicadores, ponto de equilíbrio, realizado por lote e por animal), Conciliação e Projeção; bloco de resultado e pendências (não alocado, centros abertos) no painel. O custo acumulado por animal e lote até uma data é a tela Custos por lote e animal (4E) com o período limitado.

### 17.2 Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| Domínio (12 testes novos, inclusive propriedades com 1.000 casos por semente e 3 sementes; 1 novo da apropriação até uma data) | Aprovado |
| Migration 0010 (3 testes: do zero, da versão 9 sem tocar dados e com o índice no plano da consulta, falha com reversão) | Aprovado |
| Serviço e IPC (12 testes com o cenário do plano 9.3, item 4, calculado à mão: vendidos + perdido + remanescente = aquisição + consumo; realizado; desfazer saída; competência e caixa; margem bruta; leite; @ de carcaça e viva; custo por kg ganho; ponto de equilíbrio; conciliação; projeção sem gravar; memorização invalidada por escrita e por restauração de backup) | Aprovado |
| Conferência independente do resultado (custo = soma de origem por SQL − ativo dos animais no rebanho; receita por SQL; caixa igual ao fluxo da 4B; conciliação fechando) depois de cada teste e no fim de cada sequência aleatória | Aprovado |
| Interface (6 testes novos; teste do painel atualizado) | Aprovado |
| E2E no Electron (`fase4g.spec.ts`: resultado, realizado, conciliação, projeção, reinício sem nada gravado, 900 px) | Aprovado |
| Volume na escala da meta do plano (5.000 animais, 100.000 consumos, 20.000 despesas, 100 rateios) | Consulta logo após uma alteração: 360 a 500 ms; consultas seguintes da mesma tela: 21 a 127 ms. Antes dos índices e das leituras em lote, na escala de 3.000 animais: 340 a 470 ms |
| Mutações (capitalizar sempre, custo até a saída ignorado, morte sem receita conhecida, pagamento de estoque fora dos insumos, aquisição no custo por kg ganho, classificação de item ignorada, fórmula do equilíbrio, estado do resultado, natureza do caixa, chaves da memorização) | Todas detectadas; alterações desfeitas |
| Inspeção visual | Resultado e conciliação em claro e escuro, 1280 e 900 px; projeção e painel (a explicação da conciliação foi movida para uma linha própria depois da inspeção em 900 px) |
| Suíte completa depois da entrega | 777 testes de unidade e integração em 66 arquivos; 17 testes E2E; tipos e formatação aprovados; lint sem erros (2 avisos antigos) |

### 17.3 Decisões e diferenças em relação ao plano

ARQUITETURA.md, seção 12 (D103 a D110). Diferenças: a numeração da migration ficou 0010 (as 0007 a 0009 já existiam) e ela só traz índices; a meta RNF-03 (300 ms) é atendida nas consultas seguintes, mas não na primeira consulta após uma alteração na escala máxima (ver 17.4). A tela "Custo acumulado" do plano é a de Custos por lote e animal (4E), que já aceita o período.

### 17.4 Limitações conhecidas

- **Desempenho**: na escala máxima da meta (5.000 animais e 100.000 movimentos), a primeira consulta depois de cada alteração leva cerca de 0,4 a 0,5 s, acima dos 300 ms; as seguintes ficam abaixo de 130 ms. Baixar a primeira exigiria materializar agregados no banco (previsto no plano, 9.5), com risco de dado desatualizado: **não foi feito sem a sua aprovação**.
- O resultado do período segue a definição do plano: custos de produção dos animais ainda no rebanho entram no período em que ocorreram; só a aquisição e o custo anterior esperam a saída.
- Acessório de compra lançado a um lote (e não ao animal) entra como custo do período, não como ativo do animal.
- Venda registrada só no rebanho (sem negociação) fica com receita "não registrada"; descarte idem.
- O custo por kg ganho usa as pesagens como registradas (balança, fita ou visual) e mostra quantas de cada método entraram.
- O ponto de equilíbrio usa os custos variáveis de todo o período sobre as unidades vendidas no período (aritmética do plano).

## 18. Fase 4, entrega 4H: relatórios, exportação e fechamento (2026-10-17)

Autorizada com a Fase 4 inteira (seção 12). **Sem migration.** A 4G está no commit `d0b15bb`. Esta entrega não grava nada no banco.

### 18.1 O que foi entregue

- **Relatórios gerenciais** (`relatorio:montar`), montados pelos mesmos serviços das telas, sem recalcular nada por outro caminho: resultado do período (competência e caixa lado a lado, composição do custo, margem bruta, indicadores, realizado por lote e por animal), custos por lote e animal (todo o histórico ou um período; filtro opcional pelo lote atual), custo de um animal (de onde veio cada valor), composição do custo de um lote, lançamentos do período (valor da operação, pago ou recebido e em aberto em colunas separadas), fluxo de caixa (realizado e previsto, nunca somados), conciliação e **conferência financeira**.
- **Conferência financeira**: apropriação (animais + lotes sem animais + não alocado = soma de origem), conciliação (soma das diferenças por linha = diferença total), caixa (conciliação = saldo realizado do fluxo), resultado (conciliação = resultado do período) e pendências (custo desconhecido, não alocado, lançamentos sem condição de pagamento, entradas sem documento, compras para estoque sem entrada, notas com total diferente dos itens, centros de produção abertos). Qualquer verificação que não fecha gera aviso para não usar os números.
- **Exportação** (`relatorio:exportar`): o main monta o relatório, abre o diálogo de salvar e grava. **CSV**: UTF-8 com BOM, `;`, CRLF; dinheiro em centavos e em reais (`1234,56`); apuração com a situação (completo, parcial, desconhecido, não apurado); valor desconhecido sai vazio em centavos e "desconhecido" em reais, nunca 0; texto que começa com `=`, `+`, `-`, `@`, tabulação ou retorno de carro recebe `'`. **PDF**: HTML gerado por função pura com todo texto escapado e CSP `default-src 'none'`, impresso por `printToPDF` numa janela oculta com sandbox, sem JavaScript e sem preload; o HTML temporário é apagado depois. Visão no título, rodapé fixo ("relatório gerencial de uso próprio: não é documento fiscal nem contábil e não calcula impostos") e número de página.
- **Privacidade**: o CPF ou CNPJ das contrapartes só sai no relatório de lançamentos com a opção marcada; sem ela, o relatório avisa que foi omitido.
- **Avisos de resultado parcial**: custo desconhecido ou não apurado, animais que saíram sem custo de aquisição nem custo anterior, margem bruta parcial (e lista de custos sem classificação limitada), vendas sem receita registrada (por lote e na observação do resultado), lançamentos pendentes de definição com o "em aberto" desconhecido.
- **Interface**: Financeiro > Relatórios e exportação, com pré-visualização do mesmo modelo que vira arquivo (20 linhas por tabela; o arquivo traz todas), período obrigatório ou opcional conforme o relatório, escolha de lote ou animal e mensagem de cancelamento ("nenhum arquivo foi salvo").
- **2 canais IPC novos**, validados com Zod (`relatorio:montar`, `relatorio:exportar`).

### 18.2 Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| CSV byte a byte (BOM, `;`, CRLF, acentos, aspas, `;` e quebra dentro do texto, tentativas de fórmula, negativos, zero conhecido, desconhecido, parcial, não apurado) e HTML (escape de `<script>`, aspas e apóstrofo; sem script, imagem, link ou URL; visão no título e no rodapé; ausente como "Sem dado" ou "Custo desconhecido"; parcial como "no mínimo") | Aprovado (4 testes) |
| Serviço e IPC (9 testes): números iguais aos das telas (resultado, fluxo); animal sem custo de aquisição e venda sem receita sinalizados; custos, animal, lote, fluxo e conciliação; documento da contraparte só com a opção; saldo desconhecido nunca zero; conferência fechando e denunciando falha simulada (apropriação que não fecha, não alocado de valor desconhecido); período, animal e lote exigidos; exportação sem gravar nada no banco; diálogo cancelado | Aprovado |
| Interface (3 testes): prévia sem R$ 0,00 para ausente, exportação com período e com ou sem documento, histórico inteiro nos custos, lote exigido, cancelamento | Aprovado |
| E2E no Electron (`fase4h.spec.ts`): CSV e PDF **reais** pela tela (cabeçalho `%PDF-`, tamanho e páginas), conferência pela prévia, backup antes de uma despesa e restauração com o resultado de volta ao valor anterior, reinício, 900 px sem rolagem horizontal, console sem erros | Aprovado |
| Mutações (sem proteção de fórmula, desconhecido virando zero no CSV, sem escapar `<`, documento sempre incluído, aviso de venda sem receita removido, apropriação sempre "Fecha", não alocado avaliado só pelo valor) | Todas detectadas (as duas últimas só depois de um teste novo); alterações desfeitas |
| PDFs representativos (resultado, lançamentos, conferência, custos, fluxo e conciliação) gerados pelo aplicativo e lidos página a página | Legíveis; texto com `<b>` aparece literal; ausente como "Sem dado"; acentos corretos. Ajustes feitos depois da leitura: situação do animal por extenso; "completo" não aparece mais ao lado do resultado quando há venda sem receita; as verificações sobre todo o histórico dizem isso |
| Inspeção visual da tela | Claro e escuro, 1280 e 900 px, prévias de resultado e de lançamentos: sem rolagem horizontal da página (tabelas largas rolam dentro do quadro, como nas outras telas) |
| Suíte completa depois da entrega | 793 testes de unidade e integração em 69 arquivos; 18 testes E2E; tipos, formatação e build aprovados; lint sem erros (2 avisos antigos de `console` em testes de volume) |

### 18.3 Decisões e diferenças em relação ao plano

ARQUITETURA.md, seção 12 (D111 a D115). Diferenças: o PDF é impresso a partir de um arquivo HTML temporário (apagado no fim) em vez de URL `data:`, para não esbarrar no limite de tamanho de URL em relatórios grandes; receita ausente aparece como "Sem dado", com aviso explicando; XLSX continua para a Fase 10, como no plano.

### 18.4 Limitações conhecidas

- O conteúdo textual do PDF não é verificado automaticamente (sem biblioteca de leitura de PDF, D-J); a garantia está no teste do HTML e na leitura manual feita nesta sessão.
- A pré-visualização mostra até 20 linhas por tabela; o arquivo traz todas.
- No relatório de custos, o filtro de lote vale só para a lista de animais (o resumo é da propriedade).
- A tela de Resultado (4G) mostra a competência como "completo" quando não há custo desconhecido, mesmo com venda sem receita registrada; o relatório sinaliza isso em aviso e na observação, mas a tela da 4G não foi alterada.
- Nenhum relatório é documento fiscal ou contábil; não há cálculo de impostos.

## 19. Fechamento da Fase 4 (financeiro): estado em 2026-10-17

**Todas as entregas implementadas e commitadas. Atualização de 2026-10-21: Fase 4 aprovada; tag `fase-4` no commit `3287b46`.**

| Entrega | Commit | Migration |
|---|---|---|
| 4A base financeira | `8fe7caa` | 0005 |
| 4B fluxo de caixa | `3c0e4d2` | — |
| 4C compra e venda de animais | `ff8e646` | 0006 |
| 4D integração com estoque | `e9b1c54` | 0007 |
| 4E rateio de custos | `1cd4907` | 0008 |
| 4F produção própria | `decee7e` | 0009 |
| 4G resultado e indicadores | `d0b15bb` | 0010 (só índices) |
| 4H relatórios e exportação | `f6c8745` | — |
| Ajustes da revisão final (completude do resultado) | `4c213d4` | — |
| Devolução de animais (seção 21) | commit "Fase 4: devolucao de animais" | 0011 |

**Pendências para decisão do usuário:** (1) materializar agregados para que a primeira consulta depois de uma alteração fique abaixo de 300 ms na escala máxima (seção 17.4; investigado na seção 20.2, sem otimização simples e segura; materialização não autorizada); (2) devolução de animais: implementada com o desenho aprovado em 2026-10-18 (seção 21). Resolvidas em 2026-10-21: aprovação final da Fase 4 e tag `fase-4`.

**Como testar à mão:** abrir o aplicativo com uma pasta de dados de teste; em Financeiro, comprar animais (Animais: compras e vendas), registrar uma compra de insumos e um consumo por lote no Estoque, lançar uma despesa sem condição de pagamento e vender um animal; conferir Resultado, Conciliação e Custos por lote e animal; em Relatórios e exportação, pré-visualizar a Conferência financeira (as verificações devem dizer "Fecha") e exportar Resultado e Lançamentos em CSV (abrir no Excel) e em PDF; marcar e desmarcar a opção de CPF ou CNPJ e conferir que o documento só aparece com ela.

## 20. Fase 4: ajustes da revisão final (2026-10-17)

Pedidos pelo usuário na revisão do relatório da seção 19, antes da tag. Os commits `8fe7caa` a `f6c8745` foram preservados. **Sem migration.** A Fase 5 não foi iniciada (o `PLANO_FASE_5.md` é só um rascunho de plano, fora do controle de versão).

### 20.1 Completude do resultado: regra única

- **Problema corrigido:** a tela de Resultado (4G) dizia "completo" quando havia venda sem receita registrada, e o realizado por lote somava a receita desconhecida como zero (mostrava −custo como resultado).
- **Regra única no domínio** (`apurarResultado`, `packages/domain`): receitas conhecidas (com a contagem) e desconhecidas mais o custo apurado dão o estado:
  - `completo`: toda receita e todo custo conhecidos;
  - `parcial`: falta algum valor, mas há receita conhecida. O valor mostrado é só o conhecido, com o limite: "no máximo" (falta custo), "no mínimo" (falta receita) ou "só o conhecido, não é limite" (faltam os dois);
  - `não apurado`: há receita desconhecida e nenhuma receita conhecida. Não há valor (`null`), e a receita desconhecida nunca é tratada como zero.
- **Recebimento não é completude:** venda à vista em aberto, parcelada ou com condição a definir tem receita conhecida (competência). Só a venda ou o descarte registrados no rebanho sem negociação têm receita desconhecida; a morte tem receita zero conhecida (perda).
- **Textos únicos** (`textos-completude.ts`, no `shared-types`): as telas e os relatórios usam as mesmas palavras ("Completo", "Parcial: no mínimo", "Não apurado") e a mesma explicação.
- **Onde se aplica:** resultado do período (competência), realizado por animal, por lote e total, margem bruta (motivo), ponto de equilíbrio (indisponível, com o motivo), conciliação (receitas sem valor por linha e completude da competência), painel e relatórios de resultado, conciliação e conferência (nova linha "Completude do resultado"; a verificação "Resultado" também confere a completude). A tela de Custos trata só de custo apurado (sem receita) e já usava a apuração comum; não mudou.
- Separação mantida: competência, caixa e custo apropriado continuam em blocos e campos próprios; a conciliação compara os valores conhecidos e mostra a completude ao lado.

### 20.2 Desempenho (investigação, sem mudança)

Medição nesta sessão, na escala da meta (5.000 animais, 100.000 consumos, 20.000 despesas, 100 rateios): consulta fria de 435 a 488 ms; quente de 120 ms. Decomposição da fria: leitura dos consumos ~150 ms; montagem das linhas de custo ~130 ms; apropriação no domínio ~80 ms; restante ~60 ms.

- A consulta dos consumos já usa índices (filtro por item e tipo; `NOT EXISTS` sobre índice parcial único). O modo `raw` do `better-sqlite3` foi testado e **não reduziu** o tempo (159 a 173 ms): o custo é o próprio percorrer das 100 mil linhas.
- Memorizar a formatação da quantidade nas descrições economizaria até ~30 ms só quando as quantidades se repetem (caso do volume sintético), sem chegar perto da meta.
- Evitar a segunda apropriação do período exigiria duplicar a regra do não alocado fora do domínio, com risco de divergência.

**Conclusão:** não há otimização simples e segura que leve a primeira consulta a 300 ms. A implementação foi preservada (os experimentos foram desfeitos e conferidos) e **a meta continua não atendida na primeira consulta depois de uma alteração**. Materializar agregados não foi feito, como determinado.

### 20.3 Devolução de animais

Conferido o escopo do `PLANO_FASE_4.md` (5.12): "negociação vinculada (`negociacao_origem_id`) que reverte o item… **o desenho detalhado será apresentado no início da 4C para aprovação**". Esse desenho nunca foi aprovado, e as decisões em aberto mudam o rebanho, o resultado e o financeiro. Por isso a devolução **não foi implementada**: a proposta está no relatório desta revisão, aguardando aprovação.

### 20.4 Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| Domínio: regra de completude (casos à mão e propriedade com 1.000 casos determinísticos) | Aprovado |
| Serviço e IPC (`completude-resultado.test.ts`, 5 testes): à vista recebida, à vista em aberto, parcelada, condição a definir (completo); venda sem negociação com outra conhecida (parcial, no mínimo); só venda e descarte sem receita (não apurado, ponto de equilíbrio indisponível, conciliação e relatórios iguais, conferência fecha); custo não apurado (no máximo) e custo e receita faltando (sem limite); cancelamento da venda e desfazer saída | Aprovado |
| Conferência independente ampliada (`apoio-resultado.ts`, usada em todos os testes de resultado e nas sequências aleatórias): receitas desconhecidas contadas por SQL, valor conhecido = receita − custo conhecidos, não apurado ⇔ sem valor, conciliação com a mesma completude | Aprovado |
| Interface (2 testes novos): realizado "Não apurado" sem −custo; competência "no mínimo" e "Não apurado" | Aprovado |
| E2E novo (`fase4-completude.spec.ts`): à vista e parcelada (completo), saída sem receita (no mínimo) na tela, cancelamento da venda, reinício, backup e restauração, conferência | Aprovado |
| Mutações (receita desconhecida ignorada, não apurado virando parcial, limite trocado, descarte sem negociação com receita zero, competência sem desconhecidas, conciliação sem a contagem, ponto de equilíbrio sem o motivo) | Todas detectadas; alterações desfeitas |
| Inspeção visual (Resultado, realizado, Conciliação e Painel; claro e escuro; 1280 e 900 px) | Sem rolagem horizontal da página; texto do bloco Competência atualizado depois da inspeção |
| Teste de volume do estoque (Fase 3) | Falhava às vezes por limite de tempo (20 s) com a suíte inteira em paralelo (cerca de 20,5 s); o limite foi para 60 s, sem mudar o que ele confere. Depois disso, a suíte passou duas vezes seguidas |
| Suíte completa | 802 testes de unidade e integração em 70 arquivos (inclusive migrations do zero e da versão anterior, backup e restauração); 19 testes E2E; tipos, formatação e build aprovados; lint sem erros (2 avisos antigos) |

## 21. Fase 4: devolução de animais (2026-10-21)

Desenho aprovado pelo usuário em 2026-10-18: opção A para a venda devolvida (retorno na data da devolução, sem reconstruir o passado) e para o resultado (efeitos na data da devolução); reembolso com compensação do que estava em aberto; devolução ao fornecedor como operação de devolução de compra, sem recriar a tabela de animais. **Migration 0011** (`0011_devolucao_animais.sql`). Os ajustes anteriores estão no commit `4c213d4`. A materialização de resultados continua não autorizada e não foi feita.

### 21.1 O que foi entregue

- **Devolução como operação própria**, vinculada à negociação original (que fica preservada, com itens, saída e lançamento): tabelas `devolucao_animal` e `devolucao_animal_item`, um animal por item, **no máximo uma devolução ativa por item da negociação** (índice único parcial e conferência no serviço). Devolução parcial de negociação coletiva: escolhem-se os animais.
- **Venda devolvida pelo comprador:** cada animal volta ao rebanho na data da devolução por uma **nova entrada** (lote escolhido ou sem lote); a venda e a saída continuam no histórico. O período fora do rebanho não pertence a nenhum lote (a reconstrução de permanências passou a aceitar "saída → entrada") e **fica bloqueado** para pesagem, consumo de estoque, registro sanitário, lançamento ao animal e custo anterior. O animal devolvido pode ser vendido de novo (o índice único de "um item de venda ativo por animal" da 0006 virou gatilho que ignora os itens devolvidos).
- **Compra devolvida ao fornecedor:** o animal sai do rebanho na data, pelo fluxo de saída (com as conferências de fatos posteriores). O status técnico do animal é "vendido" (para não recriar a tabela de animais), mas a saída é identificada como **"Devolvido ao fornecedor"** no resultado, nos indicadores e nos relatórios, e o motivo da saída diz "Devolução ao fornecedor".
- **Valor acordado** informado pelo usuário por animal; a tela mostra o valor original como sugestão e só o usa se o usuário clicar em "Usar o valor original". A prévia mostra o valor acordado, o original, a diferença, o que está em aberto e o que já foi liquidado na negociação original, o que será compensado e o restante.
- **Financeiro, sem pagamento fictício:** o valor acordado vira um lançamento do tipo `devolucao` ligado ao lançamento original (venda devolvida: natureza despesa, categoria "Devolução de venda de animais"; compra devolvida: natureza receita, "Devolução de compra de animais"). O que ainda estava em aberto na negociação original é liquidado por **compensação** (`compensacao_financeira`), a partir das parcelas de vencimento mais tarde, **sem caixa**; só o restante fica a pagar (reembolso ao comprador) ou a receber (valor a recuperar do fornecedor), à vista, parcelado ou a definir (a definir só quando nada foi compensado). Exemplo do usuário: venda de R$ 3.000,00 com R$ 1.000,00 recebidos e devolução integral → R$ 2.000,00 compensados e R$ 1.000,00 a reembolsar; a saída de caixa só existe quando o reembolso é pago. Pago, compensado e em aberto são números separados em toda a tela (parcela "Compensada"; lançamento "Liquidado com compensação", nunca "Recebido" ou "Pago").
- **Resultado (efeitos na data da devolução):** venda devolvida deduz a receita (devoluções de venda, nunca receita positiva) e estorna a baixa da aquisição do animal, que volta a ser ativo com o custo que tinha na saída; a venda original continua no resultado do seu período. Compra devolvida: o valor recuperado entra como "recuperado em devoluções a fornecedor" (não é venda de animais) contra a baixa da aquisição; a diferença aparece como diferença econômica, fora dos totais de venda. Realizado: blocos "Devoluções de venda" (receita original, valor devolvido, custo que volta, efeito) e "Devoluções ao fornecedor". Ponto de equilíbrio indisponível com devolução de venda no período.
- **Cancelamento e correção:** cancelar a devolução exige estornar antes os pagamentos do reembolso (ou recebimentos do valor recuperado) e recusa se o animal tiver fato depois do retorno; desfaz o retorno (ou a saída), as compensações e o lançamento; nada é apagado. A correção é cancelar e registrar de novo. A negociação original não pode ser cancelada com devolução ativa, e o "desfazer saída" genérico do rebanho não desfaz a saída de uma devolução ao fornecedor.
- **Relatórios (4H):** resultado com venda bruta, devoluções deduzidas, venda líquida e recuperado; tabelas das devoluções; lançamentos com a coluna "Compensado (sem caixa)"; conferência com a verificação "Devoluções e compensações".
- **Trilha:** entidade `devolucao_animal` (criação e cancelamento) e ações `retorno` e `reversao_retorno` do animal.
- **4 canais IPC novos**: `devolucao:prever`, `devolucao:registrar`, `devolucao:obter`, `devolucao:cancelar`.

### 21.2 Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| Domínio: plano de compensação (exemplo do usuário, parcial, sem nada a compensar, propriedade com 1.000 casos), conferência contra a alocação original, saldo e situação com compensação, estorno no resultado; reconstrução de permanências com retorno (mesmo dia e dias diferentes; casos inconsistentes) | Aprovado |
| Migration 0011 (4 testes): do zero; da versão 10 com dados, tabelas antigas idênticas por hash; categoria do usuário de mesmo nome não trava (a do sistema recebe "(sistema)"); falha no passo final desfaz tudo; gatilhos (segunda venda vigente recusada sem devolução e aceita depois; devolução duplicada; nada apagado; original e parcela compensada protegidas; desfazer devolução com outra venda vigente recusado) | Aprovado |
| Serviço e IPC (`devolucao.test.ts`, 10 testes, valores à mão): exemplo do usuário (compensa R$ 2.000,00, reembolso R$ 1.000,00, caixa só no pagamento, contas a receber sem as parcelas compensadas); devolução parcial de venda coletiva com valor diferente do original, revenda e resultado à mão (R$ 600,00 e depois R$ 1.300,00); período fora do rebanho bloqueado e sem custo de lote; reembolso parcelado, cancelamento que exige estorno, correção; cancelamento recusado com pesagem depois do retorno; devolução ao fornecedor com compensação, diferença econômica fora dos totais e cancelamento; compra já paga com valor a recuperar; datas e animais inválidos e condição original não definida; requisição repetida; relatórios | Aprovado |
| Conferências independentes ampliadas (usadas em todos os testes financeiros e nas sequências): pago + compensado + em aberto = valor da operação; pago + compensado ≤ parcela; compensações só entre parcelas ativas certas; parte compensada = parcela 1 sem pagamento; devolução ⇔ lançamento; movimentação da devolução ativa e do tipo certo; receita líquida e custo líquido do resultado por SQL; animal ativo ⇔ última movimentação é entrada | Aprovado |
| Sequências aleatórias (3 sementes × 40 sequências de até 25 passos) com devolução e cancelamento de devolução entre os passos, conferência de caixa e de resultado no fim | Aprovado; **acharam um defeito** (o desfazer saída genérico desfazia a saída de uma devolução ao fornecedor), corrigido e coberto por teste de regressão |
| Mutações (compensação zerada, estorno ignorado, devolução como receita positiva, contas em aberto ignorando o compensado, ausência nunca detectada, condição original indefinida aceita, recuperado como venda) | Todas detectadas (a quarta só depois de uma asserção nova); alterações desfeitas |
| Interface (3 testes novos): valor original só como sugestão, prévia antes de registrar, restante com condição (sem "a definir" quando há compensação); lista de devoluções com compensado e restante; "Liquidado com compensação" e sem "Cancelar venda" com devolução ativa | Aprovado |
| E2E (`fase4-devolucao.spec.ts`): venda parcialmente recebida devolvida pela tela, devolução ao fornecedor, cancelamento pela tela, conferência, reinício, backup e restauração, 900 px, console sem erros | Aprovado |
| Inspeção visual (negociação com devoluções, formulário com prévia, lançamento com compensado, Resultado com os blocos de devolução; claro e escuro; 1280 e 900 px) | Sem rolagem horizontal da página; depois da inspeção, o selo "Recebido" de uma venda quitada por compensação passou a "Liquidado com compensação" e o botão "Cancelar venda" some com devolução ativa |
| Volume na escala da meta | Sem piora: resultado frio 454 ms, quente 115 ms (antes 435 a 466 e 120) |
| Suíte completa | 827 testes de unidade e integração em 73 arquivos; 20 testes E2E; tipos, formatação e build aprovados; lint sem erros (2 avisos antigos) |

### 21.3 Decisões técnicas (ARQUITETURA.md, seção 12, D118 a D125)

Compensação como registro próprio (não pagamento) em vez de reduzir o total da negociação, que é imutável; ordem de compensação pelas parcelas de vencimento mais tarde; retorno pela movimentação `entrada` (sem recriar `movimentacao_animal`); status técnico "vendido" na devolução ao fornecedor com a distinção pela ligação da saída; estorno da baixa só da parte capitalizada (aquisição, custo anterior e acessórios), que é o que foi baixado na venda; devolução de negociação com condição de pagamento indefinida é recusada até a condição ser definida.

### 21.4 Limitações conhecidas

- No rebanho, o animal devolvido ao fornecedor aparece com o status "Vendido" (o motivo da saída diz "Devolução ao fornecedor"); no Financeiro, no resultado, nos indicadores e nos relatórios ele é "Devolvido ao fornecedor".
- Os indicadores por @ usam as vendas do período como registradas; devoluções de venda no período são contadas e informadas, não descontadas deles.
- Cancelar uma devolução ao fornecedor devolve o animal ao lote de origem; se esse lote estiver encerrado, o cancelamento é recusado com a orientação (reabrir o lote antes).
- Reembolso maior que o recebido, ou valor a recuperar maior que o pago, é aceito com aviso (é o acordo informado pelo usuário).
- A primeira consulta de resultado depois de uma alteração, na escala máxima, continua acima de 300 ms (seção 20.2).

## 22. Fase 5A: estrutura do banco de alimentos (a partir de 2026-10-21)

Plano e decisões em [PLANO_FASE_5.md](PLANO_FASE_5.md) (commit `18ada89`). Autorizadas as entregas 5A-1 a 5A-5, em sequência, com um commit por entrega; 5B, 5C e 5D não começam sem o portão e a autorização. Decisões técnicas em ARQUITETURA.md, seção 13.

### 22.1 Entrega 5A-1: domínio puro

- `packages/domain/src/alimentos/`: vocabulário (origens, formas de conservação, classes, grupos, bases, tipos de valor, status, separador decimal); **número publicado** (`lerNumeroPublicado`: texto preservado, casas decimais, separador decimal da fonte, recusa de "<0,01", "ND" e "traços"); **unidades** (%, g/kg, mg/kg, ppm, Mcal/kg, UI/kg), faixas pela definição da unidade e conversões explícitas só dentro da fração mássica; **fluxo de conferência** (cinco status, seis pares permitidos); regras por origem (página ou tabela, data da amostra, garantias só em rótulo e na base MN, medição própria só matéria seca); direção conservadora pela regra 5.4; equivalência de definições só por identidade; **catálogo inicial de 11 definições** sem método e pendentes de fundamentação.
- Sem migration, sem tela, sem canal IPC.
- Verificações: `alimentos.test.ts` (20 testes: leitura do número publicado com 500 casos de ida e volta, conversões com 300 × 16 idas e voltas, faixas, fluxo, regras por origem, catálogo); suíte completa com 847 testes em 74 arquivos; tipos e lint do domínio sem erros.

### 22.2 Entrega 5A-2: migration 0012, fontes, definições e alimentos

- **Migration 0012** (`0012_banco_alimentos.sql`): tabelas `fonte`, `nutriente`, `alimento`, `registro_composicao`, `valor_nutricional`, `estoque_item_alimento` e o catálogo inicial de 11 definições (BANCO_DE_DADOS.md, seção 19).
- `RepositorioAlimentos`, `ServicoAlimentos` e **13 canais IPC**: `fonte:listar|obter|criar|atualizar|excluir`, `nutriente:listar|criar|atualizar`, `alimento:listar|obter|criar|atualizar|excluir`. Exigências da fonte por origem no domínio (`problemasDaFonte`), validadas no renderer e no main. Fontes de laudo e medição só aparecem na propriedade a que pertencem.
- Trilha com as entidades e ações novas.
- Verificações: `alimentos-schema.test.ts` (11 testes: do zero e reaplicação; catálogo igual ao do domínio; migration sem semear fonte, alimento, registro ou valor; versão 11 com dados intacta por hash; falha no passo final desfaz tudo; gatilhos de fonte, definição, alimento, registro, valor e vínculo); `alimentos.test.ts` (13 testes de serviço e IPC, inclusive reinício e backup com restauração); testes que fixam a versão do schema atualizados (`registrar-ipc.test.ts` e E2E da Fase 0). Suíte: 870 testes em 76 arquivos; E2E da Fase 0 (4) aprovado com schema 12; tipos, formatação e lint sem erros (2 avisos antigos).

### 22.3 Entrega 5A-3: registros de composição, valores e conferência

- `RepositorioComposicao`, `ServicoComposicao` e **13 canais IPC** `composicao:*` (listar, obter, criar, atualizar, salvarValor, removerValor, transcrever, devolver, conferir, rejeitar, reabrir, novaVersao, descartar). `alimento:obter` passou a trazer os registros, com escopo de propriedade (laudos e medições só na propriedade dona).
- **Valor como publicado**: o renderer envia o texto; o main deriva o número com o separador decimal do registro (`lerNumeroPublicado`) e confere faixa, grandeza, tipo, base e origem (`problemasDoValor`) antes do banco. Trocar o separador relê todos os textos; se um não ler, nada muda. Remoção de valor é lógica.
- **Fluxo**: transcrever (exige ao menos um valor), devolver (com motivo), rejeitar (com responsável e motivo), reabrir, conferir (com responsável; aviso de mesma pessoa). **Nova versão** só do conferido vigente e sem outra em aberto: copia cabeçalho e valores para um rascunho; ao ser conferida, a anterior passa a substituída na mesma transação, com trilha `substituicao` e o motivo. A conferência mostra as diferenças em relação à versão anterior (cabeçalho e cada valor como publicado). Descarte lógico só antes da conferência.
- Verificações: `composicao.test.ts` (15 testes: exigências do cabeçalho por origem; texto, precisão e unidade preservados; recusas de "ND", "<0,01", "traços", faixa, grandeza, garantia fora de rótulo e duplicado; outra base aceita; ausente sem linha; troca de separador com releitura e recusa integral; fluxo completo com trilha; conferido imutável por todos os canais; nova versão com diferenças e substituição; versão descartada; fila de conferência e isolamento por propriedade; exclusão de fonte e alimento só depois do descarte; definição com valores congelada; medição própria só MS). Suíte: 885 testes em 77 arquivos; tipos e lint sem erros.
- **Ocorrência**: uma execução da suíte completa teve 1 falha intermitente que não se repetiu em três execuções seguintes e cuja saída não foi guardada. A causa provável estava nos testes novos: com o relógio fixo, definições criadas no mesmo milissegundo tinham ordem de UUID aleatória. As consultas do banco de alimentos passaram a desempatar por ordem de inserção (`rowid`); depois disso, 15 repetições dos testes do módulo e a suíte completa passaram.

### 22.4 Entrega 5A-4: rótulo comercial, laudo e MS medida

- `ServicoAtalhosAlimentos` e **3 canais IPC**: `rotulo:registrar` (alimento comercial novo ou existente, fonte de rótulo com fabricante e registro do produto, garantias mínimas e máximas na base MN), `laudo:registrar` (fonte laboratorial da propriedade, data e identificação da amostra, valores únicos com o método informado no laudo) e `medicaoMs:registrar` (método e limitações descritos pelo usuário, reaproveitáveis na mesma propriedade; valor em % da matéria natural; só definições de matéria seca). Cada atalho grava fonte, registro e valores numa transação, pelos mesmos serviços do cadastro manual; o registro nasce em rascunho e passa pela conferência.
- `composicao:listar` ganhou o filtro por origem.
- Verificações: `atalhos.test.ts` (6 testes: rótulo com alimento novo forçado a comercial, fluxo de conferência e segundo rótulo do mesmo produto; erro em uma garantia desfaz tudo; alimento não comercial, garantia repetida e escolha ambígua recusados; laudo isolado na propriedade, inclusive na ficha do alimento; laudo com valor inválido ou propriedade inexistente desfeito; MS medida com método reaproveitado, só matéria seca, método de outra propriedade recusado e faixa conferida). Suíte: 891 testes em 78 arquivos; tipos, formatação e lint sem erros.

### 22.5 Entrega 5A-5: telas, vínculo com estoque e fechamento

- **Módulo "Banco de alimentos"** no menu (deixou de ser módulo planejado), com abas: **Alimentos** (busca por nome, espécie e cultivar; filtros de forma e classe), **ficha do alimento** (identidade, itens de estoque vinculados, registros separados por origem com o aviso de cada uma, valores e a lista "Não informado pela fonte"), **registro de composição** (fonte e condições, valores como publicados com unidade e base juntas, botões do fluxo, versões, diferenças da versão anterior e histórico), **Conferência** (fila dos transcritos, com a página ou tabela para reler; o modal de conferência mostra os valores e as diferenças), **Fontes**, **Nutrientes** (definições com "Método pendente de fundamentação"), **Produtos comerciais** (atalho do rótulo) e **Laudos e MS medida** (por propriedade). Textos em `textos-alimentos.ts`.
- Formulário de valor mostra na hora como o número digitado será lido ("Lido como 12,5 (2 casas decimais)") ou por que é recusado.
- **Vínculo com o estoque**: canais `vinculoAlimento:obter` e `vinculoAlimento:definir`; o item de estoque de alimentação ganhou o cartão "Alimento no banco"; a ficha do alimento lista os itens vinculados. O vínculo não cria movimento, lançamento nem composição (teste).
- Correções vindas da inspeção visual e dos testes de interface: plural "casas decimais" na leitura do número; código da unidade ("pct") trocado pelo símbolo nas diferenças entre versões; ações do histórico com rótulo em português; modal de conferência mais largo e com as diferenças.
- Verificações: `vinculo-estoque.test.ts` (2); `alimentos.test.tsx` (5 testes de interface: valor com unidade e base, ausente explicado, conferido sem edição e com nova versão, aviso de mesma pessoa, avisos fixos de rótulo e de medição própria, leitura do número na hora, catálogo pendente); E2E `fase5a.spec.ts` (2: fonte, alimento, registro, valor, transcrição, conferência pela fila, recusa de alteração do conferido também pela API, nova versão, reinício, backup e restauração, 900 px sem rolagem horizontal, console sem erros; rótulo pela tela, MS medida e laudo isolados na propriedade, vínculo com o estoque pela tela). Inspeção visual de 10 telas em claro e escuro, a 1280 e 900 px, mais o modal de conferência: sem rolagem horizontal da página (tabelas largas rolam dentro do próprio quadro). Suíte completa (`npm run verify`): 898 testes em 80 arquivos, 22 testes E2E, tipos e formatação aprovados, lint sem erros (2 avisos antigos).

### 22.6 Fechamento da etapa 5A (2026-10-21)

**Commits:** plano `18ada89`; 5A-1 `0e595ec`; 5A-2 `56c1cae`; 5A-3 `b91fb5a`; 5A-4 `50c08e5`; 5A-5 (este commit). **Migration:** só a 0012 (`0012_banco_alimentos.sql`). **Canais IPC novos:** 31.

**Limitações conhecidas:**
- Nenhum dado de referência: o banco começa só com as 11 definições, todas com método pendente de fundamentação. Composição real só entra pela 5B e 5C.
- Valores censurados ou qualitativos ("<0,01", "ND", "traços") não são aceitos como número: o nutriente fica ausente e a observação do registro pode citar o que a fonte diz.
- Energia (Mcal/kg) e UI/kg não têm conversão definida; % ↔ g/kg ↔ mg/kg ↔ ppm têm. Conversão MN ↔ MS fica para a Fase 6.
- Nada usa os registros em cálculo ainda (Fase 6); seleção, perfis e cenários são da 5D.
- Sem anexo de laudo ou foto de rótulo (D5-7).
- A tela de fonte mostra, para medição própria e laudo, campos bibliográficos vazios no detalhe do registro ("—").

**Pendências que dependem do usuário:** acesso e termos do CQBAL 4.0 e lista dos alimentos usados (5B); arquivos das publicações da Embrapa (5C); métodos analíticos das definições a partir dessas publicações; direção conservadora de MO, MM e EE (5D); regra de agregação (5D). Continua pendente, da Fase 4, a decisão sobre materializar agregados do resultado.

**Como testar manualmente:** Banco de alimentos → Fontes → Nova fonte (estudo individual, código, autores, ano) → Alimentos → Novo alimento → abrir o alimento → Novo registro (escolher a fonte, página) → Novo valor (ex.: "12,50", %, MS, média; conferir o "Lido como") → Marcar como transcrito → Conferência → abrir → Conferir → tentar editar (botões somem) → Nova versão → alterar → transcrever e conferir (a anterior vira "Substituído"). Produtos comerciais → Novo produto pelo rótulo. Laudos e MS medida → Novo laudo e Nova MS medida (aparecem só na propriedade atual). Estoque → item de silagem → "Alimento no banco". Fazer backup, alterar algo e restaurar.

**5B, 5C e 5D não foram iniciadas.** O `referencias/BR-CORTE.pdf` não foi aberto.

## 23. Fase 5B: curadoria do CQBAL 4.0 (a partir de 2026-10-21)

Autorizada pelo usuário em 2026-10-21, na aprovação da 5A, com estas condições: valores como "<0,01", "ND" e traços preservados sem virar número (antes de popular composições); conversões só entre unidades e bases compatíveis; falha intermitente mantida em acompanhamento; verificar acesso, estrutura e condições de reutilização antes de importar ("acesso gratuito não é autorização para cópia em massa"); prioridade para silagem de milho, Capiaçu, milho, farelo de soja e pastagens; nada inventado e rastreabilidade por nutriente; um commit por entrega; sem 5C nem 5D. Decisões técnicas em ARQUITETURA.md, seção 14.

### 23.1 Entrega 5B-1: valores não quantificados

- **Migration 0013** (`0013_valores_nao_quantificados.sql`): tabela `valor_nao_quantificado`, sem coluna numérica (BANCO_DE_DADOS.md, seção 20). Texto como publicado, natureza escolhida pela legenda da fonte, significado segundo a fonte obrigatório, unidade, base e tipo da coluna. Número e não quantificado nunca coexistem para o mesmo nutriente, tipo e base. Dois gatilhos da 0012 substituídos para contar os dois tipos (transcrição e definição congelada).
- Domínio (`valor-nao-quantificado.ts`): `problemasDoNaoQuantificado` recusa texto que é número, símbolo de limite trocado ou ausente, significado vazio, unidade de outra grandeza, origem que não publica (rótulo, medição própria) e tipo de valor da origem. O limite de "<0,01" só é conferido como legível com o separador da fonte; não vira número.
- Serviço e **2 canais IPC** (`composicao:salvarNaoQuantificado`, `composicao:removerNaoQuantificado`); `composicao:obter` traz `valoresNaoQuantificados`; nova versão copia; diferenças entre versões incluem; troca de separador relê o limite; trilha no registro.
- Tela: botão "Valor não quantificado" (só tabela, estudo e laudo), formulário que confere o texto na hora ("Será gravado como texto, sem número" ou o motivo da recusa), tabela própria com o significado da fonte, também no modal de conferência e na ficha do alimento; o nutriente com valor não quantificado não aparece em "Não informado pela fonte".
- A mensagem do número publicado deixou de mandar "deixar o nutriente ausente" para "<0,01", "ND" e traços.
- Correção posterior ao commit da entrega (achada ao começar a 5B-2): a contagem de valores da definição (`nValores`) passou a incluir os não quantificados. Antes, o serviço deixava passar a mudança de unidade e só o gatilho do banco recusava, com a mensagem genérica. Teste novo em `nao-quantificado.test.ts` (5 no total).
- **Acompanhamento da falha intermitente da 5A-3** (seção 22.3): continua **aberta**. A causa provável (ordem de UUID no mesmo milissegundo) foi mitigada, mas **não foi comprovada**, porque a saída daquela execução se perdeu. Para a próxima ocorrência não se perder, o Vitest passou a acrescentar cada teste falho em `test-results/falhas-vitest.jsonl` (ignorado pelo git), com data, arquivo, nome e mensagem (D147). Toda execução completa nesta fase confere esse arquivo.
- Verificações: `valor-nao-quantificado.test.ts` do domínio (6), `valores-nao-quantificados-schema.test.ts` (7: do zero e reaplicação, sem coluna REAL, arquivo sem INSERT, versão 12 com dados intacta por hash, falha no passo final desfaz inclusive os gatilhos substituídos, CHECKs e exclusividade com o número, origem, rascunho, transcrição e definição congelada), `nao-quantificado.test.ts` do serviço (4), `alimentos.test.tsx` (+2 de interface). Registrador conferido com um teste falho temporário, depois apagado. Suíte completa: 917 testes em 83 arquivos aprovados (a primeira execução teve 1 falha determinística, a lista de migrations do teste de IPC, que o registrador capturou; corrigida). E2E da Fase 0 (4, com schema 13 e a lista de migrations atualizada) e da 5A (2) aprovados; tipos, formatação e lint sem erros (2 avisos antigos).

### 23.2 Entrega 5B-2: portão do CQBAL 4.0 e importação de curadoria

- **Portão verificado** (PLANO_FASE_5.md, seção 11). O acesso é público e sem login, os relatórios são por derivado e a citação é a indicada pelo site. **Não há termos de uso nem licença publicados.** Decisão provisória, sujeita à aprovação do usuário: curadoria restrita aos alimentos priorizados e às definições do catálogo, sem cópia em massa nem redistribuição, para uso pessoal no aplicativo local, com citação e data de consulta em cada registro, e a recomendação de pedir confirmação aos autores antes de ampliar. A coluna "S" do relatório ("se" em inglês) não tem definição: não vira desvio-padrão. Os nutrientes **estimados** por equação não são importados.
- **Migration 0014** (`0014_curadoria.sql`): tabela `importacao_curadoria` (uma por pacote e versão, imutável, com os ids criados) e a definição **FDNcp** do sistema, variante própria da FDN, com método pendente (BANCO_DE_DADOS.md, seção 21).
- Domínio: `PacoteCuradoria` e `problemasDoPacote` (número como publicado com o separador da fonte, faixa da unidade, definição existente no catálogo, sem valores repetidos, alimento e referência coerentes, fonte bibliográfica válida); `DEFINICOES_CURADORIA_5B` e `DEFINICOES_DO_SISTEMA`; registro `PACOTES_CURADORIA`, vazio nesta entrega.
- `ServicoCuradoria` e **2 canais IPC** (`curadoria:listar`, `curadoria:importar`). Importar grava fonte, alimentos, registros e valores pelos mesmos serviços do cadastro manual, numa transação, e deixa cada registro **transcrito** em nome de quem transcreveu o pacote. A conferência é do usuário. Fonte de mesmo código e origem é reaproveitada; alimento de mesmo nome só com a mesma identidade; a segunda importação é recusada; qualquer erro desfaz tudo.
- Tela: quadro "Curadorias incluídas no sistema" na aba Fontes, com a citação, a data de consulta, as contagens, a lista de alimentos e o botão "Importar para conferência", que pede confirmação. Depois da importação, o quadro leva à aba Conferência. O quadro só aparece quando há pacote.
- Verificações: `pacote-curadoria.test.ts` (6), `curadoria-schema.test.ts` (5: do zero, catálogo igual às definições do sistema, arquivo só insere a definição, versão 13 com dados intacta por hash fora do catálogo, falha no passo final desfaz, importação única e imutável), `curadoria.test.ts` de serviço e IPC com pacote fictício (6: nada sem ação, criação com texto publicado e trilha, recusa da segunda importação também após reinício, conferência e rejeição pelo fluxo normal, reaproveitamento, recusas que desfazem tudo), interface (+1). Os testes da 5A que fixavam 11 definições passaram a usar o catálogo do sistema; listas de migrations do teste de IPC e do E2E da Fase 0 atualizadas (schema 14). Suíte completa: 936 testes em 86 arquivos. A primeira execução teve 2 falhas determinísticas, as 11 definições fixadas nos testes da 5A, que o registrador capturou; foram corrigidas e o arquivo foi reexecutado. E2E da Fase 0 (4) e da 5A (2) aprovados; tipos, formatação e lint sem erros (2 avisos antigos).

### 23.3 Entrega 5B-3: pacote CQBAL 4.0

- **Pacote `CQBAL_4_0_5B`, versão 1** (`packages/domain/src/alimentos/pacotes/cqbal-4-0.ts`): 12 alimentos, 18 registros e 194 valores, **gerado por script** a partir dos relatórios completos consultados em www.cqbal.com.br em 2026-10-21, sem digitação manual. Cada média está como o site a exibe (o código da página formata com duas casas e ponto decimal) e traz o n do nutriente. Unidade %, tipo "média", base MS, exceto a MS, gravada na base MN. A observação de cada valor tem o código, o nome e a unidade do nutriente no CQBAL e a coluna "S" como texto, com o aviso de que a fonte não a define. Na referência de cada registro estão o derivado e o seu código (ex.: "Relatório completo do derivado MILHO SILAGEM (código 52)"). Nas observações estão o caminho no site e a data de consulta.
- **Regras da geração**: o script para se um nutriente aparecer duas vezes no relatório, se uma média tiver mais de duas casas ou se um n for inválido. Nenhuma dessas situações ocorreu. Nutriente ausente no relatório fica sem linha. Nenhum valor foi escolhido, agregado ou completado.
- **Conferência independente antes do commit**: um segundo script leu o arquivo gerado e comparou cada valor com a resposta bruta do site. Foram 194 de 194 iguais em média, n e coluna "S", e a presença e a ausência de cada nutriente batem.
- **Achados registrados nos próprios registros** (notas de curadoria): Capiaçu 50, 70 e 110 dias repete MM, EE e Ca (e a FDA de 70 e 110 dias) com n = 1; o derivado "CAPIM BRS. CAPIAÇU SILAGEM 120 DIAS" (2448) estava vazio; a silagem de Capiaçu traz CZ (cinzas), não MM. Fora do pacote, o relatório do farelo de soja traz CZ (valor omitido na versão pública: dado restrito a uso pessoal) com n = 1, um erro evidente de cadastro da fonte (CZ não é importado). Isso reforça a conferência no site.
- **Idade de corte**: os derivados do Capiaçu verde se chamam "CAPIM BRS. CAPIAÇU 50 DIAS" etc. O nome foi gravado em "classe de idade da fonte", e o campo `idade_corte_dias` ficou **vazio**: o site não diz que esses dias são idade de corte (na silagem, "120 DIAS SILAGEM" poderia ser outra coisa). Se o usuário confirmar, vira a versão 2 do pacote antes de importar.
- O registro `PACOTES_CURADORIA` passou a conter o pacote; o quadro da aba Fontes o mostra. **Nada foi importado em nenhum banco real**: a importação é do usuário.
- Tela: a tabela de valores ganhou a coluna "Observação", onde aparece o rótulo do nutriente na fonte. Rótulos curtos para a natureza do não quantificado; o seletor passou a se chamar "Natureza (pela legenda da fonte)", para não se confundir com o texto do significado. A citação no quadro não repete mais o ponto de "et al.".
- Verificações: `curadoria-cqbal.test.ts` (3: o pacote embutido não entra sem ação; regras da curadoria valor a valor, só definições do catálogo, derivados distintos; importação real com 12 alimentos, 18 registros transcritos pela curadoria, cada valor gravado igual ao pacote, desvio-padrão sempre vazio, fila de conferência com 18 e nenhum conferido); `pacote-curadoria.test.ts` confere o pacote real contra o catálogo do sistema. E2E `fase5b.spec.ts` (2: quadro sem importação, importação pela tela com confirmação, fila de 18, registro da silagem de milho com 12 valores e MS na MN, conferência por outra pessoa sem aviso, 900 px sem rolagem horizontal, segunda importação recusada; valor não quantificado pela tela com recusa do número, conferência e ficha). Inspeção visual das telas novas (Fontes antes e depois da importação, modal de importação, Conferência, registro do Capiaçu, laudo com não quantificado, modal do não quantificado) em claro e escuro, a 1280 e 900 px: sem rolagem horizontal da página e console sem erros. **`npm run verify` completo: 939 testes em 87 arquivos, 24 E2E, tipos sem erros, lint sem erros (2 avisos antigos).**

### 23.4 Fechamento da etapa 5B (2026-10-21)

**Commits:** 5B-1 `76b9e2f` e correção `7e69b5f`; 5B-2 `57dab74`; 5B-3 (este commit). **Migrations:** 0013 (`valores_nao_quantificados`) e 0014 (`curadoria`). Próxima: 0015. **Canais IPC novos:** 4.

**Alimentos do pacote** (todos com registros "transcritos", à espera da conferência do usuário):

| Alimento no sistema | Derivado no CQBAL (código) | Forma · classe |
|---|---|---|
| Silagem de milho | MILHO SILAGEM (52) | ensilado · volumoso |
| Milho fubá | MILHO FUBÁ (1) | grão (processamento: fubá) · concentrado energético |
| Farelo de soja | SOJA FARELO (4) | farelo · concentrado proteico |
| Capim BRS Capiaçu verde | CAPIM BRS. CAPIAÇU 50, 60, 70, 90, 110, 120 e 150 DIAS (2534, 2530, 2535, 2533, 2536, 2532, 2531) | fresco · volumoso |
| Silagem de capim BRS Capiaçu | CAPIM BRS. CAPIAÇU 120 DIAS SILAGEM (2537) | ensilado · volumoso |
| Capim braquiária brizantha Marandu | CAPIM BRAQUIÁRIA BRIZANTHA MARANDU (1370), cadastrado no CQBAL sob "CAPIM BRAQUIARIA DECUMBENS" | fresco · pastagem |
| Capim braquiária decumbens | CAPIM BRAQUIÁRIA DECUMBENS (245) | fresco · pastagem |
| Capim Mombaça | CAPIM MOMBAÇA (875) | fresco · pastagem |
| Capim Tanzânia | CAPIM TANZÂNIA (779) | fresco · pastagem |
| Cana-de-açúcar verde | CANA-DE-AÇÚCAR (90) | fresco · volumoso |
| Silagem de sorgo | SORGO SILAGEM (887) | ensilado · volumoso |
| Caroço de algodão | ALGODÃO CAROÇO (157) | outro (parte: caroço) · concentrado proteico |

**Cobertura nutricional** (n de observações informado pelo CQBAL; "—" = a fonte não traz, sem linha no banco):

| Alimento (registro) | MS | MO | MM | PB | EE | FDN | FDNcp | FDA | LIG | NDT | Ca | P |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Silagem de milho [52] | n 459 | n 281 | n 178 | n 433 | n 321 | n 333 | n 156 | n 243 | n 195 | n 58 | n 76 | n 80 |
| Milho fubá [1] | n 884 | n 393 | n 406 | n 945 | n 642 | n 463 | n 204 | n 450 | n 122 | n 82 | n 272 | n 270 |
| Farelo de soja [4] | n 718 | n 277 | n 423 | n 721 | n 504 | n 327 | n 84 | n 269 | n 103 | n 68 | n 326 | n 298 |
| Capim BRS Capiaçu verde (50 DIAS) [2534] | n 2 | — | n 1 | n 2 | n 1 | n 2 | — | n 1 | n 2 | n 2 | n 1 | — |
| Capim BRS Capiaçu verde (60 DIAS) [2530] | n 10 | n 10 | n 10 | n 10 | n 10 | n 10 | n 10 | n 10 | n 10 | n 10 | — | — |
| Capim BRS Capiaçu verde (70 DIAS) [2535] | n 1 | — | n 1 | n 1 | n 1 | n 1 | — | n 1 | n 1 | n 1 | n 1 | — |
| Capim BRS Capiaçu verde (90 DIAS) [2533] | n 9 | n 8 | n 9 | n 9 | n 9 | n 9 | n 8 | n 9 | n 9 | n 9 | n 1 | — |
| Capim BRS Capiaçu verde (110 DIAS) [2536] | n 1 | — | n 1 | n 1 | n 1 | n 1 | — | n 1 | n 1 | n 1 | n 1 | — |
| Capim BRS Capiaçu verde (120 DIAS) [2532] | n 2 | n 1 | n 2 | n 2 | n 2 | n 2 | n 2 | n 2 | n 2 | n 2 | — | — |
| Capim BRS Capiaçu verde (150 DIAS) [2531] | n 2 | n 2 | n 2 | n 2 | n 2 | n 2 | n 2 | n 2 | n 2 | n 2 | — | — |
| Silagem de capim BRS Capiaçu (120 DIAS SILAGEM) [2537] | n 1 | — | — | n 1 | n 1 | n 1 | — | n 1 | n 1 | — | — | — |
| Capim braquiária brizantha Marandu [1370] | n 19 | n 10 | n 16 | n 60 | n 14 | n 51 | n 5 | n 47 | n 16 | n 5 | n 3 | n 3 |
| Capim braquiária decumbens [245] | n 22 | n 21 | n 16 | n 38 | n 22 | n 26 | n 9 | n 19 | n 11 | n 4 | n 3 | n 4 |
| Capim Mombaça [875] | n 10 | n 6 | n 3 | n 19 | n 3 | n 15 | n 3 | n 11 | n 7 | n 2 | n 5 | n 5 |
| Capim Tanzânia [779] | n 20 | n 7 | n 13 | n 40 | n 8 | n 23 | n 3 | n 24 | n 14 | n 4 | n 11 | n 7 |
| Cana-de-açúcar verde [90] | n 265 | n 152 | n 97 | n 236 | n 165 | n 191 | n 110 | n 180 | n 147 | n 11 | n 27 | n 23 |
| Silagem de sorgo [887] | n 146 | n 41 | n 38 | n 144 | n 57 | n 109 | n 10 | n 98 | n 86 | n 26 | n 17 | n 18 |
| Caroço de algodão [157] | n 64 | n 31 | n 38 | n 60 | n 52 | n 41 | n 10 | n 31 | n 20 | n 10 | n 11 | n 13 |
| **Registros com o nutriente (de 18)** | 18 | 14 | 17 | 18 | 18 | 18 | 14 | 18 | 18 | 17 | 14 | 10 |

**Fonte:** VALADARES FILHO, S.C., LOPES, S.A.; SARAIVA,T.D. et al., CQBAL 4.0. Tabelas Brasileiras de Composição de Alimentos para Ruminantes. 2023. Disponível em: www.cqbal.com.br. Consulta de 2026-10-21. Código no sistema: `CQBAL_4_0`, tabela compilada.

**Limitações conhecidas:**
- Os valores são **médias da base on-line**, que muda com o tempo; a referência é a data de consulta. Quem conferir mais tarde pode ver números diferentes no site.
- Nenhum método analítico foi informado pela fonte; todas as definições continuam **pendentes de fundamentação**.
- Fora do catálogo (não importados): CZ, LIG DA, frações de proteína e de carboidrato, digestibilidades, minerais além de Ca e P, ácidos graxos e os nutrientes estimados por equação.
- Pastagens, cana e silagens são médias gerais do derivado, **sem** estação, idade, adubação nem região. A 5D decidirá como usá-las.
- Capiaçu verde: as médias de 50, 70 e 110 dias têm n = 1 e valores repetidos entre idades (notas nos registros).
- A falha intermitente da 5A-3 **continua em acompanhamento**: nenhuma ocorrência nas quatro execuções completas desta fase (as falhas registradas foram determinísticas e corrigidas); a causa original segue não comprovada.

**Decisões que dependem do usuário (antes ou durante a conferência):**
1. **Reutilização do CQBAL** (PLANO_FASE_5.md, seção 11.4): aceitar a curadoria restrita sem termos publicados, ou pedir antes a confirmação dos autores.
2. **MS em "%" gravada na base MN.**
3. **Correspondências**: LIGNINA → LIG; NDT OBS → NDT; MM sem CZ.
4. **Capiaçu verde**: confirmar se "N DIAS" é idade de corte. Se for, a versão 2 do pacote preenche `idade_corte_dias`.
5. **Marandu sem espécie**: o CQBAL o cadastra sob *Urochloa decumbens*; o sistema guardou só a cultivar, tirada do nome do derivado.
6. Continuam abertas: métodos analíticos (5C, com publicações), direção conservadora de MO, MM e EE e regra de agregação (5D), e, da Fase 4, materializar agregados do resultado.

**Como testar manualmente:** Banco de alimentos → Fontes → quadro "CQBAL 4.0: seleção da Fase 5B" → Importar para conferência → Importar → Conferir na aba Conferência → abrir cada registro e comparar com o site (Relatórios → Alimentos → alimento → derivado do código indicado → relatório completo: MÉDIA, N e a coluna "S" da observação) → Conferir ou Rejeitar com motivo. Valor não quantificado: em um registro de laudo em rascunho, "Valor não quantificado", texto "<0,01" e natureza pela legenda.

**5C e 5D não foram iniciadas.** O `referencias/BR-CORTE.pdf` não foi aberto.

### 23.5 Ajustes da aprovação da 5B (2026-10-21)

O usuário aprovou tecnicamente a 5B com decisões que pediram só ajustes no pacote e nos documentos (PLANO_FASE_5.md, seções 11.4 a 11.6).

- **Pacote `CQBAL_4_0_5B`, versão 2**, gerado pelo mesmo script e conferido de novo contra as respostas do site (194 de 194 valores iguais):
  - **Licença**: a observação da fonte registra que o site não tem licença explícita, o uso pessoal autorizado sem redistribuição e a recomendação de consultar os responsáveis antes de distribuir o banco.
  - **MS**: "% da matéria natural" como interpretação técnica aprovada; a unidade original "%" e o aviso de que a base não é explicitada ficam em cada valor.
  - **NDT**: cada valor identifica "NDT OBS", valor observado e não estimado. LIGNINA → LIG aprovado.
  - **MM e CZ**: nomes originais preservados; não somados nem tratados como equivalentes ou independentes até haver fundamentação. CZ continua fora.
  - **Capiaçu**: idade de corte preenchida só onde é inequívoca, 70 e 110 dias, cujos valores são iguais às linhas da Tabela 2 do Comunicado Técnico 79 da Embrapa (2016), lido nesta sessão. O derivado "50 DIAS" é a média das linhas de 50 e 70 dias (provável intervalo 50/70): sem idade e marcado como não independente do de 70 dias. 60, 90, 120 e 150 dias e a silagem ficam só com a classe de idade da fonte.
  - **Dados suspeitos**: os valores repetidos com n = 1 (MM, EE, Ca e FDA entre idades) ficam sinalizados no registro e em cada valor ("não tratar como observação independente sem comprovação"; "Conferir individualmente").
  - **Marandu**: espécie *Urochloa brizantha* cv. Marandu por decisão do usuário, identificação original do CQBAL preservada, divergência sinalizada e **registro bloqueado para importação**.
  - **Farelo de soja**: a cinza anômala (CZ (valor omitido na versão pública: dado restrito a uso pessoal), n = 1) fica registrada como excluída até esclarecimento.
- **Bloqueio de registro de pacote** (D152): o registro fica no pacote e no quadro com o motivo, mas não é importado; alimento só com registros bloqueados não é criado.
- **Versões do mesmo pacote** (D153): se uma versão já foi importada, outra é recusada, para não duplicar registros.
- Quadro da aba Fontes: "Importa 11 alimentos, 17 registros e 182 valores" e o aviso "1 registro bloqueado para importação", com o motivo.
- **Commit da 5B-3 restaurado no histórico**: às 19:08 houve um `git reset` para a 5B-2, fora desta sessão, que tirou o commit `aa02eef` do histórico, mas manteve os arquivos. O conteúdo foi conferido como idêntico ao commit, e o HEAD voltou para `aa02eef` com `git reset aa02eef`, sem alterar arquivos. As correções estão no commit seguinte.
- Verificações: `pacote-curadoria.test.ts` (+1: bloqueio e contagem), `curadoria.test.ts` (+2: registro bloqueado não importado e alimento não criado, resumo com bloqueados; recusa de outra versão), `curadoria-cqbal.test.ts` (+1: decisões da versão 2 valor a valor), interface (aviso de bloqueado), E2E `fase5b.spec.ts` com as contagens novas. **`npm run verify` completo: 943 testes em 87 arquivos, 24 E2E, tipos sem erros, lint sem erros (2 avisos antigos); nenhuma falha registrada em `test-results/falhas-vitest.jsonl`.**

**Estado definitivo da 5B.** O pacote importa **11 alimentos, 17 registros e 182 valores**, todos "transcritos" e à espera da conferência do usuário; 1 registro (Marandu, 12 valores) fica bloqueado. Nada foi importado no banco operacional. Migrations 0013 e 0014; próxima: 0015.

**Pendências para iniciar a 5C:**
1. **Publicações em arquivo**: a 5C só começa com as publicações da Embrapa e os estudos fornecidos (portão do plano). O Comunicado Técnico 79 (2016) já foi localizado e lido para apoiar a idade de corte; a decisão de cadastrá-lo como estudo individual é do usuário.
2. **Dupla contagem**: os registros do CQBAL de 70 e 110 dias, e parte do de 50, são os mesmos dados da Tabela 2 do CT 79. A 5C precisa de uma regra para não somar CQBAL e estudo de origem (decisão já tomada pelo usuário; a forma de marcar o vínculo é da 5C).
3. **Marandu**: conferir a correspondência do derivado do CQBAL antes de desbloquear (publicações da Embrapa ou do Ministério da Agricultura que o usuário indicar).
4. **Métodos analíticos** das definições (FDN, FDNcp, lignina, NDT etc.), a partir das publicações da 5C.
5. **MM e CZ**: fundamentar a correspondência metodológica antes de importar CZ ou equiparar os dois.
6. **Idades sem confirmação** do Capiaçu (60, 90, 120 e 150 dias, e o "50 DIAS"): só preencher com publicação que as identifique.
7. Continuam para a 5D: direção conservadora de MO, MM e EE, e a regra de agregação. Da Fase 4: materializar agregados do resultado.
8. A falha intermitente da 5A-3 continua em acompanhamento, sem ocorrência nas execuções completas desta fase.

## 24. Fase 5C: Embrapa e estudos individuais (a partir de 2026-10-21)

Autorizada pelo usuário em 2026-10-21, depois da aprovação da 5B (commit `4a48345`). Decisões, entregas e o portão das publicações em PLANO_FASE_5.md, seção 12; decisões técnicas em ARQUITETURA.md, seção 15.

Publicações usadas (cópias locais em `referencias/embrapa/`, fora do git; SHA-256):
- Comunicado Técnico 79 (Embrapa Gado de Leite, 2016): `a222c13b3d63f93363cd90fc6e7a61219759cc7daf81f3ad8b94c11cee1c6241`.
- Comunicado Técnico 261 (Embrapa Agropecuária Oeste, 2020): `9cc268e67481aecff97db3bb963dc889ceab76ccf42c78291e61b057dcc7e107`.
- Comunicado Técnico 263 (Embrapa Agropecuária Oeste, 2021): `72e93fb9fc034c30a2dfedabe1cf856d0fbe2a05d2cc646e9e676ae3e2b8fd72`.

### 24.1 Entrega 5C-1: forma de obtenção e vínculos de origem

- **Migration 0015** (`0015_origem_dos_dados.sql`; BANCO_DE_DADOS.md, seção 22):
  - forma de obtenção de cada valor numérico (medido, calculado, estimado por equação, estimado por NIR ou não informado; padrão "não informado") e a descrição da obtenção, obrigatória para cálculo e equação;
  - tabela `vinculo_registro`.
- Domínio (`origem-dados.ts`):
  - `problemasDaObtencao`;
  - `registrosIndependentes`: vinculados a confirmar ou confirmados não são independentes; só o descarte, decidido pelo usuário, devolve a independência. É a regra que a 5D vai usar.
- Pacote de curadoria:
  - cada valor traz o método informado pela fonte, a forma e a descrição da obtenção;
  - o pacote declara vínculos com evidência, para registros de outras fontes identificados pelo código da fonte e pela página ou tabela;
  - a importação cria os vínculos e localiza o outro lado se já estiver no banco; os pendentes, deste ou de pacotes anteriores, são resolvidos quando o outro registro entrar.
- Canal IPC `vinculoOrigem:decidir` (confirmar, ou descartar com motivo; uma vez; com trilha). `composicao:obter` traz os vínculos da cadeia de versões, com o outro lado na versão mais nova.
- Tela:
  - a tabela de valores mostra "Obtenção" sob o método; o formulário do valor tem a forma de obtenção e a descrição;
  - o registro tem a seção "Possível mesma origem experimental", com a relação lida do ponto de vista do registro, a evidência, o outro registro (ou "ainda não importado"), a situação e os botões Confirmar e Descartar, só quando o outro lado existe.
- **Pacote CQBAL versão 3**: só acrescenta a forma de obtenção.
  - Os valores, reconferidos contra o site (194 de 194), não mudaram.
  - O NDT OBS fica como medido, pela classificação do próprio CQBAL ("observado").
  - Nos derivados de 50, 70 e 110 dias, a descrição registra a divergência: a provável publicação de origem não informa o método.
  - Os demais valores ficam "não informado".
  - Se a versão 2 já tiver sido importada, a 3 é recusada (D153). A correção, então, é pela conferência.
- Verificações:
  - testes novos: `origem-dados.test.ts` (3), `origem-dados-schema.test.ts` (5: do zero, arquivo sem INSERT, versão 14 com dados com os valores antigos como "não informado", falha no passo final desfaz, gatilhos), `vinculos-origem.test.ts` (4: pendente e resolvido nas duas ordens de importação, decisão única com trilha, descarte com motivo, cadeia de versões, forma de obtenção importada, exigida, copiada e nas diferenças), `pacote-curadoria.test.ts` (+1: vínculos declarados) e `curadoria-cqbal.test.ts` (+1: versão 3), interface (+1);
  - listas de migrations atualizadas (schema 15);
  - suíte: 958 testes em 90 arquivos, sem falha registrada em `test-results/falhas-vitest.jsonl`;
  - E2E da Fase 0, 5A e 5B (8) aprovados; tipos, formatação e lint sem erros (2 avisos antigos).

### 24.2 Entrega 5C-2: pacotes da Embrapa sobre o BRS Capiaçu

- **Três pacotes** (`packages/domain/src/alimentos/pacotes/embrapa-capiacu.ts`), gerados por script a partir do texto dos PDFs extraído com posição (pdf.js), sem digitação manual. O script para se um cabeçalho de coluna, uma linha ou um número não bater com o esperado. Depois, cada página das tabelas foi **renderizada como imagem e conferida visualmente** (CT 79 p. 4 e 5; CT 263 p. 7; CT 261 p. 5 e 8): os 84 valores batem.

| Pacote | Fonte (código) | Alimento | Registros | Valores | Vínculos |
|---|---|---|---|---|---|
| `EMBRAPA_CT79_5C` | `EMBRAPA_CT79_2016` | Capim BRS Capiaçu verde (50, 70, 90 e 110 dias); Silagem de capim BRS Capiaçu (90 e 110 dias) | 6 | 30 | 5, com o CQBAL |
| `EMBRAPA_COT263_5C` | `EMBRAPA_CPAO_COT263_2021` | Capim BRS Capiaçu verde (60, 90 e 120 dias; médias das doses de N) | 3 | 18 | — |
| `EMBRAPA_COT261_5C` | `EMBRAPA_CPAO_COT261_2020` | **Silagem de capim BRS Capiaçu com milho moído** (alimento próprio: 15% de milho grão moído), 60, 90 e 120 dias × 0, 100 e 200 kg N/ha/ano | 9 | 36 | 9, com o CT 263 |

- **Idade de corte** só onde a tabela diz "idade de corte": em todos os registros destes pacotes ela é explícita.
- **Forma de obtenção como cada publicação informa:**
  - CT 79: "não informada", exceto o NDT das silagens (Tabela 3), "estimado por equação", porque a Tabela 5 (p. 5) traz os mesmos valores com a nota 3: "NDT=74,49-0.56358*FDA, Capelle et al., 2001". O NDT da forragem (Tabela 2) fica "não informado", com a divergência anotada: o CQBAL chama os valores iguais de "observado".
  - CT 263: MO, PB, FDN, FDA e lignina "estimados por NIR" (p. 3). A MS fica "não informada", com o aviso da própria fonte de que ficou alta por emurchecimento no processamento das amostras.
  - CT 261: "medido", com o método de cada análise (AOAC 2005; Dumas, AOAC 990.03; Mertens 2002) e n = 4 repetições.
- **Bases:**
  - CT 79 e CT 263: explícitas, pela nota "base da matéria seca" ou pelo rótulo "%MS" e "%MN".
  - MS do CT 79 e do CT 261 em % da matéria natural, pela interpretação já aprovada.
  - **PB, FDN e FDA do CT 261**: a tabela não diz a base. Foram gravados em % da MS por interpretação técnica, porque em todas as nove combinações a FDN publicada é maior que a MS da silagem, o que só é possível na base MS. **A confirmar pelo usuário.**
- **Não importado** (sem definição no catálogo ou sem correspondência por registro): pH, celulose, hemicelulose, DIVMS, cinzas e MO do CT 261 (só médias marginais), e as letras do teste de Tukey. A Tabela 5 do CT 79 também não foi importada, porque repete os dados da Tabela 3, e milho, sorgo e cana nela vêm de Valadares Filho et al. (2010), fonte secundária.
- **Vínculos de possível mesma origem** (todos a confirmar pelo usuário):
  - CT 79 70 e 110 dias ↔ CQBAL 2535 e 2536: mesmos valores.
  - CT 79 50 e 70 dias ↔ CQBAL 2534: o CQBAL é a média dos dois.
  - CT 79 90 dias ↔ CQBAL 2533: pode incluir, sem prova numérica.
  - CT 261 ↔ CT 263, por idade: provável mesmo experimento de Dourados, materiais diferentes.
  - Sem vínculo com os registros do CQBAL de 60, 120 e 150 dias, nem com a silagem 2537: não houve indício.
- Os três pacotes entram no quadro "Curadorias incluídas no sistema". Nada é importado sem o botão. O "Capim BRS Capiaçu verde" e a "Silagem de capim BRS Capiaçu" são os mesmos alimentos do CQBAL (mesma identidade, reaproveitados).
- Verificações: `curadoria-embrapa.test.ts` (4: alvos dos vínculos existem nos pacotes de destino e alimentos de mesmo nome têm a mesma identidade; forma de obtenção, idade, base e n como cada publicação informa; Embrapa antes do CQBAL com os 5 vínculos resolvidos depois; CQBAL antes das três publicações com os 14 vínculos, 35 registros transcritos e nenhum conferido). `pacote-curadoria.test.ts` confere os quatro pacotes contra o catálogo. Módulos de alimentos e domínio: 358 testes aprovados.

### 24.3 Entrega 5C-3: tela de ponta a ponta, inspeção e fechamento

- E2E `fase5c.spec.ts`, pela tela:
  - quatro pacotes no quadro; importação do CT 79;
  - registro de 70 dias com o vínculo "ainda não importado" e sem botões de decisão;
  - importação do CQBAL, vínculos resolvidos, confirmação pela tela ("Confirmado por…", botões somem) e o mesmo vínculo confirmado do outro lado;
  - NDT da silagem com "Obtenção: Estimado por equação · NDT=74,49-0.56358*FDA, Capelle et al., 2001" e PB com "Não informada pela fonte";
  - 900 px sem rolagem horizontal; console sem erros.
- E2E da 5B ajustado: há quatro cartões de curadoria, e o teste agora escolhe o do CQBAL.
- Inspeção visual das telas novas, em claro e escuro, a 1280 e 900 px: quadro de curadorias, seção de vínculos, tabela de valores com a forma de obtenção e modal de descarte. Correção vinda da inspeção: a URL longa da citação passava da borda do cartão a 900 px e agora quebra dentro dele.
- **`npm run verify` completo: 962 testes em 91 arquivos, 25 E2E, tipos sem erros, lint sem erros (2 avisos antigos); nenhuma falha registrada em `test-results/falhas-vitest.jsonl`.**

### 24.4 Fechamento da etapa 5C (2026-10-21)

**Commits:** 5C-1 `1958d31`; 5C-2 `c352fae`; 5C-3 (este commit). **Migration:** só a 0015 (`origem_dos_dados`); próxima: 0016. **Canal IPC novo:** 1 (`vinculoOrigem:decidir`). **Pacotes no aplicativo:** 4 (CQBAL versão 3 e três da Embrapa), todos importados só pelo botão, como "transcritos".

**Alimentos e registros dos pacotes da Embrapa:**

| Publicação | Alimento | Idades de corte | Condição | Registros |
|---|---|---|---|---|
| Comunicado Técnico 79 (Embrapa Gado de Leite, 2016), Tabela 2 | Capim BRS Capiaçu verde | 50, 70, 90, 110 | não informada | 4 |
| Comunicado Técnico 79, Tabela 3 | Silagem de capim BRS Capiaçu | 90, 110 | aditivo não informado | 2 |
| Comunicado Técnico 263 (Embrapa Agropecuária Oeste, 2021), Tabela 2 | Capim BRS Capiaçu verde | 60, 90, 120 | Dourados, MS; médias das doses de 0, 100 e 200 kg N/ha/ano | 3 |
| Comunicado Técnico 261 (Embrapa Agropecuária Oeste, 2020), Tabelas 1 e 3 | Silagem de capim BRS Capiaçu com milho moído | 60, 90, 120 | 15% de milho grão moído; 0, 100 e 200 kg N/ha/ano; n = 4 | 9 |

**Cobertura e forma de obtenção** ("—" = a publicação não traz; sem linha no banco):

| Publicação | MS | MO | MM | PB | EE | FDN | FDNcp | FDA | LIG | NDT | Ca | P |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CT 79, forragem | não inf. (% MN interpretado) | — | — | não inf. | — | não inf. | — | — | não inf. | não inf. (divergência com o CQBAL anotada) | — | — |
| CT 79, silagem | não inf. (% MN interpretado) | — | — | não inf. | — | não inf. | — | — | não inf. | estimado por equação (Capelle et al., 2001) | — | — |
| CT 263, forragem | não inf. (%MN explícita; alerta de emurchecimento) | NIR | — | NIR | — | NIR | — | NIR | NIR | — | — | — |
| CT 261, silagem com milho | medido, AOAC (% MN interpretado) | — | — | medido, Dumas (base MS interpretada) | — | medido, Mertens (base MS interpretada) | — | medido, Mertens (base MS interpretada) | — | — | — | — |

Total dos pacotes da Embrapa: **18 registros, 84 valores, 14 vínculos** (5 com o CQBAL e 9 entre CT 261 e CT 263), todos a confirmar.

**Fontes:** PLANO_FASE_5.md, seção 12.2. Cópias em `referencias/embrapa/` (fora do git), com SHA-256 na seção 24.

**Limitações conhecidas:**
- A leitura das tabelas foi por extração de texto com posição e por conferência visual das páginas renderizadas. Nada foi digitado, mas a conferência no PDF é do usuário.
- O NDT da forragem do CT 79 continua com forma "não informada": o CQBAL o chama de observado, e a publicação não diz.
- A MS do CT 263 tem o aviso da própria fonte (emurchecimento); usar com cuidado.
- Silagem de milho e pastagens não ganharam publicação primária nesta etapa e seguem só com o CQBAL.
- Se a versão 2 do pacote CQBAL já tiver sido importada, a versão 3 é recusada, e a forma de obtenção do NDT não entra. A correção, então, é pela conferência.
- A falha intermitente da 5A-3 continua em acompanhamento: nenhuma ocorrência nas execuções completas desta etapa.

**Pendências para a aprovação:**
1. **Base de PB, FDN e FDA do CT 261**: confirmar % da MS (interpretação técnica; a tabela não diz a base).
2. **Vínculos de origem**: confirmar ou descartar os 14 na conferência, ou pedir outro critério.
3. **Boletim 100 da Embrapa Meio-Norte** ("todos os direitos reservados") e **artigo de Neumann et al. (2007)** sobre silagem de milho: autorizar ou não o uso.
4. **Marandu**: continua bloqueado até conferir a correspondência.
5. **MM e cinzas**: continuam sem correspondência fundamentada. **Métodos das definições**: continuam pendentes. O CT 261 informa métodos por valor, mas isso não fundamenta a definição para todas as fontes.
6. Para a 5D: regra de agregação, uso de `registrosIndependentes`, direção conservadora de MO, MM e EE. Da Fase 4: materializar agregados do resultado.

**5D não foi iniciada.** O `referencias/BR-CORTE.pdf` não foi aberto.

### 24.5 Ajustes da aprovação da 5C (2026-10-21)

Aprovação técnica do usuário com seis decisões (PLANO_FASE_5.md, seção 12.3). Um commit, com a migration 0016.

| Decisão | O que foi feito | Onde |
|---|---|---|
| 1. Base do CT 261 | PB, FDN e FDA em % da MS, aceitos provisoriamente, com a base marcada como **inferida por consistência dos dados** em campo próprio do valor (`interpretacao_base`), nunca como base da fonte. A mesma marca vale para as outras bases não declaradas (MS do CQBAL, do CT 79 e do CT 261; PB, FDN e FDA do BPD 100). A tela mostra "Base inferida, não declarada pela fonte" | Migration 0016; pacotes CQBAL v4, CT 79 v2, CT 261 v2 (números inalterados) |
| 2. Vínculos | Os 14 continuam a confirmar e dependentes; evidências organizadas por vínculo, com o que confirmaria ou descartaria cada um | PLANO_FASE_5.md, seção 12.4 |
| 3. BPD 100 e Neumann | BPD 100: pacote `EMBRAPA_BPD100_5C` com só duas linhas de três tabelas (capim-mombaça importável; capim-marandu bloqueado), métodos, base interpretada, idade de 35 dias e a frase de direitos na fonte. Neumann et al. (2007): lido, sem tabela de composição da silagem; não entra | Seção 12.5 |
| 4. Marandu | Continua bloqueado, no CQBAL e no BPD 100 | Seção 12.5 |
| 5. MM e cinzas | Investigado nas quatro fontes lidas; MM e CZ do CQBAL continuam separados; os métodos do CT 261 ficam nos valores dele (a nota de cinzas e MO cita AOAC, 2005, p. 4) | Seção 12.6 |
| 6. Versões do CQBAL | **Atualização auditável** de pacote já importado para a versão nova, sem duplicar registros: transcrito pelo pacote é corrigido no próprio registro; conferido recebe versão nova; o que o usuário editou, rejeitou ou descartou não muda e fica listado. Canal `curadoria:atualizar`; botão "Atualizar para a versão N" no cartão | Seção 12.7; D159 substitui D153 |

**Pacotes no aplicativo:** 5 (CQBAL v4: 182 valores importáveis; CT 79 v2: 30; CT 263 v1: 18; CT 261 v2: 36; BPD 100 v1: 3 importáveis e 3 bloqueados). Nada importado no banco operacional.

**Testes novos ou ampliados:** migration 0016 do zero e a partir da 15; base interpretada no domínio, no pacote e na tela; atualização (cada situação de registro, versão nova do conferido que substitui o anterior ao ser conferida, fonte com trilha, vínculos sem repetição e na primeira versão, recusas, transação desfeita numa falha no meio); pacotes da Embrapa e do BPD 100; cartão do pacote com versão anterior importada e o resumo da atualização; E2E da 5C com a marca de base inferida.

**Limitações:**
- A atualização é testada por serviço e por tela com pacotes fictícios; o E2E não a exercita, porque o aplicativo traz uma só versão de cada pacote.
- A atualização casa registros pela página ou tabela. Se uma versão futura mudar a página de um registro, ele aparece como "fora da versão" e o novo como "novo": nada se perde, mas o casamento fica com o usuário.
- O BPD 100 não informa o n de cada média.
- **`npm run verify` completo: 974 testes em 93 arquivos, 25 E2E, tipos sem erros, lint sem erros (2 avisos antigos); nenhuma falha registrada em `test-results/falhas-vitest.jsonl`.** Uma execução anterior desta entrega teve 1 E2E falhando de forma determinística (o teste da 5B achava dois cartões com registros bloqueados depois do BPD 100); o teste passou a procurar dentro do cartão do CQBAL.

## 25. Fase 5D: seleção, independência, agregação e cenários (a partir de 2026-10-22)

Autorizada pelo usuário em 2026-10-22, com a aprovação da 5C e 12 decisões (PLANO_FASE_5.md, seção 13.10). Implementação na seção 13.11 do plano; decisões técnicas D163 a D169 (ARQUITETURA.md).

### 25.1 Entregas

| Entrega | Conteúdo | Commit |
|---|---|---|
| 5D-1 | Domínio puro da seleção (`packages/domain/src/alimentos/selecao.ts`) e testes sintéticos e de propriedade | `5aff918` |
| 5D-2 | Migration 0017, repositório, serviço e canais IPC (`selecao:*`, `perfil:*`, `avaliacao:*`); seção "Avaliação científica" no registro | `5bca26e` |
| 5D-3 e 5D-4 | Abas Seleção e Perfis | `4de3aa8` |
| 5D-5 | Teste com os pacotes reais, E2E, inspeção visual e documentação | este commit |

**Migration:** 0017 (`selecao_e_perfis`); próxima: 0018. **Canais IPC novos:** 8. **Regra:** `SELECAO_5D` versão 1, ainda **não aprovada** no banco operacional; a aprovação é pela aba Seleção.

### 25.2 Exemplo: BRS Capiaçu verde, 90 dias

Num banco de **teste**, com os pacotes reais importados e todos os registros conferidos por simulação (no banco operacional nada foi importado nem conferido). A seleção encontra 14 candidatos do alimento "Capim BRS Capiaçu verde":

| Candidato | Nível | Situação |
|---|---|---|
| CT 79, Tabela 2 (p. 4), 90 dias | Específico | Referência individual possível; agregável |
| CT 263, Tabela 2 (p. 7), 90 dias (média das doses de N; composição por NIR) | Específico | Referência individual possível; agregável |
| CQBAL, derivado "CAPIM BRS. CAPIAÇU 90 DIAS" (código 2533) | Comparável (idade não preenchida; classe da fonte "90 DIAS") | Referência individual possível; fora da agregação (tabela compilada, nível comparável) |
| CQBAL, derivados "50", "60", "120" e "150 DIAS" (códigos 2534, 2530, 2532, 2531) | Comparável, com o aviso de que a classe da fonte pode indicar outra idade | Referência individual possível, com aviso; fora da agregação |
| CT 79 (50, 70 e 110 dias), CT 263 (60 e 120 dias), CQBAL 2535 (70) e 2536 (110) | — | Fora: idade de corte diferente de 90 dias, sem aproximação |

**Origens independentes:** 5. A origem 1 junta o CT 79 inteiro e os derivados 2533, 2534, 2535 e 2536 do CQBAL, pelos vínculos a confirmar (transitivos); a origem 2 é o CT 263; as outras três são derivados isolados do CQBAL.

**Agregação:** nenhum nutriente agregado. Só duas origens agregáveis (CT 79 e CT 263), abaixo do mínimo de 3, e com formas de obtenção diferentes (não informada e NIR), que não se combinam. A MS do CT 79 fica fora também por ter base inferida, não validada. MM, EE, Ca e FDNcp: nenhum valor elegível nas origens agregáveis. **Cenários:** indisponíveis.

**O que o usuário pode fazer:** gravar uma referência individual, que fica com a limitação "evidência limitada (uma origem)". Pela especificidade e pelos métodos informados, os candidatos naturais são o CT 79 (90 dias) ou o CT 263 (90 dias, NIR, com o aviso da própria fonte sobre a MS).

### 25.3 Testes

- Domínio (`selecao.test.ts`, 17): regra e hash; níveis (idade exata, sem idade, tolerância só em versão justificada, espécie, forma, parte, processamento, cultivar, geral); origens (mesma publicação, experimento, vínculo transitivo por fora da busca, compilada não agrupada por fonte); agregação (3 e 2 origens, dependentes, formas e métodos, conversão de unidade, base inferida, cautela, compilada, tratamentos); cenários e perfis; propriedades com 3 sementes (ordem, dependente não muda o n, central entre os extremos).
- Banco (`selecao-schema.test.ts`, 4): migration do zero e a partir da 16 sem mudar tabelas existentes; coerência e retirada da avaliação; perfil exige aprovação, coerência de tipo e imutabilidade.
- Serviço (`selecao.test.ts`, 5, e `selecao-capiacu.test.ts`, 1): aprovação única com hash e trilha; só conferido; agregação e cenários; nada gravado sem regra aprovada; perfil imutável e sem efeito nos registros; base validada e cautela com retirada; vínculo e tratamentos; exemplo do Capiaçu com os pacotes reais.
- Tela (`selecao.test.tsx`, 3, e um teste novo em `alimentos.test.tsx`); E2E `fase5d.spec.ts` (regra aprovada pela tela, referência individual, perfil, avaliação, 900 px sem rolagem horizontal, console sem erros).
- Inspeção visual da Seleção e do Perfil, claro e escuro, 1280 e 900 px.
- **`npm run verify` completo: 1005 testes em 98 arquivos, 26 E2E, tipos sem erros, lint sem erros (2 avisos antigos); nenhuma falha registrada em `test-results/falhas-vitest.jsonl`.**

### 25.4 Limitações e pendências

- Com os dados atuais, **nenhum alimento tem 3 origens independentes** na mesma forma e método: a seleção vai mostrar referências individuais com evidência limitada. Agregação e cenários só aparecem com mais estudos curados e conferidos.
- Registros sem idade estruturada (derivados do CQBAL por classe "60 DIAS" etc.) aparecem como comparáveis, com aviso, porque a idade não é preenchida a partir de texto. **A decidir:** manter assim ou excluir quando a classe da fonte nomeia outra idade.
- A avaliação científica é da versão do registro: uma versão nova não herda a marca.
- A aprovação da regra e a conferência dos registros são do usuário; o banco operacional não tem nada importado, conferido ou aprovado.
- Os 14 vínculos e a base do CT 261 continuam pendentes (decisão 12); o Marandu continua bloqueado.
- Da Fase 4, continua pendente a materialização de agregados do resultado.
- **Fase 6 não iniciada; o `referencias/BR-CORTE.pdf` não foi aberto.**

### 25.5 Correção da aprovação da 5D (2026-10-22)

Idade escrita só no texto da fonte deixa de ser idade desconhecida (PLANO_FASE_5.md, seção 13.12; regra `SELECAO_5D` versão 2; D170). Na busca do BRS Capiaçu verde com 90 dias, com os pacotes reais num banco de teste:

| Candidato | Antes (v1) | Agora (v2) |
|---|---|---|
| CT 79, Tabela 2, 90 dias; CT 263, Tabela 2, 90 dias | Específico | Específico |
| CQBAL 2533, classe "CAPIM BRS. CAPIAÇU 90 DIAS", sem idade estruturada | Comparável | **Pendente de validação** (sem nível, fora do uso) |
| CQBAL 2530, 2531, 2532 e 2534 (classes "60", "150", "120" e "50 DIAS") | Comparável, com aviso | **Fora**: idade do texto diferente de 90 dias |
| Demais idades estruturadas diferentes de 90 | Fora | Fora |

Origens encontradas: 5; elegíveis para agregação: 2 (CT 79 e CT 263), abaixo do mínimo de 3. Nenhum nutriente agregado; cenários indisponíveis. A regra versão 2 não foi aprovada no banco operacional.

**`npm run verify` completo depois da correção: 1013 testes em 98 arquivos, 26 E2E, tipos sem erros, lint sem erros (2 avisos antigos); nenhuma falha registrada em `test-results/falhas-vitest.jsonl`.**

### 25.6 Fechamento da Fase 5 (2026-10-22)

**Fase 5 aprovada definitivamente pelo usuário em 2026-10-22** (`npm run verify` final: 1013 testes em 98 arquivos, 26 E2E, sem falha registrada), incluindo a correção `cdd6015` e a regra `SELECAO_5D` versão 2. Marca anotada `fase-5` no commit de fechamento. Só a versão vigente da regra (2) é usada na seleção e pode ser aprovada; a versão 1 fica no código apenas para compatibilidade histórica (o serviço recusa aprová-la). No banco operacional nada foi importado, conferido ou aprovado: importar pacotes, conferir registros e aprovar a regra são ações do usuário.

Pendências que seguem abertas, sem bloquear a Fase 6: base de PB, FDN e FDA do CT 261; os 14 vínculos de origem; Marandu bloqueado; materialização de agregados da Fase 4; falha intermitente da 5A-3 em acompanhamento.

## 26. Fase 6A: motor BR-CORTE e tela de exigências (2026-10-22 a 2026-10-24)

Plano e decisões em PLANO_FASE_6.md; equações, domínios, casos e divergências em INVENTARIO_BR_CORTE.md (seções 12 a 17). Entregas aprovadas pelo usuário: 6A-1 (núcleo), 6A-2 (peso), 6A-3 (energia), 6A-4 (CMS, com terminação intensiva a pasto), 6A-5 (proteína, com R-11 a R-13) e 6A-6 (macrominerais, com Ca/P). Validação contra o livro: exemplos T-01 a T-04, planilha oficial (T-12) e Tabelas 17.3a a 17.12b (EM, CMS, NDT, PDR, PNDR, PB e minerais). `VERSAO_MOTOR` 0.6.1.

**6A-7 (2026-10-24):** tela "Nutrição de corte → Exigências do animal" (PLANO_FASE_6.md, seção 8). O módulo deixa de ser "planejado". Nada é gravado; sem migration (próxima continua 0018).

**`npm run verify` completo: 1161 testes em 106 arquivos, 27 E2E, tipos sem erros, lint sem erros (2 avisos antigos); nenhuma falha nova em `test-results/falhas-vitest.jsonl`.** Inspeção visual em claro e escuro, a 1280 e 900 px, sem rolagem horizontal.

**6A aprovada definitivamente pelo usuário em 2026-10-24** (6A-1 a 6A-7). Ajustes de fechamento (PLANO_FASE_6.md, seção 8.1): cálculo individual com entrada manual (integração com animais e lotes como pendência futura), números legíveis nas mensagens do motor e no detalhe (`VERSAO_MOTOR` 0.6.2), selo "Com aviso" só para limitações, GMD desejado distinto do observado. D-MIN-12 mantida. `npm run verify` depois dos ajustes: 1165 testes em 106 arquivos, 27 E2E, tipos e lint sem erros (2 avisos antigos); nenhuma falha nova registrada pela execução completa.

Pendências que seguem abertas: integração das exigências com animais e lotes; P-13 (banco estendido das Eq. 1.3 e 1.4); D-PROT-01 (domínios provisórios de PLg e k); D-MIN-03 (ganho mineral do zebuíno castrado a pasto sem banco); D-EN-04 e D-PROT-07 (GMD zero); as pendências da Fase 5 (base do CT 261, 14 vínculos, Marandu) e da Fase 4 (materialização de agregados); falha intermitente da 5A-3 em acompanhamento. 6B (avaliação de dietas): só planejamento (PLANO_FASE_6.md, seção 9).

## 27. Fase 6B: avaliação de dietas (2026-10-26 a 2026-10-27)

Plano, decisões e entregas em PLANO_FASE_6.md (seções 9 a 9.19); inventário complementar em INVENTARIO_BR_CORTE.md (seção 18).

- **6B.0:** inventário (Eq. 4.30, Tabelas 4.4, 4.5 e 10.13; exemplo da p. 102 só para testes).
- **6B-1:** oferta nutricional no motor: oferecido, consumo observado (sobras) e consumo assumido; MN ↔ MS pela MS do próprio perfil; contribuições conhecidas, limites de garantia e desconhecidas; ausente, traço e não quantificado nunca viram zero.
- **6B-2:** balanço exigência × oferta: "Cobertura teórica", "Déficit estimado" ou "Indeterminado", nunca adequação completa; piso conhecido em oferta parcial; Ca/P só como indicador; alertas da Tabela 10.13 só com composição mineral completa; PDR, PNDR e PM indeterminadas (C5).
- **6B-3:** serviço com perfis gravados e elegibilidade (regra vigente aprovada, registros conferidos, não substituídos nem descartados; cautela vira aviso).
- **Migration 0018:** natureza do valor na definição do nutriente; PBeqNNP contida na PB total, sem dupla contagem; `valor_nutricional` reconstruída sem o teto fixo de 100 %, verificada com dados legados.
- **6B-4 (migration 0019):** avaliação nutricional imutável com entrada, hipóteses, valores usados, fontes, versões, resultados e SHA-256. **Migration 0020:** anulação em registro separado. Situação parcial e uso operacional; hash do retrato exibido conferido ao gravar; divergente só para investigação.
- **6B-5:** tela com as abas Exigências do animal, Avaliar dieta e Avaliações gravadas: simular sem gravar, gravar explicitamente, consultar e anular com motivo.

**`npm run verify` final: 1289 testes em 113 arquivos, 28 E2E, tipos sem erros, lint sem erros (2 avisos antigos); nenhuma falha nova registrada pela execução completa.** Inspeção visual em claro e escuro, a 1280 e 900 px, sem rolagem horizontal.

**6B aprovada definitivamente pelo usuário em 2026-10-27, com a marca `fase-6b`.** Melhorias futuras: paginação e conferência de SHA-256 mais leve na lista de avaliações (com testes de desempenho antes), busca e filtro de alimentos no seletor. Seguem abertas: integração com animais e lotes (sem inferir castração nem grupo genético); curadoria de produtos com NNP; as pendências listadas na seção 26. 6C (desempenho previsto): só planejamento.
