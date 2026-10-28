# PLANO_FASE_4.md — Financeiro (RF-02)

> **Situação em 2026-10-16: decisões D-A a D-K aprovadas (seção 3). Em 2026-10-16 o usuário autorizou a Fase 4 inteira (4B a 4H), uma entrega por vez, com commit por entrega. 4A (`8fe7caa`), 4B (`3c0e4d2`), 4C (`ff8e646`), 4D (`e9b1c54`), 4E (`1cd4907`), 4F (`decee7e`) e 4G (`d0b15bb`) commitadas; 4H (`f6c8745`) commitada (relatório no ROADMAP, seção 18; fechamento na seção 19). Ajustes da revisão final na seção 20 do ROADMAP (completude do resultado; desempenho investigado; devolução de animais implementada com o desenho aprovado, ROADMAP seção 21, migration 0011). Tag `fase-4` aguardando aprovação.**
> Base: commit `a12ec68` (este plano) sobre `90a48de` (ajustes pós-Fase 3) e `f2468c8` (marca `fase-3`). A 4A está no commit `8fe7caa`.

## 1. Objetivo e princípio central

Um módulo financeiro completo para corte e leite, que **não conta o mesmo dinheiro duas vezes** e que separa três coisas que costumam ser misturadas:

| Visão | Pergunta que responde | Fonte | Data que vale |
|---|---|---|---|
| **Fluxo de caixa** | Quanto dinheiro entrou e saiu? | Pagamentos e recebimentos | Data do pagamento |
| **Custos apropriados** (gerencial) | Quanto custou produzir, e para qual lote ou animal? | Aquisição de animais, consumo de estoque, despesas diretas, rateios | Data do fato (consumo, aplicação, competência) |
| **Resultado econômico** | Quanto sobrou da atividade? | Receitas menos custos apropriados | Data da venda e das apropriações |

As três visões aparecem em telas separadas, com rótulo fixo, e **nunca são somadas entre si**. Uma tela de **conciliação** explica a diferença entre elas (ex.: compra de ração paga em outubro e consumida em dezembro).

### Regra "um fato, um dono"

Cada fato econômico tem **um único registro dono**. Os demais módulos só o referenciam.

| Fato | Registro dono | Quem apenas referencia |
|---|---|---|
| Dinheiro pago ou recebido | `pagamento_financeiro` | Fluxo de caixa, contas a pagar e a receber |
| Compra de insumo (nota, valor, vencimento) | `lancamento_financeiro` + `lancamento_item` | `movimentacao_estoque` (entrada) pelo `documento_origem_id` |
| Quantidade e custo médio do insumo | `movimentacao_estoque` (Fase 3) | Custos apropriados; **nenhuma despesa nova** é criada por entrada ou consumo |
| Consumo de insumo | `movimentacao_estoque` (saída) | Custo apropriado ao destino, lido do custo médio já calculado |
| Compra e venda de animal | `negociacao_animal` | `movimentacao_animal`, lançamento e itens |
| Aplicação sanitária | `manejo_sanitario` (quantidade e animais) | Custo vem do estoque ou de lançamento vinculado; ver 5.6 |
| Produção própria de volumoso | `centro_producao` | Entrada `entrada_producao` no estoque, com custo = soma do centro |

Isso é garantido em três camadas: **modelo** (vínculos 1:1 com `UNIQUE`), **serviços** (validação e transação única) e **testes de conservação** (seção 9.3).

## 2. O que o módulo cobre (e o que não cobre)

**Dentro da Fase 4** (RF-02.1 a RF-02.7 e as linhas da Fase 4 do ROADMAP):

1. Categorias, contrapartes (fornecedor, comprador, frigorífico, laticínio), lançamentos, parcelas e pagamentos.
2. Fluxo de caixa realizado e previsto, com filtros por período, propriedade, lote e atividade.
3. Compra e venda de animais integradas à movimentação do rebanho, com custo de aquisição.
4. Compra de insumos ligada às entradas físicas do estoque, sem despesa duplicada.
5. Consumo de estoque como custo produtivo, com custo desconhecido sinalizado e nunca zerado.
6. Custos sanitários sem dupla contagem com a baixa de estoque.
7. Custos diretos e compartilhados por lote, com rateio explícito, auditável e que fecha centavo a centavo.
8. Produção própria de volumosos: o custo de produzir vira o custo de entrada no estoque.
9. Receitas de venda de animais, de leite (lançamento) e de outros produtos.
10. Custo por animal e por lote, margens, custo por kg de peso vivo ganho, custo por arroba de carcaça vendida, ponto de equilíbrio.
11. Exportação em CSV e PDF.

**Fora da Fase 4** (fica registrado como limitação, sem inventar solução):

- **Ordenha, lactação e custo por litro produzido:** Fase 7. Na Fase 4 o leite entra como receita lançada (volume e preço informados) e o preço médio por litro vendido é calculado.
- **Contas bancárias e saldo de caixa conciliado com extrato:** o fluxo mostra entradas, saídas e acumulado do período; não há saldo bancário.
- **Depreciação, financiamento, juros, multas e descontos automáticos.** Diferenças viram lançamentos próprios, informados pelo usuário.
- **Cálculo de impostos** (Funrural, ICMS etc.): exigiria dados legais que não devem ser inventados. Imposto é só uma categoria de despesa informada.
- **Composição nutricional, MS e dieta:** Fases 5, 6 e 8. A Fase 4 expõe o custo médio por unidade física do estoque, que essas fases consumirão.
- **Nota fiscal eletrônica, importação de extrato, mobile e nuvem.**

## 3. Decisões

### 3.1 Situação

| # | Decisão | Situação em 2026-10-16 |
|---|---|---|
| D-A | Atividade (corte ou leite) explícita | **Aprovada** |
| D-B | Arroba de peso vivo e arroba de carcaça distintas | **Aprovada** |
| D-C | Parcelas e pagamentos parciais | **Aprovada** (3.3; semântica de "não informada" ajustada em 3.4) |
| D-D | Critério de alocação do preço de lote de animais | **Aprovada** (3.3) |
| D-E | Classificação fixo ou variável | **Aprovada com ajuste** (3.2) |
| D-F | Custo de aquisição de animal nascido na propriedade | **Aprovada com ajuste** (3.4) |
| D-G | Custo anterior ao sistema | **Aprovada com ajuste** (3.4) |
| D-H | Desfazer saída de animal | **Aprovada** (3.2) |
| D-I | Trilha de alterações | **Aprovada com condições** (3.4); cumprida na 4A |
| D-J | Exportação PDF e CSV | **Aprovada** (3.3; verificações adicionais em 3.4) |
| D-K | Testes de propriedade com gerador determinístico | **Aprovada**, com critério de abrangência (3.2) |

Todas as decisões foram aprovadas em 2026-10-16, algumas com ajustes (3.4). A 4A foi autorizada e implementada; as demais entregas dependem de nova autorização.

### 3.2 Decisões aprovadas

**D-A. Atividade explícita.** Todo lançamento tem `atividade` (`corte`, `leite`, `compartilhada`, `nao_definida`). Para lotes, a tela sugere a atividade a partir da finalidade (engorda, recria e cria → corte; lactação e seca → leite; outro → o usuário escolhe) e mostra essa regra. Nada é classificado em silêncio; `nao_definida` aparece como tal nos relatórios.

**D-B. Arroba de peso vivo e de carcaça.** 1 @ = 15 kg é a unidade comercial e vale para as duas bases, que são **grandezas distintas e nunca convertidas entre si sem rendimento informado**:

- `arroba_vivo`: peso vivo ÷ 15.
- `arroba_carcaca`: peso de carcaça ÷ 15, só quando o peso de carcaça foi informado (pelo frigorífico). O sistema não estima carcaça a partir do peso vivo.
- Toda quantidade em @ no banco e na tela leva a base no nome (`arroba_vivo`, `arroba_carcaca`). Indicadores por @ dizem a base.
- Rendimento de carcaça, quando existir, é dado **informado** da venda, nunca presumido.

**D-E. Classificação fixo ou variável (ajustada).**

- Cada categoria tem uma classificação padrão (`variavel`, `fixo` ou `nao_classificado`; começa `nao_classificado`).
- Cada lançamento pode ter classificação própria. Ao criar o lançamento, o campo vem preenchido com o padrão da categoria (**cópia no momento da criação**) e pode ser alterado. Mudar o padrão da categoria depois **não reescreve** lançamentos antigos: existe uma ação explícita, em lote, auditada, "aplicar a classificação da categoria aos lançamentos não classificados", com prévia da contagem e do valor.
- Custos que não são lançamentos (consumo de estoque, aquisição de animais, custo sanitário vindo do estoque, rateios) têm classificação padrão por tipo de origem ou por item de estoque, definida pelo usuário na tela de classificações. Começam `nao_classificado`.
- **Valor não classificado nunca entra em silêncio** em indicador que dependa da classificação (margem bruta, custo variável por unidade, ponto de equilíbrio). Cada um mostra a cobertura ("R$ X classificados de R$ Y; R$ Z em N itens sem classificação"), vem marcado como **parcial** enquanto houver valor sem classificação, com a lista dos itens e o atalho para classificá-los. Não há opção de tratar o não classificado como fixo ou variável por padrão.
- Custo total, margem líquida e resultado **não dependem** da classificação e incluem tudo.

**D-H. Desfazer a saída de um animal.** Reversão auditável, com motivo obrigatório e na mesma transação. A saída original não é apagada: a movimentação de saída é cancelada logicamente, o animal volta a `ativo` sem data de saída, e a trilha guarda o estado anterior e o novo. Pré-condições verificadas, com mensagem que lista o que impede:

- Venda ativa vinculada: a reversão é feita **pelo cancelamento da venda** (5.4), que antes confere recebimentos; reversão direta de uma saída com negociação ativa é recusada.
- Lote de origem encerrado: o usuário escolhe reabrir o lote ou outro lote ativo da propriedade; nada é decidido sozinho.
- Fatos posteriores à data de saída que pressuponham o animal fora do rebanho (nova identificação igual, movimentações ou eventos incompatíveis): recusados.
- Custos e resultado são derivados e se ajustam sozinhos: a baixa por venda, morte ou descarte deixa de existir no resultado e o animal volta a acumular custo.

**D-K. Testes de propriedade determinísticos, com abrangência definida.**

- Gerador pseudoaleatório próprio (algoritmo simples, semente fixa no código), sem dependência nova. Toda falha imprime semente, caso e sequência, e o teste aceita a semente por variável de ambiente para reprodução.
- **Propriedades de domínio** (1.000 casos por propriedade e por semente, 3 sementes fixas): soma das partes igual ao total; ordem das partes irrelevante; determinismo; monotonicidade; parcelas e pagamentos fecham; alocação de preço fecha em todos os critérios; estados de apuração (completa, parcial, desconhecida) fecham na soma.
- **Sequências de operações com invariantes** (modelo contra banco real temporário; 100 sequências de até 30 passos): compra de animais e insumos, consumo, rateio, correção retroativa de estoque, cancelamento, devolução, pagamento, estorno, desfazer saída. Após cada passo valem os invariantes de conservação da seção 9.3. Falha reduz a sequência (remove passos) até o menor caso reproduzível.
- **Guarda de abrangência:** um teste verifica que o gerador de fato produz as classes de borda (valor de 1 centavo, empates de resto, destino único, peso relativo desigual, custo desconhecido, consumo cancelado, correção que reordena datas, dois animais com a mesma data). Gerador que deixa de cobrir uma classe reprova o teste.
- Os limites acima rodam no `verify` normal; um modo longo (variável de ambiente, 20.000 casos) fica fora do `verify` e é executado ao fim de cada checkpoint.

### 3.3 Decisões D-C, D-D, D-F, D-G, D-I e D-J: recomendações originais (aprovadas, com os ajustes de 3.4)

#### D-C. Parcelas e pagamentos parciais

**Recomendação: sim, desde a 4A.** Cada lançamento tem `condicao_pagamento`: `a_vista`, `parcelado` ou `nao_informada`.

- **À vista:** uma parcela com vencimento na data da operação. O sistema **não cria pagamento sozinho**. A tela pergunta "já foi pago/recebido?" com a opção desmarcada por padrão; marcar cria um pagamento explícito, com data informada. Sem isso a parcela fica aberta.
- **Parcelado:** número de parcelas, primeiro vencimento e intervalo (30 dias ou data a data). Valores iguais com o resíduo na última parcela, ou valores digitados que somem exatamente o total.
- **Pagamento não informado:** o fato existe só na competência (ex.: um custo registrado para apropriação). Não gera parcela, não aparece em caixa nem em contas a pagar, e é mostrado como "pagamento não informado".
- **Pagamentos:** parciais, vários por parcela, com estorno (cancelamento lógico com motivo). Nunca passam do saldo da parcela e não podem ter data futura.
- **Renegociação:** substituir parcelas **abertas** por novas, com motivo, mantendo as pagas; o total só muda por uma operação própria de ajuste do valor do lançamento, também com motivo.
- **Juros, multa e desconto:** não são calculados nem embutidos no pagamento. O usuário registra um lançamento próprio vinculado ao original (categoria de juros ou de desconto obtido).
- **Três números sempre separados** em compras e vendas: **valor da operação**, **a pagar ou a receber** (soma das parcelas abertas menos pagamentos) e **pago ou recebido** (pagamentos efetivos).

Alternativas: só à vista (simples, mas não representa compra de gado nem insumo parcelados); parcelas sem pagamento parcial (obriga quitar a parcela inteira, o que falseia o fluxo quando o pagamento é dividido). **Impacto:** três tabelas na 0005 (lançamento, parcela, pagamento), todas necessárias de qualquer forma; nenhum risco novo além dos testes de conservação.

#### D-D. Critério de alocação do preço de um lote de animais comprado

**Recomendação: o critério padrão deriva da unidade em que o preço foi negociado, sem adivinhação.**

| Unidade do preço | Critério padrão | Base |
|---|---|---|
| Por cabeça | Igual por cabeça | Quantidade de animais |
| Por kg vivo ou por @ de peso vivo | Por peso | Peso vivo de compra de cada animal |
| Por @ de carcaça (compra de animal para abate) | Por peso de carcaça | Peso de carcaça informado de cada animal |

- Se o critério pede peso e **algum animal não o tem**, a tela **bloqueia** e oferece escolher conscientemente outro critério (igual por cabeça ou valor manual). Não há queda silenciosa para "igual".
- O usuário pode trocar o critério e digitar valores por animal. No critério manual a soma deve ser **exatamente** o total.
- Cálculo em inteiros: pesos em gramas inteiros (`round(kg × 1000)`), divisão proporcional por maior resto, desempate por `id`; a soma das partes é sempre o total.
- A prévia mostra o valor de cada animal, o critério, a base e a soma; a negociação grava critério e pesos usados.
- Frete, comissão e outros acessórios vão por padrão pelo **mesmo critério** do preço, e o usuário pode alterá-lo por lançamento.

Alternativas: sempre igual por cabeça (injusto para lotes heterogêneos e contraria o preço por kg); sempre por peso (impossível quando falta peso). **Impacto:** `unidade_preco` ganha `arroba_vivo` e `arroba_carcaca` (D-B); sem tabela nova.

#### D-F. Custo de aquisição de animal nascido na propriedade

**Recomendação: ausente (NULL), nunca zero e nunca estimado.**

- O custo de aquisição de um animal `nascido` é "**não apurado**". Esse custo não inclui nada derivado da mãe, do pasto anterior ou de médias, porque seria dado inventado.
- O custo acumulado do animal conta a partir da data de entrada no sistema, com os componentes conhecidos, e usa o estado **parcial** (5.1): "custo acumulado desde o cadastro; custo de formação não apurado".
- Lotes mistos (comprados e nascidos) mostram os dois grupos separados, para o custo médio do lote não esconder os animais sem aquisição.
- Na venda, o resultado do animal nascido é exibido como **parcial** ("não inclui o custo de formação"). Se o usuário quiser apurar um custo de formação por conta própria, usa o custo anterior ao sistema (D-G), claramente identificado como informado.

Alternativas: tratar como zero (contabiliza lucro fictício, contraria "ausente é ausente" e o requisito 8); estimar por critério (inventaria dado); exigir custo de formação para cadastrar (bloqueia o uso). **Impacto:** nenhuma coluna nova; só o estado de apuração nos relatórios.

#### D-G. Animais que já estão no rebanho com custo anterior ao sistema

**Recomendação: registro próprio de "custo anterior ao sistema", fora do caixa e fora dos lançamentos.** Corrijo a proposta anterior, que o chamava de lançamento "saldo inicial": um lançamento apareceria em contas a pagar, fluxo e competência, criando movimento financeiro fictício (requisito 8).

- Tabela `custo_anterior` (0006): `propriedade_id`, `destino` (`animal` ou `lote`), `animal_id` ou `lote_id`, `valor_centavos`, `data_referencia`, `descricao`, `origem_informacao` (sempre "informado pelo usuário"), `motivo`. Cancelamento lógico com motivo e trilha.
- Aparece **somente** em custos apropriados e no custo acumulado, com o rótulo "custo anterior ao sistema (informado)". Nunca aparece em caixa, contas a pagar, competência de despesas nem no resultado do período corrente; ele só é baixado ao resultado quando o animal sai, como a aquisição.
- Destino `lote`: distribuído por igual aos animais presentes no lote em `data_referencia` (permanências reconstruídas), com a divisão proporcional exata; os pesos usados ficam gravados.
- Opcional e nunca presumido: ausência significa "não informado", não zero.
- O estoque já tem seu próprio saldo inicial (`entrada_inicial`, custo opcional, Fase 3) e continua assim: nenhum valor de estoque é criado pela Fase 4.

Alternativas: lançamento de saldo inicial (rejeitada, cria movimento fictício); não permitir (deixa o custo de animais antigos sempre parcial sem recurso). **Impacto:** uma tabela pequena na 0006; regra de exibição no custo acumulado.

#### D-I. Trilha de alterações

**Recomendação: recriar `historico_alteracao` na 0005 sem lista fechada de entidades nem de ações, mantendo a imutabilidade por gatilhos.**

Hoje `entidade` e `acao` têm CHECK com lista fechada; cada fase precisa recriar a tabela inteira, copiando todos os registros (como a 0004 fez). Com ao menos seis entidades novas nesta fase e mais nas Fases 5 a 9, o custo e o risco crescem.

- A nova tabela mantém as mesmas colunas, o `json_valid` e os gatilhos que proíbem `UPDATE` e `DELETE`. `entidade` e `acao` passam a ter CHECK de **formato** (1 a 60 caracteres, só minúsculas e `_`), não de lista.
- O catálogo de valores válidos passa a ser o tipo TypeScript (`EntidadeHistorico`, `AcaoHistorico`) do repositório, que continua fechado e é a única porta de escrita. Um teste varre o código e o banco de teste para garantir que nenhum valor fora do tipo seja gravado.
- A migração é testada com dados reais das Fases 1 a 3: contagem, conteúdo (hash de todas as linhas, na ordem) e gatilhos antes e depois; há backup automático antes, como em toda migration.

Alternativas: manter a lista e recriar a cada migration (seguro, mas copia a trilha inteira em cada fase e repete o risco); uma trilha separada por módulo (fragmenta a linha do tempo do animal, que une eventos de vários módulos). **Impacto:** perde-se a barreira de lista no banco contra erro de digitação de entidade; é compensada pelo tipo, pelo teste e pelo repositório único. É a única decisão pendente que **altera uma tabela existente**.

#### D-J. Exportação em PDF e CSV

**Recomendação: PDF pelo `printToPDF` do Electron e CSV próprio, sem dependência nova, ambos gerados no processo principal.**

- **Fluxo:** a interface pede a exportação por um canal IPC tipado (`relatorio:exportar`, com tipo, formato e filtros, validado com Zod). O processo principal consulta os dados, abre o diálogo de salvar, gera e grava o arquivo. O renderer não acessa o disco (regra 7).
- **PDF:** o main monta o relatório como HTML por uma função pura (com todo texto escapado), carrega em janela oculta com sandbox, isolamento e CSP restritiva (`default-src 'none'`) e sem rede (regra 9), e chama `printToPDF`. Fontes e estilos locais. Rodapé fixo: relatório gerencial, não é documento fiscal nem contábil; visão do relatório (caixa, apropriado ou resultado) sempre no título.
- **CSV:** UTF-8 com BOM, separador `;`, quebra CRLF (abre corretamente no Excel em pt-BR). Cada valor monetário sai em duas colunas: `valor_centavos` (inteiro exato) e `valor_reais` (texto `1234,56`). Datas ISO. Textos livres são protegidos contra injeção de fórmula (prefixo `'` quando começam com `=`, `+`, `-`, `@`, tabulação ou retorno de carro); as colunas numéricas tipadas ficam fora dessa regra.
- **Privacidade:** o documento (CPF/CNPJ) da contraparte **não** sai por padrão; incluir exige marcar uma opção explícita.
- **Testes:** a estrutura do relatório (dados + HTML) é testada como função pura com comparação exata; o CSV é testado byte a byte, com acentos, aspas, `;`, quebras de linha e tentativas de injeção; o E2E gera um PDF em pasta temporária e confere cabeçalho `%PDF-`, tamanho e presença de páginas. **Limite declarado:** o conteúdo textual do PDF não é verificado automaticamente (sem biblioteca de leitura de PDF); a garantia está no teste do HTML que o gera.
- XLSX fica para a Fase 10.

Alternativas: biblioteca de PDF (`pdfmake`, `pdf-lib`), com layout controlado e texto verificável, ao custo de dependência e de manutenção; só CSV na Fase 4 (corta o RF-02.7 pela metade). **Impacto:** um canal IPC, uma função de diálogo para arquivo binário e a janela oculta de impressão no main; a entrega 4H.

### 3.4 Ajustes e condições aprovados em 2026-10-16

**D-C (ajuste).** Compras e vendas à vista, parceladas **e com condição de pagamento não informada**. Condição não informada deixa a operação **pendente de definição financeira**: nenhum pagamento fictício é criado e a ausência de parcelas nunca é lida como inexistência de obrigação. O saldo a pagar ou receber é **desconhecido** (`null`, "A definir" na tela), não zero, e o lançamento aparece na situação `pendente_definicao`. Isto substitui o texto de 3.3 que dizia "fato só na competência, sem obrigação". Vencimentos futuros são permitidos; pagamento efetivo com data futura é recusado. Pagamentos parciais, estornos auditáveis e renegociação das parcelas abertas estão na 4A.

**D-D (aprovada).** Critério pela unidade do preço negociado (cabeça, peso vivo ou peso de carcaça), manual disponível, nunca presumir peso ausente, soma exata sem perda de centavos (4C).

**D-F (ajuste).** Para animal nascido na propriedade, a tela distinguirá e mostrará separados: **custo de aquisição não aplicável** (não houve compra), **custo de formação** (não apurado, ou informado como custo anterior, D-G) e **custo acumulado conhecido**. Custo desconhecido nunca é tratado como zero (4C e 4E).

**D-G (ajuste).** Custo anterior ao sistema é registro próprio, sem movimento de caixa, por animal ou lote, com **data de referência, origem da informação e justificativa**. O rateio igualitário entre os animais do lote é o padrão, mas **exige confirmação explícita** do usuário. A composição do lote é verificada **na data de referência** (permanências reconstruídas) e o registro é conferido contra lançamentos e consumos já registrados do mesmo destino até essa data, para **evitar dupla contagem**. O valor distribuído fecha exatamente o valor original (4C).

**D-I (condições, todas cumpridas na 4A).** (1) registros anteriores preservados integralmente: teste compara todas as linhas, na ordem, e o hash SHA-256; (2) gatilhos de imutabilidade recriados e testados; (3) escrita centralizada e tipada: `RepositorioHistorico` é a única porta, com catálogo fechado `ENTIDADES_HISTORICO` e `ACOES_HISTORICO`, e um teste varre o código para garantir que nada mais escreve na trilha; (4) validação rigorosa: o catálogo é conferido em tempo de execução e o banco confere o formato; (5) migration transacional, com backup automático antes (teste prova a reversão total quando falha no passo final); (6) testes de integridade da migração (do zero, de 4, de 3 pela cadeia, com backup e restauração); (7) bancos antigos continuam atualizáveis.

**D-J (verificações adicionais, 4H).** Além dos testes do HTML: verificar que os PDFs gerados são arquivos válidos e legíveis e conferir visualmente relatórios representativos; proteção contra injeção de fórmulas no CSV, tratamento de caracteres especiais e privacidade dos dados pessoais.

**D-E (ajuste) e D-K.** Como descritos em 3.2.

### 3.5 Diferenças entre o plano original e a 4A implementada

- A tabela `classificacao_custo_origem` **não foi criada na 0005**: ela só é usada para classificar custos que não são lançamentos (aquisição de animal, item de estoque, custo anterior), que surgem nas entregas 4C e 4D, e pelos indicadores (4G). A 4B classifica por categoria e por lançamento, sem tabela nova. Será criada na migration da entrega que a usar.
- `lancamento_financeiro.destino_tipo` aceita `animal`, `lote`, `propriedade` e `nenhum`. A ligação de lançamentos a um centro de produção (4F) será feita por tabela de vínculo própria (`centro_producao_lancamento`, com `UNIQUE` no lançamento), como já previsto para os consumos, em vez de uma coluna sem chave estrangeira.
- Categoria sem hierarquia (`pai_id` fica para quando houver necessidade) e com a coluna `origem_exigida`: "Compra de animais" e "Venda de animais" só aceitarão lançamentos do módulo de animais (4C), para impedir duplicidade com lançamento manual.
- `lancamento_financeiro.requisicao_id` e `pagamento_financeiro.requisicao_id` (únicos) tornam criação e pagamento idempotentes.
- Quantidade informativa do lançamento usa unidades com a base explícita (`arroba_vivo`, `arroba_carcaca`, `kg_vivo`, `kg_carcaca`), conforme D-B.
- Renegociação: parcela sem pagamento é substituída (cancelada com motivo); parcela parcialmente paga é reduzida ao valor já pago e fica quitada; as novas parcelas continuam a numeração. O total só muda por ajuste explícito, nunca abaixo do já pago.

## 4. Modelo de dados proposto

Quatro migrations incrementais, cada uma testada do zero e a partir da anterior, com backup antes (regra 6). Convenções mantidas: UUID v7, `STRICT`, `created_at`/`updated_at`/`deleted_at`/`sync_version`, dinheiro em `*_centavos` inteiros, unidade no nome, exclusão física proibida por gatilho, trilha em `historico_alteracao`.

### 4.1 Migration 0005 — base financeira (entrega 4A)

Além das tabelas abaixo, a 0005 recria `historico_alteracao` conforme a decisão D-I (pendente): mesmas colunas e gatilhos, sem lista fechada de entidades e de ações. Se a D-I for rejeitada, a 0005 recria a tabela com a lista ampliada, como a 0004 fez.

**`pessoa_comercial`** — contraparte: `id`, `nome`, `nome_normalizado` (único entre não excluídos), `papel` (`fornecedor`, `comprador`, `frigorifico`, `laticinio`, `prestador`, `outro`), `documento` (CPF/CNPJ como texto opcional, sem validação inventada), `observacoes`. Dado pessoal fica só no banco local.

**`categoria_financeira`**

| Coluna | Observação |
|---|---|
| `natureza` | `receita` ou `despesa` |
| `grupo` | `animais`, `alimentacao`, `sanidade`, `mao_de_obra`, `infraestrutura`, `impostos`, `leite`, `producao_propria`, `outros` |
| `tratamento` | **Chave anti-duplicidade.** `resultado` (entra no resultado na competência), `estoque` (compra de insumo: vira estoque, só vira custo no consumo), `ativo_animal` (aquisição de animal e seus acessórios: só vira custo na saída do animal), `fora_resultado` (transferências, empréstimos) |
| `comportamento_custo` | Classificação **padrão**: `variavel`, `fixo` ou `nao_classificado` (D-E). Copiada para cada lançamento novo, que pode alterá-la |
| `origem` | `sugestao` ou `usuario`, como o catálogo de raças |
| `pai_id`, `ativa` | |

As categorias sugeridas seguem as do RF-02.2 (alimentação, sanidade, mão de obra, infraestrutura, impostos, outras, compra de animais, venda de animais, leite). São sugestões editáveis, não dados científicos.

**`lancamento_financeiro`** — o fato econômico.

| Coluna | Observação |
|---|---|
| `propriedade_id`, `categoria_id`, `pessoa_id` NULL | |
| `natureza` | Copiada da categoria e conferida por CHECK |
| `data_competencia` | Quando o fato ocorreu |
| `valor_total_centavos` | `> 0`; o sinal vem da natureza |
| `descricao`, `documento_numero` | |
| `atividade` | `corte`, `leite`, `compartilhada`, `nao_definida` (D-A) |
| `destino_tipo` | `animal`, `lote`, `propriedade`, `centro_producao`, `nenhum` |
| `animal_id`, `lote_id`, `centro_producao_id` | Exatamente o que o `destino_tipo` pede (CHECK) |
| `quantidade_milesimos`, `unidade` | Opcionais: `@`, `kg`, `l`, `cab`. Informativos, nunca base de cálculo do valor |
| `condicao_pagamento` | `a_vista`, `parcelado` ou `nao_informada` (D-C) |
| `comportamento_custo` | Classificação **própria** do lançamento: `variavel`, `fixo` ou `nao_classificado` (D-E). Só tem sentido em despesas |
| `tipo` | `normal` ou `devolucao`; devolução aponta para o lançamento original em `lancamento_origem_id` (5.12) |
| `origem_tipo`, `origem_id` | `manual`, `compra_estoque`, `negociacao_animal`, `sanitario`, `producao`. Lançamento com origem não é editável direto; ver 5.11. Não existe origem "saldo inicial": custo anterior ao sistema é registro próprio (D-G) |
| `motivo_cancelamento`, `deleted_at` | Cancelamento lógico |

**Situação financeira do lançamento é derivada**, nunca gravada: `pagamento_nao_informado`, `a_vencer`, `vencido`, `parcialmente_pago`, `quitado` ou `cancelado`, calculada das parcelas e dos pagamentos. Cada lançamento tem **um** destino (animal, lote, propriedade, centro de produção ou nenhum); um documento que cobre vários animais ou lotes usa negociação com itens (4.2), nota com itens (4.3) ou rateio (4.3), nunca vários destinos soltos.

**`classificacao_custo_origem`** — classificação padrão de custos que não são lançamentos: `escopo` (`estoque_item`, `aquisicao_animal`, `custo_anterior`, `sanitario_estoque`), `referencia_id` NULL, `comportamento_custo`. Começa vazia (tudo `nao_classificado`). A ação em lote "aplicar a classificação da categoria" é auditada (D-E).

**`parcela_financeira`** — `lancamento_id`, `numero`, `vencimento`, `valor_centavos > 0`. A soma das parcelas ativas é igual ao total do lançamento, validada no serviço e conferida por teste de conservação. A última parcela absorve o resíduo.

**`pagamento_financeiro`** — `parcela_id`, `data`, `valor_centavos > 0`, `forma` (texto livre curto), `observacao`. Pode ser parcial. Soma dos pagamentos ativos de uma parcela nunca passa do valor dela (serviço e gatilho). Data não pode ser futura. Situação da parcela (`aberta`, `parcial`, `paga`, `atrasada`) é **derivada**, não gravada.

Índices: `(propriedade_id, data_competencia)`, `(lote_id)`, `(animal_id)`, `(origem_tipo, origem_id)`, `(vencimento)` das parcelas abertas, `(data)` dos pagamentos.

### 4.2 Migration 0006 — compra e venda de animais (entrega 4C)

**`negociacao_animal`** — `propriedade_id`, `tipo` (`compra`, `venda`), `data`, `pessoa_id`, `lancamento_id` (`UNIQUE`), `valor_total_centavos`, `criterio_alocacao` (`igual`, `peso_vivo`, `peso_carcaca`, `manual`), `unidade_preco` (`cabeca`, `kg_vivo`, `arroba_vivo`, `arroba_carcaca`), `preco_unitario_centavos` NULL, `negociacao_origem_id` NULL (devolução, 5.12), `observacoes`.

**`negociacao_animal_item`** — `negociacao_id`, `animal_id`, `movimentacao_animal_id` (`UNIQUE`), `valor_alocado_centavos`, `peso_vivo_g` NULL e `peso_carcaca_g` NULL (gramas inteiros, para a divisão proporcional ser exata), `cancelado_em` NULL. A soma dos valores alocados dos itens ativos é igual ao total da negociação (maior resto; no critério manual a soma exata é exigida).

**`custo_anterior`** (D-G) — custo anterior ao sistema, informado pelo usuário: `propriedade_id`, `destino` (`animal`, `lote`), `animal_id` ou `lote_id`, `valor_centavos`, `data_referencia`, `descricao`, `motivo`. Não gera parcela, pagamento nem lançamento.

O vínculo vive do lado financeiro. **A tabela `movimentacao_animal` não é alterada** (a coluna `lancamento_financeiro_id` citada em BANCO_DE_DADOS.md, seção 7, deixa de ser necessária e o documento será corrigido).

Acessórios (frete, comissão, imposto da operação) são lançamentos próprios com `destino_tipo` `lote` ou `animal`; compra usa categoria de tratamento `ativo_animal`, venda usa `resultado` (despesa da venda).

### 4.3 Migration 0007 — insumos, produção própria e rateio (entregas 4D, 4E, 4F)

**`lancamento_item`** — itens de uma nota de insumo: `lancamento_id`, `estoque_item_id`, `quantidade_milesimos`, `unidade_base`, `valor_centavos`, `movimentacao_estoque_id` (`UNIQUE`, NULL até a entrada ser criada ou vinculada). `movimentacao_estoque.documento_origem_id` passa a guardar o `id` deste item, com verificação no serviço (SQLite não aceita FK nova em tabela existente sem recriá-la; a 4D não recria a tabela do estoque).

**`rateio_custo`** — decisão de distribuir um custo compartilhado: `propriedade_id`, `origem_tipo` (`lancamento`, `movimentacao_estoque`), `origem_id`, `criterio` (`cabecas`, `animal_dias`, `peso`, `manual`), `periodo_inicio`, `periodo_fim`, `motivo`, `substitui_id` NULL. **`UNIQUE (origem_tipo, origem_id)` entre rateios ativos**: um custo só é distribuído uma vez. Revisar um rateio é criar a versão nova (que aponta a anterior em `substitui_id`) e cancelar a anterior, com motivo; o histórico de versões fica consultável.

**`rateio_custo_item`** — `rateio_id`, `lote_id` ou `animal_id`, `peso_relativo` (inteiro positivo). **O que se grava é o peso, não o valor**: o valor de cada destino é calculado a partir do valor atual da origem, por divisão proporcional inteira com maior resto (desempate por `id`). Assim, se o custo médio do estoque for recalculado por uma correção retroativa, o rateio acompanha e continua fechando exatamente, sem ficar "desatualizado". O snapshot dos pesos usados (cabeças, animal-dias, pesos) fica no item para auditoria.

**`centro_producao`** — produção própria: `propriedade_id`, `nome`, `tipo` (`volumoso`, `outro`), `area_id` NULL, `data_inicio`, `data_fim` NULL, `estoque_item_id` (o que será produzido), `status` (`aberto`, `encerrado`), `movimentacao_estoque_id` NULL (a entrada gerada), `custo_total_centavos` NULL (retrato no encerramento).

**`centro_producao_consumo`** — `centro_id`, `movimentacao_estoque_id` (`UNIQUE`): insumos do estoque (semente, adubo) consumidos pelo centro. Evita criar um destino novo no estoque (que exigiria recriar `movimentacao_estoque`). Um consumo ligado a centro **não pode** também estar em `rateio_custo` (serviço e gatilho).

### 4.4 Migration 0008 — somente se necessário (entregas 4G e 4H)

Resultado, indicadores, conciliação e exportação são **derivados**; não devem exigir tabela. Reservada para cache ou configuração (ex.: parâmetros de exportação) se a medição de desempenho mostrar necessidade.

### 4.5 O que é gravado e o que é derivado

| Gravado | Derivado (calculado a cada consulta) |
|---|---|
| Lançamentos, parcelas, pagamentos | Situação da parcela, saldo a pagar e a receber |
| Negociações e itens | Custo de aquisição por animal e por lote |
| Pesos do rateio e retrato da base | Valor de cada destino do rateio |
| Custo apropriado de cada consumo (já gravado na Fase 3) | Custo por animal e por lote, resultado, margens, indicadores |
| Retrato do custo ao encerrar produção | Conciliação entre as três visões |

Mantém a filosofia da Fase 3 (saldo derivado, custo apropriado persistido) e evita uma tabela de "apropriação" duplicando fatos. Medição de desempenho decide se algum agregado precisa ser materializado.

## 5. Regras de negócio

### 5.1 Dinheiro e arredondamento

- Centavos inteiros em todo o fluxo. A interface converte texto para centavos **por análise do texto**, nunca por `float × 100` (nova função pura no domínio, com testes de `0,10`, `1.234,56`, `0,005` recusado, vazio e negativo).
- Divisão proporcional (parcelas, rateios, alocação de preço): **maior resto**, desempate por `id`. A soma das partes é sempre igual ao total. Um único módulo no domínio faz isso; nenhum outro lugar divide dinheiro.
- Cálculo intermediário em `BigInt`, como no estoque.

**Estado de apuração (conhecido, desconhecido, parcial).** Todo custo exibido carrega um estado, calculado por uma função pura do domínio:

| Estado | Significado | Exibição |
|---|---|---|
| `completa` | Todos os componentes aplicáveis têm valor conhecido (inclusive zero conhecido) | Valor normal |
| `parcial` | Pelo menos um componente conhecido e pelo menos um desconhecido | "No mínimo R$ X", com a contagem e a lista do que falta |
| `desconhecida` | Nenhum componente conhecido | "Custo desconhecido"; nenhum número |
| `nao_apurada` | O componente não se aplica por falta de registro (ex.: aquisição de animal nascido, D-F) | "Não apurado" |

A soma de estados segue uma tabela fixa: qualquer parte desconhecida ou não apurada torna o total `parcial` (ou `desconhecida` se nada é conhecido). **Zero conhecido e desconhecido são valores diferentes** em todo o módulo, no banco (NULL) e na tela.

### 5.2 Lançamento, parcelas e pagamentos

- **Nada financeiro é criado sem ação do usuário.** O sistema não cria pagamento, recebimento, parcela paga, despesa, receita, saldo ou lançamento a partir de entrada de estoque, consumo, aplicação sanitária, cadastro de animal ou qualquer outro evento. Entrada de estoque e consumo continuam sendo só quantidade física e custo apropriado.
- Operação à vista tem uma parcela aberta; o pagamento só existe se o usuário o registrar (D-C).
- Valor sempre positivo; natureza vem da categoria.
- Lançamento nunca é excluído: **cancelamento lógico com motivo**, trilha e, se houver pagamentos, estorno explícito dos pagamentos primeiro.
- Data de competência não pode ser futura. Vencimento pode.
- Fluxo realizado = pagamentos por data. Fluxo previsto = saldo de parcelas abertas por vencimento, **sempre rotulado "previsto"** e nunca somado ao realizado.

### 5.3 Compra de animais

Uma transação: negociação, lançamento, parcelas, cadastro dos animais (reusa `ServicoAnimais`, origem `comprado`, entrada na data da compra, peso de entrada como primeira pesagem) e alocação do preço por animal. O **custo de aquisição** do animal é o valor alocado mais os acessórios vinculados. Fica em `ativo_animal`: não entra no resultado até a saída do animal.

### 5.4 Venda de animais

Uma transação: negociação, receita, parcelas, saída do animal (reusa `registrarSaida`, com as conferências de pesagem, movimentação e consumo de estoque da seção 10.7 do ROADMAP). Guarda peso vivo e, se informado, peso de carcaça. A unidade do preço é explícita (por cabeça, por kg vivo, por @ de peso vivo ou por @ de carcaça, D-B) e nenhuma conversão entre peso vivo e carcaça é feita sem peso de carcaça informado. O preço unitário é o informado ou derivado do total; **o total é a verdade gravada** e o preço unitário é conferido contra ele em inteiros (diferença de arredondamento de até 1 centavo é aceita, acima disso é recusada). Os três valores da operação (valor da operação, a receber e recebido) ficam sempre separados (D-C).

No resultado, o custo do animal vendido é: aquisição + custos apropriados acumulados até a data da venda. Morte e descarte sem venda levam o custo acumulado ao resultado como **perda**, na data da saída.

Cancelar uma venda cancela a receita e as parcelas e **reverte a saída pelo desfazer saída (D-H)**, tudo na mesma transação, com motivo. É recusado, com mensagem que lista o motivo, se houver recebimento não estornado (estorne primeiro) ou fato posterior incompatível.

### 5.5 Compra de insumos e entrada no estoque

- Nota de insumos = lançamento (categoria de tratamento `estoque`) + itens. Cada item cria a entrada `entrada_compra` pelo `ServicoEstoque.registrar` existente, com `custo_entrada_centavos` = valor do item e `documento_origem_id` = id do item. **Nenhuma despesa de resultado é criada.**
- Frete e despesas de entrada podem ser rateados nos itens por valor (opção escolhida na nota) e entram no custo de entrada; ficam registrados como parte do mesmo documento.
- **Vínculo retroativo** de entradas da Fase 3 sem documento: tela de pendências lista entradas `entrada_compra` sem vínculo e permite ligar a um lançamento existente ou criar um. O vínculo é 1:1.
- Entradas `entrada_producao`, `entrada_inicial` e ajustes **nunca** exigem lançamento (produção própria tem o centro de produção; saldo inicial não é compra).
- Entrada vinculada a lançamento não é corrigida pela tela de estoque nos campos de valor, quantidade, data e lote: a correção é feita no lançamento, que repassa ao estoque pela correção auditada já existente (mesmo padrão do vínculo sanitário da Fase 3). Divergência entre valor do item e custo de entrada (dado antigo) aparece como pendência, sem alteração automática.

### 5.6 Custo sanitário sem dupla contagem

O custo de um registro sanitário é a soma de **componentes**, cada um com uma única fonte:

1. **Produto consumido do estoque:** custo apropriado das baixas (Fase 3). Se alguma baixa tem custo desconhecido, o componente é "desconhecido", não zero.
2. **Serviço ou despesa avulsa** (consulta, exame): lançamento vinculado ao registro (`origem_tipo = sanitario`).
3. **Custo total informado no registro** (campo da Fase 2, `custo_total_centavos`): é uma **estimativa antiga**. Só conta se o registro **não tem** nenhum dos componentes 1 e 2. Se existir qualquer um, o valor informado fica exibido como "informado, não contado" para você decidir apagá-lo ou convertê-lo em lançamento.

O custo do registro é distribuído por igual entre os animais tratados (um evento por animal). Sem peso de dose nem critério científico.

### 5.7 Consumo de estoque como custo produtivo

Lido de `movimentacao_estoque`, nunca recalculado aqui:

| Destino do consumo | Para onde o custo vai |
|---|---|
| `animal` | Direto ao animal |
| `lote` | Ao lote; dentro do lote, distribuído aos animais presentes **naquela data** (permanências reconstruídas, igual por animal, sem usar os integrantes atuais) |
| `propriedade` | Custo compartilhado: sem rateio, fica em "não alocado"; com rateio, vai aos lotes pelos pesos; ligado a centro de produção, vai ao centro |
| `saida_perda` e `ajuste_saida` | Mesmos destinos, rotulados como perda ou ajuste |
| `saida_venda` (venda do insumo) | Custo da mercadoria vendida; a receita é um lançamento próprio |

Custo apropriado NULL (valoração incompleta) gera **custo parcial** com contagem e lista dos consumos sem custo. Nenhum total é apresentado como completo quando falta valoração.

### 5.8 Rateio de custos compartilhados

- Só custos de destino `propriedade` (lançamentos e consumos) são rateados. Custo com destino direto não é rateado.
- Critérios: `cabecas` (animais ativos por lote na data), `animal_dias` (permanências reconstruídas no período), `peso` (só com pesagem real recente em todos os animais envolvidos; senão o critério fica indisponível e a tela explica o motivo), `manual`.
- O rateio mostra a **prévia** com a base usada antes de gravar e guarda o retrato da base. Corrigir é cancelar e criar outro, com motivo.
- Custo sem rateio não é escondido: aparece como **não alocado** em todos os relatórios, e o total geral sempre inclui esse valor.

### 5.9 Produção própria de volumosos

1. Cria-se o centro (nome, área opcional, período, item de estoque que será produzido).
2. Despesas entram como lançamentos com destino ao centro, e insumos do estoque entram pelo vínculo `centro_producao_consumo`. Esses custos **saem do resultado do período** e ficam no centro.
3. Ao encerrar: `custo_total` = soma dos lançamentos ativos do centro + custo apropriado dos consumos ligados. Cria-se a entrada `entrada_producao` no estoque (serviço existente), com `documento_origem_id` = id do centro e a quantidade colhida informada por você.
4. Se algum componente tem custo desconhecido, a entrada leva custo **desconhecido** (política da Fase 3), com a lista do que falta. Você pode completar e reencerrar.
5. Daí em diante o custo do volumoso chega aos animais pelo consumo de estoque, pelo custo médio. Reabrir o centro cancela a entrada, e o recálculo retroativo do estoque propaga.

### 5.10 Custo acumulado, resultado realizado e projeção

Três coisas diferentes, em telas e rótulos diferentes, que nunca se somam:

| Conceito | O que é | Quando existe | Como aparece |
|---|---|---|---|
| **Custo acumulado** | Tudo que já foi apropriado a um animal ou lote até uma data (padrão: hoje), **antes ou depois de qualquer venda** | Sempre que há custo apropriado | Estado de apuração (5.1) e composição: aquisição ou custo anterior (D-G), alimentação, sanidade, outros diretos, rateados. O custo não alocado é mostrado à parte, nunca escondido |
| **Resultado realizado** | Receita menos o custo do que já saiu do rebanho (venda, morte, descarte) | Só para animais com saída no período | Receita, custo da baixa e resultado; morte e descarte aparecem como perda |
| **Projeção** | Cálculo aritmético com premissas **digitadas pelo usuário** (peso esperado, preço esperado por @ com base explícita, custos futuros esperados, data) | Sob demanda | Rótulo fixo "Projeção por premissas suas, não é dado apurado"; não grava lançamento, não entra em nenhum total e **não é salva na Fase 4**. Não extrapola GMD, consumo ou preços do histórico (isso é do simulador, Fase 9) |

Projeção = receita esperada − (custo acumulado + custos futuros esperados informados). Se o custo acumulado é `parcial`, a projeção também é, com o mesmo aviso.

### 5.10.1 Resultado e indicadores

Definições aritméticas, sem parâmetro científico:

- **Receita:** vendas de animais, leite e outras receitas de tratamento `resultado`.
- **Custo apropriado:** aquisição (ou custo anterior) dos animais vendidos ou baixados + consumos de estoque + custos sanitários (5.6) + despesas diretas e rateadas de tratamento `resultado`.
- **Margem líquida:** receita menos **todos** os custos apropriados, incluindo "não alocado". Não depende de classificação.
- **Margem bruta:** receita menos custos classificados como variáveis. **Depende da classificação (D-E)**: valor não classificado não entra em silêncio; o indicador mostra a cobertura e vem marcado como parcial enquanto houver custo sem classificação.
- **Custo por kg de peso vivo ganho:** custo apropriado no período ÷ soma do ganho de peso real (pesagens reais entre os extremos do período, por animal). Sem as duas pesagens, o animal fica fora e a tela mostra quantos ficaram.
- **Custo por @ de carcaça vendida:** só para vendas com peso de carcaça informado; usa 15 kg/@ (D-B). Nunca calculado a partir de peso vivo.
- **Ponto de equilíbrio:** custos fixos ÷ (preço médio de venda por unidade − custo variável por unidade), com a unidade e a base explícitas. Depende da classificação (D-E), com a mesma regra de cobertura; sem classificação nada é calculado.
- **Preço médio por litro vendido** (leite): receita ÷ litros informados.

Todo indicador mostra o **denominador e o que ficou de fora**. Resultado por período é exibido nos regimes de caixa e de competência lado a lado, nunca misturados.

### 5.11 Edição, cancelamento e trilha

- Tudo grava em `historico_alteracao` na mesma transação.
- Lançamento com origem (`compra_estoque`, `negociacao_animal`, `producao`, `sanitario`) é alterado **pela origem**, não direto.
- Mudança retroativa de data que invalide fatos já registrados é recusada com mensagem e orientação, no padrão do ROADMAP 10.7 (data de pagamento antes de venda, data de compra depois de pesagem etc.).

### 5.12 Correções retroativas, cancelamentos e devoluções

Princípio: **nenhum registro é apagado ou reescrito em silêncio; o que depende de outro se ajusta porque é derivado, e o que é gravado muda só por operação explícita, com motivo e trilha.**

| Situação | Comportamento |
|---|---|
| Correção retroativa de entrada ou consumo no estoque | O estoque recalcula o custo apropriado (Fase 3). Custos por animal, lote, rateios (guardam pesos), resultado e custo acumulado são derivados e acompanham. Nenhum lançamento é criado ou alterado |
| Correção do valor de um lançamento ligado a entrada de estoque | Feita no lançamento; repassa ao estoque pela correção auditada; se o estoque recusar (saldo negativo), nada muda |
| Cancelamento de lançamento | Lógico, com motivo. Recusado se houver pagamento ativo (estornar antes), vínculo com entrada de estoque com saldo consumido que ficaria negativo, ou centro de produção encerrado |
| Estorno de pagamento | Cancelamento lógico do pagamento, com motivo; a parcela volta a ficar aberta ou parcial. O caixa do dia original muda porque é derivado, e a trilha guarda a data e o motivo |
| Mudança retroativa de pesagem usada em rateio por peso | O rateio continua com os pesos gravados; a tela avisa "a base mudou desde o rateio" e oferece revisar. Nada muda sozinho |
| Rateio revisado | Versão nova com `substitui_id`; a anterior fica cancelada e consultável |
| **Devolução de insumo ao fornecedor** | Documento de devolução (lançamento `tipo = devolucao` apontando o original) mais saída `ajuste_saida` no estoque ao custo médio vigente, com motivo. O reembolso é um recebimento ou um abatimento de parcela aberta, **registrado pelo usuário**. A diferença entre o custo médio retirado e o valor devolvido aparece na conciliação como "diferença a classificar"; o sistema não a lança sozinho |
| **Devolução de animal comprado ou vendido** | Negociação vinculada (`negociacao_origem_id`) que reverte o item: venda devolvida usa o desfazer saída (D-H) apenas do item; compra devolvida é uma saída vinculada ao mesmo fornecedor. O desenho detalhado será apresentado no início da 4C para aprovação. **Implementado em 2026-10-21 com o desenho aprovado pelo usuário em 2026-10-18 (ROADMAP, seção 21): devolução como tabela própria (não `negociacao_origem_id`), retorno na data da devolução em vez do desfazer saída, compensação sem caixa do que estava em aberto.** |
| Cancelamento de venda | Pelo desfazer saída (5.4) |
| Desfazer saída | D-H. Custos e resultado derivados se ajustam |

O auditor de consistência (9.3) verifica depois de cada operação que nenhuma dessas rotas deixou valor duplicado, órfão ou criado sem ação do usuário.

## 6. Integração entre módulos

| Módulo | O que muda | Risco tratado |
|---|---|---|
| Rebanho | Compra cria animais; venda dá saída; novo "desfazer saída"; exclusão de animal e lote consideram vínculos financeiros | Animal sem negociação e negociação sem animal |
| Pesagem | Peso de compra e de venda entram como pesagens reais quando informados com método | Peso do documento diferente do da balança fica como dois dados distintos |
| Sanidade | Precedência de custo (5.6); lançamento vinculado ao registro | Custo sanitário contado duas vezes |
| Estoque | Nota de insumo gera entrada vinculada; correção de entrada vinculada passa pelo lançamento; consumo com centro de produção | Despesa na compra e de novo no consumo |
| Nutrição (Fases 5, 6, 8) | Nada agora. Exposição estável do custo médio por unidade física | Acoplamento antecipado |
| Leite (Fase 7) | Receita de leite lançada agora; ordenha e custo por litro depois | Duplicar volume vendido quando existir `venda_leite` (a futura tabela referenciará o lançamento, como `negociacao_animal`) |

Onde um serviço precisa de outro, a dependência entra por interface injetada no construtor, como `ServicoSanidade` recebe `ServicoEstoque`. O domínio e a lógica de alocação ficam em `packages/domain`, sem Electron, React ou SQLite.

## 7. Interface

Módulo "Financeiro" no menu, textos em `textos-financeiro.ts`, gráficos nos componentes `--grafico-*` já validados.

| Tela | Conteúdo |
|---|---|
| **Painel** | Caixa realizado do período, a pagar e a receber (previstos), resultado do período, pendências (entradas sem documento, consumos sem custo, custos não alocados, rateios a fazer) |
| **Lançamentos** | Lista com filtros (período, categoria, atividade, lote, situação), novo lançamento, parcelas e pagamentos |
| **Contas a pagar e receber** | Parcelas abertas por vencimento, atrasadas em destaque, registrar pagamento |
| **Animais: compras e vendas** | Assistente em passos: contraparte, animais, valores e critério, parcelas, conferência |
| **Compra de insumos** | Nota com itens, rateio de frete, prévia da entrada no estoque e do novo custo médio |
| **Custo acumulado** | Por animal e por lote, até uma data, antes de qualquer venda, com estado de apuração e composição; separado de resultado realizado e de projeção |
| **Custos** | Por lote, animal, atividade e período, com "De onde veio este número?" listando cada origem (consumo, aquisição, sanitário, rateio) |
| **Classificações** | Fixo ou variável por categoria, por item de estoque e por tipo de origem; ação em lote com prévia; lista do que está sem classificação |
| **Projeção** | Premissas digitadas, cálculo e rótulo fixo; nada é gravado |
| **Rateios** | Custos compartilhados pendentes, prévia da base, gravar e corrigir |
| **Produção própria** | Centros, custos acumulados, encerrar e gerar entrada |
| **Resultado** | Por lote, animal e período; caixa e competência lado a lado |
| **Conciliação** | Explica a diferença entre caixa, custos apropriados e resultado |
| **Categorias e contrapartes** | Cadastros |

Princípios de tela: rótulo da visão sempre visível (caixa, apropriado, resultado); dado ausente aparece como "não informado" ou "custo desconhecido", nunca como 0,00; nenhuma ação automática altera registros antigos; aviso fixo de que o sistema não substitui contabilidade, nem calcula imposto.

## 8. Entregas incrementais

Cada entrega tem testes próprios, passa em `verify` e termina com relatório. Proponho **checkpoints de aprovação após 4A, 4C, 4E e 4G**.

| Entrega | Conteúdo | Migration | Requisitos |
|---|---|---|---|
| **4A** | Domínio de dinheiro (parse, divisão proporcional, estado de apuração); categorias com classificação padrão, contrapartes, lançamentos manuais com classificação própria, parcelas (à vista e parceladas), pagamentos parciais e estorno; trilha (D-I); gerador determinístico de testes (D-K); tela de lançamentos | 0005 | RF-02.2 |
| **4B** | Fluxo de caixa realizado e previsto; contas a pagar e receber; classificações; painel inicial | — | RF-02.6 |
| **4C** | Compra e venda de animais (à vista ou parcelada); custo de aquisição; custo anterior ao sistema (D-G); desfazer saída (D-H); cancelamento e devolução de animais; vínculo com rebanho | 0006 | RF-02.1, 02.3 |
| **4D** | Compra de insumos ligada ao estoque; vínculo retroativo; pendências; consumo como custo; precedência sanitária | 0007 (parte) | RF-02.2, RF-03.11 |
| **4E** | Rateios; custo por lote e por animal; "De onde veio este número?" | 0007 (parte) | RF-02.4 |
| **4F** | Produção própria de volumosos | 0007 (parte) | ROADMAP Fase 4 |
| **4G** | Custo acumulado, resultado realizado, projeção por premissas, margens, indicadores com cobertura de classificação, conciliação, painel completo | possível 0008 | RF-02.5 |
| **4H** | Exportação CSV e PDF; regressão geral; backup e restauração; inspeção visual; documentação | — | RF-02.7 |

A 0007 é gravada de uma vez só quando a 4D for implementada, com as tabelas das três entregas, para não migrar três vezes; se preferir uma migration por entrega, o custo é só mais arquivos.

## 9. Estratégia de testes

### 9.1 Domínio (puro, Vitest)

- Parse e formatação de centavos; recusa de `float`, de três casas e de texto ambíguo.
- Divisão proporcional por maior resto: soma exata, desempate determinístico, pesos zero recusados, valor 1 centavo entre 3 destinos, valores grandes (limite seguro de inteiro).
- Parcelas: soma, resíduo na última, datas.
- Alocação de preço de compra (igual, peso, manual).
- Custo de aquisição, custo da baixa por venda e por morte.
- Cada indicador com denominador e exclusões, incluindo divisão por zero e dado ausente.
- Estado de apuração: tabela de soma (completa, parcial, desconhecida, não apurada), zero conhecido diferente de desconhecido.
- Testes de propriedade e sequências de operações com gerador determinístico, nos limites de abrangência da D-K (3.2).

### 9.2 Integração (banco temporário, IPC real)

- Cada migration do zero e a partir da versão anterior com dados das fases 1 a 3.
- Cada canal rejeita payload inválido.
- Transações tudo ou nada: falha no meio da compra de animais, da nota de insumos e do encerramento de produção não deixa rastro.
- Isolamento entre propriedades.
- Cancelamentos e estornos em todas as camadas; mudança retroativa de data recusada com orientação.

### 9.3 Testes de conservação (o núcleo contra contagem dupla)

Cenários com valores calculados à mão no próprio teste:

1. **Insumo:** compra de 1.000 kg por R$ 1.000,00; consumo de 400 kg. Caixa: saída de 1.000,00. Custo apropriado: 400,00. Estoque remanescente: 600,00. Resultado do período: só 400,00. Nenhum lançamento de despesa é gerado por entrada ou consumo.
2. **Correção retroativa:** alterar a entrada recalcula o custo do consumo; o rateio acompanha e continua fechando.
3. **Sanidade:** registro com baixa de estoque e custo informado conta só a baixa; adicionar lançamento de serviço soma sem repetir; custo informado sozinho conta; custo desconhecido não vira zero.
4. **Animal:** compra de 10 animais, frete rateado, venda de 4, morte de 1. Soma do custo dos vendidos + perdido + remanescente = aquisição total + acessórios.
5. **Produção própria:** custos do centro saem do resultado, entram no custo de entrada e chegam ao consumo uma única vez.
6. **Invariantes gerais:** para qualquer período, Σ custo por animal + Σ por lote sem animal + Σ não alocado = Σ custos de origem. Σ rateio = origem. Σ parcelas = total. Σ pagamentos ≤ parcela. Nenhuma origem aparece em dois lugares.
7. **Auditor de consistência:** consulta que procura vínculos duplicados, entradas vinculadas a documento inexistente, consumos em rateio e em centro ao mesmo tempo. Roda nos testes e alimenta a tela de pendências.
8. **Nada fictício:** em cada cenário, a contagem de lançamentos, parcelas, pagamentos e movimentos de estoque antes e depois mostra que **só as operações do usuário** criaram registros; entrada, consumo, aplicação sanitária, cadastro e compra de animal não criam pagamento nem lançamento por conta própria. Nenhuma coluna monetária recebe 0 no lugar de desconhecido.
9. **À vista e parcelado:** valor da operação = soma das parcelas; a pagar = parcelas − pagamentos; pago = pagamentos; os três nunca se misturam, inclusive com pagamento parcial e estorno.
10. **Custo acumulado antes da venda:** com o animal ativo, o custo acumulado muda a cada consumo, aplicação e rateio e fecha com as origens; vender fixa o custo da baixa; desfazer a saída o devolve ao acumulado, sem nenhum lançamento alterado à mão.
11. **Classificação:** indicador que depende de classificação mostra a cobertura exata; mudar o padrão da categoria não altera lançamentos antigos; a ação em lote altera só os não classificados e é auditada.
12. **Devoluções e cancelamentos:** cada rota da tabela 5.12 deixa as invariantes intactas; a diferença de devolução aparece como pendência e não vira lançamento.

### 9.4 Interface e ponta a ponta

- Componentes: formulários monetários, assistente de compra, prévias, rótulos de visão, ausência mostrada como "não informado".
- E2E no Electron: comprar animais → nota de ração → consumo por lote → sanidade com baixa → vender → resultado e conciliação → fechar, reabrir e restaurar backup. Largura de 900 px medida.
- Checagem de mutação nas regras centrais (divisão proporcional, precedência sanitária, vínculo 1:1), como nas fases anteriores.

### 9.5 Desempenho e dados

Meta RNF-03: 300 ms com 5.000 animais e 100.000 movimentos. Medir custos por lote e resultado com 100 mil movimentos de estoque, 20 mil lançamentos e 5.000 animais, em banco sintético temporário. Se estourar, materializar só o agregado que estourou (uma migration 0008).

## 10. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Dupla contagem entre compra, entrada e consumo | Tratamento por categoria, vínculo 1:1, testes de conservação, auditor |
| Dupla contagem do custo sanitário legado | Precedência por componente (5.6) e exibição do valor "não contado" |
| Custo desconhecido virar zero | Mesma política da Fase 3, com contagem e lista do que falta em cada relatório |
| Rateio desatualizar após correção do estoque | Grava-se o peso, não o valor |
| Confundir caixa com resultado | Telas, rótulos e conciliação separados |
| Cancelamento de venda sem poder reabrir animal | Entrega 4C inclui "desfazer saída" com conferências |
| Entradas antigas sem documento | Tela de pendências e vínculo retroativo opcional |
| Indicador "limpo" escondendo custo sem classificação | Cobertura obrigatória e marca "parcial" (D-E) |
| Projeção confundida com dado apurado | Rótulo fixo, nada gravado, fora dos totais (5.10) |
| Perder a barreira de lista da trilha ao recriar a tabela | Tipo TypeScript fechado, repositório único e teste de varredura (D-I) |
| Fase grande demais | Oito entregas pequenas e quatro checkpoints |
| Contabilidade e impostos confundidos com gestão | Aviso fixo, nenhum cálculo tributário, sem dado legal inventado |
| Regra 1 (dados científicos) | A Fase 4 não usa nenhum. As únicas constantes são 15 kg/@ (D-B) e as classificações que você define |

## 11. Requisitos adicionais confirmados em 2026-10-16

| # | Requisito | Situação no plano | Onde |
|---|---|---|---|
| 1 | Compras e vendas à vista ou parceladas; valor da operação, contas a pagar e receber e pagamentos efetivos separados | **Contemplado, com ajuste incorporado**: `condicao_pagamento`, três números sempre separados, pagamento nunca criado sozinho | D-C (3.3), 4.1, 5.2, 5.4, teste 9 |
| 2 | Custo acumulado de animais e lotes antes da venda, distinto de resultado realizado e de projeções | **Ajustado**: a seção de resultado só tratava de períodos; entram custo acumulado, resultado realizado e projeção por premissas do usuário, três conceitos separados | 5.10, tela "Custo acumulado", teste 10 |
| 3 | Não duplicar custo de alimentos, medicamentos e suplementos entre compra, estoque, consumo e financeiro | **Contemplado** | Seção 1 ("um fato, um dono"), 5.5, 5.6, 5.7, testes 1, 3 e 7 |
| 4 | Rateio com critérios explícitos, auditáveis e revisáveis | **Contemplado, com ajuste**: versões de rateio (`substitui_id`) e histórico consultável | 4.3, 5.8, 5.12 |
| 5 | Custos conhecidos, desconhecidos e parcialmente apurados | **Ajustado**: estado de apuração formal (completa, parcial, desconhecida, não apurada), zero conhecido diferente de desconhecido | 5.1, D-F, testes de domínio |
| 6 | Consistência com correções retroativas, cancelamentos e devoluções | **Ajustado**: nova seção com cada rota e seu comportamento; devolução de insumo, de animal e estorno de pagamento. O desenho detalhado da devolução de animais fica para o início da 4C | 5.12, testes 2 e 12 |
| 7 | Lançamento com categoria, propriedade, competência, situação financeira e vínculos com animais, lotes e documentos de origem | **Contemplado, com ajuste**: situação financeira derivada explícita; destino único por lançamento, vários destinos por negociação, nota ou rateio; origem e número do documento | 4.1 |
| 8 | Nada de saldos, pagamentos, despesas ou receitas fictícios | **Ajustado**: regra explícita e teste de "nada fictício"; custo anterior ao sistema deixou de ser lançamento (D-G); animal nascido tem custo "não apurado", nunca zero | 5.2, D-F, D-G, teste 8 |

## 12. Critérios de pronto da Fase 4

- Todas as entregas aprovadas e testadas; `verify` aprovado sem teste desativado.
- Testes de conservação passando; auditor de consistência sem pendência no banco sintético de referência.
- Migrations do zero e da versão anterior; backup e restauração com dados financeiros.
- Documentação (REQUISITOS, ARQUITETURA, BANCO_DE_DADOS, ROADMAP, CLAUDE) atualizada e relatório de entrega com testes executados, pendentes e limitações.
- Nenhuma tabela ou código das Fases 5 a 10.
