import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { createFile, MP4BoxBuffer, DataStream, Endianness } from 'mp4box';
import TinyH264 from 'tinyh264/es/TinyH264';
import TinyH264Decoder from 'tinyh264/es/TinyH264Decoder';
import type { TinyH264WasmModule } from 'tinyh264/es/TinyH264';
import { Upload, Link2, Cpu, RefreshCw } from 'lucide-react';
import {
  resolveCorsStreamsForVideo,
  getFallbackMp4ForVideoId,
} from '../services/corsStreamResolver';

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

function prependAnnexBStartCode(nalu: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + nalu.byteLength);
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  out.set(nalu, 4);
  return out;
}

function renderYuv420ToCanvas(
  canvas: HTMLCanvasElement,
  yuv: Uint8Array,
  strideWidth: number,
  strideHeight: number,
  displayWidth: number,
  displayHeight: number,
  imageDataCacheRef: React.MutableRefObject<ImageData | null>
) {
  const w = Math.min(strideWidth, displayWidth || strideWidth);
  const h = Math.min(strideHeight, displayHeight || strideHeight);
  if (w <= 0 || h <= 0) return;

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    imageDataCacheRef.current = null;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let imgData = imageDataCacheRef.current;
  if (!imgData || imgData.width !== w || imgData.height !== h) {
    imgData = ctx.createImageData(w, h);
    imageDataCacheRef.current = imgData;
  }

  const rgba = imgData.data;
  const lumaSize = strideWidth * strideHeight;
  const chromaStride = strideWidth >> 1;
  const uOffset = lumaSize;
  const vOffset = lumaSize + (lumaSize >> 2);

  for (let y = 0; y < h; y++) {
    const yRowOffset = y * strideWidth;
    const uvRowOffset = (y >> 1) * chromaStride;
    const outRowOffset = y * w * 4;

    for (let x = 0; x < w; x++) {
      const yVal = yuv[yRowOffset + x] - 16;
      const uvIdx = uvRowOffset + (x >> 1);
      const uVal = yuv[uOffset + uvIdx] - 128;
      const vVal = yuv[vOffset + uvIdx] - 128;

      const c = yVal < 0 ? 0 : yVal * 298;
      const r = (c + 409 * vVal + 128) >> 8;
      const g = (c - 100 * uVal - 208 * vVal + 128) >> 8;
      const b = (c + 516 * uVal + 128) >> 8;

      const outIdx = outRowOffset + (x << 2);
      rgba[outIdx] = r < 0 ? 0 : r > 255 ? 255 : r;
      rgba[outIdx + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      rgba[outIdx + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      rgba[outIdx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
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
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const imageDataCacheRef = useRef<ImageData | null>(null);

    const wasmModuleRef = useRef<TinyH264WasmModule | null>(null);
    const decoderRef = useRef<TinyH264Decoder | null>(null);
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
    const blobUrlRef = useRef<string | null>(null);
    const clockStartRef = useRef<number>(0);
    const pausedMediaTimeRef = useRef<number>(0);
    const decodedCountRef = useRef<number>(0);
    const loadSessionIdRef = useRef<number>(0);

    const [statusText, setStatusText] = useState<string>(
      'Inicializando MP4Box.js + TinyH264 WASM...'
    );
    const [sourceLabel, setSourceLabel] = useState<string>('Iniciando MP4...');
    const [dimensionsLabel, setDimensionsLabel] = useState<string>('640x360');
    const [naluCounter, setNaluCounter] = useState<number>(0);
    const [fpsEstimate, setFpsEstimate] = useState<number>(24);
    const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
    const [durationSec, setDurationSec] = useState<number>(0);
    const [showCustomUrlInput, setShowCustomUrlInput] =
      useState<boolean>(false);
    const [customMp4Url, setCustomMp4Url] = useState<string>('');

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

    // Ensure TinyH264 WASM decoder instance is created
    const recreateTinyH264Decoder = useCallback(async () => {
      if (!wasmModuleRef.current) {
        wasmModuleRef.current = await TinyH264();
      }
      if (decoderRef.current) {
        try {
          decoderRef.current.release();
        } catch {
          // ignore
        }
      }

      const decoder = new TinyH264Decoder(
        wasmModuleRef.current,
        (yuvBuffer, width, height) => {
          decodedCountRef.current += 1;
          const canvas = canvasRef.current;
          if (canvas) {
            renderYuv420ToCanvas(
              canvas,
              yuvBuffer,
              width,
              height,
              displaySizeRef.current.width || width,
              displaySizeRef.current.height || height,
              imageDataCacheRef
            );
          }
        }
      );
      decoderRef.current = decoder;

      for (const sps of spsAnnexBRef.current) {
        decoder.decode(sps);
      }
      for (const pps of ppsAnnexBRef.current) {
        decoder.decode(pps);
      }
      return decoder;
    }, []);

    // Decode a single sample by index via either TinyH264 WASM or WebCodecs VideoDecoder
    const decodeSampleAtIndex = useCallback((idx: number) => {
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
            // ignore delta frame if waiting for keyframe
          }
        }
        return;
      }

      const decoder = decoderRef.current;
      if (!decoder) return;

      if (sample.isSync) {
        for (const sps of spsAnnexBRef.current) {
          decoder.decode(sps);
        }
        for (const pps of ppsAnnexBRef.current) {
          decoder.decode(pps);
        }
      }

      for (const nalu of sample.nalus) {
        decoder.decode(nalu);
      }
    }, []);

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

    // Demux an MP4 ArrayBuffer with mp4box.js and initialize TinyH264 WASM (or WebCodecs for Main/High profile)
    const demuxAndStartMp4Buffer = useCallback(
      async (
        arrayBuffer: ArrayBuffer,
        audioSourceUrl: string,
        label: string,
        sessionId: number,
        allowBaselineFallback: boolean
      ): Promise<boolean> => {
        if (sessionId !== loadSessionIdRef.current) return false;

        const mp4boxfile = createFile();
        const extractedSamples: ExtractedVideoSample[] = [];
        let spsList: Uint8Array[] = [];
        let ppsList: Uint8Array[] = [];
        let avcDescriptionBytes: Uint8Array | null = null;
        let codecString = 'avc1.42E01E';
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
                durationSec: (sample.duration || 40) / timescale,
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

        // Normalize timestamps if first sample doesn't start at 0
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

        // Close any previous WebCodecs decoder
        if (webCodecsDecoderRef.current) {
          try {
            webCodecsDecoderRef.current.close();
          } catch {
            // ignore
          }
          webCodecsDecoderRef.current = null;
        }
        usingWebCodecsRef.current = false;

        // First try TinyH264 WASM decoder
        decodedCountRef.current = 0;
        await recreateTinyH264Decoder();
        if (sessionId !== loadSessionIdRef.current) return false;

        const probeCount = Math.min(6, extractedSamples.length);
        for (let i = 0; i < probeCount; i++) {
          decodeSampleAtIndex(i);
        }

        // If TinyH264 WASM produced 0 frames (e.g. Main/High profile CABAC stream), use WebCodecs VideoDecoder onto <canvas>
        if (
          decodedCountRef.current === 0 &&
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
                error: () => {
                  // ignore decode error
                },
              });
              wcDecoder.configure({
                codec: codecString,
                codedWidth: trackWidth,
                codedHeight: trackHeight,
                description: avcDescriptionBytes,
              });
              webCodecsDecoderRef.current = wcDecoder;
              usingWebCodecsRef.current = true;
              decodeSampleAtIndex(0);
            }
          } catch {
            usingWebCodecsRef.current = false;
          }
        }

        if (
          decodedCountRef.current === 0 &&
          !usingWebCodecsRef.current &&
          allowBaselineFallback
        ) {
          return false;
        }

        // Reset playback clock to frame 0 and render first frame immediately
        currentSampleIdxRef.current = 0;
        pausedMediaTimeRef.current = 0;
        clockStartRef.current = performance.now();

        const last = extractedSamples[extractedSamples.length - 1];
        const totalDur = Math.max(0.5, last.ptsSec + last.durationSec);
        setDurationSec(totalDur);
        setFpsEstimate(Math.max(1, Math.round(extractedSamples.length / totalDur)));
        setCurrentTimeSec(0);

        decodeSampleAtIndex(0);
        currentSampleIdxRef.current = 1;

        const engineTag = usingWebCodecsRef.current
          ? 'MP4Box.js + WebCodecs H.264'
          : 'MP4Box.js + TinyH264 WASM';
        setSourceLabel(label);
        setStatusText(
          `Reproduzindo via ${engineTag} (${extractedSamples.length} quadros no <canvas> + <audio>)`
        );

        if (audioRef.current) {
          audioRef.current.src = audioSourceUrl;
          audioRef.current.muted = isMutedRef.current;
          audioRef.current.currentTime = 0;
          if (isPlayingRef.current) {
            audioRef.current.play().catch(() => {
              // If browser blocks unmuted autoplay before gesture, <canvas> still plays via performance.now() clock!
            });
          }
        }

        return true;
      },
      [decodeSampleAtIndex, recreateTinyH264Decoder]
    );

    // Fetch up to maxBytes of an MP4 URL so large streams don't hang waiting for 200MB
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

    // Load stream for current YouTube video:
    // 1. Immediately start local H.264 Baseline stream (<250ms) so the video starts right away when clicked!
    // 2. In parallel, query Piped/Invidious CORS APIs; if a live CORS MP4 stream is available and decodable, hot-swap to it.
    const startVideoSession = useCallback(
      async (customUrlOverride?: string) => {
        const sessionId = ++loadSessionIdRef.current;
        onPlayStateChangeRef.current(true);

        try {
          if (customUrlOverride) {
            setStatusText(`Carregando MP4 CORS: ${customUrlOverride}...`);
            const buf = await fetchMp4BufferCapped(customUrlOverride);
            const ok = await demuxAndStartMp4Buffer(
              buf,
              customUrlOverride,
              'URL MP4 Customizada',
              sessionId,
              false
            );
            if (!ok && sessionId === loadSessionIdRef.current) {
              setStatusText(
                'MP4 não contém atom moov no início ou perfil incompatível.'
              );
            }
            return;
          }

          // Step 1: Instant start with bundled H.264 Baseline MP4 so user sees video playing immediately
          const instantMp4Url = getFallbackMp4ForVideoId(videoId);
          setStatusText(
            `Iniciando ${videoTitleRef.current.slice(
              0,
              32
            )} no <canvas> + <audio>...`
          );
          const instantRes = await fetch(instantMp4Url);
          const instantBuf = await instantRes.arrayBuffer();
          await demuxAndStartMp4Buffer(
            instantBuf,
            instantMp4Url,
            `Local Mode WASM (${videoId})`,
            sessionId,
            false
          );

          // Step 2: Check in background if a live Piped/Invidious CORS MP4 is available for this videoId
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
                  `${resolved.instanceName} (MP4)`,
                  sessionId,
                  true
                );
              }
            } catch {
              // Keep playing the active instant stream seamlessly
            }
          }
        } catch (err) {
          if (sessionId === loadSessionIdRef.current) {
            const msg =
              err instanceof Error ? err.message : 'Erro ao inicializar MP4Box';
            setStatusText(`Erro Local Mode: ${msg}`);
          }
        }
      },
      [demuxAndStartMp4Buffer, fetchMp4BufferCapped, videoId]
    );

    useEffect(() => {
      startVideoSession();
      return () => {
        loadSessionIdRef.current += 1;
        if (decoderRef.current) {
          try {
            decoderRef.current.release();
          } catch {
            // ignore
          }
        }
        if (webCodecsDecoderRef.current) {
          try {
            webCodecsDecoderRef.current.close();
          } catch {
            // ignore
          }
        }
      };
    }, [startVideoSession]);

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

    // Main requestAnimationFrame loop driving TinyH264 / WebCodecs <canvas> rendering synchronized to <audio>
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
            }
          }
        }

        rafId = window.requestAnimationFrame(renderLoop);
      };

      rafId = window.requestAnimationFrame(renderLoop);
      return () => window.cancelAnimationFrame(rafId);
    }, [decodeSampleAtIndex, seekToSeconds]);

    // Handle local .mp4 file selection from device / USB
    const handleFileUpload = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const sessionId = ++loadSessionIdRef.current;
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        const blobUrl = URL.createObjectURL(file);
        blobUrlRef.current = blobUrl;

        const buf = await file.arrayBuffer();
        await demuxAndStartMp4Buffer(
          buf,
          blobUrl,
          `Arquivo: ${file.name}`,
          sessionId,
          false
        );
        onPlayStateChangeRef.current(true);
      },
      [demuxAndStartMp4Buffer]
    );

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
        {/* Top Overlay Diagnostics & MP4 Source Controls */}
        <div className="canvas-mode-stage__hud">
          <div className="canvas-mode-stage__badges">
            <span className="canvas-mode-badge canvas-mode-badge--local">
              <Cpu size={12} />
              <span>LOCAL MODE • MP4Box.js + TinyH264 WASM</span>
            </span>
            <span className="canvas-mode-badge">
              {dimensionsLabel} • {fpsEstimate}fps • {naluCounter} NALUs
            </span>
            <span className="canvas-mode-badge">
              {formatTime(currentTimeSec)} / {formatTime(durationSec)}
            </span>
          </div>

          <div className="canvas-mode-stage__actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/x-m4v"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button
              id="btn-local-upload-mp4"
              type="button"
              className="canvas-hud-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Carregar arquivo .MP4 local ou USB para decodificar no <canvas>"
            >
              <Upload size={12} />
              <span>Abrir .MP4</span>
            </button>

            <button
              id="btn-local-custom-url"
              type="button"
              className={`canvas-hud-btn ${
                showCustomUrlInput ? 'canvas-hud-btn--active' : ''
              }`}
              onClick={() => setShowCustomUrlInput((v) => !v)}
              title="Informar URL direta de um stream .MP4 com CORS habilitado"
            >
              <Link2 size={12} />
              <span>URL .MP4</span>
            </button>

            <button
              id="btn-local-reload-stream"
              type="button"
              className="canvas-hud-btn"
              onClick={() => startVideoSession()}
              title="Recarregar e demuxar stream MP4 novamente"
            >
              <RefreshCw size={12} />
              <span>Recarregar</span>
            </button>
          </div>
        </div>

        {showCustomUrlInput && (
          <form
            className="canvas-mode-stage__url-bar"
            onSubmit={(e) => {
              e.preventDefault();
              if (customMp4Url.trim()) {
                startVideoSession(customMp4Url.trim());
                setShowCustomUrlInput(false);
              }
            }}
          >
            <input
              type="url"
              value={customMp4Url}
              onChange={(e) => setCustomMp4Url(e.target.value)}
              placeholder="https://exemplo.com/stream.mp4 (CORS habilitado)"
              className="canvas-mode-stage__url-input"
            />
            <button
              type="submit"
              className="canvas-hud-btn canvas-hud-btn--active"
            >
              Decodificar MP4
            </button>
          </form>
        )}

        {/* Pure HTML5 <canvas> surface (NO <video> element in DOM) */}
        <canvas
          ref={canvasRef}
          id="local-mode-h264-canvas"
          className="canvas-mode-stage__canvas"
          width={640}
          height={360}
          onClick={() => {
            const next = !isPlayingRef.current;
            onPlayStateChange(next);
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
