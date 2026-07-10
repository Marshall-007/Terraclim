/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Fontsource packages ship CSS only, no type declarations.
declare module '@fontsource-variable/fraunces';
declare module '@fontsource-variable/archivo';
