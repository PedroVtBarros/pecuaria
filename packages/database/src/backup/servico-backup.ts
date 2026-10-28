import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import {
  ErroAplicacao,
  esquemaIdBackup,
  type InfoBackup,
  type ResultadoRestauracao,
  type TipoBackup,
} from '@pecuaria/shared-types';
import {
  abrirConexao,
  ID_APLICACAO,
  lerIdAplicacao,
  lerVersaoSchema,
  type Conexao,
} from '../conexao';
import type { GerenciadorBanco } from '../gerenciador-banco';
import type { Logger } from '../logger';
import { escreverArquivoAtomico, mensagemDeErro, sha256Arquivo } from '../util';
import {
  chaveDia,
  POLITICA_RETENCAO_PADRAO,
  selecionarBackupsParaRemover,
  type PoliticaRetencao,
} from './retencao';

export interface OpcoesServicoBackup {
  gerenciador: GerenciadorBanco;
  pastaBackups: string;
  versaoApp: string;
  logger: Logger;
  relogio?: () => Date;
  politica?: PoliticaRetencao;
}

interface Manifesto extends InfoBackup {
  formato: 1;
}

const SUFIXOS_AUXILIARES = ['-wal', '-shm', '-journal'] as const;

function doisDigitos(n: number, tamanho = 2): string {
  return String(n).padStart(tamanho, '0');
}

/** Nome do arquivo de backup, em horário local: pecuaria_AAAAMMDD-HHMMSS-mmm_tipo.db */
export function gerarIdBackup(
  data: Date,
  tipo: TipoBackup,
  existentes: ReadonlySet<string>,
): string {
  const base =
    `pecuaria_${data.getFullYear()}${doisDigitos(data.getMonth() + 1)}${doisDigitos(data.getDate())}` +
    `-${doisDigitos(data.getHours())}${doisDigitos(data.getMinutes())}${doisDigitos(data.getSeconds())}` +
    `-${doisDigitos(data.getMilliseconds(), 3)}_${tipo}`;
  let id = `${base}.db`;
  for (let n = 1; existentes.has(id); n++) id = `${base}-${n}.db`;
  return id;
}

/**
 * Backup e restauração do banco operacional (ROADMAP.md, seção 4).
 *
 * - Backups usam a API de backup online do SQLite, nunca cópia do arquivo aberto.
 * - Cada backup é convertido para journal_mode=DELETE, para ser um arquivo único.
 * - Cada backup tem um manifesto JSON ao lado, com hash SHA-256 e versão do schema.
 *   O manifesto fica fora do banco de propósito: restaurar um backup antigo
 *   não pode apagar o registro dos backups mais novos.
 * - Operações que alteram arquivos rodam em série.
 */
export class ServicoBackup {
  private readonly opcoes: OpcoesServicoBackup;
  private readonly relogio: () => Date;
  private fila: Promise<unknown> = Promise.resolve();

  constructor(opcoes: OpcoesServicoBackup) {
    this.opcoes = opcoes;
    this.relogio = opcoes.relogio ?? (() => new Date());
  }

  get pasta(): string {
    return this.opcoes.pastaBackups;
  }

  private emSerie<T>(operacao: () => Promise<T>): Promise<T> {
    const resultado = this.fila.then(operacao, operacao);
    this.fila = resultado.catch(() => undefined);
    return resultado;
  }

  private caminhoDe(id: string): string {
    const validado = esquemaIdBackup.safeParse(id);
    if (!validado.success) {
      throw new ErroAplicacao('ENTRADA_INVALIDA', 'Identificador de backup inválido.');
    }
    return join(this.opcoes.pastaBackups, id);
  }

  private static caminhoManifesto(caminhoBackup: string): string {
    return caminhoBackup.replace(/\.db$/, '.json');
  }

  // -------------------------------------------------------------------------
  // Consulta
  // -------------------------------------------------------------------------

  async listar(): Promise<InfoBackup[]> {
    if (!existsSync(this.opcoes.pastaBackups)) return [];
    const backups: InfoBackup[] = [];
    for (const arquivo of readdirSync(this.opcoes.pastaBackups)) {
      if (!arquivo.endsWith('.json') || arquivo.endsWith('.tmp')) continue;
      const caminhoManifesto = join(this.opcoes.pastaBackups, arquivo);
      try {
        const manifesto = JSON.parse(readFileSync(caminhoManifesto, 'utf8')) as Manifesto;
        if (manifesto.formato !== 1 || !existsSync(this.caminhoDe(manifesto.id))) continue;
        const { formato: _formato, ...info } = manifesto;
        backups.push(info);
      } catch (erro) {
        this.opcoes.logger.aviso('Manifesto de backup ignorado', {
          arquivo,
          erro: mensagemDeErro(erro),
        });
      }
    }
    return backups.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  // -------------------------------------------------------------------------
  // Criação
  // -------------------------------------------------------------------------

  criar(tipo: 'manual' | 'automatico', observacao?: string): Promise<InfoBackup> {
    return this.emSerie(() =>
      this.criarDaConexao(this.opcoes.gerenciador.conexao, tipo, observacao),
    );
  }

  /** Cria o backup automático do dia, se ainda não existir. */
  backupAutomaticoDiario(): Promise<InfoBackup | null> {
    return this.emSerie(async () => {
      const hoje = chaveDia(this.relogio());
      const existentes = await this.listar();
      const jaExiste = existentes.some(
        (b) => b.tipo === 'automatico' && chaveDia(new Date(b.criadoEm)) === hoje,
      );
      if (jaExiste) return null;
      return this.criarDaConexao(this.opcoes.gerenciador.conexao, 'automatico');
    });
  }

  /**
   * Cria backup a partir de uma conexão explícita. Não passa pela fila, porque é
   * chamado também de dentro de operações em série (pré-migração e pré-restauração).
   */
  async criarDaConexao(db: Conexao, tipo: TipoBackup, observacao?: string): Promise<InfoBackup> {
    mkdirSync(this.opcoes.pastaBackups, { recursive: true });
    const agora = this.relogio();
    const id = gerarIdBackup(agora, tipo, new Set(readdirSync(this.opcoes.pastaBackups)));
    const destino = join(this.opcoes.pastaBackups, id);
    const parcial = `${destino}.parcial`;

    try {
      await db.backup(parcial);
      const { versaoSchema } = this.prepararEVerificarArquivo(parcial);
      const info = await this.registrarArquivo(parcial, destino, {
        id,
        tipo,
        criadoEm: agora.toISOString(),
        versaoSchema,
        observacao: observacao?.trim() ? observacao.trim() : null,
      });
      this.opcoes.logger.info('Backup criado', { id, tipo, tamanhoBytes: info.tamanhoBytes });
      if (tipo !== 'manual' && tipo !== 'importado') this.aplicarRetencao();
      return info;
    } catch (erro) {
      this.removerComAuxiliares(parcial);
      this.opcoes.logger.erro('Falha ao criar backup', { tipo, erro });
      throw erro;
    }
  }

  private async registrarArquivo(
    parcial: string,
    destino: string,
    dados: Pick<InfoBackup, 'id' | 'tipo' | 'criadoEm' | 'versaoSchema' | 'observacao'>,
  ): Promise<InfoBackup> {
    const hashSha256 = await sha256Arquivo(parcial);
    const tamanhoBytes = statSync(parcial).size;
    renameSync(parcial, destino);
    const info: InfoBackup = {
      ...dados,
      hashSha256,
      tamanhoBytes,
      versaoApp: this.opcoes.versaoApp,
    };
    const manifesto: Manifesto = { formato: 1, ...info };
    escreverArquivoAtomico(
      ServicoBackup.caminhoManifesto(destino),
      JSON.stringify(manifesto, null, 2),
    );
    return info;
  }

  /**
   * Converte o arquivo para journal_mode=DELETE (arquivo único, sem -wal/-shm)
   * e verifica integridade, identidade e versão do schema.
   */
  private prepararEVerificarArquivo(caminho: string): { versaoSchema: number } {
    let db: Conexao | null = null;
    try {
      db = abrirConexao(caminho, { deveExistir: true });
      db.pragma('journal_mode = DELETE');
      return this.verificarConexao(db);
    } finally {
      db?.close();
      for (const sufixo of SUFIXOS_AUXILIARES) rmSync(`${caminho}${sufixo}`, { force: true });
    }
  }

  private verificarConexao(db: Conexao): { versaoSchema: number } {
    if (lerIdAplicacao(db) !== ID_APLICACAO) {
      throw new ErroAplicacao(
        'BACKUP_INVALIDO',
        'O arquivo não é um banco de dados deste aplicativo.',
      );
    }
    const integridade = db.pragma('integrity_check', { simple: true });
    if (integridade !== 'ok') {
      throw new ErroAplicacao('BACKUP_INVALIDO', 'O arquivo de backup está corrompido.', [
        String(integridade),
      ]);
    }
    const versaoSchema = lerVersaoSchema(db);
    if (versaoSchema > this.opcoes.gerenciador.versaoSuportada) {
      throw new ErroAplicacao(
        'BACKUP_INVALIDO',
        `O backup é de uma versão mais nova do aplicativo (schema ${versaoSchema}). Atualize o aplicativo antes de restaurá-lo.`,
      );
    }
    return { versaoSchema };
  }

  /** Verifica um backup existente: manifesto, hash, integridade e versão. */
  async verificar(id: string): Promise<InfoBackup> {
    const caminho = this.caminhoDe(id);
    const caminhoManifesto = ServicoBackup.caminhoManifesto(caminho);
    if (!existsSync(caminho) || !existsSync(caminhoManifesto)) {
      throw new ErroAplicacao('NAO_ENCONTRADO', 'Backup não encontrado.');
    }
    const { formato: _formato, ...info } = JSON.parse(
      readFileSync(caminhoManifesto, 'utf8'),
    ) as Manifesto;
    if (info.id !== id) {
      throw new ErroAplicacao(
        'BACKUP_INVALIDO',
        'O manifesto não corresponde ao arquivo de backup.',
      );
    }
    const hashAtual = await sha256Arquivo(caminho);
    if (hashAtual !== info.hashSha256) {
      throw new ErroAplicacao(
        'BACKUP_INVALIDO',
        'O arquivo de backup foi alterado depois de criado (hash diferente do registrado).',
      );
    }
    let db: Conexao | null = null;
    try {
      db = abrirConexao(caminho, { somenteLeitura: true, deveExistir: true });
      this.verificarConexao(db);
    } finally {
      db?.close();
    }
    return info;
  }

  // -------------------------------------------------------------------------
  // Restauração
  // -------------------------------------------------------------------------

  restaurar(id: string): Promise<ResultadoRestauracao> {
    return this.emSerie(() => this.restaurarInterno(id));
  }

  /** Copia um arquivo externo para a pasta de backups, verifica e restaura. */
  importarERestaurar(caminhoExterno: string): Promise<ResultadoRestauracao> {
    return this.emSerie(async () => {
      mkdirSync(this.opcoes.pastaBackups, { recursive: true });
      const agora = this.relogio();
      const id = gerarIdBackup(agora, 'importado', new Set(readdirSync(this.opcoes.pastaBackups)));
      const destino = join(this.opcoes.pastaBackups, id);
      const parcial = `${destino}.parcial`;
      try {
        copyFileSync(caminhoExterno, parcial);
        const { versaoSchema } = this.prepararEVerificarArquivo(parcial);
        await this.registrarArquivo(parcial, destino, {
          id,
          tipo: 'importado',
          criadoEm: agora.toISOString(),
          versaoSchema,
          observacao: `Importado de ${basename(caminhoExterno)}`,
        });
      } catch (erro) {
        this.removerComAuxiliares(parcial);
        if (erro instanceof ErroAplicacao) throw erro;
        throw new ErroAplicacao(
          'BACKUP_INVALIDO',
          'O arquivo escolhido não é um banco de dados válido deste aplicativo.',
        );
      }
      this.opcoes.logger.info('Backup importado', { id, origem: caminhoExterno });
      return this.restaurarInterno(id);
    });
  }

  private async restaurarInterno(id: string): Promise<ResultadoRestauracao> {
    const { gerenciador, logger } = this.opcoes;
    const restauradoDe = await this.verificar(id);
    const backupSeguranca = await this.criarDaConexao(
      gerenciador.conexao,
      'pre_restauracao',
      `Estado anterior à restauração de ${id}`,
    );

    const caminhoBanco = gerenciador.caminho;
    const temporario = `${caminhoBanco}.restaurando`;
    const anterior = `${caminhoBanco}.anterior`;

    this.removerComAuxiliares(temporario);
    copyFileSync(this.caminhoDe(id), temporario);

    gerenciador.fechar();
    this.removerComAuxiliares(anterior);
    this.moverComAuxiliares(caminhoBanco, anterior);
    renameSync(temporario, caminhoBanco);

    try {
      const abertura = await gerenciador.abrir();
      this.removerComAuxiliares(anterior);
      logger.info('Backup restaurado', {
        id,
        backupSeguranca: backupSeguranca.id,
        migracoesAplicadas: abertura.aplicadas.length,
      });
      return { restauradoDe, backupSeguranca, migracoesAplicadas: abertura.aplicadas.length };
    } catch (erro) {
      logger.erro('Falha ao abrir o banco restaurado. Revertendo para o banco anterior.', {
        id,
        erro,
      });
      gerenciador.fechar();
      this.removerComAuxiliares(caminhoBanco);
      this.moverComAuxiliares(anterior, caminhoBanco);
      await gerenciador.abrir();
      throw new ErroAplicacao(
        'BACKUP_INVALIDO',
        'Não foi possível abrir o banco restaurado. O banco anterior foi mantido.',
        [mensagemDeErro(erro)],
      );
    }
  }

  // -------------------------------------------------------------------------
  // Exportação e retenção
  // -------------------------------------------------------------------------

  exportar(id: string, destino: string): Promise<string> {
    return this.emSerie(async () => {
      await this.verificar(id);
      copyFileSync(this.caminhoDe(id), destino);
      this.opcoes.logger.info('Backup exportado', { id, destino });
      return destino;
    });
  }

  /** Remove backups automáticos e pré-operação além da política. Nunca remove manuais. */
  aplicarRetencao(): string[] {
    if (!existsSync(this.opcoes.pastaBackups)) return [];
    const manifestos: InfoBackup[] = [];
    for (const arquivo of readdirSync(this.opcoes.pastaBackups)) {
      if (!arquivo.endsWith('.json')) continue;
      try {
        manifestos.push(
          JSON.parse(readFileSync(join(this.opcoes.pastaBackups, arquivo), 'utf8')) as Manifesto,
        );
      } catch {
        // manifesto ilegível: não remove nada que não consegue identificar
      }
    }
    const remover = selecionarBackupsParaRemover(
      manifestos,
      this.opcoes.politica ?? POLITICA_RETENCAO_PADRAO,
    );
    for (const id of remover) {
      const caminho = this.caminhoDe(id);
      rmSync(caminho, { force: true });
      rmSync(ServicoBackup.caminhoManifesto(caminho), { force: true });
    }
    if (remover.length > 0) {
      this.opcoes.logger.info('Retenção de backups aplicada', { removidos: remover });
    }
    return remover;
  }

  // -------------------------------------------------------------------------
  // Arquivos auxiliares do SQLite
  // -------------------------------------------------------------------------

  private removerComAuxiliares(caminho: string): void {
    rmSync(caminho, { force: true });
    for (const sufixo of SUFIXOS_AUXILIARES) rmSync(`${caminho}${sufixo}`, { force: true });
  }

  private moverComAuxiliares(origem: string, destino: string): void {
    renameSync(origem, destino);
    for (const sufixo of SUFIXOS_AUXILIARES) {
      if (existsSync(`${origem}${sufixo}`)) renameSync(`${origem}${sufixo}`, `${destino}${sufixo}`);
    }
  }
}
