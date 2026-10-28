import { textos } from '../../textos';
import { SeletorTema } from '../../components/layout/seletor-tema';
import {
  Cartao,
  CartaoCabecalho,
  CartaoConteudo,
  CartaoDescricao,
  CartaoTitulo,
} from '../../components/ui/cartao';
import { SecaoAlertas } from './secao-alertas';
import { SecaoBackups } from './secao-backups';
import { SecaoSistema } from './secao-sistema';

export function PaginaConfiguracoes() {
  const t = textos.configuracoes;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-8">
      <Cartao>
        <CartaoCabecalho>
          <CartaoTitulo>{t.aparencia}</CartaoTitulo>
          <CartaoDescricao>{t.aparenciaDescricao}</CartaoDescricao>
        </CartaoCabecalho>
        <CartaoConteudo>
          <SeletorTema comRotulo />
        </CartaoConteudo>
      </Cartao>
      <SecaoAlertas />
      <SecaoBackups />
      <SecaoSistema />
    </div>
  );
}
