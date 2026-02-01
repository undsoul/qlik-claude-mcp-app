/**
 * Qlik Cloud MCP App Server - Full Featured
 * Tool names match qlik-claude-mcp repository convention
 * Text responses are minimal - UI is the primary interface
 */
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import enigma from "enigma.js";
import WebSocket from "ws";

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

const TENANT_URL = process.env.QLIK_TENANT_URL || "";
const API_KEY = process.env.QLIK_API_KEY || "";

/**
 * Qlik API Client
 */
class QlikClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(tenantUrl: string, apiKey: string) {
    this.baseUrl = tenantUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  private async fetch(endpoint: string, options?: RequestInit): Promise<any> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}/api/v1${endpoint}`;
    console.error(`[Qlik API] ${options?.method || 'GET'} ${url}`);
    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      console.error(`[Qlik API] Error ${response.status}: ${text.slice(0, 500)}`);
      throw new Error(`Qlik API error: ${response.status} - ${text.slice(0, 200)}`);
    }
    // Handle empty responses (204 No Content or empty body)
    const text = await response.text();
    if (!text) return { success: true };
    try {
      return JSON.parse(text);
    } catch {
      return { success: true, raw: text };
    }
  }

  // ============ SEARCH ============
  async search(query?: string, types?: string[], spaceId?: string, sort = "-updatedAt"): Promise<any> {
    // Use cursor-based pagination to fetch all items
    const allItems: any[] = [];
    let cursor: string | null = null;
    const pageSize = 100; // Max page size for Qlik API

    do {
      const params = new URLSearchParams({ limit: String(pageSize), sort });
      if (query) params.set("query", query);
      if (spaceId) params.set("spaceId", spaceId);
      if (types && types.length > 0 && !types.includes("all")) {
        params.set("resourceType", types.join(","));
      }
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/items?${params}`);
      const items = result.data || [];
      allItems.push(...items);

      // Get next cursor from links
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;

      // Safety limit to prevent infinite loops (max 2000 items)
      if (allItems.length >= 2000) break;
    } while (cursor);

    return allItems;
  }

  // ============ APPS ============
  async getApp(appId: string): Promise<any> {
    return this.fetch(`/apps/${appId}`);
  }

  // ============ SPACES ============
  async getSpacesCatalog(query?: string, spaceType?: string): Promise<any> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: "100" });
      if (query) params.set("name", query);
      if (spaceType && spaceType !== "all") params.set("type", spaceType);
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/spaces?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 1000) break;
    } while (cursor);

    return allItems;
  }

  async getSpace(spaceId: string): Promise<any> {
    return this.fetch(`/spaces/${spaceId}`);
  }

  async getSpaceDetails(spaceId: string): Promise<any> {
    // Get space info
    const space = await this.fetch(`/spaces/${spaceId}`);

    // Get items in the space
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: "100", spaceId, sort: "-updatedAt" });
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/items?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 500) break;
    } while (cursor);

    return { space, items: allItems };
  }

  // ============ USERS ============
  async getUsers(): Promise<any> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/users?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 2000) break;
    } while (cursor);

    return allItems;
  }

  async getUserInfo(userId: string): Promise<any> {
    return this.fetch(`/users/${userId}`);
  }

  async searchUsers(query: string): Promise<any> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ filter: `name co "${query}" or email co "${query}"`, limit: "100" });
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/users?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 2000) break;
    } while (cursor);

    return allItems;
  }

  // ============ RELOADS ============
  async getReloadInfo(appId: string): Promise<any> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ appId, limit: "100", sort: "-startTime" });
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/reloads?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 500) break; // Reloads: reasonable history limit
    } while (cursor);

    return allItems;
  }

  async triggerAppReload(appId: string, partial = false): Promise<any> {
    return this.fetch("/reloads", { method: "POST", body: JSON.stringify({ appId, partial }) });
  }

  async getReloadStatus(reloadId: string): Promise<any> {
    return this.fetch(`/reloads/${reloadId}`);
  }

  async cancelReload(reloadId: string): Promise<any> {
    return this.fetch(`/reloads/${reloadId}/actions/cancel`, { method: "POST" });
  }

  // ============ AUTOMATIONS ============
  async automationList(filter?: string): Promise<any> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: "100" });
      if (filter) params.set("filter", filter);
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/automations?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 1000) break;
    } while (cursor);

    return allItems;
  }

  async automationGetDetails(automationId: string): Promise<any> {
    return this.fetch(`/automations/${automationId}`);
  }

  async automationRun(automationId: string): Promise<any> {
    return this.fetch(`/automations/${automationId}/actions/run`, { method: "POST" });
  }

  async automationListRuns(automationId: string): Promise<any> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: "100", sort: "-startTime" });
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/automations/${automationId}/runs?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 500) break; // Reasonable limit for run history
    } while (cursor);

    return allItems;
  }

  // ============ ALERTS ============
  async alertList(spaceId?: string, enabled?: boolean): Promise<any> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: "100" });
      if (spaceId) params.set("spaceId", spaceId);
      if (enabled !== undefined) params.set("enabled", String(enabled));
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/alerts?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 1000) break;
    } while (cursor);

    return allItems;
  }

  async alertGet(alertId: string): Promise<any> {
    return this.fetch(`/alerts/${alertId}`);
  }

  async alertTrigger(alertId: string): Promise<any> {
    return this.fetch(`/alerts/${alertId}/actions/trigger`, { method: "POST" });
  }

  async alertDelete(alertId: string): Promise<any> {
    return this.fetch(`/alerts/${alertId}`, { method: "DELETE" });
  }

  // ============ QLIK ANSWERS ============
  async answersListAssistants(search?: string, spaceId?: string): Promise<any> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: "100" });
      if (search) params.set("search", search);
      if (spaceId) params.set("spaceId", spaceId);
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/assistants?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 500) break;
    } while (cursor);

    return allItems;
  }

  async answersGetAssistant(assistantId: string): Promise<any> {
    return this.fetch(`/assistants/${assistantId}`);
  }

  async answersAskQuestion(assistantId: string, question: string, threadId?: string): Promise<any> {
    // If no threadId, create a new thread first
    let actualThreadId = threadId;
    if (!actualThreadId) {
      const threadName = `Conversation: ${new Date().toISOString()}`;
      console.error(`[Qlik Answers] Creating thread: ${threadName}`);
      const threadResponse = await this.fetch(`/assistants/${assistantId}/threads`, {
        method: "POST",
        body: JSON.stringify({ name: threadName })
      });
      actualThreadId = threadResponse.id;
      console.error(`[Qlik Answers] Created thread: ${actualThreadId}`);
    }

    // Invoke the question on the thread
    const requestBody = {
      input: {
        prompt: question,
        promptType: "thread",
        includeText: true
      }
    };
    console.error(`[Qlik Answers] Invoking with body: ${JSON.stringify(requestBody)}`);

    const response = await this.fetch(`/assistants/${assistantId}/threads/${actualThreadId}/actions/invoke`, {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
    console.error(`[Qlik Answers] Response: ${JSON.stringify(response)}`);

    return {
      answer: response.output,
      threadId: actualThreadId,
      sources: response.sources,
      question: question
    };
  }

  // ============ INSIGHT ADVISOR ============
  async insightAdvisor(appId: string, text: string): Promise<any> {
    return this.fetch(`/apps/${appId}/insight-analyses/actions/recommend`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  }

  // Get actual chart data from Qlik Engine
  async getChartData(appId: string, hypercubeDef: any): Promise<{ labels: string[]; values: number[]; title: string }> {
    const wsUrl = `${this.baseUrl.replace("https://", "wss://")}/app/${appId}`;
    console.error(`[Engine] Connecting to ${wsUrl}`);

    const schema: object = await fetch("https://unpkg.com/enigma.js@2.14.0/schemas/12.936.0.json").then(r => r.json()) as object;

    const session = enigma.create({
      schema,
      url: wsUrl,
      createSocket: (url: string) => new WebSocket(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }) as any,
    });

    try {
      const global: any = await session.open();
      console.error(`[Engine] Session opened`);

      const app: any = await global.openDoc(appId);
      console.error(`[Engine] App opened`);

      // FIX: Use only FIRST dimension to get aggregated data
      // Insight Advisor often returns 2+ dimensions, but we want totals by first dim
      const simplifiedDef = {
        qDimensions: hypercubeDef.qDimensions?.slice(0, 1) || [],
        qMeasures: hypercubeDef.qMeasures || [],
        qSuppressZero: true,
        qSuppressMissing: true,
        qInterColumnSortOrder: [0, 1], // Sort by dimension first
      };

      console.error(`[Engine] Simplified: ${simplifiedDef.qDimensions.length} dims, ${simplifiedDef.qMeasures.length} measures`);

      const obj: any = await app.createSessionObject({
        qInfo: { qType: "temp-hypercube" },
        qHyperCubeDef: simplifiedDef,
      });
      console.error(`[Engine] Object created`);

      const layout: any = await obj.getLayout();
      const hyperCube = layout.qHyperCube;

      if (!hyperCube) {
        throw new Error("No hypercube in layout");
      }

      const totalRows = hyperCube.qSize?.qcy || 0;
      const totalCols = hyperCube.qSize?.qcx || 0;
      console.error(`[Engine] Hypercube size: ${totalRows} rows x ${totalCols} cols`);
      console.error(`[Engine] DimensionInfo: ${JSON.stringify(hyperCube.qDimensionInfo?.map((d: any) => d.qFallbackTitle))}`);
      console.error(`[Engine] MeasureInfo: ${JSON.stringify(hyperCube.qMeasureInfo?.map((m: any) => m.qFallbackTitle))}`);

      // Explicitly fetch data using getHyperCubeData (key fix from working MCP)
      const rowsToFetch = Math.min(totalRows, 1000);
      const dataPages = await obj.getHyperCubeData("/qHyperCubeDef", [{
        qTop: 0,
        qLeft: 0,
        qWidth: totalCols,
        qHeight: rowsToFetch,
      }]);

      const matrix = dataPages?.[0]?.qMatrix || [];
      console.error(`[Engine] Matrix rows: ${matrix.length}`);

      // Log first row to debug
      if (matrix.length > 0) {
        console.error(`[Engine] First row: ${JSON.stringify(matrix[0])}`);
        if (matrix.length > 1) {
          console.error(`[Engine] Second row: ${JSON.stringify(matrix[1])}`);
        }
      }

      // Extract labels and values (simplified: 1 dim + 1 measure)
      const labels: string[] = [];
      const values: number[] = [];

      for (const row of matrix) {
        // Column 0 = dimension (label)
        const dimCell = row[0];
        // Column 1 = measure (value)
        const measureCell = row[1];

        if (dimCell?.qText) {
          labels.push(dimCell.qText);
        }

        if (measureCell) {
          // Prefer qNum (actual numeric value)
          if (typeof measureCell.qNum === "number" && !isNaN(measureCell.qNum)) {
            values.push(measureCell.qNum);
          } else if (measureCell.qText) {
            // Fallback to parsing qText
            const parsed = parseFloat(measureCell.qText.replace(/[^\d.-]/g, ""));
            values.push(isNaN(parsed) ? 0 : parsed);
          } else {
            values.push(0);
          }
        }
      }

      console.error(`[Engine] Extracted ${labels.length} labels, ${values.length} values`);
      console.error(`[Engine] Sample: labels=${labels.slice(0, 3).join(", ")} values=${values.slice(0, 3).join(", ")}`);

      await app.destroySessionObject(obj.id);
      await session.close();
      return { labels, values, title: "" };
    } catch (err: any) {
      console.error(`[Engine] Error: ${err.message}`);
      console.error(`[Engine] Stack: ${err.stack}`);
      await session.close().catch(() => {});
      throw err;
    }
  }

  // ============ AUTOML ============
  async automlGetExperiments(spaceId?: string): Promise<any> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: "100" });
      if (spaceId) params.set("spaceId", spaceId);
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/automl/experiments?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 500) break;
    } while (cursor);

    return allItems;
  }

  async automlGetExperiment(experimentId: string): Promise<any> {
    return this.fetch(`/automl/experiments/${experimentId}`);
  }

  async automlListDeployments(spaceId?: string): Promise<any> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: "100" });
      if (spaceId) params.set("spaceId", spaceId);
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/automl/deployments?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 500) break;
    } while (cursor);

    return allItems;
  }

  async automlGetDeployment(deploymentId: string): Promise<any> {
    return this.fetch(`/automl/deployments/${deploymentId}`);
  }

  // ============ LINEAGE ============
  async getLineage(nodeId: string, direction = "both", levels = -1): Promise<any> {
    const encodedQri = encodeURIComponent(nodeId);
    const params = new URLSearchParams();

    // Set up/down levels based on direction (-1 = unlimited)
    if (direction === 'upstream') {
      params.set('up', String(levels));
      params.set('down', '0');
    } else if (direction === 'downstream') {
      params.set('up', '0');
      params.set('down', String(levels));
    } else {
      // Both directions (default) - use -1 for unlimited
      params.set('up', String(levels));
      params.set('down', String(levels));
    }

    // Set level to 'resource' (not field or table depth)
    params.set('level', 'resource');

    // Don't collapse internal nodes - show full lineage
    params.set('collapse', 'false');

    console.error(`[Lineage] Fetching lineage for ${nodeId} with params: ${params.toString()}`);
    const result = await this.fetch(`/lineage-graphs/nodes/${encodedQri}?${params.toString()}`);

    // Log the response for debugging
    console.error(`[Lineage] Response nodes: ${Object.keys(result?.graph?.nodes || {}).length}, edges: ${result?.graph?.edges?.length || 0}`);

    return result;
  }

  // ============ APP LINEAGE ============
  async getAppLineage(appId: string): Promise<any> {
    console.error(`[AppLineage] Fetching data lineage for app ${appId}`);
    const lineageData = await this.fetch(`/apps/${appId}/data/lineage`);

    // Parse the lineage data into a more structured format
    const sources: any[] = [];
    const internal: any[] = [];

    for (const item of lineageData || []) {
      const disc = item.discriminator || "";

      // External data files (QVD, Excel, etc.)
      if (disc.startsWith("{lib://")) {
        const match = disc.match(/\{lib:\/\/([^:]+)[^}]*:([^}]+)\}/);
        if (match) {
          const connection = match[1];
          const path = match[2];
          const fileName = path.split('/').pop() || path;
          const ext = fileName.split('.').pop()?.toLowerCase() || "";
          sources.push({
            type: ext === "qvd" ? "QVD" : ext === "xlsx" || ext === "xls" ? "Excel" : "File",
            connection,
            path,
            fileName,
            discriminator: disc
          });
        }
      }
      // Internal/resident tables
      else if (disc.startsWith("RESIDENT ")) {
        internal.push({
          type: "Resident",
          table: disc.replace("RESIDENT ", "").replace(";", ""),
          discriminator: disc
        });
      }
      // Inline data
      else if (disc === "INLINE;") {
        internal.push({ type: "Inline", discriminator: disc });
      }
      // Autogenerate
      else if (disc === "AUTOGENERATE;") {
        internal.push({ type: "AutoGenerate", discriminator: disc });
      }
    }

    console.error(`[AppLineage] Found ${sources.length} external sources, ${internal.length} internal sources`);
    return { sources, internal, raw: lineageData };
  }

  // ============ DATASETS ============
  async getDatasetDetails(datasetId: string): Promise<any> {
    // Main dataset fetch - return everything
    const dataset = await this.fetch(`/data-sets/${datasetId}`);

    // Log raw response for debugging
    console.error("Raw dataset response:", JSON.stringify(dataset, null, 2));

    // Return raw data - let the tool handler extract what it needs
    return dataset;
  }

  async getDatasets(spaceId?: string): Promise<any> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: "100" });
      if (spaceId) params.set("spaceId", spaceId);
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/data-sets?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 1000) break;
    } while (cursor);

    return allItems;
  }

  // Get space name by ID
  async getSpaceName(spaceId: string): Promise<string | null> {
    try {
      const space = await this.fetch(`/spaces/${spaceId}`);
      return space.name || null;
    } catch {
      return null;
    }
  }

  // Get user name by ID
  async getUserName(userId: string): Promise<string | null> {
    try {
      const user = await this.fetch(`/users/${userId}`);
      return user.name || null;
    } catch {
      return null;
    }
  }

  // ============ APP GENERATION ============
  async createApp(appName: string, spaceId?: string): Promise<any> {
    const body: any = {
      attributes: { name: appName },
    };
    if (spaceId) {
      body.attributes.spaceId = spaceId;
    }
    // Log the request for debugging
    console.error(`Creating app: ${appName} in space: ${spaceId || 'Personal'}`);
    return this.fetch("/apps", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async setAppScript(appId: string, script: string): Promise<any> {
    // Cloud API uses POST to /apps/{id}/scripts (plural)
    return this.fetch(`/apps/${appId}/scripts`, {
      method: "POST",
      body: JSON.stringify({
        script,
        versionMessage: `Updated via MCP at ${new Date().toISOString()}`
      }),
    });
  }

  async reloadApp(appId: string): Promise<any> {
    return this.fetch("/reloads", {
      method: "POST",
      body: JSON.stringify({ appId }),
    });
  }

  // ============ SELECTIONS (Engine API via REST) ============
  async getAppFields(appId: string): Promise<any> {
    // Get app metadata which includes table/field info
    const result = await this.fetch(`/apps/${appId}/data/metadata`);
    return result;
  }

  async getAppSelections(appId: string): Promise<any> {
    // Note: Full selection state requires Engine API WebSocket
    // This returns basic app state info
    return this.fetch(`/apps/${appId}`);
  }

  // ============ TENANT & GOVERNANCE ============
  async getTenantInfo(): Promise<any> {
    return this.fetch("/tenants/me");
  }

  async getLicenseInfo(): Promise<any> {
    return this.fetch("/licenses/overview");
  }

  async healthCheck(): Promise<any> {
    try {
      const user = await this.fetch("/users/me");
      return { status: "healthy", tenant: this.baseUrl, user: user.name || user.email };
    } catch (error) {
      return { status: "unhealthy", error: String(error) };
    }
  }
}

/**
 * Creates the MCP server with all Qlik tools
 * Tool names match qlik-claude-mcp repository
 */
// Qlik logo as base64 SVG data URI
const QLIK_ICON = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDEwMCAxMDAiPjxjaXJjbGUgY3g9IjQ1IiBjeT0iNDUiIHI9IjM1IiBmaWxsPSIjMDA5ODQ1Ii8+PGNpcmNsZSBjeD0iNDUiIGN5PSI0NSIgcj0iMjUiIGZpbGw9IndoaXRlIi8+PGNpcmNsZSBjeD0iNDUiIGN5PSI0NSIgcj0iMTgiIGZpbGw9IiMwMDk4NDUiLz48cmVjdCB4PSI2MCIgeT0iNjAiIHdpZHRoPSIzNSIgaGVpZ2h0PSIxMiIgcng9IjYiIGZpbGw9IiMwMDk4NDUiIHRyYW5zZm9ybT0icm90YXRlKC00NSA3NyA2NikiLz48L3N2Zz4=";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "Qlik Mcp App",
    version: "2.0.0",
    icons: [{ src: QLIK_ICON, mimeType: "image/svg+xml" }]
  });
  const qlik = new QlikClient(TENANT_URL, API_KEY);
  const resourceUri = "ui://qlik/mcp-app.html";

  if (TENANT_URL && API_KEY) {
    console.error(`[OK] Qlik MCP App configured: ${TENANT_URL}`);
  } else {
    console.error("[WARN] Missing QLIK_TENANT_URL or QLIK_API_KEY");
  }

  // ==================== UNIFIED SEARCH ====================

  registerAppTool(server, "search", {
    title: "Search",
    description: `Unified search for Qlik resources across Cloud. The UI displays results - DO NOT list them again in text.

Supported resource types: app, qvapp, dataset, automation, note, genericlink, collection, space

If multiple results found, ask user which one they want before calling detail tools.`,
    inputSchema: {
      query: z.string().optional().describe("Search text - matches name, description, and tags"),
      types: z.array(z.string()).optional().default(["all"]).describe("Resource types: app, qvapp, dataset, automation, note, space, all"),
      spaceId: z.string().optional().describe("Filter by space ID"),
      spaceName: z.string().optional().describe("Filter by space name"),
      sort: z.string().optional().default("-updatedAt").describe("Sort field: -updatedAt, updatedAt, -name, name, -createdAt, createdAt"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const items = await qlik.search(args.query, args.types, args.spaceId, args.sort);
    const mapped = items.map((item: any) => ({
      id: item.resourceId || item.id,
      name: item.name,
      description: item.description || "",
      resourceType: item.resourceType,
      owner: item.ownerId,
      space: item.spaceId,
      updatedAt: item.updatedAt,
    }));
    return {
      content: [{ type: "text", text: `Found ${mapped.length} results` }],
      structuredContent: { type: "apps", apps: mapped, query: args.query },
    };
  });

  // ==================== APP DETAILS ====================

  registerAppTool(server, "app_details", {
    title: "Get App Details",
    description: `Get detailed information about a specific Qlik app.

IMPORTANT: The UI displays ALL details in a rich visual card. DO NOT:
- List or repeat any app properties
- Create tables or summaries
- Describe the owner, dates, or status

Simply say "Here are the details" or ask what the user wants to do next.`,
    inputSchema: {
      appId: z.string().describe("The app ID to get details for"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const app = await qlik.getApp(args.appId);
    const attrs = app.attributes || app;
    const appId = app.id || args.appId;

    // Fetch owner name and space name in parallel
    const [ownerName, spaceName] = await Promise.all([
      attrs.ownerId ? qlik.getUserName(attrs.ownerId) : Promise.resolve(null),
      attrs.spaceId ? qlik.getSpaceName(attrs.spaceId) : Promise.resolve(null),
    ]);

    return {
      content: [{ type: "text", text: `[App details displayed in UI]` }],
      structuredContent: {
        type: "app-detail",
        id: appId,
        name: attrs.name,
        description: attrs.description,
        createdDate: attrs.createdDate,
        modifiedDate: attrs.modifiedDate,
        lastReloadTime: attrs.lastReloadTime,
        published: attrs.published,
        publishTime: attrs.publishTime,
        owner: attrs.owner || { name: ownerName, id: attrs.ownerId },
        ownerId: attrs.ownerId,
        ownerName: ownerName,
        spaceId: attrs.spaceId,
        spaceName: spaceName,
      },
    };
  });

  // ==================== SPACES CATALOG ====================

  registerAppTool(server, "spaces", {
    title: "Get Spaces Catalog",
    description: `Get comprehensive catalog of spaces in Qlik Cloud tenant. The UI displays results - DO NOT list them again in text.

If multiple spaces found, ask user which one they want before calling detail tools.`,
    inputSchema: {
      query: z.string().optional().describe("Search query for space name"),
      spaceType: z.enum(["personal", "shared", "managed", "data", "all"]).optional().describe("Filter by space type"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const spaces = await qlik.getSpacesCatalog(args.query, args.spaceType);
    const mapped = spaces.map((s: any) => ({
      id: s.id, name: s.name, type: s.type, owner: s.ownerId, description: s.description,
    }));
    return {
      content: [{ type: "text", text: `Found ${mapped.length} spaces` }],
      structuredContent: { type: "spaces", spaces: mapped },
    };
  });

  registerAppTool(server, "space_details", {
    title: "Get Space Details",
    description: `Get detailed information about a space including all items in it. The UI displays the space info and items - DO NOT list them again in text.`,
    inputSchema: {
      spaceId: z.string().describe("The space ID to get details for"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const { space, items } = await qlik.getSpaceDetails(args.spaceId);
    const mappedItems = items.map((item: any) => ({
      id: item.id,
      name: item.name,
      resourceType: item.resourceType,
      description: item.description,
      updatedAt: item.updatedAt,
      createdAt: item.createdAt,
      ownerId: item.ownerId,
    }));
    return {
      content: [{ type: "text", text: `Space "${space.name}" has ${mappedItems.length} items` }],
      structuredContent: {
        type: "space-detail",
        id: space.id,
        name: space.name,
        description: space.description,
        spaceType: space.type,
        createdAt: space.createdAt,
        updatedAt: space.updatedAt,
        ownerId: space.ownerId,
        items: mappedItems,
      },
    };
  });

  // ==================== GOVERNANCE ====================

  registerAppTool(server, "tenant", {
    title: "Get Tenant Info",
    description: "Get Qlik Cloud tenant information",
    inputSchema: {},
    _meta: { ui: { resourceUri } },
  }, async (): Promise<CallToolResult> => {
    const tenant = await qlik.getTenantInfo();
    return {
      content: [{ type: "text", text: `Tenant: ${tenant.name}` }],
      structuredContent: { type: "tenant", ...tenant },
    };
  });

  registerAppTool(server, "user", {
    title: "Get User Info",
    description: "Get detailed user information. When user selects from UI, use the user ID provided.",
    inputSchema: { userId: z.string().describe("User ID") },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const user = await qlik.getUserInfo(args.userId);
    return {
      content: [{ type: "text", text: `User: ${user.name}` }],
      structuredContent: { type: "user-detail", ...user },
    };
  });

  registerAppTool(server, "users", {
    title: "Search Users",
    description: "Search for users by name or email. The UI displays results - DO NOT list them again in text.",
    inputSchema: {
      query: z.string().describe("User name or email to search"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const users = await qlik.searchUsers(args.query);
    const mapped = users.map((u: any) => ({
      id: u.id, name: u.name, email: u.email, status: u.status, picture: u.picture,
    }));
    return {
      content: [{ type: "text", text: `Found ${mapped.length} users` }],
      structuredContent: { type: "users", users: mapped, query: args.query },
    };
  });

  registerAppTool(server, "health", {
    title: "Health Check",
    description: "Check server status and service health",
    inputSchema: {},
    _meta: { ui: { resourceUri } },
  }, async (): Promise<CallToolResult> => {
    const health = await qlik.healthCheck();
    return {
      content: [{ type: "text", text: health.status === "healthy" ? "Connected" : "Connection Error" }],
      structuredContent: { type: "health", ...health },
    };
  });

  registerAppTool(server, "license", {
    title: "Get License Info",
    description: "Get license information including type, allocated seats, and usage",
    inputSchema: {
      includeDetails: z.boolean().optional().default(true).describe("Include detailed license breakdown"),
    },
    _meta: { ui: { resourceUri } },
  }, async (): Promise<CallToolResult> => {
    const license = await qlik.getLicenseInfo();
    return {
      content: [{ type: "text", text: `License info retrieved` }],
      structuredContent: { type: "license", ...license },
    };
  });

  // ==================== RELOAD TOOLS ====================

  registerAppTool(server, "reload", {
    title: "Trigger App Reload",
    description: "Triggers a reload for a Qlik Cloud app",
    inputSchema: {
      appId: z.string().describe("The Qlik app ID to reload"),
      partial: z.boolean().optional().default(false).describe("Perform partial reload"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const result = await qlik.triggerAppReload(args.appId, args.partial);
    return {
      content: [{ type: "text", text: `Reload started` }],
      structuredContent: { type: "reload-triggered", reloadId: result.id, appId: args.appId, status: result.status },
    };
  });

  registerAppTool(server, "reload_status", {
    title: "Get Reload Status",
    description: "Gets the current status of a reload task",
    inputSchema: { reloadId: z.string().describe("The reload task ID to check") },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const reload = await qlik.getReloadStatus(args.reloadId);
    return {
      content: [{ type: "text", text: `Status: ${reload.status}` }],
      structuredContent: { type: "reload-status", ...reload },
    };
  });

  registerAppTool(server, "reload_cancel", {
    title: "Cancel Reload",
    description: "Cancels a running reload task",
    inputSchema: { reloadId: z.string().describe("The reload task ID to cancel") },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    await qlik.cancelReload(args.reloadId);
    return {
      content: [{ type: "text", text: `Reload cancelled` }],
      structuredContent: { type: "reload-cancelled", reloadId: args.reloadId },
    };
  });

  registerAppTool(server, "reload_info", {
    title: "Get Reload Info",
    description: "Get app reload history and status",
    inputSchema: {
      appId: z.string().describe("App ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const reloads = await qlik.getReloadInfo(args.appId);
    const mapped = reloads.map((r: any) => ({
      id: r.id, appId: r.appId, status: r.status, startTime: r.startTime,
      endTime: r.endTime, duration: r.duration, type: r.type,
    }));
    return {
      content: [{ type: "text", text: `Found ${mapped.length} reloads` }],
      structuredContent: { type: "reloads", reloads: mapped },
    };
  });

  // ==================== AUTOMATION TOOLS ====================

  registerAppTool(server, "automations", {
    title: "List Automations",
    description: `List all automations. The UI displays results - DO NOT list them again in text.

If multiple automations found, ask user which one they want.`,
    inputSchema: {
      filter: z.string().optional().describe('Filter expression (e.g., "enabled eq true")'),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const automations = await qlik.automationList(args.filter);
    const mapped = automations.map((a: any) => ({
      id: a.id, name: a.name, state: a.state, lastRunStatus: a.lastRunStatus,
      lastRunTime: a.lastRunTime, runMode: a.runMode, ownerId: a.ownerId,
    }));
    return {
      content: [{ type: "text", text: `Found ${mapped.length} automations` }],
      structuredContent: { type: "automations", automations: mapped },
    };
  });

  registerAppTool(server, "automation", {
    title: "Get Automation Details",
    description: "Get full details of a specific automation. When user selects from UI, use the automation ID provided.",
    inputSchema: { automationId: z.string().describe("The automation ID to retrieve") },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const auto = await qlik.automationGetDetails(args.automationId);
    return {
      content: [{ type: "text", text: `Automation: ${auto.name}` }],
      structuredContent: { type: "automation-detail", ...auto },
    };
  });

  registerAppTool(server, "automation_run", {
    title: "Run Automation",
    description: "Execute an automation (queue a new run)",
    inputSchema: { automationId: z.string().describe("The automation ID to run") },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const result = await qlik.automationRun(args.automationId);
    return {
      content: [{ type: "text", text: `Automation started` }],
      structuredContent: { type: "automation-run", runId: result.id, automationId: args.automationId },
    };
  });

  registerAppTool(server, "automation_runs", {
    title: "List Automation Runs",
    description: "List all runs (executions) for a specific automation",
    inputSchema: {
      automationId: z.string().describe("The automation ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const runs = await qlik.automationListRuns(args.automationId);
    return {
      content: [{ type: "text", text: `Found ${runs.length} runs` }],
      structuredContent: { type: "automation-runs", runs, automationId: args.automationId },
    };
  });

  // ==================== ALERT TOOLS ====================

  registerAppTool(server, "alerts", {
    title: "List Alerts",
    description: `List all Qlik Cloud data alerts. The UI displays results - DO NOT list them again in text.

If multiple alerts found, ask user which one they want.`,
    inputSchema: {
      spaceId: z.string().optional().describe("Filter by space ID"),
      enabled: z.boolean().optional().describe("Filter by enabled/disabled status"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const alerts = await qlik.alertList(args.spaceId, args.enabled);
    const mapped = alerts.map((a: any) => ({
      id: a.id, name: a.name, enabled: a.enabled, lastTriggered: a.lastTriggered,
      condition: a.condition, ownerId: a.ownerId,
    }));
    return {
      content: [{ type: "text", text: `Found ${mapped.length} alerts` }],
      structuredContent: { type: "alerts", alerts: mapped },
    };
  });

  registerAppTool(server, "alert", {
    title: "Get Alert Details",
    description: "Get detailed information about a specific alert. When user selects from UI, use the alert ID provided.",
    inputSchema: { alertId: z.string().describe("Alert ID to retrieve") },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const alert = await qlik.alertGet(args.alertId);
    return {
      content: [{ type: "text", text: `Alert: ${alert.name}` }],
      structuredContent: { type: "alert-detail", ...alert },
    };
  });

  registerAppTool(server, "alert_trigger", {
    title: "Trigger Alert",
    description: "Manually trigger a Qlik Cloud data alert",
    inputSchema: { alertId: z.string().describe("Alert ID to trigger") },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    await qlik.alertTrigger(args.alertId);
    return {
      content: [{ type: "text", text: `Alert triggered` }],
      structuredContent: { type: "alert-triggered", alertId: args.alertId },
    };
  });

  registerAppTool(server, "alert_delete", {
    title: "Delete Alert",
    description: "Delete a Qlik Cloud data alert",
    inputSchema: { alertId: z.string().describe("Alert ID to delete") },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    await qlik.alertDelete(args.alertId);
    return {
      content: [{ type: "text", text: `Alert deleted` }],
      structuredContent: { type: "alert-deleted", alertId: args.alertId },
    };
  });

  // ==================== QLIK ANSWERS (AI) ====================

  registerAppTool(server, "assistants", {
    title: "List AI Assistants",
    description: `List Qlik Answers AI assistants. The UI displays results - DO NOT list them again in text.

If multiple assistants found, ask user which one they want.`,
    inputSchema: {
      search: z.string().optional().describe("Search assistants by name"),
      spaceId: z.string().optional().describe("Filter by space ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const assistants = await qlik.answersListAssistants(args.search, args.spaceId);
    const mapped = assistants.map((a: any) => ({
      id: a.id, name: a.name, description: a.description, createdAt: a.createdAt,
    }));
    return {
      content: [{ type: "text", text: `Found ${mapped.length} AI assistants` }],
      structuredContent: { type: "assistants", assistants: mapped },
    };
  });

  registerAppTool(server, "assistant", {
    title: "Get Assistant Details",
    description: "Get details of a specific assistant. When user selects from UI, use the assistant ID provided.",
    inputSchema: { assistantId: z.string().describe("Assistant ID") },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const assistant = await qlik.answersGetAssistant(args.assistantId);

    // Resolve owner name and space name
    let ownerName = assistant.ownerId;
    let spaceName = assistant.spaceId;

    try {
      if (assistant.ownerId) {
        const user = await qlik.getUserInfo(assistant.ownerId);
        ownerName = user.name || user.email || assistant.ownerId;
      }
    } catch (e) { /* ignore */ }

    try {
      if (assistant.spaceId) {
        const space = await qlik.getSpace(assistant.spaceId);
        spaceName = space.name || assistant.spaceId;
      }
    } catch (e) { /* ignore */ }

    return {
      content: [{ type: "text", text: `Assistant: ${assistant.name}` }],
      structuredContent: { type: "assistant-detail", ...assistant, ownerName, spaceName },
    };
  });

  // ask_assistant: Simple tool without MCP UI
  server.registerTool("ask_assistant", {
    title: "Ask AI Assistant",
    description: `Ask a question to a Qlik Answers AI assistant.

Workflow:
1. First use assistants to find the assistant ID
2. Then use this tool with assistantId and your question
3. Optionally provide threadId to continue conversation`,
    inputSchema: {
      assistantId: z.string().describe("Assistant ID"),
      question: z.string().describe("The question to ask"),
      threadId: z.string().optional().describe("Thread ID for conversation"),
    },
  }, async (args) => {
    const result = await qlik.answersAskQuestion(args.assistantId, args.question, args.threadId);
    const sources = result.sources?.length > 0
      ? `\n\nSources:\n${result.sources.map((s: any) => `- ${s.name || s}`).join("\n")}`
      : "";
    return {
      content: [{ type: "text", text: `${result.answer || "No answer received"}${sources}` }],
    };
  });

  // ==================== INSIGHT ADVISOR ====================

  registerAppTool(server, "insight", {
    title: "Insight Advisor",
    description: `Ask natural language questions about Qlik data. Returns a REAL CHART with actual data.

Example: "show me sales trend", "revenue by region", "top 10 customers"`,
    inputSchema: {
      text: z.string().describe("Natural language question"),
      appId: z.string().describe("App ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    console.error(`[Insight] Question: ${args.text}`);

    // Get recommendations
    const result = await qlik.insightAdvisor(args.appId, args.text);
    const recommendations = result?.recAnalyses || result?.data?.recAnalyses || [];

    if (recommendations.length === 0) {
      return {
        content: [{ type: "text", text: "No insights found" }],
        structuredContent: { type: "error", message: "No insights found for this question" },
      };
    }

    // Get the FIRST (best) recommendation
    const rec = recommendations[0];
    const hypercubeDef = rec.options?.qHyperCubeDef || rec.qHyperCubeDef;
    const chartType = rec.chartType || "barchart";
    const title = rec.options?.title || rec.analysis?.title || args.text;

    console.error(`[Insight] Chart type: ${chartType}, Title: ${title}`);

    // Get REAL data from Qlik Engine
    try {
      const chartData = await qlik.getChartData(args.appId, hypercubeDef);

      return {
        content: [{ type: "text", text: `Chart: ${title}` }],
        structuredContent: {
          type: "chart",
          chartType,
          title,
          labels: chartData.labels,
          values: chartData.values,
          question: args.text,
          appLink: `${TENANT_URL}/sense/app/${args.appId}/insight-advisor`,
        },
      };
    } catch (err: any) {
      console.error(`[Insight] Failed to get chart data: ${err.message}`);
      // Fallback to showing the recommendation info
      return {
        content: [{ type: "text", text: `Chart recommendation: ${title}` }],
        structuredContent: {
          type: "chart",
          chartType,
          title,
          labels: [],
          values: [],
          error: err.message,
          question: args.text,
          appLink: `${TENANT_URL}/sense/app/${args.appId}/insight-advisor`,
        },
      };
    }
  });

  // ==================== AUTOML ====================

  registerAppTool(server, "experiments", {
    title: "List ML Experiments",
    description: `List AutoML experiments. The UI displays results - DO NOT list them again in text.

If multiple experiments found, ask user which one they want.`,
    inputSchema: {
      spaceId: z.string().optional().describe("Filter by space ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const experiments = await qlik.automlGetExperiments(args.spaceId);
    const mapped = experiments.map((e: any) => ({
      id: e.id, name: e.name, status: e.status, targetFeature: e.targetFeature,
      createdAt: e.createdAt, algorithm: e.algorithm,
    }));
    return {
      content: [{ type: "text", text: `Found ${mapped.length} experiments` }],
      structuredContent: { type: "experiments", experiments: mapped },
    };
  });

  registerAppTool(server, "experiment", {
    title: "Get Experiment Details",
    description: "Get experiment details. When user selects from UI, use the experiment ID provided.",
    inputSchema: {
      experimentId: z.string().describe("Experiment ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const exp = await qlik.automlGetExperiment(args.experimentId);
    return {
      content: [{ type: "text", text: `Experiment: ${exp.name}` }],
      structuredContent: { type: "experiment-detail", ...exp },
    };
  });

  registerAppTool(server, "deployments", {
    title: "List ML Deployments",
    description: "List all ML deployments",
    inputSchema: {
      spaceId: z.string().optional().describe("Filter by space ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const deployments = await qlik.automlListDeployments(args.spaceId);
    const mapped = deployments.map((d: any) => ({
      id: d.id, name: d.name, status: d.status, createdAt: d.createdAt,
    }));
    return {
      content: [{ type: "text", text: `Found ${mapped.length} deployments` }],
      structuredContent: { type: "deployments", deployments: mapped },
    };
  });

  registerAppTool(server, "deployment", {
    title: "Get Deployment Details",
    description: "Get deployment details",
    inputSchema: { deploymentId: z.string().describe("Deployment ID") },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const deployment = await qlik.automlGetDeployment(args.deploymentId);
    return {
      content: [{ type: "text", text: `Deployment: ${deployment.name}` }],
      structuredContent: { type: "deployment-detail", ...deployment },
    };
  });

  // ==================== LINEAGE ====================

  registerAppTool(server, "lineage", {
    title: "Get Data Lineage",
    description: `Get lineage information for an app or dataset.

**For Apps**: Pass the appId (UUID format like "950a5da4-0e61-466b-a1c5-805b072da128")
**For Datasets**: Pass the secureQri (starts with "qri:qdf:space://")

The lineage shows all data sources connected to the resource.`,
    inputSchema: {
      nodeId: z.string().describe("App ID (UUID) or dataset secureQri"),
      appId: z.string().optional().describe("App ID if viewing app lineage"),
      direction: z.enum(["upstream", "downstream", "both"]).optional().default("both"),
      levels: z.number().optional().default(5).describe("Number of levels to traverse"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    // Check if it's a UUID (app ID) - UUID format: 8-4-4-4-12 hex chars
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isAppId = uuidPattern.test(args.nodeId) || uuidPattern.test(args.appId || "");
    const appId = args.appId || args.nodeId;

    if (isAppId && uuidPattern.test(appId)) {
      // Use app-specific lineage endpoint
      console.error(`[Lineage] Detected app ID, using app lineage endpoint for ${appId}`);
      const appLineage = await qlik.getAppLineage(appId);
      return {
        content: [{ type: "text", text: `[App lineage displayed in UI - ${appLineage.sources.length} data sources found]` }],
        structuredContent: { type: "app-lineage", appId, ...appLineage },
      };
    }

    // Dataset lineage - validate secureQri format
    if (!args.nodeId.startsWith('qri:')) {
      return {
        content: [{ type: "text", text: `Error: Invalid format. For apps use appId (UUID), for datasets use secureQri (starts with 'qri:')` }],
        structuredContent: { type: "error", message: "Use appId (UUID) or secureQri" },
        isError: true,
      };
    }

    const lineage = await qlik.getLineage(args.nodeId, args.direction, args.levels);
    return {
      content: [{ type: "text", text: `[Lineage displayed in UI]` }],
      structuredContent: { type: "lineage", ...lineage },
    };
  });

  // ==================== DATA TOOLS ====================

  registerAppTool(server, "dataset", {
    title: "Get Dataset Details",
    description: `Get detailed information about a dataset.

IMPORTANT: The UI displays ALL details in a rich visual card. DO NOT:
- List or repeat any dataset properties
- Create tables or summaries of the data
- Describe the fields, types, or statistics

Simply say "Here are the details" or ask what the user wants to do next.`,
    inputSchema: { datasetId: z.string().describe("Dataset ID") },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const raw = await qlik.getDatasetDetails(args.datasetId);

    // Debug: Log schema structure
    console.error("Schema keys:", raw.schema ? Object.keys(raw.schema) : "no schema");
    console.error("Schema dataFields count:", raw.schema?.dataFields?.length || 0);
    if (raw.schema?.dataFields?.[0]) {
      console.error("First dataField:", JSON.stringify(raw.schema.dataFields[0]));
    }

    // Extract from nested structures
    const op = raw.operational || {};
    const tech = raw.technicalMetadata || raw.technical || {};
    const secClass = raw.securityClassification || {};

    // Resolve owner name
    let ownerName: string | null = null;
    if (raw.ownerId) {
      ownerName = await qlik.getUserName(raw.ownerId);
    }

    // Resolve space name
    let spaceName: string | null = null;
    if (raw.spaceId) {
      spaceName = await qlik.getSpaceName(raw.spaceId);
    }

    // Build comprehensive response with ALL available data
    const result = {
      type: "dataset-detail",
      // Basic info
      id: raw.id,
      name: raw.name,
      description: raw.description,
      datasetType: raw.type || raw.datasetType || raw.resourceType || op.logicalType,
      // Metrics
      size: raw.size || op.size || op.sizeBytes || tech.size,
      rowCount: raw.rowCount || op.rowCount || op.recordCount || tech.rowCount || op.noOfRows || raw.recordCount,
      columnCount: raw.columnCount || op.columnCount || op.fieldCount || tech.columnCount || op.noOfFields || raw.fieldCount,
      // Dates
      createdAt: raw.createdAt || raw.createdTime || raw.createTime,
      modifiedAt: raw.modifiedAt || raw.updatedAt || raw.modifiedTime || raw.lastModifiedTime || op.lastModified,
      lastReloadTime: raw.lastReloadTime || op.lastReloadTime,
      // Owner & Space
      ownerId: raw.ownerId,
      ownerName: ownerName,
      spaceId: raw.spaceId,
      spaceName: spaceName,
      // Technical info
      technicalName: raw.technicalName || tech.technicalName,
      qri: raw.qri,
      secureQri: raw.secureQri,  // IMPORTANT: Used for lineage API calls
      dataStoreInfo: raw.dataStoreInfo,
      connectionInfo: op.connectionInfo || tech.connectionInfo,
      sourceInfo: op.sourceInfo,
      // Classification
      classification: secClass.classification,
      // Tags
      tags: raw.tags || [],
      // Schema/columns - dataFields is the correct field per Qlik API
      columns: (raw.schema?.dataFields?.length ? raw.schema.dataFields : null) ||
               (raw.schema?.fields?.length ? raw.schema.fields : null) ||
               (raw.dataFields?.length ? raw.dataFields : null) ||
               (raw.fields?.length ? raw.fields : null) ||
               (op.dataFields?.length ? op.dataFields : null) ||
               (op.fields?.length ? op.fields : null) ||
               [],
      // Include raw for debugging
      _rawKeys: Object.keys(raw),
      _opKeys: Object.keys(op),
    };

    return {
      content: [{ type: "text", text: `[Dataset details displayed in UI]` }],
      structuredContent: result,
    };
  });

  // ==================== SELECTION TOOLS ====================

  registerAppTool(server, "select", {
    title: "Apply Selections",
    description: `Apply selections/filters to a Qlik app.

Note: Full selection functionality requires Engine API WebSocket connection.
This tool provides guidance on selection operations.`,
    inputSchema: {
      appId: z.string().describe("App ID to apply selections to"),
      selections: z.array(z.object({
        field: z.string().describe("Field name"),
        values: z.array(z.string()).optional().describe("Values to select"),
      })).describe("Array of field selections"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    // Selections require Engine API WebSocket - return guidance
    return {
      content: [{ type: "text", text: `Selection operations require Engine API WebSocket connection` }],
      structuredContent: {
        type: "selection-info",
        appId: args.appId,
        requestedSelections: args.selections,
        note: "Full selection operations require Engine API WebSocket connection. Use Qlik Sense client or enigma.js for interactive selections.",
      },
    };
  });

  registerAppTool(server, "clear_selections", {
    title: "Clear Selections",
    description: `Clear all selections in a Qlik app.

Note: Full selection functionality requires Engine API WebSocket connection.`,
    inputSchema: {
      appId: z.string().describe("App ID to clear selections"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    return {
      content: [{ type: "text", text: `Clear selections requires Engine API WebSocket connection` }],
      structuredContent: {
        type: "selection-info",
        appId: args.appId,
        action: "clear",
        note: "Full selection operations require Engine API WebSocket connection.",
      },
    };
  });

  registerAppTool(server, "selections", {
    title: "Get Current Selections",
    description: `Get current selections in a Qlik app.

Note: Full selection state requires Engine API WebSocket connection.`,
    inputSchema: {
      appId: z.string().describe("App ID to get selections from"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const appInfo = await qlik.getAppSelections(args.appId);
    return {
      content: [{ type: "text", text: `App: ${appInfo.attributes?.name || args.appId}` }],
      structuredContent: {
        type: "app-selections",
        appId: args.appId,
        appName: appInfo.attributes?.name,
        note: "Full selection state requires Engine API WebSocket connection.",
      },
    };
  });

  registerAppTool(server, "fields", {
    title: "Get Available Fields",
    description: "Get all available fields in a Qlik app's data model.",
    inputSchema: {
      appId: z.string().describe("App ID to get fields from"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const metadata = await qlik.getAppFields(args.appId);
    const tables = metadata.tables || [];
    const fields = tables.flatMap((t: any) => t.fields || []);
    return {
      content: [{ type: "text", text: `Found ${fields.length} fields in ${tables.length} tables` }],
      structuredContent: {
        type: "app-fields",
        appId: args.appId,
        tables: tables.map((t: any) => ({
          name: t.name,
          fields: t.fields?.map((f: any) => f.name) || [],
        })),
        totalFields: fields.length,
      },
    };
  });

  // ==================== APP GENERATION ====================

  registerAppTool(server, "generate_app", {
    title: "Generate App",
    description: `Create or update a Qlik app with load script and reload data. Waits for completion.

**Cloud Load Script Format:**
FROM [lib://SPACE_NAME:DataFiles/filename.qvd] (qvd);`,
    inputSchema: {
      appName: z.string().optional().describe("Name for new app"),
      appId: z.string().optional().describe("Existing app ID"),
      spaceId: z.string().optional().describe("Space ID"),
      loadScript: z.string().optional().describe("Qlik load script"),
      reload: z.boolean().optional().default(true).describe("Reload after script"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    if (!args.appId && !args.appName) {
      return {
        content: [{ type: "text", text: "Error: Provide appName or appId" }],
        structuredContent: { type: "error", message: "appName or appId required" },
      };
    }

    const startTime = Date.now();
    const steps: { name: string; status: string; duration?: number; detail?: string }[] = [
      { name: "Create App", status: "pending" },
      { name: "Set Script", status: "pending" },
      { name: "Load Data", status: "pending" },
    ];

    let appId = args.appId;
    let appName = args.appName;
    let appLink = "";
    let overallStatus = "completed";
    let errorMsg = "";

    try {
      // Step 1: Create App
      console.error(`[Generate] Step 1: Creating app...`);
      const step1Start = Date.now();
      if (!appId && appName) {
        const newApp = await qlik.createApp(appName, args.spaceId);
        appId = newApp.attributes?.id || newApp.id;
        steps[0].detail = "Created";
      } else {
        steps[0].detail = "Using existing";
      }
      steps[0].status = "success";
      steps[0].duration = Date.now() - step1Start;
      appLink = `${TENANT_URL}/sense/app/${appId}`;
      console.error(`[Generate] Step 1: Done`);

      // Step 2: Set Script
      console.error(`[Generate] Step 2: Setting script...`);
      const step2Start = Date.now();
      if (args.loadScript) {
        await qlik.setAppScript(appId!, args.loadScript);
        steps[1].detail = "Applied";
      } else {
        steps[1].detail = "Skipped";
      }
      steps[1].status = "success";
      steps[1].duration = Date.now() - step2Start;
      console.error(`[Generate] Step 2: Done`);

      // Step 3: Reload
      console.error(`[Generate] Step 3: Loading data...`);
      const step3Start = Date.now();
      if (args.reload && args.loadScript) {
        const reload = await qlik.reloadApp(appId!);
        const reloadId = reload.id;
        let finalStatus = reload.status;
        let attempts = 0;

        while (finalStatus !== "SUCCEEDED" && finalStatus !== "FAILED" && finalStatus !== "CANCELED" && attempts < 90) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            const statusCheck = await qlik.getReloadStatus(reloadId);
            finalStatus = statusCheck.status;
            console.error(`[Generate] Reload: ${finalStatus}`);
            attempts++;
          } catch { break; }
        }

        steps[2].duration = Date.now() - step3Start;
        if (finalStatus === "SUCCEEDED") {
          steps[2].status = "success";
          steps[2].detail = "Loaded";
        } else {
          steps[2].status = "error";
          steps[2].detail = finalStatus || "Failed";
          overallStatus = "completed_with_errors";
        }
      } else {
        steps[2].status = "success";
        steps[2].detail = "Skipped";
        steps[2].duration = 0;
      }
      console.error(`[Generate] Step 3: Done`);

    } catch (error: any) {
      console.error(`[Generate] ERROR: ${error.message}`);
      const runningIdx = steps.findIndex(s => s.status === "pending" || s.status === "running");
      if (runningIdx >= 0) {
        steps[runningIdx].status = "error";
        steps[runningIdx].detail = error.message?.slice(0, 50) || "Error";
      }
      overallStatus = "failed";
      errorMsg = error.message;
    }

    const totalDuration = Date.now() - startTime;

    return {
      content: [{ type: "text", text: overallStatus === "completed" ? `App generated: ${appLink}` : `App generation ${overallStatus}` }],
      structuredContent: {
        type: "app-generated",
        status: overallStatus,
        appId,
        appName: appName || appId,
        appLink,
        steps,
        totalDuration,
        error: errorMsg || undefined,
      },
    };
  });

  // ==================== UI RESOURCE ====================

  registerAppResource(server, resourceUri, resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8");
      return { contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
    }
  );

  return server;
}
