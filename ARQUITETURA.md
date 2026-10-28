# ARQUITETURA.md — Sistema de Gestão Pecuária

## 1. Visão Arquitetural

Aplicação desktop Electron com processo principal (Main) controlando acesso ao SQLite, e processo de renderização (Renderer) rodando React/TypeScript para a UI. Comunicação entre os dois via IPC (Inter-Process Communication), nunca acesso direto do Renderer ao banco de dados — isso isola a UI da persistência e é o que vai permitir, no futuro, trocar SQLite local por um backend sincronizado sem reescrever a UI.

```
┌─────────────────────────────────────────────────────────────┐
│                         ELECTRON MAIN                        │
│  ┌────────────┐   ┌──────────────┐   ┌─────────────────────┐ │
│  │ IPC Handlers│──▶│   Services    │──▶│  Repositories (DAO)  │ │
│  │ (API surface)│  │ (regras de    │   │  (SQL / better-     │ │
│  │             │   │  negócio)     │   │   sqlite3)           │ │
│  └────────────┘   └──────────────┘   └─────────────────────┘ │
│         ▲                                      │               │
│         │                                      ▼               │
│         │                              ┌───────────────┐       │
│         │                              │   SQLite DB    │       │
│         │                              │  (arquivo .db) │       │
│         │                              └───────────────┘       │
└─────────┼───────────────────────────────────────────────────┘
          │  IPC (contextBridge / preload, canais tipados)
┌─────────▼───────────────────────────────────────────────────┐
│                       ELECTRON RENDERER                       │
│  ┌────────────┐   ┌──────────────┐   ┌─────────────────────┐ │
│  │  React UI   │◀─▶│  State/Query  │◀─▶│  API Client (preload)│ │
│  │ (componentes)│  │ (TanStack     │   │  tipado via IPC      │ │
│  │             │   │  Query/Zustand)│   │                      │ │
│  └────────────┘   └──────────────┘   └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Princípios

1. **Separação estrita de camadas**: UI nunca conhece SQL; Services nunca conhecem React; Repositories nunca conhecem regras de negócio.
2. **Domínio compartilhável**: as entidades de domínio e regras de cálculo (financeiro, nutricional) vivem em um pacote (`packages/domain`) independente de Electron, para poder ser reaproveitado por um futuro app React Native.
3. **Motor de cálculo nutricional isolado**: módulo próprio (`packages/nutrition-engine`), puro TypeScript, sem dependência de Electron/React/SQLite — testável isoladamente e versionável por fonte científica.
4. **IPC como única porta**: toda comunicação Renderer→Main passa por canais IPC tipados e validados (não exposição de `fs`/`child_process` cru ao Renderer — `contextIsolation: true`, `nodeIntegration: false`).
5. **Preparação para sync futura**: toda tabela de dado transacional (não-catálogo) terá colunas `uuid`, `created_at`, `updated_at`, `deleted_at` (soft delete) e um campo `sync_status` reservado, mesmo sem sync implementado agora — evita migração dolorosa depois.

---

## 2. Estrutura de Monorepo

Estrutura real a partir da Fase 0. Uso de monorepo (workspaces) para separar o que é reaproveitável (domínio, motor nutricional, tipos) do que é específico de Electron/web, preparando o terreno para o app móvel.

```
C:\dev\pecuaria\
├── apps/
│   └── desktop/                      # App Electron (layout padrão do electron-vite)
│       ├── src/
│       │   ├── main/                 # Processo principal
│       │   │   ├── index.ts          # Inicialização: caminhos, log, segurança, banco, IPC, janela
│       │   │   ├── caminhos.ts       # Pasta de dados fora do código; aviso de OneDrive
│       │   │   ├── logger.ts         # Log em arquivo, JSON por linha, um arquivo por dia
│       │   │   ├── seguranca.ts      # Sessão, navegação, rede bloqueada, remetente IPC, CSP
│       │   │   ├── janela.ts         # BrowserWindow com sandbox e isolamento
│       │   │   ├── ipc/              # criar-manipulador (validação/erros) e registrar-ipc (canais)
│       │   │   └── services/         # Serviços do main (sistema, configuração)
│       │   ├── preload/
│       │   │   └── index.ts          # Expõe só window.api.invocar, com lista fechada de canais
│       │   └── renderer/             # React (Vite)
│       │       ├── index.html
│       │       └── src/
│       │           ├── app.tsx       # Rotas
│       │           ├── modulos.ts    # Catálogo dos módulos e fases
│       │           ├── textos.ts     # Textos da interface (pt-BR)
│       │           ├── components/   # ui/ (botão, cartão, selo...), layout/, notificações
│       │           ├── hooks/        # use-tema
│       │           ├── lib/          # cliente da API, consultas TanStack, formatação
│       │           └── paginas/      # Uma pasta ou arquivo por módulo
│       ├── e2e/                      # Testes Playwright do app construído
│       ├── electron.vite.config.ts
│       ├── electron-builder.yml      # Instalador NSIS
│       └── playwright.config.ts
│
├── packages/
│   ├── shared-types/                 # Contrato IPC: canais, esquemas Zod, tipos, Resultado
│   ├── database/                     # Conexão, migrator, repositórios, backup e retenção
│   │   ├── migrations/               # 0001_*.sql ... (imutáveis)
│   │   ├── src/
│   │   └── tests/
│   ├── domain/                       # Regras de negócio puras (vazio na Fase 0)
│   └── nutrition-engine/             # Motor de nutrição (vazio até a Fase 6)
│       └── src/                      # Subpastas previstas: units, equations, data-selection,
│                                     # requirements, diet-evaluation, performance, formulation, sources
│
├── referencias/                      # PDFs de referência (fora do Git)
├── REQUISITOS.md, ARQUITETURA.md, BANCO_DE_DADOS.md,
├── MODELOS_NUTRICIONAIS.md, ROADMAP.md, CLAUDE.md
├── package.json                      # Workspaces npm e scripts globais
├── tsconfig.base.json
├── vitest.config.ts                  # Projetos de teste de todos os pacotes
└── eslint.config.mjs                 # Inclui regras de fronteira entre camadas
```

---

## 3. Tecnologias e Bibliotecas

Coluna "Situação": **adotada** já está no projeto desde a Fase 0; **prevista** entra quando o módulo que precisa dela for implementado.

| Camada | Tecnologia | Situação | Justificativa |
|---|---|---|---|
| Shell desktop | Electron 44 | adotada | Requisito do usuário |
| Build | electron-vite 5 + Vite 7 | adotada | Build de main, preload e renderer num só lugar. O electron-vite 6 saiu um dia antes da Fase 0 e foi evitado |
| UI | React 19.2 + TypeScript 6.0 strict | adotada | O TypeScript 7 ainda não é suportado pelo typescript-eslint |
| Estilo | Tailwind CSS 4 + componentes próprios no padrão shadcn (cva, clsx, tailwind-merge) e ícones lucide-react | adotada | Visual moderno sem depender de CLI com rede. Radix entra só se um componente complexo exigir |
| Rotas | React Router 7 com HashRouter | adotada | HashRouter funciona com `file://` no app empacotado |
| Estado servidor | TanStack Query 5 | adotada | Cache e invalidação dos dados vindos do IPC |
| Estado cliente leve | Zustand | prevista | Ainda desnecessário na Fase 0 |
| Formulários | React Hook Form + Zod | Zod adotado; RHF previsto | Zod 4 já valida o contrato IPC nos dois lados |
| Persistência | better-sqlite3 13 (SQLite 3.53) | adotada | Binário N-API pré-compilado dentro do pacote: funciona no Node e no Electron sem compilador |
| Migrations | SQL numerado e imutável, runner próprio, `user_version` e checksum | adotada | Ver seção 7 |
| Query builder | Kysely ou SQL tipado | SQL tipado por enquanto | Kysely será reavaliado na Fase 1, quando houver consultas de negócio |
| Gráficos | SVG próprio em `components/graficos` | adotada na Fase 2 | Ver D33. Uma biblioteca pode ser reavaliada na Fase 10, se os relatórios exigirem |
| Testes unitários | Vitest 4 (jsdom para a interface) | adotada | Mesmo ecossistema do Vite |
| Testes E2E | Playwright 1.63 com Electron | adotada | Roda o app construído de verdade |
| Empacotamento | electron-builder 26, alvo NSIS x64 | adotada | Instalador Windows |
| Lint/Format | ESLint 9 + typescript-eslint + Prettier | adotada | Inclui regras de fronteira entre camadas |
| Relatórios | `pdf-lib` ou `@react-pdf/renderer`, `exceljs` | prevista | Fase 10 |
| Monorepo | npm workspaces | adotada | Simples, sem Nx ou Turborepo |

**Observação sobre ORM:** nenhum ORM completo (Prisma, TypeORM). Cálculos financeiros e nutricionais exigem controle fino de precisão, unidades e rastreabilidade.

---

## 4. Fluxo de Dados

Exemplo real da Fase 0: trocar o tema da interface.

1. O usuário clica em "Escuro" no seletor de tema.
2. O hook `useTema` chama `chamarApi('configuracao:definir', { chave, valor })` em `lib/api.ts`.
3. `chamarApi` valida a entrada com o esquema Zod do contrato (`packages/shared-types`) e chama `window.api.invocar`.
4. O preload confere se o canal está na lista fechada e repassa com `ipcRenderer.invoke`.
5. No main, `criarManipulador` confere o remetente, valida a entrada de novo com o mesmo esquema e chama o executor do canal.
6. `ServicoConfiguracao` aplica a regra (valor do tema precisa ser válido) e chama `RepositorioConfiguracao`.
7. O repositório grava no SQLite.
8. A resposta volta sempre como `Resultado`: `{ ok: true, dados }` ou `{ ok: false, erro: { codigo, mensagem } }`.
9. O TanStack Query atualiza o cache e a interface aplica o tema.

Um canal novo exige: nome em `canais.ts`, esquema em `contrato.ts`, tipo de saída em `SaidasApi` e executor em `registrar-ipc.ts`. O TypeScript acusa erro se faltar qualquer um deles.

Esse fluxo (interface → API tipada → serviço → repositório) é o que permite, no futuro, trocar `window.api` por um cliente HTTP sem mexer nos componentes nem nos serviços.

---

## 5. Preparação para Mobile/Sync Futuro (sem implementar agora)

- `packages/domain` e `packages/nutrition-engine` são puros TS, sem Electron/React/SQLite — prontos para rodar dentro de React Native ou de um backend Node.
- Modelo de dados já inclui `uuid`, timestamps e soft delete (ver BANCO_DE_DADOS.md), facilitando uma futura estratégia de sync (ex.: last-write-wins ou CRDT) sem migração de schema traumática.
- A camada de API (IPC) tem assinatura de métodos pensada para também poder ser servida por HTTP/tRPC no futuro (mesmos nomes de operação, mesmos tipos de payload/retorno).
- Não será implementado: autenticação, multiusuário, fila de sync, resolução de conflitos. Isso fica para uma fase "v2 mobile", fora do escopo atual.

---

## 6. Segurança e Robustez do Electron

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` no `BrowserWindow`.
- Única superfície exposta ao Renderer: a API tipada do preload (sem acesso a `fs`, `require`, etc.).
- Validação de payload em duas camadas: Zod no Renderer (UX) e novamente no handler IPC do Main (segurança, já que o Renderer não é totalmente confiável mesmo sendo first-party).
- O preload expõe uma única função, `window.api.invocar`, e recusa canais fora da lista fechada.
- O main recusa chamadas que não venham da moldura principal da janela do aplicativo.
- Navegação para fora do app, novas janelas, webviews e pedidos de permissão são bloqueados.
- Toda requisição de rede é cancelada no app empacotado. Em desenvolvimento, só o servidor local do Vite passa.
- A página empacotada tem Content Security Policy sem rede e sem `eval`. O menu padrão e as ferramentas de desenvolvedor ficam desligados no app instalado.
- Erros inesperados viram `ERRO_INTERNO` com mensagem genérica para a interface; os detalhes vão só para o log.
- Backup automático diário e sempre antes de migrations e restaurações (ROADMAP.md, seção 4).

---

## 7. Decisões Técnicas da Fase 0

Cada decisão traz o motivo e a alternativa descartada. Mudar uma delas exige registrar aqui a nova decisão.

| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| D01 | Código em `C:\dev\pecuaria`, fora do OneDrive e sem acento no caminho | Sincronização do OneDrive em `node_modules` e no banco aberto; ferramentas nativas falham com acento | Manter na pasta original |
| D02 | better-sqlite3 13 com binário N-API do próprio pacote; script de compilação negado em `allowScripts` | Não há compilador C++ na máquina; o binário N-API é o mesmo para Node (testes) e Electron (app) | Recompilar com `@electron/rebuild` a cada troca de versão |
| D03 | Migrations em `.sql`, embutidas no bundle pelo Vite (`import.meta.glob`) | App empacotado não depende de arquivos soltos | Ler a pasta de migrations em tempo de execução |
| D04 | Runner próprio: uma transação por arquivo, `user_version`, tabela `_migracoes` com checksum SHA-256 | Detecta migration editada depois de aplicada; falha desfaz a migration inteira; reexecução sem efeito | Biblioteca de migrations de terceiros |
| D05 | Tabelas `STRICT` e `PRAGMA application_id` = "PECU" | Tipos garantidos pelo SQLite; recusa restaurar arquivo SQLite de outro programa | Tabelas sem tipagem estrita |
| D06 | Manifesto JSON ao lado de cada backup, em vez da tabela `backup_registro` | Restaurar um backup antigo apagaria da tabela o registro dos backups mais novos | Tabela dentro do próprio banco |
| D07 | Backup convertido para `journal_mode=DELETE`, verificado e com hash antes de ser registrado | Arquivo único, portátil e conferível | Copiar o arquivo `.db` aberto |
| D08 | Restauração: verifica, faz backup de segurança, troca o arquivo e reabre; se falhar, volta ao banco anterior | Nenhuma restauração deixa o usuário sem banco | Sobrescrever direto |
| D09 | Operações de backup em fila serial | Evita backup e restauração simultâneos | Travas por arquivo |
| D10 | Uma única função exposta no preload, com lista fechada de canais e Zod nos dois lados | Superfície mínima; o tipo obriga cada canal a ter esquema, saída e executor | Um objeto com um método por operação |
| D11 | Resposta IPC sempre em `Resultado` | O Electron perde tipo e campos de exceções no IPC | Lançar exceções através do IPC |
| D12 | Pasta de dados em `%APPDATA%\GestaoPecuaria` e `%APPDATA%\GestaoPecuaria-dev`, com variável `PECUARIA_DIR_DADOS` para testes | Dados reais nunca tocados por desenvolvimento ou testes | Mesma pasta para tudo |
| D13 | Pacotes `@pecuaria/*` como dependências de desenvolvimento do app e embutidos no bundle | O instalador leva só o better-sqlite3 em `node_modules` (asar de 1,8 MB) | Levar o código-fonte dos pacotes no instalador |
| D14 | Renderer não minificado | App local; mensagens de erro no log ficam legíveis | Minificar |
| D15 | Componentes de interface próprios no estilo shadcn, sem a CLI do shadcn | A CLI precisa de rede e é interativa | Instalar via CLI |
| D16 | Log próprio em arquivo diário, JSON por linha, retenção de 30 dias | Sem dependência extra, fácil de ler e testar | electron-log |
| D17 | Regras de ESLint proíbem Electron, Node e banco no renderer, e infraestrutura no domínio | A arquitetura fica verificada automaticamente, não só documentada | Confiar só em revisão |

**Observação sobre `ELECTRON_RUN_AS_NODE`:** alguns ambientes, como o processo do Claude Code dentro do VS Code, definem `ELECTRON_RUN_AS_NODE=1`. Com essa variável, o Electron roda como Node puro e a janela não abre. O `electron.vite.config.ts` e os testes E2E removem a variável antes de iniciar o Electron.

---

## 8. Camadas na Prática (a partir da Fase 1)

| Camada | Onde | Responsabilidade | Exemplo da Fase 1 |
|---|---|---|---|
| Core | `packages/domain` | Regras puras, sem banco nem tela | Cálculo do GMD, consistência sexo e categoria, leitura do CSV, UUID v7 |
| Contrato | `packages/shared-types` | Canais, esquemas Zod e tipos trocados entre processos | Esquema do cadastro de animal |
| Data | `packages/database` | SQL, mapeamento e transação. Sem regra de negócio | Repositório de animais, migration 0002 |
| Main | `apps/desktop/src/main` | Serviços que juntam regra, banco e trilha de alterações | Transferência em lote dentro de uma transação |
| Preload | `apps/desktop/src/preload` | Ponte única e fechada | Lista de canais |
| Renderer | `apps/desktop/src/renderer` | Telas, formulários e cache de consultas | Ficha do animal |

Regras que dependem do banco ficam nos serviços do Main, como unicidade, genealogia e datas em relação à última movimentação. Regras que não dependem do banco ficam no Core e são usadas também pela interface, para avisar antes de enviar.

## 9. Decisões Técnicas da Fase 1

| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| D18 | Pesagens individuais e GMD observado entraram na Fase 1 | Pedido explícito do usuário na abertura da fase; o peso de entrada do animal precisa de onde ser guardado | Manter tudo na Fase 2 |
| D19 | GMD calculado a cada consulta, nunca gravado | Corrigir ou excluir uma pesagem não deixa valor desatualizado no banco | Coluna de GMD na pesagem |
| D20 | GMD com pesagem por fita ou visual é marcado como estimado | Separar medida de estimativa sem descartar o dado | Ignorar pesagens não feitas em balança |
| D21 | Trilha de alterações em tabela só de inserção, com estado anterior e novo em JSON | Histórico completo e legível, protegido por gatilhos | Guardar apenas `updated_at` |
| D22 | Exclusão física proibida por gatilho nas tabelas do rebanho | Nenhuma edição ou exclusão apaga histórico, nem por engano no código | Confiar só nos repositórios |
| D23 | Chaves de unicidade normalizadas em colunas próprias | Comparação sem diferenciar maiúsculas e espaços, mantendo acentos | `COLLATE NOCASE`, que só cobre ASCII |
| D24 | Transferência em lote é tudo ou nada | Evita metade do lote transferida quando um animal tem problema | Transferir os válidos e relatar os inválidos |
| D25 | Importação CSV com prévia e gravação só sem nenhum erro | O usuário corrige a planilha uma vez, sem cadastros parciais | Importar as linhas válidas |
| D26 | Leitura de CSV tenta UTF-8 e cai para Windows-1252 | O Excel no Brasil salva CSV em Windows-1252 por padrão | Exigir CSV UTF-8 |
| D27 | Número digitado ambíguo, como "1.050", é recusado | Pode ser mil e cinquenta ou um vírgula zero cinco | Adivinhar pelo contexto |
| D28 | Formulários com hook próprio sobre os mesmos esquemas Zod do contrato | Um só lugar para regras de validação, sem dependência nova | React Hook Form |
| D29 | Mensagens do Zod em português, com mensagens próprias nas listas de opções | Nenhuma mensagem em inglês chega ao usuário | Traduzir cada campo à mão |
| D30 | Rótulos de códigos centralizados por módulo; textos de cada tela ficam no componente | Só existe pt-BR; centralizar cada frase agora teria custo sem benefício | Arquivo único com todas as frases |
| D31 | Raças sugeridas carregadas pela migration, editáveis | Facilita o primeiro uso sem impor dados | Catálogo vazio |
| D32 | Propriedade em uso guardada na configuração do banco | Sobrevive ao reinício e não depende do navegador | `localStorage` |

## 10. Decisões Técnicas da Fase 2

| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| D33 | Gráficos em SVG próprio (`components/graficos`), com dica por mouse e teclado; cores nos tokens `--grafico-*`: azul para peso e ganho, laranja para perda | Poucos gráficos simples, app offline com CSP estrita, sem dependência nova. O par verde da marca e laranja reprovou no validador de daltonismo; azul e laranja passaram nos dois temas | Recharts ou ECharts, previstos na seção 3 |
| D34 | Alertas de pesagem calculados a cada consulta, nunca gravados, a partir de limites do usuário (`alertas.pesagem`) | Mudar um limite ou corrigir uma pesagem não deixa alerta velho no banco; os limites não são referência zootécnica | Coluna de alerta na pesagem; limites fixos no código |
| D35 | Um alerta conta como conferido se alguma das pesagens envolvidas foi confirmada depois que todas já existiam | Qualquer uma das pesagens comparadas pode ser a errada; uma pesagem nova reabre o alerta | Conferência presa só à pesagem apontada |
| D36 | Correção de pesagem passou a exigir motivo | Correções auditáveis pedidas na Fase 2. Muda o contrato da Fase 1 | Motivo opcional |
| D37 | Pesagem em lote com prévia no processo principal e gravação tudo ou nada; linha em branco não gera pesagem; alerta não bloqueia | Mesmo padrão da importação (D25); nenhum peso inventado; o produtor confere antes | Gravar as válidas e relatar as demais |
| D38 | Registro sanitário em duas tabelas: `manejo_sanitario` (dados comuns) e `evento_sanitario` (um por animal, com dose individual opcional) | Corrigir o produto ou a data de uma aplicação coletiva corrige todos os animais de uma vez, e o histórico individual continua completo | Tabela única `evento_sanitario` do planejamento (seção 3.3 de BANCO_DE_DADOS.md) |
| D39 | Catálogo próprio de produtos sanitários, começa vazio; carências do produto são só sugestão e são copiadas para cada registro | Nenhum produto ou carência inventado; mudar o cadastro do produto não altera registros passados | Ligar direto ao estoque (que só existe na Fase 3); trazer produtos prontos |
| D40 | Fim do prazo de carência = data da aplicação + dias de carência informados; 0 ou vazio = sem carência calculada (texto revisto em D51) | Regra aritmética simples, sem interpretar bula; o texto pede conferência com bula e veterinário | Calcular carência a partir do produto |
| D41 | Agenda sanitária em tabela própria (`agenda_sanitaria`); registrar pela agenda conclui o evento; excluir o registro reabre o evento | Agendar sem aplicação anterior e manter o vínculo entre o planejado e o realizado | Só uma coluna "próxima aplicação" no registro |
| D42 | Migration 0003 recria `historico_alteracao` para ampliar as listas de entidade e ação, copiando todas as linhas, e recria os gatilhos | SQLite não altera CHECK; a trilha continua só de inserção. Testado sobre banco da versão 2 com dados | Remover o CHECK; criar outra tabela de trilha |
| D43 | Escore corporal gravado na escala usada (1 a 5 ou 1 a 9), sem conversão nem interpretação | Interpretar a nota exigiria critério de fonte não consultada | Escala única convertida |
| D44 | Evolução do lote: ponto por data com a quantidade pesada; períodos agrupados pelo par de datas de cada animal | Comparação entre períodos com os mesmos animais, sem misturar grupos diferentes nem preencher quem não foi pesado | Média de todos os animais em cada data como se fossem o mesmo grupo |
| D45 | Listagem de animais aceita até 5000 por página | Pesagem em lote e aplicação coletiva mostram o lote inteiro | Paginação dentro da tela de pesagem |
| D46 | Custo sanitário opcional, em centavos, sem lançamento financeiro | Dinheiro em inteiros (regra 4); a integração é da Fase 4 | Lançamento financeiro automático |

Ajustes da aprovação condicional (ROADMAP.md, seção 9.7):

| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| D47 | Evolução do lote histórica: as permanências de cada animal no lote são reconstruídas de `movimentacao_animal` (`reconstruirPermanencias`, no domínio) e só as pesagens dentro delas entram. Inclui quem já saiu do lote ou do rebanho. Pontos mostram pesados e presentes na data; intervalos de GMD nunca atravessam uma ausência | A média de cada data precisa ser dos animais que estavam no lote naquela data. O histórico de movimentações já registra entrada, troca e saída, sem lacunas | Integrantes atuais com todas as pesagens (D44 original); tabela nova de composição do lote |
| D48 | Pesagem feita no dia de uma troca de lote conta para o lote de origem e para o de destino, com aviso na tela e contagem por data | Movimentação e pesagem têm só data, sem hora; é comum pesar na troca. Descartar essas pesagens tiraria o peso de entrada e de saída de quase toda transferência | Descartar as pesagens do dia da troca; adivinhar o lado pela ordem de registro |
| D49 | Animal cujo histórico de movimentações é incoerente (sem entrada, origem que não confere, movimento depois da saída, lote atual diferente do histórico) fica fora das médias, listado com o motivo | Pedido do usuário: mostrar a limitação em vez de gerar média historicamente errada | Usar o lote atual como se fosse o de sempre |
| D50 | Alertas de pesagem com categoria: conferência (digitação, pico isolado, peso repetido) ou desempenho (GMD fora da faixa). Novo parâmetro `intervaloCurtoDias` (inicial 7, operacional) que só marca o alerta; configurações antigas recebem o valor inicial | Perda de peso ou ganho alto não significam erro; em intervalo curto uma pequena diferença vira GMD grande. Marcar sem esconder mantém tudo visível | Esconder alertas de intervalo curto; limites diferentes por intervalo |
| D51 | Carência apresentada como "fim do prazo calculado", nunca como liberação; carne e leite separados; aviso fixo de que não é garantia nem autorização e de que vale a bula e a orientação do médico-veterinário. No código, `dataLiberacao` virou `fimCarencia` e `liberacao*` virou `fimCarencia*` / `fimPrazo` | A data é só uma conta sobre o que o usuário digitou | Manter "liberado a partir de" |
| D52 | Testes ponta a ponta abrem o app com o congelamento de temporizadores do Chromium desligado e, depois de um clique que troca de tela, esperam o título da tela nova antes de preencher | Com a janela coberta, a notificação não sumia e cobria botões; e a troca de tela do React Router é uma transição, então o preenchimento podia cair na tela anterior | Esperar tempo fixo; repetir testes que falham |

## 11. Decisões Técnicas da Fase 3

O estoque mantém as camadas existentes: packages/domain/src/estoque (regras puras), packages/shared-types/src/estoque (contratos Zod e DTOs), packages/database (migration 0004 e RepositorioEstoque), apps/desktop/src/main/services/estoque (transações/regras com banco), renderer/lib/consultas-estoque e renderer/paginas/estoque (telas e formulários). O preload continua genérico e tipado; renderer não acessa SQLite, Node ou arquivos. Nenhuma dependência foi adicionada.

| # | Decisão | Motivo |
|---|---|---|
| D53 | Quantidade em milésimos inteiros da unidade física e dinheiro em centavos, cálculos com BigInt | Precisão operacional explícita, sem acumular arredondamentos binários de valores monetários |
| D54 | Média móvel por item; ordem data/ordem/id; correção conserva ordem original | Resultado determinístico na mesma data e nas correções retroativas |
| D55 | Custo desconhecido NULL contamina conservadoramente a mistura até zerar/corrigir | Produção própria não é presumida gratuita; não se estima a fração valorada |
| D56 | Movimento substituído é cancelado logicamente, nova linha mantém substitui_id; custos posteriores recalculados e auditados | Preservar inputs e trilha sem permitir saldo negativo, inclusive intermediário |
| D57 | Saldo derivado, custo apropriado persistido; projeção SQL mínima para o recálculo e extrato paginado | Manter consistência sem tabela de saldo duplicada e reduzir custo de leitura |
| D58 | Lotes físicos de insumo separados de lotes de animais; destino explícito em toda saída | Rastrear quantidade, validade e custo apropriado por destino sem rateio antecipado |
| D59 | Catálogo sanitário global, item ativo por produto e propriedade, lotes físicos múltiplos | Produto pode existir em fazendas diferentes com estoque independente |
| D60 | Baixa sanitária explícita na transação do manejo; IDs de requisição únicos | Não converter dose/frasco nem duplicar baixa em repetição; rollback integral em falha |
| D61 | Reconciliação explícita para mudar baixa/data/produto; confirmar manutenção ao retirar animal e estorno ao excluir | Evitar estorno proporcional ou automático incorreto e preservar sanidade anterior |
| D62 | MN explícita em alimento; perfis científicos e FK de alimento ficam para a Fase 5 | Não misturar quantidade física, MS e composição nem criar tabelas científicas antecipadas |
| D63 | IDs de movimento, origem e substituição preparam financeiro; nenhum lançamento automático | Separar aquisição, entrada, consumo e pagamento e permitir deduplicação futura |
| D64 | Mudança de data que invalidaria consumo de estoque é recusada, nunca corrigida sozinha: saída do animal (consumo ativo posterior), encerramento do lote (consumo posterior) e nova formação do lote (consumo anterior). Só conta movimento ativo; a consulta é de leitura em `RepositorioEstoque` e a regra e a mensagem ficam nos serviços do rebanho | A validade do destino era conferida só na hora do lançamento; alterar custo ou movimento por conta própria apagaria história. O usuário corrige no Estoque e repete |
| D65 | A repetição idempotente compara o movimento campo a campo (`mesmosDadosDoMovimento`), com a lista de campos tipada para o compilador acusar campo novo esquecido | `JSON.stringify` dependia da ordem das propriedades do esquema Zod |
| D66 | Estoque mínimo: em branco desliga o alerta; zero avisa só com saldo zerado; maior que zero avisa com saldo menor ou igual. Regra `abaixoDoMinimo` no domínio, em milésimos inteiros, repetida em linguagem simples na interface | Zero e vazio tinham significados implícitos diferentes; a regra agora é única, testada e visível |

Precisão, política de custos ausentes, limites das consultas e validação estão em ROADMAP.md seção 10 e BANCO_DE_DADOS.md seção 9. As fases seguintes continuam dependentes de nova aprovação.

## 12. Decisões Técnicas da Fase 4A (base financeira)

Detalhes e plano das demais entregas em PLANO_FASE_4.md. Migration 0005.

| # | Decisão | Motivo |
|---|---|---|
| D67 | Competência (lançamento), caixa (pagamento) e custo apropriado são conceitos separados. A 4A cobre competência e caixa; o custo apropriado vem nas entregas seguintes, sem criar lançamentos a partir de estoque, sanidade ou rebanho | Evitar contar o mesmo dinheiro duas vezes e não inventar movimento financeiro |
| D68 | Dinheiro em centavos inteiros. Texto digitado vira centavos por análise de caracteres (`interpretarCentavos`), nunca por multiplicação de decimais; `1.234` sozinho é recusado como ambíguo. Divisão de dinheiro só por `dividirProporcional` (maior resto, desempate por id) | Nenhuma perda de centavo e nenhum erro de ponto flutuante |
| D69 | Condição de pagamento não informada = lançamento pendente de definição, com saldo `null` (desconhecido). À vista não cria pagamento sozinho | Ausência de parcelas não é ausência de obrigação; pagamento só existe por ação do usuário |
| D70 | Situação do lançamento e da parcela é derivada (`resumirLancamento`, `situacaoDaParcela`), nunca gravada. Filtro por situação ou busca roda em memória sobre o conjunto já filtrado pelo SQL | Uma única fonte da regra, sem estado duplicado que possa divergir |
| D71 | Pagamento só pode ser estornado e parcela só pode ser reduzida ao valor pago ou cancelada na renegociação; o banco garante com gatilhos (saldo, parcela ativa, imutabilidade, cancelamento só sem pagamento) | Defesa em profundidade: o serviço e o banco recusam o mesmo erro |
| D72 | Trilha sem lista fechada no banco (só formato); catálogo `ENTIDADES_HISTORICO` e `ACOES_HISTORICO` no `RepositorioHistorico`, única porta de escrita, validada em execução; um teste varre o código para garantir isso | Decisão D-I do usuário: evitar recriar a tabela a cada fase mantendo rigor |
| D73 | Criação de lançamento e de pagamento são idempotentes por `requisicao_id` único, comparando o conteúdo campo a campo | Clique duplo ou repetição não duplica dinheiro |
| D74 | Categoria tem tratamento (resultado, estoque, ativo animal, fora do resultado) e `origem_exigida`; classificação fixo ou variável é copiada ao lançamento na criação (D-E) | Base da regra anti-duplicidade e estabilidade de relatórios passados |
| D75 | Mudança de data de animal ou lote e exclusão de animal ou propriedade consideram lançamentos ativos, como já faziam com o estoque (`descreverLancamentosConflitantes`) | A validade do destino era conferida só no lançamento |
| D76 | Testes de propriedade e de sequências com gerador determinístico no domínio (`criarGeradorDeterministico`), sem dependência nova; falha reduz a sequência ao menor caso | Decisão D-K do usuário |
| D77 | Estado de apuração (`completa`, `parcial`, `desconhecida`, `nao_apurada`) como tipo do domínio, com soma associativa; zero conhecido difere de desconhecido | Base para custos das entregas 4C a 4G |
| D78 | Consultas de caixa (fluxo, contas, painel) são somente leitura e agregadas no SQL por dia, natureza e categoria; períodos montados por função pura do domínio; realizado (pagamentos) e previsto (parcelas em aberto) nunca somados | Evita lucro falso e mantém os números reproduzíveis por uma soma independente (`conferirCaixa`) |
| D79 | Lançamento com condição não informada fica fora do previsto e das contas e é sinalizado à parte com o valor da operação | Saldo desconhecido nunca vira zero (D-C) |
| D80 | Classificação em lote só por ação explícita com prévia, conferência de padrão e quantidade e trilha por lançamento (ação `classificacao_lote` no catálogo); sem migration na 4B | Decisão D-E; `classificacao_custo_origem` fica para a entrega que a usar |
| D81 | A negociação de animais é a dona do fato: guarda os animais e a parte do valor de cada um; o dinheiro mora no lançamento ligado (origem `negociacao_animal`), criado na mesma transação. Um item ativo por animal e tipo | "Um fato, um dono": compra e venda sem despesa ou receita duplicada |
| D82 | Alocação do valor entre animais no domínio (`alocarPrecoDeAnimais`), com critério padrão pela unidade do preço; o renderer simula com as mesmas funções e o servidor sempre recalcula. Peso ausente bloqueia, nunca cai em "igual" | Decisão D-D; soma exata |
| D83 | Venda usa o mesmo fluxo de saída do rebanho; cancelar venda desfaz a saída; cancelar compra só quando o animal está intocado e exclui logicamente o cadastro | Integridade entre rebanho, estoque, sanidade e financeiro |
| D84 | Desfazer saída cancela logicamente a movimentação de saída, registra troca de lote na data da saída quando o destino difere e exige escolha explícita se o lote de origem foi encerrado (ação `reversao_saida` na trilha) | Decisão D-H |
| D85 | Custo anterior é registro próprio sem caixa; rateio de lote igual, confirmado, entre os animais presentes ao fim do dia da data de referência; conferência contra lançamentos e consumos já existentes pede confirmação; animal com compra registrada é recusado | Decisão D-G e requisito de evitar dupla contagem |
| D86 | Custo de aquisição e formação do animal pelo domínio (`apurarAquisicaoEFormacao`): nascido tem aquisição "não aplicável" e formação "não apurada" até haver custo anterior informado; nunca zero | Decisão D-F; outras parcelas somam por `somarApuracoes` nas entregas 4D a 4G |
| D87 | A nota de insumos é um lançamento (dono do dinheiro) com itens; cada item é dono do vínculo com UMA entrada de compra do estoque (dona da quantidade e do custo médio). A entrada nasce do item, com o item como documento de origem, e leva o valor dele (com o frete rateado por valor) como custo de entrada | Um fato, um dono: comprar não é gastar; nenhuma despesa de resultado nasce de entrada ou consumo |
| D88 | Entrada ligada a uma compra só é corrigida ou cancelada pela compra (o estoque recusa a alteração direta); a correção usa a correção auditada do estoque, que recalcula o custo médio e os custos apropriados; se o estoque recusar, nada muda | Consistência de correções retroativas e cancelamentos |
| D89 | O custo de consumo é lido do estoque (`custo_apropriado_centavos`), nunca recalculado no financeiro; consumo sem custo é "desconhecido" (apuração por contagens) e torna o total parcial; consumo da propriedade é "não alocado" até o rateio | Decisões D-E e D-F; custo desconhecido nunca vira zero |
| D90 | Custo sanitário por componentes com fonte única: baixas de estoque, serviços lançados (origem `sanitario`) e, só se não houver nenhum dos dois, o valor digitado no registro; dividido por igual entre os animais tratados | Plano 5.6: sem dupla contagem do custo sanitário legado |
| D91 | Auditor de consistência (`auditoria:pendencias`) aponta sem corrigir; vínculo retroativo 1:1 não altera valores e a diferença vira pendência; classificação fixo ou variável por item de estoque em `classificacao_custo_origem` | Plano 5.5 e 9.3 |
| D92 | Apropriação de custos por linhas de custo e divisão pura: custo de animal vai ao animal; custo de lote é dividido por igual entre os animais presentes ao fim de cada dia (por lote, dia e categoria, maior resto); custo da propriedade só sai de "não alocado" por rateio; custo sanitário é dividido entre os animais tratados | Conservação: animais + lotes sem animais + não alocado = soma de origem; um fato, um dono |
| D93 | O rateio grava pesos inteiros, nunca valores; o valor é recalculado a cada leitura a partir do valor atual da origem | Correções e cancelamentos retroativos fecham sem rateio desatualizado |
| D94 | Critérios cabeças, animal-dias, peso e manual; os automáticos geram pesos por lote; peso exige pesagem real recente de todos os animais e a idade máxima é escolhida pelo usuário; sem dado, o critério fica indisponível e diz o motivo | Regra 1 (nada estimado) |
| D95 | Só despesas manuais da propriedade e consumos de estoque da propriedade são rateáveis; compra para estoque, registro sanitário e despesas de outros módulos não; no máximo um rateio ativo por custo (índice único parcial e verificação no serviço) | Nunca contar o mesmo custo duas vezes |
| D96 | Revisar cria versão nova (`substitui_id`) e cancela a anterior com motivo; o rateio de consumo segue a cadeia de correções do estoque até o movimento vigente; origem cancelada deixa o rateio sem efeito e sinalizado | Histórico auditável sem apagar |
| D97 | Estados de apuração do animal: sem custo de aquisição nem custo anterior informado a apuração é parcial ou "não apurada"; custo desconhecido nunca vira zero; histórico de lote inconsistente tira o animal da divisão por lote e gera aviso | Regra 2 (ausente é ausente) |
| D98 | Produção própria por centro de produção com vínculos próprios (`centro_producao_consumo`, `centro_producao_lancamento`), sem recriar `lancamento_financeiro` nem `movimentacao_estoque` | Plano 3.5 e 5.9 |
| D99 | Custo vinculado a centro tem um dono só: sai do "não alocado", da apropriação e do rateio (gatilho do rateio recriado na 0009); ao encerrar vira o custo de entrada do item produzido e chega aos animais pelo consumo | Nunca contar o mesmo custo duas vezes |
| D100 | Encerrar cria a `entrada_producao` pelo serviço do estoque com a quantidade colhida informada; algum componente desconhecido deixa a entrada com custo desconhecido; centro sem componente não encerra | Regras 1 e 2 (nada inventado; ausente é ausente) |
| D101 | Centro encerrado congela seus custos e a entrada (gatilhos e serviços); reabrir cancela a entrada, e o estoque recusa se o produto já foi consumido além do saldo | Integridade de estoque e histórico |
| D102 | Com o centro aberto, a correção do consumo leva o vínculo ao movimento novo e o cancelamento da despesa ou do consumo desfaz o vínculo; mudar o destino exige desvincular | Correções retroativas sem inconsistência |
| D103 | Resultado, margens, indicadores, conciliação e projeção são derivados das mesmas linhas de custo da apropriação e dos lançamentos, pagamentos e vendas; nada é gravado | Um fato, um dono; correções retroativas refletem sozinhas |
| D104 | Resultado do período por competência: custos do período + aquisição e custo anterior dos animais que saíram; animal no rebanho é ativo; caixa lado a lado, nunca somado | Plano 5.10 e 5.10.1 |
| D105 | Custo da baixa = custo acumulado do animal até a data da saída (apropriação com limite por animal); morte é perda; venda sem negociação tem receita não registrada | Plano 5.4 e 5.10 |
| D106 | Margem bruta e ponto de equilíbrio dependem da classificação e mostram cobertura e motivos; cada linha de custo carrega suas partes classificadas | D-E |
| D107 | Indicadores por @ separados por base (carcaça e viva), 15 kg/@; custo por kg ganho só com duas pesagens no período e sem aquisição | D-B; regra 2 |
| D108 | Conciliação por linhas com mapeamento único de cada pagamento e de cada parte de custo; Σ diferenças = diferença total | Plano 7 (Conciliação) |
| D109 | Projeção por premissas do usuário, sem gravar nem somar a totais, sem estimar peso de carcaça nem extrapolar histórico | Plano 5.10 |
| D110 | Desempenho sem materializar: índices (0010), leituras em lote e memorização das linhas de custo com chave na conexão e no contador de escritas (`total_changes()`) | RNF-03; materialização fica pendente de aprovação |
| D111 | Relatórios gerenciais (4H) montados pelos mesmos serviços das telas num modelo neutro (seções, indicadores, colunas tipadas: texto, data, dinheiro, apuração, quantidade, inteiro); CSV e HTML gerados no main por funções puras; nada é gravado no banco | Um número, um cálculo; regra 7 (renderer sem disco) |
| D112 | PDF por `printToPDF` numa janela oculta com sandbox, isolamento, sem JavaScript e sem preload; HTML escapado com CSP `default-src 'none'`, lido de arquivo temporário apagado no fim; a sessão já bloqueia rede e a janela não é remetente IPC autorizado | D-J; regra 9 (sem rede) |
| D113 | CSV UTF-8 com BOM, `;` e CRLF; dinheiro em centavos e em reais; apuração com a situação; desconhecido vazio e "desconhecido", nunca 0; prefixo `'` contra fórmula só em texto livre | D-J; regra 2 (ausente é ausente) |
| D114 | CPF ou CNPJ das contrapartes só sai com opção explícita; sem ela, o relatório avisa a omissão | D-J (privacidade) |
| D115 | Conferência financeira cruza apropriação, conciliação, caixa (contra o fluxo) e resultado (contra a conciliação) e lista as pendências; qualquer verificação que não fecha gera aviso para não usar os números | Plano 9.3, item 7 (auditor de consistência) |
| D116 | Completude do resultado por regra única no domínio (`apurarResultado`): completo, parcial (no máximo, no mínimo ou sem limite) ou não apurado (`null`), a partir das receitas conhecidas e desconhecidas e do custo apurado; telas e relatórios usam os mesmos textos (`textos-completude.ts` no shared-types) | Revisão final da Fase 4; regra 2 (ausente é ausente) |
| D117 | Receita de uma saída: venda negociada = valor alocado, conhecido mesmo sem recebimento (recebimento é caixa); morte = zero conhecido (perda); venda ou descarte sem negociação = desconhecida | Separação entre competência e caixa |
| D118 | Devolução de animais é operação própria (`devolucao_animal`, `devolucao_animal_item`) vinculada à negociação original, que fica intacta; no máximo uma devolução ativa por item; a negociação original não é cancelada com devolução ativa | Decisão do usuário (2026-10-18); histórico preservado |
| D119 | Venda devolvida: retorno por nova movimentação `entrada` na data da devolução (sem recriar `movimentacao_animal`); a reconstrução de permanências aceita "saída → entrada"; o período fora do rebanho fica bloqueado para fatos do animal | Opção A; nada retroativo |
| D120 | Compra devolvida: saída pelo fluxo do rebanho com status técnico "vendido" (sem recriar a tabela de animais) e identificação "Devolvido ao fornecedor" pela ligação da saída à devolução, fora das vendas nos totais e indicadores | Decisão do usuário: distinção semântica sem recriar a tabela |
| D121 | O valor acordado vira lançamento `tipo = devolucao` ligado ao original (venda devolvida: despesa; compra devolvida: receita), com categorias próprias criadas pela 0011 e achadas pelo id | 0005 já previa o tipo; nada de lançamento manual |
| D122 | Compensação (`compensacao_financeira`) liquida sem caixa o que está em aberto na negociação original, a partir das parcelas de vencimento mais tarde; saldo = valor − pago − compensado; parcela e lançamento com compensação ativa não são cancelados | O total da negociação é imutável; nenhum pagamento fictício |
| D123 | Resultado da devolução de venda na data da devolução: dedução da receita pelo valor acordado e estorno da baixa capitalizada (aquisição, custo anterior, acessórios) até a data da saída original; o realizado mostra o custo acumulado que volta | Opção A; sem dupla contagem: cada saída baixa, cada retorno estorna |
| D124 | Índice único de item ativo por animal e tipo (0006) virou gatilho que ignora itens devolvidos, para permitir revender o animal devolvido | Mudança de schema só por migration nova |
| D125 | O desfazer saída genérico do rebanho recusa a saída de venda ou de devolução ao fornecedor: elas só se desfazem pelo cancelamento da operação dona | Defeito achado pelas sequências aleatórias |

## 13. Decisões Técnicas da Fase 5A (banco de alimentos)

Plano e decisões do usuário em [PLANO_FASE_5.md](PLANO_FASE_5.md) (D5-1 a D5-9).

| # | Decisão | Motivo |
|---|---|---|
| D126 | Regras puras do banco de alimentos em `packages/domain/src/alimentos/` (vocabulário, número publicado, unidades, fluxo de conferência, regras por origem, catálogo inicial); nada de composição no `nutrition-engine` | Regra 8; o motor de cálculo só nasce na Fase 6 |
| D127 | Número publicado lido só por `lerNumeroPublicado(texto, separador)`: o separador decimal da fonte é informado no registro (vírgula ou ponto), o separador de milhar só é aceito em grupos de três, e valores censurados ou qualitativos ("<0,01", "ND", "traços") são recusados | D5-3; não adivinhar "1.050"; ausente é ausente (regra 2) |
| D128 | Conversões só entre unidades da mesma grandeza, com fator de potência de dez em relação a mg/kg e limpeza do ruído binário (15 algarismos); energia (Mcal/kg) e atividade (UI/kg) sem conversão definida | Fatores são definições de unidade, não dados científicos; conversão nova exige cadastro e teste |
| D129 | Fluxo de conferência com cinco status (rascunho, transcrito, conferido, rejeitado, substituído) e seis pares permitidos; a lista do domínio é a mesma do gatilho da migration 0012 | D5-4 e D5-5; uma única definição do fluxo |
| D130 | Catálogo inicial de definições como constante do domínio com ids fixos, inserido pela migration 0012 e conferido por teste; direção conservadora derivada do grupo pela regra 5.4; método sempre nulo e situação "pendente" | D5-2 modificada pelo usuário; nada marcado como fundamentado sem fonte |
| D131 | Uma migration (0012) com todas as tabelas da 5A e o catálogo inicial; nenhuma tabela existente recriada | Plano, seção 4; teste de hash a partir da versão 11 |
| D132 | Propriedade do laudo e da medição na fonte; data da amostra no registro | D5-9 sem duplicar a propriedade em cada registro |
| D133 | Unicidade do valor por registro, nutriente, tipo **e base**: a mesma fonte pode publicar o nutriente em MS e em MN, e os dois ficam como publicados | Regra 3c |
| D134 | Erros de gatilho (`SQLITE_CONSTRAINT_TRIGGER`) viram `OPERACAO_INVALIDA` com a mensagem do banco; o serviço confere antes, com mensagem própria | Defesa em profundidade sem vazar erro interno |
| D135 | `RepositorioHistorico.listarEmOrdem` desempata eventos do mesmo instante por `rowid`; `listar` dos módulos anteriores não mudou | UUID v7 não é monotônico dentro do mesmo milissegundo |
| D136 | O renderer envia o número só como texto publicado; o número para cálculo é derivado no main com o separador do registro, e a troca do separador relê tudo ou nada | D5-3; uma única função de leitura |
| D137 | Nova versão nasce rascunho com cópia de cabeçalho e valores; a anterior segue conferida até a nova ser conferida, e a substituição acontece na mesma transação | D5-5; sempre existe uma versão conferida vigente |
| D138 | Consultas do banco de alimentos desempatam por `rowid` (ordem de inserção), e o catálogo é exibido na ordem de cadastro | Ordem estável com UUID v7 do mesmo milissegundo |
| D139 | Atalhos de rótulo, laudo e MS medida (`ServicoAtalhosAlimentos`) compõem os serviços de fonte, alimento, registro e valor numa transação; o registro nasce em rascunho e segue o fluxo de conferência | Sem caminho paralelo de gravação; erro em qualquer valor desfaz tudo |
| D140 | MS medida grava o valor na unidade e na base de referência da definição (MS: % da matéria natural); o método e as limitações ficam na fonte de medição própria da propriedade e podem ser reaproveitados | D5-8 |
| D141 | Valores do registro exibidos na ordem do catálogo e, dentro da definição, na ordem de transcrição | Mínimo e máximo garantidos na ordem do rótulo |
| D142 | Módulo "Banco de alimentos" com rotas próprias (`/alimentos/...`) e textos em `textos-alimentos.ts`; a ficha consulta cada registro para mostrar valores e a lista do que a fonte não informa | Poucos registros por alimento; sem duplicar a leitura no main |
| D143 | Vínculo com o estoque por canais próprios (`vinculoAlimento:*`), sem mudar `estoque:obter` nem o tipo do item; trilha com a entidade `estoque_item_alimento` e o id do item | Não alterar contratos do estoque já em uso |

## 14. Decisões Técnicas da Fase 5B (curadoria do CQBAL 4.0)

Autorização do usuário em 2026-10-21, na aprovação da 5A; relatório em ROADMAP.md, seção 23.

| # | Decisão | Motivo |
|---|---|---|
| D144 | Valor não quantificado em tabela própria (`valor_nao_quantificado`, migration 0013), sem coluna numérica, em vez de tornar `valor` anulável em `valor_nutricional` | Pedido do usuário: "<0,01", "ND" e traços não viram número. Separados, nenhum cálculo da Fase 6 que leia `valor_nutricional` os encontra por engano; sem recriar a tabela da 0012 |
| D145 | A natureza (abaixo do limite, não detectado, traços, não determinado, símbolo sem definição) é escolhida por quem transcreve, pela legenda da fonte, e o significado da fonte é obrigatório; o domínio só confere coerência (símbolo do limite, texto que é número vai para o valor numérico) | "ND" significa coisas diferentes em fontes diferentes; adivinhar pelo símbolo inventaria significado |
| D146 | O limite de "<0,01" é conferido como número legível com o separador da fonte, mas não é gravado nem exposto como número | Pega erro de digitação sem criar um número que alguém possa usar em cálculo |
| D147 | Registrador de falhas do Vitest (`vitest-registro-falhas.ts`) acrescenta cada teste falho em `test-results/falhas-vitest.jsonl`, ignorado pelo git | Acompanhar a falha intermitente da 5A-3, de causa não comprovada; a saída daquela execução se perdeu |
| D148 | Pacote de curadoria como constante tipada do domínio (`PacoteCuradoria`, `packages/domain/src/alimentos/pacotes/`), conferida por `problemasDoPacote` e por teste; importado só pelo botão "Importar para conferência" | Os dados viajam com o aplicativo (sem rede, regra 9), mas só entram no banco por ação do usuário. Pacote novo ou corrigido é versão nova, sem migration de dados |
| D149 | `ServicoCuradoria` grava pelos mesmos serviços do cadastro manual (`criarFonte`, `criarAlimento`, `composicao.criar`, `salvarValor`, `transcrever`) numa transação; os registros terminam "transcritos" em nome de quem transcreveu o pacote | As mesmas conferências de valor, unidade, grandeza e origem; qualquer erro desfaz tudo; a conferência é sempre do usuário (D5-4) |
| D150 | Fonte com o mesmo código é reaproveitada se tiver a mesma origem; alimento com o mesmo nome só se tiver a mesma identidade (espécie, cultivar, parte, forma, processamento, classe, não comercial); senão a importação é recusada inteira | Não misturar registros com uma identidade diferente da que o usuário cadastrou |
| D151 | `importacao_curadoria` guarda os ids criados (`resumo_json`) e impede importar duas vezes a mesma versão | Rastrear de qual pacote veio cada registro sem alterar `registro_composicao` |
| D152 | Registro de pacote pode ter `bloqueio` (motivo): fica no pacote e aparece no quadro, mas não é importado; alimento só com registros bloqueados não é criado; o resumo da importação guarda os bloqueados | Decisão do usuário (Marandu): manter a identificação original rastreável sem deixar entrar dado de correspondência não conferida |
| D153 | Importar uma versão de pacote é recusado se outra versão do mesmo código já foi importada | As versões trazem os mesmos registros; correção depois da importação é pela conferência (rejeitar ou nova versão), nunca duplicando registros |

## 15. Decisões Técnicas da Fase 5C (Embrapa e estudos individuais)

Decisões do usuário ao autorizar a 5C (2026-10-21); plano em PLANO_FASE_5.md, seção 12; relatório em ROADMAP.md, seção 24.

| # | Decisão | Motivo |
|---|---|---|
| D154 | Forma de obtenção por valor numérico, com lista fechada e "não informado" como padrão; NIR separado de equação | Medido, calculado e estimado nunca se confundem; NIR é estimativa por calibração, não análise de referência nem equação publicada |
| D155 | Vínculo de possível mesma origem em tabela própria, declarado pelo pacote com evidência e decidido só pelo usuário; `registrosIndependentes` no domínio: vinculados a confirmar ou confirmados não são independentes, só o descarte devolve a independência | Uma compilação pode conter os dados de um estudo também cadastrado; contar os dois como observações independentes inflaria a evidência (regra 3d) |
| D156 | O outro lado do vínculo é identificado por código da fonte e página ou tabela, e localizado na importação de qualquer pacote (pendentes resolvidos depois) | Funciona em qualquer ordem de importação e com registros já importados, sem alterar `registro_composicao` |
| D157 | Pacote CQBAL versão 3: só ganha a forma de obtenção (NDT OBS como medido, pela classificação do próprio CQBAL, com a divergência anotada onde a publicação de origem não informa o método); valores inalterados | Preservar a distinção pedida sem refazer a curadoria aprovada |

Decisões dos ajustes da aprovação da 5C (2026-10-21); detalhes em PLANO_FASE_5.md, seções 12.3 a 12.7.

| # | Decisão | Motivo |
|---|---|---|
| D158 | Base interpretada é campo próprio do valor (`interpretacao_base`, migration 0016): vazio, base declarada pela fonte; preenchido, a interpretação e o motivo. A tela marca o valor como "base inferida" | Uma base inferida, mesmo aceita pelo usuário, não pode parecer confirmação da fonte; a 5D precisa distinguir os dois casos sem ler texto livre |
| D159 | Versão nova de pacote já importado entra por **atualização** (`curadoria:atualizar`), não por nova importação. Registros casados pela página ou tabela; transcrito pelo pacote é corrigido no próprio registro (rascunho, edição, nova transcrição); conferido recebe versão nova; o que o usuário edita, rejeitou ou descartou não muda e fica listado | Substitui D153: preserva os dados das versões anteriores e corrige com trilha, sem duplicar registros nem passar por cima da conferência |
| D160 | Pacotes CQBAL versão 4, CT 79 versão 2 e CT 261 versão 2: só a base interpretada sai da observação para o campo próprio (e a nota de MM/CZ do CQBAL ganha os nomes do site); números inalterados | Aplicar a decisão 1 da aprovação sem refazer curadoria conferida |
| D161 | BPD 100 da Embrapa Meio-Norte em curadoria limitada (duas linhas de três tabelas), com a frase de direitos e a autorização de uso pessoal na fonte; Marandu bloqueado também nele | Uso autorizado pelo usuário sem copiar tabelas integralmente; a decisão sobre o Marandu vale para o alimento, não só para o registro do CQBAL |
| D162 | MM e CZ do CQBAL continuam separados; métodos do CT 261 ficam nos valores dele, não na definição | As publicações lidas usam "matéria mineral" e "cinzas" para o resíduo da incineração, mas o CQBAL mantém duas séries sem explicar a diferença: remapear seria generalização sem base |

Decisões da Fase 5D (2026-10-22); detalhes em PLANO_FASE_5.md, seções 13.10 e 13.11.

| # | Decisão | Motivo |
|---|---|---|
| D163 | Seleção, origens, agregação, cenários e montagem de perfil como funções puras do domínio (`selecao.ts`); o serviço só lê o banco e grava o perfil | Testáveis com casos sintéticos e propriedades; a mesma regra roda na tela e no serviço |
| D164 | Regra de seleção versionada no código, com o conteúdo canônico e um SHA-256; o banco guarda só a aprovação do usuário (versão e hash). Sem aprovação, nenhum perfil é gravado; conteúdo diferente do aprovado não vale | Versão imutável e auditável sem tabela de parâmetros editável; mudar a regra exige versão nova e nova aprovação |
| D165 | Origem independente por união transitiva: mesma publicação de estudo individual, mesmo experimento declarado na fonte e vínculo não descartado, inclusive passando por registros fora da busca | Decisões 8 e 9: nenhum dado conta duas vezes |
| D166 | Agregação por classe (unidade convertida só entre unidades da mesma grandeza, base, tipo de valor, forma de obtenção e método normalizado); classes nunca se combinam; tratamento múltiplo de uma origem exige escolha do usuário | Decisão 7, sem equivalência de método cadastrada; decisão 9 |
| D167 | Cenário = perfil inteiro de um registro real no extremo de um nutriente com direção definida, rotulado por esse nutriente; empate lista os registros e o usuário escolhe | Decisão 4: coerência entre nutrientes e nenhum nutriente isolado como qualidade global |
| D168 | Avaliação científica em tabela própria, fora do registro: "uso com cautela" (registro ou valor) e "base validada" (valor com base inferida), retiráveis uma vez com motivo | Decisão 11: separa fidelidade da transcrição de adequação científica, sem tocar no registro conferido |
| D169 | Perfis imutáveis desde a gravação (gatilhos), com a origem de cada valor | Cálculos futuros reproduzíveis (MODELOS_NUTRICIONAIS.md, 4.3) |
| D171 | Só a versão vigente (a mais nova) da regra de seleção é executada e pode ser aprovada; versões anteriores ficam no código só para reproduzir perfis antigos | Aprovação definitiva da Fase 5: novas aprovações e seleções usam a v2 |
| D172 | Exigências nutricionais calculadas no main (`ServicoExigencias`, canal `nutricao:calcularExigencias`) e mostradas pelo renderer; o renderer não importa o motor. Sem banco: nada gravado até a avaliação de dieta (6B) | Uma única fonte do cálculo (como D82); validação Zod nos dois lados; a avaliação imutável da 6B nasce no main |
| D173 | Resultado do motor com `avisos` (limitação científica, domínio provisório, restrição de aplicação) separados de `notas` (informação fixa); mensagens com números em português e unidade, sem mudar o valor guardado | Aprovação definitiva da 6A: o selo de aviso só destaca o que pede atenção; leitura pelo produtor |
| D170 | Regra `SELECAO_5D` versão 2 (`idadeTextual: 'verificada'`): idade escrita só no texto da classe da fonte exclui quando difere da buscada e fica pendente de validação quando igual; a versão 1 fica no código com o comportamento antigo | Correção da aprovação da 5D: o nome da classe não prova a idade (o CQBAL já mostrou classe inconsistente), mas também não é idade desconhecida; versionar mantém perfis antigos reproduzíveis |
