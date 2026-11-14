export interface PublicStreamInstance {
  id: string;
  name: string;
  type: 'piped' | 'invidious';
  baseUrl: string;
}

export const PUBLIC_CORS_INSTANCES: PublicStreamInstance[] = [
  {
    id: 'piped-kavin',
    name: 'Piped (kavin.rocks)',
    type: 'piped',
    baseUrl: 'https://pipedapi.kavin.rocks',
  },
  {
    id: 'invidious-nadeko',
    name: 'Invidious (inv.nadeko.net)',
    type: 'invidious',
    baseUrl: 'https://inv.nadeko.net',
  },
  {
    id: 'piped-privatecoffee',
    name: 'Piped (private.coffee)',
    type: 'piped',
    baseUrl: 'https://api.piped.private.coffee',
  },
  {
    id: 'invidious-nerdvpn',
    name: 'Invidious (nerdvpn.de)',
    type: 'invidious',
    baseUrl: 'https://invidious.nerdvpn.de',
  },
  {
    id: 'piped-tokhmi',
    name: 'Piped (tokhmi.xyz)',
    type: 'piped',
    baseUrl: 'https://pipedapi.tokhmi.xyz',
  },
  {
    id: 'invidious-yewtu',
    name: 'Invidious (yewtu.be)',
    type: 'invidious',
    baseUrl: 'https://yewtu.be',
  },
];

export interface ResolvedCorsStream {
  videoId: string;
  title?: string;
  webmUrl: string;
  mp4Url: string;
  audioUrl?: string;
  codecLabel: string;
  instanceName: string;
  isFallback: boolean;
  logs: string[];
}

interface PipedStreamItem {
  url?: string;
  format?: string;
  quality?: string;
  mimeType?: string;
  codec?: string;
  videoOnly?: boolean;
}

interface PipedResponse {
  title?: string;
  videoStreams?: PipedStreamItem[];
  audioStreams?: PipedStreamItem[];
}

interface InvidiousStreamItem {
  url?: string;
  itag?: string | number;
  type?: string;
  container?: string;
  encoding?: string;
  qualityLabel?: string;
}

interface InvidiousResponse {
  title?: string;
  formatStreams?: InvidiousStreamItem[];
  adaptiveFormats?: InvidiousStreamItem[];
}

function withLocalCorsParam(rawUrl: string, instanceBaseUrl: string): string {
  try {
    const parsed = new URL(rawUrl, instanceBaseUrl);
    if (!parsed.searchParams.has('local')) {
      parsed.searchParams.set('local', 'true');
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 3800
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      mode: 'cors',
      headers: {
        Accept: 'application/json',
      },
    });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function resolveCorsStreamsForVideo(
  videoId: string,
  preferredInstanceId?: string,
  customInstanceUrl?: string
): Promise<ResolvedCorsStream> {
  const logs: string[] = [];

  const instancesToTry: PublicStreamInstance[] = [];

  if (customInstanceUrl && customInstanceUrl.trim()) {
    const cleaned = customInstanceUrl.trim().replace(/\/+$/, '');
    const isPiped = cleaned.includes('piped');
    instancesToTry.push({
      id: 'custom-instance',
      name: `Custom (${cleaned})`,
      type: isPiped ? 'piped' : 'invidious',
      baseUrl: cleaned,
    });
  }

  if (preferredInstanceId) {
    const found = PUBLIC_CORS_INSTANCES.find(
      (inst) => inst.id === preferredInstanceId
    );
    if (found) {
      instancesToTry.push(found);
    }
  }

  for (const inst of PUBLIC_CORS_INSTANCES) {
    if (!instancesToTry.some((i) => i.id === inst.id)) {
      instancesToTry.push(inst);
    }
  }

  for (const instance of instancesToTry) {
    try {
      if (instance.type === 'piped') {
        const endpoint = `${instance.baseUrl}/streams/${encodeURIComponent(videoId)}`;
        logs.push(`GET ${endpoint}`);
        const res = await fetchWithTimeout(endpoint, 3600);
        if (!res.ok) {
          logs.push(`${instance.name}: HTTP ${res.status}`);
          continue;
        }
        const data = (await res.json()) as PipedResponse;
        const vStreams = data.videoStreams || [];
        const aStreams = data.audioStreams || [];

        // Prefer WebM (VP8/VP9) for External mode (ogv.js)
        const webmStream =
          vStreams.find(
            (s) =>
              s.url &&
              (s.mimeType?.includes('webm') ||
                s.format?.toUpperCase().includes('WEBM')) &&
              !s.videoOnly
          ) ||
          vStreams.find(
            (s) =>
              s.url &&
              (s.mimeType?.includes('webm') ||
                s.format?.toUpperCase().includes('WEBM'))
          );

        // Prefer MP4 (avc1.42E01E / itag 18 muxed) for Local mode (mp4box + tinyh264)
        const mp4Stream =
          vStreams.find(
            (s) =>
              s.url &&
              (s.mimeType?.includes('mp4') ||
                s.format?.toUpperCase().includes('MPEG_4')) &&
              !s.videoOnly
          ) ||
          vStreams.find(
            (s) =>
              s.url &&
              (s.mimeType?.includes('mp4') ||
                s.format?.toUpperCase().includes('MPEG_4'))
          );

        const bestAudio =
          aStreams.find((a) => a.url && a.mimeType?.includes('mp4')) ||
          aStreams.find((a) => a.url && a.mimeType?.includes('webm')) ||
          aStreams[0];

        if (webmStream?.url || mp4Stream?.url) {
          logs.push(`${instance.name}: Stream CORS resolvido com sucesso.`);
          return {
            videoId,
            title: data.title,
            webmUrl:
              webmStream?.url ||
              mp4Stream?.url ||
              './media/tesla-drive-vp8.webm',
            mp4Url:
              mp4Stream?.url ||
              './media/tesla-drive-baseline.mp4',
            audioUrl: bestAudio?.url || mp4Stream?.url,
            codecLabel: webmStream?.codec || mp4Stream?.codec || 'VP8/H.264',
            instanceName: instance.name,
            isFallback: false,
            logs,
          };
        }
        logs.push(`${instance.name}: Sem streams diretos disponíveis.`);
      } else {
        const endpoint = `${instance.baseUrl}/api/v1/videos/${encodeURIComponent(
          videoId
        )}?local=true`;
        logs.push(`GET ${endpoint}`);
        const res = await fetchWithTimeout(endpoint, 3600);
        if (!res.ok) {
          logs.push(`${instance.name}: HTTP ${res.status}`);
          continue;
        }
        const data = (await res.json()) as InvidiousResponse;
        const formatStreams = data.formatStreams || [];
        const adaptiveFormats = data.adaptiveFormats || [];

        const muxedMp4 = formatStreams.find(
          (f) =>
            f.url &&
            (f.container === 'mp4' ||
              f.type?.includes('video/mp4') ||
              String(f.itag) === '18')
        );

        const webmCandidate =
          formatStreams.find(
            (f) =>
              f.url &&
              (f.container === 'webm' || f.type?.includes('video/webm'))
          ) ||
          adaptiveFormats.find(
            (f) =>
              f.url &&
              (f.container === 'webm' ||
                f.type?.includes('video/webm; codecs="vp8') ||
                f.type?.includes('video/webm; codecs="vp9'))
          );

        const audioCandidate = adaptiveFormats.find(
          (f) =>
            f.url &&
            (f.type?.includes('audio/mp4') ||
              f.type?.includes('audio/webm') ||
              f.type?.includes('audio/'))
        );

        if (webmCandidate?.url || muxedMp4?.url) {
          const resolvedWebm = webmCandidate?.url
            ? withLocalCorsParam(webmCandidate.url, instance.baseUrl)
            : `${instance.baseUrl}/latest_version?id=${encodeURIComponent(
                videoId
              )}&itag=43&local=true`;
          const resolvedMp4 = muxedMp4?.url
            ? withLocalCorsParam(muxedMp4.url, instance.baseUrl)
            : `${instance.baseUrl}/latest_version?id=${encodeURIComponent(
                videoId
              )}&itag=18&local=true`;
          const resolvedAudio = audioCandidate?.url
            ? withLocalCorsParam(audioCandidate.url, instance.baseUrl)
            : resolvedMp4;

          logs.push(`${instance.name}: Stream ?local=true CORS ativo.`);
          return {
            videoId,
            title: data.title,
            webmUrl: resolvedWebm,
            mp4Url: resolvedMp4,
            audioUrl: resolvedAudio,
            codecLabel:
              webmCandidate?.encoding ||
              muxedMp4?.encoding ||
              'VP8/H.264 (local=true)',
            instanceName: instance.name,
            isFallback: false,
            logs,
          };
        }
        logs.push(`${instance.name}: Formato CORS ausente na resposta.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Timeout/CORS';
      logs.push(`${instance.name}: ${msg}`);
    }
  }

  logs.push(
    'APIs públicas Piped/Invidious indisponíveis ou limitadas para este ID -> Ativando stream CORS embarcado (Canvas + Audio).'
  );

  return {
    videoId,
    webmUrl: './media/tesla-drive-vp8.webm',
    mp4Url: './media/tesla-drive-baseline.mp4',
    audioUrl: './media/tesla-drive-baseline.mp4',
    codecLabel: 'H.264 Baseline / VP8 Vorbis (CORS Stream)',
    instanceName: 'Stream CORS Embarcado (Fallback)',
    isFallback: true,
    logs,
  };
}
