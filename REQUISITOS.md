# REQUISITOS.md — Sistema de Gestão Pecuária

## 1. Visão Geral

Sistema desktop para gestão completa de operações pecuárias (bovinos de corte e leite), uso pessoal, 100% offline, com arquitetura preparada para evolução futura a aplicativo móvel com sincronização.

**Stack definida:** Electron + React + TypeScript + SQLite (via better-sqlite3), rodando localmente no Windows.

**Fora de escopo nesta fase:** app móvel, backend em nuvem, sincronização multi-dispositivo, multiusuário, autenticação remota. A arquitetura deve apenas *não impedir* essas capacidades futuras.

---

## 2. Requisitos Funcionais (RF)

### RF-01 — Gestão de Propriedades, Animais e Lotes
- RF-01.1: Cadastrar propriedades (fazendas/unidades), com área, localização, tipo de exploração (corte/leite/misto).
- RF-01.2: Cadastrar animais com identificação única (brinco/chip), raça, sexo, data de nascimento, categoria (bezerro, novilha, vaca, boi, etc.), status (ativo, vendido, morto, descartado).
- RF-01.3: Vincular animal a propriedade e a lote (grupo de manejo).
- RF-01.4: Criar, editar e mover lotes entre piquetes/instalações.
- RF-01.5: Registrar genealogia (pai/mãe) quando disponível.
- RF-01.6: Histórico de movimentações do animal (entrada, troca de lote, saída).

> **Situação (2026-10-15):** RF-01.1 a RF-01.6 implementados na Fase 1, aprovada. Também: importação por planilha CSV, trilha de alterações de cadastro e exclusão lógica.

### RF-02 — Controle Financeiro
- RF-02.1: Registrar compras de animais (valor, peso, data, origem).
- RF-02.2: Registrar despesas por categoria: alimentação, sanidade (vacinas/tratamentos), mão de obra, infraestrutura, impostos, outras.
- RF-02.3: Registrar vendas de animais (peso, valor/arroba, comprador, data) e de leite.
- RF-02.4: Apurar custo individual e por lote (rateio de custos fixos e variáveis).
- RF-02.5: Calcular indicadores de rentabilidade: custo/kg produzido, margem bruta, margem líquida, ponto de equilíbrio.
- RF-02.6: Fluxo de caixa (entradas e saídas) com filtro por período/propriedade/lote.
- RF-02.7: Exportar relatórios financeiros (PDF/CSV).

### RF-03 — Gestão de Estoque
- RF-03.1: Cadastrar insumos: rações, silagens, suplementos minerais, medicamentos, sêmen, outros.
- RF-03.2: Registrar entradas (compra/produção própria) e saídas (consumo, perda, venda) de estoque.
- RF-03.3: Controle de lote/validade para medicamentos e insumos perecíveis.
- RF-03.4: Alertas de estoque mínimo.
- RF-03.5: Custo médio móvel ponderado de cada item de estoque, preparado para uso futuro nos cálculos de custo de dieta.

> **Situação (2026-10-16):** RF-03.1 a RF-03.5 e RF-03.6 a RF-03.11 implementados e aprovados pelo usuário na Fase 3 (marca `fase-3`). Inclui entradas, saídas com destino explícito, lotes físicos, alertas, correções auditadas e baixa sanitária explícita. Não inclui cálculo de dieta nem lançamento financeiro. Relatório, validações e limites na seção 10 do ROADMAP.md.

### RF-04 — Nutrição de Bovinos de Corte

**Premissa:** o usuário não tem análises bromatológicas. O motor deve funcionar com composições de referência de publicações científicas, sem exigir laboratório.

- RF-04.1: Receber as características do animal ou lote: categoria, sexo e condição sexual, grupo genético, peso vivo atual, ganho médio diário desejado e sistema de criação.
- RF-04.2: Receber os alimentos disponíveis, as quantidades fornecidas em kg de matéria natural por cabeça e por dia, ou a inclusão em % da MS, e o preço de cada alimento.
- RF-04.3: Calcular a **exigência nutricional** pelo BR-CORTE, usando uma única edição principal, confirmada pelo exemplar fornecido pelo usuário.
- RF-04.4: Calcular a **oferta da dieta** a partir dos perfis de composição selecionados.
- RF-04.5: Avaliar o atendimento das exigências por nutriente, com status atende, déficit, excesso ou indeterminado.
- RF-04.6: Estimar o **desempenho previsto** apenas quando o modelo científico tiver equações para isso naquela categoria.
- RF-04.7: Manter separados, na tela e no banco, exigência calculada, dieta formulada, desempenho previsto e desempenho observado.
- RF-04.8: Calcular custo por kg de MS, por cabeça e dia, e por kg de ganho previsto.
- RF-04.9: Mostrar resultados por cenário conservador, médio e favorável, quando houver dados para isso.
- RF-04.10: Quando faltar um nutriente, não assumir zero. Identificar a ausência e bloquear somente os cálculos que dependem dele.
- RF-04.11: Exibir hipóteses, limitações, incertezas, avisos de extrapolação e a frase de que composições médias não garantem o ganho previsto.
- RF-04.12: Exibir, para cada resultado, equação, fonte, página, edição, unidades e origem de cada valor usado.
- RF-04.13: Aplicar uma dieta avaliada a um lote, gravar a projeção de desempenho e comparar com as pesagens reais.
- RF-04.14: Formular dietas de mínimo custo, escolhendo o cenário a atender. Esta é uma fase posterior à avaliação.
- RF-04.15: Comparar formulações por custo e desempenho previsto.
- RF-04.16: Bloquear animais de aptidão leiteira no motor de corte, com explicação.

### RF-05 — Banco de Alimentos

- RF-05.1: Cadastrar alimentos com identidade separada da composição: espécie, cultivar, parte da planta, forma de conservação, processamento e classe.
- RF-05.2: Cobrir, conforme houver fonte: silagem de milho; BRS Capiaçu fresco e ensilado em diferentes idades de corte; pastagens e outros volumosos; milho, farelo de soja e outros concentrados; suplementos minerais, proteicos e proteico-energéticos; produtos comerciais cadastrados pelo usuário.
- RF-05.3: Armazenar os nutrientes necessários aos modelos, como matéria seca, proteína bruta, frações de fibra, energia, minerais e digestibilidade, conforme a disponibilidade na fonte.
- RF-05.4: Registrar unidade e base, matéria natural ou matéria seca, de cada valor, e mostrar a base ao lado de todo número na interface.
- RF-05.5: Registrar para cada valor: fonte, autores, ano, página ou tabela, condições experimentais, unidade, versão ou data da referência, tipo de estatística, número de observações e método de obtenção, inclusive quando for média entre estudos.
- RF-05.6: Diferenciar a origem de cada valor: tabela compilada, estudo individual, análise laboratorial, rótulo comercial ou medição própria de MS.
- RF-05.7: Guardar níveis de garantia de rótulos como mínimos ou máximos garantidos, na base em que aparecem no rótulo.
- RF-05.8: Permitir cadastrar análises laboratoriais no futuro, sem torná-las obrigatórias.
- RF-05.9: Nunca gravar valor sem fonte. Nunca gravar zero no lugar de dado ausente.
- RF-05.10: Usar em cálculos apenas registros com transcrição conferida.

### RF-05A — Seleção Automática de Dados de Composição

- RF-05A.1: O usuário informa espécie, cultivar, idade de corte, forma de conservação e outras características relevantes.
- RF-05A.2: O sistema procura registros compatíveis e classifica o resultado em três níveis: específico, comparável ou geral. O nível e as diferenças em relação ao pedido ficam visíveis.
- RF-05A.3: Nunca cruzar espécies nem formas de conservação. Sem interpolação entre idades de corte, salvo regressão publicada pela própria fonte.
- RF-05A.4: Mostrar todos os candidatos encontrados e permitir que o usuário escolha outro, registrando a escolha.
- RF-05A.5: Calcular valor representativo e cenários conservador, médio e favorável somente quando houver registros compatíveis suficientes, por regra estatística documentada e aprovada.
- RF-05A.6: Não agregar estudos incompatíveis, não agregar tabela compilada com estudo individual e não criar intervalos arbitrários.
- RF-05A.7: Gravar o resultado da seleção como perfil de composição imutável, referenciado pelas dietas e avaliações.

### RF-06 — Produção Leiteira
- RF-06.1: Registrar ordenhas diárias (1 a 3 ordenhas/dia) por animal ou por lote, com volume (litros).
- RF-06.2: Registrar vendas de leite (volume, preço, comprador/laticínio, data).
- RF-06.3: Calcular custo de produção por litro (alimentar + outros custos rateados).
- RF-06.4: Calcular rentabilidade da atividade leiteira por período.
- RF-06.5: Acompanhar curva de lactação por animal (dias em lactação, produção acumulada).

### RF-07 — Manejo Sanitário e Zootécnico
- RF-07.1: Registrar vacinações, vermifugações e tratamentos (produto, dose, data, responsável, próxima aplicação).
- RF-07.2: Calendário sanitário com alertas de vencimento/reaplicação.
- RF-07.3: Registrar pesagens periódicas por animal.
- RF-07.4: Gráfico de evolução de peso e GMD (ganho médio diário) por animal/lote.
- RF-07.5: Histórico completo do animal (linha do tempo: pesagens, sanidade, movimentações, reprodução).
- RF-07.6: (Opcional, fase posterior) Registro reprodutivo básico: cobertura/IA, diagnóstico de gestação, parto.

> **Situação (2026-10-15):** RF-07.3 implementado na Fase 1. Na Fase 2, aprovada: RF-07.1 (registros sanitários individuais e coletivos, com produto, dose, data, responsável, carências e próxima aplicação), RF-07.2 (agenda sanitária com avisos configuráveis e carências em curso, apresentadas como fim de prazo calculado e não como liberação), RF-07.4 (gráficos de peso e GMD por animal e evolução histórica por lote, só com os animais que pertenciam ao lote em cada data), pesagem em lote, escore corporal e alertas de pesagem atípica (conferência ou desempenho, com parâmetros operacionais configuráveis). RF-07.5 cobre agora movimentações, pesagens, sanidade e alterações; reprodução (RF-07.6) continua para fase posterior. Nenhum protocolo, posologia ou calendário é sugerido pelo sistema.

### RF-08 — Simulador Econômico
- RF-08.1: Simular cenários comparando estratégias de alimentação (dietas diferentes) com projeção de custo, ganho de peso e prazo para terminação/venda.
- RF-08.2: Simular efeito de variações de preço de insumos e do produto (arroba/litro) na rentabilidade.
- RF-08.3: Comparar lotes/propriedades reais entre si (benchmarking interno).
- RF-08.4: Salvar e nomear cenários simulados para consulta posterior.
- RF-08.5: Usar os cenários de composição conservador, médio e favorável nas projeções, deixando claro qual cenário cada resultado usa.

### RF-09 — Dashboard e Relatórios
- RF-09.1: Indicadores-chave por propriedade: nº de animais, GMD médio, custo/kg, margem, produção de leite, estoque crítico.
- RF-09.2: Gráficos de evolução temporal (peso, produção, custos, receitas).
- RF-09.3: Relatórios exportáveis (PDF/Excel/CSV) por módulo e por período.
- RF-09.4: Filtros globais por propriedade, lote, categoria animal e período.

---

## 3. Requisitos Não Funcionais (RNF)

- RNF-01 — **Offline-first:** aplicação 100% funcional sem conexão à internet; nenhuma dependência de API externa em tempo de execução.
- RNF-02 — **Persistência local confiável:** SQLite como fonte única de verdade; integridade referencial via foreign keys.
- RNF-03 — **Desempenho:** operações de CRUD e cálculos nutricionais devem responder em menos de 300ms para bases de até ~5.000 animais e 100.000 registros de movimentação.
- RNF-04 — **Portabilidade futura:** camada de domínio/serviços desacoplada da camada de apresentação e do mecanismo de persistência, permitindo reuso em app móvel (ex.: React Native) e troca futura de SQLite por um backend sincronizável.
- RNF-05 — **Rastreabilidade científica:** todo valor nutricional e toda equação devem referenciar fonte, versão, página, unidade e base; nenhum "número mágico" sem origem documentada. Cálculos são gravados como snapshots reproduzíveis.
- RNF-05A — **Uma edição por modelo:** o motor usa uma única edição principal do BR-CORTE. Equações de edições diferentes só se combinam com justificativa científica aprovada.
- RNF-06 — **Backup e recuperação:** backup local automático e manual do banco de dados, com versionamento simples (cópias datadas) e restauração guiada.
- RNF-07 — **Auditoria/trilha:** criação e atualização de registros críticos (financeiro, sanidade, nutrição) devem manter timestamps de criação/alteração.
- RNF-08 — **Usabilidade:** interface moderna, responsiva à janela, navegação por módulos clara, formulários com validação e feedback imediato.
- RNF-09 — **Testabilidade:** lógica de domínio (cálculos financeiros e nutricionais) testável de forma unitária, isolada da UI e do Electron.
- RNF-10 — **Manutenibilidade:** TypeScript estrito, tipagem compartilhada entre camadas, lint e formatação automatizados.
- RNF-11 — **Extensibilidade modular:** cada módulo (financeiro, estoque, nutrição, etc.) deve poder ser desenvolvido, testado e evoluído de forma relativamente independente.
- RNF-12 — **Internacionalização mínima:** textos da interface centralizados (pt-BR como idioma único por ora, mas sem strings hardcoded espalhadas), facilitando tradução futura.
- RNF-13 — **Segurança local:** dados sensíveis (se houver) armazenados localmente sem exposição em rede; sem telemetria.

---

## 4. Restrições e Premissas

- Não implementar sincronização em nuvem, autenticação remota ou multiusuário nesta fase.
- Não inventar valores nutricionais, equações ou tabelas: todo dado do banco de alimentos e do motor de cálculo deve ter fonte verificável. Fontes principais: CQBAL 4.0 e Embrapa para composição, BR-CORTE para exigências.
- O usuário não tem análises bromatológicas. O sistema deve ser útil apenas com dados de referência.
- O PDF do BR-CORTE será fornecido pelo usuário. Até lá, nenhuma equação é transcrita e nenhuma edição é presumida.
- O sistema é ferramenta de apoio e não garante desempenho. Não substitui zootecnista ou veterinário.
- Desenvolvimento incremental: cada módulo entregue e validado antes de iniciar o próximo (ver ROADMAP.md).
- Plataforma-alvo inicial: Windows 10/11 desktop.

## 5. Detalhamento aprovado da Fase 3 (2026-10-16)

- RF-03.6: Consumo pode ser destinado à propriedade, a um lote de animais ou a um animal, com data, quantidade, unidade, origem e custo apropriado conhecido ou indeterminado, preparando a Fase 4 sem rateio automático.
- RF-03.7: Produção própria aceita custo desconhecido (NULL) e custo conhecido zero; valoração incompleta é sinalizada.
- RF-03.8: Quantidades de alimentos em massa representam matéria natural; a associação nutricional e os cálculos em matéria seca ficam para a Fase 5 e seguintes. Nenhuma conversão entre unidades é presumida.
- RF-03.9: Custo médio móvel com ordem determinística, arredondamento documentado, recálculo retroativo auditado e recusa de saldo negativo.
- RF-03.10: Baixa sanitária explícita por unidade de estoque, com identificação da operação, transação única e reconciliação de correções; nenhum consumo é criado para registros antigos.
- RF-03.11: Separar compra/produção, movimentação física e consumo; manter identificadores estáveis e vínculos de origem para futura integração financeira sem dupla contabilização.
- RF-03.12 (ajuste pós-Fase 3): o sistema recusa a saída de um animal, o encerramento de um lote de animais ou uma nova data de formação que deixe consumos ativos de estoque fora do período do animal ou do lote. A mensagem lista os movimentos e orienta a corrigi-los na tela de Estoque; o consumo nunca é alterado automaticamente e movimentos cancelados não contam.
- RF-03.13 (ajuste pós-Fase 3): estoque mínimo em branco desliga o alerta; zero avisa só com saldo zerado; valor maior que zero avisa com saldo menor ou igual a ele. A interface explica a regra no campo e no aviso.

## 6. Detalhamento da Fase 4A: base financeira (2026-10-16)

> **Situação:** implementada e aguardando aprovação final do usuário. Plano completo da Fase 4 em PLANO_FASE_4.md.

- RF-02.8: Lançamento financeiro com propriedade, categoria, natureza (receita ou despesa), data de competência, valor da operação em centavos inteiros, descrição, número do documento, contraparte opcional, atividade (corte, leite, compartilhada ou não definida), classificação do custo (variável, fixo ou não classificado, só para despesa) e **um único destino**: propriedade, lote de animais, animal ou nenhum. Quantidade informativa opcional, com a base explícita (peso vivo ou carcaça, arroba de cada uma).
- RF-02.9: Condição de pagamento à vista, parcelado ou não informada. **Valor da operação, saldo a pagar ou receber e valor efetivamente pago ou recebido são sempre mostrados separados.** Condição não informada deixa o lançamento pendente de definição financeira: o saldo é desconhecido (nunca zero), nenhuma parcela é criada e a ausência de parcelas não significa ausência de obrigação.
- RF-02.10: Pagamentos e recebimentos parciais, com data realizada (nunca futura), estorno auditável com motivo e renegociação das parcelas abertas (parcela parcialmente paga é encerrada no valor já pago; pagamentos nunca são alterados). Vencimentos futuros são permitidos.
- RF-02.11: Nada financeiro é criado sem ação do usuário: entrada ou consumo de estoque, aplicação sanitária e cadastro de animal não geram lançamento, parcela nem pagamento. À vista só tem pagamento se o usuário o confirmar.
- RF-02.12: Categorias sugeridas (editáveis) e do usuário, com tratamento no resultado (resultado, estoque, aquisição de animal ou fora do resultado) e classificação padrão do custo, **copiada** para cada lançamento novo e alterável por lançamento (D-E). Mudar o padrão da categoria não reescreve lançamentos antigos.
- RF-02.13: Cancelamento lógico de lançamento, com motivo e sem pagamentos ativos; nada é apagado. Saída de animal, encerramento ou formação de lote e exclusão de animal ou propriedade são recusados quando deixariam lançamentos ativos fora do período ou órfãos, com mensagem que orienta a corrigir o financeiro.
- RF-02.15: Fluxo de caixa realizado (pagamentos e recebimentos efetivos, por data) e previsto (parcelas em aberto, por vencimento), sempre separados, por dia, semana ou mês, com filtros de período, natureza, categoria e atividade. Contas a pagar e a receber por vencimento, com registro de pagamento direto da lista. Painel com caixa, contas em aberto, lançado na competência e pendências. Saldo desconhecido (condição não informada) nunca entra nos totais nem vira zero.
- RF-02.16: Classificação de despesas em fixas ou variáveis por categoria (padrão para novos) e por lançamento, com cobertura sempre visível e ação em lote explícita, com prévia e trilha.
- RF-02.17: Compra e venda de animais à vista, parceladas ou com condição não informada, com alocação do valor entre os animais pelo critério da unidade do preço (cabeça, kg vivo, @ de peso vivo ou @ de carcaça, nunca convertidos entre si sem peso informado) ou valores digitados, sempre com soma exata. Compra cria os animais; venda dá a saída. Cancelar venda desfaz a saída com motivo; cancelar compra só se nada foi registrado depois da entrada.
- RF-02.18: Desfazer a saída de um animal com reversão auditável; se o lote de origem foi encerrado, o usuário escolhe reabri-lo, outro lote ou sem lote.
- RF-02.19: Custo anterior ao sistema, por animal ou lote, informado pelo usuário, sem criar movimento financeiro, com confirmação do rateio igualitário e proteção contra dupla contagem. Custo de aquisição e de formação com estado de apuração: nascido na propriedade tem aquisição não aplicável e formação não apurada (nunca zero).
- RF-02.20: Compra de insumos ligada às entradas físicas do estoque: nota com itens, frete rateado por valor, lote físico quando o item o exige, correção e cancelamento pela nota (que repassa ao estoque pela correção auditada), vínculo retroativo de entradas antigas e conferência de pendências. A compra só vira custo no consumo; nenhuma despesa de resultado é criada pela entrada nem pelo consumo.
- RF-02.21: Custo apropriado de consumo de estoque por destino, item e tipo, com custo desconhecido sinalizado (nunca zero) e classificação fixo ou variável por item. Custo sanitário por componentes sem duplicação (baixa de estoque, serviços lançados e, na falta deles, o valor digitado no registro).
- RF-02.22: Custo por lote e por animal: custo de lote dividido por igual, dia a dia, entre os animais presentes; custo da propriedade distribuído só por rateio explícito (cabeças, animal-dias, peso ou manual), com prévia, revisão por versão, cancelamento, trilha e fechamento exato; cada valor explicável até a origem; custo desconhecido ou não apurado sempre sinalizado.
- RF-02.23: Produção própria (capiaçu, silagem e outros) por centro de produção: despesas e insumos do estoque vinculados, custo apurado com custo desconhecido sinalizado, encerramento que gera a entrada de produção no estoque com a quantidade colhida informada, reabertura auditável e proteção contra dupla contagem entre produção, estoque, rateio e consumo.
- RF-02.24: Resultado do período por competência e por caixa, lado a lado e nunca somados, com margem líquida, margem bruta (com cobertura de classificação), comparação com o período anterior e resultado parcial ou não apurado sinalizado pela mesma regra em telas e relatórios: custo desconhecido ou não apurado ("no máximo"), venda ou descarte sem receita registrada ("no mínimo") e, sem nenhuma receita conhecida, resultado não apurado. Venda a prazo, parcelada ou não recebida tem receita conhecida.
- RF-02.25: Resultado realizado por animal e por lote (receita da venda menos o custo acumulado até a saída; morte como perda) e indicadores: custo por kg de peso vivo ganho, receita, custo e margem por @ de carcaça e por @ viva vendida, preço médio do litro de leite vendido e ponto de equilíbrio por base explícita, sempre com o denominador e o que ficou de fora.
- RF-02.26: Conciliação entre competência e caixa por linhas que explicam a diferença, e projeção por premissas do usuário, com rótulo fixo, sem gravar nada.
- RF-02.27 (detalha RF-02.7): Relatórios gerenciais (resultado do período, custos por lote e animal, custo de um animal, composição do custo de um lote, lançamentos, fluxo de caixa, conciliação e conferência financeira) com pré-visualização e exportação em CSV e PDF geradas no computador, sem rede: visão no título, aviso de relatório gerencial (não fiscal nem contábil), ausente nunca como zero, resultado parcial sinalizado, proteção contra fórmula no CSV e documento das contrapartes só com opção explícita.
- RF-02.28: Devolução de animais vendidos (pelo comprador) e comprados (ao fornecedor), total ou parcial, como operação própria vinculada à negociação original: valor acordado informado por animal (o original é só sugestão); retorno ao rebanho ou saída na data da devolução, com o histórico preservado; compensação sem caixa do que estava em aberto e restante a pagar ou a receber, com caixa só no pagamento efetivo; efeitos econômicos na data da devolução, com vendas, devoluções e receita líquida identificáveis; cancelamento auditável.
- RF-02.14: Trilha de alterações de toda escrita de negócio (lançamento, pagamento, categoria, contraparte), na mesma transação, por escritor centralizado e tipado.
- Fora da 4A (entregas seguintes do PLANO_FASE_4.md): fluxo de caixa e painel (4B), compra e venda de animais, custo anterior ao sistema e desfazer saída (4C), insumos, rateio e produção própria (4D a 4F), resultado e indicadores (4G), exportação (4H).
