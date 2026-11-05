import fs from 'fs';

const brain = JSON.parse(fs.readFileSync('brain_cache.json', 'utf8'));

function normVN(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

function formatProductNameForVoice(name) {
  if (!name) return 'Sản phẩm';
  let s = String(name).trim();
  s = s.replace(/\[[^\]]+\]/g, '').trim();
  s = s.replace(/\b[A-Z0-9]{2,}-[A-Z0-9_-]+\b/g, '').trim();
  s = s.replace(/(\d+)\s*[xX*]\s*(\d+)/g, '$1 nhân $2');
  s = s.replace(/(\d+)\s*[xX*]\s*(\d+)/g, '$1 nhân $2');
  s = s.replace(/(\d+)\s*cm\b/gi, '$1 xăng ti mét');
  s = s.replace(/\bcm\b/gi, 'xăng ti mét');
  return s.replace(/\s+/g, ' ').trim();
}

function extractOrderToken(query) {
  if (!query) return null;
  let clean = String(query).replace(/\b([a-zA-Z0-9])\s+(?=[a-zA-Z0-9]\b)/gi, '$1');
  clean = clean.replace(/\b([a-zA-Z0-9])\s+(?=[a-zA-Z0-9]\b)/gi, '$1');

  const directMatch = clean.match(/(?:đơn\s+hàng|đơn|mã|đuôi)\s+([a-zA-Z0-9]{3,25})/i);
  if (directMatch && directMatch[1]) {
    const candidate = directMatch[1].toUpperCase();
    if (!/^(HANG|NAO|HOM|NAY|MOI|CU|CUA|TRUOC|SAU)$/.test(candidate)) {
      return candidate;
    }
  }

  const tokens = (clean.match(/[a-zA-Z0-9]{3,25}/g) || []).map(t => t.toUpperCase());
  const stopWords = new Set(['DON', 'HANG', 'KHAU', 'BAN', 'TIM', 'KIEM', 'TRA', 'XEM', 'CHO', 'NAO', 'TIEN', 'DUONG', 'TAM', 'HOM', 'NAY', 'XONG', 'NHAN', 'CHUA', 'LAM', 'GIA', 'DONG', 'GOI', 'SHOP', 'CUA', 'NGUYEN', 'ALL', 'THE', 'VI', 'DU', 'BAO', 'MAY', 'CON']);
  let filtered = tokens.filter(t => !stopWords.has(t) && (!/^\d+$/.test(t) || t.length >= 4));
  if (filtered.length === 0 && tokens.length > 0) {
    filtered = tokens.filter(t => !stopWords.has(t));
  }
  return filtered.length > 0 ? filtered[0] : null;
}

function detectVoiceProductionAction(query) {
  if (!query) return null;
  const qNorm = normVN(query);
  const token = extractOrderToken(query);
  if (!token) return null;

  let actionType = null;
  if (/nhan.*khau\s*1|nhan.*k1|lam.*khau\s*1|lam.*k1|nhan.*don/.test(qNorm)) {
    actionType = 'nhan_k1';
  } else if (/xong.*khau\s*1|xong.*k1|hoan\s*thanh.*khau\s*1|hoan\s*thanh.*k1|khau\s*1.*xong/.test(qNorm)) {
    actionType = 'xong_k1';
  } else if (/nhan.*khau\s*2|nhan.*k2|lam.*khau\s*2|lam.*k2/.test(qNorm)) {
    actionType = 'nhan_k2';
  } else if (/xong.*khau\s*2|xong.*k2|hoan\s*thanh.*khau\s*2|hoan\s*thanh.*k2|khau\s*2.*xong/.test(qNorm)) {
    actionType = 'xong_k2';
  }

  if (!actionType) return null;

  let workerName = 'Nguyễn Hoàng Dương';
  if (/tam/.test(qNorm)) workerName = 'Nguyễn Hữu Tâm';
  else if (/huong/.test(qNorm)) workerName = 'Nguyễn Thị Diệu Hương';
  else if (/tien|sep/.test(qNorm)) workerName = 'Nguyễn Ngọc Tiến';
  else if (/duong/.test(qNorm)) workerName = 'Nguyễn Hoàng Dương';

  return { actionType, workerName, orderToken: token };
}

function searchSpecificOrder(brain, query) {
  if (!query || !brain) return null;
  const token = extractOrderToken(query);
  if (!token) return null;

  const o = brain.orders || {};
  const p = brain.production || {};
  const allOrders = [].concat(o.todayOrdersList || [], o.recentOrders || [], o.exportOrders || []);

  let matchedOrder = null;
  for (const ord of allOrders) {
    const code = String(ord.code || '').toUpperCase();
    const cust = String(ord.customer || '').toUpperCase();
    if (code.endsWith(token) || code.includes(token) || cust.includes(token)) {
      matchedOrder = ord;
      break;
    }
  }

  if (!matchedOrder) return null;

  const rawCode = String(matchedOrder.code || '');
  const mainCode = rawCode.split('|')[0].trim();
  const suffix = mainCode.length >= 4 ? mainCode.slice(-4) : (token || mainCode);
  const ch = matchedOrder.channel || 'Sàn';
  const cust = matchedOrder.customer || 'Khách';

  let matchedProd = null;
  const pendingProds = p.pendingItems || [];
  for (const pr of pendingProds) {
    const pOrdId = String(pr.orderId || '');
    if ((matchedOrder.id && pOrdId === matchedOrder.id) || (mainCode && pOrdId === mainCode) || pOrdId.toUpperCase().includes(token)) {
      matchedProd = pr;
      break;
    }
  }

  let speech = `Dạ Sếp Tiến, đơn đuôi ${suffix} là đơn ${ch} của khách ${cust}.`;
  if (matchedProd) {
    const pName = formatProductNameForVoice(matchedProd.name);
    const p1Info = matchedProd.p1_status === 'Done' ? `Khâu 1 đã xong bởi ${matchedProd.p1_user || 'thợ'}` : (matchedProd.p1_user ? `Khâu 1 đang làm bởi ${matchedProd.p1_user}` : 'Khâu 1 chưa có ai nhận');
    const p2Info = matchedProd.p2_status === 'Done' ? `Khâu 2 đã xong bởi ${matchedProd.p2_user || 'thợ'}` : (matchedProd.p2_user ? `Khâu 2 đang làm bởi ${matchedProd.p2_user}` : 'Khâu 2 chưa bắt đầu');
    speech += ` Sản phẩm: ${pName}. Tiến độ: ${p1Info}, ${p2Info}.`;
    if (matchedProd.p1_status !== 'Done' && !matchedProd.p1_user) {
      speech += ` Sếp hoặc anh Dương có muốn nhận làm khâu 1 đơn này luôn không ạ?`;
    }
  } else {
    speech += ` Trạng thái đơn hiện tại: ${matchedOrder.status || 'Chờ Sản Xuất'}.`;
  }

  return { speech, order: matchedOrder, prod: matchedProd, suffix };
}

const queries = [
  "tìm đơn W7SH",
  "đơn 7sh là đơn gì",
  "đơn đuôi 6418",
  "đơn của mzbrush",
  "Dương nhận làm khâu 1 đơn W7SH",
  "Dương nhận khâu 1 đơn W 7 S H",
  "xong khâu 1 đơn W7SH",
  "hôm nay có mấy đơn"
];

for (const q of queries) {
  const token = extractOrderToken(q);
  const action = detectVoiceProductionAction(q);
  const spec = searchSpecificOrder(brain, q);
  console.log(`\nQuery: "${q}"`);
  console.log(`  Token: ${token}`);
  console.log(`  Action: ${action ? JSON.stringify(action) : 'None'}`);
  console.log(`  Output: ${spec ? spec.speech : 'Fallback to general'}`);
}
