# Gestão Pecuária

Sistema pessoal de gestão pecuária (corte e leite) para Windows, 100% offline: rebanho, pesagens, sanidade, estoque, financeiro, banco de alimentos e nutrição de bovinos de corte pelo BR-CORTE 2023 (exigências e avaliação de dietas).

Stack: Electron, React, TypeScript, Tailwind, TanStack Query, Zod, SQLite (better-sqlite3), Vitest e Playwright. Monorepo com npm workspaces.

## Estado

Fases 0 a 6B concluídas (até a avaliação de dietas). A Fase 6C (desempenho previsto) está só em planejamento. Detalhes em [ROADMAP.md](ROADMAP.md) e [PLANO_FASE_6.md](PLANO_FASE_6.md).

## Comandos

| Comando | O que faz |
|---|---|
| `npm ci` | Instala as dependências |
| `npm run dev` | Abre o app em modo de desenvolvimento |
| `npm run verify` | Tipos, lint, testes de unidade e integração e testes E2E |
| `npm run package:win` | Gera o instalador em `apps/desktop/release` |

## O que não está nesta versão pública

- **Pacotes de curadoria de composição de alimentos** (CQBAL 4.0 e publicações da Embrapa: CT 79, CT 261, CT 263 e BPD 100). Foram autorizados só para uso pessoal, sem redistribuição. O formato, a importação e a conferência dos pacotes continuam no código e são testados com dados fictícios; os testes que conferiam os dados reais foram retirados.
- **Publicações de referência** (PDF do BR-CORTE e das fontes de composição): ficam só na máquina local. As equações do BR-CORTE usadas no motor de cálculo citam capítulo, página e tabela.
- **Dados operacionais** (banco e backups): ficam em `%APPDATA%\GestaoPecuaria`, nunca no repositório.

A documentação (`CLAUDE.md`, `PLANO_FASE_5.md`, `ROADMAP.md`) descreve as entregas como foram feitas na versão de uso pessoal, incluindo os pacotes. Valores numéricos desses pacotes foram omitidos aqui.

## Aviso

Uso pessoal. Os resultados nutricionais são estimativas de modelo, com as limitações descritas em [MODELOS_NUTRICIONAIS.md](MODELOS_NUTRICIONAIS.md): não substituem a orientação de zootecnista ou médico-veterinário.
