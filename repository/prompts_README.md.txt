# Repositório de replicação do IIPEx

Material de replicação da tese *Uso da inteligência artificial generativa para mensurar a imagem de um país projetada pela mídia digital estrangeira: o caso do Brasil na Argentina em 2025* (Marlos Correia de Lima, FGV EAESP, 2026). O IIPEx, Indicador da Imagem de um País no Exterior, é a média das notas de impacto (escala de 1 a 7) atribuídas por um LLM a cada notícia publicada na mídia digital argentina sobre o Brasil, agregada por janela temporal e por categoria temática (Seção 3.3 da tese).

O repositório entrega o estrato de acesso aberto descrito nas Seções 3.3.3 e 3.5 da tese: os metadados das notícias de 2025, os *prompts* exatos, o código dos processos P2 a P4 e o guia de replicação. O replicador regenera as classificações e as notas com os *prompts*, os modelos e os parâmetros documentados no guia e recalcula, com o *script* de P4, as tabelas, as séries e as figuras da tese. Os textos integrais das notícias ficam no estrato de acesso mediado (`dados/restrito/`).

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `Guia_de_Replicacao_IIPEx.docx` (e `.doc`) | guia completo: correspondência com a tese, dicionário de dados, requisitos, passo a passo de P2 a P4, reprodução de cada tabela e figura, custo e tempo, citação e licenças |
| `dados/noticias_2025.csv` | as 649.446 notícias de 2025 (id, data e hora, veículo, manchete) |
| `dados/dicionario_dados.csv` | dicionário de dados de todos os arquivos de entrada e saída |
| `dados/restrito/` | estrato de acesso mediado (texto integral); ver `LEIA-ME.txt` |
| `prompts/` | *prompts* dos processos P2 (Apêndice 3) e P3 (Apêndice 4), transcritos sem alteração |
| `codigo/prompts_iipex.py` | os mesmos *prompts* como módulo Python, usados pelos *scripts* |
| `codigo/p2_classificacao_tematica.py` | P2: classificação temática IPTC (GPT-4.1, `gpt-4.1-2025-04-14`) |
| `codigo/p3_analise_sentimento.py` | P3: análise de sentimento e nota  |
| `codigo/agregar_iipex.py` | P4: agregação e reprodução das Tabelas 8, 16, 17, 18, 20 e 21, das séries e das decomposições |
| `codigo/gerar_figuras.py` | Figuras 21, 22, 29 e 44 a partir dos resultados de P4 |
| `resultados_esperados/` | saídas de P4 e figuras de referência, calculadas com as notas da tese |
| `CITATION.cff`, `LICENSE`, `requirements.txt` | citação, licenças e dependências |

## Uso rápido

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd codigo
# P2 (exige credencial por variável de ambiente e o texto integral do estrato restrito)
export OPENAI_API_KEY=...
python p2_classificacao_tematica.py --entrada ../dados/restrito/noticias_2025_texto_integral.csv --saida ../resultados/categorias_2025.csv
# P3 no Vertex AI, como na tese (ou IIPEX_PROVEDOR=bedrock com as credenciais da AWS)
export IIPEX_PROVEDOR=vertex GOOGLE_CLOUD_PROJECT=<projeto> CLOUD_ML_REGION=us-east5
python p3_analise_sentimento.py --entrada ../dados/restrito/noticias_2025_texto_integral.csv --saida ../resultados/notas_2025.csv
# P4 e figuras
python agregar_iipex.py --noticias ../dados/noticias_2025.csv --notas ../resultados/notas_2025.csv --categorias ../resultados/categorias_2025.csv --saida ../resultados
python gerar_figuras.py --resultados ../resultados
```

O passo a passo completo, com modelos, parâmetros, provedores, custo e tempo estimados, está no Guia de Replicação (Seções 4, 5 e 7).

## Citação

Ver `CITATION.cff`. Contato: marlos.lima@fgv.br
