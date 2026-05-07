# =====================================================================
# Ohio Pride PAC :: generate-endorsement-pdf
# Netlify Function (Python 3.11)
#
# Endpoint: /.netlify/functions/generate-endorsement-pdf
# Method:   POST
# Auth:     Authorization: Bearer <Supabase JWT>
# Body:     { "application_id": "<uuid>" }
#
# Returns:  { "signed_url", "expires_in_days", "storage_path" }
#
# Required environment variables:
#   SUPABASE_URL              (e.g. https://dkdxefzhttkmjhdbkvqn.supabase.co)
#   SUPABASE_ANON_KEY         (public, used for /auth/v1/user verification)
#   SUPABASE_SERVICE_ROLE_KEY (server-only, bypasses RLS for read/write)
#   ADMIN_EMAIL               (single authorized email; defaults to zach@ohiopride.org)
# =====================================================================

import base64
import json
import os
from datetime import datetime
from io import BytesIO

import requests
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# ---------------------------------------------------------------------
# Brand tokens (mirrors Ohio Pride brand v1.1)
# ---------------------------------------------------------------------
NAVY         = colors.HexColor("#0F2233")
NAVY_LIGHT   = colors.HexColor("#1A3A52")
NAVY_LIGHTER = colors.HexColor("#234A66")
CYAN         = colors.HexColor("#73D7EE")
WHITE        = colors.HexColor("#FFFFFF")
PAPER        = colors.HexColor("#F7F8FA")
PAPER_2      = colors.HexColor("#EFF2F5")
INK          = colors.HexColor("#0F2233")
INK_SOFT     = colors.HexColor("#4A5C6E")
INK_MUTE     = colors.HexColor("#7A8896")
LINE         = colors.HexColor("#D9DEE4")
LINE_SOFT    = colors.HexColor("#E8EBEF")
SUCCESS      = colors.HexColor("#1F7A4D")
SUCCESS_SOFT = colors.HexColor("#E8F4EE")
ERROR        = colors.HexColor("#C0392B")
ERROR_SOFT   = colors.HexColor("#FCE9E6")
WARNING      = colors.HexColor("#B07F00")
WARNING_SOFT = colors.HexColor("#FFF6DC")

# Pride gradient stops (red, orange, yellow, green, blue, violet)
PRIDE_STOPS = [
    colors.HexColor("#E40303"),
    colors.HexColor("#FF8C00"),
    colors.HexColor("#FFED00"),
    colors.HexColor("#008026"),
    colors.HexColor("#004DFF"),
    colors.HexColor("#750787"),
]

PRIDE_STRIPE_TOP_HEIGHT    = 10  # pt
PRIDE_STRIPE_BOTTOM_HEIGHT = 7   # pt
NAVY_HEADER_HEIGHT         = 44  # pt (excluding pride stripe)
NAVY_FOOTER_HEIGHT         = 32  # pt (excluding pride stripe)
PAGE_WIDTH, PAGE_HEIGHT    = letter  # 612 x 792 pt

DISCLAIMER = "Paid for by Ohio Pride PAC. Zachary R. Joseph, Director."

STATUS_LABEL = {
    "submitted":    "Submitted",
    "under_review": "Under Review",
    "endorsed":     "Endorsed",
    "declined":     "Declined",
    "withdrawn":    "Withdrawn",
}

STATUS_COLORS = {
    "submitted":    (PAPER_2,      INK_SOFT,  LINE),
    "under_review": (WARNING_SOFT, WARNING,   WARNING),
    "endorsed":     (SUCCESS_SOFT, SUCCESS,   SUCCESS),
    "declined":     (ERROR_SOFT,   ERROR,     ERROR),
    "withdrawn":    (PAPER_2,      INK_MUTE,  LINE),
}


# =====================================================================
# Drawing helpers
# =====================================================================

def draw_pride_stripe(canvas, x, y, width, height):
    """Smooth horizontal pride gradient via thin interpolated rectangles."""
    n_segments = len(PRIDE_STOPS) - 1            # 5 transitions
    steps_per = 80                                # smoothness
    seg_w = width / n_segments
    for i in range(n_segments):
        c1, c2 = PRIDE_STOPS[i], PRIDE_STOPS[i + 1]
        for j in range(steps_per):
            t = j / (steps_per - 1) if steps_per > 1 else 0
            r = c1.red   * (1 - t) + c2.red   * t
            g = c1.green * (1 - t) + c2.green * t
            b = c1.blue  * (1 - t) + c2.blue  * t
            canvas.setFillColorRGB(r, g, b)
            sx = x + i * seg_w + (j / steps_per) * seg_w
            # tiny overlap to eliminate sub-pixel seams
            sw = seg_w / steps_per + 0.4
            canvas.rect(sx, y, sw, height, stroke=0, fill=1)


def draw_page_chrome(canvas, doc):
    """Header and footer drawn on every page."""
    canvas.saveState()

    # ---- Top: pride stripe ----
    top_stripe_y = PAGE_HEIGHT - PRIDE_STRIPE_TOP_HEIGHT
    draw_pride_stripe(canvas, 0, top_stripe_y, PAGE_WIDTH, PRIDE_STRIPE_TOP_HEIGHT)

    # ---- Top: navy header band ----
    header_y = top_stripe_y - NAVY_HEADER_HEIGHT
    canvas.setFillColor(NAVY)
    canvas.rect(0, header_y, PAGE_WIDTH, NAVY_HEADER_HEIGHT, stroke=0, fill=1)

    # Wordmark, vertically centered in the navy band
    wm_baseline_y = header_y + (NAVY_HEADER_HEIGHT / 2) - 6
    canvas.setFont("Helvetica", 18)
    canvas.setFillColor(colors.HexColor("#A6B5C2"))   # 65% white feel
    canvas.drawString(36, wm_baseline_y, "Ohio")
    ohio_w = canvas.stringWidth("Ohio", "Helvetica", 18)

    canvas.setFont("Helvetica-Bold", 18)
    canvas.setFillColor(WHITE)
    canvas.drawString(36 + ohio_w, wm_baseline_y, "Pride")
    pride_w = canvas.stringWidth("Pride", "Helvetica-Bold", 18)

    # "PAC" suffix with 2pt character spacing (via TextObject)
    pac_x = 36 + ohio_w + pride_w + 6
    pac_y = wm_baseline_y + 4
    pac_text = canvas.beginText()
    pac_text.setTextOrigin(pac_x, pac_y)
    pac_text.setFont("Helvetica-Bold", 8)
    pac_text.setFillColor(CYAN)
    pac_text.setCharSpace(2)
    pac_text.textOut("PAC")
    canvas.drawText(pac_text)

    # Right side: section eyebrow with letter spacing
    eyebrow = "ENDORSEMENT APPLICATION"
    # Width with 2pt char spacing: stringWidth + (n-1)*2
    base_w = canvas.stringWidth(eyebrow, "Helvetica-Bold", 8)
    eb_w = base_w + (len(eyebrow) - 1) * 2
    eb_text = canvas.beginText()
    eb_text.setTextOrigin(PAGE_WIDTH - 36 - eb_w, wm_baseline_y + 2)
    eb_text.setFont("Helvetica-Bold", 8)
    eb_text.setFillColor(CYAN)
    eb_text.setCharSpace(2)
    eb_text.textOut(eyebrow)
    canvas.drawText(eb_text)

    # Hairline under header
    canvas.setStrokeColor(colors.HexColor("#1A3A52"))
    canvas.setLineWidth(0.5)
    canvas.line(0, header_y, PAGE_WIDTH, header_y)

    # ---- Bottom: pride stripe ----
    draw_pride_stripe(canvas, 0, 0, PAGE_WIDTH, PRIDE_STRIPE_BOTTOM_HEIGHT)

    # ---- Bottom: navy footer band ----
    footer_y = PRIDE_STRIPE_BOTTOM_HEIGHT
    canvas.setFillColor(NAVY)
    canvas.rect(0, footer_y, PAGE_WIDTH, NAVY_FOOTER_HEIGHT, stroke=0, fill=1)

    # Disclaimer (centered)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(WHITE)
    disclaimer_y = footer_y + NAVY_FOOTER_HEIGHT - 12
    canvas.drawCentredString(PAGE_WIDTH / 2, disclaimer_y, DISCLAIMER)

    # Page number (centered, smaller, cyan, with letter spacing)
    page_label = f"PAGE {doc.page}"
    page_w = canvas.stringWidth(page_label, "Helvetica", 7) + (len(page_label) - 1) * 1.5
    pg_text = canvas.beginText()
    pg_text.setTextOrigin((PAGE_WIDTH - page_w) / 2, footer_y + 8)
    pg_text.setFont("Helvetica", 7)
    pg_text.setFillColor(CYAN)
    pg_text.setCharSpace(1.5)
    pg_text.textOut(page_label)
    canvas.drawText(pg_text)

    canvas.restoreState()


# =====================================================================
# Custom flowables
# =====================================================================

class StatusBadge(Flowable):
    """A pill-shaped status badge."""
    def __init__(self, status_key, font_size=8, padding_x=10, padding_y=4):
        super().__init__()
        self.label = STATUS_LABEL.get(status_key, status_key or "Unknown").upper()
        bg, fg, border = STATUS_COLORS.get(status_key, (PAPER_2, INK_SOFT, LINE))
        self.bg = bg
        self.fg = fg
        self.border = border
        self.font_name = "Helvetica-Bold"
        self.font_size = font_size
        self.padding_x = padding_x
        self.padding_y = padding_y

    def wrap(self, aw, ah):
        from reportlab.pdfbase.pdfmetrics import stringWidth
        text_w = stringWidth(self.label, self.font_name, self.font_size)
        self.width  = text_w + self.padding_x * 2
        self.height = self.font_size + self.padding_y * 2 + 2
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(self.bg)
        c.setStrokeColor(self.border)
        c.setLineWidth(0.6)
        radius = self.height / 2
        c.roundRect(0, 0, self.width, self.height, radius, stroke=1, fill=1)
        # Centered text with letter spacing via TextObject
        from reportlab.pdfbase.pdfmetrics import stringWidth
        base_w = stringWidth(self.label, self.font_name, self.font_size)
        spaced_w = base_w + (len(self.label) - 1) * 1.2
        t = c.beginText()
        t.setTextOrigin((self.width - spaced_w) / 2, self.padding_y + 2)
        t.setFont(self.font_name, self.font_size)
        t.setFillColor(self.fg)
        t.setCharSpace(1.2)
        t.textOut(self.label)
        c.drawText(t)


class HRule(Flowable):
    """Horizontal rule."""
    def __init__(self, width="100%", thickness=0.5, color=LINE_SOFT, space_before=4, space_after=4):
        super().__init__()
        self.requested_width = width
        self.thickness = thickness
        self.color = color
        self.space_before = space_before
        self.space_after = space_after

    def wrap(self, aw, ah):
        if self.requested_width == "100%":
            self.width = aw
        else:
            self.width = self.requested_width
        self.height = self.thickness + self.space_before + self.space_after
        return aw, self.height

    def draw(self):
        c = self.canv
        c.setStrokeColor(self.color)
        c.setLineWidth(self.thickness)
        y = self.space_after + self.thickness / 2
        c.line(0, y, self.width, y)


# =====================================================================
# Paragraph styles
# =====================================================================

def _styles():
    return {
        "section_eyebrow": ParagraphStyle(
            "section_eyebrow",
            fontName="Helvetica-Bold", fontSize=8, leading=12,
            textColor=CYAN, spaceAfter=4,
        ),
        "section_title": ParagraphStyle(
            "section_title",
            fontName="Helvetica-Bold", fontSize=14, leading=18,
            textColor=INK, spaceAfter=12,
        ),
        "candidate_name": ParagraphStyle(
            "candidate_name",
            fontName="Helvetica-Bold", fontSize=22, leading=26,
            textColor=INK, spaceAfter=4,
        ),
        "candidate_meta": ParagraphStyle(
            "candidate_meta",
            fontName="Helvetica", fontSize=10, leading=14,
            textColor=INK_SOFT, spaceAfter=2,
        ),
        "info_label": ParagraphStyle(
            "info_label",
            fontName="Helvetica-Bold", fontSize=7, leading=10,
            textColor=INK_MUTE, spaceAfter=2,
        ),
        "info_value": ParagraphStyle(
            "info_value",
            fontName="Times-Roman", fontSize=10, leading=14,
            textColor=INK, spaceAfter=0,
        ),
        "info_value_muted": ParagraphStyle(
            "info_value_muted",
            fontName="Times-Italic", fontSize=10, leading=14,
            textColor=INK_MUTE, spaceAfter=0,
        ),
        "position_q": ParagraphStyle(
            "position_q",
            fontName="Helvetica-Bold", fontSize=10, leading=14,
            textColor=INK, spaceAfter=8,
        ),
        "position_explain": ParagraphStyle(
            "position_explain",
            fontName="Times-Roman", fontSize=10, leading=15,
            textColor=INK_SOFT, spaceAfter=0,
        ),
        "open_h": ParagraphStyle(
            "open_h",
            fontName="Helvetica-Bold", fontSize=10, leading=14,
            textColor=INK, spaceAfter=4,
        ),
        "open_body": ParagraphStyle(
            "open_body",
            fontName="Times-Roman", fontSize=10, leading=15,
            textColor=INK_SOFT, spaceAfter=0,
        ),
        "meta_small": ParagraphStyle(
            "meta_small",
            fontName="Helvetica", fontSize=8, leading=11,
            textColor=INK_MUTE, spaceAfter=0,
        ),
        "meta_label": ParagraphStyle(
            "meta_label",
            fontName="Helvetica-Bold", fontSize=7, leading=10,
            textColor=INK_SOFT, spaceAfter=1,
        ),
        "attest_yes": ParagraphStyle(
            "attest_yes",
            fontName="Helvetica-Bold", fontSize=10, leading=14,
            textColor=SUCCESS, spaceAfter=0,
        ),
        "attest_no": ParagraphStyle(
            "attest_no",
            fontName="Helvetica-Bold", fontSize=10, leading=14,
            textColor=ERROR, spaceAfter=0,
        ),
    }


# =====================================================================
# Content builders
# =====================================================================

def esc(value):
    """Escape text for ReportLab Paragraph (which uses XML-ish markup)."""
    if value is None:
        return ""
    s = str(value)
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # Preserve line breaks in user input
    s = s.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br/>")
    return s


def fmt_dt(iso):
    if not iso:
        return ""
    try:
        # Handle both with and without timezone
        s = iso.replace("Z", "+00:00")
        d = datetime.fromisoformat(s)
        return d.strftime("%B %-d, %Y at %-I:%M %p UTC")
    except Exception:
        return str(iso)


def fmt_date(iso):
    if not iso:
        return ""
    try:
        s = iso.replace("Z", "+00:00")
        d = datetime.fromisoformat(s)
        return d.strftime("%B %-d, %Y")
    except Exception:
        return str(iso)


def yn(value):
    if value is True:
        return "Yes"
    if value is False:
        return "No"
    return "No answer"


def build_header_section(app, S):
    name = esc(app.get("candidate_name"))
    pronouns = app.get("pronouns")
    if pronouns:
        name = f'{name} <font name="Helvetica" size="11" color="#7A8896">{esc(pronouns)}</font>'

    meta_parts = []
    if app.get("office_sought"):
        meta_parts.append(f'<b>{esc(app["office_sought"])}</b>')
    if app.get("district"):
        meta_parts.append(esc(app["district"]))
    if app.get("election_year"):
        meta_parts.append(esc(app["election_year"]))
    if app.get("party"):
        meta_parts.append(esc(app["party"]))

    items = [
        Paragraph(name, S["candidate_name"]),
        Paragraph(" &nbsp;&middot;&nbsp; ".join(meta_parts), S["candidate_meta"]),
        Spacer(1, 6),
        StatusBadge(app.get("status", "submitted")),
        Spacer(1, 12),
        HRule(thickness=0.6, color=LINE),
    ]
    return items


def build_info_section(app, S):
    rows = [
        ("Email",      app.get("email")),
        ("Phone",      app.get("phone")),
        ("Website",    app.get("website")),
        ("Committee",  app.get("committee_name")),
        ("Treasurer",  app.get("treasurer_name")),
        ("Out as LGBTQ+",
            {"yes": "Yes", "no": "No", "prefer_not_to_say": "Prefer not to say"}.get(
                app.get("is_out") or "", None
            )),
        ("Submitted",  fmt_date(app.get("created_at"))),
    ]

    # Two-column grid using a Table
    cells = []
    for label, value in rows:
        if value:
            v_para = Paragraph(esc(value), S["info_value"])
        else:
            v_para = Paragraph("Not provided", S["info_value_muted"])
        cell = [
            Paragraph(label.upper(), S["info_label"]),
            v_para,
        ]
        cells.append(cell)

    grid_rows = []
    for i in range(0, len(cells), 2):
        left = cells[i]
        right = cells[i + 1] if i + 1 < len(cells) else [Spacer(1, 1)]
        grid_rows.append([left, right])

    grid = Table(grid_rows, colWidths=["50%", "50%"])
    grid.setStyle(TableStyle([
        ("VALIGN",   (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))

    return [
        Paragraph("SECTION 1 OF 5", S["section_eyebrow"]),
        Paragraph("Candidate Information", S["section_title"]),
        grid,
        Spacer(1, 12),
    ]


def build_position_block(num, question, answer, explanation, S):
    """One core position: bordered box with question, Yes/No badge, explanation."""
    if answer is True:
        bar_color = SUCCESS
        ans_bg = SUCCESS_SOFT
        ans_fg = SUCCESS
    elif answer is False:
        bar_color = ERROR
        ans_bg = ERROR_SOFT
        ans_fg = ERROR
    else:
        bar_color = LINE
        ans_bg = PAPER_2
        ans_fg = INK_MUTE

    answer_label = yn(answer).upper()
    explain_text = esc(explanation) if explanation else "<i>No explanation provided.</i>"

    q_para = Paragraph(
        f'<font color="#73D7EE" name="Helvetica-Bold">{num}.</font>&nbsp; {esc(question)}',
        S["position_q"],
    )
    answer_para = Paragraph(
        f'<font name="Helvetica-Bold" size="8" color="{ans_fg.hexval()}">{answer_label}</font>',
        ParagraphStyle(
            "ans_line", parent=S["position_q"],
            fontSize=8, leading=12, spaceAfter=6,
        ),
    )
    explain_para = Paragraph(explain_text, S["position_explain"])

    inner = Table(
        [[q_para], [answer_para], [explain_para]],
        colWidths=["100%"],
    )
    inner.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), PAPER),
        ("LINEBEFORE",    (0, 0), (-1, -1), 2.5, bar_color),
        ("LEFTPADDING",   (0, 0), (-1, -1), 14),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 14),
        ("TOPPADDING",    (0, 0), (0, 0),    12),
        ("BOTTOMPADDING", (0, 0), (0, 0),    2),
        ("TOPPADDING",    (0, 1), (0, 1),    0),
        ("BOTTOMPADDING", (0, 1), (0, 1),    4),
        ("TOPPADDING",    (0, 2), (0, 2),    0),
        ("BOTTOMPADDING", (0, 2), (0, 2),    12),
    ]))
    return inner


def build_positions_section(app, S):
    positions = [
        ("Q1", "Do you support statewide nondiscrimination protections for LGBTQ+ Ohioans in employment, housing, public accommodations, and healthcare (the Ohio Fairness Act)?",
         app.get("q1_nondiscrimination"), app.get("q1_explanation")),
        ("Q2", "Do you oppose legislation restricting medically recommended gender-affirming care, or imposing broad bans on gender expression including drag performances (e.g., HB 249)?",
         app.get("q2_anti_lgbtq_legislation"), app.get("q2_explanation")),
        ("Q3", "Do you support a statewide ban on so-called conversion therapy?",
         app.get("q3_conversion_therapy"), app.get("q3_explanation")),
        ("Q4", "Do you support inclusive K-12 schools, including protections against bullying, opposition to forced outing policies, and access to accurate information about LGBTQ+ people and families?",
         app.get("q4_inclusive_education"), app.get("q4_explanation")),
        ("Q5", "Will you vote against bills that roll back LGBTQ+ rights or create broad religious exemptions used to justify discrimination?",
         app.get("q5_vote_against_rollbacks"), app.get("q5_explanation")),
    ]

    blocks = [
        Paragraph("SECTION 2 OF 5", S["section_eyebrow"]),
        Paragraph("Core Positions", S["section_title"]),
    ]
    for num, q, ans, exp in positions:
        blocks.append(build_position_block(num, q, ans, exp, S))
        blocks.append(Spacer(1, 8))
    blocks.append(Spacer(1, 8))
    return blocks


def build_open_section(eyebrow, title, items, S):
    """A section of open-response questions."""
    blocks = [
        Paragraph(eyebrow, S["section_eyebrow"]),
        Paragraph(title, S["section_title"]),
    ]
    for heading, body in items:
        blocks.append(Paragraph(esc(heading), S["open_h"]))
        text = esc(body) if body else "<i>No response provided.</i>"
        body_para = Paragraph(text, S["open_body"])
        # Wrap in a panel with the cyan left rule
        panel = Table([[body_para]], colWidths=["100%"])
        panel.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), PAPER),
            ("LINEBEFORE",    (0, 0), (-1, -1), 2.5, CYAN),
            ("LEFTPADDING",   (0, 0), (-1, -1), 14),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 14),
            ("TOPPADDING",    (0, 0), (-1, -1), 12),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ]))
        blocks.append(panel)
        blocks.append(Spacer(1, 12))
    return blocks


def build_legislative_section(app, S):
    items = [
        ("Top three pro-equality legislative or policy priorities", app.get("q6_priorities")),
        ("Bills you would champion or co-sponsor",                  app.get("q7_legislation")),
        ("How you will address threats to LGBTQ+ safety",           app.get("q8_safety")),
    ]
    return build_open_section("SECTION 3 OF 5", "Legislative and Advocacy Commitment", items, S)


def build_vision_section(app, S):
    items = [
        ("How LGBTQ+ equality connects to other priorities in your race", app.get("q9_intersection")),
        ("Why you are seeking Ohio Pride's endorsement",                  app.get("q10_why_endorsement")),
    ]
    return build_open_section("SECTION 4 OF 5", "Vision and Ohio Context", items, S)


def build_background_section(app, S):
    items = [
        ("Bio",                  app.get("bio")),
        ("Conflicts disclosure", app.get("conflicts_disclosure")),
    ]
    blocks = build_open_section("SECTION 5 OF 5", "Background and Attestation", items, S)

    # Attestation row
    if app.get("attestation"):
        attest_text = f'CERTIFIED. Signed by {esc(app.get("signature") or "unsigned")}.'
        style = S["attest_yes"]
        bg = SUCCESS_SOFT
    else:
        attest_text = f'NOT CERTIFIED. Signature: {esc(app.get("signature") or "none")}.'
        style = S["attest_no"]
        bg = ERROR_SOFT

    attest = Table([[Paragraph(attest_text, style)]], colWidths=["100%"])
    attest.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), bg),
        ("LEFTPADDING",   (0, 0), (-1, -1), 14),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 14),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    blocks.append(attest)
    blocks.append(Spacer(1, 12))
    return blocks


def build_meta_section(app, S):
    rows = [
        ("Application ID", str(app.get("id") or "")),
        ("Submitted",      fmt_dt(app.get("created_at"))),
        ("Last updated",   fmt_dt(app.get("updated_at"))),
        ("Status",         STATUS_LABEL.get(app.get("status"), app.get("status") or "")),
    ]
    cells = []
    for label, value in rows:
        cells.append([
            Paragraph(label.upper(), S["meta_label"]),
            Paragraph(esc(value or "Not captured"), S["meta_small"]),
        ])
    grid_rows = []
    for i in range(0, len(cells), 2):
        left = cells[i]
        right = cells[i + 1] if i + 1 < len(cells) else [Spacer(1, 1)]
        grid_rows.append([left, right])
    grid = Table(grid_rows, colWidths=["50%", "50%"])
    grid.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    return [
        HRule(thickness=0.4, color=LINE_SOFT, space_before=6, space_after=10),
        Paragraph("SUBMISSION METADATA", S["section_eyebrow"]),
        Paragraph("Audit Trail", S["section_title"]),
        grid,
    ]


# =====================================================================
# PDF generation
# =====================================================================

def generate_pdf(app):
    """Build the PDF document and return raw bytes."""
    buf = BytesIO()
    S = _styles()

    # Frame inside the navy header / footer chrome
    top_chrome   = PRIDE_STRIPE_TOP_HEIGHT + NAVY_HEADER_HEIGHT
    bottom_chrome = PRIDE_STRIPE_BOTTOM_HEIGHT + NAVY_FOOTER_HEIGHT
    margin_h = 48
    margin_top_pad    = 28
    margin_bottom_pad = 16

    frame = Frame(
        x1=margin_h,
        y1=bottom_chrome + margin_bottom_pad,
        width=PAGE_WIDTH - 2 * margin_h,
        height=PAGE_HEIGHT - top_chrome - bottom_chrome - margin_top_pad - margin_bottom_pad,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        showBoundary=0,
    )

    page_template = PageTemplate(
        id="OhioPridePAC",
        frames=[frame],
        onPage=draw_page_chrome,
    )

    doc = BaseDocTemplate(
        buf,
        pagesize=letter,
        pageTemplates=[page_template],
        title=f"Endorsement Application: {app.get('candidate_name', 'Candidate')}",
        author="Ohio Pride PAC",
        subject="Candidate Endorsement Application",
        creator="Ohio Pride PAC Admin",
    )

    story = []
    story += build_header_section(app, S)
    story += [Spacer(1, 14)]
    story += build_info_section(app, S)
    story += build_positions_section(app, S)
    story += build_legislative_section(app, S)
    story += build_vision_section(app, S)
    story += build_background_section(app, S)
    story += build_meta_section(app, S)

    doc.build(story)
    return buf.getvalue()


# =====================================================================
# Supabase helpers
# =====================================================================

class SupabaseClient:
    def __init__(self, url, anon_key, service_key):
        self.url = url.rstrip("/")
        self.anon_key = anon_key
        self.service_key = service_key

    def _service_headers(self, extra=None):
        h = {
            "apikey":        self.service_key,
            "Authorization": f"Bearer {self.service_key}",
        }
        if extra:
            h.update(extra)
        return h

    def get_user_from_token(self, jwt_token):
        """Verify the user's JWT by asking the auth server."""
        resp = requests.get(
            f"{self.url}/auth/v1/user",
            headers={
                "apikey":        self.anon_key,
                "Authorization": f"Bearer {jwt_token}",
            },
            timeout=8,
        )
        if resp.status_code != 200:
            return None
        return resp.json()

    def get_application(self, application_id):
        resp = requests.get(
            f"{self.url}/rest/v1/endorsement_applications",
            params={"id": f"eq.{application_id}", "select": "*"},
            headers=self._service_headers({
                "Accept": "application/vnd.pgrst.object+json",
            }),
            timeout=8,
        )
        if resp.status_code == 200:
            return resp.json()
        return None

    def upload_pdf(self, storage_path, pdf_bytes):
        # storage_path is the path within the bucket, e.g. "abc-123.pdf"
        resp = requests.post(
            f"{self.url}/storage/v1/object/endorsement-pdfs/{storage_path}",
            headers=self._service_headers({
                "Content-Type": "application/pdf",
                "x-upsert":     "true",
            }),
            data=pdf_bytes,
            timeout=15,
        )
        return resp.status_code in (200, 201), resp.text

    def update_pdf_path(self, application_id, storage_path):
        full_path = f"endorsement-pdfs/{storage_path}"
        resp = requests.patch(
            f"{self.url}/rest/v1/endorsement_applications",
            params={"id": f"eq.{application_id}"},
            headers=self._service_headers({
                "Content-Type": "application/json",
                "Prefer":       "return=minimal",
            }),
            json={"generated_pdf_path": full_path},
            timeout=8,
        )
        return resp.status_code in (200, 204)

    def create_signed_url(self, storage_path, expires_in_seconds):
        resp = requests.post(
            f"{self.url}/storage/v1/object/sign/endorsement-pdfs/{storage_path}",
            headers=self._service_headers({
                "Content-Type": "application/json",
            }),
            json={"expiresIn": expires_in_seconds},
            timeout=8,
        )
        if resp.status_code != 200:
            return None
        signed_path = resp.json().get("signedURL") or resp.json().get("signed_url")
        if not signed_path:
            return None
        if signed_path.startswith("http"):
            return signed_path
        return f"{self.url}/storage/v1{signed_path}"


# =====================================================================
# Netlify Function entry point
# =====================================================================

def _cors():
    return {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
    }


def _resp(status, body, content_type="application/json"):
    return {
        "statusCode": status,
        "headers":    {**_cors(), "Content-Type": content_type},
        "body":       body if isinstance(body, str) else json.dumps(body),
    }


def _err(status, message):
    return _resp(status, {"error": message})


def handler(event, context):
    method = (event.get("httpMethod") or event.get("method") or "GET").upper()
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": _cors(), "body": ""}
    if method != "POST":
        return _err(405, "Method not allowed")

    # Required env
    SUPABASE_URL              = os.environ.get("SUPABASE_URL", "").rstrip("/")
    SUPABASE_ANON_KEY         = os.environ.get("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    ADMIN_EMAIL               = os.environ.get("ADMIN_EMAIL", "zach@ohiopride.org").lower()

    if not (SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY):
        return _err(500, "Server misconfigured: missing Supabase env vars.")

    # Auth header
    headers = event.get("headers") or {}
    auth = (headers.get("authorization") or headers.get("Authorization") or "").strip()
    if not auth.lower().startswith("bearer "):
        return _err(401, "Missing or malformed Authorization header.")
    token = auth[7:].strip()

    sb = SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)

    # Verify token by asking the auth server
    user = sb.get_user_from_token(token)
    if not user:
        return _err(401, "Invalid or expired session token.")
    user_email = (user.get("email") or "").lower()
    if user_email != ADMIN_EMAIL:
        return _err(403, "Not authorized.")

    # Parse body
    raw_body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        try:
            raw_body = base64.b64decode(raw_body).decode("utf-8")
        except Exception:
            return _err(400, "Invalid request body encoding.")
    try:
        payload = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError:
        return _err(400, "Request body must be valid JSON.")

    application_id = (payload.get("application_id") or "").strip()
    if not application_id:
        return _err(400, "application_id is required.")

    # Fetch application
    app = sb.get_application(application_id)
    if not app:
        return _err(404, "Application not found.")

    # Generate PDF
    try:
        pdf_bytes = generate_pdf(app)
    except Exception as e:
        return _err(500, f"PDF generation failed: {e}")

    # Upload
    storage_path = f"{application_id}.pdf"
    ok, upload_msg = sb.upload_pdf(storage_path, pdf_bytes)
    if not ok:
        return _err(500, f"Storage upload failed: {upload_msg}")

    # Update row
    sb.update_pdf_path(application_id, storage_path)

    # Signed URL (7 days)
    signed_url = sb.create_signed_url(storage_path, 7 * 24 * 3600)
    if not signed_url:
        return _err(500, "Could not create signed URL.")

    return _resp(200, {
        "signed_url":      signed_url,
        "expires_in_days": 7,
        "storage_path":    f"endorsement-pdfs/{storage_path}",
        "size_bytes":      len(pdf_bytes),
    })
