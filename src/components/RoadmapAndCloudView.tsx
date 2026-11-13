import React, { useState } from 'react';
import {
  Cloud,
  KeyRound,
  CheckCircle2,
  Copy,
  Check,
  Shield,
  LogIn,
  LogOut,
  RotateCcw,
  ExternalLink,
  Server,
  Tv,
  Cpu,
} from 'lucide-react';
import type { CloudConfig, GoogleUserProfile } from '../types/tesla';
import { YOUTUBE_READONLY_SCOPE } from '../services/youtubeApi';

interface RoadmapAndCloudViewProps {
  cloudConfig: CloudConfig;
  userProfile: GoogleUserProfile | null;
  authStatusMessage: string | null;
  onSaveCloudConfig: (config: CloudConfig) => void;
  onTriggerGoogleLogin: () => void;
  onLogoutGoogle: () => void;
  onReturnToYoutube: () => void;
}

export const RoadmapAndCloudView: React.FC<RoadmapAndCloudViewProps> = ({
  cloudConfig,
  userProfile,
  authStatusMessage,
  onSaveCloudConfig,
  onTriggerGoogleLogin,
  onLogoutGoogle,
  onReturnToYoutube,
}) => {
  const [clientId, setClientId] = useState(cloudConfig.googleClientId);
  const [apiKey, setApiKey] = useState(cloudConfig.youtubeApiKey);
  const [savedBanner, setSavedBanner] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);

  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://tesla-play-center.vercel.app';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveCloudConfig({
      googleClientId: clientId.trim(),
      youtubeApiKey: apiKey.trim(),
    });
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 3000);
  };

  const handleCopyOrigin = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentOrigin).catch(() => undefined);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2500);
    }
  };

  const roadmapStages = [
    {
      step: '01',
      title: 'Configuração da Nuvem (Google Cloud & HTTPS)',
      status:
        cloudConfig.googleClientId || cloudConfig.youtubeApiKey
          ? 'Configurado'
          : 'Pronto para Chave OAuth',
      done: true,
      items: [
        'Projeto no Google Cloud Console com YouTube Data API v3 ativada',
        'Tela de Consentimento OAuth 2.0 com escopo de leitura youtube.readonly',
        'Deploy com HTTPS obrigatório (Vercel / Netlify / Firebase Hosting)',
      ],
    },
    {
      step: '02',
      title: 'Estrutura Base & UI Automotiva (15" / 17")',
      status: 'Implementado',
      done: true,
      items: [
        'Single Page Application (SPA) em React + TypeScript de navegação instantânea',
        'Modo escuro nativo de alto contraste com alvos de toque mínimos de 48x48px',
        'Menu Lateral Fixo (Dock) à esquerda com YouTube ativo e placeholders futuros',
      ],
    },
    {
      step: '03',
      title: 'Integração de Dados (OAuth 2.0 + YouTube Data API v3)',
      status: userProfile ? 'Sincronizado OAuth' : 'Ativo (Catálogo + OAuth)',
      done: true,
      items: [
        'Google Identity Services (initTokenClient) para login no Chromium da Tesla',
        'Consumo oficial de playlists.list, playlistItems.list, videos.list e subscriptions.list',
        'Contorno completo do bloqueio X-Frame-Options do site youtube.com',
      ],
    },
    {
      step: '04',
      title: 'Player Embarcado, Viewport CSS 100% & Hardware MCU2/MCU3',
      status: 'Implementado',
      done: true,
      items: [
        'YouTube IFrame Player API (/embed/VIDEO_ID) com avanço automático de playlists',
        'Maximização de Viewport via CSS (100vw/100dvh) sem acionar o modo Tesla Theater nativo',
        'Controle de resolução 720p (MCU2 Intel Atom) e 1080p (MCU3 AMD Ryzen)',
      ],
    },
  ];

  return (
    <section
      id="roadmap-and-cloud-view"
      className="roadmap-view"
      aria-label="Roteiro de Desenvolvimento e Configuração Google Cloud"
    >
      <div className="roadmap-view__header">
        <div>
          <span className="section-eyebrow">ARQUITETURA &amp; CONFIGURAÇÃO</span>
          <h1>Configuração Google Cloud OAuth 2.0 &amp; Roadmap</h1>
          <p>
            Configure suas credenciais da YouTube Data API v3 para sincronizar sua conta
            pessoal ou utilize o catálogo automotivo integrado imediatamente.
          </p>
        </div>

        <button
          id="btn-roadmap-return-youtube"
          type="button"
          className="tesla-btn tesla-btn--primary"
          onClick={onReturnToYoutube}
        >
          <span>Ir para o Player YouTube</span>
        </button>
      </div>

      <div className="roadmap-view__columns">
        {/* Cloud Credentials Form Card */}
        <div className="cloud-config-card">
          <div className="cloud-config-card__header">
            <Cloud size={24} className="text-accent-blue" />
            <div>
              <h2>Credenciais Google Cloud Console</h2>
              <span>
                Armazenadas localmente no navegador do veículo (localStorage) ou via{' '}
                <code>.env</code>
              </span>
            </div>
          </div>

          <form onSubmit={handleSave} className="cloud-config-form">
            <div className="form-group">
              <label htmlFor="input-google-client-id">
                <KeyRound size={16} />
                <span>Google OAuth 2.0 Client ID (Web Application)</span>
              </label>
              <input
                id="input-google-client-id"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Ex: 1234567890-abcdefg.apps.googleusercontent.com"
                className="tesla-input"
              />
              <small>
                Necessário para login Google Identity Services com escopo{' '}
                <code>{YOUTUBE_READONLY_SCOPE.split(' ')[0]}</code>
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="input-youtube-api-key">
                <Shield size={16} />
                <span>YouTube Data API v3 Key (Opcional para busca pública sem login)</span>
              </label>
              <input
                id="input-youtube-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Ex: AIzaSyD..."
                className="tesla-input"
              />
              <small>
                Permite buscas diretas em <code>search.list</code> e{' '}
                <code>playlistItems.list</code> mesmo antes do login OAuth.
              </small>
            </div>

            <div className="origin-helper-box">
              <div>
                <strong>Origem JavaScript Autorizada (OAuth 2.0):</strong>
                <code>{currentOrigin}</code>
              </div>
              <button
                id="btn-copy-oauth-origin"
                type="button"
                className="touch-pill-btn"
                onClick={handleCopyOrigin}
              >
                {copiedOrigin ? <Check size={16} /> : <Copy size={16} />}
                <span>{copiedOrigin ? 'Copiado!' : 'Copiar Origem'}</span>
              </button>
            </div>

            <div className="cloud-config-form__actions">
              <button
                id="btn-save-cloud-config"
                type="submit"
                className="tesla-btn tesla-btn--primary"
              >
                <CheckCircle2 size={20} />
                <span>Salvar Credenciais no Veículo</span>
              </button>

              {userProfile ? (
                <button
                  id="btn-cloud-logout"
                  type="button"
                  className="tesla-btn tesla-btn--danger"
                  onClick={onLogoutGoogle}
                >
                  <LogOut size={20} />
                  <span>Desconectar ({userProfile.name})</span>
                </button>
              ) : (
                <button
                  id="btn-cloud-test-oauth"
                  type="button"
                  className="tesla-btn tesla-btn--secondary"
                  onClick={onTriggerGoogleLogin}
                >
                  <LogIn size={20} />
                  <span>Autenticar com Google OAuth 2.0</span>
                </button>
              )}

              <button
                id="btn-reset-cloud-config"
                type="button"
                className="touch-pill-btn"
                onClick={() => {
                  setClientId('');
                  setApiKey('');
                  onSaveCloudConfig({ googleClientId: '', youtubeApiKey: '' });
                }}
              >
                <RotateCcw size={16} />
                <span>Limpar</span>
              </button>
            </div>

            {savedBanner && (
              <div className="config-toast config-toast--success" role="status">
                Credenciais salvas com sucesso! O módulo YouTube já está pronto para
                utilizá-las.
              </div>
            )}

            {authStatusMessage && (
              <div className="config-toast" role="status">
                {authStatusMessage}
              </div>
            )}
          </form>

          <div className="cloud-QuickSteps">
            <h3>Passo a Passo Rápido no Google Cloud Console</h3>
            <ol>
              <li>
                Acesse{' '}
                <a
                  href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Cloud Console — YouTube Data API v3 <ExternalLink size={13} />
                </a>{' '}
                e clique em <strong>Ativar</strong>.
              </li>
              <li>
                Em <strong>Tela de permissão OAuth</strong>, adicione o escopo{' '}
                <code>.../auth/youtube.readonly</code>.
              </li>
              <li>
                Em <strong>Credenciais → Criar Credenciais → ID do cliente OAuth</strong>{' '}
                (Aplicativo da Web), adicione <code>{currentOrigin}</code> em{' '}
                <em>Origens JavaScript autorizadas</em>.
              </li>
            </ol>
          </div>
        </div>

        {/* 5) Roteiro de Desenvolvimento (Roadmap) */}
        <div className="roadmap-stages-card">
          <h2>5) Roteiro de Desenvolvimento (Roadmap)</h2>
          <div className="roadmap-timeline">
            {roadmapStages.map((stage) => (
              <div key={stage.step} className="roadmap-stage-item">
                <div className="roadmap-stage-item__number">{stage.step}</div>
                <div className="roadmap-stage-item__body">
                  <div className="roadmap-stage-item__top">
                    <h3>{stage.title}</h3>
                    <span className="roadmap-status-badge">{stage.status}</span>
                  </div>
                  <ul>
                    {stage.items.map((point, idx) => (
                      <li key={idx}>
                        <CheckCircle2 size={15} className="text-accent-green" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          <div className="roadmap-arch-highlights">
            <div className="arch-mini-box">
              <Tv size={20} />
              <div>
                <strong>Bypass X-Frame-Options</strong>
                <span>UI própria via Data API v3 + /embed/VIDEO_ID</span>
              </div>
            </div>
            <div className="arch-mini-box">
              <Cpu size={20} />
              <div>
                <strong>MCU2 Atom &amp; MCU3 Ryzen</strong>
                <span>Seletor 720p/1080p e CSS 100% Viewport</span>
              </div>
            </div>
            <div className="arch-mini-box">
              <Server size={20} />
              <div>
                <strong>Deploy HTTPS Pronto</strong>
                <span>Configurado para Vercel, Netlify e Firebase</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
