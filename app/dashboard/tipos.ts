/**
 * Tipos consumidos pela interface.
 * Ficam separados de lib/airtable.ts de proposito: aquele modulo le
 * AIRTABLE_PAT do ambiente e nunca pode ser importado por codigo client-side.
 */

export interface Cotacao {
  id: string;
  ativo: string;
  valorCompra: number | null;
  valorVenda: number | null;
  variacaoPercentual: number | null;
  timestamp: string | null;
  noticiasRelacionadas: string[];
}

export interface Noticia {
  id: string;
  titulo: string;
  fonte: string;
  url: string;
  publicadoEm: string | null;
  ativoRelacionado: string[];
  ativo: string | null;
}

/** Cadencia da coleta automatica, em horas (espelha .github/workflows/cron.yml). */
export const INTERVALO_COLETA_HORAS = 6;

/** Rotulos exibidos para cada ativo da lista fixa. */
export const ROTULOS: Record<string, string> = {
  "USD-BRL": "Dólar",
  "EUR-BRL": "Euro",
  "BTC-BRL": "Bitcoin",
};

export const ATIVOS_EXIBIDOS = ["USD-BRL", "EUR-BRL", "BTC-BRL"];
