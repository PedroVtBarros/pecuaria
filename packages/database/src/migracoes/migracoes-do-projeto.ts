import { montarMigracoes, type Migracao } from './migrador';

/**
 * Os arquivos SQL são embutidos no bundle pelo Vite em tempo de build.
 * Não há leitura de disco em tempo de execução, então o app empacotado
 * não depende da pasta de migrations.
 */
const arquivos = import.meta.glob<string>('../../migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const MIGRACOES_DO_PROJETO: readonly Migracao[] = montarMigracoes(arquivos);

export const VERSAO_SCHEMA_SUPORTADA: number = MIGRACOES_DO_PROJETO.at(-1)?.versao ?? 0;
