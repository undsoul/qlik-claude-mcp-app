/**
 * Qlik MCP App - Premium Interactive UI
 * Beautiful, interactive visualizations for Qlik Cloud
 */
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import {
  useApp,
  useHostStyleVariables,
  useHostFonts,
  useDocumentTheme,
  type McpUiTheme
} from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useCallback, useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Chart, registerables } from "chart.js";
import {
  Bot, AppWindow, CheckCircle, AlertTriangle, ChevronRight,
  ExternalLink, FolderOpen, Database, Bell, Zap, RefreshCw,
  FileText, Search, File, Layers, XCircle, Clock, Timer, MoreVertical, GitBranch, Share2,
  Maximize2, Minimize2, Loader2, Play
} from "lucide-react";
import "./global.css";

// Register Chart.js components
Chart.register(...registerables);

const PAGE_SIZE = 5;

function extractData(result: CallToolResult | null): any {
  if (!result) return null;
  return (result as any).structuredContent || null;
}

function QlikApp() {
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [_hostContext, setHostContext] = useState<McpUiHostContext | undefined>();
  const [loading, setLoading] = useState(false);
  const [appInstance, setAppInstance] = useState<App | null>(null);
  const [partialInput, setPartialInput] = useState<any>(null);
  const [cancelled, setCancelled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // MCP SDK v1.0.1 Theme Hook - reactive to document theme
  const theme: McpUiTheme = useDocumentTheme();

  const { app, error } = useApp({
    appInfo: { name: "Qlik Mcp App", version: "2.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      setAppInstance(app);

      // Tool result handler
      app.ontoolresult = async (result) => {
        setLoading(false);
        setPartialInput(null);
        setCancelled(false);
        setToolResult(result);
      };

      // Error handler
      app.onerror = (e) => {
        console.error(e);
        setLoading(false);
        setPartialInput(null);
      };

      // Host context change handler
      app.onhostcontextchanged = (params) => setHostContext((prev) => ({ ...prev, ...params }));

      // MCP SDK v1.0.1: Streaming tool input (progressive loading)
      app.ontoolinputpartial = async (params) => {
        setPartialInput(params);
        setLoading(true);
        setCancelled(false);
      };

      // MCP SDK v1.0.1: Tool cancellation handler
      app.ontoolcancelled = async () => {
        setCancelled(true);
        setLoading(false);
        setPartialInput(null);
      };

      // MCP SDK v1.0.1: Teardown handler for cleanup
      app.onteardown = async () => {
        setToolResult(null);
        setPartialInput(null);
        setCancelled(false);
        setLoading(false);
        return {}; // Must return McpUiResourceTeardownResult
      };
    },
  });

  // MCP SDK v1.0.1 Theme Hooks - apply host styles and fonts
  useHostStyleVariables(app, app?.getHostContext());
  useHostFonts(app, app?.getHostContext());

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(async () => {
    if (!appInstance) return;
    const hostContext = appInstance.getHostContext();
    // Check if fullscreen is available
    const availableModes = hostContext?.availableDisplayModes || [];
    if (!availableModes.includes("fullscreen") && !availableModes.includes("inline")) {
      console.warn("Display mode change not supported by host");
      return;
    }
    try {
      const newMode = isFullscreen ? "inline" : "fullscreen";
      await appInstance.requestDisplayMode({ mode: newMode as "inline" | "fullscreen" | "pip" });
      setIsFullscreen(!isFullscreen);
    } catch (e) {
      console.error("Failed to toggle display mode:", e);
    }
  }, [appInstance, isFullscreen]);

  // Open external link using MCP SDK
  const openLink = useCallback(async (url: string) => {
    if (!appInstance) return;
    try {
      await appInstance.openLink({ url });
    } catch (e) {
      console.error("Failed to open link:", e);
      // Fallback: try window.open
      window.open(url, "_blank");
    }
  }, [appInstance]);

  const callTool = useCallback(async (toolName: string, args: any = {}, selection?: { name: string; id: string; type: string }) => {
    if (!appInstance) return;
    try {
      // If selection provided, notify Claude with full context (name, id, type)
      if (selection) {
        await appInstance.sendMessage({
          role: "user",
          content: [{ type: "text", text: `I selected "${selection.name}" (${selection.type} ID: ${selection.id}). Please show me the details.` }]
        });
        return;
      }
      // Otherwise call the tool directly with loading indicator
      setLoading(true);
      const result = await appInstance.callServerTool({ name: toolName, arguments: args });
      // Handle the result directly since ontoolresult may not fire for callServerTool
      setLoading(false);
      if (result) {
        setToolResult(result as any);
      }
    } catch (e) {
      console.error("callTool error:", e);
      setLoading(false);
    }
  }, [appInstance]);

  // Send action message to Claude - creates a new response in chat
  const sendAction = useCallback(async (action: string, context: Record<string, string> = {}) => {
    if (!appInstance) return;
    const contextStr = Object.entries(context).map(([k, v]) => `${k}: ${v}`).join(", ");
    const text = contextStr ? `${action} (${contextStr})` : action;
    await appInstance.sendMessage({
      role: "user",
      content: [{ type: "text", text }]
    });
  }, [appInstance]);

  if (error) return <ErrorView message={error.message} />;
  if (!app) return <LoadingView message="Connecting..." />;

  const data = extractData(toolResult);
  return (
    <div className={`app-container ${theme === "light" ? "light-theme" : "dark-theme"}`}>
      {/* Header with controls */}
      <div className="app-header">
        <div className="app-header-title">
          <AppWindow size={16} />
          <span>Qlik Cloud</span>
        </div>
        <div className="app-header-actions">
          <button
            className="header-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Cancelled state */}
      {cancelled && (
        <div className="cancelled-banner">
          <XCircle size={16} />
          <span>Operation cancelled</span>
        </div>
      )}

      {/* Partial input preview (streaming) */}
      {partialInput && loading && (
        <div className="partial-preview">
          <div className="partial-header">
            <Loader2 size={16} className="spinning" />
            <span>Processing: {partialInput.name}</span>
          </div>
          {partialInput.arguments && Object.keys(partialInput.arguments).length > 0 && (
            <div className="partial-args">
              {Object.entries(partialInput.arguments).map(([key, value]) => (
                <div key={key} className="partial-arg">
                  <span className="partial-key">{key}:</span>
                  <span className="partial-value">{String(value).substring(0, 100)}{String(value).length > 100 ? '...' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading overlay */}
      {loading && !partialInput && <LoadingOverlay />}

      {/* Main content */}
      <ContentRouter data={data} callTool={callTool} sendAction={sendAction} openLink={openLink} />
    </div>
  );
}

// ============ PAGINATION HOOK ============
function usePagination<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(items.length / pageSize);
  const paged = items.slice(page * pageSize, (page + 1) * pageSize);

  return {
    items: paged,
    page,
    totalPages,
    total: items.length,
    hasNext: page < totalPages - 1,
    hasPrev: page > 0,
    next: () => setPage(p => Math.min(p + 1, totalPages - 1)),
    prev: () => setPage(p => Math.max(p - 1, 0)),
    goTo: (p: number) => setPage(Math.max(0, Math.min(p, totalPages - 1))),
  };
}

// ============ PAGINATION COMPONENT ============
function Pagination({ page, totalPages, total, hasNext, hasPrev, next, prev, goTo }: {
  page: number;
  totalPages: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
  next: () => void;
  prev: () => void;
  goTo: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages = [];
  for (let i = 0; i < Math.min(totalPages, 5); i++) {
    const pageNum = totalPages <= 5 ? i :
      page < 2 ? i :
      page > totalPages - 3 ? totalPages - 5 + i :
      page - 2 + i;
    if (pageNum >= 0 && pageNum < totalPages) {
      pages.push(pageNum);
    }
  }

  return (
    <div className="pagination">
      <button className="pagination-btn" onClick={prev} disabled={!hasPrev}>← Prev</button>
      <div className="pagination-pages">
        {pages.map(p => (
          <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => goTo(p)}>
            {p + 1}
          </button>
        ))}
      </div>
      <button className="pagination-btn" onClick={next} disabled={!hasNext}>Next <ChevronRight size={14} /></button>
      <span className="pagination-info">{total} items</span>
    </div>
  );
}

// ============ LOADING & ERROR ============
function LoadingView({ message }: { message: string }) {
  return (
    <div className="center-message">
      <div className="spinner"></div>
      <p>{message}</p>
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div className="loading-overlay">
      <div className="spinner"></div>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="error-card">
      <span className="error-icon">!</span>
      <div>
        <strong>Error</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

// ============ ITEM MENU (3-dot) ============
function ItemMenu({ item, sendAction }: { item: { id: string; name: string; resourceType?: string }; sendAction: (action: string, context?: Record<string, string>) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleAction = (action: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    sendAction(action, { itemId: item.id, itemName: item.name, resourceType: item.resourceType || "app" });
  };

  return (
    <div className="item-menu" ref={menuRef}>
      <button
        className="item-menu-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="More options"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="item-menu-dropdown">
          <button className="item-menu-option" onClick={(e) => handleAction("Show data lineage for this item", e)}>
            <GitBranch size={14} /> View Lineage
          </button>
          <button className="item-menu-option" onClick={(e) => handleAction("Show impact analysis for this item", e)}>
            <Share2 size={14} /> Impact Analysis
          </button>
        </div>
      )}
    </div>
  );
}

function ErrorCard({ data }: { data: any }) {
  // Parse error message to extract useful info
  const parseError = (msg: string) => {
    // Try to extract from "Qlik API error: 404 - {...}" format
    const jsonMatch = msg.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const error = parsed.errors?.[0] || parsed;
        return {
          status: error.status || parsed.status,
          title: error.title || "Error",
          detail: error.detail || error.message || msg,
          code: error.code,
        };
      } catch {
        // Fall through
      }
    }
    // Extract status code from "Qlik API error: 404 - ..."
    const statusMatch = msg.match(/error:\s*(\d+)/i);
    return {
      status: statusMatch?.[1] || "Error",
      title: "Request Failed",
      detail: msg.replace(/Qlik API error:\s*\d+\s*-\s*/i, "").trim(),
      code: undefined,
    };
  };

  const error = data.message ? parseError(data.message) : {
    status: data.status || "Error",
    title: data.title || "Something went wrong",
    detail: data.detail || data.error || "An unexpected error occurred",
    code: data.code,
  };

  return (
    <div className="error-card-fancy">
      <div className="error-header">
        <div className="error-icon-circle">
          <AlertTriangle size={24} />
        </div>
        <div className="error-title-section">
          <h3 className="error-title">{error.title}</h3>
          {error.status && <span className="error-status">{error.status}</span>}
        </div>
      </div>
      <p className="error-detail">{error.detail}</p>
      {error.code && <p className="error-code">Code: {error.code}</p>}
    </div>
  );
}

// ============ CONTENT ROUTER ============
function ContentRouter({ data, callTool, sendAction, openLink }: { data: any; callTool: (name: string, args?: any, selection?: any) => void; sendAction: (action: string, context?: Record<string, string>) => void; openLink: (url: string) => void }) {
  if (!data) return null;

  const views: Record<string, React.ReactNode> = {
    "apps": <AppsGrid data={data} callTool={callTool} sendAction={sendAction} openLink={openLink} />,
    "app-detail": <AppDetail data={data} sendAction={sendAction} openLink={openLink} />,
    "spaces": <SpacesGrid data={data} callTool={callTool} />,
    "space-detail": <SpaceDetail data={data} callTool={callTool} sendAction={sendAction} />,
    "users": <UsersGrid data={data} callTool={callTool} />,
    "user-detail": <UserDetail data={data} />,
    "reloads": <ReloadsTimeline data={data} sendAction={sendAction} />,
    "reload-triggered": <ActionSuccess title="Reload Started" data={data} />,
    "reload-status": <ReloadStatus data={data} />,
    "reload-detail": <ReloadDetail data={data} />,
    "reload-cancelled": <ActionCancelled title="Reload Cancelled" data={data} />,
    "automations": <AutomationsGrid data={data} callTool={callTool} />,
    "automation-detail": <AutomationDetail data={data} sendAction={sendAction} />,
    "automation-runs": <AutomationRuns data={data} />,
    "automation-run": <ActionSuccess title="Automation Started" data={data} />,
    "alerts": <AlertsGrid data={data} callTool={callTool} />,
    "alert-detail": <AlertDetail data={data} sendAction={sendAction} openLink={openLink} />,
    "alert-triggered": <ActionSuccess title="Alert Triggered" data={data} />,
    "assistants": <AssistantsGrid data={data} callTool={callTool} />,
    "assistant-detail": <AssistantDetail data={data} sendAction={sendAction} />,
    "chat-response": <ChatResponse data={data} callTool={callTool} />,
    "insights": <InsightsView data={data} />,
    "chart": <ChartView data={data} />,
    "experiments": <ExperimentsGrid data={data} callTool={callTool} />,
    "experiment-detail": <ExperimentDetail data={data} openLink={openLink} />,
    "deployments": <DeploymentsGrid data={data} />,
    "deployment-detail": <DeploymentDetail data={data} openLink={openLink} />,
    "lineage": <LineageView data={data} sendAction={sendAction} />,
    "app-lineage": <AppLineageView data={data} />,
    "datasets": <DatasetsGrid data={data} callTool={callTool} sendAction={sendAction} />,
    "dataset-detail": <DatasetDetail data={data} sendAction={sendAction} />,
    "tenant": <TenantView data={data} />,
    "license": <LicenseView data={data} />,
    "health": <HealthView data={data} />,
    "app-fields": <AppFieldsView data={data} />,
    "sheets": <SheetsGrid data={data} callTool={callTool} openLink={openLink} />,
    "sheet-detail": <SheetDetail data={data} openLink={openLink} />,
    "field-values": <FieldValuesView data={data} callTool={callTool} />,
    "master-dimensions": <MasterDimensionsView data={data} />,
    "master-measures": <MasterMeasuresView data={data} />,
    "glossaries": <GlossariesGrid data={data} callTool={callTool} />,
    "glossary-detail": <GlossaryDetail data={data} callTool={callTool} />,
    "glossary-term": <GlossaryTermView data={data} />,
    "glossary-term-created": <ActionSuccess title="Term Created" data={data} />,
    "data-products": <DataProductsGrid data={data} callTool={callTool} />,
    "data-product-detail": <DataProductDetail data={data} />,
    "dataset-profile": <DatasetProfileView data={data} />,
    "bookmarks": <BookmarksView data={data} sendAction={sendAction} />,
    "variables": <VariablesView data={data} sendAction={sendAction} />,
    "stories": <StoriesView data={data} />,
    "app-script": <AppScriptView data={data} />,
    "app-connections": <AppConnectionsView data={data} />,
    "data-connections": <DataConnectionsGrid data={data} callTool={callTool} />,
    "data-connection-detail": <DataConnectionDetail data={data} />,
    "action-success": <ActionSuccess title="Success" data={data} />,
    "app-generated": <AppGeneratedFlow data={data} />,
    "error": <ErrorCard data={data} />,
    "selection-info": <SelectionInfoView data={data} />,
    "app-selections": <SelectionInfoView data={data} />,
  };

  // Check if data contains error indicators even if type isn't "error"
  if (data.isError || data.error || (data.message && data.message.includes("error"))) {
    return <ErrorCard data={data} />;
  }

  return views[data.type] || <JsonView data={data} />;
}

// ============ APPS ============
function AppsGrid({ data, callTool, sendAction, openLink }: { data: any; callTool: any; sendAction: (action: string, context?: Record<string, string>) => void; openLink: (url: string) => void }) {
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("-updatedAt");

  const allApps = data.apps || [];

  // Filter items
  const filtered = allApps.filter((app: any) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return (
      app.name?.toLowerCase().includes(search) ||
      app.description?.toLowerCase().includes(search) ||
      app.resourceType?.toLowerCase().includes(search)
    );
  });

  // Sort items
  const sorted = [...filtered].sort((a: any, b: any) => {
    const desc = sortBy.startsWith("-");
    const field = sortBy.replace("-", "");
    let aVal = a[field] || "";
    let bVal = b[field] || "";
    if (field.includes("At") || field.includes("Date")) {
      aVal = new Date(aVal).getTime() || 0;
      bVal = new Date(bVal).getTime() || 0;
    } else {
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
    }
    if (desc) return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
    return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
  });

  const pagination = usePagination(sorted);

  // Get icon based on resource type
  const getIcon = (type: string) => {
    const t = type?.toLowerCase() || "";
    if (t.includes("dataset") || t.includes("qvd")) return <Database size={16} />;
    if (t.includes("automation")) return <Zap size={16} />;
    if (t.includes("note")) return <FileText size={16} />;
    if (t.includes("space")) return <FolderOpen size={16} />;
    return <AppWindow size={16} />; // Default: app
  };

  // Get tool based on resource type
  const getToolAndType = (item: any) => {
    const t = item.resourceType?.toLowerCase() || "";
    if (t.includes("dataset")) return { tool: "dataset", type: "dataset" };
    if (t.includes("automation")) return { tool: "automation", type: "automation" };
    return { tool: "app_details", type: "app" };
  };

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{sorted.length} result{sorted.length !== 1 ? 's' : ''}{filter && ` (filtered from ${allApps.length})`}</span>
        {data.query && <span className="results-query">"{data.query}"</span>}
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Filter results..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="-updatedAt">Newest first</option>
          <option value="updatedAt">Oldest first</option>
          <option value="name">Name A-Z</option>
          <option value="-name">Name Z-A</option>
        </select>
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">No results found</div>
      ) : (
        <div className="results-list">
          {pagination.items.map((item: any) => {
            const { tool, type } = getToolAndType(item);
            const isApp = type === "app";
            return (
              <div key={item.id} className="result-row-wrapper">
                <button className="result-row" onClick={() => callTool(tool, { appId: item.id, datasetId: item.id, automationId: item.id }, { name: item.name, id: item.id, type })}>
                  <span className="result-icon">{getIcon(item.resourceType)}</span>
                  <span className="result-name">{item.name}</span>
                  {item.resourceType && <span className="result-meta">{item.resourceType}</span>}
                  <span className="result-date">{formatDate(item.updatedAt).split(',')[0]}</span>
                  <span className="result-arrow"><ChevronRight size={16} /></span>
                </button>
                {isApp && data.tenantUrl && (
                  <button
                    className="result-open-btn"
                    onClick={(e) => { e.stopPropagation(); openLink(`${data.tenantUrl}/sense/app/${item.id}`); }}
                    title="Open in Qlik Sense"
                  >
                    <ExternalLink size={14} />
                  </button>
                )}
                <ItemMenu item={{ id: item.id, name: item.name, resourceType: item.resourceType || "app" }} sendAction={sendAction} />
              </div>
            );
          })}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

function AppDetail({ data, sendAction, openLink }: { data: any; sendAction: (action: string, context?: Record<string, string>) => void; openLink: (url: string) => void }) {
  const [question, setQuestion] = useState("");

  // Get initials for avatar
  const getInitials = (name: string | undefined) => {
    if (!name) return "?";
    const parts = name.split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const handleAskQuestion = () => {
    if (question.trim()) {
      sendAction(`Ask Insight Advisor: "${question.trim()}"`, { appId: data.id, appName: data.name });
      setQuestion("");
    }
  };

  const ownerName = data.ownerName || data.owner?.name || "Unknown";
  const spaceName = data.spaceName || "Personal";

  return (
    <div className="app-detail-card">
      {/* Left: Thumbnail + Name + Description */}
      <div className="app-detail-left">
        <div className="app-icon-box">
          <AppWindow size={48} strokeWidth={1.5} />
        </div>
        <h2 className="app-detail-name">{data.name}</h2>
        {data.description && <p className="app-detail-desc">{data.description}</p>}
      </div>

      {/* Right: Metadata Grid */}
      <div className="app-detail-right">
        <div className="app-meta-grid">
          {/* Column 1 */}
          <div className="meta-column">
            <div className="meta-item">
              <div className="meta-label">Type</div>
              <div className="meta-value">Application</div>
            </div>
            <div className="meta-item">
              <div className="meta-label">Space</div>
              <div className="meta-value with-icon">
                <FolderOpen size={14} />
                <span>{spaceName}</span>
              </div>
            </div>
            <div className="meta-item">
              <div className="meta-label">Application ID</div>
              <div className="meta-value mono">{data.id}</div>
            </div>
            <div className="meta-item">
              <div className="meta-label">Published</div>
              <div className="meta-value">{data.published ? "Yes" : "No"}</div>
            </div>
          </div>

          {/* Column 2 */}
          <div className="meta-column">
            <div className="meta-item">
              <div className="meta-label">Owner</div>
              <div className="meta-value with-avatar">
                <span className="avatar">{getInitials(ownerName)}</span>
                <span>{ownerName}</span>
              </div>
            </div>
            <div className="meta-item">
              <div className="meta-label">Created date</div>
              <div className="meta-value">{formatDateLong(data.createdDate)}</div>
            </div>
            <div className="meta-item">
              <div className="meta-label">Last reload date</div>
              <div className="meta-value">{formatDateLong(data.lastReloadTime)}</div>
            </div>
          </div>

          {/* Column 3 */}
          <div className="meta-column">
            <div className="meta-item">
              <div className="meta-label">Modified date</div>
              <div className="meta-value">{formatDateLong(data.modifiedDate)}</div>
            </div>
            {data.publishTime && (
              <div className="meta-item">
                <div className="meta-label">Publish date</div>
                <div className="meta-value">{formatDateLong(data.publishTime)}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ask a Question */}
      <div className="app-detail-question">
        <div className="question-label">Ask a question about this app</div>
        <div className="question-input-row">
          <input
            type="text"
            className="question-input"
            placeholder="e.g., Show me sales by region, top 10 customers..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAskQuestion()}
          />
          <button className="btn primary ask-btn" onClick={handleAskQuestion} disabled={!question.trim()}>
            <Search size={16} /> Ask
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="app-detail-actions">
        {data.tenantUrl && (
          <button
            className="btn primary open-in-qlik"
            onClick={() => openLink(`${data.tenantUrl}/sense/app/${data.id}`)}
            title="Open this app in Qlik Sense"
          >
            <ExternalLink size={14} /> Open in Qlik
          </button>
        )}
        <button className="btn secondary" onClick={() => sendAction("Trigger reload for this app", { appId: data.id, appName: data.name })}>
          <RefreshCw size={14} /> Reload
        </button>
        <button className="btn secondary" onClick={() => sendAction("Show reload history for this app", { appId: data.id, appName: data.name })}>
          Reload History
        </button>
        <button className="btn secondary" onClick={() => sendAction("Show data lineage for this app", { appId: data.id, appName: data.name })}>
          View Lineage
        </button>
      </div>
    </div>
  );
}

// ============ SPACES ============
function SpacesGrid({ data, callTool }: { data: any; callTool: any }) {
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");

  const allSpaces = data.spaces || [];

  // Filter spaces
  const filtered = allSpaces.filter((space: any) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return (
      space.name?.toLowerCase().includes(search) ||
      space.description?.toLowerCase().includes(search) ||
      space.type?.toLowerCase().includes(search)
    );
  });

  // Sort spaces
  const sorted = [...filtered].sort((a: any, b: any) => {
    const desc = sortBy.startsWith("-");
    const field = sortBy.replace("-", "");
    let aVal = a[field] || "";
    let bVal = b[field] || "";
    aVal = String(aVal).toLowerCase();
    bVal = String(bVal).toLowerCase();
    if (desc) return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
    return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
  });

  const pagination = usePagination(sorted);

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{sorted.length} space{sorted.length !== 1 ? 's' : ''}{filter && ` (filtered from ${allSpaces.length})`}</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Filter spaces..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Name A-Z</option>
          <option value="-name">Name Z-A</option>
          <option value="type">Type A-Z</option>
          <option value="-type">Type Z-A</option>
        </select>
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">No spaces found</div>
      ) : (
        <div className="results-list">
          {pagination.items.map((space: any) => (
            <button key={space.id} className="result-row" onClick={() => callTool("space_details", { spaceId: space.id }, { name: space.name, id: space.id, type: "space" })}>
              <span className="result-icon"><FolderOpen size={16} /></span>
              <span className="result-name">{space.name}</span>
              <span className={`badge ${space.type}`}>{space.type}</span>
              <span className="result-arrow"><ChevronRight size={16} /></span>
            </button>
          ))}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

function SpaceDetail({ data, callTool, sendAction }: { data: any; callTool: any; sendAction: (action: string, context?: Record<string, string>) => void }) {
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("-updatedAt");
  const spaceType = data.spaceType || "shared";
  const allItems = data.items || data.apps || [];

  // Filter items
  const filtered = allItems.filter((item: any) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return (
      item.name?.toLowerCase().includes(search) ||
      item.description?.toLowerCase().includes(search) ||
      item.resourceType?.toLowerCase().includes(search)
    );
  });

  // Sort items
  const sorted = [...filtered].sort((a: any, b: any) => {
    const desc = sortBy.startsWith("-");
    const field = sortBy.replace("-", "");
    let aVal = a[field] || "";
    let bVal = b[field] || "";
    if (field.includes("At") || field.includes("Date")) {
      aVal = new Date(aVal).getTime() || 0;
      bVal = new Date(bVal).getTime() || 0;
    } else {
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
    }
    if (desc) return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
    return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
  });

  const pagination = usePagination(sorted);

  // Get icon based on resource type
  const getIcon = (type: string) => {
    const t = type?.toLowerCase() || "";
    if (t.includes("dataset") || t.includes("qvd")) return <Database size={16} />;
    if (t.includes("automation")) return <Zap size={16} />;
    if (t.includes("note")) return <FileText size={16} />;
    return <AppWindow size={16} />;
  };

  // Get tool and type based on resource type
  const getToolAndType = (item: any) => {
    const t = item.resourceType?.toLowerCase() || "";
    if (t.includes("dataset")) return { tool: "dataset", type: "dataset" };
    if (t.includes("automation")) return { tool: "automation", type: "automation" };
    return { tool: "app_details", type: "app" };
  };

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">
          <FolderOpen size={14} style={{ marginRight: 6 }} />
          {data.name}
          <span className={`badge ${spaceType}`} style={{ marginLeft: 8 }}>{spaceType}</span>
        </span>
      </div>
      {data.description && <p className="space-desc">{data.description}</p>}
      <div className="space-meta">
        <span>Created: {formatDate(data.createdAt)}</span>
        <span>{allItems.length} item{allItems.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Filter items..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="-updatedAt">Newest first</option>
          <option value="updatedAt">Oldest first</option>
          <option value="name">Name A-Z</option>
          <option value="-name">Name Z-A</option>
        </select>
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">No items in this space</div>
      ) : (
        <div className="results-list">
          {pagination.items.map((item: any) => {
            const { tool, type } = getToolAndType(item);
            return (
              <div key={item.id} className="result-row-wrapper">
                <button className="result-row" onClick={() => callTool(tool, { appId: item.id, datasetId: item.id, automationId: item.id }, { name: item.name, id: item.id, type })}>
                  <span className="result-icon">{getIcon(item.resourceType)}</span>
                  <span className="result-name">{item.name}</span>
                  {item.resourceType && <span className="result-meta">{item.resourceType}</span>}
                  <span className="result-date">{formatDate(item.updatedAt).split(',')[0]}</span>
                  <span className="result-arrow"><ChevronRight size={16} /></span>
                </button>
                <ItemMenu item={{ id: item.id, name: item.name, resourceType: item.resourceType || "app" }} sendAction={sendAction} />
              </div>
            );
          })}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

// ============ USERS ============
// Helper function for avatar colors
function getAvatarColor(name: string): string {
  const colors = [
    "#4f46e5", "#7c3aed", "#db2777", "#dc2626",
    "#ea580c", "#ca8a04", "#16a34a", "#0891b2",
    "#2563eb", "#9333ea", "#c026d3", "#e11d48"
  ];
  const index = (name?.charCodeAt(0) || 0) % colors.length;
  return colors[index];
}

function UsersGrid({ data, callTool }: { data: any; callTool: any }) {
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const allUsers = data.users || [];

  const filtered = allUsers.filter((user: any) => {
    const matchesSearch = !filter ||
      user.name?.toLowerCase().includes(filter.toLowerCase()) ||
      user.email?.toLowerCase().includes(filter.toLowerCase());
    const matchesStatus = statusFilter === "all" || user.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pagination = usePagination(filtered, 20);
  const activeCount = allUsers.filter((u: any) => u.status === "active").length;

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{allUsers.length} users</span>
        <span className="results-badge green">{activeCount} active</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Search users..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="filter-tabs">
          <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>All</button>
          <button className={statusFilter === "active" ? "active" : ""} onClick={() => setStatusFilter("active")}>Active</button>
          <button className={statusFilter === "invited" ? "active" : ""} onClick={() => setStatusFilter("invited")}>Invited</button>
        </div>
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">No users found</div>
      ) : (
        <div className="results-list">
          {pagination.items.map((user: any) => (
            <button
              key={user.id}
              className="result-row"
              onClick={() => callTool("user", { userId: user.id }, { name: user.name, id: user.id, type: "user" })}
            >
              <div className="result-avatar" style={{ background: getAvatarColor(user.name) }}>
                {user.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <span className="result-name">{user.name}</span>
              <span className="result-meta">{user.email}</span>
              <span className={`result-badge ${user.status}`}>{user.status}</span>
            </button>
          ))}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

function UserDetail({ data }: { data: any }) {
  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{data.name}</span>
        <span className={`results-badge ${data.status === "active" ? "green" : ""}`}>{data.status}</span>
      </div>
      <div className="results-content">
        <div className="result-avatar" style={{ background: getAvatarColor(data.name) }}>
          {data.name?.charAt(0)?.toUpperCase() || "?"}
        </div>
        <div className="user-info">
          <div className="user-email">{data.email}</div>
        </div>
      </div>
      <div className="results-details">
        <div className="detail-row">
          <span className="detail-label">User ID</span>
          <span className="detail-value mono">{data.id}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Created</span>
          <span className="detail-value">{formatDate(data.createdAt)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Last Updated</span>
          <span className="detail-value">{formatDate(data.lastUpdatedAt)}</span>
        </div>
        {data.roles && data.roles.length > 0 && (
          <div className="detail-row">
            <span className="detail-label">Roles</span>
            <div className="detail-value roles">
              {data.roles.map((role: string, i: number) => (
                <span key={i} className="role-tag">{role}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ RELOADS ============
function ReloadsTimeline({ data, sendAction }: { data: any; sendAction: (action: string, context?: Record<string, string>) => void }) {
  const pagination = usePagination(data.reloads || [], 10);

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "succeeded": return <CheckCircle size={16} />;
      case "failed": return <XCircle size={16} />;
      case "running": return <RefreshCw size={16} className="spinning" />;
      case "queued": return <Clock size={16} />;
      default: return <RefreshCw size={16} />;
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{data.reloads?.length || 0} reloads</span>
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">No reloads found</div>
      ) : (
        <div className="reload-list">
          {pagination.items.map((reload: any) => (
            <div key={reload.id} className={`reload-row status-${reload.status.toLowerCase()}`}>
              <div className={`reload-status-icon status-${reload.status.toLowerCase()}`}>
                {getStatusIcon(reload.status)}
              </div>
              <div className="reload-info">
                <div className="reload-status-text">{reload.status}</div>
                <div className="reload-time">{formatDate(reload.startTime)}</div>
              </div>
              <div className="reload-meta">
                {reload.duration && (
                  <span className="reload-duration">
                    <Timer size={12} /> {formatDuration(reload.duration)}
                  </span>
                )}
                {reload.partial && <span className="reload-badge partial">Partial</span>}
              </div>
              <div className="reload-actions">
                <button
                  className="btn-view-log"
                  onClick={() => sendAction("Show reload log and details", { reloadId: reload.id })}
                  title="View reload log"
                >
                  <FileText size={14} /> Log
                </button>
                {reload.status === "RUNNING" && (
                  <button className="btn-cancel-small" onClick={() => sendAction("Cancel this reload", { reloadId: reload.id })}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

function ReloadStatus({ data }: { data: any }) {
  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">Reload Status</span>
        <span className={`results-badge ${data.status === "SUCCEEDED" ? "green" : data.status === "FAILED" ? "red" : ""}`}>{data.status}</span>
      </div>
      <div className="results-stats">
        <div className="results-stat">
          <span className="stat-label">ID</span>
          <span className="stat-value mono">{data.id?.slice(0, 12)}...</span>
        </div>
        <div className="results-stat">
          <span className="stat-label">Started</span>
          <span className="stat-value">{formatDate(data.startTime)}</span>
        </div>
        <div className="results-stat">
          <span className="stat-label">Duration</span>
          <span className="stat-value">{data.duration ? `${Math.round(data.duration / 1000)}s` : "In progress"}</span>
        </div>
      </div>
    </div>
  );
}

function ReloadDetail({ data }: { data: any }) {
  const statusClass = data.status === "SUCCEEDED" ? "green" :
                      data.status === "FAILED" ? "error" : "warning";

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {data.status === "SUCCEEDED" ? <CheckCircle size={16} /> :
           data.status === "FAILED" ? <XCircle size={16} /> :
           <RefreshCw size={16} className={data.status === "RUNNING" ? "spinning" : ""} />}
          Reload Status
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className={`results-badge ${statusClass}`}>{data.status}</span>
          {data.startTime && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatDate(data.startTime)}</span>}
          {data.historyLink && (
            <a href={data.historyLink} target="_blank" rel="noopener noreferrer" className="small-btn">
              <ExternalLink size={12} /> View in Qlik
            </a>
          )}
        </div>
      </div>
      <div className="reload-detail-info">
        <div className="reload-detail-row">
          <span className="label">Reload ID</span>
          <span className="value mono">{data.id}</span>
        </div>
        <div className="reload-detail-row">
          <span className="label">App ID</span>
          <span className="value mono">{data.appId}</span>
        </div>
        {data.endTime && (
          <div className="reload-detail-row">
            <span className="label">Ended</span>
            <span className="value">{formatDate(data.endTime)}</span>
          </div>
        )}
        {data.duration && (
          <div className="reload-detail-row">
            <span className="label">Duration</span>
            <span className="value">{Math.round(data.duration / 1000)}s</span>
          </div>
        )}
        {data.reloadType && (
          <div className="reload-detail-row">
            <span className="label">Type</span>
            <span className="value">{data.reloadType}</span>
          </div>
        )}
        {data.errorMessage && (
          <div className="reload-detail-row error-row">
            <span className="label">Error</span>
            <span className="value error-text">{data.errorMessage}</span>
          </div>
        )}
      </div>
      {data.log && (
        <div className="reload-log-section">
          <div className="reload-log-header">
            <FileText size={16} />
            <span>Reload Log</span>
          </div>
          <pre className="reload-log-content">{data.log}</pre>
        </div>
      )}
    </div>
  );
}

// ============ AUTOMATIONS ============
function AutomationsGrid({ data, callTool }: { data: any; callTool: any }) {
  const [filter, setFilter] = useState("");
  const allAutomations = data.automations || [];

  const filtered = allAutomations.filter((auto: any) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return auto.name?.toLowerCase().includes(search) ||
           auto.state?.toLowerCase().includes(search);
  });

  const pagination = usePagination(filtered);

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{filtered.length} automation{filtered.length !== 1 ? 's' : ''}{filter && ` (filtered from ${allAutomations.length})`}</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Search automations..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">{filter ? `No automations match "${filter}"` : "No automations found"}</div>
      ) : (
        <div className="results-list">
          {pagination.items.map((auto: any) => (
            <button key={auto.id} className="result-row" onClick={() => callTool("automation", { automationId: auto.id }, { name: auto.name, id: auto.id, type: "automation" })}>
              <span className="result-icon"><Zap size={16} /></span>
              <span className="result-name">{auto.name}</span>
              <span className="result-meta">{auto.state}</span>
              <span className="result-date">{auto.lastRunStatus || "Never run"}</span>
              <span className="result-arrow"><ChevronRight size={16} /></span>
            </button>
          ))}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

function AutomationDetail({ data, sendAction }: { data: any; sendAction: (action: string, context?: Record<string, string>) => void }) {
  return (
    <Card header={{ label: "Automation", title: data.name, gradient: "pink" }}>
      <div className="stats-grid">
        <Stat label="State" value={data.state} />
        <Stat label="Run Mode" value={data.runMode || "Manual"} />
        <Stat label="Last Run" value={data.lastRunStatus || "Never"} />
        <Stat label="Created" value={formatDate(data.createdAt)} />
      </div>
      <div className="action-buttons">
        <button className="btn primary" onClick={() => sendAction("Run this automation now", { automationId: data.id, automationName: data.name })}>
          Run Now
        </button>
        <button className="btn secondary" onClick={() => sendAction("Show run history for this automation", { automationId: data.id, automationName: data.name })}>
          Run History
        </button>
      </div>
    </Card>
  );
}

function AutomationRuns({ data }: { data: any }) {
  const pagination = usePagination(data.runs || []);

  return (
    <Card header={{ label: "Runs", title: `${data.runs?.length || 0} Executions`, gradient: "pink" }}>
      {pagination.items.length === 0 ? (
        <div className="empty-state">No runs found</div>
      ) : (
        <div className="timeline">
          {pagination.items.map((run: any) => (
            <div key={run.id} className={`timeline-item ${run.status?.toLowerCase()}`}>
              <div className={`tl-icon status-${run.status?.toLowerCase()}`}></div>
              <div className="tl-content">
                <div className="tl-title">{run.status}</div>
                <div className="tl-time">{formatDate(run.startTime)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination {...pagination} />
    </Card>
  );
}

// ============ ALERTS ============
function AlertsGrid({ data, callTool }: { data: any; callTool: any }) {
  const [filter, setFilter] = useState("");
  const allAlerts = data.alerts || [];

  const filtered = allAlerts.filter((alert: any) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return alert.name?.toLowerCase().includes(search);
  });

  const pagination = usePagination(filtered);

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{filtered.length} alert{filtered.length !== 1 ? 's' : ''}{filter && ` (filtered from ${allAlerts.length})`}</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Search alerts..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">{filter ? `No alerts match "${filter}"` : "No alerts found"}</div>
      ) : (
        <div className="results-list">
          {pagination.items.map((alert: any) => (
            <button key={alert.id} className="result-row" onClick={() => callTool("alert", { alertId: alert.id }, { name: alert.name, id: alert.id, type: "alert" })}>
              <span className="result-icon"><Bell size={16} /></span>
              <span className="result-name">{alert.name}</span>
              <span className={`result-badge ${alert.enabled ? 'enabled' : 'disabled'}`}>
                {alert.enabled ? "Enabled" : "Disabled"}
              </span>
              <span className="result-arrow"><ChevronRight size={16} /></span>
            </button>
          ))}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

function AlertDetail({ data, sendAction, openLink }: { data: any; sendAction: (action: string, context?: Record<string, string>) => void; openLink?: (url: string) => void }) {
  // Build Qlik Cloud alert URL
  const alertUrl = data.tenantUrl ? `${data.tenantUrl}/alerts/${data.id}` : null;

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} />
          {data.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={`results-badge ${data.enabled ? 'green' : ''}`}>
            {data.enabled ? 'Enabled' : 'Disabled'}
          </span>
          {alertUrl && openLink && (
            <button className="small-btn" onClick={() => openLink(alertUrl)}>
              <ExternalLink size={12} /> Open
            </button>
          )}
        </div>
      </div>
      {data.description && (
        <p className="alert-description">{data.description}</p>
      )}
      <div className="detail-info-rows">
        {data.lastTriggered && (
          <div className="detail-row">
            <span className="detail-label">Last Triggered</span>
            <span className="detail-value">{formatDate(data.lastTriggered)}</span>
          </div>
        )}
        {data.triggerCount !== undefined && (
          <div className="detail-row">
            <span className="detail-label">Trigger Count</span>
            <span className="detail-value">{data.triggerCount}</span>
          </div>
        )}
        {data.condition && (
          <div className="detail-row">
            <span className="detail-label">Condition</span>
            <span className="detail-value">{data.condition}</span>
          </div>
        )}
        {data.appId && (
          <div className="detail-row">
            <span className="detail-label">App</span>
            <span className="detail-value mono">{data.appName || data.appId}</span>
          </div>
        )}
      </div>
      {data.recipients && data.recipients.length > 0 && (
        <div className="alert-recipients">
          <div className="recipients-label">Recipients ({data.recipients.length})</div>
          <div className="recipients-list">
            {data.recipients.slice(0, 5).map((r: any, i: number) => (
              <span key={i} className="recipient-tag">{r.name || r.email || r}</span>
            ))}
            {data.recipients.length > 5 && <span className="recipient-more">+{data.recipients.length - 5} more</span>}
          </div>
        </div>
      )}
      <div className="compact-actions">
        <button className="small-btn primary" onClick={() => sendAction("Trigger this alert now", { alertId: data.id, alertName: data.name })}>
          <Bell size={12} /> Run
        </button>
        <button className="small-btn danger" onClick={() => sendAction("Delete this alert", { alertId: data.id, alertName: data.name })}>
          Delete
        </button>
      </div>
    </div>
  );
}

// ============ AI ASSISTANTS ============
function AssistantsGrid({ data, callTool }: { data: any; callTool: any }) {
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");

  const allAssistants = data.assistants || [];

  // Filter assistants
  const filtered = allAssistants.filter((asst: any) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return (
      asst.name?.toLowerCase().includes(search) ||
      asst.description?.toLowerCase().includes(search)
    );
  });

  // Sort assistants
  const sorted = [...filtered].sort((a: any, b: any) => {
    const desc = sortBy.startsWith("-");
    const field = sortBy.replace("-", "");
    let aVal = a[field] || "";
    let bVal = b[field] || "";
    aVal = String(aVal).toLowerCase();
    bVal = String(bVal).toLowerCase();
    if (desc) return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
    return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
  });

  const pagination = usePagination(sorted);

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{sorted.length} assistant{sorted.length !== 1 ? 's' : ''}{filter && ` (filtered from ${allAssistants.length})`}</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Filter assistants..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Name A-Z</option>
          <option value="-name">Name Z-A</option>
        </select>
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">No assistants found</div>
      ) : (
        <div className="results-list">
          {pagination.items.map((asst: any) => (
            <button
              key={asst.id}
              className="result-row"
              onClick={() => callTool("assistant", { assistantId: asst.id }, { name: asst.name, id: asst.id, type: "assistant" })}
            >
              <span className="result-icon"><Bot size={16} /></span>
              <span className="result-name">{asst.name}</span>
              {asst.description && <span className="result-meta">{asst.description.slice(0, 40)}{asst.description.length > 40 ? "..." : ""}</span>}
              <span className="result-arrow"><ChevronRight size={16} /></span>
            </button>
          ))}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

function AssistantDetail({ data, sendAction }: { data: any; sendAction: (action: string, context?: Record<string, string>) => void }) {
  const [question, setQuestion] = useState("");

  const handleAsk = () => {
    if (question.trim()) {
      sendAction(`Ask the Qlik Answers assistant "${data.name}": ${question.trim()}`, { assistantId: data.id });
      setQuestion("");
    }
  };

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{data.name}</span>
        {data.status && <span className={`results-badge ${data.status.toLowerCase() === "active" ? "green" : ""}`}>{data.status}</span>}
      </div>
      <div className="results-content">
        <Bot size={24} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
        {data.description && <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{data.description}</span>}
      </div>
      <div className="results-details">
        <div className="detail-row">
          <span className="detail-label">Created</span>
          <span className="detail-value">{formatDate(data.createdAt)}</span>
        </div>
        {data.updatedAt && (
          <div className="detail-row">
            <span className="detail-label">Updated</span>
            <span className="detail-value">{formatDate(data.updatedAt)}</span>
          </div>
        )}
        {data.ownerId && (
          <div className="detail-row">
            <span className="detail-label">Owner</span>
            <span className="detail-value">{data.ownerName || data.ownerId}</span>
          </div>
        )}
        {data.visibility && (
          <div className="detail-row">
            <span className="detail-label">Visibility</span>
            <span className="detail-value">{data.visibility}</span>
          </div>
        )}
        {data.spaceId && (
          <div className="detail-row">
            <span className="detail-label">Space</span>
            <span className="detail-value">{data.spaceName || data.spaceId}</span>
          </div>
        )}
        <div className="detail-row">
          <span className="detail-label">ID</span>
          <span className="detail-value mono">{data.id}</span>
        </div>
      </div>
      <div className="results-toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>Ask a question</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            className="text-input"
            placeholder="e.g., What is the total revenue?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          />
          <button className="result-action-btn" onClick={handleAsk} disabled={!question.trim()}>
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatResponse({ data, callTool }: { data: any; callTool: any }) {
  const [followUp, setFollowUp] = useState("");
  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">Qlik Answers</span>
      </div>
      <div className="chat-messages">
        <div className="chat-bubble user">
          <div className="bubble-content">{data.question}</div>
        </div>
        <div className="chat-bubble assistant">
          <div className="bubble-content">{data.answer}</div>
        </div>
      </div>
      {data.sources && data.sources.length > 0 && (
        <div className="sources">
          <div className="sources-label">Sources:</div>
          {data.sources.map((src: any, i: number) => (
            <span key={i} className="source-chip">{src.name || src}</span>
          ))}
        </div>
      )}
      {data.threadId && (
        <div className="results-toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="text-input"
              placeholder="Follow-up question..."
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && followUp.trim()) {
                  callTool("qlik_answers_ask_question", { assistantId: data.assistantId, question: followUp, threadId: data.threadId });
                  setFollowUp("");
                }
              }}
            />
            <button className="result-action-btn" onClick={() => {
              if (followUp.trim()) {
                callTool("qlik_answers_ask_question", { assistantId: data.assistantId, question: followUp, threadId: data.threadId });
                setFollowUp("");
              }
            }}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ REAL CHART VIEW ============
function ChartView({ data }: { data: any }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !data.labels?.length || !data.values?.length) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    // Determine chart type first to decide sampling
    const chartType = data.chartType?.toLowerCase() || "bar";
    const isBarType = chartType.includes("bar") || chartType.includes("column") || chartType.includes("histogram");
    const isLineType = chartType.includes("line") || chartType.includes("trend") || chartType.includes("area");
    const isScatterType = chartType.includes("scatter") || chartType.includes("point");
    const hasSecondMeasure = data.values2?.length > 0;

    // Sample data based on chart type
    let labels = data.labels;
    let values = data.values;
    let values2 = data.values2 || [];
    const maxPoints = isBarType ? 30 : isLineType ? 100 : 50;

    if (labels.length > maxPoints && !isScatterType) {
      if (isBarType) {
        const paired = labels.map((l: string, i: number) => ({ label: l, value: values[i], value2: values2[i] }));
        paired.sort((a: any, b: any) => b.value - a.value);
        const top = paired.slice(0, maxPoints);
        labels = top.map((p: any) => p.label);
        values = top.map((p: any) => p.value);
        values2 = top.map((p: any) => p.value2);
      } else {
        const step = Math.ceil(labels.length / maxPoints);
        labels = labels.filter((_: string, i: number) => i % step === 0);
        values = values.filter((_: number, i: number) => i % step === 0);
        values2 = values2.filter((_: number, i: number) => i % step === 0);
      }
    }

    // Map Qlik chart types to Chart.js
    let type: "bar" | "line" | "pie" | "doughnut" | "polarArea" | "radar" | "scatter" = "bar";
    if (isScatterType && hasSecondMeasure) {
      type = "scatter"; // True scatter plot with 2 measures
    } else if (chartType.includes("line") || chartType.includes("trend") || chartType.includes("combo")) {
      type = "line";
    } else if (chartType.includes("pie")) {
      type = "pie";
    } else if (chartType.includes("donut") || chartType.includes("ring")) {
      type = "doughnut";
    } else if (chartType.includes("treemap") || chartType.includes("tree")) {
      type = "doughnut";
    } else if (chartType.includes("radar") || chartType.includes("spider")) {
      type = "radar";
    } else if (chartType.includes("polar") || chartType.includes("rose")) {
      type = "polarArea";
    } else if (chartType.includes("area")) {
      type = "line";
    } else if (isScatterType) {
      type = "line"; // Fallback for scatter without 2 measures
    } else if (chartType.includes("bar") || chartType.includes("column") || chartType.includes("histogram")) {
      type = "bar";
    }

    // Beautiful gradient for area fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 350);
    gradient.addColorStop(0, "rgba(84, 168, 96, 0.5)");
    gradient.addColorStop(0.5, "rgba(84, 168, 96, 0.2)");
    gradient.addColorStop(1, "rgba(84, 168, 96, 0.02)");

    // Rich color palette for pie/doughnut/polar/radar (40 distinct colors)
    const richColors = [
      // Primary vibrant
      "#54a860", "#5b8def", "#f97316", "#ec4899", "#8b5cf6",
      "#06b6d4", "#fbbf24", "#22c55e", "#f43f5e", "#6366f1",
      // Secondary
      "#14b8a6", "#a855f7", "#f59e0b", "#3b82f6", "#ef4444",
      "#10b981", "#8b5cf6", "#f472b6", "#38bdf8", "#fb923c",
      // Tertiary
      "#84cc16", "#e879f9", "#22d3ee", "#facc15", "#a3e635",
      "#c084fc", "#2dd4bf", "#fca5a1", "#818cf8", "#34d399",
      // Extended
      "#d946ef", "#0ea5e9", "#eab308", "#f87171", "#a78bfa",
      "#4ade80", "#fb7185", "#60a5fa", "#fcd34d", "#c4b5fd",
    ];
    const richColorsAlpha = richColors.map(c => c + "cc"); // 80% opacity

    // Format large numbers
    const formatNumber = (num: number) => {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
      if (num >= 1000) return (num / 1000).toFixed(0) + "K";
      return num.toFixed(0);
    };

    // Build dataset config based on chart type
    const isPieType = type === "pie" || type === "doughnut" || type === "polarArea";
    const isRadar = type === "radar";
    const isLine = type === "line";
    const isBar = type === "bar";
    const isScatter = type === "scatter";

    // Get measure names for axis labels
    const measureNames = data.measureNames || [];
    const xAxisLabel = measureNames[0] || "Value 1";
    const yAxisLabel = measureNames[1] || "Value 2";

    const datasetConfig: any = {
      label: data.title || "Value",
      data: values,
    };

    if (isScatter && hasSecondMeasure) {
      // Scatter plot with 2 measures: x = first measure, y = second measure
      datasetConfig.data = values.map((v: number, i: number) => ({ x: v, y: values2[i] }));
      datasetConfig.backgroundColor = "#54a860";
      datasetConfig.borderColor = "#54a860";
      datasetConfig.pointRadius = 8;
      datasetConfig.pointHoverRadius = 12;
      datasetConfig.pointStyle = "circle";
    } else if (isPieType) {
      datasetConfig.backgroundColor = richColorsAlpha;
      datasetConfig.borderColor = richColors;
      datasetConfig.borderWidth = 2;
      datasetConfig.hoverOffset = 8;
    } else if (isRadar) {
      datasetConfig.backgroundColor = "rgba(84, 168, 96, 0.3)";
      datasetConfig.borderColor = "#54a860";
      datasetConfig.borderWidth = 2;
      datasetConfig.pointBackgroundColor = "#54a860";
      datasetConfig.pointRadius = 4;
      datasetConfig.pointHoverRadius = 6;
    } else if (isLine) {
      datasetConfig.backgroundColor = gradient;
      datasetConfig.borderColor = "#54a860";
      datasetConfig.borderWidth = 2.5;
      datasetConfig.tension = 0.35;
      datasetConfig.fill = true;
      datasetConfig.pointBackgroundColor = "#54a860";
      datasetConfig.pointBorderColor = "#1a1a2e";
      datasetConfig.pointBorderWidth = 2;
      datasetConfig.pointRadius = labels.length > 50 ? 0 : 4;
      datasetConfig.pointHoverRadius = 6;
      datasetConfig.pointHoverBackgroundColor = "#fff";
    } else if (isBar) {
      const barGradient = ctx.createLinearGradient(0, 0, 0, 350);
      barGradient.addColorStop(0, "rgba(84, 168, 96, 0.9)");
      barGradient.addColorStop(1, "rgba(84, 168, 96, 0.4)");
      datasetConfig.backgroundColor = barGradient;
      datasetConfig.borderColor = "#54a860";
      datasetConfig.borderWidth = 0;
      datasetConfig.borderRadius = 4;
      datasetConfig.borderSkipped = false;
    }

    chartRef.current = new Chart(ctx, {
      type,
      data: {
        labels: isScatter ? undefined : labels, // Scatter plots don't use labels
        datasets: [datasetConfig],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: isScatter ? "nearest" : "index", intersect: isScatter },
        plugins: {
          legend: { display: isPieType, position: "right", labels: { color: "#a8a8b3", padding: 12 } },
          tooltip: {
            backgroundColor: "rgba(20, 20, 30, 0.95)",
            titleColor: "#fff",
            bodyColor: "#54a860",
            bodyFont: { size: 14, weight: "bold" as const },
            padding: 14,
            cornerRadius: 8,
            displayColors: false,
            callbacks: isScatter ? {
              title: (items: any) => labels[items[0]?.dataIndex] || '',
              label: (ctx: any) => [
                `${xAxisLabel}: ${formatNumber(ctx.parsed.x)}`,
                `${yAxisLabel}: ${formatNumber(ctx.parsed.y)}`
              ],
            } : {
              label: (ctx: any) => formatNumber(ctx.parsed.y ?? ctx.parsed),
            },
          },
        },
        scales: isPieType ? {} : isRadar ? {
          r: {
            grid: { color: "rgba(255,255,255,0.1)" },
            angleLines: { color: "rgba(255,255,255,0.1)" },
            pointLabels: { color: "#a8a8b3", font: { size: 11 } },
            ticks: { display: false },
          },
        } : isScatter ? {
          x: {
            type: "linear" as const,
            position: "bottom" as const,
            title: { display: true, text: xAxisLabel, color: "#a8a8b3" },
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: {
              color: "#6b6b7b",
              callback: (value: string | number) => formatNumber(Number(value)),
              font: { size: 10 },
            },
          },
          y: {
            type: "linear" as const,
            title: { display: true, text: yAxisLabel, color: "#a8a8b3" },
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: {
              color: "#6b6b7b",
              callback: (value: string | number) => formatNumber(Number(value)),
              font: { size: 11 },
            },
          },
        } : {
          x: {
            grid: { color: "rgba(255,255,255,0.03)" },
            ticks: {
              color: "#6b6b7b",
              maxRotation: isBar ? 45 : 45,
              minRotation: 0,
              maxTicksLimit: isBar ? 10 : 15,
              font: { size: 10 },
            },
          },
          y: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: {
              color: "#6b6b7b",
              callback: (value: string | number) => formatNumber(Number(value)),
              font: { size: 11 },
            },
            beginAtZero: true,
          },
        },
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [data]);

  const hasChartData = data.labels?.length > 0 && data.values?.length > 0;
  const hasFullTableData = data.tableData?.headers?.length > 0 && data.tableData?.rows?.length > 0;
  const hasSimpleTableData = data.labels?.length > 0 && (!data.values || data.values.length === 0);
  const isTableType = data.chartType?.toLowerCase() === "table";

  return (
    <div className="chart-container">
      <div className="chart-header">
        <div className="chart-title">{data.title || data.question}</div>
        {data.appLink && (
          <button
            className="open-qlik-btn"
            onClick={() => window.open(data.appLink, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink size={14} /> Open in Qlik
          </button>
        )}
      </div>
      <div className="chart-body">
        {hasChartData ? (
          <canvas ref={canvasRef} />
        ) : hasFullTableData ? (
          <div className="data-table-wrapper">
            <div className="data-table-info">{data.tableData.rows.length} rows</div>
            <table className="data-table">
              <thead>
                <tr>
                  {data.tableData.headers.map((h: string, i: number) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.tableData.rows.slice(0, 100).map((row: string[], i: number) => (
                  <tr key={i}>
                    {row.map((cell: string, j: number) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.tableData.rows.length > 100 && (
              <div className="data-table-more">Showing first 100 of {data.tableData.rows.length} rows</div>
            )}
          </div>
        ) : (isTableType || hasSimpleTableData) && data.labels?.length > 0 ? (
          <div className="values-table">
            <div className="values-table-header">
              <span className="values-count">{data.labels.length} values</span>
            </div>
            <div className="values-list">
              {data.labels.slice(0, 50).map((label: string, i: number) => (
                <div key={i} className="value-item">
                  <span className="value-index">{i + 1}</span>
                  <span className="value-text">{label}</span>
                </div>
              ))}
              {data.labels.length > 50 && (
                <div className="values-more">+ {data.labels.length - 50} more values</div>
              )}
            </div>
          </div>
        ) : (
          <div className="chart-error">
            <div className="error-icon"><AlertTriangle size={32} /></div>
            <div className="error-text">{data.error || "Unable to load chart data"}</div>
            <div className="error-hint">Try opening in Qlik Sense for full visualization</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ INSIGHTS ============
// Chart type to visual config mapping
const chartConfig: Record<string, { icon: string; gradient: string; color: string }> = {
  barchart: { icon: "bar", gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "#667eea" },
  combochart: { icon: "combo", gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)", color: "#f093fb" },
  linechart: { icon: "line", gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", color: "#4facfe" },
  piechart: { icon: "pie", gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)", color: "#fa709a" },
  scatterplot: { icon: "scatter", gradient: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)", color: "#a8edea" },
  kpi: { icon: "kpi", gradient: "linear-gradient(135deg, #54a860 0%, #2dd4bf 100%)", color: "#54a860" },
  table: { icon: "table", gradient: "linear-gradient(135deg, #5b8def 0%, #818cf8 100%)", color: "#5b8def" },
  treemap: { icon: "treemap", gradient: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)", color: "#f97316" },
  map: { icon: "map", gradient: "linear-gradient(135deg, #22c55e 0%, #84cc16 100%)", color: "#22c55e" },
  pivot: { icon: "pivot", gradient: "linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)", color: "#8b5cf6" },
  waterfall: { icon: "waterfall", gradient: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)", color: "#06b6d4" },
  boxplot: { icon: "boxplot", gradient: "linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)", color: "#ec4899" },
  histogram: { icon: "histogram", gradient: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)", color: "#8b5cf6" },
  default: { icon: "chart", gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "#667eea" },
};

// Mini chart SVG components
function MiniBarChart({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 80 50" className="mini-chart">
      <rect x="5" y="30" width="12" height="20" rx="2" fill={color} opacity="0.6" />
      <rect x="22" y="15" width="12" height="35" rx="2" fill={color} opacity="0.8" />
      <rect x="39" y="25" width="12" height="25" rx="2" fill={color} opacity="0.7" />
      <rect x="56" y="8" width="12" height="42" rx="2" fill={color} />
    </svg>
  );
}

function MiniLineChart({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 80 50" className="mini-chart">
      <path d="M5 40 L20 28 L35 32 L50 15 L65 20 L75 8" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="28" r="3" fill={color} />
      <circle cx="50" cy="15" r="3" fill={color} />
      <circle cx="75" cy="8" r="3" fill={color} />
    </svg>
  );
}

function MiniPieChart({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 80 50" className="mini-chart">
      <circle cx="40" cy="25" r="20" fill={color} opacity="0.3" />
      <path d="M40 25 L40 5 A20 20 0 0 1 58 35 Z" fill={color} opacity="0.8" />
      <path d="M40 25 L58 35 A20 20 0 0 1 25 38 Z" fill={color} />
    </svg>
  );
}

function MiniKPI({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 80 50" className="mini-chart">
      <text x="40" y="32" textAnchor="middle" fontSize="24" fontWeight="bold" fill={color}>42K</text>
      <path d="M55 38 L62 32 L55 26" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MiniScatter({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 80 50" className="mini-chart">
      <circle cx="15" cy="35" r="4" fill={color} opacity="0.6" />
      <circle cx="25" cy="28" r="5" fill={color} opacity="0.7" />
      <circle cx="40" cy="20" r="4" fill={color} opacity="0.8" />
      <circle cx="55" cy="15" r="6" fill={color} />
      <circle cx="68" cy="25" r="4" fill={color} opacity="0.7" />
    </svg>
  );
}

function MiniTreemap({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 80 50" className="mini-chart">
      <rect x="5" y="5" width="35" height="25" rx="2" fill={color} />
      <rect x="44" y="5" width="31" height="12" rx="2" fill={color} opacity="0.7" />
      <rect x="44" y="20" width="15" height="10" rx="2" fill={color} opacity="0.5" />
      <rect x="62" y="20" width="13" height="10" rx="2" fill={color} opacity="0.6" />
      <rect x="5" y="33" width="20" height="12" rx="2" fill={color} opacity="0.6" />
      <rect x="28" y="33" width="47" height="12" rx="2" fill={color} opacity="0.4" />
    </svg>
  );
}

function MiniTable({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 80 50" className="mini-chart">
      <rect x="5" y="5" width="70" height="8" rx="2" fill={color} opacity="0.8" />
      <rect x="5" y="16" width="70" height="6" rx="1" fill={color} opacity="0.3" />
      <rect x="5" y="25" width="70" height="6" rx="1" fill={color} opacity="0.2" />
      <rect x="5" y="34" width="70" height="6" rx="1" fill={color} opacity="0.3" />
      <rect x="5" y="43" width="70" height="6" rx="1" fill={color} opacity="0.2" />
    </svg>
  );
}

function MiniCombo({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 80 50" className="mini-chart">
      <rect x="8" y="28" width="10" height="20" rx="2" fill={color} opacity="0.6" />
      <rect x="28" y="18" width="10" height="30" rx="2" fill={color} opacity="0.7" />
      <rect x="48" y="22" width="10" height="26" rx="2" fill={color} opacity="0.6" />
      <rect x="68" y="12" width="10" height="36" rx="2" fill={color} opacity="0.8" />
      <path d="M13 25 L33 15 L53 20 L73 8" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function MiniChart({ type, color }: { type: string; color: string }) {
  const chartType = type?.toLowerCase() || "default";
  if (chartType.includes("bar")) return <MiniBarChart color={color} />;
  if (chartType.includes("line")) return <MiniLineChart color={color} />;
  if (chartType.includes("pie") || chartType.includes("donut")) return <MiniPieChart color={color} />;
  if (chartType.includes("kpi")) return <MiniKPI color={color} />;
  if (chartType.includes("scatter")) return <MiniScatter color={color} />;
  if (chartType.includes("tree")) return <MiniTreemap color={color} />;
  if (chartType.includes("table")) return <MiniTable color={color} />;
  if (chartType.includes("combo")) return <MiniCombo color={color} />;
  return <MiniBarChart color={color} />;
}

function getChartConfig(type: string) {
  const t = type?.toLowerCase() || "";
  if (t.includes("bar")) return chartConfig.barchart;
  if (t.includes("combo")) return chartConfig.combochart;
  if (t.includes("line")) return chartConfig.linechart;
  if (t.includes("pie") || t.includes("donut")) return chartConfig.piechart;
  if (t.includes("scatter")) return chartConfig.scatterplot;
  if (t.includes("kpi")) return chartConfig.kpi;
  if (t.includes("table")) return chartConfig.table;
  if (t.includes("tree")) return chartConfig.treemap;
  if (t.includes("map")) return chartConfig.map;
  if (t.includes("pivot")) return chartConfig.pivot;
  if (t.includes("waterfall")) return chartConfig.waterfall;
  if (t.includes("box")) return chartConfig.boxplot;
  if (t.includes("histogram")) return chartConfig.histogram;
  return chartConfig.default;
}

function InsightsView({ data }: { data: any }) {
  const insights = data.insights || [];

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{insights.length} insight{insights.length !== 1 ? "s" : ""}</span>
        {data.insightAdvisorLink && (
          <a href={data.insightAdvisorLink} target="_blank" rel="noopener noreferrer" className="results-link">
            <ExternalLink size={12} /> Open in Qlik
          </a>
        )}
      </div>
      {data.question && (
        <div className="results-subtitle">
          <span>✨ {data.question}</span>
        </div>
      )}

      {insights.length === 0 ? (
        <div className="empty-state">No insights found for this question</div>
      ) : (
        <div className="insights-grid">
          {insights.map((insight: any, i: number) => {
            const config = getChartConfig(insight.analysisType);
            const fields = insight.fields || [];
            const dimensions = fields.filter((f: any) => f.type === "dimension");
            const measures = fields.filter((f: any) => f.type === "measure");

            return (
              <div key={i} className="insight-card-v2">
                <div className="insight-visual" style={{ background: config.gradient }}>
                  <MiniChart type={insight.analysisType} color="white" />
                  <div className="chart-type-badge">{insight.analysisType || "Chart"}</div>
                </div>
                <div className="insight-content">
                  <div className="insight-caption">{insight.caption || `Visualization ${i + 1}`}</div>
                  {fields.length > 0 && (
                    <div className="insight-fields">
                      {dimensions.slice(0, 2).map((d: any, j: number) => (
                        <span key={`d-${j}`} className="field-tag dimension" title={d.name}>{d.label || d.name}</span>
                      ))}
                      {measures.slice(0, 2).map((m: any, j: number) => (
                        <span key={`m-${j}`} className="field-tag measure" title={m.name}>{m.label || m.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ AUTOML ============
function ExperimentsGrid({ data, callTool }: { data: any; callTool: any }) {
  const [filter, setFilter] = useState("");
  const allExperiments = data.experiments || [];

  const filtered = allExperiments.filter((exp: any) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return exp.name?.toLowerCase().includes(search) ||
           exp.status?.toLowerCase().includes(search);
  });

  const pagination = usePagination(filtered);

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{filtered.length} experiment{filtered.length !== 1 ? 's' : ''}{filter && ` (filtered from ${allExperiments.length})`}</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Search experiments..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">{filter ? `No experiments match "${filter}"` : "No experiments found"}</div>
      ) : (
        <div className="results-list">
          {pagination.items.map((exp: any) => (
            <button key={exp.id} className="result-row" onClick={() => callTool("experiment", { experimentId: exp.id }, { name: exp.name, id: exp.id, type: "experiment" })}>
              <span className="result-icon"><GitBranch size={16} /></span>
              <span className="result-name">{exp.name || "Unnamed"}</span>
              {exp.status && <span className="result-badge">{exp.status}</span>}
              <span className="result-arrow"><ChevronRight size={16} /></span>
            </button>
          ))}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

function ExperimentDetail({ data, openLink }: { data: any; openLink?: (url: string) => void }) {
  // Handle nested data structure from API: data.data.attributes
  const attrs = data.data?.attributes || data.attributes || data;
  const id = data.data?.id || data.id;
  const name = attrs.name || data.name || "Experiment";
  const experimentUrl = data.tenantUrl && id ? `${data.tenantUrl}/automl/experiments/${id}` : null;

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={16} />
          {name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {attrs.status && <span className="results-badge green">{attrs.status}</span>}
          {experimentUrl && openLink && (
            <button className="small-btn" onClick={() => openLink(experimentUrl)}>
              <ExternalLink size={12} /> Open
            </button>
          )}
        </div>
      </div>
      <div className="detail-info-rows">
        {(attrs.targetFeature || attrs.target) && (
          <div className="detail-row">
            <span className="detail-label">Target Feature</span>
            <span className="detail-value">{attrs.targetFeature || attrs.target}</span>
          </div>
        )}
        <div className="detail-row">
          <span className="detail-label">Algorithm</span>
          <span className="detail-value">{attrs.algorithm || "Auto"}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Created</span>
          <span className="detail-value">{formatDate(attrs.createdAt)}</span>
        </div>
        {attrs.updatedAt && attrs.updatedAt !== attrs.createdAt && (
          <div className="detail-row">
            <span className="detail-label">Updated</span>
            <span className="detail-value">{formatDate(attrs.updatedAt)}</span>
          </div>
        )}
        {attrs.ownerId && (
          <div className="detail-row">
            <span className="detail-label">Owner ID</span>
            <span className="detail-value mono">{attrs.ownerId}</span>
          </div>
        )}
      </div>
      {attrs.description && (
        <div className="detail-description">
          <span className="detail-label">Description</span>
          <p>{attrs.description}</p>
        </div>
      )}
    </div>
  );
}

function DeploymentDetail({ data, openLink }: { data: any; openLink?: (url: string) => void }) {
  // Handle nested data structure from API
  const attrs = data.data?.attributes || data.attributes || data;
  const id = data.data?.id || data.id;
  const name = attrs.name || data.name || "Deployment";
  const deploymentUrl = data.tenantUrl && id ? `${data.tenantUrl}/automl/deployments/${id}` : null;

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Play size={16} />
          {name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {attrs.enablePredictions && <span className="results-badge green">Active</span>}
          {attrs.deprecated && <span className="results-badge error">Deprecated</span>}
          {!attrs.enablePredictions && !attrs.deprecated && <span className="results-badge">Inactive</span>}
          {deploymentUrl && openLink && (
            <button className="small-btn" onClick={() => openLink(deploymentUrl)}>
              <ExternalLink size={12} /> Open
            </button>
          )}
        </div>
      </div>
      <div className="detail-info-rows">
        {attrs.modelId && (
          <div className="detail-row">
            <span className="detail-label">Model ID</span>
            <span className="detail-value mono">{attrs.modelId}</span>
          </div>
        )}
        {attrs.experimentId && (
          <div className="detail-row">
            <span className="detail-label">Experiment ID</span>
            <span className="detail-value mono">{attrs.experimentId}</span>
          </div>
        )}
        <div className="detail-row">
          <span className="detail-label">Predictions</span>
          <span className="detail-value">
            {attrs.enablePredictions ? (
              <span style={{ color: 'var(--green)' }}>Enabled</span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>Disabled</span>
            )}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Created</span>
          <span className="detail-value">{formatDate(attrs.createdAt)}</span>
        </div>
        {attrs.updatedAt && attrs.updatedAt !== attrs.createdAt && (
          <div className="detail-row">
            <span className="detail-label">Updated</span>
            <span className="detail-value">{formatDate(attrs.updatedAt)}</span>
          </div>
        )}
        {attrs.ownerId && (
          <div className="detail-row">
            <span className="detail-label">Owner ID</span>
            <span className="detail-value mono">{attrs.ownerId}</span>
          </div>
        )}
      </div>
      {attrs.description && (
        <div className="detail-description">
          <span className="detail-label">Description</span>
          <p>{attrs.description}</p>
        </div>
      )}
    </div>
  );
}

function DeploymentsGrid({ data }: { data: any }) {
  const [filter, setFilter] = useState("");
  const allDeployments = data.deployments || [];

  const filtered = allDeployments.filter((dep: any) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return dep.name?.toLowerCase().includes(search) ||
           dep.status?.toLowerCase().includes(search);
  });

  const pagination = usePagination(filtered);

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{filtered.length} deployment{filtered.length !== 1 ? 's' : ''}{filter && ` (filtered from ${allDeployments.length})`}</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Search deployments..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">{filter ? `No deployments match "${filter}"` : "No deployments found"}</div>
      ) : (
        <div className="results-list">
          {pagination.items.map((dep: any) => (
            <div key={dep.id} className="result-row static">
              <span className="result-icon"><Share2 size={16} /></span>
              <span className="result-name">{dep.name || "Unnamed"}</span>
              {dep.status && <span className="result-badge">{dep.status}</span>}
            </div>
          ))}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

// ============ LINEAGE ============
function LineageView({ data, sendAction }: { data: any; sendAction: (action: string, context?: Record<string, string>) => void }) {
  // Handle nested graph structure from API
  const graph = data.graph || data;
  const nodesObj = graph.nodes || {};
  const edges = graph.edges || [];

  // Convert nodes object to array with IDs
  const nodesList = Object.entries(nodesObj).map(([id, node]: [string, any]) => ({
    id,
    label: node.label,
    type: node.metadata?.type || 'UNKNOWN',
    subtype: node.metadata?.subtype,
    fields: node.metadata?.fields,
    tables: node.metadata?.tables,
  }));

  // Build the linear flow based on edges
  const nodeIncoming = new Map<string, string[]>();
  const nodeOutgoing = new Map<string, string[]>();

  edges.forEach((edge: any) => {
    if (!nodeOutgoing.has(edge.source)) nodeOutgoing.set(edge.source, []);
    nodeOutgoing.get(edge.source)!.push(edge.target);

    if (!nodeIncoming.has(edge.target)) nodeIncoming.set(edge.target, []);
    nodeIncoming.get(edge.target)!.push(edge.source);
  });

  // Categorize nodes by their position in the flow
  const rootNodes = nodesList.filter(n => !nodeIncoming.has(n.id) || nodeIncoming.get(n.id)!.length === 0);
  const leafNodes = nodesList.filter(n => !nodeOutgoing.has(n.id) || nodeOutgoing.get(n.id)!.length === 0);
  const middleNodes = nodesList.filter(n =>
    nodeIncoming.has(n.id) && nodeIncoming.get(n.id)!.length > 0 &&
    nodeOutgoing.has(n.id) && nodeOutgoing.get(n.id)!.length > 0
  );

  const sourceNodes = rootNodes.filter(n => !leafNodes.includes(n));
  const processorNodes = middleNodes;
  const targetNodes = leafNodes.filter(n => !rootNodes.includes(n));
  const isStandalone = nodesList.length === 1 && edges.length === 0;

  // Get node styling based on type
  const getNodeStyle = (type: string, subtype?: string) => {
    const t = (type || '').toUpperCase();
    const s = (subtype || '').toUpperCase();
    if (t === 'DA_APP' || t.includes('APP')) return { icon: '◈', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.1)', label: 'App' };
    if (t === 'DATASET' && s === 'FILE') return { icon: '▤', color: '#059669', bg: 'rgba(5, 150, 105, 0.1)', label: 'QVD' };
    if (t === 'DATASET' && s === 'TABLE') return { icon: '▦', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.1)', label: 'Table' };
    if (s === 'TABLE') return { icon: '▦', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.1)', label: 'Table' };
    if (t === 'DATASET') return { icon: '▤', color: '#059669', bg: 'rgba(5, 150, 105, 0.1)', label: 'Dataset' };
    return { icon: '⬡', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', label: 'Source' };
  };

  // Render a node card with 3-dot menu
  const NodeCard = ({ node, isTarget = false }: { node: any; isTarget?: boolean }) => {
    const style = getNodeStyle(node.type, node.subtype);
    const resourceType = node.type?.includes('APP') ? 'app' : node.type === 'DATASET' ? 'dataset' : 'resource';
    return (
      <div className={`lineage-node-card ${isTarget ? 'target' : ''}`} style={{ borderColor: style.color }}>
        <div className="node-card-header" style={{ background: style.bg }}>
          <span className="node-card-icon" style={{ color: style.color }}>{style.icon}</span>
          <span className="node-card-type" style={{ color: style.color }}>{style.label}</span>
          <div className="node-card-menu">
            <ItemMenu item={{ id: node.id, name: node.label, resourceType }} sendAction={sendAction} />
          </div>
        </div>
        <div className="node-card-body">
          <span className="node-card-name">{node.label}</span>
          {(node.fields || node.tables) && (
            <div className="node-card-meta">
              {node.fields && <span>{node.fields} fields</span>}
              {node.tables && <span>{node.tables} tables</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Collapsible node list - shows first 3 nodes, then "show more"
  const NodeList = ({ nodes, isTarget = false }: { nodes: any[]; isTarget?: boolean }) => {
    const [expanded, setExpanded] = useState(false);
    const SHOW_LIMIT = 3;
    const hasMore = nodes.length > SHOW_LIMIT;
    const visibleNodes = expanded ? nodes : nodes.slice(0, SHOW_LIMIT);

    return (
      <div className="column-nodes">
        {visibleNodes.map((node: any, i: number) => (
          <NodeCard key={i} node={node} isTarget={isTarget} />
        ))}
        {hasMore && (
          <button className="show-more-btn" onClick={() => setExpanded(!expanded)}>
            {expanded ? '▲ Show less' : `▼ +${nodes.length - SHOW_LIMIT} more`}
          </button>
        )}
      </div>
    );
  };

  if (nodesList.length === 0) {
    return (
      <div className="results-panel">
        <div className="results-header">
          <span className="results-count">Data Lineage</span>
          <span className="results-badge">No data</span>
        </div>
        <div className="empty-state">No lineage information available for this resource</div>
      </div>
    );
  }

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">Data Lineage</span>
        <span className="results-badge">{nodesList.length} nodes</span>
      </div>

      <div className="lineage-graph">
        {/* Sources Column */}
        {sourceNodes.length > 0 && (
          <div className="lineage-column">
            <div className="column-header">
              <span className="column-icon source">⬡</span>
              <span>Sources ({sourceNodes.length})</span>
            </div>
            <NodeList nodes={sourceNodes} />
          </div>
        )}

        {/* Connector */}
        {sourceNodes.length > 0 && (processorNodes.length > 0 || targetNodes.length > 0) && (
          <div className="lineage-connector" />
        )}

        {/* Processors Column (Apps) */}
        {processorNodes.length > 0 && (
          <div className="lineage-column">
            <div className="column-header">
              <span className="column-icon processor">◈</span>
              <span>Processing ({processorNodes.length})</span>
            </div>
            <NodeList nodes={processorNodes} />
          </div>
        )}

        {/* Connector */}
        {processorNodes.length > 0 && targetNodes.length > 0 && (
          <div className="lineage-connector" />
        )}

        {/* Direct connector when no processors */}
        {sourceNodes.length > 0 && processorNodes.length === 0 && targetNodes.length > 0 && (
          <div className="lineage-connector" />
        )}

        {/* Targets Column */}
        {targetNodes.length > 0 && (
          <div className="lineage-column">
            <div className="column-header">
              <span className="column-icon target">▤</span>
              <span>Output ({targetNodes.length})</span>
            </div>
            <NodeList nodes={targetNodes} isTarget={true} />
          </div>
        )}

        {/* Standalone */}
        {isStandalone && (
          <div className="lineage-column standalone">
            <div className="column-header">
              <span className="column-icon">◉</span>
              <span>Resource</span>
            </div>
            <div className="column-nodes">
              {nodesList.map((node: any, i: number) => (
                <NodeCard key={i} node={node} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ APP LINEAGE ============
function AppLineageView({ data }: { data: any }) {
  const sources = data.sources || [];
  const internal = data.internal || [];
  const tables = data.tables || [];

  // Group sources by type
  const qvdFiles = sources.filter((s: any) => s.type === "QVD");
  const excelFiles = sources.filter((s: any) => s.type === "Excel");
  const otherFiles = sources.filter((s: any) => s.type !== "QVD" && s.type !== "Excel");

  const getFileIcon = (type: string) => {
    if (type === "QVD") return <Database size={14} />;
    if (type === "Excel") return <FileText size={14} />;
    return <File size={14} />;
  };

  const getTypeColor = (type: string) => {
    if (type === "QVD") return "#059669";
    if (type === "Excel") return "#2563eb";
    return "#6b7280";
  };

  // Calculate totals
  const totalRows = tables.reduce((sum: number, t: any) => sum + (t.rows || 0), 0);
  const totalFields = tables.reduce((sum: number, t: any) => sum + (t.fields || 0), 0);

  if (sources.length === 0 && internal.length === 0 && tables.length === 0) {
    return (
      <div className="results-panel">
        <div className="results-header">
          <span className="results-count">App Data Model</span>
          <span className="results-badge">No data</span>
        </div>
        <div className="empty-state">No data found for this app</div>
      </div>
    );
  }

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">App Data Model</span>
        <div className="results-badges">
          {tables.length > 0 && <span className="results-badge">{tables.length} tables</span>}
          {sources.length > 0 && <span className="results-badge">{sources.length} sources</span>}
        </div>
      </div>

      {/* Summary stats */}
      {tables.length > 0 && (
        <div className="lineage-stats">
          <div className="lineage-stat">
            <span className="stat-value">{tables.length}</span>
            <span className="stat-label">Tables</span>
          </div>
          <div className="lineage-stat">
            <span className="stat-value">{totalRows.toLocaleString()}</span>
            <span className="stat-label">Total Rows</span>
          </div>
          <div className="lineage-stat">
            <span className="stat-value">{totalFields}</span>
            <span className="stat-label">Total Fields</span>
          </div>
        </div>
      )}

      <div className="app-lineage-content">
        {/* Tables */}
        {tables.length > 0 && (
          <div className="source-group">
            <div className="source-group-header">
              <Layers size={16} />
              <span>Data Tables</span>
            </div>
            <div className="tables-list">
              {tables.map((t: any, i: number) => (
                <div key={i} className="table-item">
                  <div className="table-name">
                    <Database size={14} />
                    <span>{t.name}</span>
                    {t.isSynthetic && <span className="synthetic-badge">Synthetic</span>}
                  </div>
                  <div className="table-stats">
                    <span className="table-stat">{t.rows?.toLocaleString() || 0} rows</span>
                    <span className="table-stat">{t.fields || 0} fields</span>
                    {t.keyFields > 0 && <span className="table-stat key">{t.keyFields} keys</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* QVD Files */}
        {qvdFiles.length > 0 && (
          <div className="source-group">
            <div className="source-group-header">
              <Database size={16} />
              <span>QVD Files ({qvdFiles.length})</span>
            </div>
            <div className="source-list">
              {qvdFiles.map((s: any, i: number) => (
                <div key={i} className="source-item" style={{ borderLeftColor: getTypeColor(s.type) }}>
                  <span className="source-icon" style={{ color: getTypeColor(s.type) }}>{getFileIcon(s.type)}</span>
                  <div className="source-info">
                    <span className="source-name">{s.fileName}</span>
                    <span className="source-path">{s.connection} / {s.path}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Excel Files */}
        {excelFiles.length > 0 && (
          <div className="source-group">
            <div className="source-group-header">
              <FileText size={16} />
              <span>Excel Files ({excelFiles.length})</span>
            </div>
            <div className="source-list">
              {excelFiles.map((s: any, i: number) => (
                <div key={i} className="source-item" style={{ borderLeftColor: getTypeColor(s.type) }}>
                  <span className="source-icon" style={{ color: getTypeColor(s.type) }}>{getFileIcon(s.type)}</span>
                  <div className="source-info">
                    <span className="source-name">{s.fileName}</span>
                    <span className="source-path">{s.connection} / {s.path}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Other Files */}
        {otherFiles.length > 0 && (
          <div className="source-group">
            <div className="source-group-header">
              <File size={16} />
              <span>Other Files ({otherFiles.length})</span>
            </div>
            <div className="source-list">
              {otherFiles.map((s: any, i: number) => (
                <div key={i} className="source-item" style={{ borderLeftColor: getTypeColor(s.type) }}>
                  <span className="source-icon" style={{ color: getTypeColor(s.type) }}>{getFileIcon(s.type)}</span>
                  <div className="source-info">
                    <span className="source-name">{s.fileName}</span>
                    <span className="source-path">{s.connection} / {s.path}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Internal Tables */}
        {internal.length > 0 && (
          <div className="source-group internal">
            <div className="source-group-header">
              <Layers size={16} />
              <span>Internal Tables ({internal.length})</span>
            </div>
            <div className="internal-tags">
              {internal.filter((t: any) => t.type === "Resident").map((t: any, i: number) => (
                <span key={i} className="internal-tag">{t.table}</span>
              ))}
              {internal.some((t: any) => t.type === "Inline") && <span className="internal-tag muted">Inline data</span>}
              {internal.some((t: any) => t.type === "AutoGenerate") && <span className="internal-tag muted">AutoGenerate</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ DATASETS ============
function DatasetsGrid({ data, callTool, sendAction }: { data: any; callTool: any; sendAction: (action: string, context?: Record<string, string>) => void }) {
  const allDatasets = data.datasets || [];
  const pagination = usePagination(allDatasets);

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{allDatasets.length} dataset{allDatasets.length !== 1 ? 's' : ''}</span>
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">No datasets found</div>
      ) : (
        <div className="results-list">
          {pagination.items.map((ds: any) => (
            <div key={ds.id} className="result-row-wrapper">
              <button className="result-row" onClick={() => callTool("qlik_get_dataset_details", { datasetId: ds.id }, { name: ds.name, id: ds.id, type: "dataset" })}>
                <span className="result-icon"><Database size={16} /></span>
                <span className="result-name">{ds.name}</span>
                <span className="result-meta">{ds.type}</span>
                <span className="result-date">{formatSize(ds.size)}</span>
                <span className="result-arrow"><ChevronRight size={16} /></span>
              </button>
              <ItemMenu item={{ id: ds.id, name: ds.name, resourceType: "dataset" }} sendAction={sendAction} />
            </div>
          ))}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

function DatasetDetail({ data, sendAction }: { data: any; sendAction: (action: string, context?: Record<string, string>) => void }) {
  const [fieldsExpanded, setFieldsExpanded] = useState(false);
  const columns = data.columns || data.schema?.dataFields || data.schema?.fields || data.dataFields || data.fields || [];
  const rowCount = data.rowCount;
  const colCount = columns.length || data.columnCount;

  // Extract column info - Qlik API uses dataType.type for type
  const getColName = (col: any): string => {
    if (typeof col === 'string') return col;
    return col.name || col.fieldName || '—';
  };

  const getColType = (col: any): string => {
    if (typeof col === 'string') return 'TEXT';
    return col.dataType?.type || col.type || 'TEXT';
  };

  const getTypeInfo = (type: string) => {
    const t = type.toUpperCase();
    if (t === 'INTEGER') return { icon: '#', color: 'type-integer' };
    if (t === 'DOUBLE' || t === 'DECIMAL' || t === 'NUMBER' || t === 'NUMERIC') return { icon: '#', color: 'type-double' };
    if (t === 'DATE' || t === 'TIME' || t === 'DATETIME' || t === 'TIMESTAMP') return { icon: 'D', color: 'type-date' };
    return { icon: 'T', color: 'type-string' };
  };

  // Calculate data summary by actual types
  const typeCounts: Record<string, number> = {};
  const primaryKeys: string[] = [];
  const fieldNames = columns.map((col: any) => getColName(col).toLowerCase());
  columns.forEach((col: any) => {
    const t = getColType(col).toUpperCase();
    typeCounts[t] = (typeCounts[t] || 0) + 1;
    if (col.primaryKey) primaryKeys.push(getColName(col));
  });

  // Generate brief summary based on field names
  const generateSummary = () => {
    const topics: string[] = [];
    const nameStr = fieldNames.join(' ');

    if (/customer|client|account/i.test(nameStr)) topics.push('customer');
    if (/order|sale|revenue|amount|price|cost|total/i.test(nameStr)) topics.push('sales');
    if (/product|item|sku/i.test(nameStr)) topics.push('product');
    if (/date|time|year|month|day/i.test(nameStr)) topics.push('time-based');
    if (/territory|region|country|city|address|location/i.test(nameStr)) topics.push('geographic');
    if (/employee|staff|manager/i.test(nameStr)) topics.push('employee');
    if (/inventory|stock|quantity/i.test(nameStr)) topics.push('inventory');

    if (topics.length === 0) return null;

    const topicStr = topics.slice(0, 3).join(', ');
    return `Contains ${topicStr} data with ${columns.length} fields and ${rowCount?.toLocaleString() || 'N/A'} records.`;
  };

  const dataSummary = generateSummary();

  return (
    <div className="dataset-detail-card">
      {/* Header with name, space, type */}
      <div className="dataset-header">
        <div className="dataset-icon"><Database size={24} /></div>
        <div className="dataset-title-section">
          <h2 className="dataset-name">{data.name}</h2>
          <div className="dataset-meta-row">
            <span className="meta-item"><strong>Space:</strong> {data.spaceName || "Personal"}</span>
            <span className="meta-sep">•</span>
            <span className="meta-item"><strong>Owner:</strong> {data.ownerName || "Unknown"}</span>
            <span className="meta-sep">•</span>
            <span className="meta-item">{data.datasetType?.toUpperCase() || "QVD"}</span>
          </div>
        </div>
        {/* Auto-generated data summary - in header */}
        {dataSummary && (
          <div className="dataset-brief-inline">
            <p>{dataSummary}</p>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="dataset-stats-bar">
        {rowCount && <div className="stat-pill"><span className="stat-num">{rowCount.toLocaleString()}</span><span className="stat-label">rows</span></div>}
        {colCount && <div className="stat-pill"><span className="stat-num">{colCount}</span><span className="stat-label">cols</span></div>}
        {data.size && <div className="stat-pill"><span className="stat-num">{formatSize(data.size)}</span></div>}
        {(data.modifiedAt || data.updatedAt) && <div className="stat-pill"><span className="stat-num">{formatDate(data.modifiedAt || data.updatedAt).split(',')[0]}</span></div>}
      </div>

      {/* User description if any */}
      {data.description && (
        <div className="dataset-desc-section">
          <p>{data.description}</p>
        </div>
      )}

      {/* Type breakdown */}
      {columns.length > 0 && (
        <div className="dataset-summary">
          {Object.entries(typeCounts).map(([type, count]) => (
            <div key={type} className="summary-item">
              <span className={`summary-icon ${getTypeInfo(type).color}`}>{getTypeInfo(type).icon}</span>
              <span className="summary-val">{count}</span>
              <span className="summary-label">{type.toLowerCase()}</span>
            </div>
          ))}
          {primaryKeys.length > 0 && (
            <div className="summary-keys">
              <span className="key-label">Keys:</span>
              {primaryKeys.map((k: string, i: number) => (
                <span key={i} className="key-chip">{k}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Columns - Collapsible Section */}
      {columns.length > 0 ? (
        <div className={`dataset-columns-section ${fieldsExpanded ? 'expanded' : 'collapsed'}`}>
          <button className="section-header-toggle" onClick={() => setFieldsExpanded(!fieldsExpanded)}>
            <span className={`toggle-icon ${fieldsExpanded ? 'open' : ''}`}>▶</span>
            <h3>Fields</h3>
            <span className="section-count">{columns.length}</span>
          </button>
          {fieldsExpanded && (
            <div className="columns-grid">
              {columns.map((col: any, i: number) => {
                const typeInfo = getTypeInfo(getColType(col));
                return (
                  <div key={i} className={`column-chip ${typeInfo.color}`}>
                    <span className="col-type-icon">{typeInfo.icon}</span>
                    <span className="col-chip-name">{getColName(col)}</span>
                    <span className="col-chip-type">{getColType(col)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="dataset-columns-section">
          <div className="section-header">
            <h3>Fields</h3>
          </div>
          <div className="empty-state">No field information available</div>
        </div>
      )}

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div className="dataset-tags-section">
          {data.tags.map((tag: string, i: number) => (
            <span key={i} className="dataset-tag">{tag}</span>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="dataset-actions">
        <button className="btn primary" onClick={() => sendAction("Generate a Qlik app from this dataset", { datasetId: data.id, datasetName: data.name })}>
          Generate App
        </button>
        <button className="btn secondary" onClick={() => sendAction("Show data lineage for this dataset", { datasetId: data.id, datasetName: data.name })}>
          View Lineage
        </button>
      </div>
    </div>
  );
}

// ============ TENANT & LICENSE ============
function TenantView({ data }: { data: any }) {
  const counts = data.counts || {};
  const capacities = data.capacities || {};

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{data.name}</span>
        <div className="results-badges">
          <span className={`results-badge ${data.status === 'active' ? 'green' : ''}`}>{data.status}</span>
          <span className="results-badge">{data.region || data.datacenter}</span>
        </div>
      </div>

      {/* License Info */}
      <div className="tenant-license-section">
        <div className="license-main">
          <div className="license-product">
            <span className="product-name">{data.product || 'Qlik Cloud'}</span>
            {data.edition && <span className="product-edition">{data.edition}</span>}
            {data.trial && <span className="trial-badge">Trial</span>}
          </div>
          {data.licenseNumber && (
            <div className="license-number">{data.licenseNumber}</div>
          )}
        </div>
        {data.licenseValid && (
          <div className="license-validity">
            <span className="validity-label">Valid</span>
            <span className="validity-dates">{data.licenseValid}</span>
            {data.licenseStatus && (
              <span className={`results-badge sm ${data.licenseStatus === 'Ok' ? 'green' : 'warning'}`}>
                {data.licenseStatus}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Usage Stats */}
      <div className="tenant-usage">
        <div className="usage-title">Usage</div>
        <div className="usage-grid">
          <div className="usage-item">
            <div className="usage-value">{counts.apps || 0}</div>
            <div className="usage-label">Apps</div>
          </div>
          <div className="usage-item">
            <div className="usage-value">{counts.spaces || 0}</div>
            <div className="usage-label">Spaces</div>
          </div>
          <div className="usage-item">
            <div className="usage-value">
              {data.usersUsed || counts.users || 0}
              {capacities.users && capacities.users !== 'Unlimited' && (
                <span className="usage-cap"> / {capacities.users}</span>
              )}
            </div>
            <div className="usage-label">Users</div>
          </div>
          <div className="usage-item">
            <div className="usage-value">{counts.automations || 0}</div>
            <div className="usage-label">Automations</div>
          </div>
        </div>
      </div>

      {/* Capacities */}
      {(capacities.dataCapacityGB || capacities.concurrentReloads || capacities.mlModels) && (
        <div className="tenant-capacities">
          <div className="usage-title">Capacities</div>
          <div className="capacity-items">
            {capacities.dataCapacityGB && (
              <div className="capacity-item">
                <span className="capacity-value">{capacities.dataCapacityGB} GB</span>
                <span className="capacity-label">Data</span>
              </div>
            )}
            {capacities.concurrentReloads && (
              <div className="capacity-item">
                <span className="capacity-value">{capacities.concurrentReloads}</span>
                <span className="capacity-label">Concurrent Reloads</span>
              </div>
            )}
            {capacities.mlModels && (
              <div className="capacity-item">
                <span className="capacity-value">{capacities.mlModels}</span>
                <span className="capacity-label">ML Models</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LicenseView({ data }: { data: any }) {
  const allotments = data.allotments || [];
  const features = data.features || [];
  const [showAllFeatures, setShowAllFeatures] = useState(false);

  // Format bytes to human readable
  const formatBytes = (bytes: number) => {
    if (bytes >= 1099511627776) return (bytes / 1099511627776).toFixed(0) + " TB";
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(0) + " GB";
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(0) + " MB";
    return bytes + " B";
  };

  // Format allotment value based on unit
  const formatAllotment = (a: any) => {
    if (a.unit === "byte") return formatBytes(a.value);
    if (a.unit === "GB") return a.value + " GB";
    if (a.value === -1 || a.total === "Unlimited") return "Unlimited";
    return a.value?.toLocaleString() || "-";
  };

  // Filter visible allotments and categorize
  const visibleAllotments = allotments.filter((a: any) => a.visible !== false && a.title);
  const usersAllotment = allotments.find((a: any) => a.displayName?.toLowerCase().includes("user") || a.name?.includes("user"));

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{data.product || "Qlik Cloud"}</span>
        <span className={`results-badge ${data.status === 'Ok' ? 'green' : 'warning'}`}>{data.status}</span>
      </div>

      {/* License Info */}
      <div className="license-info-grid">
        <div className="license-info-item">
          <span className="license-info-label">License Number</span>
          <span className="license-info-value mono">{data.licenseNumber}</span>
        </div>
        <div className="license-info-item">
          <span className="license-info-label">Valid Period</span>
          <span className="license-info-value">{data.valid || "-"}</span>
        </div>
        {data.daysRemaining !== undefined && data.daysRemaining !== null && (
          <div className="license-info-item">
            <span className="license-info-label">Days Remaining</span>
            <span className={`license-info-value ${data.daysRemaining < 30 ? 'warning-text' : data.daysRemaining > 180 ? 'success-text' : ''}`}>
              {data.daysRemaining} days
            </span>
          </div>
        )}
        {usersAllotment && (
          <div className="license-info-item">
            <span className="license-info-label">Users</span>
            <span className="license-info-value">{usersAllotment.used || 0} / {usersAllotment.total || 'Unlimited'}</span>
          </div>
        )}
      </div>

      {/* Allotments / Capacities */}
      {visibleAllotments.length > 0 && (
        <div className="license-allotments">
          <div className="allotments-title">Capacities & Limits</div>
          <div className="allotments-grid">
            {visibleAllotments.slice(0, 8).map((a: any, i: number) => (
              <div key={i} className="allotment-item">
                <div className="allotment-value">{formatAllotment(a)}</div>
                <div className="allotment-name">{a.title || a.displayName || a.name}</div>
                {a.periodType && a.periodType !== 'fixed' && (
                  <div className="allotment-period">per {a.periodType}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Features */}
      {features.length > 0 && (
        <div className="license-features">
          <div className="features-header" onClick={() => setShowAllFeatures(!showAllFeatures)}>
            <span className="features-title">Enabled Features ({features.length})</span>
            <span className="features-toggle">{showAllFeatures ? '▲' : '▼'}</span>
          </div>
          {showAllFeatures && (
            <div className="features-list">
              {features.map((f: string, i: number) => (
                <span key={i} className="feature-tag">{f}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HealthView({ data }: { data: any }) {
  const healthy = data.status === "healthy";
  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{healthy ? "All Systems Operational" : "Issues Detected"}</span>
        <span className={`results-badge ${healthy ? "green" : "red"}`}>{healthy ? "Healthy" : "Error"}</span>
      </div>
      <div className="results-content">
        <div className={`health-dot ${healthy ? "healthy" : "unhealthy"}`}></div>
        <div className="health-details">
          <div className="health-tenant">{data.tenant}</div>
          {data.user && <div className="health-user">Connected as: {data.user}</div>}
          {data.error && <div className="health-error">{data.error}</div>}
        </div>
      </div>
    </div>
  );
}

// ============ APP FIELDS VIEW ============
function AppFieldsView({ data }: { data: any }) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const tables = data.tables || [];
  const totalFields = data.totalFields || 0;

  const toggleTable = (tableName: string) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName);
    } else {
      newExpanded.add(tableName);
    }
    setExpandedTables(newExpanded);
  };

  const expandAll = () => {
    setExpandedTables(new Set(tables.map((t: any) => t.name)));
  };

  const collapseAll = () => {
    setExpandedTables(new Set());
  };

  // Filter tables and fields
  const filterLower = filter.toLowerCase();
  const filteredTables = tables.map((t: any) => ({
    ...t,
    fields: t.fields?.filter((f: string) => f.toLowerCase().includes(filterLower)) || [],
    matchesName: t.name.toLowerCase().includes(filterLower),
  })).filter((t: any) => t.matchesName || t.fields.length > 0);

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{totalFields} fields in {tables.length} tables</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Filter tables and fields..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="filter-tabs">
          <button onClick={expandAll}>Expand All</button>
          <button onClick={collapseAll}>Collapse All</button>
        </div>
      </div>

      <div className="tables-list">
        {filteredTables.map((table: any) => (
          <div key={table.name} className="table-group">
            <div
              className={`table-header ${expandedTables.has(table.name) ? 'expanded' : ''}`}
              onClick={() => toggleTable(table.name)}
            >
              <span className="table-expand-icon">{expandedTables.has(table.name) ? '▼' : '▶'}</span>
              <span className="table-icon">▦</span>
              <span className="table-name">{table.name}</span>
              <span className="table-field-count">{table.fields?.length || 0} fields</span>
            </div>
            {expandedTables.has(table.name) && (
              <div className="fields-list">
                {(table.fields || []).map((field: string, idx: number) => (
                  <div key={idx} className="field-item">
                    <span className="field-icon">◇</span>
                    <span className="field-name">{field}</span>
                  </div>
                ))}
                {table.fields?.length === 0 && (
                  <div className="field-item empty">No fields</div>
                )}
              </div>
            )}
          </div>
        ))}
        {filteredTables.length === 0 && filter && (
          <div className="no-results">No tables or fields match "{filter}"</div>
        )}
      </div>
    </div>
  );
}

// ============ SHEETS ============
function SheetsGrid({ data, callTool, openLink }: { data: any; callTool: any; openLink: (url: string) => void }) {
  const [filter, setFilter] = useState("");
  const allSheets = data.sheets || [];

  const filtered = allSheets.filter((sheet: any) => {
    if (!filter) return true;
    return sheet.title?.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{filtered.length} sheet{filtered.length !== 1 ? 's' : ''}{filter && ` (filtered from ${allSheets.length})`}</span>
        {data.tenantUrl && data.appId && (
          <button className="btn-link" onClick={() => openLink(`${data.tenantUrl}/sense/app/${data.appId}`)}>
            <ExternalLink size={12} /> Open App
          </button>
        )}
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Search sheets..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="results-list">
        {filtered.map((sheet: any, i: number) => (
          <button
            key={sheet.id}
            className="result-row"
            onClick={() => callTool("sheet_details", { appId: data.appId, sheetId: sheet.id })}
          >
            <span className="result-num">{i + 1}</span>
            <span className="result-icon"><Layers size={16} /></span>
            <span className="result-name">{sheet.title}</span>
            {data.tenantUrl && (
              <span
                className="result-link"
                onClick={(e) => { e.stopPropagation(); openLink(`${data.tenantUrl}/sense/app/${data.appId}/sheet/${sheet.id}`); }}
              >
                <ExternalLink size={14} />
              </span>
            )}
            <span className="result-arrow"><ChevronRight size={16} /></span>
          </button>
        ))}
        {filtered.length === 0 && <div className="empty-state">No sheets match "{filter}"</div>}
      </div>
    </div>
  );
}

function SheetDetail({ data, openLink }: { data: any; openLink: (url: string) => void }) {
  const objects = data.objects || [];

  // Group objects by type
  const byType = objects.reduce((acc: any, obj: any) => {
    const t = obj.type || "unknown";
    if (!acc[t]) acc[t] = [];
    acc[t].push(obj);
    return acc;
  }, {});

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{data.title || "Sheet Details"}</span>
        <span className="results-badge">{objects.length} objects</span>
      </div>
      {data.tenantUrl && data.appId && data.sheetId && (
        <div className="results-toolbar">
          <button
            className="result-action-btn"
            onClick={() => openLink(`${data.tenantUrl}/sense/app/${data.appId}/sheet/${data.sheetId}`)}
          >
            <ExternalLink size={14} /> Open in Qlik
          </button>
        </div>
      )}
      {data.description && <div className="results-subtitle">{data.description}</div>}
      <div className="objects-by-type">
        {Object.entries(byType).map(([type, objs]: [string, any]) => (
          <div key={type} className="object-type-group">
            <div className="object-type-header">
              <span className="object-type-name">{type}</span>
              <span className="object-type-count">{objs.length}</span>
            </div>
            <div className="object-list">
              {objs.map((obj: any) => (
                <div key={obj.id} className="object-item">
                  <span className="object-title">{obj.title || obj.id}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ FIELD VALUES ============
// Helper to detect if field values look like dates
function isDateField(fieldName: string, values: any[]): boolean {
  const dateKeywords = ['date', 'time', 'day', 'month', 'year', 'week', 'tarih', 'gün', 'ay', 'yıl'];
  const lowerName = fieldName.toLowerCase();
  if (dateKeywords.some(kw => lowerName.includes(kw))) return true;

  // Check if values look like dates (sample first 5)
  const sampleValues = values.slice(0, 5).map(v => v.text);
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/, // 2024-01-15
    /^\d{2}\/\d{2}\/\d{4}$/, // 01/15/2024
    /^\d{2}\.\d{2}\.\d{4}$/, // 15.01.2024
    /^\d{1,2}\s+\w+\s+\d{4}$/, // 15 Jan 2024
  ];
  return sampleValues.some(val => datePatterns.some(p => p.test(val)));
}

// Date Picker Component for Date Fields
function DateFieldPicker({ data, callTool }: { data: any; callTool: any }) {
  const [mode, setMode] = useState<'single' | 'multiple' | 'range'>('range');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewMonth, setViewMonth] = useState(new Date());

  // Format date to string matching Qlik format
  const formatDate = (d: Date) => {
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  const formatDisplayDate = (d: Date | null) => {
    if (!d) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Generate calendar days
  const generateCalendarDays = (month: Date) => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstDay = new Date(year, m, 1);
    const lastDay = new Date(year, m + 1, 0);
    const days: (Date | null)[] = [];

    // Add empty slots for days before first day
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    // Add all days of month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, m, d));
    }

    return days;
  };

  const prevMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  };

  const isInRange = (d: Date) => {
    if (!startDate || !endDate) return false;
    return d >= startDate && d <= endDate;
  };

  const isSelected = (d: Date) => {
    const dateStr = formatDate(d);
    if (mode === 'single') return startDate && formatDate(startDate) === dateStr;
    if (mode === 'multiple') return selectedDates.has(dateStr);
    if (mode === 'range') return isInRange(d) || (startDate && formatDate(startDate) === dateStr) || (endDate && formatDate(endDate) === dateStr);
    return false;
  };

  const handleDayClick = (d: Date) => {
    const dateStr = formatDate(d);

    if (mode === 'single') {
      setStartDate(d);
      setEndDate(null);
      setSelectedDates(new Set());
    } else if (mode === 'multiple') {
      const newSelected = new Set(selectedDates);
      if (newSelected.has(dateStr)) {
        newSelected.delete(dateStr);
      } else {
        newSelected.add(dateStr);
      }
      setSelectedDates(newSelected);
    } else if (mode === 'range') {
      if (!startDate || (startDate && endDate)) {
        setStartDate(d);
        setEndDate(null);
      } else {
        if (d < startDate) {
          setEndDate(startDate);
          setStartDate(d);
        } else {
          setEndDate(d);
        }
      }
    }
  };

  const applyPreset = (preset: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start: Date;
    let end: Date = today;

    switch (preset) {
      case 'today':
        start = today;
        break;
      case 'yesterday':
        start = new Date(today);
        start.setDate(start.getDate() - 1);
        end = start;
        break;
      case 'last7':
        start = new Date(today);
        start.setDate(start.getDate() - 6);
        break;
      case 'last30':
        start = new Date(today);
        start.setDate(start.getDate() - 29);
        break;
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'thisYear':
        start = new Date(today.getFullYear(), 0, 1);
        break;
      case 'lastYear':
        start = new Date(today.getFullYear() - 1, 0, 1);
        end = new Date(today.getFullYear() - 1, 11, 31);
        break;
      default:
        return;
    }

    setMode('range');
    setStartDate(start);
    setEndDate(end);
    setViewMonth(start);
  };

  const applySelection = () => {
    let selectedValues: string[] = [];

    if (mode === 'single' && startDate) {
      selectedValues = [formatDate(startDate)];
    } else if (mode === 'multiple') {
      selectedValues = Array.from(selectedDates);
    } else if (mode === 'range' && startDate && endDate) {
      // Generate all dates in range
      const current = new Date(startDate);
      while (current <= endDate) {
        selectedValues.push(formatDate(current));
        current.setDate(current.getDate() + 1);
      }
    }

    if (selectedValues.length > 0) {
      callTool("select", { appId: data.appId, selections: [{ field: data.fieldName, values: selectedValues }] });
    }
  };

  const clearSelection = () => {
    setStartDate(null);
    setEndDate(null);
    setSelectedDates(new Set());
  };

  const getSelectionCount = () => {
    if (mode === 'single') return startDate ? 1 : 0;
    if (mode === 'multiple') return selectedDates.size;
    if (mode === 'range' && startDate && endDate) {
      const diff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return diff;
    }
    return 0;
  };

  const month1 = viewMonth;
  const month2 = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);

  return (
    <div className="date-picker-panel">
      <div className="date-picker-header">
        <span className="date-picker-title">{data.fieldName}</span>
        <div className="date-picker-modes">
          <button className={`mode-btn ${mode === 'single' ? 'active' : ''}`} onClick={() => setMode('single')}>Single</button>
          <button className={`mode-btn ${mode === 'multiple' ? 'active' : ''}`} onClick={() => setMode('multiple')}>Multiple</button>
          <button className={`mode-btn ${mode === 'range' ? 'active' : ''}`} onClick={() => setMode('range')}>Range</button>
        </div>
      </div>

      <div className="date-picker-inputs">
        <div className="date-input">
          <Clock size={14} />
          <span>{startDate ? formatDisplayDate(startDate) : 'Start Date'}</span>
        </div>
        {mode === 'range' && (
          <>
            <span className="date-separator">→</span>
            <div className="date-input">
              <Clock size={14} />
              <span>{endDate ? formatDisplayDate(endDate) : 'End Date'}</span>
            </div>
          </>
        )}
      </div>

      <div className="date-picker-body">
        <div className="calendars-container">
          <button className="cal-nav-btn" onClick={prevMonth}>‹</button>

          <div className="calendar">
            <div className="cal-header">
              {month1.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <div className="cal-weekdays">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="cal-weekday">{d}</div>
              ))}
            </div>
            <div className="cal-days">
              {generateCalendarDays(month1).map((day, i) => (
                <div
                  key={i}
                  className={`cal-day ${!day ? 'empty' : ''} ${day && isSelected(day) ? 'selected' : ''} ${day && isInRange(day) ? 'in-range' : ''}`}
                  onClick={() => day && handleDayClick(day)}
                >
                  {day?.getDate()}
                </div>
              ))}
            </div>
          </div>

          <div className="calendar">
            <div className="cal-header">
              {month2.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <div className="cal-weekdays">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="cal-weekday">{d}</div>
              ))}
            </div>
            <div className="cal-days">
              {generateCalendarDays(month2).map((day, i) => (
                <div
                  key={i}
                  className={`cal-day ${!day ? 'empty' : ''} ${day && isSelected(day) ? 'selected' : ''} ${day && isInRange(day) ? 'in-range' : ''}`}
                  onClick={() => day && handleDayClick(day)}
                >
                  {day?.getDate()}
                </div>
              ))}
            </div>
          </div>

          <button className="cal-nav-btn" onClick={nextMonth}>›</button>
        </div>

        <div className="date-presets">
          <div className="presets-title">Quick Select</div>
          <button className="preset-btn" onClick={() => applyPreset('today')}>Today</button>
          <button className="preset-btn" onClick={() => applyPreset('yesterday')}>Yesterday</button>
          <button className="preset-btn" onClick={() => applyPreset('last7')}>Last 7 days</button>
          <button className="preset-btn" onClick={() => applyPreset('last30')}>Last 30 days</button>
          <button className="preset-btn" onClick={() => applyPreset('thisMonth')}>This Month</button>
          <button className="preset-btn" onClick={() => applyPreset('lastMonth')}>Last Month</button>
          <button className="preset-btn" onClick={() => applyPreset('thisYear')}>This Year</button>
          <button className="preset-btn" onClick={() => applyPreset('lastYear')}>Last Year</button>
        </div>
      </div>

      <div className="date-picker-footer">
        <span className="selection-info">{getSelectionCount()} date{getSelectionCount() !== 1 ? 's' : ''} selected</span>
        <div className="date-picker-actions">
          <button className="btn secondary" onClick={clearSelection}>Clear</button>
          <button className="btn primary" onClick={applySelection} disabled={getSelectionCount() === 0}>
            Apply Selection
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldValuesView({ data, callTool }: { data: any; callTool: any }) {
  const values = data.values || [];

  // Check if this is a date field - check before useState so we can set default
  const isDate = isDateField(data.fieldName, values);

  const [filter, setFilter] = useState("");
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());
  const [showDatePicker, setShowDatePicker] = useState(isDate); // Default to calendar for date fields

  const filteredValues = filter
    ? values.filter((v: any) => v.text.toLowerCase().includes(filter.toLowerCase()))
    : values;

  const pagination = usePagination(filteredValues, 20);

  const getStateClass = (state: string) => {
    switch (state) {
      case "S": return "selected";
      case "X": return "excluded";
      case "A": return "alternative";
      default: return "optional";
    }
  };

  const toggleValue = (text: string) => {
    const newSelected = new Set(selectedValues);
    if (newSelected.has(text)) {
      newSelected.delete(text);
    } else {
      newSelected.add(text);
    }
    setSelectedValues(newSelected);
  };

  const selectAll = () => {
    setSelectedValues(new Set(filteredValues.map((v: any) => v.text)));
  };

  const clearSelection = () => {
    setSelectedValues(new Set());
  };

  const applySelection = () => {
    if (selectedValues.size > 0) {
      callTool("select", { appId: data.appId, selections: [{ field: data.fieldName, values: Array.from(selectedValues) }] });
    }
  };

  // If date field and user wants date picker
  if (isDate && showDatePicker) {
    return <DateFieldPicker data={data} callTool={callTool} />;
  }

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{filteredValues.length} value{filteredValues.length !== 1 ? 's' : ''}{filter && ` (filtered)`}</span>
        <span className="results-total">{data.totalCount} total</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Search values..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="toolbar-actions">
          {isDate && (
            <button className="btn-small date-btn" onClick={() => setShowDatePicker(true)}>
              <Clock size={12} /> Calendar
            </button>
          )}
          <button className="btn-small" onClick={selectAll}>Select All</button>
          <button className="btn-small" onClick={clearSelection}>Clear</button>
        </div>
      </div>
      {selectedValues.size > 0 && (
        <div className="selection-bar">
          <span>{selectedValues.size} selected</span>
          <button className="btn primary small" onClick={applySelection}>
            Apply Selection
          </button>
        </div>
      )}
      <div className="field-values-grid">
        {pagination.items.map((v: any, i: number) => (
          <div
            key={i}
            className={`fv-item ${getStateClass(v.state)} ${selectedValues.has(v.text) ? 'checked' : ''}`}
            onClick={() => toggleValue(v.text)}
          >
            <input
              type="checkbox"
              checked={selectedValues.has(v.text)}
              onChange={() => {}}
              className="fv-checkbox"
            />
            <span className="fv-text">{v.text}</span>
            {v.state === "S" && <span className="fv-badge selected">●</span>}
            {v.state === "X" && <span className="fv-badge excluded">○</span>}
          </div>
        ))}
        {pagination.items.length === 0 && <div className="empty-state">No values match "{filter}"</div>}
      </div>
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
      {values.length < data.totalCount && (
        <div className="results-footer">Showing {values.length} of {data.totalCount} values</div>
      )}
    </div>
  );
}

// ============ MASTER ITEMS ============
function MasterDimensionsView({ data }: { data: any }) {
  const [filter, setFilter] = useState("");
  const allDimensions = data.dimensions || [];

  const filtered = allDimensions.filter((dim: any) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return dim.title?.toLowerCase().includes(search) ||
           dim.fields?.some((f: string) => f.toLowerCase().includes(search));
  });

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{filtered.length} dimension{filtered.length !== 1 ? 's' : ''}{filter && ` (filtered from ${allDimensions.length})`}</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Search dimensions..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="results-list">
        {filtered.map((dim: any) => (
          <div key={dim.id} className="result-row static">
            <span className="result-name">{dim.title}</span>
            {dim.fields?.length > 0 && <span className="result-meta">{dim.fields.join(", ")}</span>}
          </div>
        ))}
        {filtered.length === 0 && <div className="empty-state">No dimensions match "{filter}"</div>}
      </div>
    </div>
  );
}

function MasterMeasuresView({ data }: { data: any }) {
  const [filter, setFilter] = useState("");
  const allMeasures = data.measures || [];

  const filtered = allMeasures.filter((m: any) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return m.title?.toLowerCase().includes(search) ||
           m.expression?.toLowerCase().includes(search);
  });

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{filtered.length} measure{filtered.length !== 1 ? 's' : ''}{filter && ` (filtered from ${allMeasures.length})`}</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Search measures..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="results-list">
        {filtered.map((m: any) => (
          <div key={m.id} className="result-row static">
            <span className="result-name">{m.title}</span>
            {m.expression && <code className="result-expr">{m.expression}</code>}
          </div>
        ))}
        {filtered.length === 0 && <div className="empty-state">No measures match "{filter}"</div>}
      </div>
    </div>
  );
}

// ============ GLOSSARY ============
function GlossariesGrid({ data, callTool }: { data: any; callTool: any }) {
  const glossaries = data.glossaries || [];

  return (
    <Card header={{ label: "Business Glossary", title: `${glossaries.length} Glossaries`, gradient: "teal" }}>
      <div className="glossaries-grid">
        {glossaries.map((g: any) => (
          <div
            key={g.id}
            className="glossary-card"
            onClick={() => callTool("glossary_details", { glossaryId: g.id })}
          >
            <div className="glossary-icon">📖</div>
            <div className="glossary-info">
              <div className="glossary-name">{g.name}</div>
              {g.description && <div className="glossary-desc">{g.description}</div>}
            </div>
          </div>
        ))}
        {glossaries.length === 0 && <div className="empty-state">No glossaries found</div>}
      </div>
    </Card>
  );
}

function GlossaryDetail({ data, callTool }: { data: any; callTool: any }) {
  const [activeTab, setActiveTab] = useState<"terms" | "categories">("terms");
  const terms = data.terms || [];
  const categories = data.categories || [];

  return (
    <Card header={{ label: "Glossary", title: data.name || "Glossary", gradient: "teal" }}>
      {data.description && <p className="glossary-description">{data.description}</p>}

      <div className="glossary-tabs">
        <button
          className={`glossary-tab ${activeTab === "terms" ? "active" : ""}`}
          onClick={() => setActiveTab("terms")}
        >
          Terms ({terms.length})
        </button>
        <button
          className={`glossary-tab ${activeTab === "categories" ? "active" : ""}`}
          onClick={() => setActiveTab("categories")}
        >
          Categories ({categories.length})
        </button>
      </div>

      {activeTab === "terms" && (
        <div className="terms-list">
          {terms.map((term: any) => (
            <div
              key={term.id}
              className="term-item"
              onClick={() => callTool("glossary_term", { glossaryId: data.id, termId: term.id })}
            >
              <div className="term-name">{term.name}</div>
              {term.description && <div className="term-preview">{term.description.slice(0, 100)}...</div>}
              {term.status && <span className={`term-status ${term.status.toLowerCase()}`}>{term.status}</span>}
            </div>
          ))}
          {terms.length === 0 && <div className="empty-state">No terms</div>}
        </div>
      )}

      {activeTab === "categories" && (
        <div className="categories-list">
          {categories.map((cat: any) => (
            <div key={cat.id} className="category-item">
              <span className="category-icon">📁</span>
              <span className="category-name">{cat.name}</span>
            </div>
          ))}
          {categories.length === 0 && <div className="empty-state">No categories</div>}
        </div>
      )}
    </Card>
  );
}

function GlossaryTermView({ data }: { data: any }) {
  return (
    <Card header={{ label: "Term", title: data.name || "Term", gradient: "teal" }}>
      <div className="term-detail">
        {data.description && (
          <div className="term-definition">
            <strong>Definition:</strong>
            <p>{data.description}</p>
          </div>
        )}
        {data.status && (
          <div className="term-meta">
            <span className="label">Status:</span>
            <span className={`term-status ${data.status.toLowerCase()}`}>{data.status}</span>
          </div>
        )}
        {data.categoryId && (
          <div className="term-meta">
            <span className="label">Category:</span>
            <span>{data.categoryId}</span>
          </div>
        )}
        {data.createdAt && (
          <div className="term-meta">
            <span className="label">Created:</span>
            <span>{new Date(data.createdAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

// ============ DATA PRODUCTS ============
function DataProductsGrid({ data, callTool }: { data: any; callTool: any }) {
  const products = data.products || [];

  return (
    <Card header={{ label: "Data Products", title: `${products.length} Products`, gradient: "purple" }}>
      <div className="data-products-list">
        {products.map((product: any) => (
          <div
            key={product.id}
            className="data-product-card"
            onClick={() => callTool("data_product_details", { productId: product.id })}
          >
            <div className="data-product-icon">📦</div>
            <div className="data-product-info">
              <div className="data-product-name">{product.name}</div>
              {product.description && <div className="data-product-desc">{product.description}</div>}
              <div className="data-product-meta">
                {product.updatedAt && <span>Updated: {new Date(product.updatedAt).toLocaleDateString()}</span>}
              </div>
            </div>
          </div>
        ))}
        {products.length === 0 && <div className="empty-state">No data products found</div>}
      </div>
    </Card>
  );
}

function DataProductDetail({ data }: { data: any }) {
  return (
    <Card header={{ label: "Data Product", title: data.name || "Product Details", gradient: "purple" }}>
      <div className="data-product-detail">
        {data.description && <p className="product-description">{data.description}</p>}
        <div className="product-meta-grid">
          {data.ownerId && <div className="meta-item"><strong>Owner:</strong> {data.ownerId}</div>}
          {data.spaceId && <div className="meta-item"><strong>Space:</strong> {data.spaceId}</div>}
          {data.createdAt && <div className="meta-item"><strong>Created:</strong> {new Date(data.createdAt).toLocaleDateString()}</div>}
          {data.updatedAt && <div className="meta-item"><strong>Updated:</strong> {new Date(data.updatedAt).toLocaleDateString()}</div>}
        </div>
      </div>
    </Card>
  );
}

// ============ DATASET PROFILE ============
function DatasetProfileView({ data }: { data: any }) {
  // Parse the nested Qlik API structure
  // profile.data[0].profiles[0].fieldProfiles
  const profileData = data.profile?.data?.[0];
  const tableProfile = profileData?.profiles?.[0];
  const fieldProfiles = tableProfile?.fieldProfiles || [];
  const meta = profileData?.meta || {};

  const tableName = tableProfile?.name || "Dataset";
  const rowCount = tableProfile?.numberOfRows;
  const sizeBytes = tableProfile?.sizeInBytes;

  // Format bytes to human readable
  const formatBytes = (bytes: number) => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + " GB";
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + " MB";
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + " KB";
    return bytes + " B";
  };

  const getDataTypeColor = (type: string) => {
    switch (type?.toUpperCase()) {
      case "STRING": return "type-string";
      case "INTEGER": case "DOUBLE": case "NUMBER": return "type-number";
      case "DATE": case "TIMESTAMP": return "type-date";
      case "BOOLEAN": return "type-boolean";
      default: return "";
    }
  };

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database size={16} />
          {tableName}
        </span>
        <div className="results-badges">
          {rowCount && <span className="results-badge">{rowCount.toLocaleString()} rows</span>}
          {sizeBytes && <span className="results-badge">{formatBytes(sizeBytes)}</span>}
          {fieldProfiles.length > 0 && <span className="results-badge">{fieldProfiles.length} fields</span>}
        </div>
      </div>

      {meta.status && (
        <div className="profile-meta">
          <span className={`status-badge ${meta.status === 'FINISHED' ? 'green' : ''}`}>{meta.status}</span>
          {meta.computationEndTime && (
            <span className="meta-date">Profiled: {new Date(meta.computationEndTime).toLocaleDateString()}</span>
          )}
        </div>
      )}

      {fieldProfiles.length > 0 ? (
        <div className="field-profiles-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Field Name</th>
                <th>Type</th>
                <th>Distinct Values</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {fieldProfiles.map((field: any, idx: number) => (
                <tr key={idx}>
                  <td className="mono" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{field.index}</td>
                  <td className="field-name">{field.name}</td>
                  <td><span className={`field-type-badge ${getDataTypeColor(field.dataType)}`}>{field.dataType}</span></td>
                  <td className="mono">{field.distinctValueCount?.toLocaleString() || '-'}</td>
                  <td>
                    <div className="field-tags">
                      {field.tags?.slice(0, 3).map((tag: string, i: number) => (
                        <span key={i} className="field-tag">{tag.replace('$', '')}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">Profile data not available</div>
      )}
    </div>
  );
}


// ============ BOOKMARKS ============
function BookmarksView({ data, sendAction }: { data: any; sendAction: (action: string, context?: Record<string, string>) => void }) {
  const bookmarks = data.bookmarks || [];

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{bookmarks.length} bookmarks</span>
      </div>
      <div className="results-list">
        {bookmarks.map((bm: any) => (
          <div key={bm.id} className="result-row">
            <span className="result-icon">🔖</span>
            <span className="result-name">{bm.title}</span>
            {bm.description && <span className="result-meta">{bm.description}</span>}
            <button
              className="result-action-btn"
              onClick={() => sendAction(`Apply bookmark "${bm.title}"`, { appId: data.appId, bookmarkId: bm.id, bookmarkName: bm.title })}
            >
              Apply
            </button>
          </div>
        ))}
        {bookmarks.length === 0 && <div className="empty-state">No bookmarks in this app</div>}
      </div>
    </div>
  );
}

// ============ VARIABLES ============
function VariablesView({ data, sendAction }: { data: any; sendAction: (action: string, context?: Record<string, string>) => void }) {
  const variables = data.variables || [];
  const appId = data.appId;
  const [filter, setFilter] = useState("");
  const [editingVar, setEditingVar] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const filtered = variables.filter((v: any) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return v.name?.toLowerCase().includes(search) ||
           v.definition?.toLowerCase().includes(search);
  });

  const startEdit = (v: any) => {
    setEditingVar(v.name);
    setEditValue(v.definition || "");
  };

  const cancelEdit = () => {
    setEditingVar(null);
    setEditValue("");
  };

  const saveVariable = (varName: string) => {
    if (!appId) return;
    sendAction(`Set variable "${varName}" to: ${editValue}`, { appId, variableName: varName, value: editValue });
    setEditingVar(null);
    setEditValue("");
  };

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{filtered.length} variable{filtered.length !== 1 ? 's' : ''}{filter && ` (filtered from ${variables.length})`}</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Search variables..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="variables-list-scrollable">
        {filtered.map((v: any) => (
          <div key={v.id || v.name} className={`variable-card-v2 ${editingVar === v.name ? 'editing' : ''}`}>
            <div className="var-header">
              <div className="variable-name">{v.name}</div>
              {v.isScriptCreated && <span className="variable-tag">SCRIPT</span>}
              {!v.isScriptCreated && editingVar !== v.name && (
                <button className="var-edit-btn" onClick={() => startEdit(v)} title="Edit variable">
                  ✎
                </button>
              )}
            </div>
            {editingVar === v.name ? (
              <div className="var-edit-form">
                <textarea
                  className="var-edit-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={3}
                  autoFocus
                />
                <div className="var-edit-actions">
                  <button className="btn secondary small" onClick={cancelEdit}>
                    Cancel
                  </button>
                  <button className="btn primary small" onClick={() => saveVariable(v.name)}>
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="variable-definition" onClick={() => !v.isScriptCreated && startEdit(v)}>
                {v.definition || "—"}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className="empty-state">{filter ? `No variables match "${filter}"` : "No variables in this app"}</div>}
      </div>
    </div>
  );
}

// ============ STORIES ============
function StoriesView({ data }: { data: any }) {
  const stories = data.stories || [];

  return (
    <Card header={{ label: "Stories", title: `${stories.length} Stories`, gradient: "pink" }}>
      <div className="stories-grid">
        {stories.map((story: any) => (
          <div key={story.id} className="story-card">
            <div className="story-icon">📖</div>
            <div className="story-info">
              <div className="story-title">{story.title}</div>
              {story.description && <div className="story-desc">{story.description}</div>}
            </div>
          </div>
        ))}
        {stories.length === 0 && <div className="empty-state">No stories in this app</div>}
      </div>
    </Card>
  );
}

// ============ APP SCRIPT ============
// Qlik Script Keywords - Based on MattFryer/Qlik-Notepad-plus-plus
const QLIK_SCRIPT_STATEMENTS = /\b(ADD|ALIAS|AUTOGENERATE|BINARY|BUFFER|CALL|COMMENT|CONCATENATE|CONNECT|CROSSTABLE|DERIVE|DIMENSION|DIRECTORY|DISCONNECT|DROP|EACH|ENDSUB|ENDSWITCH|EXECUTE|EXIT|FIRST|FLUSHLOG|FORCE|FOR|FROM|GENERIC|GROUP\s+BY|HIERARCHY|HIERARCHYBELONGSTO|IF|INLINE|INNER|INPUTFIELD|INTERVALMATCH|INTO|JOIN|KEEP|LEFT|LET|LIB|LOAD|LOOSEN|LOOP|MAP|MAPPING|MEASURE|NATIVE|NEXT|NOCONCATENATE|NULLASNULL|NULLASVALUE|ODBC|OLEDB|OPTIMIZE|ORDER\s+BY|OUTER|QUALIFY|RENAME|REPLACE|RESIDENT|RIGHT|SAMPLE|SECTION|SELECT|SEMANTIC|SET|SLEEP|SQL|SQLCOLUMNS|SQLTABLES|SQLTYPES|STAR|STEP|STORE|SUB|SWITCH|TAG|THEN|TO|TRACE|UNLESS|UNMAP|UNQUALIFY|UNTAG|USING|WHEN|WHERE|WITH|CASE|DEFAULT|DO|WHILE|UNTIL|ELSE|ELSEIF|END)\b/gi;

const QLIK_AGGREGATION_FUNCTIONS = /\b(Avg|Chi2Test_chi2|Chi2Test_df|Chi2Test_p|Concat|Correl|Count|FirstSortedValue|FirstValue|Fractile|Kurtosis|LastValue|LINEST_B|LINEST_DF|LINEST_F|LINEST_M|LINEST_R2|LINEST_SEB|LINEST_SEM|LINEST_SEY|LINEST_SSREG|LINEST_SSRESID|Max|MaxString|Median|Min|MinString|MissingCount|Mode|NullCount|NumericCount|Only|Skew|Stdev|Sterr|STEYX|Sum|TextCount|TTest_conf|TTest_df|TTest_dif|TTest_lower|TTest_sig|TTest_sterr|TTest_t|TTest_upper|TTest1_conf|TTest1_df|TTest1_dif|TTest1_lower|TTest1_sig|TTest1_sterr|TTest1_t|TTest1_upper|TTestw_conf|TTestw_df|TTestw_dif|TTestw_lower|TTestw_sig|TTestw_sterr|TTestw_t|TTestw_upper|TTest1w_conf|TTest1w_df|TTest1w_dif|TTest1w_lower|TTest1w_sig|TTest1w_sterr|TTest1w_t|TTest1w_upper|ZTest_conf|ZTest_dif|ZTest_lower|ZTest_sig|ZTest_sterr|ZTest_z|ZTest_upper|ZTestw_conf|ZTestw_dif|ZTestw_lower|ZTestw_sig|ZTestw_sterr|ZTestw_z|ZTestw_upper)\b/gi;

const QLIK_STRING_FUNCTIONS = /\b(ApplyCodePage|Capitalize|Chr|FindOneOf|Index|KeepChar|Left|Len|Lower|LTrim|Mid|Ord|PurgeChar|Repeat|Replace|Right|RTrim|SubField|SubStringCount|Text|TextBetween|Trim|Upper|Evaluate|Hash128|Hash160|Hash256|Match|MixMatch|WildMatch|WildMatch5)\b/gi;

const QLIK_DATE_FUNCTIONS = /\b(AddMonths|AddYears|Age|ConvertToLocalTime|Date|Date#|Day|DayEnd|DayLight|DayName|DayNumberOfQuarter|DayNumberOfYear|DayStart|FirstWorkDate|GMT|Hour|InDay|InDayToTime|InLunarWeek|InLunarWeekToDate|InMonth|InMonths|InMonthsToDate|InMonthToDate|InQuarter|InQuarterToDate|InWeek|InWeekToDate|InYear|InYearToDate|Interval|Interval#|LastWorkDate|LocalTime|LunarWeekEnd|LunarWeekName|LunarWeekStart|MakeDate|MakeTime|MakeWeekDate|Minute|Month|MonthEnd|MonthName|MonthsEnd|MonthsName|MonthsStart|MonthStart|NetworkDays|Now|QuarterEnd|QuarterName|QuarterStart|ReloadTime|Second|SetDateYear|SetDateYearMonth|Time|Time#|Timestamp|Timestamp#|TimeZone|Today|UTC|Week|WeekDay|WeekEnd|WeekName|WeekStart|WeekYear|Year|YearEnd|YearName|YearStart|Year2Date|YearToDate)\b/gi;

const QLIK_MATH_FUNCTIONS = /\b(Abs|Acos|Asin|Atan|Atan2|BitCount|Ceil|Combin|Cos|Cosh|Div|E|Even|Exp|Fabs|Fact|Floor|Fmod|Frac|Log|Log10|Mod|Odd|Permut|Pi|Pow|Rand|Round|Sign|Sin|Sinh|Sqr|Sqrt|Tan|Tanh)\b/gi;

const QLIK_RANGE_FUNCTIONS = /\b(RangeAvg|RangeCorrel|RangeCount|RangeFractile|RangeIRR|RangeKurtosis|RangeMax|RangeMaxString|RangeMin|RangeMinString|RangeMissingCount|RangeMode|RangeNPV|RangeNullCount|RangeNumericCount|RangeOnly|RangeSkew|RangeStdev|RangeSum|RangeTextCount|RangeXIRR|RangeXNPV)\b/gi;

const QLIK_CONDITIONAL_FUNCTIONS = /\b(Alt|Class|Coalesce|If|IsNull|IsNum|IsText|Null|Pick)\b/gi;

const QLIK_COLOR_FUNCTIONS = /\b(ARGB|Black|Blue|Brown|Cyan|DarkGray|Green|HSL|LightBlue|LightCyan|LightGray|LightGreen|LightMagenta|LightRed|Magenta|QlikTechBlue|QlikTechGray|QlikViewGray|Red|RGB|SysColor|White|Yellow|ColorMapHue|ColorMapJet|ColorMix1|ColorMix2)\b/gi;

const QLIK_FILE_FUNCTIONS = /\b(Attribute|ConnectString|FileBaseName|FileDir|FileExtension|FileName|FilePath|FileSize|FileTime|GetFolderPath|QvdCreateTime|QvdFieldName|QvdNoOfFields|QvdNoOfRecords|QvdTableName)\b/gi;

const QLIK_TABLE_FUNCTIONS = /\b(FieldIndex|FieldName|FieldNumber|FieldValue|FieldValueCount|NoOfFields|NoOfRows|NoOfTables|TableName|TableNumber)\b/gi;

const QLIK_SYSTEM_FUNCTIONS = /\b(Author|ClientPlatform|ComputerName|DocumentName|DocumentPath|DocumentTitle|GetRegistryString|OSUser|QlikViewVersion|QVUser|ReloadTime)\b/gi;

const QLIK_INTER_RECORD = /\b(Above|After|Before|Below|Bottom|Column|Dimensionality|Exists|FieldIndex|First|Last|NoOfColumns|NoOfRows|Peek|Previous|RecNo|RowNo|SecondaryDimensionality|Top)\b/gi;

const QLIK_FINANCIAL_FUNCTIONS = /\b(BlackAndSchole|FV|IRR|NPV|NPER|Pmt|PV|Rate|XIRR|XNPV)\b/gi;

const QLIK_MAPPING_FUNCTIONS = /\b(ApplyMap|Lookup|MapSubString)\b/gi;

const QLIK_SYSTEM_VARIABLES = /\b(HidePrefix|HideSuffix|ThousandSep|DecimalSep|MoneyFormat|TimeFormat|DateFormat|TimestampFormat|MonthNames|DayNames|LongMonthNames|LongDayNames|FirstWeekDay|BrokenWeeks|ReferenceDay|FirstMonthOfYear|CollationLocale|NullInterpret|NullValue|NullDisplay|OtherSymbol)\b/gi;

const QLIK_OPERATORS = /\b(AND|OR|NOT|XOR|LIKE|PRECEDES|FOLLOWS)\b/gi;

function AppScriptView({ data }: { data: any }) {
  const script = data.script || "";
  const allLines: string[] = script.split("\n");
  const lineCount = data.lineCount || allLines.length;

  // Parse tabs from script - look for //$tab or ///$tab markers
  // Examples: ///$tab Load QVD Data, //$tab Main, ///$tab Create ML Training Data
  const parseTabs = () => {
    const tabs: Array<{ name: string; startLine: number; endLine: number }> = [];
    let currentTabName: string | null = null;
    let currentTabStart = 0;

    allLines.forEach((line, i) => {
      // Clean the line - remove carriage returns and trim
      const cleanLine = line.replace(/\r/g, '').trim();
      // Match ///$tab or //$tab followed by tab name
      const tabMatch = cleanLine.match(/^\/\/+\$tab\s+(.+)/i);
      if (tabMatch) {
        // Close previous tab
        if (currentTabName !== null) {
          tabs.push({ name: currentTabName, startLine: currentTabStart, endLine: i - 1 });
        }
        // Start new tab - trim the captured name
        currentTabName = tabMatch[1].trim();
        currentTabStart = i;
      }
    });

    // Close last tab
    if (currentTabName !== null) {
      tabs.push({ name: currentTabName, startLine: currentTabStart, endLine: allLines.length - 1 });
    }

    // If no tabs found, create a single "Main" tab
    if (tabs.length === 0) {
      tabs.push({ name: "Main", startLine: 0, endLine: allLines.length - 1 });
    }

    return tabs;
  };

  const tabs = parseTabs();
  const [activeTab, setActiveTab] = useState(0);

  // Get lines for current tab, filtering out the //$tab marker line
  const currentTab = tabs[activeTab];
  const rawTabLines = currentTab ? allLines.slice(currentTab.startLine, currentTab.endLine + 1) : allLines;

  // Filter out //$tab marker lines and track original line numbers
  const filteredLines: Array<{ line: string; lineNum: number }> = [];
  rawTabLines.forEach((line, i) => {
    const cleanLine = line.replace(/\r/g, '').trim();
    const isTabMarker = /^\/\/+\$tab\s+/i.test(cleanLine);
    if (!isTabMarker) {
      filteredLines.push({ line, lineNum: (currentTab?.startLine || 0) + i + 1 });
    }
  });

  // Syntax highlighting for Qlik Load Script
  const highlightLine = (line: string): React.ReactNode => {
    // Patterns for Qlik script syntax - order matters for precedence
    const patterns: Array<{ regex: RegExp; className: string }> = [
      // Comments (must be first)
      { regex: /(\/\/.*$)/g, className: "qs-comment" },
      { regex: /(\/\*[\s\S]*?\*\/)/g, className: "qs-comment" },
      { regex: /^(\s*REM\s+.*$)/gi, className: "qs-comment" },
      // Strings
      { regex: /('[^']*')/g, className: "qs-string" },
      { regex: /("[^"]*")/g, className: "qs-string" },
      // Variables $(var)
      { regex: /(\$\([^)]+\))/g, className: "qs-variable" },
      // Field references [Field]
      { regex: /(\[[^\]]+\])/g, className: "qs-field" },
      // Data sources (lib://, file extensions)
      { regex: /(lib:\/\/[^\s\]'";,]+)/gi, className: "qs-source" },
      { regex: /\.(qvd|qvw|qvs|txt|csv|xlsx?|xml|json|html|parquet)\b/gi, className: "qs-source" },
      // Numbers
      { regex: /\b(\d+\.?\d*)\b/g, className: "qs-number" },
      // Operators
      { regex: QLIK_OPERATORS, className: "qs-operator" },
      // Script Statements (keywords)
      { regex: QLIK_SCRIPT_STATEMENTS, className: "qs-keyword" },
      // System Variables
      { regex: QLIK_SYSTEM_VARIABLES, className: "qs-sysvar" },
      // Aggregation Functions
      { regex: QLIK_AGGREGATION_FUNCTIONS, className: "qs-function-agg" },
      // String Functions
      { regex: QLIK_STRING_FUNCTIONS, className: "qs-function-str" },
      // Date Functions
      { regex: QLIK_DATE_FUNCTIONS, className: "qs-function-date" },
      // Math Functions
      { regex: QLIK_MATH_FUNCTIONS, className: "qs-function-math" },
      // Range Functions
      { regex: QLIK_RANGE_FUNCTIONS, className: "qs-function-range" },
      // Conditional Functions
      { regex: QLIK_CONDITIONAL_FUNCTIONS, className: "qs-function-cond" },
      // Color Functions
      { regex: QLIK_COLOR_FUNCTIONS, className: "qs-function-color" },
      // File Functions
      { regex: QLIK_FILE_FUNCTIONS, className: "qs-function-file" },
      // Table Functions
      { regex: QLIK_TABLE_FUNCTIONS, className: "qs-function-table" },
      // System Functions
      { regex: QLIK_SYSTEM_FUNCTIONS, className: "qs-function-sys" },
      // Inter-Record Functions
      { regex: QLIK_INTER_RECORD, className: "qs-function-rec" },
      // Financial Functions
      { regex: QLIK_FINANCIAL_FUNCTIONS, className: "qs-function-fin" },
      // Mapping Functions
      { regex: QLIK_MAPPING_FUNCTIONS, className: "qs-function-map" },
    ];

    const tokens: Array<{ start: number; end: number; text: string; className: string }> = [];

    // Find all matches
    patterns.forEach(({ regex, className }) => {
      let match;
      const re = new RegExp(regex.source, regex.flags);
      while ((match = re.exec(line)) !== null) {
        tokens.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
          className,
        });
      }
    });

    // Sort by position and remove overlaps (first match wins)
    tokens.sort((a, b) => a.start - b.start);
    const filtered: typeof tokens = [];
    let lastEnd = 0;
    tokens.forEach(t => {
      if (t.start >= lastEnd) {
        filtered.push(t);
        lastEnd = t.end;
      }
    });

    // Build result with spans
    if (filtered.length === 0) return line;

    const parts: React.ReactNode[] = [];
    let pos = 0;
    filtered.forEach((t, i) => {
      if (t.start > pos) {
        parts.push(line.slice(pos, t.start));
      }
      parts.push(<span key={i} className={t.className}>{t.text}</span>);
      pos = t.end;
    });
    if (pos < line.length) {
      parts.push(line.slice(pos));
    }

    return parts;
  };

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{lineCount} lines</span>
        <span className="results-badge">{(script.length / 1024).toFixed(1)} KB</span>
      </div>
      <div className="script-layout">
        {/* Vertical tab sidebar */}
        {tabs.length > 0 && (
          <div className="script-tabs-vertical">
            {tabs.map((tab, i) => (
              <button
                key={i}
                className={`script-tab-v ${activeTab === i ? 'active' : ''}`}
                onClick={() => setActiveTab(i)}
              >
                {tab.name}
              </button>
            ))}
          </div>
        )}
        {/* Script content */}
        <div className="script-container">
          <div className="line-numbers">
            {filteredLines.map((item, i) => (
              <div key={i} className="line-number">{item.lineNum}</div>
            ))}
          </div>
          <pre className="script-code-highlighted">
            {filteredLines.map((item, i) => (
              <div key={i} className="code-line">
                {highlightLine(item.line) || " "}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ============ APP CONNECTIONS ============
function AppConnectionsView({ data }: { data: any }) {
  const connections = data.connections || [];

  return (
    <Card header={{ label: "Connections", title: `${connections.length} Connections`, gradient: "indigo" }}>
      <div className="connections-list">
        {connections.map((conn: any) => (
          <div key={conn.id} className="connection-card">
            <div className="connection-icon">🔗</div>
            <div className="connection-info">
              <div className="connection-name">{conn.name}</div>
              <div className="connection-type">{conn.type}</div>
            </div>
          </div>
        ))}
        {connections.length === 0 && <div className="empty-state">No connections in this app</div>}
      </div>
    </Card>
  );
}

// ============ DATA CONNECTIONS (Tenant Level) ============
function DataConnectionsGrid({ data, callTool }: { data: any; callTool: any }) {
  const [filter, setFilter] = useState("");
  const allConnections = data.connections || [];

  const filtered = allConnections.filter((conn: any) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return conn.name?.toLowerCase().includes(search) ||
           conn.type?.toLowerCase().includes(search);
  });

  const pagination = usePagination(filtered, 10);

  // Check if connection is a folder/file type
  const isFolderConnection = (type: string) => {
    const folderTypes = ['datafiles', 'folder', 'qix-datafiles', 'filestorage'];
    return folderTypes.some(ft => type?.toLowerCase().includes(ft));
  };

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{filtered.length} connection{filtered.length !== 1 ? 's' : ''}{filter && ` (filtered from ${allConnections.length})`}</span>
      </div>
      <div className="results-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Search connections..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">{filter ? `No connections match "${filter}"` : "No connections found"}</div>
      ) : (
        <div className="results-list">
          {pagination.items.map((conn: any) => (
            <button
              key={conn.id}
              className="result-row"
              onClick={() => callTool("data_connection_details", { connectionId: conn.id })}
            >
              <span className="result-icon">
                {isFolderConnection(conn.type) ? <FolderOpen size={16} /> : <Database size={16} />}
              </span>
              <span className="result-name">{conn.name}</span>
              <span className="result-meta">{conn.type}</span>
              <span className="result-arrow"><ChevronRight size={16} /></span>
            </button>
          ))}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

function DataConnectionDetail({ data }: { data: any }) {
  // The actual connection type is in qType or datasourceType, not in data.type (which is the structuredContent type)
  const connType = data.qType || data.datasourceType || data.qConnectStatement?.split(';')[0] || "Unknown";
  const connName = data.name || data.qName || "Connection Details";

  // Check if folder type connection
  const isFolderType = ['datafiles', 'folder', 'qix-datafiles'].some(
    ft => connType?.toLowerCase().includes(ft)
  );

  return (
    <Card header={{ label: "Connection", title: connName, gradient: "indigo" }}>
      <div className="connection-detail">
        <div className="conn-type-badge">
          {isFolderType ? <FolderOpen size={20} /> : <Database size={20} />}
          <span>{connType}</span>
        </div>

        <div className="detail-grid">
          {data.qType && (
            <div className="detail-item">
              <span className="label">Type</span>
              <span className="value">{data.qType}</span>
            </div>
          )}
          {data.datasourceID && (
            <div className="detail-item">
              <span className="label">Datasource ID</span>
              <span className="value mono">{data.datasourceID}</span>
            </div>
          )}
          {data.spaceId && (
            <div className="detail-item">
              <span className="label">Space</span>
              <span className="value">{data.spaceId}</span>
            </div>
          )}
          {data.ownerId && (
            <div className="detail-item">
              <span className="label">Owner ID</span>
              <span className="value mono">{data.ownerId}</span>
            </div>
          )}
          {data.user && (
            <div className="detail-item">
              <span className="label">User</span>
              <span className="value">{data.user}</span>
            </div>
          )}
          {data.qArchitecture && (
            <div className="detail-item">
              <span className="label">Architecture</span>
              <span className="value">{data.qArchitecture === 0 ? "32-bit" : "64-bit"}</span>
            </div>
          )}
          {data.createdAt && (
            <div className="detail-item">
              <span className="label">Created</span>
              <span className="value">{formatDate(data.createdAt)}</span>
            </div>
          )}
          {data.updatedAt && (
            <div className="detail-item">
              <span className="label">Updated</span>
              <span className="value">{formatDate(data.updatedAt)}</span>
            </div>
          )}
          {(data.qConnectStatement || data.connectionString) && (
            <div className="detail-item full">
              <span className="label">Connection String</span>
              <span className="value mono">{data.qConnectStatement || data.connectionString}</span>
            </div>
          )}
          {data.qLogOn && (
            <div className="detail-item">
              <span className="label">Log On</span>
              <span className="value">{data.qLogOn === 0 ? "Service Account" : data.qLogOn === 1 ? "Current User" : "Stored Credentials"}</span>
            </div>
          )}
        </div>

        {data.privileges && data.privileges.length > 0 && (
          <div className="conn-privileges">
            <span className="priv-label">Privileges:</span>
            <div className="priv-tags">
              {data.privileges.map((p: string, i: number) => (
                <span key={i} className="priv-tag">{p}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ============ APP GENERATED FLOW ============
function AppGeneratedFlow({ data }: { data: any }) {
  const formatDuration = (ms: number | undefined) => {
    if (!ms) return "";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const steps = data.steps || [];
  const isFailed = data.status === "failed";
  const hasError = steps.some((s: any) => s.status === "error");
  const overallStatus = (isFailed || hasError) ? "error" : "success";
  const statusText = isFailed ? "Failed" : hasError ? "Completed with errors" : "Completed";

  return (
    <div className="app-flow">
      <div className="flow-header-large">
        <div className="flow-app-name">{data.appName || "App Generation"}</div>
        <div className={`flow-status-badge ${overallStatus}`}>
          {statusText}
          {data.totalDuration ? ` - ${formatDuration(data.totalDuration)}` : ""}
        </div>
      </div>

      <div className="flow-steps-animated">
        {steps.map((step: any, i: number) => (
          <div key={i} className={`flow-step-live ${step.status}`}>
            <div className="step-connector-animated">
              {i > 0 && <div className={`step-line-live ${step.status !== "pending" ? "active" : ""}`}></div>}
              <div className={`step-circle-live ${step.status}`}>
                {step.status === "success" && <CheckCircle size={16} />}
                {step.status === "error" && "✕"}
                {step.status === "pending" && "○"}
              </div>
            </div>
            <div className="step-info-live">
              <div className="step-header">
                <span className={`step-name ${step.status === "pending" ? "pending" : ""}`}>{step.name}</span>
                {step.duration !== undefined && step.duration > 0 && (
                  <span className="step-duration">{formatDuration(step.duration)}</span>
                )}
              </div>
              <div className="step-detail">{step.detail || ""}</div>
            </div>
          </div>
        ))}
      </div>

      {data.appLink && (
        <div className="flow-footer animate-in">
          <a href={data.appLink} target="_blank" rel="noopener noreferrer" className="app-open-btn">
            Open in Qlik Sense <ExternalLink size={14} />
          </a>
        </div>
      )}

      {isFailed && data.error && (
        <div className="flow-error">
          <span className="error-icon">!</span>
          <span>{data.error}</span>
        </div>
      )}
    </div>
  );
}

// ============ ACTION SUCCESS ============
function ActionSuccess({ title, data }: { title: string; data: any }) {
  return (
    <Card header={{ label: "Success", title, gradient: "green" }}>
      <div className="success-content">
        <div className="success-icon"><CheckCircle size={48} /></div>
        <div className="success-details">
          {Object.entries(data).filter(([k]) => k !== "type").map(([key, val]) => (
            <div key={key} className="success-item">
              <span className="si-key">{key}:</span>
              <span className="si-val">{String(val)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ActionCancelled({ title, data }: { title: string; data: any }) {
  return (
    <Card header={{ label: "Cancelled", title, gradient: "orange" }}>
      <div className="success-content">
        <div className="success-icon cancelled"><XCircle size={48} /></div>
        <div className="success-details">
          {Object.entries(data).filter(([k]) => k !== "type").map(([key, val]) => (
            <div key={key} className="success-item">
              <span className="si-key">{key}:</span>
              <span className="si-val">{String(val)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ============ SELECTION INFO ============
function SelectionInfoView({ data }: { data: any }) {
  const selections = data.requestedSelections || data.selections || [];
  const note = data.note;
  const message = data.message;

  // Format selection values - handle both old (values array) and new (selected string) format
  const formatSelectionValues = (s: any): string => {
    if (s.values && Array.isArray(s.values)) {
      return s.values.join(", ");
    }
    if (s.selected) {
      return s.selected;
    }
    return "—";
  };

  // Format selection count
  const formatSelectionCount = (s: any): string => {
    if (s.selectedCount !== undefined && s.total !== undefined) {
      return `${s.selectedCount} of ${s.total}`;
    }
    return "";
  };

  return (
    <div className="selection-simple">
      <div className="selection-header">
        {data.appName || "Selection Info"}
      </div>
      {message && <div className="selection-message">{message}</div>}
      {selections.length > 0 ? (
        <div className="selection-list">
          {selections.map((s: any, i: number) => (
            <div key={i} className="selection-item">
              <div className="selection-item-header">
                <span className="selection-field">{s.field}</span>
                {formatSelectionCount(s) && (
                  <span className="selection-count">{formatSelectionCount(s)}</span>
                )}
              </div>
              <span className="selection-values">{formatSelectionValues(s)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="selection-empty">No active selections</div>
      )}
      {note && <div className="selection-note">{note}</div>}
    </div>
  );
}

// ============ JSON FALLBACK ============
function JsonView({ data }: { data: any }) {
  return (
    <Card header={{ label: "Data", title: "Response", gradient: "dark" }}>
      <div className="json-view">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    </Card>
  );
}

// ============ SHARED COMPONENTS ============
interface CardProps {
  header: { label?: string; title: string; gradient?: string };
  children: React.ReactNode;
}

function Card({ header, children }: CardProps) {
  return (
    <div className={`card ${header.gradient || ''}`}>
      <div className="card-header">
        <div className="header-title">{header.title}</div>
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value || "—"}</div>
    </div>
  );
}

// ============ HELPERS ============
function formatDate(d: string | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

function formatDateLong(d: string | undefined): string {
  if (!d) return "—";
  try {
    const date = new Date(d);
    const day = date.getDate();
    const month = date.toLocaleString("en", { month: "long" });
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, "0");
    const mins = date.getMinutes().toString().padStart(2, "0");
    return `${day} ${month} ${year} at ${hours}:${mins}`;
  } catch { return d; }
}

function formatSize(bytes: number | undefined): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}

// ============ RENDER ============
createRoot(document.getElementById("root")!).render(
  <StrictMode><QlikApp /></StrictMode>
);
