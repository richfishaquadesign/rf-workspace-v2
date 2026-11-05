import os, re, json, base64

current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root_dir = current_dir if os.path.exists(os.path.join(current_dir, 'html', 'Index.html')) else r'C:\Users\ADMIN\RF_Workspace_Pro'
v2_dir = current_dir

print("Generating Vercel Standalone Package for RF Workspace V2...")

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

# 4. Inject Turbo-Cache & Vercel HTTP Bridge at top of <head>
bridge_script = """
  <!-- ⚡ VERCEL TURBO-CACHE & DIRECT SUPABASE DATABASE ENGINE ⚡ -->
  <script>
    (function() {
      window.RF_STANDALONE = true;
      window.RF_BACKEND_API_URL = 'https://script.google.com/macros/s/AKfycbz3BzyRPWT7Ax6pb219NyZfJen0GAFgvvdxNtnUy68Oj4kiPM2-glVAahqTu99ebjrDrQ/exec';
      window.deferredReady = true;
      window.__rfDeferredInjected = true;
      window.__rfLoadTabNow = function() { return Promise.resolve({ok:true}); };
      
      console.log('🚀 RF Workspace Pro V2 running in High-Performance Mode (Supabase Engine Direct)');

      var SUPABASE_URL = 'https://oxtttywpelbyitgxspfm.supabase.co';
      var SUPABASE_KEY = 'sb_publishable_Bi-hpAsVX5nS10wE_LugRA_RF8wnu0W';
      var SUPABASE_HEADERS = {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      };

      async function fetchFromSupabase(table, query) {
        try {
          var url = SUPABASE_URL + '/rest/v1/' + table + (query ? '?' + query : '');
          var resp = await fetch(url, { headers: SUPABASE_HEADERS });
          if (!resp.ok) {
            console.warn('Supabase fetch returned ' + resp.status + ' for ' + table);
            return [];
          }
          return await resp.json();
        } catch(e) {
          console.warn('Fetch Supabase ' + table + ' error:', e);
          return [];
        }
      }

      // Parallel multi-page fetcher for tables exceeding Supabase 1,000 limit
      async function fetchAllFromSupabase(table, query, maxPages) {
        maxPages = maxPages || 3;
        var pages = [];
        for (var p = 0; p < maxPages; p++) {
          var offset = p * 1000;
          var sep = query ? '&' : '';
          var q = (query || '') + sep + 'limit=1000&offset=' + offset;
          pages.push(fetchFromSupabase(table, q));
        }
        var results = await Promise.all(pages);
        var combined = [];
        for (var i = 0; i < results.length; i++) {
          if (results[i] && results[i].length) {
            combined = combined.concat(results[i]);
            if (results[i].length < 1000) break;
          } else {
            break;
          }
        }
        return combined;
      }

      // Supabase Upsert Helper
      async function upsertToSupabase(table, rows) {
        if (!rows || !rows.length) return;
        try {
          var url = SUPABASE_URL + '/rest/v1/' + table;
          var headers = Object.assign({}, SUPABASE_HEADERS, {
            'Prefer': 'resolution=merge-duplicates'
          });
          await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(rows)
          });
        } catch(e) {
          console.warn('Upsert to ' + table + ' failed:', e);
        }
      }

      // HTTP fetch helper with Supabase direct acceleration
      async function callRemoteGasApi(action, args, pin) {
        // 1. PIN Authentication
        if (action === 'validatePin') {
          var inputPin = String(args[0] || pin || '').trim();
          var staffRows = await fetchFromSupabase('Config_NhanSu', 'select=*');
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
        }

        // 2. User Config
        if (action === 'getUserConfig') {
          var staffRows = await fetchFromSupabase('Config_NhanSu', 'select=*');
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
            cfg.staffList.push(name);
            if (s['ID Ảnh']) {
              var m = String(s['ID Ảnh']).match(/[-\w]{25,}/);
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

        // 3. Core App Data (getAppData / getAppDataIfChanged)
        if (action === 'getAppData' || action === 'getAppDataIfChanged') {
          console.log('⚡ [SUPABASE] Pulling live dataset from PostgreSQL tables...');
          try {
            const [ordersRaw, prodRaw, packingsRaw, productsRaw, staffRaw, kpiRaw, giaLayoutRaw, bomRaw, transRaw, impRaw, accRaw, supRaw, attRaw, docRaw, trainRaw, modRaw, ctvRaw, snapRaw] = await Promise.all([
              fetchAllFromSupabase('Orders', 'select=*&order=createdAt.desc', 3),
              fetchAllFromSupabase('Production', 'select=*&order=deadline.asc', 3),
              fetchAllFromSupabase('Packings', 'select=*&order=start.desc', 3),
              fetchFromSupabase('Products', 'select=*&limit=1000'),
              fetchFromSupabase('Config_NhanSu', 'select=*'),
              fetchFromSupabase('Config_KPI', 'select=*'),
              fetchFromSupabase('Config_GiaLayout', 'select=*'),
              fetchAllFromSupabase('BOM_Config', 'select=*', 2),
              fetchAllFromSupabase('Transactions', 'select=*&order=date.desc', 2),
              fetchAllFromSupabase('ImportExport', 'select=*&order=date.desc', 3),
              fetchFromSupabase('Accounts', 'select=*'),
              fetchFromSupabase('Suppliers', 'select=*'),
              fetchAllFromSupabase('Attendance', 'select=*&order=date.desc', 2),
              fetchFromSupabase('Documents', 'select=*'),
              fetchFromSupabase('Trainings', 'select=*'),
              fetchFromSupabase('Models3D', 'select=*'),
              fetchFromSupabase('CTV_Finance', 'select=*'),
              fetchFromSupabase('Monthly_Snapshots', 'select=*')
            ]);

            // Normalise Orders (accessories, boolean flags, numbers)
            (ordersRaw || []).forEach(function(o) {
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

            // Normalise Production items into phases format
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
              orders: ordersRaw || [],
              prodItems: prodItems,
              packings: packingsRaw || [],
              attendance: attRaw || [],
              kpiConfig: kpiRaw || [],
              configGiaLayout: giaLayoutRaw || [],
              Config_NhanSu: staffRaw || [],
              Products: productsRaw || [],
              BOM_Config: bomRaw || [],
              Transactions: transRaw || [],
              ImportExport: impRaw || [],
              Accounts: accRaw || [],
              Suppliers: supRaw || [],
              documents: docRaw || [],
              trainings: trainRaw || [],
              models3D: modRaw || [],
              ctvFinance: ctvRaw || [],
              monthlySnapshots: snapRaw || [],
              reimbursements: [],
              announcement: 'Hệ thống RF Workspace V2 vận hành trực tiếp trên CSDL Supabase High-Performance.',
              tabPermissions: {},
              archiveStats: {
                lastArchivedAt: '',
                lastArchivedCount: 0,
                lastCutoff: ''
              },
              serverTime: nowTs,
              dataVersion: 'sb_' + nowTs
            };

            console.log('✅ [SUPABASE] Successfully loaded ' + appData.orders.length + ' orders & ' + appData.prodItems.length + ' production items!');
            try {
              localStorage.setItem('rf_turbo_cache_app_data', JSON.stringify(appData));
            } catch(e) {}

            return appData;
          } catch(e) {
            console.error('Supabase load failed, falling back to GAS API:', e);
          }
        }

        // 4. Fallback to GAS Remote Web App for any specialized procedures
        var payload = {
          action: action,
          pin: pin || localStorage.getItem('rf_pin') || '',
          args: args || []
        };
        
        if (action === 'syncDeltas') {
          payload.payload = args[0];
          payload.pin = args[1] || payload.pin;
        }

        var url = window.RF_BACKEND_API_URL;
        var resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        
        if (!resp.ok) {
          throw new Error('HTTP ' + resp.status + ': Không thể kết nối máy chủ dữ liệu.');
        }
        var resJson = await resp.json();
        if (resJson && resJson.data !== undefined && resJson.data !== null) {
          return resJson.data;
        }
        return resJson;
      }

      // Universal Google Apps Script Proxy for Standalone Hosting
      function createGasRunner() {
        var _success = null;
        var _failure = null;
        var handler = {
          get: function(target, prop) {
            if (prop === 'withSuccessHandler') {
              return function(fn) { _success = fn; return new Proxy({}, handler); };
            }
            if (prop === 'withFailureHandler') {
              return function(fn) { _failure = fn; return new Proxy({}, handler); };
            }
            if (prop === 'withUserObject') {
              return function() { return new Proxy({}, handler); };
            }
            if (prop === 'getDeferredUiBundle') {
              return function() {
                var raw = sessionStorage.getItem('rf_deferred_v2_direct');
                if (_success) _success(raw);
              };
            }
            return function() {
              var callArgs = Array.prototype.slice.call(arguments);
              callRemoteGasApi(prop, callArgs).then(function(res) {
                if (_success) _success(res);
              }).catch(function(err) {
                if (_failure) _failure(err);
                else console.error('GAS Error [' + prop + ']:', err);
              });
            };
          }
        };
        return new Proxy({}, handler);
      }
      window.google = window.google || {};
      window.google.script = window.google.script || {};
      Object.defineProperty(window.google.script, 'run', {
        get: function() { return createGasRunner(); },
        configurable: true
      });

      // Enhanced runGAS bridge
      window.runGAS = function(serverFunctionName, ...args) {
        return new Promise(function(resolve, reject) {
          callRemoteGasApi(serverFunctionName, args).then(function(res) {
            if (res && res.success !== undefined && res.data !== undefined) {
              resolve(res.data);
            } else {
              resolve(res);
            }
          }).catch(function(err) {
            console.error('Remote API Error (' + serverFunctionName + '):', err);
            reject(err);
          });
        });
      };
    })();
  </script>
"""

output_html = output_html.replace('<head>', '<head>\n' + bridge_script, 1)

# Inlined Deferred bundle directly into page
output_html = output_html.replace('</body>', f'<script>\n{deferred_content_clean}\nwindow.deferredReady=true;\nwindow.dispatchEvent(new CustomEvent("rf-deferred-ready"));\n</script>\n</body>')

# 5. Write to V2 directory as index.html
output_file = os.path.join(v2_dir, 'index.html')
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(output_html)

print(f"Generated standalone index.html: {len(output_html)} bytes ({len(output_html)/1024:.1f} KB)")

# 6. Copy icons and manifest.json
for item in ['manifest.json', 'icon.png', 'vercel.json']:
    src = os.path.join(root_dir, item)
    if os.path.exists(src):
        dst = os.path.join(v2_dir, item)
        with open(src, 'rb') as f_in, open(dst, 'wb') as f_out:
            f_out.write(f_in.read())
        print(f"Copied: {item}")

print("V2 Standalone build completed successfully!")
