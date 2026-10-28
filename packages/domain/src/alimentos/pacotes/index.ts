import type { PacoteCuradoria } from '../pacote-curadoria';

/**
 * Pacotes de curadoria embutidos no aplicativo. Cada um só entra no banco por ação do usuário e
 * como registros "transcritos", que ele confere contra a fonte.
 *
 * Versão pública do repositório: os pacotes curados do CQBAL 4.0 e das publicações da Embrapa
 * (CT 79, CT 261, CT 263 e BPD 100) foram autorizados só para uso pessoal, sem redistribuição, e
 * não são distribuídos aqui. O formato, a importação e a conferência continuam no código
 * (`pacote-curadoria.ts`) e são testados com pacotes fictícios.
 */
export const PACOTES_CURADORIA: readonly PacoteCuradoria[] = [];
