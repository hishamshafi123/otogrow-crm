import { useCallback, useEffect, useMemo, useState } from 'react';
import { styled } from '@linaria/react';
import { Link, useParams } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

let latestDashboardReqId = 0;

type ClientDashboardTabKey =
  | 'overview'
  | 'ai_videos'
  | 'social'
  | 'static_ads'
  | 'paid_ads'
  | 'seo'
  | 'development'
  | 'commitments'
  | 'brand_vault';

type ClientPublicInfo = {
  exists: boolean;
  active: boolean;
  slug: string;
  displayName: string;
  welcomeNote: string;
  brandAccentColor: string | null;
};

type PortalVariation = {
  id: string;
  variationNumber: number;
  label: string;
  hookText: string;
  angleTag: string;
  outputSizeBytes: number;
  hasThumbnail: boolean;
  streamUrl: string;
  downloadUrl: string;
  thumbnailUrl: string | null;
  driveWebUrl: string | null;
  storageState: string;
  clientApprovalStatus: string;
};

type PortalReview = {
  id: string;
  variationId: string | null;
  authorName: string;
  authorType: string;
  decision: string;
  comment: string;
  timestampSec: number | null;
  createdAt: string;
};

type PortalDeliverable = {
  id: string;
  serviceKey: string;
  serviceLabel: string;
  monthKey: string;
  sequenceNumber: number;
  title: string;
  description: string;
  assetKind: string;
  mimeType: string | null;
  sizeBytes: number;
  mediaMeta: {
    width?: number;
    height?: number;
    durationSec?: number;
  };
  externalUrl: string | null;
  hasThumbnail: boolean;
  streamUrl: string | null;
  downloadUrl: string | null;
  thumbnailUrl: string | null;
  driveWebUrl: string | null;
  driveFolderWebUrl: string | null;
  storageState: string;
  status: string;
  hasVariations: boolean;
  publishedAt: string | null;
  createdAt: string;
  variations: PortalVariation[];
  reviews: PortalReview[];
};

type PortalDashboardData = {
  client: {
    slug: string;
    displayName: string;
    welcomeNote: string;
    brandAccentColor: string | null;
    showDriveLinks: boolean;
    driveRootFolderUrl: string | null;
    stakeholderName: string | null;
    activeServices: string[];
  };
  activeMonthKey: string;
  availableMonths: string[];
  tabs: Array<{
    key: ClientDashboardTabKey;
    label: string;
    badgeCount: number;
  }>;
  kpis: Array<{
    key: string;
    label: string;
    value: string;
    sublabel: string;
    tab: ClientDashboardTabKey;
  }>;
  pendingApprovalCount: number;
  aiVideos: PortalDeliverable[];
  staticDeliverables: PortalDeliverable[];
  social: {
    totals: {
      views: number;
      impressions: number;
      reach: number;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      clicks: number;
      followerDelta: number;
    };
    totalEngagements: number;
    byPlatform: Array<{
      platform: string;
      views: number;
      impressions: number;
      reach: number;
      engagements: number;
      followerDelta: number;
      entries: number;
    }>;
    snapshots: Array<{
      id: string;
      platform: string;
      postTitle: string | null;
      postUrl: string | null;
      views: number;
      impressions: number;
      reach: number;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      clicks: number;
      followerDelta: number;
      observedAt: string;
    }>;
    calendar: Array<{
      id: string;
      planTitle: string;
      platform: string;
      accountName: string;
      accountHandle: string;
      format: string;
      caption: string;
      status: string;
      plannedAt: string;
    }>;
  };
  paidAds: {
    currency: string;
    summary: {
      spend: number;
      impressions: number;
      clicks: number;
      ctr: number;
      cpc: number;
      leads: number;
      purchases: number;
      purchaseValue: number;
      roas: number;
    };
    campaigns: Array<{
      campaignName: string;
      spend: number;
      impressions: number;
      clicks: number;
      ctr: number;
      leads: number;
      purchases: number;
      purchaseValue: number;
      roas: number;
    }>;
    dailyReports: Array<{
      id: string;
      date: string;
      currency: string;
      spend: number;
      impressions: number;
      clicks: number;
      ctr: number;
      cpc: number;
      leads: number;
      purchases: number;
      purchaseValue: number;
      roas: number;
    }>;
  };
  seo: Array<{
    id: string;
    title: string;
    periodStart: string;
    periodEnd: string;
    summary: string;
    metrics: Array<{
      id: string;
      key: string;
      label: string;
      unit: string;
      value: string | null;
      unknownReason: string;
      source: string;
    }>;
    evidence: Array<{
      label: string;
      url: string;
      note: string;
    }>;
  }>;
  releases: Array<{
    id: string;
    title: string;
    status: string;
    targetDate: string;
    summary: string;
    acceptanceCriteria: string;
    checksPassedCount: number;
    checksTotalCount: number;
  }>;
  commitments: Array<{
    id: string;
    label: string;
    startDate: string;
    endDateExclusive: string | null;
    state: string;
    lines: Array<{
      id: string;
      label: string;
      unit: string;
      promisedQuantity: number;
      fulfilledQuantity: number;
      pct: number;
    }>;
  }>;
  brandVault: Array<{
    id: string;
    title: string;
    category: string;
    meetingDate: string;
    summary: string;
    publishedAt: string | null;
  }>;
};

const apiUrl = (path: string) => `${REACT_APP_SERVER_BASE_URL}${path}`;

const sanitizeHexColor = (value: string | null | undefined): string => {
  if (value && /^#[0-9a-f]{6}$/i.test(value.trim())) {
    return value.trim();
  }
  return themeCssVariables.color.blue;
};

const toSafeHttpUrl = (raw?: string | null): string | null => {
  if (!raw) return null;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

const formatDuration = (sec?: number | null): string => {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec < 0) {
    return '';
  }
  const mins = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${mins}:${String(rem).padStart(2, '0')}`;
};

const formatNumber = (value: number): string =>
  Math.round(value).toLocaleString('en-US');

const formatCurrency = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency || 'USD'} ${amount.toFixed(2)}`;
  }
};

const formatMonthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const formatStatusLabel = (status: string): string =>
  status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

const StyledPageShell = styled.div`
  background: ${themeCssVariables.background.primary};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-family: ${themeCssVariables.font.family};
  min-height: 100vh;
  width: 100%;
`;

const StyledGateWrapper = styled.div`
  align-items: center;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
`;

const StyledGateCard = styled.form`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 440px;
  padding: 28px;
  width: 100%;
`;

const StyledBrandMark = styled.div`
  align-items: center;
  border-radius: 10px;
  color: ${themeCssVariables.grayScale.gray1};
  display: inline-flex;
  font-size: 16px;
  font-weight: 700;
  height: 40px;
  justify-content: center;
  width: 40px;
`;

const StyledContainer = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 0 auto;
  max-width: 1280px;
  padding: 24px 20px 64px;
  width: 100%;
`;

const StyledTopBar = styled.header`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
  padding: 18px 20px;
`;

const StyledRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const StyledStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const StyledKpiGrid = styled.div`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(195px, 1fr));
`;

const StyledKpiCard = styled.button`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 12px;
  color: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  text-align: left;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
  }
`;

const StyledTabBar = styled.nav`
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-bottom: 8px;
`;

const StyledTabButton = styled.button<{ active?: boolean }>`
  align-items: center;
  background: ${({ active }) =>
    active
      ? themeCssVariables.background.tertiary
      : themeCssVariables.background.primary};
  border: 1px solid
    ${({ active }) =>
      active
        ? themeCssVariables.border.color.strong
        : themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${({ active }) =>
    active
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-size: 13px;
  font-weight: ${({ active }) => (active ? 600 : 500)};
  gap: 6px;
  padding: 7px 14px;
`;

const StyledCard = styled.section`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
`;

const StyledMediaGrid = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
`;

const StyledDeliverableCard = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const StyledThumbBox = styled.button`
  align-items: center;
  aspect-ratio: 16 / 10;
  background: ${themeCssVariables.background.tertiary};
  border: 0;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  display: flex;
  justify-content: center;
  overflow: hidden;
  padding: 0;
  position: relative;
  width: 100%;

  img {
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
`;

const StyledBadge = styled.span<{ tone?: 'neutral' | 'success' | 'warning' }>`
  background: ${({ tone }) =>
    tone === 'success'
      ? themeCssVariables.color.green2
      : tone === 'warning'
        ? themeCssVariables.color.amber2
        : themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.primary};
  display: inline-flex;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
`;

const StyledButton = styled.button<{ primary?: boolean }>`
  align-items: center;
  background: ${({ primary }) =>
    primary
      ? themeCssVariables.color.blue
      : themeCssVariables.background.tertiary};
  border: 1px solid
    ${({ primary }) =>
      primary
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${({ primary }) =>
    primary
      ? themeCssVariables.grayScale.gray1
      : themeCssVariables.font.color.primary};
  cursor: pointer;
  display: inline-flex;
  font-size: 13px;
  font-weight: 600;
  gap: 6px;
  justify-content: center;
  padding: 8px 14px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

const StyledLinkButton = styled.a`
  align-items: center;
  background: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  display: inline-flex;
  font-size: 13px;
  font-weight: 600;
  gap: 6px;
  padding: 8px 14px;
  text-decoration: none;
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-size: 14px;
  padding: 10px 12px;
  width: 100%;
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  font-size: 13px;
  padding: 8px 12px;
`;

const StyledTextarea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: 13px;
  min-height: 76px;
  padding: 10px 12px;
  resize: vertical;
  width: 100%;
`;

const StyledTableScroll = styled.div`
  overflow-x: auto;
  width: 100%;
`;

const StyledTable = styled.table`
  border-collapse: collapse;
  font-size: 13px;
  min-width: 560px;
  width: 100%;

  th,
  td {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    padding: 10px 8px;
    text-align: left;
  }

  th {
    color: ${themeCssVariables.font.color.tertiary};
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }
`;

const StyledModalBackdrop = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.overlayPrimary};
  box-sizing: border-box;
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 20px;
  position: fixed;
  z-index: 200;
`;

const StyledModalDialog = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 16px;
  box-sizing: border-box;
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 1fr);
  max-height: 92vh;
  max-width: 1120px;
  overflow-y: auto;
  padding: 22px;
  width: 100%;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const StyledVideoPlayer = styled.video`
  background: ${themeCssVariables.grayScale.gray12};
  border-radius: 12px;
  max-height: 62vh;
  width: 100%;
`;

const StyledErrorBanner = styled.div`
  background: ${themeCssVariables.color.red2};
  border: 1px solid ${themeCssVariables.color.red6};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  font-size: 13px;
  padding: 10px 12px;
`;

const StyledSuccessBanner = styled.div`
  background: ${themeCssVariables.color.green2};
  border: 1px solid ${themeCssVariables.color.green6};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  font-size: 13px;
  padding: 10px 12px;
`;

const StyledProgressTrack = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: 999px;
  height: 8px;
  overflow: hidden;
  width: 100%;
`;

export const ClientDashboardPortalPage = () => {
  const { slug: routeSlug } = useParams<{ slug?: string }>();
  const normalizedRouteSlug = routeSlug?.trim().toLowerCase() || '';

  const [publicInfo, setPublicInfo] = useState<ClientPublicInfo | null>(null);
  const [dashboard, setDashboard] = useState<PortalDashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingMonth, setLoadingMonth] = useState(false);

  const [accessCode, setAccessCode] = useState('');
  const [stakeholderName, setStakeholderName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [submittingAuth, setSubmittingAuth] = useState(false);

  const [activeTab, setActiveTab] = useState<ClientDashboardTabKey>('overview');
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<
    string | null
  >(null);
  const [selectedVariationId, setSelectedVariationId] = useState<string | null>(
    null,
  );
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [currentVideoTimeSec, setCurrentVideoTimeSec] = useState(0);
  const [pendingSeekSec, setPendingSeekSec] = useState<number | null>(null);

  const [reviewAuthor, setReviewAuthor] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [pinnedTimestampSec, setPinnedTimestampSec] = useState<number | null>(
    null,
  );
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewBanner, setReviewBanner] = useState<{
    tone: 'error' | 'success';
    text: string;
  } | null>(null);

  const loadDashboard = useCallback(
    async (monthKey?: string, isInitial = false) => {
      const reqId = ++latestDashboardReqId;
      if (isInitial) {
        setLoadingSession(true);
      } else {
        setLoadingMonth(true);
      }
      setDashboardError(null);
      try {
        const qs = monthKey ? `?monthKey=${encodeURIComponent(monthKey)}` : '';
        const res = await fetch(apiUrl(`/portal/client/dashboard${qs}`), {
          credentials: 'include',
        });
        if (reqId !== latestDashboardReqId) {
          return false;
        }
        if (!res.ok) {
          if (res.status === 401) {
            setDashboard(null);
            setSelectedDeliverableId(null);
            setSelectedVariationId(null);
          } else if (!isInitial) {
            setDashboardError(
              'Unable to refresh dashboard data right now. Please try again.',
            );
          }
          return false;
        }
        const data = (await res.json()) as PortalDashboardData;
        if (reqId !== latestDashboardReqId) {
          return false;
        }
        // If user opened a specific /client/:slug link that differs from their cookie slug, require re-auth for that slug
        if (
          normalizedRouteSlug &&
          data.client.slug.toLowerCase() !== normalizedRouteSlug
        ) {
          setDashboard(null);
          return false;
        }
        setDashboard(data);
        if (data.client.stakeholderName) {
          setReviewAuthor((prev) => prev || data.client.stakeholderName || '');
        }
        return true;
      } catch {
        if (reqId === latestDashboardReqId && !isInitial) {
          setDashboardError(
            'Network error while loading dashboard. Please check your connection.',
          );
        }
        return false;
      } finally {
        if (reqId === latestDashboardReqId) {
          setLoadingSession(false);
          setLoadingMonth(false);
        }
      }
    },
    [normalizedRouteSlug],
  );

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      if (normalizedRouteSlug) {
        try {
          const infoRes = await fetch(
            apiUrl(
              `/portal/client/${encodeURIComponent(normalizedRouteSlug)}/info`,
            ),
            { credentials: 'include' },
          );
          if (infoRes.ok && !cancelled) {
            setPublicInfo((await infoRes.json()) as ClientPublicInfo);
          }
        } catch {
          // ignore
        }
      } else {
        setPublicInfo(null);
      }
      if (!cancelled) {
        await loadDashboard(undefined, true);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [normalizedRouteSlug, loadDashboard]);

  // White-labeled browser tab title
  useEffect(() => {
    const label =
      dashboard?.client.displayName ||
      (publicInfo?.exists ? publicInfo.displayName : null);
    document.title = label ? `${label} — Client Portal` : 'Client Portal';
  }, [dashboard, publicInfo]);

  // Close review modal on Escape key
  useEffect(() => {
    if (!selectedDeliverableId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedDeliverableId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedDeliverableId]);

  // Keep activeTab valid when tabs change
  useEffect(() => {
    if (!dashboard) return;
    if (!dashboard.tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab('overview');
    }
  }, [dashboard, activeTab]);

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) {
      setAuthError('Enter your client access code.');
      return;
    }
    setAuthError(null);
    setSubmittingAuth(true);
    try {
      const res = await fetch(apiUrl('/portal/client/authenticate'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(normalizedRouteSlug ? { slug: normalizedRouteSlug } : {}),
          accessCode: accessCode.trim(),
          ...(stakeholderName.trim()
            ? { stakeholderName: stakeholderName.trim() }
            : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        message?: string;
        slug?: string;
      };
      if (!res.ok) {
        setAuthError(json.message ?? 'Invalid or expired access code.');
        return;
      }
      if (stakeholderName.trim()) {
        setReviewAuthor(stakeholderName.trim());
      }
      setAccessCode('');
      await loadDashboard(undefined, false);
    } catch {
      setAuthError('Could not connect to server. Please try again.');
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleSignOut = async () => {
    await fetch(apiUrl('/portal/client/logout'), {
      method: 'POST',
      credentials: 'include',
    }).catch(() => undefined);
    setDashboard(null);
    setDashboardError(null);
    setSelectedDeliverableId(null);
    setSelectedVariationId(null);
    setReviewAuthor('');
    setStakeholderName('');
    setReviewComment('');
    setPinnedTimestampSec(null);
    setReviewBanner(null);
    setActiveTab('overview');
  };

  const allDeliverables = useMemo(() => {
    if (!dashboard) return [];
    return [...dashboard.aiVideos, ...dashboard.staticDeliverables];
  }, [dashboard]);

  const selectedDeliverable = useMemo(
    () =>
      selectedDeliverableId
        ? allDeliverables.find((d) => d.id === selectedDeliverableId) ?? null
        : null,
    [allDeliverables, selectedDeliverableId],
  );

  const selectedVariation = useMemo(() => {
    if (!selectedDeliverable || !selectedVariationId) return null;
    return (
      selectedDeliverable.variations.find(
        (v) => v.id === selectedVariationId,
      ) ?? null
    );
  }, [selectedDeliverable, selectedVariationId]);

  const selectVariation = (variationId: string | null) => {
    setSelectedVariationId(variationId);
    setPinnedTimestampSec(null);
    setReviewBanner(null);
    setCurrentVideoTimeSec(0);
  };

  const openDeliverableModal = (item: PortalDeliverable) => {
    setSelectedDeliverableId(item.id);
    setSelectedVariationId(
      item.variations.length > 0 ? item.variations[0].id : null,
    );
    setReviewComment('');
    setPinnedTimestampSec(null);
    setReviewBanner(null);
    setCurrentVideoTimeSec(0);
    setPendingSeekSec(null);
  };

  const handleSubmitReview = async (
    decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENT',
  ) => {
    if (!selectedDeliverable) return;
    if (
      (decision === 'CHANGES_REQUESTED' || decision === 'COMMENT') &&
      !reviewComment.trim()
    ) {
      setReviewBanner({
        tone: 'error',
        text: 'Add a short note explaining the requested change or comment.',
      });
      return;
    }
    setSubmittingReview(true);
    setReviewBanner(null);
    try {
      const res = await fetch(
        apiUrl(`/portal/client/deliverables/${selectedDeliverable.id}/review`),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision,
            comment: reviewComment.trim(),
            ...(reviewAuthor.trim() ? { authorName: reviewAuthor.trim() } : {}),
            ...(selectedVariation ? { variationId: selectedVariation.id } : {}),
            ...(pinnedTimestampSec !== null
              ? { timestampSec: pinnedTimestampSec }
              : {}),
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      if (res.status === 401) {
        setDashboard(null);
        setSelectedDeliverableId(null);
        setSelectedVariationId(null);
        setAuthError(
          json.message ?? 'Your session expired. Please sign in again.',
        );
        return;
      }
      if (!res.ok) {
        setReviewBanner({
          tone: 'error',
          text: json.message ?? 'Could not submit feedback.',
        });
        return;
      }
      setReviewComment('');
      setPinnedTimestampSec(null);
      setReviewBanner({
        tone: 'success',
        text:
          decision === 'APPROVED'
            ? 'Approved! Our delivery team has been notified.'
            : decision === 'CHANGES_REQUESTED'
              ? 'Change request recorded. Our team will revise promptly.'
              : 'Comment posted.',
      });
      await loadDashboard(dashboard?.activeMonthKey, false);
    } catch {
      setReviewBanner({
        tone: 'error',
        text: 'Network error while submitting feedback.',
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const accentColor = sanitizeHexColor(
    dashboard?.client.brandAccentColor ?? publicInfo?.brandAccentColor,
  );

  // Loading state
  if (loadingSession) {
    return (
      <StyledPageShell>
        <StyledGateWrapper>
          <div style={{ fontSize: 14, opacity: 0.75 }}>
            Loading Client Dashboard…
          </div>
        </StyledGateWrapper>
      </StyledPageShell>
    );
  }

  // Access-code Gate Screen
  if (!dashboard) {
    const title = publicInfo?.exists
      ? publicInfo.displayName
      : 'Client Dashboard';
    const isMissingOrInactiveSlug = Boolean(
      normalizedRouteSlug && publicInfo && !publicInfo.exists,
    );

    return (
      <StyledPageShell>
        <StyledGateWrapper>
          <StyledGateCard onSubmit={(e) => void handleAuthenticate(e)}>
            <StyledRow>
              <StyledBrandMark style={{ background: accentColor }}>
                {title.charAt(0).toUpperCase()}
              </StyledBrandMark>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Dedicated Client Portal
                </div>
              </div>
            </StyledRow>

            {publicInfo?.welcomeNote && (
              <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>
                {publicInfo.welcomeNote}
              </div>
            )}

            {isMissingOrInactiveSlug ? (
              <StyledStack>
                <StyledErrorBanner>
                  This client portal link is unavailable, expired, or inactive.
                  Check the link with your account manager or sign in directly
                  with your access code.
                </StyledErrorBanner>
                <Link
                  to="/client"
                  style={{
                    color: accentColor,
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Enter access code without a link →
                </Link>
              </StyledStack>
            ) : (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    Client Access Code
                  </span>
                  <StyledInput
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    placeholder="e.g. ABCD-EFGH-2345"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    Your Name (optional — used for approvals & feedback)
                  </span>
                  <StyledInput
                    type="text"
                    value={stakeholderName}
                    onChange={(e) => setStakeholderName(e.target.value)}
                    placeholder="e.g. Sarah Ahmed"
                  />
                </label>

                {authError && <StyledErrorBanner>{authError}</StyledErrorBanner>}

                <StyledButton
                  type="submit"
                  primary
                  disabled={submittingAuth}
                  style={{
                    background: accentColor,
                    borderColor: accentColor,
                  }}
                >
                  {submittingAuth ? 'Verifying…' : 'Open Client Dashboard'}
                </StyledButton>
              </>
            )}
          </StyledGateCard>
        </StyledGateWrapper>
      </StyledPageShell>
    );
  }

  // Authenticated Dynamic Client Dashboard
  const activeVideoStreamUrl = selectedVariation
    ? apiUrl(selectedVariation.streamUrl)
    : selectedDeliverable?.streamUrl
      ? apiUrl(selectedDeliverable.streamUrl)
      : null;

  const activeDownloadUrl = selectedVariation
    ? apiUrl(selectedVariation.downloadUrl)
    : selectedDeliverable?.downloadUrl
      ? apiUrl(selectedDeliverable.downloadUrl)
      : null;

  const activeDriveUrl = selectedVariation
    ? selectedVariation.driveWebUrl
    : selectedDeliverable?.driveWebUrl ?? null;

  const renderDeliverableGrid = (items: PortalDeliverable[], emptyText: string) => {
    if (items.length === 0) {
      return (
        <StyledCard>
          <div style={{ fontSize: 13, opacity: 0.72 }}>{emptyText}</div>
        </StyledCard>
      );
    }

    return (
      <StyledMediaGrid>
        {items.map((item) => {
          const thumbSrc = item.thumbnailUrl
            ? apiUrl(item.thumbnailUrl)
            : item.assetKind === 'IMAGE' && item.streamUrl
              ? apiUrl(item.streamUrl)
              : null;

          return (
            <StyledDeliverableCard key={item.id}>
              <StyledThumbBox
                type="button"
                onClick={() => openDeliverableModal(item)}
              >
                {thumbSrc ? (
                  <img src={thumbSrc} alt={item.title} />
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {item.assetKind} #{item.sequenceNumber}
                  </span>
                )}
                {item.mediaMeta?.durationSec && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      right: 8,
                      background: themeCssVariables.grayScale.gray12,
                      color: themeCssVariables.grayScale.gray1,
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 6px',
                    }}
                  >
                    {formatDuration(item.mediaMeta.durationSec)}
                  </span>
                )}
              </StyledThumbBox>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 14,
                  flex: 1,
                }}
              >
                <StyledRow style={{ justifyContent: 'space-between' }}>
                  <StyledBadge
                    tone={
                      item.status === 'APPROVED'
                        ? 'success'
                        : item.status === 'CHANGES_REQUESTED'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {formatStatusLabel(item.status)}
                  </StyledBadge>
                  <span style={{ fontSize: 11, opacity: 0.65 }}>
                    #{item.sequenceNumber} • {item.serviceLabel}
                  </span>
                </StyledRow>

                <strong style={{ fontSize: 14, lineHeight: 1.35 }}>
                  {item.title}
                </strong>

                {item.description && (
                  <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>
                    {item.description.slice(0, 140)}
                  </div>
                )}

                <StyledRow style={{ marginTop: 'auto', paddingTop: 6 }}>
                  {item.variations.length > 0 && (
                    <StyledBadge>
                      {item.variations.length} Hook Variation
                      {item.variations.length === 1 ? '' : 's'}
                    </StyledBadge>
                  )}
                  {item.reviews.length > 0 && (
                    <StyledBadge>
                      {item.reviews.length} Comment
                      {item.reviews.length === 1 ? '' : 's'}
                    </StyledBadge>
                  )}
                </StyledRow>

                <StyledRow style={{ marginTop: 4 }}>
                  <StyledButton
                    type="button"
                    primary
                    style={{
                      flex: 1,
                      background: accentColor,
                      borderColor: accentColor,
                    }}
                    onClick={() => openDeliverableModal(item)}
                  >
                    {item.assetKind === 'VIDEO'
                      ? 'Watch & Review'
                      : 'Preview & Review'}
                  </StyledButton>
                  {(() => {
                    const safeDriveUrl = toSafeHttpUrl(item.driveWebUrl);
                    return safeDriveUrl ? (
                      <StyledLinkButton
                        href={safeDriveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Drive
                      </StyledLinkButton>
                    ) : null;
                  })()}
                </StyledRow>
              </div>
            </StyledDeliverableCard>
          );
        })}
      </StyledMediaGrid>
    );
  };

  const safeDriveRootFolderUrl = toSafeHttpUrl(
    dashboard.client.driveRootFolderUrl,
  );

  return (
    <StyledPageShell>
      <StyledContainer>
        {/* Top Executive Bar */}
        <StyledTopBar>
          <StyledRow>
            <StyledBrandMark style={{ background: accentColor }}>
              {dashboard.client.displayName.charAt(0).toUpperCase()}
            </StyledBrandMark>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {dashboard.client.displayName}
              </div>
              <div style={{ fontSize: 12, opacity: 0.72 }}>
                {dashboard.client.welcomeNote ||
                  'Live Deliverables, Performance & Approvals'}
              </div>
            </div>
          </StyledRow>

          <StyledRow>
            <StyledSelect
              aria-label="Select month"
              value={dashboard.activeMonthKey}
              disabled={loadingMonth}
              onChange={(e) => void loadDashboard(e.target.value, false)}
            >
              {dashboard.availableMonths.map((mk) => (
                <option key={mk} value={mk}>
                  {formatMonthLabel(mk)}
                </option>
              ))}
            </StyledSelect>

            {safeDriveRootFolderUrl && (
              <StyledLinkButton
                href={safeDriveRootFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Drive Folder
              </StyledLinkButton>
            )}

            <StyledButton type="button" onClick={() => void handleSignOut()}>
              Sign Out
            </StyledButton>
          </StyledRow>
        </StyledTopBar>

        {dashboardError && (
          <StyledErrorBanner>{dashboardError}</StyledErrorBanner>
        )}

        {/* Dynamic KPI Strip */}
        {dashboard.kpis.length > 0 && (
          <StyledKpiGrid>
            {dashboard.kpis.map((kpi) => (
              <StyledKpiCard
                key={kpi.key}
                type="button"
                onClick={() => setActiveTab(kpi.tab)}
              >
                <span style={{ fontSize: 12, opacity: 0.7 }}>{kpi.label}</span>
                <strong style={{ fontSize: 24, fontWeight: 700 }}>
                  {kpi.value}
                </strong>
                <span style={{ fontSize: 12, opacity: 0.72 }}>
                  {kpi.sublabel}
                </span>
              </StyledKpiCard>
            ))}
          </StyledKpiGrid>
        )}

        {/* Dynamic Service Tabs */}
        <StyledTabBar>
          {dashboard.tabs.map((tab) => (
            <StyledTabButton
              key={tab.key}
              type="button"
              active={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              <span>{tab.label}</span>
              {tab.badgeCount > 0 && (
                <StyledBadge>{tab.badgeCount}</StyledBadge>
              )}
            </StyledTabButton>
          ))}
        </StyledTabBar>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <StyledStack>
            {dashboard.pendingApprovalCount > 0 && (
              <StyledCard>
                <StyledRow style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>
                      {dashboard.pendingApprovalCount} deliverable
                      {dashboard.pendingApprovalCount === 1 ? '' : 's'} ready
                      for your review in{' '}
                      {formatMonthLabel(dashboard.activeMonthKey)}
                    </strong>
                    <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
                      Watch videos, switch between hook variations, and approve
                      or leave timestamped notes directly below.
                    </div>
                  </div>
                  <StyledButton
                    type="button"
                    primary
                    style={{
                      background: accentColor,
                      borderColor: accentColor,
                    }}
                    onClick={() =>
                      setActiveTab(
                        dashboard.aiVideos.length > 0
                          ? 'ai_videos'
                          : dashboard.staticDeliverables.length > 0
                            ? 'static_ads'
                            : 'overview',
                      )
                    }
                  >
                    Review Deliverables
                  </StyledButton>
                </StyledRow>
              </StyledCard>
            )}

            {dashboard.aiVideos.length > 0 && (
              <StyledStack>
                <StyledRow style={{ justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 16 }}>
                    Latest Videos & Hook Variations
                  </strong>
                  <StyledButton
                    type="button"
                    onClick={() => setActiveTab('ai_videos')}
                  >
                    View All Videos
                  </StyledButton>
                </StyledRow>
                {renderDeliverableGrid(
                  dashboard.aiVideos.slice(0, 6),
                  'No published videos for this month yet.',
                )}
              </StyledStack>
            )}

            {dashboard.staticDeliverables.length > 0 && (
              <StyledStack>
                <StyledRow style={{ justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 16 }}>
                    Latest Static Ads & Files
                  </strong>
                  <StyledButton
                    type="button"
                    onClick={() => setActiveTab('static_ads')}
                  >
                    View All Files
                  </StyledButton>
                </StyledRow>
                {renderDeliverableGrid(
                  dashboard.staticDeliverables.slice(0, 6),
                  'No published static creatives for this month yet.',
                )}
              </StyledStack>
            )}

            {dashboard.aiVideos.length === 0 &&
              dashboard.staticDeliverables.length === 0 && (
                <StyledCard>
                  <strong>
                    No deliverables published for{' '}
                    {formatMonthLabel(dashboard.activeMonthKey)} yet.
                  </strong>
                  <div style={{ fontSize: 13, opacity: 0.75 }}>
                    Use the month selector above to check previous months or
                    explore your active service tabs.
                  </div>
                </StyledCard>
              )}
          </StyledStack>
        )}

        {/* AI VIDEOS & VARIATIONS TAB */}
        {activeTab === 'ai_videos' && (
          <StyledStack>
            {renderDeliverableGrid(
              dashboard.aiVideos,
              `No videos published for ${formatMonthLabel(dashboard.activeMonthKey)} yet.`,
            )}
          </StyledStack>
        )}

        {/* SOCIAL & PERFORMANCE TAB */}
        {activeTab === 'social' && (
          <StyledStack>
            <StyledKpiGrid>
              <StyledCard>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Total Views</span>
                <strong style={{ fontSize: 22 }}>
                  {formatNumber(dashboard.social.totals.views)}
                </strong>
              </StyledCard>
              <StyledCard>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Reach</span>
                <strong style={{ fontSize: 22 }}>
                  {formatNumber(dashboard.social.totals.reach)}
                </strong>
              </StyledCard>
              <StyledCard>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Impressions</span>
                <strong style={{ fontSize: 22 }}>
                  {formatNumber(dashboard.social.totals.impressions)}
                </strong>
              </StyledCard>
              <StyledCard>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Engagements</span>
                <strong style={{ fontSize: 22 }}>
                  {formatNumber(dashboard.social.totalEngagements)}
                </strong>
              </StyledCard>
              <StyledCard>
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  Follower Growth
                </span>
                <strong style={{ fontSize: 22 }}>
                  {dashboard.social.totals.followerDelta >= 0 ? '+' : ''}
                  {formatNumber(dashboard.social.totals.followerDelta)}
                </strong>
              </StyledCard>
            </StyledKpiGrid>

            {dashboard.social.byPlatform.length > 0 && (
              <StyledCard>
                <strong>Performance by Platform</strong>
                <StyledTableScroll>
                  <StyledTable>
                    <thead>
                      <tr>
                        <th>Platform</th>
                        <th>Views</th>
                        <th>Reach</th>
                        <th>Impressions</th>
                        <th>Engagements</th>
                        <th>Follower Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.social.byPlatform.map((row) => (
                        <tr key={row.platform}>
                          <td>
                            <strong>{row.platform}</strong>
                          </td>
                          <td>{formatNumber(row.views)}</td>
                          <td>{formatNumber(row.reach)}</td>
                          <td>{formatNumber(row.impressions)}</td>
                          <td>{formatNumber(row.engagements)}</td>
                          <td>
                            {row.followerDelta >= 0 ? '+' : ''}
                            {formatNumber(row.followerDelta)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </StyledTable>
                </StyledTableScroll>
              </StyledCard>
            )}

            {dashboard.social.snapshots.length > 0 && (
              <StyledCard>
                <strong>Post & Channel Performance Log</strong>
                <StyledTableScroll>
                  <StyledTable>
                    <thead>
                      <tr>
                        <th>Platform</th>
                        <th>Post / Campaign</th>
                        <th>Views</th>
                        <th>Reach</th>
                        <th>Likes</th>
                        <th>Comments</th>
                        <th>Shares</th>
                        <th>Saves</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.social.snapshots.map((snap) => {
                        const safePostUrl = toSafeHttpUrl(snap.postUrl);
                        return (
                          <tr key={snap.id}>
                            <td>{snap.platform}</td>
                            <td>
                              {safePostUrl ? (
                                <a
                                  href={safePostUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {snap.postTitle || safePostUrl}
                                </a>
                              ) : (
                                snap.postTitle || 'Monthly Summary'
                              )}
                            </td>
                            <td>{formatNumber(snap.views)}</td>
                            <td>{formatNumber(snap.reach)}</td>
                            <td>{formatNumber(snap.likes)}</td>
                            <td>{formatNumber(snap.comments)}</td>
                            <td>{formatNumber(snap.shares)}</td>
                            <td>{formatNumber(snap.saves)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </StyledTable>
                </StyledTableScroll>
              </StyledCard>
            )}

            <StyledCard>
              <strong>
                Content Calendar ({formatMonthLabel(dashboard.activeMonthKey)})
              </strong>
              {dashboard.social.calendar.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.72 }}>
                  No scheduled or published social posts recorded for this month
                  yet.
                </div>
              ) : (
                <StyledMediaGrid>
                  {dashboard.social.calendar.map((post) => (
                    <StyledDeliverableCard
                      key={post.id}
                      style={{ padding: 14, gap: 8 }}
                    >
                      <StyledRow style={{ justifyContent: 'space-between' }}>
                        <StyledBadge>{post.platform}</StyledBadge>
                        <StyledBadge
                          tone={
                            post.status === 'PUBLISHED' ? 'success' : 'neutral'
                          }
                        >
                          {formatStatusLabel(post.status)}
                        </StyledBadge>
                      </StyledRow>
                      <strong style={{ fontSize: 14 }}>{post.planTitle}</strong>
                      <div style={{ fontSize: 11, opacity: 0.65 }}>
                        {new Date(post.plannedAt).toLocaleDateString()} •{' '}
                        {post.format}
                        {post.accountHandle ? ` • ${post.accountHandle}` : ''}
                      </div>
                      {post.caption && (
                        <div
                          style={{
                            fontSize: 12,
                            lineHeight: 1.45,
                            opacity: 0.85,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {post.caption.slice(0, 260)}
                        </div>
                      )}
                    </StyledDeliverableCard>
                  ))}
                </StyledMediaGrid>
              )}
            </StyledCard>
          </StyledStack>
        )}

        {/* STATIC ADS & FILES TAB */}
        {activeTab === 'static_ads' && (
          <StyledStack>
            {renderDeliverableGrid(
              dashboard.staticDeliverables,
              `No static creatives or files published for ${formatMonthLabel(dashboard.activeMonthKey)} yet.`,
            )}
          </StyledStack>
        )}

        {/* PAID ADS (CLIENT-SAFE META METRICS) TAB */}
        {activeTab === 'paid_ads' && (
          <StyledStack>
            <StyledKpiGrid>
              <StyledCard>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Ad Spend</span>
                <strong style={{ fontSize: 22 }}>
                  {formatCurrency(
                    dashboard.paidAds.summary.spend,
                    dashboard.paidAds.currency,
                  )}
                </strong>
              </StyledCard>
              <StyledCard>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Impressions</span>
                <strong style={{ fontSize: 22 }}>
                  {formatNumber(dashboard.paidAds.summary.impressions)}
                </strong>
              </StyledCard>
              <StyledCard>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Clicks & CTR</span>
                <strong style={{ fontSize: 22 }}>
                  {formatNumber(dashboard.paidAds.summary.clicks)}
                </strong>
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  {dashboard.paidAds.summary.ctr}% CTR •{' '}
                  {formatCurrency(
                    dashboard.paidAds.summary.cpc,
                    dashboard.paidAds.currency,
                  )}{' '}
                  CPC
                </span>
              </StyledCard>
              <StyledCard>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Leads</span>
                <strong style={{ fontSize: 22 }}>
                  {formatNumber(dashboard.paidAds.summary.leads)}
                </strong>
              </StyledCard>
              <StyledCard>
                <span style={{ fontSize: 12, opacity: 0.7 }}>ROAS</span>
                <strong style={{ fontSize: 22 }}>
                  {dashboard.paidAds.summary.roas}x
                </strong>
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  {formatCurrency(
                    dashboard.paidAds.summary.purchaseValue,
                    dashboard.paidAds.currency,
                  )}{' '}
                  attributed
                </span>
              </StyledCard>
            </StyledKpiGrid>

            {dashboard.paidAds.campaigns.length > 0 && (
              <StyledCard>
                <strong>Campaign Breakdown</strong>
                <StyledTableScroll>
                  <StyledTable>
                    <thead>
                      <tr>
                        <th>Campaign</th>
                        <th>Spend</th>
                        <th>Impressions</th>
                        <th>Clicks</th>
                        <th>CTR</th>
                        <th>Leads</th>
                        <th>ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.paidAds.campaigns.map((c) => (
                        <tr key={c.campaignName}>
                          <td>
                            <strong>{c.campaignName}</strong>
                          </td>
                          <td>
                            {formatCurrency(
                              c.spend,
                              dashboard.paidAds.currency,
                            )}
                          </td>
                          <td>{formatNumber(c.impressions)}</td>
                          <td>{formatNumber(c.clicks)}</td>
                          <td>{c.ctr}%</td>
                          <td>{formatNumber(c.leads)}</td>
                          <td>{c.roas}x</td>
                        </tr>
                      ))}
                    </tbody>
                  </StyledTable>
                </StyledTableScroll>
              </StyledCard>
            )}

            <StyledCard>
              <strong>Approved Daily Performance Reports</strong>
              {dashboard.paidAds.dailyReports.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.72 }}>
                  No approved ad performance reports for{' '}
                  {formatMonthLabel(dashboard.activeMonthKey)} yet.
                </div>
              ) : (
                <StyledTableScroll>
                  <StyledTable>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Spend</th>
                        <th>Impressions</th>
                        <th>Clicks</th>
                        <th>CTR</th>
                        <th>Leads</th>
                        <th>Purchases</th>
                        <th>ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.paidAds.dailyReports.map((row) => (
                        <tr key={row.id}>
                          <td>{row.date}</td>
                          <td>{formatCurrency(row.spend, row.currency)}</td>
                          <td>{formatNumber(row.impressions)}</td>
                          <td>{formatNumber(row.clicks)}</td>
                          <td>{row.ctr}%</td>
                          <td>{formatNumber(row.leads)}</td>
                          <td>{formatNumber(row.purchases)}</td>
                          <td>{row.roas}x</td>
                        </tr>
                      ))}
                    </tbody>
                  </StyledTable>
                </StyledTableScroll>
              )}
            </StyledCard>
          </StyledStack>
        )}

        {/* SEO RESULTS TAB */}
        {activeTab === 'seo' && (
          <StyledStack>
            {dashboard.seo.length === 0 ? (
              <StyledCard>
                <div style={{ fontSize: 13, opacity: 0.72 }}>
                  No approved SEO reports published yet.
                </div>
              </StyledCard>
            ) : (
              dashboard.seo.map((report) => (
                <StyledCard key={report.id}>
                  <StyledRow style={{ justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 16 }}>{report.title}</strong>
                    <StyledBadge>
                      {report.periodStart} → {report.periodEnd}
                    </StyledBadge>
                  </StyledRow>
                  {report.summary && (
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.55,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {report.summary}
                    </div>
                  )}
                  {report.metrics.length > 0 && (
                    <StyledKpiGrid>
                      {report.metrics.map((metric) => (
                        <StyledDeliverableCard
                          key={metric.id}
                          style={{ padding: 12, gap: 4 }}
                        >
                          <span style={{ fontSize: 11, opacity: 0.7 }}>
                            {metric.label}
                          </span>
                          <strong style={{ fontSize: 18 }}>
                            {metric.value !== null
                              ? `${metric.value}${metric.unit === 'PERCENT' ? '%' : ''}`
                              : 'N/A'}
                          </strong>
                          {metric.unknownReason && (
                            <span style={{ fontSize: 11, opacity: 0.65 }}>
                              {metric.unknownReason}
                            </span>
                          )}
                        </StyledDeliverableCard>
                      ))}
                    </StyledKpiGrid>
                  )}
                  {report.evidence.length > 0 && (
                    <StyledRow>
                      {report.evidence.map((ev, idx) => {
                        const safeEvUrl = toSafeHttpUrl(ev.url);
                        if (!safeEvUrl) return null;
                        return (
                          <StyledLinkButton
                            key={`${safeEvUrl}-${idx}`}
                            href={safeEvUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {ev.label}
                          </StyledLinkButton>
                        );
                      })}
                    </StyledRow>
                  )}
                </StyledCard>
              ))
            )}
          </StyledStack>
        )}

        {/* WEB / SAAS / APP RELEASES TAB */}
        {activeTab === 'development' && (
          <StyledStack>
            {dashboard.releases.length === 0 ? (
              <StyledCard>
                <div style={{ fontSize: 13, opacity: 0.72 }}>
                  No approved or deployed releases yet.
                </div>
              </StyledCard>
            ) : (
              dashboard.releases.map((rel) => (
                <StyledCard key={rel.id}>
                  <StyledRow style={{ justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 16 }}>{rel.title}</strong>
                    <StyledRow>
                      <StyledBadge
                        tone={
                          ['DEPLOYED', 'HANDED_OVER', 'ACCEPTED'].includes(
                            rel.status,
                          )
                            ? 'success'
                            : 'neutral'
                        }
                      >
                        {formatStatusLabel(rel.status)}
                      </StyledBadge>
                      <StyledBadge>Target: {rel.targetDate}</StyledBadge>
                      {rel.checksTotalCount > 0 && (
                        <StyledBadge>
                          QA Checks: {rel.checksPassedCount}/
                          {rel.checksTotalCount}
                        </StyledBadge>
                      )}
                    </StyledRow>
                  </StyledRow>
                  {rel.summary && (
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.55,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {rel.summary}
                    </div>
                  )}
                  {rel.acceptanceCriteria && (
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      <strong>Acceptance Criteria:</strong>{' '}
                      {rel.acceptanceCriteria}
                    </div>
                  )}
                </StyledCard>
              ))
            )}
          </StyledStack>
        )}

        {/* COMMITMENTS / DELIVERABLES PLAN TAB */}
        {activeTab === 'commitments' && (
          <StyledStack>
            {dashboard.commitments.length === 0 ? (
              <StyledCard>
                <div style={{ fontSize: 13, opacity: 0.72 }}>
                  No active deliverable plans yet.
                </div>
              </StyledCard>
            ) : (
              dashboard.commitments.map((period) => (
                <StyledCard key={period.id}>
                  <StyledRow style={{ justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 16 }}>{period.label}</strong>
                    <StyledBadge>
                      {period.startDate}
                      {period.endDateExclusive
                        ? ` → ${period.endDateExclusive}`
                        : ''}
                    </StyledBadge>
                  </StyledRow>
                  <StyledStack>
                    {period.lines.map((line) => (
                      <div
                        key={line.id}
                        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                      >
                        <StyledRow style={{ justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>
                            {line.label}
                          </span>
                          <span style={{ fontSize: 12, opacity: 0.75 }}>
                            {line.fulfilledQuantity} / {line.promisedQuantity}{' '}
                            ({line.pct}%)
                          </span>
                        </StyledRow>
                        <StyledProgressTrack>
                          <div
                            style={{
                              width: `${line.pct}%`,
                              height: '100%',
                              background: accentColor,
                            }}
                          />
                        </StyledProgressTrack>
                      </div>
                    ))}
                  </StyledStack>
                </StyledCard>
              ))
            )}
          </StyledStack>
        )}

        {/* BRAND VAULT TAB */}
        {activeTab === 'brand_vault' && (
          <StyledStack>
            {dashboard.brandVault.length === 0 ? (
              <StyledCard>
                <div style={{ fontSize: 13, opacity: 0.72 }}>
                  No published brand documents yet.
                </div>
              </StyledCard>
            ) : (
              dashboard.brandVault.map((doc) => (
                <StyledCard key={doc.id}>
                  <StyledRow style={{ justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 16 }}>{doc.title}</strong>
                    <StyledBadge>{doc.category}</StyledBadge>
                  </StyledRow>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {doc.summary}
                  </div>
                </StyledCard>
              ))
            )}
          </StyledStack>
        )}
      </StyledContainer>

      {/* THEATER PREVIEW & CLIENT REVIEW MODAL */}
      {selectedDeliverable && (
        <StyledModalBackdrop
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedDeliverableId(null);
            }
          }}
        >
          <StyledModalDialog
            role="dialog"
            aria-modal="true"
            aria-label={selectedDeliverable.title}
          >
            {/* Left: Media Player / Preview + Variation Switcher */}
            <StyledStack>
              <StyledRow style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong style={{ fontSize: 17 }}>
                    #{selectedDeliverable.sequenceNumber} —{' '}
                    {selectedDeliverable.title}
                  </strong>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                    {selectedDeliverable.serviceLabel} •{' '}
                    {formatMonthLabel(selectedDeliverable.monthKey)}
                  </div>
                </div>
                <StyledButton
                  type="button"
                  onClick={() => setSelectedDeliverableId(null)}
                >
                  Close
                </StyledButton>
              </StyledRow>

              {/* Variation Switcher Pills */}
              {selectedDeliverable.variations.length > 0 && (
                <StyledRow>
                  {selectedDeliverable.streamUrl && (
                    <StyledTabButton
                      type="button"
                      active={selectedVariationId === null}
                      onClick={() => selectVariation(null)}
                    >
                      Original
                    </StyledTabButton>
                  )}
                  {selectedDeliverable.variations.map((v) => (
                    <StyledTabButton
                      key={v.id}
                      type="button"
                      active={selectedVariationId === v.id}
                      onClick={() => selectVariation(v.id)}
                    >
                      {v.label}
                      {v.clientApprovalStatus !== 'PENDING' && (
                        <StyledBadge
                          tone={
                            v.clientApprovalStatus === 'APPROVED'
                              ? 'success'
                              : 'warning'
                          }
                        >
                          {formatStatusLabel(v.clientApprovalStatus)}
                        </StyledBadge>
                      )}
                    </StyledTabButton>
                  ))}
                </StyledRow>
              )}

              {selectedVariation && (
                <div
                  style={{
                    background: themeCssVariables.background.primary,
                    border: `1px solid ${themeCssVariables.border.color.light}`,
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontSize: 13,
                  }}
                >
                  <strong>Hook {selectedVariation.label}:</strong> “
                  {selectedVariation.hookText}”
                  {selectedVariation.angleTag && (
                    <span style={{ marginLeft: 8, opacity: 0.7 }}>
                      ({selectedVariation.angleTag})
                    </span>
                  )}
                </div>
              )}

              {/* Media Renderer */}
              {(() => {
                const safeExternalUrl = toSafeHttpUrl(
                  selectedDeliverable.externalUrl,
                );
                const isInlinePdf =
                  (selectedDeliverable.assetKind === 'DOCUMENT' ||
                    selectedDeliverable.assetKind === 'PDF') &&
                  (selectedDeliverable.mimeType === 'application/pdf' ||
                    !selectedDeliverable.mimeType);

                if (
                  selectedDeliverable.assetKind === 'VIDEO' &&
                  activeVideoStreamUrl
                ) {
                  return (
                    <StyledVideoPlayer
                      key={activeVideoStreamUrl}
                      ref={setVideoEl}
                      src={activeVideoStreamUrl}
                      controls
                      playsInline
                      onTimeUpdate={(e) =>
                        setCurrentVideoTimeSec(e.currentTarget.currentTime || 0)
                      }
                      onLoadedMetadata={(e) => {
                        if (pendingSeekSec !== null) {
                          e.currentTarget.currentTime = pendingSeekSec;
                          setPendingSeekSec(null);
                          void e.currentTarget.play().catch(() => undefined);
                        }
                      }}
                    />
                  );
                }

                if (
                  selectedDeliverable.assetKind === 'IMAGE' &&
                  selectedDeliverable.streamUrl
                ) {
                  return (
                    <img
                      src={apiUrl(selectedDeliverable.streamUrl)}
                      alt={selectedDeliverable.title}
                      style={{
                        borderRadius: 12,
                        maxHeight: '62vh',
                        objectFit: 'contain',
                        width: '100%',
                      }}
                    />
                  );
                }

                if (isInlinePdf && selectedDeliverable.streamUrl) {
                  return (
                    <iframe
                      title={selectedDeliverable.title}
                      src={apiUrl(selectedDeliverable.streamUrl)}
                      style={{
                        border: `1px solid ${themeCssVariables.border.color.medium}`,
                        borderRadius: 12,
                        height: '60vh',
                        width: '100%',
                      }}
                    />
                  );
                }

                if (safeExternalUrl) {
                  return (
                    <StyledCard>
                      <div style={{ fontSize: 13 }}>
                        External Deliverable Link:
                      </div>
                      <StyledLinkButton
                        href={safeExternalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open {safeExternalUrl}
                      </StyledLinkButton>
                    </StyledCard>
                  );
                }

                return (
                  <StyledCard>
                    <div style={{ fontSize: 13, opacity: 0.72 }}>
                      Preview unavailable — use the Drive or download link below.
                    </div>
                  </StyledCard>
                );
              })()}

              {(() => {
                const safeActiveDriveUrl = toSafeHttpUrl(activeDriveUrl);
                const safeFolderUrl = toSafeHttpUrl(
                  selectedDeliverable.driveFolderWebUrl,
                );
                return (
                  <StyledRow>
                    {activeDownloadUrl && (
                      <StyledLinkButton href={activeDownloadUrl} download>
                        Download Original Quality
                      </StyledLinkButton>
                    )}
                    {safeActiveDriveUrl && (
                      <StyledLinkButton
                        href={safeActiveDriveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open in Google Drive
                      </StyledLinkButton>
                    )}
                    {safeFolderUrl && (
                      <StyledLinkButton
                        href={safeFolderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open Drive Folder
                      </StyledLinkButton>
                    )}
                  </StyledRow>
                );
              })()}
            </StyledStack>

            {/* Right: Client Approval & Timestamped Feedback Thread */}
            <StyledStack>
              <strong style={{ fontSize: 15 }}>
                Approval & Feedback
                {selectedVariation ? ` (${selectedVariation.label})` : ''}
              </strong>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Your Name</span>
                <StyledInput
                  type="text"
                  value={reviewAuthor}
                  onChange={(e) => setReviewAuthor(e.target.value)}
                  placeholder="Your name"
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <StyledRow style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, opacity: 0.75 }}>
                    Comment or Revision Note
                  </span>
                  {selectedDeliverable.assetKind === 'VIDEO' && videoEl && (
                    <StyledButton
                      type="button"
                      style={{ fontSize: 11, padding: '4px 8px' }}
                      onClick={() =>
                        setPinnedTimestampSec(
                          Number(currentVideoTimeSec.toFixed(1)),
                        )
                      }
                    >
                      Pin @ {formatDuration(currentVideoTimeSec) || '0:00'}
                    </StyledButton>
                  )}
                </StyledRow>
                {pinnedTimestampSec !== null && (
                  <StyledRow>
                    <StyledBadge>
                      Timestamp pinned: {formatDuration(pinnedTimestampSec)}
                    </StyledBadge>
                    <button
                      type="button"
                      onClick={() => setPinnedTimestampSec(null)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: 'inherit',
                        cursor: 'pointer',
                        fontSize: 11,
                        textDecoration: 'underline',
                      }}
                    >
                      Clear
                    </button>
                  </StyledRow>
                )}
                <StyledTextarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Optional note for approval, or describe exact edits needed…"
                />
              </label>

              {reviewBanner &&
                (reviewBanner.tone === 'error' ? (
                  <StyledErrorBanner>{reviewBanner.text}</StyledErrorBanner>
                ) : (
                  <StyledSuccessBanner>{reviewBanner.text}</StyledSuccessBanner>
                ))}

              <StyledRow>
                <StyledButton
                  type="button"
                  primary
                  disabled={submittingReview}
                  style={{
                    flex: 1,
                    background: accentColor,
                    borderColor: accentColor,
                  }}
                  onClick={() => void handleSubmitReview('APPROVED')}
                >
                  Approve
                </StyledButton>
                <StyledButton
                  type="button"
                  disabled={submittingReview}
                  onClick={() => void handleSubmitReview('CHANGES_REQUESTED')}
                >
                  Request Changes
                </StyledButton>
                <StyledButton
                  type="button"
                  disabled={submittingReview}
                  onClick={() => void handleSubmitReview('COMMENT')}
                >
                  Comment
                </StyledButton>
              </StyledRow>

              <div
                style={{
                  borderTop: `1px solid ${themeCssVariables.border.color.light}`,
                  paddingTop: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  maxHeight: 280,
                  overflowY: 'auto',
                }}
              >
                <strong style={{ fontSize: 13 }}>
                  Feedback History ({selectedDeliverable.reviews.length})
                </strong>
                {selectedDeliverable.reviews.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.68 }}>
                    No comments yet.
                  </div>
                ) : (
                  selectedDeliverable.reviews.map((rev) => {
                    const matchedVar = rev.variationId
                      ? selectedDeliverable.variations.find(
                          (v) => v.id === rev.variationId,
                        )
                      : null;
                    const variationBadgeLabel =
                      selectedDeliverable.variations.length > 0
                        ? matchedVar
                          ? matchedVar.label
                          : 'Original'
                        : null;

                    return (
                      <div
                        key={rev.id}
                        style={{
                          background: themeCssVariables.background.primary,
                          border: `1px solid ${themeCssVariables.border.color.light}`,
                          borderRadius: 10,
                          padding: 10,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        <StyledRow style={{ justifyContent: 'space-between' }}>
                          <StyledRow style={{ gap: 6 }}>
                            <strong style={{ fontSize: 12 }}>
                              {rev.authorName}
                            </strong>
                            {variationBadgeLabel && (
                              <StyledBadge>{variationBadgeLabel}</StyledBadge>
                            )}
                          </StyledRow>
                          <StyledBadge
                            tone={
                              rev.decision === 'APPROVED'
                                ? 'success'
                                : rev.decision === 'CHANGES_REQUESTED'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {formatStatusLabel(rev.decision)}
                          </StyledBadge>
                        </StyledRow>
                        {rev.timestampSec !== null && (
                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                if (rev.timestampSec === null) return;
                                const targetVarId = rev.variationId ?? null;
                                if (targetVarId !== selectedVariationId) {
                                  setPendingSeekSec(rev.timestampSec);
                                  selectVariation(targetVarId);
                                } else if (videoEl) {
                                  videoEl.currentTime = rev.timestampSec;
                                  void videoEl.play().catch(() => undefined);
                                }
                              }}
                              style={{
                                background: 'transparent',
                                border: 0,
                                color: accentColor,
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                                padding: 0,
                              }}
                            >
                              Jump to {formatDuration(rev.timestampSec)}
                            </button>
                          </div>
                        )}
                        {rev.comment && (
                          <div style={{ fontSize: 12, lineHeight: 1.45 }}>
                            {rev.comment}
                          </div>
                        )}
                        <span style={{ fontSize: 10, opacity: 0.6 }}>
                          {new Date(rev.createdAt).toLocaleString()}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </StyledStack>
          </StyledModalDialog>
        </StyledModalBackdrop>
      )}
    </StyledPageShell>
  );
};
