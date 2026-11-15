// Shared browser/server rules, based on the seller form supplied by the user.
function rfReturnClaimPlatform_(order) {
  var ch = String((order && order.channel) || '').trim();
  var up = ch.toUpperCase();
  if (!ch || up.indexOf('SHOPEE') >= 0) return 'Shopee';
  if (up.indexOf('TIKTOK') >= 0) return 'TikTok Shop';
  if (up.indexOf('LAZADA') >= 0) return 'Lazada';
  if (up.indexOf('BÁN LẺ') >= 0 || up.indexOf('BAN LE') >= 0 || up.indexOf('CTV') >= 0 || up.indexOf('CỘNG TÁC VIÊN') >= 0 || up.indexOf('WEBSITE') >= 0) {
    return 'Đơn vị vận chuyển';
  }
  return ch;
}
var RF_SHOPEE_CLAIM_TYPES = {
  DAMAGE: 'Hư hỏng/ bể vỡ',
  WRONG_MISSING: 'Sai hàng/ Thiếu hàng/ Hàng rỗng',
  NOT_RETURNED: 'Chưa hoàn hàng cho Người bán nhưng cập nhật "Đã hoàn thành công"',
  DELIVERED_MISREPORTED: 'Đã giao hàng thành công tới Người mua nhưng cập nhật Đã hoàn/ Trả hàng không thành công'
};
function rfReturnClaimGroup_(file) {
  return ['PACKING','UNBOXING','OTHER'].indexOf(file.group) >= 0 ? file.group : file.purpose === 'RECEIPT' ? 'UNBOXING' : 'OTHER';
}
function rfReturnClaimCheck_(order, workflow, draft, nowMs) {
  var errors = [], files = workflow.attachments || [], groups = { PACKING: [], UNBOXING: [], OTHER: [] };
  files.forEach(function(f) { groups[rfReturnClaimGroup_(f)].push(f); });
  if (!RF_SHOPEE_CLAIM_TYPES[draft.issue]) errors.push('Chọn đúng mục Vấn đề cần được hỗ trợ.');
  if (!String(draft.shippingCode || '').trim()) errors.push('Bổ sung mã vận đơn đang khiếu nại.');
  if (order.shippingCode && String(draft.shippingCode || '').trim() !== String(order.shippingCode).trim()) errors.push('Mã vận đơn không khớp mã đã lưu của đơn.');
  if (!String(draft.facts || '').trim()) errors.push('Mô tả diễn biến và tình trạng đã kiểm tra.');
  if (!String(draft.request || '').trim()) errors.push('Nêu rõ đề nghị xử lý.');
  if (draft.amount !== '' && draft.amount !== undefined && (!Number.isSafeInteger(Number(draft.amount)) || Number(draft.amount) < 0)) errors.push('Số tiền đề nghị phải là số nguyên không âm.');
  Object.keys(groups).forEach(function(g) {
    if (groups[g].length > 5) errors.push('Nhóm ' + g + ' vượt 5 file; cần phân nhóm lại.');
    groups[g].forEach(function(f) {
      var video = /^video\//.test(f.mime), allowed = /^(image\/(jpeg|png)|application\/pdf|video\/(mp4|quicktime|mpeg|x-msvideo))$/.test(f.mime);
      if (!allowed || !Number.isFinite(Number(f.size)) || Number(f.size) > (video ? 25 : 5) * 1024 * 1024) errors.push('File ' + f.name + ' không khớp định dạng/dung lượng của bộ hồ sơ.');
    });
  });
  var check = draft.checks || {};
  var platform = rfReturnClaimPlatform_(order);
  if (draft.issue === 'DAMAGE' || draft.issue === 'WRONG_MISSING') {
    if (!groups.PACKING.length) errors.push('Bổ sung bằng chứng đóng gói trước khi gửi.');
    if (!groups.UNBOXING.some(function(f) { return /^video\//.test(f.mime); })) errors.push('Thiếu video mở kiện hoàn ở nhóm bắt buộc theo quy chuẩn ' + platform + '.');
    ['packingWaybill','packingCondition','packingQuantity','unboxingWaybill','unboxingCondition','unboxingQuantity'].forEach(function(k) { if (check[k] !== true) errors.push('Chưa xác nhận: ' + ({packingWaybill:'mã vận đơn lúc đóng gói',packingCondition:'quy cách và tình trạng lúc đóng gói',packingQuantity:'số lượng lúc đóng gói',unboxingWaybill:'mã vận đơn kiện hoàn',unboxingCondition:'bao bì và tình trạng khi mở kiện',unboxingQuantity:'số lượng nhận hoàn'})[k]); });
  } else if (draft.issue === 'NOT_RETURNED' || draft.issue === 'DELIVERED_MISREPORTED') {
    if (!groups.OTHER.length) errors.push('Bổ sung chứng từ hành trình/xác nhận giao nhận ở nhóm Bằng chứng khác.');
    if (!check.trackingVerified || !check.deliveryVerified) errors.push('Đối chiếu hành trình và xác nhận tình trạng giao nhận thực tế.');
    if (workflow.receivedAt) errors.push('Hồ sơ đã xác nhận nhận kiện hoàn; cần giải thích/kiểm tra mâu thuẫn trước khi chọn mục này.');
  }
  if (draft.deadline) {
    var deadline = new Date(String(draft.deadline).replace(' ', 'T') + '+07:00').getTime();
    if (!Number.isFinite(deadline)) errors.push('Hạn nộp trên sàn không hợp lệ.');
    else if (deadline <= nowMs) errors.push('Đã qua hạn bạn nhập; kiểm tra lại khả năng gửi trên ' + platform + '.');
  }
  return { ready: errors.length === 0, errors: errors, groups: groups };
}
function rfReturnClaimText_(order, workflow, draft) {
  var names = { PACKING: 'Đóng gói trước khi gửi', UNBOXING: 'Mở kiện hoàn', OTHER: 'Bằng chứng khác' };
  var text = 'Mã đơn: ' + String(order.orderCode || order.id).split('|')[0].trim() + '\nMã vận đơn: ' + String(draft.shippingCode || '[Chưa nhập]') + '\nVấn đề cần hỗ trợ: ' + (RF_SHOPEE_CLAIM_TYPES[draft.issue] || '[Chưa chọn]') + '\n\nDiễn biến đã kiểm tra:\n' + String(draft.facts || '[Cần bổ sung]') + '\n\nBằng chứng đính kèm trực tiếp:\n';
  ['PACKING','UNBOXING','OTHER'].forEach(function(g) {
    var files = (workflow.attachments || []).filter(function(f) { return rfReturnClaimGroup_(f) === g; });
    text += '- ' + names[g] + ': ' + (files.length ? files.map(function(f) { return f.name; }).join('; ') : 'Chưa đính kèm') + '\n';
  });
  text += '\nĐề nghị xử lý:\n' + String(draft.request || '[Cần bổ sung]');
  if (draft.amount !== '' && draft.amount !== undefined) text += '\nSố tiền đề nghị theo chứng từ: ' + Number(draft.amount).toLocaleString('vi-VN') + ' VNĐ.';
  return text;
}
