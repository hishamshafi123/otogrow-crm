import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  GET_DELIVERY_STUDIO_AGENT_CAPABILITIES,
  SAVE_DELIVERY_STUDIO_PROVIDER_CONFIG,
  TEST_DELIVERY_STUDIO_PROVIDER_KEY,
} from '@/delivery/studio/delivery-studio.graphql';
import {
  type StudioAgentCapabilitiesDTO,
  type StudioModelSpecDTO,
  type StudioProviderConfigDTO,
  type StudioProviderId,
  type StudioRoutingMode,
} from '@/delivery/studio/delivery-studio.types';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';

const StyledBackdrop = styled.div`
  align-items: center;
  backdrop-filter: blur(4px);
  background: ${themeCssVariables.background.transparent.strong};
  display: flex;
  inset: 0;
  justify-content: center;
  padding: ${themeCssVariables.spacing[4]};
  position: fixed;
  z-index: 1200;
`;

const StyledModal = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-shadow: 0 24px 64px ${themeCssVariables.boxShadow.color};
  display: flex;
  flex-direction: column;
  max-height: 88vh;
  max-width: 720px;
  overflow: hidden;
  width: 100%;
`;

const StyledHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[4]} ${themeCssVariables.spacing[5]};

  h3 {
    color: ${themeCssVariables.font.color.primary};
    font-size: ${themeCssVariables.font.size.lg};
    font-weight: 600;
    margin: 0;
  }

  p {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: ${themeCssVariables.font.size.xs};
    margin: 2px 0 0;
  }
`;

const StyledTabs = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[5]};
`;

const StyledTabBtn = styled.button<{ active: boolean }>`
  background: ${({ active }) =>
    active ? themeCssVariables.background.primary : 'transparent'};
  border: 1px solid
    ${({ active }) =>
      active ? themeCssVariables.border.color.medium : 'transparent'};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ active }) =>
    active
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: 500;
  padding: 6px 12px;
`;

const StyledBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[5]};
`;

const StyledCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledPill = styled.span<{ tone?: 'ok' | 'warn' | 'muted' }>`
  background: ${({ tone }) =>
    tone === 'ok'
      ? themeCssVariables.color.transparent.green3
      : tone === 'warn'
        ? themeCssVariables.color.transparent.amber3
        : themeCssVariables.background.tertiary};
  border-radius: 999px;
  color: ${({ tone }) =>
    tone === 'ok'
      ? themeCssVariables.color.green11
      : tone === 'warn'
        ? themeCssVariables.color.amber11
        : themeCssVariables.font.color.secondary};
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex: 1;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: 500;
  gap: 5px;
  min-width: 180px;

  input,
  select {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.primary};
    font-size: ${themeCssVariables.font.size.sm};
    padding: 8px 10px;
  }
`;

const StyledEndpointRow = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;

  code {
    color: ${themeCssVariables.font.color.primary};
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }

  span {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 12px;
  }
`;

const StyledFooter = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[5]};
`;

type DeliveryStudioProviderModalProps = {
  open: boolean;
  canManage: boolean;
  config: StudioProviderConfigDTO;
  catalog: StudioModelSpecDTO[];
  onClose: () => void;
  onSaved: () => void;
};

export const DeliveryStudioProviderModal = ({
  open,
  canManage,
  config,
  catalog,
  onClose,
  onSaved,
}: DeliveryStudioProviderModalProps) => {
  const [activeTab, setActiveTab] = useState<'keys' | 'agent'>('keys');
  const [wavespeedKey, setWavespeedKey] = useState('');
  const [kieKey, setKieKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [wavespeedEnabled, setWavespeedEnabled] = useState(
    config.wavespeedEnabled,
  );
  const [kieEnabled, setKieEnabled] = useState(config.kieEnabled);
  const [routingMode, setRoutingMode] = useState<StudioRoutingMode>(
    config.defaultRoutingMode,
  );
  const [defaultImageModel, setDefaultImageModel] = useState(
    config.defaultImageModel,
  );
  const [defaultVideoModel, setDefaultVideoModel] = useState(
    config.defaultVideoModel,
  );
  const [geminiModelId, setGeminiModelId] = useState(
    config.geminiModelId || 'gemini-2.5-flash',
  );
  const [customGeminiModel, setCustomGeminiModel] = useState('');
  const [maxConcurrentJobs, setMaxConcurrentJobs] = useState(
    config.maxConcurrentJobs,
  );
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [copiedPath, setCopiedPath] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setWavespeedEnabled(config.wavespeedEnabled);
    setKieEnabled(config.kieEnabled);
    setRoutingMode(config.defaultRoutingMode);
    setDefaultImageModel(config.defaultImageModel);
    setDefaultVideoModel(config.defaultVideoModel);
    setGeminiModelId(config.geminiModelId || 'gemini-2.5-flash');
    setCustomGeminiModel('');
    setMaxConcurrentJobs(config.maxConcurrentJobs);
    setStatusMessage('');
    setErrorMessage('');
  }, [open, config]);

  const [saveConfig, { loading: saving }] = useMutation(
    SAVE_DELIVERY_STUDIO_PROVIDER_CONFIG,
  );
  const [testKey, { loading: testing }] = useMutation<{
    testDeliveryStudioProviderKey: { ok: boolean; message: string };
  }>(TEST_DELIVERY_STUDIO_PROVIDER_KEY);

  const capabilitiesQuery = useQuery<{
    deliveryStudioAgentCapabilities: StudioAgentCapabilitiesDTO;
  }>(GET_DELIVERY_STUDIO_AGENT_CAPABILITIES, {
    skip: !open || activeTab !== 'agent',
  });

  if (!open) return null;

  const imageModels = catalog.filter((m) => m.kind === 'IMAGE');
  const videoModels = catalog.filter((m) => m.kind === 'VIDEO');
  const geminiModels =
    config.geminiAvailableModels && config.geminiAvailableModels.length > 0
      ? config.geminiAvailableModels
      : [
          {
            id: 'gemini-flash-latest',
            label: 'Gemini Flash Latest',
            badge: 'Auto-Latest',
          },
          {
            id: 'gemini-3.1-pro-preview',
            label: 'Gemini 3.1 Pro Preview',
            badge: 'Pro',
          },
          {
            id: 'gemini-3-flash-preview',
            label: 'Gemini 3 Flash Preview',
            badge: 'Fast',
          },
          { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', badge: 'Pro' },
          {
            id: 'gemini-2.5-flash',
            label: 'Gemini 2.5 Flash',
            badge: 'Balanced',
          },
          {
            id: 'gemini-2.5-flash-lite',
            label: 'Gemini 2.5 Flash-Lite',
            badge: 'Lite',
          },
        ];

  const handleSave = async () => {
    setErrorMessage('');
    setStatusMessage('');
    const resolvedGeminiModel =
      geminiModelId === '__custom__'
        ? customGeminiModel.trim()
        : geminiModelId.trim();
    try {
      await saveConfig({
        variables: {
          input: {
            ...(wavespeedKey.trim()
              ? { wavespeedApiKey: wavespeedKey.trim() }
              : {}),
            ...(kieKey.trim() ? { kieApiKey: kieKey.trim() } : {}),
            ...(geminiKey.trim() ? { geminiApiKey: geminiKey.trim() } : {}),
            ...(resolvedGeminiModel
              ? { geminiModelId: resolvedGeminiModel }
              : {}),
            wavespeedEnabled,
            kieEnabled,
            defaultRoutingMode: routingMode,
            defaultImageModel,
            defaultVideoModel,
            maxConcurrentJobs,
          },
        },
      });
      setWavespeedKey('');
      setKieKey('');
      setGeminiKey('');
      setStatusMessage(
        'Saved encrypted API keys, prompting model & routing settings.',
      );
      onSaved();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to save provider config.',
      );
    }
  };

  const handleClearKey = async (provider: StudioProviderId | 'gemini') => {
    setErrorMessage('');
    setStatusMessage('');
    try {
      await saveConfig({
        variables: {
          input:
            provider === 'wavespeed'
              ? { clearWavespeedKey: true }
              : provider === 'kie'
                ? { clearKieKey: true }
                : { clearGeminiKey: true },
        },
      });
      setStatusMessage(
        `Removed stored ${
          provider === 'wavespeed'
            ? 'WaveSpeedAI'
            : provider === 'kie'
              ? 'Kie.ai'
              : 'Google Gemini'
        } API key.`,
      );
      onSaved();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to clear API key.',
      );
    }
  };

  const handleTest = async (provider: StudioProviderId | 'gemini') => {
    setErrorMessage('');
    setStatusMessage('');
    try {
      const apiKey =
        provider === 'wavespeed'
          ? wavespeedKey.trim() || null
          : provider === 'kie'
            ? kieKey.trim() || null
            : geminiKey.trim() || null;
      const res = await testKey({
        variables: { provider, apiKey },
      });
      const result = res.data?.testDeliveryStudioProviderKey;
      const label =
        provider === 'wavespeed'
          ? 'WaveSpeedAI'
          : provider === 'kie'
            ? 'Kie.ai'
            : 'Google Gemini';
      if (result?.ok) {
        setStatusMessage(`${label}: ${result.message}`);
      } else {
        setErrorMessage(`${label}: ${result?.message ?? 'Key check failed.'}`);
      }
      onSaved();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Connection test failed.',
      );
    }
  };

  const handleCopy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedPath(text);
    setTimeout(() => setCopiedPath(''), 1800);
  };

  const caps = capabilitiesQuery.data?.deliveryStudioAgentCapabilities;

  return (
    <StyledBackdrop onClick={onClose}>
      <StyledModal onClick={(e) => e.stopPropagation()}>
        <StyledHeader>
          <div>
            <h3>AI Studio Providers, Failover &amp; Agent API</h3>
            <p>
              Keys are encrypted with AES-256-GCM in your workspace. WaveSpeedAI
              runs primary with automatic Kie.ai failover.
            </p>
          </div>
          <StyledDeliveryButton type="button" onClick={onClose}>
            Close
          </StyledDeliveryButton>
        </StyledHeader>

        <StyledTabs>
          <StyledTabBtn
            type="button"
            active={activeTab === 'keys'}
            onClick={() => setActiveTab('keys')}
          >
            API Keys &amp; Failover
          </StyledTabBtn>
          <StyledTabBtn
            type="button"
            active={activeTab === 'agent'}
            onClick={() => setActiveTab('agent')}
          >
            Agentic REST API
          </StyledTabBtn>
        </StyledTabs>

        <StyledBody>
          {activeTab === 'keys' && (
            <>
              {!canManage && (
                <StyledPill tone="warn">
                  View-only: ask a workspace manager or admin to update API keys.
                </StyledPill>
              )}

              <StyledCard>
                <StyledRow>
                  <div>
                    <strong>WaveSpeedAI API v3</strong>{' '}
                    <StyledPill tone="muted">Primary</StyledPill>
                  </div>
                  <StyledPill
                    tone={config.wavespeedConfigured ? 'ok' : 'warn'}
                  >
                    {config.wavespeedConfigured
                      ? `Configured (••••${config.wavespeedKeyLast4})`
                      : 'Not configured'}
                  </StyledPill>
                </StyledRow>
                <StyledRow>
                  <StyledField>
                    WaveSpeedAI API Key
                    <input
                      type="password"
                      disabled={!canManage}
                      placeholder={
                        config.wavespeedConfigured
                          ? `Enter new key to replace ••••${config.wavespeedKeyLast4}`
                          : 'Paste WaveSpeedAI API key...'
                      }
                      value={wavespeedKey}
                      onChange={(e) => setWavespeedKey(e.target.value)}
                    />
                  </StyledField>
                </StyledRow>
                <StyledRow>
                  <label style={{ fontSize: 12, display: 'flex', gap: 6 }}>
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={wavespeedEnabled}
                      onChange={(e) => setWavespeedEnabled(e.target.checked)}
                    />
                    Enable WaveSpeedAI
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <StyledDeliveryButton
                      type="button"
                      disabled={testing}
                      onClick={() => void handleTest('wavespeed')}
                    >
                      Test Connection
                    </StyledDeliveryButton>
                    {canManage && config.wavespeedConfigured && (
                      <StyledDeliveryButton
                        type="button"
                        disabled={saving}
                        onClick={() => void handleClearKey('wavespeed')}
                      >
                        Clear Key
                      </StyledDeliveryButton>
                    )}
                  </div>
                </StyledRow>
                {config.wavespeedLastError && (
                  <span style={{ fontSize: 12, color: themeCssVariables.color.red11 }}>
                    Last error: {config.wavespeedLastError}
                  </span>
                )}
              </StyledCard>

              <StyledCard>
                <StyledRow>
                  <div>
                    <strong>Kie.ai API v1</strong>{' '}
                    <StyledPill tone="muted">Automatic Failsafe</StyledPill>
                  </div>
                  <StyledPill tone={config.kieConfigured ? 'ok' : 'warn'}>
                    {config.kieConfigured
                      ? `Configured (••••${config.kieKeyLast4})`
                      : 'Not configured'}
                  </StyledPill>
                </StyledRow>
                <StyledRow>
                  <StyledField>
                    Kie.ai API Key
                    <input
                      type="password"
                      disabled={!canManage}
                      placeholder={
                        config.kieConfigured
                          ? `Enter new key to replace ••••${config.kieKeyLast4}`
                          : 'Paste Kie.ai API key...'
                      }
                      value={kieKey}
                      onChange={(e) => setKieKey(e.target.value)}
                    />
                  </StyledField>
                </StyledRow>
                <StyledRow>
                  <label style={{ fontSize: 12, display: 'flex', gap: 6 }}>
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={kieEnabled}
                      onChange={(e) => setKieEnabled(e.target.checked)}
                    />
                    Enable Kie.ai Failover
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <StyledDeliveryButton
                      type="button"
                      disabled={testing}
                      onClick={() => void handleTest('kie')}
                    >
                      Test Connection
                    </StyledDeliveryButton>
                    {canManage && config.kieConfigured && (
                      <StyledDeliveryButton
                        type="button"
                        disabled={saving}
                        onClick={() => void handleClearKey('kie')}
                      >
                        Clear Key
                      </StyledDeliveryButton>
                    )}
                  </div>
                </StyledRow>
                {config.kieLastError && (
                  <span style={{ fontSize: 12, color: themeCssVariables.color.red11 }}>
                    Last error: {config.kieLastError}
                  </span>
                )}
              </StyledCard>

              <StyledCard>
                <StyledRow>
                  <div>
                    <strong>Google Gemini (Auto-Prompt &amp; Video Analysis)</strong>{' '}
                    <StyledPill tone="muted">
                      {config.geminiModelId || 'gemini-2.5-flash'}
                    </StyledPill>
                  </div>
                  <StyledPill tone={config.geminiConfigured ? 'ok' : 'warn'}>
                    {config.geminiConfigured
                      ? config.geminiKeyLast4
                        ? `Configured (••••${config.geminiKeyLast4})`
                        : config.geminiSource === 'ADMIN_CONFIG'
                          ? 'Active via Admin Panel'
                          : 'Active via Env'
                      : 'Not configured'}
                  </StyledPill>
                </StyledRow>
                <span
                  style={{
                    fontSize: 12,
                    color: themeCssVariables.font.color.tertiary,
                  }}
                >
                  Watches your full Reference Video + inspects every Product Photo
                  &amp; Character Sheet to write a shot-by-shot video prompt.
                </span>
                <StyledRow>
                  <StyledField>
                    Google Gemini API Key
                    <input
                      type="password"
                      disabled={!canManage}
                      placeholder={
                        config.geminiKeyLast4
                          ? `Enter new key to replace ••••${config.geminiKeyLast4}`
                          : 'Paste Google AI Studio key (AIza…)...'
                      }
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                    />
                  </StyledField>
                  <StyledField>
                    Prompting &amp; Analysis Model
                    <select
                      disabled={!canManage}
                      value={
                        geminiModelId === '__custom__' ||
                        geminiModels.some((m) => m.id === geminiModelId)
                          ? geminiModelId
                          : '__custom__'
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          if (geminiModelId !== '__custom__') {
                            setCustomGeminiModel(geminiModelId);
                          }
                          setGeminiModelId('__custom__');
                        } else {
                          setGeminiModelId(val);
                          setCustomGeminiModel('');
                        }
                      }}
                    >
                      {geminiModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                          {m.badge ? ` · ${m.badge}` : ''} ({m.id})
                        </option>
                      ))}
                      <option value="__custom__">Custom model ID…</option>
                    </select>
                  </StyledField>
                </StyledRow>
                {(geminiModelId === '__custom__' ||
                  !geminiModels.some((m) => m.id === geminiModelId)) && (
                  <StyledRow>
                    <StyledField>
                      Custom Gemini Model ID
                      <input
                        type="text"
                        disabled={!canManage}
                        placeholder="e.g. gemini-3.1-pro-preview or gemini-flash-latest"
                        value={
                          geminiModelId === '__custom__'
                            ? customGeminiModel
                            : geminiModelId
                        }
                        onChange={(e) => {
                          setGeminiModelId('__custom__');
                          setCustomGeminiModel(e.target.value);
                        }}
                      />
                    </StyledField>
                  </StyledRow>
                )}
                <StyledRow>
                  <span
                    style={{
                      fontSize: 12,
                      color: themeCssVariables.font.color.tertiary,
                    }}
                  >
                    {config.geminiVerifiedAt
                      ? 'Verified & ready for Analyze Images & Video'
                      : 'Optional override (otherwise uses GOOGLE_API_KEY from Admin / .env)'}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <StyledDeliveryButton
                      type="button"
                      disabled={testing}
                      onClick={() => void handleTest('gemini')}
                    >
                      Test Connection
                    </StyledDeliveryButton>
                    {canManage && config.geminiKeyLast4 && (
                      <StyledDeliveryButton
                        type="button"
                        disabled={saving}
                        onClick={() => void handleClearKey('gemini')}
                      >
                        Clear Key
                      </StyledDeliveryButton>
                    )}
                  </div>
                </StyledRow>
                {config.geminiLastError && (
                  <span style={{ fontSize: 12, color: themeCssVariables.color.red11 }}>
                    Last error: {config.geminiLastError}
                  </span>
                )}
              </StyledCard>

              <StyledCard>
                <strong>Routing &amp; Studio Defaults</strong>
                <StyledRow>
                  <StyledField>
                    Default Routing Mode
                    <select
                      disabled={!canManage}
                      value={routingMode}
                      onChange={(e) =>
                        setRoutingMode(e.target.value as StudioRoutingMode)
                      }
                    >
                      <option value="AUTO_FAILOVER">
                        Auto Failover (WaveSpeed → Kie.ai)
                      </option>
                      <option value="WAVESPEED_ONLY">WaveSpeedAI Only</option>
                      <option value="KIE_ONLY">Kie.ai Only</option>
                    </select>
                  </StyledField>
                  <StyledField>
                    Max Concurrent Jobs
                    <input
                      type="number"
                      min={1}
                      max={16}
                      disabled={!canManage}
                      value={maxConcurrentJobs}
                      onChange={(e) =>
                        setMaxConcurrentJobs(
                          Math.max(1, Math.min(16, Number(e.target.value) || 4)),
                        )
                      }
                    />
                  </StyledField>
                </StyledRow>
                <StyledRow>
                  <StyledField>
                    Default Image Model
                    <select
                      disabled={!canManage}
                      value={defaultImageModel}
                      onChange={(e) => setDefaultImageModel(e.target.value)}
                    >
                      {imageModels.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label} ({m.vendor})
                        </option>
                      ))}
                    </select>
                  </StyledField>
                  <StyledField>
                    Default Video Model
                    <select
                      disabled={!canManage}
                      value={defaultVideoModel}
                      onChange={(e) => setDefaultVideoModel(e.target.value)}
                    >
                      {videoModels.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label} ({m.vendor})
                        </option>
                      ))}
                    </select>
                  </StyledField>
                </StyledRow>
              </StyledCard>
            </>
          )}

          {activeTab === 'agent' && (
            <StyledCard>
              <StyledRow>
                <div>
                  <strong>Agentic Tool Surface</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.75 }}>
                    Authenticate with a workspace Bearer token. Any AI agent can
                    discover capabilities and run the entire Character Sheet →
                    Video → N Text-Hooks → Google Drive pipeline.
                  </p>
                </div>
                <StyledDeliveryButton
                  type="button"
                  onClick={() =>
                    handleCopy(
                      caps
                        ? JSON.stringify(caps, null, 2)
                        : '/portal/delivery-studio/agent/capabilities',
                    )
                  }
                >
                  {copiedPath ? 'Copied!' : 'Copy Manifest JSON'}
                </StyledDeliveryButton>
              </StyledRow>
              {(caps?.endpoints ?? []).map((ep) => (
                <StyledEndpointRow key={`${ep.method}-${ep.path}`}>
                  <StyledRow>
                    <code>
                      <strong>{ep.method}</strong> {ep.path}
                    </code>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => handleCopy(ep.path)}
                    >
                      {copiedPath === ep.path ? 'Copied' : 'Copy'}
                    </StyledDeliveryButton>
                  </StyledRow>
                  <span>{ep.description}</span>
                </StyledEndpointRow>
              ))}
            </StyledCard>
          )}

          {statusMessage && <StyledPill tone="ok">{statusMessage}</StyledPill>}
          {errorMessage && (
            <StyledPill tone="warn">{errorMessage}</StyledPill>
          )}
        </StyledBody>

        <StyledFooter>
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {activeTab === 'keys'
              ? 'Tip: configure both WaveSpeedAI & Kie.ai for zero-downtime batch runs.'
              : `Manifest v${caps?.version ?? '1.0.0'} · ${caps?.models.length ?? catalog.length} models`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <StyledDeliveryButton type="button" onClick={onClose}>
              Cancel
            </StyledDeliveryButton>
            {activeTab === 'keys' && canManage && (
              <StyledDeliveryButton
                type="button"
                data-primary="true"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? 'Saving…' : 'Save Provider Settings'}
              </StyledDeliveryButton>
            )}
          </div>
        </StyledFooter>
      </StyledModal>
    </StyledBackdrop>
  );
};
