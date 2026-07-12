(function () {
  const canvas = document.getElementById("qr-canvas");
  const statusEl = document.getElementById("status");
  const encodedUrlEl = document.getElementById("encoded-url");
  const urlInput = document.getElementById("url-input");
  const generateBtn = document.getElementById("generate-btn");
  const usePageBtn = document.getElementById("use-page-btn");
  const downloadBtn = document.getElementById("download-btn");
  const copyBtn = document.getElementById("copy-btn");

  let currentUrl = "";
  let currentFileName = "qr-code";
  let pageUrl = "";
  let pageTitle = "";

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", Boolean(isError));
    statusEl.classList.remove("is-hidden");
    canvas.classList.remove("is-ready");
  }

  function clearStatus() {
    statusEl.classList.add("is-hidden");
    statusEl.classList.remove("is-error");
  }

  function normalizeUrl(raw) {
    const value = (raw || "").trim();
    if (!value) return null;

    try {
      return new URL(value).href;
    } catch {
      try {
        return new URL(`https://${value}`).href;
      } catch {
        return null;
      }
    }
  }

  function shortenUrl(url) {
    if (url.length <= 56) return url;
    return `${url.slice(0, 28)}…${url.slice(-20)}`;
  }

  function sanitizeFilename(name) {
    const cleaned = String(name || "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "");
    return cleaned.slice(0, 120) || "qr-code";
  }

  function cleanTabTitle(title) {
    return String(title || "")
      .replace(
        /\s+[-–|•]\s+(Google Docs|Google Sheets|Google Slides|Google Forms|Google Drive|YouTube|Wikipedia)\s*$/i,
        ""
      )
      .trim();
  }

  function titleFromUrl(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "");
      const path = parsed.pathname;

      if (host === "docs.google.com") {
        if (path.includes("/document/")) return "Google Docs";
        if (path.includes("/spreadsheets/")) return "Google Sheets";
        if (path.includes("/presentation/")) return "Google Slides";
        if (path.includes("/forms/")) return "Google Forms";
        return "Google Docs";
      }
      if (host === "drive.google.com") return "Google Drive";
      if (host === "maps.google.com" || (host.endsWith("google.com") && path.startsWith("/maps"))) {
        return "Google Maps";
      }
      if (host === "youtu.be" || host.endsWith("youtube.com")) return "YouTube";
      if (host.endsWith("wikipedia.org")) {
        const article = path.split("/").filter(Boolean).pop();
        if (article) {
          return decodeURIComponent(article).replace(/_/g, " ");
        }
      }

      const segments = path.split("/").filter(Boolean);
      while (segments.length) {
        const raw = decodeURIComponent(segments.pop());
        const candidate = raw
          .replace(/\.[a-z0-9]{1,8}$/i, "")
          .replace(/[-_+]+/g, " ")
          .trim();
        if (candidate && !/^[a-z0-9_-]{16,}$/i.test(candidate)) {
          return candidate.replace(/\b\w/g, (char) => char.toUpperCase());
        }
      }

      const label = host.split(".")[0];
      return label.charAt(0).toUpperCase() + label.slice(1);
    } catch {
      return "qr-code";
    }
  }

  function setActionsEnabled(enabled) {
    downloadBtn.disabled = !enabled;
    copyBtn.disabled = !enabled;
  }

  function renderQr(url) {
    return new Promise((resolve, reject) => {
      QRCode.toCanvas(
        canvas,
        url,
        {
          width: 176,
          margin: 1,
          color: {
            dark: "#1a2330",
            light: "#ffffff",
          },
          errorCorrectionLevel: "M",
        },
        (error) => {
          if (error) reject(error);
          else resolve();
        }
      );
    });
  }

  async function generateForUrl(url, options = {}) {
    currentUrl = url;
    currentFileName = sanitizeFilename(options.title || titleFromUrl(url));

    encodedUrlEl.textContent = shortenUrl(url);
    encodedUrlEl.title = url;
    setActionsEnabled(false);
    setStatus("Generating…");

    try {
      await renderQr(url);
      clearStatus();
      canvas.classList.add("is-ready");
      setActionsEnabled(true);
    } catch (error) {
      console.error(error);
      setStatus("Could not generate QR code.", true);
      encodedUrlEl.textContent = "";
      setActionsEnabled(false);
    }
  }

  async function loadCurrentPage() {
    setStatus("Reading page…");
    setActionsEnabled(false);

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab || !tab.url) {
        setStatus("No active page URL found.", true);
        return;
      }

      if (
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("edge://") ||
        tab.url.startsWith("about:")
      ) {
        pageUrl = "";
        pageTitle = "";
        setStatus("Open a regular web page to auto-generate a QR code.", true);
        encodedUrlEl.textContent = "";
        return;
      }

      pageUrl = tab.url;
      pageTitle = cleanTabTitle(tab.title || "") || titleFromUrl(pageUrl);
      await generateForUrl(pageUrl, { title: pageTitle });
    } catch (error) {
      console.error(error);
      setStatus("Could not read the current page URL.", true);
    }
  }

  async function handleGenerate() {
    const normalized = normalizeUrl(urlInput.value);
    if (!normalized) {
      setStatus("Enter a valid link first.", true);
      encodedUrlEl.textContent = "";
      setActionsEnabled(false);
      urlInput.focus();
      return;
    }

    const title =
      normalized === pageUrl && pageTitle ? pageTitle : titleFromUrl(normalized);
    await generateForUrl(normalized, { title });
  }

  function handleDownload() {
    if (!currentUrl) return;
    const link = document.createElement("a");
    link.download = `${currentFileName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function handleCopy() {
    if (!currentUrl) return;
    try {
      await navigator.clipboard.writeText(currentUrl);
      const previous = copyBtn.textContent;
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = previous;
      }, 1200);
    } catch (error) {
      console.error(error);
    }
  }

  generateBtn.addEventListener("click", handleGenerate);
  usePageBtn.addEventListener("click", () => {
    urlInput.value = "";
    if (pageUrl) {
      generateForUrl(pageUrl, { title: pageTitle || titleFromUrl(pageUrl) });
    } else {
      loadCurrentPage();
    }
  });
  downloadBtn.addEventListener("click", handleDownload);
  copyBtn.addEventListener("click", handleCopy);

  urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleGenerate();
    }
  });

  loadCurrentPage();
})();
