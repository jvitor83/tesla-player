import React from 'react';
import { PlayCircle, Sparkles } from 'lucide-react';
import type { ModuleId } from '../types/tesla';

interface TeslaDockProps {
  activeModule: ModuleId;
  onSelectModule: (module: ModuleId) => void;
}

export const TeslaDock: React.FC<TeslaDockProps> = ({
  activeModule,
  onSelectModule,
}) => {
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

      {/* Primary Modules Navigation: Only YouTube and More soon */}
      <nav className="tesla-dock__nav">
        <button
          id="dock-nav-youtube"
          type="button"
          className={`tesla-dock__item ${
            activeModule === 'youtube' ? 'tesla-dock__item--active' : ''
          }`}
          onClick={() => onSelectModule('youtube')}
          aria-current={activeModule === 'youtube' ? 'page' : undefined}
        >
          <div className="tesla-dock__icon-wrap">
            <PlayCircle size={26} />
          </div>
          <span className="tesla-dock__label">YouTube</span>
        </button>

        <button
          id="dock-nav-more-soon"
          type="button"
          className={`tesla-dock__item tesla-dock__item--reserved ${
            activeModule === 'more_soon' ? 'tesla-dock__item--active' : ''
          }`}
          onClick={() => onSelectModule('more_soon')}
          aria-current={activeModule === 'more_soon' ? 'page' : undefined}
        >
          <div className="tesla-dock__icon-wrap">
            <Sparkles size={24} />
          </div>
          <span className="tesla-dock__label">More soon</span>
        </button>
      </nav>

      <div className="tesla-dock__footer" />
    </aside>
  );
};
