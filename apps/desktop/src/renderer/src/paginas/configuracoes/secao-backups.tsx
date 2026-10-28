import { useState } from 'react';
import { ArchiveRestore, DatabaseBackup, Download, FolderOpen, ShieldCheck } from 'lucide-react';
import type { InfoBackup, TipoBackup } from '@pecuaria/shared-types';
import {
  useAbrirPasta,
  useBackups,
  useCriarBackup,
  useExportarBackup,
  useImportarERestaurar,
  useRestaurarBackup,
} from '../../lib/consultas';
import { mensagemDeErro } from '../../lib/api';
import { formatarBytes, formatarDataHora } from '../../lib/formatar';
import { textos } from '../../textos';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import {
  Cartao,
  CartaoCabecalho,
  CartaoConteudo,
  CartaoDescricao,
  CartaoTitulo,
} from '../../components/ui/cartao';
import { DialogoConfirmacao } from '../../components/ui/dialogo-confirmacao';
import { Selo } from '../../components/ui/selo';

const TOM_POR_TIPO: Record<TipoBackup, 'marca' | 'neutro' | 'alerta' | 'sucesso'> = {
  manual: 'marca',
  automatico: 'neutro',
  pre_migracao: 'alerta',
  pre_restauracao: 'alerta',
  importado: 'sucesso',
};

export function SecaoBackups() {
  const t = textos.configuracoes;
  const { notificar } = useNotificacoes();
  const backups = useBackups();
  const criar = useCriarBackup();
  const restaurar = useRestaurarBackup();
  const importar = useImportarERestaurar();
  const exportar = useExportarBackup();
  const abrirPasta = useAbrirPasta();
  const [paraRestaurar, setParaRestaurar] = useState<InfoBackup | null>(null);

  const falhou = (erro: unknown): void => notificar(mensagemDeErro(erro), 'perigo');

  return (
    <Cartao>
      <CartaoCabecalho>
        <CartaoTitulo>{t.backups}</CartaoTitulo>
        <CartaoDescricao>{t.backupsDescricao}</CartaoDescricao>
      </CartaoCabecalho>
      <CartaoConteudo className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Botao
            onClick={() =>
              criar.mutate(undefined, {
                onSuccess: () => notificar(t.backupCriado, 'sucesso'),
                onError: falhou,
              })
            }
            carregando={criar.isPending}
          >
            <DatabaseBackup className="size-4" aria-hidden />
            {t.criarBackup}
          </Botao>
          <Botao
            variante="secundario"
            onClick={() =>
              importar.mutate(undefined, {
                onSuccess: (r) => {
                  if (!r.cancelado) notificar(t.backupRestaurado, 'sucesso');
                },
                onError: falhou,
              })
            }
            carregando={importar.isPending}
          >
            <ArchiveRestore className="size-4" aria-hidden />
            {t.restaurarDeArquivo}
          </Botao>
          <Botao
            variante="fantasma"
            onClick={() => abrirPasta.mutate('backups', { onError: falhou })}
          >
            <FolderOpen className="size-4" aria-hidden />
            {t.abrirPastaBackups}
          </Botao>
        </div>

        {backups.isError && <Alerta tom="perigo" titulo={mensagemDeErro(backups.error)} />}

        <div className="overflow-x-auto rounded-lg border border-borda">
          <table className="w-full text-sm" data-testid="tabela-backups">
            <thead className="bg-superficie-2 text-left text-xs text-texto-suave">
              <tr>
                <th className="px-3 py-2 font-medium">{t.colunas.data}</th>
                <th className="px-3 py-2 font-medium">{t.colunas.tipo}</th>
                <th className="px-3 py-2 font-medium">{t.colunas.tamanho}</th>
                <th className="px-3 py-2 font-medium">{t.colunas.schema}</th>
                <th className="px-3 py-2 font-medium">{t.colunas.observacao}</th>
                <th className="px-3 py-2 text-right font-medium">{t.colunas.acoes}</th>
              </tr>
            </thead>
            <tbody>
              {backups.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-texto-suave">
                    {t.nenhumBackup}
                  </td>
                </tr>
              )}
              {backups.data?.map((b) => (
                <tr
                  key={b.id}
                  className="border-t border-borda"
                  data-backup-id={b.id}
                  data-tipo={b.tipo}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="flex items-center gap-1.5" title={`SHA-256 ${b.hashSha256}`}>
                      <ShieldCheck className="size-3.5 text-sucesso" aria-hidden />
                      {formatarDataHora(b.criadoEm)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Selo tom={TOM_POR_TIPO[b.tipo]}>{t.tipos[b.tipo]}</Selo>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatarBytes(b.tamanhoBytes)}</td>
                  <td className="px-3 py-2">{b.versaoSchema}</td>
                  <td
                    className="max-w-64 truncate px-3 py-2 text-texto-suave"
                    title={b.observacao ?? ''}
                  >
                    {b.observacao ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Botao
                        tamanho="pequeno"
                        variante="secundario"
                        onClick={() => setParaRestaurar(b)}
                      >
                        {t.restaurar}
                      </Botao>
                      <Botao
                        tamanho="pequeno"
                        variante="fantasma"
                        title={t.exportar}
                        onClick={() =>
                          exportar.mutate(b.id, {
                            onSuccess: (r) => {
                              if (!r.cancelado)
                                notificar(t.backupExportado(r.dados.caminho), 'sucesso');
                            },
                            onError: falhou,
                          })
                        }
                      >
                        <Download className="size-3.5" aria-hidden />
                        {t.exportar}
                      </Botao>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CartaoConteudo>

      <DialogoConfirmacao
        aberto={paraRestaurar !== null}
        titulo={t.confirmarRestauracaoTitulo}
        descricao={
          paraRestaurar ? t.confirmarRestauracaoTexto(formatarDataHora(paraRestaurar.criadoEm)) : ''
        }
        textoConfirmar={t.confirmarRestauracaoBotao}
        perigoso
        carregando={restaurar.isPending}
        aoCancelar={() => setParaRestaurar(null)}
        aoConfirmar={() => {
          if (!paraRestaurar) return;
          restaurar.mutate(paraRestaurar.id, {
            onSuccess: () => notificar(t.backupRestaurado, 'sucesso'),
            onError: falhou,
            onSettled: () => setParaRestaurar(null),
          });
        }}
      />
    </Cartao>
  );
}
