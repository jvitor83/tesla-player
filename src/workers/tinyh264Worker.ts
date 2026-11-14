import { init } from 'tinyh264/es/TinyH264Worker';

// Initialize the C-to-WASM H.264 decoder (tinyh264) inside this dedicated Web Worker
init();
