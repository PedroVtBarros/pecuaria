/** Textos da devolução de animais (revisão final da Fase 4). */
export const textosDevolucao = {
  venda: {
    botao: 'Registrar devolução do comprador',
    titulo: 'Devolução de animais pelo comprador',
    descricao:
      'Os animais escolhidos voltam ao rebanho na data da devolução; a venda e a saída continuam no histórico. O que ainda está a receber desta venda é compensado (sem caixa) e só o restante fica a reembolsar.',
    restante: 'Reembolso ao comprador (restante)',
    restanteAjuda:
      'Saída de caixa só quando o reembolso for pago. Nada é registrado como pago sem a sua confirmação.',
  },
  compra: {
    botao: 'Registrar devolução ao fornecedor',
    titulo: 'Devolução de animais ao fornecedor',
    descricao:
      'Os animais escolhidos saem do rebanho na data da devolução. O que ainda está a pagar desta compra é compensado (sem caixa) e só o restante fica a recuperar do fornecedor. A diferença para o custo do animal não é tratada como lucro de venda.',
    restante: 'Valor a recuperar do fornecedor (restante)',
    restanteAjuda:
      'Entrada de caixa só quando o valor for recebido. Nada é registrado como recebido sem a sua confirmação.',
  },
  valorAcordado: (animal: string) => `Valor acordado de ${animal}`,
  usarOriginal: 'Usar o valor original',
  sugestao: (valor: string) =>
    `Valor original do animal: ${valor}. O valor da devolução é o que foi acordado; confirme ou digite outro.`,
  semValor: 'Informe o valor acordado de cada animal escolhido.',
  semAnimal: 'Escolha ao menos um animal.',
  calcular: 'Calcular prévia',
  previaDesatualizada: 'Calcule a prévia de novo: os dados mudaram.',
  semPrevia: 'Calcule a prévia antes de registrar.',
  registrar: 'Registrar devolução',
  loteRetorno: 'Lote para onde os animais voltam',
  semLote: 'Sem lote',
  secao: 'Devoluções',
  nenhuma: 'Nenhuma devolução registrada nesta negociação.',
  cancelar: 'Cancelar devolução',
  cancelarDescricao:
    'Desfaz o retorno (ou a saída) dos animais, as compensações e o lançamento da devolução. Nada é apagado. Pagamentos ou recebimentos do restante precisam ser estornados antes, e o animal não pode ter fatos registrados depois da devolução.',
  rotulos: {
    acordado: 'Valor acordado',
    original: 'Valor original dos animais',
    diferenca: 'Diferença do original',
    emAberto: 'Em aberto hoje na negociação original',
    liquidado: 'Já liquidado em caixa na original',
    compensado: 'Compensado (sem caixa)',
    restante: 'Restante',
  },
} as const;
