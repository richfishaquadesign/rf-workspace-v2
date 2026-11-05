/**
 * =========================================================================
 * 🤖 RF BOT FULL-SYSTEM INTELLIGENCE BRIDGE (RICH FISH AQUARIUM OS)
 * Phục vụ Robot Trợ lý Điều hành RF Bot (ESP32-S3 / Xiaozhi / DeepSeek V4)
 * Đọc hiểu toàn diện 100% dữ liệu từ 23+ bảng CSDL lõi của RF_Workspace_Pro:
 * 1. Kinh doanh & Đơn hàng: Orders, ProfitReports, CTV_Finance
 * 2. Sản xuất & Đóng gói: Production, Packings, Config_GiaLayout
 * 3. Kho vận & Vật tư: Products (Tồn kho), ImportExport (Xuất nhập), BOM_Config
 * 4. Tài chính & Kế toán: Transactions (Thu chi), Accounts (Quỹ), Suppliers (Công nợ), Reimbursements (Hoàn ứng)
 * 5. Nhân sự, Lương & KPI: Config_NhanSu, Attendance, Monthly_Snapshots, BonusPenalty, KPI_Progress, Config_KPI
 * 6. Nội bộ & Tri thức: Documents, Trainings, Models3D, Tracking_Log
 * =========================================================================
 */

var RF_BOT_MASTER_SS_ID_ = '1VGGL53xlS55dJNXYmz9GmqLjbhKh73wjEa1Hq7Holsw';

/**
 * Mở Spreadsheet Master của xưởng (ưu tiên trực tiếp ID bảng tính chính)
 */
function getRfBotMasterSpreadsheet_() {
  var ss = null;
  try {
    ss = SpreadsheetApp.openById(RF_BOT_MASTER_SS_ID_);
  } catch (openErr) {
    console.warn('Fallback sang ActiveSpreadsheet: ' + openErr.message);
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  return ss || SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Đọc bảng linh hoạt theo danh sách tên ứng viên (chống lệch tên sheet)
 */
function readSheetFlexible_(ss, candidates) {
  if (!ss) return [];
  if (typeof candidates === 'string') candidates = [candidates];
  for (var i = 0; i < candidates.length; i++) {
    if (ss.getSheetByName(candidates[i])) {
      return readSheet(candidates[i], null, ss) || [];
    }
  }
  var allSheets = ss.getSheets();
  for (var j = 0; j < allSheets.length; j++) {
    var shName = allSheets[j].getName();
    var shLow = shName.toLowerCase();
    for (var k = 0; k < candidates.length; k++) {
      if (shLow.indexOf(candidates[k].toLowerCase()) !== -1) {
        return readSheet(shName, null, ss) || [];
      }
    }
  }
  return [];
}

/**
 * Định dạng tiền tệ ngắn gọn cho giọng đọc AI
 */
function fmtMoneyVoice_(val) {
  var num = Number(val || 0);
  if (!isFinite(num) || num === 0) return '0 đồng';
  var abs = Math.abs(num);
  var sign = num < 0 ? 'âm ' : '';
  if (abs >= 1000000000) {
    return sign + (abs / 1000000000).toFixed(2).replace(/\.00$/, '') + ' tỷ đồng';
  }
  if (abs >= 1000000) {
    return sign + (abs / 1000000).toFixed(1).replace(/\.0$/, '') + ' triệu đồng';
  }
  if (abs >= 1000) {
    return sign + Math.round(abs / 1000).toLocaleString('vi-VN') + ' nghìn đồng';
  }
  return sign + abs.toLocaleString('vi-VN') + ' đồng';
}

/**
 * Bỏ dấu tiếng Việt để so khớp từ khóa nhanh
 */
function normVN_(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

/**
 * Thu thập toàn bộ dữ liệu 23 bảng của RF_Workspace_Pro thành cấu trúc Brain Snapshot
 */
function buildRfFullBrainSnapshot_(ss, targetDate) {
  var tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
  var currMonth = targetDate.slice(0, 7); // yyyy-MM

  // -------------------------------------------------------------------------
  // 1. ĐƠN HÀNG (ORDERS)
  // -------------------------------------------------------------------------
  var allOrders = readSheetFlexible_(ss, ['Orders']);
  var ordersBrain = {
    todayDate: targetDate,
    todayCount: 0,
    todayRevenue: 0,
    todayNeedsProdCount: 0,
    todayChannels: {},
    todayOrdersList: [],
    monthCount: 0,
    monthRevenue: 0,
    totalCount: allOrders.length,
    statusCounts: {},
    waitingHandoverCount: 0,
    unreconciledCount: 0,
    exportOrders: [],
    recentOrders: []
  };

  for (var oi = 0; oi < allOrders.length; oi++) {
    var o = allOrders[oi];
    if (!o) continue;
    var oDate = String(o.date || o.createdAt || '').slice(0, 10);
    var oMonth = oDate.slice(0, 7);
    var rev = Number(o.revenue || 0);
    if (!isFinite(rev)) rev = 0;
    var cod = Number(o.cod || 0);
    var ch = String(o.channel || 'Khác').trim();
    var st = String(o.status || 'Chờ Sản Xuất').trim();
    var hasProd = o.hasProduction === true || String(o.hasProduction).toUpperCase() === 'TRUE';
    var carried = o.isCarriedToWH === true || String(o.isCarriedToWH).toUpperCase() === 'TRUE';
    var reconciled = o.isReconciled === true || String(o.isReconciled).toUpperCase() === 'TRUE';
    var codeClean = String(o.orderCode || o.id || '').split('|')[0].trim();

    ordersBrain.statusCounts[st] = (ordersBrain.statusCounts[st] || 0) + 1;

    if (st === 'Chờ Sản Xuất' || (!carried && st !== 'Đối Soát Thành Công' && st !== 'Đã Bàn Giao' && st !== 'Đơn Huỷ' && st !== 'Hàng Hoàn')) {
      ordersBrain.waitingHandoverCount++;
    }
    if (st === 'Đã Bàn Giao' && !reconciled) {
      ordersBrain.unreconciledCount++;
    }

    if (oMonth === currMonth && st !== 'Đơn Huỷ') {
      ordersBrain.monthCount++;
      ordersBrain.monthRevenue += rev;
    }

    var orderItem = {
      code: codeClean,
      date: oDate,
      channel: ch,
      customer: String(o.customer || '').trim(),
      phone: String(o.phone || '').trim(),
      status: st,
      revenue: rev,
      cod: cod,
      accessories: String(o.accessories || '').trim(),
      note: String(o.note || '').trim(),
      hasProduction: hasProd,
      isCarriedToWH: carried,
      responsibleUser: String(o.responsibleUser || o.updatedBy || '').trim()
    };

    if (oDate === targetDate) {
      ordersBrain.todayCount++;
      ordersBrain.todayRevenue += rev;
      ordersBrain.todayChannels[ch] = (ordersBrain.todayChannels[ch] || 0) + 1;
      if (hasProd) ordersBrain.todayNeedsProdCount++;
      ordersBrain.todayOrdersList.push(orderItem);
    }

    if (/sg|singapore|malay|phil|quoc te|export|xuat khau/i.test(ch + ' ' + o.note)) {
      if (ordersBrain.exportOrders.length < 25) {
        ordersBrain.exportOrders.push(orderItem);
      }
    }

    if (ordersBrain.recentOrders.length < 40) {
      ordersBrain.recentOrders.push(orderItem);
    }
  }

  // -------------------------------------------------------------------------
  // 2. SẢN XUẤT (PRODUCTION) & ĐÓNG GÓI (PACKINGS)
  // -------------------------------------------------------------------------
  var allProd = readSheetFlexible_(ss, ['Production']);
  var prodBrain = {
    pendingCount: 0,
    phase1WaitingCount: 0,
    phase2WaitingCount: 0,
    qcWaitingCount: 0,
    urgentCount: 0,
    doneCount: 0,
    byWorker: {},
    pendingItems: []
  };

  for (var pi = 0; pi < allProd.length; pi++) {
    var p = allProd[pi];
    if (!p) continue;
    var pSt = String(p.status || '').trim().toLowerCase();
    var isDone = pSt === 'done' || pSt === 'đã xong' || pSt === 'hoàn thành';
    var isCancel = /hủy|huỷ|cancel|scrap|hoàn kho/.test(pSt);
    if (isCancel) continue;

    var p1User = String(p.p1_user || '').trim();
    var p2User = String(p.p2_user || '').trim();
    var p1St = String(p.p1_status || '').trim().toLowerCase();
    var p2St = String(p.p2_status || '').trim().toLowerCase();
    var qcSt = String(p.qc_status || '').trim().toLowerCase();
    var p1Done = p1St === 'done' || p1St === 'đã xong' || p1St === 'hoàn thành';
    var p2Done = p2St === 'done' || p2St === 'đã xong' || p2St === 'hoàn thành';
    var qcDone = qcSt === 'pass' || qcSt === 'đã duyệt';

    if (p1User) {
      if (!prodBrain.byWorker[p1User]) prodBrain.byWorker[p1User] = { p1Done: 0, p1Pending: 0, p2Done: 0, p2Pending: 0, reward: 0 };
      if (p1Done) {
        prodBrain.byWorker[p1User].p1Done++;
        prodBrain.byWorker[p1User].reward += Number(p.p1_reward_vnd || 0);
      } else {
        prodBrain.byWorker[p1User].p1Pending++;
      }
    }
    if (p2User) {
      if (!prodBrain.byWorker[p2User]) prodBrain.byWorker[p2User] = { p1Done: 0, p1Pending: 0, p2Done: 0, p2Pending: 0, reward: 0 };
      if (p2Done) {
        prodBrain.byWorker[p2User].p2Done++;
        prodBrain.byWorker[p2User].reward += Number(p.p2_reward_vnd || 0);
      } else {
        prodBrain.byWorker[p2User].p2Pending++;
      }
    }

    if (isDone) {
      prodBrain.doneCount++;
      continue;
    }

    prodBrain.pendingCount++;
    if (!p1Done) prodBrain.phase1WaitingCount++;
    else if (!p2Done) prodBrain.phase2WaitingCount++;
    else if (!qcDone) prodBrain.qcWaitingCount++;

    var dl = String(p.deadline || '').slice(0, 10);
    if (dl && dl <= targetDate) prodBrain.urgentCount++;

    if (prodBrain.pendingItems.length < 40) {
      prodBrain.pendingItems.push({
        id: p.id,
        orderId: String(p.orderId || '').split('|')[0].trim(),
        name: String(p.name || 'Sản phẩm').trim(),
        type: String(p.type || '').trim(),
        note: String(p.note || '').trim(),
        deadline: dl,
        p1_status: p.p1_status || 'Pending',
        p1_user: p1User,
        p2_status: p.p2_status || 'Pending',
        p2_user: p2User,
        qc_status: p.qc_status || 'Pending'
      });
    }
  }

  var allPackings = readSheetFlexible_(ss, ['Packings']);
  var packingBrain = {
    totalCount: allPackings.length,
    todayCount: 0,
    doneCount: 0,
    pendingCount: 0,
    totalReward: 0,
    byUser: {}
  };
  for (var pki = 0; pki < allPackings.length; pki++) {
    var pk = allPackings[pki];
    if (!pk) continue;
    var pkUser = String(pk.user || 'Chưa phân công').trim();
    var pkSt = String(pk.status || '').toLowerCase();
    var pkDate = String(pk.endTime || pk.end || pk.start || '').slice(0, 10);
    var pkRew = Number(pk.reward_vnd || 0);
    if (pkDate === targetDate) packingBrain.todayCount++;
    if (pkSt === 'done' || pkSt === 'hoàn thành' || pkSt === 'đã đóng gói') {
      packingBrain.doneCount++;
      packingBrain.totalReward += pkRew;
    } else {
      packingBrain.pendingCount++;
    }
    if (!packingBrain.byUser[pkUser]) packingBrain.byUser[pkUser] = { count: 0, reward: 0 };
    packingBrain.byUser[pkUser].count++;
    packingBrain.byUser[pkUser].reward += pkRew;
  }

  // -------------------------------------------------------------------------
  // 3. KHO HÀNG & TỒN KHO (PRODUCTS, IMPORT_EXPORT, BOM_CONFIG)
  // -------------------------------------------------------------------------
  var allProducts = readSheetFlexible_(ss, ['Products']);
  var inventoryBrain = {
    totalSkus: allProducts.length,
    totalCostValue: 0,
    totalRetailValue: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    byCategory: {},
    lowStockItems: [],
    productsList: []
  };

  for (var pri = 0; pri < allProducts.length; pri++) {
    var pr = allProducts[pri];
    if (!pr) continue;
    var sku = String(pr.sku || pr.id || '').trim();
    var pName = String(pr.name || '').trim();
    if (!pName && !sku) continue;
    var cat = String(pr.category || 'Chưa phân loại').trim();
    var subCat = String(pr.sub_category || '').trim();
    var qty = Number(pr.quantity || 0);
    if (!isFinite(qty)) qty = 0;
    var minSt = Number(pr.minStock || 0);
    var costP = Number(pr.costPrice || 0);
    var sellP = Number(pr.price || 0);
    var unit = String(pr.unit || 'cái').trim();

    if (qty > 0 && costP > 0) inventoryBrain.totalCostValue += qty * costP;
    if (qty > 0 && sellP > 0) inventoryBrain.totalRetailValue += qty * sellP;

    if (!inventoryBrain.byCategory[cat]) {
      inventoryBrain.byCategory[cat] = { skuCount: 0, totalQty: 0, costValue: 0 };
    }
    inventoryBrain.byCategory[cat].skuCount++;
    inventoryBrain.byCategory[cat].totalQty += qty;
    if (qty > 0 && costP > 0) inventoryBrain.byCategory[cat].costValue += qty * costP;

    var pItem = {
      sku: sku,
      name: pName,
      category: cat,
      subCategory: subCat,
      quantity: qty,
      minStock: minSt,
      unit: unit,
      costPrice: costP,
      price: sellP
    };

    if (qty <= 0) {
      inventoryBrain.outOfStockCount++;
    }
    if (qty <= minSt) {
      inventoryBrain.lowStockCount++;
      if (inventoryBrain.lowStockItems.length < 40) {
        inventoryBrain.lowStockItems.push(pItem);
      }
    }

    inventoryBrain.productsList.push(pItem);
  }

  var allImpExp = readSheetFlexible_(ss, ['ImportExport']);
  var impExpBrain = {
    totalSlips: allImpExp.length,
    monthImportCount: 0,
    monthImportValue: 0,
    monthExportCount: 0,
    monthExportValue: 0,
    recentSlips: []
  };
  for (var iei = allImpExp.length - 1; iei >= 0; iei--) {
    var ie = allImpExp[iei];
    if (!ie) continue;
    var ieDate = String(ie.date || '').slice(0, 10);
    var ieType = String(ie.type || '').trim();
    var ieAmt = Number(ie.totalAmount || 0);
    if (ieDate.slice(0, 7) === currMonth) {
      if (/nhập|nhap|in|import/i.test(ieType)) {
        impExpBrain.monthImportCount++;
        impExpBrain.monthImportValue += ieAmt;
      } else {
        impExpBrain.monthExportCount++;
        impExpBrain.monthExportValue += ieAmt;
      }
    }
    if (impExpBrain.recentSlips.length < 20) {
      impExpBrain.recentSlips.push({
        id: ie.id,
        date: ieDate,
        type: ieType,
        target: String(ie.target || '').trim(),
        totalAmount: ieAmt,
        note: String(ie.note || '').trim()
      });
    }
  }

  var allBom = readSheetFlexible_(ss, ['BOM_Config']);
  var bomBrain = {
    totalRules: allBom.length,
    byLayout: {}
  };
  for (var bi = 0; bi < allBom.length; bi++) {
    var b = allBom[bi];
    if (!b || !b.layoutCode) continue;
    var lCode = String(b.layoutCode).trim();
    if (!bomBrain.byLayout[lCode]) bomBrain.byLayout[lCode] = [];
    bomBrain.byLayout[lCode].push({
      materialSku: b.materialSku,
      defaultQty: Number(b.defaultQty || 0),
      unit: b.unit || ''
    });
  }

  // -------------------------------------------------------------------------
  // 4. THU CHI, QUỸ TÀI KHOẢN, CÔNG NỢ NCC, HOÀN ỨNG & LỢI NHUẬN
  // -------------------------------------------------------------------------
  var allTx = readSheetFlexible_(ss, ['Transactions']);
  var financeBrain = {
    todayIncome: 0,
    todayExpense: 0,
    monthIncome: 0,
    monthExpense: 0,
    monthNet: 0,
    totalIncome: 0,
    totalExpense: 0,
    byCategoryMonth: {},
    byCategoryAll: {},
    byMonth: {},
    recentTransactions: []
  };

  for (var ti = allTx.length - 1; ti >= 0; ti--) {
    var tx = allTx[ti];
    if (!tx) continue;
    var txDate = String(tx.date || '').slice(0, 10);
    var txMonth = txDate.slice(0, 7) || 'Khác';
    var txType = String(tx.type || '').trim();
    var txCat = String(tx.category || 'Khác').trim();
    var txAmt = Number(tx.amount || 0);
    if (!isFinite(txAmt)) txAmt = 0;
    var fromAcc = String(tx.fromAccount || '').trim();
    var toAcc = String(tx.toAccount || '').trim();

    var isIncome = /^(thu|in|income|nạp|nap)/i.test(txType) || (!txType && toAcc && !fromAcc);
    var isExpense = /^(chi|out|expense|rút|rut|thanh toán)/i.test(txType) || (!txType && fromAcc && !toAcc);

    if (!financeBrain.byMonth[txMonth]) {
      financeBrain.byMonth[txMonth] = { income: 0, expense: 0, byCategory: {} };
    }
    if (!financeBrain.byMonth[txMonth].byCategory[txCat]) {
      financeBrain.byMonth[txMonth].byCategory[txCat] = { income: 0, expense: 0 };
    }
    if (!financeBrain.byCategoryAll[txCat]) {
      financeBrain.byCategoryAll[txCat] = { income: 0, expense: 0 };
    }

    if (isIncome) {
      financeBrain.totalIncome += txAmt;
      financeBrain.byMonth[txMonth].income += txAmt;
      financeBrain.byMonth[txMonth].byCategory[txCat].income += txAmt;
      financeBrain.byCategoryAll[txCat].income += txAmt;
      if (txDate === targetDate) financeBrain.todayIncome += txAmt;
      if (txMonth === currMonth) {
        financeBrain.monthIncome += txAmt;
        if (!financeBrain.byCategoryMonth[txCat]) financeBrain.byCategoryMonth[txCat] = { income: 0, expense: 0 };
        financeBrain.byCategoryMonth[txCat].income += txAmt;
      }
    } else if (isExpense) {
      financeBrain.totalExpense += txAmt;
      financeBrain.byMonth[txMonth].expense += txAmt;
      financeBrain.byMonth[txMonth].byCategory[txCat].expense += txAmt;
      financeBrain.byCategoryAll[txCat].expense += txAmt;
      if (txDate === targetDate) financeBrain.todayExpense += txAmt;
      if (txMonth === currMonth) {
        financeBrain.monthExpense += txAmt;
        if (!financeBrain.byCategoryMonth[txCat]) financeBrain.byCategoryMonth[txCat] = { income: 0, expense: 0 };
        financeBrain.byCategoryMonth[txCat].expense += txAmt;
      }
    }

    if (financeBrain.recentTransactions.length < 40) {
      financeBrain.recentTransactions.push({
        id: tx.id,
        date: txDate,
        type: isIncome ? 'Thu' : (isExpense ? 'Chi' : (txType || 'Chuyển quỹ')),
        category: txCat,
        amount: txAmt,
        title: String(tx.title || '').trim(),
        fromAccount: fromAcc,
        toAccount: toAcc,
        note: String(tx.note || '').trim()
      });
    }
  }
  financeBrain.monthNet = financeBrain.monthIncome - financeBrain.monthExpense;

  var allAccounts = readSheetFlexible_(ss, ['Accounts']);
  var accountsBrain = {
    totalBalance: 0,
    accountsList: []
  };
  for (var aci = 0; aci < allAccounts.length; aci++) {
    var acc = allAccounts[aci];
    if (!acc || !acc.accountName) continue;
    var bal = Number(acc.balance || 0);
    if (!isFinite(bal)) bal = 0;
    accountsBrain.totalBalance += bal;
    accountsBrain.accountsList.push({
      id: acc.id,
      accountName: String(acc.accountName || '').trim(),
      balance: bal,
      type: String(acc.type || '').trim(),
      accountNumber: String(acc.accountNumber || '').trim(),
      accountOwner: String(acc.accountOwner || '').trim()
    });
  }

  var allSuppliers = readSheetFlexible_(ss, ['Suppliers']);
  var suppliersBrain = {
    totalSuppliers: allSuppliers.length,
    totalDebt: 0,
    suppliersList: []
  };
  for (var si = 0; si < allSuppliers.length; si++) {
    var sup = allSuppliers[si];
    if (!sup || !sup.name) continue;
    var debt = Number(sup.totalDebt || 0);
    if (!isFinite(debt)) debt = 0;
    suppliersBrain.totalDebt += debt;
    suppliersBrain.suppliersList.push({
      name: String(sup.name || '').trim(),
      phone: String(sup.phone || '').trim(),
      totalDebt: debt,
      category: String(sup.category || '').trim(),
      note: String(sup.note || '').trim()
    });
  }

  var allReimb = readSheetFlexible_(ss, ['Reimbursements']);
  var reimbBrain = {
    totalCount: allReimb.length,
    pendingCount: 0,
    pendingAmount: 0,
    paidAmount: 0,
    list: []
  };
  for (var ri = allReimb.length - 1; ri >= 0; ri--) {
    var r = allReimb[ri];
    if (!r) continue;
    var rAmt = Number(r.amount || 0);
    var rSt = String(r.status || 'Chờ duyệt').trim();
    if (/pending|chờ|cho duyet/i.test(rSt)) {
      reimbBrain.pendingCount++;
      reimbBrain.pendingAmount += rAmt;
    } else if (/paid|approved|đã|da thanh toan|duyệt/i.test(rSt)) {
      reimbBrain.paidAmount += rAmt;
    }
    if (reimbBrain.list.length < 20) {
      reimbBrain.list.push({
        staffName: String(r.staffName || '').trim(),
        reason: String(r.reason || '').trim(),
        amount: rAmt,
        status: rSt,
        createdAt: String(r.createdAt || '').slice(0, 10)
      });
    }
  }

  var allProfit = readSheetFlexible_(ss, ['ProfitReports']);
  var profitBrain = {
    reports: allProfit.slice(-15).map(function (pr) {
      var rev = Number(pr.revenue || 0);
      var fee = Number(pr.platformFee || 0);
      var ret = Number(pr.returns || 0);
      var disc = Number(pr.discount || 0);
      var ads = Number(pr.ads || 0);
      var cogs = Number(pr.cogs || 0);
      var sal = Number(pr.salary || 0);
      var op = Number(pr.operation || 0);
      var net = rev - fee - ret - disc - ads - cogs - sal - op;
      return {
        period: pr.period || '',
        channel: pr.channel || '',
        orderCount: Number(pr.orderCount || 0),
        revenue: rev,
        platformFee: fee,
        ads: ads,
        cogs: cogs,
        salary: sal,
        operation: op,
        netProfit: net
      };
    })
  };

  // -------------------------------------------------------------------------
  // 5. NHÂN SỰ, CHẤM CÔNG, BẢNG LƯƠNG, THƯỞNG PHẠT, KPI & CTV
  // -------------------------------------------------------------------------
  var hrConfig = readSheetFlexible_(ss, ['Config_NhanSu']);
  var allAtt = readSheetFlexible_(ss, ['Attendance']);
  var allSnapshots = readSheetFlexible_(ss, ['Monthly_Snapshots']);
  var allBP = readSheetFlexible_(ss, ['BonusPenalty']);
  var allKpiProg = readSheetFlexible_(ss, ['KPI_Progress']);
  var allKpiCfg = readSheetFlexible_(ss, ['Config_KPI']);
  var allCtv = readSheetFlexible_(ss, ['CTV_Finance']);

  var hrBrain = {
    totalStaffConfig: 0,
    staffDirectory: [],
    todayWorkingCount: 0,
    todayAbsentCount: 0,
    todayWorkingList: [],
    todayAbsentList: [],
    monthHoursByUser: {},
    salaryMonth: '',
    totalSalaryPool: 0,
    salaryList: [],
    bonusPenaltyByUser: {},
    recentBonusPenalty: [],
    kpiProgress: [],
    kpiConfig: [],
    ctvSummary: { totalAmount: 0, records: [] }
  };

  for (var hri = 0; hri < hrConfig.length; hri++) {
    var hr = hrConfig[hri];
    if (!hr) continue;
    var uName = String(hr['Tên Nhân Sự'] || hr['id'] || '').trim();
    if (!uName) continue;
    var role = String(hr['Chức Danh'] || '').trim();
    var baseSal = Number(hr['Lương Cơ Bản'] || 0);
    var roleSal = Number(hr['Lương Chức Vụ'] || 0);
    var fuelAll = Number(hr['Phụ Cấp Xăng Xe'] || 0);
    var vioDed = Number(hr['Khoản Trừ Vi Phạm'] || 0);
    hrBrain.totalStaffConfig++;
    hrBrain.staffDirectory.push({
      name: uName,
      role: role,
      subRole: String(hr['Chức Danh Phụ'] || '').trim(),
      permission: String(hr['Phân Quyền'] || '').trim(),
      baseSalary: baseSal,
      positionSalary: roleSal,
      fuelAllowance: fuelAll,
      violationDeduction: vioDed,
      estimatedFixedSalary: baseSal + roleSal + fuelAll
    });
  }

  var seenTodayAtt = {};
  for (var ati = 0; ati < allAtt.length; ati++) {
    var att = allAtt[ati];
    if (!att) continue;
    var aDate = String(att.date || '').slice(0, 10);
    var aUser = String(att.user || '').trim();
    if (!aUser) continue;
    var hrs = Number(att.totalHours || 0);
    if (aDate.slice(0, 7) === currMonth) {
      if (!hrBrain.monthHoursByUser[aUser]) hrBrain.monthHoursByUser[aUser] = { days: 0, hours: 0, penalty: 0 };
      if (hrs > 0 || att.timeIn || att.morningIn || att.afternoonIn) hrBrain.monthHoursByUser[aUser].days++;
      if (isFinite(hrs)) hrBrain.monthHoursByUser[aUser].hours += hrs;
      hrBrain.monthHoursByUser[aUser].penalty += Number(att.penalty || 0);
    }
    if (aDate === targetDate && !seenTodayAtt[aUser]) {
      seenTodayAtt[aUser] = true;
      var isLeave = att.leaveType || /nghỉ|vắng/i.test(String(att.status || ''));
      var isWork = (att.timeIn || att.morningIn || att.afternoonIn) && !isLeave;
      if (isWork) {
        hrBrain.todayWorkingCount++;
        hrBrain.todayWorkingList.push({
          user: aUser,
          timeIn: att.timeIn || att.morningIn || '',
          shift: att.shift || 'Hành chính',
          totalHours: hrs
        });
      } else if (isLeave) {
        hrBrain.todayAbsentCount++;
        hrBrain.todayAbsentList.push({
          user: aUser,
          reason: att.leaveType || att.note || 'Nghỉ phép'
        });
      }
    }
  }

  // Bảng lương (Monthly_Snapshots hoặc dự phóng từ Config_NhanSu)
  var availMonths = {};
  for (var sni = 0; sni < allSnapshots.length; sni++) {
    if (allSnapshots[sni] && allSnapshots[sni].month) {
      availMonths[String(allSnapshots[sni].month).trim()] = true;
    }
  }
  var sortedSalMonths = Object.keys(availMonths).sort().reverse();
  var targetSalMonth = availMonths[currMonth] ? currMonth : (sortedSalMonths[0] || currMonth);
  hrBrain.salaryMonth = targetSalMonth;

  var monthSnaps = allSnapshots.filter(function (s) {
    return s && String(s.month).trim() === targetSalMonth;
  });

  if (monthSnaps.length > 0) {
    for (var msi = 0; msi < monthSnaps.length; msi++) {
      var ms = monthSnaps[msi];
      var salVal = Number(ms.totalSalary || 0);
      hrBrain.totalSalaryPool += salVal;
      hrBrain.salaryList.push({
        user: String(ms.user || '').trim(),
        month: targetSalMonth,
        totalSalary: salVal,
        totalHours: Number(ms.totalHours || 0),
        totalAdvance: Number(ms.totalAdvance || 0),
        totalDebt: Number(ms.totalDebt || 0),
        source: 'Monthly_Snapshots'
      });
    }
  } else {
    for (var hdi = 0; hdi < hrBrain.staffDirectory.length; hdi++) {
      var stf = hrBrain.staffDirectory[hdi];
      if (/nghỉ|khách|thôi việc/i.test(stf.role)) continue;
      hrBrain.totalSalaryPool += stf.estimatedFixedSalary;
      hrBrain.salaryList.push({
        user: stf.name,
        month: currMonth,
        role: stf.role,
        baseSalary: stf.baseSalary,
        positionSalary: stf.positionSalary,
        fuelAllowance: stf.fuelAllowance,
        totalSalary: stf.estimatedFixedSalary,
        totalHours: (hrBrain.monthHoursByUser[stf.name] && hrBrain.monthHoursByUser[stf.name].hours) || 0,
        source: 'Config_NhanSu'
      });
    }
  }

  // Thưởng phạt (BonusPenalty)
  for (var bpi = allBP.length - 1; bpi >= 0; bpi--) {
    var bp = allBP[bpi];
    if (!bp || !bp.user) continue;
    var bpUser = String(bp.user).trim();
    var bpAmt = Number(bp.amount || 0);
    var bpType = String(bp.type || '').trim();
    var bpDate = String(bp.date || '').slice(0, 10);
    if (!hrBrain.bonusPenaltyByUser[bpUser]) {
      hrBrain.bonusPenaltyByUser[bpUser] = { bonus: 0, penalty: 0, net: 0 };
    }
    if (bpAmt >= 0 && !/phạt|phat|trừ|tru/i.test(bpType)) {
      hrBrain.bonusPenaltyByUser[bpUser].bonus += bpAmt;
      hrBrain.bonusPenaltyByUser[bpUser].net += bpAmt;
    } else {
      hrBrain.bonusPenaltyByUser[bpUser].penalty += Math.abs(bpAmt);
      hrBrain.bonusPenaltyByUser[bpUser].net -= Math.abs(bpAmt);
    }
    if (hrBrain.recentBonusPenalty.length < 25) {
      hrBrain.recentBonusPenalty.push({
        user: bpUser,
        type: bpType,
        amount: bpAmt,
        note: String(bp.note || '').trim(),
        date: bpDate,
        orderCode: String(bp.orderCode || '').trim()
      });
    }
  }

  // KPI Progress & Config_KPI
  for (var ki = 0; ki < allKpiProg.length; ki++) {
    var kp = allKpiProg[ki];
    if (!kp || !kp.user) continue;
    hrBrain.kpiProgress.push({
      user: String(kp.user || '').trim(),
      kpiName: String(kp.kpiName || '').trim(),
      current: Number(kp.current || 0),
      target: Number(kp.target || 0),
      unit: String(kp.unit || '').trim(),
      reward: Number(kp.reward || 0),
      isClaimed: kp.isClaimed
    });
  }
  for (var kci = 0; kci < allKpiCfg.length; kci++) {
    var kc = allKpiCfg[kci];
    if (!kc) continue;
    hrBrain.kpiConfig.push({
      group: kc['Nhóm Hàng'] || '',
      keyword: kc['Từ Khoá'] || '',
      itemName: kc['Tên Hàng'] || '',
      p1Reward: Number(kc['Tiền Khâu 1'] || 0),
      p2Reward: Number(kc['Tiền Khâu 2'] || 0),
      packReward: Number(kc['Thưởng Đóng Gói'] || 0),
      carryReward: Number(kc['Thưởng Chở Kho'] || 0)
    });
  }

  // CTV Finance
  for (var cti = 0; cti < allCtv.length; cti++) {
    var ct = allCtv[cti];
    if (!ct) continue;
    var ctAmt = Number(ct.amount || 0);
    hrBrain.ctvSummary.totalAmount += ctAmt;
    if (hrBrain.ctvSummary.records.length < 20) {
      hrBrain.ctvSummary.records.push({
        date: String(ct.date || '').slice(0, 10),
        user: String(ct.user || '').trim(),
        type: String(ct.type || '').trim(),
        amount: ctAmt,
        status: String(ct.status || '').trim(),
        note: String(ct.note || '').trim()
      });
    }
  }

  // -------------------------------------------------------------------------
  // 6. TÀI LIỆU, ĐÀO TẠO, MÔ HÌNH 3D, GIÁ LAYOUT & NHẬT KÝ
  // -------------------------------------------------------------------------
  var allDocs = readSheetFlexible_(ss, ['Documents']);
  var allTrainings = readSheetFlexible_(ss, ['Trainings']);
  var allModels3D = readSheetFlexible_(ss, ['Models3D']);
  var allGiaLayout = readSheetFlexible_(ss, ['Config_GiaLayout']);
  var allLogs = readSheetFlexible_(ss, ['Tracking_Log']);

  var knowledgeBrain = {
    documentsCount: allDocs.length,
    documents: allDocs.slice(0, 20).map(function (d) {
      return { title: d.title || '', category: d.category || '', description: d.description || '' };
    }),
    trainingsCount: allTrainings.length,
    trainings: allTrainings.slice(0, 20).map(function (t) {
      return { title: t.title || '', targetRole: t.targetRole || '' };
    }),
    models3DCount: allModels3D.length,
    models3D: allModels3D.slice(0, 20).map(function (m) {
      return { name: m.name || '', productId: m.productId || '', materials: m.materials || '' };
    }),
    configGiaLayout: allGiaLayout,
    recentLogs: allLogs.slice(-15)
  };

  return {
    generatedAt: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'),
    targetDate: targetDate,
    currentMonth: currMonth,
    orders: ordersBrain,
    production: prodBrain,
    packings: packingBrain,
    inventory: inventoryBrain,
    importExport: impExpBrain,
    bom: bomBrain,
    finance: financeBrain,
    accounts: accountsBrain,
    suppliers: suppliersBrain,
    reimbursements: reimbBrain,
    profitReports: profitBrain,
    hr: hrBrain,
    knowledge: knowledgeBrain
  };
}

/**
 * Tổng hợp câu trả lời thông minh + dữ liệu chi tiết từ Brain Snapshot theo câu hỏi bất kỳ
 */
function synthesizeAnswerFromBrain_(brain, rawQuery, reqType) {
  var normQ = normVN_(rawQuery);
  var rType = normVN_(reqType);

  // Phân tích chủ đề câu hỏi (Multi-Intent Detection cho toàn bộ 23 bảng)
  var askOrders = rType === 'orders' || /don hang|don|order|doanh thu|doanh so|ban hang|shopee|tiktok|lazada|khach|xuat khau|singapore|sg|ban giao|doi soat|hoan|huy/.test(normQ);
  var askProd = rType === 'production' || /san xuat|che tac|gia cong|khau 1|khau 2|be kinh|layout|cat dan|gia co|qc|tien do|lenh/.test(normQ);
  var askPacking = rType === 'packing' || /dong goi|packing|boc hang/.test(normQ);
  var askInventory = rType === 'inventory' || /kho|ton kho|vat tu|nguyen lieu|san pham|sku|het hang|sap het|nhap kho|xuat kho|bom|dinh muc|keo|da|lua|reu|den|loc/.test(normQ);
  var askFinance = rType === 'finance' || /thu chi|tai chinh|dong tien|chi phi|tien mat|quy|tai khoan|so du|ngan hang|cong no|nha cung cap|ncc|hoan ung|ung tien|loi nhuan|lai lo|p&l/.test(normQ);
  var askSalary = rType === 'salary' || /luong|bang luong|thu nhap|quy luong|tam ung|thuong|phat|kpi|xu|ctv|cong tac vien/.test(normQ);
  var askAttendance = rType === 'attendance' || /nhan vien|nhan su|di lam|cham cong|ai lam|quan so|vang|nghi|diem danh/.test(normQ);
  var askKnowledge = rType === 'knowledge' || /tai lieu|quy trinh|dao tao|sop|3d|gia layout/.test(normQ);

  var isGeneral = (!askOrders && !askProd && !askPacking && !askInventory && !askFinance && !askSalary && !askAttendance && !askKnowledge) || rType === 'all' || /tong quan|toan bo|tat ca|tinh hinh|bao cao/.test(normQ);

  var speechParts = [];
  var detailSections = [];

  var o = brain.orders;
  var p = brain.production;
  var pk = brain.packings;
  var inv = brain.inventory;
  var ie = brain.importExport;
  var fin = brain.finance;
  var acc = brain.accounts;
  var sup = brain.suppliers;
  var rmb = brain.reimbursements;
  var hr = brain.hr;

  // 1. TỔNG QUAN HỆ THỐNG LUÔN ĐƯỢC ĐÍNH KÈM TRONG CONTEXT ĐỂ AI HIỂU TOÀN DIỆN 23 BẢNG
  var chSummary = Object.keys(o.todayChannels).map(function (k) {
    return o.todayChannels[k] + ' đơn ' + k;
  }).join(', ');

  detailSections.push(
    '=== [1. TỔNG QUAN 23 BẢNG RF WORKSPACE PRO NGÀY ' + brain.targetDate + '] ===\n' +
    '- ĐƠN HÀNG HÔM NAY: ' + o.todayCount + ' đơn, doanh thu ' + fmtMoneyVoice_(o.todayRevenue) + (chSummary ? ' (' + chSummary + ')' : '') + ', cần sản xuất: ' + o.todayNeedsProdCount + ' đơn.\n' +
    '- TỔNG ĐƠN THÁNG ' + brain.currentMonth + ': ' + o.monthCount + ' đơn, doanh thu ' + fmtMoneyVoice_(o.monthRevenue) + '. Đang chờ sản xuất/bàn giao: ' + o.waitingHandoverCount + ' đơn. Đã bàn giao chờ đối soát: ' + o.unreconciledCount + ' đơn.\n' +
    '- SẢN XUẤT & ĐÓNG GÓI: ' + p.pendingCount + ' lệnh đang chạy (Khâu 1 cắt dán: ' + p.phase1WaitingCount + ', Khâu 2 gia cố: ' + p.phase2WaitingCount + ', Chờ QC: ' + p.qcWaitingCount + ', Đơn gấp: ' + p.urgentCount + '). Đóng gói hôm nay: ' + pk.todayCount + ' đơn.\n' +
    '- KHO HÀNG (PRODUCTS & IMPORT/EXPORT): Tổng ' + inv.totalSkus + ' mã SKU, tổng giá trị vốn tồn kho: ' + fmtMoneyVoice_(inv.totalCostValue) + ' (giá trị bán: ' + fmtMoneyVoice_(inv.totalRetailValue) + '). Cảnh báo chạm đáy/hết hàng: ' + inv.lowStockCount + ' mã (trong đó hết sạch: ' + inv.outOfStockCount + ' mã). Tháng này có ' + ie.monthImportCount + ' phiếu nhập (' + fmtMoneyVoice_(ie.monthImportValue) + ') và ' + ie.monthExportCount + ' phiếu xuất (' + fmtMoneyVoice_(ie.monthExportValue) + ').\n' +
    '- TÀI CHÍNH & THU CHI (TRANSACTIONS & ACCOUNTS): Hôm nay Thu ' + fmtMoneyVoice_(fin.todayIncome) + ' / Chi ' + fmtMoneyVoice_(fin.todayExpense) + '. Luỹ kế tháng ' + brain.currentMonth + ': Tổng Thu ' + fmtMoneyVoice_(fin.monthIncome) + ', Tổng Chi ' + fmtMoneyVoice_(fin.monthExpense) + ', Dòng tiền ròng: ' + fmtMoneyVoice_(fin.monthNet) + '. Tổng số dư các quỹ tài khoản: ' + fmtMoneyVoice_(acc.totalBalance) + '. Công nợ nhà cung cấp: ' + fmtMoneyVoice_(sup.totalDebt) + '. Đề nghị hoàn ứng chờ duyệt: ' + rmb.pendingCount + ' khoản (' + fmtMoneyVoice_(rmb.pendingAmount) + ').\n' +
    '- NHÂN SỰ, CHẤM CÔNG & LƯƠNG (HR & SALARY): Hôm nay có ' + hr.todayWorkingCount + ' nhân sự đi làm (' + hr.todayWorkingList.map(function (w) { return w.user; }).join(', ') + '). Quỹ lương tháng ' + hr.salaryMonth + ': ' + fmtMoneyVoice_(hr.totalSalaryPool) + ' cho ' + hr.salaryList.length + ' nhân sự.'
  );

  // 2. XỬ LÝ CHI TIẾT KHI HỎI VỀ KHO HÀNG / TỒN KHO / VẬT TƯ
  if (askInventory || isGeneral) {
    var lowNames = inv.lowStockItems.slice(0, 6).map(function (it) {
      return it.name + ' (còn ' + it.quantity + ' ' + it.unit + ')';
    }).join(', ');

    speechParts.push(
      'Về kho hàng: Xưởng hiện quản lý ' + inv.totalSkus + ' mã vật tư và sản phẩm, tổng giá trị vốn tồn kho là ' + fmtMoneyVoice_(inv.totalCostValue) + '. ' +
      (inv.lowStockCount > 0 ? ('Có ' + inv.lowStockCount + ' mã đang chạm ngưỡng cảnh báo hoặc hết hàng, gồm: ' + lowNames + '.') : 'Tất cả vật tư đều đủ tồn kho an toàn.')
    );

    var catLines = Object.keys(inv.byCategory).map(function (c) {
      var cb = inv.byCategory[c];
      return '  + Nhóm ' + c + ': ' + cb.skuCount + ' mã, tổng SL ' + cb.totalQty + ', giá trị vốn ' + fmtMoneyVoice_(cb.costValue);
    }).join('\n');

    // Tìm kiếm sản phẩm cụ thể nếu câu hỏi có từ khóa
    var matchedProducts = inv.productsList.filter(function (pr) {
      var nName = normVN_(pr.name + ' ' + pr.sku + ' ' + pr.category);
      var words = normQ.split(/\s+/).filter(function (w) {
        return w.length >= 2 && !/^(kho|ton|hang|con|bao|nhieu|kiem|tra|cho|hoi|ve|du|lieu|trong|xem|ma|san|pham|vat|tu)$/.test(w);
      });
      if (words.length === 0) return false;
      return words.some(function (w) { return nName.indexOf(w) !== -1; });
    });

    var prodDetailBlock = (matchedProducts.length > 0 ? matchedProducts.slice(0, 30) : inv.productsList.slice(0, 35)).map(function (pr) {
      return '  * [' + pr.sku + '] ' + pr.name + ' (' + pr.category + '): Tồn = ' + pr.quantity + ' ' + pr.unit + ' (Min: ' + pr.minStock + ') | Giá vốn: ' + fmtMoneyVoice_(pr.costPrice) + ' | Giá bán: ' + fmtMoneyVoice_(pr.price);
    }).join('\n');

    var lowStockBlock = inv.lowStockItems.slice(0, 25).map(function (pr) {
      return '  ! [' + pr.sku + '] ' + pr.name + ': Tồn = ' + pr.quantity + '/' + pr.minStock + ' ' + pr.unit;
    }).join('\n');

    var ieBlock = ie.recentSlips.slice(0, 10).map(function (s) {
      return '  - [' + s.date + '] ' + s.type + ' (' + s.target + '): ' + fmtMoneyVoice_(s.totalAmount) + ' | ' + s.note;
    }).join('\n');

    detailSections.push(
      '=== [CHI TIẾT KHO HÀNG & XUẤT NHẬP KHO] ===\n' +
      'Phân nhóm tồn kho:\n' + catLines + '\n' +
      'Danh sách mã cảnh báo sắp hết / âm kho (' + inv.lowStockCount + ' mã):\n' + (lowStockBlock || '  Không có') + '\n' +
      'Chi tiết tồn kho các mặt hàng:\n' + prodDetailBlock + '\n' +
      'Lịch sử phiếu Xuất / Nhập kho gần nhất:\n' + (ieBlock || '  Chưa có phiếu mới')
    );
  }

  // 3. XỬ LÝ CHI TIẾT KHI HỎI VỀ THU CHI / TÀI CHÍNH / QUỸ / CÔNG NỢ / HOÀN ỨNG
  if (askFinance || isGeneral) {
    var accSummary = acc.accountsList.map(function (a) {
      return a.accountName + ': ' + fmtMoneyVoice_(a.balance);
    }).join(', ');

    speechParts.push(
      'Về tài chính và thu chi: Hôm nay thu ' + fmtMoneyVoice_(fin.todayIncome) + ', chi ' + fmtMoneyVoice_(fin.todayExpense) + '. ' +
      'Trong tháng ' + brain.currentMonth + ', tổng thu là ' + fmtMoneyVoice_(fin.monthIncome) + ', tổng chi là ' + fmtMoneyVoice_(fin.monthExpense) + ', dòng tiền ròng đạt ' + fmtMoneyVoice_(fin.monthNet) + '. ' +
      'Tổng số dư quỹ hiện tại là ' + fmtMoneyVoice_(acc.totalBalance) + (accSummary ? ' (' + accSummary + ')' : '') + '. ' +
      'Tổng công nợ nhà cung cấp là ' + fmtMoneyVoice_(sup.totalDebt) + '.'
    );

    var catFinLines = Object.keys(fin.byCategoryMonth).map(function (c) {
      var fc = fin.byCategoryMonth[c];
      return '  + Danh mục [' + c + ']: Thu ' + fmtMoneyVoice_(fc.income) + ' | Chi ' + fmtMoneyVoice_(fc.expense);
    }).join('\n');

    var txLines = fin.recentTransactions.slice(0, 25).map(function (t) {
      return '  - [' + t.date + '] ' + t.type + ' (' + t.category + '): ' + fmtMoneyVoice_(t.amount) + ' | ' + t.title + (t.note ? ' (' + t.note + ')' : '') + (t.fromAccount ? ' [Từ: ' + t.fromAccount + ']' : '') + (t.toAccount ? ' [Vào: ' + t.toAccount + ']' : '');
    }).join('\n');

    var accLines = acc.accountsList.map(function (a) {
      return '  * Quỹ/TK ' + a.accountName + ' (' + a.type + ' - ' + a.accountOwner + '): Số dư = ' + fmtMoneyVoice_(a.balance);
    }).join('\n');

    var supLines = sup.suppliersList.filter(function (s) { return s.totalDebt !== 0; }).map(function (s) {
      return '  * NCC ' + s.name + ' (' + s.category + '): Nợ = ' + fmtMoneyVoice_(s.totalDebt) + ' | SĐT: ' + s.phone;
    }).join('\n');

    var rmbLines = rmb.list.slice(0, 10).map(function (r) {
      return '  * [' + r.createdAt + '] ' + r.staffName + ': ' + fmtMoneyVoice_(r.amount) + ' - Lý do: ' + r.reason + ' (' + r.status + ')';
    }).join('\n');

    detailSections.push(
      '=== [CHI TIẾT THU CHI, SỔ QUỸ, CÔNG NỢ & HOÀN ỨNG] ===\n' +
      'Số dư các Tài khoản / Quỹ (' + fmtMoneyVoice_(acc.totalBalance) + '):\n' + (accLines || '  Chưa cấu hình quỹ') + '\n' +
      'Thu chi tháng ' + brain.currentMonth + ' theo danh mục:\n' + (catFinLines || '  Chưa phát sinh trong tháng hiện tại') + '\n' +
      'Danh sách giao dịch Thu / Chi gần nhất:\n' + (txLines || '  Không có giao dịch') + '\n' +
      'Công nợ Nhà cung cấp (Tổng nợ: ' + fmtMoneyVoice_(sup.totalDebt) + '):\n' + (supLines || '  Không có công nợ tồn đọng') + '\n' +
      'Đề nghị hoàn ứng chi phí (' + rmb.pendingCount + ' khoản chờ duyệt = ' + fmtMoneyVoice_(rmb.pendingAmount) + '):\n' + (rmbLines || '  Không có đề nghị hoàn ứng')
    );
  }

  // 3.5. TÌM KIẾM ĐƠN HÀNG CỤ THỂ THEO MÃ / ĐUÔI ĐƠN / TÊN KHÁCH
  var specificOrderRes = searchSpecificOrderInBrain_(brain, rawQuery);
  if (specificOrderRes) {
    speechParts.unshift(specificOrderRes.speech);
    detailSections.unshift(specificOrderRes.detail);
  }

  // 4. XỬ LÝ CHI TIẾT ĐƠN HÀNG (ORDERS)
  if ((askOrders || isGeneral) && !specificOrderRes) {
    speechParts.push(
      'Về đơn hàng: Hôm nay xưởng có ' + o.todayCount + ' đơn, doanh thu ' + fmtMoneyVoice_(o.todayRevenue) + (chSummary ? ' (' + chSummary + ')' : '') + ', trong đó ' + o.todayNeedsProdCount + ' đơn cần sản xuất. ' +
      'Toàn xưởng hiện còn ' + o.waitingHandoverCount + ' đơn đang chờ sản xuất hoặc chờ bàn giao kho.'
    );

    var todayOrdLines = o.todayOrdersList.map(function (ord) {
      return '  * Mã đơn [' + ord.code + '] | Kênh: ' + ord.channel + ' | Khách: ' + ord.customer + ' | Doanh thu: ' + fmtMoneyVoice_(ord.revenue) + ' (COD: ' + fmtMoneyVoice_(ord.cod) + ') | Trạng thái: ' + ord.status + ' | SP/Ghi chú: ' + (ord.accessories || ord.note || 'Tiêu chuẩn') + ' | Đã chở kho: ' + (ord.isCarriedToWH ? 'Rồi' : 'Chưa');
    }).join('\n');

    var expOrdLines = o.exportOrders.slice(0, 15).map(function (ord) {
      return '  * Đơn Quốc Tế/SG [' + ord.code + '] (' + ord.date + ') | Kênh: ' + ord.channel + ' | Doanh thu: ' + fmtMoneyVoice_(ord.revenue) + ' | Trạng thái: ' + ord.status + ' | Chi tiết: ' + (ord.accessories || ord.note || '');
    }).join('\n');

    var stSummaryLines = Object.keys(o.statusCounts).map(function (stKey) {
      return '  + ' + stKey + ': ' + o.statusCounts[stKey] + ' đơn';
    }).join('\n');

    detailSections.push(
      '=== [CHI TIẾT ĐƠN HÀNG HÔM NAY & TRẠNG THÁI ĐƠN] ===\n' +
      'Thống kê tổng trạng thái đơn trên hệ thống:\n' + stSummaryLines + '\n' +
      'Danh sách chi tiết từng đơn hàng hôm nay (' + o.todayCount + ' đơn):\n' + (todayOrdLines || '  Hôm nay chưa có đơn mới') + '\n' +
      'Danh sách các đơn Xuất khẩu / Shopee Quốc tế (Shopee SG/MY/PH):\n' + (expOrdLines || '  Không có')
    );
  }

  // 5. XỬ LÝ CHI TIẾT SẢN XUẤT & ĐÓNG GÓI
  if (askProd || askPacking || isGeneral) {
    var prodSample = p.pendingItems.slice(0, 4).map(function (it) { return it.name; }).join(', ');
    speechParts.push(
      'Về sản xuất: Hiện có ' + p.pendingCount + ' lệnh đang chạy (Khâu 1 cắt dán: ' + p.phase1WaitingCount + ' lệnh, Khâu 2 gia cố: ' + p.phase2WaitingCount + ' lệnh, Chờ QC: ' + p.qcWaitingCount + ' lệnh). ' +
      (prodSample ? ('Các mẫu đang làm gồm: ' + prodSample + '.') : '')
    );

    var prodLines = p.pendingItems.slice(0, 25).map(function (it) {
      return '  * Lệnh [' + it.orderId + '] ' + it.name + ' (' + it.type + ') | Khâu 1: ' + it.p1_status + ' (' + (it.p1_user || 'Chưa nhận') + ') | Khâu 2: ' + it.p2_status + ' (' + (it.p2_user || 'Chưa nhận') + ') | Hạn: ' + (it.deadline || 'Không');
    }).join('\n');

    var workerLines = Object.keys(p.byWorker).map(function (w) {
      var wb = p.byWorker[w];
      return '  + Thợ ' + w + ': Đang làm K1=' + wb.p1Pending + ', Đã xong K1=' + wb.p1Done + ' | Đang làm K2=' + wb.p2Pending + ', Đã xong K2=' + wb.p2Done + ' | Thưởng SX tích luỹ: ' + fmtMoneyVoice_(wb.reward);
    }).join('\n');

    detailSections.push(
      '=== [CHI TIẾT SẢN XUẤT & ĐÓNG GÓI] ===\n' +
      'Năng suất từng thợ sản xuất:\n' + (workerLines || '  Chưa ghi nhận') + '\n' +
      'Danh sách lệnh sản xuất đang chạy:\n' + (prodLines || '  Đã hoàn thành hết')
    );
  }

  // 6. XỬ LÝ CHI TIẾT NHÂN SỰ, CHẤM CÔNG, BẢNG LƯƠNG, THƯỞNG PHẠT & KPI
  if (askSalary || askAttendance || isGeneral) {
    if (askSalary) {
      var salBrief = hr.salaryList.slice(0, 6).map(function (s) {
        return s.user + ': ' + fmtMoneyVoice_(s.totalSalary);
      }).join(', ');
      speechParts.push(
        'Về bảng lương tháng ' + hr.salaryMonth + ': Tổng quỹ lương là ' + fmtMoneyVoice_(hr.totalSalaryPool) + ' cho ' + hr.salaryList.length + ' nhân sự (' + salBrief + ').'
      );
    }
    if (askAttendance || isGeneral) {
      var attNames = hr.todayWorkingList.map(function (w) { return w.user; }).join(', ');
      speechParts.push(
        'Quân số hôm nay có ' + hr.todayWorkingCount + ' nhân viên đi làm' + (attNames ? ' gồm: ' + attNames : '') + '.'
      );
    }

    var salLines = hr.salaryList.map(function (s) {
      var bpInfo = hr.bonusPenaltyByUser[s.user] || { bonus: 0, penalty: 0 };
      return '  * ' + s.user + (s.role ? ' (' + s.role + ')' : '') + ': Lương = ' + fmtMoneyVoice_(s.totalSalary) +
        (s.totalHours ? ' | Giờ công: ' + s.totalHours + 'h' : '') +
        (s.totalAdvance ? ' | Đã ứng: ' + fmtMoneyVoice_(s.totalAdvance) : '') +
        (bpInfo.bonus ? ' | Tổng thưởng: +' + fmtMoneyVoice_(bpInfo.bonus) : '') +
        (bpInfo.penalty ? ' | Tổng phạt: -' + fmtMoneyVoice_(bpInfo.penalty) : '');
    }).join('\n');

    var kpiLines = hr.kpiProgress.slice(0, 15).map(function (k) {
      return '  * ' + k.user + ' - ' + k.kpiName + ': ' + k.current + '/' + k.target + ' ' + k.unit + ' (Thưởng: ' + fmtMoneyVoice_(k.reward) + ')';
    }).join('\n');

    detailSections.push(
      '=== [CHI TIẾT NHÂN SỰ, CHẤM CÔNG, BẢNG LƯƠNG, THƯỞNG PHẠT & KPI] ===\n' +
      'Bảng lương & Thu nhập từng nhân sự (Tháng ' + hr.salaryMonth + ' - Tổng quỹ: ' + fmtMoneyVoice_(hr.totalSalaryPool) + '):\n' + salLines + '\n' +
      'Tiến độ KPI nhân sự:\n' + (kpiLines || '  Chưa có dữ liệu KPI')
    );
  }

  var finalSpeech = speechParts.join(' ');
  var fullContextForLLM = finalSpeech + '\n\n' + detailSections.join('\n\n');

  return {
    speech_text: finalSpeech,
    full_context: fullContextForLLM
  };
}

/**
 * Tìm kiếm chi tiết đơn hàng trong Brain Snapshot dựa trên mã/đuôi đơn hoặc tên khách
 */
function searchSpecificOrderInBrain_(brain, rawQuery) {
  if (!rawQuery || !brain || !brain.orders) return null;
  var cleanQ = String(rawQuery).replace(/([a-zA-Z0-9])\s+([a-zA-Z0-9])\b/g, '$1$2').replace(/([a-zA-Z0-9])\s+([a-zA-Z0-9])\b/g, '$1$2');
  var tokens = (cleanQ.match(/[a-zA-Z0-9]{3,25}/g) || []).map(function (t) { return t.toUpperCase(); });
  var stopWords = { 'DON': 1, 'HANG': 1, 'KHAU': 1, 'BAN': 1, 'TIM': 1, 'KIEM': 1, 'TRA': 1, 'XEM': 1, 'CHO': 1, 'NAO': 1, 'TIEN': 1, 'DUONG': 1, 'TAM': 1, 'HOM': 1, 'NAY': 1, 'XONG': 1, 'NHAN': 1, 'CHUA': 1, 'LAM': 1, 'GIA': 1, 'DONG': 1, 'GOI': 1, 'SHOP': 1, 'CUA': 1, 'NGUYEN': 1 };
  var filteredTokens = tokens.filter(function (t) { return !stopWords[t] && (!/^\d+$/.test(t) || t.length >= 4); });
  if (filteredTokens.length === 0 && tokens.length > 0) {
    filteredTokens = tokens.filter(function (t) { return !stopWords[t]; });
  }
  if (filteredTokens.length === 0) return null;

  var o = brain.orders || {};
  var p = brain.production || {};
  var allOrders = [].concat(o.todayOrdersList || [], o.recentOrders || [], o.exportOrders || []);
  var matchedOrder = null;
  var matchedToken = '';

  for (var i = 0; i < allOrders.length; i++) {
    var ord = allOrders[i];
    var code = String(ord.code || '').toUpperCase();
    var cust = String(ord.customer || '').toUpperCase();
    for (var k = 0; k < filteredTokens.length; k++) {
      var tok = filteredTokens[k];
      if (code.endsWith(tok) || code.indexOf(tok) !== -1 || cust.indexOf(tok) !== -1) {
        matchedOrder = ord;
        matchedToken = tok;
        break;
      }
    }
    if (matchedOrder) break;
  }

  if (!matchedOrder) return null;

  var ordCode = String(matchedOrder.code || '');
  var ordId = String(matchedOrder.id || '');
  var matchedProd = null;
  var pendingProds = p.pendingItems || [];
  for (var pi = 0; pi < pendingProds.length; pi++) {
    var pr = pendingProds[pi];
    var pOrdId = String(pr.orderId || '');
    if ((ordId && pOrdId === ordId) || (ordCode && pOrdId === ordCode) || (matchedToken && pOrdId.toUpperCase().indexOf(matchedToken) !== -1)) {
      matchedProd = pr;
      break;
    }
  }

  var mainOrdCode = ordCode.split('|')[0].trim();
  var suffix = mainOrdCode.length >= 4 ? mainOrdCode.slice(-4) : (matchedToken || mainOrdCode);
  var ch = matchedOrder.channel || 'Sàn';
  var custName = matchedOrder.customer || 'Khách';
  var statusText = matchedOrder.status || 'Chờ Sản Xuất';

  var speech = 'Dạ Sếp Tiến, đơn đuôi ' + suffix + ' là đơn ' + ch + ' của khách ' + custName + '.';
  if (matchedProd) {
    var p1Info = matchedProd.p1_status === 'Done' ? ('Khâu 1 đã xong bởi ' + (matchedProd.p1_user || 'thợ')) : (matchedProd.p1_user ? ('Khâu 1 đang làm bởi ' + matchedProd.p1_user) : 'Khâu 1 chưa có ai nhận');
    var p2Info = matchedProd.p2_status === 'Done' ? ('Khâu 2 đã xong bởi ' + (matchedProd.p2_user || 'thợ')) : (matchedProd.p2_user ? ('Khâu 2 đang làm bởi ' + matchedProd.p2_user) : 'Khâu 2 chưa bắt đầu');
    speech += ' Sản phẩm: ' + matchedProd.name + '. Tiến độ: ' + p1Info + ', ' + p2Info + '.';
    if (matchedProd.p1_status !== 'Done' && !matchedProd.p1_user) {
      speech += ' Sếp hoặc anh Dương có muốn nhận làm khâu 1 đơn này luôn không ạ?';
    }
  } else {
    speech += ' Trạng thái đơn hiện tại là ' + statusText + ', không phát sinh lệnh sản xuất thô.';
  }

  var detail = '=== [KẾT QUẢ TÌM KIẾM ĐƠN HÀNG: ' + ordCode + '] ===\n' +
    '- Kênh: ' + ch + ' | Khách hàng: ' + custName + ' | Trạng thái: ' + statusText + '\n' +
    '- Doanh thu: ' + fmtMoneyVoice_(matchedOrder.revenue) + ' | COD: ' + fmtMoneyVoice_(matchedOrder.cod) + '\n' +
    '- Phụ kiện/Sản phẩm: ' + (matchedOrder.accessories || 'Không có') + '\n' +
    (matchedProd ? ('- Lệnh SX [' + matchedProd.orderId + ']: ' + matchedProd.name + ' | Khâu 1: ' + matchedProd.p1_status + ' (' + (matchedProd.p1_user || 'Chưa nhận') + ') | Khâu 2: ' + matchedProd.p2_status + ' (' + (matchedProd.p2_user || 'Chưa nhận') + ')') : '- Không có lệnh sản xuất pending');

  return { speech: speech, detail: detail, order: matchedOrder, prod: matchedProd };
}

/**
 * Xử lý hành động sản xuất qua giọng nói (Voice Production Action) bọc LockService an toàn tuyệt đối
 */
function handleVoiceProductionAction_(params) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    params = params || {};
    var ss = getRfBotMasterSpreadsheet_();
    var tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
    var nowStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');

    var orderToken = String(params.orderToken || params.code || params.orderCode || '').toUpperCase().trim();
    var actionType = String(params.actionType || params.action || '').toLowerCase().trim();
    var workerName = String(params.workerName || params.user || '').trim();

    if (/duong/i.test(workerName) || !workerName) workerName = 'Nguyễn Hoàng Dương';
    else if (/quang\s*anh|anh/i.test(workerName)) workerName = 'Hà Quang Anh';
    else if (/tien|sep/i.test(workerName)) workerName = 'Nguyễn Ngọc Tiến';
    else if (/huong/i.test(workerName)) workerName = 'Nguyễn Thị Diệu Hương';
    else if (/trang/i.test(workerName)) workerName = 'Nguyễn Thị Huyền Trang';

    var ordersSheet = ss.getSheetByName('Orders');
    var prodSheet = ss.getSheetByName('Production');
    var logSheet = ss.getSheetByName('Tracking_Log');

    if (!prodSheet || !ordersSheet) {
      return { success: false, speech_text: 'Dạ, không tìm thấy bảng Orders hoặc Production trong hệ thống.' };
    }

    var ordersData = ordersSheet.getDataRange().getDisplayValues();
    var ordersHeaders = ordersData[0] || [];
    var oIdIdx = ordersHeaders.indexOf('id');
    var oCodeIdx = ordersHeaders.indexOf('orderCode');
    var oStatusIdx = ordersHeaders.indexOf('status');
    var oCustIdx = ordersHeaders.indexOf('customer');
    var oAccIdx = ordersHeaders.indexOf('accessories');

    var matchedOrderRow = -1;
    var targetOrderId = '';
    var targetOrderCode = '';
    var targetCustomer = '';
    var targetAcc = '';

    for (var i = 1; i < ordersData.length; i++) {
      var row = ordersData[i];
      var cId = String(row[oIdIdx] || '').trim();
      var cCode = String(row[oCodeIdx] || '').trim();
      if ((orderToken && (cCode.toUpperCase().indexOf(orderToken) !== -1 || cId.toUpperCase().indexOf(orderToken) !== -1)) ||
          (orderToken && cCode.toUpperCase().endsWith(orderToken))) {
        matchedOrderRow = i + 1;
        targetOrderId = cId;
        targetOrderCode = cCode;
        targetCustomer = String(row[oCustIdx] || '').trim();
        targetAcc = String(row[oAccIdx] || '');
        break;
      }
    }

    var prodData = prodSheet.getDataRange().getDisplayValues();
    var prodHeaders = prodData[0] || [];
    var pIdIdx = prodHeaders.indexOf('id');
    var pOrderIdIdx = prodHeaders.indexOf('orderId');
    var pNameIdx = prodHeaders.indexOf('name');
    var pStatusIdx = prodHeaders.indexOf('status');
    var p1UserIdx = prodHeaders.indexOf('p1_user');
    var p1StatusIdx = prodHeaders.indexOf('p1_status');
    var p1StartIdx = prodHeaders.indexOf('p1_start');
    var p1EndIdx = prodHeaders.indexOf('p1_endTime');
    var p2UserIdx = prodHeaders.indexOf('p2_user');
    var p2StatusIdx = prodHeaders.indexOf('p2_status');
    var p2StartIdx = prodHeaders.indexOf('p2_start');
    var p2EndIdx = prodHeaders.indexOf('p2_endTime');

    var matchedProdRow = -1;
    var prodName = '';

    for (var p = 1; p < prodData.length; p++) {
      var pRow = prodData[p];
      var pOrderId = String(pRow[pOrderIdIdx] || '').trim();
      if ((targetOrderId && pOrderId === targetOrderId) ||
          (targetOrderCode && pOrderId === targetOrderCode) ||
          (orderToken && pOrderId.toUpperCase().indexOf(orderToken) !== -1)) {
        matchedProdRow = p + 1;
        prodName = String(pRow[pNameIdx] || '');
        break;
      }
    }

    // Nếu chưa tìm thấy theo ID, tìm theo tên sản phẩm / mẫu layout bù kho (ví dụ: Cuội ver 2, Hang Động 4, HAN004, STD002)
    if (matchedProdRow === -1 && orderToken) {
      var tokenNorm = normVN_(orderToken);
      for (var p2 = 1; p2 < prodData.length; p2++) {
        var pRow2 = prodData[p2];
        var pNameNorm = normVN_(String(pRow2[pNameIdx] || ''));
        var pNoteNorm = normVN_(String(pRow2[prodHeaders.indexOf('note')] || ''));
        if (pNameNorm.indexOf(tokenNorm) !== -1 || (tokenNorm.length >= 4 && (pNameNorm + ' ' + pNoteNorm).indexOf(tokenNorm) !== -1)) {
          matchedProdRow = p2 + 1;
          prodName = String(pRow2[pNameIdx] || '');
          targetOrderId = String(pRow2[pOrderIdIdx] || '');
          break;
        }
      }
    }

    var speechMsg = '';
    var actionLogDesc = '';

    var rawActionText = (actionType + ' ' + (params.query || '')).toLowerCase();
    var isPacking = /dong_goi|dong goi|hoan_thanh_dong_goi|boc_hang|packing|cho ban giao/.test(rawActionText);
    var isHandover = /ban_giao|ban giao|cho_kho|cho kho|handover|da_ban_giao|da ban giao/.test(rawActionText);
    var isAssignK1 = /assign_phase_1|nhan_k1|nhan_khau_1|nhan k1|nhan khau 1|dang san xuat/.test(rawActionText);
    var isDoneK1 = /complete_phase_1|xong_k1|xong_khau_1|hoan_thanh_k1|xong k1|xong khau 1/.test(rawActionText);
    var isAssignK2 = /assign_phase_2|nhan_k2|nhan_khau_2|nhan k2|nhan khau 2/.test(rawActionText);
    var isDoneK2 = /complete_phase_2|xong_k2|xong_khau_2|hoan_thanh_k2|xong k2|xong khau 2|san sang dong goi/.test(rawActionText);

    var mainCode = (targetOrderCode || orderToken).split('|')[0].trim();
    var suffix = mainCode.length >= 4 ? mainCode.slice(-4) : (orderToken || mainCode);
    if (matchedProdRow !== -1 && !targetOrderCode) {
      suffix = prodName.replace(/-\s*\d+x\d+.*$/i, '').trim();
    }

    // 1. XỬ LÝ HOÀN THÀNH ĐÓNG GÓI
    if (isPacking) {
      var packSheet = ss.getSheetByName('Packings');
      var packWorker = /huong/i.test(workerName) || !workerName ? 'Nguyễn Thị Diệu Hương' : workerName;
      if (packSheet) {
        var packData = packSheet.getDataRange().getValues();
        var pkHeaders = packData[0] || [];
        var pkOrdIdx = pkHeaders.indexOf('orderId');
        var pkStIdx = pkHeaders.indexOf('status');
        var pkEndIdx = pkHeaders.indexOf('endTime');
        var pkUserIdx = pkHeaders.indexOf('user');
        var matchedPkRow = -1;

        for (var k = 1; k < packData.length; k++) {
          var pkOId = String(packData[k][pkOrdIdx] || '').trim();
          if ((targetOrderId && pkOId === targetOrderId) || (targetOrderCode && pkOId === targetOrderCode) || (orderToken && pkOId.indexOf(orderToken) !== -1)) {
            matchedPkRow = k + 1;
            break;
          }
        }

        if (matchedPkRow !== -1) {
          if (pkStIdx !== -1) packSheet.getRange(matchedPkRow, pkStIdx + 1).setValue('Done');
          if (pkEndIdx !== -1) packSheet.getRange(matchedPkRow, pkEndIdx + 1).setValue(nowStr);
          if (pkUserIdx !== -1) packSheet.getRange(matchedPkRow, pkUserIdx + 1).setValue(packWorker);
        } else {
          packSheet.appendRow(['PK_' + new Date().getTime(), targetOrderId || targetOrderCode || orderToken, packWorker, nowStr, nowStr, nowStr, 'Done', '', 0, '']);
        }
      }

      if (matchedOrderRow !== -1 && oStatusIdx !== -1) {
        ordersSheet.getRange(matchedOrderRow, oStatusIdx + 1).setValue('Chờ Bàn Giao');
        speechMsg = 'Dạ, đã ghi nhận Diệu Hương hoàn thành đóng gói đơn đuôi ' + suffix + ' thành công! Đơn đã chuyển sang trạng thái Chờ Bàn Giao kho.';
        actionLogDesc = 'Hoàn thành đóng gói đơn ' + suffix;
      } else {
        return {
          success: false,
          speech_text: 'Dạ Sếp, em chưa tìm thấy đơn hàng có mã đuôi ' + (orderToken || 'này') + ' trên hệ thống để đóng gói ạ.'
        };
      }
    }

    // 2. XỬ LÝ BÀN GIAO / CHỞ KHO
    else if (isHandover) {
      var isAll = /all|tat ca|toan bo|het/i.test(orderToken + ' ' + (params.query || ''));
      var oCarriedIdx = ordersHeaders.indexOf('isCarriedToWH');

      if (isAll || (!orderToken && matchedOrderRow === -1)) {
        var bulkUpdated = 0;
        var tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
        var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
        for (var b = 1; b < ordersData.length; b++) {
          var bRow = ordersData[b];
          var bDate = String(bRow[ordersHeaders.indexOf('date')] || bRow[ordersHeaders.indexOf('createdAt')] || '').slice(0, 10);
          var bStatus = String(bRow[oStatusIdx] || '').trim();
          if (bDate === todayStr && bStatus !== 'Đã Bàn Giao' && bStatus !== 'Đơn Huỷ' && bStatus !== 'Hàng Hoàn') {
            if (oStatusIdx !== -1) ordersSheet.getRange(b + 1, oStatusIdx + 1).setValue('Đã Bàn Giao');
            if (oCarriedIdx !== -1) ordersSheet.getRange(b + 1, oCarriedIdx + 1).setValue(true);
            bulkUpdated++;
          }
        }
        if (bulkUpdated > 0) {
          speechMsg = 'Dạ tuyệt vời! Đã ghi nhận bàn giao toàn bộ ' + bulkUpdated + ' đơn hàng hôm nay chở về kho thành công!';
          actionLogDesc = 'Bàn giao tất cả ' + bulkUpdated + ' đơn';
        } else {
          return { success: false, speech_text: 'Dạ Sếp, hôm nay các đơn đều đã bàn giao hết rồi, không còn đơn nào chờ chở kho ạ.' };
        }
      } else {
        if (matchedOrderRow === -1) {
          return {
            success: false,
            speech_text: 'Dạ Sếp, em chưa tìm thấy đơn hàng có mã đuôi ' + (orderToken || 'này') + ' trên hệ thống để bàn giao ạ. Sếp đọc lại giúp em 3-4 số cuối nhé!'
          };
        }
        if (oStatusIdx !== -1) ordersSheet.getRange(matchedOrderRow, oStatusIdx + 1).setValue('Đã Bàn Giao');
        if (oCarriedIdx !== -1) ordersSheet.getRange(matchedOrderRow, oCarriedIdx + 1).setValue(true);
        speechMsg = 'Dạ, đã ghi nhận bàn giao đơn đuôi ' + suffix + ' chở về kho thành công! Đơn đã hoàn tất quy trình tại xưởng.';
        actionLogDesc = 'Bàn giao chở kho đơn ' + suffix;
      }
    }

    // 3. XỬ LÝ CÁC KHÂU SẢN XUẤT 1 & 2
    else if (isAssignK1) {
      if (matchedProdRow === -1) return { success: false, speech_text: 'Dạ, chưa tìm thấy lệnh sản xuất cho mẫu ' + orderToken + ' ạ.' };
      if (p1UserIdx !== -1) prodSheet.getRange(matchedProdRow, p1UserIdx + 1).setValue(workerName);
      if (p1StatusIdx !== -1) prodSheet.getRange(matchedProdRow, p1StatusIdx + 1).setValue('In Progress');
      if (p1StartIdx !== -1) prodSheet.getRange(matchedProdRow, p1StartIdx + 1).setValue(nowStr);
      if (pStatusIdx !== -1) prodSheet.getRange(matchedProdRow, pStatusIdx + 1).setValue('In Progress');
      if (matchedOrderRow !== -1 && oStatusIdx !== -1) {
        var currOrdSt = String(ordersData[matchedOrderRow - 1][oStatusIdx] || '');
        if (currOrdSt === 'Chờ Sản Xuất') {
          ordersSheet.getRange(matchedOrderRow, oStatusIdx + 1).setValue('Đang Sản Xuất');
        }
      }
      speechMsg = 'Dạ, đã ghi nhận ' + workerName + ' nhận làm Khâu 1 cho ' + prodName + ' thành công trên app xưởng!';
      actionLogDesc = 'Nhận làm Khâu 1';
    } else if (isDoneK1) {
      if (matchedProdRow === -1) return { success: false, speech_text: 'Dạ, chưa tìm thấy lệnh sản xuất cho mẫu ' + orderToken + ' ạ.' };
      if (p1StatusIdx !== -1) prodSheet.getRange(matchedProdRow, p1StatusIdx + 1).setValue('Done');
      if (p1EndIdx !== -1) prodSheet.getRange(matchedProdRow, p1EndIdx + 1).setValue(nowStr);
      if (p1UserIdx !== -1 && !prodData[matchedProdRow - 1][p1UserIdx]) {
        prodSheet.getRange(matchedProdRow, p1UserIdx + 1).setValue(workerName);
      }
      speechMsg = 'Dạ tuyệt vời! Đã hoàn thành Khâu 1 ' + prodName + ' cho ' + workerName + '. Lệnh đã chuyển sang Khâu 2 gia cố cho thợ tiếp theo rồi ạ!';
      actionLogDesc = 'Hoàn thành Khâu 1';
    } else if (isAssignK2) {
      if (matchedProdRow === -1) return { success: false, speech_text: 'Dạ, chưa tìm thấy lệnh sản xuất cho mẫu ' + orderToken + ' ạ.' };
      if (p2UserIdx !== -1) prodSheet.getRange(matchedProdRow, p2UserIdx + 1).setValue(workerName);
      if (p2StatusIdx !== -1) prodSheet.getRange(matchedProdRow, p2StatusIdx + 1).setValue('In Progress');
      if (p2StartIdx !== -1) prodSheet.getRange(matchedProdRow, p2StartIdx + 1).setValue(nowStr);
      speechMsg = 'Dạ, đã ghi nhận ' + workerName + ' nhận làm Khâu 2 gia cố cho ' + prodName + ' thành công!';
      actionLogDesc = 'Nhận làm Khâu 2';
    } else if (isDoneK2) {
      if (matchedProdRow === -1) return { success: false, speech_text: 'Dạ, chưa tìm thấy lệnh sản xuất cho mẫu ' + orderToken + ' ạ.' };
      if (p2StatusIdx !== -1) prodSheet.getRange(matchedProdRow, p2StatusIdx + 1).setValue('Done');
      if (p2EndIdx !== -1) prodSheet.getRange(matchedProdRow, p2EndIdx + 1).setValue(nowStr);
      if (p2UserIdx !== -1 && !prodData[matchedProdRow - 1][p2UserIdx]) {
        prodSheet.getRange(matchedProdRow, p2UserIdx + 1).setValue(workerName);
      }
      if (pStatusIdx !== -1) prodSheet.getRange(matchedProdRow, pStatusIdx + 1).setValue('Done');
      // CHỐT CHẶN QC: Không tự ý chuyển Sẵn Sàng Đóng Gói khi chưa đạt QC
      if (targetOrderId && typeof _checkAndAutoForwardOrder_Core === 'function') {
        var fwdRes = _checkAndAutoForwardOrder_Core(targetOrderId, ss);
        if (fwdRes && fwdRes.forwarded) {
          speechMsg = 'Dạ xuất sắc! Đã hoàn thành Khâu 2 cho ' + prodName + '. Đơn hàng đã đủ điều kiện và chuyển sang Sẵn Sàng Đóng Gói!';
        } else {
          speechMsg = 'Dạ xuất sắc! Đã hoàn thành Khâu 2 cho ' + prodName + '. Lệnh đã hoàn tất khâu sản xuất và đang chờ duyệt QC!';
        }
      } else {
        speechMsg = 'Dạ xuất sắc! Đã hoàn thành Khâu 2 cho ' + prodName + '. Lệnh đã hoàn tất khâu sản xuất và đang chờ duyệt QC!';
      }
      actionLogDesc = 'Hoàn thành Khâu 2';
    } else {
      speechMsg = 'Dạ, em chưa nhận diện được hành động sản xuất cần thực hiện cho đơn này ạ.';
      return { success: false, speech_text: speechMsg };
    }

    if (logSheet) {
      logSheet.appendRow([
        nowStr,
        workerName,
        actionLogDesc + ' đơn ' + (targetOrderCode || orderToken),
        'RF Bot Voice Control',
        'Sản phẩm: ' + prodName + ' | OrderId: ' + targetOrderId
      ]);
    }

    return {
      success: true,
      speech_text: speechMsg,
      orderCode: targetOrderCode,
      orderId: targetOrderId,
      productName: prodName,
      workerName: workerName,
      action: actionLogDesc,
      updatedAt: nowStr
    };

  } catch (err) {
    console.error('Lỗi handleVoiceProductionAction_:', err);
    return {
      success: false,
      speech_text: 'Dạ xin lỗi sếp, xảy ra lỗi khi cập nhật sản xuất: ' + err.message,
      error: err.toString()
    };
  } finally {
    try { lock.releaseLock(); } catch (e) { }
  }
}

/**
 * Endpoint điều phối truy vấn cho RF Bot
 */
function handleRfBotApiRequest_(params) {
  try {
    params = params || {};
    // Điều phối hành động sản xuất bằng giọng nói
    if (params.action === 'rfBotVoiceProductionAction' || params.action === 'voiceProductionAction' || params.actionType) {
      return handleVoiceProductionAction_(params);
    }

    var ss = getRfBotMasterSpreadsheet_();
    var tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
    var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var targetDate = params.date ? String(params.date).trim().slice(0, 10) : todayStr;
    var rawQuery = String(params.query || '').trim();
    var reqType = String(params.type || 'all').trim().toLowerCase();

    var brain = buildRfFullBrainSnapshot_(ss, targetDate);

    // Nếu bridge yêu cầu full_brain để đồng bộ RAM tốc độ cao
    if (reqType === 'full_brain') {
      var genSynth = synthesizeAnswerFromBrain_(brain, rawQuery || 'tổng quan', 'all');
      return {
        code: 0,
        msg: 'success',
        success: true,
        targetDate: targetDate,
        speech_text: genSynth.speech_text,
        full_context: genSynth.full_context,
        brain: brain,
        timestamp: brain.generatedAt
      };
    }

    var synth = synthesizeAnswerFromBrain_(brain, rawQuery, reqType);

    return {
      code: 0,
      msg: 'success',
      success: true,
      query: rawQuery,
      targetDate: targetDate,
      speech_text: synth.speech_text,
      voice_response: synth.speech_text,
      summary: synth.speech_text,
      full_context: synth.full_context,
      data: {
        "Báo cáo tổng hợp": synth.speech_text,
        "Chi tiết dữ liệu 23 bảng": synth.full_context
      },
      brain: brain,
      timestamp: brain.generatedAt
    };

  } catch (err) {
    console.error('Lỗi handleRfBotApiRequest_:', err);
    return {
      success: false,
      speech_text: 'Dạ xin lỗi sếp, hệ thống gặp lỗi khi truy vấn dữ liệu: ' + err.message,
      error: err.toString()
    };
  }
}

/**
 * Endpoint xử lý giao thức chuẩn MCP (Model Context Protocol JSON-RPC 2.0)
 */
function handleRfBotMcpRequest_(payload) {
  try {
    payload = payload || {};
    var id = payload.id !== undefined ? payload.id : 1;
    var method = String(payload.method || '').trim();

    if (method === 'ping') {
      return { jsonrpc: '2.0', id: id, result: {} };
    }

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'RF_Workspace_Pro_MCP', version: '2.0.0' }
        }
      };
    }

    if (method === 'notifications/initialized') {
      return { jsonrpc: '2.0', id: id, result: {} };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: id,
        result: {
          tools: [
            {
              name: 'rf_workspace_query',
              description: 'Tra cứu toàn bộ 23 bảng CSDL thời gian thực của xưởng Rich Fish Aquarium (RF Workspace Pro): Đơn hàng (số đơn, doanh thu, đơn xuất khẩu Shopee SG, đơn chờ bàn giao), Sản xuất & Đóng gói (khâu 1, khâu 2, QC, hạn chót), Kho hàng & Vật tư (tồn kho, giá vốn, cảnh báo sắp hết hàng, phiếu xuất nhập kho, định mức BOM), Tài chính & Thu chi (dòng tiền thu chi, số dư các tài khoản ngân hàng, công nợ nhà cung cấp, đề nghị hoàn ứng, báo cáo lợi nhuận), Nhân sự & Lương (chấm công, bảng lương chi tiết, thưởng phạt, KPI, CTV).',
              inputSchema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Nội dung câu hỏi chi tiết của người dùng'
                  },
                  type: {
                    type: 'string',
                    enum: ['all', 'orders', 'production', 'packing', 'inventory', 'finance', 'attendance', 'salary', 'kpi'],
                    description: 'Phân loại dữ liệu cần tra cứu: all (toàn bộ), orders (đơn hàng), production (sản xuất), packing (đóng gói), inventory (kho hàng/tồn kho/xuất nhập), finance (thu chi/số dư quỹ/công nợ NCC/hoàn ứng/lợi nhuận), attendance (điểm danh chấm công), salary (bảng lương/thưởng phạt), kpi (KPI nhân sự)'
                  }
                }
              }
            }
          ]
        }
      };
    }

    if (method === 'tools/call') {
      var params = payload.params || {};
      var args = params.arguments || {};
      var queryRes = handleRfBotApiRequest_(args);
      return {
        jsonrpc: '2.0',
        id: id,
        result: {
          content: [
            {
              type: 'text',
              text: queryRes.full_context || queryRes.speech_text || 'Đã tra cứu dữ liệu xưởng thành công.'
            }
          ],
          data: queryRes.data,
          isError: !queryRes.success
        }
      };
    }

    return {
      jsonrpc: '2.0',
      id: id,
      error: { code: -32601, message: 'Method not supported: ' + method }
    };
  } catch (mcpErr) {
    return {
      jsonrpc: '2.0',
      id: payload && payload.id !== undefined ? payload.id : null,
      error: { code: -32603, message: 'Internal MCP Error: ' + mcpErr.message }
    };
  }
}
