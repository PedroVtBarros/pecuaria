import { z } from 'zod';

/**
 * Mensagens de validação do Zod em português, no processo principal e na
 * interface. Mensagens específicas definidas nos esquemas têm prioridade.
 */
z.config(z.locales.pt());

export {};
