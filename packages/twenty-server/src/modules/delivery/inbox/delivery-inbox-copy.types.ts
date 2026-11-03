import { type EntityManager } from 'typeorm';

export type ConnectedInboxDraftSources = {
  runId: string;
  quote: { agentVersion: number; pricingRevision: number };
  read: (
    manager: EntityManager,
  ) => Promise<{ id: string; text: string; sourceUrl: null }[]>;
  commit: (manager: EntityManager, text: string) => Promise<void>;
};
