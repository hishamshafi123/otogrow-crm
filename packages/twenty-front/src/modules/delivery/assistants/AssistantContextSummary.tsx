import { Trans, useLingui } from '@lingui/react/macro';
import { StyledAssistantText } from '@/delivery/assistants/assistantStyles';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

const contextRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const contextText = (value: unknown) =>
  typeof value === 'string' ? value : '';
const contextTexts = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
export const AssistantContextSummary = ({ context }: { context: unknown }) => {
  const { t } = useLingui();
  const source = contextRecord(context);
  const inputs = contextRecord(source.inputs);
  const knowledge = contextRecord(source.brandKnowledge);
  const checklist = contextTexts(source.checklist);
  const links = contextTexts(source.evidenceLinks);
  const sources = Array.isArray(knowledge.sources)
    ? knowledge.sources.map(contextRecord)
    : [];
  return (
    <StyledDeliveryStack>
      <h4>{contextText(source.title) || t`Current task context`}</h4>
      <details>
        <summary>
          <Trans>Brief</Trans>
        </summary>
        <StyledAssistantText>
          {contextText(source.brief) || t`No brief recorded`}
        </StyledAssistantText>
      </details>
      <details>
        <summary>
          <Trans>Copy and requirements being checked</Trans>
        </summary>
        <h5>
          <Trans>Copy</Trans>
        </h5>
        <StyledAssistantText>
          {contextText(inputs.copy) ||
            contextText(source.submittedCopy) ||
            t`No copy supplied`}
        </StyledAssistantText>
        <h5>
          <Trans>Requirements</Trans>
        </h5>
        <StyledAssistantText>
          {contextText(inputs.requirements) ||
            t`No additional requirements supplied`}
        </StyledAssistantText>
      </details>
      <details>
        <summary>{t`Checklist (${checklist.length}) and source links (${links.length})`}</summary>
        <ul>
          {checklist.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
        <ul>
          {links.map((link, index) => (
            <li key={index}>{link}</li>
          ))}
        </ul>
        {['sourceUrl', 'targetUrl', 'anchor'].map(
          (key) =>
            contextText(inputs[key]) !== '' && (
              <p key={key}>
                {key === 'sourceUrl'
                  ? t`Public source`
                  : key === 'targetUrl'
                    ? t`Exact destination`
                    : t`Anchor text`}
                : {contextText(inputs[key])}
              </p>
            ),
        )}
      </details>
      <details>
        <summary>
          {typeof knowledge.totalSources === 'number' &&
          typeof knowledge.omittedSources === 'number'
            ? t`Brand knowledge: ${knowledge.totalSources - knowledge.omittedSources} of ${knowledge.totalSources} sources included`
            : t`Brand knowledge source details`}
        </summary>
        {sources.length === 0 ? (
          <p>
            <Trans>No brand knowledge excerpts were supplied.</Trans>
          </p>
        ) : (
          sources.map((item, index) => (
            <div key={index}>
              <h5>{contextText(item.title) || t`Published source`}</h5>
              <StyledAssistantText>
                {contextText(item.knowledge)}
              </StyledAssistantText>
              {item.truncated === true && (
                <p>
                  <Trans>This excerpt is shortened.</Trans>
                </p>
              )}
            </div>
          ))
        )}
        {typeof knowledge.omittedSources === 'number' &&
          knowledge.omittedSources > 0 && (
            <p>
              <Trans>
                Some sources were omitted from the bounded context. Review
                missing requirements before starting.
              </Trans>
            </p>
          )}
      </details>
      <details>
        <summary>
          <Trans>Advanced: exact context record</Trans>
        </summary>
        <StyledAssistantText>
          {JSON.stringify(context, null, 2)}
        </StyledAssistantText>
      </details>
    </StyledDeliveryStack>
  );
};
