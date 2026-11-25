/**
 * PinchDrop Stage 11: Multi-Platform Packaging Verification Audit Tool
 * Audits Windows NSIS/MSI bundle configs, auto-updater manifests, icons,
 * Android ProGuard rules, signing keys, and CI workflow definitions.
 */

import fs from 'node:fs';
import path from 'node:path';

console.log('📦 PinchDrop Stage 11: Packaging & Installer Verification Audit');
console.log('=================================================================\n');

let passCount = 0;
let failCount = 0;

function check(title, condition, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${title}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${title} - ${details}`);
    failCount++;
  }
}

// 1. Audit Desktop Tauri Config
const tauriConfigPath = path.resolve('apps/desktop/src-tauri/tauri.conf.json');
check('tauri.conf.json exists', fs.existsSync(tauriConfigPath));

if (fs.existsSync(tauriConfigPath)) {
  const conf = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));

  check('Product name is "PinchDrop"', conf.productName === 'PinchDrop');
  check('Bundle targets include NSIS and MSI', 
    Array.isArray(conf.bundle?.targets) && 
    conf.bundle.targets.includes('nsis') && 
    conf.bundle.targets.includes('msi'));

  check('Auto-updater plugin configured with public key', 
    typeof conf.plugins?.updater?.pubkey === 'string' && 
    conf.plugins.updater.pubkey.length > 30);

  check('Auto-updater endpoint points to GitHub Releases', 
    Array.isArray(conf.plugins?.updater?.endpoints) && 
    conf.plugins.updater.endpoints[0].includes('releases/latest/download'));

  // Verify icons
  if (Array.isArray(conf.bundle?.icon)) {
    for (const iconRel of conf.bundle.icon) {
      const iconPath = path.resolve('apps/desktop/src-tauri', iconRel);
      check(`Icon asset exists: ${iconRel}`, fs.existsSync(iconPath) && fs.statSync(iconPath).size > 0);
    }
  }
}

// 2. Audit Android Companion Packaging Config
const androidBuildPath = path.resolve('apps/android/app/build.gradle.kts');
const androidProguardPath = path.resolve('apps/android/app/proguard-rules.pro');

check('Android app/build.gradle.kts exists', fs.existsSync(androidBuildPath));
check('Android app/proguard-rules.pro exists', fs.existsSync(androidProguardPath) && fs.statSync(androidProguardPath).size > 100);

if (fs.existsSync(androidBuildPath)) {
  const gradleContent = fs.readFileSync(androidBuildPath, 'utf8');
  check('compileSdk is 35 (Android 15)', gradleContent.includes('compileSdk = 35'));
  check('targetSdk is 35', gradleContent.includes('targetSdk = 35'));
  check('minSdk is 26', gradleContent.includes('minSdk = 26'));
  check('Release signing config defined', gradleContent.includes('signingConfigs'));
  check('R8 minifyEnabled is true in release', gradleContent.includes('isMinifyEnabled = true'));
  check('R8 isShrinkResources is true in release', gradleContent.includes('isShrinkResources = true'));
}

// 3. Audit GitHub Actions CI Workflow
const workflowPath = path.resolve('.github/workflows/release.yml');
check('.github/workflows/release.yml exists', fs.existsSync(workflowPath));

if (fs.existsSync(workflowPath)) {
  const workflowContent = fs.readFileSync(workflowPath, 'utf8');
  check('Workflow triggers on release tags v*', workflowContent.includes("tags:\n      - 'v*'"));
  check('Job build-desktop-windows defined', workflowContent.includes('build-desktop-windows:'));
  check('Job build-android-companion defined', workflowContent.includes('build-android-companion:'));
}

console.log('\n=================================================================');
console.log(`Audit Results: ${passCount} Passed, ${failCount} Failed.`);

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 Packaging Quality Gate PASSED: Ready for installer generation.\n');
}
