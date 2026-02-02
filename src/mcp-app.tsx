/**
 * Qlik MCP App - Premium Interactive UI
 * Beautiful, interactive visualizations for Qlik Cloud
 */
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useCallback, useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Chart, registerables } from "chart.js";
import {
  Bot, AppWindow, Rocket, CheckCircle, AlertTriangle, ChevronRight,
  ExternalLink, FolderOpen, Database, FlaskConical, Bell, Zap, RefreshCw,
  FileText, Search, File, Layers, XCircle, Clock, Timer, MoreVertical, GitBranch, Share2
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

  const { app, error } = useApp({
    appInfo: { name: "Qlik Mcp App", version: "2.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      setAppInstance(app);
      app.ontoolresult = async (result) => {
        setLoading(false);
        setToolResult(result);
      };
      app.onerror = (e) => { console.error(e); setLoading(false); };
      app.onhostcontextchanged = (params) => setHostContext((prev) => ({ ...prev, ...params }));
    },
  });

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

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
      await appInstance.callServerTool({ name: toolName, arguments: args });
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  }, [appInstance]);

  // Send action message to Claude for button clicks
  const sendAction = useCallback(async (action: string, context: Record<string, string>) => {
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
    <div className="app-container">
      {loading && <LoadingOverlay />}
      <ContentRouter data={data} callTool={callTool} sendAction={sendAction} />
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
function ItemMenu({ item, sendAction }: { item: { id: string; name: string; resourceType?: string }; sendAction: (action: string, context: Record<string, string>) => void }) {
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
function ContentRouter({ data, callTool, sendAction }: { data: any; callTool: (name: string, args?: any, selection?: any) => void; sendAction: (action: string, context: Record<string, string>) => void }) {
  if (!data) return null;

  const views: Record<string, React.ReactNode> = {
    "apps": <AppsGrid data={data} callTool={callTool} sendAction={sendAction} />,
    "app-detail": <AppDetail data={data} sendAction={sendAction} />,
    "spaces": <SpacesGrid data={data} callTool={callTool} />,
    "space-detail": <SpaceDetail data={data} callTool={callTool} sendAction={sendAction} />,
    "users": <UsersGrid data={data} callTool={callTool} />,
    "user-detail": <UserDetail data={data} />,
    "reloads": <ReloadsTimeline data={data} sendAction={sendAction} />,
    "reload-triggered": <ActionSuccess title="Reload Started" data={data} />,
    "reload-status": <ReloadStatus data={data} />,
    "reload-detail": <ReloadDetail data={data} />,
    "reload-cancelled": <ActionSuccess title="Reload Cancelled" data={data} />,
    "automations": <AutomationsGrid data={data} callTool={callTool} />,
    "automation-detail": <AutomationDetail data={data} sendAction={sendAction} />,
    "automation-runs": <AutomationRuns data={data} />,
    "automation-run": <ActionSuccess title="Automation Started" data={data} />,
    "alerts": <AlertsGrid data={data} callTool={callTool} />,
    "alert-detail": <AlertDetail data={data} sendAction={sendAction} />,
    "alert-triggered": <ActionSuccess title="Alert Triggered" data={data} />,
    "assistants": <AssistantsGrid data={data} callTool={callTool} />,
    "assistant-detail": <AssistantDetail data={data} sendAction={sendAction} />,
    "chat-response": <ChatResponse data={data} callTool={callTool} />,
    "insights": <InsightsView data={data} />,
    "chart": <ChartView data={data} />,
    "experiments": <ExperimentsGrid data={data} callTool={callTool} />,
    "experiment-detail": <ExperimentDetail data={data} />,
    "deployments": <DeploymentsGrid data={data} />,
    "lineage": <LineageView data={data} sendAction={sendAction} />,
    "app-lineage": <AppLineageView data={data} />,
    "datasets": <DatasetsGrid data={data} callTool={callTool} sendAction={sendAction} />,
    "dataset-detail": <DatasetDetail data={data} sendAction={sendAction} />,
    "tenant": <TenantView data={data} />,
    "license": <LicenseView data={data} />,
    "health": <HealthView data={data} />,
    "app-generated": <AppGeneratedFlow data={data} />,
    "error": <ErrorCard data={data} />,
  };

  // Check if data contains error indicators even if type isn't "error"
  if (data.isError || data.error || (data.message && data.message.includes("error"))) {
    return <ErrorCard data={data} />;
  }

  return views[data.type] || <JsonView data={data} />;
}

// ============ APPS ============
function AppsGrid({ data, callTool, sendAction }: { data: any; callTool: any; sendAction: (action: string, context: Record<string, string>) => void }) {
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
          {pagination.items.map((app: any) => {
            const { tool, type } = getToolAndType(app);
            return (
              <div key={app.id} className="result-row-wrapper">
                <button className="result-row" onClick={() => callTool(tool, { appId: app.id, datasetId: app.id, automationId: app.id }, { name: app.name, id: app.id, type })}>
                  <span className="result-icon">{getIcon(app.resourceType)}</span>
                  <span className="result-name">{app.name}</span>
                  {app.resourceType && <span className="result-meta">{app.resourceType}</span>}
                  <span className="result-date">{formatDate(app.updatedAt).split(',')[0]}</span>
                  <span className="result-arrow"><ChevronRight size={16} /></span>
                </button>
                <ItemMenu item={{ id: app.id, name: app.name, resourceType: app.resourceType || "app" }} sendAction={sendAction} />
              </div>
            );
          })}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

function AppDetail({ data, sendAction }: { data: any; sendAction: (action: string, context: Record<string, string>) => void }) {
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
      // Use sendAction to let Claude handle the insight query
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

function SpaceDetail({ data, callTool, sendAction }: { data: any; callTool: any; sendAction: (action: string, context: Record<string, string>) => void }) {
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
function UsersGrid({ data, callTool }: { data: any; callTool: any }) {
  const pagination = usePagination(data.users || []);

  return (
    <Card header={{ label: "Directory", title: `${data.users?.length || 0} Users`, gradient: "cyan" }}>
      {pagination.items.length === 0 ? (
        <div className="empty-state">No users found</div>
      ) : (
        <div className="users-grid">
          {pagination.items.map((user: any) => (
            <button key={user.id} className="user-card" onClick={() => callTool("qlik_get_user_info", { userId: user.id }, { name: user.name, id: user.id, type: "user" })}>
              <div className="user-avatar">{user.name?.charAt(0) || "?"}</div>
              <div className="user-info">
                <div className="user-name">{user.name}</div>
                <div className="user-email">{user.email}</div>
              </div>
              <span className={`status-badge ${user.status}`}>{user.status}</span>
            </button>
          ))}
        </div>
      )}
      <Pagination {...pagination} />
    </Card>
  );
}

function UserDetail({ data }: { data: any }) {
  return (
    <Card header={{ label: "User", title: data.name, gradient: "cyan" }}>
      <div className="stats-grid">
        <Stat label="Email" value={data.email} />
        <Stat label="Status" value={data.status} />
        <Stat label="Created" value={formatDate(data.createdAt)} />
        <Stat label="Last Updated" value={formatDate(data.lastUpdatedAt)} />
      </div>
    </Card>
  );
}

// ============ RELOADS ============
function ReloadsTimeline({ data, sendAction }: { data: any; sendAction: (action: string, context: Record<string, string>) => void }) {
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
    <div className="reload-history-panel">
      <div className="reload-history-header">
        <div className="reload-history-title">
          <RefreshCw size={18} />
          <span>Reload History</span>
        </div>
        <span className="reload-count">{data.reloads?.length || 0} total</span>
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
                  onClick={() => sendAction("Show me the reload log and details", { reloadId: reload.id })}
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
    <Card header={{ label: "Reload", title: data.status, gradient: data.status === "SUCCEEDED" ? "green" : "orange" }}>
      <div className="stats-grid">
        <Stat label="ID" value={data.id} />
        <Stat label="App" value={data.appId} />
        <Stat label="Started" value={formatDate(data.startTime)} />
        <Stat label="Duration" value={data.duration ? `${Math.round(data.duration / 1000)}s` : "In progress"} />
      </div>
    </Card>
  );
}

function ReloadDetail({ data }: { data: any }) {
  const statusGradient = data.status === "SUCCEEDED" ? "green" : data.status === "FAILED" ? "red" : "orange";

  return (
    <div className="reload-detail-panel">
      <div className={`reload-detail-header gradient-${statusGradient}`}>
        <div className="reload-detail-status">
          {data.status === "SUCCEEDED" ? <CheckCircle size={24} /> :
           data.status === "FAILED" ? <XCircle size={24} /> :
           <RefreshCw size={24} className={data.status === "RUNNING" ? "spinning" : ""} />}
          <span>{data.status}</span>
        </div>
        <div className="reload-detail-meta">
          {data.startTime && <span>{formatDate(data.startTime)}</span>}
          {data.historyLink && (
            <a href={data.historyLink} target="_blank" rel="noopener noreferrer" className="btn-history-link">
              <ExternalLink size={14} /> View in Qlik
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
  const allAutomations = data.automations || [];
  const pagination = usePagination(allAutomations);

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{allAutomations.length} automation{allAutomations.length !== 1 ? 's' : ''}</span>
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">No automations found</div>
      ) : (
        <div className="results-list">
          {pagination.items.map((auto: any) => (
            <button key={auto.id} className="result-row" onClick={() => callTool("qlik_automation_get_details", { automationId: auto.id }, { name: auto.name, id: auto.id, type: "automation" })}>
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

function AutomationDetail({ data, sendAction }: { data: any; sendAction: (action: string, context: Record<string, string>) => void }) {
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
  const pagination = usePagination(data.alerts || []);

  return (
    <Card header={{ label: "Notifications", title: `${data.alerts?.length || 0} Alerts`, gradient: "red" }}>
      {pagination.items.length === 0 ? (
        <div className="empty-state">No alerts found</div>
      ) : (
        <div className="list-view">
          {pagination.items.map((alert: any) => (
            <button key={alert.id} className="list-item interactive" onClick={() => callTool("qlik_alert_get", { alertId: alert.id }, { name: alert.name, id: alert.id, type: "alert" })}>
              <span className="li-icon"><Bell size={16} /></span>
              <div className="li-content">
                <div className="li-title">{alert.name}</div>
                <div className="li-meta">{alert.enabled ? "Enabled" : "Disabled"}</div>
              </div>
              <span className="li-arrow"><ChevronRight size={16} /></span>
            </button>
          ))}
        </div>
      )}
      <Pagination {...pagination} />
    </Card>
  );
}

function AlertDetail({ data, sendAction }: { data: any; sendAction: (action: string, context: Record<string, string>) => void }) {
  return (
    <Card header={{ label: "Alert", title: data.name, gradient: data.enabled ? "green" : "dark" }}>
      <div className="stats-grid">
        <Stat label="Status" value={data.enabled ? "Enabled" : "Disabled"} />
        <Stat label="Last Triggered" value={formatDate(data.lastTriggered)} />
      </div>
      {data.enabled && (
        <div className="action-buttons">
          <button className="btn primary" onClick={() => sendAction("Trigger this alert now", { alertId: data.id, alertName: data.name })}>
            Trigger Now
          </button>
        </div>
      )}
    </Card>
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

function AssistantDetail({ data, sendAction }: { data: any; sendAction: (action: string, context: Record<string, string>) => void }) {
  const [question, setQuestion] = useState("");

  const handleAsk = () => {
    if (question.trim()) {
      sendAction(`Ask the Qlik Answers assistant "${data.name}" this question: ${question.trim()}`, { assistantId: data.id });
      setQuestion("");
    }
  };

  return (
    <div className="assistant-detail-card">
      <div className="assistant-detail-header">
        <div className="assistant-icon-box">
          <Bot size={32} strokeWidth={1.5} />
        </div>
        <div className="assistant-info">
          <h2 className="assistant-name">{data.name}</h2>
          {data.description && <p className="assistant-desc">{data.description}</p>}
        </div>
      </div>
      <div className="assistant-meta">
        <div className="meta-item">
          <span className="meta-label">Created</span>
          <span className="meta-value">{formatDate(data.createdAt)}</span>
        </div>
        {data.updatedAt && (
          <div className="meta-item">
            <span className="meta-label">Updated</span>
            <span className="meta-value">{formatDate(data.updatedAt)}</span>
          </div>
        )}
        {data.ownerId && (
          <div className="meta-item">
            <span className="meta-label">Owner</span>
            <span className="meta-value">{data.ownerName || data.ownerId}</span>
          </div>
        )}
        {data.status && (
          <div className="meta-item">
            <span className="meta-label">Status</span>
            <span className={`status-badge status-${data.status.toLowerCase()}`}>{data.status}</span>
          </div>
        )}
        {data.visibility && (
          <div className="meta-item">
            <span className="meta-label">Visibility</span>
            <span className="meta-value">{data.visibility}</span>
          </div>
        )}
        {data.spaceId && (
          <div className="meta-item">
            <span className="meta-label">Space</span>
            <span className="meta-value">{data.spaceName || data.spaceId}</span>
          </div>
        )}
        <div className="meta-item">
          <span className="meta-label">ID</span>
          <span className="meta-value" style={{ fontSize: 11, fontFamily: "monospace" }}>{data.id}</span>
        </div>
      </div>
      <div className="assistant-ask-section">
        <h4>Ask a question</h4>
        <div className="chat-input">
          <input
            type="text"
            placeholder="e.g., What is the total revenue?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          />
          <button className="btn primary" onClick={handleAsk} disabled={!question.trim()}>
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
    <Card header={{ label: "AI Response", title: "Qlik Answers", gradient: "violet" }}>
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
        <div className="chat-input">
          <input
            type="text"
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
          <button className="btn primary" onClick={() => {
            if (followUp.trim()) {
              callTool("qlik_answers_ask_question", { assistantId: data.assistantId, question: followUp, threadId: data.threadId });
              setFollowUp("");
            }
          }}>Send</button>
        </div>
      )}
    </Card>
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
    <div className="insights-container">
      <div className="insights-header">
        <div className="insights-question">
          <span className="question-icon">✨</span>
          <span className="question-text">{data.question}</span>
        </div>
        <div className="insights-header-actions">
          {data.insightAdvisorLink && (
            <a
              href={data.insightAdvisorLink}
              target="_blank"
              rel="noopener noreferrer"
              className="open-qlik-btn"
            >
              <ExternalLink size={14} /> Open in Qlik
            </a>
          )}
          <div className="insights-count">{insights.length} visualization{insights.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

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
  const allExperiments = data.experiments || [];
  const pagination = usePagination(allExperiments);

  return (
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">{allExperiments.length} experiment{allExperiments.length !== 1 ? 's' : ''}</span>
      </div>
      {pagination.items.length === 0 ? (
        <div className="empty-state">No experiments found</div>
      ) : (
        <div className="results-list">
          {pagination.items.map((exp: any) => (
            <button key={exp.id} className="result-row" onClick={() => callTool("qlik_automl_get_experiment", { experimentId: exp.id }, { name: exp.name, id: exp.id, type: "experiment" })}>
              <span className="result-icon"><FlaskConical size={16} /></span>
              <span className="result-name">{exp.name}</span>
              <span className="result-meta">{exp.targetFeature}</span>
              <span className="result-date">{exp.status}</span>
              <span className="result-arrow"><ChevronRight size={16} /></span>
            </button>
          ))}
        </div>
      )}
      {pagination.totalPages > 1 && <Pagination {...pagination} />}
    </div>
  );
}

function ExperimentDetail({ data }: { data: any }) {
  return (
    <Card header={{ label: "Experiment", title: data.name, gradient: "teal" }}>
      <div className="stats-grid">
        <Stat label="Status" value={data.status} />
        <Stat label="Target" value={data.targetFeature} />
        <Stat label="Algorithm" value={data.algorithm || "Auto"} />
        <Stat label="Created" value={formatDate(data.createdAt)} />
      </div>
    </Card>
  );
}

function DeploymentsGrid({ data }: { data: any }) {
  const pagination = usePagination(data.deployments || []);

  return (
    <Card header={{ label: "ML Deployments", title: `${data.deployments?.length || 0} Active`, gradient: "teal" }}>
      {pagination.items.length === 0 ? (
        <div className="empty-state">No deployments found</div>
      ) : (
        <div className="list-view">
          {pagination.items.map((dep: any) => (
            <div key={dep.id} className="list-item">
              <span className="li-icon"><Rocket size={16} /></span>
              <div className="li-content">
                <div className="li-title">{dep.name}</div>
                <div className="li-meta">{dep.status}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination {...pagination} />
    </Card>
  );
}

// ============ LINEAGE ============
function LineageView({ data, sendAction }: { data: any; sendAction: (action: string, context: Record<string, string>) => void }) {
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
      <div className="lineage-view">
        <div className="lineage-title">
          <h2>Data Lineage</h2>
          <span className="lineage-badge">No data</span>
        </div>
        <div className="empty-state">No lineage information available for this resource</div>
      </div>
    );
  }

  return (
    <div className="lineage-view">
      <div className="lineage-title">
        <h2>Data Lineage</h2>
        <span className="lineage-badge">{nodesList.length} nodes</span>
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

  if (sources.length === 0 && internal.length === 0) {
    return (
      <div className="lineage-view">
        <div className="lineage-title">
          <h2>App Data Sources</h2>
          <span className="lineage-badge">No data</span>
        </div>
        <div className="empty-state">No data sources found for this app</div>
      </div>
    );
  }

  return (
    <div className="lineage-view">
      <div className="lineage-title">
        <h2>App Data Sources</h2>
        <span className="lineage-badge">{sources.length} external sources</span>
      </div>

      <div className="app-lineage-content">
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
function DatasetsGrid({ data, callTool, sendAction }: { data: any; callTool: any; sendAction: (action: string, context: Record<string, string>) => void }) {
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

function DatasetDetail({ data, sendAction }: { data: any; sendAction: (action: string, context: Record<string, string>) => void }) {
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
        <button className="btn primary" onClick={() => sendAction("Generate a Qlik app from this dataset", { datasetId: data.id, datasetName: data.name, spaceName: data.spaceName || "Personal" })}>
          Generate App
        </button>
        <button className="btn secondary" onClick={() => sendAction("Show data lineage for this dataset", { datasetId: data.id, datasetName: data.name, secureQri: data.secureQri || "", qri: data.qri || "" })}>
          View Lineage
        </button>
      </div>
    </div>
  );
}

// ============ TENANT & LICENSE ============
function TenantView({ data }: { data: any }) {
  return (
    <Card header={{ label: "Tenant", title: data.name, gradient: "dark" }}>
      <div className="stats-grid">
        <Stat label="ID" value={data.id} />
        <Stat label="Region" value={data.datacenter || "N/A"} />
        <Stat label="Created" value={formatDate(data.createdDate)} />
      </div>
    </Card>
  );
}

function LicenseView({ data }: { data: any }) {
  return (
    <Card header={{ label: "License", title: "Consumption Overview", gradient: "amber" }}>
      <div className="stats-grid">
        <Stat label="Plan" value={data.licenseType || "Enterprise"} />
        <Stat label="Users" value={data.totalUsers || "N/A"} />
        <Stat label="Apps" value={data.totalApps || "N/A"} />
      </div>
    </Card>
  );
}

function HealthView({ data }: { data: any }) {
  const healthy = data.status === "healthy";
  return (
    <Card header={{ label: "Status", title: healthy ? "All Systems Operational" : "Issues Detected", gradient: healthy ? "green" : "red" }}>
      <div className="health-status">
        <div className={`health-indicator ${healthy ? "healthy" : "unhealthy"}`}></div>
        <div className="health-info">
          <div className="health-label">{data.tenant}</div>
          {data.user && <div className="health-user">Connected as: {data.user}</div>}
          {data.error && <div className="health-error">{data.error}</div>}
        </div>
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
