/* ============================================================
   PayHook Docs — UI behaviour
   Language toggle, mobile nav, scroll-spy, tabs, copy buttons.
   ============================================================ */
(function () {
    "use strict";

    var html = document.documentElement;
    var body = document.body;

    /* ---------- Language toggle (persisted) ---------- */
    var STORAGE_KEY = "payhook-lang";
    function setLang(lang) {
        if (lang !== "id" && lang !== "en") lang = "id";
        html.setAttribute("data-lang", lang);
        html.setAttribute("lang", lang);
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { }
        document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
            btn.classList.toggle("active", btn.getAttribute("data-lang-btn") === lang);
        });
        document.dispatchEvent(new CustomEvent("payhook:lang", { detail: lang }));
    }
    var savedLang = "id";
    try { savedLang = localStorage.getItem(STORAGE_KEY) || "id"; } catch (e) { }
    setLang(savedLang);
    document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            setLang(btn.getAttribute("data-lang-btn"));
        });
    });

    /* ---------- Mobile nav ---------- */
    var menuToggle = document.getElementById("menuToggle");
    var backdrop = document.getElementById("backdrop");
    function closeNav() { body.classList.remove("nav-open"); }
    if (menuToggle) menuToggle.addEventListener("click", function () { body.classList.toggle("nav-open"); });
    if (backdrop) backdrop.addEventListener("click", closeNav);
    document.querySelectorAll(".sidebar .nav-link").forEach(function (a) {
        a.addEventListener("click", closeNav);
    });

    /* ---------- Scroll-spy (highlight active section) ---------- */
    var navLinks = Array.prototype.slice.call(document.querySelectorAll(".sidebar .nav-link"));
    var sections = navLinks
        .map(function (a) {
            var id = a.getAttribute("href").slice(1);
            return { link: a, el: document.getElementById(id) };
        })
        .filter(function (s) { return s.el; });

    if ("IntersectionObserver" in window && sections.length) {
        var observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        navLinks.forEach(function (l) { l.classList.remove("active"); });
                        var match = sections.find(function (s) { return s.el === entry.target; });
                        if (match) match.link.classList.add("active");
                    }
                });
            },
            { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
        );
        sections.forEach(function (s) { observer.observe(s.el); });
    }

    /* ---------- Tabs (works for every .tabs container) ---------- */
    document.querySelectorAll(".tabs").forEach(function (tabWrap) {
        var buttons = tabWrap.querySelectorAll(".tab-bar button");
        var panels = tabWrap.querySelectorAll(".tab-panel");
        buttons.forEach(function (btn) {
            btn.addEventListener("click", function () {
                var key = btn.getAttribute("data-tab");
                buttons.forEach(function (b) { b.classList.toggle("active", b === btn); });
                panels.forEach(function (p) {
                    p.classList.toggle("active", p.getAttribute("data-panel") === key);
                });
            });
        });
    });

    /* ---------- Copy buttons ---------- */
    function flash(btn) {
        var prev = btn.innerHTML;
        btn.textContent = html.getAttribute("data-lang") === "en" ? "Copied!" : "Tersalin!";
        setTimeout(function () { btn.innerHTML = prev; }, 1400);
    }
    document.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-copy-target], .copy-btn");
        if (!btn) return;
        var text;
        var targetId = btn.getAttribute("data-copy-target");
        if (targetId) {
            var el = document.getElementById(targetId);
            text = el ? el.textContent : "";
        } else {
            var pre = btn.parentElement.querySelector("pre");
            text = pre ? pre.textContent : "";
        }
        if (!text) return;
        navigator.clipboard.writeText(text).then(function () { flash(btn); });
    });

    /* ---------- Year ---------- */
    var y = String(new Date().getFullYear());
    ["year", "yearEn"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.textContent = y;
    });
})();
