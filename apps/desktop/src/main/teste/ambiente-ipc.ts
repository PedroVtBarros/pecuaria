/**
 * Ambiente de teste com banco real em pasta temporária e todos os canais IPC
 * registrados, como no aplicativo. As chamadas passam pela mesma validação
 * Zod e pelo mesmo tratamento de erros do processo principal.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PacoteCuradoria } from '@pecuaria/domain';
import type { CanalApi, EntradaApi, Resultado, SaidaApi } from '@pecuaria/shared-types';
import {
  GerenciadorBanco,
  loggerSilencioso,
  MIGRACOES_DO_PROJETO,
  RepositorioConfiguracao,
  ServicoBackup,
  type Migracao,
} from '@pecuaria/database';
import { resolverCaminhos } from '../caminhos';
import { criarExecutores, registrarIpc, type Dialogos } from '../ipc/registrar-ipc';
import type { RemetenteIpc } from '../seguranca';
import { criarServicosRebanho } from '../services/rebanho';
import { ServicoConfiguracao } from '../services/servico-configuracao';
import { ServicoSistema } from '../services/servico-sistema';

type Manipulador = (evento: RemetenteIpc, entrada: unknown) => Promise<unknown>;

const EVENTO: RemetenteIpc = { sender: { id: 1 }, senderFrame: { url: 'file:///x', parent: null } };

export interface AmbienteIpc {
  pasta: string;
  gerenciador: GerenciadorBanco;
  canais: Map<string, Manipulador>;
  /** Chama um canal e devolve o Resultado bruto. */
  chamar<C extends CanalApi>(canal: C, entrada: EntradaApi<C>): Promise<Resultado<SaidaApi<C>>>;
  /** Chama e exige sucesso; falha o teste com a mensagem de erro caso contrário. */
  ok<C extends CanalApi>(canal: C, entrada: EntradaApi<C>): Promise<SaidaApi<C>>;
  /**
   * Fecha o banco e abre de novo, como reiniciar o aplicativo; com outra lista de migrations,
   * como abrir o banco numa versão nova do aplicativo (backup pré-migração como no app).
   */
  reiniciar(migracoes?: readonly Migracao[]): Promise<void>;
  definirHoje(data: Date): void;
  encerrar(): void;
}

export async function criarAmbienteIpc(
  opcoes: {
    hoje?: Date;
    dialogos?: Partial<Dialogos>;
    pasta?: string;
    pacotesCuradoria?: readonly PacoteCuradoria[];
    /** Migrations da primeira abertura (padrão: todas); para simular versões antigas. */
    migracoes?: readonly Migracao[];
  } = {},
): Promise<AmbienteIpc> {
  const pasta = opcoes.pasta ?? mkdtempSync(join(tmpdir(), 'pecuaria-ipc-'));
  const caminhos = resolverCaminhos(pasta);
  let agora = opcoes.hoje ?? new Date(2026, 9, 15, 10, 0, 0);
  const relogio = () => new Date(agora);
  const canais = new Map<string, Manipulador>();
  const dialogos: Dialogos = {
    escolherDestinoExportacao: async () => null,
    escolherArquivoParaImportar: async () => null,
    salvarArquivoDeTexto: async () => null,
    salvarRelatorio: async () => null,
    ...opcoes.dialogos,
  };

  let backupAtual: ServicoBackup | null = null;
  // Como no main: backup pré-migração ao abrir banco existente com migration pendente.
  const novoGerenciador = (migracoes: readonly Migracao[]) =>
    new GerenciadorBanco({
      caminhoBanco: caminhos.banco,
      migracoes,
      logger: loggerSilencioso,
      antesDeMigrar: async (db, estado) => {
        await backupAtual?.criarDaConexao(
          db,
          'pre_migracao',
          `Antes de atualizar o banco da versão ${estado.versaoAtual}`,
        );
      },
    });
  let gerenciador = novoGerenciador(opcoes.migracoes ?? MIGRACOES_DO_PROJETO);
  const criarBackup = (banco: GerenciadorBanco) =>
    new ServicoBackup({
      gerenciador: banco,
      pastaBackups: caminhos.backups,
      versaoApp: 'teste',
      logger: loggerSilencioso,
      relogio,
    });

  const montar = async (): Promise<void> => {
    backupAtual = criarBackup(gerenciador);
    await gerenciador.abrir();
    const banco = gerenciador;
    const executores = criarExecutores(
      {
        sistema: new ServicoSistema(banco, caminhos, {
          versaoApp: 'teste',
          empacotado: false,
          versoes: { electron: 'x', chrome: 'x', node: process.versions.node },
          abrirPastaNoSistema: async () => '',
        }),
        configuracao: new ServicoConfiguracao(new RepositorioConfiguracao(() => banco.conexao)),
        backup: backupAtual,
        ...criarServicosRebanho(banco, {
          relogio,
          ...(opcoes.pacotesCuradoria ? { pacotesCuradoria: opcoes.pacotesCuradoria } : {}),
        }),
      },
      dialogos,
      loggerSilencioso,
    );
    canais.clear();
    registrarIpc({ handle: (canal, m) => canais.set(canal, m) }, executores, {
      validarRemetente: () => true,
      logger: loggerSilencioso,
    });
  };
  await montar();

  const ambiente: AmbienteIpc = {
    pasta,
    get gerenciador() {
      return gerenciador;
    },
    canais,
    async chamar(canal, entrada) {
      const m = canais.get(canal);
      if (!m) throw new Error(`Canal não registrado: ${canal}`);
      return (await m(EVENTO, entrada)) as Resultado<SaidaApi<typeof canal>>;
    },
    async ok(canal, entrada) {
      const r = await ambiente.chamar(canal, entrada);
      if (!r.ok) {
        throw new Error(
          `${canal} falhou: ${r.erro.codigo} ${r.erro.mensagem} ${(r.erro.detalhes ?? []).join(' | ')}`,
        );
      }
      return r.dados;
    },
    async reiniciar(migracoes = MIGRACOES_DO_PROJETO) {
      gerenciador.fechar();
      gerenciador = novoGerenciador(migracoes);
      await montar();
    },
    definirHoje(data) {
      agora = data;
    },
    encerrar() {
      gerenciador.fechar();
      rmSync(pasta, { recursive: true, force: true });
    },
  };
  return ambiente;
}
