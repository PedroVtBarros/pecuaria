# CLAUDE.md

Guia para sessões de desenvolvimento com Claude Code neste projeto.

## Projeto

Sistema pessoal de gestão pecuária (corte e leite). Desktop Windows, 100% offline.
Código em `C:\dev\pecuaria` (monorepo npm workspaces). A pasta original no OneDrive foi mantida, mas não é mais a fonte.
Stack em uso: Electron 44, electron-vite 5, Vite 7, React 19.2, TypeScript 6.0 strict, Tailwind 4, React Router 7 (HashRouter), TanStack Query 5, Zod 4, better-sqlite3 13, Vitest 4, Playwright 1.63, electron-builder 26. Versões e motivos em ARQUITETURA.md, seções 3 e 7.

Documentos de referência, leia antes de mudar algo relevante:
- [REQUISITOS.md](REQUISITOS.md): requisitos funcionais e não funcionais.
- [ARQUITETURA.md](ARQUITETURA.md): camadas, monorepo, fluxo de dados.
- [BANCO_DE_DADOS.md](BANCO_DE_DADOS.md): modelo de dados e convenções.
- [MODELOS_NUTRICIONAIS.md](MODELOS_NUTRICIONAIS.md): regras científicas do motor de nutrição.
- [ROADMAP.md](ROADMAP.md): fases, testes, backup, mobile.
- [PLANO_FASE_4.md](PLANO_FASE_4.md): plano, decisões e entregas do financeiro.
- [PLANO_FASE_5.md](PLANO_FASE_5.md): plano, decisões e entregas do banco de alimentos.
- [PLANO_FASE_6.md](PLANO_FASE_6.md): plano, decisões e entregas do motor nutricional BR-CORTE.

## Estado Atual

**Fase 0 aprovada e encerrada no commit `9e04975` (marca `fase-0`).**

**Fase 1 (rebanho) aprovada e encerrada no commit `fe110e5` (marca `fase-1`).** Relatório em ROADMAP.md, seção 8. Pesagens individuais e GMD observado foram antecipados da Fase 2 a pedido do usuário.

**Fase 2 (pesagens, evolução e sanidade) aprovada e encerrada no commit com a marca `fase-2` (2026-10-15)**, depois dos ajustes da aprovação condicional (ROADMAP.md, seção 9.7). Relatório em ROADMAP.md, seção 9. **Fase 3 aprovada pelo usuário e encerrada com a marca `fase-3`; migration 0004 e relatório na seção 10 do ROADMAP.md. Ajustes de integridade posteriores à tag (ROADMAP.md, seção 10.7) estão no commit `90a48de`; sem migration nova.**

**Fase 4 (financeiro) aprovada e encerrada com a marca `fase-4` (commit `3287b46`, 2026-10-21).** Plano em [PLANO_FASE_4.md](PLANO_FASE_4.md); entregas 4A a 4H (migrations 0005 a 0010), ajustes da revisão final e devolução de animais (migration 0011). Relatórios em ROADMAP.md, seções 11 a 21. Pendente de decisão do usuário, sem bloquear a Fase 5: materializar agregados para a primeira consulta de resultado ficar abaixo de 300 ms na escala máxima (ROADMAP.md, seção 20.2).

**Fase 5 (banco de alimentos):** plano em [PLANO_FASE_5.md](PLANO_FASE_5.md), decisões D5-1 a D5-9 aprovadas em 2026-10-21 (D5-2 modificada: catálogo inicial de definições sem método analítico; D5-6: seletor, perfis e cenários só na 5D). **Autorizada só a etapa 5A (entregas 5A-1 a 5A-5), em sequência, com um commit por entrega e sem aprovação intermediária; aprovação do usuário ao fim da 5A. 5B, 5C e 5D bloqueadas pelos portões do plano.** Etapa 5A implementada em 2026-10-21 (migration 0012; ROADMAP.md, seção 22) e **aprovada pelo usuário** na mesma data, com o ajuste de preservar "<0,01", "ND" e traços sem virar número. **Etapa 5B autorizada e implementada em 2026-10-21** (ROADMAP.md, seção 23): valores não quantificados (migration 0013), portão do CQBAL 4.0 verificado (PLANO_FASE_5.md, seção 11: acesso público, **sem termos de uso publicados**, curadoria restrita), importação de pacote só por ação do usuário (migration 0014, definição FDNcp) e o pacote `CQBAL_4_0_5B` (12 alimentos, 18 registros, 194 valores, gerado por script e conferido contra as respostas do site). Os registros entram "transcritos"; a conferência é do usuário. **5B aprovada tecnicamente pelo usuário em 2026-10-21**, com ajustes no pacote (versão 2: idade de corte do Capiaçu só em 70 e 110 dias, apoiada no Comunicado Técnico 79 da Embrapa; Marandu bloqueado para importação; MS, NDT, MM/CZ e licença registrados; ROADMAP.md, seção 23.5). Pacote importa 11 alimentos, 17 registros e 182 valores. Nada importado no banco operacional. 5B aprovada pelo usuário (commit `4a48345`).

**Fase 5C (Embrapa e estudos individuais) autorizada e implementada em 2026-10-21** (PLANO_FASE_5.md, seção 12; ROADMAP.md, seção 24): forma de obtenção de cada valor e vínculos de possível mesma origem entre registros (migration 0015); pacote CQBAL versão 3; pacotes do Comunicado Técnico 79 (2016), do CT 263 (2021) e do CT 261 (2020) da Embrapa sobre o BRS Capiaçu (18 registros, 84 valores, 14 vínculos a confirmar). Nada importado no banco operacional. **5C aprovada tecnicamente pelo usuário em 2026-10-21**, com ajustes (PLANO_FASE_5.md, seções 12.3 a 12.7; ROADMAP.md, seção 24.5): base interpretada como campo próprio do valor (migration 0016), atualização auditável de pacote para versão nova sem duplicar registros, pacotes CQBAL v4, CT 79 v2 e CT 261 v2 (números inalterados), BPD 100 da Embrapa Meio-Norte em curadoria limitada (Marandu bloqueado também nele), Neumann et al. (2007) consultado e não usado, MM e CZ mantidos separados. 5C aprovada pelo usuário em 2026-10-22.

**Fase 5D (seleção, independência, agregação e cenários) autorizada e implementada em 2026-10-22** (PLANO_FASE_5.md, seções 13.10 e 13.11; ROADMAP.md, seção 25): regra `SELECAO_5D` v1 versionada no domínio, aprovada só pelo usuário (hash no banco); níveis específico, comparável e geral; origens independentes por publicação, experimento e vínculo não descartado (transitivo); agregação só com 3 origens na mesma forma e método (média simples por origem, mediana, mínimo e máximo observados, cobertura); cenários por perfil real; avaliação científica "uso com cautela" e base validada, separada da conferência; perfis imutáveis (migration 0017). Nada importado, conferido ou aprovado no banco operacional. Correção da idade textual na regra `SELECAO_5D` versão 2 (PLANO_FASE_5.md, seção 13.12; ROADMAP.md, seção 25.5). **Fase 5 aprovada definitivamente e encerrada em 2026-10-22, com a marca `fase-5`** (ROADMAP.md, seção 25.6). Só a v2 é usada e aprovável; a v1 é histórica. Regra não aprovada no banco operacional.

**Fase 6 (motor nutricional BR-CORTE): só planejamento autorizado** (2026-10-22): [PLANO_FASE_6.md](PLANO_FASE_6.md); decisões C1 a C10 e A1 a A6 aprovadas, com ajustes (seção 5). **Entrega 6.0 (inventário científico) feita em 2026-10-22:** [INVENTARIO_BR_CORTE.md](INVENTARIO_BR_CORTE.md), aguardando aprovação. Inventário aprovado com determinações (P-01 a P-12; seção 9a). **6A-1, 6A-2 e 6A-3 aprovadas** (energia em 2026-10-23, com as decisões D-EN-01 a 06; INVENTARIO_BR_CORTE.md, seção 14.1); **6A-4 (CMS) aprovada em 2026-10-23**, com as decisões D-CMS-01 a 05 (seção 15.1; opção de terminação intensiva a pasto). **6A-5 (proteína) aprovada em 2026-10-24**, com as decisões D-PROT-01 a 09 (seção 16.1; R-11 a R-13). **6A-6 (macrominerais) aprovada em 2026-10-24**, com as decisões D-MIN (seção 17.1; relação Ca/P). **6A (6A-1 a 6A-7) aprovada definitivamente em 2026-10-24** (PLANO_FASE_6.md, seções 8 e 8.1; ROADMAP.md, seção 26): motor BR-CORTE 2023 (peso, CMS, energia, proteína, macrominerais) e tela de exigências com entrada manual (integração com animais e lotes pendente). `VERSAO_MOTOR` 0.6.2. **6B (avaliação de dietas): planejamento aprovado com ajustes em 2026-10-26** (PLANO_FASE_6.md, seções 9 e 9.7; numeração: 6C desempenho, 6D custos, 6E previsto × observado, 6F vacas e bezerros). **6B.0 aprovada em 2026-10-26** (INVENTARIO_BR_CORTE.md, seção 18; PLANO_FASE_6.md, seções 9.8 e 9.9). **6B-1 (oferta nutricional) aprovada em 2026-10-26** (PLANO_FASE_6.md, seções 9.10 e 9.11). **6B-2 (balanço) aprovada em 2026-10-26** (seções 9.12 e 9.13). **6B-3 (serviço de avaliação de dietas, canal `nutricao:avaliarDieta`, sem gravação) aprovada em 2026-10-26** (seção 9.14). **Migration 0018 (PB equivalente de NNP: `natureza_valor` na definição, PBeqNNP contida na PB total, `valor_nutricional` reconstruída sem o teto fixo de 100 %) implementada em 2026-10-26** (seção 9.15; `VERSAO_MOTOR` 0.8.2). **6B-4 (avaliação nutricional imutável, migration 0019, canais `nutricao:registrarAvaliacao`, `nutricao:obterAvaliacao` e `nutricao:listarAvaliacoes`) implementada em 2026-10-26** (seção 9.16). **0018 e 6B-4 aprovadas em 2026-10-26**, com as decisões D-0018-01 a 03 e D-6B4-01 a 04 (seção 9.17: reconstrução verificada com dados legados; situação parcial e uso operacional; hash do retrato exibido conferido ao gravar; anulação em registro separado, migration 0020; divergente só para investigação). **6B-5 (tela de avaliação de dietas: abas Exigências, Avaliar dieta e Avaliações gravadas; simular, gravar, consultar e anular) implementada em 2026-10-27** (seção 9.18). **Fase 6B aprovada definitivamente em 2026-10-27, com a marca `fase-6b`** (PLANO_FASE_6.md, seção 9.19; ROADMAP.md, seção 27). Avaliações imutáveis e histórico de anulações preservados; paginação, SHA-256 mais leve e busca de alimentos são melhorias futuras; integração com animais e lotes adiada. **6C (desempenho previsto): só planejamento autorizado** (PLANO_FASE_6.md, seção 10), aguardando aprovação. Próxima migration: 0021.

Git: não executar reset, rebase, alteração de tags ou outra operação destrutiva sem autorização do usuário.

Falha intermitente da 5A-3: causa não comprovada, **em acompanhamento**. O Vitest grava cada teste falho em `test-results/falhas-vitest.jsonl`; confira esse arquivo depois de cada execução completa.

Limites do GMD definidos pelo usuário: 0 e 2,5 kg/dia, como parâmetros operacionais configuráveis, não científicos. O intervalo curto (7 dias) foi escolhido pelo sistema e pode ser ajustado.

Situação das fontes científicas:
- BR-CORTE: `referencias/BR-CORTE.pdf` (fora do git), 4ª edição, 2023, pelo DOI; sem ficha catalográfica no arquivo (decisão C1). Equações de peso, CMS, energia, proteína e macrominerais transcritas da imagem das páginas, conferidas e aprovadas (INVENTARIO_BR_CORTE.md, seções 12 a 17).
- CQBAL 4.0: fonte principal de composição. Formato verificado na 5B; sem termos de uso publicados (curadoria restrita, uso pessoal; PLANO_FASE_5.md, seção 11).
- Embrapa: CT 79 (2016), CT 261 (2020), CT 263 (2021) e BPD 100 da Embrapa Meio-Norte (2011, direitos reservados, uso pessoal limitado) lidos e curados; cópias e SHA-256 em PLANO_FASE_5.md, seções 12.2 e 12.5.

Decisões do usuário já tomadas: evitar dupla contagem entre CQBAL e estudos individuais; cenários nutricionais por perfis coerentes de estudos reais (detalhes estatísticos na Fase 5D).

## Comandos

Rodar na raiz `C:\dev\pecuaria`:

| Comando | O que faz |
|---|---|
| `npm run dev` | Abre o app em modo desenvolvimento (dados em `%APPDATA%\GestaoPecuaria-dev`) |
| `npm run typecheck` | TypeScript em todos os pacotes |
| `npm run lint` | ESLint, inclusive regras de fronteira entre camadas |
| `npm test` | Testes de unidade e integração (Vitest) |
| `npm run test:e2e` | Constrói o app e roda os testes Playwright |
| `npm run verify` | Tudo acima, em sequência |
| `npm run package:win` | Gera o instalador em `apps/desktop/release` |

Para adicionar um canal IPC: nome em `packages/shared-types/src/canais.ts`, esquema em `contrato.ts`, saída em `SaidasApi` e executor em `apps/desktop/src/main/ipc/registrar-ipc.ts`. O TypeScript acusa o que faltar.

Para mudar o schema: crie `packages/database/migrations/NNNN_descricao.sql` com o próximo número. Nunca edite uma migration existente.

O npm deste projeto bloqueia scripts de instalação fora de `allowScripts` no package.json da raiz. O script do better-sqlite3 fica negado de propósito: o binário pré-compilado já basta e não há compilador na máquina.

## Regras Inegociáveis

1. **Nunca invente dados científicos.** Nenhuma equação, coeficiente, tabela de exigência ou composição de alimento sem fonte primária, página/tabela e conferência. Se a fonte não estiver disponível, pare e peça ao usuário. Não preencha valores "plausíveis", nem como placeholder, nem em testes.
2. **Ausente é ausente.** Nutriente sem dado na fonte não tem linha no banco, nunca zero. A falta bloqueia só os cálculos que dependem dele.
3. **Corte e leite são modelos separados.** BR-CORTE não se aplica a vacas leiteiras.
3a. **Não afirme ter consultado o que não leu.** Não presuma que um PDF ou publicação está disponível. Só cite conteúdo de arquivo efetivamente lido na sessão, com página.
3b. **Uma edição do BR-CORTE.** Confirme a edição pelo exemplar antes de transcrever. Não misture edições sem justificativa aprovada.
3c. **Dados como publicados.** Valor, unidade, base e tipo de estatística são gravados exatamente como na fonte. Conversões só no cálculo.
3d. **Agregação só com regra aprovada.** Não agregue estudos incompatíveis, não agregue tabela compilada com estudo individual, não crie intervalos ou percentuais arbitrários, não interpole idades de corte.
3e. **Resultados separados.** Exigência calculada, dieta formulada, desempenho previsto e desempenho observado nunca se misturam na tela nem no banco.
4. **Dinheiro em centavos inteiros.** Nunca `float` para valor monetário.
5. **Unidade no nome.** Colunas e variáveis com grandeza física levam a unidade: `peso_kg`, `pb_pct_ms`.
6. **Migrations são imutáveis.** Migration aplicada nunca é editada. Mudança de schema é sempre nova migration, com backup antes.
7. **Camadas respeitadas.** Renderer não acessa banco, `fs` nem Node. Tudo passa pela API tipada do preload. Services não importam React. Repositórios não contêm regra de negócio.
8. **Domínio puro.** `packages/domain` e `packages/nutrition-engine` não importam Electron, React nem SQLite.
9. **Sem rede.** Nenhuma chamada a API externa, telemetria ou CDN em tempo de execução.
10. **Sem mobile nem nuvem agora.** Apenas manter as preparações descritas no ROADMAP (UUID, timestamps, soft delete).

## Convenções de Código

- TypeScript `strict`, sem `any` sem justificativa em comentário.
- Nomes de domínio em português sem acento (`animal`, `pesagem`, `lancamento_financeiro`). Termos técnicos de programação em inglês quando forem padrão do ecossistema (`service`, `repository`, `handler`).
- Textos da interface em pt-BR. Rótulos de códigos (categoria, sexo, status...) ficam centralizados no arquivo de textos do módulo; frases de cada tela ficam no próprio componente (ARQUITETURA.md, D30).
- Regras puras ficam em `packages/domain`; regras que dependem do banco ficam nos serviços do main. Toda escrita de negócio registra a trilha em `historico_alteracao` dentro da mesma transação.
- Nada de exclusão física: o banco recusa `DELETE` nas tabelas do rebanho. Use `deleted_at`.
- Escapes Unicode (como o BOM ou a faixa de acentos combinantes) ficam escritos como escape no código, nunca como caractere invisível.
- Em componentes React, não chame `setState` direto dentro de `useEffect` (regra do lint); atualize no próprio evento.
- Gráficos usam os componentes de `components/graficos` e as cores `--grafico-*` de `styles.css`, validadas para daltonismo. Mostram só registros reais; nada interpolado ou projetado.
- Sanidade: o sistema registra, não prescreve. Nenhum produto, dose, carência, protocolo ou calendário vem pronto nem é sugerido.
- Carência: a data calculada é "fim do prazo calculado", nunca "liberação"; carne e leite sempre separados, com o aviso de que vale a bula e a orientação do médico-veterinário.
- Alertas nunca bloqueiam e os parâmetros vêm das configurações do usuário, não de "valores de referência" inventados. Distinga conferência (possível erro de registro) de desempenho (o peso pode estar certo).
- Dados de lote ao longo do tempo usam as permanências reconstruídas do histórico de movimentações (`reconstruirPermanencias`), nunca os integrantes atuais. Se o histórico não permite reconstruir, mostre a limitação.
- Mudança retroativa de data (saída de animal, encerramento ou formação de lote) é recusada se deixar consumo de estoque ativo fora do período. O sistema orienta a corrigir o estoque; nunca altera o consumo sozinho.
- Financeiro: competência (lançamento), caixa (pagamento) e custo apropriado são coisas distintas. Nada financeiro é criado sem ação do usuário (nem pagamento, nem lançamento a partir de estoque, sanidade ou rebanho). Condição de pagamento não informada é "pendente de definição": saldo desconhecido (`null`), nunca zero. Dinheiro só por `interpretarCentavos` e `dividirProporcional`; custo desconhecido nunca vira zero (`apurarComponentes`).
- Trilha de alterações: só pelo `RepositorioHistorico`, com `ENTIDADES_HISTORICO` e `ACOES_HISTORICO`. Valor novo exige editar o catálogo; o banco só confere o formato.
- Testes de propriedade e de sequências usam `criarGeradorDeterministico` (sementes fixas, sem dependência nova); falha imprime semente e menor caso.
- Validação com Zod nos dois lados do IPC.
- Datas em ISO 8601. Datas sem hora em `YYYY-MM-DD`.
- Chaves primárias UUID v7.

## Testes

- Toda regra de cálculo nova vem com teste unitário.
- Toda equação nutricional vem com casos de validação tirados da fonte, citando página ou tabela no próprio teste.
- Toda migration é testada aplicando do zero e a partir da versão anterior.
- Não marque tarefa como concluída com teste falhando. Não desative teste para passar.

## Banco de Dados Local

- O banco fica em `%APPDATA%\GestaoPecuaria\dados\pecuaria.db` (instalado) ou `%APPDATA%\GestaoPecuaria-dev\...` (desenvolvimento). A variável `PECUARIA_DIR_DADOS` redireciona a pasta, usada nos testes.
- Testes nunca usam a pasta de dados real.
- Backup só pela API de backup do SQLite, nunca por cópia simples do arquivo aberto. Cada backup tem manifesto JSON ao lado.

## Fluxo de Trabalho

- Antes de implementar uma fase, apresente o plano da fase e aguarde aprovação.
- Entregas pequenas, cada uma testada.
- Ao terminar uma fase, atualize a seção "Estado Atual" deste arquivo.
