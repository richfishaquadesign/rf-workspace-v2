/** Layout M reserve policy. Called inside syncDeltas' script lock. */
function rfHandoverId_(order) {
  var key = String(order.id || order.orderCode || '').trim();
  if (!key) throw new Error('Thiếu mã đơn bàn giao');
  return 'IE_HANDOVER_' + Array.from(key).map(function (c) { return c.charCodeAt(0).toString(16).padStart(4, '0'); }).join('');
}

// Both callers hold the script lock. Journal stores absolute before/after values
// so an interrupted stock write can be resumed without applying the delta twice.
function safeDeductInventoryOnHandover(orders, ss) {
  if (!Array.isArray(orders)) orders = [orders];
  orders.filter(Boolean).forEach(function (order) {
    var id = rfHandoverId_(order);
    var props = PropertiesService.getScriptProperties();
    var key = 'RF_PENDING_' + id;
    var movements = rfReadLayoutPolicyTable_(ss, 'ImportExport');
    if (movements.some(function (m) { return String(m.id) === id; })) {
      props.deleteProperty(key);
      return;
    }
    var saved = props.getProperty(key);
    var plan = saved ? JSON.parse(saved) : rfPlanHandoverExport_([order], ss);
    if (!plan) throw new Error('Không thể lập phiếu xuất cho đơn ' + order.id);
    plan.log.id = id;
    if (!saved) props.setProperty(key, JSON.stringify(plan));
    var sheet = ss.getSheetByName('Products');
    var rows = sheet.getDataRange().getValues(), headers = rows[0];
    var idCol = headers.indexOf('id'), qtyCol = headers.indexOf('quantity');
    if (idCol < 0 || qtyCol < 0) throw new Error('Products thiếu id/quantity');
    plan.changes.forEach(function (change) {
      var index = rows.findIndex(function (row, i) { return i > 0 && String(row[idCol]) === change.id; });
      if (index < 0) throw new Error('Không tìm thấy hàng xuất: ' + change.id);
      var current = Number(rows[index][qtyCol]);
      if (current !== change.before && current !== change.after) throw new Error('Tồn đã đổi trong lần xuất dở: ' + change.id + '. Cần đối chiếu phiếu ' + id);
      if (current !== change.after) sheet.getRange(index + 1, qtyCol + 1).setValue(change.after);
    });
    SpreadsheetApp.flush();
    applyDeltasToSheet('ImportExport', [plan.log], function (item) { return item; }, ss);
    SpreadsheetApp.flush();
    props.deleteProperty(key);
  });
}

function rfGhnHandover_(ss, order, newStatus) {
  var target = rfLayoutKey_(newStatus);
  if (['da ban giao', 'doi soat thanh cong'].indexOf(target) < 0) return;
  var previous = rfLayoutKey_(order.status);
  // Older handed-over orders already passed the legacy deduction path.
  // Do not retroactively deduct them again merely because they lack the new ID.
  if (['da ban giao', 'dang giao', 'da giao', 'doi soat thanh cong', 'hoan thanh', 'hang hoan', 'don huy'].indexOf(previous) < 0) {
    safeDeductInventoryOnHandover([order], ss);
  }
}

function rfLayoutKey_(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

function rfLayoutMMinimum_(product) {
  var category = rfLayoutKey_(product.category);
  if (category.indexOf('layout') < 0 && rfLayoutKey_(product.sub_category).indexOf('layout') < 0) return null;
  var name = rfLayoutKey_(product.name);
  var sku = String(product.sku || '').toUpperCase();
  var dimensions = name.match(/(?:^|[^\d])(\d+(?:[.,]\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?(?:$|[^\d])/);
  var isM = dimensions ? Number(dimensions[1]) === 30 && Number(dimensions[2]) === 20 && Number(dimensions[3]) === 20 : /(?:^|[-_])302020$/.test(sku);
  if (!isM) return null;
  return /\bcover\b/.test(name) || /\bcover\b/.test(rfLayoutKey_(product.sub_category)) || /(?:^|[-_])COVER(?:[-_]|$)/.test(sku) ? 0 : 1;
}

function rfLayoutOrderMatches_(ref, order) {
  var value = String(ref || '').trim();
  return !!value && [order.id, order.orderCode, String(order.orderCode || '').split('|')[0].trim()].some(function (x) { return x && String(x).trim() === value; });
}

function rfLayoutStockOrder_(order) {
  return ['san xuat ton', 'san xuat bu kho'].indexOf(rfLayoutKey_(order && order.channel)) >= 0;
}

function rfLayoutCancelled_(status) {
  return /huy|cancel|vo|scrap/.test(rfLayoutKey_(status));
}

function rfLayoutProductMatch_(line, product) {
  if (line.productId) return String(line.productId) === String(product.id);
  if (line.sku) return String(line.sku).trim().toUpperCase() === String(product.sku).trim().toUpperCase();
  return rfLayoutKey_(line.name) === rfLayoutKey_(product.name);
}

/** Pure planner: only replenish affected M layouts after both packing and handover. */
function rfPlanLayoutMReplenishment_(state, candidates, now) {
  var products = state.products || [], orders = state.orders || [], production = state.production || [], packings = state.packings || [];
  var affected = {};
  (candidates || []).forEach(function (candidate) {
    var order = orders.find(function (o) { return rfLayoutOrderMatches_(candidate, o); });
    if (!order || rfLayoutStockOrder_(order) || ['da ban giao', 'da giao', 'doi soat thanh cong', 'hoan thanh'].indexOf(rfLayoutKey_(order.status)) < 0) return;
    var packed = packings.some(function (p) { return rfLayoutOrderMatches_(p.orderId, order) && ['done', 'da dong goi', 'hoan thanh'].indexOf(rfLayoutKey_(p.status)) >= 0; });
    if (!packed) return;
    var lines = [];
    try { lines = typeof order.accessories === 'string' ? JSON.parse(order.accessories || '[]') : order.accessories || []; } catch (e) { lines = []; }
    if (!Array.isArray(lines)) lines = [];
    lines = lines.concat(production.filter(function (p) { return rfLayoutOrderMatches_(p.orderId, order) && !rfLayoutCancelled_(p.status); }));
    products.forEach(function (product) {
      if (rfLayoutMMinimum_(product) !== 1) return;
      if (lines.some(function (line) { return rfLayoutProductMatch_(typeof line === 'string' ? { name: line } : line, product); })) affected[String(product.id)] = order;
    });
  });
  var plannedOrders = [], plannedProduction = [];
  products.forEach(function (product) {
    var source = affected[String(product.id)];
    if (!source) return;
    var open = production.filter(function (p) {
      if (!rfLayoutProductMatch_(p, product) || rfLayoutCancelled_(p.status) || p.fulfilledFromStock === true || String(p.fulfilledFromStock).toUpperCase() === 'TRUE') return false;
      var parent = orders.find(function (o) { return rfLayoutOrderMatches_(p.orderId, o); });
      if (!rfLayoutStockOrder_(parent) || rfLayoutCancelled_(parent.status)) return false;
      // Done without a receipt still covers demand: do not duplicate a failed receipt.
      return !(state.movements || []).some(function (m) { return String(m.id) === 'IE_TP_' + p.id; });
    }).length;
    var onHand = Number(product.quantity);
    if (!Number.isFinite(onHand)) throw new Error('Tồn kho không hợp lệ: ' + product.name);
    var missing = Math.max(0, Math.ceil(1 - onHand - open));
    if (!missing) return;
    var token = Array.from(String(product.id)).map(function (c) { return c.charCodeAt(0).toString(16).padStart(4, '0'); }).join('');
    var prefix = 'KHO_M_' + token + '_';
    var sequence = 1;
    for (var n = 0; n < missing; n++) {
      // Reuse an orphan auto-order if the previous write stopped before Production.
      while (plannedOrders.some(function (o) { return String(o.id) === prefix + sequence; }) || production.some(function (p) { return String(p.id) === 'SX_' + prefix + sequence; }) || orders.some(function (o) { return String(o.id) === prefix + sequence && (!rfLayoutStockOrder_(o) || rfLayoutCancelled_(o.status)); })) sequence++;
      var id = prefix + sequence++;
      var note = 'Bù tồn chuẩn layout M 30x20x20cm sau bàn giao ' + (source.orderCode || source.id) + ' | SKU: ' + product.sku;
      plannedOrders.push({ id: id, orderCode: id, channel: 'Sản Xuất Bù Kho', customer: 'Kho thành phẩm', status: 'Chờ Sản Xuất', createdAt: now, date: now, hasProduction: true, revenue: 0, note: note, accessories: JSON.stringify([{ productId: product.id, sku: product.sku, name: product.name, quantity: 1, hasProduction: true }]) });
      plannedProduction.push({ id: 'SX_' + id, orderId: id, type: 'Layout', name: product.name, status: 'Pending', fulfilledFromStock: false, note: note, phases: { phase1: { name: 'Dựng Khung', status: 'Pending' }, phase2: { name: 'Gia Cố', status: 'Pending' } }, qc_status: 'Pending' });
    }
  });
  return { orders: plannedOrders, production: plannedProduction };
}

// Do not use the UI reader's 10,000-row window or swallowed read errors for stock decisions.
function rfReadLayoutPolicyTable_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Thiếu bảng cho chính sách tồn M: ' + name);
  var rows = sheet.getDataRange().getValues();
  var headers = rows.shift() || [];
  if (headers.indexOf('id') < 0) throw new Error('Thiếu cột id: ' + name);
  return rows.filter(function (row) { return row[headers.indexOf('id')] !== ''; }).map(function (row) {
    var item = {};
    headers.forEach(function (header, i) { item[header] = row[i]; });
    return item;
  });
}

function rfApplyLayoutMPolicy_(ss, payload) {
  if (!(payload.orders || payload.packings || payload.Products || payload.prodItems)) return { orders: [], production: [] };
  var products = rfReadLayoutPolicyTable_(ss, 'Products');
  var minimums = [];
  products.forEach(function (product) {
    var minimum = rfLayoutMMinimum_(product);
    if (minimum !== null && Number(product.minStock) !== minimum) minimums.push({ id: product.id, minStock: minimum });
  });
  if (minimums.length) applyDeltasToSheet('Products', minimums, formatProduct, ss);
  var savedPackings = payload.packings && payload.packings.length ? rfReadLayoutPolicyTable_(ss, 'Packings') : null;
  var candidates = (payload.orders || []).map(function (o) { return o.id || o.orderCode; });
  (payload.packings || []).forEach(function (p) {
    var saved = p.orderId ? p : savedPackings.find(function (row) { return String(row.id) === String(p.id); });
    if (saved && saved.orderId) candidates.push(saved.orderId);
  });
  if (!candidates.length) return { orders: [], production: [] };
  var plan = rfPlanLayoutMReplenishment_({ products: products, orders: rfReadLayoutPolicyTable_(ss, 'Orders'), production: rfReadLayoutPolicyTable_(ss, 'Production'), packings: savedPackings || rfReadLayoutPolicyTable_(ss, 'Packings'), movements: rfReadLayoutPolicyTable_(ss, 'ImportExport') }, candidates, Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss'));
  if (plan.orders.length) applyDeltasToSheet('Orders', plan.orders, formatOrder, ss);
  if (plan.production.length) applyDeltasToSheet('Production', plan.production, formatProd, ss);
  return plan;
}
