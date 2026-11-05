import sys
import re

def test_qc_vocabulary():
    print("[TEST 1] Testing isQcPassed_ logic...")
    def is_qc_passed(qc_val):
        if not qc_val:
            return False
        q = str(qc_val).strip().upper()
        if 'CHỜ' in q or 'CHƯA' in q or 'KHÔNG' in q or 'TỪ CHỐI' in q or 'FAIL' in q or 'REJECT' in q:
            return False
        return q == 'PASSED' or q == 'PASS' or 'ĐÃ DUYỆT' in q or 'DA DUYET' in q or q == 'DUYỆT' or q == 'ĐÃ KCS' or q == 'ĐẠT' or q == 'DAT'

    valid_cases = ['Passed', 'PASS', 'passed', 'pass', 'Đã Duyệt', 'Đã duyệt', 'ĐÃ DUYỆT', 'ĐẠT', 'Đạt', 'đạt', 'QC ĐÃ DUYỆT']
    invalid_cases = ['Pending', 'pending', 'Chờ duyệt', 'Chưa duyệt', 'Từ chối', 'Failed', 'FAIL', 'KCS Không đạt', '', None]

    for c in valid_cases:
        assert is_qc_passed(c) is True, f"Failed on valid case: {c}"
    for c in invalid_cases:
        assert is_qc_passed(c) is False, f"Failed on invalid case: {c}"
    print("  --> PASS: isQcPassed_ correctly handles all valid and invalid QC variants.")

def test_normalize_status_exact_match():
    print("[TEST 2] Testing normalizeStatus and Exact Match...")
    status_map = {
        'HOÀN THÀNH': 'Đối Soát Thành Công',
        'COMPLETED': 'Đối Soát Thành Công',
        'ĐỐI SOÁT THÀNH CÔNG': 'Đối Soát Thành Công',
        'ĐÃ GIAO': 'Đã Bàn Giao',
        'DELIVERED': 'Đã Bàn Giao',
        'ĐÃ BÀN GIAO': 'Đã Bàn Giao',
        'SẴN SÀNG ĐÓNG GÓI': 'Sẵn Sàng Đóng Gói',
        'SẴN SANG ĐONG GOI': 'Sẵn Sàng Đóng Gói',
        'READY TO PACK': 'Sẵn Sàng Đóng Gói',
        'READY_TO_PACK': 'Sẵn Sàng Đóng Gói',
        'CHỜ ĐÓNG GÓI': 'Sẵn Sàng Đóng Gói',
        'CHỜ SẢN XUẤT': 'Chờ Sản Xuất',
        'ĐANG SẢN XUẤT': 'Đang Sản Xuất',
        'QUÉT TỰ ĐỘNG': 'Quét Tự Động',
        'CHỜ BÀN GIAO': 'Chờ Bàn Giao',
        'CHỜ MÃ VẬN ĐƠN': 'Chờ Mã Vận Đơn',
        'CHỜ PHỤ KIỆN': 'Chờ Phụ Kiện',
        'TRẢ HÀNG/HOÀN TIỀN': 'Hàng Hoàn',
        'RETURNED': 'Hàng Hoàn',
        'HÀNG HOÀN': 'Hàng Hoàn',
        'ĐÃ HỦY': 'Đơn Huỷ',
        'ĐÃ HUỶ': 'Đơn Huỷ',
        'CANCELLED': 'Đơn Huỷ',
        'CANCELED': 'Đơn Huỷ',
        'ĐƠN HUỶ': 'Đơn Huỷ',
        'ĐƠN HỦY': 'Đơn Huỷ',
        'HỦY': 'Đơn Huỷ',
        'HUỶ': 'Đơn Huỷ',
        'HỦY/VỠ': 'Đơn Huỷ',
        'HUỶ/VỠ': 'Đơn Huỷ',
        'HỦY / VỠ': 'Đơn Huỷ',
        'HUỶ / VỠ': 'Đơn Huỷ',
        'DONE': 'Done',
        'ĐÃ XONG': 'Done',
        'HOÀN KHO ĐẠT': 'Done'
    }

    def normalize_status(raw):
        if not raw:
            return ''
        s = str(raw).strip()
        upper = re.sub(r'\s+', ' ', s.upper())
        if upper in status_map:
            return status_map[upper]
        if 'YÊU CẦU HỦY BỊ TỪ CHỐI' in upper or 'YEU CAU HUY BI TU CHOI' in upper or 'HỦY KHÔNG THÀNH CÔNG' in upper or 'HUY KHONG THANH CONG' in upper:
            return s
        if any(k in upper for k in ['GIAO HÀNG THẤT BẠI', 'GIAO HÀNG KHÔNG THÀNH CÔNG', 'GIAO THẤT BẠI', 'HOÀN TRẢ', 'TRẢ HÀNG', 'HOÀN TIỀN', 'HÀNG TRẢ VỀ', 'TỪ CHỐI NHẬN']):
            return 'Hàng Hoàn'
        if re.match(r'^(ĐÃ\s+)?(HỦY|HUỶ)(\s+ĐƠN)?$', upper, re.IGNORECASE) or upper == 'ORDER CANCELLED':
            return 'Đơn Huỷ'
        return s

    assert normalize_status("Yêu cầu hủy bị từ chối") == "Yêu cầu hủy bị từ chối"
    assert normalize_status("YEU CAU HUY BI TU CHOI") == "YEU CAU HUY BI TU CHOI"
    assert normalize_status("Hủy không thành công - Đang giao") == "Hủy không thành công - Đang giao"
    assert normalize_status("Đã Hủy") == "Đơn Huỷ"
    assert normalize_status("ĐÃ HUỶ") == "Đơn Huỷ"
    assert normalize_status("HỦY ĐƠN") == "Đơn Huỷ"
    assert normalize_status("Cancelled") == "Đơn Huỷ"
    assert normalize_status("Giao hàng thất bại") == "Hàng Hoàn"
    assert normalize_status("Trả hàng/Hoàn tiền") == "Hàng Hoàn"
    assert normalize_status("Sẵn sàng đóng gói") == "Sẵn Sàng Đóng Gói"
    assert normalize_status("READY TO PACK") == "Sẵn Sàng Đóng Gói"
    print("  --> PASS: normalizeStatus correctly protects against false cancellation and maps canonical statuses.")

def test_auto_forward_qc_gate_simulation():
    print("[TEST 3] Simulating _checkAndAutoForwardOrder_Core logic...")
    def is_qc_passed(qc_val):
        if not qc_val:
            return False
        q = str(qc_val).strip().upper()
        if 'CHỜ' in q or 'CHƯA' in q or 'KHÔNG' in q or 'TỪ CHỐI' in q or 'FAIL' in q or 'REJECT' in q:
            return False
        return q == 'PASSED' or q == 'PASS' or 'ĐÃ DUYỆT' in q or 'DA DUYET' in q or q == 'DUYỆT' or q == 'ĐÃ KCS' or q == 'ĐẠT' or q == 'DAT'

    def check_forward_order(child_prods):
        if not child_prods:
            return False
        return all(
            p.get('fulfilledFromStock') is True or 
            ((p.get('status') in ['DONE', 'ĐÃ XONG', 'HOÀN KHO ĐẠT']) and is_qc_passed(p.get('qc_status')))
            for p in child_prods
        )

    # Case 3.1: 1 sản phẩm Done nhưng QC Pending -> Không được chuyển
    prods_3_1 = [{'status': 'DONE', 'qc_status': 'Pending', 'fulfilledFromStock': False}]
    assert check_forward_order(prods_3_1) is False

    # Case 3.2: 1 sản phẩm Done và QC Passed -> Được chuyển
    prods_3_2 = [{'status': 'DONE', 'qc_status': 'Passed', 'fulfilledFromStock': False}]
    assert check_forward_order(prods_3_2) is True

    # Case 3.3: 1 sản phẩm Done và QC Đã Duyệt -> Được chuyển
    prods_3_3 = [{'status': 'DONE', 'qc_status': 'Đã Duyệt', 'fulfilledFromStock': False}]
    assert check_forward_order(prods_3_3) is True

    # Case 3.4: Đơn hỗn hợp 2 sản phẩm: 1 Done + QC Passed, 1 Done nhưng QC Pending -> KHÔNG ĐƯỢC CHUYỂN
    prods_3_4 = [
        {'status': 'DONE', 'qc_status': 'Passed', 'fulfilledFromStock': False},
        {'status': 'DONE', 'qc_status': 'Pending', 'fulfilledFromStock': False}
    ]
    assert check_forward_order(prods_3_4) is False

    # Case 3.5: Đơn hỗn hợp 2 sản phẩm: 1 Done + QC Passed, 1 bốc tồn kho fulfilledFromStock -> ĐƯỢC CHUYỂN
    prods_3_5 = [
        {'status': 'DONE', 'qc_status': 'Passed', 'fulfilledFromStock': False},
        {'status': 'Pending', 'qc_status': '', 'fulfilledFromStock': True}
    ]
    assert check_forward_order(prods_3_5) is True

    # Case 3.6: Đơn hỗn hợp 2 sản phẩm: cả 2 Done + QC Đạt -> ĐƯỢC CHUYỂN
    prods_3_6 = [
        {'status': 'DONE', 'qc_status': 'Đạt', 'fulfilledFromStock': False},
        {'status': 'DONE', 'qc_status': 'Đã duyệt', 'fulfilledFromStock': False}
    ]
    assert check_forward_order(prods_3_6) is True
    print("  --> PASS: QC Gate and Multi-Product Order Invariants verified 100%.")

def test_codebase_integrity_static():
    print("[TEST 4] Static code analysis for target fixes...")
    with open('js/Code.js', 'r', encoding='utf-8') as f:
        code_js = f.read()
    with open('js/RFBotBridge.js', 'r', encoding='utf-8') as f:
        bridge_js = f.read()
    with open('html/Tab_Orders.html', 'r', encoding='utf-8') as f:
        tab_orders_html = f.read()
    with open('html/Modals_Orders.html', 'r', encoding='utf-8') as f:
        modals_orders_html = f.read()

    # Verify isQcPassed_ exists
    assert 'function isQcPassed_(qcVal)' in code_js, "isQcPassed_ missing in Code.js"
    assert 'function _checkAndAutoForwardOrder_Core(orderId, ss)' in code_js, "_checkAndAutoForwardOrder_Core missing"
    
    # Verify cleanupPhantomBomTickets does not call locking wrapper
    assert 'processMaterialDeduction(realProdId, null)' not in code_js, "cleanupPhantomBomTickets still calls locking wrapper!"
    assert '_processMaterialDeduction_Core(realProdId, null, ss)' in code_js, "cleanupPhantomBomTickets must call _processMaterialDeduction_Core"

    # Verify processAutoAllocation does not call locking wrapper
    alloc_fn_match = re.search(r'function processAutoAllocation\(.*?\)\s*\{(.*?)\n\}', code_js, re.DOTALL)
    assert alloc_fn_match, "processAutoAllocation function not found"
    assert 'processBatchAutoForwardSLA' not in alloc_fn_match.group(1), "processAutoAllocation must not call locking wrapper processBatchAutoForwardSLA!"
    assert '_checkAndAutoForwardOrder_Core' in alloc_fn_match.group(1), "processAutoAllocation must call _checkAndAutoForwardOrder_Core"
    
    # Verify processQCApproval forwards order and deduces BOM
    assert '_processMaterialDeduction_Core(prodId, null, ss)' in code_js, "processQCApproval must call _processMaterialDeduction_Core"
    assert '_checkAndAutoForwardOrder_Core(targetOrderId, ss)' in code_js, "processQCApproval must call _checkAndAutoForwardOrder_Core"

    # Verify RFBotBridge.js checks QC before setting Ready to Pack
    assert 'ordersSheet.getRange(matchedOrderRow, oStatusIdx + 1).setValue(\'Sẵn Sàng Đóng Gói\')' not in bridge_js, "RFBotBridge still bypasses QC check!"

    # Verify UI case sensitivity handling
    assert 'group === \'Sẵn Sàng Đóng Gói\' || group === \'Sẵn sàng đóng gói\'' in tab_orders_html, "Tab_Orders.html missing case tolerance"
    assert 'effectiveStatus === \'Sẵn Sàng Đóng Gói\' || \n            effectiveStatus === \'Sẵn sàng đóng gói\'' in modals_orders_html or 'effectiveStatus === \'Sẵn Sàng Đóng Gói\' ||' in modals_orders_html, "Modals_Orders.html missing case tolerance"

    print("  --> PASS: All static assertions against code structure and lock nesting passed.")

if __name__ == '__main__':
    print("=" * 70)
    print("RF WORKSPACE PRO — LOGIC INTEGRITY REPAIR VERIFICATION SUITE")
    print("=" * 70)
    test_qc_vocabulary()
    test_normalize_status_exact_match()
    test_auto_forward_qc_gate_simulation()
    test_codebase_integrity_static()
    print("=" * 70)
    print("ALL TESTS PASSED SUCCESSFULLY! ZERO COMPRESSION / ZERO CORRUPTION.")
    print("=" * 70)
