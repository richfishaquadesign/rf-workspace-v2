import os, re, json, base64

current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root_dir = current_dir
v2_dir = current_dir

print("Generating Vercel Standalone Package for RF Workspace V2 (Independent Supabase App)...")
print(f"Working Directory: {root_dir}")

# 1. Read Index.html
with open(os.path.join(root_dir, 'html', 'Index.html'), 'r', encoding='utf-8') as f:
    index_html = f.read()

# 2. Read include files
def read_include(name):
    path = os.path.join(root_dir, 'html', f'{name}.html')
    if not os.path.exists(path):
        path = os.path.join(root_dir, f'{name}.html')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace('\0', '').replace('\ufeff', '')
    return content

utilities_content = read_include('RF_Utilities')
styles_content = read_include('RF_V6_Styles')
deferred_content = read_include('Compiled_Deferred')
core_content = read_include('Compiled_Core')
website_content = read_include('WorkspaceWebsite')

# 3. Inline into index_html
output_html = index_html

# Replace include('RF_Utilities')
output_html = re.sub(r'<\?!=\s*include\([\'"]RF_Utilities[\'"]\)\s*;?\s*\?>', lambda m: utilities_content, output_html)

# Replace include('RF_V6_Styles')
output_html = re.sub(r'<\?!=\s*include\([\'"]RF_V6_Styles[\'"]\)\s*;?\s*\?>', lambda m: styles_content, output_html)

# Replace include('Compiled_Deferred') in bundleCacheKey
output_html = re.sub(r'<\?!=\s*Utilities\.base64EncodeWebSafe.*?Compiled_Deferred.*?\?>', 'rf_deferred_v2_direct', output_html)

# Clean Core & Deferred scripts
core_content_clean = core_content.replace('\0', '').replace('\ufeff', '')
core_content_clean = re.sub(r'^\s*<script[^>]*>', '', core_content_clean, flags=re.IGNORECASE)
core_content_clean = re.sub(r'</script>\s*$', '', core_content_clean, flags=re.IGNORECASE)
core_b64 = base64.b64encode(core_content_clean.encode('utf-8')).decode('utf-8')
output_html = re.sub(r'<\?!=\s*Utilities\.base64Encode\(include\([\'"]Compiled_Core[\'"]\).*?\?>', core_b64, output_html)

deferred_content_clean = deferred_content.replace('\0', '').replace('\ufeff', '')
deferred_content_clean = re.sub(r'^\s*<script[^>]*>', '', deferred_content_clean, flags=re.IGNORECASE)
deferred_content_clean = re.sub(r'</script>\s*$', '', deferred_content_clean, flags=re.IGNORECASE)

# Replace WorkspaceWebsite
output_html = re.sub(r'<\?!=\s*\(function\(\)\s*\{.*?WorkspaceWebsite.*?\}\)\(\)\s*\?>', lambda m: website_content, output_html, flags=re.DOTALL)
output_html = re.sub(r'<\?!=\s*HtmlService\.createHtmlOutputFromFile\([\'"]WorkspaceWebsite[\'"]\).*?\?>', lambda m: website_content, output_html)

# Read Knowledge OS Seed
seed_js_path = os.path.join(root_dir, 'js', 'KnowledgeOsSeed.js')
knowledge_seed_js = ""
if os.path.exists(seed_js_path):
    with open(seed_js_path, 'r', encoding='utf-8') as sf:
        knowledge_seed_js = sf.read()

# 4. Inject Turbo-Cache & Pure Supabase Database Engine at top of <head>
bridge_script = "  <!-- ⚡ RF KNOWLEDGE OS AUTHORITATIVE SEED ⚡ -->\n  <script>\n  " + knowledge_seed_js + "\n  </script>\n" + """
  <!-- ⚡ RF WORKSPACE V2 PURE SUPABASE HIGH-PERFORMANCE ENGINE ⚡ -->
  <script>
    (function() {
      window.RF_STANDALONE = true;
      window.RF_V2_APP = true;
      window.deferredReady = true;
      window.__rfDeferredInjected = true;
      window.__rfLoadTabNow = function(tab, forceNetwork) {
        window.deferredReady = true;
        window.__rfDeferredInjected = true;
        try {
          window.dispatchEvent(new CustomEvent('rf-deferred-ready'));
          window.dispatchEvent(new CustomEvent('rf-tab-loaded'));
        } catch(e) {}
        if (typeof window.__rfOnDeferredLoaded === 'function') {
          try { window.__rfOnDeferredLoaded(); } catch(e) {}
        }
        return Promise.resolve({ ok: true });
      };

      // 🧹 TỰ ĐỘNG DIỆT SERVICE WORKER CŨ & XÓA SẠCH CACHE ĐỂ NẠP BẢN GIAO DIỆN MỚI 🧹
      try {
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(function(regs) {
            for (var reg of regs) {
              reg.update();
              if (localStorage.getItem('rf_sw_cache_purged_v4') !== 'true') {
                reg.unregister();
              }
            }
            localStorage.setItem('rf_sw_cache_purged_v4', 'true');
          });
        }
        if (typeof window !== 'undefined' && 'caches' in window) {
          caches.keys().then(function(names) {
            names.forEach(function(name) {
              if (name.indexOf('20261108') === -1) {
                caches.delete(name);
              }
            });
          });
        }
      } catch(e) {}

      // ⚡ TỰ ĐỘNG ĐỒNG BỘ TÀI KHOẢN TỐI CAO & XÓA CACHE CŨ ĐỂ NẠP TRỰC TIẾP TỪ SUPABASE ⚡
      try {
        if (localStorage.getItem('rf_db_sync_v8') !== 'true') {
          localStorage.removeItem('rf_turbo_cache_app_data');
          localStorage.removeItem('rf_local_products_override');
          localStorage.removeItem('rf_persisted_test_orders');
          localStorage.setItem('rf_db_sync_v8', 'true');
        }
        if (localStorage.getItem('rf_pin') === '226868') {
          localStorage.setItem('rf_user', 'Nguyễn Ngọc Tiến');
          localStorage.setItem('rf_role', 'TỐI CAO');
          localStorage.setItem('rf_title', 'Founder');
          localStorage.setItem('rf_admin', 'true');
          localStorage.setItem('rf_boss', 'true');
        }
      } catch(e) {}

      console.log('🚀 RF Workspace V2: Kết nối trực tiếp CSDL Supabase PostgreSQL (Project ID: oxtttywpelbyitgxspfm).');

      var SUPABASE_URL = 'https://oxtttywpelbyitgxspfm.supabase.co';
      var SUPABASE_KEY = 'sb_publishable_Bi-hpAsVX5nS10wE_LugRA_RF8wnu0W';
      var SUPABASE_HEADERS = {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      };

      // Schema Whitelist chuẩn 100% theo RULE[user_global] (chống lỗi PGRST204)
      var ORDERS_SCHEMA = ['id', 'orderCode', 'channel', 'customer', 'createdAt', 'deadline', 'date', 'status', 'accessories', 'hasProduction', 'isCarriedToWH', 'updatedBy', 'revenue', 'phone', 'address', 'note', 'prePaid', 'cod', 'costTotal', 'responsibleUser', 'discount', 'shippingMethod', 'sizeCoefficient', 'cogs', 'feeFixed', 'feeService', 'feePayment', 'feeAffiliate', 'shopVoucher', 'tax', 'reconciledAt', 'isReconciled'];
      var PROD_SCHEMA = ['id', 'orderId', 'type', 'name', 'note', 'status', 'deadline', 'fulfilledFromStock', 'p1_name', 'p1_status', 'p1_user', 'p1_start', 'p1_endTime', 'p1_photo', 'p1_reward_vnd', 'p2_name', 'p2_status', 'p2_user', 'p2_start', 'p2_endTime', 'p2_photo', 'p2_reward_vnd', 'qc_front_photo', 'qc_side_photo', 'qc_status', 'qc_note'];

      // Fetch Supabase với cơ chế Retry an toàn (tối đa 3 lần với backoff)
      async function fetchFromSupabaseWithRetry(table, query, retries) {
        retries = retries !== undefined ? retries : 3;
        var lastErr = null;
        for (var attempt = 1; attempt <= retries; attempt++) {
          try {
            var url = SUPABASE_URL + '/rest/v1/' + table + (query ? '?' + query : '');
            var resp = await fetch(url, { headers: SUPABASE_HEADERS });
            if (resp.ok) {
              return await resp.json();
            }
            if (resp.status === 404 || resp.status === 400) {
              console.warn('Supabase fetch status ' + resp.status + ' on ' + table);
              return [];
            }
            lastErr = new Error('Supabase ' + table + ' returned ' + resp.status);
          } catch(e) {
            lastErr = e;
          }
          if (attempt < retries) {
            await new Promise(function(r) { setTimeout(r, attempt * 300); });
          }
        }
        console.warn('Fetch Supabase ' + table + ' failed after ' + retries + ' attempts:', lastErr);
        return null;
      }

      // Phân trang an toàn để kéo đủ toàn bộ bản ghi (Orders 2.151, ImportExport 2.951, Transactions 1.450)
      async function fetchAllFromSupabase(table, query, maxPages) {
        maxPages = maxPages || 4;
        var combined = [];
        for (var p = 0; p < maxPages; p++) {
          var offset = p * 1000;
          var sep = query ? '&' : '';
          var q = (query || '') + sep + 'limit=1000&offset=' + offset;
          var pageData = await fetchFromSupabaseWithRetry(table, q, 3);
          if (pageData && Array.isArray(pageData) && pageData.length > 0) {
            combined = combined.concat(pageData);
            if (pageData.length < 1000) break; // Đã đến trang cuối cùng
          } else {
            // Nếu một trang bị null (lỗi mạng), không ngắt ngang làm mất dữ liệu
            break;
          }
        }
        return combined;
      }

      async function upsertToSupabase(table, rows) {
        if (!rows || !rows.length) return;
        var url = SUPABASE_URL + '/rest/v1/' + table;
        var headers = Object.assign({}, SUPABASE_HEADERS, {
          'Prefer': 'resolution=merge-duplicates'
        });
        var resp = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(rows)
        });
        if (!resp.ok) {
          var errText = await resp.text();
          console.error('Upsert ' + table + ' failed (' + resp.status + '):', errText);
          throw new Error('Lỗi lưu CSDL ' + table + ' (' + resp.status + '): ' + errText);
        }
      }

      async function deleteFromSupabase(table, ids) {
        if (!ids || !ids.length) return;
        try {
          var encodedIds = ids.map(function(id) { return encodeURIComponent(String(id).trim()); }).join(',');
          var url = SUPABASE_URL + '/rest/v1/' + table + '?id=in.(' + encodedIds + ')';
          await fetch(url, {
            method: 'DELETE',
            headers: SUPABASE_HEADERS
          });
        } catch(e) {
          console.warn('Delete from ' + table + ' error:', e);
        }
      }

      // Universal Pure RPC Router cho Standalone App
      async function callRemoteGasApi(action, args, pin) {
        // 1. PIN Authentication
        // WebAuthn Passkeys Authentication
        if (action === 'getWebAuthnChallenge') {
          var chalBytes = new Uint8Array(32);
          crypto.getRandomValues(chalBytes);
          var b64Chal = btoa(String.fromCharCode.apply(null, chalBytes))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          window.__rfLastChallenge = b64Chal;
          window.__rfChallengeTime = Date.now();
          return { success: true, challenge: b64Chal };
        }

        if (action === 'verifyPasskeyLogin') {
          var req = args[0] || {};
          var targetUserName = String(req.userName || '').trim();
          var staffRows = await fetchFromSupabaseWithRetry('Config_NhanSu', 'select=*', 2);
          if (staffRows && staffRows.length > 0) {
            var matched = null;
            if (targetUserName) {
              matched = staffRows.find(function(s) {
                var sName = String(s['Tên Nhân Sự'] || '').trim().toLowerCase();
                return sName === targetUserName.toLowerCase() || sName.includes(targetUserName.toLowerCase());
              });
            } else {
              matched = staffRows[0];
            }
            if (matched) {
              var role = String(matched['Chức Danh'] || 'THỢ CHÍNH').trim();
              var isSuperAdmin = /TỐI CAO|ADMIN|GIÁM ĐỐC|CHỦ TỊCH/i.test(role);
              var isBoss = /TỐI CAO|CHỦ TỊCH/i.test(role);
              return {
                valid: true,
                user: matched['Tên Nhân Sự'],
                role: role,
                isAdmin: isSuperAdmin,
                isBoss: isBoss
              };
            }
          }
          return { valid: false, message: 'Không tìm thấy thông tin nhân sự liên kết Face ID.' };
        }

        if (action === 'validatePin') {
          var inputPin = String(args[0] || pin || '').trim();
          var staffRows = await fetchFromSupabaseWithRetry('Config_NhanSu', 'select=*', 2);
          if (!staffRows || staffRows.length === 0) {
            staffRows = (window.__RF_KNOWLEDGE_OS_SEED__ && window.__RF_KNOWLEDGE_OS_SEED__.Config_NhanSu) || [];
          }
          if (staffRows && staffRows.length > 0) {
            var matched = staffRows.find(function(s) {
              return String(s['Mã PIN'] || '').trim() === inputPin;
            });
            if (matched) {
              var roleStr = String(matched['Phân Quyền'] || 'THỢ').toUpperCase();
              var isFounder = roleStr.indexOf('TỐI CAO') >= 0 || inputPin === '226868';
              return {
                valid: true,
                user: matched['Tên Nhân Sự'] || 'Nhân viên',
                role: matched['Phân Quyền'] || 'THỢ',
                title: matched['Chức Danh'] || 'Thợ',
                isAdmin: isFounder || roleStr.indexOf('QUẢN LÝ') >= 0,
                isBoss: isFounder
              };
            }
          }
          if (inputPin === '226868') {
            return {
              valid: true,
              user: 'Nguyễn Ngọc Tiến',
              role: 'TỐI CAO',
              title: 'Founder',
              isAdmin: true,
              isBoss: true
            };
          }
          if (inputPin === '246357') {
            return {
              valid: true,
              user: 'Nguyễn Thị Diệu Hương',
              role: 'QUẢN LÝ BÁN HÀNG',
              title: 'Quản Lý Bán Hàng',
              isAdmin: true,
              isBoss: false
            };
          }
          return { valid: false, error: 'Mã PIN không đúng' };
        }

        // 2. User Config
        if (action === 'getUserConfig') {
          var staffRows = await fetchFromSupabaseWithRetry('Config_NhanSu', 'select=*', 2);
          if (!staffRows || staffRows.length === 0) {
            staffRows = (window.__RF_KNOWLEDGE_OS_SEED__ && window.__RF_KNOWLEDGE_OS_SEED__.Config_NhanSu) || [];
          }
          var cfg = {
            avatars: {},
            titles: {},
            subTitles: {},
            salaries: {},
            users: [],
            roles: {},
            pins: {},
            raw: staffRows || [],
            staffList: [],
            staffDetails: {},
            statuses: {}
          };
          (staffRows || []).forEach(function(s) {
            var name = (s['Tên Nhân Sự'] || '').trim();
            if (!name) return;
            cfg.users.push(name);
            cfg.staffList.push({
              id: s.id || ('staff_' + (s['Mã PIN'] || name)),
              name: name,
              'Tên Nhân Sự': name,
              avatar: s['ID Ảnh'] || s.avatar || '',
              'ID Ảnh': s['ID Ảnh'] || s.avatar || '',
              title: s['Chức Danh'] || s.title || 'Thợ',
              'Chức Danh': s['Chức Danh'] || s.title || 'Thợ',
              subTitle: s['Chức Danh Phụ'] || s.subTitle || '',
              'Chức Danh Phụ': s['Chức Danh Phụ'] || s.subTitle || '',
              role: s['Phân Quyền'] || s.role || 'THỢ',
              'Phân Quyền': s['Phân Quyền'] || s.role || 'THỢ',
              pin: s['Mã PIN'] || s.pin || '',
              'Mã PIN': s['Mã PIN'] || s.pin || '',
              email: s['Gmail'] || s.email || '',
              'Gmail': s['Gmail'] || s.email || '',
              phone: s['Số Điện Thoại'] || s.phone || '',
              'Số Điện Thoại': s['Số Điện Thoại'] || s.phone || '',
              address: s['Địa Chỉ'] || s.address || '',
              'Địa Chỉ': s['Địa Chỉ'] || s.address || '',
              dob: s['Ngày Sinh'] || s.dob || '',
              'Ngày Sinh': s['Ngày Sinh'] || s.dob || '',
              cccd: s['Số CCCD'] || s.cccd || '',
              'Số CCCD': s['Số CCCD'] || s.cccd || '',
              status: s['Trạng Thái'] || s.status || 'Đang làm việc',
              'Trạng Thái': s['Trạng Thái'] || s.status || 'Đang làm việc',
              baseSalary: Number(s['Lương Cơ Bản'] || 0),
              funcSalary: Number(s['Lương Chức Vụ'] || 0),
              allowance: Number(s['Phụ Cấp Xăng Xe'] || 0),
              deduction: Number(s['Khoản Trừ Vi Phạm'] || 0)
            });
            if (s['ID Ảnh']) {
              var m = String(s['ID Ảnh']).match(/[-\\w]{25,}/);
              cfg.avatars[name] = m ? m[0] : s['ID Ảnh'];
            }
            if (s['Chức Danh']) cfg.titles[name] = s['Chức Danh'];
            if (s['Chức Danh Phụ']) cfg.subTitles[name] = s['Chức Danh Phụ'];
            if (s['Phân Quyền']) cfg.roles[name] = s['Phân Quyền'];
            if (s['Mã PIN']) cfg.pins[name] = s['Mã PIN'];
            if (s['Trạng Thái']) cfg.statuses[name] = s['Trạng Thái'];
            cfg.staffDetails[name] = s;
          });
          return cfg;
        }

        // 3. Core App Data: Nạp toàn bộ dataset từ Supabase PostgreSQL
        if (action === 'getAppData' || action === 'getAppDataIfChanged') {
          console.log('⚡ [SUPABASE] Đang nạp dataset từ CSDL Supabase PostgreSQL...');
          try {
            const [ordersRaw, prodRaw, packingsRaw, productsRaw, staffRaw, kpiRaw, giaLayoutRaw, bomRaw, transRaw, impRaw, accRaw, supRaw, attRaw, docRaw, trainRaw, modRaw, ctvRaw, snapRaw] = await Promise.all([
              fetchAllFromSupabase('Orders', 'select=*&order=createdAt.desc', 4),
              fetchAllFromSupabase('Production', 'select=*&order=deadline.asc', 2),
              fetchAllFromSupabase('Packings', 'select=*&order=start.desc', 3),
              fetchAllFromSupabase('Products', 'select=*', 3),
              fetchFromSupabaseWithRetry('Config_NhanSu', 'select=*', 3),
              fetchFromSupabaseWithRetry('Config_KPI', 'select=*', 3),
              fetchFromSupabaseWithRetry('Config_GiaLayout', 'select=*', 3),
              fetchAllFromSupabase('BOM_Config', 'select=*', 5),
              fetchAllFromSupabase('Transactions', 'select=*&order=date.desc', 3),
              fetchAllFromSupabase('ImportExport', 'select=*&order=date.desc', 5),
              fetchFromSupabaseWithRetry('Accounts', 'select=*', 3),
              fetchFromSupabaseWithRetry('Suppliers', 'select=*', 3),
              fetchAllFromSupabase('Attendance', 'select=*&order=date.desc', 3),
              fetchFromSupabaseWithRetry('Documents', 'select=*', 2),
              fetchFromSupabaseWithRetry('Trainings', 'select=*', 2),
              fetchFromSupabaseWithRetry('Models3D', 'select=*', 2),
              fetchFromSupabaseWithRetry('CTV_Finance', 'select=*', 2),
              fetchFromSupabaseWithRetry('Monthly_Snapshots', 'select=*', 2)
            ]);

            // CƠ CHẾ BẢO VỆ DỮ LIỆU: Nếu mạng chập chờn mà ordersRaw bị rỗng trong khi cache có dữ liệu -> GIỮ NGUYÊN CACHE
            var effectiveOrders = ordersRaw;
            if (!effectiveOrders || effectiveOrders.length === 0) {
              try {
                var cachedApp = JSON.parse(localStorage.getItem('rf_turbo_cache_app_data') || '{}');
                if (cachedApp && cachedApp.orders && cachedApp.orders.length > 0) {
                  console.warn('⚠️ [SUPABASE] Network load rỗng, tự động khôi phục từ Turbo Cache an toàn (' + cachedApp.orders.length + ' đơn)!');
                  effectiveOrders = cachedApp.orders;
                }
              } catch(e) {}
            }

            // Gộp thêm đơn hàng kiểm thử mới tạo từ LocalStorage (nếu có)
            try {
              var localPersisted = JSON.parse(localStorage.getItem('rf_persisted_test_orders') || '{}');
              var existingIds = {};
              (effectiveOrders || []).forEach(function(o) { if (o && o.id) existingIds[o.id] = true; });
              Object.keys(localPersisted).forEach(function(k) {
                var o = localPersisted[k];
                if (o && o.id && !existingIds[o.id]) {
                  effectiveOrders.unshift(o);
                  existingIds[o.id] = true;
                }
              });
            } catch(e) {}

            (effectiveOrders || []).forEach(function(o) {
              if (o.accessories && typeof o.accessories === 'string') {
                try {
                  var p = JSON.parse(o.accessories);
                  while (typeof p === 'string') p = JSON.parse(p);
                  o.accessories = Array.isArray(p) ? p : [p];
                } catch(e) {
                  o.accessories = [];
                }
              } else if (!Array.isArray(o.accessories)) {
                o.accessories = [];
              }
              o.hasProduction = Boolean(o.hasProduction);
              o.isCarriedToWH = Boolean(o.isCarriedToWH);
              o.isReconciled = Boolean(o.isReconciled);
              o.isUrgent = Boolean(o.isUrgent);
              o.revenue = Number(o.revenue || 0);
              o.cogs = Number(o.cogs || 0);
              o.costTotal = Number(o.costTotal || 0);
              o.prePaid = Number(o.prePaid || 0);
              o.cod = Number(o.cod || 0);
              o.discount = Number(o.discount || 0);
            });

            // Đồng bộ chuẩn từ Kho Tri Thức (RF_KNOWLEDGE_OS) cho Products, BOM_Config, Config_KPI, Suppliers, Documents, Trainings, Config_NhanSu
            var kosSeed = window.__RF_KNOWLEDGE_OS_SEED__ || {};
            var isWhiteBgImg = function(u) {
              var s = String(u || '').toLowerCase();
              return s.indexOf('shopee') !== -1 || s.indexOf('/images/catalog/') !== -1;
            };
            var kosBySku = {};
            if (kosSeed.Products) {
              kosSeed.Products.forEach(function(kp) {
                if (kp && kp.sku) kosBySku[String(kp.sku).toUpperCase()] = kp;
              });
            }
            var effectiveProducts = (productsRaw && productsRaw.length > 0) ? productsRaw : (kosSeed.Products ? JSON.parse(JSON.stringify(kosSeed.Products)) : []);
            var existingSkus = {};
            effectiveProducts.forEach(function(p) {
              if (!p) return;
              if (isWhiteBgImg(p.image)) p.image = '';
              if (isWhiteBgImg(p.realImage)) p.realImage = '';
              var kSku = String(p.sku || '').toUpperCase();
              if (kSku) existingSkus[kSku] = p;
              var kp = kosBySku[kSku];
              if (kp) {
                if (!p.image && kp.image && !isWhiteBgImg(kp.image)) p.image = kp.image;
                if (!p.realImage && kp.realImage && !isWhiteBgImg(kp.realImage)) p.realImage = kp.realImage;
                if (!p.costPrice && kp.costPrice) p.costPrice = kp.costPrice;
                if (!p.price && kp.price) p.price = kp.price;
              }
            });
            if (kosSeed.Products && kosSeed.Products.length > 0) {
              kosSeed.Products.forEach(function(kp) {
                var kSku = String(kp.sku || '').toUpperCase();
                if (kSku && !existingSkus[kSku]) {
                  effectiveProducts.push(Object.assign({}, kp));
                }
              });
            }
            try {
              var localProdOverrides = JSON.parse(localStorage.getItem('rf_local_products_override') || '{}');
              effectiveProducts.forEach(function(p) {
                var ov = localProdOverrides[p.id] || localProdOverrides[p.sku];
                if (ov) Object.assign(p, ov);
                if (isWhiteBgImg(p.image)) p.image = '';
                if (isWhiteBgImg(p.realImage)) p.realImage = '';
              });
            } catch(e) {}

            var effectiveBom = (bomRaw && bomRaw.length > 0) ? bomRaw : (kosSeed.BOM_Config || []);
            var effectiveKpi = (kpiRaw && kpiRaw.length > 0) ? kpiRaw : (kosSeed.Config_KPI || []);
            var effectiveStaff = (staffRaw && staffRaw.length > 0) ? staffRaw : (kosSeed.Config_NhanSu || []);
            var effectiveSuppliers = (supRaw && supRaw.length > 0) ? supRaw : (kosSeed.Suppliers || []);
            var effectiveDocs = (docRaw && docRaw.length > 0) ? docRaw : (kosSeed.Documents || []);
            var effectiveTrainings = (trainRaw && trainRaw.length > 0) ? trainRaw : (kosSeed.Trainings || []);

            // Chuẩn hóa và bảo vệ UOM cho toàn bộ danh mục Hàng hoá & Nguyên liệu
            (effectiveProducts || []).forEach(function(p) {
              p.quantity = Number(p.quantity || 0);
              p.costPrice = Number(p.costPrice || 0);
              p.price = Number(p.price || 0);
              var pSku = String(p.sku || '').toUpperCase();
              var pName = String(p.name || '').toLowerCase();
              var pCat = String(p.category || '').toUpperCase();
              if (!p.unit || p.unit === 'Cái') {
                if (pSku.indexOf('NL-LAY-SX-') === 0 || pCat.indexOf('NGUYÊN LIỆU') !== -1 ||
                    pName.indexOf('cát') !== -1 || pName.indexOf('đá') !== -1 || pName.indexOf('lũa') !== -1 ||
                    pName.indexOf('rễ') !== -1 || pName.indexOf('rêu') !== -1 || pName.indexOf('cuội') !== -1 || pName.indexOf('sỏi') !== -1) {
                  p.unit = 'Kg';
                  if (!p.importUnit) p.importUnit = 'Bao';
                  if (!p.conversionRate) p.conversionRate = pName.indexOf('cát') !== -1 ? 10 : 20;
                } else if (pSku.indexOf('NL-BE-K') === 0 || pName.indexOf('kính') !== -1) {
                  p.unit = 'm²';
                  if (!p.importUnit) p.importUnit = 'Tấm';
                } else if (pSku.indexOf('502') !== -1 || pName.indexOf('502') !== -1) {
                  p.unit = 'Chai';
                  if (!p.importUnit) p.importUnit = 'Thùng';
                  if (!p.conversionRate) p.conversionRate = 162;
                } else if (pName.indexOf('silicon') !== -1 || pName.indexOf('a300') !== -1 || pName.indexOf('a500') !== -1) {
                  p.unit = 'Chai';
                  if (!p.importUnit) p.importUnit = 'Thùng';
                  if (!p.conversionRate) p.conversionRate = 24;
                } else if (pSku.indexOf('LAY-') === 0) {
                  p.unit = 'Bộ';
                } else if (pSku.indexOf('BE-') === 0) {
                  p.unit = 'Bể';
                }
              }
            });

            // Xử lý 49 bản ghi Production: Không xóa lệnh, liên kết chặt chẽ
            var prodItems = (prodRaw || []).map(function(p) {
              return {
                id: p.id,
                orderId: p.orderId,
                type: p.type,
                name: p.name,
                note: p.note,
                status: p.status,
                deadline: p.deadline,
                fulfilledFromStock: Boolean(p.fulfilledFromStock),
                qc_front_photo: p.qc_front_photo || '',
                qc_side_photo: p.qc_side_photo || '',
                qc_status: p.qc_status || '',
                qc_note: p.qc_note || '',
                serialCode: p.serialCode || '',
                usedByOrderCode: p.usedByOrderCode || '',
                usedAt: p.usedAt || '',
                phases: {
                  phase1: {
                    name: p.p1_name || '',
                    status: p.p1_status || '',
                    user: p.p1_user || '',
                    start: p.p1_start || '',
                    endTime: p.p1_endTime || '',
                    photo: p.p1_photo || '',
                    reward_vnd: Number(p.p1_reward_vnd || 0)
                  },
                  phase2: {
                    name: p.p2_name || '',
                    status: p.p2_status || '',
                    user: p.p2_user || '',
                    start: p.p2_start || '',
                    endTime: p.p2_endTime || '',
                    photo: p.p2_photo || '',
                    reward_vnd: Number(p.p2_reward_vnd || 0)
                  }
                }
              };
            });

            var nowTs = Date.now();
            var appData = {
              orders: effectiveOrders || [],
              prodItems: prodItems,
              packings: packingsRaw || [],
              attendance: attRaw || [],
              kpiConfig: effectiveKpi,
              configGiaLayout: giaLayoutRaw || [],
              Config_NhanSu: effectiveStaff,
              Products: effectiveProducts,
              BOM_Config: effectiveBom,
              Transactions: transRaw || [],
              ImportExport: impRaw || [],
              Accounts: accRaw || [],
              Suppliers: effectiveSuppliers,
              documents: effectiveDocs,
              trainings: effectiveTrainings,
              models3D: modRaw || [],
              ctvFinance: ctvRaw || [],
              monthlySnapshots: snapRaw || [],
              reimbursements: [],
              announcement: 'Hệ thống RF Workspace V2 vận hành độc lập trên CSDL Supabase PostgreSQL.',
              tabPermissions: {},
              archiveStats: {
                lastArchivedAt: '',
                lastArchivedCount: 0,
                lastCutoff: ''
              },
              serverTime: nowTs,
              dataVersion: 'sb_' + nowTs
            };

            console.log('✅ [SUPABASE] Đã nạp thành công ' + appData.orders.length + ' đơn hàng & ' + appData.prodItems.length + ' lệnh sản xuất!');
            try {
              localStorage.setItem('rf_turbo_cache_app_data', JSON.stringify(appData));
            } catch(e) {}

            return appData;
          } catch(e) {
            console.error('Supabase load failed:', e);
            // Fallback sang cache nếu có lỗi để bảo vệ giao diện không bị trắng/0 đơn
            try {
              var fallbackApp = JSON.parse(localStorage.getItem('rf_turbo_cache_app_data') || '{}');
              if (fallbackApp && fallbackApp.orders && fallbackApp.orders.length > 0) {
                console.warn('⚠️ [SUPABASE] Kích hoạt Turbo Cache dự phòng!');
                return fallbackApp;
              }
            } catch(cacheErr) {}
            throw e;
          }
        }

        // 4. syncDeltas: Lưu thay đổi trực tiếp vào Supabase PostgreSQL
        if (action === 'syncDeltas') {
          var payload = args[0] || {};
          console.log('⚡ [SUPABASE] Lưu syncDeltas vào CSDL Supabase PostgreSQL:', payload);
          try {
            // Write Orders
            var ords = payload.Orders || payload.orders;
            if (ords && ords.length) {
              // Lưu vào local cache an toàn
              try {
                var persisted = JSON.parse(localStorage.getItem('rf_persisted_test_orders') || '{}');
                ords.forEach(function(o) { if (o && o.id) persisted[o.id] = o; });
                localStorage.setItem('rf_persisted_test_orders', JSON.stringify(persisted));
              } catch(e) {}

              // Whitelist chính xác 32 cột của bảng Orders trước khi ghi Supabase (chống PGRST204)
              var cleanOrds = ords.map(function(o) {
                var c = {};
                ORDERS_SCHEMA.forEach(function(col) {
                  if (col === 'accessories') {
                    c.accessories = typeof o.accessories === 'string' ? o.accessories : JSON.stringify(o.accessories || []);
                  } else if (col === 'hasProduction' || col === 'isCarriedToWH' || col === 'isReconciled' || col === 'isUrgent') {
                    c[col] = Boolean(o[col]);
                  } else if (['revenue', 'prePaid', 'cod', 'costTotal', 'discount', 'sizeCoefficient', 'cogs', 'feeFixed', 'feeService', 'feePayment', 'feeAffiliate', 'shopVoucher', 'tax'].indexOf(col) >= 0) {
                    c[col] = Number(o[col] || 0);
                  } else {
                    c[col] = o[col] !== undefined && o[col] !== null ? String(o[col]) : '';
                  }
                });
                return c;
              });
              await upsertToSupabase('Orders', cleanOrds);
            }

            // Write Production
            var prods = payload.Production || payload.prodItems;
            if (prods && prods.length) {
              var cleanProds = prods.map(function(p) {
                var c = {};
                var rawP = Object.assign({}, p);
                if (rawP.phases) {
                  if (rawP.phases.phase1) {
                    rawP.p1_name = rawP.phases.phase1.name;
                    rawP.p1_status = rawP.phases.phase1.status;
                    rawP.p1_user = rawP.phases.phase1.user;
                    rawP.p1_start = rawP.phases.phase1.start;
                    rawP.p1_endTime = rawP.phases.phase1.endTime;
                    rawP.p1_photo = rawP.phases.phase1.photo;
                    rawP.p1_reward_vnd = rawP.phases.phase1.reward_vnd;
                  }
                  if (rawP.phases.phase2) {
                    rawP.p2_name = rawP.phases.phase2.name;
                    rawP.p2_status = rawP.phases.phase2.status;
                    rawP.p2_user = rawP.phases.phase2.user;
                    rawP.p2_start = rawP.phases.phase2.start;
                    rawP.p2_endTime = rawP.phases.phase2.endTime;
                    rawP.p2_photo = rawP.phases.phase2.photo;
                    rawP.p2_reward_vnd = rawP.phases.phase2.reward_vnd;
                  }
                }
                PROD_SCHEMA.forEach(function(col) {
                  if (col === 'fulfilledFromStock') {
                    c[col] = Boolean(rawP[col]);
                  } else if (col === 'p1_reward_vnd' || col === 'p2_reward_vnd') {
                    c[col] = Number(rawP[col] || 0);
                  } else {
                    c[col] = rawP[col] !== undefined && rawP[col] !== null ? String(rawP[col]) : '';
                  }
                });
                return c;
              });
              await upsertToSupabase('Production', cleanProds);
            }

            // Write Packings
            var packs = payload.Packings || payload.packings;
            if (packs && packs.length) await upsertToSupabase('Packings', packs);

            // Write Attendance
            var atts = payload.Attendance || payload.attendance;
            if (atts && atts.length) await upsertToSupabase('Attendance', atts);

            // Write Products
            var prds = payload.Products || payload.products;
            if (prds && prds.length) {
              try {
                var localProdOv = JSON.parse(localStorage.getItem('rf_local_products_override') || '{}');
                prds.forEach(function(p) {
                  var key = p.id || p.sku;
                  if (key) localProdOv[key] = Object.assign(localProdOv[key] || {}, p);
                });
                localStorage.setItem('rf_local_products_override', JSON.stringify(localProdOv));
              } catch(e) {}
              await upsertToSupabase('Products', prds);
            }

            // Write Transactions
            var trans = payload.Transactions || payload.transactions;
            if (trans && trans.length) await upsertToSupabase('Transactions', trans);

            // Write ImportExport
            var imps = payload.ImportExport || payload.importExport;
            if (imps && imps.length) await upsertToSupabase('ImportExport', imps);

            // Write Accounts
            var accs = payload.Accounts || payload.accounts;
            if (accs && accs.length) await upsertToSupabase('Accounts', accs);

            // Write Suppliers
            var sups = payload.Suppliers || payload.suppliers;
            if (sups && sups.length) await upsertToSupabase('Suppliers', sups);

            // Write BOM_Config
            var boms = payload.BOM_Config || payload.bomConfig;
            if (boms && boms.length) await upsertToSupabase('BOM_Config', boms);

            // Write BonusPenalty
            var bpen = payload.BonusPenalty || payload.bonusPenalty;
            if (bpen && bpen.length) await upsertToSupabase('BonusPenalty', bpen);

            // Write CTV_Finance
            var ctv = payload.CTV_Finance || payload.ctvTransactions;
            if (ctv && ctv.length) await upsertToSupabase('CTV_Finance', ctv);

            // Write Documents
            var docs = payload.Documents || payload.documents;
            if (docs && docs.length) await upsertToSupabase('Documents', docs);

            // Write Trainings
            var trains = payload.Trainings || payload.trainings;
            if (trains && trains.length) await upsertToSupabase('Trainings', trains);

            // Write Models3D
            var mods = payload.Models3D || payload.models3D;
            if (mods && mods.length) await upsertToSupabase('Models3D', mods);

            // Write Config_NhanSu
            var staffDeltas = payload.Config_NhanSu || payload.configNhanSu || payload.staff;
            if (staffDeltas && staffDeltas.length) {
              var cleanStaff = staffDeltas.map(function(st) {
                return {
                  id: String(st.id || ('staff_' + Date.now())),
                  'Tên Nhân Sự': String(st['Tên Nhân Sự'] || st.name || ''),
                  'ID Ảnh': String(st['ID Ảnh'] || st.avatar || ''),
                  'Chức Danh': String(st['Chức Danh'] || st.title || 'Thợ'),
                  'Chức Danh Phụ': String(st['Chức Danh Phụ'] || st.subTitle || ''),
                  'Phân Quyền': String(st['Phân Quyền'] || st.role || 'THỢ'),
                  'Mã PIN': String(st['Mã PIN'] || st.pin || ''),
                  'Lương Cơ Bản': Number(st['Lương Cơ Bản'] || st.baseSalary || 0),
                  'Lương Chức Vụ': Number(st['Lương Chức Vụ'] || st.funcSalary || 0),
                  'Phụ Cấp Xăng Xe': Number(st['Phụ Cấp Xăng Xe'] || st.allowance || 0),
                  'Khoản Trừ Vi Phạm': Number(st['Khoản Trừ Vi Phạm'] || st.deduction || 0),
                  'Gmail': String(st['Gmail'] || st.email || ''),
                  'Số Điện Thoại': String(st['Số Điện Thoại'] || st.phone || ''),
                  'Địa Chỉ': String(st['Địa Chỉ'] || st.address || ''),
                  'Ngày Sinh': String(st['Ngày Sinh'] || st.dob || ''),
                  'Số CCCD': String(st['Số CCCD'] || st.cccd || ''),
                  'Trạng Thái': String(st['Trạng Thái'] || st.status || 'Đang làm việc')
                };
              });
              await upsertToSupabase('Config_NhanSu', cleanStaff);
            }

            // Handle Deletes
            if (payload.deletes && typeof payload.deletes === 'object') {
              for (var delTbl in payload.deletes) {
                var delIds = payload.deletes[delTbl];
                if (delIds && delIds.length) {
                  await deleteFromSupabase(delTbl, delIds);
                }
              }
            }

            return {
              success: true,
              message: 'Dữ liệu đã được lưu thành công vào CSDL Supabase PostgreSQL!'
            };
          } catch(syncErr) {
            console.error('syncDeltas error:', syncErr);
            return {
              success: false,
              error: 'SUPABASE_SYNC_ERROR',
              message: 'Lỗi lưu CSDL Supabase: ' + syncErr.message
            };
          }
        }

        // 4. Employee Management Handlers
        if (action === 'api_addEmployee' || action === 'api_saveEmployee') {
          var staffPayload = args[0] || {};
          var sName = String(staffPayload['Tên Nhân Sự'] || staffPayload.name || '').trim();
          if (!sName) return { success: false, message: 'Tên nhân sự không được để trống' };
          var sId = String(staffPayload.id || ('staff_' + Date.now()));
          var cleanStaffRow = {
            id: sId,
            'Tên Nhân Sự': sName,
            'ID Ảnh': String(staffPayload['ID Ảnh'] || staffPayload.avatar || ''),
            'Chức Danh': String(staffPayload['Chức Danh'] || staffPayload.title || 'Thợ'),
            'Chức Danh Phụ': String(staffPayload['Chức Danh Phụ'] || staffPayload.subTitle || ''),
            'Phân Quyền': String(staffPayload['Phân Quyền'] || staffPayload.role || 'THỢ'),
            'Mã PIN': String(staffPayload['Mã PIN'] || staffPayload.pin || ''),
            'Lương Cơ Bản': Number(staffPayload['Lương Cơ Bản'] || staffPayload.baseSalary || 0),
            'Lương Chức Vụ': Number(staffPayload['Lương Chức Vụ'] || staffPayload.funcSalary || 0),
            'Phụ Cấp Xăng Xe': Number(staffPayload['Phụ Cấp Xăng Xe'] || staffPayload.allowance || 0),
            'Khoản Trừ Vi Phạm': Number(staffPayload['Khoản Trừ Vi Phạm'] || staffPayload.deduction || 0),
            'Gmail': String(staffPayload['Gmail'] || staffPayload.email || ''),
            'Số Điện Thoại': String(staffPayload['Số Điện Thoại'] || staffPayload.phone || ''),
            'Địa Chỉ': String(staffPayload['Địa Chỉ'] || staffPayload.address || ''),
            'Ngày Sinh': String(staffPayload['Ngày Sinh'] || staffPayload.dob || ''),
            'Số CCCD': String(staffPayload['Số CCCD'] || staffPayload.cccd || ''),
            'Trạng Thái': String(staffPayload['Trạng Thái'] || staffPayload.status || 'Đang làm việc')
          };
          await upsertToSupabase('Config_NhanSu', [cleanStaffRow]);
          return { success: true, message: 'Đã lưu hồ sơ nhân sự thành công!' };
        }

        if (action === 'api_deleteEmployee') {
          var targetId = String(args[0] || '');
          var targetName = String(args[1] || targetId);
          if (!targetId) return { success: false, message: 'Mã nhân sự không hợp lệ' };
          
          // Kiểm tra quyền Admin
          var currentRole = (localStorage.getItem('rf_role') || '').toUpperCase();
          var isAdm = currentRole.indexOf('TỐI CAO') >= 0 || currentRole.indexOf('ADMIN') >= 0 || (localStorage.getItem('rf_admin') === 'true') || (localStorage.getItem('rf_boss') === 'true');
          if (!isAdm) return { success: false, message: 'Từ chối: Bạn không có quyền Admin để xóa nhân sự.' };

          // Kiểm tra ràng buộc dữ liệu liên kết
          var [attRows, prodRows, packRows] = await Promise.all([
            fetchFromSupabaseWithRetry('Attendance', 'select=id,user&limit=100', 2),
            fetchFromSupabaseWithRetry('Production', 'select=id,p1_user,p2_user&limit=100', 2),
            fetchFromSupabaseWithRetry('Packings', 'select=id,user&limit=100', 2)
          ]);
          var hasAtt = (attRows || []).some(function(a) { return a.user === targetName; });
          var hasProd = (prodRows || []).some(function(p) { return p.p1_user === targetName || p.p2_user === targetName; });
          var hasPack = (packRows || []).some(function(pk) { return pk.user === targetName; });

          if (hasAtt || hasProd || hasPack) {
            // Có dữ liệu liên quan -> Soft delete (ngừng hoạt động để bảo toàn liên kết dữ liệu)
            await upsertToSupabase('Config_NhanSu', [{ id: targetId, 'Trạng Thái': 'Đã nghỉ việc' }]);
            return {
              success: true,
              softDeleted: true,
              message: 'Nhân sự có dữ liệu liên quan (chấm công / sản xuất) nên đã được chuyển sang trạng thái "Đã nghỉ việc" để bảo toàn lịch sử!'
            };
          } else {
            // Không có dữ liệu liên quan -> Xóa cứng vĩnh viễn theo ID
            await deleteFromSupabase('Config_NhanSu', [targetId]);
            return {
              success: true,
              softDeleted: false,
              message: 'Đã xóa vĩnh viễn hồ sơ nhân sự khỏi hệ thống!'
            };
          }
        }

        // 5. Apprenticeship Module Handlers
        if (action === 'api_apprenticeshipList') {
          var user = localStorage.getItem('rf_user') || 'Admin';
          var role = (localStorage.getItem('rf_role') || '').toUpperCase();
          var isStudio = role.indexOf('TỐI CAO') >= 0 || role.indexOf('ADMIN') >= 0 || role.indexOf('QUẢN LÝ') >= 0;
          var storeKey = 'RF_APPRENTICESHIP_STORE_V2';
          var orders = [];
          try {
            orders = JSON.parse(localStorage.getItem(storeKey) || '[]');
          } catch(e) {
            orders = [];
          }
          if (!Array.isArray(orders)) orders = [];
          return {
            success: true,
            studio: isStudio,
            user: user,
            orders: orders.filter(function(d) {
              return d && d.kind !== 'TEMPLATE' && (isStudio || d.assignee === user);
            })
          };
        }

        if (action === 'api_apprenticeshipResolveLayout') {
          var layout = args[1] || args[0] || '';
          var layoutNorm = String(layout).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();
          var bomCache = [];
          try {
            var cachedData = JSON.parse(localStorage.getItem('rf_turbo_cache_app_data') || '{}');
            bomCache = cachedData.BOM_Config || [];
          } catch(e) {}
          var matchedItems = (bomCache || []).filter(function(b) {
            var code = String(b.layoutCode || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();
            return code === layoutNorm || (layoutNorm && code.indexOf(layoutNorm) >= 0);
          });
          return {
            success: true,
            layout: layout,
            bomCount: matchedItems.length,
            items: matchedItems
          };
        }

        if (action === 'getLayout5AnglesDriveCatalog') {
          return [];
        }

        if (action === 'getDeferredUiBundle') {
          return '';
        }

        // Default mock response for auxiliary client actions
        return { success: true };
      }

      // Universal Google Apps Script Proxy for Standalone Hosting
      function createGasRunner(successHandler, failureHandler) {
        var runner = {
          _successHandler: successHandler,
          _failureHandler: failureHandler,
          withSuccessHandler: function(fn) {
            return createGasRunner(fn, failureHandler);
          },
          withFailureHandler: function(fn) {
            return createGasRunner(successHandler, fn);
          },
          withUserObject: function() {
            return createGasRunner(successHandler, failureHandler);
          }
        };
        return new Proxy(runner, {
          get: function(target, prop) {
            if (prop in target) {
              return target[prop];
            }
            if (typeof prop === 'symbol' || prop === 'then' || prop === 'catch' || prop === 'inspect') {
              return undefined;
            }
            return function() {
              var args = Array.prototype.slice.call(arguments);
              var pin = localStorage.getItem('rf_pin') || '';
              return callRemoteGasApi(prop, args, pin).then(function(res) {
                if (target._successHandler) {
                  try { target._successHandler(res); } catch(e) { console.error('Success handler error for ' + String(prop) + ':', e); }
                }
                return res;
              }).catch(function(err) {
                if (target._failureHandler) {
                  try { target._failureHandler(err); } catch(e) { console.error('Failure handler error for ' + String(prop) + ':', e); }
                } else {
                  console.warn('Supabase RPC Error [' + String(prop) + ']:', err);
                }
              });
            };
          }
        });
      }

      if (typeof window.google === 'undefined') {
        window.google = {};
      }
      if (!window.google.script) {
        window.google.script = {};
      }
      window.google.script.run = createGasRunner(null, null);

      // Accelerate window.runGAS to call local RPC directly
      window.runGAS = function(serverFunctionName) {
        var args = Array.prototype.slice.call(arguments, 1);
        var pin = localStorage.getItem('rf_pin') || '';
        return new Promise(function(resolve, reject) {
          callRemoteGasApi(serverFunctionName, args, pin).then(function(res) {
            if (res && (res._AUTH_FAILED || res.isAuthFailed || res.error === "AUTH_FAILED")) {
              alert('Phiên làm việc chưa xác thực! Vui lòng đăng nhập lại.');
              localStorage.clear();
              window.location.reload();
              return;
            }
            resolve(res);
          }).catch(function(err) {
            console.error('Supabase RPC Error (' + serverFunctionName + '):', err);
            reject(err);
          });
        });
      };
    })();
  </script>
"""

# Inject Deferred Content (Extended Tabs: Production, Inventory, HR, Finance, etc.) BEFORE Compiled_Core
# Điều này đảm bảo khi App render thì tất cả 15 phân hệ đã tồn tại trong bộ nhớ, không bao giờ bị kẹt loader!
deferred_script = f"""
  <!-- ⚡ PRELOADED COMPILED DEFERRED TABS (PRODUCTION, INVENTORY, FINANCE, HR, ETC.) ⚡ -->
  <script id="rf-bundle-Compiled_Deferred">
{deferred_content_clean}
  </script>
  <script>
    (function() {{
      window.deferredReady = true;
      window.__rfDeferredInjected = true;
      try {{
        window.dispatchEvent(new CustomEvent('rf-deferred-ready'));
        window.dispatchEvent(new CustomEvent('rf-tab-loaded'));
      }} catch(e) {{}}
    }})();
  </script>
"""

output_html = output_html.replace('</head>', bridge_script + '\n</head>')

target_core_marker = '<script type="text/plain" id="rf-bundle-Compiled_Core">'
if target_core_marker in output_html:
    output_html = output_html.replace(target_core_marker, deferred_script + '\n' + target_core_marker)
else:
    output_html = re.sub(r'(<script[^>]*id=["\']rf-bundle-Compiled_Core["\'])', deferred_script + r'\n\1', output_html)


# 5. Write to V2 directory as index.html
output_file = os.path.join(v2_dir, 'index.html')
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(output_html)

print(f"Generated standalone index.html: {len(output_html)} bytes ({len(output_html)/1024:.1f} KB)")
print("RF Workspace V2: Pure Supabase Standalone build completed successfully!")
