import {
  buscarCotacoesPorIds,
  listarCotacoes,
  listarNoticias,
} from "@/lib/airtable";

import { Painel } from "./painel";
import type { Cotacao, Noticia } from "./tipos";

export const dynamic = "force-dynamic";

/**
 * A primeira carga vem direto do Airtable no servidor (sem flash de tela vazia).
 * As atualizacoes seguintes o painel busca em /api/cotacoes e /api/noticias.
 * As credenciais nunca saem daqui — o componente client so recebe dados prontos.
 */
async function carregarDados(): Promise<{
  cotacoes: Cotacao[];
  noticias: Noticia[];
  erro: string | null;
}> {
  try {
    const [cotacoes, noticias] = await Promise.all([
      listarCotacoes(60),
      listarNoticias(20),
    ]);

    const vinculadas = await buscarCotacoesPorIds(
      noticias.flatMap((n) => n.ativoRelacionado)
    );
    const ativoPorId = new Map(vinculadas.map((c) => [c.id, c.ativo]));

    return {
      cotacoes,
      noticias: noticias.map((noticia) => ({
        ...noticia,
        ativo:
          noticia.ativoRelacionado
            .map((id) => ativoPorId.get(id))
            .find((ativo): ativo is string => Boolean(ativo)) ?? null,
      })),
      erro: null,
    };
  } catch (erro) {
    console.error("[dashboard] falha ao carregar dados do Airtable:", erro);
    return {
      cotacoes: [],
      noticias: [],
      erro: "Não foi possível falar com a base de dados agora.",
    };
  }
}

export default async function DashboardPage() {
  const { cotacoes, noticias, erro } = await carregarDados();

  return (
    <Painel
      cotacoesIniciais={cotacoes}
      noticiasIniciais={noticias}
      erroInicial={erro}
    />
  );
}
