# -*- coding: utf-8 -*-
"""Prompts do IIPEx, transcritos sem alteração dos Apêndices 3 (P2) e 4 (P3) da tese.
Não editar: a fidelidade ao texto da tese é condição de replicação (Seção 3.5)."""

CATEGORIAS_IPTC = [
    {
        "category_name_eng": "Arts, culture, entertainment and media",
        "category_description_eng": "All forms of arts, entertainment, cultural heritage and media",
        "category_name_por": "Artes, cultura, entretenimento e mídia"
    },
    {
        "category_name_eng": "Crime, law and justice",
        "category_description_eng": "The establishment and/or statement of the rules of behavior in society...",
        "category_name_por": "Crime, lei e justiça"
    },
    {
        "category_name_eng": "Disaster, accident and emergency incident",
        "category_description_eng": "Man made or natural event resulting in loss of life...",
        "category_name_por": "Desastres, acidentes e emergências"
    },
    {
        "category_name_eng": "Economy, business and finance",
        "category_description_eng": "All matters concerning the planning, production and exchange of wealth.",
        "category_name_por": "Economia, negócios e finanças"
    },
    {
        "category_name_eng": "Education",
        "category_description_eng": "All aspects of furthering knowledge...",
        "category_name_por": "Educação"
    },
    {
        "category_name_eng": "Environment",
        "category_description_eng": "All aspects of protection, damage...",
        "category_name_por": "Meio ambiente"
    },
    {
        "category_name_eng": "Health",
        "category_description_eng": "All aspects of physical and mental well-being",
        "category_name_por": "Saúde"
    },
    {
        "category_name_eng": "Human interest",
        "category_description_eng": "Item that discusses individuals, groups, animals...",
        "category_name_por": "Interesse humano"
    },
    {
        "category_name_eng": "Labor",
        "category_description_eng": "Social aspects, organizations, rules and conditions...",
        "category_name_por": "Trabalho"
    },
    {
        "category_name_eng": "Lifestyle and leisure",
        "category_description_eng": "Activities undertaken for pleasure, relaxation...",
        "category_name_por": "Estilo de vida e lazer"
    },
    {
        "category_name_eng": "Politics and government",
        "category_description_eng": "Local, regional, national and international exercise of power...",
        "category_name_por": "Política"
    },
    {
        "category_name_eng": "Religion",
        "category_description_eng": "Belief systems, institutions and people...",
        "category_name_por": "Religião e crença"
    },
    {
        "category_name_eng": "Science and technology",
        "category_description_eng": "All aspects pertaining to human understanding...",
        "category_name_por": "Ciência e tecnologia"
    },
    {
        "category_name_eng": "Society",
        "category_description_eng": "The concerns, issues, affairs and institutions...",
        "category_name_por": "Sociedade"
    },
    {
        "category_name_eng": "Sport",
        "category_description_eng": "Competitive activity or skill...",
        "category_name_por": "Esporte"
    },
    {
        "category_name_eng": "Conflict, war and peace",
        "category_description_eng": "Acts of socially or politically motivated protest...",
        "category_name_por": "Conflito, guerra e paz"
    },
    {
        "category_name_eng": "Weather",
        "category_description_eng": "The study, prediction and reporting...",
        "category_name_por": "Meteorologia"
    }
]

FORMATTED_CATEGORY_LINES = [f'{c["category_name_eng"]}: {c["category_description_eng"]}' for c in CATEGORIAS_IPTC]
VALID_CATEGORY_NAMES_POR = [c["category_name_por"] for c in CATEGORIAS_IPTC]

# No Apêndice 3 o trecho {valid_category_names_por} aparece como a expressão de f-string {', '.join(valid_category_names_por)}; o texto resultante é idêntico.
P2_SYSTEM_TEMPLATE = "\nYou are an AI system specialized in classifying news articles.\nAvailable Categories:\n{formatted_category_lines}\n\nOutput ONLY one of: {valid_category_names_por}.\n"
P2_USER_TEMPLATE = "\nHeader: {article_header}\nSummary: {article_summary}\nText: {article_text}\n"

P3_TEMPLATE = "\nYou are a powerful AI system, specialized in performing sentiment analysis.\nYour tasks are to analyze news articles and provide a rating based on their impact on the image of a specific entity.\n\n<task>\nYou will analyze a news article mentioning {ENTE_EM_AVALIACAO}, strictly from the perspective of a {ENTE_AVALIADOR}.\n\nHere is the article:\nManchete: {manchete}\nResumo: {resumo}\nTexto: {texto}\nFonte: {fonte}\nPaís: {pais}\nData: {data}\nThe article includes the following columns: Date, Header, Summary, Text, Source (the publishing media outlet), and Geography (the country the article was published).\n\nFollow these instructions carefully, step-by-step:\n\nStep 1.\nFully read and understand the entire news content (Date, Header, Summary, Article text, Source and Geography).\n\nStep 2.\nProduce a brief analysis in Portuguese (never use other languages), explicitly addressing these points:\na. The relevance of the news article's content.\nb. Your perspective as a {ENTE_AVALIADOR}.\nc. Importance of the news topic.\nd. Influence and credibility of the news source for a {ENTE_AVALIADOR}.\n\nYour analysis in Portuguese must strictly meet these conditions:\na. Weave the points into a coherent paragraph of concise sentences.\nb. Be in Portuguese. Never use any other language.\nc. Never include special characters. Include only plain text in Portuguese.\nd. The analysis must NOT break abruptly.\ne. If there are special characters in the analysis, remove them entirely.\nf. Never leave the analysis blank. Never repeat sentences.\ng.You must finish your thought and place a period well before reaching the character limit. Do not try to fill the space. Less is better.\n\nStep 3.\nOutput Formatting Check:\nEnsure that the very last character of your text is a period (.). \n\nStep 4.\nBased strictly on your Portuguese analysis, assign a numeric rating to reflect the likely reputational impact of this news article on the image of {ENTE_EM_AVALIACAO}, as projected by the media environment of {PAIS_DA_FONTE}, when assessed through the technical perspective of a {ENTE_AVALIADOR}. Use only one of these allowed values exactly:\n\n| Rating | Objective Description of Impact on {ENTE_EM_AVALIACAO}'s Image |\n|--------|---------------------------------------------------------------|\n| 1      | Extremely negative. Maximum negative impact possible, severely deteriorates image. |\n| 2      | Moderately negative. Significantly unfavorable impact on the image, but not the maximum. |\n| 3      | Slightly negative. Unfavorable impact, however limited or localized. |\n| 4      | Neutral or irrelevant. No impact to image. |\n| 5      | Slightly positive. Favorable impact, however limited or localized. |\n| 6      | Moderately positive. Significantly favorable impact on the image, but not the maximum. |\n| 7      | Extremely positive. Maximum possible favorable impact; substantially improves the image. |\n\nStep 5.\nYour final output must strictly have two parts:\n+ Your analysis text exclusively in Portuguese.\n+ ⁠A numeric rating, without brackets or any other characters.\n\nFormat should be: [ANALISE][NOTA]\n</task>\n"

ENTE_AVALIADOR_PADRAO = "analista argentino de imagem-país"
ENTE_EM_AVALIACAO_PADRAO = "Brasil"


def prompt_p2(manchete, resumo, texto):
    """Mensagens system e user do processo P2 (Apêndice 3), com as variáveis preenchidas."""
    system = P2_SYSTEM_TEMPLATE.format(formatted_category_lines=FORMATTED_CATEGORY_LINES,
                                       valid_category_names_por=", ".join(VALID_CATEGORY_NAMES_POR))
    user = P2_USER_TEMPLATE.format(article_header=manchete, article_summary=resumo, article_text=texto)
    return system, user


def prompt_p3(manchete, resumo, texto, fonte, pais, data,
              ente_avaliador=ENTE_AVALIADOR_PADRAO, ente_em_avaliacao=ENTE_EM_AVALIACAO_PADRAO):
    """Prompt único (mensagem user) do processo P3 (Apêndice 4), com as variáveis preenchidas.
    PAIS_DA_FONTE recebe o país de publicação da notícia (campo Geography), como na tese."""
    return P3_TEMPLATE.format(ENTE_EM_AVALIACAO=ente_em_avaliacao, ENTE_AVALIADOR=ente_avaliador,
                              PAIS_DA_FONTE=pais, manchete=manchete, resumo=resumo, texto=texto,
                              fonte=fonte, pais=pais, data=data)
