import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { textos } from '../../textos';
import { cn } from '../../lib/utils';
import { Alerta } from './alerta';
import { Botao } from './botao';

/**
 * Janela modal sobre o elemento nativo <dialog> (foco, Esc e bloqueio do fundo).
 * Quando `aoEnviar` é informado, o conteúdo vira um formulário e Enter envia.
 */
export function Modal({
  aberto,
  titulo,
  descricao,
  children,
  aoFechar,
  aoEnviar,
  textoEnviar,
  enviando = false,
  perigoso = false,
  erros = [],
  largura = 'md',
}: {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  children?: ReactNode;
  aoFechar: () => void;
  aoEnviar?: () => void;
  textoEnviar?: string;
  enviando?: boolean;
  perigoso?: boolean;
  erros?: string[];
  largura?: 'md' | 'lg' | 'xl';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal?.();
    if (!aberto && dialogo.open) dialogo.close?.();
  }, [aberto]);

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    if (!enviando) aoEnviar?.();
  };

  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-borda px-6 py-4">
        <div>
          <h2 id={idTitulo} className="text-lg font-semibold">
            {titulo}
          </h2>
          {descricao && <p className="mt-1 text-sm text-texto-suave">{descricao}</p>}
        </div>
        <button
          type="button"
          onClick={aoFechar}
          aria-label={textos.geral.fechar}
          className="cursor-pointer rounded p-1 text-texto-suave hover:bg-superficie-2 hover:text-texto"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-6 py-5">
        {erros.length > 0 && (
          <Alerta
            tom="perigo"
            titulo={erros.length === 1 ? erros[0] : 'Corrija os problemas abaixo.'}
          >
            {erros.length > 1 && (
              <ul className="list-disc pl-4">
                {erros.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </Alerta>
        )}
        {children}
      </div>
      {aoEnviar && (
        <div className="flex justify-end gap-2 border-t border-borda px-6 py-4">
          <Botao variante="secundario" onClick={aoFechar} disabled={enviando}>
            {textos.geral.cancelar}
          </Botao>
          <Botao type="submit" variante={perigoso ? 'perigo' : 'primario'} carregando={enviando}>
            {textoEnviar ?? 'Salvar'}
          </Botao>
        </div>
      )}
    </>
  );

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        if (!enviando) aoFechar();
      }}
      className={cn(
        'm-auto w-full rounded-xl border border-borda bg-superficie p-0 text-texto shadow-xl',
        largura === 'md' && 'max-w-lg',
        largura === 'lg' && 'max-w-2xl',
        largura === 'xl' && 'max-w-4xl',
      )}
    >
      {aberto &&
        (aoEnviar ? (
          <form onSubmit={enviar} noValidate>
            {conteudo}
          </form>
        ) : (
          conteudo
        ))}
    </dialog>
  );
}
