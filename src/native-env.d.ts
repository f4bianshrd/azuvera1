/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" beim Build der nativen App (iPhone, iPad, Mac). */
  readonly VITE_NATIVE_BUILD?: string;
}
