/**
 * Textos da interface, centralizados (REQUISITOS.md, RNF-12).
 * Idioma único por enquanto: pt-BR.
 */
export const textos = {
  app: {
    nome: 'Gestão Pecuária',
    subtitulo: 'Uso pessoal · offline',
  },
  navegacao: {
    grupos: {
      inicio: 'Início',
      rebanho: 'Rebanho e produção',
      gestao: 'Gestão',
      nutricao: 'Nutrição',
      analise: 'Análise',
      sistema: 'Sistema',
    },
  },
  cabecalho: {
    propriedade: 'Propriedade',
    semPropriedade: 'Nenhuma propriedade cadastrada',
    propriedadeDisponivelNaFase: 'O cadastro de propriedades chega na Fase 1.',
    tema: 'Tema',
  },
  tema: {
    claro: 'Claro',
    escuro: 'Escuro',
    sistema: 'Sistema',
  },
  moduloPlanejado: {
    planejadoPara: (fase: string) =>
      fase.startsWith('Fases') ? `Planejado para as ${fase}` : `Planejado para a ${fase}`,
    explicacao:
      'Este módulo ainda não foi implementado. Cada fase do roadmap só começa depois da aprovação da anterior.',
    requisitos: 'Requisitos atendidos por este módulo',
    semFuncionalidade: 'Nenhuma funcionalidade de negócio está ativa nesta fase.',
  },
  painel: {
    titulo: 'Painel',
    boasVindas: 'Bem-vindo ao Gestão Pecuária',
    descricao:
      'Rebanho, pesagens com GMD observado, sanidade e agenda já estão disponíveis. Os demais indicadores aparecem conforme os módulos forem implementados.',
    situacao: 'Situação do sistema',
    banco: 'Banco de dados',
    ultimoBackup: 'Último backup',
    nenhumBackup: 'Nenhum backup ainda',
    ambiente: 'Ambiente',
    modulos: 'Módulos do sistema',
    disponivel: 'Disponível',
    versaoSchema: (v: number) => `Schema versão ${v}`,
  },
  configuracoes: {
    titulo: 'Configurações e backup',
    aparencia: 'Aparência',
    aparenciaDescricao: 'Escolha o tema da interface. A escolha fica salva no banco de dados.',
    backups: 'Backups',
    backupsDescricao:
      'Backups são cópias verificadas do banco de dados. Um backup automático é feito por dia ao abrir o aplicativo, e sempre antes de atualizar o banco ou restaurar outro backup.',
    criarBackup: 'Criar backup agora',
    restaurarDeArquivo: 'Restaurar de arquivo…',
    abrirPastaBackups: 'Abrir pasta',
    nenhumBackup: 'Nenhum backup encontrado.',
    colunas: {
      data: 'Data',
      tipo: 'Tipo',
      tamanho: 'Tamanho',
      schema: 'Schema',
      observacao: 'Observação',
      acoes: 'Ações',
    },
    restaurar: 'Restaurar',
    exportar: 'Exportar',
    tipos: {
      automatico: 'Automático',
      manual: 'Manual',
      pre_migracao: 'Antes de atualização',
      pre_restauracao: 'Antes de restauração',
      importado: 'Importado',
    },
    confirmarRestauracaoTitulo: 'Restaurar backup?',
    confirmarRestauracaoTexto: (data: string) =>
      `Os dados atuais serão substituídos pelos dados do backup de ${data}. Antes disso, um backup de segurança do estado atual será criado automaticamente.`,
    confirmarRestauracaoBotao: 'Restaurar',
    backupCriado: 'Backup criado e verificado.',
    backupRestaurado: 'Backup restaurado. Um backup de segurança do estado anterior foi criado.',
    backupExportado: (caminho: string) => `Backup exportado para ${caminho}.`,
    sistema: 'Sistema',
    sistemaDescricao: 'Versões, locais dos arquivos e histórico de atualizações do banco.',
    versoes: 'Versões',
    caminhos: 'Locais dos arquivos',
    migracoes: 'Atualizações do banco aplicadas',
    abrir: 'Abrir',
  },
  geral: {
    cancelar: 'Cancelar',
    fechar: 'Fechar',
    carregando: 'Carregando…',
    erroInesperado: 'Algo deu errado nesta tela.',
    erroInesperadoDetalhe: 'O erro foi registrado no log do aplicativo. Tente voltar ao painel.',
    voltarAoPainel: 'Voltar ao painel',
    paginaNaoEncontrada: 'Página não encontrada.',
  },
} as const;
