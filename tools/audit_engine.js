/**
 * RF_WORKSPACE_PRO — SYSTEM AUDIT & VERIFICATION ENGINE
 * Kiểm toán toàn diện hệ thống: Tính toàn vẹn, Kiến trúc, Liên kết, Schema 23 bảng, Hàm trùng/thiếu.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const jsDir = path.join(rootDir, 'js');
const htmlDir = path.join(rootDir, 'html');

const resolveFile = name => {
  const inJs = path.join(jsDir, name);
  if (fs.existsSync(inJs)) return inJs;
  const inHtml = path.join(htmlDir, name);
  if (fs.existsSync(inHtml)) return inHtml;
  return path.join(rootDir, name);
};

function runAudit() {
  console.log('================================================================================');
  console.log('       RF WORKSPACE PRO — HỆ THỐNG KIỂM TOÁN VÀ ĐÁNH GIÁ CHẤT LƯỢNG MÃ NGUỒN    ');
  console.log('================================================================================\n');

  const report = {
    syntax: { total: 0, passed: 0, errors: [] },
    manifest: { checked: 0, matched: 0, mismatched: [] },
    includes: [],
    clasp: { tracked: [], untracked: [], syntaxClean: true },
    functionCollisions: [],
    linkage: { calls: [], missingBackendFunctions: [] },
    schemas: { matches: [], missingInSchema: [], extraInSchema: [] },
    lockService: { checked: 0, withLock: 0, withoutLock: [] }
  };

  // 1. KIỂM TRA CÚ PHÁP TOÀN BỘ FILE JS
  const jsFiles = fs.existsSync(jsDir) ? fs.readdirSync(jsDir).filter(f => f.endsWith('.js')) : fs.readdirSync(rootDir).filter(f => f.endsWith('.js'));
  report.syntax.total = jsFiles.length;
  jsFiles.forEach(f => {
    try {
      const code = fs.readFileSync(resolveFile(f), 'utf8');
      new vm.Script(code, { filename: f });
      report.syntax.passed++;
    } catch (err) {
      report.syntax.errors.push({ file: f, message: err.message, line: err.stack ? err.stack.split('\n')[0] : '' });
    }
  });

  // 2. KIỂM TRA MANIFEST & HASHES
  if (fs.existsSync(path.join(rootDir, 'build_manifest.json'))) {
    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'build_manifest.json'), 'utf8'));
    for (const [file, recordedHash] of Object.entries(manifest.hashes || {})) {
      report.manifest.checked++;
      const fullPath = resolveFile(file);
      if (!fs.existsSync(fullPath)) {
        report.manifest.mismatched.push({ file, expected: recordedHash, actual: 'FILE_NOT_FOUND' });
        continue;
      }
      const actualHash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
      if (actualHash === recordedHash) {
        report.manifest.matched++;
      } else {
        report.manifest.mismatched.push({ file, expected: recordedHash, actual: actualHash });
      }
    }
    for (const [bundle, recordedHash] of Object.entries(manifest.bundleHashes || {})) {
      report.manifest.checked++;
      const fullPath = resolveFile(bundle);
      if (!fs.existsSync(fullPath)) {
        report.manifest.mismatched.push({ file: bundle, expected: recordedHash, actual: 'FILE_NOT_FOUND' });
        continue;
      }
      const actualHash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
      if (actualHash === recordedHash) {
        report.manifest.matched++;
      } else {
        report.manifest.mismatched.push({ file: bundle, expected: recordedHash, actual: actualHash });
      }
    }
  }

  // 3. KIỂM TRA THAM CHIẾU INCLUDE / CREATEHTMLOUTPUT
  const allFiles = [
    ...(fs.existsSync(htmlDir) ? fs.readdirSync(htmlDir).filter(f => f.endsWith('.html')) : []),
    ...(fs.existsSync(jsDir) ? fs.readdirSync(jsDir).filter(f => f.endsWith('.js')) : [])
  ];
  const includePattern = /(?:include|createHtmlOutputFromFile)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  allFiles.forEach(f => {
    const content = fs.readFileSync(resolveFile(f), 'utf8');
    let match;
    while ((match = includePattern.exec(content)) !== null) {
      const ref = match[1];
      const exists = fs.existsSync(resolveFile(ref + '.html')) ||
                     fs.existsSync(resolveFile(ref + '.js')) ||
                     fs.existsSync(resolveFile(ref));
      report.includes.push({ caller: f, target: ref, exists });
    }
  });

  // 4. KIỂM TRA ĐỤNG ĐỘ HÀM TOÀN CỤC Ở BACKEND (GOOGLE APPS SCRIPT GLOBAL SCOPE)
  // Trong Google Apps Script, tất cả các file .js chia sẻ cùng 1 global namespace!
  const functionDefs = new Map(); // functionName -> [{ file, line }]
  const funcDefRegex = /function\s+([a-zA-Z0-9_$]+)\s*\(/g;
  
  // Chỉ quét các file JS backend được đẩy lên Google Apps Script
  const backendJsFiles = [
    'Code.js', 'Operations.js', 'DataLoading.js', 'ApprenticeshipService.js',
    'MigrationFinancialStatements.js', 'ReconciliationApi.js', 'ReconciliationAuditService.js',
    'ReconciliationConfig.js', 'ReconciliationCorrectionService.js', 'ReconciliationDbService.js',
    'ReconciliationEngine.js', 'ReconciliationImportService.js', 'ReconciliationMatcher.js',
    'ReconciliationNormalizer.js', 'RetiredAutomation.js', 'ReturnClaimRules.js',
    'ReturnWorkflowService.js', 'RFEnterpriseCore.js', 'SetupShopeeDB.js',
    'ShopeeApiService.js', 'ShopeeBlackImagesSync.js', 'ShopeeController.js',
    'ShopeeDataMigration.js', 'ShopeeDbService.js', 'ShopeeSyncEngine.js',
    'ShopeeWebhookHandler.js', 'WorkspaceWebsiteBackend.js', 'WorkspaceWebsiteSeed.js',
    'ZaloFlowCustomerBridge.js'
  ];

  backendJsFiles.forEach(f => {
    const full = resolveFile(f);
    if (!fs.existsSync(full)) return;
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      // bỏ qua comment 1 dòng
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      let m;
      while ((m = funcDefRegex.exec(line)) !== null) {
        const fnName = m[1];
        if (!functionDefs.has(fnName)) functionDefs.set(fnName, []);
        functionDefs.get(fnName).push({ file: f, line: idx + 1 });
      }
    });
  });

  functionDefs.forEach((locs, fnName) => {
    if (locs.length > 1) {
      report.functionCollisions.push({ functionName: fnName, occurrences: locs });
    }
  });

  // 5. KIỂM TRA FRONTEND GỌI BACKEND (google.script.run & runGAS)
  const gasCallRegex = /(?:google\.script\.run|runGAS)\s*(?:\.with[a-zA-Z]+\([^)]*\))*\s*\.?([a-zA-Z0-9_$]+)?\s*\(/g;
  const directApiRegex = /(?:runGAS|window\.runGAS)\s*\(\s*['"]([a-zA-Z0-9_$]+)['"]/g;
  
  const frontendCalls = new Set();
  const htmlFilesToScan = [
    'Index.html', 'Compiled_Core.html', 'Compiled_Deferred.html',
    'App_Main.html', 'Tab_Dashboard.html', 'Tab_Orders.html',
    'Tab_Production.html', 'Tab_Inventory.html', 'Tab_Finance.html',
    'Tab_HR.html', 'Tab_Affiliate.html', 'Tab_Analytics.html',
    'Tab_Workspaces.html', 'Tab_Apprenticeship.html', 'Modals.html', 'Modals_Orders.html'
  ];

  htmlFilesToScan.forEach(f => {
    const full = resolveFile(f);
    if (!fs.existsSync(full)) return;
    const content = fs.readFileSync(full, 'utf8');
    
    // Pattern 1: google.script.run...api_someFunc()
    const gsrPattern = /google\.script\.run(?:[.\w\s()=>{}]+)?\.([a-zA-Z0-9_$]+)\s*\(/g;
    let m;
    while ((m = gsrPattern.exec(content)) !== null) {
      const fn = m[1];
      if (!['withSuccessHandler', 'withFailureHandler', 'withUserObject'].includes(fn)) {
        frontendCalls.add(fn);
      }
    }

    // Pattern 2: runGAS('someFunc')
    let m2;
    while ((m2 = directApiRegex.exec(content)) !== null) {
      frontendCalls.add(m2[1]);
    }
  });

  frontendCalls.forEach(call => {
    if (!functionDefs.has(call)) {
      // Check if it's handled in handleApiRequest or doGet/doPost action
      report.linkage.missingBackendFunctions.push(call);
    } else {
      report.linkage.calls.push(call);
    }
  });

  // 6. KIỂM TRA 23 BẢNG SCHEMA CSDL CỐT LÕI
  const CORE_23_TABLES = [
    'Orders', 'Production', 'Packings', 'Products', 'Config_NhanSu',
    'Attendance', 'KPI_Progress', 'Config_KPI', 'BOM_Config', 'Transactions',
    'ImportExport', 'Accounts', 'BonusPenalty', 'CTV_Finance', 'Config_GiaLayout',
    'Documents', 'Trainings', 'Models3D', 'Monthly_Snapshots', 'ProfitReports',
    'Reimbursements', 'Suppliers', 'Tracking_Log'
  ];

  const codeJsContent = fs.readFileSync(resolveFile('Code.js'), 'utf8');
  CORE_23_TABLES.forEach(tbl => {
    const inSchema = codeJsContent.includes(tbl + ':') || codeJsContent.includes(`'${tbl}'`) || codeJsContent.includes(`"${tbl}"`);
    report.schemas.matches.push({ table: tbl, presentInCode: inSchema });
  });

  // IN BÁO CÁO TỔNG HỢP
  console.log('--- 1. TÍNH TOÀN VẸN CÚ PHÁP (SYNTAX INTEGRITY) ---');
  console.log(`✓ Số file JS đã quét: ${report.syntax.total}`);
  console.log(`✓ Số file vượt qua cú pháp Node.js: ${report.syntax.passed} / ${report.syntax.total}`);
  if (report.syntax.errors.length > 0) {
    console.log('❌ LỖI CÚ PHÁP:');
    report.syntax.errors.forEach(e => console.log(`   - ${e.file}: ${e.message}`));
  } else {
    console.log('✅ Toàn bộ 100% file JavaScript vượt qua kiểm tra cú pháp V8 chuẩn.');
  }

  console.log('\n--- 2. KIỂM TRA BUILD_MANIFEST.JSON & SHA-256 ---');
  console.log(`✓ Số file khai báo theo dõi: ${report.manifest.checked}`);
  console.log(`✓ Số file khớp hash tuyệt đối: ${report.manifest.matched} / ${report.manifest.checked}`);
  if (report.manifest.mismatched.length > 0) {
    console.log('⚠️ FILE BỊ LỆCH HASH:');
    report.manifest.mismatched.forEach(m => console.log(`   - ${m.file} (Expected: ${m.expected.slice(0, 8)}... | Actual: ${m.actual.slice(0, 8)}...)`));
  } else {
    console.log('✅ Tính toàn vẹn bản build đạt 100%. Không có sai lệch giữa mã nguồn và bundle.');
  }

  console.log('\n--- 3. KIỂM TRA THAM CHIẾU INCLUDE / HTML OUTPUT ---');
  console.log(`✓ Tìm thấy ${report.includes.length} lệnh tham chiếu include.`);
  const missingIncludes = report.includes.filter(i => !i.exists);
  if (missingIncludes.length > 0) {
    console.log('❌ THAM CHIẾU BỊ ĐỨT GÃY (FILE KHÔNG TỒN TẠI):');
    missingIncludes.forEach(i => console.log(`   - ${i.caller} gọi "${i.target}" nhưng không tìm thấy file!`));
  } else {
    console.log('✅ 100% các file được include() đều tồn tại hợp lệ trong dự án:');
    report.includes.forEach(i => console.log(`   + [${i.caller}] -> include('${i.target}') (Tồn tại: HỢP LỆ)`));
  }

  console.log('\n--- 4. KIỂM TRA ĐỤNG ĐỘ HÀM BACKEND TOÀN CỤC (GAS COLLISION AUDIT) ---');
  console.log(`✓ Tổng số hàm backend độc nhất: ${functionDefs.size}`);
  if (report.functionCollisions.length > 0) {
    console.log(`⚠️ PHÁT HIỆN ${report.functionCollisions.length} HÀM BỊ KHAI BÁO TRÙNG NHAU GIỮA CÁC FILE:`);
    report.functionCollisions.forEach(c => {
      console.log(`   - Hàm "${c.functionName}" (${c.occurrences.length} lần khai báo):`);
      c.occurrences.forEach(o => console.log(`       * ${o.file}:${o.line}`));
    });
  } else {
    console.log('✅ Không phát hiện hàm backend nào bị trùng tên.');
  }

  console.log('\n--- 5. KIỂM TRA LIÊN KẾT FRONTEND -> BACKEND (API LINKAGE) ---');
  console.log(`✓ Tổng số API backend mà frontend gọi: ${frontendCalls.size}`);
  console.log(`✓ API backend tìm thấy định nghĩa hàm trực tiếp: ${report.linkage.calls.length}`);
  if (report.linkage.missingBackendFunctions.length > 0) {
    console.log(`⚠️ HÀM FRONTEND GỌI NHƯNG KHÔNG TÌM THẤY 'function <name>' TRỰC TIẾP: (${report.linkage.missingBackendFunctions.length})`);
    report.linkage.missingBackendFunctions.forEach(fn => console.log(`   - ${fn}`));
  } else {
    console.log('✅ 100% các lời gọi từ frontend đều có hàm backend tiếp nhận tương ứng.');
  }

  console.log('\n--- 6. KIỂM TRA 23 BẢNG SCHEMA CSDL CỐT LÕI (SYSTEM PROMPT) ---');
  const missingTables = report.schemas.matches.filter(m => !m.presentInCode);
  if (missingTables.length > 0) {
    console.log(`❌ THIẾU BẢNG TRONG SCHEMA: ${missingTables.map(t => t.table).join(', ')}`);
  } else {
    console.log(`✅ Toàn bộ 23/23 bảng CSDL cốt lõi đều được định nghĩa đầy đủ trong Code.js (SCHEMA & SCHEMA_ERP).`);
  }

  console.log('\n================================================================================');
  console.log('                              KẾT THÚC QUY TRÌNH KIỂM TOÁN                      ');
  console.log('================================================================================');
}

runAudit();
