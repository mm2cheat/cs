// ================= 1 & 2. CẤU HÌNH ENDPOINT & CORSPROXY =================
const TARGET_API = "https://api.dichvuchungsuc.com/v1/orders";

// Sử dụng URLSearchParams để cấu hình key và url cho CorsProxy
const proxyParams = new URLSearchParams({
    key: "e25a3964",
    url: TARGET_API
});

const API_URL = `https://corsproxy.io/?${proxyParams.toString()}`;
const API_TOKEN = "dvc_1ff8c725bca9ab562ebd6311cfeefb4a18b9ba3945d04ecfdad5f3941ed81556";

// ================= LẤY PHẦN TỬ DOM =================
const orderForm = document.getElementById('orderForm');
const rawInputEl = document.getElementById('rawInput');
const extractedCodeEl = document.getElementById('extractedCode');
const quantityEl = document.getElementById('quantity');
const submitBtn = document.getElementById('submitBtn');
const progressWrapper = document.getElementById('progressWrapper');
const resultBox = document.getElementById('resultBox');

// Regex trích xuất mã nằm giữa hai dấu --
const CODE_REGEX = /--([A-Za-z0-9]+)--/;

// ================= HÀM HỖ TRỢ GIAO DIỆN =================

/**
 * Tự động tách mã Liên Quân từ chuỗi văn bản
 */
function extractLienQuanCode(text) {
    const match = text.match(CODE_REGEX);
    return match ? match[1] : null;
}

/**
 * Hiển thị xem trước mã code ngay khi người dùng dán văn bản vào ô input
 */
if (rawInputEl && extractedCodeEl) {
    rawInputEl.addEventListener('input', () => {
        const code = extractLienQuanCode(rawInputEl.value);
        if (code) {
            extractedCodeEl.textContent = code;
            extractedCodeEl.style.color = '#15803d';
        } else {
            extractedCodeEl.textContent = 'Chưa tìm thấy mã hợp lệ (--MÃ--)';
            extractedCodeEl.style.color = '#b91c1c';
        }
    });
}

/**
 * Bật / Tắt trạng thái Loading (Thanh tiến độ & Nút bấm)
 */
function setLoadingState(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? 'Đang xử lý...' : 'Tạo Đơn Ngay';
    if (progressWrapper) {
        progressWrapper.style.display = isLoading ? 'block' : 'none';
    }
    if (isLoading && resultBox) {
        resultBox.style.display = 'none';
    }
}

/**
 * Hiển thị thông báo kết quả ra màn hình
 */
function showResult(type, htmlContent) {
    if (!resultBox) return;
    resultBox.className = `result-box ${type}`;
    resultBox.innerHTML = htmlContent;
    resultBox.style.display = 'block';
}

// ================= 3, 4 & 5. HÀM XỬ LÝ TẠO ĐƠN CHÍNH =================

async function handleCreateOrder(event) {
    if (event) event.preventDefault();

    const rawText = rawInputEl.value.trim();
    const quantity = Number(quantityEl.value);
    const lienQuanCode = extractLienQuanCode(rawText);

    // Kiểm tra dữ liệu đầu vào trước khi gửi request
    if (!lienQuanCode) {
        showResult(
            'error',
            '❌ <strong>Lỗi định dạng:</strong> Không tìm thấy mã mời hợp lệ nằm giữa hai dấu <code>--</code> (VD: <code>--ABC123XYZ--</code>).'
        );
        return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        showResult(
            'error',
            '❌ <strong>Lỗi số lượng:</strong> Vui lòng nhập số lượng là số nguyên lớn hơn 0.'
        );
        return;
    }

    // Bật hiệu ứng loading và khóa nút bấm
    setLoadingState(true);

    // Chuẩn bị Body dữ liệu theo chuẩn JSON
    const payload = {
        serviceCode: "LIENQUAN_CHUNG_SUC",
        quantity: quantity,
        lienQuanCode: lienQuanCode
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "accept": "*/*",
                "Idempotency-Key": "shop-order-" + Date.now(),
                "Authorization": `Bearer ${API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        // 5. Kiểm tra response.ok, nếu lỗi thì throw Error kèm theo response.text()
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP Error ${response.status}`);
        }

        // Parse JSON trả về khi thành công
        const data = await response.json();
        const orderId = data?.order?.id || data?.id || "N/A";

        showResult(
            'success',
            `✅ <strong>Tạo đơn thành công!</strong><br>
            • <strong>Mã đơn hàng:</strong> <code>${orderId}</code><br>
            • <strong>Mã Liên Quân:</strong> <code>${lienQuanCode}</code><br>
            • <strong>Số lượng:</strong> ${quantity}`
        );

        // Xóa dữ liệu ô nhập sau khi tạo đơn thành công
        rawInputEl.value = '';
        if (extractedCodeEl) {
            extractedCodeEl.textContent = 'Chưa có';
            extractedCodeEl.style.color = '#6b7280';
        }

    } catch (error) {
        // Bắt lỗi từ throw Error (chứa response.text()) hoặc lỗi mạng
        let displayMessage = error.message;

        // Nếu chuỗi lỗi trả về từ response.text() có định dạng JSON, tự động trích xuất trường message cho dễ đọc
        try {
            const parsedError = JSON.parse(error.message);
            if (parsedError.message) {
                displayMessage = `${parsedError.message} <br><small>(Chi tiết: ${error.message})</small>`;
            }
        } catch (_) {
            // Giữ nguyên chuỗi text gốc nếu không phải JSON
        }

        showResult(
            'error',
            `❌ <strong>Tạo đơn thất bại:</strong><br>${displayMessage}`
        );
    } finally {
        // Tắt thanh tiến độ và mở khóa lại nút bấm
        setLoadingState(false);
    }
}

// Tích hợp vào sự kiện submit của Form (hoặc click nút "Tạo Đơn Ngay")
if (orderForm) {
    orderForm.addEventListener('submit', handleCreateOrder);
} else if (submitBtn) {
    submitBtn.addEventListener('click', handleCreateOrder);
}
