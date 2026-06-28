/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MESHY_KEY?: string;
  readonly VITE_TRIPO_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
