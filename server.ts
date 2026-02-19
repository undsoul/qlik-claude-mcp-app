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

  async fetch(endpoint: string, options?: RequestInit): Promise<any> {
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

  async getItemIdForApp(appId: string): Promise<string | null> {
    try {
      const result = await this.fetch(`/items?resourceId=${appId}&resourceType=app&limit=1`);
      return result.data?.[0]?.id || null;
    } catch {
      return null;
    }
  }

  getTenantUrl(): string {
    return this.baseUrl;
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

  async getReloadLog(reloadId: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/reloads/${reloadId}/logs`, {
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
        },
      });
      if (!response.ok) {
        return `Unable to fetch log: ${response.status}`;
      }
      return await response.text();
    } catch (e: any) {
      return `Error fetching log: ${e.message}`;
    }
  }

  async getReloadDetail(reloadId: string): Promise<any> {
    const reload = await this.getReloadStatus(reloadId);
    const log = await this.getReloadLog(reloadId);
    return { ...reload, log };
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

      const result = await this.fetch(`/data-alerts?${params}`);
      allItems.push(...(result.tasks || result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 1000) break;
    } while (cursor);

    return allItems;
  }

  async alertGet(alertId: string): Promise<any> {
    return this.fetch(`/data-alerts/${alertId}`);
  }

  async alertTrigger(alertId: string): Promise<any> {
    return this.fetch(`/data-alerts/${alertId}/actions/trigger`, { method: "POST" });
  }

  async alertDelete(alertId: string): Promise<any> {
    return this.fetch(`/data-alerts/${alertId}`, { method: "DELETE" });
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
  async getChartData(appId: string, hypercubeDef: any, chartType?: string): Promise<{ labels: string[]; values: number[]; values2?: number[]; measureNames?: string[]; tableData?: { headers: string[]; rows: string[][] }; title: string }> {
    // Handle undefined or invalid hypercubeDef (e.g., map charts)
    if (!hypercubeDef || (!hypercubeDef.qDimensions && !hypercubeDef.qMeasures)) {
      throw new Error("Chart type not supported - no hypercube definition available");
    }

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

      // For tables, keep all dimensions and measures; for charts, simplify to first dim
      const isTable = chartType?.toLowerCase() === 'table';
      const simplifiedDef = isTable ? {
        qDimensions: hypercubeDef.qDimensions || [],
        qMeasures: hypercubeDef.qMeasures || [],
        qSuppressZero: true,
        qSuppressMissing: true,
      } : {
        qDimensions: hypercubeDef.qDimensions?.slice(0, 1) || [],
        qMeasures: hypercubeDef.qMeasures || [],
        qSuppressZero: true,
        qSuppressMissing: true,
        qInterColumnSortOrder: [0, 1],
      };

      console.error(`[Engine] ${isTable ? 'Table' : 'Simplified'}: ${simplifiedDef.qDimensions.length} dims, ${simplifiedDef.qMeasures.length} measures`);

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

      // Get measure names from layout (these are the actual names from the data model)
      const measureNames = (hyperCube.qMeasureInfo || []).map((m: any) => m.qFallbackTitle || 'Value');

      // For tables: extract all columns with headers
      if (isTable) {
        const dimInfo = hyperCube.qDimensionInfo || [];
        const measureInfo = hyperCube.qMeasureInfo || [];
        const headers = [
          ...dimInfo.map((d: any) => d.qFallbackTitle || 'Dimension'),
          ...measureInfo.map((m: any) => m.qFallbackTitle || 'Measure'),
        ];
        const rows: string[][] = matrix.map((row: any[]) => row.map((cell: any) => cell?.qText || ''));

        console.error(`[Engine] Table: ${headers.length} columns, ${rows.length} rows`);
        await app.destroySessionObject(obj.id);
        await session.close();
        return { labels: [], values: [], measureNames, tableData: { headers, rows }, title: "" };
      }

      // Extract labels and values for charts
      const labels: string[] = [];
      const values: number[] = [];
      const values2: number[] = [];
      const hasTwoMeasures = totalCols >= 3;

      for (const row of matrix) {
        const dimCell = row[0];
        const measureCell = row[1];
        const measureCell2 = row[2];

        if (dimCell?.qText) {
          labels.push(dimCell.qText);
        }

        if (measureCell) {
          if (typeof measureCell.qNum === "number" && !isNaN(measureCell.qNum)) {
            values.push(measureCell.qNum);
          } else if (measureCell.qText) {
            const parsed = parseFloat(measureCell.qText.replace(/[^\d.-]/g, ""));
            values.push(isNaN(parsed) ? 0 : parsed);
          } else {
            values.push(0);
          }
        }

        if (hasTwoMeasures && measureCell2) {
          if (typeof measureCell2.qNum === "number" && !isNaN(measureCell2.qNum)) {
            values2.push(measureCell2.qNum);
          } else if (measureCell2.qText) {
            const parsed = parseFloat(measureCell2.qText.replace(/[^\d.-]/g, ""));
            values2.push(isNaN(parsed) ? 0 : parsed);
          } else {
            values2.push(0);
          }
        }
      }

      console.error(`[Engine] Extracted ${labels.length} labels, ${values.length} values${hasTwoMeasures ? `, ${values2.length} values2` : ''}`);
      console.error(`[Engine] Sample: labels=${labels.slice(0, 3).join(", ")} values=${values.slice(0, 3).join(", ")}`);
      console.error(`[Engine] Measure names: ${measureNames.join(", ")}`);

      await app.destroySessionObject(obj.id);
      await session.close();
      return { labels, values, values2: hasTwoMeasures ? values2 : undefined, measureNames, title: "" };
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

      const result = await this.fetch(`/ml/experiments?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 500) break;
    } while (cursor);

    return allItems;
  }

  async automlGetExperiment(experimentId: string): Promise<any> {
    return this.fetch(`/ml/experiments/${experimentId}`);
  }

  async automlListDeployments(spaceId?: string): Promise<any> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: "100" });
      if (spaceId) params.set("spaceId", spaceId);
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/ml/deployments?${params}`);
      allItems.push(...(result.data || []));
      cursor = result.links?.next?.href ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next") : null;
      if (allItems.length >= 500) break;
    } while (cursor);

    return allItems;
  }

  async automlGetDeployment(deploymentId: string): Promise<any> {
    return this.fetch(`/ml/deployments/${deploymentId}`);
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

    // Use Engine API (more reliable, works with all permissions)
    const wsUrl = `${this.baseUrl.replace("https://", "wss://")}/app/${appId}`;
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
      const app: any = await global.openDoc(appId);

      // Get tables and keys info
      const tablesAndKeys = await app.getTablesAndKeys({} as any, {} as any, 0, true, false);

      const sources: any[] = [];
      const internal: any[] = [];
      const tables: any[] = [];

      // Process tables from Engine API
      for (const table of tablesAndKeys.qtr || []) {
        const tableName = table.qName;
        const rowCount = table.qNoOfRows;
        const fieldCount = table.qFields?.length || 0;
        const keyFields = table.qKeyFields?.length || 0;

        tables.push({
          name: tableName,
          rows: rowCount,
          fields: fieldCount,
          keyFields,
          isSynthetic: table.qIsSynthetic || false
        });
      }

      // Get connections used by the app
      try {
        const connections = await app.getConnections();
        for (const conn of connections || []) {
          sources.push({
            type: conn.qType || "Connection",
            name: conn.qName,
            connectionString: conn.qConnectionString,
            provider: conn.qDriverName
          });
        }
      } catch (e) {
        console.error(`[AppLineage] Could not get connections: ${e}`);
      }

      console.error(`[AppLineage] Found ${tables.length} tables, ${sources.length} connections`);
      return { sources, internal, tables, raw: tablesAndKeys };

    } finally {
      try { await session.close(); } catch (e) { /* ignore */ }
    }
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
      const params = new URLSearchParams({ limit: "100", resourceType: "dataset" });
      if (spaceId) params.set("spaceId", spaceId);
      if (cursor) params.set("next", cursor);

      // Use /items API with resourceType=dataset instead of /data-sets
      const result = await this.fetch(`/items?${params}`);
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
    // Use Engine API to get complete table/field information
    const wsUrl = `${this.baseUrl.replace("https://", "wss://")}/app/${appId}`;
    console.error(`[AppFields] Getting fields for app ${appId}`);

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
      const app: any = await global.openDoc(appId);

      // Get tables and keys - this returns full field information
      const tablesAndKeys = await app.getTablesAndKeys({} as any, {} as any, 0, true, false);

      const tables = (tablesAndKeys.qtr || []).map((table: any) => ({
        name: table.qName,
        rows: table.qNoOfRows,
        isSynthetic: table.qIsSynthetic || false,
        fields: (table.qFields || []).map((f: any) => ({
          name: f.qName,
          tags: f.qTags || [],
          isKey: f.qKeyType === "PERFECT_KEY" || f.qKeyType === "PRIMARY_KEY" || f.qKeyType === "ANY_KEY",
          cardinal: f.qnTotalDistinctValues || 0,
        })),
      }));

      await session.close();
      console.error(`[AppFields] Found ${tables.length} tables`);
      return { tables };
    } catch (err) {
      await session.close();
      throw err;
    }
  }

  async getAppSelections(appId: string): Promise<any> {
    // Use Engine API to get current selections
    const wsUrl = `${this.baseUrl.replace("https://", "wss://")}/app/${appId}`;
    console.error(`[Selections] Getting selections for app ${appId}`);

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
      const app: any = await global.openDoc(appId);

      // Create a current selections object
      const selObj = await app.createSessionObject({
        qInfo: { qType: "CurrentSelections" },
        qSelectionObjectDef: {}
      });

      const layout = await selObj.getLayout();
      const selections = (layout.qSelectionObject?.qSelections || []).map((sel: any) => ({
        field: sel.qField,
        selected: sel.qSelected,
        total: sel.qTotal,
        selectedCount: sel.qSelectedCount,
        isNumeric: sel.qIsNum,
        stateCounts: sel.qStateCounts,
      }));

      // Also get app name
      const appLayout = await app.getAppLayout();
      const appName = appLayout.qTitle || appId;

      await session.close();
      console.error(`[Selections] Found ${selections.length} active selections`);
      return { appId, appName, selections };
    } catch (err) {
      await session.close();
      throw err;
    }
  }

  async clearSelections(appId: string): Promise<any> {
    const wsUrl = `${this.baseUrl.replace("https://", "wss://")}/app/${appId}`;
    console.error(`[Selections] Clearing all selections for app ${appId}`);

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
      const app: any = await global.openDoc(appId);

      // Clear all selections
      await app.clearAll();

      const appLayout = await app.getAppLayout();
      const appName = appLayout.qTitle || appId;

      await session.close();
      console.error(`[Selections] Cleared all selections`);
      return { appId, appName, cleared: true };
    } catch (err) {
      await session.close();
      throw err;
    }
  }

  async selectValues(appId: string, fieldName: string, values: string[]): Promise<any> {
    const wsUrl = `${this.baseUrl.replace("https://", "wss://")}/app/${appId}`;
    console.error(`[Selections] Selecting ${values.length} values in field "${fieldName}"`);

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
      const app: any = await global.openDoc(appId);

      // Get the field
      const field = await app.getField(fieldName);

      // Clear previous selections on this field
      await field.clear();

      // Get field data to find element numbers for values we want to select
      // Create a session object for the field listobject
      const listDef = {
        qDef: {
          qFieldDefs: [fieldName],
        },
        qInitialDataFetch: [{ qTop: 0, qLeft: 0, qHeight: 10000, qWidth: 1 }],
      };

      const listObj = await app.createSessionObject({
        qInfo: { qType: "temp-list" },
        qListObjectDef: listDef,
      });

      const listLayout = await listObj.getLayout();
      const dataPages = listLayout.qListObject?.qDataPages || [];
      const matrix = dataPages[0]?.qMatrix || [];

      // Find element numbers for requested values
      const elemNumbers: number[] = [];
      const foundValues: string[] = [];

      for (const requestedVal of values) {
        const strVal = String(requestedVal).toLowerCase();
        for (const row of matrix) {
          const cell = row[0];
          if (cell && String(cell.qText).toLowerCase() === strVal) {
            elemNumbers.push(cell.qElemNumber);
            foundValues.push(cell.qText);
            break;
          }
        }
      }

      // Clean up session object
      await app.destroySessionObject(listObj.id);

      // Select values by element numbers
      if (elemNumbers.length > 0) {
        await field.selectValues(
          elemNumbers.map((n) => ({ qNumber: n, qIsNumeric: true })),
          false, // toggle off
          false  // soft lock off
        );
      }

      const appLayout = await app.getAppLayout();
      const appName = appLayout.qTitle || appId;

      await session.close();
      console.error(`[Selections] Selected ${elemNumbers.length} values in "${fieldName}": ${foundValues.join(", ")}`);
      return {
        appId,
        appName,
        field: fieldName,
        selectedCount: elemNumbers.length,
        requestedValues: values,
        foundValues,
      };
    } catch (err) {
      await session.close();
      throw err;
    }
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

  // ============ SHEETS (Engine API) ============
  async getSheets(appId: string): Promise<any[]> {
    const wsUrl = `${this.baseUrl.replace("https://", "wss://")}/app/${appId}`;
    console.error(`[Sheets] Connecting to ${wsUrl}`);

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
      const app: any = await global.openDoc(appId);

      // Get sheet list using AppObjectList
      const sheetListObj = await app.createSessionObject({
        qInfo: { qType: "SheetList" },
        qAppObjectListDef: {
          qType: "sheet",
          qData: {
            title: "/qMetaDef/title",
            description: "/qMetaDef/description",
            rank: "/rank",
            thumbnail: "/thumbnail"
          }
        }
      });

      const layout = await sheetListObj.getLayout();
      const sheets = (layout.qAppObjectList?.qItems || []).map((item: any) => ({
        id: item.qInfo?.qId,
        title: item.qData?.title || item.qMeta?.title || "Untitled",
        description: item.qData?.description || "",
        rank: item.qData?.rank || 0,
        thumbnail: item.qData?.thumbnail?.qStaticContentUrl?.qUrl || null,
      }));

      await session.close();
      console.error(`[Sheets] Found ${sheets.length} sheets`);
      return sheets;
    } catch (err) {
      await session.close();
      throw err;
    }
  }

  async getSheetObjects(appId: string, sheetId: string): Promise<any> {
    const wsUrl = `${this.baseUrl.replace("https://", "wss://")}/app/${appId}`;
    console.error(`[SheetObjects] Getting objects for sheet ${sheetId}`);

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
      const app: any = await global.openDoc(appId);

      const sheet = await app.getObject(sheetId);
      const layout = await sheet.getLayout();

      // Get each object's details including title
      const cells = layout.cells || [];
      const objectsWithTitles = await Promise.all(
        cells.map(async (cell: any) => {
          try {
            const obj = await app.getObject(cell.name);
            const objLayout = await obj.getLayout();
            return {
              id: cell.name,
              type: cell.type,
              title: objLayout.title || objLayout.qMeta?.title || cell.name,
              col: cell.col,
              row: cell.row,
              colspan: cell.colspan,
              rowspan: cell.rowspan,
            };
          } catch {
            return {
              id: cell.name,
              type: cell.type,
              title: cell.name,
              col: cell.col,
              row: cell.row,
              colspan: cell.colspan,
              rowspan: cell.rowspan,
            };
          }
        })
      );

      await session.close();
      console.error(`[SheetObjects] Found ${objectsWithTitles.length} objects`);
      return {
        id: sheetId,
        title: layout.qMeta?.title || layout.title || "Sheet",
        description: layout.qMeta?.description || "",
        objects: objectsWithTitles,
      };
    } catch (err) {
      await session.close();
      throw err;
    }
  }

  // ============ FIELD VALUES (Engine API) ============
  async getFieldValues(appId: string, fieldName: string, searchText?: string, limit = 100): Promise<any> {
    const wsUrl = `${this.baseUrl.replace("https://", "wss://")}/app/${appId}`;
    console.error(`[FieldValues] Getting values for field "${fieldName}"`);

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
      const app: any = await global.openDoc(appId);

      // Create list object for field values
      const listObj = await app.createSessionObject({
        qInfo: { qType: "FieldValueList" },
        qListObjectDef: {
          qDef: { qFieldDefs: [fieldName] },
          qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: limit }]
        }
      });

      // Apply search if provided
      if (searchText) {
        await listObj.searchListObjectFor("/qListObjectDef", searchText);
      }

      const layout = await listObj.getLayout();
      const dataPage = layout.qListObject?.qDataPages?.[0];
      const values = (dataPage?.qMatrix || []).map((row: any) => ({
        text: row[0]?.qText || "",
        num: row[0]?.qNum,
        state: row[0]?.qState, // S=selected, O=optional, X=excluded
        elemNumber: row[0]?.qElemNumber,
      }));

      const totalCount = layout.qListObject?.qDimensionInfo?.qCardinal || values.length;

      await session.close();
      console.error(`[FieldValues] Found ${values.length} of ${totalCount} values`);
      return {
        fieldName,
        values,
        totalCount,
        searchText,
      };
    } catch (err) {
      await session.close();
      throw err;
    }
  }

  // ============ MASTER ITEMS (Engine API) ============
  async getMasterDimensions(appId: string): Promise<any[]> {
    const wsUrl = `${this.baseUrl.replace("https://", "wss://")}/app/${appId}`;
    console.error(`[MasterItems] Getting dimensions for app ${appId}`);

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
      const app: any = await global.openDoc(appId);

      const dimListObj = await app.createSessionObject({
        qInfo: { qType: "DimensionList" },
        qDimensionListDef: {
          qType: "dimension",
          qData: {
            title: "/qMetaDef/title",
            description: "/qMetaDef/description",
            tags: "/qMetaDef/tags",
            grouping: "/qDim/qGrouping",
            fieldDefs: "/qDim/qFieldDefs"
          }
        }
      });

      const layout = await dimListObj.getLayout();
      const dimensions = (layout.qDimensionList?.qItems || []).map((item: any) => ({
        id: item.qInfo?.qId,
        title: item.qData?.title || item.qMeta?.title || "Untitled",
        description: item.qData?.description || "",
        tags: item.qData?.tags || [],
        fields: item.qData?.fieldDefs || [],
        grouping: item.qData?.grouping,
      }));

      await session.close();
      console.error(`[MasterItems] Found ${dimensions.length} dimensions`);
      return dimensions;
    } catch (err) {
      await session.close();
      throw err;
    }
  }

  async getMasterMeasures(appId: string): Promise<any[]> {
    const wsUrl = `${this.baseUrl.replace("https://", "wss://")}/app/${appId}`;
    console.error(`[MasterItems] Getting measures for app ${appId}`);

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
      const app: any = await global.openDoc(appId);

      const measureListObj = await app.createSessionObject({
        qInfo: { qType: "MeasureList" },
        qMeasureListDef: {
          qType: "measure",
          qData: {
            title: "/qMetaDef/title",
            description: "/qMetaDef/description",
            tags: "/qMetaDef/tags",
            expression: "/qMeasure/qDef"
          }
        }
      });

      const layout = await measureListObj.getLayout();
      const measures = (layout.qMeasureList?.qItems || []).map((item: any) => ({
        id: item.qInfo?.qId,
        title: item.qData?.title || item.qMeta?.title || "Untitled",
        description: item.qData?.description || "",
        tags: item.qData?.tags || [],
        expression: item.qData?.expression || "",
      }));

      await session.close();
      console.error(`[MasterItems] Found ${measures.length} measures`);
      return measures;
    } catch (err) {
      await session.close();
      throw err;
    }
  }

  // ============ GLOSSARY (REST API) ============
  async getGlossaries(): Promise<any[]> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/glossaries?${params}`);
      const items = result.data || [];
      allItems.push(...items);

      cursor = result.links?.next?.href
        ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next")
        : null;

      if (allItems.length >= 500) break;
    } while (cursor);

    return allItems;
  }

  async getGlossary(glossaryId: string): Promise<any> {
    return this.fetch(`/glossaries/${glossaryId}`);
  }

  async getGlossaryTerms(glossaryId: string): Promise<any[]> {
    const allItems: any[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("next", cursor);

      const result = await this.fetch(`/glossaries/${glossaryId}/terms?${params}`);
      const items = result.data || [];
      allItems.push(...items);

      cursor = result.links?.next?.href
        ? new URL(result.links.next.href, this.baseUrl).searchParams.get("next")
        : null;

      if (allItems.length >= 1000) break;
    } while (cursor);

    return allItems;
  }

  async getGlossaryTerm(glossaryId: string, termId: string): Promise<any> {
    return this.fetch(`/glossaries/${glossaryId}/terms/${termId}`);
  }

  async getGlossaryCategories(glossaryId: string): Promise<any[]> {
    const result = await this.fetch(`/glossaries/${glossaryId}/categories`);
    return result.data || [];
  }

  async createGlossaryTerm(glossaryId: string, term: { name: string; description?: string; categoryId?: string }): Promise<any> {
    return this.fetch(`/glossaries/${glossaryId}/terms`, {
      method: "POST",
      body: JSON.stringify(term),
    });
  }

  async updateGlossaryTerm(glossaryId: string, termId: string, updates: { name?: string; description?: string }): Promise<any> {
    return this.fetch(`/glossaries/${glossaryId}/terms/${termId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async deleteGlossaryTerm(glossaryId: string, termId: string): Promise<any> {
    return this.fetch(`/glossaries/${glossaryId}/terms/${termId}`, {
      method: "DELETE",
    });
  }

  // ==================== DATA PRODUCTS ====================

  async getDataProducts(): Promise<any[]> {
    // Data products are available via items API with resourceType filter
    return this.search(undefined, ["dataproduct"]);
  }

  async getDataProduct(productId: string): Promise<any> {
    // Try data governance API first, fallback to items API
    try {
      return await this.fetch(`/data-products/${productId}`);
    } catch {
      // Fallback: get from items
      const items = await this.search(undefined, ["dataproduct"]);
      return items.find((item: any) => item.resourceId === productId || item.id === productId);
    }
  }

  // ==================== DATASET ENHANCEMENTS ====================

  // Resolve item ID to resourceId for dataset operations
  private async resolveDatasetResourceId(idOrItemId: string): Promise<string> {
    // First try as-is (might be resourceId already)
    try {
      await this.fetch(`/data-sets/${idOrItemId}`);
      return idOrItemId;
    } catch {
      // Try to resolve from items API
      try {
        const result = await this.fetch(`/items/${idOrItemId}`);
        if (result.resourceId) {
          return result.resourceId;
        }
      } catch {
        // Ignore
      }
      // Return original as fallback
      return idOrItemId;
    }
  }

  async getDatasetProfile(datasetId: string): Promise<any> {
    try {
      const resourceId = await this.resolveDatasetResourceId(datasetId);
      console.error(`[Dataset Profile] Resolved ${datasetId} -> ${resourceId}`);
      return await this.fetch(`/data-sets/${resourceId}/profiles`);
    } catch (e) {
      console.error(`[Dataset Profile] Error: ${e}`);
      return null;
    }
  }

  // ==================== BOOKMARKS ====================

  async getBookmarks(appId: string): Promise<any[]> {
    const wsUrl = `wss://${new URL(this.baseUrl).host}/app/${appId}`;
    const schema: object = await fetch("https://unpkg.com/enigma.js@2.14.0/schemas/12.936.0.json").then(r => r.json()) as object;

    const session = enigma.create({
      schema,
      url: wsUrl,
      createSocket: (url: string) => new WebSocket(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }) as any,
    });
    try {
      const global = await session.open();
      const app = await (global as any).openDoc(appId);

      const bookmarkList = await app.createSessionObject({
        qInfo: { qType: "BookmarkList" },
        qBookmarkListDef: {
          qType: "bookmark",
          qData: {
            title: "/qMetaDef/title",
            description: "/qMetaDef/description",
            sheetId: "/sheetId",
            selectionFields: "/qBookmark/qStateData/0/qFieldItems/*/qDef/qName",
          },
        },
      });
      const layout = await bookmarkList.getLayout();
      return layout.qBookmarkList?.qItems || [];
    } finally {
      await session.close();
    }
  }

  async applyBookmark(appId: string, bookmarkId: string): Promise<any> {
    const wsUrl = `wss://${new URL(this.baseUrl).host}/app/${appId}`;
    const schema: object = await fetch("https://unpkg.com/enigma.js@2.14.0/schemas/12.936.0.json").then(r => r.json()) as object;

    const session = enigma.create({
      schema,
      url: wsUrl,
      createSocket: (url: string) => new WebSocket(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }) as any,
    });
    try {
      const global = await session.open();
      const app = await (global as any).openDoc(appId);
      const result = await app.applyBookmark(bookmarkId);
      return { success: result, bookmarkId };
    } finally {
      await session.close();
    }
  }

  // ==================== VARIABLES ====================

  async getVariables(appId: string): Promise<any[]> {
    const wsUrl = `wss://${new URL(this.baseUrl).host}/app/${appId}`;
    const schema: object = await fetch("https://unpkg.com/enigma.js@2.14.0/schemas/12.936.0.json").then(r => r.json()) as object;

    const session = enigma.create({
      schema,
      url: wsUrl,
      createSocket: (url: string) => new WebSocket(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }) as any,
    });
    try {
      const global = await session.open();
      const app = await (global as any).openDoc(appId);

      const variableList = await app.createSessionObject({
        qInfo: { qType: "VariableList" },
        qVariableListDef: {
          qType: "variable",
          qData: {
            tags: "/tags",
          },
        },
      });
      const layout = await variableList.getLayout();
      return layout.qVariableList?.qItems || [];
    } finally {
      await session.close();
    }
  }

  async setVariable(appId: string, variableName: string, value: string): Promise<any> {
    const wsUrl = `wss://${new URL(this.baseUrl).host}/app/${appId}`;
    const schema: object = await fetch("https://unpkg.com/enigma.js@2.14.0/schemas/12.936.0.json").then(r => r.json()) as object;

    const session = enigma.create({
      schema,
      url: wsUrl,
      createSocket: (url: string) => new WebSocket(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }) as any,
    });
    try {
      const global = await session.open();
      const app = await (global as any).openDoc(appId);
      const variable = await app.getVariableByName(variableName);
      await variable.setStringValue(value);
      return { success: true, variableName, value };
    } finally {
      await session.close();
    }
  }

  // ==================== STORIES ====================

  async getStories(appId: string): Promise<any[]> {
    const wsUrl = `wss://${new URL(this.baseUrl).host}/app/${appId}`;
    const schema: object = await fetch("https://unpkg.com/enigma.js@2.14.0/schemas/12.936.0.json").then(r => r.json()) as object;

    const session = enigma.create({
      schema,
      url: wsUrl,
      createSocket: (url: string) => new WebSocket(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }) as any,
    });
    try {
      const global = await session.open();
      const app = await (global as any).openDoc(appId);

      const storyList = await app.createSessionObject({
        qInfo: { qType: "StoryList" },
        qAppObjectListDef: {
          qType: "story",
          qData: {
            title: "/qMetaDef/title",
            description: "/qMetaDef/description",
            thumbnail: "/thumbnail",
          },
        },
      });
      const layout = await storyList.getLayout();
      return layout.qAppObjectList?.qItems || [];
    } finally {
      await session.close();
    }
  }

  // ==================== APP SCRIPT ====================

  async getAppScript(appId: string): Promise<string> {
    const wsUrl = `wss://${new URL(this.baseUrl).host}/app/${appId}`;
    console.error(`[AppScript] Connecting to ${wsUrl}`);
    const schema: object = await fetch("https://unpkg.com/enigma.js@2.14.0/schemas/12.936.0.json").then(r => r.json()) as object;

    const session = enigma.create({
      schema,
      url: wsUrl,
      createSocket: (url: string) => new WebSocket(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }) as any,
    });
    try {
      console.error(`[AppScript] Opening session...`);
      const global = await session.open();
      console.error(`[AppScript] Opening doc ${appId}...`);
      const app = await (global as any).openDoc(appId);
      console.error(`[AppScript] Getting script...`);
      const script = await app.getScript();
      console.error(`[AppScript] Got script (${script?.length || 0} chars)`);
      return script;
    } catch (err: any) {
      console.error(`[AppScript] Error:`, err?.message || err);
      throw err;
    } finally {
      await session.close();
    }
  }

  // ==================== CONNECTIONS ====================

  async getConnections(appId: string): Promise<any[]> {
    const wsUrl = `wss://${new URL(this.baseUrl).host}/app/${appId}`;
    const schema: object = await fetch("https://unpkg.com/enigma.js@2.14.0/schemas/12.936.0.json").then(r => r.json()) as object;

    const session = enigma.create({
      schema,
      url: wsUrl,
      createSocket: (url: string) => new WebSocket(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }) as any,
    });
    try {
      const global = await session.open();
      const app = await (global as any).openDoc(appId);
      return await app.getConnections();
    } finally {
      await session.close();
    }
  }

  // ==================== DATA CONNECTIONS (Tenant Level) ====================

  async getDataConnections(): Promise<any[]> {
    const params = new URLSearchParams({ limit: "100" });
    const result = await this.fetch(`/data-connections?${params}`);
    return result.data || [];
  }

  async getDataConnection(connectionId: string): Promise<any> {
    return this.fetch(`/data-connections/${connectionId}`);
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

CRITICAL: Each result has a unique "id" field (UUID format like "83433f72-1ea0-40d0-939d-3a56eaa4d118"). When calling detail tools (app_details, space_details, etc.), you MUST use the EXACT id from these results. Do NOT invent or guess IDs.

If multiple results found, ask user which one they want before calling detail tools.

IMPORTANT: After showing results, provide a brief summary of what was found (e.g., "3 apps and 2 datasets found, most recent updated today").`,
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

    // Generate summary by type
    const typeCounts: Record<string, number> = {};
    mapped.forEach((item: any) => {
      const t = item.resourceType || "unknown";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    const typeBreakdown = Object.entries(typeCounts)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(", ");

    const summary = mapped.length === 0
      ? "No results found"
      : `Found ${mapped.length} items: ${typeBreakdown}`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: { type: "apps", apps: mapped, query: args.query, summary, tenantUrl: TENANT_URL },
    };
  });

  // ==================== APP DETAILS ====================

  registerAppTool(server, "app_details", {
    title: "Get App Details",
    description: `Get detailed information about a specific Qlik app.

CRITICAL: You MUST use the exact app ID from search results or UI selection. The ID is a UUID like "83433f72-1ea0-40d0-939d-3a56eaa4d118". Do NOT invent or guess IDs.

IMPORTANT: The UI displays ALL details in a rich visual card. DO NOT:
- List or repeat any app properties
- Create tables or summaries
- Describe the owner, dates, or status

Simply say "Here are the details" or ask what the user wants to do next.`,
    inputSchema: {
      appId: z.string().describe("The exact app ID (UUID) from search results (e.g., 83433f72-1ea0-40d0-939d-3a56eaa4d118)"),
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
        tenantUrl: TENANT_URL,
      },
    };
  });

  // ==================== SPACES CATALOG ====================

  registerAppTool(server, "spaces", {
    title: "Get Spaces Catalog",
    description: `Get comprehensive catalog of spaces in Qlik Cloud tenant. The UI displays results - DO NOT list them again in text.

CRITICAL: Each space in results has a unique "id" field. When user wants details, you MUST use the EXACT id from the results.
Example: If results show {"id": "66990bad681dc0ebb43946d7", "name": "Supply Chain(Dev)"}, use spaceId="66990bad681dc0ebb43946d7"

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
    description: `Get detailed information about a space including all items in it. The UI displays the space info and items - DO NOT list them again in text.

CRITICAL: You MUST use the exact space ID from the "spaces" tool results or UI selection. Do NOT invent or guess IDs.
Example: Use the "id" field value like "66990bad681dc0ebb43946d7", not the space name.

IMPORTANT: After showing results, provide a brief summary (e.g., "Shared space with 5 apps and 3 datasets").`,
    inputSchema: {
      spaceId: z.string().describe("The exact space ID from spaces tool results (e.g., 66990bad681dc0ebb43946d7)"),
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

    // Generate summary by type
    const typeCounts: Record<string, number> = {};
    mappedItems.forEach((item: any) => {
      const t = item.resourceType || "item";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    const typeBreakdown = Object.entries(typeCounts)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(", ");

    const summary = `${space.type || "Space"} "${space.name}" contains ${mappedItems.length} items: ${typeBreakdown || "empty"}`;

    return {
      content: [{ type: "text", text: summary }],
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
        summary,
      },
    };
  });

  // ==================== GOVERNANCE ====================

  registerAppTool(server, "tenant", {
    title: "Get Tenant Dashboard",
    description: "Get comprehensive Qlik Cloud tenant information including license, capacity, and features",
    inputSchema: {},
    _meta: { ui: { resourceUri } },
  }, async (): Promise<CallToolResult> => {
    // Fetch tenant info
    const tenant = await qlik.getTenantInfo();

    // Fetch license info
    let license: any = null;
    try {
      license = await qlik.fetch("/licenses/overview");
    } catch { /* ignore */ }

    // Fetch counts in parallel
    let counts = { apps: 0, spaces: 0, users: 0, automations: 0 };
    try {
      const [appsRes, spacesRes, usersRes, autoRes] = await Promise.all([
        qlik.fetch("/items?resourceType=app&limit=1"),
        qlik.fetch("/spaces?limit=1"),
        qlik.fetch("/users?limit=1"),
        qlik.fetch("/automations?limit=1"),
      ]);
      counts.apps = appsRes.totalResults || 0;
      counts.spaces = spacesRes.meta?.count || 0;
      counts.users = usersRes.totalResults || 0;
      counts.automations = autoRes.data?.length || 0;
    } catch { /* ignore */ }

    // Extract capacities and features from license
    const capacities: Record<string, any> = {};
    const features: string[] = [];

    if (license?.parameters) {
      for (const param of license.parameters) {
        const v = param.values;
        switch (param.name) {
          case "fullUser": capacities.users = v.unlimited ? "Unlimited" : v.quantity; break;
          case "concurrent_reloads": capacities.concurrentReloads = v.quantity; break;
          case "dataAnalyticsCapacity": capacities.dataCapacityGB = Math.round((v.quantity || 0) / 1073741824); break;
          case "maxAppSizeInMemory": capacities.maxAppSizeGB = v.quantity; break;
          case "amlDepModel": capacities.mlModels = v.quantity; break;
          case "standardAutomationRuns": capacities.automationRuns = v.quantity; break;
          case "reportingService": capacities.reports = v.quantity; break;
          case "numQuestionsPerMonth": capacities.aiQuestions = v.quantity; break;
          case "qcs_tenants": capacities.tenants = v.quantity; break;
          case "geoanalytics": if (v.toggle) features.push("Geo Analytics"); break;
          case "sapconnector": if (v.toggle) features.push("SAP Connector"); break;
          case "qlikSenseMobile": if (v.toggle) features.push("Mobile"); break;
          case "qlikSenseDesktop": if (v.toggle) features.push("Desktop"); break;
          case "qlikSenseOfficeAddIn": if (v.toggle) features.push("Office Add-in"); break;
          case "byoidp": if (v.toggle) features.push("BYOIDP"); break;
          case "jwtAuth": if (v.toggle) features.push("JWT Auth"); break;
          case "dataIntegrationServices": if (v.toggle) features.push("Data Integration"); break;
          case "amlAdvFeatures": if (v.toggle) features.push("AutoML"); break;
        }
      }
    }

    // Get user allotment
    const usersUsed = license?.allotments?.find((a: any) => a.name === "fullUser")?.unitsUsed || 0;

    return {
      content: [{ type: "text", text: `Tenant: ${tenant.name}` }],
      structuredContent: {
        type: "tenant",
        id: tenant.id,
        name: tenant.name,
        hostnames: tenant.hostnames,
        region: tenant.region,
        datacenter: tenant.datacenter,
        status: tenant.status,
        created: tenant.created,
        lastUpdated: tenant.lastUpdated,
        licenseNumber: license?.licenseNumber,
        licenseValid: license?.valid,
        licenseStatus: license?.status,
        product: license?.product,
        edition: license?.parameters?.find((p: any) => p.name === "edition")?.values?.value,
        trial: license?.trial,
        counts,
        capacities,
        features,
        usersUsed,
      },
    };
  });

  registerAppTool(server, "user", {
    title: "Get User Info",
    description: `Get detailed user information.

CRITICAL: You MUST use the exact user ID from the "users" tool results. Do NOT invent IDs.`,
    inputSchema: { userId: z.string().describe("The exact user ID from users results") },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const user = await qlik.getUserInfo(args.userId);
    return {
      content: [{ type: "text", text: `User: ${user.name}` }],
      structuredContent: { type: "user-detail", ...user },
    };
  });

  registerAppTool(server, "users", {
    title: "List/Search Users",
    description: `List all users or search by name/email. The UI displays results - DO NOT list them again in text.

If no query provided, returns ALL users in the tenant.

CRITICAL: Each user has a unique "id" field. When getting user details, use the EXACT id from results.`,
    inputSchema: {
      query: z.string().optional().describe("Optional: User name or email to search. Leave empty to list all users."),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    // If query provided, search; otherwise get all users
    const users = args.query ? await qlik.searchUsers(args.query) : await qlik.getUsers();
    const mapped = users.map((u: any) => ({
      id: u.id, name: u.name, email: u.email, status: u.status, picture: u.picture,
      roles: u.roles, lastUpdated: u.lastUpdatedAt, created: u.createdAt,
    }));
    return {
      content: [{ type: "text", text: `Found ${mapped.length} users` }],
      structuredContent: { type: "users", users: mapped, query: args.query || "" },
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
    title: "Get License Dashboard",
    description: "Get comprehensive license information including allotments, capacities, features, and usage metrics",
    inputSchema: {},
    _meta: { ui: { resourceUri } },
  }, async (): Promise<CallToolResult> => {
    const license = await qlik.getLicenseInfo();

    // Parse allotments
    const allotments = (license.allotments || []).map((a: any) => ({
      name: a.name,
      displayName: a.name === "fullUser" ? "Full Users" : a.name === "byoidp" ? "BYOIDP" : a.name,
      usageClass: a.usageClass,
      total: a.units === -1 ? "Unlimited" : a.units,
      used: a.unitsUsed,
      overage: a.overage,
    }));

    // Parse parameters into categories
    const capacities: any[] = [];
    const features: any[] = [];
    const limits: any[] = [];

    for (const param of (license.parameters || [])) {
      const v = param.values;
      const item = {
        name: param.name,
        title: v.title || param.name,
        value: v.quantity || v.value,
        unit: v.unit,
        scope: v.scope,
        toggle: v.toggle,
        unlimited: v.unlimited,
        periodType: v.periodType,
        visible: v.visible,
      };

      // Categorize
      if (v.toggle === true) {
        features.push({ name: v.title || param.name, enabled: true });
      } else if (v.visible === true || v.periodType) {
        capacities.push(item);
      } else if (v.quantity && !v.toggle) {
        limits.push(item);
      }
    }

    // Calculate validity
    const validRange = license.valid?.split("/") || [];
    const validFrom = validRange[0];
    const validTo = validRange[1];
    const daysRemaining = validTo ? Math.ceil((new Date(validTo).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

    return {
      content: [{ type: "text", text: `License info retrieved` }],
      structuredContent: {
        type: "license",
        // Basic info
        licenseNumber: license.licenseNumber,
        product: license.product,
        status: license.status,
        trial: license.trial,
        valid: license.valid,
        validFrom,
        validTo,
        daysRemaining,
        changeTime: license.changeTime,
        // Parsed data
        allotments,
        capacities,
        features,
        limits,
      },
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
    title: "Get Reload Status & Log",
    description: "Gets the current status of a reload task including the reload log",
    inputSchema: { reloadId: z.string().describe("The reload task ID to check") },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const reload = await qlik.getReloadDetail(args.reloadId);
    // Get item ID to construct history link
    const itemId = await qlik.getItemIdForApp(reload.appId);
    const historyLink = itemId ? `${qlik.getTenantUrl()}/item/${itemId}/history` : null;

    return {
      content: [{ type: "text", text: `Status: ${reload.status}` }],
      structuredContent: {
        type: "reload-detail",
        id: reload.id,
        appId: reload.appId,
        status: reload.status,
        reloadType: reload.type,
        startTime: reload.startTime,
        endTime: reload.endTime,
        duration: reload.duration,
        log: reload.log,
        errorCode: reload.errorCode,
        errorMessage: reload.errorMessage,
        historyLink,
      },
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

CRITICAL: Each automation has a unique "id" field. When getting details, use the EXACT id from results.

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
    description: `Get full details of a specific automation.

CRITICAL: You MUST use the exact automation ID from the "automations" tool results. Do NOT invent IDs.`,
    inputSchema: { automationId: z.string().describe("The exact automation ID from automations results") },
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

CRITICAL: Each alert has a unique "id" field. When getting details, use the EXACT id from results.

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
    description: `Get detailed information about a specific alert.

CRITICAL: You MUST use the exact alert ID from the "alerts" tool results. Do NOT invent IDs.`,
    inputSchema: { alertId: z.string().describe("The exact alert ID from alerts results") },
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

CRITICAL: Each assistant has a unique "id" field. When getting details, use the EXACT id from results.

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
    description: `Get details of a specific AI assistant.

CRITICAL: You MUST use the exact assistant ID from the "assistants" tool results. Do NOT invent IDs.`,
    inputSchema: { assistantId: z.string().describe("The exact assistant ID from assistants results") },
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

Example: "show me sales trend", "revenue by region", "top 10 customers"

If user explicitly requests a chart type (e.g., "as pie chart", "show as bar"), pass chartType parameter.

IMPORTANT: After showing the chart, provide a brief insight (1-2 sentences) about what the data reveals - top performers, trends, outliers, or key takeaways. Don't just describe the chart, interpret it.`,
    inputSchema: {
      text: z.string().describe("Natural language question"),
      appId: z.string().describe("App ID"),
      chartType: z.string().optional().describe("Override chart type if user explicitly requests one (pie, bar, line, donut, area, treemap)"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    // Auto-detect chart type from text if not provided as parameter
    let detectedChartType = args.chartType?.toLowerCase();
    if (!detectedChartType) {
      const textLower = args.text.toLowerCase();
      // Check for explicit chart type requests (order matters - more specific first)
      if (textLower.includes('polar')) detectedChartType = 'polar';
      else if (textLower.includes('radar')) detectedChartType = 'radar';
      else if (textLower.includes('pie')) detectedChartType = 'pie';
      else if (textLower.includes('bar chart') || textLower.includes('bar graph')) detectedChartType = 'bar';
      else if (textLower.includes('line chart') || textLower.includes('line graph')) detectedChartType = 'line';
      else if (textLower.includes('donut') || textLower.includes('doughnut')) detectedChartType = 'donut';
      else if (textLower.includes('scatter')) detectedChartType = 'scatter';
      else if (textLower.includes('area chart') || textLower.includes('area graph')) detectedChartType = 'area';
      else if (textLower.includes('treemap')) detectedChartType = 'treemap';
      else if (textLower.includes('table')) detectedChartType = 'table';
    }

    console.error(`[Insight] Question: ${args.text}, Override chart: ${detectedChartType || 'none'}`);

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

    // Chart type mapping including polar/radar
    const chartTypeMap: Record<string, string> = {
      'pie': 'piechart',
      'bar': 'barchart',
      'line': 'linechart',
      'donut': 'donutchart',
      'doughnut': 'donutchart',
      'area': 'areachart',
      'treemap': 'treemap',
      'scatter': 'scatterplot',
      'combo': 'combochart',
      'table': 'table',
      'polar': 'polarArea',
      'radar': 'radar',
    };
    const chartType = detectedChartType ? (chartTypeMap[detectedChartType] || detectedChartType) : (rec.chartType || "barchart");
    const title = rec.options?.title || rec.analysis?.title || args.text;

    console.error(`[Insight] Chart type: ${chartType}, Title: ${title}`);

    // Get REAL data from Qlik Engine
    try {
      const chartData = await qlik.getChartData(args.appId, hypercubeDef, chartType);

      // Generate auto-summary from data
      const generateInsight = (labels: string[], values: number[], measureName?: string) => {
        if (!values || values.length === 0) return "";

        const total = values.reduce((a, b) => a + b, 0);
        const max = Math.max(...values);
        const maxIdx = values.indexOf(max);
        const avg = total / values.length;

        const formatNum = (n: number) => {
          if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
          if (n >= 1000) return (n / 1000).toFixed(1) + "K";
          return n.toFixed(0);
        };

        const topLabel = labels[maxIdx] || "Top item";
        const topPct = ((max / total) * 100).toFixed(0);
        const measure = measureName || "value";

        if (values.length === 1) {
          return `Total ${measure}: ${formatNum(total)}`;
        }

        return `${topLabel} leads with ${formatNum(max)} (${topPct}% of total). ${values.length} items, total: ${formatNum(total)}, avg: ${formatNum(avg)}.`;
      };

      const insight = chartData.tableData
        ? `Table with ${chartData.tableData.rows?.length || 0} rows and ${chartData.tableData.headers?.length || 0} columns.`
        : generateInsight(chartData.labels, chartData.values, chartData.measureNames?.[0]);

      return {
        content: [{ type: "text", text: `${title}\n\nInsight: ${insight}` }],
        structuredContent: {
          type: "chart",
          chartType,
          title,
          labels: chartData.labels,
          values: chartData.values,
          values2: chartData.values2, // Second measure for scatter plots
          tableData: chartData.tableData, // For table chart type
          measureNames: chartData.measureNames, // Axis labels from Engine
          question: args.text,
          insight, // Include insight in structured content too
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

CRITICAL: Each experiment has a unique "id" field. When getting details, use the EXACT id from results.

If multiple experiments found, ask user which one they want.`,
    inputSchema: {
      spaceId: z.string().optional().describe("Filter by space ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const experiments = await qlik.automlGetExperiments(args.spaceId);
    const mapped = experiments.map((e: any) => {
      const attrs = e.attributes || e;
      return {
        id: e.id || attrs.id,
        name: attrs.name || e.name || "Unnamed",
        status: attrs.status || e.status,
        targetFeature: attrs.targetFeature || e.targetFeature,
        createdAt: attrs.createdAt || e.createdAt,
        algorithm: attrs.algorithm || e.algorithm,
      };
    });
    return {
      content: [{ type: "text", text: `Found ${mapped.length} experiments` }],
      structuredContent: { type: "experiments", experiments: mapped },
    };
  });

  registerAppTool(server, "experiment", {
    title: "Get Experiment Details",
    description: `Get ML experiment details.

CRITICAL: You MUST use the exact experiment ID from the "experiments" tool results. Do NOT invent IDs.`,
    inputSchema: {
      experimentId: z.string().describe("The exact experiment ID from experiments results"),
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
    description: `List all ML deployments. The UI displays results - DO NOT list them again in text.

CRITICAL: Each deployment has a unique "id" field. When getting details, use the EXACT id from results.`,
    inputSchema: {
      spaceId: z.string().optional().describe("Filter by space ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const deployments = await qlik.automlListDeployments(args.spaceId);
    const mapped = deployments.map((d: any) => {
      const attrs = d.attributes || d;
      return {
        id: d.id || attrs.id,
        name: attrs.name || d.name || "Unnamed",
        status: attrs.status || d.status,
        createdAt: attrs.createdAt || d.createdAt,
      };
    });
    return {
      content: [{ type: "text", text: `Found ${mapped.length} deployments` }],
      structuredContent: { type: "deployments", deployments: mapped },
    };
  });

  registerAppTool(server, "deployment", {
    title: "Get Deployment Details",
    description: `Get ML deployment details.

CRITICAL: You MUST use the exact deployment ID from the "deployments" tool results. Do NOT invent IDs.`,
    inputSchema: { deploymentId: z.string().describe("The exact deployment ID from deployments results") },
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
**For Datasets**: Pass the dataset ID (item ID) or secureQri (starts with "qri:")

The lineage shows all data sources connected to the resource.`,
    inputSchema: {
      nodeId: z.string().describe("App ID (UUID), dataset ID (item ID), or dataset secureQri"),
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

    // Check if it's already a QRI
    let qri = args.nodeId;

    // If not a QRI, assume it's a dataset item ID and fetch the secureQri
    if (!args.nodeId.startsWith('qri:')) {
      console.error(`[Lineage] nodeId "${args.nodeId}" is not a QRI, fetching dataset details to get secureQri`);
      try {
        const dataset = await qlik.getDatasetDetails(args.nodeId);
        if (!dataset.secureQri) {
          return {
            content: [{ type: "text", text: `Error: Dataset ${args.nodeId} does not have a secureQri for lineage lookup` }],
            structuredContent: { type: "error", message: "Dataset missing secureQri" },
            isError: true,
          };
        }
        qri = dataset.secureQri;
        console.error(`[Lineage] Retrieved secureQri: ${qri}`);
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error: Could not fetch dataset details for ${args.nodeId}: ${err.message}` }],
          structuredContent: { type: "error", message: err.message },
          isError: true,
        };
      }
    }

    const lineage = await qlik.getLineage(qri, args.direction, args.levels);
    return {
      content: [{ type: "text", text: `[Lineage displayed in UI]` }],
      structuredContent: { type: "lineage", ...lineage },
    };
  });

  // ==================== DATA TOOLS ====================

  registerAppTool(server, "dataset", {
    title: "Get Dataset Details",
    description: `Get detailed information about a dataset.

CRITICAL: You MUST use the exact dataset ID from search results or datasets list. Do NOT invent IDs.

IMPORTANT: The UI displays ALL details in a rich visual card. DO NOT:
- List or repeat any dataset properties
- Create tables or summaries of the data
- Describe the fields, types, or statistics

Simply say "Here are the details" or ask what the user wants to do next.`,
    inputSchema: { datasetId: z.string().describe("The exact dataset ID from search/datasets results") },
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
    description: `Apply selections/filters to a Qlik app field.

Use this to filter data by selecting specific values in a field.`,
    inputSchema: {
      appId: z.string().describe("App ID to apply selections to"),
      selections: z.array(z.object({
        field: z.string().describe("Field name"),
        values: z.array(z.string()).optional().describe("Values to select"),
      })).describe("Array of field selections"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const results: any[] = [];

    for (const sel of args.selections) {
      if (sel.values && sel.values.length > 0) {
        const result = await qlik.selectValues(args.appId, sel.field, sel.values);
        results.push(result);
      }
    }

    const summary = results.map(r => `${r.field}: ${r.selectedCount} values`).join(", ");

    return {
      content: [{ type: "text", text: `Applied selections: ${summary}` }],
      structuredContent: {
        type: "action-success",
        action: "select",
        appId: args.appId,
        selections: results,
      },
    };
  });

  registerAppTool(server, "clear_selections", {
    title: "Clear Selections",
    description: `Clear all selections in a Qlik app.`,
    inputSchema: {
      appId: z.string().describe("App ID to clear selections"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const result = await qlik.clearSelections(args.appId);
    return {
      content: [{ type: "text", text: `Cleared all selections in "${result.appName}"` }],
      structuredContent: {
        type: "action-success",
        action: "clear_selections",
        appId: args.appId,
        appName: result.appName,
        message: "All selections cleared",
      },
    };
  });

  registerAppTool(server, "selections", {
    title: "Get Current Selections",
    description: `Get current selections/filters active in a Qlik app.`,
    inputSchema: {
      appId: z.string().describe("App ID to get selections from"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const result = await qlik.getAppSelections(args.appId);
    const selCount = result.selections?.length || 0;
    const summary = selCount > 0
      ? result.selections.map((s: any) => `${s.field}: ${s.selected}`).join(", ")
      : "No active selections";

    return {
      content: [{ type: "text", text: `${result.appName}: ${summary}` }],
      structuredContent: {
        type: "app-selections",
        appId: args.appId,
        appName: result.appName,
        selections: result.selections,
        selectionCount: selCount,
      },
    };
  });

  registerAppTool(server, "fields", {
    title: "Get Available Fields",
    description: `Get all available fields in a Qlik app's data model.

IMPORTANT: After showing the data model, provide a brief summary (e.g., "Data model has 5 tables, largest is Sales with 12 fields").`,
    inputSchema: {
      appId: z.string().describe("App ID to get fields from"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const metadata = await qlik.getAppFields(args.appId);
    const tables = metadata.tables || [];
    const fields = tables.flatMap((t: any) => t.fields || []);

    // Find largest table
    const sortedTables = [...tables].sort((a: any, b: any) =>
      (b.fields?.length || 0) - (a.fields?.length || 0)
    );
    const largestTable = sortedTables[0];
    const largestInfo = largestTable
      ? `, largest table: ${largestTable.name} (${largestTable.fields?.length || 0} fields)`
      : "";

    const summary = `Data model: ${tables.length} tables, ${fields.length} total fields${largestInfo}`;

    return {
      content: [{ type: "text", text: summary }],
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

  // ==================== SHEETS ====================

  registerAppTool(server, "list_sheets", {
    title: "List Sheets",
    description: `List all sheets in a Qlik app.

IMPORTANT: After showing sheets, provide a brief summary (e.g., "App has 5 sheets including Dashboard, Sales Analysis, and KPIs").`,
    inputSchema: {
      appId: z.string().describe("App ID to list sheets from"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const sheets = await qlik.getSheets(args.appId);
    const summary = `Found ${sheets.length} sheets: ${sheets.slice(0, 3).map((s: any) => s.title).join(", ")}${sheets.length > 3 ? "..." : ""}`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        type: "sheets",
        appId: args.appId,
        sheets,
        summary,
        tenantUrl: TENANT_URL,
      },
    };
  });

  registerAppTool(server, "sheet_details", {
    title: "Get Sheet Details",
    description: `Get detailed information about a specific sheet including all objects on it.`,
    inputSchema: {
      appId: z.string().describe("App ID"),
      sheetId: z.string().describe("Sheet ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const sheet = await qlik.getSheetObjects(args.appId, args.sheetId);
    const objTypes = sheet.objects.reduce((acc: any, obj: any) => {
      acc[obj.type] = (acc[obj.type] || 0) + 1;
      return acc;
    }, {});
    const typeBreakdown = Object.entries(objTypes).map(([t, c]) => `${c} ${t}`).join(", ");

    return {
      content: [{ type: "text", text: `Sheet "${sheet.title}" has ${sheet.objects.length} objects: ${typeBreakdown}` }],
      structuredContent: {
        type: "sheet-detail",
        appId: args.appId,
        sheetId: args.sheetId,
        tenantUrl: TENANT_URL,
        ...sheet,
      },
    };
  });

  // ==================== FIELD VALUES ====================

  registerAppTool(server, "field_values", {
    title: "Get Field Values",
    description: `Get all unique values in a field. Useful for understanding data content before making selections.

IMPORTANT: After showing values, provide a brief insight (e.g., "Field has 45 unique values, including USA, Germany, Japan...").`,
    inputSchema: {
      appId: z.string().describe("App ID"),
      fieldName: z.string().describe("Field name to get values from"),
      searchText: z.string().optional().describe("Optional search text to filter values"),
      limit: z.number().optional().default(100).describe("Max values to return (default 100)"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const result = await qlik.getFieldValues(args.appId, args.fieldName, args.searchText, args.limit);
    const sampleValues = result.values.slice(0, 5).map((v: any) => v.text).join(", ");
    const summary = `Field "${args.fieldName}" has ${result.totalCount} unique values${args.searchText ? ` (filtered by "${args.searchText}")` : ""}. Sample: ${sampleValues}${result.values.length > 5 ? "..." : ""}`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        type: "field-values",
        appId: args.appId,
        ...result,
        summary,
      },
    };
  });

  // ==================== MASTER ITEMS ====================

  registerAppTool(server, "master_dimensions", {
    title: "List Master Dimensions",
    description: `List all master dimensions in a Qlik app. Master dimensions are reusable, governed dimension definitions.

IMPORTANT: After showing dimensions, provide a brief summary of what's available.`,
    inputSchema: {
      appId: z.string().describe("App ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const dimensions = await qlik.getMasterDimensions(args.appId);
    const summary = `Found ${dimensions.length} master dimensions: ${dimensions.slice(0, 5).map((d: any) => d.title).join(", ")}${dimensions.length > 5 ? "..." : ""}`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        type: "master-dimensions",
        appId: args.appId,
        dimensions,
        summary,
      },
    };
  });

  registerAppTool(server, "master_measures", {
    title: "List Master Measures",
    description: `List all master measures in a Qlik app. Master measures are reusable, governed calculation definitions.

IMPORTANT: After showing measures, provide a brief summary of what's available.`,
    inputSchema: {
      appId: z.string().describe("App ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const measures = await qlik.getMasterMeasures(args.appId);
    const summary = `Found ${measures.length} master measures: ${measures.slice(0, 5).map((m: any) => m.title).join(", ")}${measures.length > 5 ? "..." : ""}`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        type: "master-measures",
        appId: args.appId,
        measures,
        summary,
      },
    };
  });

  // ==================== GLOSSARY ====================

  registerAppTool(server, "glossaries", {
    title: "List Glossaries",
    description: `List all business glossaries in the tenant. Glossaries contain business terms and definitions.`,
    inputSchema: {},
    _meta: { ui: { resourceUri } },
  }, async (): Promise<CallToolResult> => {
    const glossaries = await qlik.getGlossaries();
    const summary = glossaries.length === 0
      ? "No glossaries found"
      : `Found ${glossaries.length} glossaries: ${glossaries.slice(0, 3).map((g: any) => g.name).join(", ")}${glossaries.length > 3 ? "..." : ""}`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        type: "glossaries",
        glossaries,
        summary,
      },
    };
  });

  registerAppTool(server, "glossary_details", {
    title: "Get Glossary Details",
    description: `Get detailed information about a glossary including its terms and categories.`,
    inputSchema: {
      glossaryId: z.string().describe("Glossary ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const [glossary, terms, categories] = await Promise.all([
      qlik.getGlossary(args.glossaryId),
      qlik.getGlossaryTerms(args.glossaryId),
      qlik.getGlossaryCategories(args.glossaryId),
    ]);

    const summary = `Glossary "${glossary.name}" has ${terms.length} terms in ${categories.length} categories`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        type: "glossary-detail",
        ...glossary,
        terms,
        categories,
        summary,
      },
    };
  });

  registerAppTool(server, "glossary_term", {
    title: "Get Glossary Term",
    description: `Get detailed information about a specific glossary term.`,
    inputSchema: {
      glossaryId: z.string().describe("Glossary ID"),
      termId: z.string().describe("Term ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const term = await qlik.getGlossaryTerm(args.glossaryId, args.termId);

    return {
      content: [{ type: "text", text: `Term: ${term.name}` }],
      structuredContent: {
        type: "glossary-term",
        glossaryId: args.glossaryId,
        ...term,
      },
    };
  });

  registerAppTool(server, "create_glossary_term", {
    title: "Create Glossary Term",
    description: `Create a new term in a glossary.`,
    inputSchema: {
      glossaryId: z.string().describe("Glossary ID"),
      name: z.string().describe("Term name"),
      description: z.string().optional().describe("Term description/definition"),
      categoryId: z.string().optional().describe("Category ID to assign term to"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const term = await qlik.createGlossaryTerm(args.glossaryId, {
      name: args.name,
      description: args.description,
      categoryId: args.categoryId,
    });

    return {
      content: [{ type: "text", text: `Created term: ${term.name}` }],
      structuredContent: {
        type: "glossary-term-created",
        glossaryId: args.glossaryId,
        ...term,
      },
    };
  });

  registerAppTool(server, "delete_glossary_term", {
    title: "Delete Glossary Term",
    description: `Delete a term from a glossary.`,
    inputSchema: {
      glossaryId: z.string().describe("Glossary ID"),
      termId: z.string().describe("Term ID to delete"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    await qlik.deleteGlossaryTerm(args.glossaryId, args.termId);

    return {
      content: [{ type: "text", text: `Term deleted successfully` }],
      structuredContent: {
        type: "action-success",
        action: "delete_glossary_term",
        termId: args.termId,
      },
    };
  });

  // ==================== DATA PRODUCTS ====================

  registerAppTool(server, "data_products", {
    title: "List Data Products",
    description: `List all data products in the tenant. Data products are curated collections of datasets for consumption.`,
    inputSchema: {},
    _meta: { ui: { resourceUri } },
  }, async (): Promise<CallToolResult> => {
    const products = await qlik.getDataProducts();
    const summary = products.length === 0
      ? "No data products found"
      : `Found ${products.length} data products`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        type: "data-products",
        products: products.map((p: any) => ({
          id: p.resourceId || p.id,
          name: p.name,
          description: p.description,
          updatedAt: p.updatedAt,
          ownerId: p.ownerId,
          spaceId: p.spaceId,
        })),
      },
    };
  });

  registerAppTool(server, "data_product_details", {
    title: "Get Data Product Details",
    description: `Get detailed information about a specific data product.`,
    inputSchema: {
      productId: z.string().describe("Data product ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const product = await qlik.getDataProduct(args.productId);
    if (!product) {
      return {
        content: [{ type: "text", text: "Data product not found" }],
        structuredContent: { type: "error", message: "Data product not found" },
      };
    }

    return {
      content: [{ type: "text", text: `Data product: ${product.name}` }],
      structuredContent: {
        type: "data-product-detail",
        ...product,
      },
    };
  });

  // ==================== DATASET ENHANCEMENTS ====================

  registerAppTool(server, "dataset_profile", {
    title: "Get Dataset Profile",
    description: `Get data profiling information for a dataset including statistics, distribution, and quality metrics.`,
    inputSchema: {
      datasetId: z.string().describe("Dataset ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const profile = await qlik.getDatasetProfile(args.datasetId);
    if (!profile) {
      return {
        content: [{ type: "text", text: "Profile not available for this dataset" }],
        structuredContent: { type: "error", message: "Dataset profile not available" },
      };
    }

    return {
      content: [{ type: "text", text: `Dataset profile retrieved` }],
      structuredContent: {
        type: "dataset-profile",
        datasetId: args.datasetId,
        profile,
      },
    };
  });

  // ==================== BOOKMARKS ====================

  registerAppTool(server, "bookmarks", {
    title: "List Bookmarks",
    description: `List all bookmarks in an app. Bookmarks save selection states for quick recall.`,
    inputSchema: {
      appId: z.string().describe("App ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const bookmarks = await qlik.getBookmarks(args.appId);
    const summary = bookmarks.length === 0
      ? "No bookmarks in this app"
      : `Found ${bookmarks.length} bookmarks`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        type: "bookmarks",
        appId: args.appId,
        bookmarks: bookmarks.map((b: any) => ({
          id: b.qInfo?.qId,
          title: b.qData?.title || b.qMeta?.title || "Untitled",
          description: b.qData?.description || b.qMeta?.description || "",
          sheetId: b.qData?.sheetId,
        })),
      },
    };
  });

  registerAppTool(server, "apply_bookmark", {
    title: "Apply Bookmark",
    description: `Apply a bookmark to restore its saved selection state.`,
    inputSchema: {
      appId: z.string().describe("App ID"),
      bookmarkId: z.string().describe("Bookmark ID to apply"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const result = await qlik.applyBookmark(args.appId, args.bookmarkId);

    return {
      content: [{ type: "text", text: `Bookmark applied successfully` }],
      structuredContent: {
        type: "action-success",
        action: "apply_bookmark",
        ...result,
      },
    };
  });

  // ==================== VARIABLES ====================

  registerAppTool(server, "variables", {
    title: "List Variables",
    description: `List all variables in an app. Variables store values and expressions that can be used across the app.`,
    inputSchema: {
      appId: z.string().describe("App ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const variables = await qlik.getVariables(args.appId);
    const summary = variables.length === 0
      ? "No variables in this app"
      : `Found ${variables.length} variables`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        type: "variables",
        appId: args.appId,
        variables: variables.map((v: any) => ({
          id: v.qInfo?.qId,
          name: v.qName,
          definition: v.qDefinition,
          isScriptCreated: v.qIsScriptCreated,
          tags: v.qData?.tags || [],
        })),
      },
    };
  });

  registerAppTool(server, "set_variable", {
    title: "Set Variable Value",
    description: `Set the value of a variable in an app.`,
    inputSchema: {
      appId: z.string().describe("App ID"),
      variableName: z.string().describe("Variable name"),
      value: z.string().describe("New value for the variable"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const result = await qlik.setVariable(args.appId, args.variableName, args.value);

    return {
      content: [{ type: "text", text: `Variable "${args.variableName}" set to "${args.value}"` }],
      structuredContent: {
        type: "action-success",
        action: "set_variable",
        ...result,
      },
    };
  });

  // ==================== STORIES ====================

  registerAppTool(server, "stories", {
    title: "List Stories",
    description: `List all data stories in an app. Stories are presentation-style narratives using snapshots.`,
    inputSchema: {
      appId: z.string().describe("App ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const stories = await qlik.getStories(args.appId);
    const summary = stories.length === 0
      ? "No stories in this app"
      : `Found ${stories.length} stories`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        type: "stories",
        appId: args.appId,
        stories: stories.map((s: any) => ({
          id: s.qInfo?.qId,
          title: s.qData?.title || s.qMeta?.title || "Untitled",
          description: s.qData?.description || s.qMeta?.description || "",
          thumbnail: s.qData?.thumbnail,
        })),
      },
    };
  });

  // ==================== APP SCRIPT ====================

  registerAppTool(server, "app_script", {
    title: "Get App Load Script",
    description: `Get the data load script of an app. The script defines data sources, transformations, and the data model.`,
    inputSchema: {
      appId: z.string().describe("App ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const script = await qlik.getAppScript(args.appId);
    const lines = script.split("\n").length;

    return {
      content: [{ type: "text", text: `Script retrieved (${lines} lines)` }],
      structuredContent: {
        type: "app-script",
        appId: args.appId,
        script,
        lineCount: lines,
      },
    };
  });

  // ==================== CONNECTIONS ====================

  registerAppTool(server, "app_connections", {
    title: "Get App Connections",
    description: `List all data connections used by an app.`,
    inputSchema: {
      appId: z.string().describe("App ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const connections = await qlik.getConnections(args.appId);
    const summary = connections.length === 0
      ? "No connections in this app"
      : `Found ${connections.length} connections`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        type: "app-connections",
        appId: args.appId,
        connections: connections.map((c: any) => ({
          id: c.qId,
          name: c.qName,
          type: c.qType,
          connectionString: c.qConnectionString,
        })),
      },
    };
  });

  registerAppTool(server, "data_connections", {
    title: "List Data Connections",
    description: `List all data connections at the tenant level. These are shared connections available across spaces.`,
    inputSchema: {},
    _meta: { ui: { resourceUri } },
  }, async (): Promise<CallToolResult> => {
    const connections = await qlik.getDataConnections();
    const summary = connections.length === 0
      ? "No data connections found"
      : `Found ${connections.length} data connections`;

    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        type: "data-connections",
        connections: connections.map((c: any) => ({
          id: c.id,
          name: c.name || c.qName,
          type: c.type || c.qType,
          spaceId: c.spaceId,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      },
    };
  });

  registerAppTool(server, "data_connection_details", {
    title: "Get Data Connection Details",
    description: `Get detailed information about a specific data connection.`,
    inputSchema: {
      connectionId: z.string().describe("Data connection ID"),
    },
    _meta: { ui: { resourceUri } },
  }, async (args): Promise<CallToolResult> => {
    const connection = await qlik.getDataConnection(args.connectionId);

    return {
      content: [{ type: "text", text: `Connection: ${connection.name || connection.qName}` }],
      structuredContent: {
        type: "data-connection-detail",
        ...connection,
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
