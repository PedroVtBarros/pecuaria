import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app';
import { ErroLimite } from './components/erro-limite';
import { ProvedorNotificacoes } from './components/notificacoes';
import { aplicarTemaInicial } from './hooks/use-tema';
import { instalarCapturaDeErrosGlobais, relatarErro } from './lib/relatar-erro';
import { ErroChamadaApi } from './lib/api';
import './styles.css';

instalarCapturaDeErrosGlobais();
aplicarTemaInicial();

const clienteConsultas = new QueryClient({
  defaultOptions: {
    // Dados locais: sem refetch por foco de janela e sem repetição automática.
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
    mutations: {
      // Recusas esperadas (dado inválido, duplicado, regra de negócio) já são
      // mostradas ao usuário e registradas como aviso pelo processo principal.
      // Só falhas inesperadas vão para o log como erro.
      onError: (erro) => {
        if (erro instanceof ErroChamadaApi && erro.codigo !== 'ERRO_INTERNO') return;
        relatarErro(erro, 'mutation');
      },
    },
  },
});

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado');

createRoot(raiz).render(
  <StrictMode>
    <ErroLimite>
      <QueryClientProvider client={clienteConsultas}>
        <ProvedorNotificacoes>
          {/* HashRouter: funciona com file:// no aplicativo empacotado. */}
          <HashRouter>
            <App />
          </HashRouter>
        </ProvedorNotificacoes>
      </QueryClientProvider>
    </ErroLimite>
  </StrictMode>,
);
