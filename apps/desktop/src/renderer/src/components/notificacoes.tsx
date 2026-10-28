import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../lib/utils';

type TomNotificacao = 'sucesso' | 'perigo' | 'info';

interface Notificacao {
  id: number;
  tom: TomNotificacao;
  mensagem: string;
}

interface ContextoNotificacoes {
  notificar: (mensagem: string, tom?: TomNotificacao) => void;
}

const Contexto = createContext<ContextoNotificacoes | null>(null);

const DURACAO_MS = 6000;

export function ProvedorNotificacoes({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<Notificacao[]>([]);
  const proximoId = useRef(1);

  const remover = useCallback((id: number) => {
    setItens((atuais) => atuais.filter((n) => n.id !== id));
  }, []);

  const notificar = useCallback(
    (mensagem: string, tom: TomNotificacao = 'info') => {
      const id = proximoId.current++;
      setItens((atuais) => [...atuais.slice(-3), { id, tom, mensagem }]);
      window.setTimeout(() => remover(id), DURACAO_MS);
    },
    [remover],
  );

  const valor = useMemo(() => ({ notificar }), [notificar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {itens.map((n) => (
          <div
            key={n.id}
            role={n.tom === 'perigo' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg',
              n.tom === 'sucesso' && 'border-transparent bg-sucesso-suave text-sucesso',
              n.tom === 'perigo' && 'border-transparent bg-perigo-suave text-perigo',
              n.tom === 'info' && 'border-borda bg-superficie text-texto',
            )}
          >
            <p className="flex-1">{n.mensagem}</p>
            <button
              type="button"
              aria-label="Fechar notificação"
              onClick={() => remover(n.id)}
              className="cursor-pointer opacity-70 hover:opacity-100"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useNotificacoes(): ContextoNotificacoes {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useNotificacoes precisa estar dentro de ProvedorNotificacoes');
  return contexto;
}
