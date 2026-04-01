/* ==========================================================================
   BILL DETAIL PAGE RENDERER
   Populates a bill detail page from the shared BILLS data.
   Expects: BILL_ID global set before this script loads.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function() {
    const bill = getBillById(BILL_ID);
    if (!bill) {
        document.getElementById('billDetail').innerHTML = '<p>Bill not found.</p>';
        return;
    }

    // Title
    document.title = bill.bill + ' — ' + bill.title + ' | Ohio Pride PAC';
    document.getElementById('billNumber').textContent = bill.bill;
    document.getElementById('billTitle').textContent = bill.title;
    document.getElementById('billNickname').textContent = bill.nickname;
    document.getElementById('billOfficialTitle').textContent = bill.officialTitle;
    document.getElementById('statusBadge').textContent = bill.statusLabel;
    document.getElementById('statusBadge').style.background = bill.statusColor + '22';
    document.getElementById('statusBadge').style.color = bill.statusColor;
    document.getElementById('statusBadge').style.border = '1px solid ' + bill.statusColor + '44';

    // Pipeline
    const pipelineEl = document.getElementById('detailPipeline');
    renderPipeline(pipelineEl, bill.chamber || 'house', bill.currentStep, {
        size: 'lg',
        dates: bill.pipelineDates || {}
    });

    // Metadata
    document.getElementById('billSponsors').textContent = bill.sponsors;
    document.getElementById('billLastAction').textContent = bill.lastAction;
    if (bill.nextDate) {
        document.getElementById('billNextDate').textContent = bill.nextDate;
    }
    if (bill.houseVote) {
        const el = document.getElementById('billHouseVote');
        if (el) { el.textContent = bill.houseVote; el.parentElement.style.display = 'flex'; }
    }

    // Categories
    const catColors = {
        "Anti-Trans": "#e879f9", "Education / DEI": "#60a5fa", "Education": "#60a5fa",
        "Expression": "#fb923c", "Youth / Family": "#2dd4bf", "Elections / Privacy": "#a78bfa",
        "Corrections": "#94a3b8", "Healthcare": "#34d399"
    };
    const catContainer = document.getElementById('billCategories');
    catContainer.innerHTML = bill.categoryLabels.map(c =>
        `<span style="padding:0.25rem 0.75rem;border-radius:4px;font-size:0.8rem;font-weight:500;border:1px solid ${(catColors[c]||'#999')}44;color:${catColors[c]||'#999'}">${c}</span>`
    ).join('');

    // Links
    if (bill.legislatureUrl) {
        document.getElementById('legislatureLink').href = bill.legislatureUrl;
        document.getElementById('legislatureLink').style.display = 'inline-flex';
    }
    if (bill.textUrl) {
        document.getElementById('textLink').href = bill.textUrl;
        document.getElementById('textLink').style.display = 'inline-flex';
    }
});
