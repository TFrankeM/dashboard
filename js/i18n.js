
export const DICTIONARY = {
    "pt-BR" : {
        main_page_title: "FGV IMídIA | Sala de Situación",
        app_logo: "assets/logodint_pt.svg",

        // General
        app_title: "FGV IMídIA",
        app_subtitle: "Indicador de Imagem na Mídia Digital",
        filter_section_title: "Filtros",
        mode_static: "Modo estático",
        mode_dynamic: "Modo dinâmico",
        no_data_found: "Nenhum dado encontrado",
        loading_data: "Carregando...",
        error_loading: "Erro",
        unit_singular: "notícia",
        unit_plural: "notícias",
        reviewer: "Ente avaliador",
        reviewedEntity: "Ente em avaliação",
        not_specified: "Não especificado",

        // Filter labels
        label_period: "Período",
        label_reviewer: "Quem avalia",
        label_political: "Perfil",
        label_reviewedEntity: "Quem será avaliado",
        label_category: "Categorias",
        label_aggregation: "Agregação (h)",
        btn_apply: "Aplicar filtros",
        btn_show_filters: "Mostrar filtros",
        btn_hide_filters: "Ocultar filtros",

        // Tooltips
        tooltip_mode: "<b>Modo Estático</b>: calcula o FGV IMídIA no período definido. <br><b>Modo Dinâmico</b>: atualiza o FGV IMídIA a cada 30 min.",
        tooltip_period: "Define o intervalo de tempo do FGV IMídIA.",
        tooltip_reviewer: "País ou entidade que avalia a imagem do ente em avaliação.",
        tooltip_political: "Selecione um alinhamento para comparar até cinco categorias. Selecione até cinco alinhamentos para comparar suas visões sobre uma única categoria.",
        tooltip_reviewedEntity: "País ou entidade que é o objeto de avaliação por parte do ente avaliador.",
        tooltip_category: "Filtra as categorias avaliadas. Selecione até cinco categorias simultaneamente.",
        tooltip_aggregation: "Define o intervalo em horas para agrupar os dados (ex: 0.5 para 30min, 24 para um dia).",
        tooltip_histogram: "Frequência de notícias agrupadas pela nota de 1 a 7 do IMídIA.",
        tooltip_volume: "Total de publicações capturadas e processadas pelo motor de análise.",
        tooltip_gauge: "FGV IMídIA <br>Escala de 1 a 7.",
        tooltip_evolution: "Evolução do FGV IMídIA.",
        
        // Image labels
        image_extremely_negative: "Imagem extremamente negativa",
        image_very_negative: "Imagem muito negativa",
        image_slightly_negative: "Imagem levemente negativa",
        image_neutral: "Imagem neutra",
        image_slightly_positive: "Imagem levemente positiva",
        image_very_positive: "Imagem muito positiva",
        image_extremely_positive: "Imagem extremamente positiva",

        // Histogram chart
        chart_histogram_title: "Distribuição de notas",
        chart_histogram_desc: "Sentimento das notícias",
        chart_histogram_tooltip_grade: "Nota",

        // Volume chart
        chart_volume_title: "Quantidade de notícias",
        chart_volume_desc_singular: "notícia analisada no período",
        chart_volume_desc_plural: "notícias analisadas no período",
        chart_volume_tooltip_day: "Dia",
        chart_volume_tooltip_unit_singular: "notícia analisada",
        chart_volume_tooltip_unit_plural: "notícias analisadas",
        
        // Gauge chart
        chart_gauge_title: "FGV IMídIA",
        last_update: "Última atualização: ",

        // Evolution chart
        evo_title_prefix: "Avaliador: ",
        evo_title_separator: " | Avaliado: ",
        evo_subtitle_prefix: "Evolução do Indicador de Imagem no Exterior ",
        evo_date_connector: " nos ",
        evo_date_connector_static: " de ",
        evo_date_connector_static_to: " a ",
        chart_line_y_axis_title: "FGV IMídIA",
        chart_line_tooltip_avg: "Nota média",
        chart_line_tooltip_count: "Quantidade de notícias",
        btn_reset: "Redefinir zoom",

        // Popup see details
        popup_text: "Entenda o IMídIA de ",
        btn_view_news: "Veja as notícias",
        btn_cancel: "Cancelar",

        // Footer
        footer_copyright: "Diretoria Internacional da Fundação Getulio Vargas",
        footer_description: "Em desenvolvimento •",

        // Filter options
        period_options: {
            // "key": "label"
            "sem1_2025": "2025 semestre 1 de 2",
            "sem2_2025": "2025 semestre 2 de 2",
            "q1_2025": "2025 trimestre 1 de 4",
            "q2_2025": "2025 trimestre 2 de 4",
            "q3_2025": "2025 trimestre 3 de 4",
            "q4_2025": "2025 trimestre 4 de 4",
            "year_2025": "2025",
            "year_2026": "2026",
            "dec2025_jan2026": "Dez de 2025 a Fev de 2026",
            "Last30d": "Últimos 30 dias",
            "Last120d": "Últimos 120 dias",
            "Last180d": "Últimos 180 dias",
            "Last365d": "Últimos 365 dias"
        },

        category_options: {
            // "key": "label"
            "Todas": "Todas",
            "Artes, cultura, entretenimento e mídia": "Artes, cultura, entretenimento e mídia",
            "Ciência e tecnologia": "Ciência e tecnologia",
            "Conflito, guerra e paz": "Conflito, guerra e paz",
            "Crime, lei e justiça": "Crime, lei e justiça",
            "Desastres, acidentes e emergências": "Desastres, acidentes e emergências",
            "Economia, negócios e finanças": "Economia, negócios e finanças",
            "Educação": "Educação",
            "Esporte": "Esporte",
            "Estilo de vida e lazer": "Estilo de vida e lazer",
            "Interesse humano": "Interesse humano",
            "Meio ambiente": "Meio ambiente",
            "Meteorologia": "Meteorologia",
            "Política": "Política",
            "Religião e crenças": "Religião e crenças",
            "Saúde": "Saúde",
            "Sociedade": "Sociedade",
            "Trabalho": "Trabalho"
        },

        entity_options: {
            // "key": "label"
            "EUA": "Estados Unidos",
            "Argentina": "Argentina",
            "Brasil": "Brasil",
            "Presidente Trump": "Presidente Trump"
        },

        political_options: {
            // "key": "label"
            "Democratas": "Democratas",
            "Republicanos": "Republicanos",
            "Independentes": "Independentes"
        },

        // Details page
        details_page_title: "Detalhes das notícias",
        btn_close: "Fechar",
        details_title_prefix: "Notícias que compõem o FGV IMídIA em ",
        loading_filters: "Carregando filtros...",
        btn_choose_columns: "Escolha as colunas visíveis",
        label_show: "Exibir:",
        label_news_count: "notícias",
        col_date: "Data",
        col_headline: "Manchete",
        col_summary: "Resumo",
        col_article_text: "Texto do artigo",
        col_source: "Fonte",
        col_category: "Categoria",
        col_analysis: "Análise",
        col_grade: "Nota do IMídIA",
        col_link: "Link",
        click_to_expand: "Clique para expandir",
        table_link_view: "Veja",
    },
    "en-US": {
        main_page_title: "FGV IMídIA | Situation Room",

        app_logo: "assets/logodint_en.svg",

        // General
        app_title: "FGV IMídIA",
        app_subtitle: "Foreign Image Indicator",
        filter_section_title: "Filters",
        mode_static: "Static mode: 2025",
        mode_dynamic: "Dynamic mode",
        no_data_found: "No data found",
        loading_data: "Loading...",
        error_loading: "Error",
        unit_singular: "news item",
        unit_plural: "news items",
        reviewer: "Evaluating entity",
        reviewedEntity: "Evaluated entity",
        not_specified: "Not specified",

        // Filter labels
        label_period: "Period",
        label_reviewer: "Evaluator entity",
        label_political: "Political alignment",
        label_reviewedEntity: "Evaluated entity",
        label_category: "Categories",
        label_aggregation: "Aggregation (h)",
        btn_apply: "Apply changes",
        btn_show_filters: "Show filters",
        btn_hide_filters: "Hide filters", 

        // Tooltips
        tooltip_mode: "<b>Static Mode</b>: calculates the FGV IMídIA for the defined period. <br><b>Dynamic Mode</b>: updates the FGV IMídIA every 30 minutes.",
        tooltip_period : "Defines the time interval of the FGV IMídIA.",
        tooltip_reviewer: "Country or entity that evaluates the image of the assessed entity.",
        tooltip_political: "Select one alignment to compare up to five categories. Select up to five alignments to compare their views on a single category.",
        tooltip_reviewedEntity: "Country or entity that is the object of evaluation by the reviewing entity.",
        tooltip_category: "Filters the evaluated categories. Select up to five categories simultaneously.",
        tooltip_aggregation: "Defines the interval in hours to aggregate the data (e.g., 0.5 for 30 min, 24 for one day).",
        tooltip_histogram: "Frequency of news grouped by IMídIA scores from 1 to 7.",
        tooltip_volume: "Total number of publications captured and processed by the analysis engine.",
        tooltip_gauge: "FGV IMídIA <br>Scale from 1 to 7.",
        tooltip_evolution: "Evolution of the FGV IMídIA.",

        // Image labels
        image_extremely_negative: "Extremely negative image",
        image_very_negative: "Very negative image",
        image_slightly_negative: "Slightly negative image",
        image_neutral: "Neutral image",
        image_slightly_positive: "Slightly positive image",
        image_very_positive: "Very positive image",
        image_extremely_positive: "Extremely positive image",
        
        // Histogram chart
        chart_histogram_title: "Grade frequency",
        chart_histogram_desc: "Distribution of news sentiment",
        chart_histogram_tooltip_grade: "Grade",

        // Volume chart
        chart_volume_title: "News quantity",
        chart_volume_desc_singular: "news item analyzed in the period",
        chart_volume_desc_plural: "news items analyzed in the period",
        chart_volume_tooltip_day: "Date",
        chart_volume_tooltip_unit_singular: "news item analyzed",
        chart_volume_tooltip_unit_plural: "news items analyzed",
        
        // Gauge chart
        chart_gauge_title: "FGV IMídIA",
        last_update: "Last update: ",

        // Evolution chart
        evo_title_prefix: "Evaluator: ",
        evo_title_separator: " | Evaluated: ",
        evo_subtitle_prefix: "Evolution of Foreign Image Indicator ",
        evo_date_connector: " in the ",
        evo_date_connector_static: " from ",
        evo_date_connector_static_to: " to ",
        chart_line_y_axis_title: "FGV IMídIA",
        chart_line_tooltip_avg: "Average grade",
        chart_line_tooltip_count: "News quantity",
        btn_reset: "Reset",

        // Popup see details
        popup_text: "Understand the IMídIA of ",
        btn_view_news: "View news",
        btn_cancel: "Cancelar",

        // Footer
        footer_copyright: "FGV International Affairs Division",
        footer_description: "Under development • ",

        // Filter options
        period_options: {
            // "key": "label"
            "sem1_2025": "2025 semester 1 of 2",
            "sem2_2025": "2025 semester 2 of 2",
            "q1_2025": "2025 quarter 1 of 4",
            "q2_2025": "2025 quarter 2 of 4",
            "q3_2025": "2025 quarter 3 of 4",
            "q4_2025": "2025 quarter 4 of 4",
            "year_2025": "2025",
            "year_2026": "2026",
            "dec2025_jan2026": "Dec 2025 to Feb 2026",
            "Last30d": "Last 30 days",
            "Last120d": "Last 120 days",
            "Last180d": "Last 180 days",
            "Last365d": "Last 365 days"
        },
        
        category_options: {
            // "key": "label"
            "Todas": "All",
            "Artes, cultura, entretenimento e mídia": "Arts, culture, entertainment and media",
            "Ciência e tecnologia": "Science and technology",
            "Conflito, guerra e paz": "Conflict, war and peace",
            "Crime, lei e justiça": "Crime, law and justice",
            "Desastres, acidentes e emergências": "Disaster, accident and emergency incident",
            "Economia, negócios e finanças": "Economy, business and finance",
            "Educação": "Education",
            "Esporte": "Sport",
            "Estilo de vida e lazer": "Lifestyle and leisure",
            "Interesse humano": "Human interest",
            "Meio ambiente": "Environment",
            "Meteorologia": "Weather",
            "Política": "Politics",
            "Religião e crenças": "Religion and belief",
            "Saúde": "Health",
            "Sociedade": "Society",
            "Trabalho": "Labour"
        },

        entity_options: {
            // "key": "label"
            "EUA": "United States",
            "Argentina": "Argentina",
            "Brasil": "Brazil",
            "Presidente Trump": "President Trump"
        },

        political_options: {
            // "key": "label"
            "Democratas": "Democrats",
            "Republicanos": "Republicans",
            "Independentes": "Independents"
        },

        // Detailse page
        details_page_title: "News details",
        btn_close: "Close",
        details_title_prefix: "News composing the FGV IMídIA on ",
        loading_filters: "Loading filters...",
        btn_choose_columns: "Choose visible columns",
        label_show: "Show:",
        label_news_count: "news articles",
        col_date: "Date",
        col_headline: "Headline",
        col_summary: "Summary",
        col_article_text: "Article text",
        col_source: "Source",
        col_category: "Category",
        col_analysis: "Analysis",
        col_grade: "IMídIA Grade",
        col_link: "Link",
        click_to_expand: "Click to expand",
        table_link_view: "View",
    },
    "es-ES": {
        app_logo: "assets/logodint_es.svg",

        // General
        app_title: "FGV IMídIA",
        app_subtitle: "Indicador de Imagen en Medios Digitales",
        filter_section_title: "Filtros",
        mode_static: "Modo estático: 2025",
        mode_dynamic: "Modo dinámico",
        no_data_found: "Ningún dato encontrado",
        loading_data: "Cargando...",
        error_loading: "Error",
        unit_singular: "noticia",
        unit_plural: "noticias",
        reviewer: "Entidad evaluadora",
        reviewedEntity: "Entidad evaluada",
        not_specified: "No especificado",

        // Filter labels
        label_period: "Período",
        label_reviewer: "Entidad evaluadora",
        label_political: "Alineación política",
        label_reviewedEntity: "Entidad evaluada",
        label_category: "Categorías",
        label_aggregation: "Agregación (h)",
        btn_apply: "Aplicar cambios",
        btn_show_filters: "Mostrar filtros",
        btn_hide_filters: "Ocultar filtros",    

        // Tooltips
        tooltip_mode: "<b>Modo Estático</b>: calcula el FGV IMídIA en el período definido. <br><b>Modo Dinámico</b>: actualiza el FGV IMídIA cada 30 minutos.",
        tooltip_period: "Define el intervalo de tiempo del FGV IMídIA.",
        tooltip_reviewer: "País o entidad que evalúa la imagen del ente evaluado.",
        tooltip_political: "Seleccione una alineación para comparar hasta cinco categorías. Seleccione hasta cinco alineaciones para comparar sus visiones sobre una sola categoría.",
        tooltip_reviewedEntity: "País o entidad que es objeto de evaluación por parte del ente evaluador.",
        tooltip_category: "Filtra las categorías evaluadas. Seleccione hasta cinco categorías simultáneamente.",
        tooltip_aggregation: "Define el intervalo en horas para agrupar los datos (ej.: 0.5 para 30 min, 24 para un día).",
        tooltip_histogram: "Frecuencia de noticias agrupadas por la puntuación del <br>IMídIA de 1 a 7.",
        tooltip_volume: "Total de publicaciones capturadas y procesadas por el motor de análisis.",
        tooltip_gauge: "FGV IMídIA <br>Escala de 1 a 7.",
        tooltip_evolution: "Evolución del FGV IMídIA.",

        // Image labels
        image_extremely_negative: "Imagem extremadamente negativa",
        image_very_negative: "Imagem muy negativa",
        image_slightly_negative: "Imagem levemente negativa",
        image_neutral: "Imagem neutra",
        image_slightly_positive: "Imagem levemente positiva",
        image_very_positive: "Imagem muy positiva",
        image_extremely_positive: "Imagem extremadamente positiva",
        
        // Histogram chart
        chart_histogram_title: "Frecuencia de calificaciones",
        chart_histogram_desc: "Distribución del sentimiento noticioso",
        chart_histogram_tooltip_grade: "Nota",

        // Volume chart
        chart_volume_title: "Cantidad de noticias",
        chart_volume_desc_singular: "noticia analizada en el período",
        chart_volume_desc_plural: "noticias analizadas en el período",
        chart_volume_tooltip_day: "Día",
        chart_volume_tooltip_unit_singular: "noticia analizada",
        chart_volume_tooltip_unit_plural: "noticias analizadas",
        
        // Gauge chart
        chart_gauge_title: "FGV IMídIA",
        last_update: "Última actualización: ",

        // Evolution chart
        evo_title_prefix: "Evaluador: ",
        evo_title_separator: " | Evaluado: ",
        evo_subtitle_prefix: "Evolución del Indicador de Imagen en el Exterior ",
        evo_date_connector: " en los ",
        evo_date_connector_static: " de ",
        evo_date_connector_static_to: " a ",
        chart_line_y_axis_title: "FGV IMídIA",
        chart_line_tooltip_avg: "Nota media",
        chart_line_tooltip_count: "Cantidad de noticias",
        btn_reset: "Restablecer",

        // Popup see details
        popup_text: "Entienda el IMídIA de ",
        btn_view_news: "Ver noticias",
        btn_cancel: "Cancelar",

        // Footer
        footer_copyright: "Dirección Internacional de FGV",
        footer_description: "En desarrollo • ",

        // Filter options
        period_options: {
            // "key": "label"
            "sem1_2025": "2025 semestre 1 de 2",
            "sem2_2025": "2025 semestre 2 de 2",
            "q1_2025": "2025 trimestre 1 de 4",
            "q2_2025": "2025 trimestre 2 de 4",
            "q3_2025": "2025 trimestre 3 de 4",
            "q4_2025": "2025 trimestre 4 de 4",
            "year_2025": "2025",
            "year_2026": "2026",
            "dec2025_jan2026": "Dic 2025 a Feb 2026",
            "Last30d": "Últimos 30 días",
            "Last120d": "Últimos 120 días",
            "Last180d": "Últimos 180 días",
            "Last365d": "Últimos 365 días"
        },
        
        category_options: {
            // "key": "label"
            "Todas": "Todas",
            "Artes, cultura, entretenimento e mídia": "Artes, cultura, entretenimiento y medios",
            "Ciência e tecnologia": "Ciencia y tecnología",
            "Conflito, guerra e paz": "Conflicto, guerra y paz",
            "Crime, lei e justiça": "Crimen, ley y justicia",
            "Desastres, acidentes e emergências": "Desastres, accidentes y emergencias",
            "Economia, negócios e finanças": "Economía, negocios y finanzas",
            "Educação": "Educación",
            "Esporte": "Deporte",
            "Estilo de vida e lazer": "Estilo de vida y tiempo libre",
            "Interesse humano": "Interés humano",
            "Meio ambiente": "Medio ambiente",
            "Meteorologia": "Meteorología",
            "Política": "Política",
            "Religião e crenças": "Religión y creencias",
            "Saúde": "Salud",
            "Sociedade": "Sociedad",
            "Trabalho": "Trabajo"
        },

        entity_options: {
            // "key": "label"
            "EUA": "Estados Unidos",
            "Argentina": "Argentina",
            "Brasil": "Brasil",
            "Presidente Trump": "Presidente Trump"
        },

        political_options: {
            // "key": "label"
            "Democratas": "Demócratas",
            "Republicanos": "Republicanos",
            "Independentes": "Independientes"
        },

        // Details page
        btn_close: "Cerrar",
        details_title_prefix: "Noticias que componen el FGV IMídIA el ",
        loading_filters: "Cargando filtros...",
        btn_choose_columns: "Elija las columnas visibles",
        label_show: "Mostrar:",
        label_news_count: "noticias",
        col_date: "Fecha",
        col_headline: "Titular",
        col_summary: "Resumen",
        col_article_text: "Texto del artículo",
        col_source: "Fuente",
        col_category: "Categoría",
        col_analysis: "Análisis",
        col_grade: "Nota de IMídIA",
        col_link: "Enlace",
        click_to_expand: "Haga clic para expandir",
        table_link_view: "Ver",
    }
};
