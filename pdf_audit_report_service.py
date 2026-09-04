"""ReportLab-based PDF audit report generator (MA-30)."""

from __future__ import annotations

from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

COMPANY_NAME = "MedReachAI Data Intelligence"
TABLE_COLUMNS = ["Action Type", "Record ID", "Timestamp", "Description"]


def _build_header(styles) -> list:
    title_style = ParagraphStyle(
        "AuditTitle",
        parent=styles["Title"],
        textColor=colors.HexColor("#1a3a5c"),
    )
    subtitle_style = ParagraphStyle(
        "AuditSubtitle",
        parent=styles["Normal"],
        textColor=colors.HexColor("#555555"),
    )
    return [
        Paragraph(COMPANY_NAME, title_style),
        Paragraph("Compliance Audit Report", subtitle_style),
        Spacer(1, 0.25 * inch),
    ]


def _build_executive_summary(metrics: dict[str, Any], styles) -> list:
    elements: list = [
        Paragraph("Executive Summary", styles["Heading2"]),
    ]
    for label, value in metrics.items():
        display_label = label.replace("_", " ").title()
        elements.append(Paragraph(f"<b>{display_label}:</b> {value}", styles["Normal"]))
    elements.append(Spacer(1, 0.3 * inch))
    return elements


def _build_events_table(audit_events: list[dict[str, Any]], styles) -> list:
    wrap_style = ParagraphStyle("TableCell", parent=styles["Normal"], fontSize=8, leading=10)

    header_row = [Paragraph(f"<b>{column}</b>", wrap_style) for column in TABLE_COLUMNS]
    data_rows = [
        [
            Paragraph(str(event.get("action_type", "")), wrap_style),
            Paragraph(str(event.get("record_id", "")), wrap_style),
            Paragraph(str(event.get("timestamp", "")), wrap_style),
            Paragraph(str(event.get("description", "")), wrap_style),
        ]
        for event in audit_events
    ]

    table_data = [header_row] + data_rows
    table = Table(
        table_data,
        colWidths=[1.2 * inch, 1.1 * inch, 1.4 * inch, 3.0 * inch],
        repeatRows=1,
    )

    style_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3a5c")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#999999")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#333333")),
    ]
    for row_index in range(1, len(table_data)):
        if row_index % 2 == 0:
            style_commands.append(
                ("BACKGROUND", (0, row_index), (-1, row_index), colors.HexColor("#f2f2f2"))
            )
    table.setStyle(TableStyle(style_commands))

    return [Paragraph("Audit Event Log", styles["Heading2"]), table]


def generate_audit_pdf(
    audit_events: list[dict[str, Any]],
    metrics: dict[str, Any],
    output_path: str,
) -> str:
    """Render a branded PDF audit report to ``output_path`` and return that path."""
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(
        output_path,
        pagesize=LETTER,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
    )

    elements: list = []
    elements.extend(_build_header(styles))
    elements.extend(_build_executive_summary(metrics, styles))
    elements.extend(_build_events_table(audit_events, styles))

    doc.build(elements)
    return output_path


__all__ = ["generate_audit_pdf", "COMPANY_NAME"]
