import { useRef, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import type { ResultadoImportacao } from '@pecuaria/shared-types';
import { COLUNAS_IMPORTACAO } from '@pecuaria/domain';
import { chamarApi, mensagemDeErro } from '../../lib/api';
import { useAcaoRebanho } from '../../lib/consultas-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Cartao, CartaoConteudo, CartaoDescricao, CartaoTitulo } from '../../components/ui/cartao';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { ComPropriedade } from './layout-rebanho';

/**
 * Lê o arquivo escolhido pelo usuário. Tenta UTF-8; se não for válido, usa
 * Windows-1252, que é o padrão do Excel ao salvar "CSV (separado por vírgulas)".
 */
async function lerTexto(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function ConteudoImportar({ propriedadeId }: { propriedadeId: string }) {
  const { notificar } = useNotificacoes();
  const entrada = useRef<HTMLInputElement>(null);
  const importar = useAcaoRebanho('animal:importarCsv');
  const [arquivo, setArquivo] = useState<{ nome: string; conteudo: string } | null>(null);
  const [previa, setPrevia] = useState<ResultadoImportacao | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);

  const analisar = async (escolhido: File) => {
    setPrevia(null);
    setErroLeitura(null);
    if (escolhido.size > 2_000_000) {
      setErroLeitura('O arquivo tem mais de 2 MB. Divida a planilha em partes menores.');
      return;
    }
    const conteudo = await lerTexto(escolhido);
    setArquivo({ nome: escolhido.name, conteudo });
    importar.mutate(
      { propriedadeId, conteudo, confirmar: false },
      { onSuccess: setPrevia, onError: (e) => setErroLeitura(mensagemDeErro(e)) },
    );
  };

  const confirmar = () => {
    if (!arquivo) return;
    importar.mutate(
      { propriedadeId, conteudo: arquivo.conteudo, confirmar: true },
      {
        onSuccess: (r) => {
          setPrevia(r);
          if (r.confirmado) notificar(`${r.importados} animal(is) importado(s).`, 'sucesso');
        },
        onError: (e) => setErroLeitura(mensagemDeErro(e)),
      },
    );
  };

  const salvarModelo = async () => {
    try {
      const r = await chamarApi('animal:salvarModeloCsv', {});
      if (!r.cancelado) notificar(`Modelo salvo em ${r.dados.caminho}.`, 'sucesso');
    } catch (e) {
      notificar(mensagemDeErro(e), 'perigo');
    }
  };

  const podeConfirmar =
    previa &&
    !previa.confirmado &&
    !previa.erroGeral &&
    previa.linhasComErro.length === 0 &&
    previa.totalLinhas > 0;

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Importar animais de planilha"
        descricao="Arquivo CSV separado por ponto e vírgula ou vírgula. Nada é gravado antes da sua confirmação, e a importação só acontece se todas as linhas estiverem corretas."
      />

      <Cartao>
        <CartaoConteudo className="flex flex-col gap-4">
          <div>
            <CartaoTitulo>1. Prepare a planilha</CartaoTitulo>
            <CartaoDescricao>
              Colunas aceitas: {COLUNAS_IMPORTACAO.join(', ')}. Obrigatórias: identificacao, sexo,
              categoria, aptidao e origem. Raça e lote são procurados pelo nome e precisam estar
              cadastrados. Datas em AAAA-MM-DD ou DD/MM/AAAA. Mãe e pai não são importados;
              cadastre-os depois na ficha do animal.
            </CartaoDescricao>
          </div>
          <div>
            <Botao variante="secundario" onClick={salvarModelo}>
              <Download className="size-4" aria-hidden />
              Salvar modelo de planilha
            </Botao>
          </div>
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoConteudo className="flex flex-col gap-4">
          <CartaoTitulo>2. Escolha o arquivo</CartaoTitulo>
          <input
            ref={entrada}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            data-testid="arquivo-csv"
            onChange={(e) => {
              const escolhido = e.target.files?.[0];
              if (escolhido) void analisar(escolhido);
              e.target.value = '';
            }}
          />
          <div className="flex items-center gap-3">
            <Botao
              onClick={() => entrada.current?.click()}
              carregando={importar.isPending && !previa}
            >
              <FileUp className="size-4" aria-hidden />
              Escolher arquivo CSV
            </Botao>
            {arquivo && <span className="text-sm text-texto-suave">{arquivo.nome}</span>}
          </div>
          {erroLeitura && <Alerta tom="perigo" titulo={erroLeitura} />}
        </CartaoConteudo>
      </Cartao>

      {previa && (
        <Cartao>
          <CartaoConteudo className="flex flex-col gap-4">
            <CartaoTitulo>3. Confira e confirme</CartaoTitulo>
            {previa.erroGeral ? (
              <Alerta tom="perigo" titulo={previa.erroGeral} />
            ) : previa.confirmado ? (
              <Alerta
                tom="sucesso"
                titulo={`${previa.importados} animal(is) importado(s) com sucesso.`}
              />
            ) : previa.linhasComErro.length > 0 ? (
              <Alerta
                tom="perigo"
                titulo={`${previa.linhasComErro.length} de ${previa.totalLinhas} linha(s) com problema. Corrija a planilha e escolha o arquivo de novo.`}
              />
            ) : (
              <Alerta
                tom="sucesso"
                titulo={`${previa.linhasValidas} animal(is) prontos para importar.`}
              />
            )}
            {previa.linhasComErro.length > 0 && (
              <Tabela>
                <Cabeca>
                  <Th>Linha</Th>
                  <Th>Identificação</Th>
                  <Th>Problemas</Th>
                </Cabeca>
                <tbody>
                  {previa.linhasComErro.map((l) => (
                    <Linha key={l.linha}>
                      <Td>{l.linha}</Td>
                      <Td>{l.identificacao ?? '—'}</Td>
                      <Td>
                        <ul className="list-disc pl-4">
                          {l.erros.map((e) => (
                            <li key={e}>{e}</li>
                          ))}
                        </ul>
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            )}
            {podeConfirmar && (
              <div>
                <Botao onClick={confirmar} carregando={importar.isPending}>
                  Importar {previa.linhasValidas} animal(is)
                </Botao>
              </div>
            )}
          </CartaoConteudo>
        </Cartao>
      )}
    </div>
  );
}

export function PaginaImportar() {
  return <ComPropriedade>{(p) => <ConteudoImportar propriedadeId={p.id} />}</ComPropriedade>;
}
