import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { dadosAlimento, dadosFonte } from '../services/alimentos/apoio-teste-alimentos';
import { MIGRACOES_DO_PROJETO, type Conexao } from '@pecuaria/database';
import { resolverCaminhos } from '../caminhos';
import { criarAmbienteIpc, type AmbienteIpc } from '../teste/ambiente-ipc';

/*
 * D-0018-01 (aprovação de 2026-10-26): reconstrução de valor_nutricional verificada numa cópia de
 * banco com dados legados. O banco é montado na versão 17 (como o aplicativo anterior à 0018) com
 * registros FICTÍCIOS (na versão pública; a privada usa os pacotes de curadoria), registros
 * conferidos, valores excluídos, versão nova, avaliação científica, regra aprovada e perfis; depois
 * é aberto com todas as migrations, como a versão nova do aplicativo.
 *
 * Com PECUARIA_COPIA_LEGADO apontando para a CÓPIA de um banco real (nunca o original), o teste
 * parte dela: a cópia é copiada de novo para a pasta temporária e só essa segunda cópia é aberta.
 */
let amb: AmbienteIpc | undefined;
afterEach(() => amb?.encerrar());

const ATE_17 = MIGRACOES_DO_PROJETO.slice(0, 17);
const linhas = (c: Conexao, t: string) =>
  c.prepare(`SELECT rowid AS _rowid, * FROM ${t} ORDER BY rowid`).all() as Record<
    string,
    unknown
  >[];
const tabelas = (c: Conexao) =>
  (
    c
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_migracoes' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((t) => t.name);
const retrato = (c: Conexao) => Object.fromEntries(tabelas(c).map((t) => [t, linhas(c, t)]));

/** Registros FICTÍCIOS transcritos (números sem relação com composição real; CLAUDE.md, regra 1). */
async function transcreverFicticios(a: AmbienteIpc, quantidade: number) {
  const nut = Object.fromEntries(
    (await a.ok('nutriente:listar', {})).map((n) => [n.codigo, n.id] as const),
  );
  for (let k = 1; k <= quantidade; k++) {
    const fonte = await a.ok('fonte:criar', {
      dados: dadosFonte({ codigo: `FICT_LEGADO_${k}`, titulo: `Fonte FICTÍCIA ${k}` }),
    });
    const alimento = await a.ok('alimento:criar', {
      dados: dadosAlimento({
        nome: `Alimento FICTÍCIO ${k}`,
        especie: 'Especie FICTÍCIA',
        cultivar: null,
        formaConservacao: 'fresco',
        classe: 'volumoso',
      }),
    });
    const r = await a.ok('composicao:criar', {
      dados: {
        alimentoId: alimento.id,
        fonteId: fonte.id,
        referenciaLocal: `Tabela FICTÍCIA ${k}`,
        idadeCorteDias: 60,
        classeIdadeFonte: null,
        aditivoEnsilagem: null,
        regiao: null,
        estacao: null,
        adubacao: null,
        outrasCondicoes: null,
        nObservacoes: null,
        separadorDecimal: 'virgula',
        dataAmostra: null,
        identificacaoAmostra: null,
        observacoes: null,
      },
    });
    for (const [codigo, texto] of [
      ['MS', '40,0'],
      ['NDT', '60,0'],
      ['PB', '10,0'],
      ['FDN', '50,0'],
      ['Ca', '0,40'],
      ['P', '0,20'],
    ] as const)
      await a.ok('composicao:salvarValor', {
        registroId: r.registro.id,
        valorId: null,
        dados: {
          nutrienteId: nut[codigo]!,
          valorPublicado: texto,
          unidade: 'pct',
          base: codigo === 'MS' ? 'mn' : 'ms',
          tipoValor: 'media',
          desvioPadraoPublicado: null,
          minimoPublicado: null,
          maximoPublicado: null,
          nObservacoes: null,
          metodoAnaliticoFonte: null,
          formaObtencao: 'medido',
          descricaoObtencao: null,
          interpretacaoBase: null,
          referenciaLocal: null,
          observacao: null,
        },
      });
    await a.ok('composicao:transcrever', { id: r.registro.id, responsavel: 'Pessoa A' });
  }
}

async function montarLegado(): Promise<AmbienteIpc> {
  const pasta = mkdtempSync(join(tmpdir(), 'pecuaria-legado-'));
  const copia = process.env['PECUARIA_COPIA_LEGADO'];
  if (copia) {
    const destino = resolverCaminhos(pasta).banco;
    mkdirSync(dirname(destino), { recursive: true });
    copyFileSync(copia, destino);
  }
  const a = await criarAmbienteIpc({ pasta, migracoes: ATE_17, hoje: new Date(2026, 9, 20, 9) });
  expect(a.gerenciador.conexao.pragma('user_version', { simple: true })).toBe(17);
  // Dados como o aplicativo da versão 17 grava: tudo pelos canais. Versão pública: registros
  // FICTÍCIOS no lugar dos pacotes de curadoria (dados restritos a uso pessoal, não distribuídos).
  await transcreverFicticios(a, 20);
  const transcritos = await a.ok('composicao:listar', {
    alimentoId: null,
    fonteId: null,
    status: 'transcrito',
    origem: null,
    propriedadeId: null,
    somenteDaPropriedade: false,
  });
  expect(transcritos.length).toBeGreaterThan(10);
  for (const r of transcritos)
    await a.ok('composicao:conferir', { id: r.id, responsavel: 'Pessoa conferente' });
  // Versão nova com um valor excluído (linha com deleted_at na tabela reconstruída).
  const alvo = transcritos[0]!;
  const nova = await a.ok('composicao:novaVersao', { id: alvo.id, motivo: 'Revisão de teste' });
  await a.ok('composicao:removerValor', {
    registroId: nova.registro.id,
    valorId: nova.valores[0]!.id,
  });
  await a.ok('avaliacao:marcar', {
    registroId: transcritos[1]!.id,
    valorId: null,
    tipo: 'uso_com_cautela',
    motivo: 'Motivo de teste.',
    responsavel: 'Pessoa usuária',
  });
  await a.ok('selecao:aprovarRegra', {
    codigo: 'SELECAO_5D',
    versao: 2,
    responsavel: 'Pessoa usuária',
    observacao: null,
  });
  let perfis = 0;
  for (const r of transcritos.slice(1, 9)) {
    const g = await a.chamar('perfil:gravar', {
      alimentoId: r.alimentoId,
      idadeCorteDias: r.idadeCorteDias,
      escolhas: [],
      tipo: 'referencia_individual',
      registroId: r.id,
      nutrienteId: null,
      sentido: null,
      nome: `Perfil de teste ${r.referenciaLocal ?? r.id}`,
      responsavel: 'Pessoa usuária',
    });
    if (g.ok) perfis += 1;
  }
  expect(perfis).toBeGreaterThan(0);
  return a;
}

describe('D-0018-01: migrations 0018 e 0019 numa cópia com dados legados', () => {
  it('reconstrói valor_nutricional sem perder nem mudar nada; backup pré-migração restaura', async () => {
    amb = await montarLegado();
    const c17 = amb.gerenciador.conexao;
    const antes = retrato(c17);
    expect(antes['valor_nutricional']!.length).toBeGreaterThan(100);
    expect(antes['valor_nutricional']!.some((v) => v['deleted_at'] !== null)).toBe(true);
    expect(antes['perfil_valor_origem']!.length).toBeGreaterThan(0);

    // Versão nova do aplicativo: aplica a 0018 e a 0019, com backup pré-migração.
    await amb.reiniciar();
    const c = amb.gerenciador.conexao;
    expect(c.pragma('user_version', { simple: true })).toBe(MIGRACOES_DO_PROJETO.length);
    const depois = retrato(c);
    for (const t of Object.keys(antes).filter((t) => t !== 'nutriente'))
      expect(depois[t], t).toEqual(antes[t]);
    expect(depois['nutriente']!.map(({ natureza_valor: _n, ...resto }) => resto)).toEqual([
      ...antes['nutriente']!,
      expect.objectContaining({ codigo: 'PBeqNNP' }),
    ]);
    expect(c.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(c.pragma('foreign_key_check')).toEqual([]);
    // Resumo só na verificação manual com cópia real (vai para o relatório da entrega).
    if (process.env['PECUARIA_COPIA_LEGADO'])
      console.warn(
        'Cópia legada:',
        Object.fromEntries(
          [
            'valor_nutricional',
            'registro_composicao',
            'perfil_valor_origem',
            'avaliacao_cientifica',
          ].map((t) => [t, antes[t]!.length]),
        ),
        'excluídos:',
        antes['valor_nutricional']!.filter((v) => v['deleted_at'] !== null).length,
      );

    const pre = (await amb.ok('backup:listar', {})).find(
      (b) => b.tipo === 'pre_migracao' && b.versaoSchema === 17,
    );
    expect(pre).toBeDefined();
    // Os perfis legados seguem utilizáveis: a avaliação lê os valores da tabela reconstruída.
    const perfil = (await amb.ok('perfil:listar', { alimentoId: null }))[0]!;
    const av = await amb.ok('nutricao:avaliarDieta', {
      animal: {
        grupo: 'zebuino',
        sexo: 'macho_nao_castrado',
        sistema: 'confinamento',
        pcKg: 400,
        gmdKgDia: 1,
      },
      cmsPrevisto: { fonte: 'confinamento' },
      dieta: {
        tipo: 'consumo_assumido_sem_sobras',
        itens: [{ perfilId: perfil.id, quantidadeKgDia: 10, base: 'ms', sobrasKgDia: null }],
      },
    });
    expect(av.perfis[0]!.valores.length).toBeGreaterThan(0);

    // Restaurar o backup pré-migração reaplica 0018 e 0019 e chega ao mesmo banco.
    await amb.ok('backup:restaurar', { id: pre!.id });
    const r = amb.gerenciador.conexao;
    expect(r.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(r.pragma('foreign_key_check')).toEqual([]);
    const restaurado = retrato(r);
    for (const t of Object.keys(antes).filter(
      (t) => t !== 'nutriente' && t !== 'historico_alteracao',
    ))
      expect(restaurado[t], t).toEqual(antes[t]);
  });
});
