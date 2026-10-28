import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Reporter, TestCase } from 'vitest/node';

/**
 * Acrescenta cada teste que falhar em test-results/falhas-vitest.jsonl (pasta ignorada pelo git),
 * com data, arquivo, nome e mensagem. Existe para acompanhar a falha intermitente da 5A-3, cuja
 * causa não foi comprovada (ROADMAP.md, seção 22.3): a saída daquela execução se perdeu, e uma
 * nova ocorrência fica registrada mesmo que a suíte seja executada de novo em seguida.
 */
export default class RegistroDeFalhas implements Reporter {
  private readonly arquivo = join(process.cwd(), 'test-results', 'falhas-vitest.jsonl');

  onTestCaseResult(teste: TestCase): void {
    const resultado = teste.result();
    if (resultado.state !== 'failed') return;
    mkdirSync(join(process.cwd(), 'test-results'), { recursive: true });
    appendFileSync(
      this.arquivo,
      `${JSON.stringify({
        em: new Date().toISOString(),
        arquivo: teste.module.moduleId,
        teste: teste.fullName,
        erros: resultado.errors.map((e) => ({ mensagem: e.message, pilha: e.stack })),
      })}\n`,
    );
  }
}
