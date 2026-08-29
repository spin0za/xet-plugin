(() => {
  const modules = (globalThis.__xetPlayerHelperModules ||= {});
  if (modules.toast) return;

  let hideTimer = null;

  function show(message) {
    if (window.top !== window) return;

    let toast = document.getElementById("xet-ultra-quality-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "xet-ultra-quality-toast";
      Object.assign(toast.style, {
        position: "fixed",
        right: "20px",
        bottom: "72px",
        zIndex: "2147483647",
        padding: "9px 13px",
        borderRadius: "8px",
        background: "rgba(20, 20, 20, .88)",
        color: "#fff",
        font: "13px/1.4 system-ui, sans-serif",
        boxShadow: "0 4px 16px rgba(0, 0, 0, .25)",
        opacity: "0",
        transition: "opacity .18s ease",
        pointerEvents: "none",
      });
      document.documentElement.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = "1";
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      toast.style.opacity = "0";
      hideTimer = null;
    }, 1_800);
  }

  modules.toast = Object.freeze({ show });
})();
