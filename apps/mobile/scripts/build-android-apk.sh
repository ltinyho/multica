#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$MOBILE_DIR/../.." && pwd)"
ANDROID_DIR="$MOBILE_DIR/android"
DOWNLOADS_DIR="${DOWNLOADS_DIR:-$HOME/Downloads}"

timestamp="${EXPO_BUILD_TIMESTAMP:-$(date +%Y%m%d%H%M%S)}"
version_code="${EXPO_ANDROID_VERSION_CODE:-$(date +%m%d%H%M)}"
base_version="$(node -p "require('$MOBILE_DIR/package.json').version")"
app_version="${EXPO_APP_VERSION:-$base_version-$timestamp}"

export APP_ENV="${APP_ENV:-production}"
export NODE_ENV="${NODE_ENV:-production}"
export EXPO_APP_VERSION="$app_version"
export EXPO_ANDROID_VERSION_CODE="$version_code"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"

echo "Building Android APK"
echo "  APP_ENV=$APP_ENV"
echo "  EXPO_APP_VERSION=$EXPO_APP_VERSION"
echo "  EXPO_ANDROID_VERSION_CODE=$EXPO_ANDROID_VERSION_CODE"

pnpm -C "$MOBILE_DIR" exec expo prebuild --platform android --no-install --clean

(
  cd "$ANDROID_DIR"
  ./gradlew assembleRelease
)

apk_name="multica-$app_version.apk"
release_dir="$ANDROID_DIR/app/build/outputs/apk/release"
release_apk="$release_dir/$apk_name"
downloads_apk="$DOWNLOADS_DIR/$apk_name"

cp "$release_dir/app-release.apk" "$release_apk"
mkdir -p "$DOWNLOADS_DIR"
cp "$release_apk" "$downloads_apk"

echo "APK written:"
echo "  $release_apk"
echo "  $downloads_apk"
