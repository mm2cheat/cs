// ============================================================================
// 1. CẤU HÌNH API KEY & ENDPOINT
// ============================================================================
const DVC_API_KEY = "dvc_1ff8c725bca9ab562ebd6311cfeefb4a18b9ba3945d04ecfdad5f3941ed81556";

const TARGET_API_URL = "https://api.dichvuchungsuc.com/v1/orders";

// Sử dụng CORS Proxy hỗ trợ phương thức POST và giữ nguyên Custom Headers (Authorization, Idempotency-Key)
// Tùy chọn 1 (Khuyên dùng cho POST): https://corsproxy.io/?
// Tùy chọn 2 (ThingProxy): https://thingproxy.freeboard.io/fetch/
// Tùy chọn 3 (AllOrigins): https://api.allorigins.win/raw?url=
const FINAL_API_URL = "https://corsproxy.io/?" + encodeURIComponent(TARGET_API_URL);

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
 * Hiển thị thông báo lên giao diện
 * @param {string} type - 'success' hoặc 'error'
 * @param {string} htmlContent - Nội dung thông báo
 */
function showNotification(type, htmlContent) {
  resultBox.className = type;
  resultBox.innerHTML = htmlContent;
}

/**
 * Dùng Regex tách chuỗi nằm giữa 2 cặp dấu gạch ngang (--mã--)
 * @param {string} text - Đoạn văn bản gốc người dùng dán vào
 * @returns {string|null} - Mã mời hoặc null nếu không tìm thấy
 */
function extractLienQuanCode(text) {
  if (!text) return null;
  // Quét chuỗi ký tự (không chứa khoảng trắng và dấu gạch ngang) nằm giữa -- và --
  const regex = /--([^\s-]+)--/;
  const match = text.match(regex);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Giải mã lỗi HTTP Status sang tiếng Việt dễ hiểu
 * @param {number} status - Mã HTTP trả về
 * @param {string} serverMessage - Thông báo gốc từ server (data.message)
 * @returns {string} - Thông báo tiếng Việt chi tiết
 */
function getVietnameseErrorMessage(status, serverMessage) {
  const detail = serverMessage ? `<br><small>Chi tiết từ máy chủ: <em>${serverMessage}</em></small>` : "";

  switch (status) {
    case 400:
      return `<strong>Lỗi dữ liệu (400):</strong> Mã mời Liên Quân hoặc số lượng không hợp lệ.${detail}`;
    case 401:
      return `<strong>Lỗi xác thực (401):</strong> API Key bị sai, hết hạn hoặc chưa được điền hợp lệ.${detail}`;
    case 402:
      return `<strong>Không đủ số dư (402):</strong> Tài khoản của bạn đã hết tiền. Vui lòng nạp thêm để tạo đơn.${detail}`;
    case 403:
      return `<strong>Từ chối truy cập (403):</strong> Tài khoản không có quyền dùng dịch vụ này hoặc bị chặn bởi tường lửa.${detail}`;
    case 409:
      return `<strong>Trùng lặp đơn hàng (409):</strong> Đơn hàng với mã này đang được xử lý hoặc bị trùng Idempotency-Key.${detail}`;
    case 429:
      return `<strong>Quá giới hạn yêu cầu (429):</strong> Bạn thao tác quá nhanh (Rate Limit). Vui lòng đợi vài giây rồi thử lại.${detail}`;
    case 503:
      return `<strong>Bảo trì hệ thống (503):</strong> Máy chủ dịch vụ đang quá tải hoặc bảo trì. Vui lòng thử lại sau.${detail}`;
    default:
      return `<strong>Lỗi không xác định (Mã HTTP ${status}):</strong> Không thể tạo đơn hàng lúc này.${detail}`;
  }
}

// ============================================================================
// 4. XỬ LÝ SỰ KIỆN KHI BẤM NÚT "TẠO ĐƠN NGAY"
// ============================================================================
submitBtn.addEventListener("click", async () => {
  // Ẩn thông báo cũ
  resultBox.className = "";
  resultBox.style.display = "none";

  // Bước 1: Kiểm tra và lọc mã mời bằng Regex
  const rawText = rawTextInput.value.trim();
  const extractedCode = extractLienQuanCode(rawText);

  if (!extractedCode) {
    showNotification(
      "error",
      "<strong>Không tìm thấy mã mời!</strong> Vui lòng dán đúng đoạn tin nhắn chia sẻ từ game có chứa mã nằm giữa hai dấu gạch ngang (ví dụ: <code>--zVdqY2Trt9--</code>)."
    );
    rawTextInput.focus();
    return;
  }

  // Bước 2: Kiểm tra và ép kiểu số lượng sang số nguyên (Integer)
  const quantityValue = parseInt(quantityInput.value, 10);
  if (isNaN(quantityValue) || quantityValue < 1) {
    showNotification(
      "error",
      "<strong>Số lượng không hợp lệ!</strong> Vui lòng nhập số lượng là số nguyên lớn hơn hoặc bằng 1."
    );
    quantityInput.focus();
    return;
  }

  // Bước 3: Khóa nút bấm để tránh người dùng bấm liên tục
  submitBtn.disabled = true;
  btnText.textContent = "Đang xử lý đơn...";

  // Tạo Idempotency-Key tự động chống trùng đơn
  const idempotencyKey = "shop-order-" + Date.now();

  // Đóng gói Payload theo đúng chuẩn API yêu cầu (chữ Q viết hoa trong lienQuanCode)
  const payload = {
    serviceCode: "LIENQUAN_CHUNG_SUC",
    quantity: quantityValue,
    lienQuanCode: extractedCode
  };

  try {
    // Bước 4: Gửi Request qua Fetch API
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

    // Cố gắng đọc dữ liệu JSON trả về từ Server
    let data = {};
    try {
      data = await response.json();
    } catch (parseError) {
      // Trường hợp server trả về lỗi dạng text/html thay vì JSON
      data = { message: "Máy chủ không trả về định dạng JSON chuẩn." };
    }

    // Bước 5: Kiểm tra mã HTTP Status
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
      // Xử lý các mã lỗi 400, 401, 402, 403, 409, 429, 503...
      const serverMsg = data && data.message ? data.message : "";
      const errorHtml = getVietnameseErrorMessage(response.status, serverMsg);
      showNotification("error", errorHtml);
    }
  } catch (networkError) {
    // Lỗi rớt mạng hoặc CORS Proxy bị sập
    showNotification(
      "error",
      `<strong>Lỗi kết nối mạng hoặc CORS Proxy!</strong> Không thể kết nối tới máy chủ API.<br>
       <small>Chi tiết kỹ thuật: ${networkError.message}</small>`
    );
  } finally {
    // Bước 6: Mở khóa lại nút bấm sau khi hoàn tất
    submitBtn.disabled = false;
    btnText.textContent = "Tạo Đơn Ngay";
  }
});
