/* =============================================================================
 * public/vote/vote.js
 * -----------------------------------------------------------------------------
 * The only script the two Drag Out The Vote pages run. Three jobs, and the
 * pages work without any of them:
 *
 *   countdown   #countdown on /vote. Days until Election Day; hours on the
 *               day before and on the day itself; a closing line once the
 *               polls close. Times are Eastern, read from config.js.
 *   copy        any [data-copy] button copies its attribute to the clipboard.
 *   share       #share-btn uses the Web Share API, falling back to copying
 *               the preset text when the browser has no share sheet.
 *
 * Every date and string comes from config.js. Nothing here is date-shaped.
 * ========================================================================== */

import CONFIG from "/vote/config.js";

const ET = "America/New_York";
const HOUR = 3600000;
const MINUTE = 60000;

/* ------------------------------------------------------------ countdown -- */

function dayInEastern(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return Date.UTC(get("year"), get("month") - 1, get("day")) / 86400000;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function countdownState(now) {
  const [y, m, d] = CONFIG.ELECTION_DAY.split("-").map(Number);
  const daysLeft = Date.UTC(y, m - 1, d) / 86400000 - dayInEastern(now);
  const opens = new Date(CONFIG.POLLS_OPEN_AT).getTime();
  const closes = new Date(CONFIG.POLLS_CLOSE_AT).getTime();
  const t = now.getTime();

  if (t >= closes) {
    return { big: null, small: "Polls have closed. Thank you for voting." };
  }
  if (daysLeft <= 0) {
    if (t < opens) {
      return { big: plural(Math.ceil((opens - t) / HOUR), "hour"), small: "until polls open. It is Election Day." };
    }
    const minutes = Math.ceil((closes - t) / MINUTE);
    const h = Math.floor(minutes / 60);
    const min = minutes % 60;
    return {
      big: h > 0 ? `${plural(h, "hour")} ${min} min` : `${min} min`,
      small: "until polls close. If you are in line at closing, you vote.",
    };
  }
  if (daysLeft === 1) {
    return { big: plural(Math.ceil((opens - t) / HOUR), "hour"), small: "until polls open on Election Day." };
  }
  return { big: plural(daysLeft, "day"), small: "until Election Day." };
}

function renderCountdown(el) {
  const { big, small } = countdownState(new Date());
  // Rebuild the children rather than innerHTML: nothing here is user input,
  // but there is also no markup to need it.
  el.replaceChildren();
  if (big) {
    const num = document.createElement("p");
    num.className = "dotv-count";
    num.textContent = big;
    el.appendChild(num);
  }
  const label = document.createElement("p");
  label.className = "dotv-count-label";
  label.textContent = small;
  el.appendChild(label);
}

const countdown = document.getElementById("countdown");
if (countdown) {
  renderCountdown(countdown);
  window.setInterval(() => renderCountdown(countdown), MINUTE);
}

/* ----------------------------------------------------------------- copy -- */

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the selection fallback */
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

const copyStatus = document.getElementById("copy-status");

function announce(message) {
  if (copyStatus) copyStatus.textContent = message;
}

for (const button of document.querySelectorAll("[data-copy]")) {
  const idle = button.textContent;
  let timer = 0;
  button.addEventListener("click", async () => {
    const ok = await copyText(button.getAttribute("data-copy") || "");
    button.textContent = ok ? "Copied" : "Could not copy. Select the text instead.";
    announce(ok ? "Copied to your clipboard." : "Copy failed. Select the text and copy it by hand.");
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      button.textContent = idle;
    }, 2400);
  });
}

/* ---------------------------------------------------------------- share -- */

const shareButton = document.getElementById("share-btn");
const shareStatus = document.getElementById("share-status");

if (shareButton) {
  const preset = `${CONFIG.SHARE_TEXT} ${CONFIG.VOTE_URL} ${CONFIG.HASHTAG}`;
  shareButton.addEventListener("click", async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Make your plan to vote",
          text: `${CONFIG.SHARE_TEXT} ${CONFIG.HASHTAG}`,
          url: CONFIG.VOTE_URL,
        });
        return;
      } catch (err) {
        // The person closed the sheet. Nothing to fall back to.
        if (err && err.name === "AbortError") return;
      }
    }
    const ok = await copyText(preset);
    if (shareStatus) {
      shareStatus.textContent = ok
        ? "Copied. Paste it into a story, a text, or the group chat."
        : `Copy this: ${preset}`;
    }
  });
}
