import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type PreflightReport = {
  status: 'IDLE' | 'RUNNING' | 'PASSED' | 'FAILED';
  detail: string | null;
};

export const preflightReportState = createAtomState<PreflightReport>({
  key: 'preflightReportState',
  defaultValue: { status: 'IDLE', detail: null },
});
