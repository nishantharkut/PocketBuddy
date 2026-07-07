import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProperties = Properties()
val localPropertiesFile = rootProject.file("local.properties")
if (localPropertiesFile.exists()) {
    localPropertiesFile.inputStream().use { localProperties.load(it) }
}

val pocketBuddyWebhookUrl =
    localProperties.getProperty("POCKETBUDDY_WEBHOOK_URL")
        ?: "http://10.0.2.2:8000/api/ingest/notification-v2"
val pocketBuddyWebhookToken =
    localProperties.getProperty("POCKETBUDDY_WEBHOOK_TOKEN") ?: ""
val pocketBuddyUserId =
    localProperties.getProperty("POCKETBUDDY_USER_ID") ?: ""

android {
    namespace = "com.pocketbuddy.connector"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pocketbuddy.connector"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField(
            "String",
            "POCKETBUDDY_WEBHOOK_URL",
            "\"${pocketBuddyWebhookUrl.replace("\\", "\\\\").replace("\"", "\\\"")}\"",
        )
        buildConfigField(
            "String",
            "POCKETBUDDY_WEBHOOK_TOKEN",
            "\"${pocketBuddyWebhookToken.replace("\\", "\\\\").replace("\"", "\\\"")}\"",
        )
        buildConfigField(
            "String",
            "POCKETBUDDY_USER_ID",
            "\"${pocketBuddyUserId.replace("\\", "\\\\").replace("\"", "\\\"")}\"",
        )
        manifestPlaceholders["usesCleartextTraffic"] = "true"
    }

    buildTypes {
        release {
            manifestPlaceholders["usesCleartextTraffic"] = "false"
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    testImplementation("junit:junit:4.13.2")
}
