/**
 * Dados FICTÍCIOS para os testes do banco de alimentos (CLAUDE.md, regra 1): nomes explicitamente
 * de teste e números sem relação com composição real. Servem só para provar as regras de
 * armazenamento, nunca como referência nutricional.
 */
import type { DadosAlimento, DadosFonte, DadosNutriente } from '@pecuaria/shared-types';
import type { AmbienteIpc } from '../../teste/ambiente-ipc';

export const ID_MS = '01929c20-0000-7000-8000-000000000001';

export function dadosFonte(extra: Partial<DadosFonte> = {}): DadosFonte {
  return {
    origem: 'estudo_individual',
    codigo: 'TESTE_ESTUDO',
    titulo: 'Fonte fictícia de teste',
    autores: 'Autoria fictícia',
    ano: 2020,
    edicaoVersao: null,
    instituicaoEditora: null,
    isbnDoiUrl: null,
    dataAcesso: null,
    experimentoOrigem: null,
    laboratorio: null,
    numeroLaudo: null,
    dataLaudo: null,
    fabricante: null,
    registroProduto: null,
    metodoMedicao: null,
    limitacoesMedicao: null,
    propriedadeId: null,
    observacoes: null,
    ...extra,
  };
}

export function dadosNutriente(extra: Partial<DadosNutriente> = {}): DadosNutriente {
  return {
    codigo: 'TESTE_A',
    nome: 'Nutriente de teste A',
    grupo: 'outro',
    unidadeReferencia: 'pct',
    baseReferencia: 'ms',
    direcaoConservadora: 'nao_definida',
    metodoAnalitico: null,
    situacaoFundamentacao: 'pendente',
    fundamentacaoFonteId: null,
    fundamentacaoReferencia: null,
    descricao: null,
    ativo: true,
    ...extra,
  };
}

export function dadosAlimento(extra: Partial<DadosAlimento> = {}): DadosAlimento {
  return {
    nome: 'Alimento de teste',
    especie: null,
    cultivar: null,
    partePlanta: null,
    formaConservacao: 'outro',
    processamento: null,
    classe: 'outro',
    comercial: false,
    observacoes: null,
    ...extra,
  };
}

export async function criarPropriedade(amb: AmbienteIpc, nome = 'Fazenda de teste') {
  return amb.ok('propriedade:criar', {
    dados: {
      nome,
      municipio: null,
      uf: null,
      areaTotalHa: null,
      tipoExploracao: 'misto',
      observacoes: null,
    },
  });
}
