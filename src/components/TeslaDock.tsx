import React from 'react';
import {
  PlayCircle,
  Tv,
  Server,
  Gamepad2,
  Radio,
  Map,
  ShieldCheck,
  Car,
} from 'lucide-react';
import type { ModuleId, DrivingState } from '../types/tesla';

interface TeslaDockProps {
  activeModule: ModuleId;
  drivingState: DrivingState;
  isAuthenticated: boolean;
  onSelectModule: (module: ModuleId) => void;
  onToggleDrivingState: () => void;
  onOpenSafetyModal: () => void;
}

interface DockItemConfig {
  id: ModuleId;
  label: string;
  shortTag?: string;
  icon: React.ReactNode;
  isReserved?: boolean;
}

export const TeslaDock: React.FC<TeslaDockProps> = ({
  activeModule,
  drivingState,
  isAuthenticated,
  onSelectModule,
  onToggleDrivingState,
  onOpenSafetyModal,
}) => {
  const navItems: DockItemConfig[] = [
    {
      id: 'youtube',
      label: 'YouTube',
      shortTag: isAuthenticated ? 'OAUTH' : 'ATIVO',
      icon: <PlayCircle size={24} />,
      isReserved: false,
    },
    {
      id: 'iptv',
      label: 'IPTV / TV',
      shortTag: 'EM BREVE',
      icon: <Tv size={22} />,
      isReserved: true,
    },
    {
      id: 'plex',
      label: 'Plex Server',
      shortTag: 'EM BREVE',
      icon: <Server size={22} />,
      isReserved: true,
    },
    {
      id: 'games',
      label: 'Jogos Web',
      shortTag: 'EM BREVE',
      icon: <Gamepad2 size={22} />,
      isReserved: true,
    },
    {
      id: 'radio',
      label: 'Rádios FM',
      shortTag: 'EM BREVE',
      icon: <Radio size={22} />,
      isReserved: true,
    },
    {
      id: 'roadmap',
      label: 'Cloud & Guia',
      shortTag: 'ROADMAP',
      icon: <Map size={22} />,
      isReserved: false,
    },
  ];

  return (
    <aside
      id="tesla-left-dock"
      className="tesla-dock"
      aria-label="Menu Lateral Fixo (Dock Automotivo)"
    >
      {/* Brand Emblem */}
      <div className="tesla-dock__brand">
        <div className="tesla-dock__logo" title="Tesla Play Center">
          <span className="tesla-dock__logo-mark">T</span>
        </div>
        <div className="tesla-dock__brand-text">
          <strong>PLAY</strong>
          <span>CENTER</span>
        </div>
      </div>

      {/* Gear Shift / Driving Mode Indicator (Park / Drive simulation) */}
      <div className="tesla-dock__prnd" role="group" aria-label="Modo de Transmissão">
        <button
          id="btn-dock-mode-park"
          type="button"
          className={`prnd-pill ${drivingState === 'PARK' ? 'prnd-pill--active-park' : ''}`}
          onClick={() => drivingState !== 'PARK' && onToggleDrivingState()}
          title="Modo Park (Estacionado)"
        >
          P
        </button>
        <button
          id="btn-dock-mode-drive"
          type="button"
          className={`prnd-pill ${drivingState === 'DRIVE' ? 'prnd-pill--active-drive' : ''}`}
          onClick={() => drivingState !== 'DRIVE' && onToggleDrivingState()}
          title="Modo Drive (Em Movimento — Viewport CSS permanece ativa sem fechar como o Tesla Theater)"
        >
          D
        </button>
      </div>

      {/* Primary Modules Navigation */}
      <nav className="tesla-dock__nav">
        {navItems.map((item) => {
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              id={`dock-nav-${item.id}`}
              type="button"
              className={`tesla-dock__item ${isActive ? 'tesla-dock__item--active' : ''} ${
                item.isReserved ? 'tesla-dock__item--reserved' : ''
              }`}
              onClick={() => onSelectModule(item.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="tesla-dock__icon-wrap">
                {item.icon}
                {item.shortTag && (
                  <span
                    className={`tesla-dock__badge ${
                      item.isReserved ? 'tesla-dock__badge--soon' : 'tesla-dock__badge--live'
                    }`}
                  >
                    {item.shortTag}
                  </span>
                )}
              </div>
              <span className="tesla-dock__label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Safety & Telemetry Trigger */}
      <div className="tesla-dock__footer">
        <button
          id="btn-dock-safety-notice"
          type="button"
          className="tesla-dock__safety-btn"
          onClick={onOpenSafetyModal}
          title="Aviso de Segurança, Firmware e Responsabilidade Legal para Passageiros"
        >
          <ShieldCheck size={20} />
          <span>Segurança &amp; Firmware</span>
        </button>

        <div className="tesla-dock__car-telemetry">
          <Car size={16} />
          <span>15&quot; / 17&quot; UI</span>
        </div>
      </div>
    </aside>
  );
};
