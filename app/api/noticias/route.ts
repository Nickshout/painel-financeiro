import { NextResponse } from "next/server";

import { buscarCotacoesPorIds, listarNoticias } from "@/lib/airtable";

export const dynamic = "force-dynamic";

/**
 * GET /api/noticias
 * Lista as noticias gravadas no Airtable, da mais recente para a mais antiga.
 * Cada item vem com `ativo` resolvido a partir do link AtivoRelacionado,
 * porque o campo guarda apenas ids de registro e a interface exibe o nome.
 * Query param opcional: ?limite=20
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limiteBruto = Number(searchParams.get("limite"));
  const limite =
    Number.isFinite(limiteBruto) && limiteBruto > 0
      ? Math.min(Math.trunc(limiteBruto), 100)
      : 20;

  try {
    const noticias = await listarNoticias(limite);

    const idsVinculados = noticias.flatMap((n) => n.ativoRelacionado);
    const cotacoes = await buscarCotacoesPorIds(idsVinculados);
    const ativoPorId = new Map(cotacoes.map((c) => [c.id, c.ativo]));

    const itens = noticias.map((noticia) => ({
      ...noticia,
      ativo: noticia.ativoRelacionado
        .map((id) => ativoPorId.get(id))
        .find((ativo): ativo is string => Boolean(ativo)) ?? null,
    }));

    return NextResponse.json({ total: itens.length, noticias: itens });
  } catch (erro) {
    console.error("[api/noticias] falha ao ler o Airtable:", erro);
    return NextResponse.json(
      { erro: "Nao foi possivel carregar as noticias." },
      { status: 502 }
    );
  }
}
