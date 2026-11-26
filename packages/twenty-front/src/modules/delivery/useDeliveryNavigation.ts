import { useState } from 'react';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { hasOtogrowCapability } from '@/otogrow-access/otogrow-access.types';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { useLingui } from '@lingui/react/macro';
import {
  IconBriefcase,
  IconCalendar,
  IconListCheck,
  IconCheck,
  IconCode,
  IconHome,
  IconInbox,
  IconVideo,
  IconRobot,
  IconSearch,
  IconChartBar,
  IconUsers,
  IconCurrencyDollar,
} from 'twenty-ui/icon';

export const useDeliveryNavigation = (actor: DeliveryWorkspace['actor']) => {
  const { t } = useLingui();
  const permission = useWorkflowAccess();
  const verified =
    permission.ready && permission.access?.memberId === actor.memberId;
  const current = {
    identity: permission.scope,
    isAdmin:
      verified &&
      actor.isAdmin &&
      permission.access?.capabilities.includes('workspace.admin') === true,
    isManager:
      verified &&
      actor.isManager &&
      (permission.access?.capabilities.includes('workspace.admin') === true ||
        permission.access?.capabilities.includes('delivery.manage') === true),
    canReadFinance: verified && permission.canReadFinance,
    canReview:
      verified &&
      hasOtogrowCapability(
        permission.access?.capabilities ?? [],
        'delivery.review',
      ),
  };
  const [lastVerified, setLastVerified] = useState(current);
  if (
    lastVerified.identity !== current.identity ||
    (verified &&
      (lastVerified.isAdmin !== current.isAdmin ||
        lastVerified.isManager !== current.isManager ||
        lastVerified.canReview !== current.canReview ||
        lastVerified.canReadFinance !== current.canReadFinance))
  )
    setLastVerified(current);
  // Keep the hidden page mounted through a failed check; current permissions still govern every action.
  const navigation =
    !permission.ready &&
    !permission.denied &&
    lastVerified.identity === current.identity
      ? lastVerified
      : current;
  const { isAdmin, isManager, canReadFinance, canReview } = navigation;
  return [
    {
      id: 'today',
      label: t`Today`,
      Icon: IconHome,
      items: [
        {
          view: 'home',
          label: t`Today`,
          description: t`Due work, reviews and blockers that need your attention.`,
          Icon: IconHome,
        },
      ],
    },
    {
      id: 'work',
      label: t`Work`,
      Icon: IconListCheck,
      items: [
        {
          view: 'mine',
          label: t`My tasks`,
          description: t`Your assignments, feedback and progress.`,
          Icon: IconListCheck,
        },
        ...(isManager
          ? [
              {
                view: 'planner',
                label: t`Team planner`,
                description: t`Plan assignments and review the team's workload.`,
                Icon: IconCalendar,
              },
            ]
          : []),
        ...(canReview
          ? [
              {
                view: 'reviews',
                label: t`Approvals`,
                description: t`Review waiting submissions and see who is responsible.`,
                Icon: IconCheck,
              },
            ]
          : []),
        ...(isManager
          ? [
              {
                view: 'workflows',
                label: t`Service workflows`,
                description: t`Reusable work requirements, evidence and review standards.`,
                Icon: IconListCheck,
              },
            ]
          : []),
        {
          view: 'batches',
          label: t`Production batches`,
          description: t`Weekly and monthly plans with per-task review and fulfilment.`,
          Icon: IconCalendar,
        },
        {
          view: 'creative',
          label: t`Creative studio`,
          description: t`Briefs, references, shots and creative production.`,
          Icon: IconVideo,
        },
        {
          view: 'operations',
          label: t`Delivery & reminders`,
          description: t`Messages, recurring work and client fulfilment.`,
          Icon: IconInbox,
        },
        {
          view: 'development',
          label: t`Development`,
          description: t`Release checklists, review and delivery evidence.`,
          Icon: IconCode,
        },
      ],
    },
    {
      id: 'clients',
      label: isManager ? t`Clients` : t`Client work`,
      Icon: IconBriefcase,
      items: [
        {
          view: 'clients',
          label: isManager ? t`Clients` : t`Client commitments`,
          description: isManager
            ? t`Service agreements, onboarding and client portals.`
            : t`Promised work and fulfilment in your assigned client projects.`,
          Icon: IconBriefcase,
        },
        {
          view: 'deliverables',
          label: t`Deliverables`,
          description: t`Upload monthly videos & assets, manage Drive sync, and publish to clients.`,
          Icon: IconVideo,
        },
        {
          view: 'knowledge',
          label: t`Brand knowledge`,
          description: t`Approved brand facts, creative rules, references and meeting decisions.`,
          Icon: IconBriefcase,
        },
      ],
    },
    {
      id: 'inbox',
      label: t`Inbox`,
      Icon: IconInbox,
      items: [
        {
          view: 'inbox',
          label: t`Inbox`,
          description: t`Client conversations and reply drafts you can access.`,
          Icon: IconInbox,
        },
        {
          view: 'chat',
          label: t`Team chat`,
          description: t`Direct teammate messages and five-minute unread reminders.`,
          Icon: IconUsers,
        },
      ],
    },
    {
      id: 'growth',
      label: t`Growth`,
      Icon: IconChartBar,
      items: [
        {
          view: 'ads',
          label: t`Advertising`,
          description: t`Performance reports, recommendations and budget requests.`,
          Icon: IconChartBar,
        },
        {
          view: 'seo',
          label: t`SEO results`,
          description: t`Review completed SEO work and measured client results.`,
          Icon: IconSearch,
        },
        {
          view: 'content',
          label: t`Content`,
          description: t`Plan content, review drafts and record published work.`,
          Icon: IconVideo,
        },
        {
          view: 'competitors',
          label: t`Competitor research`,
          description: t`Source evidence, competitor findings and creative ideas.`,
          Icon: IconSearch,
        },
      ],
    },
    ...(isManager || canReadFinance
      ? [
          {
            id: 'business',
            label: t`Business`,
            Icon: IconBriefcase,
            items: [
              ...(isManager
                ? [
                    {
                      view: 'team',
                      label: t`Team & projects`,
                      description: t`Set up projects, assign people and manage access.`,
                      Icon: IconUsers,
                    },
                  ]
                : []),
              ...(canReadFinance
                ? [
                    {
                      view: 'finance',
                      label: t`Finance`,
                      description: t`Cash, monthly cost plans and recorded client results.`,
                      Icon: IconCurrencyDollar,
                    },
                  ]
                : []),
              ...(isAdmin
                ? [
                    {
                      view: 'activity',
                      label: t`Team activity`,
                      description: t`Trace recorded changes, decisions and assistant runs.`,
                      Icon: IconListCheck,
                    },
                    {
                      view: 'health',
                      label: t`Company overview`,
                      description: t`Business exceptions and connection readiness.`,
                      Icon: IconBriefcase,
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
    {
      id: 'automation',
      label: t`AI assistants`,
      Icon: IconRobot,
      items: [
        {
          view: 'agents',
          label: t`AI assistants`,
          description: t`Configure assistants, assign work and review their results.`,
          Icon: IconRobot,
        },
      ],
    },
  ];
};
