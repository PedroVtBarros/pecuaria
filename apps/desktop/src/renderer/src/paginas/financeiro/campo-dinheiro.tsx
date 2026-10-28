import { interpretarCentavos } from '@pecuaria/domain';
import { Campo, Entrada } from '../../components/ui/campos';

export const AJUDA_DINHEIRO = 'Em reais, com até duas casas. Ex.: 1.234,56';

/**
 * Texto digitado → centavos inteiros, por análise do texto (nunca multiplicando decimais).
 * Vazio resulta em `centavos: null` sem erro; texto inválido ou ambíguo resulta em erro.
 */
export function centavosDoTexto(texto: string): { centavos: number | null; erro: string | null } {
  if (texto.trim() === '') return { centavos: null, erro: null };
  const centavos = interpretarCentavos(texto);
  if (centavos === null)
    return {
      centavos: null,
      erro: 'Valor inválido ou ambíguo. Use, por exemplo, 1.234,56 (no máximo duas casas decimais).',
    };
  return { centavos, erro: null };
}

export function CampoDinheiro({
  rotulo,
  valor,
  aoMudar,
  obrigatorio,
  ajuda = AJUDA_DINHEIRO,
  className,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (texto: string) => void;
  obrigatorio?: boolean;
  ajuda?: string;
  className?: string;
}) {
  const { erro } = centavosDoTexto(valor);
  return (
    <Campo
      rotulo={rotulo}
      erro={erro ?? undefined}
      ajuda={ajuda}
      {...(obrigatorio ? { obrigatorio } : {})}
      {...(className ? { className } : {})}
    >
      {(p) => (
        <Entrada
          {...p}
          inputMode="decimal"
          autoComplete="off"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )}
    </Campo>
  );
}
