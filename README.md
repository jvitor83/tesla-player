# Tesla Play Center

Central multimídia web (SPA em React + TypeScript) projetada especificamente para o navegador Chromium integrado aos veículos Tesla (telas centrais de 15" e 17"), combinando interface de toque de alto contraste (alvos mínimos de `48x48px`), integração oficial com **Google OAuth 2.0 (`youtube.readonly`)** e **YouTube Data API v3**, e reprodução via **YouTube IFrame Player API (`/embed/VIDEO_ID`)** com maximização de viewport 100% em CSS.

---

## 1. Arquitetura e Stack Tecnológica

- **Frontend**: Single Page Application (SPA) em **React 19 + TypeScript + Vite**, garantindo carregamento rápido e transição instantânea entre abas e módulos sem recarregar a página.
- **Design de Interface (UI/UX)**: Modo escuro automotivo nativo (`#0b0d10` / `#151921`) com botões e controles táteis amplos (`>= 48x48px`) para operação confortável em telas de 15" (Model 3/Y) e 17" (Model S/X).
- **Hospedagem e Segurança (HTTPS)**: Pré-configurado com [`vercel.json`](./vercel.json) e [`netlify.toml`](./netlify.toml), incluindo o cabeçalho `Cross-Origin-Opener-Policy: same-origin-allow-popups` necessário para o popup de autenticação do Google Identity Services.

## 2. Integração do Módulo YouTube (Bypass de `X-Frame-Options`)

Como o site completo do YouTube bloqueia carregamento dentro de `<iframe>` via `X-Frame-Options`, o portal constrói sua própria interface consumindo os dados oficiais:

- **Autenticação (Google OAuth 2.0)**: Integração com **Google Identity Services** (`accounts.google.com/gsi/client`) solicitando o escopo `https://www.googleapis.com/auth/youtube.readonly`.
- **YouTube Data API v3**:
  - `playlists.list` (`mine=true`): Lista as playlists salvas da conta Google.
  - `playlistItems.list`: Carrega os vídeos de cada playlist selecionada com reprodução sequencial automática.
  - `videos.list` (`myRating=like`): Lista os vídeos marcados com "Gostei".
  - `subscriptions.list` (`mine=true`): Lista os canais inscritos do usuário.
  - `search.list` (`videoEmbeddable=true`): Busca vídeos incorporáveis ou carrega qualquer URL/ID do YouTube diretamente.
- **Reprodutor de Vídeo**: Usa a **YouTube IFrame Player API** (`/embed/VIDEO_ID`) com avanço automático ao fim de cada faixa (`YT.PlayerState.ENDED`).

## 3. Comportamento no Browser da Tesla e Hardware MCU2 / MCU3

- **Maximização de Viewport via CSS (100% da Janela Útil)**: O botão **"Maximizar Viewport 100% (CSS)"** expande o player com `position: fixed; inset: 0; width: 100vw; height: 100dvh` sem acionar o modo "Tesla Theater" nativo (que fecha automaticamente ao sair do modo Park).
- **Otimização de Hardware**:
  - **MCU2 (Intel Atom)**: Define qualidade sugerida em `hd720` (720p) e desativa efeitos de transição/blur para preservar CPU/GPU.
  - **MCU3 (AMD Ryzen)**: Habilita `hd1080` (1080p Full HD) e transições suaves.
- **Modo Foco na Condução (Só Áudio) & Segurança**: Permite escurecer o quadro de vídeo mantendo o áudio ativo e exibe aviso de responsabilidade legal para uso de vídeo exclusivamente pelos passageiros.

## 4. Estrutura de Navegação (Dock Lateral)

- **Menu Lateral Fixo (Dock)** à esquerda com seletor **P / D** (Park / Drive) e acesso rápido:
  - **YouTube** (Ativo)
  - **IPTV / TV** (*Em breve*)
  - **Plex Server** (*Em breve*)
  - **Jogos Web** (*Em breve*)
  - **Rádios FM** (*Em breve*)
  - **Cloud & Guia** (Configuração de Client ID / API Key na própria tela + Roadmap)

## 5. Como Executar Localmente

```bash
npm install
npm run dev
```
