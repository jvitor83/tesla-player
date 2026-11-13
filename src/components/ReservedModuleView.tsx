import React from 'react';
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
import type { ModuleId, ReservedModuleSpec } from '../types/tesla';
import { RESERVED_MODULES } from '../data/mockYoutubeData';

interface ReservedModuleViewProps {
  moduleId: Exclude<ModuleId, 'youtube' | 'roadmap'>;
  onReturnToYoutube: () => void;
  onOpenRoadmap: () => void;
}

export const ReservedModuleView: React.FC<ReservedModuleViewProps> = ({
  moduleId,
  onReturnToYoutube,
  onOpenRoadmap,
}) => {
  const spec: ReservedModuleSpec = RESERVED_MODULES[moduleId];

  const renderIcon = () => {
    switch (moduleId) {
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
      id={`reserved-module-${moduleId}`}
      className="reserved-module-view"
      aria-label={`Módulo Reservado: ${spec.title}`}
    >
      <div className="reserved-module-view__card">
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
            <span>Ver Roteiro de Desenvolvimento (Roadmap)</span>
          </button>
        </div>
      </div>
    </section>
  );
};
