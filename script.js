"use strict";

/* ================= CẤU HÌNH ================= */
// Key của dịch vụ Chung Sức. Để trống thì trang sẽ hiện ô nhập key (lưu localStorage).
const DVC_API_KEY = "dvc_1ff8c725bca9ab562ebd6311cfeefb4a18b9ba3945d04ecfdad5f3941ed81556";

// Key CorsProxy (lấy ở dashboard corsproxy.io). Để trống = dùng proxy không key.
const CORSPROXY_KEY = "e25a3964";

const API_URL = "https://api.dichvuchungsuc.com/v1/orders";
const PROXY_BASE = "https://corsproxy.io/?";
const SERVICE_CODE = "LIENQUAN_CHUNG_SUC";

const MAX_QTY = 100;      // giới hạn an toàn cho 1 lượt bấm
const DELAY_MS = 800;     // nghỉ giữa các đơn ở chế độ tách đơn
const MAX_RETRY = 3;      // số lần thử lại khi gặp 429 / 503
/* ============================================ */

const $ = (id) => document.getElementById(id);
const el = {
  text: $("shareText"),
  qty: $("quantity"),
  mode: $("mode"),
  keyField: $("keyField"),
  keyInput: $("apiKeyInput"),
  submit: $("submitBtn"),
  cancel: $("cancelBtn"),
  panel: $("progressPanel"),
  percent: $("percent"),
  counter: $("counter"),
  track: document.querySelector(".track"),
  fill: $("fill"),
  status: $("status"),
  log: $("log"),
  result: $("result"),
};

let controller = null;

/* ---------- Tiện ích ---------- */
function extractCode(text) {
  const m = text.match(/--([A-Za-z0-9_]+)--/);
  return m ? m[1] : null;
}

function getApiKey() {
  if (DVC_API_KEY) return DVC_API_KEY;
  return el.keyInput.value.trim();
}

function buildProxyUrl() {
  let url = PROXY_BASE + "?url=" + encodeURIComponent(API_URL);
  if (CORSPROXY_KEY) url += "&key=" + encodeURIComponent(CORSPROXY_KEY);
  return url;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }
  });
}

function setProgress(done, total, state) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  el.percent.textContent = pct + "%";
  el.counter.textContent = done + " / " + total + " đơn";
  el.fill.style.width = pct + "%";
  el.track.setAttribute("aria-valuenow", String(pct));
  el.fill.classList.remove("done", "failed", "indeterminate");
  if (state) el.fill.classList.add(state);
}

function addLog(message, type) {
  const li = document.createElement("li");
  li.textContent = message;
  if (type) li.className = type;
  el.log.appendChild(li);
  el.log.scrollTop = el.log.scrollHeight;
}

function showResult(type, title, detail) {
  el.result.className = "show " + type;
  el.result.textContent = "";
  const strong = document.createElement("strong");
  strong.textContent = title;
  el.result.appendChild(strong);
  if (detail) el.result.appendChild(document.createTextNode(detail));
}

function setBusy(busy) {
  el.submit.disabled = busy;
  el.submit.textContent = busy ? "Đang xử lý..." : "Tạo Đơn Ngay";
  el.cancel.hidden = !busy;
  el.text.disabled = busy;
  el.qty.disabled = busy;
  el.mode.disabled = busy;
  el.keyInput.disabled = busy;
}

function describeError(status, apiMessage) {
  const base = {
    400: "Dữ liệu gửi lên không hợp lệ (kiểm tra lại mã mời hoặc số lượng).",
    401: "Sai hoặc thiếu API Key dịch vụ.",
    402: "Tài khoản không đủ số dư, hãy nạp thêm tiền.",
    403: "Key không có quyền sử dụng dịch vụ này (hoặc bị chặn).",
    409: "Đơn bị trùng hoặc đang được xử lý (Idempotency-Key đã dùng).",
    429: "Gửi quá nhanh, bị giới hạn tốc độ. Hãy chờ một lúc rồi thử lại.",
    503: "Hệ thống dịch vụ đang bảo trì hoặc quá tải. Thử lại sau.",
  }[status] || ("Lỗi không xác định (HTTP " + status + ").");
  return apiMessage ? base + " [" + apiMessage + "]" : base;
}

/* ---------- Gọi API cho 1 đơn ---------- */
async function placeOrder({ code, quantity, idemKey, signal, onRetry }) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(buildProxyUrl(), {
        method: "POST",
        headers: {
          "accept": "*/*",
          "Content-Type": "application/json",
          "Authorization": "Bearer " + getApiKey(),
          // Giữ nguyên key khi thử lại để không bị tạo đơn trùng
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify({
          serviceCode: SERVICE_CODE,
          quantity: quantity,
          lienQuanCode: code,
        }),
        signal,
      });
    } catch (err) {
      if (err.name === "AbortError") throw err;
      return {
        ok: false,
        status: 0,
        message: "Không kết nối được. Kiểm tra mạng, key CorsProxy và danh sách referrer được phép trong dashboard CorsProxy.",
      };
    }

    const data = await res.json().catch(() => ({}));

    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRY) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const wait = retryAfter > 0 ? retryAfter * 1000 : 1500 * Math.pow(2, attempt);
      onRetry(attempt + 1, wait, res.status);
      await sleep(wait, signal);
      continue;
    }

    if (res.status === 200 || res.status === 201) {
      return { ok: true, status: res.status, data };
    }
    return {
      ok: false,
      status: res.status,
      message: describeError(res.status, data && data.message),
    };
  }
}

/* ---------- Luồng chính ---------- */
async function run() {
  el.result.className = "";
  el.result.textContent = "";

  const code = extractCode(el.text.value);
  if (!code) {
    showResult("error", "Không tìm thấy mã mời. ", "Đoạn text cần có dạng --MãMời-- (mã nằm giữa hai dấu gạch ngang).");
    return;
  }

  const qty = parseInt(el.qty.value, 10);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
    showResult("error", "Số lượng không hợp lệ. ", "Nhập số nguyên từ 1 đến " + MAX_QTY + ".");
    return;
  }

  if (!getApiKey()) {
    showResult("error", "Chưa có API Key. ", "Điền DVC_API_KEY trong script.js hoặc nhập vào ô API Key.");
    return;
  }
  if (!DVC_API_KEY) {
    try { localStorage.setItem("dvc_api_key", el.keyInput.value.trim()); } catch (e) { /* bỏ qua */ }
  }

  const split = el.mode.value === "split";
  const jobs = split ? qty : 1;
  const perOrder = split ? 1 : qty;
  const batchId = Date.now();
  const orderIds = [];

  controller = new AbortController();
  setBusy(true);
  el.panel.hidden = false;
  el.log.textContent = "";
  setProgress(0, jobs);
  if (!split) {
    el.fill.classList.add("indeterminate");
    el.counter.textContent = "1 đơn (" + qty + " lượt)";
    el.percent.textContent = "...";
  }
  el.status.textContent = "Mã mời: " + code;

  let failure = null;

  try {
    for (let i = 1; i <= jobs; i++) {
      el.status.textContent = split
        ? "Đang gửi đơn " + i + " / " + jobs + "..."
        : "Đang gửi đơn " + qty + " lượt...";

      const result = await placeOrder({
        code,
        quantity: perOrder,
        idemKey: "shop-order-" + batchId + "-" + i,
        signal: controller.signal,
        onRetry: (n, wait, status) => {
          const msg = "HTTP " + status + ": thử lại lần " + n + " sau " + Math.round(wait / 1000) + " giây...";
          el.status.textContent = msg;
          addLog(msg, "warn");
        },
      });

      if (!result.ok) {
        failure = result;
        addLog("Đơn " + i + ": thất bại. " + result.message, "err");
        break;
      }

      const order = result.data && result.data.order;
      const id = order && order.id ? order.id : "(không có id)";
      orderIds.push(id);
      addLog("Đơn " + i + ": thành công, mã đơn " + id, "ok");
      if (split) setProgress(i, jobs);

      if (split && i < jobs) await sleep(DELAY_MS, controller.signal);
    }
  } catch (err) {
    if (err.name === "AbortError") {
      failure = { message: "Bạn đã dừng giữa chừng." };
      addLog("Đã dừng theo yêu cầu.", "warn");
    } else {
      failure = { message: "Lỗi bất ngờ: " + err.message };
    }
  }

  const done = orderIds.length;
  if (!failure) {
    setProgress(jobs, jobs, "done");
    el.status.textContent = "Hoàn tất.";
    showResult(
      "success",
      "Tạo đơn thành công! ",
      split
        ? "Đã tạo " + done + " đơn. Mã đơn: " + orderIds.join(", ")
        : "Mã đơn: " + orderIds[0]
    );
  } else {
    setProgress(done, jobs, "failed");
    el.status.textContent = "Đã dừng.";
    showResult(
      "error",
      "Tạo đơn thất bại. ",
      failure.message + (split ? " (Đã tạo thành công " + done + "/" + jobs + " đơn.)" : "")
    );
  }

  controller = null;
  setBusy(false);
}

/* ---------- Khởi tạo ---------- */
el.submit.addEventListener("click", run);
el.cancel.addEventListener("click", () => { if (controller) controller.abort(); });

if (!DVC_API_KEY) {
  el.keyField.hidden = false;
  try {
    const saved = localStorage.getItem("dvc_api_key");
    if (saved) el.keyInput.value = saved;
  } catch (e) { /* bỏ qua */ }
}
