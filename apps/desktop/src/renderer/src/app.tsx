import { Link, Navigate, Route, Routes } from 'react-router';
import { Estrutura } from './components/layout/estrutura';
import { MODULOS } from './modulos';
import { PaginaConfiguracoes } from './paginas/configuracoes/pagina-configuracoes';
import { LayoutManejo } from './paginas/manejo/layout-manejo';
import { PaginaAgenda } from './paginas/manejo/pagina-agenda';
import { PaginaAlertasPesagem } from './paginas/manejo/pagina-alertas-pesagem';
import { PaginaPesagemLote } from './paginas/manejo/pagina-pesagem-lote';
import { PaginaProdutos } from './paginas/manejo/pagina-produtos';
import { PaginaRegistroDetalhe } from './paginas/manejo/pagina-registro-detalhe';
import { PaginaRegistroNovo } from './paginas/manejo/pagina-registro-novo';
import { PaginaRegistros } from './paginas/manejo/pagina-registros';
import { PaginaModuloPlanejado } from './paginas/pagina-modulo-planejado';
import { PaginaPainel } from './paginas/pagina-painel';
import { LayoutRebanho } from './paginas/rebanho/layout-rebanho';
import { PaginaAnimais } from './paginas/rebanho/pagina-animais';
import { PaginaAnimalDetalhe } from './paginas/rebanho/pagina-animal-detalhe';
import { PaginaEditarAnimal, PaginaNovoAnimal } from './paginas/rebanho/pagina-animal-formulario';
import { PaginaAreas } from './paginas/rebanho/pagina-areas';
import { PaginaImportar } from './paginas/rebanho/pagina-importar';
import { PaginaLoteDetalhe } from './paginas/rebanho/pagina-lote-detalhe';
import { PaginaLotes } from './paginas/rebanho/pagina-lotes';
import { PaginaPropriedades } from './paginas/rebanho/pagina-propriedades';
import { PaginaRacas } from './paginas/rebanho/pagina-racas';
import { textos } from './textos';
import { PaginaEstoque } from './paginas/estoque/pagina-estoque';
import { LayoutFinanceiro } from './paginas/financeiro/layout-financeiro';
import { PaginaLancamentos } from './paginas/financeiro/pagina-lancamentos';
import { PaginaPainelFinanceiro } from './paginas/financeiro/pagina-painel';
import { PaginaNegociacoes } from './paginas/financeiro/pagina-negociacoes';
import { PaginaComprasInsumos } from './paginas/financeiro/pagina-compras-insumos';
import { PaginaCompraInsumos } from './paginas/financeiro/pagina-compra-insumos';
import { PaginaProducao } from './paginas/financeiro/pagina-producao';
import { PaginaResultado } from './paginas/financeiro/pagina-resultado';
import { PaginaConciliacao } from './paginas/financeiro/pagina-conciliacao';
import { PaginaProjecao } from './paginas/financeiro/pagina-projecao';
import { PaginaRelatorios } from './paginas/financeiro/pagina-relatorios';
import { PaginaCentroProducao } from './paginas/financeiro/pagina-centro-producao';
import { PaginaRateio } from './paginas/financeiro/pagina-rateio';
import { PaginaCustos } from './paginas/financeiro/pagina-custos';
import { PaginaCustosConsumo } from './paginas/financeiro/pagina-custos-consumo';
import { PaginaPendencias } from './paginas/financeiro/pagina-pendencias';
import { PaginaNegociacao } from './paginas/financeiro/pagina-negociacao';
import { PaginaCustoAnterior } from './paginas/financeiro/pagina-custo-anterior';
import { PaginaFluxo } from './paginas/financeiro/pagina-fluxo';
import { PaginaContas } from './paginas/financeiro/pagina-contas';
import { PaginaClassificacoes } from './paginas/financeiro/pagina-classificacoes';
import { PaginaLancamento } from './paginas/financeiro/pagina-lancamento';
import { PaginaCategorias, PaginaContrapartes } from './paginas/financeiro/cadastros-financeiros';
import { PaginaItemEstoque } from './paginas/estoque/pagina-item-estoque';
import { LayoutAlimentos } from './paginas/alimentos/componentes-alimentos';
import { PaginaAlimentos } from './paginas/alimentos/pagina-alimentos';
import { PaginaExigencias } from './paginas/nutricao/pagina-exigencias';
import { LayoutNutricao } from './paginas/nutricao/layout-nutricao';
import { PaginaAvaliarDieta } from './paginas/nutricao/pagina-avaliar-dieta';
import { PaginaAvaliacao, PaginaAvaliacoes } from './paginas/nutricao/pagina-avaliacoes';
import { PaginaAlimento } from './paginas/alimentos/pagina-alimento';
import { PaginaRegistro } from './paginas/alimentos/pagina-registro';
import { PaginaConferencia } from './paginas/alimentos/pagina-conferencia';
import { PaginaSelecao } from './paginas/alimentos/pagina-selecao';
import { PaginaPerfil, PaginaPerfis } from './paginas/alimentos/pagina-perfis';
import { PaginaFontes } from './paginas/alimentos/pagina-fontes';
import { PaginaNutrientes } from './paginas/alimentos/pagina-nutrientes';
import { PaginaProdutosComerciais } from './paginas/alimentos/pagina-produtos';
import { PaginaPropriedadeAlimentos } from './paginas/alimentos/pagina-propriedade';

function PaginaNaoEncontrada() {
  return (
    <div className="flex flex-col items-center gap-3 p-16 text-texto-suave">
      <p>{textos.geral.paginaNaoEncontrada}</p>
      <Link to="/" className="text-marca underline">
        {textos.geral.voltarAoPainel}
      </Link>
    </div>
  );
}

/** Rotas. Módulos com fase futura apontam para a página de módulo planejado. */
export function App() {
  return (
    <Routes>
      <Route element={<Estrutura />}>
        <Route index element={<PaginaPainel />} />
        <Route path="configuracoes" element={<PaginaConfiguracoes />} />
        <Route path="rebanho" element={<LayoutRebanho />}>
          <Route index element={<Navigate to="animais" replace />} />
          <Route path="animais" element={<PaginaAnimais />} />
          <Route path="animais/novo" element={<PaginaNovoAnimal />} />
          <Route path="animais/:id" element={<PaginaAnimalDetalhe />} />
          <Route path="animais/:id/editar" element={<PaginaEditarAnimal />} />
          <Route path="lotes" element={<PaginaLotes />} />
          <Route path="lotes/:id" element={<PaginaLoteDetalhe />} />
          <Route path="areas" element={<PaginaAreas />} />
          <Route path="propriedades" element={<PaginaPropriedades />} />
          <Route path="racas" element={<PaginaRacas />} />
          <Route path="importar" element={<PaginaImportar />} />
        </Route>
        <Route path="estoque" element={<PaginaEstoque />} />
        <Route path="estoque/itens/:id" element={<PaginaItemEstoque />} />
        <Route path="financeiro" element={<LayoutFinanceiro />}>
          <Route index element={<PaginaPainelFinanceiro />} />
          <Route path="lancamentos" element={<PaginaLancamentos />} />
          <Route path="insumos" element={<PaginaComprasInsumos />} />
          <Route path="insumos/:id" element={<PaginaCompraInsumos />} />
          <Route path="consumo" element={<PaginaCustosConsumo />} />
          <Route path="rateio" element={<PaginaRateio />} />
          <Route path="custos" element={<PaginaCustos />} />
          <Route path="producao" element={<PaginaProducao />} />
          <Route path="producao/:id" element={<PaginaCentroProducao />} />
          <Route path="resultado" element={<PaginaResultado />} />
          <Route path="conciliacao" element={<PaginaConciliacao />} />
          <Route path="projecao" element={<PaginaProjecao />} />
          <Route path="relatorios" element={<PaginaRelatorios />} />
          <Route path="pendencias" element={<PaginaPendencias />} />
          <Route path="animais" element={<PaginaNegociacoes />} />
          <Route path="animais/:id" element={<PaginaNegociacao />} />
          <Route path="custo-anterior" element={<PaginaCustoAnterior />} />
          <Route path="fluxo" element={<PaginaFluxo />} />
          <Route path="contas" element={<PaginaContas />} />
          <Route path="classificacoes" element={<PaginaClassificacoes />} />
          <Route path="lancamentos/:id" element={<PaginaLancamento />} />
          <Route path="categorias" element={<PaginaCategorias />} />
          <Route path="contrapartes" element={<PaginaContrapartes />} />
        </Route>
        <Route path="alimentos" element={<LayoutAlimentos />}>
          <Route index element={<PaginaAlimentos />} />
          <Route path="itens/:id" element={<PaginaAlimento />} />
          <Route path="registros/:id" element={<PaginaRegistro />} />
          <Route path="conferencia" element={<PaginaConferencia />} />
          <Route path="selecao" element={<PaginaSelecao />} />
          <Route path="perfis" element={<PaginaPerfis />} />
          <Route path="perfis/:id" element={<PaginaPerfil />} />
          <Route path="fontes" element={<PaginaFontes />} />
          <Route path="nutrientes" element={<PaginaNutrientes />} />
          <Route path="produtos" element={<PaginaProdutosComerciais />} />
          <Route path="propriedade" element={<PaginaPropriedadeAlimentos />} />
        </Route>
        <Route path="nutricao" element={<LayoutNutricao />}>
          <Route index element={<PaginaExigencias />} />
          <Route path="dieta" element={<PaginaAvaliarDieta />} />
          <Route path="avaliacoes" element={<PaginaAvaliacoes />} />
          <Route path="avaliacoes/:id" element={<PaginaAvaliacao />} />
        </Route>
        <Route path="manejo" element={<LayoutManejo />}>
          <Route index element={<Navigate to="agenda" replace />} />
          <Route path="agenda" element={<PaginaAgenda />} />
          <Route path="sanidade" element={<PaginaRegistros />} />
          <Route path="sanidade/novo" element={<PaginaRegistroNovo />} />
          <Route path="sanidade/:id" element={<PaginaRegistroDetalhe />} />
          <Route path="pesagem" element={<PaginaPesagemLote />} />
          <Route path="alertas" element={<PaginaAlertasPesagem />} />
          <Route path="produtos" element={<PaginaProdutos />} />
        </Route>
        {MODULOS.filter((m) => m.fase !== null).map((m) => (
          <Route key={m.id} path={m.rota.slice(1)} element={<PaginaModuloPlanejado modulo={m} />} />
        ))}
        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes>
  );
}
