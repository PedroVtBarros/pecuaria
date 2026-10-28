import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/utils';
import { Botao } from './botao';

/** Título da página com descrição, ações à direita e caminho de volta opcional. */
export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
  voltar,
  selo,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  voltar?: { para: string; rotulo: string };
  selo?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {voltar && (
        <Link
          to={voltar.para}
          className="inline-flex w-fit items-center gap-1 text-sm text-texto-suave hover:text-marca"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {voltar.rotulo}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold">{titulo}</h2>
            {selo}
          </div>
          {descricao && <div className="text-sm text-texto-suave">{descricao}</div>}
        </div>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
    </div>
  );
}

/** Estado vazio com chamada para a primeira ação. */
export function EstadoVazio({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone: typeof ChevronLeft;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-borda bg-superficie px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-marca-suave text-marca">
        <Icone className="size-6" aria-hidden />
      </div>
      <p className="font-semibold">{titulo}</p>
      {descricao && <p className="max-w-md text-sm text-texto-suave">{descricao}</p>}
      {acao}
    </div>
  );
}

/** Abas locais (botões) para alternar seções de uma página. */
export function Abas<T extends string>({
  abas,
  atual,
  aoMudar,
}: {
  abas: { id: T; rotulo: string; contador?: number }[];
  atual: T;
  aoMudar: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-borda">
      {abas.map((aba) => (
        <button
          key={aba.id}
          type="button"
          role="tab"
          aria-selected={aba.id === atual}
          onClick={() => aoMudar(aba.id)}
          className={cn(
            '-mb-px cursor-pointer border-b-2 px-4 py-2 text-sm transition-colors',
            aba.id === atual
              ? 'border-marca font-medium text-texto'
              : 'border-transparent text-texto-suave hover:text-texto',
          )}
        >
          {aba.rotulo}
          {aba.contador !== undefined && (
            <span className="ml-1.5 rounded-full bg-superficie-2 px-1.5 text-xs text-texto-suave">
              {aba.contador}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Paginacao({
  pagina,
  tamanhoPagina,
  total,
  aoMudar,
}: {
  pagina: number;
  tamanhoPagina: number;
  total: number;
  aoMudar: (pagina: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / tamanhoPagina));
  if (total === 0) return null;
  const inicio = (pagina - 1) * tamanhoPagina + 1;
  const fim = Math.min(total, pagina * tamanhoPagina);
  return (
    <div className="flex items-center justify-between text-sm text-texto-suave">
      <span>
        {inicio}–{fim} de {total}
      </span>
      {paginas > 1 && (
        <div className="flex items-center gap-1">
          <Botao
            tamanho="pequeno"
            variante="secundario"
            disabled={pagina <= 1}
            onClick={() => aoMudar(pagina - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Botao>
          <span className="px-2">
            {pagina} / {paginas}
          </span>
          <Botao
            tamanho="pequeno"
            variante="secundario"
            disabled={pagina >= paginas}
            onClick={() => aoMudar(pagina + 1)}
            aria-label="Próxima página"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Botao>
        </div>
      )}
    </div>
  );
}

/** Lista de pares rótulo/valor para páginas de detalhe. */
export function ListaDados({ itens }: { itens: { rotulo: string; valor: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
      {itens.map((item) => (
        <div key={item.rotulo} className="flex flex-col gap-0.5">
          <dt className="text-xs text-texto-suave">{item.rotulo}</dt>
          <dd className="text-sm">{item.valor ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
