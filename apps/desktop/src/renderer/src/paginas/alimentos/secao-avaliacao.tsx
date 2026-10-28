import { useState } from 'react';
import type { TipoAvaliacao } from '@pecuaria/domain';
import type { AvaliacaoCientificaApi, RegistroDetalhe } from '@pecuaria/shared-types';
import { useAcaoAlimentos } from '../../lib/consultas-alimentos';
import { formatarDataHora } from '../../lib/formatar';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { avisosAlimentos, tiposAvaliacao, valorComUnidade } from '../../textos-alimentos';
import { ModalCampos } from './componentes-alimentos';

type Marcando = { valorId: string | null; tipo: TipoAvaliacao; alvo: string };

/**
 * Avaliação científica (Fase 5D): "uso com cautela" e validação de base inferida. Separada da
 * conferência (fidelidade da transcrição) e sem alterar o registro, mesmo conferido.
 */
export function SecaoAvaliacao({ d }: { d: RegistroDetalhe }) {
  const [marcando, setMarcando] = useState<Marcando | null>(null);
  const [retirando, setRetirando] = useState<AvaliacaoCientificaApi | null>(null);
  const marcar = useAcaoAlimentos('avaliacao:marcar');
  const retirar = useAcaoAlimentos('avaliacao:retirar');
  if (d.registro.descartadoEm) return null;
  const ativa = (valorId: string | null, tipo: TipoAvaliacao) =>
    d.avaliacoes.some((a) => a.retiradoEm === null && a.valorId === valorId && a.tipo === tipo);
  const alvo = (a: AvaliacaoCientificaApi) => {
    const v = d.valores.find((x) => x.id === a.valorId);
    return v ? `${v.nutriente.codigo} ${valorComUnidade(v)}` : 'Registro inteiro';
  };
  return (
    <section className="flex flex-col gap-3" aria-label="Avaliação científica">
      <h3 className="font-semibold">Avaliação científica</h3>
      <p className="text-sm text-texto-suave">{avisosAlimentos.avaliacaoCientifica}</p>
      <div className="flex flex-wrap gap-2">
        {!ativa(null, 'uso_com_cautela') && (
          <Botao
            variante="secundario"
            onClick={() =>
              setMarcando({ valorId: null, tipo: 'uso_com_cautela', alvo: 'o registro inteiro' })
            }
          >
            Marcar registro como uso com cautela
          </Botao>
        )}
      </div>
      {d.valores.length > 0 && (
        <Tabela aria-label="Avaliação por valor" data-testid="tabela-avaliacao-valores">
          <Cabeca>
            <Th>Valor</Th>
            <Th>Base</Th>
            <Th>Ações</Th>
          </Cabeca>
          <tbody>
            {d.valores.map((v) => {
              const rotulo = `${v.nutriente.codigo} ${valorComUnidade(v)}`;
              return (
                <Linha key={v.id}>
                  <Td>
                    <span className="font-medium">{v.nutriente.codigo}</span> {valorComUnidade(v)}
                  </Td>
                  <Td className="text-xs">
                    {v.interpretacaoBase
                      ? ativa(v.id, 'base_validada')
                        ? 'Inferida, validada'
                        : 'Inferida, não validada'
                      : 'Declarada pela fonte'}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {!ativa(v.id, 'uso_com_cautela') && (
                        <Botao
                          tamanho="pequeno"
                          variante="fantasma"
                          onClick={() =>
                            setMarcando({ valorId: v.id, tipo: 'uso_com_cautela', alvo: rotulo })
                          }
                        >
                          Uso com cautela
                        </Botao>
                      )}
                      {v.interpretacaoBase && !ativa(v.id, 'base_validada') && (
                        <Botao
                          tamanho="pequeno"
                          variante="secundario"
                          onClick={() =>
                            setMarcando({ valorId: v.id, tipo: 'base_validada', alvo: rotulo })
                          }
                        >
                          Validar base
                        </Botao>
                      )}
                    </div>
                  </Td>
                </Linha>
              );
            })}
          </tbody>
        </Tabela>
      )}
      {d.avaliacoes.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="avaliacoes">
          {d.avaliacoes.map((a) => (
            <li key={a.id} className="rounded-lg border border-borda p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {tiposAvaliacao[a.tipo]} · {alvo(a)}
                </span>
                <Selo
                  tom={
                    a.retiradoEm ? 'neutro' : a.tipo === 'uso_com_cautela' ? 'alerta' : 'sucesso'
                  }
                >
                  {a.retiradoEm ? 'Retirada' : 'Ativa'}
                </Selo>
              </div>
              <p className="mt-1 text-texto-suave">
                {a.avaliadoPor}, {formatarDataHora(a.avaliadoEm)}: {a.motivo}
              </p>
              {a.retiradoEm && (
                <p className="mt-1 text-texto-suave">
                  Retirada por {a.retiradoPor}, {formatarDataHora(a.retiradoEm)}: {a.motivoRetirada}
                </p>
              )}
              {!a.retiradoEm && (
                <div className="mt-2">
                  <Botao tamanho="pequeno" variante="fantasma" onClick={() => setRetirando(a)}>
                    Retirar
                  </Botao>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {d.avaliacoes.some((a) => a.retiradoEm === null && a.tipo === 'uso_com_cautela') && (
        <Alerta tom="alerta" titulo="Uso com cautela ativo: fica fora da agregação automática." />
      )}
      {marcando && (
        <ModalCampos
          titulo={marcando.tipo === 'base_validada' ? 'Validar base inferida' : 'Uso com cautela'}
          descricao={`${tiposAvaliacao[marcando.tipo]} em ${marcando.alvo}. ${
            marcando.tipo === 'base_validada'
              ? 'Diga como verificou a base. Validada, a base pode entrar na agregação automática; continua marcada como inferida.'
              : 'Diga por que o dado pede cautela. Ele sai da agregação automática; continua disponível como referência individual, com aviso.'
          } A conferência do registro não muda.`}
          campos={[
            { nome: 'responsavel', rotulo: 'Nome de quem avalia' },
            { nome: 'motivo', rotulo: 'Motivo', multilinha: true },
          ]}
          textoEnviar="Registrar"
          enviando={marcar.isPending}
          aoFechar={() => setMarcando(null)}
          aoConfirmar={(c) =>
            marcar.mutateAsync({
              registroId: d.registro.id,
              valorId: marcando.valorId,
              tipo: marcando.tipo,
              motivo: c['motivo']!,
              responsavel: c['responsavel']!,
            })
          }
        />
      )}
      {retirando && (
        <ModalCampos
          titulo="Retirar avaliação"
          descricao="A avaliação fica no histórico como retirada, com o motivo."
          campos={[
            { nome: 'responsavel', rotulo: 'Nome de quem retira' },
            { nome: 'motivo', rotulo: 'Motivo', multilinha: true },
          ]}
          textoEnviar="Retirar"
          enviando={retirar.isPending}
          aoFechar={() => setRetirando(null)}
          aoConfirmar={(c) =>
            retirar.mutateAsync({
              registroId: d.registro.id,
              avaliacaoId: retirando.id,
              motivo: c['motivo']!,
              responsavel: c['responsavel']!,
            })
          }
        />
      )}
    </section>
  );
}
