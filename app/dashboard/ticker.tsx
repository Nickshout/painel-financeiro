import {
  formatarValor,
  formatarVariacao,
  setaVariacao,
} from "./formato";
import type { Cotacao } from "./tipos";

/**
 * Faixa superior fixa com scroll continuo.
 * O loop e puro CSS: a lista e renderizada duas vezes e a trilha desliza -50%,
 * de modo que a emenda cai exatamente no ponto de repeticao.
 */
export function Ticker({ cotacoes }: { cotacoes: Cotacao[] }) {
  const conteudo =
    cotacoes.length > 0 ? (
      <div className="ticker-track">
        {[0, 1].map((copia) => (
          <div key={copia} className="flex shrink-0" aria-hidden={copia === 1}>
            {cotacoes.map((cotacao) => (
              <span
                key={`${copia}-${cotacao.id}`}
                className="flex items-center gap-2 whitespace-nowrap px-6 text-[13px] uppercase tracking-[0.14em]"
              >
                <span className="text-gold/70">{cotacao.ativo}</span>
                <span className="tabular text-gold">
                  {formatarValor(cotacao.valorVenda)}
                </span>
                <span className="tabular text-gold/60">
                  {setaVariacao(cotacao.variacaoPercentual)}{" "}
                  {formatarVariacao(cotacao.variacaoPercentual)}
                </span>
                <span className="text-gold/25">/</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    ) : (
      <div className="px-6 text-[13px] uppercase tracking-[0.14em] text-gold/60">
        Aguardando a primeira coleta
      </div>
    );

  return (
    <div className="fixed inset-x-0 top-0 z-50 h-10 overflow-hidden border-b border-gold/20 bg-base font-mono">
      <div className="flex h-full items-center">{conteudo}</div>
    </div>
  );
}
