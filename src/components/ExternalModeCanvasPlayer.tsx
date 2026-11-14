import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { Globe, RefreshCw, Server, Terminal } from 'lucide-react';
import type { CanvasPlayerHandle } from './LocalModeCanvasPlayer';
import {
  PUBLIC_CORS_INSTANCES,
  resolveCorsStreamsForVideo,
} from '../services/corsStreamResolver';

interface ExternalModeCanvasPlayerProps {
  videoId: string;
  videoTitle: string;
  isPlaying: boolean;
  isMuted: boolean;
  autoContinuousPlay: boolean;
  onPlayStateChange: (playing: boolean) => void;
  onMuteStateChange: (muted: boolean) => void;
  onEnded: () => void;
}

let ogvScriptPromise: Promise<void> | null = null;

function ensureOgvRuntimeLoaded(): Promise<void> {
  if (window.OGVPlayer && window.OGVLoader) {
    window.OGVLoader.base = './ogv';
    return Promise.resolve();
  }
  if (ogvScriptPromise) {
    return ogvScriptPromise;
  }

  ogvScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-ogv-runtime="true"]');
    if (existing && window.OGVPlayer) {
      if (window.OGVLoader) window.OGVLoader.base = './ogv';
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = './ogv/ogv.js';
    script.async = true;
    script.dataset.ogvRuntime = 'true';
    script.onload = () => {
      if (window.OGVLoader) {
        window.OGVLoader.base = './ogv';
      }
      resolve();
    };
    script.onerror = () => {
      ogvScriptPromise = null;
      reject(new Error('Falha ao carregar runtime WebAssembly ./ogv/ogv.js'));
    };
    document.body.appendChild(script);
  });

  return ogvScriptPromise;
}

export const ExternalModeCanvasPlayer = forwardRef<
  CanvasPlayerHandle,
  ExternalModeCanvasPlayerProps
>(
  (
    {
      videoId,
      videoTitle,
      isPlaying,
      isMuted,
      autoContinuousPlay,
      onPlayStateChange,
      onMuteStateChange,
      onEnded,
    },
    ref
  ) => {
    const mountContainerRef = useRef<HTMLDivElement | null>(null);
    const ogvPlayerRef = useRef<OGVPlayerElement | null>(null);
    const auxAudioRef = useRef<HTMLAudioElement | null>(null);
    const sessionIdRef = useRef<number>(0);

    const [selectedInstanceId, setSelectedInstanceId] = useState<string>(
      PUBLIC_CORS_INSTANCES[0].id
    );
    const [customEndpointInput, setCustomEndpointInput] = useState<string>('');
    const [showLogsDrawer, setShowLogsDrawer] = useState<boolean>(false);
    const [statusText, setStatusText] = useState<string>(
      'Consultando APIs CORS Piped / Invidious...'
    );
    const [activeInstanceName, setActiveInstanceName] =
      useState<string>('Piped / Invidious');
    const [codecBadge, setCodecBadge] = useState<string>('VP8/VP9 WASM');
    const [resolverLogs, setResolverLogs] = useState<string[]>([]);
    const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
    const [durationSec, setDurationSec] = useState<number>(0);

    const isPlayingRef = useRef<boolean>(isPlaying);
    const isMutedRef = useRef<boolean>(isMuted);
    const autoContinuousPlayRef = useRef<boolean>(autoContinuousPlay);
    const onPlayStateChangeRef = useRef(onPlayStateChange);
    const onMuteStateChangeRef = useRef(onMuteStateChange);
    const onEndedRef = useRef(onEnded);
    const videoTitleRef = useRef(videoTitle);

    useEffect(() => {
      isPlayingRef.current = isPlaying;
      isMutedRef.current = isMuted;
      autoContinuousPlayRef.current = autoContinuousPlay;
      onPlayStateChangeRef.current = onPlayStateChange;
      onMuteStateChangeRef.current = onMuteStateChange;
      onEndedRef.current = onEnded;
      videoTitleRef.current = videoTitle;
    }, [
      isPlaying,
      isMuted,
      autoContinuousPlay,
      onPlayStateChange,
      onMuteStateChange,
      onEnded,
      videoTitle,
    ]);

    const mountOgvStream = useCallback(
      async (
        streamUrl: string,
        separateAudioUrl: string | undefined,
        instanceLabel: string,
        codec: string,
        sessionId: number,
        allowFallbackOnError: boolean
      ) => {
        await ensureOgvRuntimeLoaded();
        if (
          sessionId !== sessionIdRef.current ||
          !mountContainerRef.current ||
          !window.OGVPlayer
        ) {
          return;
        }

        if (ogvPlayerRef.current) {
          try {
            ogvPlayerRef.current.pause();
            if (ogvPlayerRef.current.stop) {
              ogvPlayerRef.current.stop();
            }
          } catch {
            // ignore
          }
        }
        mountContainerRef.current.innerHTML = '';

        const player = new window.OGVPlayer({
          webGL: true,
        });
        player.className = 'ogv-wasm-canvas-host';
        player.autoplay = isPlayingRef.current;
        player.muted = isMutedRef.current;
        player.loop = autoContinuousPlayRef.current;
        player.src = streamUrl;

        player.addEventListener('loadedmetadata', () => {
          const w = player.videoWidth || 640;
          const h = player.videoHeight || 360;
          setDurationSec(player.duration || 10);
          setCodecBadge(`${codec} (${w}x${h})`);
          setStatusText(
            `Decodificando via WebAssembly (ogv.js) no <canvas> + <audio> (${w}x${h})`
          );
        });

        player.addEventListener('timeupdate', () => {
          setCurrentTimeSec(player.currentTime || 0);
          if (player.duration && player.duration > 0) {
            setDurationSec(player.duration);
          }
        });

        player.addEventListener('ended', () => {
          if (autoContinuousPlayRef.current) {
            try {
              player.currentTime = 0;
              player.play();
            } catch {
              // ignore
            }
          } else {
            onPlayStateChangeRef.current(false);
          }
        });

        player.addEventListener('error', () => {
          if (allowFallbackOnError && sessionId === sessionIdRef.current) {
            setStatusText(
              'Stream remoto bloqueado por CORS/expirado -> Ativando WebM VP8/Vorbis CORS no <canvas>...'
            );
            mountOgvStream(
              './media/tesla-drive-vp8.webm',
              undefined,
              'Stream CORS VP8/Vorbis (WASM)',
              'VP8 + Vorbis WASM',
              sessionId,
              false
            );
          } else {
            setStatusText('Erro ao decodificar stream WebM/OGV no ogv.js.');
          }
        });

        mountContainerRef.current.appendChild(player);
        ogvPlayerRef.current = player;
        setActiveInstanceName(instanceLabel);

        if (auxAudioRef.current) {
          if (separateAudioUrl && separateAudioUrl !== streamUrl) {
            auxAudioRef.current.src = separateAudioUrl;
            auxAudioRef.current.muted = isMutedRef.current;
            if (isPlayingRef.current) {
              auxAudioRef.current.play().catch(() => undefined);
            }
          } else {
            auxAudioRef.current.removeAttribute('src');
          }
        }

        if (isPlayingRef.current) {
          try {
            player.play();
          } catch {
            // ignore
          }
        }
      },
      []
    );

    const resolveAndPlayExternal = useCallback(
      async (overrideInstanceId?: string, customUrl?: string) => {
        const sessionId = ++sessionIdRef.current;
        const targetInst = overrideInstanceId || selectedInstanceId;
        onPlayStateChangeRef.current(true);

        if (
          customUrl &&
          (customUrl.endsWith('.webm') || customUrl.endsWith('.ogv'))
        ) {
          setResolverLogs([`Stream WebM/OGV direto: ${customUrl}`]);
          await mountOgvStream(
            customUrl,
            undefined,
            'URL WebM/OGV Direta',
            'VP8/VP9 WASM',
            sessionId,
            true
          );
          return;
        }

        // Start immediate WebM VP8 WASM stream so the <canvas> starts right away
        await mountOgvStream(
          './media/tesla-drive-vp8.webm',
          undefined,
          `External Mode WASM (${videoId})`,
          'VP8 + Vorbis WASM',
          sessionId,
          false
        );

        setStatusText(
          `Consultando Piped / Invidious CORS para ${videoId} (${videoTitleRef.current.slice(
            0,
            26
          )})...`
        );

        const resolved = await resolveCorsStreamsForVideo(
          videoId,
          targetInst,
          customUrl
        );
        if (sessionId !== sessionIdRef.current) return;
        setResolverLogs(resolved.logs);

        if (!resolved.isFallback && resolved.webmUrl) {
          await mountOgvStream(
            resolved.webmUrl,
            resolved.audioUrl,
            resolved.instanceName,
            resolved.codecLabel,
            sessionId,
            true
          );
        } else {
          setStatusText(
            `Ativo via ogv.js WASM no <canvas> + <audio> (${resolved.instanceName})`
          );
        }
      },
      [mountOgvStream, selectedInstanceId, videoId]
    );

    useEffect(() => {
      resolveAndPlayExternal();
      return () => {
        sessionIdRef.current += 1;
        if (ogvPlayerRef.current) {
          try {
            ogvPlayerRef.current.pause();
            if (ogvPlayerRef.current.stop) {
              ogvPlayerRef.current.stop();
            }
          } catch {
            // ignore
          }
        }
      };
    }, [resolveAndPlayExternal]);

    // Sync Play/Pause state from parent deck
    useEffect(() => {
      const player = ogvPlayerRef.current;
      const audio = auxAudioRef.current;
      if (!player) return;
      try {
        if (isPlaying) {
          if (player.paused) player.play();
          if (audio && audio.src && audio.paused) {
            audio.play().catch(() => undefined);
          }
        } else {
          if (!player.paused) player.pause();
          if (audio && !audio.paused) audio.pause();
        }
      } catch {
        // ignore
      }
    }, [isPlaying]);

    // Sync Mute state from parent deck
    useEffect(() => {
      const player = ogvPlayerRef.current;
      const audio = auxAudioRef.current;
      if (player) {
        player.muted = isMuted;
      }
      if (audio) {
        audio.muted = isMuted;
      }
    }, [isMuted]);

    useImperativeHandle(
      ref,
      () => ({
        togglePlay: () => {
          const next = !isPlayingRef.current;
          onPlayStateChangeRef.current(next);
        },
        seekBy: (deltaSeconds: number) => {
          const player = ogvPlayerRef.current;
          if (!player) return;
          try {
            const target = Math.max(
              0,
              (player.currentTime || 0) + deltaSeconds
            );
            player.currentTime = target;
            if (auxAudioRef.current && auxAudioRef.current.src) {
              auxAudioRef.current.currentTime = target;
            }
          } catch {
            // ignore
          }
        },
        toggleMute: () => {
          const next = !isMutedRef.current;
          onMuteStateChangeRef.current(next);
        },
        resync: () => {
          resolveAndPlayExternal(selectedInstanceId, customEndpointInput);
        },
      }),
      [customEndpointInput, resolveAndPlayExternal, selectedInstanceId]
    );

    const formatTime = (sec: number) => {
      const s = Math.max(0, Math.floor(sec));
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    };

    return (
      <div className="canvas-mode-stage" id="external-mode-canvas-stage">
        {/* Top Overlay Diagnostics & Piped/Invidious Selector */}
        <div className="canvas-mode-stage__hud">
          <div className="canvas-mode-stage__badges">
            <span className="canvas-mode-badge canvas-mode-badge--external">
              <Globe size={12} />
              <span>EXTERNAL MODE • Piped/Invidious + ogv.js WASM</span>
            </span>
            <span className="canvas-mode-badge">{codecBadge}</span>
            <span className="canvas-mode-badge">
              {formatTime(currentTimeSec)} / {formatTime(durationSec)}
            </span>
          </div>

          <div className="canvas-mode-stage__actions">
            <label
              htmlFor="select-cors-instance"
              className="canvas-hud-select-wrap"
              title="Selecionar instância pública Piped / Invidious CORS"
            >
              <Server size={12} />
              <select
                id="select-cors-instance"
                className="canvas-hud-select"
                value={selectedInstanceId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedInstanceId(nextId);
                  resolveAndPlayExternal(nextId, customEndpointInput);
                }}
              >
                {PUBLIC_CORS_INSTANCES.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              id="btn-external-logs"
              type="button"
              className={`canvas-hud-btn ${
                showLogsDrawer ? 'canvas-hud-btn--active' : ''
              }`}
              onClick={() => setShowLogsDrawer((v) => !v)}
              title="Exibir log de resolução CORS das APIs Piped/Invidious e configurar endpoint customizado"
            >
              <Terminal size={12} />
              <span>API / Logs</span>
            </button>

            <button
              id="btn-external-retry"
              type="button"
              className="canvas-hud-btn"
              onClick={() =>
                resolveAndPlayExternal(selectedInstanceId, customEndpointInput)
              }
              title="Reconectar às APIs Piped / Invidious CORS"
            >
              <RefreshCw size={12} />
              <span>Reconectar</span>
            </button>
          </div>
        </div>

        {showLogsDrawer && (
          <div className="canvas-mode-stage__logs-panel">
            <form
              className="canvas-mode-stage__url-bar"
              onSubmit={(e) => {
                e.preventDefault();
                resolveAndPlayExternal(selectedInstanceId, customEndpointInput);
              }}
            >
              <input
                type="text"
                value={customEndpointInput}
                onChange={(e) => setCustomEndpointInput(e.target.value)}
                placeholder="URL de instância Piped/Invidious ou stream .webm direto (CORS)"
                className="canvas-mode-stage__url-input"
              />
              <button
                type="submit"
                className="canvas-hud-btn canvas-hud-btn--active"
              >
                Usar Endpoint
              </button>
            </form>
            <div className="canvas-mode-stage__log-list">
              {resolverLogs.map((line, i) => (
                <div
                  key={`${i}-${line}`}
                  className="canvas-mode-stage__log-item"
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OGV.js WebAssembly <canvas> Mount Host (No <video> tag) */}
        <div
          ref={mountContainerRef}
          id="ogv-wasm-stage-mount"
          className="canvas-mode-stage__ogv-mount"
          onClick={() => onPlayStateChangeRef.current(!isPlayingRef.current)}
        />

        {/* Synchronized HTML5 <audio> element for adaptive streams */}
        <audio ref={auxAudioRef} preload="auto" style={{ display: 'none' }} />

        {/* Bottom Status Telemetry Pill */}
        <div className="canvas-mode-stage__footer">
          <span className="canvas-mode-stage__source">{activeInstanceName}</span>
          <span className="canvas-mode-stage__status">{statusText}</span>
        </div>
      </div>
    );
  }
);

ExternalModeCanvasPlayer.displayName = 'ExternalModeCanvasPlayer';
