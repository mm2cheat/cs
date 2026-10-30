// ================================================================
//  CONFIG — Điền key của bạn vào đây, KHÔNG commit lên public repo
// ================================================================

/** Key API của dichvuchungsuc.com */
const DVC_API_KEY = 'dvc_1ff8c725bca9ab562ebd6311cfeefb4a18b9ba3945d04ecfdad5f3941ed81556';

/**
 * CorsProxy config
 *
 * Nếu dùng proxy.cors.sh (có tài khoản):
 *   CORS_PROXY_URL  = 'https://proxy.cors.sh/'
 *   CORS_PROXY_KEY  = key từ dashboard của bạn  (header: x-cors-api-key)
 *
 * Nếu dùng corsproxy.io (miễn phí, không key):
 *   CORS_PROXY_URL  = 'https://corsproxy.io/?'
 *   CORS_PROXY_KEY  = ''
 *
 * Nếu dùng instance cors-anywhere tự host:
 *   CORS_PROXY_URL  = 'https://your-instance.herokuapp.com/'
 *   CORS_PROXY_KEY  = ''  (hoặc token nếu cần)
 */
const CORS_PROXY_URL = 'https://corsproxy.io/?'
const CORS_PROXY_KEY = 'e25a3964';

/** Endpoint gốc */
const API_ENDPOINT = 'https://api.dichvuchungsuc.com/v1/orders';

// ================================================================
//  STATE
// ================================================================
let isBusy        = false;
let sessionHistory = [];
let lastParsedCode = '';

// ================================================================
//  PROGRESS ENGINE
// ================================================================
const STAGES = [
  { pct: 0,   label: 'Đang khởi tạo...'                     },
  { pct: 15,  label: 'Đang phân tích mã mời...'             },
  { pct: 35,  label: 'Đang kết nối CORS proxy...'           },
  { pct: 58,  label: 'Đang gửi yêu cầu tới máy chủ...'     },
  { pct: 82,  label: 'Đang xử lý phản hồi...'               },
  { pct: 100, label: 'Hoàn thành!'                           },
];

let _rafHandle   = null;
let _pctCurrent  = 0;
let _pctTarget   = 0;

/** Animate progress bar mượt bằng RAF */
function _animatePct() {
  if (_rafHandle) cancelAnimationFrame(_rafHandle);
  const step = () => {
    const delta = _pctTarget - _pctCurrent;
    _pctCurrent = Math.abs(delta) < 0.3 ? _pctTarget : _pctCurrent + delta * 0.1;
    const rounded = Math.round(_pctCurrent);
    document.getElementById('progressBar').style.width = rounded + '%';
    document.getElementById('progressPct').textContent  = rounded + '%';
    if (_pctCurrent !== _pctTarget) {
      _rafHandle = requestAnimationFrame(step);
    }
  };
  _rafHandle = requestAnimationFrame(step);
}

function setStage(index) {
  const s = STAGES[Math.min(index, STAGES.length - 1)];
  _pctTarget = s.pct;
  document.getElementById('progressLabel').textContent = s.label;
  _animatePct();
}

function showProgress() {
  _pctCurrent = 0; _pctTarget = 0;
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressPct').textContent  = '0%';
  document.getElementById('progressWrap').classList.add('show');
}

function hideProgress() {
  document.getElementById('progressWrap').classList.remove('show');
}

// ================================================================
//  RESULT DISPLAY
// ================================================================
function showResult(type, html) {
  const el = document.getElementById('result');
  el.className = `result show ${type}`;
  el.innerHTML = html;
}

function hideResult() {
  const el = document.getElementById('result');
  el.className = 'result';
  el.innerHTML = '';
}

// ================================================================
//  HISTORY
// ================================================================
function addToHistory(code, qty, status, orderId) {
  sessionHistory.unshift({
    code, qty, status, orderId,
    time: new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }),
  });
  renderHistory();
}

function renderHistory() {
  if (sessionHistory.length === 0) return;

  document.getElementById('historyWrap').classList.add('show');
  document.getElementById('divider').style.display = 'block';

  document.getElementById('historyList').innerHTML = sessionHistory
    .map(h => {
      const badgeClass = h.status === 'ok' ? 'ok' : 'fail';
      const badgeText  = h.status === 'ok'
        ? `✓ #${h.orderId}`
        : '✗ Lỗi';
      return `
        <div class="hi">
          <span>
            <span class="hi-code">${escHtml(h.code)}</span>
            <span style="color:var(--text-dim)"> × ${h.qty}</span>
          </span>
          <span class="hi-right">
            <span class="hi-badge ${badgeClass}">${badgeText}</span>
            <span>${h.time}</span>
          </span>
        </div>`;
    })
    .join('');
}

function clearHistory() {
  sessionHistory = [];
  document.getElementById('historyWrap').classList.remove('show');
  document.getElementById('divider').style.display = 'none';
}

// ================================================================
//  LIVE PARSE (textarea → pill preview)
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('gameText').addEventListener('input', liveParseCode);
});

function liveParseCode() {
  const text  = document.getElementById('gameText').value;
  const match = text.match(/--([A-Za-z0-9_-]+)--/);
  const pill  = document.getElementById('parsedPill');
  const codeEl = document.getElementById('parsedCode');

  if (match) {
    lastParsedCode       = match[1];
    codeEl.textContent   = lastParsedCode;
    pill.classList.add('show');
  } else {
    lastParsedCode = '';
    pill.classList.remove('show');
  }
}

// ================================================================
//  ERROR MAP
// ================================================================
const ERROR_MAP = {
  400: 'Yêu cầu không hợp lệ (400) — Kiểm tra lại mã mời, định dạng có thể sai.',
  401: 'Sai API Key (401) — Mở script.js và kiểm tra lại biến <code>DVC_API_KEY</code>.',
  402: 'Hết tiền trong tài khoản (402) — Nạp thêm số dư tại dichvuchungsuc.com.',
  403: 'Không có quyền truy cập (403) — Tài khoản bị khoá hoặc dịch vụ bị chặn.',
  404: 'Không tìm thấy endpoint (404) — URL API có thể đã thay đổi.',
  409: 'Đơn trùng lặp (409) — Đơn này đã được tạo trước đó. Tránh bấm nhiều lần liên tiếp.',
  429: 'Quá nhiều yêu cầu (429) — Đợi vài giây rồi thử lại.',
  500: 'Lỗi máy chủ nội bộ (500) — Dịch vụ đang gặp sự cố, thử lại sau.',
  503: 'Máy chủ không khả dụng (503) — Dịch vụ đang bảo trì, thử lại sau ít phút.',
};

function getErrorMsg(status, serverMsg) {
  if (ERROR_MAP[status]) return ERROR_MAP[status];
  if (serverMsg)          return `Lỗi ${status}: ${escHtml(String(serverMsg))}`;
  return `Lỗi không xác định (HTTP ${status}).`;
}

// ================================================================
//  COPY ORDER ID
// ================================================================
function copyOrderId(id) {
  navigator.clipboard.writeText(String(id)).then(() => {
    const el = document.getElementById('orderIdEl');
    if (el) { el.textContent = `#${id} ✓`; setTimeout(() => { el.textContent = `#${id}`; }, 1500); }
  });
}

// ================================================================
//  MAIN — createOrder
// ================================================================
async function createOrder() {
  if (isBusy) return;

  hideResult();

  // ── Stage 1: Validate input ──────────────────────────────
  const rawText = document.getElementById('gameText').value.trim();
  const qty     = parseInt(document.getElementById('quantity').value, 10);

  showProgress();
  setStage(1);

  if (!rawText) {
    _finalize('error', '⚠️ Chưa có dữ liệu. Dán đoạn text từ game vào ô phía trên.');
    return;
  }

  const match = rawText.match(/--([A-Za-z0-9_-]+)--/);
  if (!match) {
    _finalize('error', '⚠️ Không tìm thấy mã mời. Text cần chứa dạng <code>--XXXXX--</code>.');
    return;
  }

  if (isNaN(qty) || qty < 1 || qty > 99) {
    _finalize('error', '⚠️ Số lượng không hợp lệ. Nhập số từ 1 đến 99.');
    return;
  }

  const lienQuanCode  = match[1]; // giữ nguyên hoa/thường từ source
  const idempotencyKey = 'shop-order-' + Date.now();
  // ── Lock UI ──────────────────────────────────────────────
  isBusy = true;
  document.getElementById('submitBtn').disabled = true;

  // ── Stage 2: Build request (kết nối proxy) ───────────────
  setStage(2);
  await sleep(180);

  const proxyTarget = CORS_PROXY_URL + encodeURIComponent(API_ENDPOINT);

  const headers = {
    'accept':          '*/*',
    'Content-Type':    'application/json',
    'Authorization':   `Bearer ${DVC_API_KEY}`,
    'Idempotency-Key': idempotencyKey,
  };

  // Thêm key tài khoản CorsProxy nếu đã điền
  if (CORS_PROXY_KEY && !CORS_PROXY_KEY.startsWith('YOUR_')) {
    headers['x-cors-api-key'] = CORS_PROXY_KEY;
  }

  const body = JSON.stringify({
    serviceCode:  'LIENQUAN_CHUNG_SUC',
    quantity:     qty,
    lienQuanCode: lienQuanCode,
  });

  // ── Stage 3: Gửi request ─────────────────────────────────
  setStage(3);

  try {
    const response = await fetch(proxyTarget, {
      method: 'POST',
      headers,
      body,
    });

    // ── Stage 4: Xử lý response ───────────────────────────
    setStage(4);

    let data = {};
    const ct = response.headers.get('content-type') || '';
    const raw = await response.text();
    try {
      data = JSON.parse(raw);
    } catch {
      data = { message: raw };
    }

    // ── Stage 5: Done ─────────────────────────────────────
    setStage(5);
    await sleep(350);

    if (response.status === 200 || response.status === 201) {
      // Lấy order ID từ nhiều dạng response có thể có
      const orderId = data?.order?.id ?? data?.orderId ?? data?.id ?? 'N/A';

      showResult('success',
        `✅ <strong>Tạo đơn thành công!</strong><br>
         Mã mời: <code>${escHtml(lienQuanCode)}</code> &nbsp;×&nbsp; ${qty}<br>
         Mã đơn hàng:
         <span class="order-id" id="orderIdEl"
               onclick="copyOrderId('${escHtml(String(orderId))}')"
               title="Nhấn để sao chép">
           #${escHtml(String(orderId))}
         </span>
         <span class="copy-hint">(nhấn để copy)</span>`
      );
      addToHistory(lienQuanCode, qty, 'ok', orderId);

    } else {
      const msg = getErrorMsg(response.status, data?.message ?? data?.error);
      showResult('error',
        `❌ ${msg}
         <br><button class="retry-btn" onclick="createOrder()">↺ Thử lại</button>`
      );
      addToHistory(lienQuanCode, qty, 'fail', null);
    }

  } catch (err) {
    setStage(5);
    await sleep(200);

    let errMsg = '❌ Không thể kết nối tới máy chủ.';
    if (err.name === 'TypeError') {
      errMsg += ` Kiểm tra lại <code>CORS_PROXY_URL</code> trong script.js.`;
      errMsg += `<br><small style="opacity:0.6">${escHtml(err.message)}</small>`;
    }
    showResult('error',
      `${errMsg}<br>
       <button class="retry-btn" onclick="createOrder()">↺ Thử lại</button>`
    );
    addToHistory(lastParsedCode || '?', qty, 'fail', null);

  } finally {
    hideProgress();
    document.getElementById('submitBtn').disabled = false;
    isBusy = false;
  }
}

// ================================================================
//  UTIL
// ================================================================
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Tắt lỗi "Please use a non-generic value" trên số âm ──
document.addEventListener('DOMContentLoaded', () => {
  const qInput = document.getElementById('quantity');
  qInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') createOrder();
  });
});
