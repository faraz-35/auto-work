#!/bin/zsh
# Publishes a GitHub release with the signed APK. Usage: zsh scripts/release.sh v2.0.0
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${1:?usage: release.sh <tag>}"

APK=app/android/app/build/outputs/apk/release/app-release.apk
[ -f "$APK" ] || { echo "APK missing — run scripts/build-android.sh first"; exit 1; }

# stage under a release name outside the repo so no artifacts litter the root
STAGED="/tmp/Auto-Work-${TAG}.apk"
cp "$APK" "$STAGED"
gh release create "$TAG" "$STAGED" \
  --repo faraz-35/auto-work \
  --title "Auto Work ${TAG}" \
  --notes "Download Auto-Work-${TAG}.apk on your phone and install it. The app joins your home by itself. On Redmi/Infinix, let it autostart and turn off battery optimization (Security app → Permissions → Autostart; Battery → No restrictions) so alarms always ring."
echo "released ${TAG}"
