# ============================================================
# STRAIT-GUARD — R8 keep rules (release build)
# Scoped rules only: no whole-package keeps, no -dontobfuscate.
# ============================================================

# Keep line numbers for readable crash reports, hide source file names.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Annotations / generics / reflection metadata used by Capacitor bridge
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions

# ------------------------------------------------------------
# Capacitor core bridge
# Plugins are discovered and invoked reflectively, so plugin
# classes, their @CapacitorPlugin annotation and @PluginMethod
# methods must survive shrinking/obfuscation.
# ------------------------------------------------------------
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}
-keepclassmembers class * {
    @com.getcapacitor.annotation.Permission <fields>;
}

# JavaScript interfaces exposed to the WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Cordova plugin shim (Capacitor bundles a Cordova compatibility layer)
-keep class org.apache.cordova.** { *; }
-keep public class * extends org.apache.cordova.CordovaPlugin { *; }

# ------------------------------------------------------------
# Installed Capacitor plugins
# ------------------------------------------------------------
# @capacitor/haptics
-keep class com.capacitorjs.plugins.haptics.** { *; }
# @capacitor-community/admob
-keep class com.getcapacitor.community.admob.** { *; }

# App entry point (referenced from AndroidManifest)
-keep class com.clicktech.straitguard.MainActivity { *; }

# ------------------------------------------------------------
# Google Mobile Ads / Play Services
# The SDK ships its own consumer rules; these only silence
# optional-dependency warnings that would fail the R8 step.
# ------------------------------------------------------------
-dontwarn com.google.android.gms.**
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**

# AndroidX splashscreen / activity edge-to-edge APIs referenced from XML
-keep class androidx.core.splashscreen.SplashScreen** { *; }

# Enum values() / valueOf() used reflectively by the bridge
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Parcelable CREATOR fields
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}
