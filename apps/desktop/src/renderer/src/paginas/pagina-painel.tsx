import { Beef, Database, DatabaseBackup, Layers, Monitor } from 'lucide-react';
import { Link } from 'react-router';
import { useBackups, useInfoSistema } from '../lib/consultas';
import { formatarDataHora } from '../lib/formatar';
import { mensagemDeErro } from '../lib/api';
import { MODULOS } from '../modulos';
import { usePropriedadeAtual } from '../hooks/use-propriedade-atual';
import { Botao } from '../components/ui/botao';
import { textos } from '../textos';
import { Alerta } from '../components/ui/alerta';
import { Cartao, CartaoConteudo, CartaoDescricao, CartaoTitulo } from '../components/ui/cartao';
import { Selo } from '../components/ui/selo';
import { ResumoPendencias } from './manejo/pagina-agenda';

function CartaoSituacao({
  icone: Icone,
  titulo,
  valor,
  detalhe,
  testId,
}: {
  icone: typeof Database;
  titulo: string;
  valor: string;
  detalhe?: string | undefined;
  testId?: string;
}) {
  return (
    <Cartao>
      <CartaoConteudo className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-marca-suave text-marca">
          <Icone className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-texto-suave">{titulo}</p>
          <p className="truncate font-semibold" data-testid={testId}>
            {valor}
          </p>
          {detalhe && <p className="truncate text-xs text-texto-suave">{detalhe}</p>}
        </div>
      </CartaoConteudo>
    </Cartao>
  );
}

export function PaginaPainel() {
  const info = useInfoSistema();
  const backups = useBackups();
  const ultimo = backups.data?.[0];
  const { propriedade, carregando } = usePropriedadeAtual();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-8">
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold">{textos.painel.boasVindas}</h2>
        <p className="max-w-3xl text-texto-suave">{textos.painel.descricao}</p>
      </section>

      {!carregando && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold tracking-wide text-texto-suave uppercase">
            {propriedade ? `Rebanho · ${propriedade.nome}` : 'Rebanho'}
          </h3>
          {propriedade ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Link to="/rebanho/animais">
                <CartaoSituacao
                  icone={Beef}
                  titulo="Animais ativos"
                  valor={String(propriedade.animaisAtivos)}
                  testId="painel-animais"
                />
              </Link>
              <Link to="/rebanho/lotes">
                <CartaoSituacao
                  icone={Layers}
                  titulo="Lotes ativos"
                  valor={String(propriedade.lotesAtivos)}
                />
              </Link>
            </div>
          ) : (
            <Cartao>
              <CartaoConteudo className="flex items-center justify-between gap-4">
                <p className="text-sm text-texto-suave">
                  Cadastre a primeira propriedade para começar a registrar o rebanho.
                </p>
                <Link to="/rebanho/propriedades?nova=1">
                  <Botao>Cadastrar propriedade</Botao>
                </Link>
              </CartaoConteudo>
            </Cartao>
          )}
        </section>
      )}

      {!carregando && propriedade && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold tracking-wide text-texto-suave uppercase">
            Sanidade e manejo
          </h3>
          <ResumoPendencias propriedadeId={propriedade.id} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold tracking-wide text-texto-suave uppercase">
          {textos.painel.situacao}
        </h3>
        {info.isError && <Alerta tom="perigo" titulo={mensagemDeErro(info.error)} />}
        <div className="grid gap-4 md:grid-cols-3">
          <CartaoSituacao
            icone={Database}
            titulo={textos.painel.banco}
            valor={
              info.data
                ? textos.painel.versaoSchema(info.data.versaoSchema)
                : textos.geral.carregando
            }
            detalhe={info.data ? `SQLite ${info.data.versaoSqlite}` : undefined}
            testId="painel-schema"
          />
          <CartaoSituacao
            icone={DatabaseBackup}
            titulo={textos.painel.ultimoBackup}
            valor={ultimo ? formatarDataHora(ultimo.criadoEm) : textos.painel.nenhumBackup}
            detalhe={ultimo ? textos.configuracoes.tipos[ultimo.tipo] : undefined}
          />
          <CartaoSituacao
            icone={Monitor}
            titulo={textos.painel.ambiente}
            valor={info.data ? `Versão ${info.data.versaoApp}` : textos.geral.carregando}
            detalhe={info.data ? `Electron ${info.data.versaoElectron}` : undefined}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold tracking-wide text-texto-suave uppercase">
          {textos.painel.modulos}
        </h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MODULOS.filter((m) => m.id !== 'painel').map((m) => (
            <Link key={m.id} to={m.rota} className="group">
              <Cartao className="h-full transition-colors group-hover:border-marca">
                <CartaoConteudo className="flex h-full flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <m.icone className="size-4 text-marca" aria-hidden />
                      <CartaoTitulo className="text-sm">{m.titulo}</CartaoTitulo>
                    </div>
                    <Selo tom={m.fase ? 'neutro' : 'sucesso'}>
                      {m.fase ?? textos.painel.disponivel}
                    </Selo>
                  </div>
                  <CartaoDescricao className="text-xs">{m.descricao}</CartaoDescricao>
                </CartaoConteudo>
              </Cartao>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
