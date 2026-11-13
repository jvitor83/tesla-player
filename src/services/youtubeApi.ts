import type {
  YouTubeVideo,
  YouTubePlaylist,
  YouTubeSubscription,
  GoogleUserProfile,
} from '../types/tesla';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              expires_in?: number;
              error?: string;
              error_description?: string;
            }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace('/', '').slice(0, 11);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (url.hostname.includes('youtube.com')) {
      const vParam = url.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }
      const embedMatch = url.pathname.match(/\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch?.[1]) {
        return embedMatch[1];
      }
    }
  } catch {
    // Not a full URL
  }
  return null;
}

export function parseIsoDuration(iso?: string): string {
  if (!iso) return '';
  if (iso === 'P0D' || iso === 'PT0S') return 'AO VIVO';
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatShortDate(isoDate?: string): string {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('pt-BR', {
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

export async function fetchGoogleUserProfile(
  accessToken: string,
  expiresInSeconds = 3600
): Promise<GoogleUserProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    return {
      name: 'Motorista Tesla (Conta Google)',
      picture: '',
      accessToken,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    };
  }

  const data = (await res.json()) as {
    name?: string;
    given_name?: string;
    email?: string;
    picture?: string;
  };

  return {
    name: data.name || data.given_name || 'Usuário YouTube',
    email: data.email,
    picture: data.picture || '',
    accessToken,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
}

interface RawThumbnailMap {
  maxres?: { url: string };
  high?: { url: string };
  medium?: { url: string };
  default?: { url: string };
}

function pickBestThumbnail(thumbnails?: RawThumbnailMap, fallbackId?: string): string {
  return (
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.maxres?.url ||
    thumbnails?.default?.url ||
    (fallbackId ? `https://i.ytimg.com/vi/${fallbackId}/hqdefault.jpg` : '')
  );
}

/**
 * YouTube Data API v3: playlists.list (mine=true)
 */
export async function fetchUserPlaylists(accessToken: string): Promise<YouTubePlaylist[]> {
  const url = new URL(`${YOUTUBE_API_BASE}/playlists`);
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('mine', 'true');
  url.searchParams.set('maxResults', '25');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Erro em playlists.list (${res.status}): ${errBody}`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet?: {
        title?: string;
        description?: string;
        channelTitle?: string;
        thumbnails?: RawThumbnailMap;
      };
      contentDetails?: {
        itemCount?: number;
      };
    }>;
  };

  return (data.items || []).map((item) => ({
    id: item.id,
    title: item.snippet?.title || 'Playlist sem título',
    description: item.snippet?.description || 'Playlist sincronizada via YouTube Data API v3',
    thumbnail: pickBestThumbnail(item.snippet?.thumbnails),
    itemCount: item.contentDetails?.itemCount ?? 0,
    channelTitle: item.snippet?.channelTitle || 'Minha Biblioteca',
  }));
}

/**
 * YouTube Data API v3: playlistItems.list
 */
export async function fetchPlaylistItems(
  playlistId: string,
  accessToken?: string,
  apiKey?: string
): Promise<YouTubeVideo[]> {
  const url = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('playlistId', playlistId);
  url.searchParams.set('maxResults', '50');
  if (apiKey && !accessToken) {
    url.searchParams.set('key', apiKey);
  }

  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Erro em playlistItems.list (${res.status}): ${errBody}`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      snippet?: {
        title?: string;
        description?: string;
        channelTitle?: string;
        videoOwnerChannelTitle?: string;
        publishedAt?: string;
        thumbnails?: RawThumbnailMap;
        resourceId?: {
          videoId?: string;
        };
      };
      contentDetails?: {
        videoId?: string;
        videoPublishedAt?: string;
      };
    }>;
  };

  return (data.items || [])
    .map((item) => {
      const videoId =
        item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || '';
      const title = item.snippet?.title || '';
      if (!videoId || title === 'Private video' || title === 'Deleted video') {
        return null;
      }
      return {
        id: videoId,
        title,
        channelTitle:
          item.snippet?.videoOwnerChannelTitle ||
          item.snippet?.channelTitle ||
          'YouTube',
        thumbnail: pickBestThumbnail(item.snippet?.thumbnails, videoId),
        publishedAt: formatShortDate(
          item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt
        ),
        description: item.snippet?.description || '',
      } as YouTubeVideo;
    })
    .filter((v): v is YouTubeVideo => v !== null);
}

/**
 * YouTube Data API v3: videos.list (myRating=like)
 */
export async function fetchLikedVideos(accessToken: string): Promise<YouTubeVideo[]> {
  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set('part', 'snippet,contentDetails,statistics');
  url.searchParams.set('myRating', 'like');
  url.searchParams.set('maxResults', '24');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Erro ao carregar vídeos com Gostei (${res.status}): ${errBody}`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet?: {
        title?: string;
        channelTitle?: string;
        channelId?: string;
        publishedAt?: string;
        description?: string;
        thumbnails?: RawThumbnailMap;
      };
      contentDetails?: {
        duration?: string;
      };
      statistics?: {
        viewCount?: string;
      };
    }>;
  };

  return (data.items || []).map((item) => ({
    id: item.id,
    title: item.snippet?.title || 'Vídeo sem título',
    channelTitle: item.snippet?.channelTitle || 'YouTube',
    channelId: item.snippet?.channelId,
    thumbnail: pickBestThumbnail(item.snippet?.thumbnails, item.id),
    publishedAt: formatShortDate(item.snippet?.publishedAt),
    duration: parseIsoDuration(item.contentDetails?.duration),
    viewCount: item.statistics?.viewCount
      ? `${Number(item.statistics.viewCount).toLocaleString('pt-BR')} visualizações`
      : undefined,
    description: item.snippet?.description,
  }));
}

/**
 * YouTube Data API v3: subscriptions.list (mine=true)
 */
export async function fetchUserSubscriptions(
  accessToken: string
): Promise<YouTubeSubscription[]> {
  const url = new URL(`${YOUTUBE_API_BASE}/subscriptions`);
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('mine', 'true');
  url.searchParams.set('maxResults', '24');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Erro em subscriptions.list (${res.status}): ${errBody}`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet?: {
        title?: string;
        description?: string;
        thumbnails?: RawThumbnailMap;
        resourceId?: {
          channelId?: string;
        };
      };
    }>;
  };

  return (data.items || []).map((item) => ({
    id: item.id,
    channelId: item.snippet?.resourceId?.channelId || '',
    title: item.snippet?.title || 'Canal Inscrito',
    description: item.snippet?.description || '',
    thumbnail: pickBestThumbnail(item.snippet?.thumbnails),
  }));
}

/**
 * YouTube Data API v3: search.list (type=video&videoEmbeddable=true)
 */
export async function searchYouTubeVideos(
  query: string,
  accessToken?: string,
  apiKey?: string,
  channelId?: string
): Promise<YouTubeVideo[]> {
  const url = new URL(`${YOUTUBE_API_BASE}/search`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('videoEmbeddable', 'true');
  url.searchParams.set('maxResults', '16');
  if (query.trim()) {
    url.searchParams.set('q', query.trim());
  }
  if (channelId) {
    url.searchParams.set('channelId', channelId);
    url.searchParams.set('order', 'date');
  }
  if (apiKey && !accessToken) {
    url.searchParams.set('key', apiKey);
  }

  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Erro na busca YouTube Data API v3 (${res.status}): ${errBody}`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        channelId?: string;
        publishedAt?: string;
        description?: string;
        thumbnails?: RawThumbnailMap;
      };
    }>;
  };

  return (data.items || [])
    .map((item) => {
      const videoId = item.id?.videoId;
      if (!videoId) return null;
      return {
        id: videoId,
        title: item.snippet?.title || 'Vídeo do YouTube',
        channelTitle: item.snippet?.channelTitle || 'YouTube',
        channelId: item.snippet?.channelId,
        thumbnail: pickBestThumbnail(item.snippet?.thumbnails, videoId),
        publishedAt: formatShortDate(item.snippet?.publishedAt),
        description: item.snippet?.description || '',
      } as YouTubeVideo;
    })
    .filter((v): v is YouTubeVideo => v !== null);
}
