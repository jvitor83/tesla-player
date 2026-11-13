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
  Heart,
  ExternalLink,
  Repeat,
  RefreshCw,
} from 'lucide-react';
import type {
  YouTubeVideo,
  HardwareProfile,
  ResolutionQuality,
} from '../types/tesla';
import {
  installDriveVideoGuard,
  activateWebAudioKeepAlive,
} from '../utils/driveVideoGuard';

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string | HTMLElement,
        options: {
          host?: string;
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
  const compositorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const userPausedRef = useRef<boolean>(false);
  const lastKnownTimeRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [autoContinuousPlay, setAutoContinuousPlay] = useState<boolean>(true);
  const [showQueueDrawer, setShowQueueDrawer] = useState<boolean>(false);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [apiReady, setApiReady] = useState<boolean>(Boolean(window.YT?.Player));

  const onNextVideoRef = useRef(onNextVideo);
  const autoContinuousPlayRef = useRef(autoContinuousPlay);
  const resolutionRef = useRef(resolution);

  useEffect(() => {
    onNextVideoRef.current = onNextVideo;
    autoContinuousPlayRef.current = autoContinuousPlay;
    resolutionRef.current = resolution;
  }, [onNextVideo, autoContinuousPlay, resolution]);

  // Force video decoder resync at current timestamp (wakes up frozen video frames in Drive)
  const forceVideoDecoderResync = useCallback((microNudgeOnly = false) => {
    const player = playerInstanceRef.current;
    if (!player || userPausedRef.current) return;
    try {
      const currentSec = player.getCurrentTime() || lastKnownTimeRef.current || 0;
      if (microNudgeOnly) {
        player.playVideo();
        if (currentSec > 0) {
          player.seekTo(currentSec + 0.04, true);
        }
      } else {
        player.loadVideoById({
          videoId: currentVideo.id,
          startSeconds: Math.max(0, currentSec),
          suggestedQuality: resolutionRef.current,
        });
        player.playVideo();
      }
      setIsPlaying(true);
    } catch {
      // ignore if player not ready
    }
  }, [currentVideo.id]);

  // Install OS/Browser Drive Video Guard & Network Handover Listener (Wi-Fi -> LTE when leaving garage)
  useEffect(() => {
    installDriveVideoGuard(() => {
      if (!userPausedRef.current) {
        forceVideoDecoderResync(true);
      }
    });

    const handleFirstInteraction = () => {
      activateWebAudioKeepAlive();
    };
    window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });

    const handleNetworkOnline = () => {
      if (!userPausedRef.current) {
        forceVideoDecoderResync(false);
      }
    };
    window.addEventListener('online', handleNetworkOnline);

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('online', handleNetworkOnline);
    };
  }, [forceVideoDecoderResync]);

  // Continuous Canvas Compositor Heartbeat:
  // Forces Chromium / QtWebEngine to invalidate and composite the video stage
  // as a software/WebGL RGBA texture on every frame instead of promoting to a
  // hardware video overlay plane (which Tesla's display driver freezes in Drive).
  useEffect(() => {
    let rafId = 0;
    let tick = 0;
    const canvas = compositorCanvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;

    const renderHeartbeat = () => {
      tick = (tick + 1) % 60;
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Draw a 1x1 nearly transparent pixel to keep Chromium's LayerTreeHost damage rect active
        ctx.fillStyle =
          tick % 2 === 0
            ? 'rgba(255, 255, 255, 0.004)'
            : 'rgba(232, 33, 39, 0.004)';
        ctx.fillRect(tick % 8, 0, 2, 2);
      }
      rafId = window.requestAnimationFrame(renderHeartbeat);
    };

    rafId = window.requestAnimationFrame(renderHeartbeat);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  // Active 450ms Watchdog for Drive Mode Pause / Frame Stall Recovery
  useEffect(() => {
    const interval = window.setInterval(() => {
      const player = playerInstanceRef.current;
      if (!player) return;
      try {
        const currentSec = player.getCurrentTime();
        if (typeof currentSec === 'number' && currentSec > 0) {
          lastKnownTimeRef.current = currentSec;
        }
        const state = player.getPlayerState();
        // If user did NOT pause, but Tesla OS / Chromium paused the player (state === 2 or 5)
        if (!userPausedRef.current && (state === 2 || state === 5)) {
          player.playVideo();
          if (currentSec > 0) {
            player.seekTo(currentSec + 0.03, true);
          }
          setIsPlaying(true);
        }
      } catch {
        // ignore
      }
    }, 450);

    return () => window.clearInterval(interval);
  }, []);

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

    userPausedRef.current = false;
    lastKnownTimeRef.current = 0;

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
      host: 'https://www.youtube-nocookie.com',
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
            if (!userPausedRef.current) {
              // External pause triggered by Drive transition: auto-resume immediately
              try {
                const t = event.target.getCurrentTime() || 0;
                event.target.playVideo();
                if (t > 0) {
                  event.target.seekTo(t + 0.03, true);
                }
                setIsPlaying(true);
              } catch {
                setIsPlaying(false);
              }
            } else {
              setIsPlaying(false);
            }
          } else if (event.data === 0 && autoContinuousPlayRef.current) {
            userPausedRef.current = false;
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
    activateWebAudioKeepAlive();
    const player = playerInstanceRef.current;
    if (!player) return;
    try {
      const state = player.getPlayerState();
      if (state === 1) {
        userPausedRef.current = true;
        (window as unknown as { __teslaAllowMediaPause?: boolean }).__teslaAllowMediaPause = true;
        player.pauseVideo();
        (window as unknown as { __teslaAllowMediaPause?: boolean }).__teslaAllowMediaPause = false;
        setIsPlaying(false);
      } else {
        userPausedRef.current = false;
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
      userPausedRef.current = false;
      player.seekTo(target, true);
      player.playVideo();
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
      aria-label="Reprodutor Integrado YouTube"
    >
      {/* Top Status & Viewport Bar */}
      <div className="player-deck__topbar">
        <div className="player-deck__meta-badge-group">
          <button
            id="btn-toggle-mcu-profile"
            type="button"
            className="touch-pill-btn"
            onClick={onToggleHardwareProfile}
            title="Alternar resolução entre 720p (MCU2 Atom) e 1080p (MCU3 Ryzen)"
          >
            <Cpu size={14} />
            <span>{hardwareProfile === 'MCU2_ATOM' ? '720p' : '1080p'}</span>
          </button>

          <button
            id="btn-resync-video-stream"
            type="button"
            className="touch-pill-btn touch-pill-btn--active"
            onClick={() => {
              userPausedRef.current = false;
              forceVideoDecoderResync(false);
            }}
            title="Destravar e sincronizar quadro de vídeo no segundo atual"
          >
            <RefreshCw size={14} />
            <span>Destravar</span>
          </button>
        </div>

        <div className="player-deck__top-actions">
          <button
            id="btn-maximize-css-viewport"
            type="button"
            className={`touch-pill-btn touch-pill-btn--primary ${
              isViewportMaximized ? 'touch-pill-btn--danger' : ''
            }`}
            onClick={onToggleViewportMaximize}
            title="Maximiza via CSS ocupando 100% da janela útil do navegador"
          >
            {isViewportMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span>{isViewportMaximized ? 'Reduzir' : 'Maximizar'}</span>
          </button>
        </div>
      </div>

      {/* Main Video Frame Container with Anti-Hardware-Overlay Compositor Force */}
      <div className="player-deck__stage player-deck__stage--drive-compositor">
        <div
          ref={playerContainerRef}
          className="player-deck__iframe-host"
          id="yt-iframe-mount"
        />

        {/* Fallback iframe if YT script hasn't initialized yet */}
        {!apiReady && (
          <iframe
            className="player-deck__fallback-iframe"
            src={`https://www.youtube-nocookie.com/embed/${currentVideo.id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&vq=${resolution}`}
            title={currentVideo.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}

        {/* Transparent Canvas Heartbeat to prevent Chromium Hardware Video Overlay freeze in Drive */}
        <canvas
          ref={compositorCanvasRef}
          width={16}
          height={16}
          className="player-deck__compositor-canvas"
          aria-hidden="true"
        />
      </div>

      {/* Compact Touch Controls Bar */}
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
                {currentQueueIndex + 1}/{queue.length}
              </span>
            )}
            {wakeLockActive && (
              <span className="player-deck__wakelock-tag">WakeLock</span>
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
            <SkipBack size={16} />
          </button>

          <button
            id="btn-player-rewind-15"
            type="button"
            className="transport-btn"
            onClick={() => handleSeekOffset(-15)}
            aria-label="Retroceder 15 segundos"
            title="-15 segundos"
          >
            <RotateCcw size={15} />
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
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <button
            id="btn-player-forward-15"
            type="button"
            className="transport-btn"
            onClick={() => handleSeekOffset(15)}
            aria-label="Avançar 15 segundos"
            title="+15 segundos"
          >
            <RotateCw size={15} />
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
            <SkipForward size={16} />
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
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          <button
            id="btn-player-Like"
            type="button"
            className={`transport-btn ${isLiked ? 'transport-btn--liked' : ''}`}
            onClick={() => onToggleLike(currentVideo)}
            aria-label="Salvar nos vídeos com Gostei"
            title="Marcar com Gostei na Biblioteca"
          >
            <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
          </button>

          <button
            id="btn-player-autoplay-queue"
            type="button"
            className={`transport-btn ${autoContinuousPlay ? 'transport-btn--active' : ''}`}
            onClick={() => setAutoContinuousPlay((v) => !v)}
            aria-label="Alternar reprodução contínua da playlist"
            title={
              autoContinuousPlay
                ? 'Reprodução Contínua: Ligada'
                : 'Reprodução Contínua: Desligada'
            }
          >
            <Repeat size={16} />
          </button>

          <button
            id="btn-player-toggle-queue"
            type="button"
            className={`transport-btn ${showQueueDrawer ? 'transport-btn--active' : ''}`}
            onClick={() => setShowQueueDrawer((v) => !v)}
            aria-label="Exibir fila de reprodução"
            title="Fila da Playlist"
          >
            <ListMusic size={16} />
            <span className="transport-btn__badge">{queue.length}</span>
          </button>

          <a
            id="link-open-embed-tab"
            href={`https://www.youtube-nocookie.com/embed/${currentVideo.id}?autoplay=1`}
            target="_blank"
            rel="noreferrer"
            className="transport-btn"
            title="Abrir stream /embed direto em nova aba"
          >
            <ExternalLink size={15} />
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
