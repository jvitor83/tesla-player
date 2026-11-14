/**
 * Tesla Player - Cloudflare Worker Stream Gateway (v2 - Direct InnerTube VisionOS Engine)
 *
 * This Worker runs on Cloudflare's global edge network (Free tier: 100k requests/day).
 * It extracts direct YouTube audio/video streams via YouTube's official InnerTube API
 * using Apple's VisionOS client profile with dynamic visitorData session extraction.
 *
 * It proxies byte chunks directly with Access-Control-Allow-Origin: * and Range headers,
 * bypassing bot-detection blocks completely.
 *
 * Endpoints:
 * 1. GET /info?id=VIDEO_ID
 *    Returns stream metadata, direct proxied MP4/H.264 video and M4A audio URLs.
 *
 * 2. GET /stream?id=VIDEO_ID&itag=134
 *    Streams video or audio byte ranges directly with full CORS headers.
 *
 * 3. GET /proxy?url=ENCODED_URL
 *    Direct media chunk proxy with Range header and CORS injection.
 *
 * 4. GET /health
 *    Status health check.
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
          engine: 'innertube-visionos-v2',
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
    if (!videoId && pathname !== '/proxy') {
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

    // 2. Resolve Stream Information
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

    // 3. Stream Endpoint
    if (pathname === '/stream') {
      return handleStreamRequest(request, videoId, url);
    }

    // 4. Proxy Raw Media Upstream URL
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

/**
 * Resolves direct googlevideo streaming URLs from YouTube using InnerTube with VisionOS client
 */
async function resolveStreamForVideo(videoId, origin) {
  // Step 1: Fetch YouTube watch page to grab visitorData, cookies, and signatureTimestamp
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const watchRes = await fetch(watchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  const watchHtml = await watchRes.text();
  const setCookie = watchRes.headers.get('set-cookie') || '';

  const visitorMatch = watchHtml.match(/"visitorData":\s*"([^"]+)"/);
  const visitorData = visitorMatch ? visitorMatch[1] : '';

  const stsMatch = watchHtml.match(/"signatureTimestamp":\s*(\d+)/);
  const signatureTimestamp = stsMatch ? parseInt(stsMatch[1], 10) : 20767;

  // Step 2: Query InnerTube player endpoint as VISIONOS client
  const playerReqBody = {
    context: {
      client: {
        clientName: 'VISIONOS',
        clientVersion: '1.02',
        deviceMake: 'Apple',
        deviceModel: 'RealityDevice17,1',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
        osName: 'visionOS',
        osVersion: '26.5.23O471',
        hl: 'en',
        timeZone: 'UTC',
        utcOffsetMinutes: 0,
        visitorData: visitorData,
      },
    },
    videoId,
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: 'HTML5_PREF_WANTS',
        signatureTimestamp,
      },
    },
    contentCheckOk: true,
    racyCheckOk: true,
  };

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    'X-YouTube-Client-Name': '101',
    'X-YouTube-Client-Version': '1.02',
    'Origin': 'https://www.youtube.com',
  };

  if (visitorData) {
    headers['X-Goog-Visitor-Id'] = visitorData;
  }
  if (setCookie) {
    headers['Cookie'] = setCookie;
  }

  const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers,
    body: JSON.stringify(playerReqBody),
  });

  if (!playerRes.ok) {
    throw new Error(`InnerTube returned HTTP ${playerRes.status}`);
  }

  const playerData = await playerRes.json();
  const playability = playerData.playabilityStatus || {};
  if (playability.status !== 'OK') {
    throw new Error(`YouTube playability status: ${playability.status} (${playability.reason || 'unplayable'})`);
  }

  const streamingData = playerData.streamingData || {};
  const formats = streamingData.formats || [];
  const adaptive = streamingData.adaptiveFormats || [];

  // Look for itag 18 (muxed 360p MP4) first
  let targetVideo = formats.find(f => f.itag === 18 && f.url) || formats.find(f => f.url);

  // If no muxed format exists, pick H.264 video format (itag 134 = 360p, 135 = 480p, 136 = 720p, 160 = 144p)
  if (!targetVideo) {
    targetVideo = adaptive.find(f => f.itag === 134 && f.url)
      || adaptive.find(f => f.itag === 135 && f.url)
      || adaptive.find(f => f.itag === 136 && f.url)
      || adaptive.find(f => f.itag === 160 && f.url)
      || adaptive.find(f => f.mimeType?.includes('video/mp4') && f.url)
      || adaptive.find(f => f.url && f.mimeType?.startsWith('video/'));
  }

  // Audio format (itag 140 = 128kbps AAC M4A, itag 139 = 48kbps AAC M4A)
  const targetAudio = adaptive.find(f => f.itag === 140 && f.url)
    || adaptive.find(f => f.itag === 139 && f.url)
    || adaptive.find(f => f.mimeType?.includes('audio/mp4') && f.url)
    || targetVideo;

  if (!targetVideo?.url) {
    throw new Error('No playable stream URL found in YouTube InnerTube response');
  }

  const title = playerData.videoDetails?.title || `YouTube (${videoId})`;

  return {
    videoId,
    title,
    mp4StreamUrl: `${origin}/proxy?url=${encodeURIComponent(targetVideo.url)}`,
    rawMp4Url: targetVideo.url,
    audioUrl: `${origin}/proxy?url=${encodeURIComponent(targetAudio.url || targetVideo.url)}`,
    rawAudioUrl: targetAudio.url || targetVideo.url,
    codec: targetVideo.mimeType || 'H.264 / AAC',
    source: 'innertube-visionos',
  };
}

/**
 * Streams the resolved raw media directly
 */
async function handleStreamRequest(request, videoId, url) {
  try {
    const info = await resolveStreamForVideo(videoId, url.origin);
    const targetUrl = url.searchParams.get('type') === 'audio' ? info.rawAudioUrl : info.rawMp4Url;
    return proxyUpstream(request, targetUrl);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Stream failed', message: err.message }),
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

/**
 * Proxies request to upstream server, forwarding byte range requests and injecting CORS headers
 */
async function proxyUpstream(request, targetUrl) {
  const reqHeaders = new Headers();
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    reqHeaders.set('Range', rangeHeader);
  }
  reqHeaders.set(
    'User-Agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  );

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
      JSON.stringify({ error: 'Failed to proxy media bytes', message: err.message }),
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
