/**
 * Client da GNews.io (noticias).
 * Endpoint: https://gnews.io/api/v4/search
 * Autenticacao: API key enviada no query param `apikey` (lida de env var,
 * portanto o modulo so pode ser importado por codigo server-side).
 */

/** Noticia ja normalizada para o formato do schema do Airtable. */
export interface NoticiaNormalizada {
  titulo: string;
  fonte: string;
  url: string;
  publicadoEm: string;
}

interface GNewsArtigo {
  title: string;
  url: string;
  publishedAt: string;
  source?: { name?: string };
}

interface GNewsResposta {
  totalArticles?: number;
  articles?: GNewsArtigo[];
  errors?: string[];
}

export class GNewsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GNewsError";
  }
}

const BASE_URL = "https://gnews.io/api/v4/search";

/**
 * Busca noticias em portugues do Brasil para o termo informado.
 * Retorna no maximo `limite` resultados, dos mais recentes para os mais antigos.
 *
 * Lanca GNewsError em caso de falha — quem chama decide se segue adiante
 * (no ciclo do cron, a falha de um ativo nao aborta os demais).
 */
export async function buscarNoticias(
  termo: string,
  limite = 2
): Promise<NoticiaNormalizada[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    throw new GNewsError("GNEWS_API_KEY nao configurada no ambiente");
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("q", termo);
  url.searchParams.set("lang", "pt");
  url.searchParams.set("country", "br");
  url.searchParams.set("sortby", "publishedAt");
  url.searchParams.set("max", String(limite));
  url.searchParams.set("apikey", apiKey);

  let resposta: Response;
  try {
    resposta = await fetch(url, { cache: "no-store" });
  } catch (erro) {
    throw new GNewsError(
      `Falha de rede ao consultar a GNews: ${(erro as Error).message}`
    );
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new GNewsError(
      `GNews respondeu ${resposta.status}: ${corpo.slice(0, 200)}`
    );
  }

  const dados = (await resposta.json()) as GNewsResposta;

  if (dados.errors?.length) {
    throw new GNewsError(`GNews retornou erro: ${dados.errors.join("; ")}`);
  }

  const artigos = dados.articles ?? [];

  return artigos.slice(0, limite).map((artigo) => ({
    titulo: artigo.title,
    fonte: artigo.source?.name ?? "Fonte não informada",
    url: artigo.url,
    publicadoEm: artigo.publishedAt,
  }));
}
