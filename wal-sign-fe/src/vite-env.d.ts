/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MNEMONIC: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}



