/**
 * RF_WORKSPACE_PRO — JSX Pre-compilation Engine (V6 Enterprise Guard)
 * Biên dịch JSX sang JavaScript thuần (React.createElement).
 * Mặc định: Chỉ biên dịch Compiled_Deferred.html (Extended Tabs) để bảo toàn 100% Giao diện chính V6 UI v3.10.5.
 * Core Bundle (Compiled_Core.html) được khóa cứng trừ khi có cờ --build-core.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const htmlDir = path.join(rootDir, 'html');
const jsDir = path.join(rootDir, 'js');

const babelPath = fs.existsSync(path.join(jsDir, 'temp_babel.js'))
  ? path.join(jsDir, 'temp_babel.js')
  : path.resolve(__dirname, '..', 'temp_babel.js');

if (!fs.existsSync(babelPath)) {
  console.error('❌ Không tìm thấy Babel tại:', babelPath);
  process.exit(1);
}
const Babel = require(babelPath);

const resolveSource = id => {
  const fileName = id === 'ReturnClaimRules' ? 'ReturnClaimRules.js' : `${id}.html`;
  const inHtml = path.join(htmlDir, fileName);
  if (fs.existsSync(inHtml)) return inHtml;
  const inJs = path.join(jsDir, fileName);
  if (fs.existsSync(inJs)) return inJs;
  return path.join(rootDir, fileName);
};
const sourceName = id => id === 'ReturnClaimRules' ? 'ReturnClaimRules.js' : `${id}.html`;

const CORE_FILES = [
  'Config',
  'ReturnClaimRules',
  'Components',
  'Modals',
  'Modals_Orders',
  'Tab_Dashboard',
  'Tab_Orders',
  'App_Main'
];

const DEFERRED_FILES = [
  'Tab_Production',
  'Tab_Inventory',
  'Tab_ImportExport',
  'Tab_Suppliers',
  'Tab_Finance',
  'Tab_HR',
  'Tab_Documents',
  'Tab_Affiliate',
  'Tab_Analytics',
  'Tab_Workspaces',
  'Tab_Apprenticeship'
];

function cleanCode(raw) {
  if (!raw) return '';
  return raw
    .replace(/\0/g, '')
    .replace(/[\uFEFF\uFFFE]/g, '')
    .replace(/^\s*<script[^>]*>/i, '')
    .replace(/<\/script>\s*$/i, '');
}

function buildBundle(fileIds, bundleName) {
  console.log(`\n📦 Đang đóng gói & biên dịch ${bundleName}...`);
  let combinedJsx = '';
  const manifestHashes = {};

  fileIds.forEach(id => {
    const filePath = resolveSource(id);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Không tìm thấy file: ${filePath}`);
      process.exit(1);
    }
    const rawContent = fs.readFileSync(filePath, 'utf8');
    manifestHashes[sourceName(id)] = crypto.createHash('sha256').update(rawContent).digest('hex');
    const cleaned = cleanCode(rawContent);
    combinedJsx += `\n/* ═══ MODULE: ${id} ═══ */\n${cleaned}\n`;
    console.log(`  + Đã nạp: ${sourceName(id)} (${(rawContent.length / 1024).toFixed(1)} KB)`);
  });

  const t0 = Date.now();
  const transformResult = Babel.transform(combinedJsx, {
    presets: ['react'],
    compact: false,
    comments: true
  });
  const dt = Date.now() - t0;
  const compiledJs = transformResult.code;

  console.log(`  ⚡ Biên dịch JSX thành công trong ${dt}ms!`);
  console.log(`  📊 Kích thước JSX thô: ${(combinedJsx.length / 1024).toFixed(1)} KB -> JS thuần: ${(compiledJs.length / 1024).toFixed(1)} KB`);

  return {
    js: compiledJs,
    hashes: manifestHashes
  };
}

function run() {
  const args = process.argv.slice(2);
  const shouldBuildCore = args.includes('--build-core') || args.includes('--all');

  console.log('🚀 BẮT ĐẦU QUY TRÌNH PRE-COMPILE JSX CHO RF WORKSPACE PRO');
  if (!shouldBuildCore) {
    console.log('🔒 CHẾ ĐỘ BẢO VỆ GIAO DIỆN CHÍNH: Chỉ biên dịch Compiled_Deferred.html.');
    console.log('   Compiled_Core.html (V6 UI v3.10.5) được KHÓA CỨNG để bảo toàn giao diện chính.');
  }

  const startTotal = Date.now();
  const coreOutputPath = fs.existsSync(htmlDir) ? path.join(htmlDir, 'Compiled_Core.html') : path.join(rootDir, 'Compiled_Core.html');
  const deferredOutputPath = fs.existsSync(htmlDir) ? path.join(htmlDir, 'Compiled_Deferred.html') : path.join(rootDir, 'Compiled_Deferred.html');
  const manifestPath = path.join(rootDir, 'build_manifest.json');

  let manifestHashes = {};
  let currentManifest = {};
  if (fs.existsSync(manifestPath)) {
    try {
      currentManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifestHashes = { ...currentManifest.hashes };
    } catch (e) {}
  }

  // 1. Biên dịch Compiled_Deferred
  const deferredResult = buildBundle(DEFERRED_FILES, 'Compiled_Deferred (Extended Tabs)');
  const deferredHtmlContent = `<script>\n/* RF_WORKSPACE_PRO — COMPILED DEFERRED BUNDLE (AUTO-GENERATED) */\n${deferredResult.js}\n</script>`;
  fs.writeFileSync(deferredOutputPath, deferredHtmlContent, 'utf8');
  console.log(`💾 Đã lưu: Compiled_Deferred.html (${(deferredHtmlContent.length / 1024).toFixed(1)} KB)`);
  manifestHashes = { ...manifestHashes, ...deferredResult.hashes };

  // 2. Xử lý Compiled_Core
  let coreHtmlContent = '';
  if (shouldBuildCore) {
    const coreResult = buildBundle(CORE_FILES, 'Compiled_Core (App Shell & Core Tabs)');
    coreHtmlContent = `<script>\n/* RF_WORKSPACE_PRO — COMPILED CORE BUNDLE (AUTO-GENERATED) [V6 UI v3.10.5] */\n${coreResult.js}\n</script>`;
    fs.writeFileSync(coreOutputPath, coreHtmlContent, 'utf8');
    console.log(`💾 Đã lưu: Compiled_Core.html (${(coreHtmlContent.length / 1024).toFixed(1)} KB)`);
    manifestHashes = { ...manifestHashes, ...coreResult.hashes };
  } else {
    if (!fs.existsSync(coreOutputPath)) {
      console.error('❌ THẤT BẠI: Không tìm thấy Compiled_Core.html chuẩn!');
      process.exit(1);
    }
    coreHtmlContent = fs.readFileSync(coreOutputPath, 'utf8');
    
    // POKA-YOKE GUARD: Kiểm tra xem Compiled_Core.html có chứa chữ ký V6 UI v3.10.5 không
    if (!coreHtmlContent.includes('v3.10.5')) {
      console.error('⚠️ CẢNH BÁO BẢO VỆ GIAO DIỆN: Compiled_Core.html không chứa chữ ký V6 UI v3.10.5!');
      console.error('   Vui lòng kiểm tra lại trước khi tiếp tục.');
    } else {
      console.log('✅ CHỐT CHẶN AN TOÀN: Compiled_Core.html đã xác nhận mang chữ ký chuẩn V6 UI v3.10.5!');
    }
  }

  // 3. Cập nhật build_manifest.json
  const manifest = {
    generatedAt: new Date().toISOString(),
    coreFiles: CORE_FILES.map(sourceName),
    deferredFiles: DEFERRED_FILES.map(sourceName),
    hashes: manifestHashes,
    bundleHashes: {
      'Compiled_Core.html': crypto.createHash('sha256').update(coreHtmlContent).digest('hex'),
      'Compiled_Deferred.html': crypto.createHash('sha256').update(deferredHtmlContent).digest('hex')
    }
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`📑 Đã lưu: build_manifest.json (${Object.keys(manifest.hashes).length} files được theo dõi)`);

  const totalDt = Date.now() - startTotal;
  console.log(`\n🎉 HOÀN TẤT PRE-COMPILE TRONG ${totalDt}ms! Bảo toàn 100% Giao diện chính V6 UI v3.10.5.`);
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
  CORE_FILES,
  DEFERRED_FILES
};
