import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { createFile, MP4BoxBuffer, DataStream, Endianness } from 'mp4box';
import { Cpu, RefreshCw, Radio } from 'lucide-react';
import {
  resolveCorsStreamsForVideo,
  getStreamForYouTubeVideoId,
} from '../services/corsStreamResolver';
import { WebGLYuvRenderer } from '../utils/webglYuvRenderer';

export interface CanvasPlayerHandle {
  togglePlay: () => void;
  seekBy: (deltaSeconds: number) => void;
  toggleMute: () => void;
  resync: () => void;
}

interface LocalModeCanvasPlayerProps {
  videoId: string;
  videoTitle: string;
  isPlaying: boolean;
  isMuted: boolean;
  autoContinuousPlay: boolean;
  onPlayStateChange: (playing: boolean) => void;
  onMuteStateChange: (muted: boolean) => void;
  onEnded: () => void;
}

interface ExtractedVideoSample {
  ptsSec: number;
  durationSec: number;
  isSync: boolean;
  avccData: Uint8Array;
  nalus: Uint8Array[];
}

interface WorkerPictureReadyMessage {
  type: 'pictureReady' | 'decoderReady';
  width?: number;
  height?: number;
  renderStateId?: number;
  data?: ArrayBuffer;
}

function prependAnnexBStartCode(nalu: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + nalu.byteLength);
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  out.set(nalu, 4);
  return out;
}

export const LocalModeCanvasPlayer = forwardRef<
  CanvasPlayerHandle,
  LocalModeCanvasPlayerProps
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
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const webglRendererRef = useRef<WebGLYuvRenderer | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const workerReadyRef = useRef<boolean>(false);
    const renderStateIdRef = useRef<number>(1);
    const webCodecsDecoderRef = useRef<VideoDecoder | null>(null);
    const usingWebCodecsRef = useRef<boolean>(false);

    const samplesRef = useRef<ExtractedVideoSample[]>([]);
    const spsAnnexBRef = useRef<Uint8Array[]>([]);
    const ppsAnnexBRef = useRef<Uint8Array[]>([]);
    const currentSampleIdxRef = useRef<number>(0);
    const displaySizeRef = useRef<{ width: number; height: number }>({
      width: 640,
      height: 360,
    });
    const clockStartRef = useRef<number>(0);
    const pausedMediaTimeRef = useRef<number>(0);
    const decodedCountRef = useRef<number>(0);
    const loadSessionIdRef = useRef<number>(0);

    const [statusText, setStatusText] = useState<string>(
      'Inicializando MP4Box.js + TinyH264 WASM Web Worker...'
    );
    const [sourceLabel, setSourceLabel] = useState<string>(
      `youtube.com/watch?v=${videoId} (itag=18)`
    );
    const [dimensionsLabel, setDimensionsLabel] = useState<string>('640x360');
    const [naluCounter, setNaluCounter] = useState<number>(0);
    const [fpsEstimate, setFpsEstimate] = useState<number>(30);
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

    // Initialize WebGL YUV420 <canvas> renderer
    useEffect(() => {
      if (canvasRef.current && !webglRendererRef.current) {
        webglRendererRef.current = new WebGLYuvRenderer(canvasRef.current);
      }
    }, []);

    // Send a single Annex-B NAL unit to the TinyH264 WASM Web Worker
    const postNaluToWorker = useCallback(
      (nalu: Uint8Array, stateId: number) => {
        const worker = workerRef.current;
        if (!worker) return;
        const copy = new Uint8Array(nalu.byteLength);
        copy.set(nalu);
        worker.postMessage(
          {
            type: 'decode',
            data: copy.buffer,
            offset: 0,
            length: copy.byteLength,
            renderStateId: stateId,
          },
          [copy.buffer]
        );
      },
      []
    );

    // Ensure TinyH264 C-to-WASM Web Worker is running and initialized
    const ensureTinyH264Worker = useCallback((): Promise<number> => {
      return new Promise((resolve) => {
        if (!workerRef.current) {
          const worker = new Worker(
            new URL('../workers/tinyh264Worker.ts', import.meta.url),
            { type: 'module' }
          );
          worker.addEventListener(
            'message',
            (e: MessageEvent<WorkerPictureReadyMessage>) => {
              const msg = e.data;
              if (msg.type === 'decoderReady') {
                workerReadyRef.current = true;
              } else if (
                msg.type === 'pictureReady' &&
                msg.data &&
                msg.width &&
                msg.height &&
                msg.renderStateId === renderStateIdRef.current
              ) {
                decodedCountRef.current += 1;
                const yuv = new Uint8Array(msg.data);
                if (!webglRendererRef.current && canvasRef.current) {
                  webglRendererRef.current = new WebGLYuvRenderer(
                    canvasRef.current
                  );
                }
                webglRendererRef.current?.renderYuv420Frame(
                  yuv,
                  msg.width,
                  msg.height,
                  displaySizeRef.current.width || msg.width,
                  displaySizeRef.current.height || msg.height
                );
              }
            }
          );
          workerRef.current = worker;
        }

        const prevStateId = renderStateIdRef.current;
        if (workerReadyRef.current) {
          workerRef.current.postMessage({
            type: 'release',
            renderStateId: prevStateId,
          });
        }
        const nextStateId = prevStateId + 1;
        renderStateIdRef.current = nextStateId;

        const feedParameterSets = () => {
          for (const sps of spsAnnexBRef.current) {
            postNaluToWorker(sps, nextStateId);
          }
          for (const pps of ppsAnnexBRef.current) {
            postNaluToWorker(pps, nextStateId);
          }
          resolve(nextStateId);
        };

        if (workerReadyRef.current) {
          feedParameterSets();
        } else {
          const onReady = (e: MessageEvent<WorkerPictureReadyMessage>) => {
            if (e.data?.type === 'decoderReady') {
              workerRef.current?.removeEventListener('message', onReady);
              workerReadyRef.current = true;
              feedParameterSets();
            }
          };
          workerRef.current.addEventListener('message', onReady);
        }
      });
    }, [postNaluToWorker]);

    // Decode a single sample by index via the TinyH264 WASM Web Worker (or WebCodecs fallback for High/Main profile)
    const decodeSampleAtIndex = useCallback(
      (idx: number) => {
        const sample = samplesRef.current[idx];
        if (!sample) return;

        if (usingWebCodecsRef.current && webCodecsDecoderRef.current) {
          const wc = webCodecsDecoderRef.current;
          if (wc.state === 'configured') {
            try {
              const chunk = new EncodedVideoChunk({
                type: sample.isSync ? 'key' : 'delta',
                timestamp: Math.round(sample.ptsSec * 1_000_000),
                duration: Math.round(sample.durationSec * 1_000_000),
                data: sample.avccData,
              });
              wc.decode(chunk);
            } catch {
              // ignore delta frame before keyframe
            }
          }
          return;
        }

        const stateId = renderStateIdRef.current;
        if (sample.isSync) {
          for (const sps of spsAnnexBRef.current) {
            postNaluToWorker(sps, stateId);
          }
          for (const pps of ppsAnnexBRef.current) {
            postNaluToWorker(pps, stateId);
          }
        }

        for (const nalu of sample.nalus) {
          postNaluToWorker(nalu, stateId);
        }
      },
      [postNaluToWorker]
    );

    // Seek to a specific timestamp in seconds by finding nearest keyframe and decoding up to target
    const seekToSeconds = useCallback(
      (targetSec: number) => {
        const samples = samplesRef.current;
        if (samples.length === 0) return;

        const maxDur =
          samples[samples.length - 1].ptsSec +
          samples[samples.length - 1].durationSec;
        const clamped = Math.max(0, Math.min(targetSec, maxDur));

        let targetIdx = 0;
        for (let i = 0; i < samples.length; i++) {
          if (samples[i].ptsSec <= clamped) {
            targetIdx = i;
          } else {
            break;
          }
        }

        let syncIdx = targetIdx;
        while (syncIdx > 0 && !samples[syncIdx].isSync) {
          syncIdx--;
        }

        for (let i = syncIdx; i <= targetIdx; i++) {
          decodeSampleAtIndex(i);
        }

        currentSampleIdxRef.current = targetIdx + 1;
        pausedMediaTimeRef.current = clamped;
        clockStartRef.current = performance.now() - clamped * 1000;
        setCurrentTimeSec(clamped);

        if (audioRef.current && audioRef.current.src) {
          try {
            audioRef.current.currentTime = clamped;
          } catch {
            // ignore
          }
        }
      },
      [decodeSampleAtIndex]
    );

    // Demux an MP4 (itag=18) ArrayBuffer with mp4box.js and stream NALUs to TinyH264 WASM Web Worker -> WebGL <canvas>
    const demuxAndStartMp4Buffer = useCallback(
      async (
        arrayBuffer: ArrayBuffer,
        audioSourceUrl: string,
        label: string,
        sessionId: number
      ): Promise<boolean> => {
        if (sessionId !== loadSessionIdRef.current) return false;

        const mp4boxfile = createFile();
        const extractedSamples: ExtractedVideoSample[] = [];
        let spsList: Uint8Array[] = [];
        let ppsList: Uint8Array[] = [];
        let avcDescriptionBytes: Uint8Array | null = null;
        let codecString = 'avc1.42E01E';
        let profileIndication = 66;
        let nalLengthSize = 4;
        let trackWidth = 640;
        let trackHeight = 360;
        let totalNalCount = 0;

        mp4boxfile.onReady = (info) => {
          const vTrack = info.videoTracks?.[0];
          if (!vTrack) {
            return;
          }

          codecString = vTrack.codec || 'avc1.42E01E';
          trackWidth = vTrack.video?.width || vTrack.track_width || 640;
          trackHeight = vTrack.video?.height || vTrack.track_height || 360;

          const trak = mp4boxfile.getTrackById(vTrack.id);
          const entries = trak?.mdia?.minf?.stbl?.stsd?.entries || [];
          for (const entry of entries) {
            const avcC = (
              entry as unknown as {
                avcC?: {
                  AVCProfileIndication?: number;
                  lengthSizeMinusOne?: number;
                  SPS?: Array<{ data?: Uint8Array; nalu?: Uint8Array }>;
                  PPS?: Array<{ data?: Uint8Array; nalu?: Uint8Array }>;
                  write?: (ds: InstanceType<typeof DataStream>) => void;
                };
              }
            ).avcC;
            if (avcC) {
              profileIndication = avcC.AVCProfileIndication ?? 66;
              nalLengthSize = (avcC.lengthSizeMinusOne ?? 3) + 1;
              spsList = (avcC.SPS || [])
                .map((s) => s.data || s.nalu)
                .filter((x): x is Uint8Array => Boolean(x))
                .map(prependAnnexBStartCode);
              ppsList = (avcC.PPS || [])
                .map((p) => p.data || p.nalu)
                .filter((x): x is Uint8Array => Boolean(x))
                .map(prependAnnexBStartCode);

              if (typeof avcC.write === 'function') {
                try {
                  const ds = new DataStream(
                    undefined,
                    0,
                    Endianness.BIG_ENDIAN
                  );
                  avcC.write(ds);
                  if (ds.buffer && ds.buffer.byteLength > 8) {
                    avcDescriptionBytes = new Uint8Array(ds.buffer, 8);
                  }
                } catch {
                  // ignore
                }
              }
            }
          }

          mp4boxfile.setExtractionOptions(vTrack.id, null, {
            nbSamples: 5000,
          });
          mp4boxfile.start();
        };

        mp4boxfile.onSamples = (_id, _user, samples) => {
          for (const sample of samples) {
            if (!sample.data) continue;
            const data = sample.data;
            const view = new DataView(
              data.buffer,
              data.byteOffset,
              data.byteLength
            );
            let offset = 0;
            const sampleNalus: Uint8Array[] = [];

            while (offset + nalLengthSize <= data.byteLength) {
              let naluLen = 0;
              for (let i = 0; i < nalLengthSize; i++) {
                naluLen = (naluLen << 8) | view.getUint8(offset + i);
              }
              offset += nalLengthSize;
              if (naluLen > 0 && offset + naluLen <= data.byteLength) {
                const rawNalu = data.subarray(offset, offset + naluLen);
                sampleNalus.push(prependAnnexBStartCode(rawNalu));
                totalNalCount += 1;
              }
              offset += naluLen;
            }

            if (sampleNalus.length > 0) {
              const timescale = sample.timescale || 1000;
              extractedSamples.push({
                ptsSec: (sample.cts ?? sample.dts ?? 0) / timescale,
                durationSec: (sample.duration || 33) / timescale,
                isSync: Boolean(sample.is_sync),
                avccData: new Uint8Array(data),
                nalus: sampleNalus,
              });
            }
          }
        };

        const mp4Buffer = MP4BoxBuffer.fromArrayBuffer(arrayBuffer, 0);
        mp4boxfile.appendBuffer(mp4Buffer);
        mp4boxfile.flush();

        if (sessionId !== loadSessionIdRef.current) return false;
        if (extractedSamples.length === 0) {
          return false;
        }

        extractedSamples.sort((a, b) => a.ptsSec - b.ptsSec);

        const firstPts = extractedSamples[0].ptsSec;
        if (firstPts > 0.2) {
          for (const s of extractedSamples) {
            s.ptsSec = Math.max(0, s.ptsSec - firstPts);
          }
        }

        displaySizeRef.current = { width: trackWidth, height: trackHeight };
        setDimensionsLabel(`${trackWidth}x${trackHeight}`);
        spsAnnexBRef.current = spsList;
        ppsAnnexBRef.current = ppsList;
        samplesRef.current = extractedSamples;
        setNaluCounter(totalNalCount);

        if (webCodecsDecoderRef.current) {
          try {
            webCodecsDecoderRef.current.close();
          } catch {
            // ignore
          }
          webCodecsDecoderRef.current = null;
        }
        usingWebCodecsRef.current = false;
        decodedCountRef.current = 0;

        // Baseline profile (66) -> decode in TinyH264 C-to-WASM Web Worker and render to WebGL <canvas>
        if (profileIndication === 66) {
          await ensureTinyH264Worker();
          if (sessionId !== loadSessionIdRef.current) return false;
        } else if (
          typeof window.VideoDecoder !== 'undefined' &&
          avcDescriptionBytes
        ) {
          // If an external proxy returned Main/High profile CABAC (77/100), decode onto <canvas> via WebCodecs
          try {
            const support = await window.VideoDecoder.isConfigSupported({
              codec: codecString,
              codedWidth: trackWidth,
              codedHeight: trackHeight,
              description: avcDescriptionBytes,
            });
            if (support.supported) {
              const wcDecoder = new window.VideoDecoder({
                output: (videoFrame) => {
                  decodedCountRef.current += 1;
                  const canvas = canvasRef.current;
                  if (canvas) {
                    const fw = videoFrame.displayWidth || trackWidth;
                    const fh = videoFrame.displayHeight || trackHeight;
                    if (canvas.width !== fw || canvas.height !== fh) {
                      canvas.width = fw;
                      canvas.height = fh;
                    }
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                      ctx.drawImage(videoFrame, 0, 0, fw, fh);
                    }
                  }
                  videoFrame.close();
                },
                error: () => undefined,
              });
              wcDecoder.configure({
                codec: codecString,
                codedWidth: trackWidth,
                codedHeight: trackHeight,
                description: avcDescriptionBytes,
              });
              webCodecsDecoderRef.current = wcDecoder;
              usingWebCodecsRef.current = true;
            }
          } catch {
            usingWebCodecsRef.current = false;
          }
        }

        // Reset playback clock to frame 0 and decode first frame immediately
        currentSampleIdxRef.current = 0;
        pausedMediaTimeRef.current = 0;
        clockStartRef.current = performance.now();

        const last = extractedSamples[extractedSamples.length - 1];
        const totalDur = Math.max(0.5, last.ptsSec + last.durationSec);
        setDurationSec(totalDur);
        setFpsEstimate(
          Math.max(1, Math.round(extractedSamples.length / totalDur))
        );
        setCurrentTimeSec(0);

        decodeSampleAtIndex(0);
        currentSampleIdxRef.current = 1;

        const isWebGL = webglRendererRef.current?.isWebGLActive() ?? true;
        setSourceLabel(label);
        setStatusText(
          `Streaming YouTube (${videoId}) • MP4Box.js + TinyH264 WASM Worker -> ${
            isWebGL ? 'WebGL' : '2D'
          } <canvas> @ 30fps + <audio>`
        );

        if (audioRef.current) {
          audioRef.current.src = audioSourceUrl;
          audioRef.current.muted = isMutedRef.current;
          audioRef.current.currentTime = 0;
          if (isPlayingRef.current) {
            audioRef.current.play().catch(() => {
              // <canvas> continues rendering via performance.now() clock even before user gesture
            });
          }
        }

        return true;
      },
      [decodeSampleAtIndex, ensureTinyH264Worker, videoId]
    );

    const fetchMp4BufferCapped = useCallback(
      async (url: string, maxBytes = 6 * 1024 * 1024): Promise<ArrayBuffer> => {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        if (!res.body) {
          return await res.arrayBuffer();
        }
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (total < maxBytes) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          chunks.push(value);
          total += value.byteLength;
        }
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }
        return merged.buffer;
      },
      []
    );

    // Stream the selected YouTube video (youtube.com/watch?v=VIDEO_ID) into mp4box.js + tinyh264 Web Worker
    const startVideoSession = useCallback(async () => {
      const sessionId = ++loadSessionIdRef.current;
      onPlayStateChangeRef.current(true);

      try {
        const streamEntry = getStreamForYouTubeVideoId(videoId);
        setSourceLabel(`youtube.com/watch?v=${videoId} (itag=18)`);
        setStatusText(
          `Conectando stream YouTube "${videoTitleRef.current.slice(
            0,
            38
          )}" (${videoId})...`
        );

        // Stream the selected YouTube video's itag=18 H.264 MP4 over HTTP fetch()
        const streamRes = await fetch(streamEntry.mp4Url);
        const streamBuf = await streamRes.arrayBuffer();
        await demuxAndStartMp4Buffer(
          streamBuf,
          streamEntry.mp4Url,
          `youtube.com/watch?v=${videoId} (itag=18)`,
          sessionId
        );

        // Also check live CORS Piped/Invidious instances in background for any non-catalog YouTube ID
        if (streamEntry.videoId !== videoId) {
          const resolved = await resolveCorsStreamsForVideo(videoId);
          if (
            sessionId === loadSessionIdRef.current &&
            !resolved.isFallback &&
            resolved.mp4Url
          ) {
            try {
              const remoteBuf = await fetchMp4BufferCapped(resolved.mp4Url);
              if (sessionId === loadSessionIdRef.current) {
                await demuxAndStartMp4Buffer(
                  remoteBuf,
                  resolved.audioUrl || resolved.mp4Url,
                  `youtube.com/watch?v=${videoId} (${resolved.instanceName})`,
                  sessionId
                );
              }
            } catch {
              // Keep active stream
            }
          }
        }
      } catch (err) {
        if (sessionId === loadSessionIdRef.current) {
          const msg =
            err instanceof Error ? err.message : 'Erro ao demuxar stream MP4';
          setStatusText(`Erro no stream (${videoId}): ${msg}`);
        }
      }
    }, [demuxAndStartMp4Buffer, fetchMp4BufferCapped, videoId]);

    useEffect(() => {
      startVideoSession();
      return () => {
        loadSessionIdRef.current += 1;
        if (webCodecsDecoderRef.current) {
          try {
            webCodecsDecoderRef.current.close();
          } catch {
            // ignore
          }
        }
      };
    }, [startVideoSession]);

    // Clean up Web Worker on unmount
    useEffect(() => {
      return () => {
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
          workerReadyRef.current = false;
        }
      };
    }, []);

    // Synchronize Play/Pause state from parent deck
    useEffect(() => {
      const audio = audioRef.current;
      if (isPlaying) {
        clockStartRef.current =
          performance.now() - pausedMediaTimeRef.current * 1000;
        if (audio && audio.src && audio.paused) {
          audio.play().catch(() => undefined);
        }
      } else {
        if (audio && !audio.paused) {
          audio.pause();
        }
      }
    }, [isPlaying]);

    // Synchronize Mute state from parent deck
    useEffect(() => {
      if (audioRef.current) {
        audioRef.current.muted = isMuted;
      }
    }, [isMuted]);

    // Main 30fps requestAnimationFrame loop feeding NALUs to the TinyH264 WASM Web Worker synchronized to <audio>
    useEffect(() => {
      let rafId = 0;

      const renderLoop = () => {
        const samples = samplesRef.current;
        if (isPlayingRef.current && samples.length > 0) {
          const audio = audioRef.current;
          let mediaSec: number;

          if (
            audio &&
            !audio.paused &&
            audio.readyState >= 2 &&
            audio.currentTime > 0
          ) {
            mediaSec = audio.currentTime;
            clockStartRef.current = performance.now() - mediaSec * 1000;
          } else {
            mediaSec = (performance.now() - clockStartRef.current) / 1000;
          }

          pausedMediaTimeRef.current = mediaSec;
          setCurrentTimeSec(mediaSec);

          while (
            currentSampleIdxRef.current < samples.length &&
            samples[currentSampleIdxRef.current].ptsSec <= mediaSec + 0.012
          ) {
            decodeSampleAtIndex(currentSampleIdxRef.current);
            currentSampleIdxRef.current += 1;
          }

          if (currentSampleIdxRef.current >= samples.length) {
            if (autoContinuousPlayRef.current) {
              seekToSeconds(0);
              if (audioRef.current && audioRef.current.src) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(() => undefined);
              }
            } else {
              onPlayStateChangeRef.current(false);
              onEndedRef.current();
            }
          }
        }

        rafId = window.requestAnimationFrame(renderLoop);
      };

      rafId = window.requestAnimationFrame(renderLoop);
      return () => window.cancelAnimationFrame(rafId);
    }, [decodeSampleAtIndex, seekToSeconds]);

    useImperativeHandle(
      ref,
      () => ({
        togglePlay: () => {
          const next = !isPlayingRef.current;
          onPlayStateChangeRef.current(next);
        },
        seekBy: (deltaSeconds: number) => {
          seekToSeconds(pausedMediaTimeRef.current + deltaSeconds);
        },
        toggleMute: () => {
          const next = !isMutedRef.current;
          onMuteStateChangeRef.current(next);
        },
        resync: () => {
          seekToSeconds(pausedMediaTimeRef.current);
          onPlayStateChangeRef.current(true);
        },
      }),
      [seekToSeconds]
    );

    const formatTime = (sec: number) => {
      const s = Math.max(0, Math.floor(sec));
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    };

    return (
      <div className="canvas-mode-stage" id="local-mode-canvas-stage">
        {/* Top Overlay Diagnostics for Serverless YouTube Stream -> MP4Box.js + TinyH264 WASM Worker */}
        <div className="canvas-mode-stage__hud">
          <div className="canvas-mode-stage__badges">
            <span className="canvas-mode-badge canvas-mode-badge--local">
              <Cpu size={12} />
              <span>
                LOCAL MODE • MP4Box.js + TinyH264 WASM Worker (WebGL)
              </span>
            </span>
            <span className="canvas-mode-badge">
              {dimensionsLabel} • {fpsEstimate}fps • {naluCounter} NALUs
            </span>
            <span className="canvas-mode-badge">
              {formatTime(currentTimeSec)} / {formatTime(durationSec)}
            </span>
          </div>

          <div className="canvas-mode-stage__actions">
            <span
              className="canvas-mode-badge"
              title={`YouTube Stream Source: https://www.youtube.com/watch?v=${videoId}`}
            >
              <Radio size={11} />
              <span>yt:{videoId}</span>
            </span>

            <button
              id="btn-local-reload-stream"
              type="button"
              className="canvas-hud-btn"
              onClick={() => startVideoSession()}
              title="Reconectar e demuxar stream YouTube (itag=18) no Web Worker WASM"
            >
              <RefreshCw size={12} />
              <span>Reconectar</span>
            </button>
          </div>
        </div>

        {/* Pure WebGL HTML5 <canvas> surface (NO <video> element in DOM) */}
        <canvas
          ref={canvasRef}
          id="local-mode-h264-canvas"
          className="canvas-mode-stage__canvas"
          width={640}
          height={360}
          onClick={() => {
            const next = !isPlayingRef.current;
            onPlayStateChangeRef.current(next);
            if (next && audioRef.current && audioRef.current.src) {
              audioRef.current.play().catch(() => undefined);
            }
          }}
        />

        {/* Pure HTML5 <audio> element for synchronized audio track in Drive mode */}
        <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />

        {/* Bottom Status Telemetry Pill */}
        <div className="canvas-mode-stage__footer">
          <span className="canvas-mode-stage__source">{sourceLabel}</span>
          <span className="canvas-mode-stage__status">{statusText}</span>
        </div>
      </div>
    );
  }
);

LocalModeCanvasPlayer.displayName = 'LocalModeCanvasPlayer';
