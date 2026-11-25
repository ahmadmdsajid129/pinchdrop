# PinchDrop Android Companion ProGuard / R8 Rules (Stage 11)

# Keep Kotlin reflection & coroutines
-keepattributes *Annotation*,InnerClasses,EnclosingMethod,Signature
-keepclassmembers class kotlin.Metadata { *; }

# Ktor Client & OkHttp rules
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# AndroidX Security Crypto & MasterKeys
-keep class androidx.security.crypto.** { *; }

# WorkManager Worker classes
-keep class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}

# Android Companion Models & Transfer Packets
-keep class com.pinchdrop.companion.** { *; }
