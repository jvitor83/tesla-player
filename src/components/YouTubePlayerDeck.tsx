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
  Layers,
  Globe,
  MonitorPlay,
  Cloud,
} from 'lucide-react';
import type {
  YouTubeVideo,
  HardwareProfile,
  ResolutionQuality,
  PlaybackMode,
} from '../types/tesla';
import {
  installDriveVideoGuard,
  activateWebAudioKeepAlive,
} from '../utils/driveVideoGuard';
import {
  LocalModeCanvasPlayer,
  type CanvasPlayerHandle,
} from './LocalModeCanvasPlayer';
import { ExternalModeCanvasPlayer } from './ExternalModeCanvasPlayer';
import {
  getSavedCloudflareWorkerUrl,
  setSavedCloudflareWorkerUrl,
} from '../services/corsStreamResolver';

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
            onStateChange?: (event: {
              data: number;
              target: YTPlayerInstance;
            }) => void;
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

const PLAYBACK_MODE_STORAGE_KEY = 'tesla_play_playback_mode_v1';

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
  const canvasPlayerRef = useRef<CanvasPlayerHandle | null>(null);
  const compositorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const userPausedRef = useRef<boolean>(false);
  const lastKnownTimeRef = useRef<number>(0);

  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(() => {
    const saved = localStorage.getItem(PLAYBACK_MODE_STORAGE_KEY);
    if (
      saved === 'backendless' ||
      saved === 'local' ||
      saved === 'external' ||
      saved === 'iframe'
    ) {
      return saved === 'local' ? 'backendless' : saved;
    }
    return 'backendless';
  });

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [autoContinuousPlay, setAutoContinuousPlay] = useState<boolean>(true);
  const [showQueueDrawer, setShowQueueDrawer] = useState<boolean>(false);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [apiReady, setApiReady] = useState<boolean>(Boolean(window.YT?.Player));
  const [showCfModal, setShowCfModal] = useState<boolean>(false);
  const [cfWorkerUrlInput, setCfWorkerUrlInput] = useState<string>(() =>
    getSavedCloudflareWorkerUrl()
  );
  const [cfWorkerActive, setCfWorkerActive] = useState<boolean>(() =>
    Boolean(getSavedCloudflareWorkerUrl())
  );

  const onNextVideoRef = useRef(onNextVideo);
  const autoContinuousPlayRef = useRef(autoContinuousPlay);
  const resolutionRef = useRef(resolution);
  const playbackModeRef = useRef(playbackMode);

  useEffect(() => {
    onNextVideoRef.current = onNextVideo;
    autoContinuousPlayRef.current = autoContinuousPlay;
    resolutionRef.current = resolution;
    playbackModeRef.current = playbackMode;
  }, [onNextVideo, autoContinuousPlay, resolution, playbackMode]);

  const handleSelectPlaybackMode = useCallback((mode: PlaybackMode) => {
    // If leaving iframe mode, destroy YT instance cleanly
    if (mode !== 'iframe' && playerInstanceRef.current) {
      try {
        playerInstanceRef.current.destroy();
      } catch {
        // ignore
      }
      playerInstanceRef.current = null;
    }
    setPlaybackMode(mode);
    localStorage.setItem(PLAYBACK_MODE_STORAGE_KEY, mode);
    userPausedRef.current = false;
    setIsPlaying(true);
  }, []);

  // Force video decoder resync at current timestamp
  const forceVideoDecoderResync = useCallback(
    (microNudgeOnly = false) => {
      if (playbackModeRef.current !== 'iframe') {
        if (!microNudgeOnly) {
          canvasPlayerRef.current?.resync();
          setIsPlaying(true);
        }
        return;
      }

      const player = playerInstanceRef.current;
      if (!player || userPausedRef.current) return;
      try {
        const currentSec =
          player.getCurrentTime() || lastKnownTimeRef.current || 0;
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
    },
    [currentVideo.id]
  );

  // Install OS/Browser Drive Video Guard & Network Handover Listener
  useEffect(() => {
    installDriveVideoGuard(() => {
      if (!userPausedRef.current && playbackModeRef.current === 'iframe') {
        forceVideoDecoderResync(true);
      }
    });

    const handleFirstInteraction = () => {
      activateWebAudioKeepAlive();
    };
    window.addEventListener('pointerdown', handleFirstInteraction, {
      passive: true,
    });

    const handleNetworkOnline = () => {
      if (!userPausedRef.current && playbackModeRef.current === 'iframe') {
        forceVideoDecoderResync(false);
      }
    };
    window.addEventListener('online', handleNetworkOnline);

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('online', handleNetworkOnline);
    };
  }, [forceVideoDecoderResync]);

  // Continuous Canvas Compositor Heartbeat
  useEffect(() => {
    let rafId = 0;
    let tick = 0;
    const canvas = compositorCanvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;

    const renderHeartbeat = () => {
      tick = (tick + 1) % 60;
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
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

  // Active 450ms Watchdog for IFrame Mode
  useEffect(() => {
    if (playbackMode !== 'iframe') return;

    const interval = window.setInterval(() => {
      const player = playerInstanceRef.current;
      if (!player) return;
      try {
        const currentSec = player.getCurrentTime();
        if (typeof currentSec === 'number' && currentSec > 0) {
          lastKnownTimeRef.current = currentSec;
        }
        const state = player.getPlayerState();
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
  }, [playbackMode]);

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

  // Initialize YT.Player instance when in IFrame mode
  useEffect(() => {
    if (
      playbackMode !== 'iframe' ||
      !apiReady ||
      !playerContainerRef.current ||
      !window.YT?.Player
    ) {
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
          if (event.data === 1) {
            setIsPlaying(true);
            try {
              event.target.setPlaybackQuality(resolution);
            } catch {
              // ignore
            }
          } else if (event.data === 2) {
            if (!userPausedRef.current) {
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
  }, [playbackMode, apiReady, currentVideo.id, resolution]);

  // Apply resolution quality change dynamically when MCU profile switches
  useEffect(() => {
    if (playbackMode === 'iframe' && playerInstanceRef.current) {
      try {
        playerInstanceRef.current.setPlaybackQuality(resolution);
      } catch {
        // ignore if player not ready yet
      }
    }
  }, [playbackMode, resolution]);

  const handleTogglePlay = useCallback(() => {
    activateWebAudioKeepAlive();

    if (playbackMode !== 'iframe') {
      canvasPlayerRef.current?.togglePlay();
      return;
    }

    const player = playerInstanceRef.current;
    if (!player) return;
    try {
      const state = player.getPlayerState();
      if (state === 1) {
        userPausedRef.current = true;
        (
          window as unknown as { __teslaAllowMediaPause?: boolean }
        ).__teslaAllowMediaPause = true;
        player.pauseVideo();
        (
          window as unknown as { __teslaAllowMediaPause?: boolean }
        ).__teslaAllowMediaPause = false;
        setIsPlaying(false);
      } else {
        userPausedRef.current = false;
        player.playVideo();
        setIsPlaying(true);
      }
    } catch {
      setIsPlaying((prev) => !prev);
    }
  }, [playbackMode]);

  const handleSeekOffset = useCallback(
    (deltaSeconds: number) => {
      if (playbackMode !== 'iframe') {
        canvasPlayerRef.current?.seekBy(deltaSeconds);
        return;
      }

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
    },
    [playbackMode]
  );

  const handleToggleMute = useCallback(() => {
    if (playbackMode !== 'iframe') {
      canvasPlayerRef.current?.toggleMute();
      return;
    }

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
  }, [playbackMode]);

  return (
    <section
      id="tesla-youtube-player-deck"
      className={`player-deck ${
        isViewportMaximized ? 'player-deck--maximized' : ''
      }`}
      aria-label="Reprodutor Integrado YouTube"
    >
      {/* Top Status, Engine Mode Switcher & Viewport Bar */}
      <div className="player-deck__topbar">
        <div className="player-deck__meta-badge-group">
          <button
            id="btn-mode-backendless"
            type="button"
            className={`touch-pill-btn ${
              playbackMode === 'backendless' || playbackMode === 'local'
                ? 'touch-pill-btn--mode-local'
                : ''
            }`}
            onClick={() => handleSelectPlaybackMode('backendless')}
            title="Backendless mode: mp4box.js + tinyh264 / Broadway WASM renderizando no <canvas> + <audio> (Sem tag <video>)"
          >
            <Layers size={13} />
            <span>Backendless</span>
          </button>

          <button
            id="btn-mode-external"
            type="button"
            className={`touch-pill-btn ${
              playbackMode === 'external' ? 'touch-pill-btn--mode-external' : ''
            }`}
            onClick={() => handleSelectPlaybackMode('external')}
            title="External mode: APIs públicas Piped / Invidious CORS + decodificador WebAssembly ogv.js + <canvas> + <audio>"
          >
            <Globe size={13} />
            <span>External mode</span>
          </button>

          <button
            id="btn-mode-iframe"
            type="button"
            className={`touch-pill-btn ${
              playbackMode === 'iframe' ? 'touch-pill-btn--active' : ''
            }`}
            onClick={() => handleSelectPlaybackMode('iframe')}
            title="Modo IFrame tradicional (/embed/VIDEO_ID)"
          >
            <MonitorPlay size={13} />
            <span>IFrame</span>
          </button>

          <button
            id="btn-toggle-mcu-profile"
            type="button"
            className="touch-pill-btn"
            onClick={onToggleHardwareProfile}
            title="Alternar resolução entre 720p (MCU2 Atom) e 1080p (MCU3 Ryzen)"
          >
            <Cpu size={13} />
            <span>{hardwareProfile === 'MCU2_ATOM' ? '720p' : '1080p'}</span>
          </button>

          <button
            id="btn-resync-video-stream"
            type="button"
            className="touch-pill-btn"
            onClick={() => {
              userPausedRef.current = false;
              forceVideoDecoderResync(false);
            }}
            title="Destravar e sincronizar quadro de vídeo no segundo atual"
          >
            <RefreshCw size={13} />
            <span>Destravar</span>
          </button>
        </div>

        <div className="player-deck__top-actions">
          <button
            id="btn-open-cf-worker-settings"
            type="button"
            className={`touch-pill-btn ${
              cfWorkerActive ? 'touch-pill-btn--mode-local' : ''
            }`}
            onClick={() => setShowCfModal(true)}
            title="Configurar Cloudflare Worker Gateway para desbloquear streaming direto do YouTube"
          >
            <Cloud size={13} />
            <span>{cfWorkerActive ? 'Cloudflare Ativo' : 'Cloudflare Worker'}</span>
          </button>

          <button
            id="btn-maximize-css-viewport"
            type="button"
            className={`touch-pill-btn touch-pill-btn--primary ${
              isViewportMaximized ? 'touch-pill-btn--danger' : ''
            }`}
            onClick={onToggleViewportMaximize}
            title="Maximiza via CSS ocupando 100% da janela útil do navegador"
          >
            {isViewportMaximized ? (
              <Minimize2 size={13} />
            ) : (
              <Maximize2 size={13} />
            )}
            <span>{isViewportMaximized ? 'Reduzir' : 'Maximizar'}</span>
          </button>
        </div>
      </div>

      {/* Main Video Stage: Backendless mode (<canvas> + <audio>) | External mode (<canvas> + <audio>) | IFrame */}
      <div className="player-deck__stage player-deck__stage--drive-compositor">
        {(playbackMode === 'backendless' || playbackMode === 'local') && (
          <LocalModeCanvasPlayer
            ref={canvasPlayerRef}
            videoId={currentVideo.id}
            videoTitle={currentVideo.title}
            isPlaying={isPlaying}
            isMuted={isMuted}
            autoContinuousPlay={autoContinuousPlay}
            onPlayStateChange={(playing) => {
              userPausedRef.current = !playing;
              setIsPlaying(playing);
            }}
            onMuteStateChange={(muted) => setIsMuted(muted)}
            onEnded={onNextVideo}
          />
        )}

        {playbackMode === 'external' && (
          <ExternalModeCanvasPlayer
            ref={canvasPlayerRef}
            videoId={currentVideo.id}
            videoTitle={currentVideo.title}
            isPlaying={isPlaying}
            isMuted={isMuted}
            autoContinuousPlay={autoContinuousPlay}
            onPlayStateChange={(playing) => {
              userPausedRef.current = !playing;
              setIsPlaying(playing);
            }}
            onMuteStateChange={(muted) => setIsMuted(muted)}
            onEnded={onNextVideo}
          />
        )}

        {playbackMode === 'iframe' && (
          <>
            <div
              ref={playerContainerRef}
              className="player-deck__iframe-host"
              id="yt-iframe-mount"
            />

            {!apiReady && (
              <iframe
                className="player-deck__fallback-iframe"
                src={`https://www.youtube-nocookie.com/embed/${currentVideo.id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&vq=${resolution}`}
                title={currentVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </>
        )}

        {/* Transparent Canvas Heartbeat */}
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
            <span className="player-deck__channel">
              {currentVideo.channelTitle}
            </span>
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
            className={`transport-btn ${
              autoContinuousPlay ? 'transport-btn--active' : ''
            }`}
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
            className={`transport-btn ${
              showQueueDrawer ? 'transport-btn--active' : ''
            }`}
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
                Avanço automático ativado para o modo {playbackMode.toUpperCase()}
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
                  className={`queue-item-card ${
                    active ? 'queue-item-card--active' : ''
                  }`}
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

      {/* Cloudflare Worker Gateway Modal */}
      {showCfModal && (
        <div
          className="cf-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCfModal(false);
          }}
        >
          <div className="cf-modal-card">
            <div className="cf-modal-header">
              <div className="cf-modal-title">
                <Cloud size={20} className="cf-modal-icon" />
                <h3>Cloudflare Worker Gateway</h3>
              </div>
              <button
                type="button"
                className="cf-modal-close-btn"
                onClick={() => setShowCfModal(false)}
              >
                ✕
              </button>
            </div>

            <p className="cf-modal-desc">
              O Cloudflare Worker contorna o bloqueio de bot do YouTube e injeta cabeçalhos CORS, permitindo que qualquer vídeo seja reproduzido no modo <strong>Backendless</strong> ou <strong>External</strong> no Tesla sem usar a tag &lt;video&gt;.
            </p>

            <div className="cf-modal-form-group">
              <label htmlFor="cf-worker-url-input">URL do seu Worker Cloudflare:</label>
              <input
                id="cf-worker-url-input"
                type="url"
                placeholder="https://tesla-player-stream.seu-subdominio.workers.dev"
                value={cfWorkerUrlInput}
                onChange={(e) => setCfWorkerUrlInput(e.target.value)}
                className="cf-modal-input"
              />
              <span className="cf-modal-hint">
                Consulte o arquivo <code>cloudflare-worker/README.md</code> para o passo a passo de implantação em 2 minutos (plano grátis).
              </span>
            </div>

            <div className="cf-modal-actions">
              <button
                type="button"
                className="touch-pill-btn touch-pill-btn--danger"
                onClick={() => {
                  setSavedCloudflareWorkerUrl('');
                  setCfWorkerUrlInput('');
                  setCfWorkerActive(false);
                  setShowCfModal(false);
                  forceVideoDecoderResync(false);
                }}
              >
                Remover Gateway
              </button>

              <button
                type="button"
                className="touch-pill-btn touch-pill-btn--primary"
                onClick={() => {
                  const cleaned = cfWorkerUrlInput.trim().replace(/\/+$/, '');
                  setSavedCloudflareWorkerUrl(cleaned);
                  setCfWorkerActive(Boolean(cleaned));
                  setShowCfModal(false);
                  forceVideoDecoderResync(false);
                }}
              >
                Salvar & Conectar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
