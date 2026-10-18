import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing comes from android/keystore.properties (never committed). Without it a debug-signed APK is built.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties"); if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "uz.hallaym.edu"
    compileSdk = 35
    defaultConfig {
        applicationId = "uz.hallaym.edu"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        // The platform the app opens; can also be changed in the app settings.
        buildConfigField("String", "DEFAULT_URL", "\"https://hallaym.kstu.uz\"")
        // Phones only (ARM); emulator libraries (x86) would almost double the APK. Build with -PwithX86 for an emulator.
        if (!project.hasProperty("withX86")) ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
        buildConfigField("String", "VOSK_MODEL_URL", "\"https://alphacephei.com/vosk/models/vosk-model-small-uz-0.22.zip\"")
    }
    signingConfigs {
        if (keystoreProps.getProperty("storeFile") != null) create("release") {
            storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
            storePassword = keystoreProps.getProperty("storePassword")
            keyAlias = keystoreProps.getProperty("keyAlias")
            keyPassword = keystoreProps.getProperty("keyPassword")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
    // Offline Uzbek speech recognition (wake word «Madina» and fallback commands).
    implementation("com.alphacephei:vosk-android:0.3.75")
    implementation("net.java.dev.jna:jna:5.13.0@aar")
}
