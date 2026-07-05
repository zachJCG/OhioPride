function readBody(req) {
  if (typeof req.body === "string") return Promise.resolve(req.body);
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(new URLSearchParams(req.body).toString());
  }

  return new Promise((resolve, reject) => {
    var chunks = [];
    req.on("data", function (chunk) { chunks.push(chunk); });
    req.on("end", function () { resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    var body = await readBody(req);
    var response = await fetch("https://www.ohiopride.org/", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": req.headers["user-agent"] || "ohiopride-vercel-form-proxy"
      },
      body: body
    });

    if (!response.ok) {
      res.status(502).json({ ok: false, error: "netlify_form_rejected", status: response.status });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "proxy_failed" });
  }
};
