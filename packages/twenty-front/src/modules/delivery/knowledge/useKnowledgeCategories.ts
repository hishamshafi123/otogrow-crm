import { useLingui } from '@lingui/react/macro';

export const useKnowledgeCategories = () => {
  const { t } = useLingui();
  return [
    { value: 'MEETING', label: t`Meeting` },
    { value: 'BRAND_FACTS', label: t`Brand and product facts` },
    { value: 'CLAIMS', label: t`Claims and supporting evidence` },
    { value: 'VISUAL_RULES', label: t`Visual and tone rules` },
    { value: 'REFERENCE', label: t`Creative reference` },
    { value: 'PROMPT', label: t`Reusable prompt` },
    { value: 'ASSET_REFERENCE', label: t`Asset reference` },
  ];
};
