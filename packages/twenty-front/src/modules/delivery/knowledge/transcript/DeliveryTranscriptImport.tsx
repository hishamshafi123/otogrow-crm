import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { readFileAsync } from '@/spreadsheet-import/utils/readFilesAsync';
import {
  parseTranscriptBytes,
  transcriptTextPreview,
  validateTranscriptFile,
  type TranscriptImportError,
} from '@/delivery/knowledge/transcript/transcript-import';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export type TranscriptImportTarget = {
  sourceIdentity: string;
  transcript: string;
};
type DeliveryTranscriptImportProps = {
  sourceIdentity: string;
  transcript: string;
  disabled?: boolean;
  onImport: (text: string, target: TranscriptImportTarget) => boolean;
};
type TranscriptImportSessionProps = DeliveryTranscriptImportProps;
type ImportSelection =
  | { kind: 'EMPTY' }
  | { kind: 'READING'; filename: string }
  | { kind: 'ERROR'; error: TranscriptImportError }
  | {
      kind: 'PREVIEW';
      filename: string;
      text: string;
      characterCount: number;
      target: TranscriptImportTarget;
      rejected: boolean;
    };
const StyledImport = styled.section`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  min-width: 0;
  padding: 12px;
  h3,
  p {
    margin: 0;
  }
  label {
    display: grid;
    gap: 8px;
  }
  input[type='file'] {
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
    width: 100%;
  }
`;
const StyledFilename = styled.strong`
  overflow-wrap: anywhere;
`;
const StyledPreview = styled.pre`
  font-family: inherit;
  font-size: inherit;
  line-height: 1.5;
  margin: 0;
  max-height: 240px;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

export const DeliveryTranscriptImport = (
  props: DeliveryTranscriptImportProps,
) => (
  <TranscriptImportSession
    key={JSON.stringify([props.sourceIdentity, props.disabled === true])}
    sourceIdentity={props.sourceIdentity}
    transcript={props.transcript}
    disabled={props.disabled}
    onImport={props.onImport}
  />
);

const TranscriptImportSession = ({
  sourceIdentity,
  transcript,
  disabled = false,
  onImport,
}: TranscriptImportSessionProps) => {
  const { t } = useLingui();
  const titleId = useId();
  const helpId = useId();
  const [selection, setSelection] = useState<ImportSelection>({
    kind: 'EMPTY',
  });
  const [imported, setImported] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- The shared local reader cannot abort IO; invalidate obsolete byte results before they enter another draft's preview.
  const request = useRef<AbortController | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Return keyboard focus to the native chooser after cancelling its preview.
  const fileInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const errors: Record<TranscriptImportError, string> = {
    UNSUPPORTED_FILE: t`Choose a TXT, VTT or SRT transcript file.`,
    FILE_TOO_LARGE: t`Choose a transcript file no larger than 1 MiB.`,
    EMPTY_TEXT: t`This file has no transcript text. Choose another file or paste your notes.`,
    INVALID_UTF8: t`This file is not valid UTF-8 text. Export it as UTF-8 TXT, VTT or SRT and try again.`,
    BINARY_CONTENT: t`This file contains binary data or unsupported control characters. Choose a text transcript instead.`,
    TEXT_TOO_LONG: t`This transcript exceeds the 200,000-character limit. Choose a shorter export or paste the relevant notes.`,
    READ_FAILED: t`This file could not be read. Choose it again or paste your notes.`,
  };
  const cancel = () => {
    request.current?.abort();
    setSelection({ kind: 'EMPTY' });
    setImported(false);
    fileInput.current?.focus();
  };
  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (disabled) return;
    request.current?.abort();
    setImported(false);
    if (!isDefined(file)) {
      setSelection({ kind: 'EMPTY' });
      return;
    }
    const error = validateTranscriptFile(file);
    if (error) {
      setSelection({ kind: 'ERROR', error });
      return;
    }
    const currentRequest = new AbortController();
    request.current = currentRequest;
    const target = { sourceIdentity, transcript };
    setSelection({ kind: 'READING', filename: file.name });
    try {
      const buffer = await readFileAsync(file);
      if (currentRequest.signal.aborted) return;
      if (!(buffer instanceof ArrayBuffer)) {
        setSelection({ kind: 'ERROR', error: 'READ_FAILED' });
        return;
      }
      const result = parseTranscriptBytes(file, new Uint8Array(buffer));
      if (!result.success) {
        setSelection({ kind: 'ERROR', error: result.error });
        return;
      }
      setSelection({
        kind: 'PREVIEW',
        filename: file.name,
        text: result.text,
        characterCount: result.characterCount,
        target,
        rejected: false,
      });
    } catch {
      if (!currentRequest.signal.aborted)
        setSelection({ kind: 'ERROR', error: 'READ_FAILED' });
    }
  };
  const preview = selection.kind === 'PREVIEW' ? selection : null;
  const stale =
    preview !== null &&
    (preview.rejected ||
      preview.target.sourceIdentity !== sourceIdentity ||
      preview.target.transcript !== transcript);
  const apply = () => {
    if (disabled || !preview || stale) return;
    if (!onImport(preview.text, preview.target)) {
      setSelection({ ...preview, rejected: true });
      return;
    }
    request.current?.abort();
    setSelection({ kind: 'EMPTY' });
    setImported(true);
  };
  return (
    <StyledImport aria-labelledby={titleId}>
      <StyledDeliveryStack>
        <h3 id={titleId}>
          <Trans>Import a transcript file</Trans>
        </h3>
        <p id={helpId}>
          <Trans>
            Preview UTF-8 TXT, VTT or SRT text up to 1 MiB and 200,000
            characters. Files are read on this device. Timestamps and speaker
            labels stay as written. Recording and Fathom links remain
            references; this does not transcribe a recording.
          </Trans>
        </p>
        <label>
          <Trans>Choose transcript file</Trans>
          <input
            type="file"
            ref={fileInput}
            accept=".txt,.vtt,.srt,text/plain,text/vtt,application/x-subrip"
            disabled={disabled}
            aria-describedby={helpId}
            onChange={(event) => void chooseFile(event)}
          />
        </label>
        {selection.kind === 'ERROR' && (
          <p role="alert">{errors[selection.error]}</p>
        )}
        {selection.kind === 'READING' && (
          <p role="status">
            {t`Reading transcript file`}:{' '}
            <StyledFilename>{selection.filename}</StyledFilename>
          </p>
        )}
        {preview && (
          <StyledDeliveryStack>
            <p>
              <StyledFilename>{preview.filename}</StyledFilename> ·{' '}
              {t`${preview.characterCount} characters`}
            </p>
            <StyledPreview
              role="region"
              tabIndex={0}
              aria-label={t`Transcript preview`}
            >
              {transcriptTextPreview(preview.text)}
            </StyledPreview>
            {transcriptTextPreview(preview.text).length <
              preview.text.length && (
              <p>
                <Trans>
                  Only the beginning is shown. Using this transcript adds all
                  validated text to your draft.
                </Trans>
              </p>
            )}
            <p>
              <Trans>
                Import updates only the draft notes. Review them before saving;
                reviewed knowledge and publication are unchanged.
              </Trans>
            </p>
            {stale && (
              <p role="alert">
                <Trans>
                  This meeting draft changed after the file was selected. Cancel
                  this preview and choose the file again before replacing notes.
                </Trans>
              </p>
            )}
            <StyledDeliveryButton
              type="button"
              disabled={disabled || stale}
              onClick={apply}
            >
              {transcript ? t`Replace existing notes` : t`Use transcript`}
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        )}
        {(selection.kind === 'READING' || preview) && (
          <StyledDeliveryRow>
            <StyledDeliveryButton type="button" onClick={cancel}>
              <Trans>Cancel import</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        )}
        {imported && (
          <p role="status">
            <Trans>
              Transcript added to this draft. Review the notes, then save the
              meeting draft when ready.
            </Trans>
          </p>
        )}
      </StyledDeliveryStack>
    </StyledImport>
  );
};
