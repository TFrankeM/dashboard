# Decisões de negócio e plano de ingestão sem dedup — ago/2026

**Status:** ✅ **CARGA COMPLETA EXECUTADA E VALIDADA (28/08/2026, 20:16; corrigida
às 21:05 p/ entes normalizados).** `news_article = 851.959` (IDs 1–851.959,
únicos) · `analysis = 851.959` · URLs duplicadas = 15.868 (conforme previsto) ·
`site_stats` = 851.959/851.959 · cobertura 01/09/2024–31/12/2025 · integridade
referencial 0 órfãos. **Entes normalizados:** as listas multi-país da coluna
"Ente avaliador" (`Argentina, Spain, Panama`, etc.) reduzem ao 1º país da lista
(`argentina`); avaliado fixo `brasil` — 1 único par `argentina → brasil`
(851.959 análises), tabela `target_entity` com só 2 registros. Única exceção do
bruto (ID Opoint 817408, avaliador literal `United States`) corrigida para
`argentina` no banco e com fallback permanente no ETL. Intercorrência operacional:
queda SSL do Neon no lote 600k (retry embutido resolveu na tentativa 3, sem perda).

---

## 1. Contexto — pedido do chefe (Marlos)

O chefe avaliou o dashboard e constatou divergência entre o total de notícias que
ele previa (o arquivo bruto da Opoint, ~852 mil linhas) e o total exibido no site
(836.091). A causa é o **dedup por URL** aplicado pelo ETL
(`bd/dml_insert_into_neon.ipynb`): toda linha cuja `url` já tinha sido vista era
descartada ("1ª ocorrência vence").

Decisão de negócio (solicitação **direta do chefe**): **entrar absolutamente
todas as notícias do arquivo bruto, e todas as notas entram na conta** — as
duplicatas são parte do corpus da tese. Reconhecemos que isso adiciona ruído
estatístico (notícias repetidas passam a pesar N× no volume e na média), mas é
uma decisão de negócio deliberada, não um acidente. O dedup deixa de existir.

## 2. Números da reconciliação (medidos em ago/2026)

| Métrica | Valor |
|---|---|
| Linhas de dados no Excel bruto `0_Br_na_Arg_01set24_31dez25_852k_Thiago.xlsx` | **851.959** (IDs 1–851.959, sequência completa, verificado por soma) |
| Linhas hoje no Neon do site (`DATABASE_URL` / projeto "atualizacao") | **836.091** |
| Diferença (linhas descartadas pelo dedup) | **15.868** |
| Linhas sem URL | 0 |
| URLs distintas no bruto | 836.091 (exatamente o total atual do site) |
| URLs que aparecem mais de 1× | **15.863** (15.868 linhas excedentes) |
| Duplicatas com **mesma URL e mesmo horário** | **15.747** (cópias idênticas) |
| Duplicatas com **mesma URL e horário diferente** | **116** (71 delas em dia diferente) |
| Notas | 851.959 numéricas, **0 nulas** → 1 análise por linha |

Reconciliação exata: `851.959 − 15.868 (excedentes de URL duplicada) = 836.091`.
Não há perda além do dedup.

> **Nota sobre os dois bancos Neon.** O site lê `DATABASE_URL`
> (projeto "atualizacao", 836.091 notícias, período 01/09/2024–31/12/2025).
> `POSTGRES_URL` é um **backup** com 1.206.858 notícias (960.498 no período +
> 246.360 de jan/2026) — não é o banco do dashboard. O chefe avalia pelo site,
> portanto compara com o banco menor. Este plano mexe **somente** no banco
> menor (`DATABASE_URL`).

## 3. Fuso horário da notícia — auditoria da pipeline

Auditoria concluída: **toda a pipeline é consistentemente UTC**; o rótulo do
gráfico de evolução temporal ("Horários em UTC (Greenwich)") está correto.

| Etapa | Tratamento |
|---|---|
| Coleta Opoint (`opoint/coleta_opoint.ipynb`) | A API devolve `local_time` com offset; o notebook faz `pd.to_datetime(..., utc=True).dt.tz_localize(None)` → **converte para UTC e descarta o offset**. É a única conversão de fuso de toda a pipeline; o fuso local de cada veículo (ex.: ART, UTC−3) se perde aqui, antes de qualquer etapa nossa. |
| Excel bruto (`0_...852k_Thiago.xlsx`) | Serial numérico do Excel (epoch 1899-12-30), **wall time UTC sem marcação**. |
| Excel limpo (`Br_na_Arg_..._limpo.xlsx`) | Mesmo valor, texto ISO (`2024-09-01 00:01:54`). Nenhuma conversão. |
| ETL → Neon (`bd/dml_insert_into_neon.ipynb`) | `excel_dt()` trata o valor como UTC implícito; conexão faz `SET TIME ZONE 'UTC'`; coluna `publication_date` é `TIMESTAMPTZ`. **Nenhuma conversão artificial** — o instante gravado é o mesmo do Excel. |
| API (Vercel, `api/data.js`) | Agregação com `date_bin(..., publication_date, TIMESTAMP '2025-01-01')` → buckets em **UTC**, sem `AT TIME ZONE`. |
| Navegador (`js/dashboard.js`, `js/charts.js`) | `DISPLAY_TZ = "UTC"` em todas as formatações. **Não** converte para o fuso do usuário (nem para Brasília, apesar de comentário antigo no código dizer o contrário). |

## 4. Como a média do gráfico é calculada (buckets)

- A tabela derivada `rollup_hourly` pré-agrega por **buckets disjuntos de 1 hora**
  (`date_bin('1 hour', publication_date)`), guardando `grade_sum` e `grade_count`
  por (bucket, avaliador, avaliado, categoria).
- A API calcula a média do período como **`SUM(grade_sum) / NULLIF(SUM(grade_count), 0)`**
  sobre os buckets do intervalo filtrado (`api/data.js`).
- Isso equivale **exatamente à média aritmética de todas as análises individuais
  do período**: buckets são disjuntos (cada análise cai em um único bucket), não
  há sobreposição e **não é média móvel**. Agrupar e somar de volta = somar tudo.
- Com a nova ingestão sem dedup, cada notícia repetida passa a contribuir N vezes
  para `grade_count` — a média passa a ponderar as duplicatas. **É o comportamento
  pedido pelo chefe** ("todas as notas entram na conta").

## 5. Solução para a unicidade de notícias

**Problema:** `news_article.url TEXT UNIQUE` impede exatamente o que o chefe
quer — mesma URL com horários diferentes (116 casos) e cópias idênticas
(15.747 casos).

**Solução aprovada:** a identidade da notícia deixa de ser a URL e passa a ser a
**linha da planilha Opoint**:

- Chave da notícia = coluna **`ID` do Excel bruto** (ID da própria Opoint; 0
  nulos, todos únicos — verificado na auditoria da seção 6).
- `UNIQUE(url)` é **removida**; a URL vira índice **não-único** (`idx_news_url`)
  para continuar atendendo filtros/busca.
- O ETL perde o `if url in url_to_news: continue` e o contador `url_to_news`;
  o ID vira o `news_article.id`.
- Caso patológico de URL nula deixa de precisar de placeholder `__nourl__:N`
  (URL nula é permitida — apenas 1 linha na prática, e ela também não tem data;
  ver seção 6).

## 6. Auditoria de qualidade das colunas do Excel bruto (read-only, ago/2026)

| Coluna | Resultado |
|---|---|
| `A` (ID Opoint) | 0 nulos; **851.959 IDs, todos únicos, formando a sequência completa 1–851.959** (verificado por soma aritmética e por contagem de tags XML). Nenhum tratamento especial necessário — pode ser PK direta. |
| `B` (Date) | 0 nulos, 0 inválidas; período 2024-09-01 00:01:54 → 2025-12-31 23:59:42 (serial Excel, UTC). Nenhuma linha será descartada por falta de data. |
| `G` (Ente avaliador) | Dominante `Argentina` (851.200) com ruído multi-país (`Argentina, Spain`, `Argentina, Panama`, etc.) e 1 exceção literal (`United States`, ID 817408). **Normalização adotada:** listas reduzem ao 1º país da lista; qualquer valor ≠ `argentina` é forçado para `argentina` (o corpus é a região Argentina da Opoint). Resultado no banco: avaliador único `argentina`. |
| `J` (Ente avaliado) | 100% `Brasil` — **normalização adotada:** fixado em `brasil` independentemente do valor da coluna. Resultado no banco: avaliado único `brasil`. |
| `N`/`O` (nota) | **851.959 numéricas, 0 inválidas, 0 nulas** (coluna `O` no bruto, `N` no limpo — o ETL detecta o layout pelo cabeçalho) → cada notícia gerará exatamente 1 análise (851.959 análises no pós-carga). |
| Layout do bruto | **A coluna K é um espaçador vazio**: categoria1=L, categoria2=M, analise=N, nota=O. O ETL passou a usar mapas de colunas dinâmicos (`DATA_COLS_LIMPO`/`DATA_COLS_BRUTO`) selecionados pelo cabeçalho. |

Conclusão: as demais colunas **já estão de acordo** com o formato que o banco
espera; nenhuma normalização extra é necessária além do que o ETL já faz
(categorias → slug, idioma → iso, fonte → nome, nota → float). Nenhum ponto de atenção restante — a coluna de ID é perfeita para virar PK.

## 7. Renomeação / preservação de arquivos

Ambos os Excel permanecem no projeto, em `dashboard/`:

| Arquivo | Papel |
|---|---|
| `0_Br_na_Arg_01set24_31dez25_852k_Thiago.xlsx` | **Bruto, preservado intacto** — fonte da verdade para a tese. |
| `Br_na_Arg_01set24_31dez25_limpo.xlsx` | Versão sem duplicatas, **preservada**. Convenção: o arquivo tratado recebe `_limpo` ao final do nome original. Nenhum arquivo será renomeado ou sobrescrito. |

O ETL passa a ler o **bruto** (o notebook precisa de ajuste de layout de colunas:
no bruto as colunas correm de A a **O**, com `nota` na O — hoje o ETL valida
cabeçalho A–N do limpo).

## 8. Plano de execução (a implementar na próxima sessão)

> **Status (08/2026): itens 1–3 IMPLEMENTADOS e validados por dry-run** (100k
> linhas: 100.000 notícias, 100.000 análises, IDs 1–100000 únicos, 0 guardas
> acionados). Falta: executar a carga completa no Neon e validar.

1. **`bd/ddl.sql`** — remover `UNIQUE` de `news_article.url`; adicionar
   `CREATE INDEX idx_news_url ON news_article(url);` (não-único). Documentar que
   a PK/identidade é o ID da linha Opoint.
2. **`bd/dml_insert_into_neon.ipynb`** —
   - apontar `ETL_XLSX` para o arquivo bruto e ajustar `EXPECTED_HEADER` (A–O);
   - usar o `ID` da coluna A como `news_article.id` (sem dedup, sem
     `url_to_news`);
   - manter: categorias N:N com rank, `SET TIME ZONE 'UTC'`, descarte só de
     linha **sem data** (`publication_date NOT NULL`), nota nula → sem análise;
   - recriar schema (o notebook já faz `DROP`/`CREATE` do zero) e reingerir no
     banco de `DATABASE_URL`/`ATUALIZACAO` (o notebook tem guard contra escrever
     no host de produção — manter).
3. **Tabelas derivadas** — `rollup_hourly` e `site_stats` são reconstruídas pelo
   ETL; passarão a refletir o total bruto automaticamente. Nenhuma mudança.
4. **API/front** — sem mudanças previstas: queries são agnósticas à duplicidade
   (contam linhas; "Todas" usa `category_id IS NULL`, que deixa de dedupar
   simplesmente porque não haverá mais dedup). A página de detalhe filtra por URL
   — decidir na implementação se lista todas as ocorrências ou a primeira
   (default proposto: listar todas, ordenadas por data).
5. **Validação pós-carga** — `count(*) = 851.959`; `count(*) − count(DISTINCT url) = 15.868`;
   `count(*) FROM analysis = 851.959` (todas as notas entram, zero nulas);
   totais de `site_stats` batendo; gráfico de evolução temporal coerente com o bruto.

## 9. O que NÃO muda

- Fuso horário: tudo permanece UTC (rótulo do gráfico continua válido).
- Modelo relacional (3FN, N:N de categorias, `analysis` com UNIQUE por trío
  notícia/avaliador/avaliado — no bruto cada linha tem exatamente 1 análise).
- O banco de backup (`POSTGRES_URL`) não é tocado.
- Arquivos Excel: nenhum renomeado ou alterado.