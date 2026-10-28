# MODELOS_NUTRICIONAIS.md — Estratégia Científica dos Cálculos

## 1. Objetivo e Regra Fundamental

O motor de nutrição deve permitir **formular, simular e avaliar dietas de bovinos de corte sem exigir análise bromatológica**. A composição dos alimentos vem de publicações científicas de referência, principalmente CQBAL 4.0 e Embrapa. Análises laboratoriais são opcionais e podem ser cadastradas no futuro.

**Nenhuma equação, coeficiente, tabela de exigência ou valor de composição entra no sistema sem fonte primária verificável.**

Este documento **não contém equações nem valores numéricos de propósito**. Ele define o processo para selecionar, transcrever, agregar e validar dados e equações. Nenhuma publicação foi consultada durante este planejamento. As equações e os valores serão transcritos das fontes somente quando os arquivos estiverem disponíveis, com página e conferência.

Consequências práticas:

- Nutriente sem dado na fonte fica ausente. O sistema avisa e não estima.
- Ausência de um nutriente bloqueia **apenas** os cálculos que dependem dele (ver seção 7).
- Animal ou dieta fora da faixa de validade de uma equação gera aviso de extrapolação.
- Todo resultado tem um painel "Como foi calculado?" com equação, fonte, unidades, entradas e origem de cada valor.
- Usar composições médias não garante o ganho de peso previsto. Essa mensagem aparece em toda tela de resultado.

---

## 2. Fontes de Referência

| ID interno | Obra | Situação | Uso |
|---|---|---|---|
| `BRCORTE` | Valadares Filho, S.C. et al. *Exigências Nutricionais de Zebuínos Puros e Cruzados — BR-CORTE*. UFV. | O usuário tem o livro e vai fornecer o PDF. **Arquivo ainda não disponível.** Edição a confirmar pelo próprio exemplar. | Exigências, consumo, desempenho previsto |
| `CQBAL_4_0` | Valadares Filho, S.C. et al. *CQBAL 4.0 — Tabelas Brasileiras de Composição de Alimentos para Ruminantes*. UFV. | Versão escolhida pelo usuário. Formato de acesso, estrutura dos dados e termos de uso ainda a verificar. | Fonte principal de composição |
| `EMBRAPA_*` | Publicações técnicas e científicas da Embrapa: BRS Capiaçu, silagem de milho, forrageiras tropicais. | A levantar. Cada publicação vira um registro de fonte próprio. | Composição por cultivar, idade de corte e forma de conservação |
| `ARTIGO_*` | Artigos, teses e dissertações revisados. | Somente quando necessários para nível 1 ou 2 da seleção (seção 4). | Complemento |
| `NASEM_BEEF_2016` | NASEM. *Nutrient Requirements of Beef Cattle*, 8ª ed. revisada, 2016. | Opcional. | Apenas checagem cruzada. Não substitui nem se mistura ao BR-CORTE. |
| `NASEM_DAIRY_2021` | NASEM. *Nutrient Requirements of Dairy Cattle*, 8ª ed. revisada, 2021. | Fora do escopo atual. | Candidato a futuro módulo de nutrição leiteira |

---

## 3. Origens de Dado de Composição

Cada valor de composição pertence a uma de cinco origens, sempre exibida ao usuário:

| Origem | Exemplo | Observação |
|---|---|---|
| `tabela_compilada` | CQBAL 4.0 | Já é uma agregação de muitos estudos. Não se mistura a estudos individuais (seção 5.2). |
| `estudo_individual` | Artigo ou boletim da Embrapa com composição de capiaçu aos X dias | Valor de um experimento, com suas condições. |
| `laboratorial` | Laudo de análise da propriedade | Opcional. Quando existe, é o padrão sugerido para aquele alimento. |
| `rotulo_comercial` | Níveis de garantia de suplemento mineral | São mínimos e máximos garantidos, não composição típica. Ver seção 6. |
| `medicao_propria` | Matéria seca medida na fazenda | Opcional e restrita à MS. Método a definir com base em publicação técnica a localizar. |

---

## 4. Seleção Automática dos Dados

### 4.1 Entradas do usuário

- Espécie e cultivar.
- Forma de conservação ou processamento: fresco, ensilado, feno, pré-secado, grão moído, farelo, pastejo, entre outros.
- Idade de corte, quando for forragem.
- Outras características nutricionalmente relevantes, quando a fonte as registrar: parte da planta, uso de aditivo na ensilagem, processamento do grão, estação do ano.

### 4.2 Hierarquia de busca

O seletor procura registros e classifica o resultado em um de três níveis. O nível aparece ao lado de cada alimento da dieta.

| Nível | Critério | Exemplo |
|---|---|---|
| **1. Específico** | Mesma espécie, cultivar e forma de conservação. Idade de corte e demais condições iguais às informadas. | Capiaçu ensilado, cortado na idade informada, em estudo que relata essa idade |
| **2. Comparável** | Mesma espécie e forma de conservação. Diferenças permitidas apenas nas condições listadas como toleráveis pela regra de compatibilidade aprovada. O sistema lista cada diferença. | Mesma cultivar ensilada, idade de corte diferente mas dentro de classe documentada |
| **3. Geral** | Entrada mais genérica de uma tabela de referência para a espécie e forma. Acompanhada de texto de limitações. | Média de tabela para capim-elefante ensilado, sem distinção de cultivar |

Regras fixas:

- **Nunca** cruzar espécies nem formas de conservação. Fresco e ensilado são alimentos diferentes.
- **Tolerância de idade de corte zero por padrão.** Nível 1 exige a mesma idade relatada pela fonte, ou a mesma classe de idade que a própria fonte definiu. Uma tolerância maior só existe se for aprovada pelo usuário com justificativa e referência registradas na regra de compatibilidade.
- **Sem interpolação** entre idades de corte. Exceção: a fonte publica uma equação de regressão por idade. Nesse caso a regressão vira equação registrada, válida só na faixa estudada.
- O usuário vê todos os candidatos encontrados e pode escolher outro. A escolha fica gravada.
- Se nenhum candidato for encontrado em nenhum nível, o alimento não pode entrar em cálculo. O sistema diz exatamente o que falta.

### 4.3 Resultado da seleção: perfil de composição

O resultado é um **perfil de composição** imutável: o conjunto de valores, por nutriente, que será usado na dieta. Cada valor do perfil aponta para os registros de origem, o nível de correspondência, o cenário e o método de obtenção. Dietas e avaliações referenciam o perfil, nunca a tabela viva. Assim um cálculo antigo continua reproduzível depois que o banco de alimentos mudar.

---

## 5. Valores Representativos e Cenários

### 5.1 Quando agregar

Só se calcula um valor representativo quando há **registros compatíveis suficientes**. O número mínimo será fixado e justificado na Fase 5D, antes de qualquer agregação ser usada. Abaixo do mínimo, usa-se o registro individual com indicação explícita de que é um único estudo.

### 5.2 Critérios de compatibilidade

Registros só podem ser agregados se tiverem:

- mesma espécie, mesma forma de conservação e mesma parte da planta;
- mesma cultivar, para nível 1;
- condições dentro do que a regra de compatibilidade aprovada permitir;
- **mesmo método analítico** para o nutriente. Variantes de método são nutrientes diferentes no catálogo. Exemplo: FDN com e sem correção para cinzas e proteína não se misturam;
- base e unidade convertíveis, com a conversão MN para MS feita com a MS do **próprio registro**;
- metadados mínimos preenchidos. Registro sem condição experimental relevante fica fora da agregação, mas pode ser usado sozinho.

Regras contra dupla contagem:

- **Tabela compilada e estudo individual nunca são agregados juntos.** O CQBAL já resume estudos, e um mesmo experimento pode estar nas duas fontes. São candidatos alternativos, não somáveis.
- Dois registros do mesmo experimento publicado em veículos diferentes contam como um só. O registro de fonte tem campo para identificar o experimento de origem.

### 5.3 Valor médio

- Método proposto: média ponderada pelo número de observações quando todas as fontes informam esse número; mediana como alternativa robusta quando não informam ou há valores discrepantes. A escolha final é registrada na regra de agregação e aprovada na Fase 5D.
- Quando a fonte já publica média, desvio-padrão e número de observações, esses valores são armazenados como publicados. O formato exato do CQBAL 4.0 ainda será confirmado.
- **Decisão da Fase 5D (2026-10-22):** média simples por origem independente (cada origem pesa 1), com a mediana e a cobertura por nutriente ao lado; mínimo de 3 origens independentes na mesma forma de obtenção e método; abaixo disso, referência individual, sem média. Regra `SELECAO_5D` versão 1 (PLANO_FASE_5.md, seções 13.10 e 13.11).

### 5.4 Cenários conservador, médio e favorável

- **Médio** é o valor representativo.
- **Conservador e favorável** dependem da direção nutricional de cada nutriente:
  - para energia, proteína, minerais e digestibilidade, conservador é o valor mais baixo;
  - para fibras e lignina, conservador é o valor mais alto;
  - para MS, conservador é o valor mais baixo, porque reduz a MS entregue por kg de alimento fornecido.
- A direção de cada nutriente fica registrada no catálogo de nutrientes, não no código.
- A estatística dos limites será fixada na Fase 5D. As opções são percentis dos registros compatíveis ou média e desvio-padrão publicados pela fonte. **Nunca** se usa percentual fixo arbitrário, como "mais ou menos 10%".
- Sem dados suficientes, só existe o cenário médio. O sistema mostra "cenários indisponíveis: dados insuficientes".

**Coerência dos cenários.** Levar cada nutriente ao seu pior valor de forma independente pode descrever um alimento que não existe, por exemplo energia mínima junto com fibra mínima. Duas abordagens estão em avaliação:

1. **Cenário coerente** (recomendado): o cenário conservador usa registros reais do extremo desfavorável de um indicador principal, mantendo todos os nutrientes desses registros juntos.
2. **Envelope independente**: cada nutriente no seu limite, rotulado na tela como "envelope de pior caso, não corresponde a um alimento real".

A decisão fica para a Fase 5D.

**Decisão da Fase 5D (2026-10-22):** cenário coerente por perfil real. Cada cenário é o perfil inteiro de um registro real no extremo (mínimo ou máximo observado) de um nutriente com direção definida, rotulado por esse nutriente; nenhum nutriente isolado é tratado como qualidade global. Extremos são valores observados, nunca intervalo de confiança. MO, MM e EE continuam sem direção conservadora. O envelope independente não foi adotado.

---

## 6. Rastreabilidade de Cada Valor

Cada valor nutricional armazenado registra:

- fonte bibliográfica, autores e ano;
- página, tabela ou identificador equivalente, quando houver;
- condições experimentais relevantes: cultivar, idade de corte, forma de conservação, aditivo, região, estação;
- unidade e base: matéria natural (MN) ou matéria seca (MS);
- tipo do valor: valor único, média, mediana, mínimo garantido, máximo garantido;
- estatísticas publicadas: número de observações, desvio-padrão, mínimo e máximo, quando houver;
- método analítico, quando a fonte informar;
- versão ou data da referência;
- método de obtenção: transcrição direta, conversão de base (com a MS usada), ou agregação (com a regra, a versão da regra e os registros usados);
- quem transcreveu, quem conferiu e quando.

**Rótulos comerciais.** Níveis de garantia costumam vir por kg de produto. Ficam guardados exatamente como no rótulo, com base MN e tipo "mínimo garantido" ou "máximo garantido". Para converter à MS é preciso a umidade do produto, normalmente informada como umidade máxima. O cálculo usa o valor garantido e avisa que o teor real pode diferir.

**Bases MN e MS.** A interface mostra sempre a base ao lado do número. O usuário informa quantidades fornecidas em kg de MN, que é como ele trabalha no cocho. O motor converte para MS com a MS do perfil. Como a MS de silagens e forragens frescas varia muito, a tela destaca a sensibilidade do resultado à MS.

---

## 7. Motor de Cálculo (`packages/nutrition-engine`)

### 7.1 BR-CORTE: edição única

- **Situação em 2026-10-22:** PDF disponível e mapeado no planejamento (PLANO_FASE_6.md); nenhuma equação transcrita ainda.
- Primeiro passo ao receber o arquivo: confirmar título, edição, ano e ISBN pela ficha catalográfica e registrar a **edição principal** em configuração.
- O motor usa **uma única edição**. Equações de edições diferentes só se misturam com justificativa científica documentada e aprovada pelo usuário.
- A extração de equações de PDF tem riscos: sinais negativos perdidos, expoentes, vírgula decimal, tabelas desalinhadas. Cada equação é conferida contra a imagem da página, e o usuário confirma as equações críticas.

### 7.2 Processo de implementação, a executar só na Fase 6

1. Ler as seções relevantes do livro.
2. Montar um inventário de equações, em documento próprio a criar na Fase 6, com: identificador, categoria animal, página, número da equação, variáveis, unidades, coeficientes, hipóteses e faixa de validade.
3. Mapear quais categorias de bovinos de corte o livro cobre e com quais equações. Categorias não cobertas ficam bloqueadas no app.
4. Aprovação do inventário pelo usuário antes de escrever código.
5. Implementar funções TypeScript puras, sem dependência de interface, banco ou Electron.
6. Criar testes com os exemplos numéricos e tabelas publicados no livro.
7. Ligar o motor aos perfis de composição para avaliar dietas.

### 7.3 Registro de equações

```
EquacaoRegistrada
  id, fonte_id, edicao, referencia_local (capítulo, página, nº da equação)
  categorias_animais[]       a que animais se aplica
  entradas[]                 nome, unidade, faixa de validade da fonte
  nutrientes_requeridos[]    da dieta, quando aplicável
  saida                      nome, unidade
  hipoteses[]
  coeficientes               arquivo de dados, separado da lógica
  transcrito_por, conferido_por, data_conferencia
  calcular(entradas) -> resultado + avisos
```

Uma equação só fica ativa com conferência registrada e testes de validação passando.

### 7.4 Resultados que não se misturam

A interface e o banco separam quatro coisas:

| Resultado | Depende de | Pergunta respondida |
|---|---|---|
| **Exigência calculada** | Animal e meta de ganho | Quanto este animal precisa para ganhar o desejado? |
| **Dieta formulada (oferta)** | Alimentos, quantidades e perfis de composição | Quanto a dieta entrega? |
| **Desempenho previsto** | Oferta e equações do modelo | Que ganho o modelo prevê com esta dieta? |
| **Desempenho observado** | Pesagens reais | Que ganho de fato aconteceu? |

O desempenho previsto só é calculado quando o modelo científico tiver equações que permitam isso para aquela categoria. A previsão usa as próprias equações publicadas resolvidas para o ganho, por método numérico, sem fórmula nova.

### 7.5 Entradas da avaliação

- Animal ou lote: categoria, sexo e condição sexual, grupo genético, peso vivo atual.
- Ganho médio diário desejado.
- Sistema de criação: pasto, semiconfinamento, confinamento.
- Alimentos disponíveis, com perfil de composição selecionado.
- Quantidades em kg de MN por cabeça e por dia, ou inclusão em % da MS.
- Preço de cada alimento, vindo do estoque ou digitado.

### 7.6 Pipeline

1. Validar faixas de validade das entradas.
2. Calcular exigências.
3. Estimar consumo de MS pela equação aplicável, ou usar o consumo informado.
4. Calcular a oferta da dieta para cada cenário disponível.
5. Calcular o balanço por nutriente: atende, déficit, excesso ou indeterminado.
6. Prever desempenho, quando o modelo permitir.
7. Calcular custos: por kg de MS, por cabeça e dia, e por kg de ganho previsto.
8. Gravar snapshot com entradas, perfis, resultados, avisos, cenário e versão do modelo.

### 7.7 Dados ausentes: bloqueio parcial

- Cada cálculo declara os nutrientes e entradas de que precisa.
- O motor monta um grafo de dependência. Se falta um nutriente, só os cálculos que dependem dele, e os que dependem desses, ficam "indeterminados".
- Exemplo: sem cálcio em um ingrediente, o balanço de cálcio fica indeterminado, mas energia e proteína são avaliadas normalmente.
- A tela lista o que faltou, em qual alimento, e como resolver: outro perfil, outra fonte ou análise.
- Nunca se assume zero.

### 7.8 Incerteza e limitações exibidas

- Resultados mostrados por cenário quando houver cenários.
- Nível de correspondência dos dados de cada alimento.
- Avisos de extrapolação de faixa.
- Lista de hipóteses do modelo para aquela categoria.
- Frase fixa: "Composições médias de referência não garantem o desempenho previsto."

### 7.9 Comparação previsto e observado

- Ao aplicar uma dieta avaliada a um lote, o sistema grava uma projeção: data de início, peso inicial, ganho previsto por cenário.
- As pesagens reais do lote são comparadas à projeção, em gráfico e em desvio percentual.
- O sistema **não recalibra o modelo automaticamente**. Desvios ficam registrados para o usuário interpretar.

### 7.10 Formulação

- Primeiro vem a avaliação de dieta montada pelo usuário.
- Depois, formulação de mínimo custo por programação linear, com escolha do cenário a atender, por exemplo formular para o cenário conservador.
- Toda dieta formulada passa pela avaliação antes de ser exibida.

### 7.11 Unidades

- Tipos TypeScript marcados por unidade e por base, impedindo somar valor em MN com valor em MS.
- Conversões de unidade em um único módulo testado.
- Conversões entre frações energéticas usam apenas relações publicadas na edição escolhida, registradas como equações.

---

## 8. Corte e Leite São Modelos Separados

- BR-CORTE não se aplica a vacas em lactação.
- Animais de aptidão leiteira ficam bloqueados no motor de corte, com explicação na tela.
- O módulo leiteiro calcula custo alimentar real, sem avaliar exigências, até existir um modelo leiteiro próprio.

---

## 9. Validação e Testes

- **Transcrição:** cada equação testada contra exemplos e tabelas do próprio livro, com página citada no teste. Tolerância compatível com o arredondamento publicado.
- **Propriedades biológicas:** exigência de energia cresce com o ganho; mantença cresce com o peso; conversão MN para MS e de volta devolve o valor original. Biblioteca candidata: `fast-check`.
- **Dados:** todo valor tem fonte e referência local; percentuais entre 0 e 100; base e unidade preenchidas; nenhum zero onde a fonte não trouxe dado.
- **Seleção:** seletor nunca cruza espécie ou forma; nível correto atribuído; tabela compilada nunca agregada a estudo individual.
- **Agregação e cenários:** casos sintéticos com resultado conhecido, para testar a regra estatística, não para fornecer dados nutricionais.
- **Dependências:** remover um nutriente bloqueia só os cálculos dependentes.
- **Regressão:** conjunto fixo de dietas de referência; mudança de resultado exige justificativa.
- **Conferência humana:** equações e valores sem conferência ficam desativados.

---

## 10. Versionamento

- `nutrition-engine` com versão semântica própria.
- Regras de compatibilidade e agregação também versionadas.
- Cada avaliação guarda versão do motor, edição do BR-CORTE, versão das regras e perfis usados.

---

## 11. Limitações Declaradas

- Ferramenta de apoio. Não substitui zootecnista ou veterinário.
- Modelos valem nas condições experimentais das fontes.
- Composições de referência são médias e podem diferir muito do alimento da propriedade, em especial a MS de silagens.
- Rótulos comerciais informam garantias, não composição real.

---

## 12. Pendências Científicas

| # | Pendência | Bloqueia |
|---|---|---|
| 1 | Receber o PDF do BR-CORTE e confirmar edição, ano e ISBN | Fase 6 |
| 2 | Verificar formato de acesso, estrutura e termos de uso do CQBAL 4.0, inclusive se publica número de observações e desvio-padrão | Fase 5B |
| 3 | Levantar publicações da Embrapa sobre BRS Capiaçu fresco e ensilado por idade de corte | Fase 5C |
| 4 | Levantar fontes para silagem de milho, pastagens e concentrados principais | Fase 5B e 5C |
| 5 | Fixar número mínimo de registros, método da média e estatística dos cenários | Fase 5D |
| 6 | Decidir entre cenário coerente e envelope independente | Fase 5D |
| 7 | Definir classes de idade de corte, só se uma fonte as justificar | Fase 5D |
| 8 | Localizar publicação técnica sobre medição de MS na fazenda. Até lá (decisão D5-8, 2026-10-21), o usuário descreve o método e as limitações, e o valor fica marcado como não validado pelo sistema | Validação do método (sem fase definida) |
| 9 | Inventário de equações do BR-CORTE e categorias cobertas | Fase 6 |
| 10 | Selecionar exemplos numéricos publicados para os testes | Fase 6 |
| 11 | Métodos analíticos das definições de nutrientes: o catálogo inicial (Fase 5A, decisão D5-2) traz só código, nome, grupo, unidade e base, com método pendente de fundamentação; complementar com as publicações consultadas | Fases 5B e 5C |
| 12 | Direção conservadora de MO, MM e EE, não coberta pela regra da seção 5.4 | Fase 5D |
