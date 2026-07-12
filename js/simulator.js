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
    var elAmount = $("simAmount");
    var elSender = $("simSender");
    var elTitle = $("simTitle");
    var elText = $("simText");
    var elUrl = $("simUrl");
    var elAuthType = $("simAuthType");
    var elHeaderWrap = $("headerNameWrap");
    var elHeaderName = $("simHeaderName");
    var elTokenWrap = $("tokenWrap");
    var elToken = $("simToken");
    var elJsonOut = $("jsonOut");
    var elResult = $("resultArea");

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

    // ---- Auto-fill title/text + phone preview ----
    var titleEdited = false, textEdited = false;
    elTitle.addEventListener("input", function () { titleEdited = true; });
    elText.addEventListener("input", function () { textEdited = true; });

    function defaultTitle() {
        var name = (elSender.value || "").trim();
        return name ? "Uang masuk dari " + name : "Uang masuk";
    }
    function defaultText() {
        return formatRupiah(elAmount.value) + " sudah masuk ke rekening Anda";
    }

    function refreshTemplates(force) {
        if (force || !titleEdited) { elTitle.value = defaultTitle(); }
        if (force || !textEdited) { elText.value = defaultText(); }
        updatePreview();
    }

    function updatePreview() {
        var src = currentSource();
        $("previewIco").textContent = src.ico;
        $("previewTitle").textContent = elTitle.value;
        $("previewText").textContent = elText.value;
        $("previewApp").textContent = src.name;
    }

    ["change", "input"].forEach(function (ev) {
        elSource.addEventListener(ev, function () { refreshTemplates(false); });
        elAmount.addEventListener(ev, function () { if (!textEdited) elText.value = defaultText(); updatePreview(); });
        elSender.addEventListener(ev, function () { if (!titleEdited) elTitle.value = defaultTitle(); updatePreview(); });
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

    function buildPayload() {
        var src = currentSource();
        var ms = Date.now();
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
            "User-Agent": "PayHook-Android/1.0"
        }, authHeaders());
    }

    // ---- Generate payload ----
    $("btnGenerate").addEventListener("click", function () {
        elJsonOut.textContent = JSON.stringify(buildPayload(), null, 2);
    });

    // ---- Copy cURL ----
    $("btnCurl").addEventListener("click", function () {
        var url = elUrl.value.trim() || "https://your-endpoint.example/webhook";
        var headers = baseHeaders();
        var payload = buildPayload();
        var lines = ["curl -X POST '" + url + "' \\"];
        Object.keys(headers).forEach(function (k) {
            lines.push("  -H '" + k + ": " + headers[k] + "' \\");
        });
        lines.push("  -d '" + JSON.stringify(payload) + "'");
        var cmd = lines.join("\n");
        navigator.clipboard.writeText(cmd).then(function () {
            elJsonOut.textContent = cmd;
            var btn = $("btnCurl");
            var prev = btn.innerHTML;
            btn.textContent = lang() === "en" ? "cURL copied!" : "cURL tersalin!";
            setTimeout(function () { btn.innerHTML = prev; }, 1500);
        });
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
    $("btnSend").addEventListener("click", function () {
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
        fetch(RELAY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: url,
                headers: baseHeaders(),
                body: buildPayload()
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
    refreshTemplates(true);
})();
