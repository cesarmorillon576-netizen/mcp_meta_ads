from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)

# ── Colour palette ────────────────────────────────────────────────────────────
BLUE_DARK   = colors.HexColor("#1A237E")
BLUE_MID    = colors.HexColor("#1565C0")
BLUE_LIGHT  = colors.HexColor("#E3F2FD")
BLUE_HEADER = colors.HexColor("#1976D2")
GREY_LIGHT  = colors.HexColor("#F5F5F5")
GREY_LINE   = colors.HexColor("#BDBDBD")
GREEN       = colors.HexColor("#2E7D32")
GREEN_LIGHT = colors.HexColor("#E8F5E9")
WHITE       = colors.white
BLACK       = colors.HexColor("#212121")
DARK_GREY   = colors.HexColor("#424242")

PAGE_W, PAGE_H = A4
MARGIN = 2.2 * cm

# ── Styles ────────────────────────────────────────────────────────────────────
def S(name, **kw):
    return ParagraphStyle(name, **kw)

sCoverTitle = S("sCoverTitle",
    fontName="Helvetica-Bold", fontSize=26, textColor=WHITE,
    leading=32, alignment=TA_LEFT)

sCoverSub = S("sCoverSub",
    fontName="Helvetica", fontSize=12, textColor=colors.HexColor("#BBDEFB"),
    leading=17, alignment=TA_LEFT)

sCoverMeta = S("sCoverMeta",
    fontName="Helvetica", fontSize=9, textColor=colors.HexColor("#90CAF9"),
    leading=13, alignment=TA_LEFT)

sH1 = S("sH1",
    fontName="Helvetica-Bold", fontSize=15, textColor=BLUE_DARK,
    leading=20, spaceBefore=16, spaceAfter=5)

sH2 = S("sH2",
    fontName="Helvetica-Bold", fontSize=11, textColor=BLUE_MID,
    leading=15, spaceBefore=12, spaceAfter=3)

sBody = S("sBody",
    fontName="Helvetica", fontSize=9.5, textColor=BLACK,
    leading=15, spaceAfter=4, alignment=TA_JUSTIFY)

sBodyLeft = S("sBodyLeft",
    fontName="Helvetica", fontSize=9.5, textColor=BLACK,
    leading=15, spaceAfter=4)

sBullet = S("sBullet",
    fontName="Helvetica", fontSize=9.5, textColor=BLACK,
    leading=14, leftIndent=14, spaceAfter=3, bulletIndent=5)

sCode = S("sCode",
    fontName="Courier", fontSize=8.5, textColor=BLUE_MID,
    leading=13, backColor=GREY_LIGHT, borderPadding=(4,6,4,6))

sLabel = S("sLabel",
    fontName="Helvetica-Bold", fontSize=8.5, textColor=BLUE_MID, leading=12)

sTableHead = S("sTableHead",
    fontName="Helvetica-Bold", fontSize=8.5, textColor=WHITE, leading=12)

sTableCell = S("sTableCell",
    fontName="Helvetica", fontSize=8.5, textColor=BLACK, leading=12)

sTableCode = S("sTableCode",
    fontName="Courier", fontSize=8, textColor=BLUE_MID, leading=12)

sTocEntry = S("sTocEntry",
    fontName="Helvetica", fontSize=9.5, textColor=BLUE_MID, leading=16)

sSmall = S("sSmall",
    fontName="Helvetica", fontSize=8, textColor=DARK_GREY, leading=11)

sFooter = S("sFooter",
    fontName="Helvetica", fontSize=7.5, textColor=colors.HexColor("#9E9E9E"),
    alignment=TA_CENTER)

sInfo = S("sInfo",
    fontName="Helvetica", fontSize=9, textColor=DARK_GREY,
    leading=13, alignment=TA_LEFT)

sGreen = S("sGreen",
    fontName="Helvetica-Bold", fontSize=9, textColor=GREEN, leading=13)

# ── Helpers ───────────────────────────────────────────────────────────────────
def hr(color=GREY_LINE, t=0.5, sb=5, sa=5):
    return [Spacer(1, sb), HRFlowable(width="100%", thickness=t, color=color), Spacer(1, sa)]

def section_rule():
    return [HRFlowable(width="100%", thickness=2, color=BLUE_DARK), Spacer(1, 4)]

def info_box(rows):
    """Two-column key-value info box."""
    data = [[Paragraph(k, sLabel), Paragraph(v, sBodyLeft)] for k, v in rows]
    t = Table(data, colWidths=[4.5*cm, PAGE_W - 2*MARGIN - 4.5*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,-1), BLUE_LIGHT),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("LINEBELOW",    (0,0), (-1,-2), 0.3, GREY_LINE),
    ]))
    return t

def feature_table(rows):
    """rows: list of (API Service, Method, Purpose)"""
    header = [Paragraph("API Service", sTableHead),
              Paragraph("Method / Resource", sTableHead),
              Paragraph("Purpose in Application", sTableHead)]
    data = [header] + [
        [Paragraph(r[0], sTableCode),
         Paragraph(r[1], sTableCode),
         Paragraph(r[2], sTableCell)]
        for r in rows
    ]
    col_w = [4*cm, 4.6*cm, 8*cm]
    t = Table(data, colWidths=col_w, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",     (0,0), (-1,0),  BLUE_HEADER),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, BLUE_LIGHT]),
        ("GRID",           (0,0), (-1,-1), 0.4, GREY_LINE),
        ("TOPPADDING",     (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",  (0,0), (-1,-1), 5),
        ("LEFTPADDING",    (0,0), (-1,-1), 6),
        ("RIGHTPADDING",   (0,0), (-1,-1), 6),
        ("VALIGN",         (0,0), (-1,-1), "TOP"),
    ]))
    return t

def two_col(left_content, right_content, left_w=8*cm):
    right_w = PAGE_W - 2*MARGIN - left_w - 0.4*cm
    t = Table([[left_content, right_content]],
              colWidths=[left_w, right_w])
    t.setStyle(TableStyle([
        ("VALIGN",      (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 0),
        ("RIGHTPADDING",(0,0), (-1,-1), 0),
        ("TOPPADDING",  (0,0), (-1,-1), 0),
    ]))
    return t


# ── Page callbacks ────────────────────────────────────────────────────────────
def on_page(canvas, doc):
    canvas.saveState()
    w, h = A4
    page_num = doc.page

    if page_num > 1:
        canvas.setFillColor(BLUE_DARK)
        canvas.rect(MARGIN, h - 1.1*cm, w - 2*MARGIN, 0.55*cm, fill=1, stroke=0)
        canvas.setFont("Helvetica-Bold", 7)
        canvas.setFillColor(WHITE)
        canvas.drawString(MARGIN + 4, h - 0.72*cm,
            "Google Ads API Access Request  —  Mi Marketing Industrial")
        canvas.setFont("Helvetica", 7)
        canvas.drawRightString(w - MARGIN - 4, h - 0.72*cm, f"Page {page_num}")

    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#9E9E9E"))
    canvas.drawString(MARGIN, 0.7*cm, "Mi Marketing Industrial  ·  Confidential")
    canvas.drawRightString(w - MARGIN, 0.7*cm, "Google Ads API — Basic Access Request")
    canvas.setStrokeColor(GREY_LINE)
    canvas.setLineWidth(0.3)
    canvas.line(MARGIN, 1*cm, w - MARGIN, 1*cm)
    canvas.restoreState()


# ── Cover ─────────────────────────────────────────────────────────────────────
def cover_page():
    elems = []

    # Top banner - compact to fit TOC on same page
    banner = Table([[Paragraph("Google Ads API\nAccess Request", sCoverTitle)]],
        colWidths=[PAGE_W - 2*MARGIN], rowHeights=[3.6*cm])
    banner.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), BLUE_DARK),
        ("TOPPADDING",   (0,0),(-1,-1), 16),
        ("LEFTPADDING",  (0,0),(-1,-1), 22),
        ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
    ]))
    elems.append(banner)
    elems.append(Spacer(1, 0.15*cm))

    sub_meta = Table([
        [Paragraph("Basic Access — Developer Token Application", sCoverSub)],
        [Paragraph("Submitted by: Mi Marketing Industrial  ·  May 2026  ·  Confidential", sCoverMeta)],
    ], colWidths=[PAGE_W - 2*MARGIN], rowHeights=[0.9*cm, 0.65*cm])
    sub_meta.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(0,0), BLUE_MID),
        ("BACKGROUND",   (0,1),(0,1), BLUE_DARK),
        ("LEFTPADDING",  (0,0),(-1,-1), 22),
        ("TOPPADDING",   (0,0),(-1,-1), 6),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
    ]))
    elems.append(sub_meta)
    elems.append(Spacer(1, 0.4*cm))

    # Applicant info box
    elems.append(info_box([
        ("Applicant",        "Mi Marketing Industrial"),
        ("Contact email",    "mimarketingindustrial@gmail.com"),
        ("Application name", "Mi Marketing Industrial — Google Ads MCP Server"),
        ("Access type",      "Basic Access (Developer Token)"),
        ("Document date",    "May 26, 2026"),
    ]))
    elems.append(Spacer(1, 0.35*cm))

    # Executive summary - single compact paragraph
    elems += section_rule()
    elems.append(Paragraph("Executive Summary", sH1))
    elems.append(Paragraph(
        "Mi Marketing Industrial is a digital marketing agency based in Mexico specializing "
        "in paid advertising for medical and healthcare professionals. We are requesting "
        "<b>Basic Access</b> to the Google Ads API to power our internal "
        "<b>Google Ads MCP Server</b> — a locally-run tool that connects to Claude Desktop "
        "(an AI assistant) via the Model Context Protocol (MCP), allowing our team to query "
        "campaign performance, manage statuses, and generate performance reports through "
        "natural-language commands on behalf of our managed client accounts.",
        sBody))
    elems.append(Spacer(1, 0.35*cm))

    # TOC — single KeepTogether block so it never splits across pages
    toc_entries = [
        ("1.", "About Mi Marketing Industrial"),
        ("2.", "Application Description"),
        ("3.", "Intended API Usage"),
        ("4.", "API Services &amp; Features Required"),
        ("5.", "Data Access &amp; Scope"),
        ("6.", "Security &amp; Compliance"),
        ("7.", "Declaration &amp; Contact"),
    ]
    toc_rows = []
    for num, title in toc_entries:
        toc_rows.append([
            Paragraph(f"<b>{num}</b>", sLabel),
            Paragraph(title, sTocEntry),
        ])
    toc_table = Table(toc_rows, colWidths=[1*cm, PAGE_W - 2*MARGIN - 1*cm])
    toc_table.setStyle(TableStyle([
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 0),
        ("LEFTPADDING",   (1,0), (-1,-1), 4),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("LINEBELOW",     (0,0), (-1,-2), 0.3, GREY_LINE),
    ]))
    elems.append(KeepTogether([
        HRFlowable(width="100%", thickness=2, color=BLUE_DARK),
        Spacer(1, 4),
        Paragraph("Table of Contents", sH1),
        toc_table,
    ]))

    elems.append(PageBreak())
    return elems


# ── Section 1: About the company ──────────────────────────────────────────────
def section_company():
    elems = []
    elems += section_rule()
    elems.append(Paragraph("1.  About Mi Marketing Industrial", sH1))

    elems.append(Paragraph(
        "Mi Marketing Industrial is a digital marketing agency operating in Mexico, "
        "with a primary focus on healthcare and medical professionals. Our clients include "
        "gynecologists, general surgeons, urologists, cardiologists, and specialized clinics "
        "across multiple cities in Mexico.",
        sBody))
    elems.append(Spacer(1, 4))
    elems.append(Paragraph(
        "We manage advertising campaigns across major platforms including Meta Ads and Google Ads, "
        "handling campaign strategy, creative production, audience targeting, budget management, "
        "and performance reporting for over 40 active client accounts.",
        sBody))
    elems.append(Spacer(1, 8))

    elems.append(Paragraph("Business Profile", sH2))
    elems.append(info_box([
        ("Company name",     "Mi Marketing Industrial"),
        ("Industry",         "Digital Marketing Agency — Healthcare Sector"),
        ("Location",         "Mexico"),
        ("Contact",          "mimarketingindustrial@gmail.com"),
        ("Active accounts",  "40+ managed Google Ads accounts under one MCC"),
        ("Use of API",       "Internal tooling — managing client campaigns on their behalf"),
    ]))
    elems.append(Spacer(1, 8))

    elems.append(Paragraph("Role in the Google Ads Ecosystem", sH2))
    elems.append(Paragraph(
        "Mi Marketing Industrial operates as a <b>third-party manager</b>: clients grant access "
        "to their individual Google Ads accounts through our Manager Account (MCC). "
        "All API usage is scoped to accounts for which we have explicit client authorization. "
        "We do not resell API access or provide API credentials to end clients.",
        sBody))

    elems.append(PageBreak())
    return elems


# ── Section 2: Application description ───────────────────────────────────────
def section_app():
    elems = []
    elems += section_rule()
    elems.append(Paragraph("2.  Application Description", sH1))

    elems.append(Paragraph(
        "The <b>Google Ads MCP Server</b> is a lightweight, locally-run background process "
        "that integrates Google Ads management capabilities into an AI assistant workflow. "
        "It is built exclusively for internal use by the Mi Marketing Industrial team.",
        sBody))
    elems.append(Spacer(1, 6))

    elems.append(Paragraph("How It Works", sH2))
    elems.append(Paragraph(
        "The application runs on the analyst's Windows machine and communicates with "
        "<b>Claude Desktop</b> (Anthropic's AI assistant) via the "
        "<b>Model Context Protocol (MCP)</b> — a standardized stdio-based protocol for "
        "connecting AI models to external tools. When our team member asks the AI assistant "
        "a question such as <i>\"Which campaigns are active for Dr. García?\"</i> or "
        "<i>\"Pause the underperforming campaigns in account 123456789\"</i>, the AI model "
        "invokes the appropriate MCP tool, which in turn calls the Google Ads API and "
        "returns structured results.",
        sBody))
    elems.append(Spacer(1, 8))

    # Flow diagram
    flow = [
        [Paragraph("Analyst", sTableHead),
         Paragraph("", sTableHead),
         Paragraph("Claude Desktop\n(AI Assistant)", sTableHead),
         Paragraph("", sTableHead),
         Paragraph("MCP Server\n(google_ads.exe)", sTableHead),
         Paragraph("", sTableHead),
         Paragraph("Google Ads API", sTableHead)],
        [Paragraph("Types natural-\nlanguage question\nor instruction", sTableCell),
         Paragraph("→", sTableCell),
         Paragraph("Interprets intent,\nselects appropriate\nMCP tool", sTableCell),
         Paragraph("→\nMCP\nstdio\n←", sTableCell),
         Paragraph("Executes GAQL\nquery or mutate\noperation", sTableCell),
         Paragraph("→\nHTTPS\n←", sTableCell),
         Paragraph("Returns campaign\ndata, metrics,\nor confirmation", sTableCell)],
    ]
    flow_w = [(PAGE_W - 2*MARGIN) / 7] * 7
    flow_t = Table(flow, colWidths=flow_w)
    flow_t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0),  BLUE_HEADER),
        ("BACKGROUND",   (0,1), (0,1),   BLUE_LIGHT),
        ("BACKGROUND",   (2,1), (2,1),   colors.HexColor("#E8EAF6")),
        ("BACKGROUND",   (4,1), (4,1),   colors.HexColor("#E8EAF6")),
        ("BACKGROUND",   (6,1), (6,1),   GREEN_LIGHT),
        ("BACKGROUND",   (1,1), (1,1),   WHITE),
        ("BACKGROUND",   (3,1), (3,1),   WHITE),
        ("BACKGROUND",   (5,1), (5,1),   WHITE),
        ("ALIGN",        (0,0), (-1,-1), "CENTER"),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
        ("GRID",         (0,0), (-1,-1), 0.4, GREY_LINE),
        ("TOPPADDING",   (0,0), (-1,-1), 7),
        ("BOTTOMPADDING",(0,0), (-1,-1), 7),
        ("FONTNAME",     (1,1), (1,1), "Courier"),
        ("FONTNAME",     (3,1), (3,1), "Courier"),
        ("FONTNAME",     (5,1), (5,1), "Courier"),
        ("FONTSIZE",     (1,1), (1,1), 8),
        ("FONTSIZE",     (3,1), (3,1), 8),
        ("FONTSIZE",     (5,1), (5,1), 8),
    ]))
    elems.append(flow_t)
    elems.append(Spacer(1, 10))

    elems.append(Paragraph("Application Characteristics", sH2))
    chars = [
        ("<b>Deployment:</b> Runs locally on the analyst's machine. No cloud server, "
         "no public endpoint, no third-party hosting."),
        ("<b>Users:</b> Internal Mi Marketing Industrial staff only. "
         "Client credentials are never exposed to end clients."),
        ("<b>Distribution:</b> Not a public or commercial software product. "
         "It is a private internal tool packaged as a Windows executable (.exe) "
         "for ease of deployment within the team."),
        ("<b>Concurrency:</b> Single-user, single-process. One analyst uses the tool "
         "at a time from their own machine with their own OAuth credentials."),
        ("<b>API call volume:</b> Low to moderate. Calls are triggered by analyst "
         "queries during working hours, not by automated batch processes. "
         "Estimated: fewer than 500 API operations per day."),
    ]
    for c in chars:
        elems.append(Paragraph(f"• {c}", sBullet))

    elems.append(PageBreak())
    return elems


# ── Section 3: Intended API Usage ────────────────────────────────────────────
def section_usage():
    elems = []
    elems += section_rule()
    elems.append(Paragraph("3.  Intended API Usage", sH1))

    elems.append(Paragraph(
        "The application uses the Google Ads API exclusively for the following business "
        "workflows, all of which are performed on client accounts managed by "
        "Mi Marketing Industrial:",
        sBody))
    elems.append(Spacer(1, 6))

    use_cases = [
        ("Campaign Status Review",
         "The analyst asks the AI assistant to list all active campaigns for a specific "
         "client account, including budget and channel type. This replaces the need to "
         "manually navigate the Google Ads interface for each account."),
        ("Cross-Account Dashboard",
         "Retrieve active campaigns across all managed accounts in a single query. "
         "Used for morning status checks and to identify accounts that may need attention."),
        ("Performance Reporting",
         "Query key performance indicators (impressions, clicks, CTR, spend, CPC, CPM, "
         "conversions, CPA, ROAS) for a specified date range. Used to prepare weekly "
         "and monthly reports for clients."),
        ("Money Leak Detection",
         "Automatically flag campaigns that are spending budget without generating "
         "conversions, have unusually low CTR, or have a CPA above defined thresholds. "
         "This allows the team to proactively identify underperforming campaigns."),
        ("Status Management",
         "Enable or pause campaigns, ad groups, or individual ads as directed by the "
         "analyst. Used when a client requests urgent pausing of a campaign or when "
         "the team identifies a creative that needs to be stopped."),
        ("Disapproval Monitoring",
         "Scan all active ads for disapproval or policy flags. Used to quickly identify "
         "ads that are not serving due to Google policy issues and alert the client."),
    ]

    for i, (title, desc) in enumerate(use_cases):
        uc_data = [[
            Paragraph(f"{i+1}", sTableHead),
            Table(
                [[Paragraph(title, sH2)],
                 [Paragraph(desc, sBody)]],
                colWidths=[PAGE_W - 2*MARGIN - 1.4*cm]
            )
        ]]
        uc_t = Table(uc_data, colWidths=[1.4*cm, PAGE_W - 2*MARGIN - 1.4*cm])
        uc_t.setStyle(TableStyle([
            ("BACKGROUND",   (0,0), (0,0), BLUE_MID),
            ("BACKGROUND",   (1,0), (1,0), GREY_LIGHT),
            ("ALIGN",        (0,0), (0,0), "CENTER"),
            ("VALIGN",       (0,0), (-1,-1), "TOP"),
            ("TOPPADDING",   (0,0), (-1,-1), 8),
            ("BOTTOMPADDING",(0,0), (-1,-1), 8),
            ("LEFTPADDING",  (0,0), (0,0), 0),
            ("LEFTPADDING",  (1,0), (1,0), 10),
            ("GRID",         (0,0), (-1,-1), 0.4, GREY_LINE),
        ]))
        elems.append(uc_t)
        elems.append(Spacer(1, 5))

    elems.append(PageBreak())
    return elems


# ── Section 4: API Features Required ─────────────────────────────────────────
def section_features():
    elems = []
    elems += section_rule()
    elems.append(Paragraph("4.  API Services &amp; Features Required", sH1))

    elems.append(Paragraph(
        "The following Google Ads API services and report resources are used by the application. "
        "All usage is limited to the accounts accessible through our Manager Account (MCC).",
        sBody))
    elems.append(Spacer(1, 8))

    elems.append(feature_table([
        ("CustomerService",    "list_accessible_customers()",   "Enumerate all accounts linked to the MCC for cross-account campaign discovery."),
        ("GoogleAdsService",   "search_stream() — campaign",    "Read campaign name, status, budget, and advertising channel type."),
        ("GoogleAdsService",   "search_stream() — metrics",     "Read impressions, clicks, CTR, cost, CPM, CPC, conversions, CPA, ROAS for date-range reports."),
        ("GoogleAdsService",   "search_stream() — ad_group_ad", "Read ad approval/policy status to detect disapproved ads."),
        ("CampaignService",    "mutate_campaigns()",            "Enable or pause campaigns on analyst instruction."),
        ("AdGroupService",     "mutate_ad_groups()",            "Enable or pause ad groups on analyst instruction."),
        ("AdGroupAdService",   "mutate_ad_group_ads()",         "Enable or pause individual ads on analyst instruction."),
    ]))
    elems.append(Spacer(1, 10))

    elems.append(Paragraph("GAQL Report Resources Used", sH2))
    elems.append(Paragraph(
        "All read operations use Google Ads Query Language (GAQL) with "
        "<font face='Courier'>search_stream()</font>. The following report resources are queried:",
        sBody))
    elems.append(Spacer(1, 4))

    res_data = [
        [Paragraph("Resource", sTableHead),
         Paragraph("Fields Accessed", sTableHead),
         Paragraph("Purpose", sTableHead)],
        [Paragraph("campaign", sTableCode),
         Paragraph("campaign.id, campaign.name, campaign.status,\ncampaign.advertising_channel_type,\ncampaign_budget.amount_micros,\ncustomer.descriptive_name", sTableCode),
         Paragraph("Campaign listing and discovery.", sTableCell)],
        [Paragraph("campaign\n(with segments)", sTableCode),
         Paragraph("metrics.impressions, metrics.clicks,\nmetrics.ctr, metrics.cost_micros,\nmetrics.average_cpm, metrics.average_cpc,\nmetrics.conversions,\nmetrics.cost_per_conversion,\nmetrics.conversions_value,\nsegments.date", sTableCode),
         Paragraph("Date-range performance reports and money-leak detection.", sTableCell)],
        [Paragraph("ad_group_ad", sTableCode),
         Paragraph("campaign.name, campaign.status,\nad_group.name, ad_group.status,\nad_group_ad.ad.id,\nad_group_ad.status,\nad_group_ad.policy_summary.approval_status", sTableCode),
         Paragraph("Ad disapproval and policy monitoring.", sTableCell)],
    ]
    res_t = Table(res_data, colWidths=[3.2*cm, 6*cm, 7.4*cm], repeatRows=1)
    res_t.setStyle(TableStyle([
        ("BACKGROUND",     (0,0), (-1,0),  BLUE_HEADER),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, BLUE_LIGHT]),
        ("GRID",           (0,0), (-1,-1), 0.4, GREY_LINE),
        ("TOPPADDING",     (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",  (0,0), (-1,-1), 5),
        ("LEFTPADDING",    (0,0), (-1,-1), 6),
        ("RIGHTPADDING",   (0,0), (-1,-1), 6),
        ("VALIGN",         (0,0), (-1,-1), "TOP"),
    ]))
    elems.append(res_t)
    elems.append(PageBreak())
    return elems


# ── Section 5: Data Access & Scope ────────────────────────────────────────────
def section_data():
    elems = []
    elems += section_rule()
    elems.append(Paragraph("5.  Data Access &amp; Scope", sH1))

    elems.append(Paragraph("What Data Is Accessed", sH2))
    items = [
        "Campaign metadata: name, ID, status, budget, channel type.",
        "Ad group metadata: name, ID, status.",
        "Ad metadata: ID, status, policy/approval status.",
        "Performance metrics: impressions, clicks, spend, CTR, CPC, CPM, conversions, CPA, ROAS.",
        "Account metadata: account name and ID, accessible via the MCC.",
    ]
    for it in items:
        elems.append(Paragraph(f"• {it}", sBullet))
    elems.append(Spacer(1, 8))

    elems.append(Paragraph("What Data Is NOT Accessed", sH2))
    not_items = [
        "No user personal data, audience lists, or customer match data.",
        "No billing or payment information.",
        "No keyword-level or search term data.",
        "No creative asset files (images, videos).",
        "No data from Google Analytics or any linked property.",
    ]
    for it in not_items:
        elems.append(Paragraph(f"• {it}", sBullet))
    elems.append(Spacer(1, 8))

    elems.append(Paragraph("Data Storage &amp; Retention", sH2))
    elems.append(Paragraph(
        "The application does <b>not persist any data</b> retrieved from the API. "
        "All results are returned directly to the AI assistant as text strings and "
        "displayed to the analyst in the session. No database, log file, or external "
        "storage of API response data is maintained. "
        "OAuth credentials (refresh token, client secret) are stored locally in a "
        "<font face='Courier'>.env</font> file on the analyst's machine and are never "
        "transmitted to any third party.",
        sBody))
    elems.append(Spacer(1, 8))

    elems.append(Paragraph("Account Access Scope", sH2))
    elems.append(Paragraph(
        "API calls are made using the analyst's own OAuth2 refresh token, scoped to "
        "<font face='Courier'>https://www.googleapis.com/auth/adwords</font>. "
        "The Login Customer ID is set to our MCC account ID. "
        "Access is limited to the client accounts that have granted manager access to our MCC — "
        "no account data outside this scope can be reached.",
        sBody))

    elems.append(PageBreak())
    return elems


# ── Section 6: Security & Compliance ─────────────────────────────────────────
def section_security():
    elems = []
    elems += section_rule()
    elems.append(Paragraph("6.  Security &amp; Compliance", sH1))

    elems.append(Paragraph(
        "Mi Marketing Industrial is committed to using the Google Ads API responsibly "
        "and in full compliance with the <b>Google Ads API Terms of Service</b> and "
        "<b>API usage policies</b>.",
        sBody))
    elems.append(Spacer(1, 8))

    measures = [
        ("Credential security",
         "OAuth2 credentials are stored in a local .env file with restricted file-system "
         "permissions. The refresh token is never logged, transmitted, or shared. "
         "Client secrets are not embedded in source code."),
        ("No credential sharing",
         "Each analyst uses their own OAuth credentials. API credentials are not distributed "
         "to end clients or third parties under any circumstance."),
        ("Minimal permissions",
         "The OAuth scope is limited to https://www.googleapis.com/auth/adwords only. "
         "No additional Google account scopes are requested."),
        ("Controlled mutations",
         "Write operations (enable/pause campaign, ad group, ad) are only performed when "
         "explicitly instructed by an authenticated internal analyst. "
         "There are no automated or scheduled write operations."),
        ("Rate limit compliance",
         "The application is single-user and non-automated. Estimated daily API operations "
         "are well within Basic Access limits (< 500/day vs. 15,000 allowed). "
         "The application does not implement retry loops that could cause bursts."),
        ("No data resale",
         "Google Ads data retrieved via the API is used solely for managing and "
         "reporting on our clients' own campaigns. Data is not sold, shared, or used "
         "for any purpose other than campaign management for the account owner."),
        ("Internal-only distribution",
         "The application is not published, distributed, or offered as a service to "
         "external parties. It is a private internal tool for Mi Marketing Industrial staff."),
    ]

    for title, desc in measures:
        row = Table([[
            Paragraph(f"<b>{title}</b>", sBodyLeft),
            Paragraph(desc, sBody)
        ]], colWidths=[4*cm, PAGE_W - 2*MARGIN - 4*cm])
        row.setStyle(TableStyle([
            ("BACKGROUND",   (0,0),(0,0), BLUE_LIGHT),
            ("BACKGROUND",   (1,0),(1,0), WHITE),
            ("TOPPADDING",   (0,0),(-1,-1), 7),
            ("BOTTOMPADDING",(0,0),(-1,-1), 7),
            ("LEFTPADDING",  (0,0),(-1,-1), 8),
            ("RIGHTPADDING", (0,0),(-1,-1), 8),
            ("VALIGN",       (0,0),(-1,-1), "TOP"),
            ("GRID",         (0,0),(-1,-1), 0.4, GREY_LINE),
        ]))
        elems.append(row)
        elems.append(Spacer(1, 3))

    elems.append(PageBreak())
    return elems


# ── Section 7: Declaration ────────────────────────────────────────────────────
def section_declaration():
    elems = []
    elems += section_rule()
    elems.append(Paragraph("7.  Declaration &amp; Contact", sH1))

    elems.append(Paragraph(
        "Mi Marketing Industrial confirms that the information provided in this document "
        "is accurate and complete. We agree to use the Google Ads API in compliance with "
        "the Google Ads API Terms of Service, the Google Ads API usage policies, and all "
        "applicable Google policies.",
        sBody))
    elems.append(Spacer(1, 6))
    elems.append(Paragraph(
        "We understand that Basic Access is intended for development and testing purposes "
        "and that if our usage grows beyond the Basic Access limits, we will apply for "
        "Standard Access with the appropriate additional documentation.",
        sBody))
    elems.append(Spacer(1, 12))

    elems.append(Paragraph("Contact Information", sH2))
    elems.append(info_box([
        ("Organization",  "Mi Marketing Industrial"),
        ("Email",         "mimarketingindustrial@gmail.com"),
        ("Application",   "Google Ads MCP Server (internal tool)"),
        ("Access level",  "Basic Access"),
        ("Date",          "May 26, 2026"),
    ]))
    elems.append(Spacer(1, 20))

    # Signature block
    sig_data = [[
        Table([
            [Paragraph("Authorized Representative", sLabel)],
            [Spacer(1, 0.8*cm)],
            [HRFlowable(width=5*cm, thickness=0.5, color=BLACK)],
            [Paragraph("Signature", sSmall)],
            [Spacer(1, 0.3*cm)],
            [HRFlowable(width=5*cm, thickness=0.5, color=BLACK)],
            [Paragraph("Name / Title", sSmall)],
            [Spacer(1, 0.3*cm)],
            [HRFlowable(width=5*cm, thickness=0.5, color=BLACK)],
            [Paragraph("Date", sSmall)],
        ], colWidths=[6*cm]),
        Spacer(1, 1),
        Table([
            [Paragraph("Application Details", sLabel)],
            [Spacer(1, 0.4*cm)],
            [Paragraph("Application name:", sSmall)],
            [Paragraph("Google Ads MCP Server", sBodyLeft)],
            [Spacer(1, 0.2*cm)],
            [Paragraph("Developer token request type:", sSmall)],
            [Paragraph("Basic Access", sBodyLeft)],
            [Spacer(1, 0.2*cm)],
            [Paragraph("Primary OAuth2 scope:", sSmall)],
            [Paragraph("https://www.googleapis.com/auth/adwords", sCode)],
        ], colWidths=[PAGE_W - 2*MARGIN - 6.6*cm]),
    ]]
    sig_t = Table(sig_data, colWidths=[6*cm, 0.6*cm, PAGE_W - 2*MARGIN - 6.6*cm])
    sig_t.setStyle(TableStyle([
        ("VALIGN",      (0,0),(-1,-1), "TOP"),
        ("LEFTPADDING", (0,0),(-1,-1), 0),
    ]))
    elems.append(sig_t)
    elems.append(Spacer(1, 14))

    elems += hr(GREY_LINE)
    elems.append(Paragraph(
        "Google Ads API Access Request  ·  Mi Marketing Industrial  ·  Confidential  ·  May 2026",
        sFooter))
    return elems


# ── Build ─────────────────────────────────────────────────────────────────────
OUTPUT = "/media/cesar/Data/MCP_meta_ads/windows_build/GoogleAds_API_Access_Request.pdf"

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=MARGIN,
    rightMargin=MARGIN,
    topMargin=1.6*cm,
    bottomMargin=1.6*cm,
    title="Google Ads API Access Request — Mi Marketing Industrial",
    author="Mi Marketing Industrial",
    subject="Google Ads API Basic Access Application",
)

story = []
story += cover_page()
story += section_company()
story += section_app()
story += section_usage()
story += section_features()
story += section_data()
story += section_security()
story += section_declaration()

doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
print(f"PDF generated: {OUTPUT}")
