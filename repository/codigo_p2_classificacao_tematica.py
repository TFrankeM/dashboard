#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Processo P2 do IIPEx: classificação temática de cada notícia na taxonomia de 17 categorias do IPTC
(Seções 3.3.1 e 3.5 da tese).

Reproduz o programa do Apêndice 3: envia ao endpoint chat/completions da
OpenAI a mensagem de sistema com as 17 categorias e a notícia (manchete, resumo e texto) e grava a
categoria devolvida. Parâmetros fixados na tese (Seção 3.5 e Tabela 11): modelo GPT-4.1, versão
gpt-4.1-2025-04-14; temperature = 0; top_p e max_tokens nos valores padrão do provedor; sem semente;
até 3 tentativas com espera fixa de 5 segundos. Respostas fora do conjunto de categorias válidas são
recodificadas como "Outros" e falhas persistentes como "Erro", ambas listadas em arquivo separado
para reprocessamento.

O script produz a categoria dominante (categoria1), a usada na leitura matricial da tese
(Seção 3.3.1). A saída é a entrada de categorias de agregar_iipex.py (opção --categorias).

Entrada: CSV com as colunas id_noticia, manchete, resumo, texto (estrato de acesso mediado).
Saída:   CSV com as colunas id_noticia, categoria1, modelo, data_execucao (gravação incremental,
         retomável) e um CSV de erros (<saida>_erros.csv).

Credencial, sempre por variável de ambiente: OPENAI_API_KEY.

Uso:
  python p2_classificacao_tematica.py --entrada ../dados/restrito/noticias_2025_texto_integral.csv \
         --saida ../resultados/categorias_2025.csv [--modelo gpt-4.1-2025-04-14] [--limite N]
"""
import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime, timezone

import pandas as pd
import requests

from prompts_iipex import prompt_p2, VALID_CATEGORY_NAMES_POR

MODELO = "gpt-4.1-2025-04-14"
TEMPERATURE = 0
TENTATIVAS = 3
ESPERA = 5
INTERVALO_GRAVACAO = 100
URL = "https://api.openai.com/v1/chat/completions"
COLUNAS_SAIDA = ["id_noticia", "categoria1", "modelo", "data_execucao"]


def classificar(sessao, modelo, system, user):
    payload = {"model": modelo, "temperature": TEMPERATURE,
               "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    for tentativa in range(1, TENTATIVAS + 1):
        try:
            r = sessao.post(URL, data=json.dumps(payload), timeout=60)
            r.raise_for_status()
            conteudo = r.json()["choices"][0]["message"]["content"].strip()
            return conteudo if conteudo in VALID_CATEGORY_NAMES_POR else "Outros"
        except Exception as e:  # noqa: BLE001
            sys.stdout.write(f"\nTentativa {tentativa} falhou: {str(e)[:120]}\n")
            if tentativa < TENTATIVAS:
                time.sleep(ESPERA)
    return "Erro"


def gravar(linhas, caminho):
    if not linhas:
        return
    novo = not os.path.exists(caminho)
    with open(caminho, "a", newline="", encoding="utf-8-sig" if novo else "utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUNAS_SAIDA, lineterminator="\r\n")
        if novo:
            w.writeheader()
        w.writerows(linhas)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--entrada", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--modelo", default=MODELO)
    ap.add_argument("--limite", type=int, default=None)
    args = ap.parse_args()

    chave = os.environ.get("OPENAI_API_KEY")
    if not chave:
        sys.exit("Defina a variável de ambiente OPENAI_API_KEY.")
    sessao = requests.Session()
    sessao.headers.update({"Authorization": f"Bearer {chave}", "Content-Type": "application/json"})

    df = pd.read_csv(args.entrada, encoding="utf-8-sig", dtype=str, keep_default_na=False)
    for c in ("resumo", "texto"):
        if c not in df.columns:
            df[c] = ""
    feitos = set()
    if os.path.exists(args.saida):
        prev = pd.read_csv(args.saida, encoding="utf-8-sig", dtype=str)
        feitos = set(prev.loc[~prev["categoria1"].isin(["Erro"]), "id_noticia"])
    df = df[~df["id_noticia"].isin(feitos)]
    if args.limite:
        df = df.head(args.limite)
    print(f"Modelo: {args.modelo} | {len(feitos)} já classificadas; {len(df)} a classificar.")

    buffer, erros, n = [], [], 0
    saida_erros = os.path.splitext(args.saida)[0] + "_erros.csv"
    for _, row in df.iterrows():
        system, user = prompt_p2(row["manchete"], row["resumo"], row["texto"])
        cat = classificar(sessao, args.modelo, system, user)
        reg = {"id_noticia": row["id_noticia"], "categoria1": cat, "modelo": args.modelo,
               "data_execucao": datetime.now(timezone.utc).isoformat()}
        buffer.append(reg)
        if cat in ("Outros", "Erro"):
            erros.append(reg)
        n += 1
        sys.stdout.write(f"\r{n}/{len(df)} classificadas")
        sys.stdout.flush()
        if len(buffer) >= INTERVALO_GRAVACAO:
            gravar(buffer, args.saida)
            gravar(erros, saida_erros)
            buffer, erros = [], []
    gravar(buffer, args.saida)
    gravar(erros, saida_erros)
    print(f"\nConcluído. Saída: {args.saida}; erros e 'Outros' em {saida_erros}")


if __name__ == "__main__":
    main()
