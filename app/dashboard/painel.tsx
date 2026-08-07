"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  classeVariacao,
  formatarData,
  formatarDataHora,
  formatarHora,
  formatarValor,
  formatarVariacao,
  setaVariacao,
} from "./formato";
import { Ticker } from "./ticker";
import {
  ATIVOS_EXIBIDOS,
  INTERVALO_COLETA_HORAS,
  ROTULOS,
  type Cotacao,
  type Noticia,
} from "./tipos";

/** Quantas coletas anteriores aparecem no mini-historico de cada card. */
const TAMANHO_HISTORICO = 5;

interface PainelProps {
  cotacoesIniciais: Cotacao[];
  noticiasIniciais: Noticia[];
  erroInicial: string | null;
}

export function Painel({
  cotacoesIniciais,
  noticiasIniciais,
  erroInicial,
}: PainelProps) {
  const [cotacoes, setCotacoes] = useState(cotacoesIniciais);
  const [noticias, setNoticias] = useState(noticiasIniciais);
  const [erro, setErro] = useState(erroInicial);
  const [carregando, setCarregando] = useState(false);
  const [montado, setMontado] = useState(false);

  /* Datas dependem do fuso do navegador; so renderizamos apos a montagem
     para nao divergir do HTML gerado no servidor. */
  useEffect(() => setMontado(true), []);

  const atualizar = useCallback(async () => {
    setCarregando(true);
    try {
      const [respCotacoes, respNoticias] = await Promise.all([
        fetch("/api/cotacoes?limite=60", { cache: "no-store" }),
        fetch("/api/noticias?limite=20", { cache: "no-store" }),
      ]);

      if (!respCotacoes.ok || !respNoticias.ok) {
        throw new Error("resposta invalida");
      }

      const dadosCotacoes = await respCotacoes.json();
      const dadosNoticias = await respNoticias.json();

      setCotacoes(dadosCotacoes.cotacoes ?? []);
      setNoticias(dadosNoticias.noticias ?? []);
      setErro(null);
    } catch {
      setErro("Não foi possível atualizar os dados agora.");
    } finally {
      setCarregando(false);
    }
  }, []);

  /** Cotacoes agrupadas por ativo, da mais recente para a mais antiga. */
  const porAtivo = useMemo(() => {
    const mapa = new Map<string, Cotacao[]>();
    for (const cotacao of cotacoes) {
      const lista = mapa.get(cotacao.ativo) ?? [];
      lista.push(cotacao);
      mapa.set(cotacao.ativo, lista);
    }
    return mapa;
  }, [cotacoes]);

  const ativos = useMemo(() => {
    const conhecidos = ATIVOS_EXIBIDOS.filter((a) => porAtivo.has(a));
    const extras = [...porAtivo.keys()].filter(
      (a) => !ATIVOS_EXIBIDOS.includes(a)
    );
    return [...conhecidos, ...extras];
  }, [porAtivo]);

  const ultimasCotacoes = useMemo(
    () =>
      ativos
        .map((ativo) => porAtivo.get(ativo)?.[0])
        .filter((c): c is Cotacao => Boolean(c)),
    [ativos, porAtivo]
  );

  const ultimaColeta = ultimasCotacoes[0]?.timestamp ?? null;
  const vazio = cotacoes.length === 0;

  return (
    <>
      <Ticker cotacoes={ultimasCotacoes} />

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-20">
        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-white/[0.07] pb-8">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-gold">
              Mesa de operações
            </p>
            <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight text-ink sm:text-5xl">
              Painel Financeiro
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
              Câmbio e cripto coletados automaticamente, ao lado das notícias
              que ajudam a explicar as variações mais fortes do dia.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <p className="text-sm text-muted">
              {ultimaColeta ? (
                <>
                  Última atualização às{" "}
                  <span className="tabular font-mono">
                    {montado ? formatarHora(ultimaColeta) : "--:--"}
                  </span>
                </>
              ) : (
                "Sem coleta registrada"
              )}
            </p>
            <button
              type="button"
              onClick={atualizar}
              disabled={carregando}
              className="rounded-sm border border-gold/40 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-gold transition-colors hover:bg-gold/10 disabled:opacity-40"
            >
              {carregando ? "Buscando…" : "Buscar novos dados"}
            </button>
          </div>
        </header>

        {erro && (
          <p className="mt-6 rounded-sm border border-baixa/40 bg-baixa/10 px-4 py-3 text-sm text-ink">
            {erro}
          </p>
        )}

        {vazio ? (
          <section className="mt-16 rounded-sm border border-white/[0.07] bg-surface px-8 py-16 text-center">
            <h2 className="font-display text-2xl text-ink">
              Nenhuma cotação coletada ainda.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
              A primeira coleta roda automaticamente a cada{" "}
              {INTERVALO_COLETA_HORAS} horas. Assim que ela acontecer, os três
              ativos aparecem aqui com o histórico e as notícias vinculadas.
            </p>
          </section>
        ) : (
          <section className="mt-12">
            <div className="grid gap-5 md:grid-cols-3">
              {ativos.map((ativo) => {
                const historico = porAtivo.get(ativo) ?? [];
                const atual = historico[0];
                const anteriores = historico.slice(1, TAMANHO_HISTORICO + 1);

                return (
                  <article
                    key={ativo}
                    className="flex flex-col rounded-sm border border-white/[0.07] bg-surface p-6"
                  >
                    <div className="flex items-baseline justify-between">
                      <h2 className="font-display text-xl text-ink">
                        {ROTULOS[ativo] ?? ativo}
                      </h2>
                      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                        {ativo}
                      </span>
                    </div>

                    <p className="tabular mt-6 font-mono text-3xl text-ink">
                      {formatarValor(atual?.valorVenda ?? null)}
                    </p>

                    <p
                      className={`tabular mt-2 font-mono text-sm ${classeVariacao(
                        atual?.variacaoPercentual ?? null
                      )}`}
                    >
                      {setaVariacao(atual?.variacaoPercentual ?? null)}{" "}
                      {formatarVariacao(atual?.variacaoPercentual ?? null)}
                      <span className="ml-2 text-muted">nas últimas 24h</span>
                    </p>

                    <dl className="mt-5 flex gap-6 border-t border-white/[0.07] pt-4 text-xs">
                      <div>
                        <dt className="uppercase tracking-[0.14em] text-muted">
                          Compra
                        </dt>
                        <dd className="tabular mt-1 font-mono text-sm text-ink">
                          {formatarValor(atual?.valorCompra ?? null)}
                        </dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-[0.14em] text-muted">
                          Venda
                        </dt>
                        <dd className="tabular mt-1 font-mono text-sm text-ink">
                          {formatarValor(atual?.valorVenda ?? null)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-6 border-t border-white/[0.07] pt-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                        Coletas anteriores
                      </p>

                      {anteriores.length === 0 ? (
                        <p className="mt-3 text-xs text-muted">
                          Esta é a primeira coleta deste ativo.
                        </p>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {anteriores.map((registro) => (
                            <li
                              key={registro.id}
                              className="tabular flex items-baseline justify-between font-mono text-xs"
                            >
                              <span className="text-muted">
                                {montado
                                  ? formatarDataHora(registro.timestamp)
                                  : "—"}
                              </span>
                              <span className="flex items-baseline gap-3">
                                <span className="text-ink">
                                  {formatarValor(registro.valorVenda)}
                                </span>
                                <span
                                  className={`w-16 text-right ${classeVariacao(
                                    registro.variacaoPercentual
                                  )}`}
                                >
                                  {formatarVariacao(
                                    registro.variacaoPercentual
                                  )}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-16">
          <div className="flex items-baseline gap-4 border-b border-white/[0.07] pb-4">
            <h2 className="font-display text-2xl text-ink">
              Notícias vinculadas
            </h2>
            <p className="text-sm text-muted">
              Puxadas quando a variação de um ativo passa de 0,5%.
            </p>
          </div>

          {noticias.length === 0 ? (
            <p className="mt-6 text-sm leading-relaxed text-muted">
              Nenhuma notícia vinculada até agora. Elas aparecem aqui quando
              algum dos ativos se mexer mais de 0,5% entre duas coletas.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-white/[0.07]">
              {noticias.map((noticia) => (
                <li key={noticia.id} className="py-5">
                  <a
                    href={noticia.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col gap-2"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      {noticia.ativo && (
                        <span className="rounded-sm border border-gold/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-gold">
                          {ROTULOS[noticia.ativo] ?? noticia.ativo}
                        </span>
                      )}
                      <span className="text-xs text-muted">
                        {noticia.fonte}
                      </span>
                      <span className="text-xs text-muted">·</span>
                      <span className="tabular font-mono text-xs text-muted">
                        {montado ? formatarData(noticia.publicadoEm) : "—"}
                      </span>
                    </div>
                    <h3 className="text-base leading-snug text-ink transition-colors group-hover:text-gold">
                      {noticia.titulo}
                    </h3>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-20 border-t border-white/[0.07] pt-6 text-xs leading-relaxed text-muted">
          Cotações da AwesomeAPI e notícias da GNews.io, guardadas no Airtable.
          A coleta roda sozinha a cada {INTERVALO_COLETA_HORAS} horas.
        </footer>
      </main>
    </>
  );
}
