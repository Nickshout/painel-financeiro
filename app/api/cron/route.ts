import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
  buscarNoticiasPorUrls,
  criarCotacao,
  criarNoticia,
  vincularCotacaoNaNoticia,
  vincularNoticiasNaCotacao,
} from "@/lib/airtable";
import {
  ATIVOS,
  AwesomeApiError,
  TERMO_BUSCA,
  buscarCotacoes,
  type Ativo,
} from "@/lib/awesomeapi";
import { buscarNoticias } from "@/lib/gnews";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Acima deste percentual (em modulo) a variacao e considerada relevante.
 * Calibrado para cambio: meio por cento num dia ja e movimento real para um par
 * de moedas, enquanto 1,5% so acontece em dia de manchete.
 */
const LIMITE_VARIACAO = 0.5;

/** Quantas noticias buscar por ativo com variacao relevante. */
const NOTICIAS_POR_ATIVO = 2;

function segredoValido(request: Request): boolean {
  const esperado = process.env.CRON_SECRET;
  const recebido = request.headers.get("x-cron-secret");

  if (!esperado || !recebido) return false;

  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

interface DetalheAtivo {
  ativo: Ativo;
  variacaoPercentual: number;
  cotacaoId: string;
  variacaoRelevante: boolean;
  noticiasVinculadas: number;
  /** Quantas das vinculadas foram gravadas agora; o resto ja existia na base. */
  noticiasNovas: number;
  aviso?: string;
}

async function executarCiclo() {
  /* 1 + 2. Coleta e normalizacao. Se falhar, o ciclo inteiro aborta. */
  const cotacoes = await buscarCotacoes(ATIVOS);

  const detalhes: DetalheAtivo[] = [];
  let totalNoticias = 0;
  let totalNovas = 0;

  for (const cotacao of cotacoes) {
    /* 3. Novo registro por coleta — o historico nunca e sobrescrito. */
    const registro = await criarCotacao(cotacao);

    const relevante = Math.abs(cotacao.variacaoPercentual) > LIMITE_VARIACAO;
    const detalhe: DetalheAtivo = {
      ativo: cotacao.ativo,
      variacaoPercentual: cotacao.variacaoPercentual,
      cotacaoId: registro.id,
      variacaoRelevante: relevante,
      noticiasVinculadas: 0,
      noticiasNovas: 0,
    };

    if (relevante) {
      /* 4. Enriquecimento com noticias. Falha aqui nao aborta o ciclo. */
      try {
        const noticias = await buscarNoticias(
          TERMO_BUSCA[cotacao.ativo],
          NOTICIAS_POR_ATIVO
        );

        /* A GNews devolve as materias mais recentes, que mudam devagar: a mesma
           URL reaparece ciclo apos ciclo. Consulta o que ja esta na base para
           reaproveitar o registro em vez de gravar a mesma noticia de novo. */
        const jaGravadas = await buscarNoticiasPorUrls(
          noticias.map((n) => n.url)
        );
        const porUrl = new Map(jaGravadas.map((n) => [n.url, n]));

        const vinculadas: string[] = [];
        let novas = 0;

        for (const noticia of noticias) {
          const existente = porUrl.get(noticia.url);

          if (existente) {
            await vincularCotacaoNaNoticia(
              existente.id,
              registro.id,
              existente.ativoRelacionado
            );
            if (!vinculadas.includes(existente.id)) {
              vinculadas.push(existente.id);
            }
            continue;
          }

          const registroNoticia = await criarNoticia(noticia, registro.id);
          vinculadas.push(registroNoticia.id);
          novas += 1;

          /* Protege contra a mesma URL repetida dentro da propria resposta. */
          porUrl.set(noticia.url, registroNoticia);
        }

        await vincularNoticiasNaCotacao(registro.id, vinculadas);

        detalhe.noticiasVinculadas = vinculadas.length;
        detalhe.noticiasNovas = novas;
        totalNoticias += vinculadas.length;
        totalNovas += novas;

        if (vinculadas.length === 0) {
          detalhe.aviso = "Nenhuma noticia encontrada para o termo buscado.";
        }
      } catch (erro) {
        const mensagem = (erro as Error).message;
        console.error(
          `[cron] enriquecimento de noticias falhou para ${cotacao.ativo}:`,
          mensagem
        );
        detalhe.aviso = `Noticias nao vinculadas: ${mensagem}`;
      }
    }

    detalhes.push(detalhe);
  }

  /* 5. Resumo da execucao. */
  return {
    ok: true,
    executadoEm: new Date().toISOString(),
    ativosProcessados: detalhes.length,
    ativosComVariacaoRelevante: detalhes.filter((d) => d.variacaoRelevante)
      .length,
    noticiasVinculadas: totalNoticias,
    noticiasNovas: totalNovas,
    detalhes,
  };
}

async function handler(request: Request) {
  if (!segredoValido(request)) {
    return NextResponse.json(
      { erro: "Nao autorizado. Header x-cron-secret ausente ou incorreto." },
      { status: 401 }
    );
  }

  try {
    const resumo = await executarCiclo();
    console.log(
      `[cron] ciclo concluido: ${resumo.ativosProcessados} ativos, ` +
        `${resumo.noticiasVinculadas} noticias vinculadas`
    );
    return NextResponse.json(resumo);
  } catch (erro) {
    const mensagem = (erro as Error).message;

    if (erro instanceof AwesomeApiError) {
      console.error("[cron] AwesomeAPI falhou — ciclo abortado:", mensagem);
      return NextResponse.json(
        {
          ok: false,
          erro: "AwesomeAPI indisponivel. Ciclo abortado sem gravar dados.",
          detalhe: mensagem,
        },
        { status: 502 }
      );
    }

    console.error("[cron] ciclo interrompido:", mensagem);
    return NextResponse.json(
      { ok: false, erro: "Falha na execucao do ciclo.", detalhe: mensagem },
      { status: 500 }
    );
  }
}

export const GET = handler;
export const POST = handler;
