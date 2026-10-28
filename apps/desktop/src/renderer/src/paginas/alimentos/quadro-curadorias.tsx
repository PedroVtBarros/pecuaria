import { useState } from 'react';
import { Link } from 'react-router';
import type { AtualizacaoCuradoria, ResumoPacoteCuradoria } from '@pecuaria/shared-types';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoAlimentos, useCuradorias } from '../../lib/consultas-alimentos';
import { formatarDataHora } from '../../lib/formatar';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Cartao, CartaoConteudo, CartaoDescricao, CartaoTitulo } from '../../components/ui/cartao';
import { Selo } from '../../components/ui/selo';
import { avisosAlimentos, situacoesAtualizacao } from '../../textos-alimentos';
import { ModalCampos } from './componentes-alimentos';

function citacao(p: ResumoPacoteCuradoria): string {
  const f = p.fonte;
  return [
    `${f.autores.replace(/\.$/, '')}. ${f.titulo}`,
    f.edicaoVersao,
    String(f.ano),
    f.isbnDoiUrl && `Disponível em: ${f.isbnDoiUrl}`,
    f.dataAcesso && `Consultado em ${f.dataAcesso.split('-').reverse().join('/')}`,
  ]
    .filter(Boolean)
    .join('. ');
}

/** O que a atualização fez: contagem por situação e, para o que mudou ou não foi alterado, o porquê. */
function ResumoAtualizacao({ a }: { a: AtualizacaoCuradoria }) {
  const contagem = new Map<string, number>();
  for (const i of a.itens) contagem.set(i.situacao, (contagem.get(i.situacao) ?? 0) + 1);
  const detalhados = a.itens.filter((i) => i.situacao !== 'sem_mudanca' && i.mudancas.length);
  return (
    <div className="flex flex-col gap-1 text-xs" data-testid="curadoria-atualizacao">
      <p>
        Atualizado da versão {a.deVersao}:{' '}
        {[...contagem]
          .map(([s, n]) => `${situacoesAtualizacao[s as keyof typeof situacoesAtualizacao]} (${n})`)
          .join('; ')}
        .{a.fonteAlterada.length > 0 && ` Fonte: ${a.fonteAlterada.join(', ')} atualizados.`}
      </p>
      {detalhados.length > 0 && (
        <ul className="flex flex-col gap-1 text-texto-suave [overflow-wrap:anywhere]">
          {detalhados.map((i) => (
            <li key={i.referenciaLocal}>
              <span className="font-medium">{i.alimento}</span> ({i.referenciaLocal}):{' '}
              {situacoesAtualizacao[i.situacao]}. {i.mudancas.join('; ')}.
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Um pacote: o que traz, de onde, e o botão de importar (nunca automático). */
function CartaoPacote({ p }: { p: ResumoPacoteCuradoria }) {
  const [confirmar, setConfirmar] = useState(false);
  const importar = useAcaoAlimentos('curadoria:importar');
  const atualizar = useAcaoAlimentos('curadoria:atualizar');
  // Outra versão já importada: a nova só entra por atualização, nunca por nova importação.
  const anterior = !p.importacao && p.versaoImportada !== null ? p.versaoImportada : null;
  const c = p.contagem;
  return (
    <Cartao data-testid="cartao-curadoria">
      <CartaoConteudo className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CartaoTitulo>{p.titulo}</CartaoTitulo>
          {p.importacao ? (
            <Selo tom="sucesso">Importado</Selo>
          ) : anterior !== null ? (
            <Selo tom="alerta">Versão {anterior} importada</Selo>
          ) : (
            <Selo tom="neutro">Não importado</Selo>
          )}
        </div>
        <CartaoDescricao>{p.descricao}</CartaoDescricao>
        <p className="text-sm [overflow-wrap:anywhere]">
          <span className="font-medium">Fonte:</span> {citacao(p)}
        </p>
        <p className="text-sm">
          Importa {c.alimentos} alimentos, {c.registros} registros e {c.valores} valores.
          Nutrientes: {p.nutrientes.join(', ')}. Transcrito por {p.transcritoPor}.
        </p>
        <ul className="grid grid-cols-1 gap-x-6 text-xs text-texto-suave sm:grid-cols-2">
          {p.alimentos.map((a) => (
            <li key={a.nome}>
              {a.nome}: {a.registros} {a.registros === 1 ? 'registro' : 'registros'}, {a.valores}{' '}
              valores{a.bloqueados > 0 && ` (${a.bloqueados} bloqueado)`}
            </li>
          ))}
        </ul>
        {p.bloqueados.length > 0 && (
          <Alerta
            tom="alerta"
            titulo={`${p.bloqueados.length} ${p.bloqueados.length === 1 ? 'registro bloqueado' : 'registros bloqueados'} para importação`}
          >
            <ul className="flex flex-col gap-1" data-testid="curadoria-bloqueados">
              {p.bloqueados.map((b) => (
                <li key={b.referenciaLocal}>
                  <span className="font-medium">{b.alimento}</span> ({b.referenciaLocal}):{' '}
                  {b.motivo}
                </li>
              ))}
            </ul>
          </Alerta>
        )}
        {p.importacao ? (
          <Alerta
            tom="sucesso"
            titulo={`Importado em ${formatarDataHora(p.importacao.importadoEm)}.`}
          >
            Os registros chegaram como transcritos.{' '}
            <Link className="text-marca underline" to="/alimentos/conferencia">
              Conferir na aba Conferência
            </Link>
            .{p.atualizacao && <ResumoAtualizacao a={p.atualizacao} />}
          </Alerta>
        ) : anterior !== null ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              Este aplicativo traz a versão {p.versao} do pacote; a versão {anterior} já está no
              banco.
            </p>
            <div>
              <Botao onClick={() => setConfirmar(true)}>Atualizar para a versão {p.versao}</Botao>
            </div>
          </div>
        ) : (
          <div>
            <Botao onClick={() => setConfirmar(true)}>Importar para conferência</Botao>
          </div>
        )}
      </CartaoConteudo>
      {confirmar && anterior !== null && (
        <ModalCampos
          titulo={`Atualizar pacote para a versão ${p.versao}`}
          descricao={`${avisosAlimentos.curadoriaAtualizacao} ${avisosAlimentos.curadoriaConferencia}`}
          campos={[]}
          textoEnviar="Atualizar"
          largura="lg"
          enviando={atualizar.isPending}
          aoFechar={() => setConfirmar(false)}
          aoConfirmar={() => atualizar.mutateAsync({ codigo: p.codigo, versao: p.versao })}
        />
      )}
      {confirmar && anterior === null && (
        <ModalCampos
          titulo="Importar pacote de curadoria"
          descricao={`Cria a fonte ${p.fonte.codigo} (ou usa a já cadastrada com esse código), os alimentos que faltam e ${c.registros} registros como transcritos por ${p.transcritoPor}. ${avisosAlimentos.curadoriaConferencia}`}
          campos={[]}
          textoEnviar="Importar"
          largura="lg"
          enviando={importar.isPending}
          aoFechar={() => setConfirmar(false)}
          aoConfirmar={() => importar.mutateAsync({ codigo: p.codigo, versao: p.versao })}
        />
      )}
    </Cartao>
  );
}

/** Pacotes de curadoria embutidos no aplicativo (Fase 5B). */
export function QuadroCuradorias() {
  const lista = useCuradorias();
  if (lista.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(lista.error)} />;
  if (!lista.data?.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-label="Curadorias incluídas no sistema">
      <h3 className="font-semibold">Curadorias incluídas no sistema</h3>
      <p className="text-sm text-texto-suave">{avisosAlimentos.curadoria}</p>
      {lista.data.map((p) => (
        <CartaoPacote key={`${p.codigo}-${p.versao}`} p={p} />
      ))}
    </section>
  );
}
