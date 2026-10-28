# PLANO_FASE_5.md — Banco de Alimentos (RF-05, RF-05A)

> **Situação em 2026-10-22: Fase 5 aprovada definitivamente e encerrada (marca `fase-5`).** 5D nas seções 13.10 a 13.12. Etapa 5A aprovada pelo usuário em 2026-10-21 (relatório em ROADMAP.md, seção 22). 5B aprovada (portão na seção 11; ROADMAP.md, seção 23). **5C autorizada, implementada e aprovada tecnicamente** em 2026-10-21, com os ajustes das seções 12.3 a 12.7 (ROADMAP.md, seção 24). **5D planejada (seção 13), não iniciada nem autorizada.**
> Base: commit `3287b46` (marca `fase-4`). Migrations da fase: 0012 (5A), 0013 e 0014 (5B), 0015 (5C). A próxima é a **0016**.
> Referências: ROADMAP.md (Fase 5), REQUISITOS.md (RF-05, RF-05A), MODELOS_NUTRICIONAIS.md (seções 2 a 6, 9 e 12), BANCO_DE_DADOS.md (seções 3.7 e 6).

## 1. Objetivo e princípio central

Montar o banco de alimentos que as Fases 6 (avaliação) e 8 (formulação) vão consumir: **o que é o alimento**, **de onde veio cada dado**, **cada valor publicado ou medido** e, na 5D, **o conjunto de valores escolhido para uma dieta** (perfil de composição imutável).

Princípio: **a estrutura vem antes dos dados, e os dados vêm antes da agregação.** Nenhum valor de composição entra sem fonte, página ou tabela e conferência (CLAUDE.md, regras 1, 2, 3a, 3c e 3d).

### Portões

| Etapa | Portão | Situação |
|---|---|---|
| 5A Estrutura | Nenhum: não depende de dado científico | **Autorizada** (5A-1 a 5A-5) |
| 5B CQBAL 4.0 | Formato de acesso, estrutura e termos de uso verificados | **Autorizada** em 2026-10-21; portão verificado (seção 11): acesso e estrutura confirmados, **sem termos de uso publicados**; curadoria limitada, sujeita à aprovação |
| 5C Embrapa e estudos | Publicações levantadas e disponíveis em arquivo | **Autorizada** em 2026-10-21; publicações levantadas e guardadas em `referencias/embrapa/` (seção 12.2) |
| 5D Seleção, cenários e perfis | Regra de agregação aprovada (n mínimo, média, cenários, coerência) | **Bloqueada** |

Ao fim da 5A o sistema terá a estrutura completa, o catálogo inicial de **definições** de nutrientes (sem método analítico, seção 3, D5-2) e só os valores que **você** cadastrar: laudos de laboratório, rótulos de produtos comerciais e MS medida na fazenda. Nenhuma tabela de referência virá preenchida e nenhum valor de composição será semeado.

## 2. O que a Fase 5A cobre (e o que não cobre)

**Dentro da 5A** (ROADMAP, Fase 5, item 5A):

1. Cadastro de **fontes** (tabela compilada, estudo individual, laudo laboratorial, rótulo comercial, medição própria), com os metadados de MODELOS_NUTRICIONAIS.md, seção 6.
2. **Catálogo de definições de nutrientes**: código, nome, grupo, unidade e base de referência e direção conservadora, com o método analítico **pendente de fundamentação** (D5-2).
3. **Alimentos** (identidade, sem composição): espécie, cultivar, parte da planta, forma de conservação, processamento, classe. Fresco e ensilado são alimentos diferentes.
4. **Registros de composição** com condições (idade de corte, aditivo, região, estação, adubação) e **valores nutricionais** em formato longo, gravados como publicados: texto publicado, número derivado, unidade, base, tipo de estatística, n, desvio-padrão, mínimo e máximo (D5-3).
5. **Fluxo de conferência**: rascunho → transcrito → conferido (ou rejeitado). Só `conferido` poderá ser usado em cálculo (RF-05.10); o cálculo é da Fase 6.
6. **Produtos comerciais pelo rótulo**: níveis de garantia como mínimo ou máximo garantido, na base do rótulo (RF-05.7).
7. **Análise laboratorial** (opcional) e **MS medida na fazenda** (opcional), com método, limitações e o aviso de que não foi validado pelo sistema (D5-8).
8. **Tela de consulta** com fonte, base e unidade sempre ao lado do número.
9. **Vínculo entre item de estoque e alimento** (silagem, ração, mineral do estoque apontam para um alimento do banco).

**Fora da 5A** (fica para as etapas e fases indicadas, sem antecipar):

- **Seleção automática, níveis de correspondência, regra de agregação, cenários e perfis de composição**: Fase 5D (D5-6). As tabelas `regra_agregacao`, `perfil_composicao`, `perfil_valor` e `perfil_valor_origem` não entram na 5A.
- **Métodos analíticos das definições**: complementados na 5B e 5C, só a partir de publicações efetivamente consultadas, com página.
- Exigências nutricionais, equações do BR-CORTE e qualquer cálculo de dieta: Fases 6 e 8. **O `referencias/BR-CORTE.pdf` não será lido nesta fase.**
- Nutrição de vacas leiteiras: fora do escopo (regra 3).
- Importação automática do CQBAL ou de qualquer site: o aplicativo não acessa rede (regra 9).
- Conversão de base MN↔MS: só no cálculo (regra 3c), e o cálculo é da Fase 6.

## 3. Decisões (aprovadas em 2026-10-21)

| # | Decisão | Situação |
|---|---|---|
| D5-1 | Chave das tabelas de referência | **Aprovada.** UUID v7 em todas, com `codigo` estável e único para fonte e nutriente (`CQBAL_4_0`, `PB`) |
| D5-2 | Catálogo de nutrientes | **Modificada.** Catálogo inicial de **definições** (código, nome, grupo, unidade e base de referência), sem valores de composição. Métodos analíticos ficam **pendentes de fundamentação científica**, sem referência inventada (ver 3.1) |
| D5-3 | Como gravar o número publicado | **Aprovada.** Texto exato como publicado, precisão (casas decimais), unidade e base preservados; `REAL` derivado do texto para cálculo, com conversões e validações explícitas |
| D5-4 | Quem transcreve e quem confere | **Aprovada.** Duas ações separadas, com nome e data; a mesma pessoa pode fazer as duas, e a tela avisa |
| D5-5 | Correção de registro conferido | **Aprovada.** Nunca editar: nova versão (`substitui_id`, com motivo); a anterior fica substituída quando a nova é conferida |
| D5-6 | Seleção automática na 5A | **Não antecipar.** Seletor, perfis e cenários ficam na 5D; ROADMAP alinhado |
| D5-7 | Anexos (PDF do laudo, foto do rótulo) | **Aprovada.** Sem arquivos na 5A; só número do laudo, laboratório, data e registro do produto |
| D5-8 | MS medida na fazenda | **Aprovada.** Grava o valor, o método de medição descrito, suas limitações e o aviso "método não validado pelo sistema" |
| D5-9 | Escopo da fonte | **Aprovada.** Fontes e alimentos são globais; laudos e MS medida pertencem a uma propriedade |

### 3.1 Catálogo inicial de definições (D5-2, decisão do usuário em 2026-10-21)

Não há publicação de métodos analíticos disponível na sessão, e o BR-CORTE só é aberto na Fase 6. Por isso:

- As definições trazem só o que é verificável pela nomenclatura usual: **código, nome, grupo, unidade de referência e base de referência**. A direção conservadora segue a regra já aprovada em MODELOS_NUTRICIONAIS.md, seção 5.4, pelo grupo; onde a regra não cobre o grupo, fica **"não definida"**.
- O campo de método analítico fica vazio, com a situação **"pendente de fundamentação"**. Nenhuma definição é marcada como fundamentada sem fonte cadastrada, página ou tabela e método. O banco recusa "fundamentada" sem esses três campos.
- **Variantes de método nunca são equivalentes automaticamente**, em especial frações de fibra e de proteína. Equivalência só por identidade da definição. Quando a fonte informar um método diferente (ex.: FDN corrigida para cinzas e proteína), a variante entra como **definição própria**, com código próprio, a partir da publicação consultada.
- Cada valor guarda o método analítico **como informado pela fonte**, separado da definição.
- Uma definição que já tem valores não muda unidade, base, método nem situação: a variante vira nova definição. Uma definição sem valores pode ser fundamentada no lugar, com trilha.
- A unidade e a base de referência servem para a exibição e, na Fase 6, para o cálculo. O valor continua gravado na unidade e na base em que foi publicado.

Definições semeadas pela migration 0012 (todas com método pendente):

| Código | Nome | Grupo | Unidade | Base | Direção (regra 5.4) |
|---|---|---|---|---|---|
| MS | Matéria seca | fração seca | % | MN | menor |
| MO | Matéria orgânica | outro | % | MS | não definida |
| MM | Matéria mineral | outro | % | MS | não definida |
| PB | Proteína bruta | proteína | % | MS | menor |
| EE | Extrato etéreo | outro | % | MS | não definida |
| FDN | Fibra em detergente neutro | fibra | % | MS | maior |
| FDA | Fibra em detergente ácido | fibra | % | MS | maior |
| LIG | Lignina | fibra | % | MS | maior |
| NDT | Nutrientes digestíveis totais | energia | % | MS | menor |
| Ca | Cálcio | mineral macro | % | MS | menor |
| P | Fósforo | mineral macro | % | MS | menor |

### 3.2 Justificativas das demais decisões

**D5-1.** O BANCO_DE_DADOS.md, seção 3.7, previa `id` textual (`CQBAL_4_0`), o que contraria a convenção de UUID v7 do CLAUDE.md. Solução: `id` UUID e `codigo` único. Laudo, rótulo e medição própria podem ficar sem código (o usuário identifica pelo laboratório, número e data, ou pelo fabricante).

**D5-3.** A regra 3c manda gravar "exatamente como na fonte". Um `REAL` perde a forma publicada (`12,50` e `12,5` viram o mesmo número, e casas decimais indicam precisão). Solução: `valor_publicado TEXT` (como impresso) e `valor REAL` derivado por função única do domínio, conferida no serviço e em teste. O registro informa o **separador decimal da fonte** (vírgula ou ponto), para que `1.050` seja lido sem adivinhação. O mesmo vale para desvio-padrão, mínimo e máximo publicados. Faixas válidas por unidade (percentual de 0 a 100, g/kg de 0 a 1000, mg/kg de 0 a 1.000.000) são conferidas no banco. Conversões entre unidades da mesma grandeza (%, g/kg, mg/kg) ficam num módulo único do domínio, com fatores exatos e teste de ida e volta; unidade sem conversão definida não é convertida.

**D5-4.** O sistema é de um usuário só. Exigir uma segunda pessoa travaria a 5B. Transcrever e conferir são atos separados, com data e nome digitado; conferir mostra o que foi digitado e a referência (página ou tabela) para reler na fonte, e a tela avisa quando o mesmo nome fez as duas etapas.

**D5-5.** Na 5D e na Fase 6, perfis e avaliações vão apontar para os valores; editar um conferido mudaria cálculos antigos sem rastro. Mesmo padrão da Fase 4 (rateio por versão). A versão nova nasce como rascunho com cópia dos valores; a anterior continua conferida até a nova ser conferida, e então passa a substituída na mesma transação.

**D5-6.** O ROADMAP previa o perfil na 5A. Por decisão do usuário, seletor, perfis e cenários ficam todos na 5D, atrás do portão da regra de agregação. O ROADMAP foi alinhado.

**D5-7.** O backup é feito só pela API do SQLite (CLAUDE.md). Arquivos fora do banco ficariam fora do backup; dentro do banco, aumentam muito o arquivo.

**D5-8.** A pendência científica 8 (MODELOS_NUTRICIONAIS.md, seção 12) diz que o método de medir MS na fazenda depende de publicação a localizar. Sem ela, o sistema não prescreve método nem corrige o valor: grava o que você mediu, o método que você descreveu, as limitações que você informou, e marca sempre como **não validado pelo sistema**. Medição própria só aceita definições do grupo fração seca.

**D5-9.** Uma tabela do CQBAL vale para qualquer fazenda; um laudo é de uma amostra de uma propriedade. A propriedade fica na fonte (laudo ou conjunto de medições); a data da amostra fica no registro.

## 4. Modelo de dados (migration 0012, entrega 5A-2)

Segue BANCO_DE_DADOS.md, seção 3.7, com os ajustes das decisões acima. Todas as tabelas com `created_at`, `updated_at`, `deleted_at`, `sync_version` e `STRICT`; exclusão física proibida por gatilho.

| Tabela | Conteúdo | Diferenças em relação à seção 3.7 |
|---|---|---|
| `fonte` | origem, código, título, autores, ano, edição, editora, ISBN/DOI/URL, data de acesso, experimento de origem; laboratório, nº e data do laudo; fabricante e registro do produto; método e limitações da medição própria; propriedade | `id` UUID + `codigo` único (D5-1); `propriedade_id` só para laudo e medição própria (D5-9); sem `arquivo_anexo_path` (D5-7); origem `sistema_exigencias` reservada para a Fase 6 (aceita pelo banco, recusada pelo serviço) |
| `nutriente` | código, nome, grupo, unidade e base de referência, método analítico, situação da fundamentação (fonte e referência), direção conservadora, origem da definição (sistema ou usuário) | `id` UUID + `codigo` único (D5-1); catálogo inicial de definições sem método (D5-2, seção 3.1) |
| `alimento` | identidade (nome, espécie, cultivar, parte, forma de conservação, processamento, classe, comercial) | Identidade imutável depois que houver registro |
| `registro_composicao` | um estudo, linha de tabela, laudo, rótulo ou medição; condições; separador decimal; data da amostra; status, quem transcreveu, conferiu ou rejeitou, e quando | `substitui_id` e motivo para versões (D5-5); status `substituido`; data da amostra para laudo e medição |
| `valor_nutricional` | um valor por linha | `valor_publicado TEXT` além de `valor REAL`, e o mesmo para desvio-padrão, mínimo e máximo (D5-3); método **informado pela fonte**; `UNIQUE(registro_id, nutriente_id, tipo_valor, base)` entre os ativos; `tipo_valor` com `minimo_garantido` e `maximo_garantido` para rótulos |
| `estoque_item_alimento` | vínculo do item de estoque com um alimento | Tabela nova, um vínculo ativo por item; não altera `estoque_item` |

Proteções no banco (gatilhos e `CHECK`):

- Não existe valor sem registro e não existe registro sem fonte; textos obrigatórios não aceitam vazio.
- Registro e valores só mudam em rascunho; registro conferido é imutável e só passa a `substituido` quando a versão nova é conferida; transições de status fora do fluxo são recusadas.
- Percentual fora de 0 a 100 (e as faixas de g/kg e mg/kg) é recusado; a unidade do valor precisa ser da mesma grandeza da unidade de referência da definição.
- Rótulo só aceita `minimo_garantido` e `maximo_garantido` na base MN; os outros não aceitam garantias. Laudo e medição própria exigem propriedade na fonte e data da amostra no registro. Medição própria só aceita definição do grupo fração seca e exige método e limitações.
- Definição "fundamentada" exige método, fonte e referência; definição com valores não muda unidade, base, método nem situação.

A trilha de alterações usa o `RepositorioHistorico` (decisão D-I), com novas entidades no catálogo fechado; nenhuma tabela existente é alterada.

## 5. Regras de negócio

- **Sem fonte, sem dado** (RF-05.9): não existe valor sem registro e não existe registro sem fonte.
- **Ausente é ausente**: nutriente que a fonte não traz não tem linha; a tela mostra "não informado pela fonte", nunca 0.
- **Como publicado** (regra 3c): texto, unidade, base (MN ou MS), tipo de estatística e casas decimais preservados; nada é convertido ao gravar.
- **Dados científicos e medições da propriedade separados**: a origem (tabela compilada, estudo, laudo, rótulo, medição própria) aparece ao lado de todo valor; laudo e medição só aparecem na propriedade a que pertencem.
- **Unidade compatível com a definição**: o valor pode vir numa unidade diferente da de referência (ex.: g/kg e %), desde que seja da mesma grandeza. A conversão só acontece no cálculo (Fase 6).
- **Fluxo de conferência**: rascunho (editável) → transcrito (pronto para conferir) → conferido (imutável) ou rejeitado (com motivo). Transcrito e rejeitado podem voltar a rascunho; conferido não (só nova versão). Rascunho, transcrito e rejeitado podem ser descartados com motivo (exclusão lógica).
- **Rótulo comercial**: valores são garantias, não composição típica; a tela diz isso sempre (MODELOS_NUTRICIONAIS.md, seção 6).
- **Laudo**: é da propriedade e da amostra; não substitui nem se mistura com tabela compilada.
- **Vínculo com estoque**: um item de estoque (ração, silagem, volumoso, suplemento, mineral ou outro) aponta para no máximo um alimento; o vínculo não copia composição e não altera o estoque nem o financeiro.

## 6. Interface

Módulo **Banco de alimentos** (já existe no menu):

| Tela | Conteúdo |
|---|---|
| **Alimentos** | Lista e busca por nome, espécie, cultivar, forma e classe; ficha com todos os registros e valores, separados por origem |
| **Registro de composição** | Cabeçalho (fonte, página ou tabela, condições, separador decimal) e grade de valores (nutriente, valor como publicado, unidade, base, estatística, método informado); botões Transcrever, Conferir, Rejeitar, Voltar a rascunho, Nova versão, Descartar |
| **Conferência** | Fila dos registros transcritos, com a referência para reler e as diferenças em relação à versão anterior |
| **Fontes** | Cadastro e lista por origem |
| **Nutrientes** | Catálogo de definições, com grupo, unidade, base, direção e situação da fundamentação |
| **Produtos comerciais** | Atalho para alimento comercial + rótulo (fonte e registro num passo só) |
| **Laudos e MS medida** | Por propriedade, com data da amostra |

Princípios: base e unidade ao lado de todo número; origem do valor sempre visível; status de conferência em destaque; nada pré-preenchido com valor de referência. Textos em arquivo de mensagens. No Estoque, o item ganha o campo "Alimento no banco".

## 7. Entregas incrementais

| Entrega | Conteúdo | Migration |
|---|---|---|
| **5A-1** | Domínio puro: enumerações, número publicado (D5-3), unidades conhecidas e conversões explícitas, faixas, fluxo de conferência, direção conservadora pela regra do grupo, regras por origem, catálogo inicial de definições | — |
| **5A-2** | Migration 0012 (todas as tabelas da 5A e o catálogo inicial), repositórios, serviços e IPC de fontes, nutrientes e alimentos; trilha | 0012 |
| **5A-3** | Registros de composição e valores, fluxo de conferência, nova versão | — |
| **5A-4** | Produtos comerciais pelo rótulo, laudos e MS medida na fazenda | — |
| **5A-5** | Telas de consulta e cadastro, vínculo com o item de estoque, regressão, backup e restauração, inspeção visual, documentação | — |

Checkpoint: **aprovação depois da 5A-5** (estrutura pronta). 5B, 5C e 5D só começam com o portão de cada uma cumprido e com autorização do usuário.

## 8. Estratégia de testes

- **Domínio:** número publicado (vírgula e ponto, separador de milhar conforme o separador decimal da fonte, casas decimais preservadas, recusa de texto ambíguo ou malformado); conversões entre unidades da mesma grandeza (fatores exatos, ida e volta, recusa entre grandezas); faixas; transições do fluxo de conferência; regras de rótulo e medição; direção conservadora pela regra do grupo; catálogo inicial sem método e sem nada marcado como fundamentado.
- **Banco:** migration 0012 do zero e a partir da versão 11 com dados das Fases 1 a 4 (tabelas anteriores idênticas por hash); falha no passo final com reversão; gatilhos de imutabilidade do registro conferido; `UNIQUE` e `CHECK`; catálogo semeado igual ao do domínio.
- **Serviço e IPC:** cada canal recusa entrada inválida; registro conferido não muda; nova versão preserva a anterior; ausente não vira zero; laudo isolado por propriedade; vínculo com estoque não cria movimento nem lançamento.
- **Dados de teste:** valores sintéticos, **claramente fictícios** (nutriente `TESTE_A`, fonte "Fonte fictícia de teste", alimento "Alimento de teste"), só para provar regras de armazenamento, nunca nomes nem valores que pareçam composição real (regra 1). Teste que varre a migration e garante que nenhum valor de composição foi semeado.
- **Interface e E2E:** cadastrar fonte, nutriente e alimento fictícios, transcrever, conferir, tentar editar o conferido (recusado), nova versão, rótulo, laudo, MS medida, vínculo com estoque, reinício, backup e restauração; claro e escuro; 900 px.

## 9. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Valor plausível inventado entrar como dado | Nenhum valor de composição semeado; definições sem método; dados de teste com nomes explicitamente fictícios; teste que varre a migration |
| Definição sem método tratada como validada | Situação "pendente de fundamentação" na tela; banco recusa "fundamentada" sem método, fonte e referência |
| Variantes de método misturadas | Equivalência só por identidade da definição; método informado pela fonte gravado em cada valor; variante vira definição própria |
| Edição silenciosa de valor conferido | Gatilho no banco + serviço + teste; correção só por nova versão |
| Confundir rótulo (garantia) com composição | `tipo_valor` restrito e aviso fixo na tela |
| Unidade ou base trocada | Base e unidade obrigatórias por valor e exibidas ao lado do número; conversão só no cálculo |
| Estrutura não servir ao CQBAL | O formato do CQBAL é desconhecido (pendência 2); colunas de condição flexíveis (`outras_condicoes_json`) e catálogo aberto reduzem o risco; ajuste vira nova migration na 5B, nunca edição da 0012 |

## 10. Pendências que dependem do usuário

1. **Para destravar a 5B:** como você acessa o CQBAL 4.0 (site, planilha, PDF), os termos de uso, e quais alimentos você de fato usa.
2. **Para destravar a 5C:** os arquivos das publicações da Embrapa (BRS Capiaçu fresco e ensilado por idade de corte, silagem de milho, pastagens).
3. **Métodos analíticos das definições:** complementados com as publicações consultadas na 5B e 5C.
4. **Direção conservadora de MO, MM e EE:** a regra 5.4 não cobre esses grupos; fica "não definida" até decisão na 5D.

## 11. Portão da 5B: verificação do CQBAL 4.0 (2026-10-21)

Verificação feita nesta sessão, antes de importar qualquer valor, a pedido do usuário ("acesso gratuito não significa autorização automática para cópia em massa"). Só o que foi lido no próprio site está abaixo; nada foi presumido.

### 11.1 Acesso

- Endereço: `https://www.cqbal.com.br`, consultado em 2026-10-21. É uma aplicação web; as páginas públicas (início, apresentação, autores e citação, como colaborar, dados cadastrados e relatórios) não pedem login. Só a área administrativa pede.
- Texto da página inicial: "Nesta página, você poderá consultar e exportar a composição químico-bromatológica dos principais alimentos utilizados em dietas para ruminantes no Brasil." Os relatórios têm botões de exportação e de "Salvar no BR-Corte 5.0".
- A apresentação descreve a versão on-line anterior (CQBAL 3.0) como "de acesso gratuito" e o CQBAL 4.0 como sua reformulação (2017/2018).
- `robots.txt` sem restrição. Isso não é licença e não foi tratado como autorização.

### 11.2 Estrutura

- Catálogo de alimentos principais (601 na consulta de 2026-10-21), por tipo (forragens verdes, forragens secas, silagens, concentrados energéticos e proteicos, subprodutos, minerais, aditivos). Cada alimento tem **derivados** (ex.: MILHO → MILHO SILAGEM, MILHO FUBÁ), alguns com **agrupamento** (dias de corte, % de espiga, etc.).
- O relatório de um derivado lista, por nutriente: código, nome, **MÉDIA** (o site exibe com duas casas decimais e ponto decimal), **N** e uma coluna **"S"**, chamada **"se"** na versão em inglês, sem definição em nenhuma página. "S" não é tratado como desvio-padrão: é guardado como texto na observação do valor, com o aviso de que a fonte não define a estatística.
- Os relatórios têm uma seção separada de **nutrientes estimados** por equações (BR-CORTE 2016 e 2010, NRC 2001), com n = 1. São resultados de modelo, não composição medida: **não são importados** (regra 3e).
- As unidades estão na página "Dados cadastrados": a maioria em **%MS**; a MS em **"%"**, sem base escrita.
- A base é dinâmica: os relatórios não têm versão nem data própria. A referência rastreável é o derivado consultado, o código do derivado e a **data de consulta**.
- Avisos da própria apresentação: com número desigual de repetições, a soma dos nutrientes pode não dar 100%; os valores de "fração A" de componentes fibrosos "não são corretos e não apresentam utilidade prática" (não importados); o termo FDNVD também é dado como incorreto.
- Citação indicada pelo site: "VALADARES FILHO, S.C., LOPES, S.A.; SARAIVA,T.D. et al., CQBAL 4.0. Tabelas Brasileiras de Composição de Alimentos para Ruminantes. 2023. Disponível em: www.cqbal.com.br". A mesma página lista os autores, entre eles "Douglas Teixeira Saraiva", e o apoio (INCT Ciência Animal, FAPEMIG, CNPq, CAPES).

### 11.3 Condições de reutilização

- **Nenhum termo de uso, licença, aviso de direitos autorais ou política de reprodução** foi encontrado nas páginas públicas. A conferência foi feita no texto de todas as páginas públicas, inclusive no código das páginas, que traz o texto integral delas.
- Há a citação indicada (11.2) e um contato para colaboração (página "Como colaborar").

### 11.4 Decisão operacional (aprovada pelo usuário em 2026-10-21)

Sem licença expressa, o conteúdo foi tratado como protegido:

1. **Sem cópia em massa, sem varredura e sem redistribuição.** Foram consultados só os relatórios dos alimentos priorizados pelo usuário: 19 relatórios, um por derivado, mais 3 listagens (alimentos e derivados). As requisições foram feitas por script ao mesmo endereço que a página usa, uma por relatório. As respostas brutas ficaram fora do repositório.
2. **Curadoria restrita:** 12 alimentos e só as definições do catálogo (MS, MO, MM, PB, EE, FDN, FDNcp, FDA, LIG, NDT, Ca, P). Dos cerca de 190 nutrientes de cada relatório, os demais não foram transcritos.
3. **Uso pessoal, no aplicativo local**, com a citação em cada registro e a data de consulta.
4. Os valores entram como **"transcritos"**, para a conferência do usuário no próprio site.
5. **Recomendação:** antes de ampliar a curadoria ou distribuir o aplicativo, pedir aos autores, pelo contato da página "Como colaborar", confirmação por escrito de que o uso é permitido.

**Decisão do usuário (2026-10-21):** curadoria restrita mantida, para uso pessoal e sem redistribuição. Fica registrado que o site **não tem licença explícita** de reutilização. Antes de distribuir o banco com estes dados, consultar os responsáveis pelo CQBAL. A mesma nota está na observação da fonte `CQBAL_4_0` no pacote.

### 11.5 Correspondência de nutrientes (só por identidade)

| No CQBAL (código, nome, unidade) | Definição no sistema | Observação |
|---|---|---|
| MS, Matéria Seca, % | MS (% da MN) | **Aprovado** como interpretação técnica: % da matéria natural. A unidade original ("%") fica na observação de cada valor, com o aviso de que a base não é explicitada no relatório consultado |
| MO, Matéria Orgânica, %MS | MO | — |
| MM, Matéria Mineral, %MS | MM | O CQBAL lista também **CZ (Cinzas)** em código próprio. Por decisão do usuário, MM e CZ **não** são somados nem tratados como equivalentes ou como nutrientes independentes sem fundamentação; os nomes originais ficam preservados e CZ não é importado até esclarecer a correspondência metodológica |
| PB, Proteína Bruta, %MS | PB | — |
| EE, Extrato Etéreo, %MS | EE | — |
| FDN, Fibra Insolúvel em Detergente Neutro, %MS | FDN | — |
| FDNcp, FDN Corrigida Para Cinzas e Proteína, %MS | **FDNcp** (definição nova, migration 0014) | Variante, nunca equivalente à FDN |
| FDA, Fibra Insolúvel em Detergente Ácido, %MS | FDA | — |
| LIGNINA, %MS | LIG | **Aprovado.** O CQBAL tem também **LIG DA (Lignina em Detergente Ácido)** como nutriente separado. LIG DA não foi importado |
| NDT OBS, Nutrientes Digestíveis Totais Observados, %MS | NDT | **Aprovado.** Só o **observado**, identificado assim na observação de cada valor. Os NDT estimados por equação (NDT_BRCORTE2016 e outros) não foram importados |
| Ca, Cálcio, %MS | Ca | — |
| P, Fósforo, %MS | P | — |

Os métodos analíticos continuam **pendentes**: o CQBAL nomeia os nutrientes, mas não descreve os métodos nas páginas consultadas.

### 11.6 Ajustes da aprovação (2026-10-21): idade de corte, Marandu e dados suspeitos

- **Idade de corte do Capiaçu.** Apoio: Embrapa Gado de Leite, Comunicado Técnico 79, *BRS Capiaçu: cultivar de capim-elefante de alto rendimento para produção de silagem* (Pereira, Ledo, Morenz, Leite, Santos, Martins e Machado; Juiz de Fora, outubro de 2016). PDF obtido em www.infoteca.cnptia.embrapa.br e lido nesta sessão por extração de texto (a p. 4 foi identificada pela numeração impressa das demais páginas). A **Tabela 2 (p. 4)** dá a composição da forragem por "Idade de corte (dias)": 50, 70, 90 e 110. A Tabela 3 dá a da silagem por idade de corte: 90 e 110. O texto recomenda o corte para picado verde com "aproximadamente; 50-70 dias" e para ensilagem com "90-110 dias de idade de rebrota".
  - Os derivados do CQBAL de **70 e 110 dias** (n = 1) são iguais às linhas de 70 e 110 dias da Tabela 2 em MS, PB, FDN, lignina e NDT. Para eles, a idade de corte é **inequívoca** e foi preenchida.
  - O derivado **"50 DIAS"** (n = 2) é exatamente a média das linhas de 50 e 70 dias da Tabela 2. Provável intervalo 50/70 registrado como 50: a idade **não** foi preenchida, e o registro não é independente do de 70 dias. Intervalos permanecem intervalos.
  - Os derivados de **60, 90, 120 e 150 dias** não têm correspondência com a publicação: só a classe de idade da fonte, sem idade preenchida. A silagem "120 DIAS SILAGEM" também fica sem idade.
- **Valores repetidos com n = 1** (MM, EE, Ca e FDA entre as idades do Capiaçu) ficam sinalizados no registro e em cada valor, para conferência individual. Não devem ser tratados como observações independentes sem comprovação.
- **Marandu.** Espécie e cultivar *Urochloa brizantha* cv. Marandu, por decisão do usuário (conforme Embrapa e Ministério da Agricultura; essas publicações não foram consultadas nesta curadoria). A identificação original do CQBAL (derivado sob *Urochloa decumbens*) fica preservada, e a divergência fica sinalizada. O registro fica **bloqueado para importação** até conferir a correspondência.
- **Cinzas do farelo de soja** (CZ com n = 1; (valor omitido na versão pública: dado restrito a uso pessoal)): anomalia registrada no próprio registro e mantida fora do pacote até esclarecimento.
- **Dupla contagem (atenção para a 5C):** os registros de 70 e 110 dias, e parte do de 50, vêm dos mesmos dados da Tabela 2 do CT 79. Se a 5C cadastrar o CT 79 como estudo individual, esses dados não podem ser somados aos do CQBAL (decisão do usuário de evitar dupla contagem; regra 3d).

## 12. Fase 5C: Embrapa e estudos individuais (a partir de 2026-10-21)

Autorizada pelo usuário em 2026-10-21, com estas decisões:
- o Comunicado Técnico 79 da Embrapa (2016) é a referência para o BRS Capiaçu fresco e ensilado, pelas tabelas originais;
- registros do CQBAL e da Embrapa que podem compartilhar a mesma origem experimental ficam vinculados, não são independentes e não entram juntos em média sem confirmação;
- medido, calculado e estimado por equação nunca se confundem;
- outras publicações oficiais verificáveis sobre Capiaçu, silagem de milho e pastagens podem entrar;
- idade de corte só com evidência explícita; divergências preservadas;
- nenhum método inventado; ausente nunca vira zero;
- qualidade antes de quantidade;
- nada importado automaticamente;
- um commit por entrega; sem 5D.

### 12.1 Entregas

| Entrega | Conteúdo | Migration |
|---|---|---|
| **5C-1** | Forma de obtenção de cada valor (medido, calculado, estimado por equação, estimado por NIR, não informado) e vínculos de possível mesma origem experimental entre registros, declarados por pacote e decididos pelo usuário; pacote CQBAL versão 3 | 0015 |
| **5C-2** | Pacotes das publicações da Embrapa sobre o BRS Capiaçu, com os vínculos ao CQBAL e entre si | — |
| **5C-3** | Testes de ponta a ponta, inspeção visual e fechamento | — |

### 12.2 Portão: publicações levantadas (2026-10-21)

Todas obtidas em repositórios oficiais da Embrapa (Infoteca-e e Alice) e lidas nesta sessão por extração de texto com página e posição (pdf.js). As cópias ficam em `referencias/embrapa/`, fora do git, como as demais referências.

| Publicação | Situação | Motivo |
|---|---|---|
| Embrapa Gado de Leite, **Comunicado Técnico 79** (Pereira et al., 2016), *BRS Capiaçu: cultivar de capim-elefante de alto rendimento para produção de silagem* | **Entra** | Decisão do usuário. Tabela 2 (p. 4): forragem por idade de corte, 50, 70, 90 e 110 dias; Tabela 3 (p. 4): silagem, 90 e 110 dias. Sem aviso de direitos no documento |
| Embrapa Agropecuária Oeste, **Comunicado Técnico 261** (Retore et al., 2020), *Qualidade da silagem do capim-elefante BRS Capiaçu* | **Entra** | Silagem **com 15% de milho grão moído**, por idade de corte (60, 90 e 120 dias) e dose de N (0, 100 e 200 kg/ha/ano), 4 repetições, métodos informados por análise. Sem aviso de direitos no documento |
| Embrapa Agropecuária Oeste, **Comunicado Técnico 263** (Retore et al., 2021), *Manejo do capim BRS Capiaçu para aliar produtividade à qualidade* | **Entra** | Forragem por idade de corte (60, 90 e 120 dias), médias das doses de N, bases explícitas; composição **estimada por NIR**; a fonte avisa que a MS ficou alta por emurchecimento no processamento. Tabela "adaptada de Alves (2021)", provavelmente do mesmo experimento do CT 261. Sem aviso de direitos no documento |
| Embrapa Gado de Leite, Comunicado Técnico 95 (2023), *BRS Capiaçu: qual o momento certo para fazer a silagem?* | Não entra | Não traz composição do Capiaçu; só a MS de aditivos secantes. Traz "Todos os direitos reservados à Embrapa" |
| Embrapa Gado de Leite, Comunicado Técnico 100 (2009), *Cultivares de milho para silagem* | Não entra | Só altura, produtividade e leite estimado; sem composição |
| Cruz et al., *Produção e composição bromatológica de cultivares de milho para silagem* (Embrapa Milho e Sorgo, Alice) | Não entra | Tabelas de composição não estão em texto (provavelmente imagem) e o material é a planta inteira, não a silagem |
| Embrapa Meio-Norte, Boletim de Pesquisa e Desenvolvimento 100 (2011), PB, FDN e FDA de cinco gramíneas irrigadas | **Entra, limitada** (seção 12.5) | Traz "Todos os direitos reservados. A reprodução não-autorizada desta publicação, no todo ou em parte, constitui violação dos direitos autorais (Lei nº 9.610)". Consulta autorizada pelo usuário na aprovação da 5C para curadoria limitada e uso pessoal. Condição específica (irrigação e adubação no litoral do Piauí) |
| Neumann et al., Revista Brasileira de Milho e Sorgo, v. 6, n. 3, 2007 (silagem de milho por altura de corte e tamanho de partícula) | Consultado, não entra (seção 12.5) | Consulta autorizada pelo usuário na aprovação da 5C. Não traz a composição da silagem: só a da planta antes da ensilagem e de seus componentes |

**Silagem de milho e pastagens:** nenhuma publicação oficial com tabela legível e sem restrição de direitos foi encontrada nesta etapa. Continuam cobertas só pelo CQBAL (5B). Depois da aprovação, o capim-mombaça ganhou o registro do BPD 100 (seção 12.5).

### 12.3 Aprovação da 5C (2026-10-21): decisões do usuário

A 5C foi aprovada tecnicamente, com estas decisões:
1. **CT 261:** PB, FDN e FDA aceitos provisoriamente em % da MS, registrando que a base foi **inferida por consistência dos dados**, não declarada; a inferência nunca é apresentada como confirmação da fonte.
2. **Vínculos:** os 14 ficam como possíveis dependências experimentais; os registros vinculados não são observações independentes na futura agregação; as evidências ficam organizadas para confirmação (seção 12.4).
3. **Boletim 100 da Embrapa Meio-Norte e Neumann et al. (2007):** consulta autorizada para curadoria limitada e uso pessoal, com citação completa, sem redistribuir nem copiar as tabelas integralmente (seção 12.5).
4. **Marandu:** continua bloqueado até resolver a divergência taxonômica.
5. **MM e cinzas:** investigar e usar os métodos do CT 261 nos registros correspondentes, sem generalizar (seção 12.6).
6. **Versões anteriores do CQBAL:** preservadas; correções auditáveis, sem duplicação (seção 12.7).

Ajustes feitos, com a migration 0016:
- **Base interpretada** é dado próprio de cada valor (`interpretacao_base`): vazia, a base é a declarada pela fonte; preenchida, guarda a interpretação e o motivo. A tela mostra "Base inferida, não declarada pela fonte" ao lado do valor, e o motivo na coluna de método.
- Pacotes com base interpretada: CQBAL (MS em % da MN; **versão 4**), CT 79 (MS em % da MN; **versão 2**), CT 261 (MS em % da MN e PB, FDN e FDA em % da MS por consistência; **versão 2**) e BPD 100 (PB, FDN e FDA em % da MS). O CT 263 declara as bases ("%MN" e "%MS") e não muda. **Nenhum número publicado mudou.**

### 12.4 Evidências dos 14 vínculos, para confirmação

Todos estão "a confirmar". Enquanto não forem descartados, os dois lados contam como **uma só origem** (`registrosIndependentes` devolve falso). A confirmação ou o descarte é pela tela do registro, uma vez, com nome e motivo.

| # | Este registro | Outro registro | Relação | Evidência | O que confirmaria ou descartaria |
|---|---|---|---|---|---|
| 1 | CT 79, Tabela 2 (p. 4), forragem, 70 dias | CQBAL, derivado CAPIM BRS. CAPIAÇU 70 DIAS (código 2535) | Mesmos valores | MS, PB, FDN, lignina e NDT idênticos; o CQBAL tem n = 1 | A lista de referências do derivado no CQBAL, se o site a mostrar, ou consulta aos responsáveis |
| 2 | CT 79, Tabela 2, forragem, 110 dias | CQBAL, código 2536 | Mesmos valores | Idem, com a linha de 110 dias | Idem |
| 3 | CT 79, Tabela 2, forragem, 50 dias | CQBAL, CAPIM BRS. CAPIAÇU 50 DIAS (código 2534) | O outro inclui este | MS, PB, FDN, LIGNINA e NDT OBS do 2534 (n = 2) são a média exata das linhas de 50 e 70 dias (valor omitido na versão pública: dado restrito a uso pessoal) | Idem; se confirmado, o 2534 não é registro de 50 dias e não é independente do 2535 |
| 4 | CT 79, Tabela 2, forragem, 70 dias | CQBAL, código 2534 | O outro inclui este | Mesma média do item 3 | Idem |
| 5 | CT 79, Tabela 2, forragem, 90 dias | CQBAL, CAPIM BRS. CAPIAÇU 90 DIAS (código 2533) | O outro pode incluir este | As linhas de 50, 70 e 110 dias estão no CQBAL e a de 90 não aparece isolada; o 2533 (n = 9) tem médias diferentes. **Sem prova numérica** | Lista de referências do 2533 no CQBAL ou os responsáveis; sem isso, o vínculo continua por cautela |
| 6 a 14 | CT 261, Tabelas 1 e 3 (p. 5 e 8): silagem com milho, 60, 90 e 120 dias × 0, 100 e 200 kg N/ha/ano | CT 263, Tabela 2 (p. 7): forragem na mesma idade, média das doses | Provável mesmo experimento | Mesma unidade e parceria (Embrapa Agropecuária Oeste e UFGD, Dourados), mesmas idades de rebrota e doses de N, um ano; a Tabela 2 do CT 263 é "adaptada de Alves (2021)" e J. P. Alves é coautora do CT 261. **Materiais diferentes** (forragem e silagem com milho): o vínculo não diz que os valores são os mesmos, só que a origem experimental pode ser a mesma | A fonte citada pelo CT 263, Alves (2021), ainda não localizada nem lida; ou contato com os autores |

Para a 5D: os itens 1 a 4 são dependência forte (mesmos números ou média deles); o 5 é dependência possível; os 6 a 14 ligam materiais diferentes e só importam quando forragem e silagem forem comparadas ou combinadas.

### 12.5 Boletim 100 da Embrapa Meio-Norte e Neumann et al. (2007)

**Boletim de Pesquisa e Desenvolvimento 100** (Rodrigues, Andrade e Magalhães, Embrapa Meio-Norte, 2011): lido inteiro por extração de texto com posição; Tabelas 1 a 3 (p. 12 a 14) renderizadas e conferidas por imagem. Novo pacote `EMBRAPA_BPD100_5C`, em curadoria limitada:
- só as linhas do **capim-mombaça** e do **capim-marandu** ("Brizanta") das Tabelas 1 (PB), 2 (FDN) e 3 (FDA); as outras três gramíneas, as médias por dose e por lâmina, as letras do teste de Tukey e as equações da Tabela 4 não foram copiadas;
- PB pelo "método de Kjeldahl" e FDN e FDA pela "metodologia preconizada por Silva e Queiroz (2002)" (p. 11), **medidos**; n não informado;
- base não escrita nas tabelas: % da MS **interpretada** (amostras pré-secas a 65 °C antes das análises, p. 11; o texto compara a FDN com a faixa "na matéria seca", p. 13);
- idade de corte 35 dias: "quatro cortes com intervalo de 35 dias" (p. 11) e "aos 35 dias de idade" (título da Tabela 4, p. 17); teor médio do efeito isolado da gramínea, média de quatro cortes, num experimento irrigado com três lâminas e quatro doses de N (Parnaíba, PI, 2005);
- **Marandu bloqueado**, pela decisão 4. A publicação não tem a divergência (escreve *Brachiaria brizantha*, cv. Marandu no resumo); o desbloqueio depende da mesma decisão sobre o Marandu do CQBAL;
- a fonte guarda a frase de direitos reservados e a autorização de uso pessoal, sem redistribuição. Cópia local em `referencias/embrapa/` (SHA-256 `56b9b549c2277b2b55f2dcfbcf70f4190891716a46370616267360bc5ab63ed9`).

O pacote importa 1 alimento, 1 registro e 3 valores. Não há vínculo com o CQBAL: nada indica origem comum.

**Neumann, Mühlbach, Restle, Ost, Lustosa e Falbo, "Ensilagem de milho (*Zea mays*, L.) em diferentes alturas de corte e tamanho de partícula: produção, composição e utilização na terminação de bovinos em confinamento", Revista Brasileira de Milho e Sorgo, v. 6, n. 3, p. 379-397, 2007** (arquivo no repositório Ainfo da Embrapa): lido inteiro. **Não entra**: as tabelas trazem a MS da planta inteira e de seus componentes (Tabelas 2 e 4), a composição dos componentes estruturais da planta colhida rente ao solo (Tabela 5), dados de colheita e custos; **não há tabela de composição da silagem**. Cópia local em `referencias/artigos/` (SHA-256 `6f891a343d4835e86363cbff245391b470551963b487f1d6c2c3d0666fd73e10`). Silagem de milho continua só com o CQBAL.

### 12.6 MM e cinzas

O que as fontes lidas dizem:
- **CQBAL 4.0:** MM (código 6, "Matéria Mineral") e CZ (código 348, "Cinzas") são séries separadas, cada uma com seu n e sua média; no próprio site, as duas têm o mesmo nome em inglês ("ash" e "Ash"). Valores dos derivados com as duas séries omitidos na versão pública (dado restrito a uso pessoal). O relatório consultado não diz por que existem as duas séries nem os métodos de cada uma.
- **CT 261 (p. 4):** "análises de matéria seca, cinzas e matéria orgânica, segundo Association of Official Analytical Chemists (2005)", sem número de método. Cinzas e MO só aparecem como médias por idade ou por dose (Tabela 2), sem correspondência com os registros por combinação; não foram importadas.
- **CT 263 (p. 6):** quanto mais rente ao solo o corte, "maior a proporção de partículas que podem ficar aderidas às plantas e que serão quantificadas como matéria mineral".
- **Neumann et al. (2007, p. 384):** "matéria mineral (MM), por incineração a 550 ºC, durante quatro horas, e teor de matéria orgânica (MO), por diferença (% MO = 100 - MM), conforme CUNIFF (1995)".

Conclusão: nas publicações lidas, "matéria mineral" e "cinzas" nomeiam o resíduo da incineração, mas isso **não fundamenta tratar a série CZ do CQBAL como MM**: são séries distintas, com n e médias próprios, e a fonte não explica a diferença. Nada foi somado, convertido ou remapeado. Os métodos do CT 261 ficam **em cada valor** dos registros dele (MS: AOAC, 2005; PB: Dumas, AOAC 990.03; FDN e FDA: Mertens, 2002), não na definição de MM, que continua com método pendente.

### 12.7 Versões dos pacotes: atualização auditável sem duplicação

Versão nova de um pacote já importado entra pelo botão **"Atualizar para a versão N"**, nunca por nova importação (que continua recusada). Os registros são casados pela página ou tabela; a fonte só muda nos campos que o pacote define, com trilha e motivo.

| Situação do registro no banco | O que a atualização faz |
|---|---|
| Transcrito pelo próprio pacote | Volta a rascunho, recebe as mudanças e é transcrito de novo; cada passo no histórico |
| Conferido | Não muda. A versão nova do registro recebe as mudanças, transcrita; conferida pelo usuário, substitui a anterior |
| Em edição pelo usuário (rascunho ou transcrito por outra pessoa), rejeitado ou descartado | Não muda; as mudanças ficam listadas no cartão do pacote para o usuário decidir |
| Bloqueado na versão nova, mas já importado (ex.: Marandu da versão 1 do CQBAL) | Não muda; o motivo do bloqueio fica listado |
| Ausente da versão nova | Não muda; listado |
| Novo na versão nova | Criado e transcrito |

Tudo numa transação: uma recusa no meio desfaz tudo. O resultado fica guardado na importação da versão nova e aparece no cartão. Vínculos novos apontam para a primeira versão do registro e valem para a cadeia toda; os já existentes não são recriados.

## 13. Fase 5D: seleção, independência, agregação e cenários (planejamento, 2026-10-21)

**Situação: proposta para aprovação. Nada implementado.** Portão (seção 1): regra de agregação aprovada pelo usuário. Base: MODELOS_NUTRICIONAIS.md, seções 4 e 5; BANCO_DE_DADOS.md, seção 3.7 (tabelas previstas); decisões das aprovações da 5B e da 5C. Nenhum valor de agregação, nenhum mínimo e nenhuma estatística entra sem a decisão do usuário (seção 13.9). Os testes da 5D usam só casos sintéticos.

### 13.1 Objetivo

Para cada alimento da dieta, mostrar os registros candidatos, escolher (automática ou manualmente) o que vai para o cálculo e gravar um **perfil de composição imutável**: valores por nutriente, cenário, nível de correspondência, registros de origem e limitações. Dietas e avaliações (Fase 6) apontam para o perfil, nunca para a tabela viva.

### 13.2 Seleção de dados: o que pode ser candidato

| Critério | Proposta | Situação |
|---|---|---|
| Situação do registro | Só **conferidos vigentes**. Transcrito, rascunho, rejeitado, descartado, substituído e bloqueado (não importado) nunca | Já é regra (D5-4) |
| Alimento | Mesma espécie, cultivar (nível 1), forma de conservação e parte da planta; **nunca cruzar** espécie nem forma; silagem com milho é alimento próprio | Já é regra (MODELOS, 4.2) |
| Idade de corte | Tolerância **zero** por padrão: mesma idade ou mesma classe definida pela fonte; sem interpolação | Já é regra (MODELOS, 4.2; regra 3d) |
| Definição do nutriente | Mesmo código; variantes de método são definições diferentes (FDN e FDNcp nunca juntas); MM e CZ separados (D162) | Já é regra |
| Unidade e base | Converter só entre unidades compatíveis; MN para MS só com a MS **do próprio registro**; registro sem MS não é convertido e fica fora daquele nutriente | Já é regra (regra 3c) |
| Base interpretada | **Proposta:** entra, marcada; o perfil herda a marca e a tela mostra "base inferida" | **Decisão 6** |
| Forma de obtenção | **Proposta:** nunca agregar formas diferentes no mesmo valor; "não informado" fica à parte de "medido"; NDT medido e NDT estimado por equação são candidatos alternativos, não somáveis | **Decisão 7** |
| Não quantificado ("<0,01", "ND", traços) | Nunca vira número, zero ou limite; o nutriente aparece como "não quantificado" no perfil e bloqueia só o cálculo que depende dele | Já é regra (5A, 5B) |
| Valores sinalizados na curadoria (n = 1 repetido entre idades no CQBAL; MS do CT 263 com aviso de emurchecimento) | **Proposta:** marca estruturada "uso com cautela" decidida pelo usuário na conferência; marcado fica fora da agregação e só entra como candidato isolado, com aviso | **Decisão 11** |

### 13.3 Independência entre estudos

A unidade de contagem é a **origem experimental independente**, não o registro nem o n de observações.

1. **Grupos de dependência** (domínio puro, recalculados a cada seleção; nada gravado):
   - registros ligados por vínculo **não descartado** (a confirmar ou confirmado) ficam no mesmo grupo, transitivamente (`registrosIndependentes`, D155);
   - registros da mesma fonte com o mesmo `experimento_origem` também;
   - **tratamentos de um mesmo experimento** (ex.: as 9 combinações de idade e dose de N do CT 261) são um só grupo: não são estudos independentes do alimento. **Proposta:** escolher o tratamento que corresponde às condições buscadas (ex.: a dose de N); sem correspondência, o grupo entra com a média dos tratamentos compatíveis, contada como **uma** origem (**Decisão 9**).
2. **Tabela compilada nunca é agregada com estudo individual** (MODELOS, 5.2): são candidatos alternativos. O vínculo entre os dois lados impede apresentar "duas fontes que concordam" quando são a mesma (ex.: CT 79, 70 dias, e CQBAL 2535).
3. **Tabelas compiladas não são agregadas entre si** (proposta): podem conter os mesmos estudos (**Decisão 10**).
4. O n mínimo (seção 13.4) conta grupos independentes.

Efeito nos dados atuais, sem números novos:
- Capim BRS Capiaçu verde, 70 dias: CT 79 e CQBAL 2535 formam **um** grupo (mesmos valores); a compilada e o estudo seguem como alternativos.
- Capim BRS Capiaçu verde, 90 dias: CT 79 (forma não informada) e CT 263 (NIR) são estudos de origens diferentes, mas de formas de obtenção diferentes; pela Decisão 7, não somam.
- Silagem de milho: só o CQBAL (código 52), compilada: candidato único.
- **Resultado:** com os dados de hoje, quase nenhum alimento tem origens independentes suficientes para agregação ou cenários. A 5D mostraria registros únicos com o aviso, o que é o comportamento correto.

### 13.4 Critérios de agregação (regra versionada; sem aprovação, não é usada)

| Item | Opções | Proposta | Situação |
|---|---|---|---|
| n mínimo de origens independentes | 2, 3 ou 5 | **3**: com 2 origens não há ordem nem dispersão que permita escolher extremos; é parâmetro operacional, como os limites do GMD, não valor científico | **Decisão 1** |
| Valor central | Média ponderada pelo n de observações; média simples das origens; mediana das origens | **Média simples das origens** (cada origem independente pesa 1; o n de observações, quando publicado, vai como informação); mediana mostrada ao lado. A ponderação por n (MODELOS, 5.3) dá a um único estudo grande o peso de vários e ignora a variação entre estudos | **Decisão 2** |
| Dentro de uma origem | Média dos tratamentos compatíveis ou tratamento correspondente | Ver Decisão 9 | **Decisão 9** |
| Abaixo do mínimo | Registro único | **Registro único**, com "um único estudo" ou "tabela compilada" e as limitações | Já é regra (MODELOS, 5.1) |
| Estatística publicada | Usar média, DP e n como publicados | Só quando a fonte define a estatística; a coluna "S" do CQBAL **não** é usada (sem definição na fonte) | Já é regra (5B) |

A regra fica na tabela `regra_agregacao` (BANCO_DE_DADOS.md, 3.7), com versão, critérios, parâmetros, justificativa e **data de aprovação pelo usuário**; sem data, o seletor não agrega. Mudar a regra cria versão nova; perfis antigos continuam com a versão usada.

### 13.5 Cenários conservador, central e favorável

- **Central** = valor representativo da seção 13.4 (o "médio" de MODELOS, 5.4).
- **Direção** de cada nutriente pelo catálogo: energia, proteína, minerais e digestibilidade, conservador é o menor; fibras e lignina, o maior; MS, o menor. **MO, MM e EE** estão "não definida": sem direção, sem cenário para eles (**Decisão 5**).
- **Estatística dos extremos** (**Decisão 3**):
  - (a) menor e maior valor entre as origens independentes, com o mínimo da Decisão 1 (**proposta**: simples, sem distribuição presumida, cada extremo é um dado real);
  - (b) percentis das origens (exigem mais origens que os dados atuais têm);
  - (c) média ± DP publicada pela fonte, só quando a fonte define o DP.
  - **Nunca** percentual fixo ("± 10%"), interpolação ou extrapolação.
- **Coerência** (**Decisão 4**):
  - **cenário coerente (proposta)**: o conservador é a origem real no extremo desfavorável de um indicador principal, com todos os nutrientes dela juntos. Indicador proposto por classe: volumosos e pastagens, FDN; concentrados energéticos, NDT; proteicos, PB. Se essa origem não tiver um nutriente, ele fica ausente no cenário (nunca completado de outra origem sem aviso);
  - alternativa, **envelope independente**: cada nutriente no seu extremo, com o rótulo "envelope de pior caso, não corresponde a um alimento real".
- Sem origens suficientes: só o cenário central (ou "único"), com "cenários indisponíveis: dados insuficientes".

### 13.6 Perfil de composição

Imutável depois de usado (MODELOS, 4.3). Guarda: alimento, critérios de busca, nível de correspondência e diferenças, cenário, forma de obtenção do perfil (registro único, agregação), versão da regra, escolha manual ou automática, limitações, e por valor: número, unidade, base, n de origens usadas, marcas herdadas (base interpretada, forma de obtenção, valores sinalizados) e cada valor de origem (`perfil_valor_origem`). Os grupos de dependência considerados ficam no perfil, para rastreio.

### 13.7 Entregas propostas (cada uma com testes e commit próprio)

| Entrega | Conteúdo | Migration |
|---|---|---|
| **5D-1** | Domínio puro: candidatos e níveis, grupos de dependência, estatísticas (central, extremos, coerência), casos sintéticos e testes de propriedade | — |
| **5D-2** | Regra de agregação versionada, com tela para o usuário revisar e aprovar (nenhuma regra nasce aprovada); marca "uso com cautela" na conferência, se a Decisão 11 for aprovada | 0017 |
| **5D-3** | Seletor: candidatos por alimento, nível, diferenças, grupos de dependência e motivo de cada exclusão, na tela | — |
| **5D-4** | Perfis de composição e cenários, imutáveis, com origem de cada valor | 0018 (ou junto da 0017) |
| **5D-5** | E2E, inspeção visual e fechamento | — |

A materialização de agregados do resultado da Fase 4 continua decisão separada e não entra na 5D sem pedido.

### 13.8 Testes

- Casos sintéticos com resultado conhecido para cada estatística e para os grupos de dependência (cadeias de vínculos, vínculo descartado devolve a independência, tratamentos de um experimento, compilada e estudo nunca somados).
- Propriedades com `criarGeradorDeterministico`: o central fica entre os extremos; trocar a ordem dos registros não muda o resultado; acrescentar um registro dependente não muda o n de origens; nenhum nutriente ausente vira zero.
- Nenhum teste da 5D usa número real de composição como expectativa estatística.

### 13.9 Decisões do usuário (portão da 5D)

1. n mínimo de origens independentes (proposta: 3).
2. Valor central (proposta: média simples das origens, com a mediana ao lado).
3. Estatística dos extremos (proposta: menor e maior origem, com o mínimo do item 1).
4. Cenário coerente ou envelope (proposta: coerente; indicador principal por classe: FDN, NDT ou PB).
5. Direção conservadora de MO, MM e EE (proposta: continuar "não definida", sem cenário, até haver fundamento).
6. Base interpretada na agregação (proposta: entra, marcada).
7. Formas de obtenção diferentes no mesmo valor (proposta: nunca; "não informado" à parte).
8. Vínculos a confirmar contam como dependência até o descarte (já decidido na aprovação da 5C; confirmar a transitividade).
9. Tratamentos de um mesmo experimento (proposta: tratamento correspondente; sem ele, média dos compatíveis como uma origem).
10. Tabelas compiladas entre si (proposta: nunca agregadas).
11. Marca "uso com cautela" decidida na conferência (proposta: criar; marcado fica fora da agregação).
12. Marandu continua bloqueado; a 5D não muda isso.

### 13.10 Decisões do usuário ao autorizar a 5D (2026-10-22)

A 5C foi aprovada e a 5D autorizada, com estas decisões (aplicadas na regra `SELECAO_5D` versão 1):
1. Mínimo de **3 origens independentes** para agregar; com menos, referência individual, sem média artificial, identificada como evidência limitada.
2. Valor central: **média simples por origem independente**, com a mediana e a cobertura por nutriente.
3. Extremos: **mínimo e máximo observados**, nunca intervalo de confiança.
4. Cenários por **perfis reais e coerentes**; FDN, PB ou NDT isolados nunca classificam a qualidade global. Na implementação, cada cenário é rotulado pelo nutriente que o define ("conservador para PB") e traz todos os nutrientes de um único registro real.
5. MO, MM e EE continuam **sem direção conservadora** (sem cenário por eles).
6. **Bases inferidas** só entram na agregação automática depois de validadas pelo usuário.
7. **Métodos e formas de obtenção diferentes** não são combinados sem equivalência fundamentada (nenhuma cadastrada).
8. **Agrupamento transitivo** dos vínculos não descartados.
9. **Tratamentos do mesmo experimento** contam como uma origem; cada tratamento fica separado, e o usuário escolhe qual representa a origem.
10. Tabelas compiladas **não são combinadas** entre si nem com estudos individuais.
11. Classificação **"Uso com cautela"**, separando a fidelidade da transcrição (conferência) da adequação científica (avaliação).
12. CT 261 e os 14 vínculos continuam pendentes; nada presume independência nem confirma vínculo.

Requisitos adicionais: seleção em três níveis (específico, comparável, geral); idade exata para o específico, e aproximação só com justificativa e aviso; nunca cruzar espécie, cultivar, forma de conservação, parte da planta ou processamento; ausente nunca zero; nenhum perfil "observado" montado com nutrientes de fontes diferentes; referência individual conferida permitida, com as limitações; regras versionadas; nada alterado nem importado automaticamente no banco operacional.

### 13.11 O que foi implementado

| Entrega | Conteúdo | Commit |
|---|---|---|
| **5D-1** | Domínio puro (`selecao.ts`): regra `SELECAO_5D` v1, níveis, origens independentes (mesma publicação de estudo, mesmo experimento declarado, vínculo não descartado, transitivo), agregação por classe (unidade, base, tipo de valor, forma, método), cenários por perfil real, montagem de perfis | `5aff918` |
| **5D-2** | Migration 0017: `avaliacao_cientifica` (uso com cautela no registro ou no valor; base validada no valor com base inferida; retirada uma vez, com motivo), `aprovacao_regra_selecao` (hash do conteúdo aprovado), `perfil_composicao`, `perfil_valor` e `perfil_valor_origem` imutáveis; serviço, canais IPC e seção "Avaliação científica" no registro | `5bca26e` |
| **5D-3 e 5D-4** | Abas **Seleção** (regra e aprovação, candidatos por nível com diferenças e exclusões, origens, escolha de tratamento, agregação por nutriente, cenários) e **Perfis** (lista e detalhe imutável, com limitações e origem de cada valor) | `4de3aa8` |
| **5D-5** | Teste com os pacotes reais (BRS Capiaçu, 90 dias), E2E pela tela, inspeção visual e documentação | este commit |

Como a seleção trata cada caso:
- **Nível:** mesmo alimento, mesma idade: específico. Mesmo alimento, idade não informada pela fonte (ou busca sem idade): comparável, com aviso. Outro alimento da mesma espécie, forma, parte e processamento, **sem cultivar**: geral. Cultivar, espécie, forma, parte ou processamento diferentes: fora. Idade diferente: fora (tolerância 0 na versão 1).
- **Elegível como referência individual:** conferido, vigente, com valores. Uso com cautela não impede, mas aparece como aviso.
- **Agregação:** só o nível específico, só estudos individuais, sem uso com cautela, base declarada ou validada; por classe; uma origem com mais de um tratamento só entra com o tratamento escolhido. Suficiente com 3 origens na mesma classe; duas classes suficientes do mesmo nutriente não se combinam.
- **Perfis:** gravados só pelo botão, com a regra aprovada; referência individual (todos os valores de um registro), agregado central (só os nutrientes agregados; os demais ausentes, com o motivo) ou cenário por perfil real (todos os valores do registro no extremo do nutriente escolhido). Nunca alterados nem excluídos.

### 13.12 Correção da aprovação da 5D (2026-10-22): idade escrita no texto da fonte

A 5D foi aprovada tecnicamente com uma condição: registro sem idade estruturada, mas com a idade escrita no texto da fonte (ex.: a classe do CQBAL "CAPIM BRS. CAPIAÇU 60 DIAS"), não pode ser tratado como idade desconhecida. **Regra `SELECAO_5D` versão 2** (hash novo; a versão 1 continua no código, com o comportamento antigo, para rastreio):

| Situação do registro (busca com idade) | Versão 2 |
|---|---|
| Idade estruturada igual à buscada | Específico |
| Idade estruturada diferente | Fora (tolerância 0) |
| Sem idade estruturada e sem idade no texto | Comparável, com aviso (idade realmente desconhecida) |
| Sem idade estruturada, idade no texto **diferente** da buscada | **Fora**, com o texto original no motivo |
| Sem idade estruturada, idade no texto **igual** à buscada (ou mais de uma idade no texto) | **Pendente de validação**: sem nível e fora do uso, até o usuário preencher a idade de corte numa nova versão conferida do registro |
| Idade estruturada e texto citando outra idade | Mantém o nível da idade estruturada, com aviso da divergência |

O texto da classe é só lido (números seguidos de "dia" ou "dias"); nada é gravado nem deduzido além dele, porque o nome não prova a idade (o derivado "50 DIAS" do CQBAL é a média das linhas de 50 e 70 dias do CT 79; seção 12.4, item 3). A tela da Seleção passa a separar **origens encontradas** e **origens elegíveis para agregação**.
