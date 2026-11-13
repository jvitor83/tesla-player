import React, { useState } from 'react';
import {
  Tv,
  Server,
  Gamepad2,
  Radio,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Cpu,
  Layers,
  MapPin,
} from 'lucide-react';
import type { ReservedModuleSpec } from '../types/tesla';
import { RESERVED_MODULES } from '../data/mockYoutubeData';

interface ReservedModuleViewProps {
  onReturnToYoutube: () => void;
  onOpenRoadmap: () => void;
}

export const ReservedModuleView: React.FC<ReservedModuleViewProps> = ({
  onReturnToYoutube,
  onOpenRoadmap,
}) => {
  const [selectedId, setSelectedId] = useState<'iptv' | 'plex' | 'games' | 'radio'>('iptv');
  const spec: ReservedModuleSpec = RESERVED_MODULES[selectedId];

  const moduleOptions: Array<{
    id: 'iptv' | 'plex' | 'games' | 'radio';
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'iptv', label: 'IPTV / TV', icon: <Tv size={20} /> },
    { id: 'plex', label: 'Plex Server', icon: <Server size={20} /> },
    { id: 'games', label: 'Jogos Web', icon: <Gamepad2 size={20} /> },
    { id: 'radio', label: 'Rádios FM', icon: <Radio size={20} /> },
  ];

  const renderIcon = () => {
    switch (selectedId) {
      case 'iptv':
        return <Tv size={40} />;
      case 'plex':
        return <Server size={40} />;
      case 'games':
        return <Gamepad2 size={40} />;
      case 'radio':
        return <Radio size={40} />;
    }
  };

  return (
    <section
      id="reserved-module-more-soon"
      className="reserved-module-view"
      aria-label="Módulos Futuros: More Soon"
    >
      <div className="reserved-module-view__card">
        <div className="yt-library-toggles">
          {moduleOptions.map((opt) => (
            <button
              key={opt.id}
              id={`btn-soon-${opt.id}`}
              type="button"
              className={`touch-pill-btn ${
                selectedId === opt.id ? 'touch-pill-btn--primary' : ''
              }`}
              onClick={() => setSelectedId(opt.id)}
            >
              {opt.icon}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="reserved-module-view__header">
          <div className="reserved-module-view__icon-box">{renderIcon()}</div>
          <div className="reserved-module-view__titles">
            <div className="reserved-module-view__badges">
              <span className="soon-pill">
                <Sparkles size={15} />
                {spec.badge}
              </span>
              <span className="phase-pill">
                <MapPin size={14} />
                {spec.etaPhase}
              </span>
            </div>
            <h1>{spec.title}</h1>
            <p className="reserved-module-view__subtitle">{spec.subtitle}</p>
          </div>
        </div>

        <p className="reserved-module-view__description">{spec.description}</p>

        <div className="reserved-module-view__grid">
          <div className="reserved-module-view__panel">
            <h3>
              <Layers size={18} />
              <span>Recursos Planejados na Arquitetura</span>
            </h3>
            <ul className="reserved-module-view__feature-list">
              {spec.plannedFeatures.map((feature, index) => (
                <li key={index}>
                  <CheckCircle2 size={18} className="text-accent-blue" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="reserved-module-view__panel">
            <h3>
              <Cpu size={18} />
              <span>Protocolos &amp; Otimização Tesla</span>
            </h3>
            <div className="protocol-chips">
              {spec.protocols.map((proto) => (
                <span key={proto} className="protocol-chip">
                  {proto}
                </span>
              ))}
            </div>
            <div className="hardware-callout">
              <strong>Requisitos de Hardware (MCU2 / MCU3):</strong>
              <p>{spec.hardwareRequirement}</p>
            </div>
          </div>
        </div>

        <div className="reserved-module-view__actions">
          <button
            id="btn-reserved-back-youtube"
            type="button"
            className="tesla-btn tesla-btn--primary"
            onClick={onReturnToYoutube}
          >
            <ArrowLeft size={20} />
            <span>Voltar ao Módulo YouTube Ativo</span>
          </button>

          <button
            id="btn-reserved-open-roadmap"
            type="button"
            className="tesla-btn tesla-btn--secondary"
            onClick={onOpenRoadmap}
          >
            <span>Configurações Google Cloud &amp; Roadmap</span>
          </button>
        </div>
      </div>
    </section>
  );
};
