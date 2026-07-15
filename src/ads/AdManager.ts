// AdManager - Google AdMob wrapper (Capacitor).
//
// PRODUCTION SETUP:
// 1. Create an AdMob account and app at https://apps.admob.com
// 2. Create Banner, Interstitial, and Rewarded ad units.
// 3. Add the real ad unit IDs as Vite env vars in a `.env` file:
//      VITE_ADMOB_BANNER_ID=ca-app-pub-XXXX/YYYY
//      VITE_ADMOB_INTERSTITIAL_ID=ca-app-pub-XXXX/YYYY
//      VITE_ADMOB_REWARDED_ID=ca-app-pub-XXXX/YYYY
//      VITE_ADMOB_APP_ID=ca-app-pub-XXXX~ZZZZ
//      VITE_ADMOB_TESTING=false           # true while developing
// 4. Register the App ID in `android/app/src/main/AndroidManifest.xml`:
//      <meta-data
//        android:name="com.google.android.gms.ads.APPLICATION_ID"
//        android:value="ca-app-pub-XXXX~ZZZZ"/>
//    (and the equivalent GADApplicationIdentifier in iOS Info.plist)
// 5. Run: `bun run build && bunx cap sync android` then open in Android Studio.
//
// Falls back to Google's official TEST ad unit IDs so the app is always safe
// to run in dev / preview / first native build without a live AdMob account.

// Google official test ad unit IDs (Android): https://developers.google.com/admob/android/test-ads
const TEST_IDS = {
  banner: "ca-app-pub-3940256099942544/6300978111",
  interstitial: "ca-app-pub-3940256099942544/1033173712",
  rewarded: "ca-app-pub-3940256099942544/5224354917",
};

// Real production IDs for StraitGuard.
// These are public identifiers that ship inside the app binary.
const PROD_IDS = {
  banner: TEST_IDS.banner, // replace once you create a real Banner ad unit
  interstitial: "ca-app-pub-4595693557009272/8104158208",
  rewarded: TEST_IDS.rewarded, // replace once you create a real Rewarded ad unit
};

const env = (typeof import.meta !== "undefined" ? (import.meta as any).env : {}) || {};

export const AD_UNITS = {
  banner: env.VITE_ADMOB_BANNER_ID || PROD_IDS.banner,
  interstitial: env.VITE_ADMOB_INTERSTITIAL_ID || PROD_IDS.interstitial,
  rewarded: env.VITE_ADMOB_REWARDED_ID || PROD_IDS.rewarded,
};

// If no custom IDs configured, run in AdMob test mode.
export const IS_TESTING =
  String(env.VITE_ADMOB_TESTING ?? "true").toLowerCase() === "true" ||
  AD_UNITS.interstitial === TEST_IDS.interstitial;

type Platform = "web" | "native";

function getPlatform(): Platform {
  if (typeof window === "undefined") return "web";
  const cap = (window as any).Capacitor;
  if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
    return "native";
  }
  return "web";
}

let initialized = false;
let initializePromise: Promise<boolean> | null = null;
let bannerShown = false;
let interstitialReady = false;
let rewardedReady = false;
let listenersAttached = false;

// Kill switch — set true to fully disable AdMob (e.g. to isolate a crash).
const ADS_DISABLED = false;

async function loadAdMob() {
  if (ADS_DISABLED) return null;
  if (getPlatform() !== "native") return null;
  try {
    const mod = await import("@capacitor-community/admob");
    return mod;
  } catch (e) {
    console.warn("[AdManager] AdMob module not available", e);
    return null;
  }
}

async function ensureInitialized(): Promise<boolean> {
  if (initialized) return true;
  if (initializePromise) return initializePromise;

  initializePromise = (async () => {
    const mod = await loadAdMob();
    if (!mod) {
      console.info(
        "[AdManager] Web preview — ads disabled. Real ads render only in the native Android/iOS build.",
      );
      initialized = true;
      return false;
    }

    try {
      await mod.AdMob.initialize({
        initializeForTesting: IS_TESTING,
        testingDevices: [],
      });

      if (!listenersAttached) {
        listenersAttached = true;
        mod.AdMob.addListener(mod.InterstitialAdPluginEvents.Loaded, (info: unknown) => {
          interstitialReady = true;
          console.info("[AdManager] interstitial loaded", info);
        });
        mod.AdMob.addListener(mod.InterstitialAdPluginEvents.FailedToLoad, (error: unknown) => {
          interstitialReady = false;
          console.error("[AdManager] interstitial failed to load", error);
        });
        mod.AdMob.addListener(mod.InterstitialAdPluginEvents.Showed, () => {
          console.info("[AdManager] interstitial showed");
        });
        mod.AdMob.addListener(mod.InterstitialAdPluginEvents.FailedToShow, (error: unknown) => {
          console.error("[AdManager] interstitial failed to show", error);
        });
        mod.AdMob.addListener(mod.InterstitialAdPluginEvents.Dismissed, () => {
          console.info("[AdManager] interstitial dismissed");
          interstitialReady = false;
          void AdManager.prepareInterstitial();
        });
      }

      initialized = true;
      console.info(
        `[AdManager] AdMob initialized (testing=${IS_TESTING}, interstitial=${AD_UNITS.interstitial}).`,
      );
      return true;
    } catch (e) {
      initializePromise = null;
      console.error("[AdManager] initialize failed", e);
      return false;
    }
  })();

  return initializePromise;
}

export const AdManager = {
  async initialize() {
    const ready = await ensureInitialized();
    if (!ready) return;
    // Warm up an interstitial so the first Game Over shows instantly.
    await this.prepareInterstitial();
    void this.prepareRewarded();
  },

  async showBanner() {
    if (bannerShown) return;
    const ready = await ensureInitialized();
    if (!ready) return;
    const mod = await loadAdMob();
    if (!mod) return;
    try {
      await mod.AdMob.showBanner({
        adId: AD_UNITS.banner,
        adSize: mod.BannerAdSize.ADAPTIVE_BANNER,
        position: mod.BannerAdPosition.BOTTOM_CENTER,
        margin: 0,
        isTesting: IS_TESTING,
      });
      bannerShown = true;
    } catch (e) {
      console.error("[AdManager] showBanner failed", e);
    }
  },

  async hideBanner() {
    if (!bannerShown) return;
    const mod = await loadAdMob();
    if (!mod) return;
    try {
      await mod.AdMob.hideBanner();
      bannerShown = false;
    } catch (e) {
      console.error("[AdManager] hideBanner failed", e);
    }
  },

  async removeBanner() {
    const mod = await loadAdMob();
    if (!mod) return;
    try {
      await mod.AdMob.removeBanner();
      bannerShown = false;
    } catch (e) {
      /* noop */
    }
  },

  async prepareInterstitial() {
    if (interstitialReady) return;
    const ready = await ensureInitialized();
    if (!ready) return;
    const mod = await loadAdMob();
    if (!mod) return;
    try {
      await mod.AdMob.prepareInterstitial({
        adId: AD_UNITS.interstitial,
        isTesting: IS_TESTING,
      });
      interstitialReady = true;
    } catch (e) {
      console.error("[AdManager] prepareInterstitial failed", e);
    }
  },

  async showInterstitial() {
    const ready = await ensureInitialized();
    if (!ready) return;
    const mod = await loadAdMob();
    if (!mod) return;
    try {
      if (!interstitialReady) {
        await mod.AdMob.prepareInterstitial({
          adId: AD_UNITS.interstitial,
          isTesting: IS_TESTING,
        });
      }
      await mod.AdMob.showInterstitial();
      interstitialReady = false;
      // Pre-cache the next one.
      void this.prepareInterstitial();
    } catch (e) {
      console.error("[AdManager] showInterstitial failed", e);
    }
  },

  async prepareRewarded() {
    if (rewardedReady) return;
    const ready = await ensureInitialized();
    if (!ready) return;
    const mod = await loadAdMob();
    if (!mod) return;
    try {
      await mod.AdMob.prepareRewardVideoAd({
        adId: AD_UNITS.rewarded,
        isTesting: IS_TESTING,
      });
      rewardedReady = true;
    } catch (e) {
      console.error("[AdManager] prepareRewarded failed", e);
    }
  },

  async showRewarded(): Promise<{ rewarded: boolean; amount?: number }> {
    const ready = await ensureInitialized();
    if (!ready) return { rewarded: false };
    const mod = await loadAdMob();
    if (!mod) return { rewarded: false };
    try {
      if (!rewardedReady) {
        await mod.AdMob.prepareRewardVideoAd({
          adId: AD_UNITS.rewarded,
          isTesting: IS_TESTING,
        });
      }
      const result: any = await mod.AdMob.showRewardVideoAd();
      rewardedReady = false;
      this.prepareRewarded();
      return { rewarded: true, amount: result?.amount };
    } catch (e) {
      console.error("[AdManager] showRewarded failed", e);
      return { rewarded: false };
    }
  },
};
