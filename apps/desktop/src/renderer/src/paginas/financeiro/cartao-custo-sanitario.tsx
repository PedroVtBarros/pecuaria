import { useState } from 'react';
import { Link } from 'react-router';
import { formatarCentavos, gerarUuidV7 } from '@pecuaria/domain';
import type { Apuracao } from '@pecuaria/domain';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro, useCategoriasFinanceiras } from '../../lib/consultas-financeiro';
import { useCustoSanitario } from '../../lib/consultas-insumos';
import { formatarData, hojeIso } from '../../lib/formatar-rebanho';
import { CampoDinheiro, centavosDoTexto } from './campo-dinheiro';
import { EditorCondicao, condicaoInicial, converterCondicao } from './editor-condicao';

const rotuloEstado: Record<Apuracao['estado'], string> = {
  completa: 'Custo apurado',
  parcial: 'Custo parcial (no mínimo)',
  desconhecida: 'Custo desconhecido',
  nao_apurada: 'Custo não apurado',
};

function ModalServico({ manejoId, aoFechar }: { manejoId: string; aoFechar: () => void }) {
  const lancar = useAcaoFinanceiro('custoSanitario:lancarServico');
  const categorias = useCategoriasFinanceiras(false);
  const [requisicaoId] = useState(() => gerarUuidV7());
  const [categoriaId, setCategoriaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hojeIso());
  const [condicao, setCondicao] = useState(() => condicaoInicial(hojeIso()));
  const [erros, setErros] = useState<string[]>([]);
  const total = centavosDoTexto(valor).centavos;
  return (
    <Modal
      aberto
      largura="lg"
      titulo="Lançar serviço deste registro"
      descricao="Despesa de um serviço (consulta, exame) ligada a este registro sanitário. Soma ao custo do registro sem repetir a baixa de estoque."
      aoFechar={aoFechar}
      textoEnviar="Lançar serviço"
      enviando={lancar.isPending}
      erros={erros}
      aoEnviar={() => {
        if (!categoriaId) return setErros(['Escolha a categoria.']);
        const { centavos, erro } = centavosDoTexto(valor);
        if (erro || centavos === null || centavos <= 0)
          return setErros([erro ?? 'Informe um valor maior que zero.']);
        const c = converterCondicao(condicao, centavos, true);
        if (!c.condicao) return setErros(c.erros);
        lancar.mutate(
          {
            requisicaoId,
            manejoId,
            categoriaId,
            pessoaId: null,
            dataCompetencia: data,
            valorTotalCentavos: centavos,
            descricao,
            documentoNumero: null,
            condicao: c.condicao,
          },
          { onSuccess: aoFechar, onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      <Campo rotulo="Categoria" obrigatorio>
        {(p) => (
          <Selecao {...p} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Escolher…</option>
            {(categorias.data ?? [])
              .filter((c) => c.natureza === 'despesa' && c.tratamento === 'resultado')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo="Descrição do serviço" obrigatorio>
        {(p) => (
          <Entrada
            {...p}
            maxLength={200}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        )}
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CampoDinheiro rotulo="Valor" valor={valor} aoMudar={setValor} obrigatorio />
        <Campo rotulo="Data de competência" obrigatorio>
          {(p) => (
            <Entrada {...p} type="date" value={data} onChange={(e) => setData(e.target.value)} />
          )}
        </Campo>
      </div>
      <EditorCondicao
        estado={condicao}
        aoMudar={setCondicao}
        totalCentavos={total}
        natureza="despesa"
      />
    </Modal>
  );
}

/** Custo do registro sanitário por componentes, sem contar o mesmo custo duas vezes (plano 5.6). */
export function CartaoCustoSanitario({ manejoId }: { manejoId: string }) {
  const consulta = useCustoSanitario(manejoId);
  const [lancando, setLancando] = useState(false);
  const c = consulta.data;
  if (consulta.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />;
  if (!c) return null;
  const a = c.apuracao;
  return (
    <section className="flex flex-col gap-2" data-testid="custo-sanitario">
      <h3 className="font-semibold">Custo do registro (Financeiro)</h3>
      <p className="text-sm">
        <strong>{rotuloEstado[a.estado]}</strong>
        {a.estado === 'nao_apurada' || a.estado === 'desconhecida'
          ? ''
          : `: ${a.estado === 'parcial' ? 'no mínimo ' : ''}${formatarCentavos(a.valorConhecidoCentavos)}`}
      </p>
      <ul className="list-disc pl-5 text-sm">
        <li>
          Baixa de estoque:{' '}
          {c.estoque.quantidade === 0
            ? 'nenhuma'
            : `${c.estoque.quantidade} baixa(s), ${formatarCentavos(c.estoque.conhecidoCentavos)}${c.estoque.desconhecidos > 0 ? `, ${c.estoque.desconhecidos} sem custo conhecido` : ''}`}
        </li>
        <li>
          Serviços lançados:{' '}
          {c.servicos.length === 0 ? 'nenhum' : `${formatarCentavos(c.servicosCentavos)}`}
          {c.servicos.map((s) => (
            <span key={s.id} className="ml-2">
              (
              <Link className="text-marca hover:underline" to={`/financeiro/lancamentos/${s.id}`}>
                {s.descricao}
              </Link>
              )
            </span>
          ))}
        </li>
        <li>
          Custo digitado no registro:{' '}
          {c.informadoCentavos === null
            ? 'não informado'
            : c.informadoContado
              ? `${formatarCentavos(c.informadoCentavos)} (conta, porque não há baixa nem serviço)`
              : `${formatarCentavos(c.informadoCentavos)} (informado, não contado: o custo já vem da baixa ou do serviço)`}
        </li>
      </ul>
      {c.porAnimal.length > 0 && (
        <p className="text-sm text-texto-suave">
          Por animal ({c.porAnimal.length}):{' '}
          {c.porAnimal
            .map((p) => formatarCentavos(p.valorCentavos))
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .join(' ou ')}
          {a.estado === 'parcial' ? ' (no mínimo)' : ''}. Divisão igual entre os animais tratados,
          em {formatarData(c.data)}.
        </p>
      )}
      <div>
        <Botao variante="secundario" tamanho="pequeno" onClick={() => setLancando(true)}>
          Lançar serviço
        </Botao>
      </div>
      <p className="text-xs text-texto-suave">{c.observacao}</p>
      {lancando && <ModalServico manejoId={manejoId} aoFechar={() => setLancando(false)} />}
    </section>
  );
}
