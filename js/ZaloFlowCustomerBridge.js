/** Scoped ZaloFlow connector. Appends metadata columns; never edits legacy cells. */
var ZF_CUSTOMER_COLUMNS = ['zfAccountUid','zfThreadId','zfCasesJson','zfUpdatedAt'];
var ZF_CUSTOMER_TOKEN_HASH = '703abb84610794783995c1c86b695342fde74d0a50a77765545c8ad29f622bc8';

function zfCustomerAuthorized_(token) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token || ''), Utilities.Charset.UTF_8);
  var hex = digest.map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  return hex === ZF_CUSTOMER_TOKEN_HASH;
}
function zfCustomerPhone_(value) {
  return String(value || '').replace(/[^0-9]/g,'').replace(/^84(?=\d{9}$)/,'0');
}
function zfCustomerInitialize_() {
  var sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders');
  if(!sheet)return {success:false,error:'ORDERS_NOT_FOUND'};
  var lock=LockService.getScriptLock();if(!lock.tryLock(15000))return {success:false,error:'BUSY'};
  try {
    var range=sheet.getDataRange(), values=range.getValues(), formulas=range.getFormulas();
    var width=values[0].length, height=values.length;
    var missing=ZF_CUSTOMER_COLUMNS.filter(function(k){return values[0].indexOf(k)<0;});
    if(missing.length){
      if(width+missing.length>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),width+missing.length-sheet.getMaxColumns());
      sheet.getRange(1,width+1,1,missing.length).setValues([missing]);
    }
    var after=sheet.getRange(1,1,height,width);
    return {success:true,addedColumns:missing,legacyUnchanged:JSON.stringify(values)===JSON.stringify(after.getValues()) && JSON.stringify(formulas)===JSON.stringify(after.getFormulas())};
  }finally{lock.releaseLock();}
}
function zfCustomerHandle_(payload) {
  if (!zfCustomerAuthorized_(payload.token)) return {success:false,error:'UNAUTHORIZED'};
  var action = payload.action;
  if (action === 'zaloFlowCustomerStatus') return {success:true,version:'1',scope:'Orders metadata columns only'};
  if (action === 'zaloFlowCustomerInitialize') return zfCustomerInitialize_();
  var record = payload.record || {};
  var facts = record.facts || {};
  var phone = zfCustomerPhone_(facts.customer && facts.customer.phone);
  var reference = String(facts.orderReference || '').trim();
  if (!phone && !reference) return {success:false,error:'NEEDS_ORDER_REFERENCE'};
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders');
  if (!sheet) return {success:false,error:'ORDERS_NOT_FOUND'};
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return {success:false,error:'BUSY'};
  try {
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idx = function(name) {return headers.indexOf(name);};
    if (idx('id') < 0 || idx('phone') < 0) return {success:false,error:'SCHEMA_MISMATCH'};
    var matches = [];
    for (var r=1; r<data.length; r++) {
      var sameRef = reference && (String(data[r][idx('id')]) === reference || (idx('orderCode') >= 0 && String(data[r][idx('orderCode')]) === reference));
      var samePhone = phone && zfCustomerPhone_(data[r][idx('phone')]) === phone;
      if (reference ? (sameRef && (!phone || samePhone)) : samePhone) matches.push(r);
    }
    if (matches.length !== 1) return {success:false,error:matches.length ? 'AMBIGUOUS_ORDER' : 'ORDER_NOT_FOUND'};
    var row = matches[0];
    if (action === 'zaloFlowCustomerLookup') {
      var result = {};
      ['id','orderCode','status','customer','phone','address','revenue','prePaid','shippingMethod'].forEach(function(k) { if(idx(k)>=0) result[k]=data[row][idx(k)]; });
      return {success:true,order:result};
    }
    if (action !== 'zaloFlowCaseUpsert') return {success:false,error:'UNKNOWN_ACTION'};
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(String(record.id || '')) || !['sale','warranty'].includes(record.kind) || !record.accountUid || !record.threadId) return {success:false,error:'INVALID_CASE'};
    var serialized = JSON.stringify({id:record.id,kind:record.kind,status:'received',facts:facts});
    if (serialized.length > 20000) return {success:false,error:'CASE_TOO_LARGE'};
    // Add only missing columns to the right; do not rewrite schema or existing headers.
    var missing = ZF_CUSTOMER_COLUMNS.filter(function(k) {return idx(k)<0;});
    if (missing.length) {
      var start = sheet.getLastColumn()+1;
      if (start+missing.length-1 > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), start+missing.length-1-sheet.getMaxColumns());
      sheet.getRange(1,start,1,missing.length).setValues([missing]);
      headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    }
    var current = data[row][idx('zfCasesJson')];
    var cases = current ? JSON.parse(String(current)) : [];
    if (!Array.isArray(cases)) return {success:false,error:'INVALID_EXISTING_METADATA'};
    cases = cases.filter(function(c) {return c.id!==record.id;});
    cases.push(JSON.parse(serialized));
    if (JSON.stringify(cases).length > 45000) return {success:false,error:'METADATA_LIMIT'};
    // Four individual writes intentionally avoid touching legacy cells or formulas.
    sheet.getRange(row+1,idx('zfAccountUid')+1).setValue(String(record.accountUid));
    sheet.getRange(row+1,idx('zfThreadId')+1).setValue(String(record.threadId));
    sheet.getRange(row+1,idx('zfCasesJson')+1).setValue(JSON.stringify(cases));
    sheet.getRange(row+1,idx('zfUpdatedAt')+1).setValue(new Date().toISOString());
    return {success:true,orderId:String(data[row][idx('id')]),caseId:record.id,status:'received'};
  } finally {lock.releaseLock();}
}
