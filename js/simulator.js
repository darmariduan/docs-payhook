/* ============================================================
   PayHook Sandbox Simulator
   Builds a webhook payload identical to WebhookSender.kt,
   generates cURL, and optionally sends a live test via a
   serverless relay (to bypass browser CORS).
   ============================================================ */
(function () {
    "use strict";

    // ---------------------------------------------------------
    // CONFIG: set relay URL in index.html via
    // window.PAYHOOK_RELAY_URL = "https://...workers.dev";
    // Fallback to empty string means live relay is disabled.
    // ---------------------------------------------------------
    var RELAY_URL =
        typeof window.PAYHOOK_RELAY_URL === "string"
            ? window.PAYHOOK_RELAY_URL.trim()
            : "";

    // Supported sources (source name + Android package + short icon letter)
    var SOURCES = [
        { name: "BCA Mobile", pkg: "com.bca", ico: "B" },
        { name: "myBCA", pkg: "com.bca.myBCA", ico: "B" },
        { name: "BRImo", pkg: "id.co.bri.brimo", ico: "R" },
        { name: "BNI Mobile", pkg: "com.bni.mobilebanking", ico: "N" },
        { name: "wondr by BNI", pkg: "id.co.bni.wondr", ico: "W" },
        { name: "Livin' by Mandiri", pkg: "id.bmri.livin", ico: "M" },
        { name: "BSI Mobile", pkg: "com.bsi.universalbanking", ico: "S" },
        { name: "Jenius", pkg: "com.btpn.dc", ico: "J" },
        { name: "DANA", pkg: "com.dana.id", ico: "D" },
        { name: "GoPay", pkg: "com.gojek.app", ico: "G" },
        { name: "ShopeePay", pkg: "com.shopee.id", ico: "S" },
        { name: "OVO", pkg: "id.co.ovo.app", ico: "O" },
        { name: "LinkAja", pkg: "com.linkaja", ico: "L" }
    ];

    var $ = function (id) { return document.getElementById(id); };
    var lang = function () { return document.documentElement.getAttribute("data-lang") || "id"; };

    // ---- Elements ----
    var elSource = $("simSource");
    var elEventType = $("simEventType");
    var elPaymentOptions = $("paymentOptions");
    var elHeartbeatOptions = $("heartbeatOptions");
    var elAmount = $("simAmount");
    var elSender = $("simSender");
    var elTitle = $("simTitle");
    var elText = $("simText");
    var elHeartbeatConnected = $("simHeartbeatConnected");
    var elHeartbeatBattery = $("simHeartbeatBattery");
    var elHeartbeatLastEventSec = $("simHeartbeatLastEventSec");
    var elPreviewMode = $("simPreviewMode");
    var elUrl = $("simUrl");
    var elAuthType = $("simAuthType");
    var elHeaderWrap = $("headerNameWrap");
    var elHeaderName = $("simHeaderName");
    var elTokenWrap = $("tokenWrap");
    var elToken = $("simToken");
    var elSecret = $("simSecret");
    var elJsonOut = $("jsonOut");
    var elResult = $("resultArea");
    var elPreviewNotif = $("previewNotif");
    var elHeartbeatPreview = $("heartbeatPreview");

    if (!elSource) return; // simulator not on page

    // ---- Populate sources ----
    SOURCES.forEach(function (s, i) {
        var opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = s.name;
        elSource.appendChild(opt);
    });

    if (window.jQuery && window.jQuery.fn && window.jQuery.fn.select2) {
        window.jQuery(elSource).select2({
            width: "100%",
            dropdownAutoWidth: true
        });
    }

    function currentSource() { return SOURCES[parseInt(elSource.value, 10) || 0]; }

    function formatRupiah(n) {
        return "Rp " + Number(n || 0).toLocaleString("id-ID") + ",00";
    }

    function isHeartbeatMode() {
        return !!elEventType && elEventType.value === "heartbeat";
    }

    function resolvePreviewMode() {
        var selected = elPreviewMode && elPreviewMode.value ? elPreviewMode.value : "auto";
        if (selected === "notif" || selected === "status") return selected;
        return isHeartbeatMode() ? "status" : "notif";
    }

    function refreshPreviewModeUI() {
        var mode = resolvePreviewMode();
        if (elPreviewNotif) elPreviewNotif.style.display = mode === "notif" ? "flex" : "none";
        if (elHeartbeatPreview) elHeartbeatPreview.style.display = mode === "status" ? "block" : "none";
    }

    function refreshModeUI() {
        var heartbeat = isHeartbeatMode();
        if (elPaymentOptions) elPaymentOptions.style.display = heartbeat ? "none" : "";
        if (elHeartbeatOptions) elHeartbeatOptions.style.display = heartbeat ? "" : "none";
        refreshPreviewModeUI();
    }

    // ---- Auto-fill title/text + phone preview ----
    var titleEdited = false, textEdited = false;
    elTitle.addEventListener("input", function () { titleEdited = true; });
    elText.addEventListener("input", function () { textEdited = true; });

    function defaultTitle() {
        if (isHeartbeatMode()) return "PayHook heartbeat";
        var name = (elSender.value || "").trim();
        return name ? "Uang masuk dari " + name : "Uang masuk";
    }
    function defaultText() {
        if (isHeartbeatMode()) return "Perangkat PayHook online";
        return formatRupiah(elAmount.value) + " sudah masuk ke rekening Anda";
    }

    function refreshTemplates(force) {
        if (force || !titleEdited) { elTitle.value = defaultTitle(); }
        if (force || !textEdited) { elText.value = defaultText(); }
        updatePreview();
    }

    function updatePreview() {
        var src = currentSource();
        $("previewIco").textContent = isHeartbeatMode() ? "P" : src.ico;
        $("previewTitle").textContent = elTitle.value;
        $("previewText").textContent = elText.value;
        $("previewApp").textContent = isHeartbeatMode() ? "PayHook System" : src.name;
        updateHeartbeatPreview();
        refreshPreviewModeUI();
    }

    function updateHeartbeatPreview() {
        var connected = (elHeartbeatConnected && elHeartbeatConnected.value) !== "false";
        var battery = (elHeartbeatBattery && elHeartbeatBattery.value) === "true";
        var lastEventSec = parseInt(elHeartbeatLastEventSec && elHeartbeatLastEventSec.value, 10);
        if (!Number.isFinite(lastEventSec) || lastEventSec < 0) lastEventSec = 120;

        $("previewHbConnected").textContent = connected ? "true" : "false";
        $("previewHbBattery").textContent = battery ? "true" : "false";
        $("previewHbLastEvent").textContent = lastEventSec + "s ago";
        $("previewHbStatus").textContent = connected ? "ONLINE" : "OFFLINE";
    }

    ["change", "input"].forEach(function (ev) {
        if (elEventType) elEventType.addEventListener(ev, function () {
            titleEdited = false;
            textEdited = false;
            refreshModeUI();
            refreshTemplates(true);
        });
        if (elPreviewMode) elPreviewMode.addEventListener(ev, refreshPreviewModeUI);
        elSource.addEventListener(ev, function () { refreshTemplates(false); });
        elAmount.addEventListener(ev, function () { if (!textEdited) elText.value = defaultText(); updatePreview(); });
        elSender.addEventListener(ev, function () { if (!titleEdited) elTitle.value = defaultTitle(); updatePreview(); });
        if (elHeartbeatConnected) elHeartbeatConnected.addEventListener(ev, updatePreview);
        if (elHeartbeatBattery) elHeartbeatBattery.addEventListener(ev, updatePreview);
        if (elHeartbeatLastEventSec) elHeartbeatLastEventSec.addEventListener(ev, updatePreview);
    });
    elTitle.addEventListener("input", updatePreview);
    elText.addEventListener("input", updatePreview);

    // ---- Auth type UI ----
    function refreshAuthUI() {
        var t = elAuthType.value;
        elHeaderWrap.style.display = t === "api_key" ? "" : "none";
        elTokenWrap.style.display = t === "none" ? "none" : "";
    }
    elAuthType.addEventListener("change", refreshAuthUI);

    // ---- Build payload (mirror of WebhookSender.buildJsonPayload) ----
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    function formatTimestamp(ms) {
        var d = new Date(ms);
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
            " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    }

    function buildPaymentPayload(ms) {
        var src = currentSource();
        var rand = Math.random().toString(16).slice(2, 8);
        return {
            event_id: "evt_" + ms + "_" + rand,
            event_type: "payment.incoming",
            amount: parseInt(elAmount.value, 10) || 0,
            source: src.name,
            reference: "PH-" + ms,
            timestamp: formatTimestamp(ms),
            package_name: src.pkg,
            notification_title: elTitle.value,
            notification_text: elText.value,
            sent_by: "PayHook"
        };
    }

    function buildHeartbeatPayload(ms) {
        var rand = Math.random().toString(16).slice(2, 14);
        var lastEventSec = parseInt(elHeartbeatLastEventSec && elHeartbeatLastEventSec.value, 10);
        if (!Number.isFinite(lastEventSec) || lastEventSec < 0) lastEventSec = 120;
        return {
            type: "heartbeat",
            device_id: "ph-" + rand,
            app_version: "1.5.0",
            listener_connected: (elHeartbeatConnected && elHeartbeatConnected.value) !== "false",
            battery_optimized: (elHeartbeatBattery && elHeartbeatBattery.value) === "true",
            last_event_at: ms - (lastEventSec * 1000),
            sent_at: ms
        };
    }

    function buildPayload() {
        var ms = Date.now();
        return isHeartbeatMode() ? buildHeartbeatPayload(ms) : buildPaymentPayload(ms);
    }

    function authHeaders() {
        var t = elAuthType.value;
        var token = elToken.value || "";
        var h = {};
        if (t === "bearer") h["Authorization"] = "Bearer " + token;
        else if (t === "api_key") h[(elHeaderName.value || "X-API-Key")] = token;
        else if (t === "basic") h["Authorization"] = "Basic " + btoa(token);
        return h;
    }

    function baseHeaders() {
        return Object.assign({
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "PayHook-Android/2.0"
        }, authHeaders());
    }

    function randomHex(bytesLen) {
        var arr = new Uint8Array(bytesLen);
        window.crypto.getRandomValues(arr);
        return Array.prototype.map.call(arr, function (b) {
            return b.toString(16).padStart(2, "0");
        }).join("");
    }

    function toHex(buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), function (b) {
            return b.toString(16).padStart(2, "0");
        }).join("");
    }

    async function hmacSha256Hex(secret, message) {
        var enc = new TextEncoder();
        var key = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        var sig = await window.crypto.subtle.sign("HMAC", key, enc.encode(message));
        return toHex(sig);
    }

    async function buildRequestContext() {
        var payload = buildPayload();
        var raw = JSON.stringify(payload);
        var headers = baseHeaders();
        var secret = elSecret && elSecret.value ? elSecret.value.trim() : "";

        if (secret) {
            if (!(window.crypto && window.crypto.subtle && window.TextEncoder)) {
                throw new Error("Web Crypto API tidak tersedia untuk membuat signature HMAC.");
            }
            var ts = String(Math.floor(Date.now() / 1000));
            headers["X-Payhook-Timestamp"] = ts;
            headers["X-Payhook-Nonce"] = randomHex(8);
            headers["X-Payhook-Signature"] = "sha256=" + await hmacSha256Hex(secret, ts + "." + raw);
        }

        return {
            payload: payload,
            raw: raw,
            headers: headers
        };
    }

    function shellQuoteSingle(s) {
        return "'" + String(s).replace(/'/g, "'\"'\"'") + "'";
    }

    // ---- Generate payload ----
    $("btnGenerate").addEventListener("click", function () {
        elJsonOut.textContent = JSON.stringify(buildPayload(), null, 2);
    });

    // ---- Copy cURL ----
    $("btnCurl").addEventListener("click", async function () {
        try {
            var url = elUrl.value.trim() || "https://your-endpoint.example/webhook";
            var ctx = await buildRequestContext();
            var lines = ["curl -X POST " + shellQuoteSingle(url) + " \\"];
            Object.keys(ctx.headers).forEach(function (k) {
                lines.push("  -H " + shellQuoteSingle(k + ": " + ctx.headers[k]) + " \\");
            });
            lines.push("  -d " + shellQuoteSingle(ctx.raw));
            var cmd = lines.join("\n");
            await navigator.clipboard.writeText(cmd);
            elJsonOut.textContent = cmd;
            var btn = $("btnCurl");
            var prev = btn.innerHTML;
            btn.textContent = lang() === "en" ? "cURL copied!" : "cURL tersalin!";
            setTimeout(function () { btn.innerHTML = prev; }, 1500);
        } catch (err) {
            renderResult({ success: false, error: String(err && err.message || err) });
        }
    });

    // ---- Result rendering ----
    function renderResult(state) {
        var isEn = lang() === "en";
        var badge, headLabel;
        if (state.loading) {
            elResult.innerHTML =
                '<div class="result-card"><div class="result-head">' +
                '<span class="status"><span class="spinner"></span> ' +
                (isEn ? "Sending…" : "Mengirim…") + "</span></div></div>";
            return;
        }
        var ok = state.success;
        badge = ok ? '<span class="badge on">' + (ok ? "SUCCESS" : "") + "</span>"
            : '<span class="badge off">FAILED</span>';
        headLabel = ok ? (isEn ? "Delivered" : "Terkirim") : (isEn ? "Failed" : "Gagal");
        var meta = [];
        if (state.code) meta.push("HTTP " + state.code);
        if (typeof state.latency === "number") meta.push(state.latency + " ms");
        elResult.innerHTML =
            '<div class="result-card">' +
            '<div class="result-head"><span class="status">' + badge + " " + headLabel + "</span></div>" +
            (state.body ? '<div class="result-body"><pre>' + escapeHtml(state.body) + "</pre></div>" : "") +
            (meta.length ? '<div class="result-meta"><span>' + meta.join("</span><span>") + "</span></div>" : "") +
            (state.error ? '<div class="result-meta" style="color:var(--error)">' + escapeHtml(state.error) + "</div>" : "") +
            "</div>";
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>]/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
        });
    }

    // ---- Send live test (via relay) ----
    $("btnSend").addEventListener("click", async function () {
        var url = elUrl.value.trim();
        var isEn = lang() === "en";
        if (!url) {
            renderResult({ success: false, error: isEn ? "Please enter webhook URL/ Endpoint." : "Masukkan URL Webhook/ Endpoint." });
            return;
        }
        if (!/^https?:\/\//i.test(url)) {
            renderResult({ success: false, error: isEn ? "URL must start with http(s)://" : "URL harus diawali http(s)://" });
            return;
        }
        if (!RELAY_URL) {
            renderResult({
                success: false,
                error: isEn
                    ? "Live relay is not configured. Use \"Copy cURL\" instead, or set window.PAYHOOK_RELAY_URL in index.html after deploying relay/worker.js."
                    : "Relay live belum dikonfigurasi. Gunakan \"Salin cURL\", atau isi window.PAYHOOK_RELAY_URL di index.html setelah deploy relay/worker.js."
            });
            return;
        }

        renderResult({ loading: true });
        var started = Date.now();
        var ctx;
        try {
            ctx = await buildRequestContext();
        } catch (err) {
            renderResult({ success: false, error: String(err && err.message || err) });
            return;
        }

        fetch(RELAY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: url,
                headers: ctx.headers,
                body: ctx.payload,
                raw_body: ctx.raw
            })
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var latency = Date.now() - started;
                renderResult({
                    success: !!data.ok && data.status >= 200 && data.status < 300,
                    code: data.status,
                    body: data.body || "",
                    latency: latency,
                    error: data.error || ""
                });
            })
            .catch(function (err) {
                renderResult({ success: false, latency: Date.now() - started, error: String(err && err.message || err) });
            });
    });

    // ---- Re-render result labels on language change ----
    document.addEventListener("payhook:lang", function () {
        // preview text is language-neutral (Indonesian notif); nothing to translate here
    });

    // ---- Init ----
    refreshAuthUI();
    refreshModeUI();
    refreshTemplates(true);
    refreshPreviewModeUI();
})();
