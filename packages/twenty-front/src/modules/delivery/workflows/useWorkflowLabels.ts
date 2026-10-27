import { useLingui } from '@lingui/react/macro';
export const useWorkflowLabels = () => {
  const { t } = useLingui();
  const services = {
    AI_VIDEO: t`AI video`,
    STATIC_AD: t`Static ad`,
    SEO: t`SEO`,
    PERFORMANCE_MARKETING: t`Performance marketing`,
    WEB: t`Website`,
    APP: t`Application`,
    CUSTOM: t`Custom service`,
  };
  return {
    services,
    service: (value: string) =>
      services[value as keyof typeof services] ?? t`Custom service`,
  };
};
