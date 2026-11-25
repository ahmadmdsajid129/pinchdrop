# PinchDrop Android. Compose and AndroidX ship their own consumer rules.
-keepattributes *Annotation*,InnerClasses,EnclosingMethod,Signature

# MediaPipe Tasks (Phase 6 open-hand catch) uses reflection/JNI and protobuf lite.
-keep class com.google.mediapipe.** { *; }
-keep class com.google.protobuf.** { *; }
-dontwarn com.google.mediapipe.**
-dontwarn com.google.protobuf.**
