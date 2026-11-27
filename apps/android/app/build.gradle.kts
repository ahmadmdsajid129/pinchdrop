import java.io.File
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// The built APK is named PinchDrop-<version>-<build type>.apk.
base.archivesName.set("PinchDrop")

// Release signing: keystore.properties next to this project (CI writes it), or in
// %USERPROFILE%\.pinchdrop (your PC). Never in the repo. Without it, release builds are unsigned.
val keystoreProps = Properties().apply {
    val here = rootProject.file("keystore.properties")
    val home = File(System.getProperty("user.home"), ".pinchdrop/keystore.properties")
    val f = if (here.exists()) here else home
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.pinchdrop.companion"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.pinchdrop.companion"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "2.0.0"
    }

    signingConfigs {
        if (keystoreProps.getProperty("storeFile") != null) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Not shrunk: MediaPipe, ML Kit and the link code use reflection; a smaller APK isn't
            // worth a crash we can't see.
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    // full = the website APK (everything). play = Google Play (no SMS, call log, all-files access,
    // background location: Google only allows those for certain kinds of app).
    flavorDimensions += "store"
    productFlavors {
        create("full") {
            dimension = "store"
            buildConfigField("boolean", "PLAY", "false")
        }
        create("play") {
            dimension = "store"
            buildConfigField("boolean", "PLAY", "true")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    androidResources {
        // MediaPipe memory-maps the model; it must be stored uncompressed in the APK.
        noCompress += "task"
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.datastore:datastore-preferences:1.1.7")

    // Phase 3 link: TLS WebSocket to the PC, QR scanning (CameraX + ZXing, fully offline)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.camera:camera-camera2:1.4.2")
    implementation("androidx.camera:camera-lifecycle:1.4.2")
    implementation("androidx.camera:camera-view:1.4.2")
    implementation("com.google.zxing:core:3.5.3")
    // Phase 6: open-hand catch with the front camera. Same hand model as the PC, bundled in assets.
    implementation("com.google.mediapipe:tasks-vision:0.10.21")
    // v2: scan a document on the phone (Google's on-device scanner); the PDF opens on the PC.
    implementation("com.google.android.gms:play-services-mlkit-document-scanner:16.0.0-beta1")

    implementation(platform("androidx.compose:compose-bom:2025.09.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303") // android.jar's org.json is a stub in JVM tests
}
