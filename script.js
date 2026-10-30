// ============================================================================
// 1. CẤU HÌNH API KEY & CORS PROXY (ĐÃ TÍCH HỢP TÀI KHOẢN CỦA BẠN)
// ============================================================================

// Điền API Key của dịch vụ Chung Sức vào đây (Upstream API token)
const DVC_API_KEY = "dvc_1ff8c725bca9ab562ebd6311cfeefb4a18b9ba3945d04ecfdad5f3941ed81556";

// Mã Key CorsProxy lấy từ tài khoản của bạn
const CORS_PROXY_KEY = "e25a3964";

// URL gốc của hệ thống tạo đơn
const TARGET_API_URL = "https://api.dichvuchungsuc.com/v1/orders";

// Khởi tạo URL theo chuẩn URLSearchParams của CorsProxy
const proxyParams = new URLSearchParams({
  key: CORS_PROXY_KEY,
  url: TARGET_API_URL
});
const FINAL_API_URL = "https://corsproxy.io/?" + proxyParams.toString();

// ============================================================================
// 2. THAM CHIẾU DOM ELEMENTS
// ============================================================================
const rawTextInput = document.getElementById("rawText");
const quantityInput = document.getElementById("quantity");
const submitBtn = document.getElementById("submitBtn");
const btnText = document.getElementById("btnText");
const resultBox = document.getElementById("resultBox");

// ============================================================================
// 3. HÀM TIỆN ÍCH (HIỂN THỊ THÔNG BÁO & LỌC MÃ REGEX)
// ============================================================================

/**
 * Hiển thị thông báo kết quả lên giao diện
 */
function showNotification(type, htmlContent) {
  resultBox.className = type;
  resultBox.innerHTML = htmlContent;
}

/**
 * Dùng Regex quét chuỗi mã nằm giữa 2 cặp dấu gạch ngang (--mã--)
 */
function extractLienQuanCode(text) {
  if (!text) return null;
  const regex = /--([^\s-]+)--/;
  const match = text.match(regex);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Chuyển đổi mã lỗi HTTP sang thông báo tiếng Việt chi tiết
 */
function getVietnameseErrorMessage(status, serverMessage) {
  const detail = serverMessage ? `<br><small>Chi tiết máy chủ: <em>${serverMessage}</em></small>` : "";

  switch (status) {
    case 400:
      return `<strong>Lỗi dữ liệu (400):</strong> Mã mời Liên Quân hoặc số lượng không hợp lệ.${detail}`;
    case 401:
      return `<strong>Lỗi xác thực (401):</strong> Mã DVC_API_KEY bị sai, hết hạn hoặc chưa được điền.${detail}`;
    case 402:
      return `<strong>Không đủ số dư (402):</strong> Tài khoản dịch vụ đã hết tiền. Vui lòng nạp thêm để tạo đơn.${detail}`;
    case 403:
      return `<strong>Từ chối truy cập (403):</strong> Không có quyền truy cập, hoặc bạn chưa thêm tên miền GitHub Pages vào mục "Review domains" trên CorsProxy.${detail}`;
    case 409:
      return `<strong>Trùng lặp đơn hàng (409):</strong> Đơn hàng với mã này đang được xử lý hoặc bị trùng Idempotency-Key.${detail}`;
    case 429:
      return `<strong>Quá giới hạn yêu cầu (429):</strong> Bạn thao tác quá nhanh (Rate Limit). Vui lòng đợi vài giây rồi thử lại.${detail}`;
    case 503:
      return `<strong>Bảo trì hệ thống (503):</strong> Máy chủ dịch vụ đang quá tải hoặc bảo trì. Vui lòng thử lại sau.${detail}`;
    default:
      return `<strong>Lỗi không xác định (HTTP ${status}):</strong> Không thể tạo đơn hàng lúc này.${detail}`;
  }
}

// ============================================================================
// 4. SỰ KIỆN BẤM NÚT "TẠO ĐƠN NGAY"
// ============================================================================
submitBtn.addEventListener("click", async () => {
  // Ẩn khung thông báo cũ
  resultBox.className = "";
  resultBox.style.display = "none";

  // 1. Lọc mã Liên Quân từ textarea
  const rawText = rawTextInput.value.trim();
  const extractedCode = extractLienQuanCode(rawText);

  if (!extractedCode) {
    showNotification(
      "error",
      "<strong>Không tìm thấy mã mời!</strong> Vui lòng dán đoạn văn bản có chứa mã nằm giữa 2 dấu gạch ngang (ví dụ: <code>--zVdqY2Trt9--</code>)."
    );
    rawTextInput.focus();
    return;
  }

  // 2. Lấy số lượng và ép kiểu số nguyên (int)
  const quantityValue = parseInt(quantityInput.value, 10);
  if (isNaN(quantityValue) || quantityValue < 1) {
    showNotification(
      "error",
      "<strong>Số lượng không hợp lệ!</strong> Vui lòng nhập số nguyên lớn hơn hoặc bằng 1."
    );
    quantityInput.focus();
    return;
  }

  // 3. Khóa nút bấm khi đang gọi API
  submitBtn.disabled = true;
  btnText.textContent = "Đang gửi yêu cầu...";

  // Tạo Idempotency-Key chống trùng đơn
  const idempotencyKey = "shop-order-" + Date.now();

  // Dữ liệu Body JSON (chữ Q viết hoa trong lienQuanCode)
  const payload = {
    serviceCode: "LIENQUAN_CHUNG_SUC",
    quantity: quantityValue,
    lienQuanCode: extractedCode
  };

  try {
    // 4. Gọi Fetch API thông qua CorsProxy có gắn Key
    const response = await fetch(FINAL_API_URL, {
      method: "POST",
      headers: {
        "accept": "*/*",
        "Content-Type": "application/json",
        "Authorization": "Bearer " + DVC_API_KEY,
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify(payload)
    });

    // Đọc phản hồi từ server (hỗ trợ cả trường hợp lỗi trả về dạng text thuần từ Proxy)
    const rawResponseText = await response.text();
    let data = {};
    try {
      data = rawResponseText ? JSON.parse(rawResponseText) : {};
    } catch (e) {
      data = { message: rawResponseText || "Không thể phân tích dữ liệu JSON từ máy chủ." };
    }

    // 5. Xử lý kết quả trả về
    if (response.status === 200 || response.status === 201) {
      const orderId = (data && data.order && data.order.id) ? data.order.id : "Không xác định";
      showNotification(
        "success",
        `<strong>Tạo đơn thành công!</strong><br>
         • Mã đơn hàng: <strong>${orderId}</strong><br>
         • Mã Liên Quân: <code>${extractedCode}</code><br>
         • Số lượng: <strong>${quantityValue}</strong>`
      );
    } else {
      const serverMsg = data && data.message ? data.message : "";
      const errorHtml = getVietnameseErrorMessage(response.status, serverMsg);
      showNotification("error", errorHtml);
    }
  } catch (networkError) {
    showNotification(
      "error",
      `<strong>Lỗi kết nối mạng!</strong> Không thể gọi tới CorsProxy hoặc máy chủ đích.<br>
       <small>Chi tiết: ${networkError.message}</small>`
    );
  } finally {
    // 6. Mở khóa lại nút bấm
    submitBtn.disabled = false;
    btnText.textContent = "Tạo Đơn Ngay";
  }
});
