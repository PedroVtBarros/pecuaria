import { Clock } from 'lucide-react';
import type { DefinicaoModulo } from '../modulos';
import { textos } from '../textos';
import { Cartao, CartaoConteudo } from '../components/ui/cartao';
import { Selo } from '../components/ui/selo';

/** Página de módulo ainda não implementado. Não contém nenhuma regra de negócio. */
export function PaginaModuloPlanejado({ modulo }: { modulo: DefinicaoModulo }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-8" data-modulo={modulo.id}>
      <Cartao>
        <CartaoConteudo className="flex flex-col items-start gap-5 p-8">
          <div className="flex size-14 items-center justify-center rounded-xl bg-marca-suave text-marca">
            <modulo.icone className="size-7" aria-hidden />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold">{modulo.titulo}</h2>
            <p className="text-texto-suave">{modulo.descricao}</p>
          </div>
          {modulo.fase && (
            <Selo tom="alerta" className="text-sm">
              <Clock className="size-3.5" aria-hidden />
              {textos.moduloPlanejado.planejadoPara(modulo.fase)}
            </Selo>
          )}
          <p className="text-sm text-texto-suave">{textos.moduloPlanejado.explicacao}</p>
          <div className="w-full border-t border-borda pt-4">
            <p className="mb-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">
              {textos.moduloPlanejado.requisitos}
            </p>
            <ul className="flex flex-wrap gap-2">
              {modulo.requisitos.map((r) => (
                <li key={r}>
                  <Selo>{r}</Selo>
                </li>
              ))}
            </ul>
          </div>
        </CartaoConteudo>
      </Cartao>
      <p className="text-center text-xs text-texto-suave">
        {textos.moduloPlanejado.semFuncionalidade}
      </p>
    </div>
  );
}
