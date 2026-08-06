# Painel Financeiro — Cotações + Notícias

Trabalho da disciplina de Integração de APIs (UniFECAF).

## Descrição da solução

O Painel Financeiro é uma aplicação monolítica em Next.js (App Router) que acompanha três ativos — dólar, euro e bitcoin, todos cotados em real — e cruza a variação de cada um com as notícias publicadas no mesmo período. A cada ciclo de coleta a aplicação consulta a AwesomeAPI, normaliza o retorno e grava um registro novo na base do Airtable. O histórico nunca é sobrescrito: cada coleta é uma linha a mais, o que permite montar o mini-histórico exibido na interface.

A correlação com notícias é automática e condicional. Quando a variação percentual de um ativo passa de 1,5% em módulo, a aplicação consulta a GNews.io usando o nome do ativo em português ("dólar", "euro", "bitcoin"), pega as duas notícias mais recentes e as grava na tabela `Noticias`, vinculadas por registro à cotação que disparou a busca. Assim a base guarda não só o número, mas o contexto editorial do movimento — que é o que aparece no feed do dashboard, com um badge indicando a qual ativo cada notícia se refere.

O backend e o frontend vivem no mesmo projeto, por decisão de arquitetura: os Route Handlers em `/app/api/*` rodam no servidor, o que elimina qualquer problema de CORS e mantém o token do Airtable e a API key da GNews 100% fora do navegador. O dashboard recebe a primeira carga já renderizada no servidor e busca as atualizações seguintes nas rotas `/api/cotacoes` e `/api/noticias`, que devolvem JSON limpo. A automação é disparada de fora por um workflow do GitHub Actions, que chama `/api/cron` em intervalos fixos autenticando-se com um segredo compartilhado.

## APIs utilizadas

| API | Endpoint | Autenticação |
|---|---|---|
| AwesomeAPI (câmbio e cripto) | `https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL` | API key no header `x-api-key` (lida de variável de ambiente) |
| GNews.io (notícias) | `https://gnews.io/api/v4/search` | API key no query param `apikey` (lida de variável de ambiente, nunca exposta ao cliente) |
| Airtable (persistência) | `https://api.airtable.com/v0/{baseId}/{tabela}` | Personal Access Token no header `Authorization: Bearer` |

## Fluxo de integração

```
1. GET AwesomeAPI para a lista fixa de ativos: USD-BRL, EUR-BRL, BTC-BRL
2. Normalizar payload (a API retorna chaves tipo "USDBRL"; ajustar ao schema)
3. POST em Cotacoes (um registro novo por coleta, sem sobrescrever histórico)
4. Para cada ativo com |pctChange| > 1.5%:
   a. GET GNews.io com query = nome do ativo em português ("dólar", "bitcoin")
   b. Pegar até 2 resultados mais recentes
   c. POST em Noticias, linkando via AtivoRelacionado ao registro do passo 3
5. Retornar resumo da execução (ativos processados, notícias vinculadas)
```

Todo esse fluxo roda dentro de `/app/api/cron/route.ts`, que valida o header `x-cron-secret` contra `CRON_SECRET` antes de executar qualquer coisa.

### Tratamento de erros

- **AwesomeAPI falha:** o ciclo é abortado por inteiro e nada é gravado, para não deixar dados parciais na base.
- **GNews falha para um ativo:** o ciclo segue para o próximo ativo. A cotação já foi gravada; a notícia é enriquecimento, não dado principal.
- **Airtable devolve 429 (rate limit):** uma nova tentativa após 2 segundos de espera.

## Schema do Airtable

Crie uma base com duas tabelas, exatamente com estes nomes e campos.

### `Cotacoes`

| Campo | Tipo |
|---|---|
| Ativo | Single line text |
| ValorCompra | Number (decimal) |
| ValorVenda | Number (decimal) |
| VariacaoPercentual | Number (decimal) |
| Timestamp | Date (com hora) |
| NoticiasRelacionadas | Link to another record → `Noticias` |

### `Noticias`

| Campo | Tipo |
|---|---|
| Titulo | Single line text |
| Fonte | Single line text |
| URL | URL |
| PublicadoEm | Date |
| AtivoRelacionado | Link to another record → `Cotacoes` |

> Os campos `NoticiasRelacionadas` e `AtivoRelacionado` devem ser as duas pontas do **mesmo** relacionamento (ao criar o link em uma tabela, o Airtable oferece criar o campo simétrico na outra).

## Prints da aplicação

> _Placeholder — inserir as capturas depois de rodar localmente._

- `docs/print-dashboard.png` — dashboard com os três cards e o ticker no topo
- `docs/print-noticias.png` — feed de notícias vinculadas
- `docs/print-airtable.png` — tabelas do Airtable populadas

## Como executar

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar as variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```
AIRTABLE_PAT=        # Personal Access Token (scopes: data.records:read e data.records:write)
AIRTABLE_BASE_ID=    # ID da base, começa com "app", visível na URL
AWESOMEAPI_TOKEN=    # API key da AwesomeAPI (awesomeapi.com.br), enviada no header x-api-key
GNEWS_API_KEY=       # chave obtida em https://gnews.io/dashboard
CRON_SECRET=         # string aleatória longa, compartilhada com o GitHub Actions
```

`.env.local` está no `.gitignore` e não deve ser commitado em hipótese alguma.

### 3. Rodar em desenvolvimento

```bash
npm run dev
```

A aplicação sobe em `http://localhost:3000` e redireciona para `/dashboard`.

### 4. Disparar a coleta manualmente

```bash
curl -X POST http://localhost:3000/api/cron -H "x-cron-secret: SEU_CRON_SECRET"
```

Sem o header, ou com o valor errado, a rota devolve `401` e não executa nada. Com o header correto, ela devolve um resumo da execução:

```json
{
  "ok": true,
  "ativosProcessados": 3,
  "ativosComVariacaoRelevante": 1,
  "noticiasVinculadas": 2,
  "detalhes": [ ... ]
}
```

Depois disso, recarregue `/dashboard` para ver os dados.

### 5. Configurar o cron no GitHub Actions

O workflow em [.github/workflows/cron.yml](.github/workflows/cron.yml) chama `/api/cron` a cada 6 horas (`0 */6 * * *`) e também pode ser disparado à mão pela aba **Actions → Coleta periodica de cotacoes → Run workflow**.

Em **Settings → Secrets and variables → Actions**, cadastre dois secrets no repositório:

| Secret | Valor |
|---|---|
| `APP_URL` | URL pública da aplicação, sem barra no final (ex.: `https://painel-financeiro.vercel.app`) |
| `CRON_SECRET` | o mesmo valor usado no `.env.local` e configurado no ambiente do deploy |

> O GitHub Actions só alcança a aplicação se ela estiver publicada em uma URL acessível pela internet — `localhost` não funciona. Para testar tudo localmente, use o `curl` do passo 4.

## Rotas disponíveis

| Rota | Método | Descrição |
|---|---|---|
| `/dashboard` | GET | Interface de consulta |
| `/api/cotacoes` | GET | Lista as cotações do Airtable (`?limite=30`) |
| `/api/noticias` | GET | Lista as notícias, já com o ativo resolvido (`?limite=20`) |
| `/api/cron` | GET/POST | Executa o ciclo de coleta. Exige o header `x-cron-secret` |

## Estrutura do projeto

```
/app
  /api
    /cron/route.ts          automação: coleta, persistência e correlação
    /cotacoes/route.ts      leitura das cotações para a interface
    /noticias/route.ts      leitura das notícias para a interface
  /dashboard
    page.tsx                carga inicial (server component)
    painel.tsx              interface (client component)
    ticker.tsx              faixa superior com scroll contínuo
    formato.ts              formatação de valores e datas
    tipos.ts                tipos da interface
  layout.tsx
  globals.css
/lib
  airtable.ts               leitura/escrita na base via REST API
  awesomeapi.ts             client da AwesomeAPI
  gnews.ts                  client da GNews
/.github/workflows/cron.yml agenda a chamada periódica ao /api/cron
```

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Airtable REST API · fetch nativo, sem SDKs.
