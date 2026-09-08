# Registro de Solicitações e Decisões de Interface e Dados — 08/set/2026

**Data:** 08/09/2026  
**Contexto:** Atendimento às solicitações do chefe (Marlos) para a versão final da tese e do dashboard IIBEx.  
**Propósito deste documento:** Registrar detalhadamente todas as decisões de engenharia, modelo de dados e interface adotadas para atender às demandas de 08/09/2026, documentando o racional técnico, o impacto arquitetural e o guia de rastreabilidade.

---

## 1. Tabela de Solicitações do Dia e Decisões Técnicas

| Solicitação do Chefe | Implementação Técnica Realizada | Avaliação Técnica / Racional de Engenharia | Reversão Pós-Tese? |
|---|---|---|:---:|
| **1. "Favor retirar a categoria Outros. Ela não existe."** | • Promoção das 4 notícias que possuíam segunda categoria válida (`rank = 2` promovido para `rank = 1` em `news_category`).<br/>• Remoção das 7 notícias sem categoria válida da tabela associativa `news_category` (mantendo os artigos íntegros em `news_article`).<br/>• Exclusão da categoria espúria `outros` de `category`, `rollup_hourly`, `api/data.js` e `js/i18n.js`. | **Excelente decisão técnica:** A categoria `outros` continha apenas 11 ocorrências em 851.959 notícias (0,001%), fruto de ruído e alucinação pontual de LLM. Sua remoção unifica a base rigorosamente nas **17 categorias oficiais do IPTC/IIBEx**, eliminando poluição visual nos filtros sem afetar a média global. | **NÃO (Definitivo)** |
| **2. "Quando se clica no ponto, preciso que caia direto na tabela, sem as 3 amostras por +, - e neutra."** | • Remoção do botão de details que ficava no rodapé da seção de banca de jornal (3 cards/amostras).<br/>• Integração do fluxo de navegação como um botão sutil abaixo do gráfico de evolução temporal (`#evolution-table-btn`).<br/>• Ao clicar num ponto do gráfico de evolução temporal, o botão muda de estado com destaque sutil (*"Ver notícias no ponto"*), permitindo abrir diretamente a tabela completa em nova aba (`details.html`). | **Evolução de UX/UI:** Desacopla a tabela de detalhes da banca de jornal, tornando a exploração temporal independente. O acionamento via botão explícito evita disparos acidentais de nova aba ao explorar tooltips do gráfico. | Avaliar manter |
| **3. "A tabela deve exibir TODAS as notícias daquele ponto, em ordem default de datahora."** | • Na tela `details.html`, a consulta recupera o conjunto integral de notícias associadas ao timestamp/intervalo selecionado no gráfico.<br/>• A ordenação default preserva rigorosamente a sequência cronológica da base (`ORDER BY publication_date ASC, id ASC`). | **Atendimento integral:** Garante visualização exaustiva e auditável para a pesquisa científica da tese. | Avaliar manter |
| **4. "A coluna análise precisa, por default, vir antes da nota. E o texto da análise deve aparecer por inteiro."** | • Em `details.html`, `css/details.css` e `js/details.js`, a coluna **Análise** foi reposicionada antes da coluna **Nota**.<br/>• A coluna de análise recebeu largura expandida (`min-width: 380px; max-width: 600px; white-space: normal; word-break: break-word`), com ajuste automático e adaptativo da altura da linha da tabela.<br/>• Melhoria nas cores de contraste para linhas expandidas/selecionadas tanto no modo claro quanto no modo escuro. | **Ergonomia e Leiturabilidade:** Como a justificativa qualitativa do modelo é o dado analítico mais rico para a banca examinadora, colocá-la em evidência antes da nota numérica e sem truncamento economiza cliques e melhora a experiência de leitura. | **Manter** |

---

## 2. Detalhamento do Saneamento da Categoria "Outros"

### A. Diagnóstico Inicial da Base de Dados
A base de 851.959 notícias continha 11 registros com `categoria1 = 'Outros'` no Excel bruto gerado pela etapa de LLM.

### B. Procedimento de Limpeza Executado no PostgreSQL (Neon)
1. **Notícias com 2ª Categoria Válida (IDs 310866, 595540, 614329, 760975):**
   - Removido o registro `rank = 1` apontando para a categoria 18 (`outros`).
   - Atualizado o registro `rank = 2` para `rank = 1`, promovendo as categorias válidas (*Sociedade*, *Ciência e tecnologia*, *Sociedade*, *Política*).
2. **Notícias com Categoria Única 'Outros' (7 registros):**
   - Removidos os vínculos em `news_category`. Os artigos permanecem preservados em `news_article` com seus textos, análises e metadados originais.
3. **Tabelas de Agregação e Metadados:**
   - Removidos os agregados de `category_id = 18` da tabela `rollup_hourly`.
   - Excluído o registro `id = 18` (`outros`) da tabela `category`.
4. **Interface e APIs:**
   - Removido `outros` de `CATEGORY_MAP` em `api/data.js`.
   - Removido `outros` dos dicionários de tradução (PT, EN, ES) em `js/i18n.js`.

---

## 3. Rastreamento e Governança

- **Solicitante:** Marlos (Chefe / Autor da Tese)
- **Implementação:** Thiago Franke
- **Banco de Dados Afetado:** Neon PostgreSQL `dadoconcreto` (`ep-rough-pine-awnwl3a9...`)
- **Política de Deploy:** Servidor de desenvolvimento local testado e validado. Aguardando comando explícito para commit e push em produção.
