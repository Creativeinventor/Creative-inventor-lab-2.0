import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  X,
  Plus,
  Search,
  Folder,
  ChevronRight,
  Check,
  RefreshCw,
  HardDrive,
  AlertCircle,
  Link2,
  CheckCircle2,
  ArrowLeft,
  Users,
  FolderOpen,
  Copy,
  ExternalLink,
} from 'lucide-react';
import {
  connectGoogleDriveAccount,
  getKnownAndConnectedDriveAccounts,
  getLinkedDriveItems,
  listDriveItems,
  addLinkedDriveItems,
  makeDriveRecordId,
  syncLinkedItemsWithDrive,
  subscribeToDriveState,
} from '../firebase/googleDrive';
import { DriveAccountInfo, DriveBrowseItem } from '../types';
import { DriveThumbnail } from './DriveThumbnail';
import { formatFileSize, formatDate, getFileExtension } from '../utils/fileHelpers';

interface BreadcrumbEntry {
  id: string;
  name: string;
}

interface GoogleDriveConnectModalProps {
  isOpen: boolean;
  initialAccountEmail?: string | null;
  onClose: () => void;
  onItemsLinked?: (count: number) => void;
}

export const GoogleDriveConnectModal: React.FC<GoogleDriveConnectModalProps> = ({
  isOpen,
  initialAccountEmail,
  onClose,
  onItemsLinked,
}) => {
  const [accounts, setAccounts] = useState<DriveAccountInfo[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([
    { id: 'root', name: 'My Drive' },
  ]);
  const [browseItems, setBrowseItems] = useState<DriveBrowseItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [loadingItems, setLoadingItems] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [alreadyLinkedIds, setAlreadyLinkedIds] = useState<Set<string>>(new Set());
  const [linkBanner, setLinkBanner] = useState<string | null>(null);

  const refreshAccountsAndLinked = useCallback(() => {
    const accs = getKnownAndConnectedDriveAccounts();
    setAccounts(accs);
    const linked = getLinkedDriveItems();
    setAlreadyLinkedIds(new Set(linked.map((l) => l.id)));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    refreshAccountsAndLinked();
    const unsub = subscribeToDriveState(refreshAccountsAndLinked);
    return () => unsub();
  }, [isOpen, refreshAccountsAndLinked]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialAccountEmail) {
      setSelectedEmail(initialAccountEmail);
      return;
    }
    const accs = getKnownAndConnectedDriveAccounts();
    if (!selectedEmail && accs.length > 0) {
      const firstConnected = accs.find((a) => a.connected) || accs[0];
      setSelectedEmail(firstConnected.email);
    }
  }, [isOpen, initialAccountEmail, selectedEmail]);

  const currentAccount = useMemo(
    () => accounts.find((a) => a.email.toLowerCase() === (selectedEmail || '').toLowerCase()) || null,
    [accounts, selectedEmail]
  );

  const currentFolderId = breadcrumbs[breadcrumbs.length - 1]?.id || 'root';

  const loadFolder = useCallback(
    async (accountEmail: string, folderId: string, search: string, appendPageToken?: string) => {
      setLoadingItems(true);
      setBrowseError(null);
      try {
        const res = await listDriveItems(accountEmail, {
          folderId,
          searchQuery: search,
          pageToken: appendPageToken,
        });
        setBrowseItems((prev) => (appendPageToken ? [...prev, ...res.items] : res.items));
        setNextPageToken(res.nextPageToken);
      } catch (err: any) {
        if (err?.message === 'DRIVE_SESSION_EXPIRED') {
          setBrowseError('Drive session expired. Tap Reconnect below to browse this Google Drive.');
        } else {
          setBrowseError(err?.message || 'Failed to load files and folders from Google Drive.');
        }
        if (!appendPageToken) setBrowseItems([]);
      } finally {
        setLoadingItems(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!isOpen || !currentAccount?.connected) {
      if (!currentAccount?.connected) {
        setBrowseItems([]);
        setNextPageToken(undefined);
      }
      return;
    }
    loadFolder(currentAccount.email, currentFolderId, activeSearch);
  }, [isOpen, currentAccount?.email, currentAccount?.connected, currentFolderId, activeSearch, loadFolder]);

  const handleConnectAccount = async (loginHint?: string, usePrimaryProject: boolean = false) => {
    setConnectError(null);
    setBrowseError(null);
    setIsConnecting(true);
    try {
      const account = await connectGoogleDriveAccount({
        loginHintEmail: loginHint,
        usePrimaryProject,
      });
      refreshAccountsAndLinked();
      setSelectedEmail(account.email);
      setBreadcrumbs([{ id: 'root', name: 'My Drive' }]);
      setActiveSearch('');
      setSearchInput('');
      setSelectedIds(new Set());
      // Sync existing links against Google Drive to detect deleted/trashed files
      syncLinkedItemsWithDrive(account.email).catch(() => {});
    } catch (err: any) {
      setConnectError(err?.message || 'Could not connect Google Drive account.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSwitchAccount = (email: string) => {
    setSelectedEmail(email);
    setBreadcrumbs([{ id: 'root', name: 'My Drive' }]);
    setActiveSearch('');
    setSearchInput('');
    setSelectedIds(new Set());
    setBrowseError(null);
    setConnectError(null);
    setLinkBanner(null);
  };

  const handleOpenFolder = (folder: DriveBrowseItem) => {
    setActiveSearch('');
    setSearchInput('');
    setSelectedIds(new Set());
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    setActiveSearch('');
    setSearchInput('');
    setSelectedIds(new Set());
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  const handleToggleSharedWithMe = () => {
    setActiveSearch('');
    setSearchInput('');
    setSelectedIds(new Set());
    if (currentFolderId === 'sharedWithMe') {
      setBreadcrumbs([{ id: 'root', name: 'My Drive' }]);
    } else {
      setBreadcrumbs([{ id: 'sharedWithMe', name: 'Shared with me' }]);
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLinkSelected = () => {
    if (!currentAccount || selectedIds.size === 0) return;
    const picked = browseItems.filter((item) => selectedIds.has(item.id));
    if (picked.length === 0) return;

    addLinkedDriveItems(currentAccount, picked);
    refreshAccountsAndLinked();
    setSelectedIds(new Set());
    const msg = `Linked ${picked.length} ${picked.length === 1 ? 'item' : 'items'} from ${currentAccount.email} permanently to your webpage.`;
    setLinkBanner(msg);
    setTimeout(() => setLinkBanner(null), 5000);
    if (onItemsLinked) {
      onItemsLinked(picked.length);
    }
  };

  const handleLinkSingleItem = (item: DriveBrowseItem) => {
    if (!currentAccount) return;
    addLinkedDriveItems(currentAccount, [item]);
    refreshAccountsAndLinked();
    const msg = `Linked "${item.name}" from ${currentAccount.email} permanently to your webpage.`;
    setLinkBanner(msg);
    setTimeout(() => setLinkBanner(null), 4000);
    if (onItemsLinked) {
      onItemsLinked(1);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 via-blue-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-white tracking-wide truncate">
                CONNECT GOOGLE DRIVE ACCOUNTS
              </h2>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                Select one or more Google accounts on your device & link folders/files to your webpage
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-red-500/20 hover:text-red-300 text-slate-400 transition cursor-pointer shrink-0"
            aria-label="Close Google Drive selector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account Selector Bar */}
        <div className="px-4 sm:px-6 py-3 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleConnectAccount()}
            disabled={isConnecting}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition cursor-pointer disabled:opacity-60"
          >
            {isConnecting ? (
              <div className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>
              {accounts.length === 0
                ? 'Choose Google Account from Device'
                : 'Add Another Google Drive'}
            </span>
          </button>

          {accounts.map((acc) => {
            const isSelected = acc.email.toLowerCase() === (selectedEmail || '').toLowerCase();
            return (
              <button
                key={acc.email}
                type="button"
                onClick={() => handleSwitchAccount(acc.email)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono border transition cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-500/15 border-cyan-400/60 text-white font-semibold'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {acc.photoURL ? (
                  <img
                    src={acc.photoURL}
                    alt={acc.displayName}
                    referrerPolicy="no-referrer"
                    className="w-4 h-4 rounded-full object-cover"
                  />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px] font-bold">
                    {acc.email[0]?.toUpperCase()}
                  </span>
                )}
                <span className="truncate max-w-[160px]">{acc.email}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    acc.connected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                  title={acc.connected ? 'Connected' : 'Tap Reconnect to browse'}
                />
              </button>
            );
          })}
        </div>

        {/* Connect Error Banner */}
        {connectError && (
          <div className="mx-4 sm:mx-6 mt-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs space-y-2.5">
            {connectError.startsWith('UNAUTHORIZED_DRIVE_DOMAIN:') ? (
              (() => {
                const [, host, projectId] = connectError.split(':');
                return (
                  <>
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        Domain <code className="px-1.5 py-0.5 bg-slate-950 rounded text-cyan-300">{host}</code> is not yet authorized on Firebase project <code className="px-1.5 py-0.5 bg-slate-950 rounded text-amber-300">{projectId}</code>.
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-6">
                      <button
                        type="button"
                        onClick={() => handleConnectAccount(undefined, true)}
                        disabled={isConnecting}
                        className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] cursor-pointer"
                      >
                        Try via Creative Inventor Firebase
                      </button>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(host)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy Domain ({host})</span>
                      </button>
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{connectError}</span>
              </div>
            )}
          </div>
        )}

        {/* Link Confirmation Banner */}
        {linkBanner && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{linkBanner}</span>
          </div>
        )}

        {/* Main Browser Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Case A: No accounts yet */}
          {accounts.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4">
                <HardDrive className="w-8 h-8 text-cyan-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                Select a Google Account on Your Device
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
                Tap below to view available Google accounts on this device. Once you pick a Google account, all of its folders and files will appear here so you can link them permanently with thumbnails.
              </p>
              <button
                type="button"
                onClick={() => handleConnectAccount()}
                disabled={isConnecting}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-sm shadow-lg shadow-cyan-500/20 transition cursor-pointer flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>{isConnecting ? 'Opening Google Accounts...' : 'Show Google Accounts on Device'}</span>
              </button>
            </div>
          )}

          {/* Case B: Selected account is known from previous session, needs 1-tap reconnect */}
          {currentAccount && !currentAccount.connected && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4">
                <RefreshCw className="w-7 h-7 text-amber-400" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                Reconnect {currentAccount.email}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mb-5 leading-relaxed">
                For your security, browsing this Google Drive requires confirming access for your current session. Your existing linked files remain visible on the webpage.
              </p>
              <button
                type="button"
                onClick={() => handleConnectAccount(currentAccount.email)}
                disabled={isConnecting}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isConnecting ? 'animate-spin' : ''}`} />
                <span>{isConnecting ? 'Connecting...' : `Open ${currentAccount.email} Drive`}</span>
              </button>
            </div>
          )}

          {/* Case C: Connected Drive Browser */}
          {currentAccount && currentAccount.connected && (
            <>
              {/* Drive Navigation & Search Toolbar */}
              <div className="px-4 sm:px-6 py-3 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-900/60">
                {/* Breadcrumbs + Shared Toggle */}
                <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-mono">
                  {breadcrumbs.length > 1 && !activeSearch && (
                    <button
                      type="button"
                      onClick={() => handleBreadcrumbClick(breadcrumbs.length - 2)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer shrink-0"
                      title="Back to parent folder"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {breadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={crumb.id}>
                      {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                      <button
                        type="button"
                        onClick={() => handleBreadcrumbClick(idx)}
                        className={`px-2 py-1 rounded-lg whitespace-nowrap transition cursor-pointer ${
                          idx === breadcrumbs.length - 1 && !activeSearch
                            ? 'bg-cyan-500/15 text-cyan-300 font-bold'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))}

                  <button
                    type="button"
                    onClick={handleToggleSharedWithMe}
                    className={`ml-2 px-2.5 py-1 rounded-lg border text-[11px] flex items-center gap-1 whitespace-nowrap cursor-pointer transition ${
                      currentFolderId === 'sharedWithMe'
                        ? 'bg-purple-500/15 border-purple-400/40 text-purple-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-3 h-3" />
                    <span>Shared with me</span>
                  </button>
                </div>

                {/* Drive Search Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSelectedIds(new Set());
                    setActiveSearch(searchInput.trim());
                  }}
                  className="flex items-center gap-1.5 w-full sm:w-auto"
                >
                  <div className="relative flex-1 sm:w-56">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => {
                        setSearchInput(e.target.value);
                        if (!e.target.value.trim() && activeSearch) {
                          setActiveSearch('');
                        }
                      }}
                      placeholder="Search Drive files & folders..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    Find
                  </button>
                  <button
                    type="button"
                    onClick={() => loadFolder(currentAccount.email, currentFolderId, activeSearch)}
                    disabled={loadingItems}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                    title="Refresh folder"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingItems ? 'animate-spin text-cyan-400' : ''}`} />
                  </button>
                </form>
              </div>

              {/* Files & Folders List */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-slate-950/30">
                {browseError && (() => {
                  const consoleUrlMatch = browseError.match(
                    /https:\/\/console\.(developers|cloud)\.google\.com\/[^\s]+/
                  );
                  const enableApiUrl = consoleUrlMatch ? consoleUrlMatch[0] : null;
                  return (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div className="space-y-1 min-w-0 break-words">
                          {enableApiUrl ? (
                            <>
                              <p className="font-bold text-white">
                                Google Drive API needs to be enabled once for this project.
                              </p>
                              <p className="text-red-200/90 leading-relaxed">
                                Tap <strong>Enable Google Drive API</strong> below, click <strong>Enable</strong> on the Google Cloud page, wait a few seconds, then tap <strong>Retry</strong>.
                              </p>
                            </>
                          ) : (
                            <span>{browseError}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {enableApiUrl && (
                          <a
                            href={enableApiUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Enable Google Drive API</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            enableApiUrl
                              ? loadFolder(currentAccount.email, currentFolderId, activeSearch)
                              : handleConnectAccount(currentAccount.email)
                          }
                          className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-slate-950 font-bold text-xs cursor-pointer"
                        >
                          {enableApiUrl ? 'Retry' : 'Reconnect'}
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {loadingItems && browseItems.length === 0 && (
                  <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                    <div className="w-7 h-7 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                    <span className="text-xs font-mono">
                      Loading files & folders from {currentAccount.email}...
                    </span>
                  </div>
                )}

                {!loadingItems && browseItems.length === 0 && !browseError && (
                  <div className="py-14 text-center flex flex-col items-center justify-center text-slate-400">
                    <FolderOpen className="w-10 h-10 text-slate-600 mb-2" />
                    <p className="text-sm font-semibold text-slate-300">
                      {activeSearch ? `No Drive items matching "${activeSearch}"` : 'This folder is empty'}
                    </p>
                  </div>
                )}

                {browseItems.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {browseItems.map((item) => {
                      const isSelected = selectedIds.has(item.id);
                      const linkedId = makeDriveRecordId(currentAccount.email, item.id);
                      const isAlreadyLinked = alreadyLinkedIds.has(linkedId);
                      const ext = item.isFolder ? 'FOLDER' : getFileExtension(item.name) || 'DRIVE';

                      return (
                        <div
                          key={item.id}
                          className={`group rounded-2xl border p-3.5 transition flex flex-col justify-between gap-3 ${
                            isSelected
                              ? 'bg-cyan-950/30 border-cyan-400/70 shadow-lg shadow-cyan-500/10'
                              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Selection Checkbox */}
                            <button
                              type="button"
                              onClick={() => toggleSelectItem(item.id)}
                              className={`mt-1 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 cursor-pointer transition ${
                                isSelected
                                  ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                                  : 'bg-slate-950 border-slate-700 hover:border-cyan-400'
                              }`}
                              title={isSelected ? 'Deselect' : 'Select to link to webpage'}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </button>

                            {/* Thumbnail / Folder Icon */}
                            <DriveThumbnail
                              fileName={item.name}
                              mimeType={item.mimeType}
                              isFolder={item.isFolder}
                              thumbnailLink={item.thumbnailLink}
                              driveFileId={item.id}
                              driveAccountEmail={currentAccount.email}
                              onClick={() =>
                                item.isFolder ? handleOpenFolder(item) : toggleSelectItem(item.id)
                              }
                            />

                            {/* Item Name & Metadata */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                    item.isFolder
                                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                      : 'bg-slate-800 text-cyan-300'
                                  }`}
                                >
                                  {ext}
                                </span>
                                {isAlreadyLinked && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-semibold">
                                    Linked
                                  </span>
                                )}
                              </div>
                              <p
                                onClick={() =>
                                  item.isFolder ? handleOpenFolder(item) : toggleSelectItem(item.id)
                                }
                                className="text-xs sm:text-sm font-semibold text-white truncate font-mono cursor-pointer hover:text-cyan-300"
                                title={item.name}
                              >
                                {item.name}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                {item.isFolder
                                  ? 'Google Drive Folder'
                                  : item.size > 0
                                  ? formatFileSize(item.size)
                                  : 'Google Workspace File'}{' '}
                                • {formatDate(item.modifiedTime)}
                              </p>
                            </div>
                          </div>

                          {/* Card Action Row */}
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                            {item.isFolder ? (
                              <button
                                type="button"
                                onClick={() => handleOpenFolder(item)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Folder className="w-3.5 h-3.5" />
                                <span>Open Folder</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleSelectItem(item.id)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold cursor-pointer"
                              >
                                {isSelected ? 'Selected' : 'Select'}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleLinkSingleItem(item)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition ${
                                isAlreadyLinked
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                                  : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500 hover:text-slate-950'
                              }`}
                            >
                              <Link2 className="w-3.5 h-3.5" />
                              <span>{isAlreadyLinked ? 'Re-link' : 'Link to Page'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {nextPageToken && (
                  <div className="mt-5 flex justify-center">
                    <button
                      type="button"
                      onClick={() =>
                        loadFolder(currentAccount.email, currentFolderId, activeSearch, nextPageToken)
                      }
                      disabled={loadingItems}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer"
                    >
                      {loadingItems ? 'Loading more...' : 'Load More Items'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Sticky Bottom Action Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-mono">
            {selectedIds.size > 0 ? (
              <span className="text-cyan-300 font-semibold">
                {selectedIds.size} {selectedIds.size === 1 ? 'item' : 'items'} selected to link permanently
              </span>
            ) : (
              <span>
                Select files or folders above to display their links & thumbnails permanently on your webpage.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={handleLinkSelected}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-xs shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 cursor-pointer"
              >
                <Link2 className="w-4 h-4" />
                <span>Link Selected ({selectedIds.size}) to Webpage</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
