import { useState } from 'react';
import { Link } from 'react-router';
import type { TipoItemEstoque } from '@pecuaria/domain';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoAlimentos, useAlimentos, useVinculoAlimento } from '../../lib/consultas-alimentos';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Selecao } from '../../components/ui/campos';
import { Cartao, CartaoConteudo, CartaoTitulo } from '../../components/ui/cartao';

const NAO_ALIMENTO: TipoItemEstoque[] = ['medicamento', 'vacina', 'semen'];

/**
 * "Alimento no banco": aponta o item de estoque para um alimento. Não copia composição e não mexe
 * no estoque nem no financeiro.
 */
export function AlimentoDoItem({ itemId, tipo }: { itemId: string; tipo: TipoItemEstoque }) {
  const vinculo = useVinculoAlimento(NAO_ALIMENTO.includes(tipo) ? '' : itemId);
  const alimentos = useAlimentos({ busca: '' });
  const definir = useAcaoAlimentos('vinculoAlimento:definir');
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (NAO_ALIMENTO.includes(tipo) || !vinculo.data) return null;
  const atual = vinculo.data.alimento;
  const valor = escolhido ?? atual?.id ?? '';
  return (
    <Cartao data-testid="alimento-do-item">
      <CartaoConteudo className="flex flex-col gap-3">
        <CartaoTitulo>Alimento no banco</CartaoTitulo>
        <p className="text-sm text-texto-suave">
          {atual ? (
            <>
              Vinculado a{' '}
              <Link className="text-marca underline" to={`/alimentos/itens/${atual.id}`}>
                {atual.nome}
              </Link>
              . A composição continua nos registros do alimento; o estoque não muda.
            </>
          ) : (
            'Sem vínculo. Vincule para que a nutrição saiba qual alimento este item representa.'
          )}
        </p>
        {erro && <Alerta tom="perigo" titulo={erro} />}
        <div className="flex flex-wrap items-end gap-3">
          <Campo rotulo="Alimento">
            {(p) => (
              <Selecao {...p} value={valor} onChange={(e) => setEscolhido(e.target.value)}>
                <option value="">Sem vínculo</option>
                {(alimentos.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Botao
            variante="secundario"
            carregando={definir.isPending}
            disabled={valor === (atual?.id ?? '')}
            onClick={() =>
              definir.mutate(
                { itemId, alimentoId: valor || null },
                {
                  onSuccess: () => {
                    setErro(null);
                    setEscolhido(null);
                  },
                  onError: (e) => setErro(mensagemDeErro(e)),
                },
              )
            }
          >
            Salvar vínculo
          </Botao>
        </div>
      </CartaoConteudo>
    </Cartao>
  );
}
