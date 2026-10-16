#!/bin/zsh
# Publishes a GitHub release with the signed APK. Usage: zsh scripts/release.sh v2.0.0
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${1:?usage: release.sh <tag>}"

APK=app/android/app/build/outputs/apk/release/app-release.apk
[ -f "$APK" ] || { echo "APK missing — run scripts/build-android.sh first"; exit 1; }

# stage under a release name outside the repo so no artifacts litter the root
STAGED="/tmp/Ghar-${TAG}.apk"
cp "$APK" "$STAGED"
gh release create "$TAG" "$STAGED" \
  --repo faraz-35/motor \
  --title "Ghar ${TAG}" \
  --notes "Download Ghar-${TAG}.apk on your phone and install it. Open it, type your name — that's the whole setup. Then Family tab → Make alarms reliable (allow notifications, exempt battery, autostart on Redmi/Infinix) and ring the test alarm once."
echo "released ${TAG}"
