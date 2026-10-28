import { describe, expect, it } from 'vitest';
import {
  aceitaNaoQuantificado,
  NATUREZAS_NAO_QUANTIFICADO,
  ORIGENS_FONTE,
  problemasDoNaoQuantificado,
  type ContextoNaoQuantificado,
  type NaoQuantificadoParaConferir,
} from '../src';

/*
 * Textos e significados fictícios: provam as regras de armazenamento, não representam a legenda
 * de nenhuma fonte real (CLAUDE.md, regra 1).
 */
const ctx: ContextoNaoQuantificado = {
  origem: 'laboratorial',
  unidadeReferencia: 'pct',
  codigoNutriente: 'TESTE_A',
  separador: 'virgula',
};
const base: NaoQuantificadoParaConferir = {
  textoPublicado: 'ND',
  natureza: 'nao_detectado',
  significadoFonte: 'Legenda fictícia: ND = não detectado.',
  unidade: 'pct',
  tipoValor: 'valor_unico',
};
const problemas = (
  v: Partial<NaoQuantificadoParaConferir>,
  c: Partial<ContextoNaoQuantificado> = {},
) => problemasDoNaoQuantificado({ ...base, ...v }, { ...ctx, ...c });

describe('valor não quantificado (ajuste da aprovação da 5A)', () => {
  it('aceita o texto como publicado com o significado da fonte', () => {
    expect(problemas({})).toEqual([]);
    expect(problemas({ textoPublicado: 'traços', natureza: 'tracos' })).toEqual([]);
    expect(problemas({ textoPublicado: 'n.d.', natureza: 'nao_determinado' })).toEqual([]);
    expect(problemas({ textoPublicado: '*', natureza: 'simbolo_sem_definicao' })).toEqual([]);
    expect(problemas({ textoPublicado: '<0,01', natureza: 'abaixo_do_limite' })).toEqual([]);
    expect(problemas({ textoPublicado: '≤ 5', natureza: 'abaixo_do_limite' })).toEqual([]);
    expect(problemas({ textoPublicado: '>1.000', natureza: 'acima_do_limite' })).toEqual([]);
  });

  it('número legível não é não quantificado: vai para o valor numérico', () => {
    expect(problemas({ textoPublicado: '0,01' })).toEqual([
      'O texto é um número: registre como valor numérico.',
    ]);
    // Com ponto decimal, "0.01" também é número; com vírgula decimal, "0.01" não é.
    expect(problemas({ textoPublicado: '0.01' }, { separador: 'ponto' })).toHaveLength(1);
  });

  it('o símbolo do limite combina com a natureza, e o limite segue o separador da fonte', () => {
    expect(problemas({ textoPublicado: 'ND', natureza: 'abaixo_do_limite' })).toEqual([
      'Abaixo do limite: o texto começa com "<" ou "≤", como na fonte.',
    ]);
    expect(problemas({ textoPublicado: '<0,01', natureza: 'acima_do_limite' })).toHaveLength(1);
    expect(problemas({ textoPublicado: '<0,01', natureza: 'nao_detectado' })).toEqual([
      'Texto com "<" ou ">" é um limite: escolha "abaixo do limite" ou "acima do limite".',
    ]);
    expect(problemas({ textoPublicado: '<', natureza: 'abaixo_do_limite' })).toHaveLength(1);
    expect(
      problemas({ textoPublicado: '<0,01', natureza: 'abaixo_do_limite' }, { separador: 'ponto' }),
    ).toEqual([
      'Depois do símbolo vem o limite como publicado, com o separador decimal do registro.',
    ]);
  });

  it('significado da fonte obrigatório, texto curto, unidade da mesma grandeza', () => {
    expect(problemas({ significadoFonte: '  ' })).toHaveLength(1);
    expect(problemas({ significadoFonte: 'x'.repeat(501) })).toEqual(['Significado longo demais.']);
    expect(problemas({ textoPublicado: '' })).toHaveLength(1);
    expect(problemas({ textoPublicado: 'N'.repeat(31) })).toEqual([
      'Texto publicado longo demais.',
    ]);
    expect(problemas({ unidade: 'mcal_kg' })[0]).toMatch(/mesma grandeza/);
    expect(problemas({ unidade: 'mg_kg' })).toEqual([]);
  });

  it('só tabela, estudo e laudo; nunca garantia; tipo de valor pela origem', () => {
    expect(ORIGENS_FONTE.filter(aceitaNaoQuantificado)).toEqual([
      'tabela_compilada',
      'estudo_individual',
      'laboratorial',
    ]);
    expect(problemas({}, { origem: 'rotulo_comercial' })).toContain(
      'Só tabela, estudo e laudo registram valor não quantificado.',
    );
    expect(problemas({}, { origem: 'medicao_propria' })).toHaveLength(1);
    expect(problemas({ tipoValor: 'minimo_garantido' })).toEqual([
      'Tipo de valor incompatível com a origem.',
    ]);
    // Laudo não publica mediana; tabela compilada pode.
    expect(problemas({ tipoValor: 'mediana' })).toHaveLength(1);
    expect(problemas({ tipoValor: 'mediana' }, { origem: 'tabela_compilada' })).toEqual([]);
  });

  it('todas as naturezas têm regra: limites com símbolo, as demais sem', () => {
    for (const natureza of NATUREZAS_NAO_QUANTIFICADO) {
      const limite = natureza === 'abaixo_do_limite' || natureza === 'acima_do_limite';
      const texto = natureza === 'acima_do_limite' ? '>5' : limite ? '<5' : 'ND';
      expect(problemas({ textoPublicado: texto, natureza }), natureza).toEqual([]);
    }
  });
});
