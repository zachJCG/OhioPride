/* ============================================================
   Ohio Pride PAC, Scorecard Social Sharing
   Last updated: 04/22/26

   Public API (called from scorecard.html):
     OPP_SHARE.slugify(member)               -> "callender-h57"
     OPP_SHARE.shareUrl(member)              -> "https://ohiopride.org/scorecard?rep=callender-h57"
     OPP_SHARE.shareToFacebook(member)       -> generates + downloads PNG, opens FB sharer,
                                                copies caption to clipboard
     OPP_SHARE.copyShareLink(member)         -> Promise<bool>
     OPP_SHARE.generateInstagramPost(member) -> downloads PNG (uses html2canvas)

   Member shape from scorecard render loop:
     { d, name, party, v, s, n, notes, chamber, score, grade }
   chamber is "House" or "Senate"; grade is the GRADE_SCALE entry
   { min, grade, label, color }.
   ============================================================ */
(function (global) {
  "use strict";

  var SITE = "https://ohiopride.org";

  /* Strip suffixes (Jr., III, etc.), punctuation, and pull last token. */
  function lastNameOf(fullName) {
    var cleaned = String(fullName || "")
      .replace(/[.,]/g, " ")
      .replace(/\s+(Jr|Sr|II|III|IV|V)$/i, "")
      .trim();
    var parts = cleaned.split(/\s+/);
    return (parts[parts.length - 1] || "rep").toLowerCase();
  }

  function slugify(member) {
    var chamberLetter = member.chamber === "Senate" ? "s" : "h";
    return lastNameOf(member.name) + "-" + chamberLetter + member.d;
  }

  function shareUrl(member) {
    return SITE + "/scorecard?rep=" + encodeURIComponent(slugify(member));
  }

  function shareCaption(member) {
    return "Check out " + member.name + "'s grade on Ohio Pride. " + shareUrl(member);
  }

  function copyShareLink(member) {
    return writeClipboard(shareUrl(member));
  }

  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return Promise.resolve(!!ok);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /* Build a 1080x1080 card off-screen, PNG it, and download. */
  function generateCardImage(member) {
    return new Promise(function (resolve, reject) {
      if (typeof html2canvas !== "function") {
        alert("Share image generator is still loading. Try again in a moment.");
        return reject(new Error("html2canvas not loaded"));
      }

      var grade = member.grade || { grade: "?", color: "#888", label: "" };
      var partyLabel = member.party === "D" ? "Democrat" : "Republican";

      var stage = document.createElement("div");
      stage.style.cssText = [
        "position:fixed",
        "left:-10000px",
        "top:0",
        "width:1080px",
        "height:1080px",
        "background:#0F2233",
        "color:#fff",
        "font-family:'Montserrat',Arial,sans-serif",
        "padding:80px",
        "box-sizing:border-box",
        "display:flex",
        "flex-direction:column",
        "justify-content:space-between"
      ].join(";");

      stage.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
          '<div>' +
            '<div style="font-size:24px;letter-spacing:4px;text-transform:uppercase;opacity:0.7">Ohio Pride PAC</div>' +
            '<div style="font-size:36px;font-weight:700;margin-top:12px">2026 Legislative Scorecard</div>' +
          '</div>' +
          '<div style="background:linear-gradient(90deg,#e40303,#ff8c00,#ffed00,#008026,#004dff,#750787);height:14px;width:200px;border-radius:7px;margin-top:18px"></div>' +
        '</div>' +

        '<div style="display:flex;flex-direction:column;align-items:center;text-align:center">' +
          '<div style="font-size:340px;font-weight:900;line-height:1;color:' + grade.color + '">' + grade.grade + '</div>' +
          '<div style="font-size:36px;font-weight:600;opacity:0.85;margin-top:8px">' + escapeHtml(grade.label || "") + '</div>' +
        '</div>' +

        '<div>' +
          '<div style="font-size:64px;font-weight:800;line-height:1.1">' + escapeHtml(member.name) + '</div>' +
          '<div style="font-size:32px;font-weight:500;opacity:0.75;margin-top:14px">' +
            escapeHtml(member.chamber) + ' District ' + member.d +
            ' &nbsp;&middot;&nbsp; ' + partyLabel +
            ' &nbsp;&middot;&nbsp; Score ' + member.score + '/100' +
          '</div>' +
          '<div style="margin-top:36px;font-size:24px;letter-spacing:2px;text-transform:uppercase;opacity:0.65">ohiopride.org/scorecard</div>' +
        '</div>';

      document.body.appendChild(stage);

      html2canvas(stage, { backgroundColor: "#0F2233", scale: 1, logging: false }).then(function (canvas) {
        var link = document.createElement("a");
        link.download = "ohio-pride-scorecard-" + slugify(member) + ".png";
        link.href = canvas.toDataURL("image/png");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        document.body.removeChild(stage);
        resolve();
      }).catch(function (err) {
        if (stage.parentNode) document.body.removeChild(stage);
        console.error("html2canvas failed:", err);
        alert("Could not generate the share image. Try again or use Copy Link.");
        reject(err);
      });
    });
  }

  /* Facebook: download the grade image, open the FB share dialog
     pointed at the per-rep URL (so FB's OG scraper grabs the edge-
     injected preview), and copy a branded caption to the clipboard
     so the user can paste it straight into the FB composer. */
  function shareToFacebook(member) {
    generateCardImage(member).then(function () {
      return writeClipboard(shareCaption(member));
    }).then(function () {
      var u = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(shareUrl(member));
      window.open(u, "opp-share-fb", "width=620,height=520,noopener");
    }).catch(function () {
      /* errors are already reported by generateCardImage */
    });
  }

  /* Instagram: download the grade image and copy the branded caption
     to the clipboard so the user can paste it into the IG app. */
  function generateInstagramPost(member) {
    generateCardImage(member).then(function () {
      return writeClipboard(shareCaption(member));
    }).catch(function () { /* already reported */ });
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  global.OPP_SHARE = {
    slugify: slugify,
    shareUrl: shareUrl,
    shareToFacebook: shareToFacebook,
    copyShareLink: copyShareLink,
    generateInstagramPost: generateInstagramPost
  };

  /* Delegated click handler (one listener for all cards) */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-share]");
    if (!btn) return;
    e.stopPropagation();

    var card = btn.closest(".leg-card");
    if (!card) return;
    var idx = parseInt(card.getAttribute("data-idx"), 10);
    var members = global.__OPP_RENDER_MEMBERS__ || [];
    var member = members[idx];
    if (!member) return;

    var action = btn.getAttribute("data-share");
    if (action === "facebook") shareToFacebook(member);
    else if (action === "instagram") generateInstagramPost(member);
    else if (action === "copy") {
      copyShareLink(member).then(function (ok) {
        var prev = btn.textContent;
        btn.textContent = ok ? "Copied" : "Copy failed";
        setTimeout(function () { btn.textContent = prev; }, 1600);
      });
    }
  }, true);
})(window);
