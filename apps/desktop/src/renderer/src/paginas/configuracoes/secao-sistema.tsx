import type { ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';
import type { PastaAbrivel } from '@pecuaria/shared-types';
import { useAbrirPasta, useInfoSistema } from '../../lib/consultas';
import { mensagemDeErro } from '../../lib/api';
import { encurtarCaminho, formatarDataHora } from '../../lib/formatar';
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

function Linha({
  rotulo,
  valor,
  exibir,
  acao,
}: {
  rotulo: string;
  valor: string;
  exibir?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-t border-borda py-2 first:border-t-0">
      <dt className="w-40 shrink-0 text-sm text-texto-suave">{rotulo}</dt>
      <dd className="min-w-0 flex-1 truncate font-mono text-xs" title={valor}>
        {exibir ?? valor}
      </dd>
      {acao}
    </div>
  );
}

export function SecaoSistema() {
  const t = textos.configuracoes;
  const info = useInfoSistema();
  const abrirPasta = useAbrirPasta();
  const { notificar } = useNotificacoes();

  if (info.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(info.error)} />;
  if (!info.data) return null;
  const d = info.data;

  const botaoAbrir = (pasta: PastaAbrivel) => (
    <Botao
      tamanho="pequeno"
      variante="fantasma"
      onClick={() =>
        abrirPasta.mutate(pasta, { onError: (e) => notificar(mensagemDeErro(e), 'perigo') })
      }
    >
      <FolderOpen className="size-3.5" aria-hidden />
      {t.abrir}
    </Botao>
  );

  return (
    <Cartao>
      <CartaoCabecalho>
        <CartaoTitulo>{t.sistema}</CartaoTitulo>
        <CartaoDescricao>{t.sistemaDescricao}</CartaoDescricao>
      </CartaoCabecalho>
      <CartaoConteudo className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t.versoes}</h3>
          <dl>
            <Linha rotulo="Aplicativo" valor={d.versaoApp} />
            <Linha
              rotulo="Schema do banco"
              valor={`${d.versaoSchema} de ${d.versaoSchemaSuportada}`}
            />
            <Linha rotulo="SQLite" valor={d.versaoSqlite} />
            <Linha rotulo="Electron" valor={d.versaoElectron} />
            <Linha rotulo="Chromium" valor={d.versaoChrome} />
            <Linha rotulo="Node.js" valor={d.versaoNode} />
          </dl>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t.caminhos}</h3>
          <dl>
            <Linha
              rotulo="Banco de dados"
              valor={d.caminhos.banco}
              exibir={encurtarCaminho(d.caminhos.banco)}
              acao={botaoAbrir('dados')}
            />
            <Linha
              rotulo="Backups"
              valor={d.caminhos.backups}
              exibir={encurtarCaminho(d.caminhos.backups)}
              acao={botaoAbrir('backups')}
            />
            <Linha
              rotulo="Logs"
              valor={d.caminhos.logs}
              exibir={encurtarCaminho(d.caminhos.logs)}
              acao={botaoAbrir('logs')}
            />
          </dl>
          <h3 className="mt-6 mb-2 text-sm font-semibold">{t.migracoes}</h3>
          <dl>
            {d.migracoesAplicadas.map((m) => (
              <Linha
                key={m.versao}
                rotulo={`${String(m.versao).padStart(4, '0')} ${m.nome}`}
                valor={formatarDataHora(m.aplicadaEm)}
              />
            ))}
          </dl>
        </div>
      </CartaoConteudo>
    </Cartao>
  );
}
