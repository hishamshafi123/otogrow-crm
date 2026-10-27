import { type DeliveryWorkflowDefinition } from 'src/modules/delivery/workflows/delivery-workflows.types';
const check = (id: string, label: string) => ({ id, label, required: true });
const link = (id: string, label: string, instructions: string) => ({
  id,
  label,
  instructions,
  kind: 'LINK' as const,
  required: true,
});
export const DELIVERY_WORKFLOW_STARTERS: {
  key: string;
  definition: DeliveryWorkflowDefinition;
}[] = [
  {
    key: 'ai-video',
    definition: {
      name: 'AI video production',
      service: 'AI_VIDEO',
      description:
        'Research and approved concept through realistic shots, clips and independent final review.',
      definitionOfDone:
        'The approved brief is reflected in the final video, product and anatomy details are coherent, and requested hook/CTA versions are identified. Client fulfilment is confirmed separately.',
      checklist: [
        check('brief', 'Confirm the approved brief and reference'),
        check('images', 'Check image realism and product accuracy'),
        check('clips', 'Check motion and scene continuity'),
        check('edit', 'Complete final edit, audio and required variations'),
      ],
      evidence: [
        link(
          'final',
          'Final video',
          'Link the final cut submitted for review.',
        ),
        link(
          'brief',
          'Brief or approved reference',
          'Link the source used for the creative decisions.',
        ),
      ],
      reviewChecks: [
        check('accuracy', 'Product, anatomy and scene details are plausible'),
        check('brand', 'Brand, hook, CTA, sound and format match the brief'),
      ],
    },
  },
  {
    key: 'static-ad',
    definition: {
      name: 'Static ad design',
      service: 'STATIC_AD',
      description: 'Turn an approved angle into channel-ready static creative.',
      definitionOfDone:
        'Design and copy match the brief and product, are readable at the intended size, and have the requested export formats.',
      checklist: [
        check('angle', 'Confirm angle, audience and offer'),
        check(
          'design',
          'Check typography, product details and mobile readability',
        ),
        check('exports', 'Prepare the requested channel formats'),
      ],
      evidence: [
        link(
          'creative',
          'Final creative',
          'Link the exported static ad files.',
        ),
      ],
      reviewChecks: [
        check('copy', 'Copy and claims are supported and appropriate'),
        check(
          'format',
          'Brand accuracy, readability and export formats are correct',
        ),
      ],
    },
  },
  {
    key: 'seo',
    definition: {
      name: 'SEO delivery',
      service: 'SEO',
      description:
        'Document the agreed weekly or monthly SEO work with verifiable sources.',
      definitionOfDone:
        'The assigned SEO work is completed and documented. Submitted backlinks or page changes can be inspected; measured outcomes are distinguished from work performed.',
      checklist: [
        check('scope', 'Confirm this period’s SEO tasks'),
        check('work', 'Complete and document the agreed changes'),
        check(
          'verification',
          'Inspect links/pages and record any unresolved issues',
        ),
      ],
      evidence: [
        link(
          'report',
          'Work report',
          'Link the report with changed pages or backlink sources.',
        ),
        {
          id: 'results',
          label: 'Verification findings',
          instructions:
            'State what was checked, by whom or which tool, and any remaining uncertainty.',
          kind: 'TEXT',
          required: true,
        },
      ],
      reviewChecks: [
        check('evidence', 'Evidence supports the claimed work'),
        check(
          'outcomes',
          'Work completed is distinguished from traffic/ranking outcomes',
        ),
      ],
    },
  },
  {
    key: 'performance',
    definition: {
      name: 'Performance marketing review',
      service: 'PERFORMANCE_MARKETING',
      description:
        'Review campaign results and prepare accountable recommendations.',
      definitionOfDone:
        'Date range, spend and objective-specific outcomes are reconciled; winning/losing ads and recommended actions include evidence. Spend changes require the separate authorized execution and verification flow.',
      checklist: [
        check(
          'data',
          'Confirm reporting period, freshness and conversion source',
        ),
        check('analysis', 'Compare results against the client objective'),
        check('recommendations', 'Document recommended actions and owner'),
      ],
      evidence: [
        link(
          'report',
          'Performance report',
          'Link the source report or account export.',
        ),
        {
          id: 'recommendations',
          label: 'Recommendations',
          instructions:
            'Explain the recommended change and evidence; do not claim it has been applied unless separately verified.',
          kind: 'TEXT',
          required: true,
        },
      ],
      reviewChecks: [
        check(
          'interpretation',
          'Recommendations follow the available evidence',
        ),
        check(
          'authority',
          'Budget changes are recommendations or separately authorized verified actions',
        ),
      ],
    },
  },
  {
    key: 'web',
    definition: {
      name: 'Website delivery',
      service: 'WEB',
      description:
        'Trace a scoped website change through implementation, tests and review.',
      definitionOfDone:
        'The agreed acceptance criteria are met; responsive behavior, accessibility and relevant checks have evidence. Deployment and client acceptance remain separate explicit steps.',
      checklist: [
        check('criteria', 'Confirm acceptance criteria'),
        check('implementation', 'Implement the agreed change'),
        check('checks', 'Check desktop/mobile behavior and relevant tests'),
      ],
      evidence: [
        link(
          'preview',
          'Preview or deliverable',
          'Link the reviewable website or delivered artifact.',
        ),
        link(
          'checks',
          'Validation evidence',
          'Link test results, screenshots or review notes.',
        ),
      ],
      reviewChecks: [
        check(
          'acceptance',
          'The requested behavior matches acceptance criteria',
        ),
        check(
          'quality',
          'Responsive, accessibility and functional checks are adequate',
        ),
      ],
    },
  },
  {
    key: 'app',
    definition: {
      name: 'App or SaaS delivery',
      service: 'APP',
      description:
        'Deliver a scoped application change with reviewable build and validation evidence.',
      definitionOfDone:
        'The requested change is implemented and reviewed with tests for relevant user journeys. Release readiness and client acceptance are explicit and do not follow automatically from code completion.',
      checklist: [
        check('criteria', 'Confirm scope and acceptance criteria'),
        check('implementation', 'Complete implementation and code review'),
        check('checks', 'Test affected flows and error cases'),
      ],
      evidence: [
        link(
          'change',
          'Reviewable change or build',
          'Link the pull request, build or review environment.',
        ),
        link(
          'validation',
          'Validation evidence',
          'Link tests and relevant functional checks.',
        ),
      ],
      reviewChecks: [
        check('scope', 'The implementation satisfies the agreed scope'),
        check('release', 'Tests, review and release risks are understood'),
      ],
    },
  },
];
