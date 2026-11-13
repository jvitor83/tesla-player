import React, { useState } from 'react';
import {
  Search,
  LogIn,
  RefreshCw,
  Compass,
  ListVideo,
  Library,
  Users,
  Play,
  Heart,
  Clock,
  Settings,
  CheckCircle2,
  AlertCircle,
  Link2,
  ListPlus,
} from 'lucide-react';
import type {
  YoutubeTabId,
  YouTubeVideo,
  YouTubePlaylist,
  YouTubeSubscription,
  GoogleUserProfile,
} from '../types/tesla';

interface YouTubeModulePanelProps {
  activeTab: YoutubeTabId;
  videos: YouTubeVideo[];
  playlists: YouTubePlaylist[];
  selectedPlaylist: YouTubePlaylist | null;
  likedVideos: YouTubeVideo[];
  watchHistory: YouTubeVideo[];
  subscriptions: YouTubeSubscription[];
  currentVideo: YouTubeVideo;
  userProfile: GoogleUserProfile | null;
  isLoadingApi: boolean;
  apiStatusBanner: string | null;
  onSelectTab: (tab: YoutubeTabId) => void;
  onSearchSubmit: (query: string) => void;
  onSelectVideo: (video: YouTubeVideo, customQueue?: YouTubeVideo[], playlistTitle?: string) => void;
  onSelectPlaylist: (playlist: YouTubePlaylist) => void;
  onLoadCustomPlaylistId: (playlistId: string) => void;
  onSelectSubscriptionChannel: (sub: YouTubeSubscription) => void;
  onTriggerGoogleLogin: () => void;
  onSyncUserData: () => void;
  onOpenCloudConfig: () => void;
  onClearHistory: () => void;
}

export const YouTubeModulePanel: React.FC<YouTubeModulePanelProps> = ({
  activeTab,
  videos,
  playlists,
  selectedPlaylist,
  likedVideos,
  watchHistory,
  subscriptions,
  currentVideo,
  userProfile,
  isLoadingApi,
  apiStatusBanner,
  onSelectTab,
  onSearchSubmit,
  onSelectVideo,
  onSelectPlaylist,
  onLoadCustomPlaylistId,
  onSelectSubscriptionChannel,
  onTriggerGoogleLogin,
  onSyncUserData,
  onOpenCloudConfig,
  onClearHistory,
}) => {
  const [searchText, setSearchText] = useState('');
  const [customPlaylistInput, setCustomPlaylistInput] = useState('');
  const [librarySubView, setLibrarySubView] = useState<'liked' | 'history'>('liked');

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchSubmit(searchText);
  };

  const handleCustomPlaylistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPlaylistInput.trim()) return;
    onLoadCustomPlaylistId(customPlaylistInput.trim());
    setCustomPlaylistInput('');
  };

  return (
    <section
      id="youtube-catalog-panel"
      className="yt-panel"
      aria-label="Navegador YouTube Data API v3"
    >
      {/* Search Bar & Google OAuth 2.0 Profile Header */}
      <header className="yt-panel__header">
        <form onSubmit={handleFormSubmit} className="yt-search-form">
          <div className="yt-search-form__input-wrap">
            <Search size={20} className="yt-search-form__icon" />
            <input
              id="input-youtube-search"
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Buscar no YouTube ou colar link / ID do vídeo..."
              className="yt-search-form__input"
              aria-label="Buscar vídeos ou colar URL do YouTube"
            />
          </div>
          <button
            id="btn-youtube-search-submit"
            type="submit"
            className="tesla-btn tesla-btn--primary yt-search-form__btn"
            disabled={isLoadingApi}
          >
            {isLoadingApi ? <RefreshCw size={18} className="spin-icon" /> : <Search size={18} />}
            <span>Buscar</span>
          </button>
        </form>

        {/* Google Identity Services Profile / Login Area */}
        <div className="yt-panel__auth-box">
          {userProfile ? (
            <div className="auth-profile-pill">
              {userProfile.picture ? (
                <img
                  src={userProfile.picture}
                  alt={userProfile.name}
                  className="auth-profile-pill__avatar"
                />
              ) : (
                <div className="auth-profile-pill__avatar-fallback">
                  {userProfile.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="auth-profile-pill__meta">
                <strong>{userProfile.name}</strong>
                <span>
                  <CheckCircle2 size={12} /> youtube.readonly
                </span>
              </div>
              <button
                id="btn-sync-youtube-api"
                type="button"
                className="transport-btn"
                onClick={onSyncUserData}
                title="Atualizar playlists.list e Biblioteca via YouTube Data API v3"
              >
                <RefreshCw size={18} className={isLoadingApi ? 'spin-icon' : ''} />
              </button>
            </div>
          ) : (
            <button
              id="btn-google-oauth-login"
              type="button"
              className="tesla-btn tesla-btn--oauth"
              onClick={onTriggerGoogleLogin}
              title="Autenticar via Google Identity Services com escopo youtube.readonly"
            >
              <LogIn size={19} />
              <span>Login Google OAuth</span>
            </button>
          )}

          <button
            id="btn-open-cloud-settings"
            type="button"
            className="transport-btn"
            onClick={onOpenCloudConfig}
            title="Configurar Client ID OAuth 2.0 e Chave da YouTube Data API v3"
            aria-label="Configurações da Nuvem"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Primary Module Tabs (Minimum 48x48px touch targets) */}
      <div className="yt-tabs" role="tablist" aria-label="Abas do Módulo YouTube">
        <button
          id="tab-yt-home"
          type="button"
          role="tab"
          aria-selected={activeTab === 'home'}
          className={`yt-tab-btn ${activeTab === 'home' ? 'yt-tab-btn--active' : ''}`}
          onClick={() => onSelectTab('home')}
        >
          <Compass size={20} />
          <span>Explorar &amp; Busca</span>
        </button>

        <button
          id="tab-yt-playlists"
          type="button"
          role="tab"
          aria-selected={activeTab === 'playlists'}
          className={`yt-tab-btn ${activeTab === 'playlists' ? 'yt-tab-btn--active' : ''}`}
          onClick={() => onSelectTab('playlists')}
        >
          <ListVideo size={20} />
          <span>Playlists ({playlists.length})</span>
        </button>

        <button
          id="tab-yt-library"
          type="button"
          role="tab"
          aria-selected={activeTab === 'library'}
          className={`yt-tab-btn ${activeTab === 'library' ? 'yt-tab-btn--active' : ''}`}
          onClick={() => onSelectTab('library')}
        >
          <Library size={20} />
          <span>Biblioteca ({likedVideos.length + watchHistory.length})</span>
        </button>

        <button
          id="tab-yt-subscriptions"
          type="button"
          role="tab"
          aria-selected={activeTab === 'subscriptions'}
          className={`yt-tab-btn ${activeTab === 'subscriptions' ? 'yt-tab-btn--active' : ''}`}
          onClick={() => onSelectTab('subscriptions')}
        >
          <Users size={20} />
          <span>Inscrições ({subscriptions.length})</span>
        </button>
      </div>

      {/* API Status or Info Banner */}
      {apiStatusBanner && (
        <div className="yt-api-banner" role="status">
          <AlertCircle size={17} />
          <span>{apiStatusBanner}</span>
        </div>
      )}

      {/* Tab Content Area */}
      <div className="yt-panel__content">
        {/* TAB 1: HOME / SEARCH RESULTS */}
        {activeTab === 'home' && (
          <div className="yt-video-grid">
            {videos.map((video) => {
              const isPlayingNow = video.id === currentVideo.id;
              return (
                <article
                  key={video.id}
                  className={`yt-video-card ${
                    isPlayingNow ? 'yt-video-card--playing' : ''
                  }`}
                >
                  <button
                    id={`btn-play-video-${video.id}`}
                    type="button"
                    className="yt-video-card__touch-area"
                    onClick={() =>
                      onSelectVideo(video, videos, 'Catálogo Principal')
                    }
                  >
                    <div className="yt-video-card__thumb-wrap">
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        loading="lazy"
                        className="yt-video-card__thumb"
                      />
                      {video.duration && (
                        <span
                          className={`yt-video-card__duration ${
                            video.duration === 'AO VIVO'
                              ? 'yt-video-card__duration--live'
                              : ''
                          }`}
                        >
                          {video.duration}
                        </span>
                      )}
                      <div className="yt-video-card__play-overlay">
                        <Play size={24} fill="currentColor" />
                        <span>{isPlayingNow ? 'Reproduzindo' : 'Reproduzir'}</span>
                      </div>
                    </div>

                    <div className="yt-video-card__body">
                      <h3 className="yt-video-card__title">{video.title}</h3>
                      <div className="yt-video-card__meta">
                        <span className="yt-video-card__channel">
                          {video.channelTitle}
                        </span>
                        {video.viewCount && <span>· {video.viewCount}</span>}
                      </div>
                    </div>
                  </button>
                </article>
              );
            })}
          </div>
        )}

        {/* TAB 2: PLAYLISTS (playlists.list + playlistItems.list) */}
        {activeTab === 'playlists' && (
          <div className="yt-playlists-view">
            {/* Custom Playlist ID Loader */}
            <form
              onSubmit={handleCustomPlaylistSubmit}
              className="custom-playlist-bar"
            >
              <div className="custom-playlist-bar__input">
                <Link2 size={18} />
                <input
                  id="input-custom-playlist-id"
                  type="text"
                  value={customPlaylistInput}
                  onChange={(e) => setCustomPlaylistInput(e.target.value)}
                  placeholder="Importar Playlist por ID (ex: PL...) via playlistItems.list"
                />
              </div>
              <button
                id="btn-load-custom-playlist"
                type="submit"
                className="touch-pill-btn touch-pill-btn--primary"
              >
                <ListPlus size={17} />
                <span>Carregar Playlist</span>
              </button>
            </form>

            <div className="yt-playlists-grid">
              {playlists.map((pl) => {
                const isSelected = selectedPlaylist?.id === pl.id;
                return (
                  <button
                    key={pl.id}
                    id={`btn-playlist-${pl.id}`}
                    type="button"
                    className={`yt-playlist-card ${
                      isSelected ? 'yt-playlist-card--active' : ''
                    }`}
                    onClick={() => onSelectPlaylist(pl)}
                  >
                    <div className="yt-playlist-card__thumb-wrap">
                      <img
                        src={pl.thumbnail}
                        alt={pl.title}
                        loading="lazy"
                        className="yt-playlist-card__thumb"
                      />
                      <span className="yt-playlist-card__count">
                        {pl.itemCount} vídeos
                      </span>
                    </div>
                    <div className="yt-playlist-card__info">
                      <h3>{pl.title}</h3>
                      <p>{pl.description}</p>
                      <span className="yt-playlist-card__cta">
                        <Play size={15} fill="currentColor" /> Tocar Sequência Contínua
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedPlaylist && selectedPlaylist.items && (
              <div className="selected-playlist-items">
                <div className="selected-playlist-items__header">
                  <div>
                    <span className="section-eyebrow">
                      ENDPOINT: playlistItems.list
                    </span>
                    <h3>Itens de &quot;{selectedPlaylist.title}&quot;</h3>
                  </div>
                  <button
                    id="btn-play-all-playlist"
                    type="button"
                    className="tesla-btn tesla-btn--primary"
                    onClick={() => {
                      if (selectedPlaylist.items?.[0]) {
                        onSelectVideo(
                          selectedPlaylist.items[0],
                          selectedPlaylist.items,
                          selectedPlaylist.title
                        );
                      }
                    }}
                  >
                    <Play size={18} fill="currentColor" />
                    <span>Reproduzir Tudo</span>
                  </button>
                </div>

                <div className="playlist-tracks-list">
                  {selectedPlaylist.items.map((item, idx) => {
                    const active = item.id === currentVideo.id;
                    return (
                      <button
                        key={`${item.id}-${idx}`}
                        id={`btn-playlist-track-${idx}`}
                        type="button"
                        className={`playlist-track-row ${
                          active ? 'playlist-track-row--active' : ''
                        }`}
                        onClick={() =>
                          onSelectVideo(
                            item,
                            selectedPlaylist.items,
                            selectedPlaylist.title
                          )
                        }
                      >
                        <span className="playlist-track-row__num">{idx + 1}</span>
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          loading="lazy"
                          className="playlist-track-row__thumb"
                        />
                        <div className="playlist-track-row__text">
                          <strong>{item.title}</strong>
                          <small>{item.channelTitle}</small>
                        </div>
                        {item.duration && (
                          <span className="playlist-track-row__dur">
                            {item.duration}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LIBRARY (LIKED VIDEOS & VEHICLE WATCH HISTORY) */}
        {activeTab === 'library' && (
          <div className="yt-library-view">
            <div className="yt-library-subbar">
              <div className="yt-library-toggles">
                <button
                  id="btn-lib-liked"
                  type="button"
                  className={`touch-pill-btn ${
                    librarySubView === 'liked' ? 'touch-pill-btn--primary' : ''
                  }`}
                  onClick={() => setLibrarySubView('liked')}
                >
                  <Heart size={17} />
                  <span>Marcados com &quot;Gostei&quot; ({likedVideos.length})</span>
                </button>
                <button
                  id="btn-lib-history"
                  type="button"
                  className={`touch-pill-btn ${
                    librarySubView === 'history' ? 'touch-pill-btn--primary' : ''
                  }`}
                  onClick={() => setLibrarySubView('history')}
                >
                  <Clock size={17} />
                  <span>Histórico no Veículo ({watchHistory.length})</span>
                </button>
              </div>

              {librarySubView === 'history' && watchHistory.length > 0 && (
                <button
                  id="btn-clear-watch-history"
                  type="button"
                  className="touch-pill-btn"
                  onClick={onClearHistory}
                >
                  Limpar Histórico
                </button>
              )}
            </div>

            <div className="yt-video-grid">
              {(librarySubView === 'liked' ? likedVideos : watchHistory).map(
                (video, idx) => {
                  const isPlayingNow = video.id === currentVideo.id;
                  const sourceList =
                    librarySubView === 'liked' ? likedVideos : watchHistory;
                  const sourceTitle =
                    librarySubView === 'liked'
                      ? 'Vídeos com Gostei'
                      : 'Histórico Recente';
                  return (
                    <article
                      key={`${video.id}-${idx}`}
                      className={`yt-video-card ${
                        isPlayingNow ? 'yt-video-card--playing' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="yt-video-card__touch-area"
                        onClick={() =>
                          onSelectVideo(video, sourceList, sourceTitle)
                        }
                      >
                        <div className="yt-video-card__thumb-wrap">
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            loading="lazy"
                            className="yt-video-card__thumb"
                          />
                          {video.duration && (
                            <span className="yt-video-card__duration">
                              {video.duration}
                            </span>
                          )}
                        </div>
                        <div className="yt-video-card__body">
                          <h3 className="yt-video-card__title">{video.title}</h3>
                          <div className="yt-video-card__meta">
                            <span className="yt-video-card__channel">
                              {video.channelTitle}
                            </span>
                          </div>
                        </div>
                      </button>
                    </article>
                  );
                }
              )}
            </div>
          </div>
        )}

        {/* TAB 4: SUBSCRIPTIONS (subscriptions.list) */}
        {activeTab === 'subscriptions' && (
          <div className="yt-subscriptions-grid">
            {subscriptions.map((sub) => (
              <button
                key={sub.id}
                id={`btn-subscription-${sub.id}`}
                type="button"
                className="yt-sub-card"
                onClick={() => onSelectSubscriptionChannel(sub)}
              >
                <img
                  src={sub.thumbnail}
                  alt={sub.title}
                  loading="lazy"
                  className="yt-sub-card__avatar"
                />
                <div className="yt-sub-card__body">
                  <h3>{sub.title}</h3>
                  <p>{sub.description}</p>
                  <span className="yt-sub-card__action">
                    Ver vídeos do canal →
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
