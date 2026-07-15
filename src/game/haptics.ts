// Haptics wrapper. Uses Capacitor Haptics on native (iOS/Android) and falls
// back to the Web Vibration API in mobile browsers. No-op on desktop.
type Kind = "light" | "medium" | "heavy" | "hit" | "gameover";

let nativeMod: any = null;
let nativeChecked = false;

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  return !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
}

async function loadNative() {
  if (nativeChecked) return nativeMod;
  nativeChecked = true;
  if (!isNative()) return null;
  try {
    nativeMod = await import("@capacitor/haptics");
  } catch (e) {
    console.warn("[Haptics] plugin unavailable", e);
    nativeMod = null;
  }
  return nativeMod;
}

function webVibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  try { nav.vibrate?.(pattern); } catch {}
}

let enabled = true;
export function setHapticsEnabled(v: boolean) { enabled = v; }

export const Haptics = {
  async pulse(kind: Kind) {
    if (!enabled) return;
    const mod = await loadNative();
    if (mod) {
      const { Haptics: H, ImpactStyle, NotificationType } = mod;
      try {
        switch (kind) {
          case "light": return void (await H.impact({ style: ImpactStyle.Light }));
          case "medium": return void (await H.impact({ style: ImpactStyle.Medium }));
          case "heavy":
          case "hit": return void (await H.impact({ style: ImpactStyle.Heavy }));
          case "gameover": return void (await H.notification({ type: NotificationType.Error }));
        }
      } catch (e) {
        console.warn("[Haptics] native failed, falling back", e);
      }
    }
    // Web fallback
    switch (kind) {
      case "light": return webVibrate(20);
      case "medium": return webVibrate(40);
      case "heavy": return webVibrate(80);
      case "hit": return webVibrate([0, 60, 30, 60]);
      case "gameover": return webVibrate([0, 120, 60, 120, 60, 200]);
    }
  },
};
