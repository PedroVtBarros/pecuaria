import { describe, expect, it } from 'vitest';
import { apurarComponentes } from '@pecuaria/domain';
import { gerarCsv, reaisCsv, textoCsv } from './csv';
import { escapar, gerarHtml } from './html';
import { AVISO_FIXO, type Relatorio } from './modelo';

const completa = (v: number) => apurarComponentes([{ tipo: 'conhecido', valorCentavos: v }]);
const parcial = (v: number) =>
  apurarComponentes([{ tipo: 'conhecido', valorCentavos: v }, { tipo: 'desconhecido' }]);
const desconhecida = () => apurarComponentes([{ tipo: 'desconhecido' }]);
const naoApurada = () => apurarComponentes([{ tipo: 'nao_apurado' }]);

const relatorio: Relatorio = {
  titulo: 'Resultado do período',
  visao: 'Resultado',
  propriedade: 'Fazenda São João; "Sede"',
  periodo: '01/10/2026 a 31/10/2026',
  geradoEm: '17/10/2026, 10:00:00',
  avisos: ['=SOMA(A1:A2)'],
  nomeArquivo: 'resultado',
  secoes: [
    {
      titulo: 'Totais',
      indicadores: [
        { rotulo: 'Receita', valor: 123456, tipo: 'dinheiro' },
        { rotulo: 'Resultado', valor: -5, tipo: 'dinheiro', observacao: 'parcial' },
      ],
    },
    {
      titulo: 'Linhas',
      colunas: [
        { rotulo: 'Descrição', tipo: 'texto' },
        { rotulo: 'Data', tipo: 'data' },
        { rotulo: 'Valor', tipo: 'dinheiro' },
        { rotulo: 'Custo', tipo: 'apuracao' },
        { rotulo: 'Quantidade', tipo: 'quantidade' },
        { rotulo: 'Animais', tipo: 'inteiro' },
      ],
      linhas: [
        ['Ração "boa"; lote 1', '2026-10-05', 40000, { apuracao: completa(40000) }, 1234.5, 3],
        ['+55 99 dívida', '2026-10-06', null, { apuracao: parcial(1000) }, null, 0],
        ['@comando\nsegunda linha', '2026-10-07', -1, { apuracao: desconhecida() }, 0.001, null],
        ['\tTabulação', '2026-10-08', 0, { apuracao: naoApurada() }, 2, 1],
      ],
    },
    {
      titulo: 'Vazia',
      colunas: [{ rotulo: 'X', tipo: 'texto' }],
      linhas: [],
      vazio: 'Nada; nada.',
    },
  ],
};

describe('CSV', () => {
  it('protege texto livre contra fórmula e aspas, sem tocar números', () => {
    expect(textoCsv('=1+1')).toBe("'=1+1");
    expect(textoCsv('+1')).toBe("'+1");
    expect(textoCsv('-1')).toBe("'-1");
    expect(textoCsv('@x')).toBe("'@x");
    expect(textoCsv('\tx')).toBe("'\tx");
    expect(textoCsv('\rx')).toBe('"\'\rx"');
    expect(textoCsv('a;b')).toBe('"a;b"');
    expect(textoCsv('diz "oi"')).toBe('"diz ""oi"""');
    expect(textoCsv('Ração')).toBe('Ração');
    expect(reaisCsv(123456)).toBe('1234,56');
    expect(reaisCsv(-5)).toBe('-0,05');
    expect(reaisCsv(0)).toBe('0,00');
  });

  it('gera o arquivo byte a byte: BOM, ";", CRLF, dinheiro em centavos e reais, ausente nunca zero', () => {
    const esperado =
      '﻿' +
      [
        'Relatório;Resultado do período',
        'Visão;Resultado',
        'Propriedade;"Fazenda São João; ""Sede"""',
        'Período;01/10/2026 a 31/10/2026',
        'Gerado em;17/10/2026, 10:00:00',
        `Aviso;${AVISO_FIXO}`,
        "Atenção;'=SOMA(A1:A2)",
        '',
        'Totais',
        'Receita;123456;1234,56',
        'Resultado;-5;-0,05;parcial',
        '',
        'Linhas',
        'Descrição;Data;Valor (centavos);Valor (R$);Custo (centavos);Custo (R$);Custo (situação);Quantidade;Animais',
        '"Ração ""boa""; lote 1";2026-10-05;40000;400,00;40000;400,00;completo;1234,5;3',
        "'+55 99 dívida;2026-10-06;;desconhecido;1000;10,00;parcial (no mínimo);;0",
        '"\'@comando\nsegunda linha";2026-10-07;-1;-0,01;;desconhecido;desconhecido;0,001;',
        "'\tTabulação;2026-10-08;0;0,00;;não apurado;não apurado;2;1",
        '',
        'Vazia',
        'X',
        '"Nada; nada."',
      ].join('\r\n') +
      '\r\n';
    expect(gerarCsv(relatorio)).toBe(esperado);
  });
});

describe('HTML (base do PDF)', () => {
  it('escapa todo texto e não tem script, imagem nem recurso externo', () => {
    const html = gerarHtml({
      ...relatorio,
      titulo: '<script>alert(1)</script>',
      secoes: [{ titulo: 'Seção <b>', descricao: '"aspas" & \'apóstrofo\'' }],
    });
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Seção &lt;b&gt;');
    expect(html).toContain('&quot;aspas&quot; &amp; &#39;apóstrofo&#39;');
    expect(html).toContain(`content="default-src 'none'; style-src 'unsafe-inline'"`);
    expect(html).not.toMatch(/<img|<link|https?:\/\//i);
    expect(escapar('<&>"\'')).toBe('&lt;&amp;&gt;&quot;&#39;');
  });

  it('mostra visão no título e no rodapé, ausente como "Sem dado" ou "Custo desconhecido", parcial como "no mínimo"', () => {
    const html = gerarHtml(relatorio);
    expect(html).toContain('<title>Resultado do período (Resultado)</title>');
    expect(html).toContain('<span class="visao">Resultado</span>');
    expect(html).toContain(`${AVISO_FIXO} Visão: Resultado.`);
    expect(html).toMatch(/<td class="num">Sem dado<\/td>/);
    expect(html).toMatch(/no mínimo R\$\s*10,00/);
    expect(html).toContain('Custo desconhecido');
    expect(html).toContain('Não apurado');
    expect(html).toContain('05/10/2026');
    expect(html).toContain('Nada; nada.');
  });
});
