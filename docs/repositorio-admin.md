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

## Como o arquivo chega ao GitHub

| Tamanho | Destino | Como |
|---|---|---|
| até 25 MB | pasta `repository/` (commit) | `POST /api/repository` grava pela API de conteúdo; o push dispara o deploy (~20 s) |
| 25 MB a 2 GB | asset do Release `repositorio-arquivos` | enviado ao Release pela API; o catálogo guarda o link `github.com/…/releases/download/…` |
| acima de 2 GB | fora do GitHub | dividir o arquivo ou hospedar na nuvem e cadastrar só o link |

Arquivos grandes não entram no histórico do Git: cada versão substituída
ficaria para sempre no clone. O Release é criado na primeira vez que for
preciso (tag `repositorio-arquivos`, apontando para `main`). Um asset com o
mesmo nome é substituído.

### Caminho do envio

- **Com `BLOB_READ_WRITE_TOKEN`** (modo `blob`): o navegador envia o arquivo
  direto para o Vercel Blob, sem passar pela função (`POST /api/upload` só
  emite a autorização, com o token do admin). Terminado o envio, o admin
  chama `POST /api/repository { doc, blobUrl }`; a função lê o blob, grava no
  GitHub e apaga a cópia. Blobs de passagem expiram sozinhos em 1 dia. Até
  256 MB a função guarda o arquivo em memória; acima, transmite em fluxo.
- **Sem o token** (modo `direct`): o arquivo vai em base64 no corpo da
  requisição, que a Vercel limita a 4,5 MB, ou seja, 3 MB de arquivo. A tela
  do admin mostra então o guia de quatro faixas (admin, interface do GitHub,
  terminal, nuvem).

`vercel.json` dá 300 s à função `api/repository.js` (máximo do plano Hobby):
um arquivo de 2 GB precisa de cerca de 7 MB/s entre Blob e GitHub para caber.

## Variáveis de ambiente

### `GITHUB_TOKEN`

Sem ela, o admin continua administrando o catálogo, mas o envio e a exclusão
de arquivos ficam desativados (a opção "Enviar do computador" some e o
✕ remove só da lista).

Criar um token **fine-grained** em GitHub → Settings → Developer settings →
Personal access tokens → Fine-grained tokens:

- *Repository access*: Only select repositories → `TFrankeM/dashboard`;
- *Permissions* → *Repository permissions* → **Contents: Read and write**
  (cobre a pasta e os Releases; nenhuma outra);
- validade: o máximo permitido (1 ano); anotar a data para renovar.

Depois:

```bash
vercel env add GITHUB_TOKEN production
```

Os commits feitos pelo admin saem com autor "IIPEx Admin" e mensagem
`Repositório: adiciona/atualiza/remove <arquivo> (via admin)`, para
distingui-los dos commits feitos à mão.

### `BLOB_READ_WRITE_TOKEN`

Libera o envio de qualquer tamanho. No painel da Vercel: projeto `iibex` →
Storage → Create → Blob; ao conectar o store ao projeto a variável é criada
sozinha. Gratuito no plano Hobby (1 GB guardado, 10 GB transferidos por
mês); como o uso é só de passagem, cada envio consome cerca de duas vezes o
tamanho do arquivo e nada fica guardado.

Opcionais: `GITHUB_REPO` (padrão `TFrankeM/dashboard`), `GITHUB_BRANCH`
(padrão `main`) e `GITHUB_RELEASE_TAG` (padrão `repositorio-arquivos`).

## Desenvolvimento local

`.claude/dev-server.mjs` sobe o site com as funções de `api/` em
`http://localhost:3000`, sem `EDGE_CONFIG`, `GITHUB_TOKEN` nem Blob: o
catálogo vai para `.dev-repository.json` e os envios, de qualquer tamanho,
gravam direto na pasta `repository/` do disco (modo `direct`, sem o limite
de corpo da Vercel). Nada toca a produção.
