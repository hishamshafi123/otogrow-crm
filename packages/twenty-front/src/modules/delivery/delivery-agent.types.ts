export type DeliveryAgentConfiguration = {
  name: string;
  purpose: string;
  kind: 'BRIEF' | 'COPY' | 'SEO';
  enabled: boolean;
  instructions: string;
  requiredInputs: ('brief' | 'copy' | 'requirements')[];
  outputFormat: 'findings' | 'findings_and_edits';
  tools: 'public_page_check'[];
  modelId: string | null;
  projectIds: string[];
  roles: ('ADMIN' | 'MANAGER' | 'MEMBER')[];
  dailyRunLimit: number;
  maxOutputTokens: number;
  humanConfirmation: true;
};
export type DeliveryAgent = {
  id: string;
  version: number;
  configuration: DeliveryAgentConfiguration;
};
export type DeliveryAgentRun = {
  id: string;
  taskId: string;
  agentId: string;
  initiatorId: string;
  agentVersion: number;
  taskRevision: number;
  configuration: DeliveryAgentConfiguration;
  status:
    | 'QUEUED'
    | 'RUNNING'
    | 'WAITING_REVIEW'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED';
  context: Record<string, unknown>;
  result: {
    summary: string;
    findings: { severity: string; evidence: string; correction: string }[];
    suggestedBrief: string | null;
    suggestedCopy: string | null;
  } | null;
  activity: { at: string; message: string }[];
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cost: number | null;
  } | null;
  error: string | null;
  decision: {
    memberId: string;
    action: string;
    field: string | null;
    at: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};
export type DeliveryAgentsSnapshot = {
  agents: DeliveryAgent[];
  runs: DeliveryAgentRun[];
  models: { id: string; provider: string; price: number | null }[];
};
