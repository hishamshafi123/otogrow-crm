import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { type CreativeDocument } from '@/delivery/delivery-creative.types';

export type CreativeProductionActor = DeliveryWorkspace['actor'];
export type CreativeProductionTask = {
  id: string;
  title: string;
  projectId: string;
  revision: number;
  assigneeId: string | null;
  details: { state: string; creative?: CreativeDocument };
};
export const CREATIVE_PRODUCTION_STAGES = [
  'brief',
  'references',
  'shots',
  'assets',
  'edit',
  'final',
  'generate',
] as const;
export type CreativeProductionStage =
  (typeof CREATIVE_PRODUCTION_STAGES)[number];
