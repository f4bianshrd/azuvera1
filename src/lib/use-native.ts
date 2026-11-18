import { useSyncExternalStore } from "react";
import { isNative, isNativeBuild, onNativeChange } from "./platform";

/** true in der nativen App (oder mit Testhilfe ?native=1). Erstes Rendern nutzt nur das Build-Kennzeichen. */
export function useNative(): boolean {
  return useSyncExternalStore(onNativeChange, isNative, isNativeBuild);
}
