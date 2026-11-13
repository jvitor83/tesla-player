import { useState, useEffect, useCallback } from 'react';
import type {
  ModuleId,
  YoutubeTabId,
  HardwareProfile,
  DrivingState,
  YouTubeVideo,
  YouTubePlaylist,
  YouTubeSubscription,
  GoogleUserProfile,
  CloudConfig,
} from './types/tesla';
import {
  DEFAULT_FEATURED_VIDEOS,
  DEFAULT_PLAYLISTS,
  DEFAULT_LIKED_VIDEOS,
  DEFAULT_SUBSCRIPTIONS,
} from './data/mockYoutubeData';
import {
  YOUTUBE_READONLY_SCOPE,
  extractYouTubeVideoId,
  fetchGoogleUserProfile,
  fetchUserPlaylists,
  fetchPlaylistItems,
  fetchLikedVideos,
  fetchUserSubscriptions,
  searchYouTubeVideos,
} from './services/youtubeApi';
import { TeslaDock } from './components/TeslaDock';
import { YouTubePlayerDeck } from './components/YouTubePlayerDeck';
import { YouTubeModulePanel } from './components/YouTubeModulePanel';
import { ReservedModuleView } from './components/ReservedModuleView';
import { RoadmapAndCloudView } from './components/RoadmapAndCloudView';
import { SafetyAndFirmwareModal } from './components/SafetyAndFirmwareModal';

const STORAGE_KEYS = {
  CLOUD_CONFIG: 'tesla_play_cloud_config_v1',
  USER_PROFILE: 'tesla_play_oauth_profile_v1',
  WATCH_HISTORY: 'tesla_play_watch_history_v1',
  LIKED_VIDEOS: 'tesla_play_liked_videos_v1',
  HARDWARE_PROFILE: 'tesla_play_mcu_profile_v1',
};

export function App() {
  // Navigation & Vehicle State
  const [activeModule, setActiveModule] = useState<ModuleId>('youtube');
  const [activeYoutubeTab, setActiveYoutubeTab] = useState<YoutubeTabId>('home');
  const [drivingState, setDrivingState] = useState<DrivingState>('PARK');
  const [isViewportMaximized, setIsViewportMaximized] = useState<boolean>(false);
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState<boolean>(false);

  // Hardware Optimization Profile (MCU2 Atom 720p vs MCU3 Ryzen 1080p)
  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.HARDWARE_PROFILE);
    return saved === 'MCU2_ATOM' || saved === 'MCU3_RYZEN' ? saved : 'MCU3_RYZEN';
  });

  const resolution = hardwareProfile === 'MCU2_ATOM' ? 'hd720' : 'hd1080';

  // Cloud Config (Environment variables or localStorage)
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>(() => {
    const envClientId =
      (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';
    const envApiKey =
      (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined) || '';
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CLOUD_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CloudConfig>;
        return {
          googleClientId: parsed.googleClientId || envClientId,
          youtubeApiKey: parsed.youtubeApiKey || envApiKey,
        };
      }
    } catch {
      // ignore
    }
    return {
      googleClientId: envClientId,
      youtubeApiKey: envApiKey,
    };
  });

  // Google OAuth 2.0 User Profile
  const [userProfile, setUserProfile] = useState<GoogleUserProfile | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
      if (raw) {
        const parsed = JSON.parse(raw) as GoogleUserProfile;
        if (parsed.expiresAt > Date.now()) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return null;
  });

  // YouTube Data State
  const [videos, setVideos] = useState<YouTubeVideo[]>(DEFAULT_FEATURED_VIDEOS);
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>(DEFAULT_PLAYLISTS);
  const [selectedPlaylist, setSelectedPlaylist] = useState<YouTubePlaylist | null>(
    DEFAULT_PLAYLISTS[0]
  );
  const [likedVideos, setLikedVideos] = useState<YouTubeVideo[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LIKED_VIDEOS);
      if (raw) return JSON.parse(raw) as YouTubeVideo[];
    } catch {
      // ignore
    }
    return DEFAULT_LIKED_VIDEOS;
  });
  const [watchHistory, setWatchHistory] = useState<YouTubeVideo[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.WATCH_HISTORY);
      if (raw) return JSON.parse(raw) as YouTubeVideo[];
    } catch {
      // ignore
    }
    return [DEFAULT_FEATURED_VIDEOS[0], DEFAULT_FEATURED_VIDEOS[1]];
  });
  const [subscriptions, setSubscriptions] = useState<YouTubeSubscription[]>(
    DEFAULT_SUBSCRIPTIONS
  );

  // Player & Queue State
  const [queue, setQueue] = useState<YouTubeVideo[]>(
    DEFAULT_PLAYLISTS[0].items || DEFAULT_FEATURED_VIDEOS
  );
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number>(0);
  const [currentVideo, setCurrentVideo] = useState<YouTubeVideo>(
    (DEFAULT_PLAYLISTS[0].items && DEFAULT_PLAYLISTS[0].items[0]) ||
      DEFAULT_FEATURED_VIDEOS[0]
  );
  const [activePlaylistTitle, setActivePlaylistTitle] = useState<string>(
    DEFAULT_PLAYLISTS[0].title
  );

  // API Loading & Status Feedback
  const [isLoadingApi, setIsLoadingApi] = useState<boolean>(false);
  const [apiStatusBanner, setApiStatusBanner] = useState<string | null>(null);

  // Persist hardware profile
  const handleSelectHardwareProfile = useCallback((profile: HardwareProfile) => {
    setHardwareProfile(profile);
    localStorage.setItem(STORAGE_KEYS.HARDWARE_PROFILE, profile);
  }, []);

  const handleToggleHardwareProfile = useCallback(() => {
    setHardwareProfile((prev) => {
      const next = prev === 'MCU2_ATOM' ? 'MCU3_RYZEN' : 'MCU2_ATOM';
      localStorage.setItem(STORAGE_KEYS.HARDWARE_PROFILE, next);
      return next;
    });
  }, []);

  // Keyboard Escape handler to exit CSS Viewport Maximization
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isViewportMaximized) {
        setIsViewportMaximized(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isViewportMaximized]);

  // Record video to local Watch History
  const pushToWatchHistory = useCallback((video: YouTubeVideo) => {
    setWatchHistory((prev) => {
      const filtered = prev.filter((v) => v.id !== video.id);
      const updated = [video, ...filtered].slice(0, 30);
      localStorage.setItem(STORAGE_KEYS.WATCH_HISTORY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Select a video & optional queue
  const handleSelectVideo = useCallback(
    (
      video: YouTubeVideo,
      customQueue?: YouTubeVideo[],
      playlistTitle?: string
    ) => {
      setCurrentVideo(video);
      pushToWatchHistory(video);
      if (customQueue && customQueue.length > 0) {
        setQueue(customQueue);
        const idx = customQueue.findIndex((item) => item.id === video.id);
        setCurrentQueueIndex(idx >= 0 ? idx : 0);
      }
      if (playlistTitle) {
        setActivePlaylistTitle(playlistTitle);
      }
    },
    [pushToWatchHistory]
  );

  // Next / Prev in Continuous Playlist Queue
  const handleNextVideo = useCallback(() => {
    if (queue.length === 0) return;
    const nextIdx = (currentQueueIndex + 1) % queue.length;
    const nextVid = queue[nextIdx];
    if (nextVid) {
      setCurrentQueueIndex(nextIdx);
      setCurrentVideo(nextVid);
      pushToWatchHistory(nextVid);
    }
  }, [queue, currentQueueIndex, pushToWatchHistory]);

  const handlePrevVideo = useCallback(() => {
    if (queue.length === 0) return;
    const prevIdx = (currentQueueIndex - 1 + queue.length) % queue.length;
    const prevVid = queue[prevIdx];
    if (prevVid) {
      setCurrentQueueIndex(prevIdx);
      setCurrentVideo(prevVid);
      pushToWatchHistory(prevVid);
    }
  }, [queue, currentQueueIndex, pushToWatchHistory]);

  // Toggle Like in Library
  const handleToggleLike = useCallback((video: YouTubeVideo) => {
    setLikedVideos((prev) => {
      const exists = prev.some((v) => v.id === video.id);
      const updated = exists
        ? prev.filter((v) => v.id !== video.id)
        : [video, ...prev];
      localStorage.setItem(STORAGE_KEYS.LIKED_VIDEOS, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Synchronize playlists.list, videos.list (myRating=like) and subscriptions.list via YouTube Data API v3
  const syncYoutubeAccountData = useCallback(async (accessToken: string) => {
    setIsLoadingApi(true);
    setApiStatusBanner(
      'Sincronizando playlists.list, vídeos com Gostei e inscrições via YouTube Data API v3...'
    );
    try {
      const [userPlaylists, userLiked, userSubs] = await Promise.allSettled([
        fetchUserPlaylists(accessToken),
        fetchLikedVideos(accessToken),
        fetchUserSubscriptions(accessToken),
      ]);

      if (
        userPlaylists.status === 'fulfilled' &&
        userPlaylists.value.length > 0
      ) {
        // Also fetch playlistItems.list for the first playlist automatically
        const firstPl = userPlaylists.value[0];
        try {
          const firstItems = await fetchPlaylistItems(firstPl.id, accessToken);
          firstPl.items = firstItems;
        } catch {
          // ignore
        }
        setPlaylists([...userPlaylists.value, ...DEFAULT_PLAYLISTS]);
        setSelectedPlaylist(firstPl);
      }

      if (userLiked.status === 'fulfilled' && userLiked.value.length > 0) {
        setLikedVideos(userLiked.value);
      }

      if (userSubs.status === 'fulfilled' && userSubs.value.length > 0) {
        setSubscriptions(userSubs.value);
      }

      setApiStatusBanner(
        'Conta Google sincronizada com sucesso via YouTube Data API v3 (escopo youtube.readonly).'
      );
      setTimeout(() => setApiStatusBanner(null), 5000);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Falha ao consultar YouTube Data API v3';
      setApiStatusBanner(msg);
    } finally {
      setIsLoadingApi(false);
    }
  }, []);

  // Trigger Google Identity Services OAuth 2.0 Login
  const handleTriggerGoogleLogin = useCallback(() => {
    if (!cloudConfig.googleClientId) {
      setActiveModule('roadmap');
      setApiStatusBanner(
        'Informe seu Google OAuth 2.0 Client ID no painel abaixo para iniciar o fluxo Google Identity Services (youtube.readonly).'
      );
      return;
    }

    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      setApiStatusBanner(
        'Aguardando script Google Identity Services (accounts.google.com/gsi/client). Verifique a conexão HTTPS.'
      );
      return;
    }

    const tokenClient = oauth2.initTokenClient({
      client_id: cloudConfig.googleClientId,
      scope: YOUTUBE_READONLY_SCOPE,
      callback: async (response) => {
        if (response.error || !response.access_token) {
          setApiStatusBanner(
            `Erro OAuth 2.0: ${response.error_description || response.error || 'Acesso negado'}`
          );
          return;
        }

        const profile = await fetchGoogleUserProfile(
          response.access_token,
          response.expires_in
        );
        setUserProfile(profile);
        localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
        setActiveModule('youtube');
        await syncYoutubeAccountData(response.access_token);
      },
      error_callback: (err) => {
        setApiStatusBanner(
          `Popup OAuth interrompido: ${err.message || err.type || 'Verifique a origem autorizada'}`
        );
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  }, [cloudConfig.googleClientId, syncYoutubeAccountData]);

  const handleLogoutGoogle = useCallback(() => {
    if (userProfile?.accessToken && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(userProfile.accessToken);
    }
    setUserProfile(null);
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
    setPlaylists(DEFAULT_PLAYLISTS);
    setSubscriptions(DEFAULT_SUBSCRIPTIONS);
    setApiStatusBanner('Sessão Google OAuth 2.0 encerrada.');
  }, [userProfile]);

  // Select Playlist & load playlistItems.list if needed
  const handleSelectPlaylist = useCallback(
    async (playlist: YouTubePlaylist) => {
      if (playlist.items && playlist.items.length > 0) {
        setSelectedPlaylist(playlist);
        handleSelectVideo(playlist.items[0], playlist.items, playlist.title);
        return;
      }

      setIsLoadingApi(true);
      setApiStatusBanner(
        `Carregando playlistItems.list para "${playlist.title}"...`
      );
      try {
        const items = await fetchPlaylistItems(
          playlist.id,
          userProfile?.accessToken,
          cloudConfig.youtubeApiKey
        );
        const hydrated: YouTubePlaylist = {
          ...playlist,
          items: items.length > 0 ? items : DEFAULT_FEATURED_VIDEOS.slice(0, 4),
          itemCount: items.length || playlist.itemCount,
        };
        setPlaylists((prev) =>
          prev.map((p) => (p.id === playlist.id ? hydrated : p))
        );
        setSelectedPlaylist(hydrated);
        if (hydrated.items && hydrated.items[0]) {
          handleSelectVideo(
            hydrated.items[0],
            hydrated.items,
            hydrated.title
          );
        }
        setApiStatusBanner(null);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Erro ao consultar playlistItems.list';
        setApiStatusBanner(msg);
      } finally {
        setIsLoadingApi(false);
      }
    },
    [userProfile?.accessToken, cloudConfig.youtubeApiKey, handleSelectVideo]
  );

  // Load any custom YouTube Playlist ID via playlistItems.list
  const handleLoadCustomPlaylistId = useCallback(
    async (rawInput: string) => {
      let playlistId = rawInput.trim();
      try {
        const url = new URL(playlistId);
        const listParam = url.searchParams.get('list');
        if (listParam) playlistId = listParam;
      } catch {
        // already a raw playlist ID
      }

      if (!userProfile?.accessToken && !cloudConfig.youtubeApiKey) {
        setApiStatusBanner(
          'Para importar um ID de Playlist externo via playlistItems.list, configure sua YouTube API Key ou faça login OAuth 2.0.'
        );
        return;
      }

      setIsLoadingApi(true);
      try {
        const items = await fetchPlaylistItems(
          playlistId,
          userProfile?.accessToken,
          cloudConfig.youtubeApiKey
        );
        if (items.length === 0) {
          setApiStatusBanner(
            `Nenhum vídeo público retornado para a playlist ${playlistId}.`
          );
          return;
        }
        const customPl: YouTubePlaylist = {
          id: playlistId,
          title: `Playlist Importada (${playlistId.slice(0, 10)})`,
          description: 'Carregada diretamente via endpoint playlistItems.list',
          thumbnail: items[0].thumbnail,
          itemCount: items.length,
          channelTitle: items[0].channelTitle,
          items,
        };
        setPlaylists((prev) => [customPl, ...prev]);
        setSelectedPlaylist(customPl);
        handleSelectVideo(items[0], items, customPl.title);
        setApiStatusBanner(null);
      } catch (err) {
        setApiStatusBanner(
          err instanceof Error
            ? err.message
            : 'Falha ao carregar playlistItems.list'
        );
      } finally {
        setIsLoadingApi(false);
      }
    },
    [userProfile?.accessToken, cloudConfig.youtubeApiKey, handleSelectVideo]
  );

  // Search Videos or Direct Video URL / ID
  const handleSearchSubmit = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        setVideos(DEFAULT_FEATURED_VIDEOS);
        setApiStatusBanner(null);
        return;
      }

      // Check if user pasted a direct YouTube Video URL or 11-char Video ID
      const directVideoId = extractYouTubeVideoId(trimmed);
      if (directVideoId) {
        const customVideo: YouTubeVideo = {
          id: directVideoId,
          title: `Vídeo Direto YouTube (${directVideoId})`,
          channelTitle: 'Carregamento Direto via /embed/VIDEO_ID',
          thumbnail: `https://i.ytimg.com/vi/${directVideoId}/hqdefault.jpg`,
          publishedAt: 'Agora',
          duration: 'HD EMBED',
        };
        setVideos((prev) => [
          customVideo,
          ...prev.filter((v) => v.id !== directVideoId),
        ]);
        handleSelectVideo(customVideo, [customVideo, ...queue], 'Link Direto');
        setActiveYoutubeTab('home');
        setApiStatusBanner(
          `Reproduzindo diretamente /embed/${directVideoId} na YouTube IFrame Player API.`
        );
        return;
      }

      setActiveYoutubeTab('home');

      // If OAuth token or API key is configured, query official YouTube Data API v3 search.list
      if (userProfile?.accessToken || cloudConfig.youtubeApiKey) {
        setIsLoadingApi(true);
        setApiStatusBanner(`Buscando "${trimmed}" na YouTube Data API v3...`);
        try {
          const results = await searchYouTubeVideos(
            trimmed,
            userProfile?.accessToken,
            cloudConfig.youtubeApiKey
          );
          if (results.length > 0) {
            setVideos(results);
            setApiStatusBanner(null);
            return;
          }
        } catch (err) {
          setApiStatusBanner(
            err instanceof Error
              ? err.message
              : 'Erro na busca da API. Exibindo catálogo local filtrado.'
          );
        } finally {
          setIsLoadingApi(false);
        }
      }

      // Local catalog smart filter fallback
      const lower = trimmed.toLowerCase();
      const filtered = DEFAULT_FEATURED_VIDEOS.filter(
        (v) =>
          v.title.toLowerCase().includes(lower) ||
          v.channelTitle.toLowerCase().includes(lower) ||
          (v.description && v.description.toLowerCase().includes(lower))
      );

      if (filtered.length > 0) {
        setVideos(filtered);
        setApiStatusBanner(
          userProfile?.accessToken || cloudConfig.youtubeApiKey
            ? null
            : `Exibindo ${filtered.length} resultado(s) do catálogo embarcado. Conecte o Google OAuth ou API Key para buscar em todo o YouTube.`
        );
      } else {
        setVideos(DEFAULT_FEATURED_VIDEOS);
        setApiStatusBanner(
          `Dica: Cole qualquer link ou ID de vídeo do YouTube na busca para tocá-lo imediatamente, ou configure sua API Key em "Cloud & Guia".`
        );
      }
    },
    [
      userProfile?.accessToken,
      cloudConfig.youtubeApiKey,
      handleSelectVideo,
      queue,
    ]
  );

  // Load videos from a subscribed channel
  const handleSelectSubscriptionChannel = useCallback(
    async (sub: YouTubeSubscription) => {
      setActiveYoutubeTab('home');
      if (userProfile?.accessToken || cloudConfig.youtubeApiKey) {
        setIsLoadingApi(true);
        setApiStatusBanner(`Carregando envios de ${sub.title}...`);
        try {
          const channelVideos = await searchYouTubeVideos(
            '',
            userProfile?.accessToken,
            cloudConfig.youtubeApiKey,
            sub.channelId
          );
          if (channelVideos.length > 0) {
            setVideos(channelVideos);
            handleSelectVideo(channelVideos[0], channelVideos, sub.title);
            setApiStatusBanner(null);
            return;
          }
        } catch {
          // fallback below
        } finally {
          setIsLoadingApi(false);
        }
      }

      const matching = DEFAULT_FEATURED_VIDEOS.filter(
        (v) =>
          v.channelId === sub.channelId ||
          v.channelTitle.toLowerCase().includes(sub.title.toLowerCase())
      );
      const list = matching.length > 0 ? matching : DEFAULT_FEATURED_VIDEOS;
      setVideos(list);
      handleSelectVideo(list[0], list, sub.title);
    },
    [userProfile?.accessToken, cloudConfig.youtubeApiKey, handleSelectVideo]
  );

  // Save Cloud Config
  const handleSaveCloudConfig = useCallback((newConfig: CloudConfig) => {
    setCloudConfig(newConfig);
    localStorage.setItem(STORAGE_KEYS.CLOUD_CONFIG, JSON.stringify(newConfig));
  }, []);

  const isCurrentVideoLiked = likedVideos.some((v) => v.id === currentVideo.id);

  return (
    <div
      className={`tesla-shell ${
        hardwareProfile === 'MCU2_ATOM' ? 'tesla-shell--mcu2-eco' : ''
      } ${drivingState === 'DRIVE' ? 'tesla-shell--drive-active' : ''}`}
    >
      {/* 4) Menu Lateral Fixo (Dock) */}
      <TeslaDock
        activeModule={activeModule}
        drivingState={drivingState}
        isAuthenticated={Boolean(userProfile)}
        onSelectModule={(mod) => setActiveModule(mod)}
        onToggleDrivingState={() =>
          setDrivingState((prev) => (prev === 'PARK' ? 'DRIVE' : 'PARK'))
        }
        onOpenSafetyModal={() => setIsSafetyModalOpen(true)}
      />

      {/* Main Content Workspace */}
      <main className="tesla-workspace">
        {/* Top Automotive Telemetry & Status Strip */}
        <div className="tesla-statusbar">
          <div className="tesla-statusbar__left">
            <span
              className={`drive-mode-indicator ${
                drivingState === 'DRIVE'
                  ? 'drive-mode-indicator--drive'
                  : 'drive-mode-indicator--park'
              }`}
            >
              {drivingState === 'PARK'
                ? 'ESTACIONADO (PARK)'
                : 'EM MOVIMENTO (DRIVE · CSS VIEWPORT ATIVA)'}
            </span>
            <span className="statusbar-divider">•</span>
            <span className="statusbar-note">
              Passageiros: Reprodução contínua via YouTube IFrame API sem bloqueio
              X-Frame-Options
            </span>
          </div>

          <div className="tesla-statusbar__right">
            <span className="statusbar-tag">
              HTTPS OAuth 2.0
            </span>
            <span className="statusbar-tag">
              {hardwareProfile === 'MCU2_ATOM'
                ? 'MCU2 Atom · 720p'
                : 'MCU3 Ryzen · 1080p'}
            </span>
          </div>
        </div>

        {/* Active Module: YouTube (Split Cockpit or CSS Full Viewport) */}
        {activeModule === 'youtube' && (
          <div className="youtube-cockpit-grid">
            <YouTubePlayerDeck
              currentVideo={currentVideo}
              queue={queue}
              currentQueueIndex={currentQueueIndex}
              activePlaylistTitle={activePlaylistTitle}
              hardwareProfile={hardwareProfile}
              resolution={resolution}
              drivingState={drivingState}
              isViewportMaximized={isViewportMaximized}
              isLiked={isCurrentVideoLiked}
              onToggleViewportMaximize={() =>
                setIsViewportMaximized((prev) => !prev)
              }
              onSelectQueueVideo={(video, index) => {
                setCurrentQueueIndex(index);
                setCurrentVideo(video);
                pushToWatchHistory(video);
              }}
              onNextVideo={handleNextVideo}
              onPrevVideo={handlePrevVideo}
              onToggleHardwareProfile={handleToggleHardwareProfile}
              onToggleLike={handleToggleLike}
            />

            <YouTubeModulePanel
              activeTab={activeYoutubeTab}
              videos={videos}
              playlists={playlists}
              selectedPlaylist={selectedPlaylist}
              likedVideos={likedVideos}
              watchHistory={watchHistory}
              subscriptions={subscriptions}
              currentVideo={currentVideo}
              userProfile={userProfile}
              isLoadingApi={isLoadingApi}
              apiStatusBanner={apiStatusBanner}
              onSelectTab={setActiveYoutubeTab}
              onSearchSubmit={handleSearchSubmit}
              onSelectVideo={handleSelectVideo}
              onSelectPlaylist={handleSelectPlaylist}
              onLoadCustomPlaylistId={handleLoadCustomPlaylistId}
              onSelectSubscriptionChannel={handleSelectSubscriptionChannel}
              onTriggerGoogleLogin={handleTriggerGoogleLogin}
              onSyncUserData={() =>
                userProfile && syncYoutubeAccountData(userProfile.accessToken)
              }
              onOpenCloudConfig={() => setActiveModule('roadmap')}
              onClearHistory={() => {
                setWatchHistory([]);
                localStorage.removeItem(STORAGE_KEYS.WATCH_HISTORY);
              }}
            />
          </div>
        )}

        {/* Reserved Future Modules: IPTV, Plex, Games, Radio ("Em breve") */}
        {(activeModule === 'iptv' ||
          activeModule === 'plex' ||
          activeModule === 'games' ||
          activeModule === 'radio') && (
          <ReservedModuleView
            moduleId={activeModule}
            onReturnToYoutube={() => setActiveModule('youtube')}
            onOpenRoadmap={() => setActiveModule('roadmap')}
          />
        )}

        {/* Cloud Configuration & Roadmap Module */}
        {activeModule === 'roadmap' && (
          <RoadmapAndCloudView
            cloudConfig={cloudConfig}
            userProfile={userProfile}
            authStatusMessage={apiStatusBanner}
            onSaveCloudConfig={handleSaveCloudConfig}
            onTriggerGoogleLogin={handleTriggerGoogleLogin}
            onLogoutGoogle={handleLogoutGoogle}
            onReturnToYoutube={() => setActiveModule('youtube')}
          />
        )}
      </main>

      {/* Firmware, Viewport & Passenger Legal Responsibility Modal */}
      <SafetyAndFirmwareModal
        isOpen={isSafetyModalOpen}
        hardwareProfile={hardwareProfile}
        drivingState={drivingState}
        onClose={() => setIsSafetyModalOpen(false)}
        onSelectHardwareProfile={handleSelectHardwareProfile}
      />
    </div>
  );
}

export default App;
