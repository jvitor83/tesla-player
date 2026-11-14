/**
 * Tesla Player - Cloudflare Worker Stream Gateway
 *
 * This Worker runs on Cloudflare's global edge network (Free tier: 100k requests/day).
 * It receives a YouTube videoId, resolves or proxies the stream, injects CORS headers
 * (Access-Control-Allow-Origin: *), and streams raw bytes directly to mp4box.js + tinyh264 WASM.
 *
 * Endpoints:
 * 1. GET /stream?id=VIDEO_ID&itag=18
 *    Resolves and streams the MP4/WebM bytes with Range header forwarding and CORS headers.
 *
 * 2. GET /info?id=VIDEO_ID
 *    Returns stream metadata and direct playable URLs formatted for Tesla Player.
 *
 * 3. GET /health
 *    Returns gateway health status.
 */

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/' || pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'tesla-player-worker',
          message: 'Cloudflare Worker YouTube Stream Gateway is active',
          timestamp: new Date().toISOString(),
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const videoId = url.searchParams.get('id') || url.searchParams.get('v');
    if (!videoId) {
      return new Response(
        JSON.stringify({ error: 'Missing required query parameter: id or v' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // 2. Resolve Stream
    if (pathname === '/info') {
      try {
        const streamInfo = await resolveStreamForVideo(videoId, url.origin);
        return new Response(JSON.stringify(streamInfo, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300',
          },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: 'Failed to resolve video info', details: err.message }),
          {
            status: 502,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }
    }

    if (pathname === '/stream') {
      return handleStreamRequest(request, videoId, url);
    }

    // Proxy endpoint if client provides a raw target
    if (pathname === '/proxy') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
          status: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
      return proxyUpstream(request, targetUrl);
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};

async function fetchWithTimeout(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
    });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Resolves video streams from multiple high-availability upstreams:
 * 1. Piped & Invidious public backends with local=true
 * 2. Fallback to direct YouTube stream endpoints
 */
async function resolveStreamForVideo(videoId, origin) {
  const upstreams = [
    { type: 'piped', url: `https://api.piped.private.coffee/streams/${videoId}` },
    { type: 'piped', url: `https://pipedapi.ducks.party/streams/${videoId}` },
    { type: 'invidious', url: `https://inv.nadeko.net/api/v1/videos/${videoId}` },
    { type: 'invidious', url: `https://invidious.nerdvpn.de/api/v1/videos/${videoId}` },
  ];

  for (const upstream of upstreams) {
    try {
      const res = await fetchWithTimeout(upstream.url, 3500);
      if (!res.ok) continue;
      const data = await res.json();

      if (upstream.type === 'piped') {
        const videoStreams = data.videoStreams || [];
        const mp4 = videoStreams.find(s => s.itag === 18) || videoStreams.find(s => s.mimeType?.includes('mp4') && !s.videoOnly);
        const webm = videoStreams.find(s => s.mimeType?.includes('webm') && !s.videoOnly) || videoStreams[0];

        if (mp4?.url || webm?.url) {
          return {
            videoId,
            title: data.title,
            mp4StreamUrl: `${origin}/proxy?url=${encodeURIComponent(mp4?.url || webm?.url)}`,
            rawMp4Url: mp4?.url || webm?.url,
            audioUrl: `${origin}/proxy?url=${encodeURIComponent(mp4?.url || webm?.url)}`,
            codec: mp4?.codec || 'H.264 / AAC',
            source: 'piped-worker',
          };
        }
      } else if (upstream.type === 'invidious') {
        const formatStreams = data.formatStreams || [];
        const itag18 = formatStreams.find(s => String(s.itag) === '18') || formatStreams[0];
        if (itag18?.url) {
          return {
            videoId,
            title: data.title,
            mp4StreamUrl: `${origin}/proxy?url=${encodeURIComponent(itag18.url)}`,
            rawMp4Url: itag18.url,
            audioUrl: `${origin}/proxy?url=${encodeURIComponent(itag18.url)}`,
            codec: itag18.encoding || 'H.264 / AAC',
            source: 'invidious-worker',
          };
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  // If external instances fail, return stream endpoint route which streams on-demand
  return {
    videoId,
    title: `YouTube Video (${videoId})`,
    mp4StreamUrl: `${origin}/stream?id=${videoId}&itag=18`,
    audioUrl: `${origin}/stream?id=${videoId}&itag=18`,
    codec: 'itag=18 H.264',
    source: 'worker-direct',
  };
}

/**
 * Handles streaming byte ranges directly with full CORS headers
 */
async function handleStreamRequest(request, videoId, url) {
  // Try resolving stream URL
  const info = await resolveStreamForVideo(videoId, url.origin);
  if (info.rawMp4Url) {
    return proxyUpstream(request, info.rawMp4Url);
  }

  // Fallback to Invidious latest_version proxy
  const fallbackUrl = `https://inv.nadeko.net/latest_version?id=${videoId}&itag=18&local=true`;
  return proxyUpstream(request, fallbackUrl);
}

/**
 * Proxies request to upstream server, forwarding byte range requests and injecting CORS headers
 */
async function proxyUpstream(request, targetUrl) {
  const reqHeaders = new Headers();
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    reqHeaders.set('Range', rangeHeader);
  }
  reqHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'GET',
      headers: reqHeaders,
    });

    const responseHeaders = new Headers(upstreamRes.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    responseHeaders.set('Cache-Control', 'public, max-age=3600');

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to proxy upstream media', message: err.message }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
