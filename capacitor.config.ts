/// <reference types="@capacitor/cli" />
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.clicktech.straitguard",
  appName: "StraitGuard",
  webDir: "dist",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
  },
  plugins: {
    AdMob: {
      // The real AdMob App ID is set in:
      //   android/app/src/main/AndroidManifest.xml
      //   (com.google.android.gms.ads.APPLICATION_ID meta-data)
      requestTrackingAuthorization: true,
      testingDevices: [],
      initializeForTesting: true,
    },
  },
};

export default config;
