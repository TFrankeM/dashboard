# FGV IIPEx — Dashboard de Monitoramento de Imagem no Exterior

Painel interativo e analítico para visualização, exploração e acompanhamento do **IIPEx** (Indicador de Imagem de um País no Exterior), desenvolvido no âmbito da Diretoria Internacional da Fundação Getulio Vargas (FGV).

---

## 📌 Visão Geral do Sistema

O painel reúne centenas de milhares de notícias internacionais analisadas por inteligência artificial e métricas estatísticas agregadas, oferecendo:
* **Gráfico de Evolução Temporal:** Visualização histórica da trajetória do índice (escala de 1 a 7) com agregação horária/diária configurável.
* **Banca de Notícias e Recortes Temáticos:** Classificação por categorias (política, economia, sociedade, etc.), entes avaliadores/avaliados e alinhamento político.
* **Tabela Detalhada de Dados:** Visão granular das matérias coletadas com metadados, análise textual da IA e notas de sentimento.
* **Internacionalização e Acessibilidade:** Suporte multilíngue completo (Português, Inglês e Espanhol) e modos claro e escuro (*Dark Mode*).

---

## 🛠️ Tecnologias Utilizadas

* **Frontend:** HTML5 semântico, CSS3 moderno (variáveis e responsividade fluida), JavaScript ES6+ modular.
* **Visualização de Dados:** Chart.js com plugins customizados para zoom/pan, linhas verticais sincronizadas e degradês de fundo.
* **Ícones e Tipografia:** Lucide Icons.
* **Backend / API:** Serverless functions em Node.js integradas a banco de dados relacional (PostgreSQL).

---

## 📝 Histórico e Atualizações do Dia a Dia (Changelog)

### 13/10/2026 — Ajustes de UX e UI
* **Integridade Conceitual da Métrica:**
  * Atualização da nomenclatura da coluna de avaliação individual em `js/i18n.js` de *"Nota do IIPEx"* para apenas *"Nota"* (PT: *Nota*, EN: *Grade*, ES: *Nota*).
  * O IIPEx é um índice sintético derivado da agregação estatística; notícias individuais recebem notas de sentimento pontuais.
* **Otimização da Tabela de Detalhes (`details.html` / `details.js`):**
  * **Manchete Integral:** A manchete passa a ser exibida na íntegra, sem truncamento de texto ou reticências.
  * **Hiperlink Direto:** O próprio título da manchete tornou-se um link clicável direcionando para o texto original da matéria externa.
  * **Remoção da Coluna Link:** A coluna redundante *"Link"* foi eliminada da tabela e do seletor de colunas, liberando espaço visual útil na grade de dados.
* **Carregamento Completo de Notícias por Ponto:**
  * Ao acionar o botão *"Ver notícias do ponto"*, a interface agora abre 100% das notícias daquele ponto/intervalo (`limit=all`), sem divisão arbitrária de 50 em 50.
  * Ordenação cronológica estrita garantida (`sort_by=date`, `sort_dir=asc`).
  * Remoção de travas de paginação e eliminação da cláusula limitadora em SQL na API quando consultado no modo irrestrito.
* **Degradê Semafórico no Gráfico de Evolução (`charts.js`):**
  * Criação do plugin `trafficLightBackgroundPlugin` no Chart.js, dividindo visualmente a área do gráfico principal em 3 faixas conceituais:
    * **Superior (> 4 a 7):** Verde-sinal (imagem positiva).
    * **Centro (em torno do 4):** Amarelo-sinal (imagem neutra), com degradê irradiando a partir do ponto central 4 para cima e para baixo.
    * **Inferior (1 a < 4):** Vermelho-sinal (imagem negativa).
  * Cores ajustadas com saturação e opacidade equilibradas para permitir leitura instantânea das zonas de sentimento, preservando total nitidez das curvas em ambos os temas.
  * Desativação do preenchimento azul sob a linha única para manter a visibilidade contínua do fundo semafórico sob todas as séries.
