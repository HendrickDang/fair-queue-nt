// Builds the Fair Queue NT competition report (A4, Arial, CDU spec).
//   npm install docx, then: node docs/report/build_report.js   -> report.docx (set OUT=... to rename)
// Spec: title 20pt bold, section headings 14pt bold, body 11pt,
// captions and references 10pt, header/footer with team and page number.

const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer, AlignmentType,
  PageNumber, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  LevelFormat, PageBreak, TabStopType,
} = require("docx");

const TEAM = process.env.TEAM || "AIC008";
const TEAM_NAME = process.env.TEAM_NAME || "Last Bar";
const FONT = "Arial";
const W = 9638; // content width in DXA (A4 with 2 cm margins)
const NAVY = "16202A", RUST = "A8461B", SAND = "F4F1EA", RULE = "D9D5CC"; // same palette as the slides

// ---------- text helpers: **bold**, *italic* ----------
function runs(text, size = 22, extra = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, size, ...extra }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, font: FONT, size, ...extra }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, font: FONT, size, ...extra }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, size, ...extra }));
  return out;
}
const P = (text, o = {}) => new Paragraph({
  children: runs(text, o.size || 22),
  spacing: { after: o.after ?? 100, line: 264 },
  alignment: o.align || AlignmentType.JUSTIFIED,
  keepNext: o.keepNext,
});
// newPage starts the heading on a fresh page (a separate page-break paragraph can leave a blank page)
const H1 = (text, newPage = false) => new Paragraph({
  children: [new TextRun({ text, bold: true, font: FONT, size: 28, color: NAVY })],
  spacing: { before: newPage ? 0 : 220, after: 100 }, keepNext: true, pageBreakBefore: newPage,
});
const H2 = (text) => new Paragraph({
  children: [new TextRun({ text, bold: true, font: FONT, size: 22, color: RUST })],
  spacing: { before: 140, after: 60 }, keepNext: true,
});
const BUL = (text) => new Paragraph({
  children: runs(text), numbering: { reference: "bul", level: 0 },
  spacing: { after: 50, line: 264 }, alignment: AlignmentType.LEFT,
});
const NUM = (text, ref = "num") => new Paragraph({
  children: runs(text), numbering: { reference: ref, level: 0 },
  spacing: { after: 60, line: 264 }, alignment: AlignmentType.LEFT,
});
const CAP = (text, keepNext = false) => new Paragraph({
  children: runs(text, 20), spacing: { before: 40, after: keepNext ? 60 : 160 },
  alignment: AlignmentType.LEFT, keepNext,
});
function IMG(file, widthPx) {
  const buf = fs.readFileSync(path.join(__dirname, file)); // paths are relative to this script
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20); // PNG IHDR
  return new Paragraph({
    children: [new ImageRun({ type: "png", data: buf, transformation: { width: widthPx, height: Math.round(widthPx * h / w) } })],
    alignment: AlignmentType.CENTER, spacing: { before: 60, after: 20 }, keepNext: true,
  });
}
const border = { style: BorderStyle.SINGLE, size: 4, color: RULE };
const borders = { top: border, bottom: border, left: border, right: border };
function TABLE(rows, widths, size = 20) {
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, i) => new TableRow({
      tableHeader: i === 0,
      cantSplit: true,
      children: r.map((c, j) => new TableCell({
        borders, width: { size: widths[j], type: WidthType.DXA },
        shading: i === 0 ? { fill: NAVY, type: ShadingType.CLEAR, color: "auto" } : (i % 2 === 0 ? { fill: "FAF8F4", type: ShadingType.CLEAR, color: "auto" } : undefined),
        margins: { top: 60, bottom: 60, left: 110, right: 110 },
        children: [new Paragraph({
          children: runs(c, size, i === 0 ? { bold: true, color: "FFFFFF" } : {}),
          alignment: AlignmentType.LEFT,
          keepNext: i < rows.length - 1, // keep the whole table on one page
        })],
      })),
    })),
  });
}
const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: none, bottom: none, left: none, right: none };
// Title block: one shaded cell, so the title page carries the slide deck's look.
function TITLEBLOCK() {
  const line = (text, size, o = {}) => new Paragraph({
    children: [new TextRun({ text, font: FONT, size, color: o.color || "FFFFFF", bold: o.bold, characterSpacing: o.track })],
    spacing: { after: o.after ?? 120 }, alignment: AlignmentType.LEFT,
  });
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    rows: [new TableRow({ children: [new TableCell({
      borders: noBorders, width: { size: W, type: WidthType.DXA },
      shading: { fill: NAVY, type: ShadingType.CLEAR, color: "auto" },
      margins: { top: 620, bottom: 620, left: 520, right: 520 },
      children: [
        line("CDU IT CODE FAIR 2026  |  AI CHALLENGE  |  BRIEF 1", 18, { color: "F2A65A", bold: true, track: 20, after: 260 }),
        line("Fair Queue NT", 40, { bold: true, after: 160 }),
        line("Need decides the queue. Distance decides the route.", 28, { after: 200 }),
        line("Trusted AI decision-support for housing maintenance triage in remote Northern Territory communities", 22, { color: "D9DEE3", after: 0 }),
      ],
    })] })],
  });
}
// Key results: four numbers a reader can take away before the detail.
function STATS(items) {
  const w = Math.floor(W / items.length);
  const gap = { style: BorderStyle.SINGLE, size: 24, color: "FFFFFF" };
  return new Table({
    width: { size: w * items.length, type: WidthType.DXA }, columnWidths: items.map(() => w),
    rows: [new TableRow({ cantSplit: true, children: items.map(([big, label]) => new TableCell({
      borders: { top: none, bottom: none, left: gap, right: gap },
      width: { size: w, type: WidthType.DXA },
      shading: { fill: SAND, type: ShadingType.CLEAR, color: "auto" },
      margins: { top: 130, bottom: 130, left: 160, right: 120 },
      children: [
        new Paragraph({ children: [new TextRun({ text: big, font: FONT, size: 40, bold: true, color: RUST })], spacing: { after: 40 }, keepNext: true }),
        new Paragraph({ children: runs(label, 20), alignment: AlignmentType.LEFT }),
      ],
    })) })],
  });
}
const BREAK = () => new Paragraph({ children: [new PageBreak()] });
const REF = (text) => new Paragraph({
  children: runs(text, 20), spacing: { after: 80, line: 252 },
  indent: { left: 567, hanging: 567 }, alignment: AlignmentType.LEFT,
});

// ---------- content ----------
const title = [
  new Paragraph({ spacing: { before: 1900 }, children: [] }),
  TITLEBLOCK(),
  new Paragraph({ spacing: { before: 500, after: 140 }, children: [new TextRun({ text: `Team ${TEAM}: ${TEAM_NAME}`, font: FONT, size: 28, bold: true, color: NAVY })] }),
  TABLE([
    ["Team member", "Role", "Student ID"],
    ["Van Hoi (Hendrick) Dang", "Python analysis, experiments and report", "S395598"],
    ["Le Nhat Minh (Thomas) Tran", "Web application and ranking engine", "S390789"],
    ["Minh Hoang Bui", "Presentation and data checks", "S399292"],
    ["Ngoc Ngan (Kelly) Le", "Presentation and test scenarios", "S401010"],
  ], [3300, 4638, 1700], 22),
  new Paragraph({ spacing: { before: 500, after: 80 }, children: [new TextRun({ text: "Submitted 8 October 2026", font: FONT, size: 22, bold: true })] }),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "Source code and datasets: https://github.com/HendrickDang/fair-queue-nt", font: FONT, size: 22 })] }),
  new Paragraph({ children: [new TextRun({ text: "All data in this project is synthetic. No real tenant, household or NT Government data was used.", font: FONT, size: 22, color: "3C4650" })] }),
  BREAK(),
];

const summary = [
  H1("Summary"),
  P("Housing maintenance coordinators in the Northern Territory (NT) ration too few trades across very large distances. A tool that minimises cost will rank town jobs first because they are cheaper to reach, and remote tenants slide down the queue without anyone deciding that they should. NT policy already allows urgent remote repairs 5 business days against 2 elsewhere. **Fair Queue NT** is a working decision-support tool that separates two questions. A need score, built only from the fault report, decides who most needs help; location cannot change it, and a test checks this. A separate efficiency score uses distance and batches nearby jobs into shared trips. The coordinator sets one visible dial that weights travel cost, sees its effect on remote households, and commits the schedule to an audit log. Tenants get a plain-language answer naming the role that decided, what is ahead of them, when their target will be missed, what would move them up and how to ask a person to review it. In 300 simulated queues, moving the dial from need to cost finished 22% more jobs in the first week, made urgent remote households wait 2.5 times longer, and left total travel unchanged. Batching cut travel cost by 30%. The parser misread 86% of urgent Kriol-influenced reports as routine; a fail-safe that sends unread reports to a person cut this to 7%. We recommend batching, one response target for every tenant, the fail-safe, and co-design with remote communities before any real use."),
];

const intro = [
  H1("1. Introduction"),
  P("Remote public housing in the NT is maintained by trades who travel hundreds of kilometres by unsealed road, barge or light aircraft. The Australian National Audit Office (2022) found that the size and remoteness of the NT raises the cost of delivering housing, and the Remote Housing Review found that most housing failures with health consequences could have been prevented by regular maintenance (Department of the Prime Minister and Cabinet, 2017). Current NT policy sets repair targets by location: urgent repairs within 2 business days in standard areas but 5 in remote areas, and routine repairs within 10 against 25 (Department of Housing, Local Government and Community Development, 2025)."),
  P("Brief 1 asks how a coordinator can prioritise urgent repairs without efficiency *quietly* pushing remote tenants to the back of the queue. The word *quietly* matters. A cost-minimising ranking never has to mention remoteness to disadvantage remote tenants: travel cost does it automatically. Because remoteness in the NT is closely tied to Aboriginal communities, a cost-based ranking can become a proxy for race without anyone choosing that outcome."),
  P("Our design principle is that **need decides the queue and distance decides the route**. We built a working web application and a Python analysis that tests it. The project contributes: (1) a triage design in which location cannot change a job's need score, checked by an automated test; (2) a single, human-owned dial that makes the cost trade-off explicit, with its consequences measured; (3) a tenant explanation designed to be understood and challenged; and (4) evidence of a second, less visible equity risk: whose words the parser can read."),
];

const method = [
  H1("2. Methodology"),
  H2("2.1 System overview"),
  P("A report passes through five steps (Figure 1). First, a parser turns free text into structured fields: category, safety level, urgency flags (for example exposed wiring or no water) and household vulnerability (for example an infant or a person using medical equipment). Second, a **need score** ranks jobs on those fields alone. Third, an **efficiency score** estimates the cost of doing each job now, after batching. Fourth, the coordinator sets the dial and commits a schedule, which is written to an audit log with the dial value and time. Fifth, any tenant can see an explanation generated from the same numbers the coordinator saw. The dashboard draws the queue as a street of houses that rearrange as the dial moves, and a house diagram shows which part of the home each report was read as being about. The demonstration parser is deterministic and works offline. An optional fine-tuned small language model runs locally with the same output schema, so reports need not leave the device."),
  IMG("dash_crop.png", 640),
  CAP("**Figure 1.** Coordinator dashboard with the dial at full travel-cost weight (marker 1). The Wadeye roof leaking and sagging over a child's bed (critical, need rank 3) falls to eighth (marker 2), behind a stove and a leaking tap in town. The panel (marker 3) states that the dial saves no travel; batching does. In the street along the top, one house per repair, the five town houses (blue roofs) have moved to the front (marker 4)."),
  H2("2.2 Data"),
  P("No real tenant data was used. **Communities:** 48 NT communities with public names and coordinates (they can be checked against the NT Government's BushTel community profiles, https://bushtel.nt.gov.au), grouped into four tiers based on the ABS Remoteness Structure (Australian Bureau of Statistics, 2021): urban base, regional town, remote, and very remote or island; 35 are remote or very remote. Each has an access mode (road or air) and a servicing trade base (Darwin, Palmerston, Katherine, Tennant Creek or Alice Springs). **Travel:** straight-line distance multiplied by a detour factor (1.3 by road, 1.05 by air), fixed speeds and costs per kilometre, plus $110 per labour hour (Appendix C). These are transparent assumptions, not routed estimates. **Faults:** 22 scenarios across 12 categories, each with a ground-truth safety level from documented escalation rules; for example, no water with an infant or elderly person present is critical. **Text:** each scenario is written in four registers for robustness testing (Section 2.5). The datasets are published as CSV files with a data dictionary (Appendix B)."),
  H2("2.3 Scoring and the dial"),
  P("**Need** = (S + sum of urgency flag weights) × min(2, 1 + sum of vulnerability weights), where S is 100, 60, 25 or 8 for critical, high, medium or low safety after the escalation rules are applied. The function uses three fields only (in the Python port, an explicit whitelist). A test moves every job to each of the 48 communities and confirms that its need score never changes."),
  P("**Efficiency** = travel cost + (on-site hours + travel hours) × labour rate. **Batching** groups communities linked by hops of 200 km or less into one service run and credits each job its share of the travel saved. Both scores are rescaled to 0 to 1 and combined as **adjusted = (1 - λ) × need - λ × cost**. The value of λ is never learned or tuned by the system. The coordinator sets it, sees its effect on remote waits before committing, and the commit records the value, the time and the role that made it."),
  H2("2.4 The tenant explanation"),
  P("The tenant answer has seven parts. Every figure in it comes from the job's own scores and ranks, so none can be invented; the advice and review path are fixed wording: what we understood; how urgent it was rated and the response target; how many repairs are ahead and how many of those are more urgent; whether a person's decision to weight travel moved it, and when; the expected visit date and whether it misses the target; what information would move it up; and how to ask a person to review it (Figure 2). The page also draws the tenant's place in the queue, showing how many homes are ahead and why, without names or details. We apply the NT standard-area targets to every tenant, so a late remote repair is reported as late rather than hidden by a longer remote target."),
  IMG("tenant_crop.png", 360),
  CAP("**Figure 2.** The tenant answer for a high-priority repair in Yuendumu, after the coordinator committed a schedule at 40% travel-cost weight."),
  H2("2.5 Experiments"),
  BUL("**E1 Dial.** 300 queues of 40 jobs, half from remote communities, with routine faults three times as likely as critical ones. One crew per trade base works down the ranked queue, 8 hours a day. Outcomes measured at 11 dial settings."),
  BUL("**E2 Batching.** The same queues with batching switched off."),
  BUL("**E3 Parser robustness.** 22 scenarios × 30 reports × 4 registers = 2,640 reports: the app's own phrasing, formal housing-officer notes, informal or SMS spelling, and Kriol-influenced English. The Kriol-influenced sentences were drafted with AI assistance by a team with no Kriol speakers; they are rough approximations for stress testing, not authentic Kriol. Measure: the share of urgent (critical or high) reports read as medium or low."),
  BUL("**E4 Ageing.** 60 simulated weeks (the first 8 excluded), about 30 new reports a week, crew hours equal to demand on unbatched trips, backlog re-ranked weekly, with and without 6 need points added per week waited."),
  P("**Verification.** The Python analysis is a commented port of the web app's engine. A parity test confirms identical parses, scores and ranks on 74 reports and 44 ranked runs (two queues, 11 dial values, batching on and off). There are 79 Python and 62 TypeScript tests, all randomness is seeded, and a fresh clone reproduces every number. As a sensitivity check, E1 was rerun with all fault scenarios equally likely."),
];

const findings = [
  H1("3. Findings"),
  STATS([
    ["2.5×", "longer wait for urgent remote jobs when the dial moves from need to cost"],
    ["$0", "change in total travel cost from moving the dial"],
    ["30%", "less travel cost from batching nearby jobs into one trip"],
    ["86% to 7%", "urgent Kriol-influenced reports misread, before and after the fail-safe"],
  ]),
  new Paragraph({ spacing: { after: 60 }, children: [] }),
  H2("3.1 The dial reorders work; it does not save travel"),
  P("At λ = 0 the median town job is finished in 3.6 working days and the median remote job in 6.1 (Figure 3). Moving to λ = 1 cuts town waits to 1.3 days and raises remote waits to 7.1. The effect is sharpest where it matters most: **urgent remote jobs rise from 2.9 to 7.2 days, 2.5 times longer**, while urgent town jobs barely change (1.7 to 1.6). Need-weighted waiting, which counts urgent jobs more heavily, rises 37% (3.6 to 4.9 days)."),
  P("Efficiency buys more jobs finished early: 24.6 per queue in the first five working days against 20.2, a 22% gain. It does **not** buy lower travel cost. In this model every job is eventually done and batching does not depend on order, so the dial cannot change total travel ($37,342 per queue at every setting). Cost-first ordering moves work forward in time; it decides who waits, not how much is spent. That is the trade-off the coordinator must own, and the dashboard now says so (Figure 1). With all scenarios equally likely the pattern holds: urgent remote waits rise from 4.3 to 7.6 days."),
  IMG("../../analysis/figures/fig1_dial.png", 620),
  CAP("**Figure 3.** Median working days until a job is done, by dial setting, with batching (E1, 300 queues of 40 jobs)."),
  H2("3.2 Batching is where the saving is"),
  P("Batching cuts travel cost by 30% and shortens waits for everyone (Table 1). It turns distance from a reason to wait into a reason to go: a remote trip carrying several jobs is cheap per job.", { keepNext: true }),
  CAP("**Table 1.** Batching off and on, dial at λ = 0 (E2, mean or median over 300 queues).", true),
  TABLE([
    ["Measure", "Batching off", "Batching on"],
    ["Travel cost per queue", "$53,305", "$37,342 (-30%)"],
    ["Median days, remote jobs", "8.1", "6.1"],
    ["Median days, urgent remote jobs", "4.0", "2.9"],
    ["Urgent remote jobs missing their target", "94%", "84%"],
    ["Jobs finished in first 5 working days", "16.8", "20.2"],
  ], [4838, 2400, 2400]),
  new Paragraph({ spacing: { after: 80 }, children: [] }),
  H2("3.3 Ranking by need alone is not enough"),
  P("Even at λ = 0 with batching, 84% of urgent remote jobs miss their response target (1 working day for critical, 2 for high), against 59% in town. The cause is capacity: a remote round trip (median 694 km) uses crew hours whatever the ranking. No ranking fixes a shortage of trades. The tool's job is to make that shortage visible, which is why the tenant answer states when a target will be missed."),
  H2("3.4 Whose words can the parser read?"),
  P("The parser read 11% of urgent reports as routine when they used its own phrasing, 36% for formal officer notes, 43% for informal or SMS spelling and 86% for Kriol-influenced English (Figure 4). Officer notes fail because they use different words (\"discoloured\", \"air-conditioning\", \"break-in\"), not because they are informal; the parser does not even know the word \"infant\". Accuracy measured on text that shares the parser's vocabulary therefore overstates real performance. Testing other registers also exposed a bug: the parser found \"nan\" (grandmother) inside \"tenant\", so any note that mentioned the tenant was flagged as an elderly household. We fixed it."),
  P("A **fail-safe** rule (if no hazard is recognised, a person reads the report and it is held at high priority until they do) cut urgent misreads to under 8% in every register. The cost is workload: 32% to 82% of reports would need human reading. We think that cost is right: uncertainty should go to a person, never to the back of the queue. The web app shows this as a report is typed: the house diagram stays unlit, and a note asks a person to read the report. Holding such reports at high priority is not yet built into the app."),
  IMG("../../analysis/figures/fig2_parser.png", 620),
  CAP("**Figure 4.** Share of urgent reports read as medium or low, by register, with and without the fail-safe (E3, 660 reports per register)."),
  H2("3.5 Ageing caps the longest waits"),
  P("With strict ranking, some low-priority jobs were still waiting when the 60-week simulation ended. Adding priority for time waited cut the longest remote wait from 41 weeks to between 13 and 19 at λ = 0.3 to 0.6, and the longest town wait from 52 weeks to between 27 and 30. The cost is that waiting is spread more evenly: at λ = 0.3 the average town wait rose from 0.9 to 1.2 weeks and the share of town jobs waiting over 8 weeks from 2.8% to 5.4%. This model is sensitive to how crew capacity is set, so we report only these tail effects. The web app applies a simple version of the rule: one need point for each day waited, capped at 30."),
];

const discussion = [
  H1("4. Discussion: ethical, cultural and community impacts"),
  H2("4.1 Efficiency is not neutral"),
  P("Cost per job rises with distance, so any cost-based ordering favours town tenants, and in the NT that means it disproportionately delays Aboriginal households. Our design keeps location out of the need score and applies one response target to everyone. It does not remove the trade-off: any λ above zero still delays remote households. What changes is that the delay becomes a recorded decision by a named role, with its cost to remote tenants shown before it is made, instead of a side-effect nobody chose."),
  H2("4.2 Language is an equity issue"),
  P("Many remote tenants speak an Aboriginal language or Kriol as a first language and may report faults through family, a housing officer or an interpreter. E3 shows that a keyword parser fails most for exactly these reports. Natural language processing tools are known to perform worse on dialects that differ from their training text (Blodgett et al., 2016). A fine-tuned model may do better, but only if it learns from real examples written or checked by Kriol speakers, for example through the NT Aboriginal Interpreter Service. We are cautious about our own result: our Kriol-influenced sentences are approximations written without Kriol speakers, so the 86% figure shows the direction of the risk, not its size."),
  H2("4.3 Contestability and human ownership"),
  P("The Royal Commission into the Robodebt Scheme (2023) showed the harm of automated government decisions that people cannot understand or challenge. Our explanation names the role that decided and when, tells the tenant what information would change the outcome (close in spirit to a counterfactual explanation; Wachter et al., 2018) and gives a path to a person. Coordinators may still over-trust a default ranking (Parasuraman & Manzey, 2010). We mitigate this by defaulting the dial to need only, requiring an explicit commit, and logging each decision so that override and review rates can be monitored. These measures address Australia's AI Ethics Principles on fairness, transparency, contestability and accountability (Department of Industry, Innovation and Science, 2019)."),
  H2("4.4 Data sovereignty and privacy"),
  P("Household vulnerability is sensitive information. We collect it only as tenants declare it, and it can only raise priority. Data about Aboriginal communities should be governed with those communities, following the CARE principles (Carroll et al., 2020), the Maiam nayri Wingara Indigenous Data Sovereignty Collective (2018) and the AIATSIS Code of Ethics (Australian Institute of Aboriginal and Torres Strait Islander Studies, 2020). We used no community data. Any real deployment would need community governance and consent, not only departmental approval. The offline design keeps reports on local devices."),
  H2("4.5 Limitations"),
  P("All data is synthetic, so the results show how the mechanism behaves, not how it would perform on real NT reports. Travel uses straight-line distance, each base has one crew, and the scoring weights were set by the team, not by tenants or coordinators. The tenant page recomputes the queue at the committed dial value rather than replaying the committed order, and without a login the deciding role is recorded as stated. We did not consult remote communities in the time available, and we report no accuracy results for the optional fine-tuned model."),
];

const recs = [
  H1("5. Recommendations"),
  NUM("**Batch remote jobs by default.** It gives the largest saving and shortens waits for everyone."),
  NUM("**Keep travel out of need.** Make any travel weighting a recorded, reviewable decision, with its cost to remote households shown before it is committed."),
  NUM("**Use one response target for every tenant** and report breaches, rather than lengthening remote targets."),
  NUM("**Adopt the fail-safe.** A report the system cannot read goes to a person; it never defaults to low priority."),
  NUM("**Keep ageing** so that no job waits indefinitely, and set its rate with coordinators."),
  NUM("**Co-design before use.** Set weights, explanation wording and language support with remote communities, Aboriginal community-controlled housing organisations such as Aboriginal Housing NT, and interpreters, and test on real de-identified reports under community data governance."),
  NUM("**Monitor monthly:** remote and town waits, target breaches, dial settings, overrides and review requests."),
];

const refs = [
  H1("References", true),
  REF("Australian Bureau of Statistics. (2021). *Australian Statistical Geography Standard (ASGS) Edition 3: Remoteness structure*. https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/remoteness-structure"),
  REF("Australian Institute of Aboriginal and Torres Strait Islander Studies. (2020). *AIATSIS code of ethics for Aboriginal and Torres Strait Islander research*. https://aiatsis.gov.au/research/ethical-research/code-ethics"),
  REF("Australian National Audit Office. (2022). *Remote housing in the Northern Territory* (Auditor-General Report No. 18 2021-22). https://www.anao.gov.au/work/performance-audit/remote-housing-the-northern-territory"),
  REF("Blodgett, S. L., Green, L., & O'Connor, B. (2016). Demographic dialectal variation in social media: A case study of African-American English. In J. Su, K. Duh, & X. Carreras (Eds.), *Proceedings of the 2016 Conference on Empirical Methods in Natural Language Processing* (pp. 1119-1130). Association for Computational Linguistics. https://doi.org/10.18653/v1/D16-1120"),
  REF("Carroll, S. R., Garba, I., Figueroa-Rodríguez, O. L., Holbrook, J., Lovett, R., Materechera, S., Parsons, M., Raseroka, K., Rodriguez-Lonebear, D., Rowe, R., Sara, R., Walker, J. D., Anderson, J., & Hudson, M. (2020). The CARE principles for Indigenous data governance. *Data Science Journal, 19*, Article 43. https://doi.org/10.5334/dsj-2020-043"),
  REF("Department of Housing, Local Government and Community Development. (2025). *Repairs and maintenance* (Fact sheet FS17). Northern Territory Government. https://dhlgcd.nt.gov.au/__data/assets/pdf_file/0009/649503/repairs-and-maintenance-fs17.pdf"),
  REF("Department of Industry, Innovation and Science. (2019). *Australia's AI ethics principles*. Australian Government. https://www.industry.gov.au/publications/australias-artificial-intelligence-ethics-framework/australias-ai-ethics-principles"),
  REF("Department of the Prime Minister and Cabinet. (2017). *Remote housing review: A review of the National Partnership Agreement on Remote Indigenous Housing and the Remote Housing Strategy (2008-2018)*. Commonwealth of Australia. https://www.niaa.gov.au/sites/default/files/documents/publications/review-of-remote-housing.pdf"),
  REF("Maiam nayri Wingara Indigenous Data Sovereignty Collective. (2018). *Indigenous data sovereignty communique*. https://www.maiamnayriwingara.org"),
  REF("Parasuraman, R., & Manzey, D. H. (2010). Complacency and bias in human use of automation: An attentional integration. *Human Factors, 52*(3), 381-410. https://doi.org/10.1177/0018720810376055"),
  REF("Royal Commission into the Robodebt Scheme. (2023). *Report of the Royal Commission into the Robodebt Scheme*. Commonwealth of Australia. https://robodebt.royalcommission.gov.au/publications/report"),
  REF("Wachter, S., Mittelstadt, B., & Russell, C. (2018). Counterfactual explanations without opening the black box: Automated decisions and the GDPR. *Harvard Journal of Law & Technology, 31*(2), 841-887."),
];

const appendices = [
  H1("Appendix A. AI usage declaration", true),
  P("The team used generative AI tools for the tasks below.", { align: AlignmentType.LEFT, after: 80 }),
  TABLE([
    ["Tool", "What it was used for"],
    ["Claude (Anthropic)", "Reviewing and debugging the web application code; writing the Python port of the engine, its tests, the four experiments and the dataset export; drafting the Kriol-influenced test sentences; building the dashboard charts and drawings; drafting and editing this report, the README and the presentation."],
    ["Gemini (Google), ChatGPT (OpenAI) and DeepSeek", "Building and debugging the web application code."],
    ["Gemma (Google)", "An open-weight model that the optional parser fine-tunes and runs locally. It is a component of the system, not a writing tool."],
  ], [3000, 6638]),
  new Paragraph({ spacing: { after: 80 }, children: [] }),
  P("Every number in this report is produced by the code in the repository (analysis/results/summary.json) and was checked against it. The Kriol-influenced sentences are AI-drafted approximations and are labelled as such wherever they appear. The team reviewed and edited all AI-assisted content and takes responsibility for the submission.", { align: AlignmentType.LEFT }),
  H1("Appendix B. Source code, datasets and reproduction"),
  P("Repository: https://github.com/HendrickDang/fair-queue-nt (MIT licence). The README gives full instructions.", { align: AlignmentType.LEFT }),
  TABLE([
    ["Path", "Contents"],
    ["analysis/fairqueue/", "Python engine: parser, need score, batching, efficiency, dial, generator, simulation (commented key steps)"],
    ["analysis/run_experiments.py", "E1 to E4; writes results/summary.json and the figures"],
    ["analysis/tests/", "Parity with the web app; location invariance of the need score"],
    ["analysis/data/", "Datasets (all synthetic): communities.csv (48), fault_scenarios.csv (22), sample_queue_jobs.csv (2,000), register_test_set.csv (2,640) and DATA.md, the data dictionary"],
    ["nt-housing-triage/", "Web app (Next.js, TypeScript, SQLite audit log), 62 tests"],
  ], [3200, 6438]),
  P("Dataset link: https://github.com/HendrickDang/fair-queue-nt/tree/main/analysis/data. Reproduce: cd analysis; pip install -r requirements.txt; python -m pytest -q; python run_experiments.py; python export_datasets.py. Run the app: cd nt-housing-triage; npm ci; npm run dev.", { align: AlignmentType.LEFT }),
  P("**Data sources.** Synthetic datasets (this project): https://github.com/HendrickDang/fair-queue-nt/tree/main/analysis/data. Public sources used to shape them: ABS Remoteness Structure (remoteness tiers), https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/remoteness-structure; NT Government fact sheet FS17 (response targets), https://dhlgcd.nt.gov.au/__data/assets/pdf_file/0009/649503/repairs-and-maintenance-fs17.pdf; BushTel community profiles (community names and locations), https://bushtel.nt.gov.au.", { align: AlignmentType.LEFT }),
  H1("Appendix C. Model assumptions"),
  TABLE([
    ["Assumption", "Value", "Note"],
    ["Road travel", "75 km/h, $0.85/km, detour × 1.3", "Unsealed and winding roads"],
    ["Air travel", "240 km/h, $6.50/km, detour × 1.05, 1.5 h overhead per leg", "Island and Arnhem communities"],
    ["Labour", "$110 per hour", "Loaded trade rate"],
    ["Batching radius", "200 km", "Communities sharing one run"],
    ["Queue mix (E1)", "50% remote; routine 3 : high 1.5 : critical 1", "Uniform mix tested as sensitivity"],
    ["Crew model", "One crew per base, 8 hours a day", "Snapshot of one queue"],
    ["Response targets", "Critical 1, high 2, medium and low 10 working days", "NT standard-area targets for high, medium and low; critical set by the team"],
  ], [2400, 4038, 3200]),
  H1("Appendix D. Example test reports by register"),
  TABLE([
    ["Register", "Example (exposed wiring, true level: critical)", "Parser result"],
    ["App phrasing", "sparks coming out of the powerpoint, Wadeye", "critical"],
    ["Officer note", "Tenant reports arcing from a general power outlet and a burning odour at the switchboard. Location: Wadeye.", "critical"],
    ["SMS spelling", "sparkn comin out of the pwr point, wadeye", "low"],
    ["Kriol-influenced (approximate)", "pawa point im sparkin, smok kamat longa Wadeye", "low"],
  ], [2300, 5338, 2000]),
];

// ---------- document ----------
const header = new Header({ children: [new Paragraph({
  alignment: AlignmentType.RIGHT,
  children: [new TextRun({ text: `Team ${TEAM} (${TEAM_NAME})  |  Fair Queue NT  |  CDU IT Code Fair 2026 AI Challenge`, font: FONT, size: 18, color: "595959" })],
})] });
const footer = new Footer({ children: [new Paragraph({
  tabStops: [{ type: TabStopType.RIGHT, position: W }],
  children: [
    new TextRun({ text: `Team ${TEAM} (${TEAM_NAME})`, font: FONT, size: 18, color: "595959" }),
    new TextRun({ text: "\tPage ", font: FONT, size: 18, color: "595959" }),
    new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: "595959" }),
    new TextRun({ text: " of ", font: FONT, size: 18, color: "595959" }),
    new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: "595959" }),
  ],
})] });

const doc = new Document({
  creator: `Team ${TEAM} (${TEAM_NAME})`,
  title: "Fair Queue NT",
  styles: { default: { document: { run: { font: FONT, size: 22 } } } },
  numbering: { config: [
    { reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] },
    { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134, header: 567, footer: 567 } } },
    headers: { default: header }, footers: { default: footer },
    children: [...title, ...summary, ...intro, ...method, ...findings, ...discussion, ...recs, ...refs, ...appendices],
  }],
});

// docx-js writes PAGE / NUMPAGES as complex fields with no styled result run, and some
// viewers then draw the numbers in the default font size. Rewrite them as simple fields.
const JSZip = require(require.resolve("jszip", { paths: [require.resolve("docx"), __dirname] })); // jszip ships with docx
Packer.toBuffer(doc).then(async (b) => {
  const zip = await JSZip.loadAsync(b);
  for (const name of Object.keys(zip.files).filter((n) => /word\/footer\d+\.xml$/.test(n))) {
    let xml = await zip.file(name).async("string");
    xml = xml.replace(/<w:r>(<w:rPr>(?:(?!<w:r>).)*?<\/w:rPr>)<w:fldChar w:fldCharType="begin"\/><w:instrText[^>]*>(PAGE|NUMPAGES)<\/w:instrText><w:fldChar w:fldCharType="separate"\/><w:fldChar w:fldCharType="end"\/><\/w:r>/g,
      (_, rpr, instr) => `<w:fldSimple w:instr=" ${instr} "><w:r>${rpr}<w:t>1</w:t></w:r></w:fldSimple>`);
    zip.file(name, xml);
  }
  fs.writeFileSync(process.env.OUT || "report.docx", await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log("ok");
});
