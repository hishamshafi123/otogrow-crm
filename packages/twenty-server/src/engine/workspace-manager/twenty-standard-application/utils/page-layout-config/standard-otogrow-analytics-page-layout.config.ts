import { STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS } from 'twenty-shared/metadata';
import { PageLayoutTabLayoutMode } from 'twenty-shared/types';

import { PageLayoutType } from 'src/engine/metadata-modules/page-layout/enums/page-layout-type.enum';
import {
  type StandardPageLayoutConfig,
  type StandardPageLayoutTabConfig,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout-config/standard-page-layout-config.type';

const OTOGROW_ANALYTICS_PAGE_TABS = {
  tab1: {
    universalIdentifier:
      STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.otogrowAnalyticsDashboard.tabs
        .tab1.universalIdentifier,
    title: 'Tab 1',
    position: 0,
    icon: null,
    layoutMode: PageLayoutTabLayoutMode.GRID,
    widgets: {
      leadsOverTime: {
        universalIdentifier:
          STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.otogrowAnalyticsDashboard
            .tabs.tab1.widgets.leadsOverTime.universalIdentifier,
      },
      sequencePerformance: {
        universalIdentifier:
          STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.otogrowAnalyticsDashboard
            .tabs.tab1.widgets.sequencePerformance.universalIdentifier,
      },
      leadScoreDistribution: {
        universalIdentifier:
          STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.otogrowAnalyticsDashboard
            .tabs.tab1.widgets.leadScoreDistribution.universalIdentifier,
      },
      pipelineByStage: {
        universalIdentifier:
          STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.otogrowAnalyticsDashboard
            .tabs.tab1.widgets.pipelineByStage.universalIdentifier,
      },
      whatsappSmsVolume: {
        universalIdentifier:
          STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.otogrowAnalyticsDashboard
            .tabs.tab1.widgets.whatsappSmsVolume.universalIdentifier,
      },
    },
  },
} as const satisfies Record<string, StandardPageLayoutTabConfig>;

export const STANDARD_OTOGROW_ANALYTICS_PAGE_LAYOUT_CONFIG = {
  name: 'Otogrow Analytics',
  type: PageLayoutType.DASHBOARD,
  objectUniversalIdentifier: null,
  universalIdentifier:
    STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.otogrowAnalyticsDashboard
      .universalIdentifier,
  defaultTabUniversalIdentifier: null,
  tabs: OTOGROW_ANALYTICS_PAGE_TABS,
} as const satisfies StandardPageLayoutConfig;
