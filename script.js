const API_URL = "https://api.dichvuchungsuc.com/v1/orders";

async function processOrder() {
    const apiKey = document.getElementById("apiKey").value.trim();
    const inviteText = document.getElementById("inviteText").value.trim();
    const quantity = document.getElementById("quantity").value;
    const resultBox = document.getElementById("result");
    const submitBtn = document.getElementById("submitBtn");

    resultBox.style.display = "none";
    resultBox.className = "";
    resultBox.innerHTML = "";

    if (!apiKey) {
        showResult("Vui lòng nhập API Key!", "error");
        return;
    }

    if (!inviteText) {
        showResult("Vui lòng dán đoạn text mã mời từ game!", "error");
        return;
    }

    const match = inviteText.match(/--([A-Za-z0-9]+)--/);
    if (!match) {
        showResult("Không tìm thấy mã hợp lệ! Hãy dán đúng nguyên văn text copy từ game.", "error");
        return;
    }

    const extractedCode = match[1];

    const bodyData = {
        serviceCode: "LIENQUAN_CHUNG_SUC",
        quantity: parseInt(quantity),
        lienQuanCode: extractedCode
    };

    const idempotencyKey = "shop-order-" + Date.now();

    const headers = {
        "accept": "*/*",
        "Idempotency-Key": idempotencyKey,
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
    };

    submitBtn.disabled = true;
    submitBtn.innerText = "Đang xử lý...";

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(bodyData)
        });

        const data = await response.json();

        if (response.ok || response.status === 200 || response.status === 201) {
            const orderId = data.order ? data.order.id : "Không rõ ID";
            showResult(`✅ <b>Tạo đơn thành công!</b><br>Mã đơn: ${orderId}<br>Mã game: ${extractedCode}<br>Số lượng: ${quantity}`, "success");
            document.getElementById("inviteText").value = ""; 
        } else {
            // Lấy thông báo lỗi từ schema {"message": "string"} của API
            const errorMsg = data.message || "Lỗi không xác định";
            let userFriendlyMsg = `❌ Lỗi API: ${errorMsg}`;

            // Dịch các mã lỗi phổ biến theo tài liệu API
            if (response.status === 401 || errorMsg.includes("INVALID_API_KEY")) {
                userFriendlyMsg = "❌ Lỗi 401: API Key sai, đã bị thu hồi hoặc tài khoản bị khóa.";
            } else if (response.status === 402 || errorMsg.includes("INSUFFICIENT_BALANCE")) {
                userFriendlyMsg = "❌ Lỗi 402: Ví của bạn không đủ tiền để tạo đơn này.";
            } else if (response.status === 403 || errorMsg.includes("ACCOUNT_NOT_ACTIVE")) {
                userFriendlyMsg = "❌ Lỗi 403: Tài khoản của bạn chưa được kích hoạt.";
            } else if (response.status === 409) {
                userFriendlyMsg = "❌ Lỗi 409: Dịch vụ đã hết số lượng hoặc ví đang bảo trì.";
            } else if (response.status === 429) {
                userFriendlyMsg = "❌ Lỗi 429: Bạn đang gửi lệnh quá nhanh (Spam). Vui lòng chờ một lát rồi thử lại.";
            } else if (response.status === 503) {
                userFriendlyMsg = "❌ Lỗi 503: Hệ thống API đang bận xử lý, giao dịch bị rollback. Vui lòng bấm thử lại.";
            } else if (response.status === 400) {
                userFriendlyMsg = `❌ Lỗi 400 (Dữ liệu sai): ${errorMsg}`;
            }

            showResult(userFriendlyMsg, "error");
        }
    } catch (error) {
        showResult(`❌ Lỗi kết nối mạng hoặc CORS. Vui lòng mở F12 xem chi tiết.`, "error");
        console.error("Lỗi:", error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Tạo Đơn Ngay";
    }
}

function showResult(message, type) {
    const resultBox = document.getElementById("result");
    resultBox.innerHTML = message;
    resultBox.className = type;
    resultBox.style.display = "block";
}
