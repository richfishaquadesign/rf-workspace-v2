/* Return commands: server-owned inventory, independent claim/warehouse/settlement. */
function rfReturnJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (e) { throw new Error('Dữ liệu hoàn hàng không hợp lệ; cần kiểm tra trước khi xử lý.'); }
}
function rfReturnTrue(value) { return value === true || String(value).toUpperCase() === 'TRUE'; }
function rfReturnCode(order) { return String(order.orderCode || order.id).split('|')[0].trim(); }
function rfReturnAccs(order) {
  var raw = order.accessories || [];
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); if (typeof raw === 'string') raw = JSON.parse(raw); }
    catch (e) { if (/^[\[{]/.test(raw)) throw new Error('Danh sách hàng bị lỗi định dạng.'); raw = raw.split(',').map(function(s) { return s.trim(); }).filter(Boolean); }
  }
  if (!Array.isArray(raw)) throw new Error('Danh sách hàng không hợp lệ.');
  return raw.map(function(a) {
    if (typeof a === 'string') return { name: a, quantity: 1 };
    return Object.assign({}, a, { name: a.name || a.Name || a.productName, quantity: Number(a.quantity !== undefined ? a.quantity : a.Quantity !== undefined ? a.Quantity : a.qty !== undefined ? a.qty : 1) });
  });
}
function rfReturnMatches(ticket, order) {
  var refs = [String(order.id), rfReturnCode(order)];
  if (ticket.orderId) return refs.indexOf(String(ticket.orderId)) >= 0;
  if (/Hàng Loạt/i.test(String(ticket.target)) || /\.\.\./.test(String(ticket.note))) return false;
  // Legacy tickets have no foreign key. Match complete tokens, never substrings.
  var tokens = String(ticket.note || '').concat(' ', ticket.target || '').split(/[\s|,;:#()]+/);
  return refs.some(function(ref) { return tokens.indexOf(ref) >= 0; });
}
function rfReturnLines(order, productions) {
  var accs = rfReturnAccs(order), refs = [String(order.id), String(order.orderCode || ''), rfReturnCode(order)];
  var related = productions.filter(function(p) { return refs.indexOf(String(p.orderId)) >= 0 && String(p.id).indexOf('RET_REPAIR_') !== 0; });
  var represented = {};
  related.forEach(function(p) { var k = String(p.name).trim(); represented[k] = (represented[k] || 0) + Number(p.quantity || 1); });
  var lines = accs.map(function(a, i) {
    if (!a || !a.name) throw new Error('Phụ kiện thiếu tên; cần chuẩn hóa trước khi hoàn.');
    if (!Number.isFinite(a.quantity) || a.quantity <= 0) throw new Error('Số lượng hàng không hợp lệ.');
    var k = String(a.name).trim(), covered = Math.min(a.quantity, represented[k] || 0);
    represented[k] = (represented[k] || 0) - covered;
    return { key: 'acc:' + i, name: a.name, quantity: a.quantity - covered, legacy: !!a._retStatus || ['Hoàn Kho Đạt', 'Hủy/Vỡ'].indexOf(a.status) >= 0 };
  }).filter(function(l) { return l.quantity > 0; });
  related.forEach(function(p) {
    // Hoàn Kho Đạt may mean fulfilled from stock, not a return: do not silently adopt it.
    lines.push({ key: 'prod:' + p.id, name: p.name, quantity: Number(p.quantity || 1), production: p,
      legacy: p.status === 'Hủy/Vỡ' || p.status === 'Đã tạo lệnh sửa' });
  });
  lines.forEach(function(l) { if (!Number.isFinite(l.quantity) || l.quantity <= 0) throw new Error('Số lượng hàng không hợp lệ.'); });
  return lines;
}
function rfReturnPlan(order, productions, products, tickets, command, actor, now) {
  var workflow = rfReturnJson(order.returnWorkflow, null);
  if (!workflow) {
    if (!/HOÀN|KIỂM HÀNG HOÀN/.test(String(order.status).toUpperCase()) || /HOÀN THÀNH/.test(String(order.status).toUpperCase())) throw new Error('Đơn không còn ở hàng hoàn.');
    workflow = { version: 0, claim: 'UNREVIEWED', warehouse: 'PENDING', settlement: 'PENDING', receivedAt: '', items: {}, history: [], operations: [] };
  }
  if (workflow.operations.indexOf(command.operationId) >= 0) return { duplicate: true, order: order };
  if (workflow.closedAt) throw new Error('Hồ sơ hoàn đã đóng.');
  if (Number(command.version || 0) !== workflow.version) throw new Error('Hồ sơ vừa được người khác cập nhật. Hãy tải lại trước khi thao tác.');
  var lines = rfReturnLines(order, productions);
  var result = { order: Object.assign({}, order), Products: [], prodItems: [], ImportExport: [] };
  var action = command.action, finance = actor.isBoss || ['TỐI CAO', 'KẾ TOÁN', 'QUẢN LÝ KIỂM TOÁN', 'KIỂM TOÁN'].indexOf(actor.role) >= 0;
  var warehouse = actor.isBoss || ['TỐI CAO', 'QUẢN LÝ KHO VẬN', 'KHO VẬN'].indexOf(actor.role) >= 0;
  var sales = finance || warehouse || ['BÁN HÀNG', 'QUẢN LÝ BÁN HÀNG'].indexOf(actor.role) >= 0;
  var legacyTickets = tickets.filter(function(t) { return rfReturnMatches(t, order) && !/^IE_RETURN_/.test(String(t.id)) && (/hoàn|hủy|huỷ/i.test(String(t.note || '') + ' ' + String(t.target || '')) || t.type === 'Xuất Huỷ'); });
  var hasLegacy = lines.some(function(l) { return l.legacy && !workflow.items[l.key]; }) || legacyTickets.length > 0;
  if (!sales) throw new Error('Bạn không có quyền xử lý hồ sơ hoàn.');
  if (action === 'ATTACH_IMAGE' || action === 'ATTACH_FILE' || action === 'ADD_PACKING_EVIDENCE') {
    if (!command._attachment || !command._attachment.name) throw new Error('Chưa có ảnh tải lên hợp lệ.');
    workflow.attachments = workflow.attachments || [];
    var attachmentGroup = rfReturnClaimGroup_(command._attachment);
    if (workflow.attachments.filter(function(f) { return rfReturnClaimGroup_(f) === attachmentGroup; }).length >= 5) throw new Error('Mỗi nhóm bằng chứng tối đa 5 file.');
    if (workflow.attachments.some(function(f) { return f.fileId && f.fileId === command._attachment.fileId; })) throw new Error('File này đã có trong hồ sơ.');
    workflow.attachments.push(command._attachment);
  } else if (action === 'EXCLUDE_ATTACHMENT' || action === 'RESTORE_ATTACHMENT') {
    workflow.attachments = workflow.attachments || [];
    workflow.excludedAttachments = workflow.excludedAttachments || [];
    var sourceList = action === 'EXCLUDE_ATTACHMENT' ? workflow.attachments : workflow.excludedAttachments;
    var targetList = action === 'EXCLUDE_ATTACHMENT' ? workflow.excludedAttachments : workflow.attachments;
    var fileIndex = sourceList.findIndex(function(f) { return f.id === command.attachmentId; });
    if (fileIndex < 0) throw new Error('Không tìm thấy file.');
    var changingFile = sourceList[fileIndex];
    if (action === 'RESTORE_ATTACHMENT' && workflow.attachments.filter(function(f) { return rfReturnClaimGroup_(f) === rfReturnClaimGroup_(changingFile); }).length >= 5) throw new Error('Nhóm đã đủ 5 file.');
    targetList.push(changingFile); sourceList.splice(fileIndex,1);
  } else if (action === 'MOVE_ATTACHMENT') {
    if (['PACKING','UNBOXING','OTHER'].indexOf(command.group) < 0) throw new Error('Nhóm bằng chứng không hợp lệ.');
    var moving = (workflow.attachments || []).find(function(f) { return f.id === command.attachmentId; });
    if (!moving) throw new Error('Không tìm thấy file.');
    if (rfReturnClaimGroup_(moving) !== command.group && workflow.attachments.filter(function(f) { return rfReturnClaimGroup_(f) === command.group; }).length >= 5) throw new Error('Nhóm đích đã đủ 5 file.');
    moving.group = command.group;
  } else if (action === 'SAVE_CLAIM_DRAFT') {
    var draft = command.draft || {};
    if (draft.issue && !RF_SHOPEE_CLAIM_TYPES[draft.issue]) throw new Error('Vấn đề hỗ trợ không hợp lệ.');
    workflow.claimDraft = { issue: String(draft.issue || ''), shippingCode: String(draft.shippingCode || '').slice(0,100), facts: String(draft.facts || '').slice(0,4000), request: String(draft.request || '').slice(0,2000), amount: draft.amount === undefined ? '' : String(draft.amount).slice(0,20), deadline: String(draft.deadline || '').slice(0,16), checks: {} };
    ['packingWaybill','packingCondition','packingQuantity','unboxingWaybill','unboxingCondition','unboxingQuantity','trackingVerified','deliveryVerified'].forEach(function(k) { workflow.claimDraft.checks[k] = !!(draft.checks && draft.checks[k] === true); });
  } else if (action === 'SUBMIT_CLAIM') {
    var claimCheck = rfReturnClaimCheck_(order, workflow, workflow.claimDraft || {}, new Date(String(now).replace(' ','T') + '+07:00').getTime());
    if (!claimCheck.ready) throw new Error('Hồ sơ chưa đủ: ' + claimCheck.errors.join(' '));
    if (!String(command.evidence || '').trim()) throw new Error('Nhập mã yêu cầu Shopee sau khi đã gửi trên sàn.');
    workflow.claim = 'PENDING';
    workflow.claimEvidence = String(command.evidence).trim();
    workflow.submittedAt = now;
    workflow.submittedText = rfReturnClaimText_(order, workflow, workflow.claimDraft);
    workflow.submittedFileIds = (workflow.attachments || []).map(function(f) { return f.id; });
    workflow.settlement = 'PENDING';
  } else if (action === 'RECEIVE') {
    if (!warehouse) throw new Error('Chỉ kho vận được xác nhận đã nhận kiện.');
    if (workflow.warehouse === 'NOT_APPLICABLE') throw new Error('Đã ghi nhận không trả hàng; cần kiểm tra lại hồ sơ.');
    var hasReceiptImage = (workflow.attachments || []).some(function(a) { return rfReturnClaimGroup_(a) === 'UNBOXING'; });
    if (!hasReceiptImage && !String(command.evidence || '').trim()) throw new Error('Cần tải ảnh nhận hoàn hoặc nhập mã biên nhận.');
    workflow.receivedAt = workflow.receivedAt || now;
    workflow.receiptEvidence = String(command.evidence || '').trim() || 'Ảnh nhận hoàn đã đính kèm';
  } else if (action === 'CLAIM') {
    if (['PENDING', 'WON', 'LOST', 'NOT_REQUIRED'].indexOf(command.value) < 0) throw new Error('Kết quả khiếu nại không hợp lệ.');
    if (['WON', 'LOST'].indexOf(command.value) >= 0 && !String(command.evidence || '').trim()) throw new Error('Cần mã vụ việc hoặc bằng chứng kết quả từ sàn.');
    workflow.claim = command.value;
    workflow.claimEvidence = String(command.evidence || '').trim();
    // A changed claim invalidates earlier financial confirmation.
    workflow.settlement = 'PENDING';
  } else if (action === 'NO_RETURN') {
    if (workflow.receivedAt || Object.keys(workflow.items).length || hasLegacy) throw new Error('Đã có nhận/xử lý hàng; không thể chuyển sang không trả hàng.');
    if (!String(command.evidence || '').trim()) throw new Error('Cần bằng chứng sàn xác nhận hoàn tiền không trả hàng.');
    workflow.warehouse = 'NOT_APPLICABLE';
    workflow.noReturnEvidence = String(command.evidence).trim();
    workflow.settlement = 'PENDING';
  } else if (action === 'VERIFY_SOURCE') {
    if (!finance) throw new Error('Cần kế toán/kiểm toán hoặc Tối Cao đối chiếu xuất gốc.');
    var sourceLine = lines.find(function(l) { return l.key === command.lineKey; });
    if (!sourceLine || workflow.items[sourceLine.key]) throw new Error('Dòng hàng đã xử lý hoặc không tồn tại.');
    if (!String(command.evidence || '').trim()) throw new Error('Cần mã chứng từ giao hàng/phiếu xuất gốc đã kiểm tra.');
    workflow.verifiedSources = workflow.verifiedSources || {};
    workflow.verifiedSources[sourceLine.key] = { quantity: sourceLine.quantity, reference: String(command.evidence).trim(), by: actor.user, at: now };
  } else if (action === 'ADOPT_ITEM') {
    if (!finance) throw new Error('Cần kế toán/kiểm toán hoặc Tối Cao xác nhận nghiệp vụ kho cũ.');
    var adoptedLine = lines.find(function(l) { return l.key === command.lineKey; });
    if (!adoptedLine || workflow.items[adoptedLine.key]) throw new Error('Dòng hàng đã xử lý hoặc không tồn tại.');
    if (!workflow.receivedAt) throw new Error('Cần xác nhận nhận kiện thực tế trước.');
    var adoptedQtys = [Number(command.good), Number(command.scrap), Number(command.missing)];
    if (!adoptedQtys.every(function(q) { return Number.isFinite(q) && q >= 0; }) || Math.abs(adoptedQtys.reduce(function(a,b) { return a+b; },0) - adoptedLine.quantity) > 0.000001 || !String(command.evidence || '').trim()) throw new Error('Cần số lượng đã xử lý và mã chứng từ đối chiếu kho cũ.');
    workflow.items[adoptedLine.key] = { action: 'DONE', good: adoptedQtys[0], scrap: adoptedQtys[1], missing: adoptedQtys[2], legacyReference: String(command.evidence).trim(), by: actor.user, at: now };
    workflow.legacyReviewed = true;
    workflow.warehouse = lines.length && lines.every(function(l) { return workflow.items[l.key] && workflow.items[l.key].action === 'DONE'; }) ? 'DONE' : 'PENDING';
    workflow.settlement = 'PENDING';
    // Adoption acknowledges existing postings only; it never moves stock or rewrites production.
  } else if (action === 'ITEM') {
    if (!warehouse) throw new Error('Chỉ kho vận được duyệt hàng thực nhận.');
    if (!workflow.receivedAt || workflow.warehouse === 'NOT_APPLICABLE') throw new Error('Cần xác nhận nhận kiện thực tế trước.');
    if (hasLegacy && !workflow.legacyReviewed) throw new Error('Đơn có xử lý kho cũ. Cần đối chiếu phiếu cũ trước; hệ thống chặn cộng/hủy trùng.');
    var line = lines.find(function(l) { return l.key === command.lineKey; });
    if (!line) throw new Error('Không tìm thấy dòng hàng.');
    if (line.legacy && !workflow.items[line.key]) throw new Error('Dòng hàng có xử lý kho cũ; cần xác nhận nghiệp vụ cũ, không cộng/hủy lại.');
    var prior = workflow.items[line.key];
    if (prior && prior.action !== 'REPAIR') throw new Error('Dòng hàng đã được xử lý.');
    var good = Number(command.good), scrap = Number(command.scrap), missing = Number(command.missing);
    if (![good, scrap, missing].every(function(n) { return Number.isFinite(n) && n >= 0; }) || Math.abs(good + scrap + missing - line.quantity) > 0.000001) throw new Error('Tổng số đạt + hỏng + thiếu phải đúng số lượng của dòng hàng.');
    if (!String(command.reason || '').trim()) throw new Error('Cần ghi nhận lý do kiểm hàng.');
    var repair = command.disposition === 'REPAIR';
    if (repair && (!line.production || good !== 0 || missing !== 0 || scrap !== line.quantity || prior)) throw new Error('Sửa chữa chỉ áp dụng nguyên dòng hàng sản xuất chưa xử lý.');
    if (prior) {
      var repairProd = productions.find(function(p) { return String(p.id) === prior.repairId; });
      if (!repairProd || !/^(DONE|ĐÃ XONG|ĐẠT|HOÀN KHO ĐẠT)$/i.test(String(repairProd.status))) throw new Error('Lệnh sửa chữa chưa hoàn tất KCS.');
      if (repairProd.qc_status && !/^(ĐÃ DUYỆT|ĐẠT|APPROVED)$/i.test(String(repairProd.qc_status))) throw new Error('Lệnh sửa chưa được duyệt KCS.');
      result.prodItems.push({ id: repairProd.id, status: 'Đã thu hồi sau sửa' });
    }
    var product = products.filter(function(p) { return String(p.name).trim() === String(line.name).trim(); });
    if (good > 0) {
      if (product.length !== 1) throw new Error('Không xác định duy nhất mã kho của ' + line.name + '.');
      var exported = 0, returned = 0;
      tickets.filter(function(t) { return rfReturnMatches(t, order); }).forEach(function(t) {
        var entries = rfReturnJson(t.itemsData, []);
        if (!Array.isArray(entries)) throw new Error('Phiếu kho không hợp lệ.');
        entries.forEach(function(i) {
          if (String(i.name).trim() !== String(line.name).trim()) return;
          var qty = Number(i.qty !== undefined ? i.qty : i.quantity);
          if (!Number.isFinite(qty) || qty < 0) throw new Error('Số lượng phiếu kho không hợp lệ.');
          if (t.type === 'Xuất' && !/hủy|huỷ/i.test(String(t.target))) exported += qty;
          if (t.type === 'Nhập') returned += qty;
        });
      });
      var verified = workflow.verifiedSources && workflow.verifiedSources[line.key];
      var capacity = Math.max(exported - returned, verified ? Number(verified.quantity) : 0);
      if (good > capacity + 0.000001) throw new Error('Không đủ số lượng phiếu xuất gốc chưa hoàn. Cần kế toán đối chiếu chứng từ xuất/giao gốc của dòng hàng.');
      if (!Number.isFinite(Number(product[0].quantity))) throw new Error('Tồn kho không hợp lệ.');
      result.Products.push({ id: product[0].id, quantity: Number(product[0].quantity) + good });
    }
    var itemResult = { action: repair ? 'REPAIR' : 'DONE', good: good, scrap: repair ? 0 : scrap, missing: missing, reason: String(command.reason).trim(), by: actor.user, at: now };
    if (repair) {
      var repairId = 'RET_REPAIR_' + order.id + '_' + workflow.version;
      itemResult.repairId = repairId;
      var repairRow = Object.assign({}, line.production, { id: repairId, status: 'Pending', fulfilledFromStock: false, qc_status: '', note: 'Sửa hàng hoàn ' + rfReturnCode(order) + ': ' + itemResult.reason,
        phases: { phase1: { status: 'Pending', user: '', reward_vnd: 0 }, phase2: { status: 'Pending', user: '', reward_vnd: 0 } }, p1_status: 'Pending', p2_status: 'Pending', p1_user: '', p2_user: '' });
      ['p1_start', 'p1_endTime', 'p1_photo', 'p2_start', 'p2_endTime', 'p2_photo', 'qc_front_photo', 'qc_side_photo', 'qc_note', 'serialCode', 'usedByOrderCode', 'usedAt'].forEach(function(k) { repairRow[k] = ''; });
      repairRow.p1_reward_vnd = 0; repairRow.p2_reward_vnd = 0;
      result.prodItems.push(repairRow);
    }
    workflow.items[line.key] = itemResult;
    if (line.production) result.prodItems.push({ id: line.production.id, status: repair ? 'Đã tạo lệnh sửa' : good > 0 ? 'Hoàn Kho Đạt' : scrap > 0 ? 'Hủy/Vỡ' : 'Hoàn thiếu hàng', usedByOrderCode: '', usedAt: '' });
    else {
      var accs = rfReturnAccs(order);
      accs[Number(line.key.split(':')[1])]._retStatus = 'DONE';
      result.order.accessories = JSON.stringify(accs);
    }
    [{ qty: good, type: 'Nhập', tag: 'OK' }, { qty: repair ? 0 : scrap, type: 'Xuất Huỷ', tag: 'SCRAP' }].forEach(function(t) {
      if (!t.qty) return;
      var cost = product.length === 1 ? Number(product[0].costPrice || 0) : 0;
      result.ImportExport.push({ id: 'IE_RETURN_' + command.operationId + '_' + t.tag, type: t.type, target: t.tag === 'OK' ? 'Kho Tổng' : 'Hủy hàng hoàn', date: now,
        totalAmount: t.qty * cost, note: 'Hàng hoàn - Đơn ' + rfReturnCode(order) + ' - ' + line.key,
        itemsData: JSON.stringify([{ name: line.name, qty: t.qty, price: cost }]) });
    });
    workflow.warehouse = lines.length && lines.every(function(l) { return workflow.items[l.key] && workflow.items[l.key].action === 'DONE'; }) ? 'DONE' : 'PENDING';
    workflow.settlement = 'PENDING';
  } else if (action === 'SETTLE') {
    if (!finance) throw new Error('Chỉ kế toán/kiểm toán hoặc Tối Cao được xác nhận đối soát.');
    if (!['DONE', 'NOT_APPLICABLE'].includes(workflow.warehouse) || !['WON', 'LOST', 'NOT_REQUIRED'].includes(workflow.claim)) throw new Error('Cần hoàn tất kho và kết quả khiếu nại trước khi xác nhận quyết toán.');
    if (command.amount === '' || command.amount === null || !Number.isFinite(Number(command.amount)) || Number(command.amount) < 0 || !String(command.evidence || '').trim()) throw new Error('Cần số tiền thực nhận (có thể bằng 0) và mã kỳ/phiếu quyết toán.');
    workflow.settlement = 'CONFIRMED';
    workflow.settlementAmount = Number(command.amount);
    workflow.settlementReference = String(command.evidence).trim();
    workflow.settledBy = actor.user;
    workflow.settledAt = now;
  } else if (action === 'DELIVERED') {
    if (workflow.receivedAt || Object.keys(workflow.items).length || hasLegacy) throw new Error('Đơn đã xử lý/nhận hàng hoàn. Cần đối chiếu và đảo nghiệp vụ kho trước khi xác nhận khách đã nhận.');
    if (!String(command.evidence || '').trim()) throw new Error('Cần bằng chứng khách đã nhận hàng.');
    workflow.closedAt = now;
    workflow.resolution = 'DELIVERED';
    result.order.status = rfReturnTrue(order.isReconciled) ? 'Đối Soát Thành Công' : 'Đã Bàn Giao';
    result.order.returnReason = '';
  } else if (action === 'CLOSE') {
    if (!['DONE', 'NOT_APPLICABLE'].includes(workflow.warehouse) || !['WON', 'LOST', 'NOT_REQUIRED'].includes(workflow.claim) || workflow.settlement !== 'CONFIRMED') throw new Error('Chưa đủ điều kiện: kho, khiếu nại và quyết toán phải hoàn tất.');
    workflow.closedAt = now;
    result.order.status = 'Đối Soát Thành Công';
    result.order.isReconciled = true;
    result.order.reconciledAt = workflow.settledAt;
  } else throw new Error('Thao tác hoàn hàng không hợp lệ.');
  if (!workflow.closedAt) {
    result.order.status = 'Hàng Hoàn';
    result.order.isReconciled = false;
  }
  workflow.version++;
  workflow.operations.push(command.operationId);
  workflow.history.push({ action: action, lineKey: command.lineKey || '', value: command.value || '', evidence: String(command.evidence || ''), by: actor.user, at: now });
  result.order.returnWorkflow = JSON.stringify(workflow);
  result.order.updatedBy = actor.user;
  return result;
}

function rfReturnValidateImage_(image) {
  if (!image || !/^image\/(jpeg|png|webp)$/.test(String(image.mime || ''))) throw new Error('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
  var base64 = String(image.base64 || '');
  if (!base64 || base64.length > 6990510 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) throw new Error('Ảnh không hợp lệ hoặc vượt 5 MB.');
  var bytes = Utilities.base64Decode(base64);
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('Mỗi ảnh tối đa 5 MB.');
  var b = function(i) { return (bytes[i] + 256) % 256; };
  var jpeg = bytes.length > 3 && b(0) === 255 && b(1) === 216 && b(2) === 255;
  var png = bytes.length > 8 && [137,80,78,71,13,10,26,10].every(function(n,i) { return b(i) === n; });
  var webp = bytes.length > 12 && [82,73,70,70].every(function(n,i) { return b(i) === n; }) && [87,69,66,80].every(function(n,i) { return b(i+8) === n; });
  if (!(image.mime === 'image/jpeg' && jpeg || image.mime === 'image/png' && png || image.mime === 'image/webp' && webp)) throw new Error('Nội dung tệp không khớp định dạng ảnh.');
  var ext = image.mime === 'image/jpeg' ? '.jpg' : image.mime === 'image/png' ? '.png' : '.webp';
  var name = String(image.name || 'anh-hoan').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\.[^.]*$/, '').slice(0,100) + ext;
  return { bytes: bytes, mime: image.mime, name: name, size: bytes.length };
}
function rfReturnValidateFile_(file) {
  if (!file) throw new Error('Chưa chọn file.');
  if (/^image\/(jpeg|png)$/.test(file.mime)) return rfReturnValidateImage_(file);
  var extensions = { 'application/pdf': '.pdf', 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/mpeg': '.mpeg', 'video/x-msvideo': '.avi' };
  if (!extensions[file.mime]) throw new Error('Chọn JPG/JPEG/PNG/PDF hoặc MP4/MOV/MPEG/AVI.');
  var max = /^video\//.test(file.mime) ? 25 : 5, encoded = String(file.base64 || '');
  if (!encoded || encoded.length > Math.ceil(max * 1024 * 1024 / 3) * 4 || encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('File không hợp lệ hoặc vượt ' + max + ' MB.');
  var bytes = Utilities.base64Decode(encoded), b = function(i) { return (bytes[i] + 256) % 256; };
  if (bytes.length > max * 1024 * 1024) throw new Error('File vượt ' + max + ' MB.');
  var at = function(offset, text) { return text.split('').every(function(c,i) { return b(offset+i) === c.charCodeAt(0); }); };
  var valid = file.mime === 'application/pdf' ? at(0,'%PDF-') : file.mime === 'video/mp4' ? at(4,'ftyp') : file.mime === 'video/quicktime' ? at(4,'ftyp') || at(4,'moov') || at(4,'mdat') || at(4,'wide') : file.mime === 'video/x-msvideo' ? at(0,'RIFF') && at(8,'AVI ') : bytes.length >= 4 && b(0) === 0 && b(1) === 0 && b(2) === 1 && [186,179].indexOf(b(3)) >= 0;
  if (!valid) throw new Error('Nội dung file không khớp định dạng.');
  return { bytes: bytes, mime: file.mime, size: bytes.length, name: String(file.name || 'bang-chung').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\.[^.]*$/,'').slice(0,100) + extensions[file.mime] };
}

function processReturnCommand_(command, auth) {
  var lock = LockService.getScriptLock(), acquired = false, undo = [], wrotePending = false, pendingKey = '', props, imageUpload = null, createdFile = null;
  try {
    if (!auth || !auth.valid) throw new Error('Phiên xác thực không hợp lệ.');
    if (!command || !/^[A-Za-z0-9_-]{8,100}$/.test(String(command.operationId || ''))) throw new Error('Thiếu mã thao tác hoàn hàng.');
    if (!lock.hasLock()) { if (!lock.tryLock(30000)) throw new Error('Hệ thống đang bận.'); acquired = true; }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var orders = readSheet('Orders', null, ss), productions = readSheet('Production', null, ss), products = readSheet('Products', null, ss), tickets = readSheet('ImportExport', null, ss);
    var order = orders.find(function(o) { return String(o.id) === String(command.orderId); });
    if (!order) throw new Error('Không tìm thấy đơn hàng.');
    var mayAccess = auth.isBoss || ['TỐI CAO', 'KẾ TOÁN', 'QUẢN LÝ KIỂM TOÁN', 'KIỂM TOÁN', 'QUẢN LÝ KHO VẬN', 'KHO VẬN', 'BÁN HÀNG', 'QUẢN LÝ BÁN HÀNG'].indexOf(auth.role) >= 0;
    if (!mayAccess) throw new Error('Bạn không có quyền xem/tải ảnh hàng hoàn.');
    if (command.action === 'DOWNLOAD_PACKING') {
      var packing = readSheet('Packings', null, ss).find(function(p) { return String(p.id) === String(command.packingId) && [String(order.id), String(order.orderCode || ''), rfReturnCode(order)].indexOf(String(p.orderId)) >= 0; });
      var part = Number(command.part);
      if (!packing || !Number.isInteger(part) || part < 0 || part > 3) throw new Error('Không tìm thấy ảnh đóng gói của đơn.');
      var photo = String(packing.photo || '').split('||')[part] || '';
      var driveId = photo.match(/(?:[?&]id=|\/d\/)([A-Za-z0-9_-]{10,})/);
      if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(photo) || !driveId) throw new Error('Ảnh đóng gói cũ chưa có file Drive; cần mở ảnh và lưu file gốc.');
      var packedFile = DriveApp.getFileById(driveId[1]);
      var packedMime = packedFile.getMimeType();
      if (!/^image\/(jpeg|png|webp)$/.test(packedMime) || packedFile.getSize() > 5 * 1024 * 1024) throw new Error('Ảnh đóng gói phải là JPG/PNG/WebP, tối đa 5 MB.');
      var packedExt = packedMime === 'image/png' ? '.png' : packedMime === 'image/webp' ? '.webp' : '.jpg';
      return { success: true, download: { name: 'Dong-goi_' + rfReturnCode(order).replace(/[^A-Za-z0-9_-]/g, '_') + '_' + (part + 1) + packedExt, mime: packedMime, base64: Utilities.base64Encode(packedFile.getBlob().getBytes()) } };
    }
    if (command.action === 'DOWNLOAD_IMAGE' || command.action === 'DOWNLOAD_FILE') {
      var currentWorkflow = rfReturnJson(order.returnWorkflow, {});
      var attached = (currentWorkflow.attachments || []).concat(currentWorkflow.excludedAttachments || []).find(function(a) { return a.id === command.attachmentId; });
      if (!attached || !attached.fileId) throw new Error('Không tìm thấy ảnh trong hồ sơ này.');
      var imageFile = DriveApp.getFileById(attached.fileId);
      if (imageFile.getSize() > (/^video\//.test(attached.mime) ? 25 : 5) * 1024 * 1024) throw new Error('File vượt giới hạn tải.');
      return { success: true, download: { name: attached.name, mime: attached.mime, base64: Utilities.base64Encode(imageFile.getBlob().getBytes()) } };
    }
    command = Object.assign({}, command);
    delete command._attachment;
    if (command.action === 'ATTACH_IMAGE' || command.action === 'ATTACH_FILE') {
      imageUpload = command.action === 'ATTACH_IMAGE' ? rfReturnValidateImage_(command.image) : rfReturnValidateFile_(command.file);
      var group = command.group || (command.purpose === 'RECEIPT' ? 'UNBOXING' : 'OTHER');
      if (['PACKING','UNBOXING','OTHER'].indexOf(group) < 0) throw new Error('Nhóm bằng chứng không hợp lệ.');
      command._attachment = { id: command.operationId, name: imageUpload.name, mime: imageUpload.mime, size: imageUpload.size, group: group, purpose: group === 'UNBOXING' ? 'RECEIPT' : 'CLAIM', by: auth.user, at: Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss'), fileId: '' };
    }
    if (command.action === 'ADD_PACKING_EVIDENCE') {
      var selected = readSheet('Packings', null, ss).find(function(p) { return String(p.id) === String(command.packingId) && [String(order.id), String(order.orderCode || ''), rfReturnCode(order)].indexOf(String(p.orderId)) >= 0; });
      var selectedPart = Number(command.part), sourceUrl = selected && Number.isInteger(selectedPart) && selectedPart >= 0 && selectedPart <= 3 ? String(selected.photo || '').split('||')[selectedPart] || '' : '';
      var selectedId = /^https:\/\/(drive|docs)\.google\.com\//i.test(sourceUrl) && sourceUrl.match(/(?:[?&]id=|\/d\/)([A-Za-z0-9_-]{10,})/);
      if (!selectedId) throw new Error('Không tìm thấy file Drive đóng gói của đơn.');
      var existingFile = DriveApp.getFileById(selectedId[1]), mime = existingFile.getMimeType();
      if (!/^image\/(jpeg|png)$/.test(mime) || existingFile.getSize() > 5 * 1024 * 1024) throw new Error('Ảnh đóng gói cần JPG/PNG tối đa 5 MB.');
      command._attachment = { id: command.operationId, fileId: selectedId[1], group: 'PACKING', purpose: 'CLAIM', name: 'Dong-goi_' + rfReturnCode(order).replace(/[^A-Za-z0-9_-]/g,'_') + '_' + (selectedPart+1) + (mime === 'image/png' ? '.png' : '.jpg'), mime: mime, size: existingFile.getSize(), by: auth.user, at: Utilities.formatDate(new Date(),'Asia/Ho_Chi_Minh','yyyy-MM-dd HH:mm:ss') };
    }
    props = PropertiesService.getScriptProperties();
    pendingKey = 'RF_RETURN_PENDING_' + String(order.id);
    var pending = rfReturnJson(props.getProperty(pendingKey), null);
    if (pending) {
      var savedWorkflow = rfReturnJson(order.returnWorkflow, {});
      if (savedWorkflow.operations && savedWorkflow.operations.indexOf(pending.operationId) >= 0) props.deleteProperty(pendingKey);
      else throw new Error('Thao tác trước bị gián đoạn (' + pending.operationId + '). Cần đối chiếu phiếu kho và phục hồi trước khi xử lý tiếp.');
    }
    var plan = rfReturnPlan(order, productions, products, tickets, command, auth, Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss'));
    if (!plan.duplicate) {
      // A hard Apps Script timeout may bypass catch/finally. Persist a guard before moving stock.
      props.setProperty(pendingKey, JSON.stringify({ operationId: command.operationId, user: auth.user, at: Date.now() }));
      wrotePending = true;
      if (imageUpload) {
        var folderId = props.getProperty('RF_RETURN_EVIDENCE_FOLDER'), folder;
        if (folderId) folder = DriveApp.getFolderById(folderId);
        else { folder = DriveApp.createFolder('RF_Return_Evidence'); props.setProperty('RF_RETURN_EVIDENCE_FOLDER', folder.getId()); }
        createdFile = folder.createFile(Utilities.newBlob(imageUpload.bytes, imageUpload.mime, imageUpload.name));
        var savedImageWorkflow = rfReturnJson(plan.order.returnWorkflow, {});
        savedImageWorkflow.attachments[savedImageWorkflow.attachments.length - 1].fileId = createdFile.getId();
        plan.order.returnWorkflow = JSON.stringify(savedImageWorkflow);
      }
      // Write only touched cells; retain formulas elsewhere. Roll back caught write failures.
      var writes = [{ table: 'Products', rows: plan.Products }, { table: 'Production', rows: plan.prodItems }, { table: 'ImportExport', rows: plan.ImportExport }, { table: 'Orders', rows: [plan.order] }];
      writes.forEach(function(batch) {
        if (!batch.rows.length) return;
        var sheet = ss.getSheetByName(batch.table);
        if (!sheet) throw new Error('Thiếu bảng ' + batch.table);
        var data = sheet.getDataRange().getValues(), headers = data[0], idCol = headers.indexOf('id');
        if (idCol < 0) throw new Error('Thiếu cột id của ' + batch.table);
        var required = batch.table === 'Orders' ? ['returnWorkflow', 'returnReason', 'returnedAt'] : [];
        required.forEach(function(h) { if (headers.indexOf(h) < 0) { headers.push(h); sheet.getRange(1, headers.length).setValue(h); } });
        batch.rows.forEach(function(row) {
          var idx = data.findIndex(function(r, i) { return i > 0 && String(r[idCol]) === String(row.id); });
          if (idx < 0) {
            idx = sheet.getLastRow();
            var values = headers.map(function(h) { var v = row[h]; return v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : v; });
            undo.push({ sheet: sheet, row: idx + 1, append: true, width: headers.length });
            sheet.getRange(idx + 1, 1, 1, headers.length).setValues([values]); data.push(values);
          } else {
            var fields = batch.table === 'Orders' ? ['status', 'accessories', 'isReconciled', 'reconciledAt', 'returnReason', 'returnWorkflow', 'updatedBy'] : Object.keys(row);
            fields.forEach(function(h) {
              var col = headers.indexOf(h); if (col < 0 || row[h] === undefined) return;
              var cell = sheet.getRange(idx + 1, col + 1), before = cell.getFormula() || cell.getValue();
              undo.push({ cell: cell, value: before });
              var v = row[h]; cell.setValue(v && typeof v === 'object' ? JSON.stringify(v) : v);
            });
          }
        });
      });
      SpreadsheetApp.flush();
      props.setProperty('RF_LAST_UPDATED', String(Date.now()));
      props.deleteProperty(pendingKey);
      wrotePending = false;
    }
    var responseOrder = Object.assign({}, plan.order), responseTickets = plan.ImportExport || [];
    if (!auth.isBoss && ['TỐI CAO', 'KẾ TOÁN', 'KIỂM TOÁN', 'QUẢN LÝ KIỂM TOÁN'].indexOf(auth.role) < 0) {
      delete responseOrder.cogs; delete responseOrder.costTotal;
      responseTickets = responseTickets.map(function(t) {
        var safe = Object.assign({}, t); delete safe.totalAmount;
        safe.itemsData = JSON.stringify(rfReturnJson(t.itemsData, []).map(function(i) { return { name: i.name, qty: i.qty }; }));
        return safe;
      });
    }
    return { success: true, orders: [responseOrder], prodItems: plan.prodItems || [], Products: plan.Products || [], ImportExport: responseTickets, serverTime: Date.now() };
  } catch (e) {
    var rollbackFailed = false;
    undo.reverse().forEach(function(u) { try { if (u.append) u.sheet.getRange(u.row, 1, 1, u.width).clearContent(); else u.cell.setValue(u.value); } catch (r) { rollbackFailed = true; } });
    if (createdFile) { try { createdFile.setTrashed(true); } catch (r) { rollbackFailed = true; } }
    if (wrotePending && !rollbackFailed) { try { SpreadsheetApp.flush(); props.deleteProperty(pendingKey); } catch (r) { rollbackFailed = true; } }
    return { success: false, error: rollbackFailed ? 'RETURN_RECOVERY_REQUIRED' : 'RETURN_REJECTED', message: e.message + (rollbackFailed ? ' Cần kiểm tra phục hồi dữ liệu trước khi thử lại.' : '') };
  } finally { if (acquired) lock.releaseLock(); }
}
