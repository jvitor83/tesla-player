import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Cpu,
  ListMusic,
  ShieldAlert,
  EyeOff,
  Eye,
  Heart,
  ExternalLink,
  CheckCircle2,
  Repeat,
} from 'lucide-react';
import type {
  YouTubeVideo,
  HardwareProfile,
  ResolutionQuality,
  DrivingState,
} from '../types/tesla';

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string | HTMLElement,
        options: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
            onError?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerInstance {
  loadVideoById: (
    videoIdOrOptions:
      | string
      | { videoId: string; startSeconds?: number; suggestedQuality?: string }
  ) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (volume: number) => void;
  setPlaybackQuality: (suggestedQuality: string) => void;
  getPlayerState: () => number;
  destroy: () => void;
}

interface YouTubePlayerDeckProps {
  currentVideo: YouTubeVideo;
  queue: YouTubeVideo[];
  currentQueueIndex: number;
  activePlaylistTitle?: string;
  hardwareProfile: HardwareProfile;
  resolution: ResolutionQuality;
  drivingState: DrivingState;
  isViewportMaximized: boolean;
  isLiked: boolean;
  onToggleViewportMaximize: () => void;
  onSelectQueueVideo: (video: YouTubeVideo, index: number) => void;
  onNextVideo: () => void;
  onPrevVideo: () => void;
  onToggleHardwareProfile: () => void;
  onToggleLike: (video: YouTubeVideo) => void;
}

export const YouTubePlayerDeck: React.FC<YouTubePlayerDeckProps> = ({
  currentVideo,
  queue,
  currentQueueIndex,
  activePlaylistTitle,
  hardwareProfile,
  resolution,
  drivingState,
  isViewportMaximized,
  isLiked,
  onToggleViewportMaximize,
  onSelectQueueVideo,
  onNextVideo,
  onPrevVideo,
  onToggleHardwareProfile,
  onToggleLike,
}) => {
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const playerInstanceRef = useRef<YTPlayerInstance | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [autoContinuousPlay, setAutoContinuousPlay] = useState<boolean>(true);
  const [passengerFocusShield, setPassengerFocusShield] = useState<boolean>(false);
  const [showQueueDrawer, setShowQueueDrawer] = useState<boolean>(false);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [keepAliveGuard, setKeepAliveGuard] = useState<boolean>(true);
  const [apiReady, setApiReady] = useState<boolean>(Boolean(window.YT?.Player));

  const onNextVideoRef = useRef(onNextVideo);
  const autoContinuousPlayRef = useRef(autoContinuousPlay);

  useEffect(() => {
    onNextVideoRef.current = onNextVideo;
    autoContinuousPlayRef.current = autoContinuousPlay;
  }, [onNextVideo, autoContinuousPlay]);

  // Request Screen Wake Lock for continuous playback in Tesla browser
  useEffect(() => {
    let wakeLockObj: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockObj = await navigator.wakeLock.request('screen');
          setWakeLockActive(true);
          wakeLockObj.addEventListener('release', () => {
            setWakeLockActive(false);
          });
        }
      } catch {
        setWakeLockActive(false);
      }
    };
    requestWakeLock();
    return () => {
      if (wakeLockObj) {
        wakeLockObj.release().catch(() => undefined);
      }
    };
  }, []);

  // Load YouTube IFrame Player API script once
  useEffect(() => {
    if (window.YT?.Player) {
      return;
    }

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.body.appendChild(tag);
    }

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevCallback) prevCallback();
      setApiReady(true);
    };
  }, []);

  // Initialize YT.Player instance
  useEffect(() => {
    if (!apiReady || !playerContainerRef.current || !window.YT?.Player) {
      return;
    }

    if (playerInstanceRef.current) {
      try {
        playerInstanceRef.current.loadVideoById({
          videoId: currentVideo.id,
          suggestedQuality: resolution,
        });
        playerInstanceRef.current.setPlaybackQuality(resolution);
        return;
      } catch {
        // Recreate if instance became stale
      }
    }

    const mountNode = document.createElement('div');
    playerContainerRef.current.innerHTML = '';
    playerContainerRef.current.appendChild(mountNode);

    const player = new window.YT.Player(mountNode, {
      videoId: currentVideo.id,
      playerVars: {
        autoplay: 1,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1,
        iv_load_policy: 3,
        vq: resolution,
        origin: window.location.origin,
      },
      events: {
        onReady: (event) => {
          try {
            event.target.setPlaybackQuality(resolution);
            event.target.playVideo();
            setIsPlaying(true);
          } catch {
            // Ignore autoplay restriction before first touch
          }
        },
        onStateChange: (event) => {
          // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
          if (event.data === 1) {
            setIsPlaying(true);
            try {
              event.target.setPlaybackQuality(resolution);
            } catch {
              // ignore
            }
          } else if (event.data === 2) {
            setIsPlaying(false);
          } else if (event.data === 0 && autoContinuousPlayRef.current) {
            onNextVideoRef.current();
          }
        },
      },
    });

    playerInstanceRef.current = player;
  }, [apiReady, currentVideo.id, resolution]);

  // Apply resolution quality change dynamically when MCU profile switches
  useEffect(() => {
    if (playerInstanceRef.current) {
      try {
        playerInstanceRef.current.setPlaybackQuality(resolution);
      } catch {
        // ignore if player not ready yet
      }
    }
  }, [resolution]);

  const handleTogglePlay = useCallback(() => {
    const player = playerInstanceRef.current;
    if (!player) return;
    try {
      const state = player.getPlayerState();
      if (state === 1) {
        player.pauseVideo();
        setIsPlaying(false);
      } else {
        player.playVideo();
        setIsPlaying(true);
      }
    } catch {
      setIsPlaying((prev) => !prev);
    }
  }, []);

  const handleSeekOffset = useCallback((deltaSeconds: number) => {
    const player = playerInstanceRef.current;
    if (!player) return;
    try {
      const current = player.getCurrentTime() || 0;
      const target = Math.max(0, current + deltaSeconds);
      player.seekTo(target, true);
    } catch {
      // ignore
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    const player = playerInstanceRef.current;
    if (!player) return;
    try {
      if (player.isMuted()) {
        player.unMute();
        setIsMuted(false);
      } else {
        player.mute();
        setIsMuted(true);
      }
    } catch {
      setIsMuted((prev) => !prev);
    }
  }, []);

  return (
    <section
      id="tesla-youtube-player-deck"
      className={`player-deck ${isViewportMaximized ? 'player-deck--maximized' : ''}`}
      aria-label="Reprodutor Integrado YouTube IFrame API"
    >
      {/* Top Status & Viewport Bar inside Maximized Mode or Standard Header */}
      <div className="player-deck__topbar">
        <div className="player-deck__meta-badge-group">
          <span className="status-chip status-chip--live">
            <span className="status-chip__dot" />
            IFrame API /embed/{currentVideo.id}
          </span>

          <button
            id="btn-toggle-mcu-profile"
            type="button"
            className="touch-pill-btn"
            onClick={onToggleHardwareProfile}
            title="Alternar otimização de decodificação de hardware entre MCU2 (Intel Atom 720p) e MCU3 (AMD Ryzen 1080p)"
          >
            <Cpu size={18} />
            <span>
              {hardwareProfile === 'MCU2_ATOM'
                ? 'MCU2 Atom · 720p Leve'
                : 'MCU3 Ryzen · 1080p HD'}
            </span>
          </button>

          <button
            id="btn-toggle-keepalive"
            type="button"
            className={`touch-pill-btn ${keepAliveGuard ? 'touch-pill-btn--active' : ''}`}
            onClick={() => setKeepAliveGuard((v) => !v)}
            title="Proteção de áudio e retomada em caso de pausa do firmware ao engatar Drive"
          >
            <CheckCircle2 size={17} />
            <span>
              {keepAliveGuard ? 'Drive Audio Guard: Ativo' : 'Drive Audio Guard: Off'}
            </span>
          </button>
        </div>

        <div className="player-deck__top-actions">
          <button
            id="btn-passenger-focus-mode"
            type="button"
            className={`touch-pill-btn ${passengerFocusShield ? 'touch-pill-btn--warning' : ''}`}
            onClick={() => setPassengerFocusShield((v) => !v)}
            title="Oculta o quadro de vídeo mantendo o áudio ativo para evitar distração visual do motorista"
          >
            {passengerFocusShield ? <Eye size={18} /> : <EyeOff size={18} />}
            <span>{passengerFocusShield ? 'Mostrar Vídeo' : 'Modo Só Áudio'}</span>
          </button>

          <button
            id="btn-maximize-css-viewport"
            type="button"
            className={`touch-pill-btn touch-pill-btn--primary ${
              isViewportMaximized ? 'touch-pill-btn--danger' : ''
            }`}
            onClick={onToggleViewportMaximize}
            title="Maximiza via CSS ocupando 100% da janela útil do navegador sem acionar o modo Tesla Theater nativo"
          >
            {isViewportMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            <span>
              {isViewportMaximized
                ? 'Reduzir Viewport (Esc)'
                : 'Maximizar Viewport 100% (CSS)'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Video Frame Container */}
      <div className="player-deck__stage">
        <div
          ref={playerContainerRef}
          className="player-deck__iframe-host"
          id="yt-iframe-mount"
        />

        {/* Fallback iframe if YT script hasn't initialized yet */}
        {!apiReady && (
          <iframe
            className="player-deck__fallback-iframe"
            src={`https://www.youtube.com/embed/${currentVideo.id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&vq=${resolution}`}
            title={currentVideo.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}

        {/* Passenger / Driver Focus Audio-Only Shield */}
        {passengerFocusShield && (
          <div className="player-deck__audio-shield">
            <div className="player-deck__audio-shield-card">
              <ShieldAlert size={36} className="text-accent-red" />
              <h3>Modo Foco na Condução (Áudio Ativo)</h3>
              <p>
                A imagem foi escurecida para segurança do motorista em movimento (modo{' '}
                <strong>{drivingState}</strong>). O stream de áudio permanece ativo em
                segundo plano.
              </p>
              <div className="player-deck__audio-nowplaying">
                <span>Reproduzindo agora:</span>
                <strong>{currentVideo.title}</strong>
                <small>{currentVideo.channelTitle}</small>
              </div>
              <button
                id="btn-restore-video-passenger"
                type="button"
                className="tesla-btn tesla-btn--primary"
                onClick={() => setPassengerFocusShield(false)}
              >
                <Eye size={20} />
                <span>Sou Passageiro — Exibir Vídeo</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Large Touch Controls Bar (Minimum 48x48px targets for 15"/17" touchscreen) */}
      <div className="player-deck__controls-bar">
        <div className="player-deck__now-playing-info">
          <div className="player-deck__title-row">
            <h2 className="player-deck__video-title" title={currentVideo.title}>
              {currentVideo.title}
            </h2>
          </div>
          <div className="player-deck__subtitle-row">
            <span className="player-deck__channel">{currentVideo.channelTitle}</span>
            {activePlaylistTitle && (
              <span className="player-deck__playlist-badge">
                Fila: {activePlaylistTitle} ({currentQueueIndex + 1}/{queue.length})
              </span>
            )}
            {wakeLockActive && (
              <span className="player-deck__wakelock-tag">WakeLock Ativo</span>
            )}
          </div>
        </div>

        <div className="player-deck__transport-buttons">
          <button
            id="btn-player-prev"
            type="button"
            className="transport-btn"
            onClick={onPrevVideo}
            aria-label="Vídeo anterior da playlist"
            title="Vídeo Anterior"
          >
            <SkipBack size={22} />
          </button>

          <button
            id="btn-player-rewind-15"
            type="button"
            className="transport-btn"
            onClick={() => handleSeekOffset(-15)}
            aria-label="Retroceder 15 segundos"
            title="-15 segundos"
          >
            <RotateCcw size={20} />
            <span className="transport-btn__sub">-15s</span>
          </button>

          <button
            id="btn-player-play-pause"
            type="button"
            className="transport-btn transport-btn--primary"
            onClick={handleTogglePlay}
            aria-label={isPlaying ? 'Pausar vídeo' : 'Reproduzir vídeo'}
            title={isPlaying ? 'Pausar' : 'Reproduzir'}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>

          <button
            id="btn-player-forward-15"
            type="button"
            className="transport-btn"
            onClick={() => handleSeekOffset(15)}
            aria-label="Avançar 15 segundos"
            title="+15 segundos"
          >
            <RotateCw size={20} />
            <span className="transport-btn__sub">+15s</span>
          </button>

          <button
            id="btn-player-next"
            type="button"
            className="transport-btn"
            onClick={onNextVideo}
            aria-label="Próximo vídeo da playlist"
            title="Próximo Vídeo"
          >
            <SkipForward size={22} />
          </button>
        </div>

        <div className="player-deck__utility-buttons">
          <button
            id="btn-player-mute"
            type="button"
            className={`transport-btn ${isMuted ? 'transport-btn--alert' : ''}`}
            onClick={handleToggleMute}
            aria-label={isMuted ? 'Ativar som' : 'Silenciar'}
            title={isMuted ? 'Ativar Som' : 'Silenciar'}
          >
            {isMuted ? <VolumeX size={21} /> : <Volume2 size={21} />}
          </button>

          <button
            id="btn-player-Like"
            type="button"
            className={`transport-btn ${isLiked ? 'transport-btn--liked' : ''}`}
            onClick={() => onToggleLike(currentVideo)}
            aria-label="Salvar nos vídeos com Gostei"
            title="Marcar com Gostei na Biblioteca"
          >
            <Heart size={20} fill={isLiked ? 'currentColor' : 'none'} />
          </button>

          <button
            id="btn-player-autoplay-queue"
            type="button"
            className={`transport-btn ${autoContinuousPlay ? 'transport-btn--active' : ''}`}
            onClick={() => setAutoContinuousPlay((v) => !v)}
            aria-label="Alternar reprodução contínua da playlist"
            title={
              autoContinuousPlay
                ? 'Reprodução Contínua de Playlist: Ligada'
                : 'Reprodução Contínua de Playlist: Desligada'
            }
          >
            <Repeat size={20} />
          </button>

          <button
            id="btn-player-toggle-queue"
            type="button"
            className={`transport-btn ${showQueueDrawer ? 'transport-btn--active' : ''}`}
            onClick={() => setShowQueueDrawer((v) => !v)}
            aria-label="Exibir fila de reprodução"
            title="Fila da Playlist"
          >
            <ListMusic size={21} />
            <span className="transport-btn__badge">{queue.length}</span>
          </button>

          <a
            id="link-open-embed-tab"
            href={`https://www.youtube.com/embed/${currentVideo.id}?autoplay=1`}
            target="_blank"
            rel="noreferrer"
            className="transport-btn"
            title="Abrir stream /embed direto em nova aba se necessário"
          >
            <ExternalLink size={19} />
          </a>
        </div>
      </div>

      {/* Expandable Continuous Playlist Queue Drawer */}
      {showQueueDrawer && (
        <div className="player-deck__queue-drawer">
          <div className="player-deck__queue-header">
            <div>
              <strong>
                Fila de Reprodução Contínua:{' '}
                {activePlaylistTitle || 'Seleção Atual'}
              </strong>
              <span>
                Avanço automático ativado via evento YT.PlayerState.ENDED
              </span>
            </div>
            <button
              id="btn-close-queue-drawer"
              type="button"
              className="touch-pill-btn"
              onClick={() => setShowQueueDrawer(false)}
            >
              Fechar Fila
            </button>
          </div>
          <div className="player-deck__queue-list">
            {queue.map((item, idx) => {
              const active = item.id === currentVideo.id;
              return (
                <button
                  key={`${item.id}-${idx}`}
                  id={`btn-queue-item-${idx}`}
                  type="button"
                  className={`queue-item-card ${active ? 'queue-item-card--active' : ''}`}
                  onClick={() => onSelectQueueVideo(item, idx)}
                >
                  <span className="queue-item-card__index">{idx + 1}</span>
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    loading="lazy"
                    className="queue-item-card__thumb"
                  />
                  <div className="queue-item-card__info">
                    <strong>{item.title}</strong>
                    <small>{item.channelTitle}</small>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
