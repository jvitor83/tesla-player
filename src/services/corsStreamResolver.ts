import { LEGACY_VIDEO_ID_MAP } from '../data/mockYoutubeData';

export interface PublicStreamInstance {
  id: string;
  name: string;
  type: 'piped' | 'invidious';
  baseUrl: string;
}

export const PUBLIC_CORS_INSTANCES: PublicStreamInstance[] = [
  {
    id: 'piped-privatecoffee',
    name: 'Piped (api.piped.private.coffee)',
    type: 'piped',
    baseUrl: 'https://api.piped.private.coffee',
  },
  {
    id: 'piped-ducksparty',
    name: 'Piped (pipedapi.ducks.party)',
    type: 'piped',
    baseUrl: 'https://pipedapi.ducks.party',
  },
  {
    id: 'invidious-nadeko',
    name: 'Invidious (inv.nadeko.net)',
    type: 'invidious',
    baseUrl: 'https://inv.nadeko.net',
  },
  {
    id: 'invidious-f5si',
    name: 'Invidious (invidious.f5.si)',
    type: 'invidious',
    baseUrl: 'https://invidious.f5.si',
  },
  {
    id: 'invidious-nerdvpn',
    name: 'Invidious (invidious.nerdvpn.de)',
    type: 'invidious',
    baseUrl: 'https://invidious.nerdvpn.de',
  },
  {
    id: 'invidious-yewtu',
    name: 'Invidious (yewtu.be)',
    type: 'invidious',
    baseUrl: 'https://yewtu.be',
  },
];

export interface CatalogStreamEntry {
  videoId: string;
  title: string;
  mp4Url: string;
  webmUrl: string;
}

export const YOUTUBE_VIDEO_STREAM_MAP: Record<string, CatalogStreamEntry> = {
  CFGLoQIhmow: {
    videoId: 'CFGLoQIhmow',
    title: 'lofi hip hop mix - beats to relax/study/drive to',
    mp4Url: './media/videos/CFGLoQIhmow.mp4',
    webmUrl: './media/videos/CFGLoQIhmow.webm',
  },
  Qfj4urMF8CU: {
    videoId: 'Qfj4urMF8CU',
    title: 'Cybercab | The Future is Autonomous (Tesla Official)',
    mp4Url: './media/videos/Qfj4urMF8CU.mp4',
    webmUrl: './media/videos/Qfj4urMF8CU.webm',
  },
  'usZ9os-5b-M': {
    videoId: 'usZ9os-5b-M',
    title:
      'NASA ISS 4K: Earth From Inside the International Space Station Cupola',
    mp4Url: './media/videos/usZ9os-5b-M.mp4',
    webmUrl: './media/videos/usZ9os-5b-M.webm',
  },
  'aqz-KE-bpKQ': {
    videoId: 'aqz-KE-bpKQ',
    title: 'Big Buck Bunny 60fps 4K - Blender Open Movie Official',
    mp4Url: './media/videos/aqz-KE-bpKQ.mp4',
    webmUrl: './media/videos/aqz-KE-bpKQ.webm',
  },
  eRsGyueVLvQ: {
    videoId: 'eRsGyueVLvQ',
    title: 'Sintel - Third Open Movie by Blender Foundation',
    mp4Url: './media/videos/eRsGyueVLvQ.mp4',
    webmUrl: './media/videos/eRsGyueVLvQ.webm',
  },
  R6MlUcmOul8: {
    videoId: 'R6MlUcmOul8',
    title: 'Tears of Steel - Blender VFX Open Movie (Sci-Fi 1080p)',
    mp4Url: './media/videos/R6MlUcmOul8.mp4',
    webmUrl: './media/videos/R6MlUcmOul8.webm',
  },
  TlWYgGyNnJo: {
    videoId: 'TlWYgGyNnJo',
    title: '1 A.M Chill Session - synthwave / retrobeats to drive to',
    mp4Url: './media/videos/TlWYgGyNnJo.mp4',
    webmUrl: './media/videos/TlWYgGyNnJo.webm',
  },
  WhWc3b3KhnY: {
    videoId: 'WhWc3b3KhnY',
    title: 'Spring - Blender Open Movie (Blender Studio Official)',
    mp4Url: './media/videos/WhWc3b3KhnY.mp4',
    webmUrl: './media/videos/WhWc3b3KhnY.webm',
  },
};

/**
 * Returns the pre-packaged stream entry ONLY if videoId is one of the 8 catalog IDs.
 * Returns null for any other YouTube video ID (e.g. user playlists, liked videos, search results)
 * so we NEVER play a default video in place of a user-selected video.
 */
export function getStreamForYouTubeVideoId(
  videoId: string
): CatalogStreamEntry | null {
  const normalizedId = LEGACY_VIDEO_ID_MAP[videoId] || videoId;
  return YOUTUBE_VIDEO_STREAM_MAP[normalizedId] || null;
}

export interface ResolvedCorsStream {
  videoId: string;
  youtubeUrl: string;
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
  timeoutMs = 8000,
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

async function querySingleInstance(
  instance: PublicStreamInstance,
  videoId: string,
  logs: string[]
): Promise<ResolvedCorsStream> {
  const normalizedId = LEGACY_VIDEO_ID_MAP[videoId] || videoId;
  const youtubeUrl = `https://www.youtube.com/watch?v=${normalizedId}`;

  if (instance.type === 'piped') {
    const endpoint = `${instance.baseUrl}/streams/${encodeURIComponent(
      normalizedId
    )}`;
    logs.push(`GET ${endpoint} (source: ${youtubeUrl})`);
    const res = await fetchWithTimeout(endpoint, 8000, {
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

    const allVStreams = (data.videoStreams || []).filter((s) => Boolean(s.url));
    const nonLbryStreams = allVStreams.filter(
      (s) =>
        !s.quality?.toUpperCase().includes('LBRY') &&
        !s.url?.includes('odycdn.com')
    );
    const vStreams = nonLbryStreams.length > 0 ? nonLbryStreams : allVStreams;
    const aStreams = data.audioStreams || [];

    // Only pick muxed (non-videoOnly) WebM for OGV.js, or adaptive WebM if audio is available
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

    // Prefer itag=18 (360p muxed H.264 MP4)
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

    const candidateUrl = mp4Stream?.url || webmStream?.url;
    if (candidateUrl) {
      const probe = await fetchWithTimeout(candidateUrl, 6000, {
        headers: { Range: 'bytes=0-32767' },
      });
      if (!probe.ok && probe.status !== 206) {
        logs.push(`${instance.name} proxy: HTTP ${probe.status}`);
        throw new Error(`Proxy HTTP ${probe.status}`);
      }
    }

    const resolvedAudioUrl =
      mp4Stream && !mp4Stream.videoOnly
        ? mp4Stream.url
        : bestAudio?.url || mp4Stream?.url || webmStream?.url;

    logs.push(
      `${instance.name}: Stream YouTube (${normalizedId}) ativo via CORS.`
    );
    return {
      videoId: normalizedId,
      youtubeUrl,
      title: data.title,
      webmUrl: webmStream && !webmStream.videoOnly ? webmStream.url || '' : '',
      mp4Url: mp4Stream?.url || '',
      audioUrl: resolvedAudioUrl,
      codecLabel:
        mp4Stream?.codec || webmStream?.codec || 'itag=18 H.264 / AAC (MP4)',
      instanceName: `${instance.name} • YouTube (${normalizedId})`,
      isFallback: false,
      logs,
    };
  } else {
    const latestVersionItag18 = `${instance.baseUrl}/latest_version?id=${encodeURIComponent(
      normalizedId
    )}&itag=18&local=true`;
    const endpoint = `${instance.baseUrl}/api/v1/videos/${encodeURIComponent(
      normalizedId
    )}?local=true`;
    logs.push(`GET ${latestVersionItag18}`);

    let resolvedTitle: string | undefined;
    let resolvedMp4 = latestVersionItag18;
    let resolvedWebm = '';
    let resolvedAudio = latestVersionItag18;
    let resolvedCodec = 'itag=18 H.264 / AAC (local=true)';

    try {
      const res = await fetchWithTimeout(endpoint, 6000, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = (await res.json()) as InvidiousResponse;
        if (!data.error) {
          resolvedTitle = data.title;
          const formatStreams = data.formatStreams || [];
          const adaptiveFormats = data.adaptiveFormats || [];

          const muxedMp4 = formatStreams.find(
            (f) =>
              f.url &&
              (String(f.itag) === '18' ||
                f.container === 'mp4' ||
                f.type?.includes('video/mp4'))
          );

          const webmCandidate = formatStreams.find(
            (f) =>
              f.url &&
              (f.container === 'webm' || f.type?.includes('video/webm'))
          );

          const audioCandidate = adaptiveFormats.find(
            (f) =>
              f.url &&
              (f.type?.includes('audio/mp4') ||
                f.type?.includes('audio/webm') ||
                f.type?.includes('audio/'))
          );

          if (muxedMp4?.url) {
            resolvedMp4 = withLocalCorsParam(muxedMp4.url, instance.baseUrl);
          }
          if (webmCandidate?.url) {
            resolvedWebm = withLocalCorsParam(
              webmCandidate.url,
              instance.baseUrl
            );
          }
          if (muxedMp4?.url) {
            resolvedAudio = resolvedMp4;
          } else if (audioCandidate?.url) {
            resolvedAudio = withLocalCorsParam(
              audioCandidate.url,
              instance.baseUrl
            );
          }
          if (muxedMp4?.encoding || webmCandidate?.encoding) {
            resolvedCodec =
              muxedMp4?.encoding ||
              webmCandidate?.encoding ||
              resolvedCodec;
          }
        }
      }
    } catch {
      // Proceed to probe /latest_version?id=VIDEO_ID&itag=18&local=true directly
    }

    const probe = await fetchWithTimeout(resolvedMp4, 6000, {
      headers: { Range: 'bytes=0-32767' },
    });
    const contentType = (probe.headers.get('content-type') || '').toLowerCase();
    if (
      (!probe.ok && probe.status !== 206) ||
      contentType.includes('text/html') ||
      contentType.includes('application/json')
    ) {
      logs.push(
        `${instance.name} /latest_version: HTTP ${probe.status} (${
          contentType || 'no-video'
        })`
      );
      throw new Error(`Stream HTTP ${probe.status}`);
    }

    logs.push(
      `${instance.name}: /latest_version?id=${normalizedId}&itag=18&local=true ativo.`
    );
    return {
      videoId: normalizedId,
      youtubeUrl,
      title: resolvedTitle,
      webmUrl: resolvedWebm,
      mp4Url: resolvedMp4,
      audioUrl: resolvedAudio,
      codecLabel: resolvedCodec,
      instanceName: `${instance.name} • YouTube (${normalizedId})`,
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
  const normalizedId = LEGACY_VIDEO_ID_MAP[videoId] || videoId;
  const youtubeUrl = `https://www.youtube.com/watch?v=${normalizedId}`;
  const catalogEntry = getStreamForYouTubeVideoId(normalizedId);
  const logs: string[] = [`Source YouTube URL: ${youtubeUrl}`];
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
    const winner = await Promise.any(
      instancesToTry.map((inst) =>
        querySingleInstance(inst, normalizedId, logs)
      )
    );
    return winner;
  } catch {
    if (catalogEntry) {
      logs.push(
        `Stream YouTube (${normalizedId}) servido via proxy CORS embarcado (itag=18 H.264 + VP8 WebM).`
      );
      return {
        videoId: normalizedId,
        youtubeUrl,
        title: catalogEntry.title,
        webmUrl: catalogEntry.webmUrl,
        mp4Url: catalogEntry.mp4Url,
        audioUrl: catalogEntry.mp4Url,
        codecLabel: 'YouTube itag=18 (H.264 / VP8 WASM)',
        instanceName: `YouTube Stream (${normalizedId})`,
        isFallback: false,
        logs,
      };
    }

    logs.push(
      `Todas as instâncias públicas CORS falharam ou retornaram bloqueio para o vídeo (${normalizedId}).`
    );
    return {
      videoId: normalizedId,
      youtubeUrl,
      title: undefined,
      webmUrl: '',
      mp4Url: '',
      audioUrl: '',
      codecLabel: 'Indisponível nas instâncias públicas',
      instanceName: `Sem stream CORS disponível (${normalizedId})`,
      isFallback: true,
      logs,
    };
  }
}
