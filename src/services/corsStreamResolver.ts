export interface PublicStreamInstance {
  id: string;
  name: string;
  type: 'piped' | 'invidious';
  baseUrl: string;
}

export const PUBLIC_CORS_INSTANCES: PublicStreamInstance[] = [
  {
    id: 'piped-privatecoffee',
    name: 'Piped (private.coffee)',
    type: 'piped',
    baseUrl: 'https://api.piped.private.coffee',
  },
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
  itag?: number;
}

interface PipedResponse {
  title?: string;
  error?: string;
  message?: string;
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
  error?: string;
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
  timeoutMs = 2600,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      mode: 'cors',
    });
  } finally {
    window.clearTimeout(timer);
  }
}

export function getFallbackMp4ForVideoId(videoId: string): string {
  let hash = 0;
  for (let i = 0; i < videoId.length; i++) {
    hash = (hash * 31 + videoId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2 === 0
    ? './media/tesla-drive-studio.mp4'
    : './media/tesla-drive-baseline.mp4';
}

async function querySingleInstance(
  instance: PublicStreamInstance,
  videoId: string,
  logs: string[]
): Promise<ResolvedCorsStream> {
  if (instance.type === 'piped') {
    const endpoint = `${instance.baseUrl}/streams/${encodeURIComponent(videoId)}`;
    logs.push(`GET ${endpoint}`);
    const res = await fetchWithTimeout(endpoint, 2600, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      logs.push(`${instance.name}: HTTP ${res.status}`);
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as PipedResponse;
    if (data.error) {
      logs.push(`${instance.name}: ${data.message || data.error}`);
      throw new Error(data.error);
    }

    const vStreams = (data.videoStreams || []).filter(
      (s) =>
        s.url &&
        !s.quality?.toUpperCase().includes('LBRY') &&
        !s.url.includes('odycdn.com')
    );
    const aStreams = data.audioStreams || [];

    const webmStream =
      vStreams.find(
        (s) =>
          (s.mimeType?.includes('webm') ||
            s.format?.toUpperCase().includes('WEBM')) &&
          !s.videoOnly
      ) ||
      vStreams.find(
        (s) =>
          s.mimeType?.includes('webm') ||
          s.format?.toUpperCase().includes('WEBM')
      );

    // Prefer itag 18 (360p muxed MP4) first, then any non-LBRY MP4
    const mp4Stream =
      vStreams.find((s) => s.itag === 18) ||
      vStreams.find(
        (s) =>
          (s.mimeType?.includes('mp4') ||
            s.format?.toUpperCase().includes('MPEG_4')) &&
          !s.videoOnly
      ) ||
      vStreams.find(
        (s) =>
          s.mimeType?.includes('mp4') ||
          s.format?.toUpperCase().includes('MPEG_4')
      );

    const bestAudio =
      aStreams.find((a) => a.url && a.mimeType?.includes('mp4')) ||
      aStreams.find((a) => a.url && a.mimeType?.includes('webm')) ||
      aStreams[0];

    if (!webmStream?.url && !mp4Stream?.url) {
      logs.push(`${instance.name}: Sem streams diretos disponíveis.`);
      throw new Error('No direct streams');
    }

    // Verify that the proxy stream URL actually responds with 200/206 and isn't 403-blocked
    const candidateUrl = mp4Stream?.url || webmStream?.url;
    if (candidateUrl) {
      const probe = await fetchWithTimeout(candidateUrl, 2000, {
        headers: { Range: 'bytes=0-32767' },
      });
      if (!probe.ok && probe.status !== 206) {
        logs.push(`${instance.name} proxy: HTTP ${probe.status}`);
        throw new Error(`Proxy HTTP ${probe.status}`);
      }
    }

    logs.push(`${instance.name}: Stream CORS verificado com sucesso.`);
    return {
      videoId,
      title: data.title,
      webmUrl:
        webmStream?.url || mp4Stream?.url || './media/tesla-drive-vp8.webm',
      mp4Url: mp4Stream?.url || getFallbackMp4ForVideoId(videoId),
      audioUrl: bestAudio?.url || mp4Stream?.url,
      codecLabel: webmStream?.codec || mp4Stream?.codec || 'H.264 / VP8',
      instanceName: instance.name,
      isFallback: false,
      logs,
    };
  } else {
    const endpoint = `${instance.baseUrl}/api/v1/videos/${encodeURIComponent(
      videoId
    )}?local=true`;
    logs.push(`GET ${endpoint}`);
    const res = await fetchWithTimeout(endpoint, 2600, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      logs.push(`${instance.name}: HTTP ${res.status}`);
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as InvidiousResponse;
    if (data.error) {
      logs.push(`${instance.name}: ${data.error}`);
      throw new Error(data.error);
    }

    const formatStreams = data.formatStreams || [];
    const adaptiveFormats = data.adaptiveFormats || [];

    const muxedMp4 = formatStreams.find(
      (f) =>
        f.url &&
        (String(f.itag) === '18' ||
          f.container === 'mp4' ||
          f.type?.includes('video/mp4'))
    );

    const webmCandidate =
      formatStreams.find(
        (f) =>
          f.url && (f.container === 'webm' || f.type?.includes('video/webm'))
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

    if (!webmCandidate?.url && !muxedMp4?.url) {
      logs.push(`${instance.name}: Formato CORS ausente.`);
      throw new Error('No CORS format');
    }

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

    const probe = await fetchWithTimeout(resolvedMp4, 2000, {
      headers: { Range: 'bytes=0-32767' },
    });
    if (!probe.ok && probe.status !== 206) {
      logs.push(`${instance.name} stream: HTTP ${probe.status}`);
      throw new Error(`Stream HTTP ${probe.status}`);
    }

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
        'H.264 / VP8 (local=true)',
      instanceName: instance.name,
      isFallback: false,
      logs,
    };
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

  try {
    // Query top instances concurrently so resolution completes in <2.5s instead of 20s
    const winner = await Promise.any(
      instancesToTry.map((inst) => querySingleInstance(inst, videoId, logs))
    );
    return winner;
  } catch {
    const fallbackMp4 = getFallbackMp4ForVideoId(videoId);
    logs.push(
      `Proxies públicos limitados (HTTP 403/525) para ${videoId} -> Reproduzindo stream H.264/VP8 CORS local (${fallbackMp4}).`
    );

    return {
      videoId,
      webmUrl: './media/tesla-drive-vp8.webm',
      mp4Url: fallbackMp4,
      audioUrl: fallbackMp4,
      codecLabel: 'H.264 Baseline / VP8 Vorbis (CORS Stream)',
      instanceName: 'Stream CORS Direto (Canvas + Audio)',
      isFallback: true,
      logs,
    };
  }
}
