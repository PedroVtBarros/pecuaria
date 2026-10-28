# INVENTARIO_BR_CORTE.md — Entrega 6.0

> Inventário científico do escopo aprovado (C2 e C3): **bovinos em crescimento e terminação**, **CMS, energia, proteína e macrominerais (Ca, P, Mg, Na, K, S)**. Fonte única: BR-CORTE 2023, 4ª edição (decisão C1). Nada aqui está implementado. Aguarda aprovação do usuário.

## 1. Fonte e método

- **Obra:** Valadares Filho et al. (eds.), *Exigências Nutricionais de Zebuínos Puros e Cruzados – BR-CORTE*, 4ª edição, 2023; DOI dos capítulos `10.26626/978-85-8179-192-0.2023.C0nn`. Arquivo `referencias/BR-CORTE.pdf` (fora do git), SHA-256 `028b86e079fc23d0b53dd15fe09e72128410c5aa742a15c8151c5ed17a5873f7`.
- **Páginas:** sempre a página impressa do livro ("p."). O PDF tem os capítulos fora de ordem; a correspondência está no PLANO_FASE_6.md, seção 2.
- **Conferência:** cada equação e coeficiente abaixo foi lido na **imagem da página renderizada** (pdf.js), não no texto extraído, que perde expoentes e sinais. As equações do quadro-resumo foram conferidas também contra o exemplo numérico do próprio livro (seção 5). Páginas conferidas por imagem: 5–11, 25, 37, 38, 179–182, 190, 192, 198, 199, 218, 226, 227, 244, 246, 264, 432–435, 441.
- **Notação:** igual à do livro. `^` é potência; vírgula decimal como no livro.

## 2. Variáveis e unidades

| Símbolo | Significado | Unidade |
|---|---|---|
| PC | peso corporal | kg |
| PCJ | peso corporal em jejum | kg |
| PCVZ | peso de corpo vazio | kg |
| PCVZmat | PCVZ à maturidade (Tabela 8.5) | kg |
| PCVZeq | PCVZ equivalente | kg |
| GMD | ganho médio diário | kg/dia |
| GPCVZ | ganho de peso de corpo vazio | kg/dia |
| ELm, ELg (= ER) | energia líquida de mantença e de ganho (energia retida) | Mcal/dia |
| ERprot | proporção da energia retida como proteína (adimensional, pela equação) | — |
| km, kg | eficiências de uso da EM para mantença e para ganho | fração |
| EMm, EMg, EMtotal | energia metabolizável de mantença, ganho e total | Mcal/dia |
| ED | energia digestível | Mcal/dia |
| NDT | nutrientes digestíveis totais | kg/dia (e % da CMS) |
| CMS | consumo de matéria seca | kg/dia |
| NC | teor de concentrado na dieta | % da MS total (p. 31) |
| CMSs | consumo de suplemento | kg/dia (p. 35) |
| PMm, PMg, PMt | proteína metabolizável de mantença, ganho e total | g/dia |
| PLg | proteína líquida para ganho | g/dia |
| k | eficiência de uso da PM para ganho | % |
| PBmic | proteína bruta microbiana | g/dia |
| CPB, CNDT | consumo de PB e de NDT | kg/dia |
| PDR, PNDR, PB | proteína degradável, não degradável no rúmen, e bruta | g/dia |
| ExLiG | exigência líquida de mineral para ganho | g/dia |

## 3. Equações

Categorias: **Z** = zebuíno, **CC** = cruzado de corte, **CL** = cruzado de leite; **MNC** = macho não castrado, **MC** = macho castrado, **F** = fêmea; **Conf.** = confinamento, **Pasto** = pastejo.

### 3.1 Peso (Tabelas 8.9 e 8.10, p. 198–199; Tabela 9.13, p. 226; Tabela 8.5, p. 190)

| Id | Equação | Aplica-se a | Saída |
|---|---|---|---|
| P-01 | PCJ = 0,8915 × PC^1,0151 (Eq. 1.3) | Z e CC (Conf.); todos a pasto | kg |
| P-02 | PCJ = 0,9247 × PC^1,0085 (Eq. 1.4) | CL (Conf.) | kg |
| P-03 | PCVZ = 0,8126 × PCJ^1,0134 | Z, MNC, Conf. | kg |
| P-04 | PCVZ = 0,7248 × PCJ^1,0314 | CC e CL, MNC, Conf. | kg |
| P-05 | PCVZ = 0,6241 × PCJ^1,0608 | Z, MC, Conf. | kg |
| P-06 | PCVZ = 0,6586 × PCJ^1,0499 | CC e CL, MC, Conf. | kg |
| P-07 | PCVZ = 0,6110 × PCJ^1,0667 | Z, F, Conf. | kg |
| P-08 | PCVZ = 0,6314 × PCJ^1,0602 | CC e CL, F, Conf. | kg |
| P-09 | PCVZ = 0,8507 × PCJ^1,0002 (Eq. 1.5) | Pasto | kg |
| P-10 | GPCVZ = 0,9630 × GMD^1,0151 (Eq. 1.12, p. 10; Eq. 8.24, p. 192) | todos | kg/dia |
| P-11 | PCVZeq = (PCVZ / PCVZmat) × 517 | todos | kg |
| P-12 | PCVZmat (Tabela 8.5, p. 190): Z MNC 517, MC 433, F 402; CC MNC 560, MC 482, F 417; CL MNC 616, MC 532, F 493 | tabela | kg |

"Cruzados" na P-04, P-06 e P-08 vale para corte e leite (Tabela 9.13, p. 226: "Cruzados de corte e Leite").

### 3.2 Energia (Tabela 8.9 pasto, p. 198; Tabela 8.10 confinamento, p. 199)

| Id | Equação | Aplica-se a | Saída |
|---|---|---|---|
| E-01 | ELm = 0,075 × PCVZ^0,75 | todos | Mcal/dia |
| E-02 | ELg = 0,061 × PCVZeq^0,75 × GPCVZ^1,035 | Conf. | Mcal/dia |
| E-03 | ELg = 0,052 × PCVZeq^0,75 × GPCVZ^1,062 | Pasto | Mcal/dia |
| E-04 | ERprot = 1,140 × (ER / GPCVZ)^-1,137 | todos | — |
| E-05 | kg = 0,327 / (0,539 + ERprot) | todos | fração |
| E-06 | km = [0,513 + (0,173 × kg) + (0,100 × GPCVZ)] × 1 | Z, Conf. | fração |
| E-07 | km = [0,513 + (0,173 × kg) + (0,073 × GPCVZ)] × 1 | CC, Conf. | fração |
| E-08 | km = [0,513 + (0,173 × kg) + (0,010 × GPCVZ)] × 1 | CL, Conf. | fração |
| E-09 | km = [(0,513 + 0,173 × kg + 0,100 × GPCVZ) × 0,92] | Pasto | fração |
| E-10 | EMm = ELm / km | todos | Mcal/dia |
| E-11 | EMg = ELg / kg | todos | Mcal/dia |
| E-12 | EMtotal = EMm + EMg | todos | Mcal/dia |
| E-13 | ED = {[(EMtotal / CMS) + 0,3032] / 0,9455} × CMS | todos | Mcal/dia |
| E-14 | NDT = ED / 4,4 | todos | kg/dia |
| E-15 | NDT (%) = NDT × 100 / CMS (p. 433) | todos | % da MS |
| E-16 | GPCVZ = 14,914 × ELg^0,9662 × PCVZeq^-0,7246, com ELg = "energia líquida disponível para ganho" (Eq. 8.22, p. 192) | sem restrição declarada | kg/dia |

### 3.3 Consumo de matéria seca (p. 25 e "Considerações finais", p. 38)

| Id | Equação | Aplica-se a |
|---|---|---|
| C-01 | CMS = –2,1948 + 0,08338 × PC^0,75 + 3,9328 × GMD – 0,9030 × GMD² (Eq. 2.1) | Z, Conf. |
| C-02 | CMS = –0,6273 + 0,06453 × PC^0,75 + 3,871 × GMD – 0,614 × GMD² (Eq. 2.2) | CC, Conf. |
| C-03 | CMS = –2,8836 + 0,08435 × PC^0,75 + 4,5145 × GMD – 0,9631 × GMD² (Eq. 2.3) | CL, Conf. |
| C-04 | CMS = –1,303 + 0,0029 × NC – 0,00005 × NC² + 0,0843 × PC^0,75 + 2,243 × GMD – 0,271 × GMD² (Eq. 2.4) | Z, Conf., com NC conhecido |
| C-05 | CMS = –4,8196 + 0,0081 × NC – 0,00011 × NC² + 0,1239 × PC^0,75 + 2,8189 × GMD – 0,775 × GMD² (Eq. 2.5) | CC, Conf., com NC conhecido |
| C-06 | CMS = –0,4684 + 0,7732 × CMSs + 0,0742 × PC^0,75 + 0,7953 × GMD – 0,9047 × GMD² (Eq. 2.6) | Z, Pasto |
| C-07 | CMS = 0,9951 + 0,7732 × CMSs + 0,0742 × PC^0,75 + 0,7953 × GMD – 0,9047 × GMD² (Eq. 2.7) | CL, Pasto |

Todas em kg/dia, com PC em kg e GMD em kg/dia.

### 3.4 Proteína (Tabela 9.14, p. 227)

| Id | Equação | Aplica-se a | Saída |
|---|---|---|---|
| R-01 | PMm = 3,6 × PCJ^0,75 | Conf. | g/dia |
| R-02 | PMm = 3,9 × PCJ^0,75 | Pasto | g/dia |
| R-03 | PLg = 176,01 × GPCVZ – 0,381 × PCVZeq^0,75 × GPCVZ^1,035 | todos | g/dia |
| R-04 | k = 84,665 – 0,1179 × PCVZeq, se PCJ < 340 kg; k = 47,4, se PCJ ≥ 340 kg (p. 218; P-02) | todos | % |
| R-05 | PMg = PLg / k | todos | g/dia |
| R-06 | PMt = PMm + PMg | todos | g/dia |
| R-07 | PBmic = –53,07 + 304,9 × CPB + 90,8 × CNDT – 3,13 × CNDT² | todos | g/dia |
| R-08 | PDR = PBmic | todos | g/dia |
| R-09 | PNDR = (PMt – (PBmic × 0,64)) / 0,80 | todos | g/dia |
| R-10 | PB = PDR + PNDR, resolvida em forma fechada: PB = (0,2 × a + 1,25 × PMt) / 0,93902 (seção 10) | todos | g/dia |

### 3.5 Macrominerais (Tabela 10.14, p. 264; plateau, Tabela 10.8 e texto, p. 246)

Exigência líquida de mantença = coeficiente × PC (mg/kg de PC); exigência líquida de ganho (ExLiG, g/dia) pela equação; **exigência dietética = (mantença + ganho) / coeficiente de retenção** (p. 264, exemplo). Acima do PCVZ do *plateau*, ExLiG = 0 (p. 246: "o mineral contido no corpo passou a ser constante e as ExLiGCa foram consideradas iguais a zero").

| Id | Mineral | Mantença (mg/kg PC) | Retenção (%) | ExLiG (g/dia) | Plateau de PCVZ (kg) |
|---|---|---|---|---|---|
| M-Ca | Ca | 11,7 | 56,8 | Z: GPCVZ × (147 × PCVZ^-0,50); Cruzado: GPCVZ × (66,0 × PCVZ^-0,32) | Z 462; Cruzado 453 |
| M-P | P | 13,5 | 67,8 | Z: GPCVZ × (38,6 × PCVZ^-0,36); Cruzado: GPCVZ × (25,4 × PCVZ^-0,25) | Z 445; Cruzado 479 |
| M-Mg | Mg | 5,9 | 35,5 | Z: GPCVZ × (0,3466 × PCVZ^0,0113); Cruzado: GPCVZ × (1,0597 × PCVZ^-0,2386) | — |
| M-Na | Na | 6,3 | 37,1 | Z: GPCVZ × (5,594 × PCVZ^-0,2998); Cruzado: GPCVZ × (1,977 × PCVZ^-0,058) | — |
| M-K | K | 23,5 | 48,4 | Z: GPCVZ × (0,9463 × PCVZ^0,1216); Cruzado: GPCVZ × (0,3418 × PCVZ^0,3200) | — |
| M-S | S | 10,4 | 77,3 | GPCVZ × (0,03 × PCVZ^0,8900) | — |

## 4. Dependências

```
PC → PCJ (P-01/02) → PCVZ (P-03..09) → PCVZeq (P-11, PCVZmat P-12)
GMD → GPCVZ (P-10)
PCVZ → ELm (E-01) ─────────────────────────────┐
PCVZeq, GPCVZ → ELg (E-02/03) → ERprot (E-04) → kg (E-05) → km (E-06..09) → EMm (E-10)
ELg, kg → EMg (E-11) → EMtotal (E-12) → ED (E-13, exige CMS) → NDT (E-14, E-15)
PC, GMD [, NC | CMSs] → CMS (C-01..07)
PCJ → PMm (R-01/02); GPCVZ, PCVZeq → PLg (R-03); PCJ, PCVZeq → k (R-04) → PMg → PMt
PMt, NDT (como CNDT), PB (como CPB) → PBmic (R-07) → PDR, PNDR → PB   [circular: ver A-06]
PC → mantença mineral; GPCVZ, PCVZ → ExLiG (com plateau) → dietética (÷ retenção)
```

## 5. Casos de verificação do próprio livro

| Caso | Animal | O que verifica | Valores publicados (p.) |
|---|---|---|---|
| T-01 | Z MNC, Conf., PC 520 kg, GMD 1,6 kg/dia | Cadeia de energia | PCJ 509,5; PCVZ 450,1; GPCVZ 1,55; ELg 9,40; ERprot 0,147; kg 0,48; EMg 19,6; ELm 7,33; km 0,75; EMm 9,77 (p. 199) |
| T-02 | o mesmo | Proteína | PMm 386,1; PLg 214,2; k 47,4; PMg 451,9; PMt 838; PBmic 838,5 com CPB 1,215 e CNDT 7,88; PNDR 376,7; PB 1215 g/dia (p. 227) |
| T-03 | Z MNC, PC 400 kg, GMD 1,0 kg/dia | Ca e P | PCJ 390,4; PCVZ 344; GPCVZ 0,963; Ca: 4,68 + 7,63 = 12,31 → 21,67 g/dia; P: 5,40 + 4,54 = 9,94 → 14,66 g/dia (p. 264) |
| T-04 | Z MNC, Conf., PC 520 kg, GMD 1,4 kg/dia | Cadeia completa | CMS 10,62; GPCVZ 1,355; PCVZ 450,1; ELg 8,16; ERprot 0,148; kg 0,476; EMg 17,15; ELm 7,33; km 0,73; EMm 10,03; EMtotal 27,18; ED 32,15; NDT 7,31 kg e 68,8 %; PMm 386,1; PLg 187,5; PMg 395,6; PMt 781,7; PBmic 789,3; PNDR 345,6; PB 1135 g/dia; Ca 27,24; P 10,35 (ganho 0, acima do plateau); Mg 10,06; Na 12,10; K 30,82; S 19,08 g/dia (p. 432–434) |
| T-05 | ELg disponível 5,12 Mcal/dia, PCVZeq 300 kg | E-16 | GPCVZ ≈ 1,16 kg/dia (p. 192) |
| T-06 | Tabelas 17.3a a 17.12a (e "b" para minerais) | CMS, EM, NDT, PDR, PNDR, PB por PC e GMD | ex.: Z MNC Conf., PC 510, GMD 1,3: CMS 10,3 kg; EM 25,7 Mcal; NDT 6,9 kg e 67,1 %; PDR 758; PNDR 330; PB 1088 g (p. 441). Só as linhas dentro do domínio (seção 6) |

**Tolerância (decisão C8, ajustada pelo usuário):** por resultado publicado, meia unidade do último algarismo impresso daquele valor; cálculo intermediário com precisão completa, sem arredondar entre etapas. Onde o livro arredonda uma etapa e usa o valor arredondado na seguinte (ex.: kg 0,48 em T-01), o teste confere cada etapa contra o valor impresso e a cadeia completa com a tolerância do resultado final; divergência maior vira pendência, não ajuste de coeficiente.

## 6. Domínio validado (decisão C10: fora dele, resultado não tem uso operacional)

Estatística descritiva dos bancos de dados, conferida na imagem. Mínimo e máximo de PCJ (inicial e final) e de GMD.

| Categoria | PCJ (kg) | GMD (kg/dia) | Fonte |
|---|---|---|---|
| Z MNC, Conf. | 110–592 | –0,14 a 2,65 | Tabela 8.1, p. 179 |
| Z MC, Conf. | 164–520 | –0,22 a 1,53 | Tabela 8.1 |
| Z F, Conf. | 121–437 | –0,12 a 1,27 | Tabela 8.1 |
| CC MNC, Conf. | 198–589 | –0,07 a 2,11 | Tabela 8.2, p. 180 |
| CC MC, Conf. | 189–581 | –0,36 a 2,35 | Tabela 8.2 |
| CC F, Conf. | 187–494 | –0,31 a 1,75 | Tabela 8.2 |
| CL MNC, Conf. | 191–661 | 0,45 a 2,64 | Tabela 8.3, p. 181 |
| CL MC, Conf. | 104–575 | 0,15 a 2,05 | Tabela 8.3 |
| CL F, Conf. | 150–399 | 0,29 a 1,37 | Tabela 8.3 |
| Z MNC, Pasto | 138–661 | –0,54 a 1,13 | Tabela 8.4, p. 182 |
| Z MC, Pasto | 104–581 | –0,15 a 0,95 | Tabela 8.4 |

CMS (Tabela 2.1, p. 25), por grupo: Z PC 110–652 kg, GMD –0,36 a 2,00; CC PC 215–607, GMD –0,19 a 2,37; CL PC 139–661, GMD –0,13 a 2,64. As tabelas de proteína (9.2 a 9.5, p. 208–211) e de minerais (10.3 a 10.6, p. 240–243) têm faixas próprias, a conferir por imagem na entrega de cada grupo, antes de ativar a equação.

## 7. Achados e ambiguidades (não corrigidos; para decisão)

| # | Achado | Onde |
|---|---|---|
| A-01 | GMD ≤ 0 está nos dados, mas as potências de GPCVZ (expoentes não inteiros) não são definidas para ganho negativo; ganho zero anula ELg e torna ERprot indefinido | E-02 a E-05, R-03 |
| A-02 | Condição de k sobre PCJ ("< 340 kg", "> 340 kg"), mas a fórmula usa PCVZeq; PCJ = 340 kg não está em nenhuma faixa | R-04, p. 227 |
| A-03 | Pasto: sem equação de CMS para cruzado de corte; dados de energia a pasto só de zebuínos machos (sem fêmeas, sem cruzados) | p. 38; Tabela 8.4 |
| A-04 | Minerais "Zebuíno/Cruzado", sem separar cruzado de corte e de leite nem classe sexual | Tabela 10.14 |
| A-05 | Tabelas do cap. 17 vão além do domínio (ex.: Z MNC Conf. até PC 630 kg; PCJ máximo dos dados 592 kg) | p. 441 |
| A-06 | **PB circular:** PBmic depende de CPB, que é o próprio PB resultante (T-02: CPB 1,215 → PB 1215 g; T-04: 1,135 → 1135 g). Exige solução por iteração até o ponto fixo; o livro não descreve o método | R-07 a R-10 |
| A-07 | CNDT na PBmic é o NDT exigido (7,31 kg em T-04), não o da dieta; na avaliação de dieta, qual NDT usar é decisão | R-07 |
| A-08 | ED (E-13) e NDT exigido dependem do CMS: o CMS previsto (C-01..07) ou o informado muda a exigência de NDT | E-13 |
| A-09 | E-16 usa "ELg disponível para ganho", descrita só em texto (energia ingerida menos a exigência de ELm); a conversão da energia da dieta em ELg disponível não está formalizada nas páginas lidas | p. 192 |
| A-10 | Exemplo do cap. 17 com valor impresso divergente da fórmula: Mo, expoente 0,4063 na fórmula e 0,41 no cálculo e na Tabela 10.14 (fora do escopo, mas mostra o risco); Ca, ganho 9,39 na linha e 9,38 na soma; Zn, total 474,67 e 474,58 na divisão | p. 433–435 |
| A-11 | Conversões energéticas que o livro usa e que servem à decisão C4: NDT = ED / 4,4 (E-14) e a relação ED ↔ EM da E-13, em concentração por kg de MS | E-13, E-14 |
| A-12 | Planilha oficial: o site atual (www.brcorte.com.br) é o aplicativo "BR-Corte 5.0", em JavaScript e com reCAPTCHA; o link da planilha Excel citada na p. 432 não aparece na página. Disponibilidade e compatibilidade com a edição 2023 não verificadas | p. 432 |

## 8. Verificação numérica preliminar (sem código no projeto)

Um script descartável, fora do repositório, aplicou as equações das seções 3.1 a 3.5 aos casos da seção 5, com precisão completa e a PB resolvida por iteração até o ponto fixo:

| Caso | Resultado |
|---|---|
| T-04 (p. 432–434) | Todos os valores conferem com o impresso: CMS 10,62; GPCVZ 1,355; ELg 8,16; kg 0,476; km 0,73; EMm 10,03; EMg 17,15; ED 32,15; NDT 7,31 kg e 68,8 %; PMt 781,7; PBmic 789,3; PB 1135 g; Ca 27,24; P 10,35 |
| T-06 (Tabela 17.3a, PC 510, GMD 1,3) | CMS 10,3; EM 25,7; NDT 6,9 kg e 67,1 %; PDR 758; PNDR 330; PB 1088: **idênticos** ao impresso |
| T-05 (Eq. 8.22) | 1,159 kg/dia ≈ 1,16 |
| T-03 (p. 264) | PCJ 390,4; PCVZ 343,6 (impresso 344); Ca 21,68 (impresso 21,67); P 14,66 |
| T-01 e T-02 (p. 199 e 227) | Batem até kg e PLg; divergem depois porque o livro arredonda a etapa e usa o valor arredondado: EMg 19,71 (impresso 19,6, de 9,40 / 0,48) e PMg 452,4 (impresso 451,9, de 214,2 / 0,474) |

Conclusões: a transcrição reproduz o livro; a iteração da PB (A-06) reproduz os valores publicados; os testes precisam conferir **etapa por etapa com as entradas impressas** e a **cadeia completa com precisão total**, com tolerância própria quando o livro arredonda no meio (pendência P-08 desta entrega).

## 9. Pendências propostas na entrega 6.0 (substituídas pelas determinações da seção 9a)

P-01 a P-12 como apresentadas ao usuário em 2026-10-22; texto completo no histórico do git (commit f703066).

## 9a. Determinações do usuário sobre as pendências (2026-10-22)

| # | Determinação |
|---|---|
| P-01 | **GMD negativo: fora do escopo.** GMD zero não bloqueia automaticamente mantença nem CMS (a Tabela 2.14, p. 37, usa GMD 0). Cada equação declara se é definida e se é validada com GMD 0; as indefinidas nessa condição (ex.: ERprot, que divide por GPCVZ, e as potências de GPCVZ nas equações de ganho, iguais a zero) são tratadas uma a uma no grupo delas |
| P-02 | **k = 47,4 % para PCJ ≥ 340 kg**, pelo texto da p. 218 ("a k diminui até o PCJ igual a 340 kg. A partir desse PCJ, a eficiência deve ser constante e igual a 47,4%"); k = 84,665 – 0,1179 × PCVZeq para PCJ < 340 kg |
| P-03 a P-05 | Aprovadas, respeitando as categorias e os domínios originais |
| P-06 | **Solução algébrica direta** da circularidade, demonstrada e validada (seção 10) |
| P-07 a P-10 | Aprovadas, com precisão intermediária integral, unidades explícitas e **sem prever ganho a partir da energia** nesta etapa |
| P-11 | Planilha oficial BR-CORTE 2023 verificada (seção 11) e usada como referência independente da transcrição |
| P-12 | Domínios confirmados por imagem antes de ativar cada grupo |

## 10. PB sem iteração (P-06)

Pela Tabela 9.14 (p. 227), com CPB em kg/dia e as proteínas em g/dia:

```
PBmic = a + 304,9 × CPB,   a = –53,07 + 90,8 × CNDT – 3,13 × CNDT²
CPB   = PB / 1000                                   (g/dia → kg/dia)
PDR   = PBmic
PNDR  = (PMt – 0,64 × PBmic) / 0,80 = 1,25 × PMt – 0,8 × PBmic
PB    = PDR + PNDR = 0,2 × PBmic + 1,25 × PMt
      = 0,2 × (a + 0,3049 × PB) + 1,25 × PMt
PB    = (0,2 × a + 1,25 × PMt) / (1 – 0,2 × 0,3049) = (0,2 × a + 1,25 × PMt) / 0,93902
```

A equação é linear em PB, com coeficiente 0,06098 < 1: solução única, sem iteração nem tolerância. Validação (precisão integral, script descartável):

| Caso | Algébrica | Iteração até o ponto fixo | Impresso |
|---|---|---|---|
| T-04 (p. 433) | PB 1134,946; PBmic 789,32; PNDR 345,62 | igual (diferença 0) | 1135; 789,3; 345,6 |
| T-06 (p. 441, PC 510, GMD 1,3) | PB 1087,900; PBmic 757,79; PNDR 330,11 | igual (2 × 10⁻¹³) | 1088; 758; 330 |
| T-02 com as entradas impressas (CNDT 7,88; PMt 838; p. 227) | PB 1215,22; PBmic 838,60 | — | 1215; 838,5 |

A seção 3.4 fica com a R-10 resolvida por esta forma fechada; a iteração não é usada.

## 11. Planilha oficial (P-11)

- **Arquivo:** `BR_CORTE2023_16939187120492_4524.xlsx`, publicado pela UDESC (https://www.udesc.br/ceo/upec/formbov, página que se apresenta como "BR-CORTE 2023 [...] 4ª edição"); SHA-256 `fac6eab14d7cdd90c38451d6c146e587c2ffc8ef7adb3013cff920ad75b053a7`. Cópia só na pasta de trabalho local, fora do git; lida sem executar macros.
- **Edição:** a própria planilha se cita como "BENEDETI, P.D.B. et al. Planilha para cálculo das exigências nutricionais de zebuínos puros e cruzados (BR-CORTE 2023). 2023. DOI 10.26626/978-85-8179-194-4.2023.E001" (aba "Crescimento", célula H58). **Corresponde à edição usada.**
- **Abas:** "Crescimento" (crescimento e terminação), "Vacas e Bezerros", abas auxiliares de PBmic e "Cálculo de exigências", esta última comparando BR-CORTE 2010, 2016, 2023 e NRC 2016 (não usada, por misturar edições).
- **Peso (aba "Crescimento", células D28 a D47):** mesmos coeficientes das P-01 a P-12; GPCVZ com 0,963. Calcula o PCJ a partir do PC médio (média do PC inicial e final).
- **Divergência registrada:** a planilha aplica a Eq. 1.4 (cruzado de leite) também a pasto; o livro manda usar a Eq. 1.3 para todos a pasto (p. 8). Sem efeito no escopo aprovado, porque cruzado de leite a pasto está fora dele (P-03); prevalece o livro.
- **Uso:** os valores calculados que a planilha traz salvos (precisão integral) servem de teste de regressão independente da transcrição. Ela não é fonte científica própria: segue as mesmas equações do livro.

## 12. Grupo peso (6A-2): escopo, domínio e casos

**Equações** (cap. 1, conferidas na imagem das p. 5–11; iguais às das Tabelas 8.9, 8.10 e 9.13):

| Id | Eq. do livro | Uso |
|---|---|---|
| P-01 | Eq. 1.3 (p. 8 e 11) | PCJ de zebuíno e cruzado de corte; **também de todos a pasto** (p. 8) |
| P-02 | Eq. 1.4 (p. 8 e 11) | PCJ de cruzado de leite, confinamento |
| P-03 a P-08 | Eq. 1.6 a 1.11 (Tabela 1.6, p. 9) | PCVZ em confinamento por grupo e sexo ("Cruzados de corte e de leite") |
| P-09 | Eq. 1.5 (p. 8) | PCVZ a pasto |
| P-10 | Eq. 1.12 (p. 10) | GPCVZ, para todos os sistemas, grupos e sexos ("GMD = ganho médio diário ou ganho médio diário em jejum") |
| P-11, P-12 | Tabela 8.5 (p. 190) e Tabela 9.13 (p. 226) | PCVZeq |

As Eq. 1.1 e 1.2 (BR-CORTE 2016, p. 7) foram substituídas pelas Eq. 1.3 e 1.4 e não são usadas.

**Condição de validade declarada (p. 11):** "animais em crescimento e terminação, em condição de homeostase fisiológica [...] sadios, em fase de crescimento positivo (consumo acima da mantença), que ainda não atingiram a maturidade fisiológica". Vacas adultas, gestantes e lactantes ficam fora (cap. 11 e 12).

**Domínio dos dados das relações de peso** (Tabela 1.2, p. 5, banco de dados do BR-CORTE 2016): PC 81–710 kg; PCJ 74–701 kg; PCVZ 63–600 kg; GMD –0,24 a 1,61; GMDJ –0,54 a 2,66; GPCVZ –0,55 a 2,74 kg/dia. Com o P-01: GMD < 0 fora do escopo. O domínio operacional de cada categoria é o mais estreito entre este e o da categoria (seção 6).

**Casos de verificação do livro para o grupo peso:**

| Caso | Fonte | Valores |
|---|---|---|
| T-07 | Tabela 1.5 (p. 8) | PC 150, 300, 450, 600 → PCJ Z/CC 144,2; 291,5; 439,9; 589,1 e CL 144,7; 291,2; 438,3; 585,8; razões PCJ/PC 0,961 a 0,982 e 0,964 a 0,976 |
| T-08 | Tabela 1.7 (p. 9) | PCJ 144,2; 291,5; 439,9; 589,1 → PCVZ a pasto 122,8; 248,3; 374,7; 501,8 (razão 0,852) e Z MNC confinado 125,2; 255,6; 387,9; 521,5 |
| T-09 | Tabela 1.8 (p. 10) | PCVZ/PCJ das seis equações de confinamento em PCJ 150, 300, 450, 600 |
| T-10 | Tabela 1.9 (p. 11) | GMD 0,25 a 1,75 → GPCVZ 0,24 a 1,70 e razões 0,943 a 0,971 |
| T-11 | p. 192 | Nelore não castrado de 350 kg de PC "equivaleria a um PCVZeq de 300 kg" (aproximado) |
| T-01, T-03, T-04 | p. 199, 264, 432 | PCJ 509,5 e 390,4; PCVZ 450,1 e 344; GPCVZ 1,55, 0,963 e 1,355 |
| T-12 | Planilha oficial (seção 11) | PC 420, 440, 430, GMD 1,5, Z MNC confinado: PCJ 410,1868…, 430,0215…, 420,1024…; PCVZ Z 370,1561…, cruzado 368,0838…; GPCVZ 1,45337…; PCVZeq CC 341,7334…, CL 310,6668… |

**Pendência nova, P-13:** as Eq. 1.3 e 1.4 foram ajustadas num "banco de dados estendido" (p. 7–8) cuja estatística descritiva não aparece no capítulo; o domínio usado para elas é o da Tabela 1.2 (2016) somado ao da categoria. Pedir ou localizar a descrição do banco estendido.

## 13. Divergências encontradas na implementação do grupo peso (6A-2)

Nenhum coeficiente foi ajustado: os coeficientes são os impressos nas Tabelas 1.6, 8.10 e 9.13 e na planilha oficial, que concordam entre si. Os testes prendem cada divergência para que qualquer mudança apareça.

| # | Divergência | Tamanho | Tratamento |
|---|---|---|---|
| D-PESO-01 | Tabela 1.8 (p. 10): com os coeficientes impressos, as razões PCVZ/PCJ das Eq. 1.7 a 1.11 ficam acima das impressas; só a Eq. 1.6 (zebuíno não castrado) bate | +0,001 a +0,002 (ex.: zebuíno castrado com PCJ 150: 0,846 calculado, 0,844 impresso) | Não explicada por arredondamento; Tabela 1.8 não usada como referência dessas cinco equações. **Para decisão** |
| D-PESO-02 | Tabela 1.7 (p. 9), confinamento: a linha de PC 150 só bate partindo do PCJ impresso (125,2); as de PC 450 e 600, só em precisão integral (387,9 e 521,5) | 0,06 | Arredondamento intermediário inconsistente no livro; teste aceita um dos caminhos e prende qual |
| D-PESO-03 | Tabela 1.5 (p. 8): razões PCJ/PC do cruzado de leite com PC 150 e 300 (0,964 e 0,972) não fecham nem com o PCJ impresso (0,965 e 0,971) | 0,001 | Coluna derivada, não usada como teste; os PCJ impressos batem |

### 13.1 Decisões do usuário sobre as divergências do grupo peso (2026-10-22)

- **D-PESO-01:** coeficientes publicados mantidos; divergência da Tabela 1.8 documentada; nada ajustado para reproduzir valores impressos.
- **D-PESO-02:** o resultado esperado do motor é o de **precisão integral**. A reprodução do arredondamento intermediário do livro fica em **teste separado**; nenhum teste aceita indistintamente dois resultados. Tabela 1.7 em precisão integral: todas as linhas batem, menos confinamento com PC 150 kg (125,28, impresso 125,2). Do PCJ impresso: pasto inteiro e confinamento com PC 150 e 300 kg.
- **D-PESO-03:** divergência da coluna derivada registrada; coeficientes originais mantidos.
- **P-13:** interseção conservadora mantida; os limites da Tabela 1.2 (banco de 2016) ficam marcados como **provisórios** no motor (aviso em todo resultado que os usa, e no motivo quando fora deles), sem serem atribuídos ao banco estendido de 2023.
- **Equações de peso BRC23-P-01 a P-11 aprovadas** pelo usuário, registradas na conferência de cada uma.

## 14. Grupo energia (6A-3)

**Equações implementadas** (E-01 a E-15; a E-16 não, pela P-09), conferidas na imagem: Tabelas 8.9 e 8.10 (p. 198–199); corpo do capítulo 8: ELm de 75 kcal/PCVZ^0,75/dia adotada para confinamento e pasto (p. 184–185; o β₀ das Eq. 8.7 a 8.10 é 0,0749), Eq. 8.12 e 8.16 (km, p. 186–187), Eq. 8.20 e 8.21 (ELg, p. 191), Eq. 8.28 (kg) e 8.31 (ERprot, p. 197); relação EM = 0,9455 × ED – 0,3032 em Mcal/kg de MS (Figura 7.5, p. 174); exemplo do capítulo 17 (p. 432–433) e final do exemplo do capítulo 8 (p. 200).

**Domínio:** PCVZ e GPCVZ da categoria (Tabelas 8.1 a 8.4, conferidas na imagem); relação ED–EM sem faixa tabelada (aviso em todo resultado de ED). O CMS é entrada informada nesta etapa, identificada no resultado (P-07).

**Casos que passam, em precisão integral:** T-04 completo (p. 432–433: ELg 8,16 a NDT 68,8 %); T-01 com CMS 10,87 (p. 199–200: ERprot, kg, ELm, km, ED 34,7 e NDT 7,88); **T-06: EM das Tabelas 17.3a a 17.12a, 320 de 320 linhas, nas dez categorias** (inclusive linhas fora do domínio, que o motor marca sem uso operacional).

**Divergências e pendências:**

| # | Achado | Tratamento |
|---|---|---|
| D-EN-01 | Intercepto da relação ED–EM: 0,3032 nos capítulos 7 e 8; 0,303 na Eq. 4.30 (p. 87, capítulo 4) | Exigências usam 0,3032 (Tabelas 8.9 e 8.10). Decidido: seção 14.1 |
| D-EN-02 | NDT (kg e %) das Tabelas 17.xa dependem do CMS, impresso com uma casa: NDT em kg bate em 312 de 320 linhas com o CMS impresso; NDT % quase nunca | Reavaliado na 6A-4 com o CMS previsto: 320 de 320 linhas (seção 15) |
| D-EN-03 | T-01 (p. 199–200): o livro divide pelos valores arredondados (kg 0,48; km 0,75): EMg 19,6, EMm 9,77 e EMtotal 29,4; em precisão integral, 19,71, 9,76 e 29,47 | Esperado do motor: precisão integral; reprodução das etapas impressas em teste separado |
| D-EN-04 | **GMD zero:** ERprot = 1,140 × (0/0)^–1,137 não é definida; sem ela não há kg nem km, e a EMm (mantença) não sai da cadeia, embora a ELm saia | Bloqueado (fora do escopo) com o motivo. **Para decisão:** o livro cita EMm de 118 kcal/PCVZ^0,75/dia para zebuínos confinados e 128 a pasto (p. 187), mas como resultado de análise, não como equação recomendada |
| D-EN-05 | p. 199: ELg impressa 9,40; nenhuma combinação de valores impressos ou integrais a reproduz (integral 9,393; com 450,1 e 1,55, 9,382). A mesma equação bate no T-04 (8,16) | Esperado: 9,39; divergência de 0,007 Mcal/dia registrada |
| D-EN-06 | Tabela 17.12a (pasto) usa o mesmo CMS da 17.3a (equação de confinamento; a p. 37 sugere a Eq. 2.1 para terminação intensiva a pasto) e vai até GMD 1,8 kg/dia, acima dos dados a pasto (GPCVZ até 0,81) | EM confere; linhas acima do domínio ficam sem uso operacional |

### 14.1 Decisões do usuário sobre o grupo energia (2026-10-23)

- **Equações E-01 a E-15 aprovadas** (commit `cdf43e7`), registradas na conferência de cada uma (`APROVACAO_ENERGIA`).
- **D-EN-01:** 0,3032 preservado nas equações dos capítulos 7 e 8 (E-13) e 0,303 na Eq. 4.30 (p. 87), cada um onde o livro o imprime; nenhum coeficiente substituído em silêncio. A diferença (0,0002 Mcal/kg de MS no intercepto) fica documentada aqui e volta a ser vista quando a Eq. 4.30 entrar (6B).
- **D-EN-02:** reavaliar o NDT depois do CMS. Feito na 6A-4 (seção 15): com o CMS previsto pelo motor, NDT em kg e NDT % batem em 320 de 320 linhas das Tabelas 17.3a a 17.12a e passam a ser teste.
- **D-EN-03 e D-EN-05:** precisão completa mantida; divergências registradas; coeficientes inalterados.
- **D-EN-04:** 118 e 128 kcal/PCVZ^0,75/dia (p. 187) **não** são usados como alternativa operacional. ELm é calculada com GMD zero; o que depende de kg ou km (ERprot indefinida com ganho zero) continua fora do escopo, com o motivo (comportamento já implementado).
- **D-EN-06:** restrições do domínio validado preservadas: linhas das tabelas fora do domínio continuam calculadas e sem uso operacional.

## 15. Grupo CMS (6A-4)

**Equações implementadas** (conferidas na imagem em 2026-10-23: p. 25, 30, 31, 35, 37 e 38; coeficientes iguais no corpo do capítulo e nas "Considerações finais"; transcritos com sinal e casas como impressos):

| Id no motor | Eq. do livro | Uso | Entradas |
|---|---|---|---|
| BRC23-C-01-03 | 2.1 (Z), 2.2 (CC), 2.3 (CL) | Confinamento, todos os sexos | PC (kg), GMD (kg/dia) |
| BRC23-C-04-05 | 2.4 (Z), 2.5 (CC) | Confinamento com teor de concentrado conhecido; **sem equação para CL** (fora do escopo) | PC, GMD, NC (% da MS total da dieta) |
| BRC23-C-06 | 2.6 (Z) | Zebuínos machos a pasto, suplementados (escopo P-03) | PC, GMD, CMSs (kg/dia) |

A Eq. 2.7 (cruzados de leite a pasto) não foi implementada: categoria fora do escopo (P-03). O livro não tem equação de CMS de cruzado de corte a pasto (A-03).

**PC:** "peso corporal médio" do período (p. 31 e 35; Tabela 2.11; a planilha oficial usa o PC médio, célula K16). O motor usa o mesmo PC para o peso, a energia e o CMS, como as Tabelas 17.xa ("PC médio").

**Domínio** (fora dele, calculado sem uso operacional; a perda propaga para ED, NDT e NDT %):

| Equação | Fonte | Faixas |
|---|---|---|
| 2.1 | Tabela 2.1, p. 25 | PC 110–652 kg (menor inicial a maior final); GMD –0,36 a 2,00 kg/dia |
| 2.2 | Tabela 2.1, p. 25 | PC 215–607; GMD –0,19 a 2,37 |
| 2.3 | Tabela 2.1, p. 25 | PC 139–661; GMD –0,13 a 2,64 |
| 2.4 | Tabela 2.7, p. 31 | PC 133–647; GMD –0,14 a 2,26; NC 0–85 % |
| 2.5 | Tabela 2.7, p. 31 | PC 231–538; GMD 0,48 a 2,44; NC 25–100 % |
| 2.6 | Tabela 2.11 e texto, p. 35 | PC 102–568; GMD –0,39 a **1,34**; CMSs 0 a **5,32** kg/dia (máximos indicados no texto da p. 35, mais estreitos que os dados da Tabela 2.11: GMD até 1,56 e suplemento até 5,92) |

GMD negativo fora do escopo (P-01); GMD zero calculado (a Tabela 2.14 usa GMD 0). NC fora de 0–100 % e CMSs negativo ficam fora do escopo. Aviso fixo na Eq. 2.6: indicada para recria ou suplementação moderada, com dados em grande parte do período seco (p. 35).

**Integração com a energia:** `calcularEnergia` recebe a fonte do CMS: **informado** (valor do usuário, nó `CMS-INFORMADO`, fora do registro de equações porque não é equação do livro) ou **previsto**, com a equação escolhida por quem chama (`confinamento`; `concentrado`, com NC; `pasto`, com CMSs). O motor não escolhe a equação sozinho; equação incompatível com a categoria fica fora do escopo. O resultado traz o CMS com a equação usada (`equacaoId`), e ED, NDT e NDT % levam o aviso "CMS usado: informado pelo usuário" ou "CMS usado: previsto pelo motor (id)". CMS indeterminado (falta NC ou CMSs) deixa ED, NDT e NDT % indeterminados, nunca zero.

**Casos que passam, em precisão integral:**

| Caso | Resultado |
|---|---|
| Tabela 2.4 (p. 28) | 105 de 105 valores (35 linhas × Eq. 2.1, 2.2 e 2.3) |
| Tabela 2.10 (p. 33) | 72 de 72 (36 linhas × Eq. 2.4 e 2.5; NC 30, 60 e 90 %) |
| Tabela 2.14 (p. 37) | 36 de 36 da Eq. 2.6, todas dentro do domínio; a coluna da Eq. 2.7 não é usada |
| T-04 (p. 432–433) | CMS previsto 10,62; com ele, ED 32,15, NDT 7,31 kg e 68,8 % |
| T-01 (p. 200) | CMS previsto 10,87 |
| T-12, planilha oficial | PC médio 430 kg, GMD 1,5, Z MNC confinado: CMS 9,546066616989…, EM 25,11558246905…, ED 29,62448425947…, NDT 6,732837331697… kg e 70,52996382526… % (células Q10, Q19, D62, Q20 e Q21), 12 casas |
| T-06, Tabelas 17.3a a 17.12a | **CMS, NDT kg e NDT %: 320 de 320 linhas em cada coluna** (D-EN-02 resolvida). Na 17.12a (pasto), o CMS impresso é o da Eq. 2.1 (terminação intensiva a pasto, p. 37); o teste o passa como CMS informado, porque essa aplicação não está autorizada (D-CMS-01) |

Fixtures: `tests/dados/tabelas-cms.ts` (Tabelas 2.4, 2.10 e 2.14) e `tests/dados/tabelas-17-cms.ts` (CMS, NDT e NDT % do capítulo 17), extraídos do texto do PDF e conferidos por imagem em células de cada tabela (p. 28, 33, 37, 441 e 468). Nenhuma divergência numérica entre as equações e os valores impressos.

**Pendências para decisão:**

| # | Achado | Proposta |
|---|---|---|
| D-CMS-01 | Terminação intensiva a pasto (TIP): "o BR-CORTE sugere usar a equação 2.1 para predição de CMS" (p. 37); a Tabela 17.12a usa esse CMS. Não está no inventário (C-01 é "Z, Conf.") | Não implementado. Se aprovado: opção explícita "terminação intensiva a pasto" só para zebuínos machos a pasto, com o domínio da Tabela 2.1 e aviso; a Eq. 2.6 continua a de recria e suplementação moderada |
| D-CMS-02 | Eq. 2.6: limites de GMD e CMSs tirados do texto da p. 35 (1,34 e 5,32), mais estreitos que a Tabela 2.11 (1,56 e 5,92) | Mantidos os do texto (D-EN-06); confirmar |
| D-CMS-03 | Eq. 2.6: o banco de dados não separa classe sexual, mas o escopo a pasto do motor é só de zebuínos machos (P-03) | Mantido o escopo P-03 (fêmea a pasto fora do escopo também no CMS); confirmar |
| D-CMS-04 | Eq. 2.1 a 2.5 são por grupo genético, sem efeito de sexo, e os domínios das Tabelas 2.1 e 2.7 também | Como no livro: fêmeas, castrados e não castrados usam a mesma equação; o domínio de energia da categoria continua valendo nas etapas de energia |
| D-CMS-05 | Tabelas 2.4 e 2.10 trazem linhas fora do domínio (ex.: cruzado de corte com PC 200 kg; zebuíno com NC 90 %, acima de 85 %) | Calculadas e sem uso operacional, como o restante (D-EN-06) |

### 15.1 Decisões do usuário sobre o grupo CMS (2026-10-23)

- **Equações C-01 a C-06 aprovadas** (commit `b2bee4a`), registradas na conferência de cada uma (`APROVACAO_CMS`).
- **D-CMS-01:** terminação intensiva a pasto (TIP) implementada como opção explícita (`terminacao_intensiva_pasto`, equação `BRC23-C-01-TIP`): coeficientes da Eq. 2.1 (p. 25), aplicação pela p. 37, só zebuínos machos não castrados e castrados a pasto, domínio da Tabela 2.1 (zebuínos: PC 110–652 kg; GMD –0,36 a 2,00) e aviso de aplicação em todo resultado. O sistema do animal não muda: peso (Eq. 1.3 e 1.5), energia (Eq. 8.16 e 8.21) e o resto da cadeia continuam os de pasto. A opção de confinamento num animal a pasto continua fora do escopo e indica a TIP. Teste: Tabela 17.12a passa com a TIP (320 de 320 linhas mantidas).
- **D-CMS-02:** uso operacional da Eq. 2.6 só com GMD até 1,34 kg/dia e CMSs até 5,32 kg/dia (texto da p. 35).
- **D-CMS-03:** fêmeas zebuínas a pasto continuam fora do escopo inicial, agora identificadas no motivo como **restrição do projeto** (P-03 e D-CMS-03), não do livro; vale para peso, energia, CMS (Eq. 2.6 e TIP) e o que vier.
- **D-CMS-04:** Eq. 2.1 a 2.5 aprovadas para as classes sexuais abrangidas, sem coeficiente por sexo; teste de regressão prende coeficientes e CMS iguais entre não castrados, castrados e fêmeas do mesmo grupo.
- **D-CMS-05:** fora do domínio, o valor é calculado só para análise, sem uso operacional, e a perda propaga (comportamento mantido, com teste).

## 16. Grupo proteína (6A-5)

**Equações implementadas** (R-01 a R-10, conferidas na imagem em 2026-10-23): Tabela 9.14 (p. 227); corpo do capítulo 9: PMm de 3,6 e 3,9 g/PCJ^0,75 (p. 214), PLg de Costa e Silva et al. (2020) (p. 215–216), k e o limite de PCJ 340 kg (p. 218), PBmic, PDR, PNDR e PB (p. 219); equação de PBmic e Tabela 3.7 do capítulo 3 (p. 60); exemplos T-02 (p. 227) e T-04 (p. 433). Coeficientes como impressos.

| Id no motor | Equação | Entradas → saída |
|---|---|---|
| BRC23-R-01-02 | PMm = 3,6 × PCJ^0,75 (confinamento) ou 3,9 × PCJ^0,75 (pasto) | PCJ (kg) → g/dia |
| BRC23-R-03 | PLg = 176,01 × GPCVZ – 0,381 × PCVZeq^0,75 × GPCVZ^1,035 | GPCVZ (kg/dia), PCVZeq (kg) → g/dia |
| BRC23-R-04 | k = 84,665 – 0,1179 × PCVZeq se PCJ < 340 kg; 47,4 se PCJ ≥ 340 kg (P-02) | PCJ, PCVZeq → % |
| BRC23-R-05 | PMg = PLg / (k / 100) | g/dia |
| BRC23-R-06 | PMt = PMm + PMg | g/dia |
| BRC23-R-10 | PB em forma fechada (seção 10; P-06): PB = [(1 – f/d) × a' + PMt/d] / [1 – (1 – f/d) × 304,9/1000], a' = –53,07 + 90,8 × CNDT – 3,13 × CNDT², f = 0,64, d = 0,80 | PMt (g/dia), CNDT (kg/dia) → g/dia |
| BRC23-R-07 | PBmic = –53,07 + 304,9 × CPB + 90,8 × CNDT – 3,13 × CNDT², CPB = PB / 1000 | PB (g/dia), CNDT (kg/dia) → g/dia |
| BRC23-R-08 | PDR = PBmic | g/dia |
| BRC23-R-09 | PNDR = (PMt – PBmic × 0,64) / 0,80 | g/dia |

**Exigência, não oferta:** na PBmic, CPB é a PB **exigida** (o próprio resultado; por isso a forma fechada) e CNDT é o NDT **exigido** pela cadeia de energia (A-07; a planilha oficial também usa o NDT exigido, célula Q20). PB e PBmic levam esse aviso. PDR = PBmic é a exigência de proteína degradável no rúmen, igual à síntese microbiana; reciclagem de N não considerada (p. 219); **nenhum dado de degradação ruminal de alimento** entra no cálculo. A avaliação de dieta (proteína e NDT ofertados) não faz parte desta entrega.

**Dependências:** PB, PBmic, PDR e PNDR dependem do NDT exigido e, por ele, do CMS (previsto ou informado; o CMS usado vai nos avisos). Sem CMS: PMm a PMt calculadas; PB, PBmic, PDR e PNDR indeterminados, nunca zero. `calcularProteina` calcula peso, energia, CMS e proteína numa cadeia só.

**Domínio** (fora dele, calculado só para análise, sem uso operacional, e a perda propaga):

| Equação | Variável | Fonte |
|---|---|---|
| PMm | PCJ da categoria | Tabelas 9.2 a 9.5 (p. 208–211; banco do BR-CORTE 2016, de onde vêm 3,6 e 3,9) |
| PLg | GPCVZ da categoria | Tabelas 9.2 a 9.5, **provisório** (PLg ajustada no banco de Costa e Silva et al., 2020, sem estatística descritiva no livro; D-PROT-01) |
| k | PCJ da categoria | Tabelas 9.2 a 9.5, **provisório** (equação do banco do BR-CORTE 2010, p. 218; D-PROT-01) |
| PB e PBmic | CNDT 0,83–16,8 kg/dia; CPB 0,59–4,39 kg/dia (590–4390 g/dia de PB) | Tabela 3.7 (p. 60); na PB, a faixa de CPB é conferida no próprio resultado (domínio da saída, novo no núcleo) |

Faixas das Tabelas 9.2 a 9.5 (a tabela imprime a coluna Máximo antes da Mínimo; PCJ e GPCVZ: menor e maior entre inicial e final):

| Categoria | PCJ (kg) | GPCVZ (kg/dia) | Fonte |
|---|---|---|---|
| Z MNC conf. | 151–592 | –0,01 a 1,87 | Tabela 9.2, p. 208 |
| Z MC conf. | 110–520 | –0,21 a 1,32 | Tabela 9.2 |
| Z F conf. | 129–437 | –0,13 a 1,25 | Tabela 9.2 |
| CC MNC conf. | 198–585 | –0,05 a 1,98 | Tabela 9.3, p. 209 |
| CC MC conf. | 260–552 | –0,09 a 1,64 | Tabela 9.3 |
| CC F conf. | 187–494 | –0,18 a 1,73 | Tabela 9.3 |
| CL MNC conf. | 150–661 | 0,05 a 2,74 | Tabela 9.4, p. 210 |
| CL MC conf. | 216–575 | 0,02 a 2,00 | Tabela 9.4 |
| CL F conf. | 196–431 | 0,05 a 1,67 | Tabela 9.4 |
| Z MNC pasto | 74,0–519 | –0,10 a 0,90 | Tabela 9.5, p. 211 |
| Z MC pasto | 226–484 | –0,10 a 0,90 | Tabela 9.5, p. 211 |

Avisos fixos: PBmic ajustada com dietas de EE médio de 2,83 % (± 1,03); a equação para EE alto (CNDTee, p. 60) não foi implementada.

**Casos que passam, em precisão integral:**

| Caso | Resultado |
|---|---|
| T-04 (p. 433) | PMm 386,1; PLg 187,5; k 47,4; PMg 395,6; PMt 781,7; PBmic e PDR 789,3; PNDR 345,6; PB 1135 g/dia, com o CMS previsto |
| T-02 (p. 227) | PMm 386,1 e k 47,4. Os demais impressos vêm de etapas arredondadas (D-PROT-03): reproduzidos em teste separado a partir dos valores impressos (214,2; 451,9; 838; 838,5; 376,7; 1215) |
| T-12, planilha oficial | PMm, PLg, PMg e PMt iguais em 10 casas (Q24 a Q27); a forma fechada, com os coeficientes da planilha, reproduz o ponto fixo das 100 iterações dela (PB 1118,799373801…, aba "PBmic Cresc e Term", B102) |
| T-06, Tabelas 17.3a a 17.12a | PDR, PNDR e PB: **913 de 960 células** com os coeficientes impressos; as 47 restantes divergem por arredondamento (até 0,59 g/dia), estão listadas no teste e fecham **960 de 960** com os coeficientes da planilha (D-PROT-04). A 17.12a usa o CMS da TIP (D-CMS-01) |

Fixture: `tests/dados/tabelas-17-proteina.ts` (PDR, PNDR e PB), mesmo extrator, conferido por imagem (p. 441 e 468).

**Divergências e pendências:**

| # | Achado | Tratamento |
|---|---|---|
| D-PROT-01 | PLg (Costa e Silva et al., 2020) e k (BR-CORTE 2010) foram ajustadas em bancos cuja estatística descritiva o livro não traz; as Tabelas 9.2 a 9.5 descrevem o banco do BR-CORTE 2016 | Faixas das Tabelas 9.2 a 9.5 usadas como **provisórias** para PLg e k (aviso, como P-13). Confirmar |
| D-PROT-02 | k descontínuo em PCJ 340 kg: logo abaixo, a equação dá 49,4 % (zebuíno não castrado confinado, PCVZeq 298,7 kg); a partir de 340, 47,4 %. A Tabela 9.14 imprime "PCJ < 340" e "PCJ > 340"; a planilha usa a equação até PCJ ≤ 340 | Mantido P-02 (47,4 a partir de 340), sem suavizar; registrado |
| D-PROT-03 | T-02 (p. 227) impresso com GPCVZ 1,55 e CPB 1,215 arredondados: em precisão integral, PLg 214,46, PMg 452,45, PMt 838,51, PNDR 377,20, PB 1215,87 (impresso 1215) | Esperado do motor: precisão integral; etapas impressas em teste separado (como D-EN-03) |
| D-PROT-04 | Coeficientes da PBmic: livro 304,9 e 90,8 (Tabela 9.14, p. 227; p. 219; p. 60); planilha oficial 304,89 e 90,79. As Tabelas 17.xa foram geradas com os da planilha | Motor usa os impressos (dados como publicados). Diferença na PB: 0,017 g/dia no T-12; até 0,59 g/dia nas tabelas. **Para decisão** |
| D-PROT-05 | Dois quadros numerados "Tabela 9.5": estatística descritiva a pasto (p. 211) e equações de CPM para PMm (p. 213) | Citados pela página |
| D-PROT-06 | PMm: a "Tabela 9.5" da p. 213 traz 3,96 e 4,31 g/PCVZ^0,75; a p. 214 converte para 3,6 e 3,9 g/PCJ^0,75 sem mostrar a conversão | Usados 3,6 e 3,9 (Tabela 9.14 e p. 214) |
| D-PROT-07 | GMD zero: PMm a PMt saem (PLg = 0), mas PB, PBmic, PDR e PNDR ficam fora do escopo, porque o NDT exigido não sai sem ERprot (D-EN-04) | Mantido. **Para decisão**, junto da mantença energética com ganho zero |
| D-PROT-08 | PB % da MS, PDR % da PB e PNDR % da PB aparecem nas Tabelas 17.xa e na planilha (Q30, Q32, Q34), mas não estão no inventário (R-01 a R-10) | Não implementados. Autorizar como R-11 a R-13? |
| D-PROT-09 | PNDR exigida pode sair negativa quando 0,64 × PBmic > PMt (síntese microbiana acima da PM exigida); não ocorre nas tabelas nem nos exemplos | Calculada como o livro manda, sem truncar; tratamento a decidir quando houver caso |

### 16.1 Decisões do usuário sobre o grupo proteína (2026-10-24)

- **Equações R-01 a R-10 aprovadas** (commit `4d2e941`), registradas na conferência de cada uma (`APROVACAO_PROTEINA`), com fonte, unidades e coeficientes da seção 16: PMm 3,6 (confinamento) e 3,9 (pasto) × PCJ^0,75, g/dia (Tabela 9.14, p. 227; p. 214); PLg 176,01 e 0,381, expoentes 0,75 e 1,035, g/dia (p. 216); k 84,665 e 0,1179 × PCVZeq para PCJ < 340 kg, 47,4 % para PCJ ≥ 340 kg (p. 218); PBmic –53,07, 304,9 × CPB (kg/dia), 90,8 e –3,13 × CNDT (kg/dia), g/dia (p. 60, 219, 227); PNDR com 0,64 e 0,80 (p. 219, 227); PB em forma fechada (seção 10).
- **D-PROT-04:** coeficientes operacionais da PBmic são os publicados no livro, 304,9 e 90,8. Os da planilha (304,89 e 90,79) aparecem só em testes de compatibilidade identificados, sem substituir a equação principal.
- **D-PROT-01:** domínios provisórios de PLg e k mantidos, com aviso.
- **D-PROT-02:** PCJ < 340 kg e PCJ ≥ 340 kg preservados, sem suavização.
- **D-PROT-03:** precisão completa; arredondamentos do livro só em testes separados.
- **D-PROT-07:** com GMD zero, PB (e o que depende dela) indeterminada enquanto faltar o NDT exigido; PMm a PMt continuam válidas.
- **D-PROT-08:** **R-11 a R-13 autorizados e implementados** como indicadores derivados (BRC23-R-11 a R-13): PB (% da MS) = (PB / 1000) / CMS × 100; PDR (% da PB) = PDR / PB × 100; PNDR (% da PB) = PNDR / PB × 100. Fonte: colunas "PB, %", "PDR, % PB" e "PNDR, % PB" das Tabelas 17.3a a 17.12a (p. 441–468) e células Q34, Q30 e Q32 da planilha. Denominador zero fica fora do escopo; sem CMS ou sem PB, indeterminados. Unidade nova no núcleo: "% PB". Teste: PB % em 320 de 320 linhas; PDR % e PNDR % em 592 de 640 com os coeficientes impressos (912 de 960 no total; os 24 pares divergentes, por até 0,055 ponto, estão presos no teste) e em 960 de 960 com os da planilha (compatibilidade, D-PROT-04).
- **D-PROT-09:** PNDR exigida negativa é calculada como está, **sinalizada como inconsistência** e sem uso operacional; nunca corrigida para zero. A PB também é sinalizada quando fica abaixo da PBmic (PNDR implícita negativa). Mecanismo novo no núcleo: `consistenciaSaida` (motivo "Inconsistência: ...").

## 17. Grupo macrominerais (6A-6)

**Equações implementadas** (M-Ca a M-S, conferidas na imagem em 2026-10-24): Tabela 10.14 (p. 264); Figuras 10.1 a 10.6 e texto de mantença e retenção de cada mineral (p. 245–253); Tabelas 10.8 e 10.9 (ganho e plateau de Ca e P, p. 246 e 248), 10.10 a 10.12 (ganho de Mg, Na e K, p. 250–253) e texto do S (p. 254); bancos de dados nas Tabelas 10.3 (p. 240), 10.5 e 10.6 (p. 243); exemplos T-03 (p. 264–265) e T-04 (p. 433–434). Coeficientes como impressos.

Para cada mineral, quatro equações (BRC23-M-<mineral>-1 a 4), todas em g/dia:

| Etapa | Equação |
|---|---|
| 1. Mantença | coeficiente (mg/kg de PC) × PC / 1000 |
| 2. Ganho | GPCVZ × (a × PCVZ^b), por grupo; Ca e P: zero com PCVZ ≥ plateau |
| 3. Líquida | mantença + ganho |
| 4. Dietética | líquida / (retenção / 100) |

| Mineral | Mantença (mg/kg PC) | Retenção (%) | Ganho, zebuíno | Ganho, cruzado | Plateau de PCVZ (kg) |
|---|---|---|---|---|---|
| Ca | 11,7 | 56,8 | 147 × PCVZ^–0,50 | 66,0 × PCVZ^–0,32 | Z 462; cruzado 453 |
| P | 13,5 | 67,8 | 38,6 × PCVZ^–0,36 | 25,4 × PCVZ^–0,25 | Z 445; cruzado 479 |
| Mg | 5,9 | 35,5 | 0,3466 × PCVZ^0,0113 | 1,0597 × PCVZ^–0,2386 | — |
| Na | 6,3 | 37,1 | 5,594 × PCVZ^–0,2998 | 1,977 × PCVZ^–0,058 | — |
| K | 23,5 | 48,4 | 0,9463 × PCVZ^0,1216 | 0,3418 × PCVZ^0,3200 | — |
| S | 10,4 | 77,3 | 0,03 × PCVZ^0,8900 (todos) | igual | — |

(Ganho = GPCVZ × termo da tabela.) "Cruzado" reúne cruzados de corte e de leite (p. 242: sem diferença entre cruzamentos; A-04). As equações não têm efeito de classe sexual nem de sistema. A mantença usa o **PC** ("mg/kg peso corporal"; exemplos com PC 400 e 520 kg); o ganho usa PCVZ e GPCVZ da cadeia de peso. Os minerais não dependem de CMS nem de energia (`calcularMinerais`). A exigência dietética é líquida ÷ coeficiente de retenção verdadeiro: não é oferta da dieta nem disponibilidade de fonte mineral (aviso em todo resultado).

**Domínio** (fora dele, calculado só para análise, sem uso operacional, e a perda propaga):

| Etapa | Variáveis | Fonte |
|---|---|---|
| Mantença | PC 125–557 kg | Tabela 10.3, p. 240 (325 animais, 10 experimentos) |
| Ganho de Ca, P, Mg, Na e K | PCVZ e GPCVZ da categoria | Tabela 10.5, p. 243 (abaixo) |
| Ganho de S | PCVZ 104–549 kg; GPCVZ –0,02 a 1,87 kg/dia | Tabela 10.6, p. 243 |

| Categoria (Tabela 10.5) | PCVZ (kg) | GPCVZ (kg/dia) |
|---|---|---|
| Zebuíno MNC confinado | 172–549 | –0,01 a 1,87 |
| Zebuíno MC confinado | 104–460 | –0,21 a 2,30 |
| Zebuína confinada | 108–368 | –0,13 a 1,25 |
| Cruzado MNC confinado | 167–600 | 0,17 a 2,74 |
| Cruzado MC confinado | 161–506 | –0,09 a 1,64 |
| Cruzada confinada | 175–443 | –0,18 a 1,73 |
| Zebuíno MNC a pasto | 80,2–604 | –0,41 a 0,90 |
| Zebuíno MC a pasto | **sem linha na tabela** (D-MIN-03) | — |

GMD negativo fora do escopo (P-01); GMD zero: ganho zero e exigência só de mantença. Fêmea a pasto continua fora do escopo (restrição do projeto). Núcleo: novo `semDominioPublicado` (categoria no escopo sem banco de dados publicado para a equação: calculado sem uso operacional, com o motivo).

**Casos que passam, em precisão integral:**

| Caso | Resultado |
|---|---|
| T-04 (p. 433–434) | As 24 grandezas (mantença, ganho, líquida e dietética dos seis minerais) batem: Ca 27,24; P 10,35 (ganho zero, acima do plateau); Mg 10,06; Na 12,10; K 30,82; S 19,08 g/dia |
| T-03 (p. 264–265) | Mantenças batem; ganhos e dietéticas presos em precisão integral (PCVZ 343,62; o livro usa 344) e reproduzidos a partir dos valores impressos em teste separado (D-MIN-04 a 06) |
| T-06, Tabelas 17.3b a 17.12b (p. 442–469) | **Exigências dietéticas de Ca, P, Mg, Na, K e S: 1920 de 1920 células** (6 × 320), nas dez categorias, inclusive o plateau de Ca e P a partir de PC 570 kg e a 17.12b (pasto) |

Fixture: `tests/dados/tabelas-17-minerais.ts`, extraído do texto do PDF e conferido por imagem (p. 442, 445, 448 e 469). Quatro linhas (17.4b e 17.5b, PC 510 kg) tinham números partidos pelo pdf.js ("1, | 37"; "1 | 0,15") e foram reparadas e conferidas célula a célula na imagem.

**Divergências e pendências:**

| # | Achado | Tratamento |
|---|---|---|
| D-MIN-01 | Ca de cruzados: a Tabela 10.8 (p. 246) dá o conteúdo 0,096 × PCVZ^0,68, cuja derivada é 65,3 × PCVZ^–0,32; Tabelas 10.8 e 10.14 imprimem 66,0. O conteúdo no plateau (453 kg) calculado é 6,145 kg; impresso 6,17 | Usado 66,0, como impresso nas duas tabelas; as Tabelas 17.xb fecham com ele |
| D-MIN-02 | Os demais coeficientes de ganho são as derivadas dos conteúdos corporais com arredondamento (P: –0,36 para 0,6446 – 1 = –0,3554; –0,25 para –0,2504) | Usados os impressos na Tabela 10.14; registrado |
| D-MIN-03 | Zebuíno macho castrado a pasto está no escopo (P-03), mas a Tabela 10.5 não tem linha dele para o ganho de Ca, P, Mg, Na e K | Ganho calculado **sem uso operacional**, com o motivo; mantença e S (Tabela 10.6) não são afetados. **Para decisão:** manter, ou adotar a faixa de outra categoria |
| D-MIN-04 | T-03 calculado com PCVZ 344 arredondado e etapas arredondadas | Esperado do motor: precisão integral; etapas impressas em teste separado (como D-EN-03 e D-PROT-03) |
| D-MIN-05 | T-03, S: o livro imprime dietética 12,19, mas 9,39 / 0,773 = 12,15 (integral: 12,137) | Erro aritmético do exemplo; teste prende que 12,19 não é reproduzido |
| D-MIN-06 | T-03, Na: "6,3 × 400 = 2511 mg = 2,52 g/dia"; 6,3 × 400 = 2520 mg | O valor em g (2,52) está certo; registrado |
| D-MIN-07 | T-04, Ca: ganho 9,39 na linha e 9,38 na soma; líquida 15,47 e 15,46 na divisão (A-10) | Integral: 9,389 e 15,473; dietética 27,24 bate |
| D-MIN-08 | S: mantença e retenção estimadas para bovinos Nelore (p. 253) e ganho de um só estudo (Costa e Silva et al., 2015a; p. 254); a Tabela 10.14 aplica a todos | Como no livro, com o domínio da Tabela 10.6; registrado |
| D-MIN-09 | Relação Ca/P aparece nos exemplos (T-03: 1,48; T-04: 2,63) e nas Tabelas 17.xb, mas não está no inventário | Não implementada. Autorizar como indicador derivado? |
| D-MIN-10 | Ganho de Ca e P cai a zero no plateau (descontinuidade: ex. Tabela 17.3b, Ca 25,99 g/dia em PC 510 kg e 11,74 em PC 570 kg com GMD 1,3) | Como publicado, sem suavizar (como D-PROT-02) |
| D-MIN-11 | Mantença com domínio único (Tabela 10.3, PC 125–557 kg), sem separar categoria nem sistema; linhas das Tabelas 17.xb com PC 570 e 630 kg ficam fora | Calculadas sem uso operacional (D-CMS-05) |

### 17.1 Decisões do usuário sobre o grupo macrominerais (2026-10-24)

- **As 24 equações de macrominerais aprovadas** (commit `b5ef394`), com seus domínios e bloqueios, registradas na conferência de cada uma (`APROVACAO_MINERAIS`).
- **D-MIN-03:** ganho de Ca, P, Mg, Na e K de zebuínos castrados a pasto continua sem uso operacional; nenhum limite transferido de outra categoria.
- **D-MIN-09:** **relação Ca/P implementada** (BRC23-M-CaP) como razão das exigências dietéticas de Ca e P (adimensional), não como composição da dieta; P dietético zero fica fora do escopo; sem Ca ou P, indeterminada; a perda de uso operacional de Ca ou P propaga. Fontes: p. 265 ("21,67/14,66 = 1,48"), p. 433 ("27,24/10,35 = 2,63") e coluna "Ca/P" das Tabelas 17.3b a 17.12b. Testes: T-03 1,48 (integral 1,479); T-04 2,63; Tabelas 17.xb, 319 de 320 linhas.
- **D-MIN-12 (novo):** Tabela 17.8b (p. 457), cruzadas de corte confinadas, PC 510 kg e GMD 1,8 kg/dia: a coluna Ca/P imprime 24,3, que repete o P (24,31); 10,51 / 24,31 = 0,432. Erro de impressão; o teste prende o impresso e o valor recalculado.
- **D-MIN-01:** mantido 66,0 para o Ca de cruzados (Tabelas 10.8 e 10.14); divergência com a derivada matemática de 0,096 × PCVZ^0,68 (65,28) registrada.
- **Demais divergências (D-MIN-02, 04 a 08, 10 e 11):** documentação e coeficientes publicados preservados, sem correção.

## 18. Inventário complementar da 6B (entrega 6B.0, 2026-10-26)

Conferido na imagem das páginas renderizadas (pdf.js), sem código. Páginas do capítulo 4 no PDF: página do livro + 92 (p. 87 = PDF 179; p. 102 a 105 = PDF 194 a 197); capítulo 10: PDF = livro (p. 263).

### 18.1 Energia da dieta pelo capítulo 4 (p. 86–87 e 102–105)

| Item | Como impresso | Unidades e condições |
|---|---|---|
| Eq. 4.28a a 4.28d (p. 86) | NDT = soma das frações digestíveis; a Tabela 4.5 indica a **4.28d**: NDT = PBvd + CNFvd + FDNd + 2,25 × EEvd – FMNDT | NDT e frações em % da MS; FMNDT (fração metabólica fecal) da Tabela 4.1; 2,25 é a constante de Atwater |
| Eq. 4.29 (p. 86) | ED = 0,056 × PBvd + 0,042 × CNFvd + 0,042 × FDNd + 0,094 × EEvd – FMED | ED em Mcal/kg de MS; FMED da Tabela 4.1 |
| **Eq. 4.30** (p. 87) | **EM = 0,9455 × ED – 0,303** | EM e ED em **Mcal/kg de MS** (concentração da dieta). Equação do Laboratório de Metabolismo e Calorimetria Animal da EV-UFMG (p. 86). Nenhuma faixa de validade tabelada nas páginas lidas |
| **Tabela 4.5** (p. 105) | Equações para a concentração energética dos alimentos das Tabelas 4.6 a 4.9: EEvd, Eq. 9; CNFvd, Eq. 10; FDNd, Eq. 13, 14, 17, 18, 19b e 20; PBvd, Eq. 18, 19b, 20 e 27; NDT, Eq. 28d (Tabela 4.1); ED, Eq. 29 (Tabela 4.1); EM, Eq. 30 | Condições do texto (p. 105): para FDNd e PBvd, **consumo voluntário de 22 g de MS/kg de PC**; para concentrados, silagem de milho como volumoso basal. O texto registra que o sub-modelo de FDN superestima o NDT de bovinos em crescimento e terminação (Figuras 4.10 e 4.11) e que a versão *on-line* do BR-CORTE usa o coeficiente de digestibilidade da FDNpd para vacas em lactação |

**Equações auxiliares de que a energia da dieta depende** (não transcritas nesta etapa): 4.9 (EEvd), 4.10 (CNFvd), 4.11, 4.13 a 4.15 e 4.17 a 4.21 (FDNpd e FDNd, com kd e kp dependentes do CMS), 4.26 e 4.27 (PBvd), Tabela 4.1 (FMNDT e FMED). **Exigem dados que o catálogo de nutrientes não tem:** CNF, PIDN, PIDA (há MS, MO, MM, PB, EE, FDN, FDNcp, FDA, LIG, NDT, Ca e P). Por isso a energia ofertada pela composição não é viável agora; a 6B usa o NDT dos perfis (C-6B-02).

**Relação com D-EN-01:** a Eq. 4.30 (0,303, cap. 4) e a relação usada nas exigências (0,3032, Figura 7.5, p. 174, e Tabelas 8.9 e 8.10) têm a mesma inclinação. Nas páginas lidas o livro não diz se são a mesma regressão com arredondamento diferente. Não há, no capítulo 4, conversão de NDT em ED: a ED vem das frações (Eq. 4.29). A divisão NDT = ED / 4,4 só aparece no contexto das exigências (Tabelas 8.9 e 8.10).

### 18.2 Níveis tóxicos e máximos de minerais (Tabela 10.13 e texto, p. 263)

| Mineral | Nível tóxico | Fonte citada pela tabela |
|---|---|---|
| Ca | 44 g/kg de MS | NRC (2000) |
| K | 20 g/kg de MS | NASEM (2016) |
| Mg | 4 g/kg de MS | NRC (2000) |
| Na | 65 g/kg de MS | NRC (2000) |
| S | 4 g/kg de MS | NRC (2000) |
| P | **não consta** | — |

Unidades: concentração na MS da dieta. São valores "obtidos da literatura" (fontes secundárias: NRC, NASEM, McDonald, McDowell), não estimados pelo BR-CORTE. Microminerais também listados, fora do escopo (C3).

Texto da mesma página: "Para a formulação de rações, recomenda-se que níveis máximos de elementos minerais na dieta sejam fixados como 120% das exigências [...]. Porém, em condições práticas, nem sempre é possível este equilíbrio." É recomendação **para formulação**, não critério de avaliação.

### 18.3 Exemplo de dieta para validação da oferta (Tabela 4.4, p. 102)

"Exemplo de aplicação": bovinos Nelore em crescimento e terminação, confinamento; volumoso:concentrado **50:50 na MS**, 12 % de PB; consumo esperado de 25 g de MS/kg de PC; volumoso silagem de milho; concentrado de milho grão (86,43 % da MS), farelo de soja (10,07 %), ureia:sulfato de amônia 9:1 (1,5 %) e mistura mineral (2,0 %). A Tabela 4.4 dá, em % da MS (MS em % da MN), a composição de silagem, fubá, farelo de soja, U:SA, MM, do concentrado e da dieta total: MS, MO, PB, Ur, PBu, EE, FDNcp, FDA, lignina, CNF, PIDN e PIDA.

**Serve para validar** a oferta: média ponderada pela MS (concentrado e dieta) e MS da dieta pela soma das MN. Conferência em rascunho, em precisão integral:

| Coluna | Bate em precisão integral | Só com arredondamento intermediário | Não reproduzida |
|---|---|---|---|
| Concentrado | EE 3,69; FDNcp 9,89; FDA 3,99; LIG 1,14; CNF 67,34; PIDN 0,99; PIDA 0,44 | — | **PB 16,686 (impresso 16,70)**; MO 95,206 (95,20); MS 88,12 (88,11) |
| Dieta | MO 94,97; EE 3,43; FDNcp 30,83; FDA 13,89; CNF 49,95 | LIG 3,06; PIDN 1,06; PIDA 0,51 (da média dos valores impressos) | **PB 11,97 (impresso 12,00)**; **MS 45,78 (impresso 45,80)** |

**Tratamento dos traços:** na coluna do concentrado, o livro soma os componentes com "–" (PB, EE e fibras da mistura mineral; EE e fibras da U:SA) como **contribuição zero**; a MO da mistura mineral é impressa como 0. Isso conflita com a regra "ausente é ausente" (C-6B-13).

**Não serve para o balanço:** o exemplo não informa PC nem GMD do animal; nenhum exemplo do livro que combine dieta e exigência foi encontrado nas páginas lidas nesta etapa (p. 102–105, 263–265 e 433–434). O balanço será validado por casos sintéticos identificados e por combinação explícita de casos do livro (C-6B-17).

**Outras divergências do exemplo** (energia, que a 6B não usa): A.7 imprime "EM = 0,9422 × ED – 0,303" na linha da fórmula e calcula com 0,9455 (2,727 Mcal/kg); B.1 calcula FDNd(F) 30,42 e FDNd(C) 7,32, mas soma 30,32 e 7,34 (18,87).

**Tabelas 4.6 a 4.9:** composição e energia de alimentos "retirados da base CQBAL 3.0", com NDT, ED e EM estimados pelas equações da Tabela 4.5. Não entram como perfis (outra versão do CQBAL e NDT estimado por equação); ficam como referência, sem uso.
