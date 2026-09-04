# Registro de Solicitações e Decisões de Interface — set/2026

**Data:** 04/09/2026  
**Contexto:** Ajustes temporários e alinhamentos solicitados pelo chefe (Marlos) exclusivamente para a versão final da sua tese de doutorado.  
**Propósito deste documento:** Registrar detalhadamente todas as concessões editoriais e alterações de interface demandadas pela tese que **não representam as melhores práticas de UX/Engenharia**, garantindo um guia exato de reversão ("Rollback Guide") para restauração da arquitetura ideal assim que a tese for entregue.

---

## 1. Tabela de Concessões Editoriais e Rastreamento

| Elemento Original | Alteração Temporária (Tese) | Motivação do Chefe | Avaliação Técnica / Crítica de UX (Por que não é o ideal) | Reversão Pós-Tese? |
|---|---|---|---|:---:|
| **"Evolução temporal"** | `"FGV IIBEX"` | Padronizar branding no texto acadêmico. | **Inadequado:** Nomeia um gráfico específico de série temporal com o nome do produto/índice geral. Cada widget precisa de título funcional descritivo. | **SIM (Reverter)** |
| **"INDICADOR DA IMAGEM DO BRASIL NO EXTERIOR"** | `"indicador da imagem do brasil projetada pela mídia digital estrangeira"` | Restringir escopo metodológico da tese. | Adequado conceitualmente à base de dados. | Avaliar manter |
| **"ACESSAR SALA DE SITUAÇÃO"** | `"Acessar IIBEx"` | Unificar CTA da landing. | Neutro / Aceitável. | Opcional |
| **"Camadas" / "+ Camada" / "Camadas ativas"** | `"Comparar"` / `"Comparações"` | Evitar ter que conceituar "camada" no texto da tese. | **Inadequado:** O conceito de *camada de dados* (layers) é o modelo mental correto para a sobreposição e união/mescla de séries em visualização analítica. | **SIM (Reverter)** |
| **"Global" e "Camada" (Legends de escopo)** | *Removidos do topo das caixas de filtros* | Evitar terminologias formais adicionais. | **Prejuízo de clareza:** As tags delimitavam com precisão quais controles filtram o painel inteiro vs quais controles configuram a linha ativa. | **SIM (Reverter)** |
| **Gráficos Auxiliares (Métricas)** | *Mantidos no código e gerenciados via Feature Flags (Vercel Edge Config)* | Flexibilidade para ligar/desligar sem mexer no código. | Permite controle granular por ambiente de produção/homologação. | Não requer alteração |
| **Período Default** | `year_2025` (2025-01-01 a 2025-12-31) | Focar o ano principal da tese. | Específico para a defesa da tese. | Avaliar dinâmico pós-defesa |

---

## 2. Guia de Rollback Detalhado (Como Voltar Atrás Pós-Tese)

Para restaurar a interface original completa quando o período da tese for concluído:

### A. Restaurar o conceito de "Camadas" e "Global"
1. **No arquivo `js/i18n.js`:**
   - Restaurar `btn_add_layer`: `"+ Camada"`
   - Restaurar `chips_caption`: `"Camadas ativas"`
   - Restaurar `scope_global`: `"Global"`
   - Restaurar `scope_layer`: `"Camada"`
   - Restaurar as dicas de "mesclar camadas" (`chip_drag_tip`, `layer_remove: "Remover camada"`).
2. **No arquivo `dashboard.html`:**
   - Recolocar as tags `<legend>` nos fieldsets de filtro:
     ```html
     <fieldset class="scope-block scope-global">
         <legend data-i18n="scope_global">Global</legend>
         ...
     </fieldset>
     <fieldset class="scope-block scope-layer">
         <legend data-i18n="scope_layer">Camada</legend>
         ...
     </fieldset>
     ```
   - Restaurar o ícone de camadas no botão: `<i data-lucide="layers" class="icon-sm"></i>`.

### B. Restaurar o Título do Gráfico de Evolução
1. **No arquivo `js/i18n.js` e `dashboard.html`:**
   - Voltar `chart_evolution_title` e `#evolution-title` para `"Evolução temporal"`.
   - Voltar o rótulo do menu de navegação lateral (`nav_evolution`) para `"Evolução temporal"`.

---

## 3. Registro de Auditoria das Solicitações

- **Responsável pela Demanda:** Marlos (Chefe / Autor da Tese)
- **Executor Técnico:** Thiago Franke
- **Controle de Módulos:** Gerenciado via Edge Config / Feature Flags da Vercel (`/api/flags`).
- **Política de Commit:** Nenhum commit ou push em produção será feito sem autorização expressa do Thiago.
