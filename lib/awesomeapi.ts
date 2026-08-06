/**
 * Client da AwesomeAPI (cotacoes de cambio e cripto).
 * Endpoint: https://economia.awesomeapi.com.br/json/last/{moedas}
 * Autenticacao: API key opcional no header `x-api-key`, lida de
 * AWESOMEAPI_TOKEN. Sem a variavel a chamada segue anonima, sujeita ao
 * rate limit por IP compartilhado.
 */

/** Lista fixa de ativos coletados a cada ciclo. */
export const ATIVOS = ["USD-BRL", "EUR-BRL", "BTC-BRL"] as const;

export type Ativo = (typeof ATIVOS)[number];

/** Termo de busca em portugues usado na GNews para cada ativo. */
export const TERMO_BUSCA: Record<Ativo, string> = {
  "USD-BRL": "dólar",
  "EUR-BRL": "euro",
  "BTC-BRL": "bitcoin",
};

/** Rotulo curto do ativo para exibicao na interface. */
export const ROTULO_ATIVO: Record<Ativo, string> = {
  "USD-BRL": "Dólar",
  "EUR-BRL": "Euro",
  "BTC-BRL": "Bitcoin",
};

/** Formato bruto devolvido pela AwesomeAPI para cada par. */
interface AwesomeApiPar {
  code: string;
  codein: string;
  name: string;
  high: string;
  low: string;
  varBid: string;
  pctChange: string;
  bid: string;
  ask: string;
  timestamp: string;
  create_date: string;
}

/** Cotacao ja normalizada para o formato do schema do Airtable. */
export interface CotacaoNormalizada {
  ativo: Ativo;
  valorCompra: number;
  valorVenda: number;
  variacaoPercentual: number;
  timestamp: string;
}

export class AwesomeApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwesomeApiError";
  }
}

const BASE_URL = "https://economia.awesomeapi.com.br/json/last";

/** Evita repetir o aviso de chamada anonima a cada coleta. */
let avisouSemToken = false;

/**
 * Monta os headers da requisicao.
 * A chave vai no header (e nao na query string) para nao aparecer em log de URL.
 * Sem AWESOMEAPI_TOKEN o client continua funcionando de forma anonima — apenas
 * sujeito ao rate limit por IP compartilhado, que e o que estoura no CI.
 */
function cabecalhos(): HeadersInit | undefined {
  const token = process.env.AWESOMEAPI_TOKEN;

  if (!token) {
    if (!avisouSemToken) {
      console.warn(
        "[awesomeapi] AWESOMEAPI_TOKEN nao configurada — as chamadas serao anonimas e sujeitas a rate limit por IP."
      );
      avisouSemToken = true;
    }
    return undefined;
  }

  return { "x-api-key": token };
}

/**
 * A AwesomeAPI devolve as chaves sem hifen ("USD-BRL" -> "USDBRL").
 */
function chaveDoAtivo(ativo: string): string {
  return ativo.replace("-", "");
}

function paraNumero(valor: string, campo: string, ativo: string): number {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    throw new AwesomeApiError(
      `Campo "${campo}" invalido para ${ativo}: recebido "${valor}"`
    );
  }
  return numero;
}

/**
 * Busca a ultima cotacao dos ativos informados e normaliza o payload.
 * Lanca AwesomeApiError em qualquer falha — o ciclo inteiro deve abortar,
 * para nao gravar dados parciais no Airtable.
 */
export async function buscarCotacoes(
  ativos: readonly Ativo[] = ATIVOS
): Promise<CotacaoNormalizada[]> {
  const url = `${BASE_URL}/${ativos.join(",")}`;

  let resposta: Response;
  try {
    resposta = await fetch(url, { cache: "no-store", headers: cabecalhos() });
  } catch (erro) {
    throw new AwesomeApiError(
      `Falha de rede ao consultar a AwesomeAPI: ${(erro as Error).message}`
    );
  }

  if (resposta.status === 401 || resposta.status === 403) {
    const corpo = await resposta.text().catch(() => "");
    throw new AwesomeApiError(
      `AwesomeAPI recusou a credencial (${resposta.status}). ` +
        `Confira o valor de AWESOMEAPI_TOKEN: ${corpo.slice(0, 200)}`
    );
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new AwesomeApiError(
      `AwesomeAPI respondeu ${resposta.status}: ${corpo.slice(0, 200)}`
    );
  }

  const dados = (await resposta.json()) as Record<string, AwesomeApiPar>;
  const coletadoEm = new Date().toISOString();

  return ativos.map((ativo) => {
    const par = dados[chaveDoAtivo(ativo)];
    if (!par) {
      throw new AwesomeApiError(
        `AwesomeAPI nao retornou dados para o ativo ${ativo}`
      );
    }

    return {
      ativo,
      valorCompra: paraNumero(par.bid, "bid", ativo),
      valorVenda: paraNumero(par.ask, "ask", ativo),
      variacaoPercentual: paraNumero(par.pctChange, "pctChange", ativo),
      timestamp: coletadoEm,
    };
  });
}
