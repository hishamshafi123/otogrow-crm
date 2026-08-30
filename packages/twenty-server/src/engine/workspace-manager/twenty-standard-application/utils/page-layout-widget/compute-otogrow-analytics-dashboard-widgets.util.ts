import { CalendarStartDay } from 'twenty-shared/constants';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  AggregateOperations,
  PageLayoutTabLayoutMode,
} from 'twenty-shared/types';

import { type FlatPageLayoutWidget } from 'src/engine/metadata-modules/flat-page-layout-widget/types/flat-page-layout-widget.type';
import { AxisNameDisplay } from 'src/engine/metadata-modules/page-layout-widget/enums/axis-name-display.enum';
import { BarChartGroupMode } from 'src/engine/metadata-modules/page-layout-widget/enums/bar-chart-group-mode.enum';
import { BarChartLayout } from 'src/engine/metadata-modules/page-layout-widget/enums/bar-chart-layout.enum';
import { ObjectRecordGroupByDateGranularity } from 'src/engine/metadata-modules/page-layout-widget/enums/date-granularity.enum';
import { GraphOrderBy } from 'src/engine/metadata-modules/page-layout-widget/enums/graph-order-by.enum';
import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';
import { WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';
import {
  type CreateStandardPageLayoutWidgetArgs,
  createStandardPageLayoutWidgetFlatMetadata,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout-widget/create-standard-page-layout-widget-flat-metadata.util';

type DashboardWidgetBuilderArgs = Omit<
  CreateStandardPageLayoutWidgetArgs,
  'context'
>;

const createLeadsOverTime = ({
  args,
}: {
  args: DashboardWidgetBuilderArgs;
}): FlatPageLayoutWidget => {
  const personFields =
    args.standardObjectMetadataRelatedEntityIds.person.fields;
  const personObjectId = args.standardObjectMetadataRelatedEntityIds.person.id;

  return createStandardPageLayoutWidgetFlatMetadata({
    ...args,
    objectMetadataUniversalIdentifier:
      STANDARD_OBJECTS.person.universalIdentifier,
    context: {
      layoutName: 'otogrowAnalyticsDashboard',
      tabTitle: 'tab1',
      widgetName: 'leadsOverTime',
      title: 'Leads over time',
      type: WidgetType.GRAPH,
      gridPosition: { row: 0, column: 0, rowSpan: 6, columnSpan: 6 },
      position: {
        layoutMode: PageLayoutTabLayoutMode.GRID,
        row: 0,
        column: 0,
        rowSpan: 6,
        columnSpan: 6,
      },
      configuration: {
        configurationType: WidgetConfigurationType.LINE_CHART,
        aggregateFieldMetadataId: personFields.id.id,
        aggregateOperation: AggregateOperations.COUNT,
        primaryAxisGroupByFieldMetadataId: personFields.createdAt.id,
        primaryAxisDateGranularity: ObjectRecordGroupByDateGranularity.WEEK,
        primaryAxisOrderBy: GraphOrderBy.FIELD_ASC,
        secondaryAxisGroupByFieldMetadataId: personFields.leadSource.id,
        secondaryAxisOrderBy: GraphOrderBy.FIELD_ASC,
        axisNameDisplay: AxisNameDisplay.NONE,
        displayDataLabel: false,
        displayLegend: true,
        color: 'blue',
        isStacked: true,
        isCumulative: false,
        timezone: 'UTC',
        firstDayOfTheWeek: CalendarStartDay.SUNDAY,
      },
      universalConfiguration: {
        configurationType: WidgetConfigurationType.LINE_CHART,
        aggregateFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.person.fields.id.universalIdentifier,
        aggregateOperation: AggregateOperations.COUNT,
        primaryAxisGroupByFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.person.fields.createdAt.universalIdentifier,
        primaryAxisDateGranularity: ObjectRecordGroupByDateGranularity.WEEK,
        primaryAxisOrderBy: GraphOrderBy.FIELD_ASC,
        secondaryAxisGroupByFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.person.fields.leadSource.universalIdentifier,
        secondaryAxisOrderBy: GraphOrderBy.FIELD_ASC,
        axisNameDisplay: AxisNameDisplay.NONE,
        displayDataLabel: false,
        displayLegend: true,
        color: 'blue',
        isStacked: true,
        isCumulative: false,
        timezone: 'UTC',
        firstDayOfTheWeek: CalendarStartDay.SUNDAY,
      },
      objectMetadataId: personObjectId,
      conditionalDisplay: null,
      conditionalAvailabilityExpression: null,
    },
  });
};

const createSequencePerformance = ({
  args,
}: {
  args: DashboardWidgetBuilderArgs;
}): FlatPageLayoutWidget => {
  const sequenceEnrollmentFields =
    args.standardObjectMetadataRelatedEntityIds.sequenceEnrollment.fields;
  const sequenceEnrollmentObjectId =
    args.standardObjectMetadataRelatedEntityIds.sequenceEnrollment.id;

  return createStandardPageLayoutWidgetFlatMetadata({
    ...args,
    objectMetadataUniversalIdentifier:
      STANDARD_OBJECTS.sequenceEnrollment.universalIdentifier,
    context: {
      layoutName: 'otogrowAnalyticsDashboard',
      tabTitle: 'tab1',
      widgetName: 'sequencePerformance',
      title: 'Sequence performance',
      type: WidgetType.GRAPH,
      gridPosition: { row: 0, column: 6, rowSpan: 6, columnSpan: 6 },
      position: {
        layoutMode: PageLayoutTabLayoutMode.GRID,
        row: 0,
        column: 6,
        rowSpan: 6,
        columnSpan: 6,
      },
      configuration: {
        configurationType: WidgetConfigurationType.BAR_CHART,
        aggregateFieldMetadataId: sequenceEnrollmentFields.id.id,
        aggregateOperation: AggregateOperations.COUNT,
        primaryAxisGroupByFieldMetadataId: sequenceEnrollmentFields.sequence.id,
        primaryAxisGroupBySubFieldName: 'name',
        primaryAxisOrderBy: GraphOrderBy.FIELD_ASC,
        secondaryAxisGroupByFieldMetadataId: sequenceEnrollmentFields.status.id,
        secondaryAxisOrderBy: GraphOrderBy.FIELD_ASC,
        axisNameDisplay: AxisNameDisplay.NONE,
        displayDataLabel: false,
        displayLegend: true,
        color: 'purple',
        layout: BarChartLayout.VERTICAL,
        groupMode: BarChartGroupMode.STACKED,
        timezone: 'UTC',
        firstDayOfTheWeek: CalendarStartDay.SUNDAY,
      },
      universalConfiguration: {
        configurationType: WidgetConfigurationType.BAR_CHART,
        aggregateFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.sequenceEnrollment.fields.id.universalIdentifier,
        aggregateOperation: AggregateOperations.COUNT,
        primaryAxisGroupByFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.sequenceEnrollment.fields.sequence
            .universalIdentifier,
        primaryAxisGroupBySubFieldName: 'name',
        primaryAxisOrderBy: GraphOrderBy.FIELD_ASC,
        secondaryAxisGroupByFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.sequenceEnrollment.fields.status.universalIdentifier,
        secondaryAxisOrderBy: GraphOrderBy.FIELD_ASC,
        axisNameDisplay: AxisNameDisplay.NONE,
        displayDataLabel: false,
        displayLegend: true,
        color: 'purple',
        layout: BarChartLayout.VERTICAL,
        groupMode: BarChartGroupMode.STACKED,
        timezone: 'UTC',
        firstDayOfTheWeek: CalendarStartDay.SUNDAY,
      },
      objectMetadataId: sequenceEnrollmentObjectId,
      conditionalDisplay: null,
      conditionalAvailabilityExpression: null,
    },
  });
};

const createLeadScoreDistribution = ({
  args,
}: {
  args: DashboardWidgetBuilderArgs;
}): FlatPageLayoutWidget => {
  const personFields =
    args.standardObjectMetadataRelatedEntityIds.person.fields;
  const personObjectId = args.standardObjectMetadataRelatedEntityIds.person.id;

  return createStandardPageLayoutWidgetFlatMetadata({
    ...args,
    objectMetadataUniversalIdentifier:
      STANDARD_OBJECTS.person.universalIdentifier,
    context: {
      layoutName: 'otogrowAnalyticsDashboard',
      tabTitle: 'tab1',
      widgetName: 'leadScoreDistribution',
      title: 'Lead score distribution',
      type: WidgetType.GRAPH,
      gridPosition: { row: 6, column: 0, rowSpan: 6, columnSpan: 6 },
      position: {
        layoutMode: PageLayoutTabLayoutMode.GRID,
        row: 6,
        column: 0,
        rowSpan: 6,
        columnSpan: 6,
      },
      configuration: {
        configurationType: WidgetConfigurationType.PIE_CHART,
        groupByFieldMetadataId: personFields.leadScoreBand.id,
        aggregateFieldMetadataId: personFields.id.id,
        aggregateOperation: AggregateOperations.COUNT,
        orderBy: GraphOrderBy.FIELD_ASC,
        displayDataLabel: false,
        showCenterMetric: true,
        displayLegend: true,
        color: 'crimson',
        timezone: 'UTC',
        firstDayOfTheWeek: CalendarStartDay.SUNDAY,
      },
      universalConfiguration: {
        configurationType: WidgetConfigurationType.PIE_CHART,
        groupByFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.person.fields.leadScoreBand.universalIdentifier,
        aggregateFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.person.fields.id.universalIdentifier,
        aggregateOperation: AggregateOperations.COUNT,
        orderBy: GraphOrderBy.FIELD_ASC,
        displayDataLabel: false,
        showCenterMetric: true,
        displayLegend: true,
        color: 'crimson',
        timezone: 'UTC',
        firstDayOfTheWeek: CalendarStartDay.SUNDAY,
      },
      objectMetadataId: personObjectId,
      conditionalDisplay: null,
      conditionalAvailabilityExpression: null,
    },
  });
};

const createPipelineByStage = ({
  args,
}: {
  args: DashboardWidgetBuilderArgs;
}): FlatPageLayoutWidget => {
  const opportunityFields =
    args.standardObjectMetadataRelatedEntityIds.opportunity.fields;
  const opportunityObjectId =
    args.standardObjectMetadataRelatedEntityIds.opportunity.id;

  return createStandardPageLayoutWidgetFlatMetadata({
    ...args,
    objectMetadataUniversalIdentifier:
      STANDARD_OBJECTS.opportunity.universalIdentifier,
    context: {
      layoutName: 'otogrowAnalyticsDashboard',
      tabTitle: 'tab1',
      widgetName: 'pipelineByStage',
      title: 'Pipeline by stage',
      type: WidgetType.GRAPH,
      gridPosition: { row: 6, column: 6, rowSpan: 6, columnSpan: 6 },
      position: {
        layoutMode: PageLayoutTabLayoutMode.GRID,
        row: 6,
        column: 6,
        rowSpan: 6,
        columnSpan: 6,
      },
      configuration: {
        configurationType: WidgetConfigurationType.BAR_CHART,
        aggregateFieldMetadataId: opportunityFields.id.id,
        aggregateOperation: AggregateOperations.COUNT,
        primaryAxisGroupByFieldMetadataId: opportunityFields.stage.id,
        primaryAxisOrderBy: GraphOrderBy.FIELD_POSITION_ASC,
        axisNameDisplay: AxisNameDisplay.NONE,
        displayDataLabel: true,
        displayLegend: true,
        color: 'green',
        layout: BarChartLayout.VERTICAL,
        timezone: 'UTC',
        firstDayOfTheWeek: CalendarStartDay.SUNDAY,
      },
      universalConfiguration: {
        configurationType: WidgetConfigurationType.BAR_CHART,
        aggregateFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.opportunity.fields.id.universalIdentifier,
        aggregateOperation: AggregateOperations.COUNT,
        primaryAxisGroupByFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.opportunity.fields.stage.universalIdentifier,
        primaryAxisOrderBy: GraphOrderBy.FIELD_POSITION_ASC,
        axisNameDisplay: AxisNameDisplay.NONE,
        displayDataLabel: true,
        displayLegend: true,
        color: 'green',
        layout: BarChartLayout.VERTICAL,
        timezone: 'UTC',
        firstDayOfTheWeek: CalendarStartDay.SUNDAY,
      },
      objectMetadataId: opportunityObjectId,
      conditionalDisplay: null,
      conditionalAvailabilityExpression: null,
    },
  });
};

const createWhatsappSmsVolume = ({
  args,
}: {
  args: DashboardWidgetBuilderArgs;
}): FlatPageLayoutWidget => {
  const channelMessageFields =
    args.standardObjectMetadataRelatedEntityIds.channelMessage.fields;
  const channelMessageObjectId =
    args.standardObjectMetadataRelatedEntityIds.channelMessage.id;

  return createStandardPageLayoutWidgetFlatMetadata({
    ...args,
    objectMetadataUniversalIdentifier:
      STANDARD_OBJECTS.channelMessage.universalIdentifier,
    context: {
      layoutName: 'otogrowAnalyticsDashboard',
      tabTitle: 'tab1',
      widgetName: 'whatsappSmsVolume',
      title: 'WhatsApp & SMS volume',
      type: WidgetType.GRAPH,
      gridPosition: { row: 12, column: 0, rowSpan: 6, columnSpan: 12 },
      position: {
        layoutMode: PageLayoutTabLayoutMode.GRID,
        row: 12,
        column: 0,
        rowSpan: 6,
        columnSpan: 12,
      },
      configuration: {
        configurationType: WidgetConfigurationType.LINE_CHART,
        aggregateFieldMetadataId: channelMessageFields.id.id,
        aggregateOperation: AggregateOperations.COUNT,
        primaryAxisGroupByFieldMetadataId: channelMessageFields.createdAt.id,
        primaryAxisDateGranularity: ObjectRecordGroupByDateGranularity.DAY,
        primaryAxisOrderBy: GraphOrderBy.FIELD_ASC,
        secondaryAxisGroupByFieldMetadataId: channelMessageFields.channel.id,
        secondaryAxisOrderBy: GraphOrderBy.FIELD_ASC,
        axisNameDisplay: AxisNameDisplay.NONE,
        displayDataLabel: false,
        displayLegend: true,
        color: 'orange',
        isCumulative: false,
        timezone: 'UTC',
        firstDayOfTheWeek: CalendarStartDay.SUNDAY,
      },
      universalConfiguration: {
        configurationType: WidgetConfigurationType.LINE_CHART,
        aggregateFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.channelMessage.fields.id.universalIdentifier,
        aggregateOperation: AggregateOperations.COUNT,
        primaryAxisGroupByFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.channelMessage.fields.createdAt.universalIdentifier,
        primaryAxisDateGranularity: ObjectRecordGroupByDateGranularity.DAY,
        primaryAxisOrderBy: GraphOrderBy.FIELD_ASC,
        secondaryAxisGroupByFieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.channelMessage.fields.channel.universalIdentifier,
        secondaryAxisOrderBy: GraphOrderBy.FIELD_ASC,
        axisNameDisplay: AxisNameDisplay.NONE,
        displayDataLabel: false,
        displayLegend: true,
        color: 'orange',
        isCumulative: false,
        timezone: 'UTC',
        firstDayOfTheWeek: CalendarStartDay.SUNDAY,
      },
      objectMetadataId: channelMessageObjectId,
      conditionalDisplay: null,
      conditionalAvailabilityExpression: null,
    },
  });
};

export const computeOtogrowAnalyticsDashboardWidgets = (
  args: DashboardWidgetBuilderArgs,
): FlatPageLayoutWidget[] => {
  return [
    createLeadsOverTime({ args }),
    createSequencePerformance({ args }),
    createLeadScoreDistribution({ args }),
    createPipelineByStage({ args }),
    createWhatsappSmsVolume({ args }),
  ];
};
