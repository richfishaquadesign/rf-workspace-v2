// Dedicated apprenticeship storage. Never writes commercial stock, payroll or orders.
var RF_APP_STEPS_ = ['Chuẩn bị công cụ/nguyên liệu', 'Xử lý nguyên liệu', 'Dựng bố cục', 'Gia cố layout', 'Báo cáo chờ nghiệm thu'];
var RF_APP_CHECKS_ = [
  ['Kiểm tra công cụ, dụng cụ và bảo hộ', 'Lấy đủ nguyên liệu, vật tư theo định mức BOM', 'Kiểm tra chất lượng phôi trước khi làm'],
  ['Làm sạch và xử lý nguyên liệu theo kích thước', 'Kiểm tra chất lượng phôi sau xử lý'],
  ['Đối chiếu bố cục với layout mẫu', 'Đo kích thước và kiểm tra tỷ lệ'],
  ['Gia cố các điểm liên kết', 'Kiểm tra độ vững chắc và cân bằng'],
  ['Báo cáo số đo thực tế so với bản vẽ', 'Báo cáo vật tư đã dùng và phần thu hồi', 'Ảnh kết quả 5 góc và ảnh chi tiết điểm nối', 'Nêu sai lệch so với mẫu và cách xử lý', 'Vệ sinh khu vực thực hành']
];
function apprenticeBomCatalog_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), products = readSheet('Products', null, ss) || [], config = readSheet('BOM_Config', null, ss) || [];
  function key(v) { return String(v || '').trim().toUpperCase(); }
  function material(sku, qty, unit) {
    var p = products.filter(function(x) { return key(x.sku) === key(sku); })[0];
    return { sku: String(sku), name: p ? p.name : String(sku), qty: Number(qty), unit: String(unit || (p && p.unit) || '') };
  }
  var groups = {}, options = [];
  config.forEach(function(b) {
    var code = String(b.layoutCode || '').trim();
    if (!code || !b.materialSku || !(Number(b.defaultQty) > 0)) return;
    if (!groups[code]) groups[code] = [];
    groups[code].push(material(b.materialSku, b.defaultQty, b.unit));
  });
  Object.keys(groups).forEach(function(code) {
    var p = products.filter(function(x) { return [x.id, x.sku, x.name].some(function(v) { return key(v) === key(code); }); })[0];
    options.push({ key: 'config:' + code, code: code, name: p ? p.name : code, source: 'BOM_Config', materials: groups[code] });
  });
  var sh = ss.getSheetByName('BomLayout') || ss.getSheetByName('BOM_Layout') || ss.getSheetByName('Bản để làm appp không sài đến') || ss.getSheetByName('DinhMuc_Mau');
  if (sh) {
    var rows = sh.getDataRange().getValues();
    for (var r = 5; r < rows.length; r++) {
      var code = String(rows[r][0] || '').trim(), name = String(rows[r][1] || '').trim(), items = [];
      if (!code || options.some(function(o) { return key(o.code) === key(code); })) continue;
      for (var c = 2; c < rows[r].length; c++) {
        var qty = Number(rows[r][c]), sku = rows[1] && rows[1][c], unit = rows[4] && rows[4][c];
        if (sku && qty > 0) items.push(material(sku, qty, unit));
      }
      if (items.length) options.push({ key: 'layout:' + code, code: code, name: name || code, source: sh.getName(), materials: items });
    }
  }
  return options.filter(function(o) { return o.materials.every(function(m) { return isFinite(m.qty) && m.qty > 0 && m.unit; }); });
}
function api_apprenticeshipCatalog(pin) {
  var a = apprenticeAuth_(pin);
  if (!a.studio) throw new Error('ADMIN_ONLY');
  return { options: apprenticeBomCatalog_() };
}
function apprenticeLayoutKey_(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').split(/\s+-\s+\d/)[0].replace(/layout|biotop|suoi/g, '').replace(/[^a-z0-9]/g, '');
}
function api_apprenticeshipResolveLayout(pin, layout) {
  var a = apprenticeAuth_(pin);
  if (!a.studio) throw new Error('ADMIN_ONLY');
  var key = apprenticeLayoutKey_(apprenticeText_(layout, 200));
  var options = apprenticeBomCatalog_().filter(function(o) { return apprenticeLayoutKey_(o.name) === key; });
  // Prefer the explicit standard size when several real BOM sizes exist; show it to Admin.
  options.sort(function(x,y) { return (x.source==='BOM_Config'?0:10) - (y.source==='BOM_Config'?0:10) || (/30x20x20/.test(x.name)?0:1) - (/30x20x20/.test(y.name)?0:1); });
  var draft = apprenticeRows_(apprenticeSheet_(false)).filter(function(r) { return r.doc.kind === 'TEMPLATE' && apprenticeLayoutKey_(r.doc.layout) === key; })[0];
  return { options: options, selected: options[0] || null, template: draft ? draft.doc : null, message: options.length ? '' : 'Chưa có định mức BOM cho ' + layout + '. Có thể soạn và lưu hướng dẫn ngay; cần bổ sung BOM trước khi giao bài.' };
}
function api_apprenticeshipTemplateSave(pin, layout, images, revision) {
  var a = apprenticeAuth_(pin);
  if (!a.studio) throw new Error('ADMIN_ONLY');
  layout = apprenticeText_(layout, 200);
  if (!layout) throw new Error('LAYOUT_REQUIRED');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('BUSY_RETRY');
  try {
    var key = apprenticeLayoutKey_(layout), sh = apprenticeSheet_(false);
    var row = apprenticeRows_(sh).filter(function(r) { return r.doc.kind === 'TEMPLATE' && apprenticeLayoutKey_(r.doc.layout) === key; })[0];
    if ((row ? row.doc.revision : 0) !== revision) throw new Error('CONFLICT_RELOAD');
    var d = row ? row.doc : {id:'template:' + key,kind:'TEMPLATE',layout:layout,revision:0,history:[]};
    d.images = apprenticeImages_(images); d.revision++;
    apprenticeAudit_(d,a,'SAVE_TEMPLATE');
    var json = JSON.stringify(d);
    if (json.length > 45000) throw new Error('ORDER_SIZE_LIMIT');
    sh = sh || apprenticeSheet_(true);
    if (row) sh.getRange(row.row,1,1,2).setValues([[d.id,json]]); else sh.appendRow([d.id,json]);
    SpreadsheetApp.flush(); return {template:d};
  } finally { lock.releaseLock(); }
}
function apprenticeAuth_(pin) {
  var a = validatePin(pin);
  if (!a || !a.valid) throw new Error('AUTH_REQUIRED');
  // Existing isAdmin includes workers/CTV; do not use it for this module.
  a.studio = a.role === 'TỐI CAO' || a.role === 'ADMIN';
  return a;
}
function apprenticeSheet_(create) {
  // Dedicated private workbook avoids legacy generic readSheet/applyDeltas entry points.
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('RF_APPRENTICESHIP_SPREADSHEET_ID');
  if (!id && !create) return null;
  var ss;
  if (!id) {
    ss = SpreadsheetApp.create('RF Apprenticeship OS V1 - Private');
    props.setProperty('RF_APPRENTICESHIP_SPREADSHEET_ID', ss.getId());
  } else ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName('Apprenticeship_V1');
  if (!sh && create) { sh = ss.insertSheet('Apprenticeship_V1'); sh.appendRow(['id', 'document']); sh.setFrozenRows(1); }
  return sh;
}
function apprenticeRows_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().map(function(r, i) {
    return { row: i + 2, doc: JSON.parse(r[1]) };
  });
}
function apprenticeText_(v, max) {
  if (typeof v !== 'string' || v.length > (max || 2000)) throw new Error('INVALID_TEXT');
  return v.trim();
}
function apprenticeImages_(images) {
  if (!Array.isArray(images) || images.length > 5) throw new Error('MAX_5_IMAGES');
  return images.map(function(im, i) {
    var url = apprenticeText_(im.url, 1500);
    if (!/^https:\/\//.test(url)) throw new Error('HTTPS_IMAGE_REQUIRED');
    var marks = im.annotations || [];
    if (!Array.isArray(marks) || JSON.stringify(marks).length > 15000) throw new Error('INVALID_ANNOTATIONS');
    return { id: 'view_' + i, url: url, label: apprenticeText_(im.label || ('Góc ' + (i + 1)), 100), annotations: marks };
  });
}
function apprenticeAudit_(doc, auth, action, note) {
  doc.history.push({ at: new Date().toISOString(), actor: auth.user, action: action, step: doc.step, note: note || '' });
}
function api_apprenticeshipList(pin) {
  var a = apprenticeAuth_(pin);
  return { studio: a.studio, user: a.user, orders: apprenticeRows_(apprenticeSheet_(false)).map(function(r) { return r.doc; }).filter(function(d) { return d.kind !== 'TEMPLATE' && (a.studio || d.assignee === a.user); }) };
}
function api_apprenticeshipMutate(pin, request) {
  var a = apprenticeAuth_(pin), lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('BUSY_RETRY');
  try {
    var q = request || {}, action = q.action, data = Object.assign({}, q.data || {});
    var sh = apprenticeSheet_(false), rows = apprenticeRows_(sh), found, doc;
    if (action === 'create') {
      if (!a.studio) throw new Error('ADMIN_ONLY');
      var cfg = getAuthoritativeAuthConfig_(), assignee = apprenticeText_(data.assignee, 150);
      var validAssignee = Object.keys(cfg.pins || {}).some(function(k) { var u = cfg.pins[k]; return u.name === assignee && validatePin(k).valid; });
      if (!validAssignee) throw new Error('INVALID_ASSIGNEE');
      var choice = apprenticeBomCatalog_().filter(function(o) { return o.key === data.productKey; })[0];
      if (!choice) throw new Error('CHOOSE_PRODUCT_WITH_VALID_BOM');
      // Server reads BOM again at assignment time; client cannot invent quantities.
      data.layout = apprenticeText_(data.layout || choice.name, 200);
      data.title = 'Thực hành ' + data.layout;
      data.norms = choice.materials.map(function(m) { return m.name + ' · ' + m.sku + ': ' + m.qty + ' ' + m.unit; }).join('\n');
      // Nội dung 5 công đoạn do admin soạn khi giao bài; server chỉ chấp nhận khi hợp lệ.
      data.checklists = Array.isArray(data.checklists) && data.checklists.length ? data.checklists : RF_APP_CHECKS_;
      var title = apprenticeText_(data.title, 200);
      if (!title || !assignee) throw new Error('TITLE_AND_ASSIGNEE_REQUIRED');
      if (!Array.isArray(data.checklists) || data.checklists.length !== 5) throw new Error('FIVE_CHECKLISTS_REQUIRED');
      var steps = data.checklists.map(function(list) {
        if (!Array.isArray(list) || !list.length || list.length > 20) throw new Error('CHECKLIST_REQUIRED');
        return { checklist: list.map(function(t) { var s = apprenticeText_(t, 300); if (!s) throw new Error('EMPTY_CHECKLIST'); return s; }), checked: [], measurements: '', materials: '', report: '', photos: [], completed: false };
      });
      doc = { id: Utilities.getUuid(), title: title, assignee: assignee, layout: apprenticeText_(data.layout || '', 200), norms: apprenticeText_(data.norms || '', 3000), images: apprenticeImages_(data.images || []), steps: steps, step: 0, status: 'IN_PROGRESS', revision: 0, history: [], incidents: [] };
      doc.bom = { key: choice.key, code: choice.code, source: choice.source, materials: choice.materials, capturedAt: new Date().toISOString() };
      apprenticeAudit_(doc, a, 'CREATE', 'Giao bài');
    } else {
      found = rows.filter(function(r) { return r.doc.id === q.id; })[0];
      if (!found || found.doc.kind === 'TEMPLATE' || (!a.studio && found.doc.assignee !== a.user)) throw new Error('NOT_FOUND_OR_FORBIDDEN');
      doc = found.doc;
      if (q.revision !== doc.revision) throw new Error('CONFLICT_RELOAD');
      if (action === 'save' || action === 'advance') {
        if (a.user !== doc.assignee) throw new Error('ASSIGNEE_ONLY');
        if (doc.status !== 'IN_PROGRESS' || data.step !== doc.step) throw new Error('STEP_LOCKED');
        var s = doc.steps[doc.step];
        if (!Array.isArray(data.checked) || data.checked.length !== s.checklist.length || data.checked.some(function(x) { return typeof x !== 'boolean'; })) throw new Error('INVALID_CHECKLIST');
        s.checked = data.checked;
        s.measurements = apprenticeText_(data.measurements || '', 2000);
        s.materials = apprenticeText_(data.materials || '', 2000);
        s.report = apprenticeText_(data.report || '', 3000);
        // Evidence can only reference photos uploaded through this order's authenticated endpoint.
        if (action === 'advance') {
          if (s.checked.some(function(x) { return !x; }) || !s.measurements || !s.materials || !s.report || !s.photos.length) throw new Error('CHECKLIST_MEASUREMENTS_MATERIALS_REPORT_PHOTO_REQUIRED');
          s.completed = true;
          apprenticeAudit_(doc, a, 'COMPLETE_STEP', s.report);
          if (doc.step === 4) doc.status = 'AWAITING_REVIEW'; else doc.step++;
        } else apprenticeAudit_(doc, a, 'SAVE_PROGRESS');
      } else if (action === 'incident') {
        if (doc.status === 'ACCEPTED') throw new Error('ORDER_CLOSED');
        var incident = apprenticeText_(data.note, 2000);
        if (!incident) throw new Error('INCIDENT_REQUIRED');
        doc.incidents.push({ at: new Date().toISOString(), actor: a.user, step: doc.step, note: incident });
        apprenticeAudit_(doc, a, 'INCIDENT', incident);
      } else if (action === 'review') {
        if (!a.studio) throw new Error('ADMIN_ONLY');
        if (doc.status !== 'AWAITING_REVIEW') throw new Error('FINAL_REVIEW_ONLY');
        var note = apprenticeText_(data.note, 2000);
        if (!note) throw new Error('REVIEW_NOTE_REQUIRED');
        if (data.accept === true) { doc.status = 'ACCEPTED'; apprenticeAudit_(doc, a, 'ACCEPT', note); }
        else {
          if (!Number.isInteger(data.returnStep) || data.returnStep < 0 || data.returnStep > 4) throw new Error('INVALID_RETURN_STEP');
          doc.step = data.returnStep; doc.status = 'IN_PROGRESS';
          doc.steps.forEach(function(s, i) { if (i >= doc.step) { s.completed = false; s.checked = s.checklist.map(function() { return false; }); } });
          apprenticeAudit_(doc, a, 'RETURN', note);
        }
      } else if (action === 'annotations') {
        if (!a.studio || doc.status === 'ACCEPTED') throw new Error('ADMIN_ONLY');
        var updates = data.updates || [{ imageId: data.imageId, annotations: data.annotations }];
        if (!Array.isArray(updates) || updates.length > 5 || JSON.stringify(updates).length > 20000) throw new Error('INVALID_ANNOTATIONS');
        updates.forEach(function(update) {
          var im = doc.images.filter(function(x) { return x.id === update.imageId; })[0];
          if (!im || !Array.isArray(update.annotations) || JSON.stringify(update.annotations).length > 15000) throw new Error('INVALID_ANNOTATIONS');
          im.annotations = update.annotations;
        });
        apprenticeAudit_(doc, a, 'ANNOTATIONS');
      } else if (action === 'setup') {
        if (!a.studio || doc.status !== 'IN_PROGRESS' || doc.steps.some(function(s) { return s.completed; })) throw new Error('SETUP_LOCKED');
        doc.layout = apprenticeText_(data.layout || '', 200);
        doc.norms = apprenticeText_(data.norms || '', 3000);
        doc.images = apprenticeImages_(data.images || []);
        apprenticeAudit_(doc, a, 'SETUP');
      } else throw new Error('UNKNOWN_ACTION');
    }
    doc.revision++;
    var json = JSON.stringify(doc);
    if (json.length > 45000) throw new Error('ORDER_SIZE_LIMIT');
    sh = sh || apprenticeSheet_(true);
    if (found) sh.getRange(found.row, 1, 1, 2).setValues([[doc.id, json]]);
    else sh.appendRow([doc.id, json]);
    SpreadsheetApp.flush();
    return { order: doc };
  } finally { lock.releaseLock(); }
}
function api_apprenticeshipPhoto(pin, id, revision, imageData) {
  var a = apprenticeAuth_(pin), lock = LockService.getScriptLock(), file;
  if (!lock.tryLock(10000)) throw new Error('BUSY_RETRY');
  try {
    var sh = apprenticeSheet_(false), row = apprenticeRows_(sh).filter(function(r) { return r.doc.id === id && r.doc.assignee === a.user; })[0];
    if (!row) throw new Error('NOT_FOUND_OR_FORBIDDEN');
    var d = row.doc;
    if (d.revision !== revision) throw new Error('CONFLICT_RELOAD');
    if (d.status !== 'IN_PROGRESS' || d.steps[d.step].photos.length >= 5) throw new Error('PHOTO_LOCKED_OR_LIMIT');
    if (typeof imageData !== 'string' || imageData.length > 1000000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(imageData)) throw new Error('JPEG_MAX_750KB');
    var bytes = Utilities.base64Decode(imageData.split(',')[1]);
    if ((bytes[0] & 255) !== 255 || (bytes[1] & 255) !== 216) throw new Error('INVALID_JPEG');
    var props = PropertiesService.getScriptProperties(), folderId = props.getProperty('RF_APPRENTICESHIP_PHOTO_FOLDER');
    if (!folderId) { folderId = DriveApp.createFolder('RF Apprenticeship Evidence V1 - Private').getId(); props.setProperty('RF_APPRENTICESHIP_PHOTO_FOLDER', folderId); }
    file = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, 'image/jpeg', id + '-step' + (d.step + 1) + '-' + Utilities.getUuid() + '.jpg'));
    // Keep Drive access private; the authenticated photo-read API serves the evidence.
    d.steps[d.step].photos.push({ id: file.getId(), at: new Date().toISOString() });
    apprenticeAudit_(d, a, 'PHOTO'); d.revision++;
    var json = JSON.stringify(d);
    if (json.length > 45000) throw new Error('ORDER_SIZE_LIMIT');
    sh.getRange(row.row, 1, 1, 2).setValues([[d.id, json]]); SpreadsheetApp.flush();
    return { order: d };
  } catch (e) { if (file) file.setTrashed(true); throw e; }
  finally { lock.releaseLock(); }
}
function api_apprenticeshipPhotoRead(pin, id, fileId) {
  var a = apprenticeAuth_(pin), row = apprenticeRows_(apprenticeSheet_(false)).filter(function(r) { return r.doc.id === id && (a.studio || r.doc.assignee === a.user); })[0];
  if (!row || row.doc.kind === 'TEMPLATE' || !row.doc.steps.some(function(s) { return s.photos.some(function(p) { return p.id === fileId; }); })) throw new Error('NOT_FOUND_OR_FORBIDDEN');
  var blob = DriveApp.getFileById(fileId).getBlob();
  return 'data:image/jpeg;base64,' + Utilities.base64Encode(blob.getBytes());
}
