// Expo config plugin: signs `assembleRelease` with the upload keystore when the
// PAISAPULSE_UPLOAD_* Gradle properties are set (kept in ~/.gradle/gradle.properties,
// never in the repo). Without them, release builds fall back to the debug key.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// paisapulse-release-signing';

const RELEASE_SIGNING = `
        release { ${MARKER}
            if (project.hasProperty('PAISAPULSE_UPLOAD_STORE_FILE')) {
                storeFile file(PAISAPULSE_UPLOAD_STORE_FILE)
                storePassword PAISAPULSE_UPLOAD_STORE_PASSWORD
                keyAlias PAISAPULSE_UPLOAD_KEY_ALIAS
                keyPassword PAISAPULSE_UPLOAD_KEY_PASSWORD
            }
        }`;

function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  const withConfig = gradle.replace(/signingConfigs\s*\{/, (m) => `${m}${RELEASE_SIGNING}`);
  // Point the release build type at the release config (first match after `release {` in buildTypes).
  return withConfig.replace(
    /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
    "$1signingConfig project.hasProperty('PAISAPULSE_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
  );
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = addReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
};
