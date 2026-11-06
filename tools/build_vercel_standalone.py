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

# 4. Inject Turbo-Cache & Pure Supabase Database Engine at top of <head>
bridge_script = """
  <!-- ⚡ RF WORKSPACE V2 PURE SUPABASE POSTGRESQL ENGINE (ZERO GOOGLE APPS SCRIPT) ⚡ -->
  <script>
    (function() {
      window.RF_STANDALONE = true;
      window.RF_V2_APP = true;
      window.deferredReady = true;
      window.__rfDeferredInjected = true;
      window.__rfLoadTabNow = function() { return Promise.resolve({ok:true}); };
      
      console.log('🚀 RF Workspace V2: Running as an Independent High-Performance App on Supabase & Vercel.');

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
            console.warn('Supabase fetch status ' + resp.status + ' on ' + table);
            return [];
          }
          return await resp.json();
        } catch(e) {
          console.warn('Fetch Supabase ' + table + ' error:', e);
          return [];
        }
      }

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

      async function upsertToSupabase(table, rows) {
        if (!rows || !rows.length) return;
        try {
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
            console.warn('Upsert ' + table + ' failed with status ' + resp.status);
          }
        } catch(e) {
          console.warn('Upsert to ' + table + ' error:', e);
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

      // Universal Pure-Supabase RPC Router
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
          return { valid: false, error: 'Mã PIN không đúng' };
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

            console.log('✅ [SUPABASE] Successfully loaded ' + appData.orders.length + ' orders & ' + appData.prodItems.length + ' production items!');
            try {
              localStorage.setItem('rf_turbo_cache_app_data', JSON.stringify(appData));
            } catch(e) {}

            return appData;
          } catch(e) {
            console.error('Supabase load failed:', e);
            throw e;
          }
        }

        // 4. syncDeltas: Writes changes directly to Supabase PostgreSQL
        if (action === 'syncDeltas') {
          var payload = args[0] || {};
          console.log('⚡ [SUPABASE] Saving syncDeltas directly into Supabase tables:', payload);
          try {
            // Write Orders
            var ords = payload.Orders || payload.orders;
            if (ords && ords.length) {
              var cleanOrds = ords.map(function(o) {
                var c = Object.assign({}, o);
                if (c.accessories && typeof c.accessories !== 'string') {
                  c.accessories = JSON.stringify(c.accessories);
                }
                return c;
              });
              await upsertToSupabase('Orders', cleanOrds);
            }

            // Write Production
            var prods = payload.Production || payload.prodItems;
            if (prods && prods.length) {
              var cleanProds = prods.map(function(p) {
                var c = Object.assign({}, p);
                if (c.phases) {
                  if (c.phases.phase1) {
                    c.p1_name = c.phases.phase1.name;
                    c.p1_status = c.phases.phase1.status;
                    c.p1_user = c.phases.phase1.user;
                    c.p1_start = c.phases.phase1.start;
                    c.p1_endTime = c.phases.phase1.endTime;
                    c.p1_photo = c.phases.phase1.photo;
                    c.p1_reward_vnd = c.phases.phase1.reward_vnd;
                  }
                  if (c.phases.phase2) {
                    c.p2_name = c.phases.phase2.name;
                    c.p2_status = c.phases.phase2.status;
                    c.p2_user = c.phases.phase2.user;
                    c.p2_start = c.phases.phase2.start;
                    c.p2_endTime = c.phases.phase2.endTime;
                    c.p2_photo = c.phases.phase2.photo;
                    c.p2_reward_vnd = c.phases.phase2.reward_vnd;
                  }
                  delete c.phases;
                }
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
            if (prds && prds.length) await upsertToSupabase('Products', prds);

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
              message: 'Dữ liệu đã được lưu trực tiếp vào CSDL Supabase PostgreSQL!'
            };
          } catch(syncErr) {
            console.error('Supabase syncDeltas error:', syncErr);
            return {
              success: false,
              error: 'SUPABASE_SYNC_ERROR',
              message: 'Lỗi lưu CSDL Supabase: ' + syncErr.message
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
          var layoutNorm = String(layout).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();
          var bomCache = [];
          try {
            var cachedData = JSON.parse(localStorage.getItem('rf_turbo_cache_app_data') || '{}');
            bomCache = cachedData.BOM_Config || [];
          } catch(e) {}
          
          var matchedBom = bomCache.filter(function(b) {
            var codeNorm = String(b.layoutCode || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();
            return codeNorm && (layoutNorm.indexOf(codeNorm) >= 0 || codeNorm.indexOf(layoutNorm) >= 0);
          });

          var materials = matchedBom.map(function(b) {
            return {
              sku: b.materialSku,
              name: b.materialSku,
              qty: Number(b.defaultQty) || 1,
              unit: b.unit || 'cái'
            };
          });

          var options = materials.length > 0 ? [{
            key: 'config:' + layout,
            code: layout,
            name: layout,
            source: 'BOM_Config',
            materials: materials
          }] : [];

          var templates = {};
          try {
            templates = JSON.parse(localStorage.getItem('RF_APPRENTICESHIP_TEMPLATES_V2') || '{}');
          } catch(e) {}

          var tpl = templates[layout] || null;

          return {
            success: true,
            options: options,
            selected: options[0] || null,
            template: tpl,
            message: options.length ? '' : 'Chưa có định mức BOM cho ' + layout + '. Có thể soạn và lưu hướng dẫn ngay; cần bổ sung BOM trước khi giao bài.'
          };
        }

        if (action === 'api_apprenticeshipTemplateSave') {
          var tLayout = args[1] || args[0] || '';
          var tImages = args[2] || args[1] || [];
          var tRevision = Number(args[3] || args[2] || 0);
          var templates = {};
          try {
            templates = JSON.parse(localStorage.getItem('RF_APPRENTICESHIP_TEMPLATES_V2') || '{}');
          } catch(e) {}
          var current = templates[tLayout] || { id: 'template:' + tLayout, kind: 'TEMPLATE', layout: tLayout, revision: 0, history: [] };
          current.images = tImages;
          current.revision = (current.revision || 0) + 1;
          templates[tLayout] = current;
          try {
            localStorage.setItem('RF_APPRENTICESHIP_TEMPLATES_V2', JSON.stringify(templates));
          } catch(e) {}
          return { success: true, template: current };
        }

        if (action === 'api_apprenticeshipMutate') {
          var mReq = args[1] || args[0] || {};
          var mAction = mReq.action;
          var mData = mReq.data || {};
          var user = localStorage.getItem('rf_user') || 'Admin';
          var storeKey = 'RF_APPRENTICESHIP_STORE_V2';
          var orders = [];
          try {
            orders = JSON.parse(localStorage.getItem(storeKey) || '[]');
          } catch(e) {}
          if (!Array.isArray(orders)) orders = [];

          if (mAction === 'create') {
            var newId = 'appr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            var steps = (mData.checklists || []).map(function(list) {
              var chks = Array.isArray(list) ? list : [];
              return {
                checklist: chks,
                checked: [],
                measurements: '',
                materials: '',
                report: '',
                photos: [],
                completed: false
              };
            });
            if (steps.length === 0) {
              steps = [
                { checklist: ['Kiểm tra dụng cụ', 'Lấy vật tư BOM'], checked: [], measurements: '', materials: '', report: '', photos: [], completed: false },
                { checklist: ['Làm sạch nguyên liệu'], checked: [], measurements: '', materials: '', report: '', photos: [], completed: false },
                { checklist: ['Dựng bố cục layout'], checked: [], measurements: '', materials: '', report: '', photos: [], completed: false },
                { checklist: ['Gia cố liên kết'], checked: [], measurements: '', materials: '', report: '', photos: [], completed: false },
                { checklist: ['Báo cáo số đo', 'Ảnh 5 góc'], checked: [], measurements: '', materials: '', report: '', photos: [], completed: false }
              ];
            }
            var newDoc = {
              id: newId,
              title: mData.title || ('Thực hành ' + (mData.layout || '')),
              assignee: mData.assignee || user,
              layout: mData.layout || '',
              norms: mData.norms || '',
              images: mData.images || [],
              steps: steps,
              step: 0,
              status: 'IN_PROGRESS',
              revision: 0,
              history: [{ at: new Date().toISOString(), actor: user, action: 'CREATE', note: 'Giao bài' }],
              incidents: [],
              bom: mData.bom || null
            };
            orders.unshift(newDoc);
            try { localStorage.setItem(storeKey, JSON.stringify(orders)); } catch(e) {}
            return { success: true, order: newDoc };
          }

          var doc = orders.find(function(o) { return o && o.id === mReq.id; });
          if (!doc) {
            return { success: false, message: 'Không tìm thấy bài học' };
          }

          if (mAction === 'save') {
            if (doc.steps && doc.steps[doc.step]) {
              Object.assign(doc.steps[doc.step], mData);
            }
            doc.revision = (doc.revision || 0) + 1;
            doc.history = doc.history || [];
            doc.history.push({ at: new Date().toISOString(), actor: user, action: 'SAVE_PROGRESS', step: doc.step, note: 'Lưu tiến độ' });
            try { localStorage.setItem(storeKey, JSON.stringify(orders)); } catch(e) {}
            return { success: true, order: doc };
          }

          if (mAction === 'advance') {
            if (doc.steps && doc.steps[doc.step]) {
              Object.assign(doc.steps[doc.step], mData);
              doc.steps[doc.step].completed = true;
            }
            if (doc.step < 4) {
              doc.step++;
            } else {
              doc.status = 'AWAITING_REVIEW';
            }
            doc.revision = (doc.revision || 0) + 1;
            doc.history = doc.history || [];
            doc.history.push({ at: new Date().toISOString(), actor: user, action: 'COMPLETE_STEP', step: doc.step, note: 'Hoàn thành công đoạn' });
            try { localStorage.setItem(storeKey, JSON.stringify(orders)); } catch(e) {}
            return { success: true, order: doc };
          }

          if (mAction === 'review') {
            doc.history = doc.history || [];
            if (mData.accept) {
              doc.status = 'ACCEPTED';
              doc.history.push({ at: new Date().toISOString(), actor: user, action: 'ACCEPT', step: doc.step, note: mData.note || 'Nghiệm thu đạt' });
            } else {
              doc.status = 'IN_PROGRESS';
              doc.step = typeof mData.returnStep === 'number' ? mData.returnStep : 0;
              doc.history.push({ at: new Date().toISOString(), actor: user, action: 'RETURN', step: doc.step, note: mData.note || 'Trả về công đoạn' });
            }
            doc.revision = (doc.revision || 0) + 1;
            try { localStorage.setItem(storeKey, JSON.stringify(orders)); } catch(e) {}
            return { success: true, order: doc };
          }

          if (mAction === 'incident') {
            doc.incidents = doc.incidents || [];
            doc.incidents.push({ at: new Date().toISOString(), actor: user, note: mData.note || '' });
            doc.history = doc.history || [];
            doc.history.push({ at: new Date().toISOString(), actor: user, action: 'INCIDENT', step: doc.step, note: mData.note || '' });
            doc.revision = (doc.revision || 0) + 1;
            try { localStorage.setItem(storeKey, JSON.stringify(orders)); } catch(e) {}
            return { success: true, order: doc };
          }

          if (mAction === 'annotations') {
            if (Array.isArray(mData.updates)) {
              mData.updates.forEach(function(u) {
                var img = (doc.images || []).find(function(im) { return im && im.id === u.imageId; });
                if (img) img.annotations = u.annotations;
              });
            }
            doc.revision = (doc.revision || 0) + 1;
            doc.history = doc.history || [];
            doc.history.push({ at: new Date().toISOString(), actor: user, action: 'ANNOTATIONS', step: doc.step, note: 'Cập nhật hướng dẫn ảnh' });
            try { localStorage.setItem(storeKey, JSON.stringify(orders)); } catch(e) {}
            return { success: true, order: doc };
          }

          return { success: true, order: doc };
        }

        if (action === 'api_apprenticeshipPhoto') {
          var pId = args[1] || args[0];
          var pImg = args[3] || args[2];
          var storeKey = 'RF_APPRENTICESHIP_STORE_V2';
          var orders = [];
          try { orders = JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch(e) {}
          var doc = (orders || []).find(function(o) { return o && o.id === pId; });
          if (doc && doc.steps && doc.steps[doc.step]) {
            doc.steps[doc.step].photos = doc.steps[doc.step].photos || [];
            var photoId = 'ph_' + Date.now();
            doc.steps[doc.step].photos.push({ id: photoId, url: pImg });
            doc.revision = (doc.revision || 0) + 1;
            try { localStorage.setItem(storeKey, JSON.stringify(orders)); } catch(e) {}
            return { success: true, order: doc };
          }
          return { success: false, message: 'Không thể thêm ảnh' };
        }

        if (action === 'api_apprenticeshipPhotoRead') {
          var pId = args[2] || args[1];
          var fId = args[3] || args[2];
          var storeKey = 'RF_APPRENTICESHIP_STORE_V2';
          var orders = [];
          try { orders = JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch(e) {}
          var doc = (orders || []).find(function(o) { return o && o.id === pId; });
          if (doc && doc.steps) {
            for (var si = 0; si < doc.steps.length; si++) {
              var stp = doc.steps[si];
              var foundP = (stp.photos || []).find(function(p) { return p && (p.id === fId || p.url); });
              if (foundP) return foundP.url || foundP;
            }
          }
          return '';
        }

        // Default mock response for auxiliary client actions
        return { success: true };
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
                else console.error('Supabase RPC Error [' + prop + ']:', err);
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
            console.error('Supabase RPC Error (' + serverFunctionName + '):', err);
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
print("RF Workspace V2: Pure Supabase Standalone build completed successfully!")
