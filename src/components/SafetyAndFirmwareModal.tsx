import React from 'react';
import {
  ShieldAlert,
  Maximize2,
  Cpu,
  Volume2,
  CheckCircle2,
  X,
} from 'lucide-react';
import type { HardwareProfile, DrivingState } from '../types/tesla';

interface SafetyAndFirmwareModalProps {
  isOpen: boolean;
  hardwareProfile: HardwareProfile;
  drivingState: DrivingState;
  onClose: () => void;
  onSelectHardwareProfile: (profile: HardwareProfile) => void;
}

export const SafetyAndFirmwareModal: React.FC<SafetyAndFirmwareModalProps> = ({
  isOpen,
  hardwareProfile,
  drivingState,
  onClose,
  onSelectHardwareProfile,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="tesla-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="safety-modal-title"
    >
      <div className="tesla-modal">
        <div className="tesla-modal__header">
          <div className="tesla-modal__title-wrap">
            <ShieldAlert size={28} className="text-accent-red" />
            <div>
              <h2 id="safety-modal-title">
                Comportamento no Browser da Tesla, Firmware &amp; Uso Seguro
              </h2>
              <span>
                Diretrizes técnicas de Viewport CSS, Otimização MCU2/MCU3 e Responsabilidade
                Legal
              </span>
            </div>
          </div>

          <button
            id="btn-close-safety-modal-x"
            type="button"
            className="transport-btn"
            onClick={onClose}
            aria-label="Fechar modal"
          >
            <X size={22} />
          </button>
        </div>

        <div className="tesla-modal__body">
          <div className="safety-grid">
            <div className="safety-box">
              <div className="safety-box__head">
                <Maximize2 size={20} className="text-accent-blue" />
                <h3>1. Maximização de Viewport via CSS (100% da Janela)</h3>
              </div>
              <p>
                Em vez de acionar o modo <strong>&quot;Tesla Theater&quot;</strong> nativo (que é
                encerrado automaticamente ao tirar o veículo do modo <strong>Park</strong>), o
                Tesla Play Center expande o player via CSS (<code>100vw × 100dvh</code>) ocupando
                100% da janela útil do navegador Chromium integrado.
              </p>
            </div>

            <div className="safety-box">
              <div className="safety-box__head">
                <Cpu size={20} className="text-accent-blue" />
                <h3>2. Otimização de Hardware (MCU2 vs MCU3)</h3>
              </div>
              <p>
                Selecione o processador do seu veículo para ajustar automaticamente a resolução da
                YouTube IFrame API e evitar travamentos:
              </p>
              <div className="mcu-selector-row">
                <button
                  id="btn-modal-mcu2"
                  type="button"
                  className={`touch-pill-btn ${
                    hardwareProfile === 'MCU2_ATOM' ? 'touch-pill-btn--primary' : ''
                  }`}
                  onClick={() => onSelectHardwareProfile('MCU2_ATOM')}
                >
                  MCU2 (Intel Atom) · 720p Leve
                </button>
                <button
                  id="btn-modal-mcu3"
                  type="button"
                  className={`touch-pill-btn ${
                    hardwareProfile === 'MCU3_RYZEN' ? 'touch-pill-btn--primary' : ''
                  }`}
                  onClick={() => onSelectHardwareProfile('MCU3_RYZEN')}
                >
                  MCU3 (AMD Ryzen) · 1080p Full HD
                </button>
              </div>
            </div>

            <div className="safety-box">
              <div className="safety-box__head">
                <Volume2 size={20} className="text-accent-red" />
                <h3>3. Limitações de Firmware e Responsabilidade Legal</h3>
              </div>
              <p>
                Atualizações recentes do software da Tesla podem pausar tags de vídeo HTML5 ou
                silenciar temporariamente o áudio ao engatar o modo{' '}
                <strong>Drive ({drivingState})</strong>. O uso de vídeo com o veículo em movimento
                exige estrita observância da legislação local de trânsito e{' '}
                <strong>foco exclusivo nos passageiros</strong>. O motorista deve manter atenção
                integral à via e utilizar o botão <em>&quot;Modo Só Áudio&quot;</em> sempre que
                necessário.
              </p>
            </div>
          </div>
        </div>

        <div className="tesla-modal__footer">
          <button
            id="btn-confirm-safety-modal"
            type="button"
            className="tesla-btn tesla-btn--primary"
            onClick={onClose}
          >
            <CheckCircle2 size={20} />
            <span>Compreendo — Continuar no Modo Seguro para Passageiros</span>
          </button>
        </div>
      </div>
    </div>
  );
};
