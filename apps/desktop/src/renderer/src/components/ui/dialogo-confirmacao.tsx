import { useEffect, useRef } from 'react';
import { textos } from '../../textos';
import { Botao } from './botao';

/**
 * Diálogo modal de confirmação sobre o elemento nativo <dialog>, que já
 * trata foco, tecla Esc e bloqueio do fundo.
 */
export function DialogoConfirmacao({
  aberto,
  titulo,
  descricao,
  textoConfirmar,
  perigoso = false,
  carregando = false,
  aoConfirmar,
  aoCancelar,
}: {
  aberto: boolean;
  titulo: string;
  descricao: string;
  textoConfirmar: string;
  perigoso?: boolean;
  carregando?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal?.();
    if (!aberto && dialogo.open) dialogo.close?.();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialogo-titulo"
      aria-describedby="dialogo-descricao"
      onCancel={(evento) => {
        evento.preventDefault();
        if (!carregando) aoCancelar();
      }}
      className="m-auto w-full max-w-md rounded-xl border border-borda bg-superficie p-0 text-texto shadow-xl"
    >
      {aberto && (
        <div className="flex flex-col gap-4 p-6">
          <h2 id="dialogo-titulo" className="text-lg font-semibold">
            {titulo}
          </h2>
          <p id="dialogo-descricao" className="text-sm text-texto-suave">
            {descricao}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Botao variante="secundario" onClick={aoCancelar} disabled={carregando}>
              {textos.geral.cancelar}
            </Botao>
            <Botao
              variante={perigoso ? 'perigo' : 'primario'}
              onClick={aoConfirmar}
              carregando={carregando}
            >
              {textoConfirmar}
            </Botao>
          </div>
        </div>
      )}
    </dialog>
  );
}
