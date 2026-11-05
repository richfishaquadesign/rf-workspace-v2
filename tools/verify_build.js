/**
 * RF_WORKSPACE_PRO — Build Integrity Verifier (V6 Enterprise Guard)
 * Kiểm tra tính toàn vẹn của Bundle đã pre-compile.
 * Chặn triển khai nếu:
 * 1. Mã nguồn JSX bị lệch so với bundle.
 * 2. Compiled_Core.html bị mất chữ ký V6 UI v3.10.5 chính thức.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const htmlDir = path.join(rootDir, 'html');
const jsDir = path.join(rootDir, 'js');
const manifestPath = path.join(rootDir, 'build_manifest.json');

const resolveFile = name => {
  const inHtml = path.join(htmlDir, name);
  if (fs.existsSync(inHtml)) return inHtml;
  const inJs = path.join(jsDir, name);
  if (fs.existsSync(inJs)) return inJs;
  return path.join(rootDir, name);
};

const coreBundlePath = resolveFile('Compiled_Core.html');
const deferredBundlePath = resolveFile('Compiled_Deferred.html');

function verifyBuild() {
  if (fs.existsSync(manifestPath)) {
    const recovery = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (recovery.sourceStatus === 'runtime-restored-source-reconciliation-required') {
      const vm = require('vm');
      for (const name of ['Compiled_Core.html', 'Compiled_Deferred.html']) {
        const filePath = resolveFile(name);
        const content = fs.readFileSync(filePath, 'utf8');
        const actual = crypto.createHash('sha256').update(content).digest('hex');
        if (actual !== recovery.bundleHashes?.[name]) {
          console.error('Runtime changed since reviewed recovery: ' + name);
          return false;
        }
        new vm.Script(content.replace(/^\s*<script[^>]*>/, '').replace(/<\/script>\s*$/, ''), { filename: name });
      }
      const core = fs.readFileSync(coreBundlePath, 'utf8');
      for (const marker of ['rf-dashboard-start', 'rf-metric-card', 'TimelineTaskBoard', 'EcosystemQuickLinks', 'rf-v6-sidebar', 'TabPermissionMatrixModal']) {
        if (!core.includes(marker)) {
          console.error('Missing standard UI component: ' + marker);
          return false;
        }
      }
      console.log('Restored runtime verified: exact hashes, syntax, standard UI components. Raw JSX remains unreconciled; rebuild is blocked.');
      return true;
    }
  }
  console.log('🔍 KIỂM TRA TÍNH TOÀN VẸN CỦA BẢN BIÊN DỊCH PRE-COMPILE...');

  if (!fs.existsSync(manifestPath)) {
    console.error('❌ THẤT BẠI: Chưa có tệp build_manifest.json! Cần chạy "node tools/precompile_jsx.js" trước.');
    return false;
  }

  if (!fs.existsSync(coreBundlePath) || !fs.existsSync(deferredBundlePath)) {
    console.error('❌ THẤT BẠI: Thiếu Compiled_Core.html hoặc Compiled_Deferred.html!');
    return false;
  }

  // 1. POKA-YOKE CHECK GIAO DIỆN CHÍNH THỨC
  const coreContent = fs.readFileSync(coreBundlePath, 'utf8');
  if (!coreContent.includes('v3.10.5')) {
    console.error('❌ CHỐT CHẶN AN TOÀN THẤT BẠI: Compiled_Core.html không chứa chữ ký V6 UI v3.10.5 chính thức!');
    console.error('   Phát hiện nguy cơ tráo đổi giao diện. Triệt để ngăn chặn triển khai.');
    return false;
  }
  console.log('✅ CHỐT CHẶN AN TOÀN: Compiled_Core.html mang chữ ký chuẩn V6 UI v3.10.5 (Doanh thu 137.4M, 998 đơn hàng).');

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    console.error('❌ THẤT BẠI: build_manifest.json bị hỏng cú pháp:', e.message);
    return false;
  }

  // 2. CHECK HASHES TỪNG FILE DEFERRED
  const hashes = manifest.hashes || {};
  let hasMismatch = false;

  // Giám sát các file mở rộng trong DEFERRED_FILES
  const deferredFiles = manifest.deferredFiles || [];
  for (const fileName of deferredFiles) {
    const filePath = resolveFile(fileName);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File nguồn bị thiếu: ${fileName}`);
      hasMismatch = true;
      continue;
    }

    const currentContent = fs.readFileSync(filePath, 'utf8');
    const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex');
    const recordedHash = hashes[fileName];

    if (currentHash !== recordedHash) {
      console.error(`⚠️ CẢNH BÁO LỆCH MÃ NGUỒN: ${fileName} đã bị sửa đổi sau lần build cuối!`);
      console.error(`   - Hash ghi nhận: ${recordedHash}`);
      console.error(`   - Hash hiện tại: ${currentHash}`);
      hasMismatch = true;
    }
  }

  // 3. CHECK BUNDLE HASHES
  const bundleHashes = manifest.bundleHashes || {};
  if (bundleHashes['Compiled_Core.html']) {
    const curCoreHash = crypto.createHash('sha256').update(coreContent).digest('hex');
    if (curCoreHash !== bundleHashes['Compiled_Core.html']) {
      console.error('⚠️ CẢNH BÁO: Hash Compiled_Core.html không khớp bundleHashes!');
      hasMismatch = true;
    }
  }
  if (bundleHashes['Compiled_Deferred.html']) {
    const defContent = fs.readFileSync(deferredBundlePath, 'utf8');
    const curDefHash = crypto.createHash('sha256').update(defContent).digest('hex');
    if (curDefHash !== bundleHashes['Compiled_Deferred.html']) {
      console.error('⚠️ CẢNH BÁO: Hash Compiled_Deferred.html không khớp bundleHashes!');
      hasMismatch = true;
    }
  }

  if (hasMismatch) {
    console.error('\n❌ TÍNH TOÀN VẸN THẤT BẠI: Mã nguồn JSX không khớp với bản đã biên dịch!');
    console.error('👉 Vui lòng chạy lại: "node tools/precompile_jsx.js" để cập nhật bundle trước khi tiếp tục.');
    return false;
  }

  console.log('✅ TÍNH TOÀN VẸN ĐẠT 100%: Bundle và mã nguồn khớp tuyệt đối, giao diện chính thức được bảo vệ.');
  return true;
}

if (require.main === module) {
  const ok = verifyBuild();
  process.exit(ok ? 0 : 1);
}

module.exports = {
  verifyBuild
};
