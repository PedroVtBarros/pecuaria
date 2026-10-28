import { useMemo, useState } from 'react';
import { gerarUuidV7, semAcentos, normalizarNome } from '@pecuaria/domain';
import type { NegociacaoDetalhe } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Campo, Entrada } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro } from '../../lib/consultas-financeiro';
import { useAnimais } from '../../lib/consultas-rebanho';
import { hojeIso } from '../../lib/formatar-rebanho';
import { rotulos } from '../../textos-rebanho';
import { centavosDoTexto } from './campo-dinheiro';
import { condicaoInicial } from './editor-condicao';
import {
  CamposNegociacao,
  PreviaAlocacao,
  estadoNegocioInicial,
  interpretar,
  quilosDoTexto,
  type EstadoNegociacao,
  type LinhaAnimal,
} from './formulario-negociacao';

/** Venda de animais: dá a saída dos animais e registra a receita numa só operação. */
export function ModalVenda({
  propriedadeId,
  aoFechar,
  aoRegistrar,
}: {
  propriedadeId: string;
  aoFechar: () => void;
  aoRegistrar: (n: NegociacaoDetalhe) => void;
}) {
  const registrar = useAcaoFinanceiro('negociacao:registrarVenda');
  const ativos = useAnimais(propriedadeId, { status: 'ativo', tamanhoPagina: 5000 });
  const [requisicaoId] = useState(() => gerarUuidV7());
  const [estado, setEstado] = useState<EstadoNegociacao>(() =>
    estadoNegocioInicial(hojeIso(), condicaoInicial(hojeIso())),
  );
  const [busca, setBusca] = useState('');
  const [escolhidos, setEscolhidos] = useState<LinhaAnimal[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const usaCarcaca = estado.unidadePreco === 'arroba_carcaca' || estado.criterio === 'peso_carcaca';
  const manual = estado.criterio === 'manual';
  const interpretacao = useMemo(
    () => interpretar(estado, escolhidos, 'receita'),
    [estado, escolhidos],
  );
  const chave = semAcentos(normalizarNome(busca));
  const disponiveis = (ativos.data?.itens ?? []).filter(
    (a) =>
      !escolhidos.some((e) => e.chave === a.id) &&
      (chave === '' ||
        semAcentos(normalizarNome(`${a.identificacao} ${a.nome ?? ''}`)).includes(chave)),
  );
  const atualizar = (c: string, mudanca: Partial<LinhaAnimal>) =>
    setEscolhidos(escolhidos.map((a) => (a.chave === c ? { ...a, ...mudanca } : a)));

  return (
    <Modal
      aberto
      largura="xl"
      titulo="Registrar venda de animais"
      descricao="Dá a saída dos animais do rebanho (vendidos) e registra a receita. Nenhum recebimento é registrado sem a sua confirmação."
      aoFechar={aoFechar}
      textoEnviar="Registrar venda"
      enviando={registrar.isPending}
      erros={erros}
      aoEnviar={() => {
        if (
          interpretacao.erros.length > 0 ||
          !interpretacao.condicao ||
          !interpretacao.totalCentavos
        )
          return setErros(interpretacao.erros.length ? interpretacao.erros : ['Revise os dados.']);
        registrar.mutate(
          {
            requisicaoId,
            propriedadeId,
            data: estado.data,
            pessoaId: estado.pessoaId || null,
            atividade: estado.atividade,
            observacoes: estado.observacoes.trim() || null,
            valorTotalCentavos: interpretacao.totalCentavos,
            unidadePreco: estado.unidadePreco,
            precoUnitarioCentavos: interpretacao.precoCentavos,
            criterio: estado.criterio,
            condicao: interpretacao.condicao,
            animais: escolhidos.map((a) => ({
              animalId: a.chave,
              pesoVivoKg: quilosDoTexto(a.pesoVivo),
              pesoCarcacaKg: quilosDoTexto(a.pesoCarcaca),
              valorManualCentavos: manual ? centavosDoTexto(a.valorManual).centavos : null,
            })),
          },
          { onSuccess: aoRegistrar, onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      <fieldset className="flex flex-col gap-3 rounded-lg border border-borda p-4">
        <legend className="px-1 text-sm font-medium">Animais vendidos ({escolhidos.length})</legend>
        <Campo rotulo="Buscar animal ativo">
          {(p) => (
            <Entrada
              {...p}
              value={busca}
              placeholder="Identificação ou nome"
              onChange={(e) => setBusca(e.target.value)}
            />
          )}
        </Campo>
        {ativos.isLoading ? (
          <p className="text-sm text-texto-suave">Carregando animais…</p>
        ) : disponiveis.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhum animal ativo disponível para a busca.</p>
        ) : (
          <ul
            className="flex max-h-40 flex-col overflow-y-auto rounded-md border border-borda"
            data-testid="animais-disponiveis"
          >
            {disponiveis.slice(0, 100).map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-superficie-2"
                  onClick={() =>
                    setEscolhidos([
                      ...escolhidos,
                      {
                        chave: a.id,
                        rotulo: a.identificacao,
                        pesoVivo: a.ultimaPesagem
                          ? String(a.ultimaPesagem.pesoVivoKg).replace('.', ',')
                          : '',
                        pesoCarcaca: '',
                        valorManual: '',
                      },
                    ])
                  }
                >
                  <span>
                    <strong>{a.identificacao}</strong> · {rotulos.categoria[a.categoria]}
                    {a.lote ? ` · ${a.lote.nome}` : ''}
                  </span>
                  <span className="text-xs text-texto-suave">
                    {a.ultimaPesagem
                      ? `última pesagem ${a.ultimaPesagem.pesoVivoKg} kg`
                      : 'sem pesagem'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2" data-testid="animais-da-venda">
          {escolhidos.map((a) => (
            <div
              key={a.chave}
              className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto]"
            >
              <div className="text-sm font-medium">{a.rotulo}</div>
              <Campo rotulo="Peso vivo na venda (kg)">
                {(p) => (
                  <Entrada
                    {...p}
                    inputMode="decimal"
                    value={a.pesoVivo}
                    onChange={(e) => atualizar(a.chave, { pesoVivo: e.target.value })}
                  />
                )}
              </Campo>
              {usaCarcaca ? (
                <Campo rotulo="Carcaça (kg)">
                  {(p) => (
                    <Entrada
                      {...p}
                      inputMode="decimal"
                      value={a.pesoCarcaca}
                      onChange={(e) => atualizar(a.chave, { pesoCarcaca: e.target.value })}
                    />
                  )}
                </Campo>
              ) : manual ? (
                <Campo rotulo="Valor (R$)">
                  {(p) => (
                    <Entrada
                      {...p}
                      inputMode="decimal"
                      value={a.valorManual}
                      onChange={(e) => atualizar(a.chave, { valorManual: e.target.value })}
                    />
                  )}
                </Campo>
              ) : (
                <div />
              )}
              <button
                type="button"
                className="text-sm text-perigo hover:underline"
                onClick={() => setEscolhidos(escolhidos.filter((x) => x.chave !== a.chave))}
              >
                Remover
              </button>
            </div>
          ))}
        </div>
        {escolhidos.length > 0 && (
          <Alerta tom="info">
            O peso preenchido vem da última pesagem registrada, só para ajudar: confirme o peso do
            documento de venda. Peso de carcaça só existe se for informado pelo frigorífico; o
            sistema nunca o estima a partir do peso vivo.
          </Alerta>
        )}
      </fieldset>
      <CamposNegociacao
        estado={estado}
        aoMudar={setEstado}
        linhas={escolhidos}
        natureza="receita"
        rotuloContraparte="Comprador"
        sugerirTotal
      />
      {escolhidos.length > 0 && (
        <PreviaAlocacao
          linhas={escolhidos}
          interpretacao={interpretacao}
          criterio={estado.criterio}
        />
      )}
    </Modal>
  );
}
