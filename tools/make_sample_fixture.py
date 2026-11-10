#!/usr/bin/env python3
"""
Build a small sample fixture in the engine-contract shape from real Popfly scans.

Reads the engine's SQLite database read-only. Writes JSON files to
contract/fixtures/popfly-sample/.

PROVISIONAL KEYS. component_key, error_key and template_key are computed here
with simple rules so the UI can be built now. The engine will own these keys
(see docs/04-engine-contract.md). Replace this fixture with the engine's own
export once it exists.

Usage:
  ENGINE_DATA_DIR="/Users/paulbutcher/Developer/WCAG Scanner/wcag-data" \
    python3 tools/make_sample_fixture.py
"""
import hashlib, json, os, re, sqlite3, sys
from collections import defaultdict
from urllib.parse import urlparse

DATA = os.environ.get("ENGINE_DATA_DIR", os.path.expanduser("~/Developer/WCAG Scanner/wcag-data"))
OUT = os.path.join(os.path.dirname(__file__), "..", "contract", "fixtures", "popfly-sample")
BASELINE = "e779c8b0-03f2-44fd-87cc-b960bc230785"   # full scan, 2026-10-04
VERIFY = "69271047-f1b0-4813-9cdb-32ff79817d0c"     # verify of BASELINE, 2026-10-11
MAX_PAGES = 10
MAX_COMPONENTS = 10
MAX_ERRORS = 60

def sha(s, n=12): return hashlib.sha1(s.encode()).hexdigest()[:n]

def root_class(html):
    m = re.match(r"\s*<([a-zA-Z0-9-]+)([^>]*)>", html or "")
    if not m: return ""
    cm = re.search(r'class="([^"]*)"', m.group(2))
    return m.group(1) + ("." + ".".join(sorted(cm.group(1).split())) if cm else "")

def template_key(url):
    parts = [p for p in urlparse(url).path.split("/") if p]
    return parts[0] if len(parts) >= 2 else None

def load(db, sid):
    pages = {r[0]: {"id": r[0], "url": r[1], "title": r[2], "captured_at": r[3], "screenshot": r[4]}
             for r in db.execute("select id,url,title,captured_at,screenshot from page_snapshots where scan_session_id=?", (sid,))}
    findings = []
    for r in db.execute("select f.id,f.page_snapshot_id,f.wcag_criterion,f.wcag_level,f.severity,f.category,f.evidence,f.analysis,f.confidence,f.remediation "
                        "from findings f join page_snapshots p on f.page_snapshot_id=p.id where p.scan_session_id=?", (sid,)):
        ev, an, co, rm = (json.loads(x) for x in r[6:10])
        findings.append({"id": r[0], "page": pages[r[1]], "criterion": r[2], "level": r[3], "severity": r[4],
                         "category": r[5], "evidence": ev, "analysis": an, "confidence": co, "remediation": rm})
    return pages, findings

def keys(f):
    ft = f["evidence"].get("measured_values", {}).get("failure_type") or f["category"]
    comp = sha(f"{f['criterion']}|{ft}|{root_class(f['evidence'].get('element_html',''))}")
    err = sha(f"{comp}|{f['page']['url']}|{f['evidence'].get('element_selector','')}", 16)
    return ft, comp, err

def bucket(f):
    sev, det = f["severity"], f["evidence"]["detected_by"]
    tier, risk = f["confidence"]["tier"], f["confidence"]["false_positive_risk"]
    if sev == "advisory": return "advisory"
    if det == "claude_api" and (risk == "high" or tier == "needs_review"): return "possibly_noisy"
    if det in ("axe_core", "playwright") and tier in ("definitive", "high") and sev in ("critical", "major"): return "fix_now"
    return "verify_manually"

def trim(s, n=4000):
    return s if not isinstance(s, str) or len(s) <= n else s[:n] + "…"

def main():
    db = sqlite3.connect(f"file:{os.path.join(DATA, 'wcag.db')}?mode=ro", uri=True)
    sess = {r[0]: r for r in db.execute("select id,url,platform,initiated_at,completed_at,scan_type,detection_manifest,excluded_pages,baseline_scan_id from scan_sessions where id in (?,?)", (BASELINE, VERIFY))}
    if len(sess) != 2: sys.exit("Expected Popfly scans not found")
    bp, bf = load(db, BASELINE)
    vp, vf = load(db, VERIFY)

    # choose pages present in both scans with the most findings
    vurls = {p["url"] for p in vp.values()}
    count = defaultdict(int)
    for f in bf:
        if f["page"]["url"] in vurls: count[f["page"]["url"]] += 1
    # two pages from each of the three largest path-prefix groups (provisional templates),
    # plus the busiest remaining pages, so the sample has templates and static pages
    groups = defaultdict(list)
    for u in sorted(count, key=lambda x: -count[x]):
        if template_key(u): groups[template_key(u)].append(u)
    chosen = [u for g in sorted(groups.values(), key=len, reverse=True)[:3] for u in g[:2]]
    chosen += [u for u in sorted(count, key=lambda x: -count[x]) if u not in chosen and not template_key(u)][:MAX_PAGES - len(chosen)]
    chosen_set = set(chosen)

    # choose components spanning several chosen pages
    comp_members = defaultdict(list)
    for f in bf:
        if f["page"]["url"] in chosen_set:
            comp_members[keys(f)[1]].append(f)
    comps = sorted(comp_members.items(), key=lambda kv: -len({m["page"]["url"] for m in kv[1]}))[:MAX_COMPONENTS]
    keep_comp = {k for k, _ in comps}

    def finding_out(f):
        ft, comp, err = keys(f)
        ev = f["evidence"]; an = f["analysis"]
        return {
            "finding_id": f["id"], "error_key": err, "component_key": comp, "page_key": sha(f["page"]["url"], 16),
            "criterion": f["criterion"], "level": f["level"], "severity": f["severity"], "category": f["category"],
            "failure_type": ft, "detected_by": ev["detected_by"], "triage_bucket": bucket(f),
            "confidence": f["confidence"],
            "evidence": {"selector": ev.get("element_selector"), "html": trim(ev.get("element_html"), 1500),
                         "measured_values": ev.get("measured_values", {}), "aria_attributes": ev.get("aria_attributes", {}),
                         "keyboard_sequence": ev.get("keyboard_sequence"), "bbox": None},
            "analysis": {"method": an.get("method"), "reasoning": an.get("reasoning"),
                         "impact": an.get("impact_description"), "affected_users": an.get("affected_users", []),
                         "llm": None if not an.get("llm_input") else {
                             "prompt": trim(an["llm_input"].get("prompt")), "input": trim(an["llm_input"].get("dom_snippet")),
                             "raw_response": trim((an.get("llm_output") or {}).get("raw_response")),
                             "model": (an.get("llm_output") or {}).get("model"), "tokens": (an.get("llm_output") or {}).get("tokens_used")}},
            "remediation": f["remediation"],
        }

    base_findings = [finding_out(f) for f in bf if f["page"]["url"] in chosen_set and keys(f)[1] in keep_comp][:MAX_ERRORS]
    # a few ungrouped one-offs: findings whose component appears on only one page
    singles = [f for k, ms in comp_members.items() if k not in keep_comp and len({m["page"]["url"] for m in ms}) == 1 for f in ms]
    singles = sorted(singles, key=lambda f: f["evidence"]["detected_by"] != "claude_api")[:10]
    base_findings += [dict(finding_out(f), component_key=None) for f in singles]
    keep_errors = {f["error_key"] for f in base_findings}

    def pages_out(pmap):
        out = []
        for p in pmap.values():
            if p["url"] not in chosen_set: continue
            out.append({"page_key": sha(p["url"], 16), "url": p["url"], "title": p["title"], "captured_at": p["captured_at"],
                        "screenshot_url": f"/screenshots/{p['screenshot']}", "template_key": template_key(p["url"])})
        return out

    templates = defaultdict(list)
    for u in chosen:
        t = template_key(u)
        if t: templates[t].append(sha(u, 16))
    templates = [{"template_key": t, "name": f"/{t}/*", "page_keys": pk, "known_pages": len(pk)} for t, pk in templates.items() if len(pk) >= 1]

    components = []
    for k, ms in comps:
        m0 = ms[0]
        pages_hit = {m["page"]["url"] for m in ms}
        components.append({"component_key": k, "label": f"{root_class(m0['evidence'].get('element_html','')) or m0['evidence'].get('element_selector')}: {keys(m0)[0].replace('-', ' ').replace('_', ' ')}",
                           "scope": "global" if len(pages_hit) == len(chosen) else "component",
                           "criterion": m0["criterion"], "remediation": m0["remediation"]})

    vfind = [finding_out(f) for f in vf if f["page"]["url"] in chosen_set]
    vkeys = {f["error_key"] for f in vfind}
    # The verify run only re-ran some checks. An error whose check did not run is not_checked.
    vjson = json.load(open(os.path.join(DATA, VERIFY, "verify.json")))
    ran = set(vjson.get("checks_run", []))
    def check_ran(f):
        if f["detected_by"] == "axe_core": return "axe-core" in ran
        if f["failure_type"] in ("missing_role", "custom_interactive_no_role") or f["criterion"] == "4.1.2": return "widget-aria" in ran
        return False
    verify_outcomes = []
    for f in base_findings:
        e = f["error_key"]
        if e in vkeys: o, why = "detected", None
        elif check_ran(f): o, why = "not_detected", None
        else: o, why = "not_checked", "check not included in this verify run"
        verify_outcomes.append({"error_key": e, "outcome": o, "reason": why})

    def session(sid):
        r = sess[sid]
        return {"scan_id": r[0], "site_url": r[1], "platform": r[2], "started_at": r[3], "completed_at": r[4],
                "kind": "verify" if r[5] == "rescan" else "full", "baseline_scan_id": r[8],
                "engine_version": json.loads(r[6] or "{}").get("engine_version", "0.1.x"),
                "detection_manifest": json.loads(r[6] or "{}"), "excluded_pages": json.loads(r[7] or "[]")}

    os.makedirs(OUT, exist_ok=True)
    files = {
        "scan-baseline.json": {"contract_version": "0.1.0-provisional", "scan": session(BASELINE), "pages": pages_out(bp),
                               "templates": templates, "components": components, "findings": base_findings},
        "scan-verify.json": {"contract_version": "0.1.0-provisional", "scan": session(VERIFY), "pages": pages_out(vp),
                             "verify": verify_outcomes, "findings": [f for f in vfind if f["error_key"] in keep_errors]},
    }
    for name, data in files.items():
        with open(os.path.join(OUT, name), "w") as fh: json.dump(data, fh, indent=2)
    print({k: {kk: len(v) if isinstance(v, list) else "" for kk, v in d.items() if isinstance(v, list)} for k, d in files.items()})

if __name__ == "__main__":
    main()
