import { type ComponentProps } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoQaResult } from '@/delivery/creative/video-qa/VideoQaResult';
import { type VideoQaEvidenceMedia } from '@/delivery/creative/video-qa/VideoQaEvidenceMedia';
import { type VideoQaRun } from '@/delivery/creative/video-qa/video-qa.types';
import { videoQaRunFixture } from '@/delivery/creative/video-qa/__tests__/video-qa.fixtures';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/creative/video-qa/videoQaStyles', () => ({
  StyledVideoQaText: 'p',
  StyledVideoQaFacts: 'dl',
}));
jest.mock('@/delivery/creative/video-qa/VideoQaEvidenceMedia', () => ({
  VideoQaEvidenceMedia: ({
    type,
    label,
    seek,
    frameIndex,
  }: ComponentProps<typeof VideoQaEvidenceMedia>) => (
    <section aria-label={label}>
      <p>
        {type === 'VIDEO'
          ? `Private video seek: ${seek?.atMs ?? 'none'} milliseconds`
          : `Private evidence frame: ${frameIndex}`}
      </p>
    </section>
  ),
}));
beforeEach(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));
const setup = (run: VideoQaRun = videoQaRunFixture()) =>
  render(
    <I18nProvider i18n={i18n}>
      <VideoQaResult run={run} enabled onDenied={jest.fn()} />
    </I18nProvider>,
  );
it('never treats zero model issues as final approval or a historical quote as a current funding failure', () => {
  setup();
  expect(screen.getByText(/model returned no issues/)).toHaveTextContent(
    'Independent human final review remains required',
  );
  expect(screen.getByText(/No technical observations/)).toHaveTextContent(
    'Human review is still required',
  );
  expect(
    screen.queryByText(/verified maximum reservation is unavailable/),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Maximum reservation:/)).not.toBeInTheDocument();
});
it('keeps technical findings, model interpretation, manual transcript, observed audio and visible text distinct', async () => {
  const run = videoQaRunFixture();
  run.input.manualTranscript = 'Manual notes about spoken audio';
  run.input.preparation.technicalFindings = [
    {
      code: 'BLACK_INTERVAL',
      startMs: 125,
      endMs: 600,
      evidence: 'The local decoder detected dark frames.',
    },
  ];
  run.result = {
    summary: 'A product detail needs checking.',
    limitations: 'Packaging reference may differ by region.',
    findings: [
      {
        category: 'PRODUCT',
        severity: 'WARNING',
        startMs: 1250,
        endMs: 2100,
        frameIndexes: [0],
        referenceAssetIds: ['reference'],
        evidence: 'Cap color may differ from the approved reference.',
        correction: 'Compare against the current product photo.',
        uncertainty: 'Lighting could explain the color.',
      },
    ],
    transcript: [
      { startMs: 2500, endMs: 3000, text: 'Model heard these words.' },
    ],
    visibleText: [
      { startMs: 3100, endMs: 3800, text: 'Model saw this product label.' },
    ],
  };
  run.input.references = [
    {
      ...run.input.asset,
      id: 'reference',
      name: 'Approved bottle photograph.jpg',
      mimeType: 'image/jpeg',
    },
  ];
  setup(run);
  expect(
    screen.getByRole('heading', { name: 'Technical observations' }),
  ).toBeVisible();
  const finding = within(screen.getByRole('region', { name: 'Finding 1' }));
  expect(finding.getByText(/Lighting could explain/)).toBeVisible();
  expect(
    finding.getByText('Reference: Approved bottle photograph.jpg'),
  ).toBeVisible();
  await userEvent.click(
    screen.getByText('Reviewed brief and reference evidence'),
  );
  expect(
    screen.getByRole('heading', {
      name: 'Supplemental manual transcript — unverified',
    }),
  ).toBeVisible();
  expect(screen.getByText('Manual notes about spoken audio')).toBeVisible();
  await userEvent.click(screen.getByText('Model-observed audio transcript'));
  await userEvent.click(screen.getByText('Model-observed visible text'));
  expect(screen.getByText('Model heard these words.')).toBeVisible();
  expect(screen.getByText('Model saw this product label.')).toBeVisible();
  await userEvent.click(
    finding.getByRole('button', { name: '0:01.250 – 0:02.100' }),
  );
  expect(
    screen.getByRole('region', { name: 'Inspected video evidence' }),
  ).toHaveTextContent('1250 milliseconds');
  await userEvent.click(
    finding.getByRole('button', { name: 'Inspect frame 1' }),
  );
  expect(
    screen.getByRole('region', { name: 'Evidence frame at 0:00' }),
  ).toHaveTextContent('Private evidence frame: 0');
  await userEvent.click(
    screen.getByRole('button', { name: 'Dark interval · 0:00.125 – 0:00.600' }),
  );
  expect(
    screen.getByRole('region', { name: 'Inspected video evidence' }),
  ).toHaveTextContent('125 milliseconds');
});
it('labels stale production and absent results without claiming inspection passed', () => {
  const run = videoQaRunFixture();
  run.sourceCurrent = false;
  run.result = null;
  setup(run);
  expect(screen.getByRole('status')).toHaveTextContent(
    'saved historical findings',
  );
  expect(screen.getByText(/No model result is available yet/)).toBeVisible();
  expect(
    screen.queryByText(/model returned no issues/),
  ).not.toBeInTheDocument();
});
