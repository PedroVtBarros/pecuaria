# PLANO_FASE_6.md — Motor nutricional BR-CORTE (RF-04)

> **Situação em 2026-10-22: só planejamento, aguardando aprovação.** Nenhuma equação foi transcrita nem implementada. Regras: CLAUDE.md (1, 3, 3a, 3b, 3d, 3e); MODELOS_NUTRICIONAIS.md, seções 7 a 12; ROADMAP.md, Fase 6.

## 1. A fonte

| Item | O que o arquivo mostra |
|---|---|
| Arquivo | `referencias/BR-CORTE.pdf` (fora do git), 480 páginas, SHA-256 `028b86e079fc23d0b53dd15fe09e72128410c5aa742a15c8151c5ed17a5873f7` |
| Obra | *Exigências Nutricionais de Zebuínos Puros e Cruzados – BR-CORTE* (cabeçalho das páginas), capítulos 1 a 17 |
| Edição | DOI `10.26626/978-85-8179-192-0.2023.C0nn` em cada capítulo; o texto chama a edição de 2016 de "terceira edição" e o cap. 17 cita "BR-CORTE, 2023". Indica **4ª edição, 2023**, ISBN 978-85-8179-192-0 (pelo DOI) |
| O que falta no arquivo | Capa, ficha catalográfica e sumário: **a edição não foi confirmada pela ficha** (regra 3b) |
| Ordem | Capítulos fora de ordem no PDF; mapa página do PDF → página do livro no inventário |

Leitura feita nesta etapa: extração de texto com posição (pdf.js) do arquivo inteiro, uma vez; leitura das legendas de tabela, dos quadros-resumo de energia (Tabelas 8.9 e 8.10, p. 198–199), do sumário e do roteiro dos exemplos do cap. 17 (p. 431–440) e da Tabela 4.5 (p. 105). A extração de texto **embaralha expoentes e sinais** (ex.: "PCJ = 0,8915 × PC^1,0151" sai em duas linhas): nenhuma equação será transcrita do texto; só da imagem da página, conferida.

## 2. Mapa do livro para o motor

| Cap. (p.) | Conteúdo | Uso no motor |
|---|---|---|
| 1 (1–14) | Ajuste de peso: PC, PCJ, PCVZ, GPCVZ | Entradas de todas as exigências |
| 2 (15–44) | Consumo de matéria seca (confinamento e pasto) | CMS previsto |
| 3 (45–74) | Degradação ruminal da proteína, proteína microbiana | PDR, PNDR, PM ofertada |
| 4 (75–112) | Valor energético da dieta pela composição (Tabela 4.5, p. 105: frações EEvd, CNFvd, FDNd, PBvd → NDT, ED, EM) | Energia ofertada (opção, decisão C4) |
| 5, 6 (113–164) | Composição corporal e de carcaça; peso de carcaça; perda no transporte | Fora do primeiro escopo |
| 7 (165–176) | Respirometria, zebuínos e cruzados de leite | Fonte de parâmetros do cap. 8; não é modelo de vaca leiteira |
| 8 (177–204) | Energia: ELm, ELg, km, kg, EM, ED, NDT; resumos (8.9 pasto, 8.10 confinamento) e exemplo (p. 199) | Exigência de energia; ganho a partir da energia |
| 9 (205–234) | Proteína e aminoácidos; resumos 9.13 e 9.14 (p. 226–227) | Exigência de proteína |
| 10 (235–272) | Minerais; resumo 10.14 (p. 264); níveis tóxicos 10.13 (p. 263) | Exigência de minerais |
| 11, 12 (273–328) | Vacas vazias, gestantes e lactantes; bezerros lactentes | Segunda etapa (decisão C2) |
| 13–16 (329–430) | Excreção de N e P, água, vitaminas, aditivos | Fora do primeiro escopo |
| 17 (431–480) | Exemplos completos (p. 432–440) e tabelas de exigências por categoria (17.3 a 17.16) | **Casos de teste** |

**Categorias com tabelas publicadas (Tabelas 17.1 e 17.2, p. 431):** crescimento e terminação em confinamento — zebuínos, cruzados de corte e cruzados de leite × macho não castrado, castrado e fêmea; a pasto — zebuíno macho não castrado; vacas primíparas e multíparas lactantes; bezerros lactentes de 100 a 250 kg. Vaca leiteira não é coberta (regra 3).

**Casos de validação já localizados:** exemplo de energia do cap. 8 (zebuíno não castrado, 520 kg, 1,6 kg/dia, confinamento; p. 199); exemplos do cap. 17 para crescimento e terminação (zebuíno não castrado, 520 kg, 1,4 kg/dia, com CMS, energia, proteína, 14 minerais, água e aminoácidos; p. 432–435), vaca lactante (p. 436–438) e bezerro lactente (p. 439–440); Tabelas 17.3 a 17.16.

## 3. Entregas propostas

Cada entrega: testes, um commit, aprovação do usuário onde indicado.

| Entrega | Conteúdo | Critério de aprovação |
|---|---|---|
| **6.0** | `INVENTARIO_BR_CORTE.md`: cada equação do escopo aprovado com id, capítulo, página, número, categoria, variáveis, unidades, coeficientes, faixa de validade e hipóteses, **transcrita da imagem da página** e conferida duas vezes; lista dos casos de teste com página. Sem código | Usuário aprova o inventário e confirma as equações críticas |
| **6A-1** | Pacote `nutrition-engine` (puro): registro de equações (MODELOS 7.3), unidades, faixa de validade, grafo de dependências e bloqueio parcial; testes só com equações fictícias | Testes do registro e do grafo |
| **6A-2** | Peso (cap. 1 e resumos do cap. 8): PCJ, PCVZ, GPCVZ, PCVZeq | Bate com os exemplos (p. 199, 432) |
| **6A-3** | Energia (cap. 8): ELm, ELg, km, kg, EMm, EMg, EM, ED, NDT, confinamento e pasto | Bate com p. 199, 432–433 e Tabelas 17.3a a 17.12a |
| **6A-4** | CMS (cap. 2) | Bate com p. 432 e tabelas do cap. 17 |
| **6A-5** | Proteína (cap. 9 e 3): PMm, PMg, PDR, PNDR, PB | Bate com p. 433 e tabelas |
| **6A-6** | Minerais (cap. 10) | Bate com p. 433–435 e Tabelas 17.xb |
| **6A-7** | Tela de exigências por animal ou lote, com "Como foi calculado?"; E2E | Revisão do usuário |
| **6B** | Dieta em kg de MN por cabeça e dia com perfis gravados da 5D; oferta, balanço por nutriente com bloqueio parcial; snapshot `avaliacao_dieta` (migration 0018) | Casos sintéticos e um exemplo do livro |
| **6C** | Desempenho previsto (decisão C6) | Aprovação do método |
| **6D** | Custos (por kg de MS, por cabeça e dia, por kg de ganho previsto) | Testes com dinheiro em centavos |
| **6E** | Previsto e observado (pesagens) | — |
| **6F** | Vacas e bezerros (cap. 11, 12), se aprovado | Bate com p. 436–440 e Tabelas 17.13 a 17.16 |

Numeração revista em 2026-10-26 (seção 9.7): o plano original juntava desempenho e custos na 6C; o usuário separou os dois, porque o custo por kg de ganho depende do método de desempenho aprovado. Previsto × observado passa a 6E e vacas e bezerros a 6F. Decisões anteriores que citam "6D" ou "6E" valem para a nova numeração.

## 4. Decisões que precisam de aprovação

### Científicas

| # | Decisão | Proposta |
|---|---|---|
| C1 | Edição | Adotar a 4ª edição (2023) como edição única, identificada pelo DOI e pelas referências internas, registrando que a ficha catalográfica não está no arquivo. Ou fornecer a ficha/capa para confirmar |
| C2 | Categorias da primeira etapa | Crescimento e terminação (confinamento: 3 grupos × 3 classes sexuais; pasto: só onde houver equação). Vacas e bezerros em 6E |
| C3 | Nutrientes da primeira etapa | CMS, energia (EM, ED, NDT), proteína (PM, PDR, PNDR, PB), macrominerais (Ca, P, Mg, Na, K, S). Microminerais, aminoácidos, água, vitaminas e aditivos depois |
| C4 | Energia ofertada pela dieta | Fase 6B: somar o NDT (ou a energia) dos perfis gravados, ponderado pela MS de cada alimento, e marcar a forma de obtenção de cada NDT (observado, estimado por equação). A predição pela composição (cap. 4) fica para depois: exige frações que o catálogo não tem (CNF, FDNi ou FDNpd, frações digestíveis) |
| C5 | Proteína ofertada | PB da dieta avaliada; PDR, PNDR e PM ofertadas ficam **indeterminadas** até haver dados de degradação ruminal dos alimentos (cap. 3), sem valor presumido |
| C6 | Desempenho previsto | Usar os modelos de predição de ganho do cap. 8 (Tabelas 8.6 a 8.8) se o inventário confirmar que servem para isso; senão, as equações de exigência resolvidas para o ganho por método numérico (MODELOS 7.4), limitado pela energia e mostrado como "ganho permitido pela energia" |
| C7 | MS do perfil | A conversão MN → MS usa a MS do perfil. MS com base inferida (CQBAL, CT 79) entra no cálculo com aviso, ou exige validação antes (como na agregação)? Proposta: **exigir validação** |
| C8 | Tolerância dos testes | Diferença menor ou igual a meia unidade do último algarismo publicado em cada valor do exemplo; diferença maior reprova a entrega |
| C9 | Equações críticas para sua conferência | Todas as dos quadros-resumo (8.9, 8.10, 9.13, 9.14, 10.14) e as de CMS |
| C10 | Faixa de validade | Entrada fora da faixa descrita pelo livro (estatística descritiva dos bancos de dados) calcula com aviso, sem bloquear; sem faixa publicada, aviso "faixa não informada" |

### Arquiteturais

| # | Decisão | Proposta |
|---|---|---|
| A1 | Pacote | `packages/nutrition-engine` puro (sem Electron, React, SQLite); coeficientes em arquivo de dados separado da lógica, cada um com página |
| A2 | Ativação de equação | Só com transcrição e conferência registradas e teste do livro passando |
| A3 | Entrada de composição | Só perfis gravados (5D), nunca a tabela viva; perfil de evidência limitada aceito com aviso |
| A4 | Persistência | Exigências calculadas na hora; avaliação de dieta gravada como snapshot imutável com edição, versão do motor, perfis e entradas (migration 0018) |
| A5 | Resultados separados | Exigência, oferta, previsto e observado em tabelas e telas separadas (regra 3e) |
| A6 | Leite | Nenhuma equação do BR-CORTE é usada para vaca leiteira; a tela recusa a categoria |

## 5. Decisões do usuário (2026-10-22)

- **Aprovadas como propostas:** C1 (BR-CORTE 2023, 4ª edição), C2, C3, C5, C7 e A1 a A6.
- **C4, ajustada:** NDT na avaliação energética só com conversões justificadas pelo BR-CORTE, respeitando unidades e bases.
- **C6, ajustada:** ganho limitado pela energia é diferente de previsão real de desempenho; resultado parcial nunca aparece como ganho garantido.
- **C8, ajustada:** tolerância por resultado publicado, considerando os arredondamentos; precisão completa nas etapas intermediárias.
- **C9, ajustada:** conferir todas as equações efetivamente usadas, inclusive as auxiliares.
- **C10, ajustada:** resultado fora do domínio validado não tem uso operacional (bloqueado).
- **A4, ajustada:** a avaliação imutável preserva entradas, versões, perfis, coeficientes, resultados e limitações.
- **Planilhas oficiais** do BR-CORTE: fonte adicional para testes independentes, quando disponíveis e compatíveis.
- Autorizada só a entrega 6.0.

## 6. Entrega 6.0 (2026-10-22)

Inventário em [INVENTARIO_BR_CORTE.md](INVENTARIO_BR_CORTE.md): 12 equações de peso (com a tabela de PCVZmat), 16 de energia, 7 de CMS, 10 de proteína e as de 6 macrominerais, todas conferidas na imagem da página; dependências; 6 casos de verificação do próprio livro; domínio validado por categoria; 12 achados. Verificação numérica preliminar reproduz os exemplos (seção 8 do inventário). Nada implementado; banco operacional intocado.

## 7. Implementação (autorizadas só 6A-1 e 6A-2, 2026-10-22)

| Entrega | Conteúdo | Commit |
|---|---|---|
| 6A-1 | `packages/nutrition-engine/src/nucleo`: unidades explícitas (valor sempre com unidade; unidade diferente é recusada; sem conversão implícita), categorias (grupo, sexo, sistema), resultado com situação (`valido`, `fora_do_dominio` sem uso operacional, `fora_do_escopo` e `indeterminado`, nunca zero nem NaN), coeficientes e entradas guardados no resultado (A4), registro que só aceita equação transcrita, conferida, com referência e caso de teste (A2), grafo de dependências com bloqueio parcial e propagação da perda de uso operacional, e comparação com valor impresso (C8). Testes só com equações fictícias | este commit |
| 6A-2 | `packages/nutrition-engine/src/br-corte-2023`: coeficientes de peso como impressos, com página (dados separados da lógica); domínios da Tabela 1.2 e das Tabelas 8.1 a 8.4; equações P-01 a P-11 registradas (transcritas, conferidas na imagem, com caso de teste; aprovação do usuário pendente); cadeia PC, GMD → PCJ, PCVZ, PCVZeq, GPCVZ com escolha da equação por categoria, escopo (pasto só zebuínos machos; GMD negativo fora), domínio mais estreito e unidades explícitas. Testes T-01, T-03, T-04, T-07 a T-12 (livro e planilha oficial). Divergências D-PESO-01 a 03 no inventário, seção 13. `VERSAO_MOTOR` 0.2.0 | este commit |
| 6A-2, ajustes | Testes da Tabela 1.7 separados (precisão integral; etapa com PCJ impresso); limites da Tabela 1.2 provisórios, com aviso (P-13); aprovação do usuário registrada nas equações de peso | `5314af3` |
| 6A-3 | Energia (E-01 a E-15): coeficientes como impressos, com página; domínio de PCVZ e GPCVZ por categoria; CMS como entrada informada e identificada; GMD zero com ERprot indefinida e bloqueio do que depende dela; avisos fixos (ED–EM sem faixa tabelada). Testes T-01, T-04 e EM das Tabelas 17.3a a 17.12a (320 linhas). Divergências D-EN-01 a 06 no inventário, seção 14. `VERSAO_MOTOR` 0.3.0 | `cdf43e7` |
| 6A-4 | CMS (BRC23-C-01-03, C-04-05 e C-06; Eq. 2.1 a 2.6 do cap. 2, conferidas na imagem): domínios das Tabelas 2.1, 2.7 e 2.11 e limites da p. 35; CMS previsto ou informado em `calcularEnergia`, sempre identificado. Testes: Tabelas 2.4, 2.10 e 2.14, T-01, T-04, planilha oficial e CMS, NDT e NDT % das Tabelas 17.3a a 17.12a (320 linhas). Aprovação das E-01 a E-15 e decisões D-EN-01 a 06 registradas (inventário, seção 14.1). Pendências D-CMS-01 a 05 no inventário, seção 15. `VERSAO_MOTOR` 0.4.0 | `b2bee4a` |
| 6A-4 (ajustes) | Aprovação das C-01 a C-06 e decisões D-CMS-01 a 05 (inventário, seção 15.1): opção de terminação intensiva a pasto (Eq. 2.1, p. 37) para zebuínos machos, sem mudar o sistema nos demais cálculos; fêmea a pasto como restrição do projeto; testes de regressão. `VERSAO_MOTOR` 0.4.1 | `6763ee9` |
| 6A-5 | Proteína (R-01 a R-10; cap. 9 e PBmic do cap. 3, conferidos na imagem): PMm, PLg, k com o limite de PCJ 340 kg, PMg, PMt, PB em forma fechada, PBmic, PDR e PNDR, como exigências (CPB = PB exigida, CNDT = NDT exigido); domínios das Tabelas 9.2 a 9.5 e 3.7; domínio da saída no núcleo. Testes: T-02 (integral e por etapas), T-04, planilha oficial e PDR, PNDR e PB das Tabelas 17.3a a 17.12a (913 de 960 com os coeficientes impressos; 960 com os da planilha). Pendências D-PROT-01 a 09 no inventário, seção 16. `VERSAO_MOTOR` 0.5.0 | `4d2e941` |
| 6A-5 (ajustes) | Aprovação das R-01 a R-10 e decisões D-PROT-01 a 09 (inventário, seção 16.1): R-11 a R-13 (PB % da MS, PDR e PNDR % da PB) como indicadores derivados; PNDR negativa sinalizada como inconsistência, sem uso operacional; coeficientes da planilha só em testes de compatibilidade. `VERSAO_MOTOR` 0.5.1 | `f197eee` |
| 6A-6 | Macrominerais (Ca, P, Mg, Na, K e S; Tabela 10.14 e cap. 10, conferidos na imagem): mantença pelo PC, ganho pelo PCVZ e GPCVZ com plateau de Ca e P, líquida e dietética pelo coeficiente de retenção; domínios das Tabelas 10.3, 10.5 e 10.6; `semDominioPublicado` no núcleo. Testes: T-03 (integral e por etapas), T-04 e exigências dietéticas das Tabelas 17.3b a 17.12b (1920 células). Pendências D-MIN-01 a 11 no inventário, seção 17. `VERSAO_MOTOR` 0.6.0 | `b5ef394` |
| 6A-6 (ajustes) | Aprovação das 24 equações e decisões D-MIN (inventário, seção 17.1): relação Ca/P como razão das exigências dietéticas (BRC23-M-CaP); D-MIN-12 (Ca/P impressa errada na Tabela 17.8b). `VERSAO_MOTOR` 0.6.1 | `2271641` |
| 6A-7 | Interface de exigências: canal `nutricao:calcularExigencias` (Zod nos dois lados; `ServicoExigencias` no main chama o motor, sem banco, nada gravado) e tela "Nutrição de corte → Exigências do animal" (entrada por categoria, resultados de peso, CMS, energia, proteína e macrominerais com situação, motivo e "Como foi calculado?"; valor sem uso operacional só no detalhe, como análise). Testes do serviço, do canal, da tela e E2E com T-04, fora do escopo e fora do domínio, em claro e escuro, a 1280 e 900 px | `74803bd`, `5f443e6` |

## 8. Entrega 6A-7: interface de exigências (2026-10-24)

- **Camadas:** renderer → `window.api` → `nutricao:calcularExigencias` (entrada validada com Zod no renderer e no main) → `ServicoExigencias` no main → `@pecuaria/nutrition-engine`. O renderer não importa o motor; o main é a única fonte do cálculo (como D82). Nada é gravado (A4); o banco operacional não muda; nenhuma migration.
- **Entrada:** categoria fixa (crescimento e terminação de corte; vacas, bezerros e gado leiteiro recusados por não existirem na tela), grupo genético (zebuíno, cruzado de corte, cruzado de leite), classe sexual, sistema, PC médio (kg), GMD (kg/dia) e a fonte do CMS: por sistema, as equações do livro (confinamento: Eq. 2.1 a 2.3 ou 2.4 e 2.5 com NC; pasto: Eq. 2.6 com CMSs ou TIP) ou o CMS informado. Aviso prévio quando a categoria está fora do escopo a pasto.
- **Saída:** cada resultado com equação, descrição, páginas, coeficientes, entradas com unidade, valor integral, situação, motivos, avisos e aprovação; resumo por situação; CMS usado identificado. Situações na tela: "Pode ser usado", "Só para análise" (fora do domínio), "Fora do escopo" e "Não calculado". Valor sem uso operacional nunca aparece na coluna de exigência: só em "Como foi calculado?", com o texto "valor só para análise, fora do domínio validado; não é recomendação". Etapas intermediárias recolhidas. Aviso fixo: exigência não é oferta da dieta.
- **Pendências para decisão:** (1) cálculo **por animal ou lote** com dados do rebanho não foi feito: o rebanho não registra castração e o grupo genético da raça é zebuíno, taurino, cruzado ou indefinido, sem separar cruzado de corte e de leite; preencher a tela a partir dele exigiria inferir dados (proposta: campos novos no animal ou escolha explícita na tela, com migration se aprovada); (2) os motivos do motor mostram números brutos (ex.: "PCVZ = 452.16789581616905") no detalhe; (3) o selo "Com aviso" aparece em quase todo resultado, porque os avisos fixos (domínio provisório, "exigência não é oferta") também contam.

### 8.1 Aprovação definitiva da 6A e ajustes de fechamento (2026-10-24)

**6A-1 a 6A-7 aprovadas definitivamente pelo usuário**, com os commits apresentados. Ajustes pedidos na aprovação:

1. **Cálculo individual com parâmetros informados à mão**, sem migration nem campos novos no animal. **Pendência futura:** integração automática com animais e lotes (exige registrar castração e separar cruzado de corte e de leite no rebanho, ou escolha explícita na tela; o sistema não deduz grupo genético nem castração de dados insuficientes).
2. **Números legíveis** nos motivos e avisos do motor (vírgula decimal, milhar, unidade, casas pela grandeza; limites publicados sem arredondar; um valor que, arredondado, pareceria igual ao limite ganha casas até se distinguir) e no detalhe da tela (entradas e resultados com a mesma regra; valor integral no texto de passar o mouse). Os valores internos não mudam. `VERSAO_MOTOR` 0.6.2, porque o texto das mensagens mudou.
3. **Selo "Com aviso"** só para limitações científicas, domínios provisórios e restrições de aplicação (`avisos`). As notas informativas fixas (`notas`: CMS usado, exigência não é oferta, forma fechada da PB, exigência dietética mineral, Ca/P como razão de exigências) ficam em "Observações" e não acionam o selo.
4. **GMD desejado** (planejado) na tela e no contrato, distinto do GMD observado nas pesagens (comparação previsto × observado na 6E, numeração da seção 9.7).

D-MIN-12 (Ca/P impressa 24,3 na Tabela 17.8b, p. 457; calculada 0,432) segue registrada (INVENTARIO_BR_CORTE.md, seção 17.1).

## 9. Planejamento da 6B: avaliação de dietas (2026-10-24; só planejamento, aguardando aprovação)

> Nada da 6B está implementado. Regras: CLAUDE.md (1, 2, 3c, 3d, 3e, 5, 6); MODELOS_NUTRICIONAIS.md, seções 6 e 7.4 a 7.8 e 7.11; decisões C4, C5, C7, A3 a A5 (seção 5). Requisitos: RF-04.2, RF-04.4, RF-04.5, RF-04.7, RF-04.9 a RF-04.12.

### 9.1 O que a 6B responde

"Esta dieta, com estes alimentos e quantidades, atende às exigências deste animal?" Para cada nutriente: **exigência** (motor da 6A), **oferta** (alimentos × quantidades × perfis gravados) e **balanço** (atende, déficit ou indeterminado), sem misturar os três (regra 3e). Desempenho previsto fica na 6C, custos na 6D, previsto × observado e aplicação a lote na 6E (seção 9.7).

### 9.2 Ponto de partida

| Já existe | Situação |
|---|---|
| Exigências (6A) | Peso, CMS, energia (EM, ED, NDT kg e % MS), proteína (PM, PDR, PNDR, PB kg e % MS), macrominerais (Ca, P, Mg, Na, K, S e Ca/P), com situação, domínio e rastreio |
| Perfis gravados (5D) | Imutáveis, por alimento: tipo (referência individual, agregado central, cenário real), cenário (único, central, conservador, favorável), nível de correspondência, valores com unidade, base (MS ou MN), tipo de valor, forma de obtenção, número de origens, mediana, mínimo, máximo, limitações e não quantificados |
| Catálogo de nutrientes | MS, MO, MM, PB, EE, FDN, FDA, LIG, NDT, Ca, P e FDNcp. **Não há** definições de Mg, Na, K, S, ED, EM nem frações de degradação ruminal |
| Unidades (5A) | % ↔ g/kg ↔ mg/kg ↔ ppm convertíveis; Mcal/kg e UI/kg sem conversão; MN ↔ MS ainda não implementada (prevista para a Fase 6) |

Consequências diretas, sem decisão nova: a oferta de **Mg, Na, K e S fica indeterminada** até existirem definições e dados com fonte; **PDR, PNDR e PM ofertadas ficam indeterminadas** (C5); a energia ofertada só pode vir do **NDT** dos perfis.

### 9.3 Entregas propostas

| Entrega | Conteúdo | Critério |
|---|---|---|
| **6B.0** | Inventário complementar, sem código: conferir na imagem do livro o que a avaliação de dieta usa (relação NDT ↔ ED ↔ EM da dieta e a Eq. 4.30, p. 87, com o intercepto 0,303, D-EN-01; Tabela 4.5, p. 105; uso do CNDT e do CPB ofertados na PBmic, A-07; níveis tóxicos da Tabela 10.13, p. 263, se a decisão C-6B-05 pedir) e localizar um exemplo numérico de dieta no livro para teste | Aprovação do inventário |
| **6B-1** | Oferta no motor (puro): quantidade em kg de MN por cabeça e dia → kg de MS pela MS do perfil; oferta por nutriente em kg/dia ou g/dia com base explícita; concentração na MS da dieta; bloqueio parcial por nutriente e por alimento; unidades com base no tipo (MN e MS não somam) | Casos sintéticos identificados como fictícios, só para a aritmética; exemplo do livro, se a 6B.0 achar |
| **6B-2** | Balanço exigência × oferta: atende, déficit ou indeterminado, com diferença absoluta e % da exigência; exigência sem uso operacional deixa o balanço sem uso operacional; CMS da avaliação conforme C-6B-01 | Testes de regras e de propagação |
| **6B-3** | Serviço no main: carrega só perfis gravados (A3), confere MS com base validada (C7), cautela, nível e limitações; canal IPC com Zod | Testes com banco de teste |
| **6B-4** | Snapshot imutável `avaliacao_dieta` (**migration 0018**, backup antes): entradas, alimentos, quantidades, perfis e seus valores usados, versões (motor, edição, regra de seleção), coeficientes, exigências, oferta, balanço, avisos e limitações (A4); grava só por ação do usuário | Testes da migration do zero e a partir da 0017; gatilhos de imutabilidade |
| **6B-5** | Tela "Avaliação de dieta", separada da de exigências; E2E; inspeção visual em claro e escuro, 1280 e 900 px | Revisão do usuário |

### 9.4 Decisões científicas pendentes

| # | Decisão | Proposta |
|---|---|---|
| C-6B-01 | **Qual CMS entra na exigência durante a avaliação.** ED e NDT exigidos dependem do CMS (E-13). Opções: (a) CMS previsto pelo BR-CORTE; (b) MS total oferecida, assumindo que tudo é consumido (sem sobras); (c) escolha do usuário | (c), com **(b) como padrão**: a exigência é calculada com a MS oferecida como CMS (identificada como "CMS assumido = MS oferecida"), e o CMS previsto aparece ao lado, só como comparação, sem julgamento |
| C-6B-02 | **Base da comparação de energia** | Só **NDT** (kg/dia e % da MS), que o catálogo tem e a exigência já dá, sem conversão. EM e ED ofertadas só depois da 6B.0 e de decidir D-EN-01 (0,3032 do cap. 8 ou 0,303 da Eq. 4.30) |
| C-6B-03 | **Proteína** | PB ofertada × PB exigida (kg/dia e % da MS). PDR, PNDR e PM ofertadas **indeterminadas** (C5). A exigência continua com CPB e CNDT exigidos (A-07); a PBmic da dieta ofertada não é calculada nesta etapa |
| C-6B-04 | **Minerais** | Ca e P ofertados × exigidos; Ca/P da oferta como razão derivada. Mg, Na, K e S indeterminados até haver definição no catálogo e dado com fonte (incluir definições exigiria curadoria nova, fora da 6B) |
| C-6B-05 | **Regra do balanço** | Atende se oferta ≥ exigência; déficit se menor; indeterminado se faltar dado. **Sem faixa de tolerância nem "excesso"** sem limite publicado: a diferença acima da exigência é mostrada como número, não como julgamento. Excesso de mineral só se for aprovado usar a Tabela 10.13 (níveis tóxicos), após conferência na 6B.0 |
| C-6B-06 | **MS do alimento** | MS do perfil gravado; MS com base inferida precisa estar validada (C7), senão os nutrientes em MS daquele alimento ficam indeterminados. Sensibilidade à MS: quando o perfil tiver mínimo e máximo observados da MS (agregado), mostrar o balanço também com esses dois valores; sem eles, só o aviso, sem faixa inventada |
| C-6B-07 | **Cenários** | Um perfil por alimento em cada avaliação; avaliar "conservador" e "favorável" é gravar avaliações separadas com os perfis de cenário real correspondentes, cada uma rotulada. Nunca misturar cenários de alimentos sem rótulo |
| C-6B-08 | **Rótulos comerciais (mínimo ou máximo garantido, base MN)** | Usar o valor garantido, convertido à MS com a MS do produto informada no perfil, com aviso de que é garantia e não teor real (MODELOS, seção 6) |
| C-6B-09 | **Dieta a pasto** | 6B só para alimentos com quantidade conhecida (cocho, confinamento). A pasto, o consumo de forragem não é medido; estimá-lo como CMS previsto (Eq. 2.6) menos o suplemento é uma inferência que fica para decisão própria, fora da 6B |
| C-6B-10 | **Entrada da quantidade** | kg de MN por cabeça e dia (como no cocho). Inclusão em % da MS (RF-04.2) só com o CMS escolhido em C-6B-01 explícito; proposta: aceitar as duas formas, guardando qual foi usada |
| C-6B-11 | **Valores dos perfis** | Agregado central: média por origem (5D); referência individual e cenário: o valor do registro. Valor não quantificado ("<0,01", "ND") nunca vira número: o nutriente fica indeterminado naquele alimento |
| C-6B-12 | **Limitações fixas na tela e no snapshot** | Frase "Composições médias de referência não garantem o desempenho previsto"; nível de correspondência e cautela de cada alimento; hipóteses do modelo; consumo assumido sem sobras |

### 9.5 Decisões arquiteturais pendentes

| # | Decisão | Proposta |
|---|---|---|
| A-6B-01 | Onde fica o cálculo da oferta | `packages/nutrition-engine`, módulo novo e puro (`avaliacao/`), sem equação do BR-CORTE: aritmética de unidades e bases, com tipos que separam MN e MS (MODELOS 7.11). A leitura dos perfis fica no main |
| A-6B-02 | Fluxo | Renderer → IPC (Zod) → serviço no main (carrega perfis gravados, monta entradas) → motor (exigência + oferta + balanço) → resultado. Renderer não calcula nem importa o motor (D172) |
| A-6B-03 | Persistência | Avaliar "na hora" sem gravar; botão "Gravar avaliação" cria o snapshot imutável `avaliacao_dieta` (migration 0018, backup antes), com tudo o que A4 pede; correção é avaliação nova, nunca edição |
| A-6B-04 | Animal | Entrada manual, como na 6A (sem campos novos nem inferência do rebanho); integração com animal e lote continua pendente |
| A-6B-05 | Estoque e preço | Fora da 6B: custo é 6D; vínculo alimento ↔ item de estoque (5A) só será usado para preço na 6D |
| A-6B-06 | Tela | Página própria "Avaliação de dieta" no módulo Nutrição de corte, com três blocos visualmente separados (exigência, oferta, balanço) e "Como foi calculado?" em cada linha |
| A-6B-07 | Versões | Snapshot guarda `VERSAO_MOTOR`, edição do BR-CORTE, código e versão da regra de seleção, ids e conteúdo dos perfis e o hash das entradas |

### 9.6 Fora da 6B

Desempenho previsto e "ganho permitido pela energia" (6C, C6); custos (6D); aplicação a lote, projeção e comparação com pesagens (6E); formulação de mínimo custo (Fase 8); vacas e bezerros (6F); dietas a pasto com consumo de forragem estimado (C-6B-09); microminerais, aminoácidos e água (C3).

### 9.7 Decisões do usuário sobre o plano da 6B (2026-10-26)

Planejamento geral aprovado (commit `95f9e8d`), com ajustes:

- **C-6B-01, ajustada:** distinguir **alimento oferecido**, **consumo observado** (oferecido menos sobras medidas) e **consumo assumido sem sobras**. O consumo assumido pode ser usado em simulações, sempre identificado. O CMS previsto pelo BR-CORTE aparece separado.
- **C-6B-02 a 04:** aprovadas; nutrientes sem dados suficientes ficam indeterminados.
- **C-6B-05, ajustada:** situações do balanço **"Cobertura teórica"**, **"Déficit estimado"** e **"Indeterminado"**. Avaliação parcial nunca declara adequação nutricional completa.
- **C-6B-06 e 07:** aprovadas.
- **C-6B-08, ajustada:** garantias mínimas e máximas de rótulo preservadas como garantias, nunca tratadas como teores exatos; conversão à MS só com base compatível e fundamentada.
- **C-6B-09 a 12:** aprovadas. Nutriente ausente nunca vira zero nem permite concluir cobertura completa.
- **A-6B-01 a 07:** aprovadas. A avaliação imutável preserva entradas, hipóteses, valores efetivamente usados, fontes, versões e resultados, mesmo depois de atualizações dos perfis.
- **Numeração:** desempenho previsto na 6C, custos na 6D (tabela da seção 3; previsto × observado na 6E; vacas e bezerros na 6F).
- Autorizada só a **6B.0**, sem código.

### 9.8 Entrega 6B.0: inventário complementar (2026-10-26)

Conferência visual da Eq. 4.30, da Tabela 4.5, da Tabela 10.13 e do exemplo de aplicação do capítulo 4, em INVENTARIO_BR_CORTE.md, seção 18. Resumo:

- **Eq. 4.30** (p. 87): EM = 0,9455 × ED – 0,303, em Mcal/kg de MS, a partir da ED da Eq. 4.29, que vem das frações digestíveis (Eq. 4.28d; Tabela 4.1). Sem faixa de validade tabelada. A energia ofertada pela composição exige CNF, PIDN e PIDA, que o catálogo não tem: fica fora da 6B (C-6B-02).
- **Tabela 4.5** (p. 105): equações por fração, com consumo voluntário assumido de 22 g de MS/kg de PC e silagem de milho como volumoso basal dos concentrados.
- **Tabela 10.13** (p. 263): níveis tóxicos de Ca, K, Mg, Na e S em g/kg de MS, de fontes secundárias; sem P. Na mesma página, máximo de 120 % das exigências recomendado para formulação.
- **Exemplo para validar a oferta:** Tabela 4.4 (p. 102), dieta 50:50 na MS de silagem de milho e concentrado (milho, farelo de soja, U:SA e mistura mineral), com a composição de cada alimento, do concentrado e da dieta. Reproduz em precisão integral a maior parte das células; PB do concentrado e da dieta e MS da dieta divergem do impresso (seção 18.3). O livro soma traços como zero.
- **Balanço:** nenhum exemplo do livro com dieta e exigência juntas nas páginas lidas.

**Decisões científicas pendentes da 6B.0:**

| # | Decisão | Proposta |
|---|---|---|
| C-6B-13 | **Nutriente que o alimento não contém por natureza** (traço "–" na Tabela 4.4: PB e fibras da mistura mineral, fibras da U:SA), que o livro soma como zero | Zero só quando a fonte do próprio alimento declara o valor zero ou a ausência por natureza, registrado no perfil com a fonte; sem isso, o nutriente da dieta fica indeterminado. Nunca zero por omissão |
| C-6B-14 | **Uso da Tabela 10.13** | Só como sinal informativo, nunca como situação do balanço: "acima do nível tóxico citado pelo BR-CORTE (Tabela 10.13, fonte secundária)", comparando a concentração do mineral na MS da dieta; sem sinal para P (não consta) |
| C-6B-15 | **Máximo de 120 % das exigências** (p. 263) | Não usar na avaliação: é recomendação para formulação (Fase 8) |
| C-6B-16 | **EM e ED ofertadas** | Não calcular na 6B: pela composição faltam CNF, PIDN e PIDA; pelo NDT, a conversão NDT × 4,4 só aparece no contexto das exigências. Revisitar com D-EN-01 quando houver dados |
| C-6B-17 | **Validação do balanço** sem exemplo do livro | Casos sintéticos identificados como fictícios para as regras, e um caso composto explicitamente rotulado: exigência do T-04 (p. 432–434) com a dieta da Tabela 4.4 (p. 102), sem chamá-lo de exemplo do livro |
| C-6B-18 | **Divergências da Tabela 4.4** (PB 16,70 e 12,00; MS 45,80; MO 95,20 do concentrado) | Como nas entregas anteriores: esperado do motor em precisão integral; células divergentes presas no teste; etapas com valores impressos em teste separado; nada ajustado |
| C-6B-19 | **Dados da Tabela 4.4 no teste** | Usar a composição impressa só como fixture de teste da aritmética da oferta, com página; nunca como perfil do banco (fonte e conferência próprias da Fase 5) |

### 9.9 Decisões do usuário sobre a 6B.0 (2026-10-26)

C-6B-13 a 19 aprovadas, com ajustes: zero nutricional só com comprovação explícita (traço, "ND" e ausência de informação não são zero); níveis tóxicos da Tabela 10.13 só como alerta de segurança quando a composição permitir comparação válida, sem declarar intoxicação nem segurança garantida; 120 % das exigências só na formulação; ED e EM ofertadas adiadas; casos sintéticos e compostos sempre identificados; precisão integral com divergências documentadas; Tabela 4.4 só em teste. Atenção registrada: a PB de 260 % da U:SA é PB equivalente de NNP, não proteína verdadeira; a MS total exige conversão correta entre MN e MS. Autorizada só a 6B-1.

### 9.10 Entrega 6B-1: oferta nutricional no motor (2026-10-26)

`packages/nutrition-engine/src/avaliacao/oferta.ts` (puro; conversões de unidade pelo módulo da Fase 5, `@pecuaria/domain`). `VERSAO_MOTOR` 0.7.0. Nada no banco; sem migration.

- **Entrada:** itens da dieta com o perfil gravado (valores como publicados: unidade, base, tipo de valor, forma de obtenção, base inferida e validação, origens; não quantificados; cautelas; regra de seleção; elegibilidade decidida no main) e a quantidade em **kg MN/dia** ou **kg MS/dia** (unidades novas no núcleo). O tipo da quantidade é declarado: **oferecido**, **consumo observado** (oferecido menos sobras medidas do mesmo alimento) ou **consumo assumido sem sobras** (simulação). O oferecido é sempre preservado ao lado do consumo usado.
- **MS:** conversão MN ↔ MS só com a MS do próprio perfil, em base MN, como teor (garantia de rótulo não converte), com base publicada ou validada (C7) e de perfil elegível. MS da dieta = MS total / MN total × 100.
- **Contribuição por alimento e nutriente:** conhecida, limite inferior ou superior (garantias mínima e máxima, nunca teor exato) ou **desconhecida** (perfil não elegível; nutriente ausente; publicado sem número: traço, "ND"; zero sem texto publicado de zero; fora da faixa da unidade; base não validada; energia em Mcal/kg, adiada pela C-6B-16; falta de MS para converter a base). PB acima de 100 % só com a marca de equivalente de NNP, com aviso.
- **Oferta do nutriente:** "completa" (todas conhecidas), "limite inferior" ou "limite superior" (com garantias de um só sentido), "limites mistos" (sem total), "parcial" (alguma desconhecida: **sem total**; só a soma das contribuições conhecidas, identificada como tal) ou "indeterminada". Concentração na MS só quando há total.
- **Rastreio:** perfil, alimento, regra e versão de cada item; valor, tipo de valor e origens de cada contribuição.

**Testes (26):** Tabela 4.4 (p. 102), concentrado e dieta 50:50, em precisão integral e por etapas; casos SINTÉTICOS com números fictícios para MN e MS, tipos de quantidade, sobras, ausência, "ND", zero, faixa, energia, MS ausente, base inferida, rótulo, garantias, elegibilidade e cautelas.

**Tabela 4.4, resultado:** os traços da U:SA e da mistura mineral deixam PB, EE, fibras, CNF, PIDN e PIDA **parciais**; a soma das contribuições conhecidas reproduz a coluna impressa do concentrado, porque o livro soma os traços como zero. MO é completa (o "0" da mistura mineral é zero impresso). Divergências presas no teste:

| Célula | Calculado (integral) | Impresso |
|---|---|---|
| MS do concentrado | 88,118 | 88,11 |
| MO do concentrado | 95,206 | 95,20 |
| PB do concentrado (soma conhecida) | 16,686 | 16,70 |
| MS da dieta | 45,777 | 45,80 (45,776 a partir de 88,11) |
| PB da dieta (soma conhecida) | 11,973 | 12,00 (11,98 a partir de 16,70) |
| EE da dieta (soma conhecida) | 3,42495 | 3,43 (bate a partir de 3,69) |
| LIG, PIDN e PIDA da dieta | 3,053; 1,066; 0,504 | 3,06; 1,06; 0,51 (batem a partir da coluna do concentrado impressa) |

**Pendências para decisão:**

| # | Achado | Proposta |
|---|---|---|
| D-6B1-01 | Consumo observado pelas sobras assume que elas têm a composição do alimento oferecido (o animal seleciona) | Manter, com o aviso fixo; composição própria das sobras só quando houver análise delas |
| D-6B1-02 | "0" impresso pela fonte (ex.: MO da mistura mineral, Tabela 4.4) foi aceito como zero comprovado | Confirmar que zero numérico publicado basta como comprovação; traço e "ND" não |
| D-6B1-03 | Traço "–" tratado como publicado sem número; célula em branco, como ausência | Confirmar a interpretação para a curadoria de tabelas |
| D-6B1-04 | A marca de PB equivalente de NNP (U:SA, ureia) não existe nos perfis da Fase 5 | Na 6B-3, só aceitar PB acima de 100 % quando a definição ou o registro identificar o valor como equivalente de NNP; propor como fazê-lo antes (definição própria no catálogo exigiria migration) |
| D-6B1-05 | Critério de elegibilidade é decidido no main | Na 6B-3: perfil gravado, regra de seleção aprovada (hash), registros conferidos e sem avaliação que impeça o uso |
| D-6B1-06 | Limite superior somado a contribuição exata dá limite superior; limite inferior com exata, limite inferior; os dois juntos, sem total (não usa zero como piso) | Confirmar |

### 9.11 Decisões do usuário sobre a 6B-1 (2026-10-26)

6B-1 aprovada (commit `14846bf`), com as decisões, implementadas e testadas no motor:

- **D-6B1-01:** consumo observado pelas sobras mantido; o resultado identifica consumo e composição consumida como **estimados** (`naturezaConsumo: consumo_estimado_por_sobras`; aviso sobre a possível seleção alimentar).
- **D-6B1-02:** zero numericamente publicado aceito, com a fonte e a ressalva de que pode ser valor arredondado e não prova ausência absoluta (aviso na contribuição).
- **D-6B1-03:** traço e campo vazio continuam situações diferentes; o motivo do traço traz a natureza e o significado da legenda da fonte (Fase 5A); o do campo vazio diz "campo vazio ou não informado pela fonte".
- **D-6B1-04:** PB equivalente de NNP identificada à parte: cada contribuição diz se é equivalente de NNP, e a oferta de PB traz a parcela de NNP (`parcelaEquivalenteNnpGDia`), que não é proteína verdadeira nem PM ofertada. **Plano para a 6B-3:** os perfis da Fase 5 não têm como marcar o equivalente de NNP; propor, antes da 6B-3, uma definição própria no catálogo (ex.: "PB equivalente de NNP, N × 6,25") ou um campo no valor, o que exige migration e aprovação.
- **D-6B1-05:** elegibilidade (decidida no main, 6B-3): registros conferidos, regra de seleção aprovada e avaliação científica compatível; "uso com cautela" não bloqueia (vira aviso).
- **D-6B1-06:** limites só quando fundamentados: garantia com contribuição desconhecida não vira limite (fica parcial, sem total); limites mínimo e máximo juntos não dão total; contribuição desconhecida nunca vira zero.

### 9.12 Entrega 6B-2: balanço exigência × oferta no motor (2026-10-26)

`packages/nutrition-engine/src/avaliacao/balanco.ts` (puro). `VERSAO_MOTOR` 0.8.0. Nada no banco; sem migration; sem tela.

- **Nutrientes:** NDT, PB, PDR, PNDR, PM, Ca, P, Mg, Na, K e S (C-6B-02 a 04). Comparação em quantidade diária (g/dia; NDT exigido convertido de kg/dia).
- **Situações:** "cobertura teórica" (oferta completa ≥ exigência, ou limite inferior garantido ≥ exigência), "déficit estimado" (oferta completa < exigência, ou limite superior garantido < exigência) e "indeterminado" (todo o resto). Oferta parcial nunca conclui, mesmo com a soma conhecida acima da exigência; limites mistos não concluem.
- **Exigência fora do domínio, do escopo ou não calculada:** indisponível para comparação operacional (indeterminado, com os motivos do motor).
- **CMS coerente (C-6B-01):** `fonteCmsDaOferta` dá a MS consumida (observada ou assumida) como CMS informado para calcular a exigência; se a exigência usou outro CMS, NDT, PB, PDR, PNDR e PM ficam indeterminados (minerais não dependem do CMS). Dieta só "oferecida" não tem balanço: oferecido não é consumo.
- **PDR, PNDR e PM:** sempre indeterminados (C5). **Mg, Na, K e S:** indeterminados sem composição.
- **PB:** a comparação mostra a parcela de PB equivalente de NNP e avisa que não é proteína verdadeira nem PM.
- **Ca/P:** só indicador (exigida e ofertada, com Ca e P completos), fora das comparações.
- **Nunca adequação completa:** frase fixa em todo balanço ("Cobertura teórica dos nutrientes comparados [...]: não é adequação nutricional completa. Composições médias de referência não garantem o desempenho previsto."), mais "Avaliação parcial: N de 11 nutrientes sem conclusão" quando houver indeterminado; avisos de simulação (consumo assumido) e de estimativa (sobras).

**Testes (16):** CMS coerente e incoerente; dieta só oferecida; SINTÉTICOS com oferta completa acima e abaixo, limites inferior e superior dos dois lados, parcial, limites mistos e NNP; exigência fora do domínio (zebuína confinada de 500 kg); PDR, PNDR, PM, Mg, Na, K e S indeterminados; Ca/P como indicador; frase fixa; **CASO COMPOSTO** (T-04, p. 432–434, com a dieta da Tabela 4.4, p. 102, a 10,62 kg de MS): exigência disponível (PB 1135 g/dia), mas nada conclui, porque a Tabela 4.4 não traz NDT, Ca nem P e a PB fica parcial pelo traço da mistura mineral.

**Divergências:** nenhuma nova; o livro não traz exemplo de balanço (C-6B-17).

**Pendências para decisão:**

| # | Achado | Proposta |
|---|---|---|
| D-6B2-01 | Oferta parcial com soma conhecida acima da exigência: como as contribuições desconhecidas não podem ser negativas, a soma conhecida seria um piso | Manter indeterminado (não usar a não negatividade como zero implícito); decidir se o piso pode ser mostrado como informação |
| D-6B2-02 | Igualdade conta como cobertura teórica; não há faixa de tolerância | Confirmar (C-6B-05) |
| D-6B2-03 | Comparação em g/dia, não em concentração; com o CMS coerente as duas são equivalentes | Confirmar; a concentração aparece só como informação na tela (6B-5) |
| D-6B2-04 | PB coberta em parte por equivalente de NNP | Manter a cobertura de PB com o aviso e a parcela; não há critério do livro nas páginas lidas para descontar o NNP |
| D-6B2-05 | Alertas da Tabela 10.13 (C-6B-14) | Implementar só quando houver Mg, Na, K ou S na composição; Ca (44 g/kg MS) já é comparável; propor junto da 6B-3 |

### 9.13 Decisões do usuário sobre a 6B-2 (2026-10-26)

6B-2 aprovada (commit `0b78b15`), com as decisões, implementadas e testadas no motor (`VERSAO_MOTOR` 0.8.1):

- **D-6B2-01:** oferta parcial continua indeterminada; o **piso das contribuições conhecidas** aparece à parte (`pisoConhecidoGDia`), sem ser chamado de total.
- **D-6B2-02:** igualdade com a exigência é cobertura teórica; nenhuma tolerância.
- **D-6B2-03:** comparação principal em g/dia; a concentração na MS (exigência e oferta, % da MS consumida) vem só como informação.
- **D-6B2-04:** com PB equivalente de NNP identificada, a cobertura de PB é **numérica, de PB equivalente**, sem afirmar atendimento proteico operacional; o resultado traz a parcela de NNP e a cobertura sem ela. PM, PDR e PNDR ofertadas continuam indeterminadas.
- **D-6B2-05:** alertas da Tabela 10.13 (p. 263; Ca 44, K 20, Mg 4, Na 65 e S 4 g/kg de MS, com a fonte citada; transcrição em `dados/toxicidade.ts`) só com oferta do mineral **completa** e concentração calculada (base válida); concentração igual ou acima do nível gera alerta informativo; não muda o balanço, não diagnostica intoxicação, e a nota diz que a ausência de alerta não garante segurança. Garantias, oferta parcial e minerais sem composição ficam "não avaliados".

### 9.14 Entrega 6B-3: serviço de avaliação de dietas (2026-10-26)

Canal `nutricao:avaliarDieta` (Zod no renderer e no main) → `ServicoAvaliacaoDieta` no main → perfis gravados da Fase 5D → motor (oferta, exigências e balanço). Nada é gravado nem importado (avaliação imutável na 6B-4); sem migration; sem tela. `VERSAO_MOTOR` 0.8.1 (o motor ganhou só a regra de valor ambíguo, abaixo).

- **Entrada:** animal (grupo, classe sexual, sistema, PC médio, GMD desejado); CMS previsto escolhido (só equação, nunca informado); dieta com o tipo de quantidade (oferecido, consumo observado com sobras por alimento, consumo assumido sem sobras) e, por alimento, o perfil, a quantidade e a base (MN ou MS). Zod recusa sobras fora do consumo observado, sobras acima do oferecido e falta de sobras no consumo observado.
- **Elegibilidade (D-6B1-05):** regra de seleção aprovada com o hash conferido e na **versão vigente**; todos os registros de origem do perfil **conferidos**, não **substituídos** e não **descartados**. Perfil inelegível não contribui (nem com a MS) e diz por quê. Versão nova de registro ainda em conferência e "uso com cautela" não bloqueiam: viram avisos. Limitações do perfil também viram avisos.
- **Valores:** como gravados no perfil (unidade, base, tipo de valor, forma de obtenção, origens); base interpretada só vale com "base validada" ativa em todos os valores de origem (C7); não quantificados com a natureza da fonte; nada completado com zero.
- **Rastreio:** por perfil: nome, alimento, tipo, cenário, nível, regra (código, versão, data da aprovação, vigente), data de gravação e as fontes (registro, título, código, referência local, situação).
- **CMS:** exigência calculada com a MS consumida como CMS (observada ou assumida); dieta só oferecida usa o CMS previsto, identificado, e o balanço fica indeterminado. O CMS previsto aparece sempre à parte (C-6B-01).
- **Motor:** perfil com **mais de um valor do mesmo nutriente** (bases ou tipos de valor diferentes, o que o índice do perfil permite) fica com a contribuição desconhecida, sem escolha implícita.
- **NNP:** não há metadado explícito no banco; nenhum valor é marcado como equivalente de NNP e nada é inferido pelo nome; PB acima de 100 % fica desconhecida.

**Testes (16 do serviço, com banco de teste e dados FICTÍCIOS):** perfil elegível (oferta completa, exigência com a MS consumida, CMS previsto à parte, rastreio); nada gravado nem importado (contagem das tabelas); registro substituído por versão nova conferida (perfil antigo inelegível; perfil novo da versão nova, elegível); versão nova em conferência (aviso); fonte sem NDT, Ca e P (indeterminados); dois alimentos, um sem PB (parcial, com o piso); "uso com cautela" (aviso); base interpretada sem e com validação; rótulo com garantia mínima em MN (limite inferior) e MS garantida (não converte); regra em versão histórica e sem aprovação válida; limitações do perfil; NNP sem metadado; canal com Zod; perfil inexistente. Mais 1 teste do motor (valor ambíguo).

**Proposta de migration para o NNP (não implementada; para aprovação):** a PB equivalente de NNP (ex.: 260 % na U:SA da Tabela 4.4) não cabe na faixa de fração mássica (0 a 100 %) que o domínio confere ao gravar, e não há como marcá-la. Proposta, migration **0018** (a avaliação imutável passaria a 0019):

```sql
-- Natureza da grandeza da definição: fração mássica (padrão) ou equivalente proteico.
ALTER TABLE nutriente ADD COLUMN natureza_valor TEXT NOT NULL DEFAULT 'fracao_massica'
  CHECK(natureza_valor IN ('fracao_massica','equivalente_proteico_nnp'));
-- Definição do sistema, com identificador fixo, como a FDNcp da migration 0014.
INSERT INTO nutriente (id, codigo, nome, grupo, unidade_referencia, base_referencia, ...,
  natureza_valor) VALUES ('01929c20-0000-7000-8000-000000000013', 'PBeqNNP',
  'Proteína bruta equivalente de nitrogênio não proteico (N × 6,25)', 'proteina', 'pct', 'ms', ...,
  'equivalente_proteico_nnp');
```

Impacto: nenhuma linha existente muda; o domínio aceitaria valor acima de 100 % só nessa definição; o motor somaria "PBeqNNP" à PB ofertada como parcela de NNP, identificada pelo identificador fixo da definição, nunca pelo nome; produtos com ureia precisariam de curadoria com o valor nessa definição; backup antes, teste da migration do zero e a partir da 0017. Alternativa sem migration nova de coluna: registrar o N do NNP (fração mássica, até 100 %) e calcular N × 6,25 no motor; mas isso converte um valor publicado como "equivalente proteico" (regra 3c).

**Limitações:** a legenda (significado) dos não quantificados não vem no perfil gravado, só a natureza; a avaliação não é gravada (6B-4); sem tela (6B-5); integração com animais e lotes continua manual.

**Pendências para decisão:**

| # | Achado | Proposta |
|---|---|---|
| D-6B3-01 | Versão nova de registro **em conferência** | Não bloqueia; aviso (o registro antigo continua conferido até a nova ser conferida) |
| D-6B3-02 | Perfil gravado com a **v1** histórica da regra | Inelegível; gravar perfil novo com a v2 |
| D-6B3-03 | Perfil com dois valores do mesmo nutriente (ex.: MS em MN e PB em MS e em MN) | Desconhecido, sem escolha; definir uma ordem de preferência só com aprovação |
| D-6B3-04 | Dieta só oferecida | Exigência com o CMS previsto, identificado; balanço indeterminado |
| D-6B3-05 | Metadado de NNP | Aprovar a migration proposta acima, ou a alternativa por N, antes da 6B-4 |

### 9.15 Migration 0018: PB equivalente de NNP (2026-10-26)

Aprovada com a 6B-3 (D-6B3-05: migration proposta na seção 9.14). Sem tela; sem dado no banco operacional além da definição do sistema. `VERSAO_MOTOR` 0.8.2.

- **`nutriente.natureza_valor`** (metadado explícito, nunca deduzido do nome ou do código): `fracao_massica` (padrão; 0 a 100 %), `equivalente_proteico` (PB total, N × 6,25; pode passar de 100 %) e `equivalente_proteico_nnp` (parcela da PB total que vem de NNP; **contida** na PB total, nunca somada a ela). A PB do sistema passa a `equivalente_proteico`; nova definição do sistema **PBeqNNP** (`01929c20-0000-7000-8000-000000000013`, proteína, % da MS). Gatilhos: definição do usuário só é fração mássica; a natureza de uma definição não muda.
- **Diferença em relação à proposta da 9.14:** a proposta não previa que a tabela `valor_nutricional` (migration 0012) tem `CHECK(valor BETWEEN 0 AND 100)` para `pct`, que impediria gravar 260 % mesmo com a definição certa. Um CHECK não se altera no lugar no SQLite; a 0018 **reconstrói `valor_nutricional`** dentro da transação da migration: cópia de todas as linhas com o mesmo `rowid`, chaves estrangeiras adiadas (`PRAGMA defer_foreign_keys`) até o fim da transação, os 2 índices e os 9 gatilhos recriados com o texto da versão 17, e o teto da fração mássica (100 %, 1.000 g/kg, 1.000.000 mg/kg ou ppm) passado para os gatilhos `tg_valor_faixa_*`, que consultam a natureza da definição. O piso (≥ 0) continua no CHECK. Nenhum valor muda.
- **Domínio:** `dentroDaFaixaDaNatureza`; o equivalente proteico só exige valor ≥ 0. O pacote de curadoria continua com a faixa da fração mássica (nenhum pacote tem NNP).
- **Motor (oferta):** a PB é a PB total; a parcela de NNP vem do valor de natureza `equivalente_proteico_nnp` do mesmo perfil e fica em `parcelaNnpGDia` da contribuição e em `parcelaEquivalenteNnpGDia` da oferta, **nunca somada à PB**. PB acima de 100 % só com a parcela declarada; parcela maior que a PB total é inconsistência (contribuição desconhecida); parcela sem PB total deixa a PB desconhecida; parcela em garantia de rótulo, ambígua (duas) ou sem conversão não entra, e `parcelaNnpIncompleta` avisa que a parcela total é desconhecida. **Balanço:** com parcela incompleta, a cobertura sem NNP fica `null`, com motivo.
- **Serviço:** `ServicoAvaliacaoDieta` passa ao motor a natureza da definição de cada valor do perfil.
- **Testes:** Tabela 4.4 com a linha **PBu** (conferida na imagem da p. 102: U:SA 260; Concentrado 3,90; Dieta 1,95; demais "-"): parcela de 39 g por kg de MS do concentrado; soma conhecida 1,95 % na dieta (igual ao impresso); com a coluna "Concentrado", 19,5 g de NNP contidos nos 83,5 g de PB. Sintéticos (FICTÍCIOS): parcela contida, PB > 100 sem parcela, parcela > PB, parcela sem PB, código "PBeqNNP" em fração mássica não é parcela, garantia e ambiguidade. Banco: do zero e reaplicação; arquivo só insere a definição (e copia os valores); versão 17 com dados (valores excluídos, avaliação e origem de perfil ligadas): só `nutriente` muda, valores com o mesmo `rowid`, índices e gatilhos com o mesmo texto, `integrity_check` e `foreign_key_check` limpos, vínculos ativos; falha no meio não deixa nada; backup pré-migração da versão 17 criado e restaurado (reaplica a 0018, sem perda); teto pela natureza; natureza reservada e imutável. Serviço: PB 260 com PBeqNNP 250 gravados pelo canal (260 g de PB, 250 g de NNP contidos); PB 260 sem parcela, desconhecida.
- **Limitações:** nenhum alimento com NNP curado (produtos com ureia exigem curadoria com a PBeqNNP); a PB equivalente segue sem PM, PDR ou PNDR (C5); a 0018 reconstrói uma tabela com dados (o backup pré-migração é automático).

### 9.16 Entrega 6B-4: avaliação nutricional imutável, migration 0019 (2026-10-26)

Gravação só por ação do usuário (canal `nutricao:registrarAvaliacao`, Zod nos dois lados); leitura por `nutricao:obterAvaliacao` e `nutricao:listarAvaliacoes`. Sem tela (6B-5). `VERSAO_MOTOR` continua 0.8.2 (o motor não mudou).

- **O que é gravado (retrato, `formato_versao` 1):** entrada (animal, GMD desejado, CMS previsto escolhido, tipo de quantidade, itens com perfil, quantidade, base e sobras); **hipóteses** explícitas (tipo de quantidade; CMS das exigências: MS consumida como CMS informado ou CMS previsto, com a equação; GMD desejado, não observado; composição como publicada, ausente não vira zero; CMS previsto à parte); **perfis** como avaliados (nome, alimento, tipo, cenário, nível, regra com versão, data da aprovação e vigência, elegibilidade e motivos, avisos, fontes com a situação do registro) **com os valores efetivamente entregues ao motor** (valor e texto publicado, unidade, base, tipo, forma de obtenção, natureza, base interpretada e validada, origens) e os não quantificados; **versões** (motor, obra, edição, ano e DOI; aprovação de cada equação dentro de cada resultado); **resultados** separados (CMS previsto, exigências, oferta, balanço), em precisão integral.
- **Nada é recalculado ao ler.** Mudanças posteriores em registros, perfis, regra ou motor não alteram a avaliação gravada. O main recalcula ao gravar, na mesma transação, a partir da entrada; resultado vindo do renderer não é aceito (o esquema é estrito).
- **Sem perda no JSON:** número não finito e valor indefinido em lista são recusados antes de gravar (`jsonFiel`); o banco confere `json_valid` e o tipo de cada coluna.
- **Integridade:** SHA-256 do conteúdo gravado (formato, versão do motor, tipo de quantidade e as colunas JSON, como texto); a leitura devolve `integridade` "conferida" ou "divergente".
- **Banco (migration 0019):** `avaliacao_nutricional` e `avaliacao_nutricional_perfil` (perfil usado, ordem e elegibilidade, com chave estrangeira para o perfil imutável; gatilho confere que o perfil está no retrato na mesma posição). Sem alteração e sem exclusão (gatilhos). Nenhuma tabela existente muda. Trilha: entidade `avaliacao_nutricional`, ação `criacao`, com o resumo (rótulo, versão, tipo, perfis e hash), sem duplicar o retrato.
- **Testes:** banco: do zero e reaplicação; arquivo sem INSERT, ALTER ou DROP; versão 18 com dados sem mudar nenhuma tabela; backup pré-migração da 18 criado e restaurado (reaplica a 0019); avaliação gravada volta intacta de backup manual; imutabilidade e exclusão nas duas tabelas; CHECKs de JSON, hash, tipo, rótulo e formato; coerência perfil × retrato; `integrity_check` e `foreign_key_check`. Serviço (dados FICTÍCIOS): retrato igual ao calculado, valores usados com natureza e origem, hipóteses, versões, trilha; dieta só oferecida (CMS previsto); perfil inelegível gravado com o motivo; registro substituído com PB diferente, perfil novo e reinício do app sem mudar a avaliação; alteração por fora detectada (divergente); listagem; Zod (nome vazio, resultado vindo do renderer, CMS previsto informado); perfil e avaliação inexistentes; JSON sem perda.
- **Limitações:** sem tela; sem anulação (avaliação errada fica gravada); grava também avaliação com perfis inelegíveis ou oferta indeterminada, como foi avaliada; o retrato é recalculado ao gravar e não comparado com o que a tela mostrou; consulta por nutriente só lendo o JSON; tamanho do retrato não medido em escala; o hash detecta, mas não impede, alteração do arquivo por fora (o backup é a proteção).

### 9.17 Decisões do usuário sobre a 0018 e a 6B-4 (2026-10-26) e implementação

Aprovadas a migration 0018 (`ecacd58`) e a 6B-4 (`1b1beb7`).

| # | Decisão | Implementação |
|---|---|---|
| D-0018-01 | Reconstrução de `valor_nutricional` aprovada, verificada em cópia com dados legados | Teste `migracao-legado.test.ts`: banco montado na versão 17 pelos canais (os 5 pacotes de curadoria, conferência, versão nova com valor excluído, avaliação científica, regra aprovada e perfis) e aberto com todas as migrations; todas as tabelas iguais linha a linha (com `rowid`), exceto `nutriente` (só a coluna nova e a PBeqNNP); integridade e chaves estrangeiras limpas; backup pré-migração restaurado. Rodado também a partir da cópia do backup do banco instalado (schema v1, 2026-10-21): 274 valores (1 excluído), 37 registros, 43 origens de perfil, 1 avaliação científica, sem diferença. O arquivo original não foi aberto (só a cópia do backup). |
| D-0018-02 e 03 | Restrições do NNP mantidas | Garantia de rótulo fora do cálculo; pacotes de curadoria só com fração mássica |
| D-6B4-01 | Parcial gravável; perfil inelegível nunca operacional | `situacao` calculada com a avaliação e gravada no retrato (formato 2): `parcial` (perfil fora do cálculo ou comparação indeterminada, exceto PDR, PNDR e PM, sempre indeterminadas por C5), `usoOperacional` (falso com qualquer perfil inelegível) e `bloqueios` com os motivos |
| D-6B4-02 | Recalcular e comparar o retrato completo com o exibido | A simulação devolve o SHA-256 do retrato que seria gravado; a gravação exige esse hash, recalcula na mesma transação e recusa com `DADOS_DESATUALIZADOS` ("Avalie de novo") se o retrato mudou. Comparar o SHA-256 do retrato completo equivale a comparar o retrato inteiro |
| D-6B4-03 | Anulação com motivo, data e histórico, registro separado | Migration **0020** `anulacao_avaliacao_nutricional` (uma por avaliação; sem alteração nem exclusão); canal `nutricao:anularAvaliacao`; trilha com a ação nova `anulacao` e o motivo; o retrato não muda |
| D-6B4-04 | Divergente: consulta para investigação, sem uso operacional | Leitura devolve o conteúdo e `usoOperacional` falso, com o bloqueio explicado; pode ser anulada |

Uso operacional final na leitura: nenhum bloqueio (perfil inelegível, integridade divergente, anulação). Retratos de formato 1 (6B-4, sem a situação) são lidos com a situação recalculada do próprio retrato, identificada (`situacaoCalculadaNaLeitura`).

**Testes:** banco: 0020 do zero, reaplicação, versão 19 com dados sem mudar tabelas, backup pré-migração restaurado, unicidade, motivo, chave estrangeira, imutabilidade. Serviço: parcial com uso operacional; inelegível sem uso operacional, com bloqueios; dados mudados entre simulação e gravação (recusa, nada gravado, nova avaliação grava); hash de outro retrato recusado e hash estável sem mudança; anulação (registro separado, retrato e hash intactos, linha da avaliação idêntica, histórico, recusa de segunda anulação e de motivo vazio, persistência após reinício); backup e restauração antes e depois da anulação; divergente consultável, listado e anulável; formato 1.

### 9.18 Entrega 6B-5: tela de avaliação de dietas (2026-10-27)

Nutrição de corte ganhou abas: **Exigências do animal** (6A-7), **Avaliar dieta** e **Avaliações gravadas**. A tela só coleta a entrada e mostra o que o main calculou; nenhum número científico nasce no renderer. Sem migration; `VERSAO_MOTOR` continua 0.8.2.

- **Avaliar dieta:** animal (grupo, classe sexual, sistema, PC médio, GMD desejado), CMS previsto escolhido (só equação, mostrado à parte) e a dieta: o que a quantidade representa (**oferta**, **consumo observado** com sobras medidas por alimento, **consumo assumido** sem sobras, cada um explicado), e por alimento o perfil, a quantidade e a base (MN ou MS). O seletor mostra **só perfis elegíveis** (canal novo `nutricao:perfisParaDieta`, com a elegibilidade de agora); os inelegíveis ficam num quadro com os motivos. Zod no renderer e no main.
- **Simular sem gravar:** "Avaliar (simular, sem gravar)". **Gravar explicitamente:** "Gravar avaliação" (nome, observação, quem grava), habilitado só com a simulação atual; a tela envia o SHA-256 do retrato exibido e, se o main recusar (`DADOS_DESATUALIZADOS`), avisa "Avalie de novo antes de gravar" e bloqueia a gravação até nova simulação (D-6B4-02). Formulário alterado depois da simulação também bloqueia.
- **Resultado (igual na simulação e na consulta):** situação (parcial ou sem lacunas; pode ser usada ou sem uso operacional, com os bloqueios e o que falta); hipóteses; **balanço** por nutriente (situação "Cobertura teórica", "Déficit estimado" ou "Indeterminado", exigência, oferta ou piso conhecido, cobertura; em "Por quê?": fundamento, motivos, diferença, PB equivalente de NNP, concentração só como informação e a contribuição de cada alimento); relação Ca/P só como indicador; alertas de segurança da Tabela 10.13 com a nota; quantidades e matéria seca por alimento; perfis usados (elegibilidade, regra e versão, fontes, avisos, valores usados e não quantificados); CMS previsto à parte; exigências completas (as mesmas seções da 6A-7) sob demanda; fonte, versão do motor e SHA-256. Limitações científicas (avisos do balanço, "não é adequação nutricional completa") sempre visíveis.
- **Avaliações gravadas:** lista com selos **Anulada**, **Integridade divergente**, **Parcial** e uso operacional; consulta do retrato como gravado (sem recálculo), com data, autor, observação, versões, formato e SHA-256 (conferido ou divergente). **Anular** com motivo e nome (D-6B4-03); depois disso a tela mostra o aviso de anulação e o retrato intacto. Divergente: aviso "só para investigação" (D-6B4-04). Na consulta, a situação mostra o uso operacional final (perfil inelegível, anulação ou divergência).
- **Testes:** tela (7, com banco de teste real atrás do IPC e dados FICTÍCIOS): só elegíveis no seletor e inelegível explicado; simulação sem gravar (situação, hipóteses, balanço, matéria seca, hash; nada gravado); oferta, consumo observado e assumido distintos, sobras só no observado; gravação e abertura do retrato, presença no histórico; dados mudados entre simular e gravar (recusa, nada gravado, nova avaliação grava); anulação pela tela após reinício do app (retrato e hash intactos); divergente identificado na lista e na consulta. Serviço: canal dos perfis com elegibilidade. E2E (app construído, `fase6b.spec.ts`): simular, gravar, anular, reiniciar o app, backup e restauração (a avaliação volta sem a anulação, com o mesmo hash), sem rolagem horizontal a 900 px, sem erro no console; capturas em claro e escuro a 1280 e 900 px inspecionadas.
- **Ajustes da inspeção visual:** coluna de situação do balanço logo após o nutriente (a 900 px a diferença foi para o detalhe); data e hora formatadas; Ca/P com 2 casas (integral no título); situação da avaliação gravada com o uso operacional final.
- **Limitações:** entrada do animal manual (sem integração com animais e lotes); sem formulação, desempenho previsto ou custos (6C em diante); a lista de avaliações confere o SHA-256 de todas a cada abertura (sem paginação); seletor sem busca por alimento; anulação não pode ser desfeita (só restaurando backup).

### 9.19 Aprovação definitiva da 6B (2026-10-27)

**Fase 6B aprovada definitivamente pelo usuário em 2026-10-27, incluindo a 6B-5**, com a marca `fase-6b` no commit de encerramento. Decisões do encerramento:

| # | Decisão |
|---|---|
| D-6B-F01 | Paginação da lista de avaliações e otimização da conferência de SHA-256: melhorias futuras, precedidas de testes de desempenho |
| D-6B-F02 | Busca e filtro de alimentos no seletor de perfis: melhoria futura de interface |
| D-6B-F03 | Integração automática com animais e lotes: adiada, sem inferir castração nem grupo genético |
| D-6B-F04 | Imutabilidade das avaliações e histórico de anulações preservados (nenhuma alteração nem exclusão; anulação só em registro separado) |
| D-6B-F05 | `.claude/` e `skills-lock.json` não são adicionados nem modificados sem autorização |

Commits da 6B: `14846bf` e `412f939` (6B-1), `0b78b15` e `b5f7c24` (6B-2), `cde0609` (6B-3), `ecacd58` (migration 0018), `1b1beb7` (6B-4, migration 0019), `18b40b8` (D-0018-01), `65f65ee` (D-6B4-01 a 04, migration 0020), `a1889dd` (6B-5) e o commit desta documentação. Próxima migration: 0021.

## 10. Fase 6C: desempenho previsto (só planejamento, 2026-10-27)

Autorizado só o planejamento. Nada implementado; banco operacional intocado.

### 10.1 O que o BR-CORTE 2023 oferece (páginas lidas na imagem nesta sessão)

| Item | Conteúdo | Uso possível |
|---|---|---|
| **Eq. 8.22** (p. 192) | GPCVZ = 14,914 × ELg^0,9662 × PCVZeq^−0,7246, com a ELg "disponível para ganho", descrita **só em texto** como "a diferença entre o total de energia ingerida pelo animal e a sua exigência de energia líquida para mantença" | Única equação publicada de ganho a partir da energia |
| Exemplo do texto (p. 192) | Nelore não castrado, PC 350 kg, PCVZeq 300 kg, CMS ≈ 8 kg/dia, ELm 5,40 Mcal/dia, ELg disponível 5,12 Mcal/dia → GPCVZ ≈ 1,16 kg/dia (cálculo: 1,158; T-05 do inventário) | Teste de referência da Eq. 8.22; o exemplo **não mostra** como a energia da dieta vira ELg disponível |
| Eq. 8.20 e 8.21 (p. 191) | ELg = 0,061 × PCVZeq^0,75 × GPCVZ^1,035 (confinamento; equação conjunta de todas as classes) e ELg = 0,052 × PCVZeq^0,75 × GPCVZ^1,062 (pasto) | Já no motor (E-02/03) |
| Relação 8.20 ↔ 8.22 | Verificado: a Eq. 8.22 é a **inversa algébrica da Eq. 8.20** (1/1,035 = 0,9662; 0,75/1,035 = 0,7246; (1/0,061)^(1/1,035) = 14,913, impresso 14,914). Para o pasto (Eq. 8.21) **não há** inversa publicada | A 8.22 vale para confinamento |
| Eq. 8.24 / 1.12 (p. 192 e 10) | GPCVZ = 0,9630 × GMD^1,0151 | Já no motor; GMD ↔ GPCVZ |
| Eq. 8.25 e 8.26, Tabelas 8.6 a 8.8 (p. 193 em diante) | GPCVZ e ELg a partir do **ganho de carcaça** (Benedeti et al., 2021) | **Não preveem ganho a partir da dieta**; servem a exigência por GC. Respondem à decisão C6: não usar para desempenho |
| Conversões de energia | NDT = ED / 4,4 (E-14); EM = 0,9455 × ED − 0,3032 em Mcal/kg de MS (Figura 7.5, p. 174, sentido publicado); km e kg (Eq. 8.12, 8.16, 8.28, 8.31) dependem do GPCVZ | A energia ofertada pode ser levada a EM pelo sentido publicado |
| Proteína | PMt = PMm + PMg; PMg = PLg / k (cap. 9). Não há método publicado de ganho a partir da PM, e a **PM ofertada é indeterminada** (sem degradação ruminal, C5) | **Ganho permitido pela proteína: impossível nesta base** |

Sem capítulo de predição de desempenho: o cap. 14 trata de consumo de água; os caps. 15 a 17, de outros temas e exemplos de exigência.

### 10.2 Conclusão sobre NDT e PB sem PM ofertada

- Com **NDT ofertado completo** e **MS consumida** (observada ou assumida), é possível estimar o **ganho permitido pela energia**: o GMD (e o GPCVZ) em que a EM exigida pelas equações aprovadas iguala a EM ofertada. Sem fórmula nova: só as equações de exigência já conferidas, resolvidas para o ganho por método numérico (MODELOS_NUTRICIONAIS.md, seção 7.4), com a Eq. 8.22 como conferência independente em confinamento.
- **Não é GMD previsto.** Sem PM ofertada, o atendimento proteico não pode ser verificado; o ganho real pode ser menor, limitado pela proteína (ou por minerais, consumo, sanidade e ambiente). A PB ofertada não substitui a PM e não é usada para limitar o ganho.
- O CMS previsto não entra (depende do próprio GMD); a dieta só oferecida não tem consumo e não gera estimativa.

### 10.3 Entregas propostas (cada uma com testes e aprovação)

| Entrega | Conteúdo | Testes de referência |
|---|---|---|
| **6C.0** Inventário complementar, sem código | Conferir na imagem os domínios de GMD, GPCVZ e PC das equações de energia por categoria (Tabelas 8.1 a 8.4, já transcritas, p. 179–182) para o ganho resolvido; confirmar a Tabela 17.3a e outros pontos das tabelas do cap. 17 (confinamento e pasto) como casos de inversão; registrar a relação 8.20 ↔ 8.22 | — |
| **6C-1** Motor: ganho permitido pela energia | Função pura: entrada (categoria, PC, MS consumida, NDT ofertado, tipo de consumo) → EM ofertada (NDT → ED → EM pelo sentido publicado) → GMD tal que EMtotal exigida(GMD) = EM ofertada, por bisseção na faixa do domínio; saída com GMD e GPCVZ, situação (válido, fora do domínio, fora do escopo, indeterminado), motivos e avisos fixos | T-05 (Eq. 8.22, p. 192: 1,16); inversão do T-04 (p. 432–434: PC 520, CMS 10,62, NDT 7,31 kg → GMD 1,4, com tolerância derivada do arredondamento impresso; com o NDT integral, 1,4 exato); inversão da Tabela 17.3a (PC 510, CMS 10,3, NDT 6,9 kg → GMD ≈ 1,3, com tolerância do impresso); Eq. 8.22 × inversão numérica (diferença do 14,914 quantificada); monotonicidade da EM exigida no GMD dentro do domínio (gerador determinístico); energia abaixo da mantença; fora do domínio; NDT parcial ou ausente |
| **6C-2** Motor: conferências no ganho permitido | No GMD encontrado, as exigências de PB e de minerais calculadas e comparadas com a oferta como cobertura teórica, identificadas como "não limitam o cálculo"; PM, PDR e PNDR indeterminadas (C5); PB com NNP à parte | Casos sintéticos FICTÍCIOS (cobertura, déficit, NNP); nunca "atendimento proteico" |
| **6C-3** Serviço e gravação | Bloco "ganho permitido pela energia" na avaliação de dieta, separado de exigência, oferta e balanço (regra 3e); retrato de formato 3 sem migration; formatos anteriores lidos sem recálculo | Retrato com o bloco; avaliação antiga intacta; hash; dados mudados entre simular e gravar |
| **6C-4** Tela | Bloco próprio na avaliação, com o nome "ganho permitido pela energia", hipóteses, domínio e o aviso de proteína; nunca junto do GMD observado (6E) | Testes de tela; E2E; claro e escuro a 900 px |

### 10.4 Decisões científicas pendentes

| # | Decisão | Proposta |
|---|---|---|
| D-6C-01 | Método | Inversão numérica das equações de exigência aprovadas (EM exigida = EM ofertada) como cálculo; a Eq. 8.22 só como conferência em confinamento. Alternativa: Eq. 8.22 com km e kg por ponto fixo e inversão da Eq. 1.12 |
| D-6C-02 | Energia ofertada | NDT ofertado → ED = 4,4 × NDT → EM = 0,9455 × ED − 0,3032 (Mcal/kg MS) × MS consumida. ED e EM dos perfis continuam adiadas (C-6B-16) |
| D-6C-03 | Nome e alcance | "Ganho permitido pela energia", nunca "GMD previsto" nem "desempenho previsto"; aviso fixo de proteína não verificada (PM ofertada indeterminada) |
| D-6C-04 | Quando calcular | Só consumo observado ou assumido e NDT ofertado completo. Garantia mínima de NDT: "ao menos" o ganho calculado, só se a monotonicidade for comprovada em teste. Parcial, indeterminado ou só oferecido: não calcula |
| D-6C-05 | Domínio e limites | Solução fora do domínio da categoria: "fora do domínio, só para análise". Energia que não cobre a mantença (GMD ≤ 0): fora do escopo (P-01), dizendo isso, sem estimar perda de peso |
| D-6C-06 | Pasto | A Eq. 8.22 só existe para confinamento. Propor bloquear a pasto na 6C, ou aceitar a inversão numérica da Eq. 8.21 dentro das restrições a pasto (D-CMS: zebuínos machos) |
| D-6C-07 | Proteína e minerais no ganho encontrado | Mostrar a cobertura teórica de PB e minerais exigidos nesse ganho, identificada como conferência que não limita o cálculo e "não é PM"; ou não mostrar |
| D-6C-08 | Gravação | Incluir o bloco no retrato (formato 3, sem migration); avaliações já gravadas não recalculadas |
| D-6C-09 | Tolerâncias de referência | Tolerância de cada caso derivada do arredondamento impresso (ex.: NDT 7,31 ± 0,005 kg), nunca percentual arbitrário |
