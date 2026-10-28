import {
  Beef,
  Calculator,
  FileChartColumn,
  FlaskConical,
  LayoutDashboard,
  Milk,
  Package,
  Settings,
  Syringe,
  Wallet,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import type { textos } from './textos';

export type GrupoModulo = keyof typeof textos.navegacao.grupos;

export interface DefinicaoModulo {
  id: string;
  rota: string;
  titulo: string;
  descricao: string;
  icone: LucideIcon;
  grupo: GrupoModulo;
  /** Fase do ROADMAP.md em que o módulo é implementado. `null` = disponível na Fase 0. */
  fase: string | null;
  requisitos: string[];
}

/** Catálogo dos módulos, na ordem do menu. Fases conforme ROADMAP.md. */
export const MODULOS: readonly DefinicaoModulo[] = [
  {
    id: 'painel',
    rota: '/',
    titulo: 'Painel',
    descricao: 'Situação do sistema e, nas próximas fases, indicadores do rebanho.',
    icone: LayoutDashboard,
    grupo: 'inicio',
    fase: null,
    requisitos: ['RF-09.1'],
  },
  {
    id: 'rebanho',
    rota: '/rebanho',
    titulo: 'Propriedades e rebanho',
    descricao:
      'Propriedades, áreas, lotes, animais, genealogia, movimentações, pesagens, GMD observado e gráficos de evolução.',
    icone: Beef,
    grupo: 'rebanho',
    fase: null,
    requisitos: ['RF-01.1 a RF-01.6', 'RF-07.3', 'RF-07.5 (parcial)'],
  },
  {
    id: 'manejo',
    rota: '/manejo',
    titulo: 'Sanidade e manejo',
    descricao:
      'Vacinas, vermífugos, tratamentos e exames individuais ou do lote, agenda sanitária, carências, pesagem em lote e alertas de pesagem.',
    icone: Syringe,
    grupo: 'rebanho',
    fase: null,
    requisitos: ['RF-07.1', 'RF-07.2', 'RF-07.3', 'RF-07.4'],
  },
  {
    id: 'leite',
    rota: '/leite',
    titulo: 'Produção leiteira',
    descricao: 'Lactações, ordenhas diárias, vendas de leite e custo por litro.',
    icone: Milk,
    grupo: 'rebanho',
    fase: 'Fase 7',
    requisitos: ['RF-06.1 a RF-06.5'],
  },
  {
    id: 'estoque',
    rota: '/estoque',
    titulo: 'Estoque',
    descricao: 'Rações, silagens, suplementos, medicamentos e outros insumos.',
    icone: Package,
    grupo: 'gestao',
    fase: null,
    requisitos: ['RF-03.1 a RF-03.5'],
  },
  {
    id: 'financeiro',
    rota: '/financeiro',
    titulo: 'Financeiro',
    descricao:
      'Lançamentos com competência, parcelas e pagamentos. Em seguida: fluxo de caixa, compra e venda de animais, rateios e rentabilidade.',
    icone: Wallet,
    grupo: 'gestao',
    fase: null,
    requisitos: ['RF-02.2 (base, Fase 4A)'],
  },
  {
    id: 'alimentos',
    rota: '/alimentos',
    titulo: 'Banco de alimentos',
    descricao:
      'Alimentos, fontes, definições de nutrientes e registros de composição com fonte, base e unidade rastreáveis, conferência e versões. Seleção e cenários na Fase 5D.',
    icone: Wheat,
    grupo: 'nutricao',
    fase: null,
    requisitos: ['RF-05.1 a RF-05.10 (estrutura, Fase 5A)'],
  },
  {
    id: 'nutricao',
    rota: '/nutricao',
    titulo: 'Nutrição de corte',
    descricao:
      'Exigências nutricionais de bovinos de corte em crescimento e terminação pelo BR-CORTE 2023 e avaliação de dietas com perfis de composição gravados. Desempenho previsto e formulação nas próximas etapas.',
    icone: FlaskConical,
    grupo: 'nutricao',
    fase: null,
    requisitos: [
      'RF-04.1, RF-04.3, RF-04.7, RF-04.10, RF-04.12 e RF-04.16 (exigências, Fase 6A)',
      'Avaliação de dietas (Fase 6B)',
    ],
  },
  {
    id: 'simulador',
    rota: '/simulador',
    titulo: 'Simulador econômico',
    descricao: 'Cenários de alimentação, sensibilidade a preços e comparação entre lotes.',
    icone: Calculator,
    grupo: 'analise',
    fase: 'Fase 9',
    requisitos: ['RF-08.1 a RF-08.5'],
  },
  {
    id: 'relatorios',
    rota: '/relatorios',
    titulo: 'Relatórios',
    descricao: 'Indicadores, gráficos e exportação em PDF, XLSX e CSV.',
    icone: FileChartColumn,
    grupo: 'analise',
    fase: 'Fase 10',
    requisitos: ['RF-09.1 a RF-09.4'],
  },
  {
    id: 'configuracoes',
    rota: '/configuracoes',
    titulo: 'Configurações e backup',
    descricao: 'Tema, backups, restauração e informações do sistema.',
    icone: Settings,
    grupo: 'sistema',
    fase: null,
    requisitos: ['RNF-06'],
  },
];

/**
 * Módulo dono de uma rota. Rotas internas (ex.: /rebanho/animais/123) pertencem
 * ao módulo de prefixo mais longo. A raiz "/" só corresponde ao painel exatamente.
 */
export function moduloPorRota(caminho: string): DefinicaoModulo | undefined {
  if (caminho === '/') return MODULOS.find((m) => m.rota === '/');
  return MODULOS.filter(
    (m) => m.rota !== '/' && (caminho === m.rota || caminho.startsWith(`${m.rota}/`)),
  ).sort((a, b) => b.rota.length - a.rota.length)[0];
}
