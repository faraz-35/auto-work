#!/bin/zsh
# Builds the signed release APK. android/ is a gitignored build artifact —
# regenerated from app.json every run, so icons, splash, name and the
# version stamp can never drift from the source of truth.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

(cd app && npx expo prebuild -p android --clean --no-install)
echo "sdk.dir=$ANDROID_HOME" > app/android/local.properties

[ -f keystore.env ] && set -a && source keystore.env && set +a
: "${MOTOR_KS_ALIAS:?set MOTOR_KS_ALIAS in keystore.env}"
: "${MOTOR_KS_PASS:?set MOTOR_KS_PASS in keystore.env}"

GRADLE_FILE=app/android/app/build.gradle
node - <<'EOF'
// Deterministic, idempotent signing fix: debug block -> debug keystore,
// release block -> motor.keystore. [^}]* stays inside each simple block.
const fs = require('fs');
const path = 'app/android/app/build.gradle';
let src = fs.readFileSync(path, 'utf8');
if (!src.includes('motor.keystore')) {
  const pass = process.env.MOTOR_KS_PASS, alias = process.env.MOTOR_KS_ALIAS;
  src = src.replace(
    /signingConfigs \{/,
    `signingConfigs {
        release {
            storeFile file('../../../motor.keystore')
            storePassword "${pass}"
            keyAlias "${alias}"
            keyPassword "${pass}"
        }`
  );
}
src = src.replace(/(buildTypes \{\s*debug \{[^}]*?)signingConfig signingConfigs\.\w+/, '$1signingConfig signingConfigs.debug');
src = src.replace(/(buildTypes \{\s*debug \{[^}]*\}\s*release \{[^}]*?)signingConfig signingConfigs\.\w+/, '$1signingConfig signingConfigs.release');
fs.writeFileSync(path, src);
console.log('signing config ensured');
EOF

echo "$(date '+%F %T') gradle assembleRelease starting" >> /tmp/ghar-build.log
cd app/android
./gradlew assembleRelease -q --console=plain 2>&1 | tail -40
echo "$(date '+%F %T') gradle finished rc=$?" >> /tmp/ghar-build.log
ls -la app/build/outputs/apk/release/ 2>/dev/null || ls -la ~/Programming/motor/app/android/app/build/outputs/apk/release/
