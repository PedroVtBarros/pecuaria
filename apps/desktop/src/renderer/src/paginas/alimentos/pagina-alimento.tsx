import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Plus } from 'lucide-react';
import { ORIGENS_FONTE, type OrigemFonte } from '@pecuaria/domain';
import type { AlimentoDetalhe, Nutriente, ResumoRegistro } from '@pecuaria/shared-types';
import { usePropriedadeAtual } from '../../hooks/use-propriedade-atual';
import { mensagemDeErro } from '../../lib/api';
import {
  useAcaoAlimentos,
  useAlimento,
  useFontes,
  useNutrientes,
  useRegistro,
} from '../../lib/consultas-alimentos';
import { formatarDataHora } from '../../lib/formatar';
import { formatarData } from '../../lib/formatar-rebanho';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Cartao, CartaoConteudo } from '../../components/ui/cartao';
import { CabecalhoPagina, ListaDados } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import {
  avisosAlimentos,
  classesAlimento,
  descreverFonte,
  formasConservacao,
  naturezaDaOrigem,
  origensFonte,
  rotuloAcaoHistorico,
} from '../../textos-alimentos';
import { AvisoOrigem, ModalCampos, SeloOrigem, SeloStatus } from './componentes-alimentos';
import { ModalCabecalhoRegistro } from './formularios-registro';
import { ModalAlimento } from './pagina-alimentos';
import { TabelaNaoQuantificados, TabelaValores } from './pagina-registro';

/** Um registro com seus valores e a lista do que a fonte não informou (nunca zero). */
function CartaoRegistro({ r, catalogo }: { r: ResumoRegistro; catalogo: Nutriente[] }) {
  const d = useRegistro(r.id);
  // Não quantificado é informado pela fonte (só não é número): não entra em "não informado".
  const presentes = new Set(
    [...(d.data?.valores ?? []), ...(d.data?.valoresNaoQuantificados ?? [])].map(
      (v) => v.nutriente.id,
    ),
  );
  const ausentes = catalogo.filter((n) => !presentes.has(n.id)).map((n) => n.codigo);
  return (
    <Cartao data-testid="cartao-registro">
      <CartaoConteudo className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="font-medium text-marca hover:underline"
              to={`/alimentos/registros/${r.id}`}
            >
              {descreverFonte(r.fonte)}
            </Link>
            <SeloStatus status={r.status} />
          </div>
          <span className="text-xs text-texto-suave">
            {[
              r.referenciaLocal,
              r.dataAmostra && `Amostra de ${formatarData(r.dataAmostra)}`,
              r.idadeCorteDias !== null && `${r.idadeCorteDias} dias de corte`,
              r.fonte.propriedadeNome,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        {d.data && (
          <>
            <TabelaValores valores={d.data.valores} />
            {d.data.valoresNaoQuantificados.length > 0 && (
              <TabelaNaoQuantificados valores={d.data.valoresNaoQuantificados} />
            )}
            {ausentes.length > 0 && (
              <p className="text-xs text-texto-suave">
                {avisosAlimentos.ausente}: {ausentes.join(', ')}.
              </p>
            )}
          </>
        )}
      </CartaoConteudo>
    </Cartao>
  );
}

function Ficha({ d, propriedadeId }: { d: AlimentoDetalhe; propriedadeId: string | null }) {
  const a = d.alimento;
  const navegar = useNavigate();
  const [modal, setModal] = useState<'editar' | 'excluir' | 'registro' | null>(null);
  const fontes = useFontes({ propriedadeId });
  const catalogo = useNutrientes();
  const excluir = useAcaoAlimentos('alimento:excluir');
  const porOrigem = ORIGENS_FONTE.map(
    (o) => [o, d.registros.filter((r) => r.fonte.origem === o)] as const,
  ).filter(([, lista]) => lista.length > 0) as [OrigemFonte, ResumoRegistro[]][];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        voltar={{ para: '/alimentos', rotulo: 'Alimentos' }}
        titulo={a.nome}
        selo={
          <div className="flex gap-2">
            {a.comercial && <Selo tom="alerta">Comercial</Selo>}
            {a.excluidoEm && <Selo tom="perigo">Excluído</Selo>}
          </div>
        }
        descricao={`${formasConservacao[a.formaConservacao]} · ${classesAlimento[a.classe]}`}
        acoes={
          a.excluidoEm ? null : (
            <>
              <Botao onClick={() => setModal('registro')}>
                <Plus className="size-4" aria-hidden />
                Novo registro
              </Botao>
              <Botao variante="secundario" onClick={() => setModal('editar')}>
                Editar
              </Botao>
              <Botao variante="fantasma" onClick={() => setModal('excluir')}>
                Excluir
              </Botao>
            </>
          )
        }
      />
      <Cartao>
        <CartaoConteudo>
          <ListaDados
            itens={[
              { rotulo: 'Espécie', valor: a.especie },
              { rotulo: 'Cultivar', valor: a.cultivar },
              { rotulo: 'Parte da planta', valor: a.partePlanta },
              { rotulo: 'Processamento', valor: a.processamento },
              {
                rotulo: 'Itens de estoque vinculados',
                valor: d.itensEstoque.length
                  ? d.itensEstoque.map((i) => `${i.nome} (${i.propriedadeNome})`).join(', ')
                  : null,
              },
              { rotulo: 'Observações', valor: a.observacoes },
            ]}
          />
        </CartaoConteudo>
      </Cartao>
      {d.registros.length === 0 ? (
        <Alerta tom="info" titulo="Sem registros de composição.">
          {avisosAlimentos.semValorDeReferencia}
        </Alerta>
      ) : (
        porOrigem.map(([origem, lista]) => (
          <section key={origem} className="flex flex-col gap-3" aria-label={origensFonte[origem]}>
            <div className="flex items-center gap-2">
              <SeloOrigem origem={origem} />
              <span className="text-sm text-texto-suave">{naturezaDaOrigem[origem]}</span>
            </div>
            <AvisoOrigem origem={origem} />
            {lista.map((r) => (
              <CartaoRegistro key={r.id} r={r} catalogo={catalogo.data ?? []} />
            ))}
          </section>
        ))
      )}
      <section className="flex flex-col gap-2" aria-label="Histórico do alimento">
        <h3 className="font-semibold">Histórico</h3>
        <ul className="flex flex-col gap-1 text-sm text-texto-suave">
          {d.historico.map((h) => (
            <li key={h.id}>
              {formatarDataHora(h.ocorridoEm)} · {rotuloAcaoHistorico(h.acao)}
              {h.motivo && ` · ${h.motivo}`}
            </li>
          ))}
        </ul>
      </section>
      {modal === 'editar' && (
        <ModalAlimento
          alimento={a}
          comRegistros={d.registros.length > 0}
          aoFechar={() => setModal(null)}
        />
      )}
      {modal === 'excluir' && (
        <ModalCampos
          titulo="Excluir alimento"
          descricao="Exclusão lógica. Só é possível sem registros de composição e sem itens de estoque vinculados."
          campos={[{ nome: 'motivo', rotulo: 'Motivo', multilinha: true }]}
          textoEnviar="Excluir"
          perigoso
          enviando={excluir.isPending}
          aoFechar={() => setModal(null)}
          aoConfirmar={(c) => excluir.mutateAsync({ id: a.id, motivo: c['motivo']! })}
        />
      )}
      {modal === 'registro' && (
        <ModalCabecalhoRegistro
          alimentoId={a.id}
          fontes={(fontes.data ?? []).filter((f) => !f.excluidaEm)}
          registro={null}
          aoFechar={() => setModal(null)}
          aoSalvar={(id) => navegar(`/alimentos/registros/${id}`)}
        />
      )}
    </div>
  );
}

export function PaginaAlimento() {
  const { id = '' } = useParams();
  const { propriedade, carregando } = usePropriedadeAtual();
  const propriedadeId = propriedade?.id ?? null;
  const ficha = useAlimento(carregando ? '' : id, propriedadeId);
  if (ficha.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(ficha.error)} />;
  if (!ficha.data) return null;
  return <Ficha d={ficha.data} propriedadeId={propriedadeId} />;
}
