# Repositório: catálogo e envio de arquivos pelo admin

A aba **Repositório** de `admin.html` administra o que a página pública
`repository.html` lista. Duas coisas distintas:

| O quê | Onde vive | Como muda |
|---|---|---|
| **Catálogo** (nome, categoria, ícone, tamanho, link externo) | Edge Config, chave `repository_catalog` (arquivo `.dev-repository.json` em desenvolvimento) | `PUT`/`DELETE /api/repository`; vale na hora, sem deploy |
| **Arquivos** da pasta `repository/` | Commit no GitHub (`TFrankeM/dashboard`, branch `main`) | `POST /api/repository` grava pela API de conteúdo do GitHub; o push dispara o deploy (~20 s) |

Enquanto o catálogo nunca foi gravado, vale a lista padrão em
`api/_lib/repository.js`. O primeiro salvamento no admin materializa a lista
inteira no Edge Config, e a partir daí o código deixa de ser a fonte.

## Tamanho dos arquivos

O tamanho é calculado pelo servidor, nunca digitado:

- envio pelo admin: tamanho do arquivo recebido;
- arquivo já na pasta `repository/`: listagem pública da pasta no GitHub
  (ou `stat` do disco em desenvolvimento);
- link externo: `HEAD` na URL. Se a resposta for uma página HTML (por
  exemplo, a página de um registro no Zenodo em vez do arquivo), o tamanho
  fica desconhecido e a página não mostra o selo.

## Limites por caminho

| Tamanho | Caminho |
|---|---|
| até 3 MB | envio pelo próprio admin (limite de 4,5 MB do corpo das funções Vercel, com base64) |
| até 25 MB | interface web do GitHub, pasta `repository/` |
| 25 MB a 100 MB | `git push` pelo terminal (limite por arquivo do GitHub) |
| acima de 100 MB | dividir o arquivo ou hospedar fora (Zenodo, GitHub Releases) e cadastrar só o link |

## Variável de ambiente: `GITHUB_TOKEN`

Sem ela, o admin continua administrando o catálogo, mas o envio e a exclusão
de arquivos ficam desativados (a opção "Enviar arquivo do computador" some e o
✕ remove só da lista).

Criar um token **fine-grained** em GitHub → Settings → Developer settings →
Personal access tokens → Fine-grained tokens:

- *Repository access*: Only select repositories → `TFrankeM/dashboard`;
- *Permissions* → *Repository permissions* → **Contents: Read and write**
  (nenhuma outra);
- validade: o máximo permitido (1 ano); anotar a data para renovar.

Depois:

```bash
vercel env add GITHUB_TOKEN production
```

Os commits feitos pelo admin saem com autor "IIPEx Admin" e mensagem
`Repositório: adiciona/atualiza/remove <arquivo> (via admin)`, para
distingui-los dos commits feitos à mão.

Opcionais: `GITHUB_REPO` (padrão `TFrankeM/dashboard`) e `GITHUB_BRANCH`
(padrão `main`).

## Desenvolvimento local

`.claude/dev-server.mjs` sobe o site com as funções de `api/` em
`http://localhost:3000`, sem `EDGE_CONFIG` nem `GITHUB_TOKEN`: o catálogo vai
para `.dev-repository.json` e os envios gravam direto na pasta `repository/`
do disco. Nada toca a produção.
