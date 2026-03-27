# pyright: ignore
import io
from datetime import datetime
from typing import Dict, Any, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

__all__ = ["build_campaign_pdf", "build_candidate_pdf"]


def _format_date(value: str | None) -> str:
    if not value:
        return "-"
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).strftime(
            "%b %d, %Y"
        )
    except Exception:
        return value


def _format_number(value: Any, suffix: str = "") -> str:
    if value is None:
        return "-"
    try:
        return (
            f"{float(value):.1f}{suffix}"
            if isinstance(value, (int, float))
            else str(value)
        )
    except Exception:
        return str(value)


def _build_header(title: str, subtitle: str | None) -> List[Any]:
    styles = getSampleStyleSheet()
    header_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=20,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=8,
        fontName="Helvetica-Bold",
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=4,
    )
    blocks: List[Any] = [Paragraph(title, header_style)]
    if subtitle:
        blocks.append(Paragraph(subtitle, subtitle_style))
    blocks.append(Spacer(1, 0.25 * inch))
    return blocks


def _build_section_title(title: str) -> Paragraph:
    styles = getSampleStyleSheet()
    return Paragraph(
        title,
        ParagraphStyle(
            "SectionTitle",
            parent=styles["Heading2"],
            fontSize=13,
            textColor=colors.HexColor("#0f172a"),
            spaceBefore=14,
            spaceAfter=8,
            fontName="Helvetica-Bold",
            borderWidth=0,
            borderPadding=0,
            leftIndent=0,
        ),
    )


def _build_kv_table(rows: List[List[str]]) -> Table:
    table = Table(rows, colWidths=[2.3 * inch, 3.7 * inch])
    table.setStyle(
        TableStyle(
            [
                # Header row styling
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9.5),

                # Data rows styling
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),  # Bold labels
                ("FONTSIZE", (0, 1), (-1, -1), 9),
                ("TEXTCOLOR", (0, 1), (0, -1), colors.HexColor("#334155")),
                ("TEXTCOLOR", (1, 1), (1, -1), colors.HexColor("#1e293b")),

                # Padding
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),

                # Grid
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),

                # Alternate row colors
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafbfc")]),
            ]
        )
    )
    return table


def build_campaign_pdf(report: Dict[str, Any]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    elements: List[Any] = []
    campaign = report.get("campaign", {})
    summary = report.get("summary", {})
    job_summary = report.get("job_summary", [])
    candidates = report.get("candidates", [])

    elements.extend(
        _build_header(
            f"Campaign Report — {campaign.get('name', 'Campaign')}",
            f"Status: {campaign.get('status', '-')}\nCreated: {_format_date(campaign.get('created_at'))}",
        )
    )

    elements.append(_build_section_title("Summary"))
    summary_rows = [
        ["Metric", "Value"],
        ["Total Candidates", str(summary.get("total_candidates", 0))],
        ["Unique Jobs", str(summary.get("unique_jobs", 0))],
        ["Avg Resume Score", _format_number(summary.get("avg_resume_score"), "%")],
        ["Avg Coding Score", _format_number(summary.get("avg_coding_score"), "%")],
    ]
    elements.append(_build_kv_table(summary_rows))

    if summary.get("by_stage"):
        elements.append(Spacer(1, 0.15 * inch))
        elements.append(_build_section_title("Stage Breakdown"))
        stage_rows = [["Stage", "Count"]]
        for key, value in summary.get("by_stage", {}).items():
            stage_rows.append([key.replace("_", " ").title(), str(value)])
        elements.append(_build_kv_table(stage_rows))

    if summary.get("by_decision"):
        elements.append(Spacer(1, 0.15 * inch))
        elements.append(_build_section_title("Decision Breakdown"))
        decision_rows = [["Decision", "Count"]]
        for key, value in summary.get("by_decision", {}).items():
            decision_rows.append([key.replace("_", " ").title(), str(value)])
        elements.append(_build_kv_table(decision_rows))

    if job_summary:
        elements.append(_build_section_title("Job Summary"))
        job_rows = [
            [
                "Job Title",
                "Total",
                "Resume",
                "Technical",
                "Voice",
                "Completed",
            ]
        ]
        for row in job_summary:
            job_rows.append(
                [
                    row.get("job_title", "Unknown"),
                    str(row.get("total_count", 0)),
                    str(row.get("resume_screening_count", 0)),
                    str(row.get("technical_assessment_count", 0)),
                    str(row.get("voice_screening_count", 0)),
                    str(row.get("completed_count", 0)),
                ]
            )
        table = Table(
            job_rows,
            colWidths=[
                2.6 * inch,
                0.7 * inch,
                0.8 * inch,
                0.9 * inch,
                0.7 * inch,
                0.9 * inch,
            ],
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#f8fafc")],
                    ),
                ]
            )
        )
        elements.append(table)

    if candidates:
        elements.append(_build_section_title("Candidate List"))
        candidate_rows = [
            ["Name", "Email", "Job", "Stage", "Decision", "Resume", "Coding", "Slot"]
        ]
        for row in candidates:
            candidate_rows.append(
                [
                    row.get("candidate_name", "-"),
                    row.get("candidate_email", "-"),
                    row.get("job_title", "-") or "-",
                    row.get("current_stage", "-").replace("_", " ").title(),
                    row.get("final_decision", "-").replace("_", " ").title(),
                    _format_number(row.get("resume_match_score"), "%"),
                    _format_number(row.get("coding_score"), "%"),
                    row.get("slot_name", "-") or "-",
                ]
            )
        table = Table(
            candidate_rows,
            repeatRows=1,
            colWidths=[
                1.3 * inch,
                1.6 * inch,
                1.4 * inch,
                0.9 * inch,
                0.9 * inch,
                0.7 * inch,
                0.7 * inch,
                0.8 * inch,
            ],
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#f8fafc")],
                    ),
                ]
            )
        )
        elements.append(table)

    doc.build(elements)
    return buffer.getvalue()


def build_candidate_pdf(report: Dict[str, Any]) -> bytes:
    """
    Build comprehensive candidate assessment PDF report.

    Supports both legacy format (simple) and new statistics format (comprehensive).
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )
    elements: List[Any] = []

    # Check if this is the new comprehensive format
    if "overall_performance" in report:
        # New comprehensive statistics report
        elements.extend(_build_comprehensive_candidate_report(report))
    else:
        # Legacy format
        elements.extend(_build_legacy_candidate_report(report))

    doc.build(elements)
    return buffer.getvalue()


def _build_legacy_candidate_report(report: Dict[str, Any]) -> List[Any]:
    """Build legacy format candidate report (backward compatibility)."""
    elements: List[Any] = []

    candidate = report.get("candidate", {})
    resume = report.get("resume")
    coding = report.get("coding")
    voice = report.get("voice")

    elements.extend(
        _build_header(
            f"Candidate Report — {candidate.get('name', 'Candidate')}",
            f"Job: {candidate.get('job_title', '-')}\nStage: {candidate.get('current_stage', '-').replace('_', ' ').title()}",
        )
    )

    elements.append(_build_section_title("Summary"))
    summary_rows = [
        ["Field", "Value"],
        ["Email", candidate.get("email", "-")],
        ["Decision", candidate.get("final_decision", "-").replace("_", " ").title()],
        ["Resume Score", _format_number(candidate.get("resume_match_score"), "%")],
        ["Coding Score", _format_number(candidate.get("coding_score"), "%")],
        ["Voice Status", candidate.get("voice_status", "-")],
        ["Slot", candidate.get("slot_name", "-")],
        ["Created", _format_date(candidate.get("created_at"))],
    ]
    elements.append(_build_kv_table(summary_rows))

    if resume:
        elements.append(_build_section_title("Resume Summary"))
        resume_rows = [
            ["Match Score", _format_number(resume.get("match_score"), "%")],
            ["Summary", resume.get("summary", "-")],
        ]
        elements.append(_build_kv_table([["Field", "Value"]] + resume_rows))

    if coding:
        elements.append(_build_section_title("Coding Assessment"))
        coding_rows = [
            ["Status", coding.get("status", "-")],
            ["Score", _format_number(coding.get("score"), "")],
            ["Percentage", _format_number(coding.get("percentage"), "%")],
        ]
        elements.append(_build_kv_table([["Field", "Value"]] + coding_rows))

    if voice:
        elements.append(_build_section_title("Voice Screening"))
        voice_rows = [
            ["Status", voice.get("status", "-")],
            ["Summary", voice.get("summary", "-")],
        ]
        elements.append(_build_kv_table([["Field", "Value"]] + voice_rows))

    if candidate.get("decision_notes"):
        elements.append(_build_section_title("Decision Notes"))
        elements.append(
            Paragraph(
                candidate.get("decision_notes"), getSampleStyleSheet()["BodyText"]
            )
        )

    return elements


def _build_comprehensive_candidate_report(report: Dict[str, Any]) -> List[Any]:
    """Build comprehensive candidate statistics report with detailed analytics."""
    elements: List[Any] = []
    styles = getSampleStyleSheet()

    candidate = report.get("candidate", {})
    job = report.get("job", {})
    overall = report.get("overall_performance", {})
    resume_stats = report.get("resume_screening", {})
    technical_stats = report.get("technical_assessment", {})
    voice_stats = report.get("voice_screening", {})
    comparative = report.get("comparative_analytics", {})

    # Header
    elements.extend(
        _build_header(
            f"Technical Assessment Report — {candidate.get('name', 'Candidate')}",
            f"Position: {job.get('title', '-')}\nGenerated: {datetime.now().strftime('%B %d, %Y')}",
        )
    )

    # Overall Performance Summary
    elements.append(_build_section_title("Overall Performance"))
    overall_rows = [
        ["Metric", "Value"],
        ["Overall Score", _format_number(overall.get("overall_score"), "%")],
        ["Rating", overall.get("rating", "-")],
        ["Current Stage", candidate.get("current_stage", "-").replace("_", " ").title()],
        ["Final Decision", candidate.get("final_decision", "-").replace("_", " ").title()],
    ]
    elements.append(_build_kv_table(overall_rows))
    elements.append(Spacer(1, 0.15 * inch))

    # Contact Information
    elements.append(_build_section_title("Contact Information"))
    contact_rows = [
        ["Field", "Value"],
        ["Name", candidate.get("name", "-")],
        ["Email", candidate.get("email", "-")],
        ["Phone", candidate.get("phone", "-") or "Not provided"],
    ]
    elements.append(_build_kv_table(contact_rows))
    elements.append(Spacer(1, 0.15 * inch))

    # Resume Screening Results
    if resume_stats.get("completed"):
        elements.append(_build_section_title("1. Resume Screening Results"))
        resume_rows = [
            ["Metric", "Value"],
            ["Match Score", _format_number(resume_stats.get("match_score"), "%")],
            ["Screened Date", _format_date(resume_stats.get("screened_at"))],
        ]

        # Skills
        skills_found = resume_stats.get("skills_found", [])
        skills_missing = resume_stats.get("skills_missing", [])
        if skills_found:
            resume_rows.append(["Skills Matched", ", ".join(skills_found[:10])])
        if skills_missing:
            resume_rows.append(["Skills Missing", ", ".join(skills_missing[:5])])

        # Experience
        if resume_stats.get("total_experience_years"):
            resume_rows.append(["Total Experience", f"{resume_stats.get('total_experience_years')} years"])

        elements.append(_build_kv_table(resume_rows))

        # LLM Analysis
        if resume_stats.get("llm_analysis"):
            elements.append(Spacer(1, 0.1 * inch))
            elements.append(Paragraph("<b>Analysis:</b>", styles["Normal"]))
            elements.append(Paragraph(resume_stats.get("llm_analysis", ""), styles["BodyText"]))

        elements.append(Spacer(1, 0.15 * inch))

    # Technical Assessment Results
    if technical_stats.get("completed"):
        elements.append(_build_section_title("2. Technical Assessment Results"))
        tech_rows = [
            ["Metric", "Value"],
            ["Overall Score", _format_number(technical_stats.get("total_score"), "")],
            ["Percentage", _format_number(technical_stats.get("percentage"), "%")],
            ["Status", technical_stats.get("status", "-")],
            ["Duration", technical_stats.get("duration_formatted", "-")],
            ["Submitted", _format_date(technical_stats.get("submitted_at"))],
        ]

        # Add flags if any
        if technical_stats.get("late_submission"):
            tech_rows.append(["Late Submission", "Yes"])
        if technical_stats.get("suspicious_activity"):
            tech_rows.append(["Suspicious Activity", "Flagged"])

        elements.append(_build_kv_table(tech_rows))
        elements.append(Spacer(1, 0.1 * inch))

        # Questions breakdown
        questions_data = technical_stats.get("questions", {})
        elements.append(Paragraph("<b>Question Analysis:</b>", styles["Normal"]))
        question_summary_rows = [
            ["Total Questions", str(questions_data.get("total", 0))],
            ["Attempted", str(questions_data.get("attempted", 0))],
            ["Fully Correct", str(questions_data.get("fully_correct", 0))],
            ["Attempt Rate", _format_number(questions_data.get("attempt_rate"), "%")],
            ["Accuracy Rate", _format_number(questions_data.get("accuracy_rate"), "%")],
        ]
        elements.append(_build_kv_table([["Metric", "Value"]] + question_summary_rows))

        # Individual questions table
        question_details = questions_data.get("details", [])
        if question_details:
            elements.append(Spacer(1, 0.1 * inch))
            elements.append(Paragraph("<b>Question Details:</b>", styles["Normal"]))
            question_rows = [["Q#", "Difficulty", "Language", "Score", "Status"]]
            for idx, q in enumerate(question_details, start=1):
                status = "✓ Correct" if q.get("fully_correct") else ("Attempted" if q.get("attempted") else "Skipped")
                question_rows.append([
                    str(idx),
                    q.get("difficulty", "-").title(),
                    q.get("language", "-"),
                    f"{q.get('marks_obtained', 0)}/{q.get('max_marks', 0)}",
                    status
                ])

            # Column widths: Q#, Difficulty, Language, Score, Status
            table = Table(question_rows, colWidths=[0.5*inch, 1.2*inch, 1.2*inch, 1.0*inch, 1.3*inch])
            table.setStyle(
                TableStyle([
                    # Header styling
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 9.5),

                    # Data rows
                    ("FONTSIZE", (0, 1), (-1, -1), 9),
                    ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#1e293b")),

                    # Padding
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),

                    # Grid and alignment
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafbfc")]),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("ALIGN", (0, 0), (0, -1), "CENTER"),  # Center align Q# column
                    ("ALIGN", (3, 0), (3, -1), "CENTER"),  # Center align Score column
                ])
            )
            elements.append(table)

        elements.append(Spacer(1, 0.15 * inch))

    # Voice Screening Results
    if voice_stats.get("completed"):
        elements.append(_build_section_title("3. Voice Screening Results"))
        voice_rows = [
            ["Metric", "Value"],
            ["Status", voice_stats.get("status", "-")],
        ]

        calls_data = voice_stats.get("calls", {})
        if calls_data:
            voice_rows.extend([
                ["Total Calls", str(calls_data.get("total", 0))],
                ["Completed Calls", str(calls_data.get("completed", 0))],
                ["Total Duration", calls_data.get("total_duration_formatted", "-")],
                ["Average Duration", _format_duration(calls_data.get("average_duration", 0))],
                ["Total Cost", f"${calls_data.get('total_cost', 0)}"],
            ])

        if voice_stats.get("recruiter_notes"):
            voice_rows.append(["Recruiter Notes", voice_stats.get("recruiter_notes")])

        elements.append(_build_kv_table(voice_rows))

        # Call history
        call_details = calls_data.get("details", [])
        if call_details:
            elements.append(Spacer(1, 0.1 * inch))
            elements.append(Paragraph("<b>Call History:</b>", styles["Normal"]))
            for idx, call in enumerate(call_details[:3]):  # Show up to 3 recent calls
                call_info = [
                    ["Field", "Value"],
                    ["Call #", str(idx + 1)],
                    ["Status", call.get("status", "-")],
                    ["Duration", call.get("duration_formatted", "-")],
                    ["Date", _format_date(call.get("started_at"))],
                ]
                if call.get("summary"):
                    call_info.append(["Summary", call.get("summary")])

                elements.append(_build_kv_table(call_info))
                elements.append(Spacer(1, 0.05 * inch))

        elements.append(Spacer(1, 0.15 * inch))

    # Comparative Analytics
    if comparative.get("available"):
        elements.append(_build_section_title("Comparative Analysis"))

        # Resume comparison
        resume_comp = comparative.get("resume_screening", {})
        if resume_comp and resume_comp.get("rank"):
            elements.append(Paragraph("<b>Resume Screening Comparison:</b>", styles["Normal"]))
            resume_comp_rows = [
                ["Metric", "Value"],
                ["Rank", f"#{resume_comp.get('rank', '-')} of {comparative.get('total_candidates', '-')}"],
                ["Percentile", _format_number(resume_comp.get("percentile"), "%ile")],
                ["Average Score (All Candidates)", _format_number(resume_comp.get("average_score"), "%")],
            ]
            elements.append(_build_kv_table(resume_comp_rows))
            elements.append(Spacer(1, 0.1 * inch))

        # Technical comparison
        tech_comp = comparative.get("technical_assessment", {})
        if tech_comp and tech_comp.get("rank"):
            elements.append(Paragraph("<b>Technical Assessment Comparison:</b>", styles["Normal"]))
            tech_comp_rows = [
                ["Metric", "Value"],
                ["Rank", f"#{tech_comp.get('rank', '-')} of {tech_comp.get('total_attempted', '-')}"],
                ["Percentile", _format_number(tech_comp.get("percentile"), "%ile")],
                ["Average Score (All Candidates)", _format_number(tech_comp.get("average_score"), "%")],
            ]
            elements.append(_build_kv_table(tech_comp_rows))
            elements.append(Spacer(1, 0.1 * inch))

        # Overall summary
        if not resume_comp.get("rank") and not tech_comp.get("rank"):
            comp_rows = [
                ["Metric", "Value"],
                ["Total Candidates (Job)", str(comparative.get("total_candidates", 0))],
            ]
            elements.append(_build_kv_table(comp_rows))

        elements.append(Spacer(1, 0.15 * inch))

    # Decision Notes (if any)
    if candidate.get("decision_notes"):
        elements.append(_build_section_title("Decision Notes"))
        elements.append(
            Paragraph(candidate.get("decision_notes"), styles["BodyText"])
        )
        elements.append(Spacer(1, 0.15 * inch))

    # Footer
    footer_style = ParagraphStyle(
        "Footer",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#6b7280"),
        alignment=1,  # Center
    )
    elements.append(Spacer(1, 0.3 * inch))
    elements.append(Paragraph(
        f"Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}",
        footer_style
    ))

    return elements


def _format_duration(seconds: int) -> str:
    """Format seconds into human-readable duration."""
    if not seconds:
        return "0s"

    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60

    parts = []
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0:
        parts.append(f"{minutes}m")
    if secs > 0 or not parts:
        parts.append(f"{secs}s")

    return " ".join(parts)
