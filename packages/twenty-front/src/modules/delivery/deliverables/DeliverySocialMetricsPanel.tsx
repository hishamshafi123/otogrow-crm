import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  DELETE_DELIVERY_CONTENT_METRIC_SNAPSHOT,
  GET_DELIVERY_CONTENT_METRIC_SNAPSHOTS,
  UPSERT_DELIVERY_CONTENT_METRIC_SNAPSHOT,
} from '@/delivery/deliverables/delivery-deliverables.queries';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type SocialMetricSnapshot = {
  id: string;
  companyId: string;
  monthKey: string;
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
};

type DeliverySocialMetricsPanelProps = {
  clients: Array<{ id: string; name: string }>;
  defaultCompanyId?: string;
  defaultMonthKey: string;
  isManager: boolean;
  onClose: () => void;
};

const PLATFORMS = [
  'INSTAGRAM',
  'TIKTOK',
  'YOUTUBE',
  'FACEBOOK',
  'X',
  'LINKEDIN',
  'ALL',
] as const;

const StyledGrid = styled.div`
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: 12px;
  gap: 4px;

  input,
  select {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 6px;
    color: ${themeCssVariables.font.color.primary};
    font-size: 13px;
    padding: 6px 8px;
  }
`;

const StyledTableScroll = styled.div`
  overflow-x: auto;
  width: 100%;
`;

const StyledTable = styled.table`
  border-collapse: collapse;
  font-size: 12px;
  min-width: 640px;
  width: 100%;

  th,
  td {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    padding: 8px 6px;
    text-align: left;
  }
`;

const parseNonNegativeInt = (raw: string): number => {
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num);
};

const parseSignedInt = (raw: string): number => {
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num);
};

export const DeliverySocialMetricsPanel = ({
  clients,
  defaultCompanyId,
  defaultMonthKey,
  isManager,
  onClose,
}: DeliverySocialMetricsPanelProps) => {
  const [companyId, setCompanyId] = useState(
    defaultCompanyId || clients[0]?.id || '',
  );
  const [monthKey, setMonthKey] = useState(defaultMonthKey);
  const [platform, setPlatform] =
    useState<(typeof PLATFORMS)[number]>('INSTAGRAM');
  const [postTitle, setPostTitle] = useState('');
  const [postUrl, setPostUrl] = useState('');
  const [views, setViews] = useState('0');
  const [reach, setReach] = useState('0');
  const [impressions, setImpressions] = useState('0');
  const [likes, setLikes] = useState('0');
  const [comments, setComments] = useState('0');
  const [shares, setShares] = useState('0');
  const [saves, setSaves] = useState('0');
  const [clicks, setClicks] = useState('0');
  const [followerDelta, setFollowerDelta] = useState('0');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (defaultCompanyId) {
      setCompanyId(defaultCompanyId);
    } else if (!companyId && clients[0]?.id) {
      setCompanyId(clients[0].id);
    }
  }, [defaultCompanyId, clients, companyId]);

  useEffect(() => {
    if (/^\d{4}-\d{2}$/.test(defaultMonthKey)) {
      setMonthKey(defaultMonthKey);
    }
  }, [defaultMonthKey]);

  const validMonthKey = /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : undefined;

  const query = useQuery<{
    deliveryContentMetricSnapshots: { snapshots: SocialMetricSnapshot[] };
  }>(GET_DELIVERY_CONTENT_METRIC_SNAPSHOTS, {
    variables: {
      filter: {
        ...(companyId ? { companyId } : {}),
        ...(validMonthKey ? { monthKey: validMonthKey } : {}),
      },
    },
    fetchPolicy: 'cache-and-network',
  });

  const [upsertMetric, { loading: saving }] = useMutation(
    UPSERT_DELIVERY_CONTENT_METRIC_SNAPSHOT,
  );
  const [deleteMetric, { loading: deleting }] = useMutation(
    DELETE_DELIVERY_CONTENT_METRIC_SNAPSHOT,
  );

  const snapshots =
    query.data?.deliveryContentMetricSnapshots?.snapshots ?? [];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) {
      setErrorMessage('Manager access is required to record social metrics.');
      return;
    }
    if (!companyId) {
      setErrorMessage('Select a client first.');
      return;
    }
    if (!validMonthKey) {
      setErrorMessage('Select a valid month (YYYY-MM).');
      return;
    }
    const cleanUrl = postUrl.trim();
    if (cleanUrl) {
      try {
        const parsed = new URL(cleanUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setErrorMessage('Post URL must start with http:// or https://.');
          return;
        }
      } catch {
        setErrorMessage('Enter a valid post URL.');
        return;
      }
    }
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await upsertMetric({
        variables: {
          input: {
            companyId,
            monthKey: validMonthKey,
            platform,
            postTitle: postTitle.trim() || null,
            postUrl: cleanUrl || null,
            views: parseNonNegativeInt(views),
            impressions: parseNonNegativeInt(impressions),
            reach: parseNonNegativeInt(reach),
            likes: parseNonNegativeInt(likes),
            comments: parseNonNegativeInt(comments),
            shares: parseNonNegativeInt(shares),
            saves: parseNonNegativeInt(saves),
            clicks: parseNonNegativeInt(clicks),
            followerDelta: parseSignedInt(followerDelta),
          },
        },
      });
      setPostTitle('');
      setPostUrl('');
      setViews('0');
      setReach('0');
      setImpressions('0');
      setLikes('0');
      setComments('0');
      setShares('0');
      setSaves('0');
      setClicks('0');
      setFollowerDelta('0');
      setStatusMessage(
        'Saved! Views & engagement metrics are now live on this client’s dashboard.',
      );
      await query.refetch();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not save metric snapshot.',
      );
    }
  };

  const handleDelete = async (id: string) => {
    setErrorMessage(null);
    try {
      await deleteMetric({ variables: { id } });
      await query.refetch();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not delete snapshot.',
      );
    }
  };

  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <StyledDeliveryRow style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>Social Content Performance Metrics</strong>
            <div style={{ fontSize: 12, opacity: 0.72 }}>
              Record monthly or per-post views, reach, impressions, and
              engagement — synced instantly to the Client Dashboard.
            </div>
          </div>
          <StyledDeliveryButton type="button" onClick={onClose}>
            Close
          </StyledDeliveryButton>
        </StyledDeliveryRow>

        <StyledGrid>
          <StyledField>
            Client
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">Choose client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </StyledField>
          <StyledField>
            Month
            <input
              type="month"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
            />
          </StyledField>
        </StyledGrid>

        {isManager ? (
          <form onSubmit={(e) => void handleSave(e)}>
            <StyledDeliveryStack>
              <StyledGrid>
                <StyledField>
                  Platform
                  <select
                    value={platform}
                    onChange={(e) =>
                      setPlatform(e.target.value as (typeof PLATFORMS)[number])
                    }
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </StyledField>
                <StyledField>
                  Post / Campaign Title
                  <input
                    type="text"
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    placeholder="e.g. Reel #3 or Monthly Rollup"
                  />
                </StyledField>
                <StyledField>
                  Post URL (optional)
                  <input
                    type="url"
                    value={postUrl}
                    onChange={(e) => setPostUrl(e.target.value)}
                    placeholder="https://instagram.com/reel/…"
                  />
                </StyledField>
              </StyledGrid>

              <StyledGrid>
                <StyledField>
                  Views
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={views}
                    onChange={(e) => setViews(e.target.value)}
                  />
                </StyledField>
                <StyledField>
                  Reach
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={reach}
                    onChange={(e) => setReach(e.target.value)}
                  />
                </StyledField>
                <StyledField>
                  Impressions
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={impressions}
                    onChange={(e) => setImpressions(e.target.value)}
                  />
                </StyledField>
                <StyledField>
                  Likes
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={likes}
                    onChange={(e) => setLikes(e.target.value)}
                  />
                </StyledField>
                <StyledField>
                  Comments
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                  />
                </StyledField>
                <StyledField>
                  Shares
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                  />
                </StyledField>
                <StyledField>
                  Saves
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={saves}
                    onChange={(e) => setSaves(e.target.value)}
                  />
                </StyledField>
                <StyledField>
                  Clicks
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={clicks}
                    onChange={(e) => setClicks(e.target.value)}
                  />
                </StyledField>
                <StyledField>
                  Follower Delta
                  <input
                    type="number"
                    step={1}
                    value={followerDelta}
                    onChange={(e) => setFollowerDelta(e.target.value)}
                  />
                </StyledField>
              </StyledGrid>

              <StyledDeliveryRow>
                <StyledDeliveryButton
                  type="submit"
                  disabled={saving || !companyId || !validMonthKey}
                >
                  {saving ? 'Saving…' : '+ Record Social Metrics'}
                </StyledDeliveryButton>
                {statusMessage && (
                  <StyledDeliveryBadge>{statusMessage}</StyledDeliveryBadge>
                )}
                {errorMessage && (
                  <span role="alert" style={{ fontSize: 12 }}>
                    {errorMessage}
                  </span>
                )}
              </StyledDeliveryRow>
            </StyledDeliveryStack>
          </form>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            View-only mode: only managers can log or delete live client-facing
            social performance metrics.
          </div>
        )}

        {query.error && (
          <div role="alert" style={{ fontSize: 12 }}>
            Failed to load social metrics: {query.error.message}
          </div>
        )}

        {query.loading && snapshots.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            Loading social performance snapshots…
          </div>
        ) : snapshots.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            No social metrics recorded for this selection yet.
          </div>
        ) : (
          <StyledTableScroll>
            <StyledTable>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Post</th>
                  <th>Views</th>
                  <th>Reach</th>
                  <th>Likes</th>
                  <th>Comments</th>
                  <th>Shares</th>
                  <th>Followers</th>
                  {isManager && <th />}
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap) => (
                  <tr key={snap.id}>
                    <td>{snap.platform}</td>
                    <td>{snap.postTitle || 'Monthly Summary'}</td>
                    <td>{snap.views.toLocaleString()}</td>
                    <td>{snap.reach.toLocaleString()}</td>
                    <td>{snap.likes.toLocaleString()}</td>
                    <td>{snap.comments.toLocaleString()}</td>
                    <td>{snap.shares.toLocaleString()}</td>
                    <td>
                      {snap.followerDelta >= 0 ? '+' : ''}
                      {snap.followerDelta.toLocaleString()}
                    </td>
                    {isManager && (
                      <td>
                        <StyledDeliveryButton
                          type="button"
                          disabled={deleting}
                          onClick={() => void handleDelete(snap.id)}
                        >
                          Delete
                        </StyledDeliveryButton>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </StyledTable>
          </StyledTableScroll>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
