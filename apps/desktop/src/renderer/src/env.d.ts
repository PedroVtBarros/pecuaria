import type { ApiPreload } from '@pecuaria/shared-types';

declare global {
  interface Window {
    /** Única ponte com o processo principal, exposta pelo preload. */
    readonly api: ApiPreload;
  }
}

export {};
