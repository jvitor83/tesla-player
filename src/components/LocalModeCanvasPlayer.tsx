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
  getSavedCloudflareWorkerUrl,
} from '../services/corsStreamResolver';
import { WebGLYuvRenderer } from '../utils/webglYuvRenderer';

export interface CanvasPlayerHandle {
  togglePlay: () => void;
  seekBy: (deltaSeconds: number) => void;
  toggleMute: () => void;
  resync: () => void;
}

export interface ExternalMp4StreamOverride {
  mp4Url: string;
  audioUrl?: string;
  instanceName: string;
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
  externalStreamOverride?: ExternalMp4StreamOverride | null;
  hideHud?: boolean;
  onTelemetryUpdate?: (info: {
    currentTimeSec: number;
    durationSec: number;
    codecLabel: string;
    statusText: string;
    sourceLabel: string;
  }) => void;
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
      externalStreamOverride = null,
      hideHud = false,
      onTelemetryUpdate,
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
    const isStreamCompleteRef = useRef<boolean>(false);
    const firstPtsOffsetRef = useRef<number | null>(null);
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
    const [streamError, setStreamError] = useState<string | null>(null);
    const [isBufferingStream, setIsBufferingStream] = useState<boolean>(false);

    const isPlayingRef = useRef<boolean>(isPlaying);
    const isMutedRef = useRef<boolean>(isMuted);
    const autoContinuousPlayRef = useRef<boolean>(autoContinuousPlay);
    const onPlayStateChangeRef = useRef(onPlayStateChange);
    const onMuteStateChangeRef = useRef(onMuteStateChange);
    const onEndedRef = useRef(onEnded);
    const onTelemetryUpdateRef = useRef(onTelemetryUpdate);
    const videoTitleRef = useRef(videoTitle);

    useEffect(() => {
      isPlayingRef.current = isPlaying;
      isMutedRef.current = isMuted;
      autoContinuousPlayRef.current = autoContinuousPlay;
      onPlayStateChangeRef.current = onPlayStateChange;
      onMuteStateChangeRef.current = onMuteStateChange;
      onEndedRef.current = onEnded;
      onTelemetryUpdateRef.current = onTelemetryUpdate;
      videoTitleRef.current = videoTitle;
    }, [
      isPlaying,
      isMuted,
      autoContinuousPlay,
      onPlayStateChange,
      onMuteStateChange,
      onEnded,
      onTelemetryUpdate,
      videoTitle,
    ]);

    useEffect(() => {
      onTelemetryUpdateRef.current?.({
        currentTimeSec,
        durationSec,
        codecLabel: `${dimensionsLabel} • ${fpsEstimate}fps • ${naluCounter} NALUs`,
        statusText,
        sourceLabel,
      });
    }, [
      currentTimeSec,
      durationSec,
      dimensionsLabel,
      fpsEstimate,
      naluCounter,
      statusText,
      sourceLabel,
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

    // Stream and demux an MP4 (itag=18) URL progressively with mp4box.js -> TinyH264 WASM Worker / WebCodecs -> WebGL <canvas>
    const streamAndDemuxMp4Url = useCallback(
      async (
        mp4Url: string,
        audioSourceUrl: string,
        label: string,
        sessionId: number,
        maxBytes = 24 * 1024 * 1024
      ): Promise<boolean> => {
        if (sessionId !== loadSessionIdRef.current) return false;

        const res = await fetch(mp4Url, { mode: 'cors' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const mp4boxfile = createFile();
        let spsList: Uint8Array[] = [];
        let ppsList: Uint8Array[] = [];
        let avcDescriptionBytes: Uint8Array | null = null;
        let codecString = 'avc1.42E01E';
        let profileIndication = 66;
        let nalLengthSize = 4;
        let trackWidth = 640;
        let trackHeight = 360;
        let totalNalCount = 0;
        let playbackStarted = false;

        samplesRef.current = [];
        isStreamCompleteRef.current = false;
        firstPtsOffsetRef.current = null;

        mp4boxfile.onReady = (info) => {
          const vTrack = info.videoTracks?.[0];
          if (!vTrack) {
            return;
          }

          codecString = vTrack.codec || 'avc1.42E01E';
          trackWidth = vTrack.video?.width || vTrack.track_width || 640;
          trackHeight = vTrack.video?.height || vTrack.track_height || 360;

          if (info.duration && info.timescale) {
            setDurationSec(Math.max(1, info.duration / info.timescale));
          } else if (vTrack.duration && vTrack.timescale) {
            setDurationSec(Math.max(1, vTrack.duration / vTrack.timescale));
          }

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

          // nbSamples: 1 ensures mp4box.js emits samples immediately as chunks stream in
          mp4boxfile.setExtractionOptions(vTrack.id, null, {
            nbSamples: 1,
          });
          mp4boxfile.start();
        };

        mp4boxfile.onSamples = (_id, _user, samples) => {
          if (sessionId !== loadSessionIdRef.current) return;

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
              const rawPts = (sample.dts ?? sample.cts ?? 0) / timescale;
              if (firstPtsOffsetRef.current === null) {
                firstPtsOffsetRef.current = rawPts > 0.2 ? rawPts : 0;
              }
              const normalizedPts = Math.max(
                0,
                rawPts - (firstPtsOffsetRef.current || 0)
              );
              samplesRef.current.push({
                ptsSec: normalizedPts,
                durationSec: (sample.duration || 33) / timescale,
                isSync: Boolean(sample.is_sync),
                avccData: new Uint8Array(data),
                nalus: sampleNalus,
              });
            }
          }

          if (playbackStarted && samplesRef.current.length > 0) {
            setNaluCounter(totalNalCount);
            const last = samplesRef.current[samplesRef.current.length - 1];
            const loadedDur = Math.max(0.5, last.ptsSec + last.durationSec);
            setDurationSec((prev) => Math.max(prev, loadedDur));
          }
        };

        const initializeDecoderAndStartPlayback = async () => {
          if (playbackStarted || sessionId !== loadSessionIdRef.current) return;
          if (samplesRef.current.length === 0) return;
          playbackStarted = true;
          setIsBufferingStream(false);
          setStreamError(null);

          displaySizeRef.current = { width: trackWidth, height: trackHeight };
          setDimensionsLabel(`${trackWidth}x${trackHeight}`);
          spsAnnexBRef.current = spsList;
          ppsAnnexBRef.current = ppsList;
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

          // Prepare WebCodecs decoder when supported (for Main/High profile or if TinyH264 needs standby)
          let wcReady = false;
          if (
            typeof window.VideoDecoder !== 'undefined' &&
            avcDescriptionBytes
          ) {
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
                    if (!webglRendererRef.current && canvasRef.current) {
                      webglRendererRef.current = new WebGLYuvRenderer(
                        canvasRef.current
                      );
                    }
                    const fw = videoFrame.displayWidth || trackWidth;
                    const fh = videoFrame.displayHeight || trackHeight;
                    webglRendererRef.current?.renderVideoFrame(
                      videoFrame as unknown as TexImageSource,
                      fw,
                      fh
                    );
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
                wcReady = true;
              }
            } catch {
              wcReady = false;
            }
          }

          if (profileIndication === 66) {
            await ensureTinyH264Worker();
            if (sessionId !== loadSessionIdRef.current) return;
            // If a stream tagged profile 66 uses extended features not supported by tinyh264, switch to WebCodecs automatically
            if (wcReady) {
              window.setTimeout(() => {
                if (
                  sessionId === loadSessionIdRef.current &&
                  decodedCountRef.current === 0 &&
                  webCodecsDecoderRef.current?.state === 'configured'
                ) {
                  usingWebCodecsRef.current = true;
                  decodeSampleAtIndex(0);
                }
              }, 450);
            }
          } else if (wcReady) {
            usingWebCodecsRef.current = true;
          } else {
            await ensureTinyH264Worker();
            if (sessionId !== loadSessionIdRef.current) return;
          }

          currentSampleIdxRef.current = 0;
          pausedMediaTimeRef.current = 0;
          clockStartRef.current = performance.now();

          const last = samplesRef.current[samplesRef.current.length - 1];
          const totalDur = Math.max(0.5, last.ptsSec + last.durationSec);
          setDurationSec((prev) => Math.max(prev, totalDur));
          setFpsEstimate(
            Math.max(1, Math.round(samplesRef.current.length / totalDur))
          );
          setCurrentTimeSec(0);

          decodeSampleAtIndex(0);
          currentSampleIdxRef.current = 1;

          const isWebGL = webglRendererRef.current?.isWebGLActive() ?? true;
          setSourceLabel(label);
          setStatusText(
            `Streaming YouTube (${videoId}) • MP4Box.js + WASM Worker -> ${
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
        };

        if (!res.body) {
          const ab = await res.arrayBuffer();
          if (sessionId !== loadSessionIdRef.current) return false;
          const mp4Buf = MP4BoxBuffer.fromArrayBuffer(ab, 0);
          mp4boxfile.appendBuffer(mp4Buf);
          mp4boxfile.flush();
          isStreamCompleteRef.current = true;
          await initializeDecoderAndStartPlayback();
          return samplesRef.current.length > 0;
        }

        const reader = res.body.getReader();
        let fileOffset = 0;
        try {
          while (fileOffset < maxBytes) {
            if (sessionId !== loadSessionIdRef.current) {
              await reader.cancel().catch(() => undefined);
              return false;
            }
            const { done, value } = await reader.read();
            if (done || !value) break;

            const copy = new Uint8Array(value.byteLength);
            copy.set(value);
            const mp4Buf = MP4BoxBuffer.fromArrayBuffer(
              copy.buffer,
              fileOffset
            );
            fileOffset += copy.byteLength;
            mp4boxfile.appendBuffer(mp4Buf);

            if (!playbackStarted && samplesRef.current.length >= 25) {
              await initializeDecoderAndStartPlayback();
            }
          }
        } finally {
          isStreamCompleteRef.current = true;
          try {
            mp4boxfile.flush();
          } catch {
            // ignore
          }
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
        }

        if (!playbackStarted && samplesRef.current.length > 0) {
          await initializeDecoderAndStartPlayback();
        }

        return samplesRef.current.length > 0;
      },
      [decodeSampleAtIndex, ensureTinyH264Worker, videoId]
    );

    // Stop previous playback and clear <canvas> + <audio> immediately when switching videos
    const resetActivePlayback = useCallback(() => {
      samplesRef.current = [];
      isStreamCompleteRef.current = false;
      currentSampleIdxRef.current = 0;
      pausedMediaTimeRef.current = 0;
      decodedCountRef.current = 0;
      setCurrentTimeSec(0);
      setDurationSec(0);
      setNaluCounter(0);
      setStreamError(null);
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.removeAttribute('src');
          audioRef.current.load();
        } catch {
          // ignore
        }
      }
      webglRendererRef.current?.clearFrame();
    }, []);

    // Stream the selected YouTube video (youtube.com/watch?v=VIDEO_ID) into mp4box.js + tinyh264 Web Worker
    const startVideoSession = useCallback(async () => {
      const sessionId = ++loadSessionIdRef.current;
      resetActivePlayback();
      setIsBufferingStream(true);
      onPlayStateChangeRef.current(true);

      try {
        // 1. If ExternalModeCanvasPlayer passed a resolved MP4 stream override, stream it directly
        if (externalStreamOverride?.mp4Url) {
          const label = `youtube.com/watch?v=${videoId} (${externalStreamOverride.instanceName})`;
          setSourceLabel(label);
          setStatusText(
            `Demuxando stream YouTube "${videoTitleRef.current.slice(
              0,
              36
            )}" (${videoId}) via ${externalStreamOverride.instanceName}...`
          );
          const ok = await streamAndDemuxMp4Url(
            externalStreamOverride.mp4Url,
            externalStreamOverride.audioUrl || externalStreamOverride.mp4Url,
            label,
            sessionId
          );
          if (!ok && sessionId === loadSessionIdRef.current) {
            setIsBufferingStream(false);
            setStreamError(
              `Não foi possível extrair quadros H.264 do stream (${videoId}).`
            );
          }
          return;
        }

        const cfWorkerUrl = getSavedCloudflareWorkerUrl();

        // 2. If Cloudflare Worker Gateway is configured, resolve dynamic stream for ANY videoId immediately!
        if (cfWorkerUrl) {
          setSourceLabel(`youtube.com/watch?v=${videoId} (Cloudflare Worker)`);
          setStatusText(
            `Conectando stream YouTube (${videoId}) via Cloudflare Worker Gateway...`
          );
          const resolved = await resolveCorsStreamsForVideo(videoId);
          if (sessionId !== loadSessionIdRef.current) return;

          if (!resolved.isFallback && resolved.mp4Url) {
            const ok = await streamAndDemuxMp4Url(
              resolved.mp4Url,
              resolved.audioUrl || resolved.mp4Url,
              `youtube.com/watch?v=${videoId} (${resolved.instanceName})`,
              sessionId
            );
            if (!ok && sessionId === loadSessionIdRef.current) {
              setIsBufferingStream(false);
              setStreamError(
                `Não foi possível extrair átomos H.264 do stream (${videoId}) via Cloudflare Worker.`
              );
            }
            return;
          }
        }

        // 3. Check if videoId is one of the 8 pre-packaged catalog streams
        const catalogEntry = getStreamForYouTubeVideoId(videoId);
        if (catalogEntry) {
          setSourceLabel(`youtube.com/watch?v=${videoId} (itag=18)`);
          setStatusText(
            `Conectando stream YouTube "${videoTitleRef.current.slice(
              0,
              38
            )}" (${videoId})...`
          );
          await streamAndDemuxMp4Url(
            catalogEntry.mp4Url,
            catalogEntry.mp4Url,
            `youtube.com/watch?v=${videoId} (itag=18)`,
            sessionId
          );
          return;
        }

        // 4. User selected a video from their logged-in playlist, liked videos, subscriptions, or search:
        // NEVER play a default catalog video! Resolve the exact YouTube videoId via CORS instances.
        setSourceLabel(`youtube.com/watch?v=${videoId} (itag=18 CORS)`);
        setStatusText(
          `Resolvendo stream YouTube "${videoTitleRef.current.slice(
            0,
            36
          )}" (${videoId}) via Piped / Invidious CORS...`
        );

        const resolved = await resolveCorsStreamsForVideo(videoId);
        if (sessionId !== loadSessionIdRef.current) return;

        if (!resolved.isFallback && resolved.mp4Url) {
          setStatusText(
            `Conectando MP4Box.js + WASM ao stream YouTube (${videoId}) via ${resolved.instanceName}...`
          );
          const ok = await streamAndDemuxMp4Url(
            resolved.mp4Url,
            resolved.audioUrl || resolved.mp4Url,
            `youtube.com/watch?v=${videoId} (${resolved.instanceName})`,
            sessionId
          );
          if (!ok && sessionId === loadSessionIdRef.current) {
            setIsBufferingStream(false);
            setStreamError(
              `O stream retornado para "${videoTitleRef.current}" (${videoId}) não contém átomos MP4 H.264 compatíveis.`
            );
            setStatusText(
              `Falha ao demuxar MP4 (${videoId}). Tente clicar em Reconectar ou usar o modo IFrame.`
            );
          }
        } else {
          setIsBufferingStream(false);
          setStreamError(
            `As instâncias públicas CORS (Piped / Invidious) bloquearam ou limitaram temporariamente a extração direta de "${videoTitleRef.current}" (${videoId}).`
          );
          setStatusText(
            `Stream direto indisponível nas instâncias públicas para (${videoId}). Clique em Reconectar ou alterne o modo.`
          );
        }
      } catch (err) {
        if (sessionId === loadSessionIdRef.current) {
          setIsBufferingStream(false);
          const msg =
            err instanceof Error ? err.message : 'Erro ao demuxar stream MP4';
          setStreamError(
            `Erro ao carregar o vídeo "${videoTitleRef.current}" (${videoId}): ${msg}`
          );
          setStatusText(`Erro no stream (${videoId}): ${msg}`);
        }
      }
    }, [
      externalStreamOverride,
      resetActivePlayback,
      streamAndDemuxMp4Url,
      videoId,
    ]);

    const startVideoSessionRef = useRef(startVideoSession);
    useEffect(() => {
      startVideoSessionRef.current = startVideoSession;
    }, [startVideoSession]);

    useEffect(() => {
      startVideoSessionRef.current();
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
    }, [videoId, externalStreamOverride?.mp4Url]);

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
            samples[currentSampleIdxRef.current].ptsSec <= mediaSec + 0.015
          ) {
            decodeSampleAtIndex(currentSampleIdxRef.current);
            currentSampleIdxRef.current += 1;
          }

          if (
            isStreamCompleteRef.current &&
            currentSampleIdxRef.current >= samples.length
          ) {
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
          if (samplesRef.current.length > 0) {
            seekToSeconds(pausedMediaTimeRef.current);
            onPlayStateChangeRef.current(true);
          } else {
            startVideoSession();
          }
        },
      }),
      [seekToSeconds, startVideoSession]
    );

    const formatTime = (sec: number) => {
      const s = Math.max(0, Math.floor(sec));
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    };

    return (
      <div
        className="canvas-mode-stage"
        id={hideHud ? undefined : 'local-mode-canvas-stage'}
        style={hideHud ? { width: '100%', height: '100%' } : undefined}
      >
        {/* Top Overlay Diagnostics for Serverless YouTube Stream -> MP4Box.js + TinyH264 WASM Worker */}
        {!hideHud && (
          <div className="canvas-mode-stage__hud">
            <div className="canvas-mode-stage__badges">
              <span className="canvas-mode-badge canvas-mode-badge--local">
                <Cpu size={12} />
                <span>
                  BACKENDLESS MODE • MP4Box.js + TinyH264 WASM Worker (WebGL)
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
        )}

        {/* Pure WebGL HTML5 <canvas> surface (NO <video> element in DOM) */}
        <canvas
          ref={canvasRef}
          id={hideHud ? 'external-mp4-h264-canvas' : 'local-mode-h264-canvas'}
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

        {/* Loading or Error status overlay for non-catalog YouTube streams so user never sees a wrong video */}
        {(isBufferingStream || streamError) && (
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
              pointerEvents: streamError ? 'auto' : 'none',
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
                color: streamError ? '#ff8a8a' : '#9fb0c7',
                maxWidth: '540px',
                lineHeight: 1.45,
              }}
            >
              {streamError || statusText}
            </div>
            {streamError && (
              <button
                type="button"
                className="canvas-hud-btn canvas-hud-btn--active"
                onClick={() => startVideoSession()}
              >
                <RefreshCw size={12} />
                <span>Tentar Novamente ({videoId})</span>
              </button>
            )}
          </div>
        )}

        {/* Pure HTML5 <audio> element for synchronized audio track in Drive mode */}
        <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />

        {/* Bottom Status Telemetry Pill */}
        {!hideHud && (
          <div className="canvas-mode-stage__footer">
            <span className="canvas-mode-stage__source">{sourceLabel}</span>
            <span className="canvas-mode-stage__status">{statusText}</span>
          </div>
        )}
      </div>
    );
  }
);

LocalModeCanvasPlayer.displayName = 'LocalModeCanvasPlayer';
