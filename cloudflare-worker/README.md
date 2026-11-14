# Tesla Player - Cloudflare Worker Stream Gateway

Este diretório contém o Worker sem servidor para o **Cloudflare Workers** (plano 100% gratuito: 100.000 requisições/dia).

Ele funciona como a ponte (proxy CORS) entre o YouTube e o reprodutor WebGL/WASM do Tesla Player (`Backendless` e `External` mode), contornando as restrições de CORS e o bloqueio de bot do YouTube.

---

## 🚀 Como Implantar em 2 Minutos (Sem Instalar Nada)

Você não precisa instalar Node.js ou ferramentas de linha de comando no seu computador. Tudo pode ser feito direto no navegador:

### Passo 1: Criar conta gratuita no Cloudflare
1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com) e faça login (ou crie uma conta gratuita).

### Passo 2: Criar o Worker
1. No menu lateral esquerdo, clique em **Compute (Workers) > Workers & Pages** (ou **Workers & Páginas**).
2. Clique no botão azul **Create application** (Criar aplicação) -> **Create Worker** (Criar Worker).
3. Dê um nome ao Worker (por exemplo: `tesla-player-stream`) e clique em **Deploy**.

### Passo 3: Colar o Código do Worker
1. Na tela seguinte do Worker recém-criado, clique no botão **Edit code** (ou **Quick Edit** / Editar Código).
2. Apague todo o código de exemplo que estiver no editor.
3. Abra o arquivo [`worker.js`](./worker.js) deste repositório, copie todo o seu conteúdo e cole no editor do Cloudflare.
4. Clique no botão **Save and Deploy** (Salvar e Implantar) no canto superior direito.

### Passo 4: Copiar a URL do Worker
1. No topo da página de edição ou no painel do Worker, copie a URL gerada pelo Cloudflare, por exemplo:
   `https://tesla-player-stream.seu-usuario.workers.dev`

### Passo 5: Inserir a URL no Tesla Player
1. Abra o Tesla Player no seu navegador ou na tela do carro:
   `https://jvitor83.github.io/tesla-player/`
2. No topo do player, clique no botão **Gateway Cloudflare** (ou ícone de nuvem).
3. Cole a sua URL `https://tesla-player-stream.seu-usuario.workers.dev` e clique em **Salvar**.
4. Pronto! O Tesla Player salvará a URL no `localStorage` e usará o seu Worker para extrair o fluxo MP4 H.264 (`itag=18`) e decodificar diretamente no Canvas WebGL via WebAssembly.

---

## 🛠️ Opção 2: Implantação via Terminal (Wrangler CLI)

Se você já usa o terminal e o Node.js:

```bash
# 1. Entre na pasta do worker
cd cloudflare-worker

# 2. Faça login no Cloudflare
npx wrangler login

# 3. Publique o worker
npx wrangler deploy
```

---

## 📡 Endpoints Disponíveis no Worker

- `GET /health`: Verifica se o Worker está ativo e respondendo.
- `GET /info?id=VIDEO_ID`: Retorna os metadados do vídeo e as URLs diretas de stream com CORS.
- `GET /stream?id=VIDEO_ID&itag=18`: Transmite o arquivo de mídia MP4 com suporte a cabeçalhos `Range: bytes=...` e `Access-Control-Allow-Origin: *`.
- `GET /proxy?url=URL_CODIFICADA`: Proxy de streaming de mídia direto com injeção de cabeçalhos CORS.

---

## ⚠️ Limitação conhecida: `LOGIN_REQUIRED` ("Sign in to confirm you're not a bot")

O YouTube marca os IPs de datacenter (incluindo os da rede do Cloudflare Workers) e passa a exigir
login / verificação anti-bot (BotGuard / PO token) para o endpoint `/youtubei/v1/player`. Quando isso
acontece, o Worker responde **HTTP 403** com:

```json
{ "error": "Failed to resolve video info", "code": "YOUTUBE_BOT_CHECK", "details": "YouTube playability status: LOGIN_REQUIRED (...)" }
```

Isso **não é corrigível do lado do servidor** de forma legítima: as URLs `googlevideo.com` ficam
amarradas ao IP que as resolveu, e contornar a verificação anti-bot (rotação de clientes, cookies
falsos, geração de PO token, proxies residenciais) não é suportado por este projeto.

O app trata o erro e mostra a mensagem ao usuário, sem ficar repetindo requisições. Alternativas:

- **Modo IFrame** (player oficial do YouTube) para vídeos do YouTube.
- **Mídia própria** (ex.: Cloudflare R2 / Cloudflare Stream com MP4 H.264) tocada pelo pipeline
  Backendless (mp4box.js → tinyh264 WASM → WebGL `<canvas>` + `<audio>`), que funciona sem `<video>`.
- Os vídeos do **catálogo** pré-empacotado continuam funcionando no modo Backendless.
