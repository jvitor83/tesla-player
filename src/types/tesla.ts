export type ModuleId = 'youtube' | 'more_soon' | 'roadmap';

export type YoutubeTabId = 'home' | 'playlists' | 'library' | 'subscriptions';

export type HardwareProfile = 'MCU2_ATOM' | 'MCU3_RYZEN';

export type ResolutionQuality = 'hd720' | 'hd1080';

export type PlaybackMode = 'backendless' | 'external' | 'iframe' | 'local';


export interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  channelId?: string;
  thumbnail: string;
  publishedAt: string;
  duration?: string;
  viewCount?: string;
  description?: string;
}

export interface YouTubePlaylist {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  itemCount: number;
  channelTitle: string;
  items?: YouTubeVideo[];
}

export interface YouTubeSubscription {
  id: string;
  channelId: string;
  title: string;
  description: string;
  thumbnail: string;
}

export interface GoogleUserProfile {
  name: string;
  email?: string;
  picture: string;
  accessToken: string;
  expiresAt: number;
}

export interface CloudConfig {
  googleClientId: string;
  youtubeApiKey: string;
}

export interface ReservedModuleSpec {
  id: 'iptv' | 'plex' | 'games' | 'radio';
  title: string;
  subtitle: string;
  badge: string;
  description: string;
  plannedFeatures: string[];
  protocols: string[];
  etaPhase: string;
  hardwareRequirement: string;
}
