import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { Globe, RefreshCw, Server, Terminal } from 'lucide-react';
import {
  LocalModeCanvasPlayer,
  type CanvasPlayerHandle,
  type ExternalMp4StreamOverride,
} from './LocalModeCanvasPlayer';
import {
  PUBLIC_CORS_INSTANCES,
  resolveCorsStreamsForVideo,
  getStreamForYouTubeVideoId,
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
    const mp4SubPlayerRef = useRef<CanvasPlayerHandle | null>(null);
    const auxAudioRef = useRef<HTMLAudioElement | null>(null);
    const sessionIdRef = useRef<number>(0);

    const [selectedInstanceId, setSelectedInstanceId] = useState<string>(
      PUBLIC_CORS_INSTANCES[0].id
    );
    const [customEndpointInput, setCustomEndpointInput] = useState<string>('');
    const [showLogsDrawer, setShowLogsDrawer] = useState<boolean>(false);
    const [statusText, setStatusText] = useState<string>(
      'Conectando stream YouTube via Invidious / Piped CORS + WASM...'
    );
    const [activeInstanceName, setActiveInstanceName] = useState<string>(
      `youtube.com/watch?v=${videoId}`
    );
    const [codecBadge, setCodecBadge] = useState<string>('WASM Worker + WebGL');
    const [resolverLogs, setResolverLogs] = useState<string[]>([]);
    const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
    const [durationSec, setDurationSec] = useState<number>(0);
    const [mp4StreamOverride, setMp4StreamOverride] =
      useState<ExternalMp4StreamOverride | null>(null);
    const [isResolvingCors, setIsResolvingCors] = useState<boolean>(false);
    const [externalError, setExternalError] = useState<string | null>(null);

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

    const teardownOgvPlayer = useCallback(() => {
      if (ogvPlayerRef.current) {
        try {
          ogvPlayerRef.current.pause();
          if (ogvPlayerRef.current.stop) {
            ogvPlayerRef.current.stop();
          }
        } catch {
          // ignore
        }
        ogvPlayerRef.current = null;
      }
      if (mountContainerRef.current) {
        mountContainerRef.current.innerHTML = '';
      }
      if (auxAudioRef.current) {
        try {
          auxAudioRef.current.pause();
          auxAudioRef.current.removeAttribute('src');
        } catch {
          // ignore
        }
      }
    }, []);

    const mountOgvStream = useCallback(
      async (
        streamUrl: string,
        separateAudioUrl: string | undefined,
        instanceLabel: string,
        codec: string,
        sessionId: number,
        fallbackMp4Override?: ExternalMp4StreamOverride
      ) => {
        setMp4StreamOverride(null);
        await ensureOgvRuntimeLoaded();
        if (
          sessionId !== sessionIdRef.current ||
          !mountContainerRef.current ||
          !window.OGVPlayer
        ) {
          return;
        }

        teardownOgvPlayer();
        setIsResolvingCors(false);
        setExternalError(null);

        const player = new window.OGVPlayer({
          webGL: true,
          worker: true,
        });
        player.className = 'ogv-wasm-canvas-host';
        player.autoplay = isPlayingRef.current;
        player.muted = isMutedRef.current;
        player.loop = autoContinuousPlayRef.current;
        player.src = streamUrl;

        player.addEventListener('loadedmetadata', () => {
          const w = player.videoWidth || 640;
          const h = player.videoHeight || 360;
          setDurationSec(player.duration || 20);
          setCodecBadge(`${codec} (${w}x${h})`);
          setStatusText(
            `Streaming YouTube (${videoId}) • WASM Worker + WebGL <canvas> + <audio> (${w}x${h})`
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
            onEndedRef.current();
          }
        });

        player.addEventListener('error', () => {
          if (fallbackMp4Override && sessionId === sessionIdRef.current) {
            teardownOgvPlayer();
            setMp4StreamOverride(fallbackMp4Override);
          } else {
            setExternalError(
              `Erro ao decodificar stream WebM (${videoId}) no WASM Worker.`
            );
            setStatusText(
              `Erro ao decodificar stream (${videoId}) no WASM Worker.`
            );
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
      [teardownOgvPlayer, videoId]
    );

    const resolveAndPlayExternal = useCallback(
      async (overrideInstanceId?: string, customUrl?: string) => {
        const sessionId = ++sessionIdRef.current;
        const targetInst = overrideInstanceId || selectedInstanceId;

        // Immediately stop any previous video so the old video never keeps playing
        teardownOgvPlayer();
        setMp4StreamOverride(null);
        setCurrentTimeSec(0);
        setDurationSec(0);
        setExternalError(null);
        setIsResolvingCors(true);
        onPlayStateChangeRef.current(true);

        const catalogEntry = getStreamForYouTubeVideoId(videoId);

        if (
          customUrl &&
          (customUrl.endsWith('.webm') || customUrl.endsWith('.ogv'))
        ) {
          setResolverLogs([`Stream WebM/OGV direto: ${customUrl}`]);
          await mountOgvStream(
            customUrl,
            undefined,
            `YouTube (${videoId}) • Custom Stream`,
            'VP8/VP9 WASM Worker',
            sessionId
          );
          return;
        }

        if (customUrl && customUrl.endsWith('.mp4')) {
          setResolverLogs([`Stream MP4 direto: ${customUrl}`]);
          setIsResolvingCors(false);
          setActiveInstanceName(`YouTube (${videoId}) • Custom MP4 Stream`);
          setMp4StreamOverride({
            mp4Url: customUrl,
            audioUrl: customUrl,
            instanceName: 'Custom MP4 CORS',
          });
          return;
        }

        // If videoId is one of the 8 pre-packaged catalog streams and no custom instance override was requested, play directly via WASM Worker
        if (catalogEntry && !overrideInstanceId && !customUrl) {
          setResolverLogs([
            `Source YouTube URL: https://www.youtube.com/watch?v=${videoId}`,
            `Stream YouTube (${videoId}) ativo via WASM Worker (${catalogEntry.webmUrl}).`,
          ]);
          await mountOgvStream(
            catalogEntry.webmUrl,
            undefined,
            `youtube.com/watch?v=${videoId} (WASM Worker)`,
            'VP8 + Vorbis WASM Worker',
            sessionId
          );
          return;
        }

        setActiveInstanceName(`youtube.com/watch?v=${videoId}`);
        setStatusText(
          `Consultando Invidious (?local=true) / Piped CORS para "${videoTitleRef.current.slice(
            0,
            34
          )}" (${videoId})...`
        );

        // Query public Invidious (?local=true) / Piped CORS APIs for this exact videoId
        const resolved = await resolveCorsStreamsForVideo(
          videoId,
          targetInst,
          customUrl
        );
        if (sessionId !== sessionIdRef.current) return;
        setResolverLogs(resolved.logs);
        setIsResolvingCors(false);

        if (!resolved.isFallback) {
          // Live Piped / Invidious instances return muxed itag=18 MP4 (or WebM)
          if (resolved.mp4Url && ! catalogEntry) {
            teardownOgvPlayer();
            setActiveInstanceName(resolved.instanceName);
            setCodecBadge(resolved.codecLabel || 'itag=18 H.264 WASM');
            setMp4StreamOverride({
              mp4Url: resolved.mp4Url,
              audioUrl: resolved.audioUrl || resolved.mp4Url,
              instanceName: resolved.instanceName,
            });
            return;
          }

          if (resolved.webmUrl) {
            await mountOgvStream(
              resolved.webmUrl,
              resolved.audioUrl,
              resolved.instanceName,
              resolved.codecLabel,
              sessionId,
              resolved.mp4Url
                ? {
                    mp4Url: resolved.mp4Url,
                    audioUrl: resolved.audioUrl || resolved.mp4Url,
                    instanceName: resolved.instanceName,
                  }
                : undefined
            );
            return;
          }

          if (resolved.mp4Url) {
            teardownOgvPlayer();
            setActiveInstanceName(resolved.instanceName);
            setCodecBadge(resolved.codecLabel || 'itag=18 H.264 WASM');
            setMp4StreamOverride({
              mp4Url: resolved.mp4Url,
              audioUrl: resolved.audioUrl || resolved.mp4Url,
              instanceName: resolved.instanceName,
            });
            return;
          }
        }

        // If all external instances failed and this is NOT one of the 8 catalog videos, NEVER play a default video!
        if (!catalogEntry) {
          setExternalError(
            `As instâncias públicas Invidious / Piped bloquearam ou limitaram temporariamente a extração CORS para "${videoTitleRef.current}" (${videoId}).`
          );
          setStatusText(
            `Stream CORS indisponível para (${videoId}). Tente outra instância no seletor acima ou clique em Reconectar.`
          );
        }
      },
      [mountOgvStream, selectedInstanceId, teardownOgvPlayer, videoId]
    );

    useEffect(() => {
      resolveAndPlayExternal();
      return () => {
        sessionIdRef.current += 1;
        teardownOgvPlayer();
      };
    }, [resolveAndPlayExternal, teardownOgvPlayer]);

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
          if (mp4StreamOverride && mp4SubPlayerRef.current) {
            mp4SubPlayerRef.current.togglePlay();
            return;
          }
          const next = !isPlayingRef.current;
          onPlayStateChangeRef.current(next);
        },
        seekBy: (deltaSeconds: number) => {
          if (mp4StreamOverride && mp4SubPlayerRef.current) {
            mp4SubPlayerRef.current.seekBy(deltaSeconds);
            return;
          }
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
          if (mp4StreamOverride && mp4SubPlayerRef.current) {
            mp4SubPlayerRef.current.toggleMute();
            return;
          }
          const next = !isMutedRef.current;
          onMuteStateChangeRef.current(next);
        },
        resync: () => {
          resolveAndPlayExternal(selectedInstanceId, customEndpointInput);
        },
      }),
      [
        customEndpointInput,
        mp4StreamOverride,
        resolveAndPlayExternal,
        selectedInstanceId,
      ]
    );

    const formatTime = (sec: number) => {
      const s = Math.max(0, Math.floor(sec));
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    };

    return (
      <div className="canvas-mode-stage" id="external-mode-canvas-stage">
        {/* Top Overlay Diagnostics & Invidious/Piped CORS Selector */}
        <div className="canvas-mode-stage__hud">
          <div className="canvas-mode-stage__badges">
            <span className="canvas-mode-badge canvas-mode-badge--external">
              <Globe size={12} />
              <span>EXTERNAL MODE • Invidious/Piped CORS + WASM Worker</span>
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
              title="Selecionar instância pública Invidious (?local=true) / Piped CORS"
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
              title="Exibir log de resolução CORS das APIs Invidious/Piped"
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
              title="Reconectar às APIs Invidious / Piped CORS"
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
                placeholder="URL de instância Invidious/Piped customizada (CORS)"
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

        {/* When Piped/Invidious returns an itag=18 MP4 stream, decode via MP4Box.js + WASM Worker onto WebGL <canvas> + <audio> */}
        {mp4StreamOverride ? (
          <LocalModeCanvasPlayer
            ref={mp4SubPlayerRef}
            videoId={videoId}
            videoTitle={videoTitle}
            isPlaying={isPlaying}
            isMuted={isMuted}
            autoContinuousPlay={autoContinuousPlay}
            onPlayStateChange={onPlayStateChange}
            onMuteStateChange={onMuteStateChange}
            onEnded={onEnded}
            externalStreamOverride={mp4StreamOverride}
            hideHud={true}
            onTelemetryUpdate={(info) => {
              setCurrentTimeSec(info.currentTimeSec);
              setDurationSec(info.durationSec);
              setCodecBadge(info.codecLabel);
              setStatusText(info.statusText);
              setActiveInstanceName(info.sourceLabel);
            }}
          />
        ) : (
          <div
            ref={mountContainerRef}
            id="ogv-wasm-stage-mount"
            className="canvas-mode-stage__ogv-mount"
            onClick={() => onPlayStateChangeRef.current(!isPlayingRef.current)}
          />
        )}

        {/* Loading or Error status overlay when resolving non-catalog YouTube streams */}
        {!mp4StreamOverride && (isResolvingCors || externalError) && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '24px',
              textAlign: 'center',
              background: 'rgba(8, 11, 16, 0.82)',
              pointerEvents: externalError ? 'auto' : 'none',
              zIndex: 4,
            }}
          >
            <div
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#f4f6fb',
                maxWidth: '520px',
              }}
            >
              {videoTitle} ({videoId})
            </div>
            <div
              style={{
                fontSize: '12px',
                color: externalError ? '#ff8a8a' : '#9fb0c7',
                maxWidth: '540px',
                lineHeight: 1.45,
              }}
            >
              {externalError || statusText}
            </div>
            {externalError && (
              <button
                type="button"
                className="canvas-hud-btn canvas-hud-btn--active"
                onClick={() =>
                  resolveAndPlayExternal(
                    selectedInstanceId,
                    customEndpointInput
                  )
                }
              >
                <RefreshCw size={12} />
                <span>Tentar Novamente ({videoId})</span>
              </button>
            )}
          </div>
        )}

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
