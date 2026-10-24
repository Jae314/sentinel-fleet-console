import type { DataSource } from "./DataSource";
import { DEFAULT_PROTECTED, canExecute, decideInitialStatus, isProtectedTarget } from "./guardrails";
import type {
  Action,
  ActionMode,
  ActionType,
  BlockedAttempt,
  Detection,
  Endpoint,
  FleetStats,
  GuardrailConfig,
  ProtectionState,
  RiskLevel,
  Severity,
  Technique,
  TrendPoint,
  Verdict,
} from "./types";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEPTS = ["FIN", "ENG", "HR", "SALES", "OPS", "LEGAL", "MKT", "IT", "EXEC", "SUP"];
const FIRST = ["alex", "priya", "wei", "maria", "tom", "aisha", "kenji", "sara", "liam", "noah", "mei", "omar", "zoe", "ravi", "ana", "jon", "lena", "tariq", "hana", "ben"];
const LAST = ["tan", "smith", "ng", "garcia", "lee", "khan", "sato", "cohen", "patel", "nguyen", "lim", "silva", "brown", "ito", "chen"];
const OS = ["Windows 11 Pro 23H2", "Windows 11 Enterprise 23H2", "Windows 10 Enterprise 22H2", "Windows 11 Enterprise 24H2", "Windows Server 2022"];

interface Template {
  technique: Technique;
  rule: string;
  severity: Severity;
  action: ActionType;
  target: (r: () => number) => string;
  risk: RiskLevel;
  reasoning: string;
}

const TEMPLATES: Template[] = [
  {
    technique: { id: "T1059.001", name: "Command and Scripting Interpreter: PowerShell", tactic: "Execution" },
    rule: "GR-PS-ENC-001 Encoded PowerShell command line",
    severity: "High",
    action: "KillProcess",
    target: (r) => `powershell.exe (PID ${Math.floor(1000 + r() * 9000)})`,
    risk: "High",
    reasoning: "PowerShell launched with -EncodedCommand from an Office child process; decoded payload downloads a second stage.",
  },
  {
    technique: { id: "T1204.002", name: "User Execution: Malicious File", tactic: "Execution" },
    rule: "GR-AV-SIG-014 Known malware signature on write",
    severity: "Medium",
    action: "QuarantineFile",
    target: (r) => `C:\\Users\\Public\\Downloads\\invoice_${Math.floor(r() * 9999)}.exe`,
    risk: "Low",
    reasoning: "File hash matches a known commodity loader; written to Downloads by browser and not yet executed.",
  },
  {
    technique: { id: "T1071.001", name: "Application Layer Protocol: Web Protocols", tactic: "Command and Control" },
    rule: "GR-NET-TI-003 Connection to threat-intel listed domain",
    severity: "High",
    action: "BlockDomain",
    target: (r) => ["cdn-update-sync.top", "telemetry-ms.click", "login-0ffice.net", "files-share.zip"][Math.floor(r() * 4)],
    risk: "Medium",
    reasoning: "Beacon-like HTTPS requests at ~60s jitter to a domain registered 3 days ago and listed in two TI feeds.",
  },
  {
    technique: { id: "T1543.003", name: "Create or Modify System Process: Windows Service", tactic: "Persistence" },
    rule: "GR-PERS-SVC-007 Unsigned service installed",
    severity: "Medium",
    action: "DisableService",
    target: (r) => `UpdSvcHost${Math.floor(r() * 99)}`,
    risk: "Medium",
    reasoning: "New auto-start service pointing at an unsigned binary in %TEMP%, installed outside change window.",
  },
  {
    technique: { id: "T1041", name: "Exfiltration Over C2 Channel", tactic: "Exfiltration" },
    rule: "GR-NET-EXF-002 Anomalous outbound volume",
    severity: "Critical",
    action: "BlockDestination",
    target: (r) => `185.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}:443`,
    risk: "High",
    reasoning: "Outbound transfer of 1.8 GB to an unclassified IP over 20 minutes, 40x the host's baseline.",
  },
  {
    technique: { id: "T1218.011", name: "System Binary Proxy Execution: Rundll32", tactic: "Defense Evasion" },
    rule: "GR-LOL-RDL-005 Rundll32 with unusual export",
    severity: "Low",
    action: "KillProcess",
    target: (r) => `rundll32.exe (PID ${Math.floor(1000 + r() * 9000)})`,
    risk: "Medium",
    reasoning: "rundll32 invoked an export from a DLL in AppData; signer is a known software vendor — likely benign updater.",
  },
];

const HOUR = 3600_000;

export class MockDataSource implements DataSource {
  readonly kind = "mock" as const;
  private endpoints: Endpoint[] = [];
  private detections: Detection[] = [];
  private actions: Action[] = [];
  private blocked: BlockedAttempt[] = [];
  private cfg: GuardrailConfig = { approvalThreshold: 1, globalDryRun: false, protectedList: DEFAULT_PROTECTED };
  private startedAt = Date.now();
  private seq = 1000;

  constructor(private latency = 280) {
    this.seed();
  }

  private wait<T>(v: T): Promise<T> {
    const copy = structuredClone(v);
    if (!this.latency) return Promise.resolve(copy);
    return new Promise((res) => setTimeout(() => res(copy), this.latency * (0.6 + Math.random() * 0.8)));
  }

  private seed() {
    const r = mulberry32(1337);
    const now = Date.now();
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];

    this.endpoints.push({
      id: "ep-0000",
      hostname: "WIN11-LAB-01",
      user: "lab\\demo.analyst",
      os: "Windows 11 Pro 23H2",
      department: "LAB",
      ip: "10.20.0.11",
      protectionState: "Protected",
      lastSeen: new Date(now - 4000).toISOString(),
      source: "live",
    });
    for (let i = 1; i < 1200; i++) {
      const dept = pick(DEPTS);
      const x = r();
      const state: ProtectionState = x < 0.9 ? "Protected" : x < 0.96 ? "Degraded" : x < 0.98 ? "Isolated" : "Unmanaged";
      this.endpoints.push({
        id: `ep-${String(i).padStart(4, "0")}`,
        hostname: `CORP-${dept}-${String(i).padStart(4, "0")}`,
        user: `corp\\${pick(FIRST)}.${pick(LAST)}`,
        os: pick(OS),
        department: dept,
        ip: `10.${10 + Math.floor(r() * 40)}.${Math.floor(r() * 255)}.${Math.floor(1 + r() * 253)}`,
        protectionState: state,
        lastSeen: new Date(now - (state === "Unmanaged" ? 3 * 24 * HOUR * r() + 24 * HOUR : r() * 15 * 60_000)).toISOString(),
        source: "simulated",
      });
    }

    const live = this.endpoints[0];
    const ev = (n: number) => Array.from({ length: n }, () => `EVT-${Math.floor(r() * 0xffffff).toString(16).toUpperCase().padStart(6, "0")}`);

    // Hand-authored scenarios
    const scenarios: Array<Omit<Detection, "id" | "status"> & { decided?: "auto" }> = [
      {
        endpointId: live.id, hostname: live.hostname, source: "live",
        timestamp: new Date(now - 6 * 60_000).toISOString(),
        technique: TEMPLATES[0].technique, rule: TEMPLATES[0].rule, severity: "High", confidence: 0.94, verdict: "Malicious",
        evidenceEventIds: ["EVT-4688-7F21A0", "EVT-4104-7F21A3", "EVT-SYS1-7F21B9"], evidenceVerified: true,
        reasoningSummary: "winword.exe spawned powershell.exe -nop -w hidden -enc JABjAD0A… Decoded script fetches hxxp://cdn-update-sync.top/a.ps1 and invokes it in memory. Script-block log 4104 confirms IEX of remote content.",
        proposedAction: { type: "KillProcess", target: "powershell.exe (PID 7724)", riskLevel: "High" },
      },
      {
        endpointId: live.id, hostname: live.hostname, source: "live",
        timestamp: new Date(now - 42 * 60_000).toISOString(),
        technique: TEMPLATES[1].technique, rule: "GR-AV-SIG-001 EICAR test signature", severity: "Medium", confidence: 0.99, verdict: "Malicious",
        evidenceEventIds: ["EVT-FILE-3A1C02", "EVT-HASH-3A1C05"], evidenceVerified: true,
        reasoningSummary: "File C:\\Users\\demo\\Downloads\\eicar.com matches the EICAR standard anti-malware test string (SHA256 275a021b…). Safe test file; quarantine is low-risk and reversible.",
        proposedAction: { type: "QuarantineFile", target: "C:\\Users\\demo\\Downloads\\eicar.com", riskLevel: "Low" },
      },
      {
        endpointId: "ep-0412", hostname: this.endpoints[412].hostname, source: "simulated",
        timestamp: new Date(now - 18 * 60_000).toISOString(),
        technique: TEMPLATES[2].technique, rule: TEMPLATES[2].rule, severity: "High", confidence: 0.88, verdict: "Malicious",
        evidenceEventIds: ["EVT-DNS-91F004", "EVT-NET3-91F00A", "EVT-NET3-91F011"], evidenceVerified: true,
        reasoningSummary: "chrome.exe resolved login-0ffice.net (homoglyph of office) and posted form data. Domain is 2 days old and on 3 phishing feeds.",
        proposedAction: { type: "BlockDomain", target: "login-0ffice.net", riskLevel: "Medium" },
      },
      {
        endpointId: "ep-0087", hostname: this.endpoints[87].hostname, source: "simulated",
        timestamp: new Date(now - 33 * 60_000).toISOString(),
        technique: { id: "T1003.001", name: "OS Credential Dumping: LSASS Memory", tactic: "Credential Access" },
        rule: "GR-CRED-LSA-002 Handle open on lsass with VM_READ", severity: "Critical", confidence: 0.91, verdict: "Malicious",
        evidenceEventIds: ["EVT-4656-22B0C1", "EVT-SYS10-22B0C4"], evidenceVerified: true,
        reasoningSummary: "Unknown binary opened lsass.exe with PROCESS_VM_READ. Agent proposed terminating the accessed process — guardrail refused because lsass.exe is protected. Analyst should kill the dumper instead.",
        proposedAction: { type: "KillProcess", target: "lsass.exe", riskLevel: "Critical" },
      },
      {
        endpointId: "ep-0733", hostname: this.endpoints[733].hostname, source: "simulated",
        timestamp: new Date(now - 11 * 60_000).toISOString(),
        technique: TEMPLATES[3].technique, rule: TEMPLATES[3].rule, severity: "Medium", confidence: 0.62, verdict: "Malicious",
        evidenceEventIds: ["EVT-7045-0D33E1", "EVT-7045-0D33E9"], evidenceVerified: false,
        reasoningSummary: "Model inferred an unsigned service install, but the referenced events could not be located in the log store (possible log gap or hallucinated IDs). Do not act until evidence is confirmed.",
        proposedAction: { type: "DisableService", target: "WinUpdateHelperSvc", riskLevel: "Medium" },
      },
    ];
    scenarios.forEach((s) => this.addDetection({ ...s, status: "New" }, now));

    // Generated fleet noise
    for (let i = 0; i < 300; i++) {
      const t = TEMPLATES[Math.floor(r() * TEMPLATES.length)];
      const ep = this.endpoints[1 + Math.floor(r() * 1199)];
      const v: Verdict = r() < 0.72 ? "Malicious" : r() < 0.6 ? "Benign" : "NeedsMoreEvidence";
      const ts = now - Math.pow(r(), 0.8) * 24 * HOUR;
      this.addDetection(
        {
          endpointId: ep.id, hostname: ep.hostname, source: "simulated",
          timestamp: new Date(ts).toISOString(), technique: t.technique, rule: t.rule,
          severity: v === "Benign" ? "Low" : t.severity,
          confidence: Math.round((v === "Malicious" ? 0.75 + r() * 0.24 : 0.35 + r() * 0.4) * 100) / 100,
          verdict: v, evidenceEventIds: ev(1 + Math.floor(r() * 4)), evidenceVerified: r() > 0.03,
          reasoningSummary: t.reasoning, proposedAction: { type: t.action, target: t.target(r), riskLevel: t.risk },
          status: v === "Benign" ? "Dismissed" : "New",
        },
        now,
        r,
      );
    }
    this.detections.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    this.actions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    this.blocked.sort((a, b) => b.at.localeCompare(a.at));
  }

  private addDetection(d: Omit<Detection, "id">, now: number, r?: () => number) {
    const det: Detection = { ...d, id: `DET-${String(this.detections.length + 1).padStart(4, "0")}` };
    this.detections.push(det);
    if (det.verdict !== "Malicious") return;
    const a = this.createAction(det, new Date(new Date(det.timestamp).getTime() + 8000).toISOString());
    if (r && a.status === "PendingApproval" && now - new Date(det.timestamp).getTime() > 2 * HOUR && det.evidenceVerified) {
      // historical decisions by analysts
      const ok = r() < 0.85;
      const at = new Date(new Date(det.timestamp).getTime() + (3 + r() * 20) * 60_000).toISOString();
      a.status = ok ? "Approved" : "Rejected";
      a.decidedBy = "human";
      if (ok) a.executedAt = at;
      a.rollbackAvailable = ok && a.type !== "KillProcess";
      a.auditLog.push({ at, actor: `analyst.${["kim", "ortiz", "rao"][Math.floor(r() * 3)]}`, event: ok ? "Approved & executed" : "Rejected" });
      det.status = ok ? "Responded" : "Triaged";
    }
  }

  private createAction(det: Detection, at: string): Action {
    const decision = decideInitialStatus(det.proposedAction, det.evidenceVerified, this.cfg);
    const mode: ActionMode = this.cfg.globalDryRun ? "DryRun" : "Live";
    const a: Action = {
      id: `ACT-${this.seq++}`,
      detectionId: det.id, endpointId: det.endpointId, hostname: det.hostname, source: det.source,
      ...det.proposedAction, type: det.proposedAction.type, target: det.proposedAction.target,
      mode, status: decision.status, rollbackAvailable: false, evidenceVerified: det.evidenceVerified,
      createdAt: at,
      auditLog: [{ at, actor: "grim-reaper-agent", event: "Action proposed", detail: `${det.technique.id} · confidence ${det.confidence}` }],
    };
    if (decision.status === "AutoExecuted") {
      a.executedAt = new Date(new Date(at).getTime() + 1500).toISOString();
      a.decidedBy = "auto";
      a.rollbackAvailable = mode === "Live" && a.type !== "KillProcess";
      a.auditLog.push({ at: a.executedAt, actor: "policy-engine", event: mode === "Live" ? "Auto-executed" : "Auto-executed (dry run)", detail: decision.reason });
      det.status = "Responded";
    } else if (decision.status === "BlockedByGuardrail") {
      a.auditLog.push({ at, actor: "guardrail", event: "Blocked by guardrail", detail: decision.reason });
      this.blocked.push({ id: `BLK-${this.blocked.length + 1}`, at, actionType: a.type, target: a.target, hostname: a.hostname, source: a.source, requestedBy: "grim-reaper-agent", reason: decision.reason });
      det.status = "Triaged";
    } else {
      a.auditLog.push({ at, actor: "policy-engine", event: "Queued for approval", detail: decision.reason });
    }
    det.actionId = a.id;
    this.actions.push(a);
    return a;
  }

  private findAction(id: string) {
    const a = this.actions.find((x) => x.id === id);
    if (!a) throw new Error(`Action ${id} not found`);
    return a;
  }

  async getEndpoints() { return this.wait(this.endpoints); }
  async getDetections() { return this.wait(this.detections); }
  async getActions() { return this.wait(this.actions); }
  async getGuardrails() { return this.wait(this.cfg); }
  async getBlockedAttempts() { return this.wait(this.blocked); }

  async getFleetStats(): Promise<FleetStats> {
    const now = Date.now();
    const byState: Record<ProtectionState, number> = { Protected: 0, Degraded: 0, Isolated: 0, Unmanaged: 0 };
    this.endpoints.forEach((e) => byState[e.protectionState]++);
    const eventsPerSecond = 1840;
    const trend: TrendPoint[] = Array.from({ length: 24 }, (_, i) => {
      const h = new Date(now - (23 - i) * HOUR);
      return { hour: `${String(h.getHours()).padStart(2, "0")}:00`, Critical: 0, High: 0, Medium: 0, Low: 0 };
    });
    let d24 = 0;
    this.detections.forEach((d) => {
      const age = now - new Date(d.timestamp).getTime();
      if (age > 24 * HOUR) return;
      d24++;
      const idx = 23 - Math.floor(age / HOUR);
      if (trend[idx]) trend[idx][d.severity]++;
    });
    const executed = this.actions.filter((a) => a.executedAt);
    const mttr = executed.length
      ? executed.reduce((s, a) => {
          const det = this.detections.find((d) => d.id === a.detectionId)!;
          return s + (new Date(a.executedAt!).getTime() - new Date(det.timestamp).getTime());
        }, 0) / executed.length / 1000
      : 0;
    return this.wait({
      total: this.endpoints.length,
      byState,
      eventsProcessed: 48_210_000 + Math.floor(((now - this.startedAt) / 1000) * eventsPerSecond),
      eventsPerSecond,
      detections24h: d24,
      actionsAuto: this.actions.filter((a) => a.decidedBy === "auto" && a.status !== "RolledBack").length,
      actionsHuman: this.actions.filter((a) => a.decidedBy === "human" && a.status === "Approved").length,
      mttrSeconds: Math.round(mttr),
      pendingApprovals: this.actions.filter((a) => a.status === "PendingApproval").length,
      trend,
    });
  }

  async approveAction(id: string) {
    const a = this.findAction(id);
    if (a.status !== "PendingApproval") throw new Error("Only pending actions can be approved");
    if (!canExecute(a.evidenceVerified)) throw new Error("Evidence not verified in log store — action cannot execute");
    const at = new Date().toISOString();
    const hit = isProtectedTarget(a.target, this.cfg.protectedList);
    if (hit) {
      a.status = "BlockedByGuardrail";
      const reason = `Target "${hit.name}" is on the protected allowlist`;
      a.auditLog.push({ at, actor: "guardrail", event: "Blocked by guardrail", detail: reason });
      this.blocked.unshift({ id: `BLK-${this.blocked.length + 1}`, at, actionType: a.type, target: a.target, hostname: a.hostname, source: a.source, requestedBy: "you", reason });
      return this.wait(a);
    }
    if (this.cfg.globalDryRun) a.mode = "DryRun";
    a.status = "Approved";
    a.decidedBy = "human";
    a.executedAt = at;
    a.rollbackAvailable = a.mode === "Live" && a.type !== "KillProcess";
    a.auditLog.push({ at, actor: "you", event: a.mode === "Live" ? "Approved & executed" : "Approved (dry run — no changes made)" });
    const det = this.detections.find((d) => d.id === a.detectionId);
    if (det) det.status = "Responded";
    return this.wait(a);
  }

  async rejectAction(id: string) {
    const a = this.findAction(id);
    if (a.status !== "PendingApproval") throw new Error("Only pending actions can be rejected");
    a.status = "Rejected";
    a.decidedBy = "human";
    a.auditLog.push({ at: new Date().toISOString(), actor: "you", event: "Rejected" });
    const det = this.detections.find((d) => d.id === a.detectionId);
    if (det) det.status = "Triaged";
    return this.wait(a);
  }

  async rollbackAction(id: string) {
    const a = this.findAction(id);
    if (!a.rollbackAvailable) throw new Error("Rollback not available for this action");
    a.status = "RolledBack";
    a.rollbackAvailable = false;
    a.auditLog.push({ at: new Date().toISOString(), actor: "you", event: "Rolled back", detail: "Original state restored" });
    return this.wait(a);
  }

  async setActionMode(id: string, mode: ActionMode) {
    const a = this.findAction(id);
    if (a.status !== "PendingApproval") throw new Error("Mode can only change while pending");
    a.mode = mode;
    a.auditLog.push({ at: new Date().toISOString(), actor: "you", event: `Mode set to ${mode === "DryRun" ? "Dry run" : "Live"}` });
    return this.wait(a);
  }

  async requestAction(detectionId: string) {
    const det = this.detections.find((d) => d.id === detectionId);
    if (!det) throw new Error("Detection not found");
    if (det.actionId) return this.wait(this.findAction(det.actionId));
    if (!det.evidenceVerified) throw new Error("Evidence not verified — cannot request action");
    const a = this.createAction(det, new Date().toISOString());
    this.actions.unshift(this.actions.pop()!);
    return this.wait(a);
  }

  async updateGuardrails(patch: Partial<Pick<GuardrailConfig, "approvalThreshold" | "globalDryRun">>) {
    this.cfg = { ...this.cfg, ...patch, protectedList: this.cfg.protectedList };
    return this.wait(this.cfg);
  }
}
