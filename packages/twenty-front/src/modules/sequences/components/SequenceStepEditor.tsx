import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type Editor } from '@tiptap/core';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { useCampaignEmailEditorVariables } from '@/activities/emails/hooks/useCampaignEmailEditorVariables';
import { useUploadEmailImage } from '@/activities/emails/hooks/useUploadEmailImage';
import { EmailEditorCanvas } from '@/activities/emails/editor/components/EmailEditorCanvas';
import { CAMPAIGN_BODY_EDITOR_PROFILE } from '@/activities/emails/editor/constants/CampaignBodyEditorProfile';
import { AdvancedTextEditorInsertRail } from '@/advanced-text-editor/components/AdvancedTextEditorInsertRail';
import { FormAdvancedTextFieldInput } from '@/advanced-text-editor/components/FormAdvancedTextFieldInput';
import { useSequenceStepDraft } from '@/sequences/hooks/useSequenceStepDraft';
import {
  SEQUENCE_DELAY_UNITS,
  type SequenceDelayUnit,
  type SequenceStep,
  type SequenceStepChannel,
} from '@/sequences/types/SequenceStep';
import { Select } from '@/ui/input/components/Select';
import { TextArea } from '@/ui/input/components/TextArea';
import { TextInput } from '@/ui/input/components/TextInput';
import {
  IconBrandWhatsapp,
  IconMail,
  IconMessage,
  IconTrash,
} from 'twenty-ui/icon';
import { LightIconButton, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledStepCard = styled.div`
  background-color: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledStepHeader = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  justify-content: space-between;
`;

const StyledDelayRow = styled.div`
  align-items: flex-end;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledEditorContainer = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
`;

const StyledChannelHint = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

type SequenceStepEditorProps = {
  step: SequenceStep;
  onDelete: (stepId: string) => void;
};

export const SequenceStepEditor = ({
  step,
  onDelete,
}: SequenceStepEditorProps) => {
  const { draft, updateDraft, flush, draftResyncKey } = useSequenceStepDraft({
    step,
  });
  const { uploadEmailImage } = useUploadEmailImage();
  const { variables } = useCampaignEmailEditorVariables();

  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null);

  const channelOptions: SelectOption<SequenceStepChannel>[] = [
    { label: t`Email`, value: 'EMAIL', Icon: IconMail },
    { label: t`WhatsApp`, value: 'WHATSAPP', Icon: IconBrandWhatsapp },
    { label: t`SMS`, value: 'SMS', Icon: IconMessage },
  ];

  const delayUnitOptions: SelectOption<SequenceDelayUnit>[] =
    SEQUENCE_DELAY_UNITS.map((unit) => ({ label: unit, value: unit }));

  return (
    <StyledStepCard onBlur={() => flush()}>
      <StyledStepHeader>
        <span>
          {t`Step`} {step.stepPosition}
        </span>
        <LightIconButton
          Icon={IconTrash}
          accent="tertiary"
          onClick={() => onDelete(step.id)}
        />
      </StyledStepHeader>
      <Select
        dropdownId={`sequence-step-channel-${step.id}`}
        label={t`Channel`}
        value={draft.channel}
        options={channelOptions}
        onChange={(channel) => updateDraft({ channel })}
      />
      <StyledDelayRow>
        <TextInput
          label={t`Wait`}
          value={draft.delayValue.toString()}
          onChange={(value) => {
            const parsedValue = Number(value);

            if (!Number.isNaN(parsedValue)) {
              updateDraft({ delayValue: parsedValue });
            }
          }}
        />
        <Select
          dropdownId={`sequence-step-delay-unit-${step.id}`}
          label={t`Unit`}
          value={draft.delayUnit}
          options={delayUnitOptions}
          onChange={(delayUnit) => updateDraft({ delayUnit })}
        />
      </StyledDelayRow>
      {draft.channel === 'EMAIL' && (
        <>
          <TextInput
            label={t`Subject`}
            placeholder={t`Subject line`}
            value={draft.subject}
            onChange={(subject) => updateDraft({ subject })}
            fullWidth
          />
          <StyledEditorContainer>
            <FormAdvancedTextFieldInput
              key={draftResyncKey}
              label={t`Body`}
              defaultValue={draft.body}
              onChange={(body) => updateDraft({ body })}
              placeholder={t`Type something or press "/" to see commands`}
              profile={CAMPAIGN_BODY_EDITOR_PROFILE}
              EditorComponent={EmailEditorCanvas}
              onEditorReady={setBodyEditor}
              onImageUpload={uploadEmailImage}
            />
            {isDefined(bodyEditor) && (
              <AdvancedTextEditorInsertRail
                editor={bodyEditor}
                onImageUpload={uploadEmailImage}
                variables={variables}
              />
            )}
          </StyledEditorContainer>
        </>
      )}
      {draft.channel === 'WHATSAPP' && (
        <>
          <StyledChannelHint>
            {t`Free-form WhatsApp messages are only delivered within 24 hours of the person's last reply. Outside that window, a pre-approved template is required.`}
          </StyledChannelHint>
          <TextArea
            textAreaId={`sequence-step-whatsapp-body-${step.id}`}
            label={t`Body`}
            minRows={4}
            maxRows={10}
            placeholder={t`Type your message. Use '{{name.firstName}}' to insert variables.`}
            value={draft.body}
            onChange={(body) => updateDraft({ body })}
          />
          <TextInput
            label={t`Template name (required outside the 24h window)`}
            placeholder={t`approved_template_name`}
            value={draft.whatsappTemplateName}
            onChange={(whatsappTemplateName) =>
              updateDraft({ whatsappTemplateName })
            }
            fullWidth
          />
          <TextArea
            textAreaId={`sequence-step-whatsapp-template-params-${step.id}`}
            label={t`Template parameters (JSON)`}
            minRows={2}
            maxRows={6}
            placeholder={'{"1": "{{name.firstName}}"}'}
            value={draft.whatsappTemplateParams}
            onChange={(whatsappTemplateParams) =>
              updateDraft({ whatsappTemplateParams })
            }
          />
        </>
      )}
      {draft.channel === 'SMS' && (
        <TextArea
          textAreaId={`sequence-step-sms-body-${step.id}`}
          label={t`Body`}
          minRows={4}
          maxRows={10}
          placeholder={t`Type your message. Use '{{name.firstName}}' to insert variables.`}
          value={draft.body}
          onChange={(body) => updateDraft({ body })}
        />
      )}
    </StyledStepCard>
  );
};
