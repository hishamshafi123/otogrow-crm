import { useLazyQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { GET_DELIVERY_DRIVE_FOLDERS } from '@/delivery/deliverables/delivery-deliverables.queries';
import { type DriveFolderOption } from '@/delivery/deliverables/delivery-deliverables.types';

const StyledPicker = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 9px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
`;

const StyledSelectedBanner = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 7px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  padding: 7px 10px;
`;

const StyledSelectedLabel = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledSearchRow = styled.div`
  align-items: center;
  display: flex;
  gap: 6px;
`;

const StyledSearchInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 7px;
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-size: 12px;
  padding: 7px 10px;

  &:focus {
    border-color: ${themeCssVariables.color.blue};
    outline: none;
  }
`;

const StyledMiniButton = styled.button<{ $active?: boolean }>`
  background: ${({ $active }) =>
    $active
      ? themeCssVariables.color.blue
      : themeCssVariables.background.tertiary};
  border: 1px solid
    ${({ $active }) =>
      $active
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.medium};
  border-radius: 6px;
  color: ${({ $active }) =>
    $active
      ? themeCssVariables.font.color.inverted
      : themeCssVariables.font.color.primary};
  cursor: pointer;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 5px 9px;

  &:hover:not(:disabled) {
    border-color: ${themeCssVariables.color.blue};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

const StyledBreadcrumb = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-wrap: wrap;
  font-size: 11px;
  gap: 4px;
`;

const StyledCrumbButton = styled.button`
  background: transparent;
  border: none;
  border-radius: 4px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 5px;

  &:hover {
    background: ${themeCssVariables.background.tertiary};
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledList = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 7px;
  display: flex;
  flex-direction: column;
  max-height: 210px;
  overflow-y: auto;
`;

const StyledFolderRow = styled.div<{ $selected?: boolean }>`
  align-items: center;
  background: ${({ $selected }) =>
    $selected
      ? themeCssVariables.background.transparent.blue
      : 'transparent'};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: 8px;
  justify-content: space-between;
  padding: 7px 9px;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${({ $selected }) =>
      $selected
        ? themeCssVariables.background.transparent.blue
        : themeCssVariables.background.secondary};
  }
`;

const StyledFolderNameButton = styled.button`
  align-items: center;
  background: transparent;
  border: none;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  gap: 6px;
  min-width: 0;
  padding: 0;
  text-align: left;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const StyledEmptyState = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: 12px;
  padding: 12px 10px;
  text-align: center;
`;

const StyledDriveLink = styled.a`
  color: ${themeCssVariables.color.blue};
  font-size: 11px;
  font-weight: 600;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const StyledErrorText = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: 11px;
`;

type BreadcrumbItem = {
  id: string;
  name: string;
};

type DeliveryDriveFolderPickerProps = {
  selectedFolderId: string;
  selectedFolderName: string;
  selectedFolderWebUrl?: string | null;
  placeholder?: string;
  autoLoad?: boolean;
  onSelect: (folder: DriveFolderOption) => void;
  onClear?: () => void;
};

export const DeliveryDriveFolderPicker = ({
  selectedFolderId,
  selectedFolderName,
  selectedFolderWebUrl,
  placeholder = 'Search Google Drive folders by name…',
  autoLoad = false,
  onSelect,
  onClear,
}: DeliveryDriveFolderPickerProps) => {
  const [search, setSearch] = useState('');
  const [trail, setTrail] = useState<BreadcrumbItem[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [loadFolders, { data, loading, error }] = useLazyQuery<{
    deliveryDriveFolders: DriveFolderOption[];
  }>(GET_DELIVERY_DRIVE_FOLDERS, { fetchPolicy: 'network-only' });

  const currentParent = trail.length > 0 ? trail[trail.length - 1] : null;
  const folders = data?.deliveryDriveFolders ?? [];

  useEffect(() => {
    if (!autoLoad && !hasLoaded && !search.trim() && trail.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setHasLoaded(true);
      void loadFolders({
        variables: {
          parentId: search.trim() ? null : (currentParent?.id ?? null),
          search: search.trim() || null,
        },
      });
    }, search.trim() ? 240 : 0);

    return () => window.clearTimeout(timer);
  }, [autoLoad, currentParent?.id, hasLoaded, loadFolders, search, trail.length]);

  const handleBrowseTrigger = () => {
    setHasLoaded(true);
    void loadFolders({
      variables: {
        parentId: search.trim() ? null : (currentParent?.id ?? null),
        search: search.trim() || null,
      },
    });
  };

  return (
    <StyledPicker>
      {selectedFolderId && (
        <StyledSelectedBanner>
          <StyledSelectedLabel title={selectedFolderName || selectedFolderId}>
            <span>📁</span>
            <span>{selectedFolderName || selectedFolderId}</span>
          </StyledSelectedLabel>
          <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
            <StyledDriveLink
              href={
                selectedFolderWebUrl ||
                `https://drive.google.com/drive/folders/${selectedFolderId}`
              }
              rel="noreferrer"
              target="_blank"
            >
              Open in Drive ↗
            </StyledDriveLink>
            {onClear && (
              <StyledMiniButton type="button" onClick={onClear}>
                Clear
              </StyledMiniButton>
            )}
          </div>
        </StyledSelectedBanner>
      )}

      <StyledSearchRow>
        <StyledSearchInput
          type="text"
          value={search}
          placeholder={placeholder}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!hasLoaded) setHasLoaded(true);
          }}
          onFocus={() => {
            if (!hasLoaded) {
              handleBrowseTrigger();
            }
          }}
        />
        <StyledMiniButton
          type="button"
          disabled={loading}
          onClick={handleBrowseTrigger}
        >
          {loading ? 'Searching…' : hasLoaded ? 'Refresh' : 'Browse Drive'}
        </StyledMiniButton>
      </StyledSearchRow>

      {hasLoaded && (
        <>
          <StyledBreadcrumb>
            <StyledCrumbButton
              type="button"
              onClick={() => {
                setSearch('');
                setTrail([]);
              }}
            >
              Google Drive
            </StyledCrumbButton>
            {!search.trim() &&
              trail.map((item, idx) => (
                <span
                  key={item.id}
                  style={{ alignItems: 'center', display: 'inline-flex', gap: 4 }}
                >
                  <span>/</span>
                  <StyledCrumbButton
                    type="button"
                    onClick={() => setTrail((prev) => prev.slice(0, idx + 1))}
                  >
                    {item.name}
                  </StyledCrumbButton>
                </span>
              ))}
            {search.trim() && (
              <span>· Searching all Drive folders for “{search.trim()}”</span>
            )}
          </StyledBreadcrumb>

          {error && (
            <StyledErrorText>
              Could not load Google Drive folders: {error.message}
            </StyledErrorText>
          )}

          <StyledList>
            {loading && folders.length === 0 ? (
              <StyledEmptyState>Loading Drive folders…</StyledEmptyState>
            ) : folders.length === 0 ? (
              <StyledEmptyState>
                {search.trim()
                  ? `No folders matching "${search.trim()}".`
                  : 'No subfolders found here.'}
              </StyledEmptyState>
            ) : (
              folders.map((folder) => {
                const isSelected = folder.id === selectedFolderId;
                return (
                  <StyledFolderRow key={folder.id} $selected={isSelected}>
                    <StyledFolderNameButton
                      type="button"
                      onClick={() => onSelect(folder)}
                      title={`Select "${folder.name}"`}
                    >
                      <span>📁</span>
                      <span>{folder.name}</span>
                    </StyledFolderNameButton>
                    <div style={{ alignItems: 'center', display: 'flex', gap: 5 }}>
                      <StyledMiniButton
                        type="button"
                        onClick={() => {
                          setSearch('');
                          setTrail((prev) => {
                            const exists = prev.findIndex(
                              (item) => item.id === folder.id,
                            );
                            if (exists >= 0) return prev.slice(0, exists + 1);
                            return [...prev, { id: folder.id, name: folder.name }];
                          });
                        }}
                        title={`Browse subfolders inside "${folder.name}"`}
                      >
                        Open →
                      </StyledMiniButton>
                      <StyledMiniButton
                        type="button"
                        $active={isSelected}
                        onClick={() => onSelect(folder)}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </StyledMiniButton>
                    </div>
                  </StyledFolderRow>
                );
              })
            )}
          </StyledList>
        </>
      )}
    </StyledPicker>
  );
};
