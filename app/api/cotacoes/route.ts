import { NextResponse } from "next/server";

import { listarCotacoes } from "@/lib/airtable";

export const dynamic = "force-dynamic";

/**
 * GET /api/cotacoes
 * Lista as cotacoes gravadas no Airtable, da mais recente para a mais antiga.
 * Query param opcional: ?limite=30
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limiteBruto = Number(searchParams.get("limite"));
  const limite =
    Number.isFinite(limiteBruto) && limiteBruto > 0
      ? Math.min(Math.trunc(limiteBruto), 100)
      : 30;

  try {
    const cotacoes = await listarCotacoes(limite);
    return NextResponse.json({ total: cotacoes.length, cotacoes });
  } catch (erro) {
    console.error("[api/cotacoes] falha ao ler o Airtable:", erro);
    return NextResponse.json(
      { erro: "Nao foi possivel carregar as cotacoes." },
      { status: 502 }
    );
  }
}
