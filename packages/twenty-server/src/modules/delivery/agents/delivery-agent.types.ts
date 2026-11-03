import { type DeliveryKnowledgeContext } from 'src/modules/delivery/knowledge/delivery-knowledge-context';
import { z } from 'zod';

export const deliveryAgentConfigurationSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    purpose: z.string().trim().min(1).max(1000),
    kind: z.enum(['BRIEF', 'COPY', 'SEO', 'ADVERTISING', 'ACTIVITY']),
    enabled: z.boolean(),
    instructions: z.string().trim().min(1).max(8000),
    requiredInputs: z
      .array(
        z.enum([
          'brief',
          'copy',
          'requirements',
          'report',
          'activity',
          'question',
        ]),
      )
      .max(3),
    outputFormat: z.enum([
      'findings',
      'findings_and_edits',
      'recommendations',
      'analysis',
    ]),
    tools: z.array(z.enum(['public_page_check'])).max(1),
    modelId: z.string().max(200).nullable(),
    projectIds: z.array(z.string().uuid()).max(100),
    roles: z
      .array(z.enum(['ADMIN', 'MANAGER', 'MEMBER']))
      .min(1)
      .max(3),
    roleIds: z.array(z.string().uuid()).min(1).max(100).nullable().optional(),
    dailyRunLimit: z.number().int().min(1).max(200),
    maxOutputTokens: z.number().int().min(256).max(4096),
    humanConfirmation: z.literal(true),
  })
  .strict()
  .superRefine((configuration, context) => {
    const activity = configuration.kind === 'ACTIVITY';
    const advertising = configuration.kind === 'ADVERTISING';
    if (
      activity
        ? configuration.projectIds.length !== 0
        : configuration.projectIds.length === 0
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Activity analysis uses workspace scope; other assistants require at least one project.',
      });
    if (
      activity
        ? configuration.outputFormat !== 'analysis' ||
          configuration.tools.length > 0 ||
          configuration.roles.length !== 1 ||
          configuration.roles[0] !== 'ADMIN' ||
          configuration.requiredInputs.length !== 2 ||
          !configuration.requiredInputs.includes('activity') ||
          !configuration.requiredInputs.includes('question')
        : configuration.outputFormat === 'analysis' ||
          configuration.requiredInputs.some((input) =>
            ['activity', 'question'].includes(input),
          )
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Activity analysis requires activity evidence, a question, analysis output, administrator access and no tools.',
      });
    if (
      advertising
        ? configuration.outputFormat !== 'recommendations' ||
          configuration.tools.length > 0 ||
          !configuration.requiredInputs.includes('report') ||
          configuration.requiredInputs.some(
            (input) => !['report', 'requirements'].includes(input),
          )
        : configuration.outputFormat === 'recommendations' ||
          configuration.requiredInputs.includes('report')
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Advertising recommendations require report evidence, optional requirements, recommendations output and no tools; task assistants retain their task inputs and output.',
      });
    if (
      new Set(configuration.requiredInputs).size !==
      configuration.requiredInputs.length
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Required inputs must be distinct.',
      });
  });

export const deliveryAgentInputsSchema = z
  .object({
    copy: z.string().max(20000).default(''),
    requirements: z.string().max(12000).default(''),
    sourceUrl: z.string().url().max(2000).optional(),
    targetUrl: z.string().url().max(2000).optional(),
    anchor: z.string().max(300).optional(),
  })
  .strict();

export const deliveryAgentResultSchema = z
  .object({
    summary: z.string().max(5000),
    findings: z
      .array(
        z
          .object({
            severity: z.enum(['info', 'warning', 'error']),
            evidence: z.string().max(3000),
            correction: z.string().max(3000),
          })
          .strict(),
      )
      .max(30),
    suggestedBrief: z.string().max(12000).nullable(),
    suggestedCopy: z.string().max(20000).nullable(),
  })
  .strict();

export type DeliveryAgentConfiguration = z.infer<
  typeof deliveryAgentConfigurationSchema
>;
export type DeliveryAgentInputs = z.infer<typeof deliveryAgentInputsSchema>;
export type DeliveryAgentResult = z.infer<typeof deliveryAgentResultSchema>;
export type DeliveryAgentStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_REVIEW'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';
export type DeliveryAgentContext = {
  brandKnowledge?: DeliveryKnowledgeContext;
  title: string;
  brief: string;
  service: string;
  checklist: string[];
  submittedCopy: string;
  evidenceLinks: string[];
  inputs: DeliveryAgentInputs;
};
export type DeliveryAgentActivity = { at: string; message: string };
