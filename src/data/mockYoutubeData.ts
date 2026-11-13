import type {
  YouTubeVideo,
  YouTubePlaylist,
  YouTubeSubscription,
  ReservedModuleSpec,
} from '../types/tesla';

export const DEFAULT_FEATURED_VIDEOS: YouTubeVideo[] = [
  {
    id: 'jfKfPfyJRdk',
    title: 'lofi hip hop radio - beats to relax/study/drive to',
    channelTitle: 'Lofi Girl',
    channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
    thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    publishedAt: 'Ao Vivo 24/7',
    duration: 'AO VIVO',
    viewCount: '68K assistindo',
    description:
      'Trilha sonora contínua de baixo consumo de CPU ideal para viagens noturnas e cruzeiro em Autopilot.',
  },
  {
    id: 'CyUg9bC1M1E',
    title: 'We, Robot | Tesla Cybercab & Robovan Official Event',
    channelTitle: 'Tesla',
    channelId: 'UC5WjFrtBdufl6CZojX3D8dQ',
    thumbnail: 'https://i.ytimg.com/vi/CyUg9bC1M1E/hqdefault.jpg',
    publishedAt: 'Out 2024',
    duration: '53:12',
    viewCount: '4.9M visualizações',
    description:
      'Apresentação oficial do ecossistema autônomo Tesla Cybercab, Robovan e Optimus.',
  },
  {
    id: '21X5lGlDOfg',
    title: 'NASA Live: Official Stream of NASA TV',
    channelTitle: 'NASA',
    channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ',
    thumbnail: 'https://i.ytimg.com/vi/21X5lGlDOfg/hqdefault.jpg',
    publishedAt: 'Ao Vivo',
    duration: 'AO VIVO',
    viewCount: '19K assistindo',
    description:
      'Transmissão oficial contínua da NASA TV diretamente da Estação Espacial Internacional (ISS) e missões orbitais.',
  },
  {
    id: 'aqz-KE-bpKQ',
    title: 'Big Buck Bunny 60fps 4K - Blender Open Movie Official',
    channelTitle: 'Blender Foundation',
    channelId: 'UC2U53B3f8F6fL8W-K1c-hCw',
    thumbnail: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
    publishedAt: 'Benchmark 60fps',
    duration: '10:35',
    viewCount: '22M visualizações',
    description:
      'Filme aberto da Blender Foundation perfeito para testar decodificação de hardware 720p/1080p no MCU2 (Atom) e MCU3 (Ryzen).',
  },
  {
    id: 'eRsGyueVLvQ',
    title: 'Sintel - Third Open Movie by Blender Foundation',
    channelTitle: 'Blender Foundation',
    channelId: 'UC2U53B3f8F6fL8W-K1c-hCw',
    thumbnail: 'https://i.ytimg.com/vi/eRsGyueVLvQ/hqdefault.jpg',
    publishedAt: 'Curta HD',
    duration: '14:48',
    viewCount: '41M visualizações',
    description:
      'Animação cinematográfica em alta definição com áudio espacial estéreo para teste do sistema de som automotivo.',
  },
  {
    id: 'R6MlUcmOul8',
    title: 'Tears of Steel - Blender VFX Open Movie (Sci-Fi 1080p)',
    channelTitle: 'Blender Foundation',
    channelId: 'UC2U53B3f8F6fL8W-K1c-hCw',
    thumbnail: 'https://i.ytimg.com/vi/R6MlUcmOul8/hqdefault.jpg',
    publishedAt: 'Sci-Fi Short',
    duration: '12:14',
    viewCount: '11M visualizações',
    description:
      'Curta-metragem de ficção científica em live-action e CGI para reprodução contínua na tela central de 15" e 17".',
  },
  {
    id: '4xDzrJKXOOY',
    title: 'synthwave radio - chill synth / retrobeats to drive to',
    channelTitle: 'Lofi Girl Synthwave',
    channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
    thumbnail: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
    publishedAt: 'Ao Vivo 24/7',
    duration: 'AO VIVO',
    viewCount: '12K assistindo',
    description:
      'Synthwave instrumental contínuo projetado para condução noturna com alto contraste.',
  },
  {
    id: 'y7e-GC6oGhg',
    title: 'Charge - Blender Open Movie (Cyberpunk Action Short)',
    channelTitle: 'Blender Studio',
    channelId: 'UC2U53B3f8F6fL8W-K1c-hCw',
    thumbnail: 'https://i.ytimg.com/vi/y7e-GC6oGhg/hqdefault.jpg',
    publishedAt: 'Cyberpunk HD',
    duration: '03:54',
    viewCount: '3.1M visualizações',
    description:
      'Curta-metragem de alto contraste em estética futurista ideal para telas OLED/LCD automotivas.',
  },
];

export const DEFAULT_PLAYLISTS: YouTubePlaylist[] = [
  {
    id: 'PL_TESLA_NIGHT_DRIVE',
    title: 'Night Drive & Supercharger Lounge',
    description:
      'Sessões contínuas de Synthwave, Lofi e Ambient selecionadas para recarga no Supercharger e viagens em rodovia.',
    thumbnail: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
    itemCount: 4,
    channelTitle: 'Tesla Play Curadoria',
    items: [
      DEFAULT_FEATURED_VIDEOS[6],
      DEFAULT_FEATURED_VIDEOS[0],
      DEFAULT_FEATURED_VIDEOS[2],
      DEFAULT_FEATURED_VIDEOS[1],
    ],
  },
  {
    id: 'PL_CINEMA_BENCHMARK',
    title: 'Cinema Open Movies (Fila Contínua HD)',
    description:
      'Curtas de cinema digital com reprodução sequencial automática sem bloqueio de incorporação X-Frame-Options.',
    thumbnail: 'https://i.ytimg.com/vi/eRsGyueVLvQ/hqdefault.jpg',
    itemCount: 4,
    channelTitle: 'Blender Cinema HD',
    items: [
      DEFAULT_FEATURED_VIDEOS[4],
      DEFAULT_FEATURED_VIDEOS[5],
      DEFAULT_FEATURED_VIDEOS[3],
      DEFAULT_FEATURED_VIDEOS[7],
    ],
  },
  {
    id: 'PL_SPACE_TECH',
    title: 'Engenharia, Espaço & Autonomia',
    description:
      'Transmissões espaciais da NASA e eventos de engenharia automotiva.',
    thumbnail: 'https://i.ytimg.com/vi/21X5lGlDOfg/hqdefault.jpg',
    itemCount: 3,
    channelTitle: 'Space & EV Tech',
    items: [
      DEFAULT_FEATURED_VIDEOS[2],
      DEFAULT_FEATURED_VIDEOS[1],
      DEFAULT_FEATURED_VIDEOS[5],
    ],
  },
];

export const DEFAULT_LIKED_VIDEOS: YouTubeVideo[] = [
  DEFAULT_FEATURED_VIDEOS[6],
  DEFAULT_FEATURED_VIDEOS[1],
  DEFAULT_FEATURED_VIDEOS[4],
  DEFAULT_FEATURED_VIDEOS[0],
];

export const DEFAULT_SUBSCRIPTIONS: YouTubeSubscription[] = [
  {
    id: 'sub-tesla',
    channelId: 'UC5WjFrtBdufl6CZojX3D8dQ',
    title: 'Tesla',
    description: 'Canal oficial da Tesla — Veículos elétricos, FSD, Energia e Robótica.',
    thumbnail: 'https://i.ytimg.com/vi/CyUg9bC1M1E/hqdefault.jpg',
  },
  {
    id: 'sub-lofigirl',
    channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
    title: 'Lofi Girl',
    description: 'Rádios 24/7 Lofi Hip Hop e Synthwave para dirigir e relaxar.',
    thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
  },
  {
    id: 'sub-nasa',
    channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ',
    title: 'NASA',
    description: 'Transmissões ao vivo da ISS, lançamentos orbitais e astronomia.',
    thumbnail: 'https://i.ytimg.com/vi/21X5lGlDOfg/hqdefault.jpg',
  },
  {
    id: 'sub-blender',
    channelId: 'UC2U53B3f8F6fL8W-K1c-hCw',
    title: 'Blender Studio',
    description: 'Filmes abertos em 60fps para testes de vídeo e áudio automotivo.',
    thumbnail: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
  },
];

export const RESERVED_MODULES: Record<
  Exclude<ReservedModuleSpec['id'], never>,
  ReservedModuleSpec
> = {
  iptv: {
    id: 'iptv',
    title: 'Streaming & IPTV Automotivo',
    subtitle: 'Reprodutor nativo HLS (.m3u8) e guia EPG de alto contraste',
    badge: 'EM BREVE · FASE 2',
    description:
      'Módulo dedicado à reprodução de listas M3U/M3U8 e streams HLS adaptativos com buffer otimizado para conexões móveis LTE/5G do veículo.',
    plannedFeatures: [
      'Parser de listas M3U/M3U8 e Xtream Codes API no cliente com cache IndexedDB',
      'Player HTML5 MSE (hls.js) com fallback automático para 720p em conexões móveis instáveis',
      'Grade de canais por categoria (Notícias, Esportes, Documentários, Infantil) com botões de 56px',
      'Picture-in-Picture interno e retomada instantânea após reconexão de túnel/garagem',
    ],
    protocols: ['HLS (.m3u8)', 'DASH (.mpd)', 'Xtream Codes JSON', 'EPG XMLTV'],
    etaPhase: 'Fase 2 do Roadmap',
    hardwareRequirement: 'Compatível com MCU2 (Intel Atom) e MCU3 (AMD Ryzen)',
  },
  plex: {
    id: 'plex',
    title: 'Servidor Plex & Jellyfin Direct',
    subtitle: 'Acesso direto à biblioteca pessoal de filmes, séries e FLAC',
    badge: 'EM BREVE · FASE 2',
    description:
      'Integração cliente via token X-Plex-Token para navegar nas bibliotecas domésticas com transcodificação ajustada ao processador do carro.',
    plannedFeatures: [
      'Autenticação via PIN (plex.tv/link) sem digitação longa no teclado virtual da Tesla',
      'Perfil de transcodificação H.264 Level 4.0 AAC 2.0 para evitar travamentos no MCU2',
      'Sincronização de "Continuar Assistindo" (On Deck) entre casa e veículo',
      'Suporte híbrido para servidores Plex Media Server, Jellyfin e Emby via HTTPS',
    ],
    protocols: ['Plex Direct Play / HLS Transcode', 'X-Plex-Token Auth', 'Jellyfin REST API'],
    etaPhase: 'Fase 2 do Roadmap',
    hardwareRequirement: 'Recomendado HTTPS via Cloudflare Tunnel ou Tailscale Funnel',
  },
  games: {
    id: 'games',
    title: 'Jogos Web & Cloud Arcade',
    subtitle: 'Catálogo HTML5 Canvas/WebGL e suporte a controles Bluetooth/USB',
    badge: 'EM BREVE · FASE 3',
    description:
      'Portal de jogos leves otimizados para tela touch de 15"/17" e Gamepad API para passageiros ou pausas em Superchargers.',
    plannedFeatures: [
      'Detecção automática de controles via W3C Gamepad API (DualSense, Xbox, 8BitDo)',
      'Modo Eco-FPS (trava em 30/60 FPS) para preservar memória RAM do navegador Chromium',
      'Jogos casuais touch-first de resposta imediata sem recarregamento de página',
      'Atalhos para portais Cloud Gaming compatíveis com WebRTC',
    ],
    protocols: ['HTML5 Canvas / WebGL 2', 'W3C Gamepad API', 'Full-Viewport CSS Lock'],
    etaPhase: 'Fase 3 do Roadmap',
    hardwareRequirement: 'Otimizado para GPU integrada AMD RDNA2 (MCU3) e Intel Gordon Peak (MCU2)',
  },
  radio: {
    id: 'radio',
    title: 'Rádios Globais & Podcasts',
    subtitle: 'Streaming de áudio de baixo consumo com foco na condução',
    badge: 'EM BREVE · FASE 3',
    description:
      'Sintonizador global de estações FM/Web via Radio Browser API com modo de segurança veicular e equalizador visual minimalista.',
    plannedFeatures: [
      'Diretório com mais de 30.000 estações mundiais via API aberta (AAC / MP3 Icecast)',
      'Favoritos rápidos com botões gigantes (64x64px) para troca com 1 toque sem desviar o olhar',
      'Reconexão automática de buffer de áudio ao alternar entre Wi-Fi e LTE do veículo',
      'Consumo próximo de zero na GPU ao operar sem decodificação de vídeo',
    ],
    protocols: ['Icecast / Shoutcast Stream', 'HLS Audio-Only', 'MediaSession API'],
    etaPhase: 'Fase 3 do Roadmap',
    hardwareRequirement: 'Ultra-leve — Consumo < 3% CPU em MCU2 e MCU3',
  },
};
