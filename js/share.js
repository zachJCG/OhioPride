/* ============================================================
   Ohio Pride PAC, Scorecard Social Sharing
   Last updated: 04/22/26

   Public API (called from scorecard.html):
     OPP_SHARE.slugify(member)               -> "callender-h57"
     OPP_SHARE.shareUrl(member)              -> "https://ohiopride.org/scorecard?rep=callender-h57"
     OPP_SHARE.shareToFacebook(member)
     OPP_SHARE.shareToTwitter(member)
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

  function shareText(member) {
    var grade = member.grade && member.grade.grade ? member.grade.grade : "?";
    var label = member.grade && member.grade.label ? member.grade.label : "";
    return [
      member.chamber + " Dist. " + member.d + " " + member.name,
      "scored " + member.score + "/100 (" + grade + (label ? ", " + label : "") + ")",
      "on the Ohio Pride PAC LGBTQ+ Equality Scorecard."
    ].join(" ");
  }

  function shareToFacebook(member) {
    var u = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(shareUrl(member));
    window.open(u, "opp-share-fb", "width=620,height=520,noopener");
  }

  function shareToTwitter(member) {
    var u = "https://twitter.com/intent/tweet"
      + "?url=" + encodeURIComponent(shareUrl(member))
      + "&text=" + encodeURIComponent(shareText(member))
      + "&hashtags=" + encodeURIComponent("OhioPride,LGBTQEquality");
    window.open(u, "opp-share-tw", "width=620,height=520,noopener");
  }

  function copyShareLink(member) {
    var url = shareUrl(member);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(url).then(function () { return true; }, function () { return false; });
    }
    /* Fallback: textarea + execCommand */
    try {
      var ta = document.createElement("textarea");
      ta.value = url;
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

  /* Build a 1080x1080 instagram-ready card off-screen, then PNG it. */
  function generateInstagramPost(member) {
    if (typeof html2canvas !== "function") {
      console.warn("html2canvas not loaded; cannot generate instagram post.");
      alert("Instagram image generator is still loading. Try again in a moment.");
      return;
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
        '<div style="font-size:36px;font-weight:600;opacity:0.85;margin-top:8px">' + grade.label + '</div>' +
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
    }).catch(function (err) {
      console.error("html2canvas failed:", err);
      alert("Could not generate the share image. Try again or use the Facebook/X buttons.");
    }).then(function () {
      document.body.removeChild(stage);
    });
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ── Public API ── */
  global.OPP_SHARE = {
    slugify: slugify,
    shareUrl: shareUrl,
    shareToFacebook: shareToFacebook,
    shareToTwitter: shareToTwitter,
    copyShareLink: copyShareLink,
    generateInstagramPost: generateInstagramPost
  };

  /* ── Delegated click handler (one listener for all cards) ── */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-share]");
    if (!btn) return;
    e.stopPropagation(); /* don't toggle the card collapse */

    var card = btn.closest(".leg-card");
    if (!card) return;
    var idx = parseInt(card.getAttribute("data-idx"), 10);
    var members = global.__OPP_RENDER_MEMBERS__ || [];
    var member = members[idx];
    if (!member) return;

    var action = btn.getAttribute("data-share");
    if (action === "facebook") shareToFacebook(member);
    else if (action === "twitter") shareToTwitter(member);
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
