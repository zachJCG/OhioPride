'use client';
/* The applicant's own record of what they filed and when.
 *
 * The form writes the election and the timestamp to sessionStorage on a
 * successful insert; this reads it once and clears it, so a later visit to
 * this page does not claim a submission that did not just happen.
 *
 * Rendered client side on purpose. Passing it through the URL would put the
 * receipt in browser history and in any link a candidate pasted to a
 * colleague, and reading it on the server would make an otherwise static
 * page dynamic for every visitor.
 */

import { useEffect, useState } from 'react';

const KEY = 'op_endorsement_receipt_v1';
const ET = 'America/New_York';

function submittedLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: ET,
  });
  const time = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET })
    .replace(/\s?([AP])M$/i, (m, ap) => ` ${ap.toUpperCase()}M`);
  return `${day} at ${time} ET`;
}

export default function Receipt() {
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return;
      sessionStorage.removeItem(KEY);
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.cycle || parsed.submitted_at)) setReceipt(parsed);
    } catch (_) {
      /* A browser that refuses session storage still gets the rest of the page. */
    }
  }, []);

  if (!receipt) return null;

  const when = receipt.submitted_at ? submittedLabel(receipt.submitted_at) : null;

  return (
    <dl className="ty-receipt">
      {receipt.cycle && (
        <div className="ty-receipt-row">
          <dt>Election</dt>
          <dd>{receipt.cycle}</dd>
        </div>
      )}
      {when && (
        <div className="ty-receipt-row">
          <dt>Submitted</dt>
          <dd>{when}</dd>
        </div>
      )}
    </dl>
  );
}
