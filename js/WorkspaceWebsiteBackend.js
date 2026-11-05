/** Dedicated website sheets in the existing RF Workspace. Public requests never write. */
function rfWebsiteOrigin_(){return 'https://client-beta-six-70u250c6ff.vercel.app';}
function rfWebsiteValidate_(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Nội dung không hợp lệ.');
 var result;
 function text(v,max){if(typeof v!=='string'||v.length>max)throw new Error('Nội dung vượt giới hạn.');return v;}
 function image(v){
  if(typeof v!=='string'||v.indexOf('..')!==-1)throw new Error('Ảnh không hợp lệ.');
  if(v!==''&&!/^\/(images|uploads|api\/image)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(v)&&!/^https:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/[^\s<>"']*)?$/.test(v))throw new Error('Ảnh không hợp lệ.');
  return v;
 }
 if(value.kind==='page'){
  if(value.id!=='home'||!Array.isArray(value.blocks)||value.blocks.length!==8)throw new Error('Trang chủ không hợp lệ.');
  var schema={hero:['title','text','caption','image'],brand:['image'],studio:['title','text'],collection:['title','image'],creatures:['title','text','image'],crafted:['title','text','image'],journal:['title'],closing:['title','text']};
  result={kind:'page',id:'home',name:'Trang chủ',blocks:Object.keys(schema).map(function(id){var matches=value.blocks.filter(function(b){return b&&b.id===id;});if(matches.length!==1)throw new Error('Thiếu hoặc trùng khối nội dung.');var source=matches[0],block={id:id,visible:source.visible!==false};schema[id].forEach(function(key){block[key]=key==='image'?image(source[key]||''):text(source[key]||'',key==='text'?10000:500);});return block;})};
 }else if(value.kind==='post'){
  if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(value.id))throw new Error('Mã bài viết không hợp lệ.');
  var title=text(value.title,300).trim();if(!title)throw new Error('Nhập tiêu đề bài viết.');
  result={kind:'post',id:value.id,title:title,name:title,description:text(value.description||'',1000),body:text(value.body||'',35000),image:image(value.image||'')};
 }else if(value.kind==='product'){
  if(!value.id||typeof value.id!=='string')throw new Error('Mã sản phẩm không hợp lệ.');
  var pName=text(value.name||value.title||'',300).trim();if(!pName)throw new Error('Nhập tên sản phẩm.');
  var pSku=text(value.sku||'',100).trim();
  var pCat=text(value.category||'Khác',100).trim();
  var pSubCat=text(value.sub_category||'',100).trim();
  var pDesc=text(value.description||'',10000);
  var pImg=image(value.image||'');
  var pThumb=image(value.thumbnail||pImg);
  var pPrice=value.price==null||value.price===''||isNaN(Number(value.price))?null:Number(value.price);
  var pPublic=value.isPublic!==false;
  result={kind:'product',id:value.id,name:pName,title:pName,sku:pSku,category:pCat,sub_category:pSubCat,description:pDesc,image:pImg,thumbnail:pThumb,price:pPrice,isPublic:pPublic};
 }else throw new Error('Loại nội dung không hợp lệ.');
 if(JSON.stringify(result).length>45000)throw new Error('Nội dung quá dài cho một bản lưu.');return result;
}
function rfWebsiteSheet_(create){
 var ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss)throw new Error('Không tìm thấy bảng tính Workspace.');
 var expected=['id','kind','draft','published','revision','published_revision','updated_at','published_at'];
 var sheet=ss.getSheetByName('WebsiteContent');if(!sheet&&create){sheet=ss.insertSheet('WebsiteContent');sheet.appendRow(expected);sheet.setFrozenRows(1);}
 if(sheet&&JSON.stringify(sheet.getRange(1,1,1,8).getValues()[0])!==JSON.stringify(expected))throw new Error('Cấu trúc WebsiteContent không khớp. Không thay đổi dữ liệu.');
 if(sheet&&create&&sheet.getLastRow()===1){
  var now=new Date().toISOString();
  var seeds=rfWebsiteSeedDocuments_().map(function(d){var valid=rfWebsiteValidate_(d),json=JSON.stringify(valid);return [valid.id,valid.kind,json,json,1,1,now,now];});
  if(typeof rfWebsiteSeedProducts_==='function'){
   var prodSeeds=rfWebsiteSeedProducts_().map(function(p){var valid=rfWebsiteValidate_(p),json=JSON.stringify(valid);return [valid.id,valid.kind,json,json,1,1,now,now];});
   seeds=seeds.concat(prodSeeds);
  }
  sheet.getRange(2,1,seeds.length,8).setValues(seeds);
 }
 return sheet;
}
function rfWebsiteRows_(sheet){if(!sheet||sheet.getLastRow()<2)return [];return sheet.getRange(2,1,sheet.getLastRow()-1,8).getValues().map(function(row,index){return {row:index+2,values:row,id:String(row[0]),kind:String(row[1]),draft:JSON.parse(row[2]),published:row[3]?JSON.parse(row[3]):null,revision:Number(row[4]),published_revision:Number(row[5]),updated_at:String(row[6]),published_at:String(row[7])};});}
function rfWebsiteHistory_(ss,id,revision,action,actor,content){var history=ss.getSheetByName('WebsiteContentHistory');if(!history){history=ss.insertSheet('WebsiteContentHistory');history.appendRow(['document_id','revision','action','actor','at','content']);history.setFrozenRows(1);}history.appendRow([id,revision,action,actor,new Date().toISOString(),JSON.stringify(content)]);}

function rfWebsiteGetPublicProducts_(){
 try{
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sheet=ss?ss.getSheetByName('WebsiteContent'):null;
  var rows=sheet?rfWebsiteRows_(sheet):[];
  var publishedMap={};
  rows.filter(function(r){return r.published&&r.kind==='product';}).forEach(function(r){publishedMap[r.id]=r.published;});
  var baseProducts=[];
  if(Object.keys(publishedMap).length>0){
   baseProducts=Object.values(publishedMap);
  }else if(typeof rfWebsiteSeedProducts_==='function'){
   baseProducts=rfWebsiteSeedProducts_();
  }
  var prodMap={};
  if(ss){
   var pSheet=ss.getSheetByName('Products');
   if(pSheet&&pSheet.getLastRow()>1){
    var pData=pSheet.getDataRange().getValues(),headers=pData[0];
    var idCol=headers.indexOf('id'),skuCol=headers.indexOf('sku'),nameCol=headers.indexOf('name'),catCol=headers.indexOf('category'),subCol=headers.indexOf('sub_category'),priceCol=headers.indexOf('price'),imgCol=headers.indexOf('image');
    for(var i=1;i<pData.length;i++){
     var pRow=pData[i],s=String(pRow[skuCol]||'').trim(),pId=String(pRow[idCol]||'').trim();
     var itemInfo={id:pId,sku:s,name:String(pRow[nameCol]||'').trim(),category:String(pRow[catCol]||'').trim(),sub_category:String(pRow[subCol]||'').trim(),price:pRow[priceCol]==null||pRow[priceCol]===''||isNaN(Number(pRow[priceCol]))?null:Number(pRow[priceCol]),image:String(pRow[imgCol]||'').trim()};
     if(s)prodMap[s.toUpperCase()]=itemInfo;
     if(pId)prodMap[pId]=itemInfo;
    }
   }
  }
  var clean=[];
  var seen={};
  for(var j=0;j<baseProducts.length;j++){
   var p=baseProducts[j];
   if(!p||p.isPublic===false)continue;
   var idStr=String(p.id||'');
   if(seen[idStr])continue;seen[idStr]=true;
   var skuStr=String(p.sku||'').trim().toUpperCase();
   var erp=(skuStr&&prodMap[skuStr])?prodMap[skuStr]:(idStr&&prodMap[idStr]?prodMap[idStr]:null);
   var finalPrice=(p.price!=null&&p.price>0)?p.price:(erp&&erp.price>0?erp.price:(p.price!=null?p.price:null));
   var finalImg=(p.image&&p.image!=='')?p.image:(erp&&erp.image?erp.image:'');
   clean.push({
    id:idStr,
    name:String(p.name||(erp?erp.name:'')||idStr),
    sku:String(p.sku||(erp?erp.sku:'')||''),
    category:String(p.category||(erp?erp.category:'Khác')),
    sub_category:String(p.sub_category||(erp?erp.sub_category:'')||''),
    image:finalImg,
    thumbnail:String(p.thumbnail||finalImg),
    price:finalPrice,
    description:String(p.description||'')
   });
  }
  return clean;
 }catch(err){
  return typeof rfWebsiteSeedProducts_==='function'?rfWebsiteSeedProducts_().filter(function(x){return x.isPublic!==false;}):[];
 }
}

function rfWebsiteCatalogContent_(){
 try{
  var list=rfWebsiteGetPublicProducts_();
  return ContentService.createTextOutput(JSON.stringify(list)).setMimeType(ContentService.MimeType.JSON);
 }catch(e){
  return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
 }
}

function rfWebsitePublicContent_(){
 try{
  var sheet=rfWebsiteSheet_(false);
  var documents=sheet?rfWebsiteRows_(sheet).filter(function(row){return row.published&&(row.kind==='page'||row.kind==='post');}).map(function(row){return rfWebsiteValidate_(row.published);}):rfWebsiteSeedDocuments_().map(rfWebsiteValidate_);
  var products=rfWebsiteGetPublicProducts_();
  return ContentService.createTextOutput(JSON.stringify({schemaVersion:2,source:'RF Workspace Pro',documents:documents,products:products})).setMimeType(ContentService.MimeType.JSON);
 }catch(error){
  return ContentService.createTextOutput(JSON.stringify({schemaVersion:2,error:'Không tải được nội dung website.'})).setMimeType(ContentService.MimeType.JSON);
 }
}

function rfWebsiteManage(pin,action,args){
 var auth=validatePin(pin);if(!auth||!auth.valid||(!auth.isBoss&&!auth.isAdmin))throw new Error('Chỉ quản trị viên được quản lý website.');
 if(['list','preview','save','publish','syncProductsFromInventory'].indexOf(action)===-1)throw new Error('Thao tác không hợp lệ.');args=args||{};
 if(action==='preview'){
  var preview=UrlFetchApp.fetch(rfWebsiteOrigin_()+'/api/workspace/preview',{method:'post',contentType:'application/json',payload:JSON.stringify({document:rfWebsiteValidate_(args.document)}),muteHttpExceptions:true});
  var rendered;try{rendered=JSON.parse(preview.getContentText());}catch(error){throw new Error('Website chưa sẵn sàng xem trước.');}
  if(preview.getResponseCode()!==200||typeof rendered.html!=='string')throw new Error(rendered.error||'Không tạo được bản xem trước.');return rendered;
 }
 var lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw new Error('Có người đang cập nhật. Vui lòng thử lại.');
 try{
  var sheet=rfWebsiteSheet_(true),rows=rfWebsiteRows_(sheet);
  if(action==='list'){
   if(rows.filter(function(r){return r.kind==='product';}).length===0&&typeof rfWebsiteSeedProducts_==='function'){
    var now=new Date().toISOString();
    var pSeeds=rfWebsiteSeedProducts_().map(function(p){var v=rfWebsiteValidate_(p),j=JSON.stringify(v);return [v.id,v.kind,j,j,1,1,now,now];});
    sheet.getRange(sheet.getLastRow()+1,1,pSeeds.length,8).setValues(pSeeds);
    rows=rfWebsiteRows_(sheet);
   }
   return rows.map(function(row){delete row.row;delete row.values;return row;});
  }
  if(action==='syncProductsFromInventory'){
   var ss=SpreadsheetApp.getActiveSpreadsheet(),pSheet=ss.getSheetByName('Products');
   if(!pSheet)throw new Error('Không tìm thấy bảng Kho hàng Products.');
   var pData=pSheet.getDataRange().getValues(),headers=pData[0];
   var skuCol=headers.indexOf('sku'),nameCol=headers.indexOf('name'),catCol=headers.indexOf('category'),priceCol=headers.indexOf('price'),imgCol=headers.indexOf('image');
   var updatedCount=0;
   var nowTime=new Date().toISOString();
   for(var i=1;i<pData.length;i++){
    var skuVal=String(pData[i][skuCol]||'').trim();if(!skuVal)continue;
    var rowMatch=rows.filter(function(r){return r.kind==='product'&&String(r.draft.sku||'').toUpperCase()===skuVal.toUpperCase();})[0];
    if(rowMatch){
     var draft=rowMatch.draft;
     var pVal=pData[i][priceCol];
     if(pVal!=null&&pVal!==''&&!isNaN(Number(pVal)))draft.price=Number(pVal);
     var imgVal=String(pData[i][imgCol]||'').trim();
     if(imgVal&&!draft.image)draft.image=imgVal;
     var valid=rfWebsiteValidate_(draft);
     sheet.getRange(rowMatch.row,3,1,1).setValue(JSON.stringify(valid));
     updatedCount++;
    }
   }
   return {success:true,updatedCount:updatedCount};
  }
  var doc=action==='save'?rfWebsiteValidate_(args.document):null,id=doc?doc.id:args.id;
  if(typeof id!=='string'||!Number.isInteger(args.revision)||args.revision<0)throw new Error('Phiên bản không hợp lệ.');
  var row=rows.filter(function(item){return item.id===id;})[0];
  if(!row&&action==='publish')throw new Error('Hãy lưu bản nháp trước.');
  if(row&&row.revision!==args.revision||!row&&args.revision!==0)throw new Error('Bản nháp đã thay đổi. Hãy tải lại để tránh ghi đè.');
  if(row&&doc&&row.kind!==doc.kind)throw new Error('Không được đổi loại nội dung.');
  var revision=action==='save'?(row?row.revision+1:1):row.revision,now=new Date().toISOString();
  var draft=doc||row.draft,published=action==='publish'?row.draft:(row?row.published:null);
  var data=[id,draft.kind,JSON.stringify(draft),published?JSON.stringify(published):'',revision,action==='publish'?revision:(row?row.published_revision:0),action==='save'?now:row.updated_at,action==='publish'?now:(row?row.published_at:'')];
  var rowNumber=row?row.row:sheet.getLastRow()+1;sheet.getRange(rowNumber,1,1,8).setValues([data]);
  try{rfWebsiteHistory_(SpreadsheetApp.getActiveSpreadsheet(),id,revision,action,String(auth.user||auth.role),draft);}catch(error){if(row)sheet.getRange(rowNumber,1,1,8).setValues([row.values]);else sheet.deleteRow(rowNumber);throw new Error('Không ghi được lịch sử. Bản lưu đã được khôi phục; hãy tải lại.');}
  return {id:id,kind:draft.kind,draft:draft,published:published,revision:revision,published_revision:data[5],updated_at:data[6],published_at:data[7]};
 }finally{lock.releaseLock();}
}
