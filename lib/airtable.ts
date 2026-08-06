/**
 * Camada de acesso ao Airtable via REST API (fetch nativo + PAT).
 * Sem SDK. Este modulo le AIRTABLE_PAT do ambiente e por isso so pode
 * ser importado por codigo server-side (route handlers / server components).
 */

import type { CotacaoNormalizada } from "./awesomeapi";
import type { NoticiaNormalizada } from "./gnews";

export const TABELA_COTACOES = "Cotacoes";
export const TABELA_NOTICIAS = "Noticias";

const API_BASE = "https://api.airtable.com/v0";
const BACKOFF_MS = 2000;

export class AirtableError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AirtableError";
    this.status = status;
  }
}

/** Registro de cotacao como consumido pela interface. */
export interface CotacaoRegistro {
  id: string;
  ativo: string;
  valorCompra: number | null;
  valorVenda: number | null;
  variacaoPercentual: number | null;
  timestamp: string | null;
  noticiasRelacionadas: string[];
}

/** Registro de noticia como consumido pela interface. */
export interface NoticiaRegistro {
  id: string;
  titulo: string;
  fonte: string;
  url: string;
  publicadoEm: string | null;
  ativoRelacionado: string[];
}

interface AirtableRecord {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}

interface AirtableListResponse {
  records: AirtableRecord[];
  offset?: string;
}

function credenciais(): { pat: string; baseId: string } {
  const pat = process.env.AIRTABLE_PAT;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!pat) throw new AirtableError("AIRTABLE_PAT nao configurada no ambiente");
  if (!baseId) {
    throw new AirtableError("AIRTABLE_BASE_ID nao configurada no ambiente");
  }

  return { pat, baseId };
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa uma requisicao contra a REST API do Airtable.
 * Em caso de 429 (rate limit), faz 1 retry apos 2s de backoff.
 */
async function requisitar<T>(
  caminho: string,
  init: RequestInit = {},
  jaTentouNovamente = false
): Promise<T> {
  const { pat, baseId } = credenciais();
  const url = `${API_BASE}/${baseId}/${caminho}`;

  const resposta = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (resposta.status === 429 && !jaTentouNovamente) {
    console.warn(
      `[airtable] rate limit (429) em ${caminho} — repetindo em ${BACKOFF_MS}ms`
    );
    await esperar(BACKOFF_MS);
    return requisitar<T>(caminho, init, true);
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new AirtableError(
      `Airtable respondeu ${resposta.status} em ${caminho}: ${corpo.slice(0, 300)}`,
      resposta.status
    );
  }

  return (await resposta.json()) as T;
}

function texto(valor: unknown, padrao = ""): string {
  return typeof valor === "string" ? valor : padrao;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function listaDeIds(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
}

function paraCotacao(registro: AirtableRecord): CotacaoRegistro {
  const f = registro.fields;
  return {
    id: registro.id,
    ativo: texto(f.Ativo),
    valorCompra: numero(f.ValorCompra),
    valorVenda: numero(f.ValorVenda),
    variacaoPercentual: numero(f.VariacaoPercentual),
    timestamp: typeof f.Timestamp === "string" ? f.Timestamp : null,
    noticiasRelacionadas: listaDeIds(f.NoticiasRelacionadas),
  };
}

function paraNoticia(registro: AirtableRecord): NoticiaRegistro {
  const f = registro.fields;
  return {
    id: registro.id,
    titulo: texto(f.Titulo),
    fonte: texto(f.Fonte),
    url: texto(f.URL),
    publicadoEm: typeof f.PublicadoEm === "string" ? f.PublicadoEm : null,
    ativoRelacionado: listaDeIds(f.AtivoRelacionado),
  };
}

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

/**
 * Cria um novo registro em Cotacoes.
 * Cada coleta gera um registro novo — o historico nunca e sobrescrito.
 */
export async function criarCotacao(
  cotacao: CotacaoNormalizada
): Promise<CotacaoRegistro> {
  const resposta = await requisitar<AirtableRecord>(TABELA_COTACOES, {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Ativo: cotacao.ativo,
        ValorCompra: cotacao.valorCompra,
        ValorVenda: cotacao.valorVenda,
        VariacaoPercentual: cotacao.variacaoPercentual,
        Timestamp: cotacao.timestamp,
      },
      typecast: true,
    }),
  });

  return paraCotacao(resposta);
}

/**
 * Cria um registro em Noticias ja vinculado a cotacao que originou a busca.
 */
export async function criarNoticia(
  noticia: NoticiaNormalizada,
  cotacaoId: string
): Promise<NoticiaRegistro> {
  const resposta = await requisitar<AirtableRecord>(TABELA_NOTICIAS, {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Titulo: noticia.titulo,
        Fonte: noticia.fonte,
        URL: noticia.url,
        PublicadoEm: noticia.publicadoEm,
        AtivoRelacionado: [cotacaoId],
      },
      typecast: true,
    }),
  });

  return paraNoticia(resposta);
}

/**
 * Preenche NoticiasRelacionadas na cotacao.
 * Se os campos de link forem reciprocos na base, o Airtable ja terá feito isso
 * ao gravar AtivoRelacionado; o PATCH e idempotente e cobre o caso em que os
 * dois campos foram criados como relacionamentos independentes.
 */
export async function vincularNoticiasNaCotacao(
  cotacaoId: string,
  noticiaIds: string[]
): Promise<void> {
  if (noticiaIds.length === 0) return;

  await requisitar<AirtableRecord>(`${TABELA_COTACOES}/${cotacaoId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: { NoticiasRelacionadas: noticiaIds },
      typecast: true,
    }),
  });
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

/** Lista cotacoes da mais recente para a mais antiga. */
export async function listarCotacoes(limite = 30): Promise<CotacaoRegistro[]> {
  const params = new URLSearchParams({
    maxRecords: String(limite),
    pageSize: String(Math.min(limite, 100)),
    "sort[0][field]": "Timestamp",
    "sort[0][direction]": "desc",
  });

  const resposta = await requisitar<AirtableListResponse>(
    `${TABELA_COTACOES}?${params}`
  );

  return resposta.records.map(paraCotacao);
}

/**
 * Busca cotacoes por id de registro.
 * Usado para resolver o ativo de cada noticia (o campo AtivoRelacionado guarda
 * apenas ids, e a interface precisa exibir o nome do ativo no badge).
 */
export async function buscarCotacoesPorIds(
  ids: string[]
): Promise<CotacaoRegistro[]> {
  const unicos = Array.from(new Set(ids)).filter(Boolean);
  if (unicos.length === 0) return [];

  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += 50) {
    lotes.push(unicos.slice(i, i + 50));
  }

  const resultados: CotacaoRegistro[] = [];

  for (const lote of lotes) {
    const formula = `OR(${lote.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const params = new URLSearchParams({
      filterByFormula: formula,
      maxRecords: String(lote.length),
      pageSize: String(lote.length),
    });

    const resposta = await requisitar<AirtableListResponse>(
      `${TABELA_COTACOES}?${params}`
    );
    resultados.push(...resposta.records.map(paraCotacao));
  }

  return resultados;
}

/** Lista noticias da mais recente para a mais antiga. */
export async function listarNoticias(limite = 20): Promise<NoticiaRegistro[]> {
  const params = new URLSearchParams({
    maxRecords: String(limite),
    pageSize: String(Math.min(limite, 100)),
    "sort[0][field]": "PublicadoEm",
    "sort[0][direction]": "desc",
  });

  const resposta = await requisitar<AirtableListResponse>(
    `${TABELA_NOTICIAS}?${params}`
  );

  return resposta.records.map(paraNoticia);
}
