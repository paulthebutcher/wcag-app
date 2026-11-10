// Engine contract, provisional 0.1.0. See docs/04-engine-contract.md.

export type Severity = "critical" | "major" | "minor" | "advisory";
export type ConfidenceTier = "definitive" | "high" | "moderate" | "needs_review";
export type DetectedBy = "axe_core" | "playwright" | "claude_api" | "manual";
export type TriageBucket = "fix_now" | "verify_manually" | "possibly_noisy" | "advisory";
export type VerifyOutcomeValue = "detected" | "not_detected" | "not_checked";
export type ScanKind = "full" | "verify";
export type JobState = "queued" | "running" | "completed" | "failed";

export interface Health { engine_version: string; contract_version: string }

export interface Job {
  job_id: string;
  state: JobState;
  progress?: { phase: string; pages_done: number; pages_total: number };
  scan_id?: string;
  error?: string;
}

export interface ScanSession {
  scan_id: string;
  site_url: string;
  platform: string;
  started_at: string;
  completed_at: string | null;
  kind: ScanKind;
  baseline_scan_id: string | null;
  engine_version: string;
  detection_manifest: Record<string, unknown>;
  excluded_pages: Array<{ url: string; reason?: string; detail?: string; source?: string }>;
}

export interface Page {
  page_key: string;
  url: string;
  title: string;
  captured_at: string;
  screenshot_url: string;
  template_key: string | null;
}

export interface Template { template_key: string; name: string; page_keys: string[]; known_pages: number }

export interface Remediation {
  generic_fix: string;
  platform_fix: { platform: string; steps: string[]; designer_path: string; generated_by?: string; platform_docs_url?: string | null };
  code_fix?: string | null;
  estimated_effort: "trivial" | "minor" | "moderate" | "significant";
}

export interface Component {
  component_key: string;
  label: string;
  scope: "component" | "global";
  criterion: string;
  remediation: Remediation;
}

export interface Finding {
  finding_id: string;
  error_key: string;
  component_key: string | null;
  page_key: string;
  criterion: string;
  level: "A" | "AA" | "AAA";
  severity: Severity;
  category: string;
  failure_type: string;
  detected_by: DetectedBy;
  triage_bucket: TriageBucket;
  confidence: { score: number; tier: ConfidenceTier; basis: string; requires_human: boolean; false_positive_risk: "low" | "medium" | "high" };
  evidence: {
    selector: string;
    html: string;
    measured_values: Record<string, unknown>;
    aria_attributes: Record<string, string>;
    keyboard_sequence: unknown[] | null;
    bbox: { x: number; y: number; width: number; height: number } | null;
  };
  analysis: {
    method: string;
    reasoning: string;
    impact: string;
    affected_users: string[];
    llm: { prompt: string; input: string; raw_response: string; model: string; tokens: number } | null;
  };
  remediation: Remediation;
}

export interface VerifyOutcome { error_key: string; outcome: VerifyOutcomeValue; reason: string | null }

// Fixture file shapes
export interface FullScanFixture {
  contract_version: string;
  scan: ScanSession;
  pages: Page[];
  templates: Template[];
  components: Component[];
  findings: Finding[];
}
export interface VerifyScanFixture {
  contract_version: string;
  scan: ScanSession;
  pages: Page[];
  verify: VerifyOutcome[];
  findings: Finding[];
}
