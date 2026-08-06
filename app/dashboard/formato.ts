/** Formatadores de exibicao. Sem jargao de sistema na interface. */

/**
 * Cambio usa 4 casas; cripto, que passa da casa do milhar, usa 2.
 */
export function formatarValor(valor: number | null): string {
  if (valor === null) return "—";
  const casas = Math.abs(valor) >= 1000 ? 2 : 4;
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function formatarVariacao(variacao: number | null): string {
  if (variacao === null) return "—";
  const sinal = variacao > 0 ? "+" : variacao < 0 ? "−" : "";
  return `${sinal}${Math.abs(variacao).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function classeVariacao(variacao: number | null): string {
  if (variacao === null || variacao === 0) return "text-muted";
  return variacao > 0 ? "text-alta" : "text-baixa";
}

export function setaVariacao(variacao: number | null): string {
  if (variacao === null || variacao === 0) return "•";
  return variacao > 0 ? "▲" : "▼";
}

/** "14:32" */
export function formatarHora(iso: string | null): string {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "28 de jul, 14:32" — usado no mini-historico e no feed de noticias. */
export function formatarDataHora(iso: string | null): string {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  const dia = data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
  return `${dia.replace(".", "")}, ${formatarHora(iso)}`;
}

/** "28 de julho" — data da noticia, sem hora. */
export function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  });
}
