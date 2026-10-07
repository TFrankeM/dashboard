#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Processo P3 do IIPEx: análise de sentimento de cada notícia por LLM (Seções 3.3.2 e 3.5 da tese).

Reproduz o programa do Apêndice 4: para cada notícia, envia ao modelo o
prompt exato da tese (codigo/prompts_iipex.py) e grava a análise textual e a nota (1 a 7).

Parâmetros fixados na tese (Seção 3.5): modelo Claude Sonnet 4, executado no Vertex AI
(claude-sonnet-4@20250514), como na tese, ou no Amazon Bedrock
(us.anthropic.claude-sonnet-4-20250514-v1:0); na API da Anthropic o modelo é informado por --modelo.
temperature = 0; top_p não especificado; max_tokens = 1024; sem semente; até 3 tentativas com
espera exponencial (1, 2 e 4 segundos); notícia com nota 0 e mensagem de erro quando as três falham.

Entrada: CSV com as colunas id_noticia, data_hora, veiculo, manchete, resumo, texto, pais
         (o texto integral está no estrato de acesso mediado; ver o Guia de Replicação, Seção 5.1).
Saída:   CSV com as colunas id_noticia, nota, analise, modelo, data_execucao (gravação incremental;
         linhas já gravadas são puladas, o que permite retomar uma execução interrompida).

Provedor e credenciais, sempre por variáveis de ambiente (nunca no código):
  IIPEX_PROVEDOR=vertex                  Vertex AI, com GOOGLE_CLOUD_PROJECT e CLOUD_ML_REGION e as
                                         credenciais padrão do Google Cloud (gcloud auth)
  IIPEX_PROVEDOR=bedrock                 Amazon Bedrock, com o perfil da AWS ou AWS_ACCESS_KEY_ID,
                                         AWS_SECRET_ACCESS_KEY e AWS_REGION
  (sem IIPEX_PROVEDOR)                   API da Anthropic, com ANTHROPIC_API_KEY; único provedor com
                                         o modo batch (API de Message Batches)

Uso:
  python p3_analise_sentimento.py --entrada ../dados/restrito/noticias_2025_texto_integral.csv \
         --saida ../resultados/notas_2025.csv [--modo online|batch] [--modelo ...] [--limite N]
"""
import argparse
import csv
import os
import re
import sys
import time
from datetime import datetime, timezone

import pandas as pd

from prompts_iipex import prompt_p3, ENTE_AVALIADOR_PADRAO, ENTE_EM_AVALIACAO_PADRAO

MODELO_ANTHROPIC = "claude-sonnet-4-20250514"
MODELO_VERTEX = "claude-sonnet-4@20250514"
MODELO_BEDROCK = "us.anthropic.claude-sonnet-4-20250514-v1:0"
MODELOS = {"anthropic": MODELO_ANTHROPIC, "vertex": MODELO_VERTEX, "bedrock": MODELO_BEDROCK}
TEMPERATURE = 0
MAX_TOKENS = 1024
TENTATIVAS = 3
INTERVALO_GRAVACAO = 200
LOTE_BATCH = 10000
COLUNAS_SAIDA = ["id_noticia", "nota", "analise", "modelo", "data_execucao"]


def parse_resposta_claude(texto_bruto):
    """Separa a nota (1 a 7) da análise, como no Apêndice 4 (função parse_resposta_claude)."""
    if texto_bruto is None:
        return 0.0, "Analise vazia."
    texto = str(texto_bruto).strip()
    m = re.search(r"^(.*?)[\s⁠\[\]]*(\d+(?:\.\d+)?)[\s\[\]]*$", texto, re.DOTALL)
    if m:
        try:
            nota = float(m.group(2))
            nota = min(max(nota, 1.0), 7.0)
        except ValueError:
            nota = 0.0
        resto = m.group(1)
    else:
        nota = 0.0
        resto = texto
    analise = re.sub(r"\d+", "", resto).strip()
    if not analise:
        analise = "Analise vazia."
    return nota, analise


def criar_cliente(provedor):
    if provedor == "vertex":
        from anthropic import AnthropicVertex
        projeto = os.environ.get("GOOGLE_CLOUD_PROJECT")
        regiao = os.environ.get("CLOUD_ML_REGION", "us-east5")
        if not projeto:
            sys.exit("Defina GOOGLE_CLOUD_PROJECT (e CLOUD_ML_REGION) para usar o Vertex AI.")
        return AnthropicVertex(project_id=projeto, region=regiao)
    if provedor == "bedrock":
        from anthropic import AnthropicBedrock
        return AnthropicBedrock()  # credenciais e região pelo perfil da AWS ou pelas variáveis AWS_*
    from anthropic import Anthropic
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("Defina a variável de ambiente ANTHROPIC_API_KEY.")
    return Anthropic()


def chamar_modelo(client, modelo, prompt):
    """Uma chamada síncrona com os parâmetros da tese. Versões 1.x do SDK da Anthropic retiraram o
    argumento temperature; nesse caso o parâmetro é enviado no corpo da requisição (extra_body)."""
    kwargs = dict(model=modelo, max_tokens=MAX_TOKENS,
                  messages=[{"role": "user", "content": prompt}])
    try:
        resp = client.messages.create(temperature=TEMPERATURE, **kwargs)
    except TypeError:
        resp = client.messages.create(extra_body={"temperature": TEMPERATURE}, **kwargs)
    return resp.content[0].text if resp.content else ""


def montar_prompt(row, ente_avaliador, ente_em_avaliacao):
    def campo(nome, padrao=""):
        v = row.get(nome, padrao)
        return padrao if v is None or (isinstance(v, float) and pd.isna(v)) else str(v)
    return prompt_p3(manchete=campo("manchete"), resumo=campo("resumo"), texto=campo("texto"),
                     fonte=campo("veiculo"), pais=campo("pais", "Argentina"), data=campo("data_hora"),
                     ente_avaliador=ente_avaliador, ente_em_avaliacao=ente_em_avaliacao)


def analisar_online(client, modelo, prompt, id_noticia):
    ultimo_erro = None
    for i in range(TENTATIVAS):
        try:
            texto = chamar_modelo(client, modelo, prompt)
            nota, analise = parse_resposta_claude(texto)
            return nota, analise
        except Exception as e:  # noqa: BLE001 - qualquer falha de API conta como tentativa
            ultimo_erro = str(e)
            if i < TENTATIVAS - 1:
                time.sleep(2 ** i)
    return 0, f"Erro API após {TENTATIVAS} tentativas: {ultimo_erro[:100]}"


def gravar(linhas, caminho):
    novo = not os.path.exists(caminho)
    with open(caminho, "a", newline="", encoding="utf-8-sig" if novo else "utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUNAS_SAIDA, lineterminator="\r\n")
        if novo:
            w.writeheader()
        w.writerows(linhas)


def ids_ja_processados(caminho):
    if not os.path.exists(caminho):
        return set()
    feitos = pd.read_csv(caminho, encoding="utf-8-sig", usecols=["id_noticia", "nota"])
    feitos = feitos[feitos["nota"].astype(float) > 0]  # notas 0 (erro) são reprocessadas
    return set(feitos["id_noticia"].astype(str))


def executar_online(client, modelo, df, saida, ente_avaliador, ente_em_avaliacao):
    buffer, inicio, feitos = [], time.time(), 0
    for _, row in df.iterrows():
        prompt = montar_prompt(row, ente_avaliador, ente_em_avaliacao)
        nota, analise = analisar_online(client, modelo, prompt, row["id_noticia"])
        buffer.append({"id_noticia": row["id_noticia"], "nota": nota, "analise": analise,
                       "modelo": modelo, "data_execucao": datetime.now(timezone.utc).isoformat()})
        feitos += 1
        sys.stdout.write(f"\r{feitos}/{len(df)} notícias; {(time.time() - inicio) / feitos:.2f} s/notícia")
        sys.stdout.flush()
        if len(buffer) >= INTERVALO_GRAVACAO:
            gravar(buffer, saida)
            buffer = []
    if buffer:
        gravar(buffer, saida)
    print()


def executar_batch(client, modelo, df, saida, ente_avaliador, ente_em_avaliacao):
    """Processamento em lote pela API de Message Batches da Anthropic (metade do preço; prazo de
    até 24 horas por lote), disponível na API da Anthropic."""
    registros = df.to_dict(orient="records")
    for ini in range(0, len(registros), LOTE_BATCH):
        parte = registros[ini:ini + LOTE_BATCH]
        requests_ = []
        for row in parte:
            params = {"model": modelo, "max_tokens": MAX_TOKENS, "temperature": TEMPERATURE,
                      "messages": [{"role": "user",
                                    "content": montar_prompt(row, ente_avaliador, ente_em_avaliacao)}]}
            requests_.append({"custom_id": str(row["id_noticia"]), "params": params})
        lote = client.messages.batches.create(requests=requests_)
        print(f"Lote {lote.id} submetido com {len(parte)} notícias; aguardando conclusão.")
        while True:
            time.sleep(60)
            estado = client.messages.batches.retrieve(lote.id)
            sys.stdout.write(f"\r{estado.processing_status}: {estado.request_counts}")
            sys.stdout.flush()
            if estado.processing_status == "ended":
                break
        print()
        buffer = []
        for r in client.messages.batches.results(lote.id):
            if r.result.type == "succeeded":
                texto = r.result.message.content[0].text if r.result.message.content else ""
                nota, analise = parse_resposta_claude(texto)
            else:
                nota, analise = 0, f"Erro no lote: {r.result.type}"
            buffer.append({"id_noticia": r.custom_id, "nota": nota, "analise": analise,
                           "modelo": modelo, "data_execucao": datetime.now(timezone.utc).isoformat()})
        gravar(buffer, saida)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--entrada", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--modo", choices=["online", "batch"], default="online")
    ap.add_argument("--modelo", default=None, help="padrão: o modelo da tese no provedor escolhido")
    ap.add_argument("--limite", type=int, default=None, help="processa apenas as N primeiras notícias pendentes")
    ap.add_argument("--ente-avaliador", default=ENTE_AVALIADOR_PADRAO)
    ap.add_argument("--ente-em-avaliacao", default=ENTE_EM_AVALIACAO_PADRAO)
    args = ap.parse_args()

    provedor = os.environ.get("IIPEX_PROVEDOR", "anthropic").lower()
    if provedor not in MODELOS:
        sys.exit("IIPEX_PROVEDOR aceita os valores vertex, bedrock ou anthropic.")
    modelo = args.modelo or MODELOS[provedor]
    if provedor != "anthropic" and args.modo == "batch":
        sys.exit("O modo batch atende à API da Anthropic; no Vertex AI e no Bedrock use o modo online.")

    df = pd.read_csv(args.entrada, encoding="utf-8-sig", dtype=str, keep_default_na=False)
    obrigatorias = {"id_noticia", "manchete", "texto"}
    if not obrigatorias.issubset(df.columns):
        sys.exit(f"A entrada precisa das colunas {sorted(obrigatorias)}; encontradas: {list(df.columns)}")
    feitos = ids_ja_processados(args.saida)
    df = df[~df["id_noticia"].isin(feitos)]
    df = df[(df["manchete"].str.strip() != "") | (df["texto"].str.strip() != "")]
    if args.limite:
        df = df.head(args.limite)
    print(f"Provedor: {provedor} | Modelo: {modelo} | Modo: {args.modo} | "
          f"Avaliador: {args.ente_avaliador} | Avaliado: {args.ente_em_avaliacao}")
    print(f"{len(feitos)} notícias já processadas; {len(df)} a processar.")
    if df.empty:
        return
    client = criar_cliente(provedor)
    if args.modo == "online":
        executar_online(client, modelo, df, args.saida, args.ente_avaliador, args.ente_em_avaliacao)
    else:
        executar_batch(client, modelo, df, args.saida, args.ente_avaliador, args.ente_em_avaliacao)
    print(f"Concluído. Saída: {args.saida}")


if __name__ == "__main__":
    main()
