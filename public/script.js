import { sdk } from "https://esm.sh/@farcaster/miniapp-sdk";
import { Attribution } from "https://esm.sh/ox/erc8021";
import { $, $all, toast, haptic, formatDateStamp, animateScrap } from "./Inkwell-ui.js";

const APP = "Inkwell";
const STORAGE_KEY = "inkwell_entries_v1";

// Base Builder Code: find yours at base.dev → Settings → Builder Code
const BUILDER_CODE = "bc_y3qsg8sr";
const RECIPIENT = "0x04514c3d1a7074E6972190A5632875F4d14785F8";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_MAINNET = "0x2105";
const BASE_SEPOLIA = "0x14a34";

window.addEventListener("load", async () => {
  const isMini = await sdk.isInMiniApp();
  await sdk.actions.ready();
// ---------- Mini App detect (safe, no hang) ----------
  let isMini = false;

  try {
    isMini = await Promise.race([
      new Promise((res) => setTimeout(() => res(false), 800)),
    ]);
  } catch (e) {
    isMini = false;
  }

  // Always call ready (required), but don't let it crash the app if unavailable
  try {
  } catch (e) {}

  const envPill = $("#envPill");
  if (envPill) envPill.textContent = isMini ? "Mini App" : "Browser";
  document.documentElement.dataset.env = isMini ? "mini" : "web";

  // ---------- Daily prompt ----------
  const prompts = [
    "Annotate the oddest metaphor you noticed today.",
    "Extract one argument you disagree with—and why.",
    "Summarize a page in 17 words.",
    "List three hidden assumptions in the piece.",
    "Copy a sentence worth stealing (ethically).",
    "Find the author’s quietest claim.",
    "Note one term you must define before tomorrow.",
    "Write the counter-headline you expected.",
    "Identify the missing stakeholder.",
    "Mark a statistic to verify later.",
    "Sketch the logic chain in 5 bullets.",
    "Spot the emotional lever being pulled.",
    "Record a question only a specialist could answer.",
    "Turn the thesis into a single testable prediction.",
    "Write one analogy that makes it clearer.",
    "Where does the argument change gear?",
    "Clip a quote to reuse in a future debate.",
    "Name the “villain” and “hero” in the framing.",
    "Find the paragraph that would not survive editing.",
    "Translate jargon into kitchen-table English.",
    "Locate the quiet contradiction.",
    "Note the source you should read next.",
    "Write a one-line takeaway for your future self.",
    "Choose one sentence to highlight in ink-red.",
  ];

  const daySeed = Math.floor(Date.now() / 86400000);
  let promptIndex = daySeed % prompts.length;

  const setPrompt = (i) => {
    $("#promptText").textContent = prompts[(i + prompts.length) % prompts.length];
  };
  setPrompt(promptIndex);

  $("#newPromptBtn").addEventListener("click", () => {
    promptIndex = (promptIndex + 1 + Math.floor(Math.random() * 3)) % prompts.length;
    setPrompt(promptIndex);
    haptic();
  });

  // ---------- Load & render entries ----------
  const entries = loadEntries();
  render(entries);

  $("#tearBtn").addEventListener("click", async () => {
    const url = ($("#urlInput").value || "").trim();
    const clip = ($("#clipInput").value || "").trim();
    if (!clip) {
      toast("Write or paste a snippet first.");
      return;
    }
    haptic();

    // Animation: scrap flies to the journal
    const target = $("#entries");
    await animateScrap($("#clipInput"), target, clip);

    const entry = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      url,
      clip,
      prompt: $("#promptText").textContent,
    };
    entries.unshift(entry);
    saveEntries(entries);
    render(entries);

    $("#clipInput").value = "";
    $("#urlInput").value = "";
  });

  $("#clearBtn").addEventListener("click", () => {
    $("#clipInput").value = "";
    $("#urlInput").value = "";
    toast("Cleared.");
  });

  // ---------- Tip sheet ----------
  const tipBackdrop = $("#tipBackdrop");
  const tipSheet = $("#tipSheet");
  const customAmt = $("#customAmt");
  const sendTipBtn = $("#sendTipBtn");

  let selectedAmt = null;
  let state = "idle"; // idle | preparing | confirm | sending | done

  function openTip() {
    tipBackdrop.hidden = false;
    tipSheet.hidden = false;
    tipBackdrop.classList.add("show");
    tipSheet.classList.add("show");
    setTimeout(() => customAmt.focus(), 120);
  }
  function closeTip() {
    tipBackdrop.classList.remove("show");
    tipSheet.classList.remove("show");
    setTimeout(() => {
      tipBackdrop.hidden = true;
      tipSheet.hidden = true;
    }, 160);
  }

  $("#tipBtn").addEventListener("click", () => {
    openTip();
    haptic();
  });
  $("#closeTipBtn").addEventListener("click", closeTip);
  tipBackdrop.addEventListener("click", closeTip);

  $all(".chip", $("#presetGrid")).forEach((btn) => {
    btn.addEventListener("click", () => {
      $all(".chip", $("#presetGrid")).forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      selectedAmt = btn.dataset.amt;
      customAmt.value = "";
      haptic();
    });
  });

  customAmt.addEventListener("input", () => {
    if (customAmt.value.trim().length) {
      $all(".chip", $("#presetGrid")).forEach((b) => b.classList.remove("on"));
      selectedAmt = null;
    }
  });

  function setState(next) {
    state = next;
    if (state === "idle") sendTipBtn.textContent = "Send USDC";
    if (state === "preparing") sendTipBtn.textContent = "Preparing tip…";
    if (state === "confirm") sendTipBtn.textContent = "Confirm in wallet";
    if (state === "sending") sendTipBtn.textContent = "Sending…";
    if (state === "done") sendTipBtn.textContent = "Send again";
    sendTipBtn.disabled = state !== "idle" && state !== "done";
  }
  setState("idle");

  sendTipBtn.addEventListener("click", async () => {
    if (state === "done") {
      setState("idle");
      return;
    }

    const amtStr = (selectedAmt ?? customAmt.value).trim();
    const parsed = parseAmount6(amtStr);
    if (!parsed.ok) {
      toast(parsed.error);
      return;
    }

    if (RECIPIENT.startsWith("TODO") || BUILDER_CODE.startsWith("TODO")) {
      toast("Tip sending disabled until RECIPIENT + BUILDER_CODE are set in script.js.");
      return;
    }

    setState("preparing");
    await preflightInkAnimation(parsed.display);

    try {
      setState("confirm");
      await sendUSDC(parsed.units, RECIPIENT);
      setState("sending");
      await sleep(650);
      setState("done");
      toast("Tip sent (or queued). Thank you.");
    } catch (err) {
      toast(friendlyErr(err));
      setState("idle");
    }
  });
});

// ------------------------ Data ------------------------

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 60)));
}

function render(entries) {
  const root = $("#entries");
  root.innerHTML = "";
  $("#emptyState").style.display = entries.length ? "none" : "block";

  for (const e of entries) {
    const item = document.createElement("article");
    item.className = "entry";
    item.innerHTML = `
      <div class="entryTop">
        <div class="stamp">${escapeHtml(formatDateStamp(e.ts))}</div>
        ${e.url ? `<a class="link" href="${escapeHtml(e.url)}" target="_blank" rel="noopener">source</a>` : ""}
      </div>
      <div class="clip">${escapeHtml(e.clip)}</div>
      <div class="marginalia">Marginalia: <span>${escapeHtml(e.prompt || "")}</span></div>
    `;
    root.appendChild(item);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ------------------------ Tip / Onchain ------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function preflightInkAnimation() {
  const sheet = $("#tipSheet");
  sheet.classList.add("inkpulse");
  await sleep(1200);
  sheet.classList.remove("inkpulse");
}

function parseAmount6(s) {
  const str = (s || "").trim();
  if (!str) return { ok: false, error: "Enter an amount." };
  if (!/^\d+(?:\.\d{0,6})?$/.test(str))
    return { ok: false, error: "Invalid amount format (max 6 decimals)." };

  const [whole, frac = ""] = str.split(".");
  const fracPadded = (frac + "000000").slice(0, 6);

  try {
    const units = BigInt(whole) * 1000000n + BigInt(fracPadded);
    if (units <= 0n) return { ok: false, error: "Amount must be > 0." };
    return { ok: true, units, display: str };
  } catch {
    return { ok: false, error: "Amount too large." };
  }
}

function pad32(hexNo0x) {
  return hexNo0x.padStart(64, "0");
}

function encodeERC20Transfer(to, amountUnits) {
  const selector = "a9059cbb";
  const addr = to.toLowerCase().replace(/^0x/, "");
  if (addr.length !== 40) throw new Error("Bad recipient address.");
  const amt = amountUnits.toString(16);
  return "0x" + selector + pad32(addr) + pad32(amt);
}

async function ensureBaseChain(ethereum) {
  const chainId = await ethereum.request({ method: "eth_chainId" });
  if (chainId === BASE_MAINNET || chainId === BASE_SEPOLIA) return chainId;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_MAINNET }],
    });
    return BASE_MAINNET;
  } catch {
    throw new Error("Please switch to Base in your wallet to send USDC.");
  }
}

async function sendUSDC(amountUnits, recipient) {
  const ethereum = window.ethereum;
  if (!ethereum || !ethereum.request) throw new Error("No EVM wallet found in this environment.");

  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  const from = accounts?.[0];
  if (!from) throw new Error("No account available.");

  const chainId = await ensureBaseChain(ethereum);
  const data = encodeERC20Transfer(recipient, amountUnits);

  const dataSuffix = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

  const params = [
    {
      version: "2.0.0",
      from,
      chainId,
      atomicRequired: true,
      calls: [{ to: USDC_BASE, value: "0x0", data }],
      capabilities: { dataSuffix },
    },
  ];

  try {
    return await ethereum.request({ method: "wallet_sendCalls", params });
  } catch (err) {
    if (String(err?.code) === "4001" || /rejected|denied/i.test(String(err?.message))) {
      throw new Error("No worries—tip canceled.");
    }
    throw err;
  }
}

function friendlyErr(err) {
  const m = String(err?.message || err || "");
  if (!m) return "Something went wrong.";
  return m.slice(0, 180);
}