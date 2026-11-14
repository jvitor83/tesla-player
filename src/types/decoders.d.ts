declare module 'tinyh264/es/TinyH264' {
  export interface TinyH264WasmModule {
    HEAPU8: Uint8Array;
    _h264bsdAlloc: () => number;
    _h264bsdInit: (pStorage: number, noOutputReordering: number) => number;
    _h264bsdDecode: (
      pStorage: number,
      pBytes: number,
      byteLen: number,
      pPicture: number,
      pWidth: number,
      pHeight: number
    ) => number;
    _h264bsdShutdown: (pStorage: number) => void;
    _h264bsdFree: (pStorage: number) => void;
    _malloc: (size: number) => number;
    _free: (ptr: number) => void;
    getValue: (ptr: number, type: string) => number;
  }

  const initTinyH264Module: (
    overrides?: Record<string, unknown>
  ) => Promise<TinyH264WasmModule>;
  export default initTinyH264Module;
}

declare module 'tinyh264/es/TinyH264Decoder' {
  import type { TinyH264WasmModule } from 'tinyh264/es/TinyH264';

  export default class TinyH264Decoder {
    static RDY: number;
    static PIC_RDY: number;
    static HDRS_RDY: number;
    static ERROR: number;
    static PARAM_SET_ERROR: number;
    static MEMALLOC_ERROR: number;

    constructor(
      tinyH264Module: TinyH264WasmModule,
      onPictureReady: (output: Uint8Array, width: number, height: number) => void
    );
    decode(nal: Uint8Array | ArrayBuffer): void;
    release(): void;
  }
}

declare module 'tinyh264/es/TinyH264Worker' {
  export function init(): Promise<void>;
}

interface OGVPlayerElement extends HTMLElement {
  src: string;
  autoplay: boolean;
  muted: boolean;
  loop: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  videoWidth?: number;
  videoHeight?: number;
  play: () => Promise<void> | void;
  pause: () => void;
  stop?: () => void;
}

interface OGVPlayerConstructor {
  new (options?: {
    webGL?: boolean;
    forceWebGL?: boolean;
    worker?: boolean;
    threading?: boolean;
  }): OGVPlayerElement;
}

interface OGVLoaderGlobal {
  base: string;
}

interface Window {
  OGVPlayer?: OGVPlayerConstructor;
  OGVLoader?: OGVLoaderGlobal;
}
