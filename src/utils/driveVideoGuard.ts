/**
 * Drive Video Guard for Tesla Chromium (QtWebEngine)
 *
 * Prevents the browser and YouTube IFrame Player from pausing or dropping
 * video frames (switching to background audio-only mode or hardware overlay freeze)
 * when the vehicle shifts into Drive or moves.
 */

let guardInstalled = false;
let audioCtx: AudioContext | null = null;

export function installDriveVideoGuard(onExternalPauseIntercepted?: () => void): void {
  if (guardInstalled || typeof window === 'undefined') {
    return;
  }
  guardInstalled = true;

  // 1. Force Page Visibility API to always report 'visible' so YouTube IFrame
  // never switches to background tab audio-only mode when Tesla UI changes gear/focus.
  try {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(document, 'webkitHidden', {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    Object.defineProperty(document, 'webkitVisibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  } catch {
    // Ignore if browser disallows property redefinition
  }

  // 2. Intercept and suppress lifecycle events that trigger video frame suspension in Drive
  const blockedLifecycleEvents = [
    'visibilitychange',
    'webkitvisibilitychange',
    'freeze',
    'pagehide',
    'blur',
  ];

  const stopLifecycleEvent = (e: Event) => {
    e.stopImmediatePropagation();
    e.stopPropagation();
    if (onExternalPauseIntercepted) {
      onExternalPauseIntercepted();
    }
  };

  for (const evtName of blockedLifecycleEvents) {
    document.addEventListener(evtName, stopLifecycleEvent, true);
    window.addEventListener(evtName, stopLifecycleEvent, true);
  }

  // 3. Guard HTMLMediaElement.prototype.pause against OS-injected pause calls
  try {
    const originalPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function (...args: unknown[]) {
      const allowPause = (window as unknown as { __teslaAllowMediaPause?: boolean })
        .__teslaAllowMediaPause;
      if (allowPause) {
        return originalPause.apply(this, args as []);
      }
      if (onExternalPauseIntercepted) {
        onExternalPauseIntercepted();
      }
      return undefined;
    };
  } catch {
    // Ignore if read-only
  }

  // 4. Intercept MediaSession OS-level pause/stop commands sent when shifting to Drive
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('pause', () => {
        if (onExternalPauseIntercepted) {
          onExternalPauseIntercepted();
        }
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        if (onExternalPauseIntercepted) {
          onExternalPauseIntercepted();
        }
      });
    } catch {
      // Ignore unsupported handlers
    }
  }
}

/**
 * Starts an ultra-low-overhead WebAudio keep-alive context on first user gesture
 * so Chromium treats the tab as an active foreground multimedia surface.
 */
export function activateWebAudioKeepAlive(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.00001; // Inaudible keep-alive signal
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => undefined);
    }
  } catch {
    // Ignore WebAudio restrictions
  }
}
