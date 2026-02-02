# Qlik Cloud MCP App for Claude Desktop

A full-featured Model Context Protocol (MCP) server that connects Claude Desktop to Qlik Cloud, providing rich interactive UI components for managing apps, spaces, users, automations, alerts, AI assistants, and more.

## Features

### 36 MCP Tools with Rich UI

| Category | Tools | Description |
|----------|-------|-------------|
| **Search & Discovery** | `search` | Search all items in Qlik Cloud with filters |
| **Apps** | `app_details`, `generate_app` | View app details, generate apps from natural language |
| **Spaces** | `spaces`, `space_details` | List and explore spaces with their contents |
| **Users** | `users`, `user` | List and view user information |
| **Tenant** | `tenant`, `health`, `license` | Tenant info, system health, license details |
| **Reloads** | `reload`, `reload_status`, `reload_cancel`, `reload_info` | Trigger, monitor, cancel reloads |
| **Automations** | `automations`, `automation`, `automation_run`, `automation_runs` | Manage and run automations |
| **Alerts** | `alerts`, `alert`, `alert_trigger`, `alert_delete` | Manage data alerts |
| **Qlik Answers** | `assistants`, `assistant`, `ask_assistant` | AI assistants for Q&A |
| **Insight Advisor** | `insight` | Natural language charts with real data |
| **ML/AutoML** | `experiments`, `experiment`, `deployments`, `deployment` | ML experiments and deployments |
| **Data** | `lineage`, `dataset` | Data lineage and dataset details |
| **Selections** | `select`, `clear_selections`, `selections`, `fields` | Interactive app selections |

### UI Components

The MCP App renders beautiful, interactive UI cards in Claude Desktop:

- **Grid Views**: Apps, spaces, users, automations, alerts, assistants
- **Detail Cards**: Rich information cards with metadata
- **Charts**: Real-time Insight Advisor charts (bar, line, pie, scatter, polar, radar, doughnut, area)
- **Tables**: Data tables with multiple dimensions and measures
- **Timelines**: Reload history, automation runs
- **Lineage Graphs**: Data lineage visualization with impact analysis
- **Interactive Elements**: Filters, sorting, pagination, action buttons, 3-dot menus

### Smart Chart Type Detection

Ask for specific chart types in natural language:

```
"Show revenue by region as a polar chart"
"Display sales by category in a pie chart"
"Revenue vs profit by customer as a scatter plot"
"Product details as a table"
```

Supported chart types: bar, line, pie, doughnut, polar, radar, scatter, area, treemap, table

## Architecture

```
qlik-claude-mcp-app/
├── server.ts              # MCP Server - API client & tool definitions
├── main.ts                # Entry point - stdio transport
├── mcp-app.html           # HTML template for UI
├── src/
│   ├── mcp-app.tsx        # React UI components (90+ KB)
│   ├── global.css         # Global styles (53+ KB)
│   ├── mcp-app.module.css # Module styles
│   └── vite-env.d.ts      # TypeScript environment
├── assets/
│   └── qlik-icon.svg      # Qlik icon
├── dist/                  # Build output
│   ├── index.js           # Bundled entry point
│   ├── server.js          # Bundled server
│   └── mcp-app.html       # Single-file UI bundle
├── package.json
├── tsconfig.json
├── tsconfig.server.json
└── vite.config.ts
```

### Key Components

#### server.ts - MCP Server (~64KB)

The heart of the application containing:

- **QlikClient Class**: Full Qlik Cloud API client with methods for:
  - Search & Items API
  - Apps API (details, reload, thumbnail)
  - Spaces API (list, details, items)
  - Users API (list, search, details)
  - Reloads API (trigger, status, cancel, history)
  - Automations API (list, details, run, history)
  - Alerts API (list, details, trigger, delete)
  - Qlik Answers API (assistants, threads, invoke)
  - Insight Advisor API (recommendations, chart data)
  - AutoML API (experiments, deployments)
  - Data Lineage API
  - Datasets API
  - Engine API via Enigma.js (selections, field values, app generation)

- **Tool Registrations**: 36 tools with Zod schemas for input validation
- **Auto-Pagination**: Fetches all results using cursor-based pagination
- **WebSocket Integration**: Enigma.js for Qlik Engine communication

#### mcp-app.tsx - React UI (~100KB)

Comprehensive UI components including:

- **Grid Components**: AppsGrid, SpacesGrid, UsersGrid, AutomationsGrid, AlertsGrid, AssistantsGrid, ExperimentsGrid, DeploymentsGrid, DatasetsGrid
- **Detail Components**: AppDetail, SpaceDetail, UserDetail, AutomationDetail, AlertDetail, AssistantDetail, ExperimentDetail, DatasetDetail
- **Visualization**: ChartView (bar, line, pie, doughnut, polar, radar, scatter, area), LineageView, AppLineageView, DataTable
- **Interactive**: ReloadsTimeline, AutomationRuns, SelectionsPanel, FieldValuesModal, ItemMenu (3-dot menu)
- **Common**: Card, Pagination, StatusBadge, ErrorCard, ActionSuccess
- **40-color palette** for rich pie/doughnut/polar/radar charts

#### global.css - Styles (~53KB)

Complete styling system with:
- Dark theme optimized for Claude Desktop
- Card layouts with gradient headers
- Grid and list views
- Chart styling
- Status badges and indicators
- Responsive design
- Animation and transitions

## Installation

### Prerequisites

- Node.js 18+
- Bun (for building)
- Claude Desktop
- Qlik Cloud tenant with API key

### Setup

1. Clone the repository:
```bash
git clone https://github.com/undsoul/qlik-claude-mcp-app.git
cd qlik-claude-mcp-app
```

2. Install dependencies:
```bash
npm install
```

3. Build:
```bash
npm run build
```

4. Configure Claude Desktop:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "Qlik Mcp App": {
      "command": "node",
      "args": ["/path/to/qlik-claude-mcp-app/dist/index.js", "--stdio"],
      "env": {
        "QLIK_TENANT_URL": "https://your-tenant.region.qlikcloud.com",
        "QLIK_API_KEY": "your-api-key"
      }
    }
  }
}
```

5. Restart Claude Desktop

## Usage Examples

### Search for apps
```
Search for apps containing "sales"
```

### View app details with lineage
```
Show me details for the Sales Dashboard app including its data lineage
```

### Get Insight Advisor charts
```
Show me revenue by region for the Sales app
Show revenue by category as a pie chart
Display profit vs revenue by customer as a scatter plot
Show sales data as a polar chart
Get product breakdown in table format
```

### Ask Qlik Answers
```
List the AI assistants and ask one about total revenue
```

### Check reload status
```
Show me recent reloads for the Sales app and trigger a new one
```

### View automations
```
List all automations and show the run history for the data refresh automation
```

### Make selections
```
Select "USA" in the Country field for the Sales app
```

### Generate an app
```
Generate a Qlik Sense app for tracking sales performance with revenue, profit, and customer metrics
```

## Development

### Scripts

```bash
# Build everything
npm run build

# Development mode (UI hot reload)
npm run dev

# Type checking
npx tsc --noEmit
```

### Adding a New Tool

1. **Add API method** to `QlikClient` class in `server.ts`:
```typescript
async myNewEndpoint(param: string): Promise<any> {
  return this.fetch(`/my-endpoint/${param}`);
}
```

2. **Register tool** with `registerAppTool()`:
```typescript
registerAppTool(server, "my_tool", {
  title: "My Tool",
  description: "Description for Claude",
  inputSchema: {
    param: z.string().describe("Parameter description"),
  },
  _meta: { ui: { resourceUri } },
}, async (args): Promise<CallToolResult> => {
  const result = await qlik.myNewEndpoint(args.param);
  return {
    content: [{ type: "text", text: `Result: ${result.name}` }],
    structuredContent: { type: "my-view", ...result },
  };
});
```

3. **Add UI component** in `mcp-app.tsx`:
```typescript
function MyView({ data }: { data: any }) {
  return (
    <Card header={{ label: "Category", title: data.name, gradient: "blue" }}>
      {/* Your UI here */}
    </Card>
  );
}
```

4. **Add route** in `ContentRouter`:
```typescript
const views: Record<string, React.ReactNode> = {
  // ... existing views
  "my-view": <MyView data={data} />,
};
```

5. **Add styles** in `global.css` if needed

### Tool Types

- **Tools with UI**: Use `registerAppTool()` - returns `structuredContent` for rendering
- **Tools without UI**: Use `server.registerTool()` - returns plain text only (like `ask_assistant`)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `QLIK_TENANT_URL` | Your Qlik Cloud tenant URL (e.g., `https://tenant.region.qlikcloud.com`) | Yes |
| `QLIK_API_KEY` | API key with appropriate permissions | Yes |

## API Permissions Required

The API key needs access to the following Qlik Cloud APIs:

- **Items** - Search and list items
- **Apps** - Read app details, trigger reloads
- **Spaces** - Read spaces and their contents
- **Users** - Read user information
- **Automations** - Read and execute automations
- **Alerts** - Read, trigger, and delete alerts
- **Qlik Answers** - Access assistants, create threads, invoke
- **Insight Advisor** - Get recommendations and chart data
- **AutoML** - Read experiments and deployments
- **Data Lineage** - Read lineage information
- **Datasets** - Read dataset details
- **Engine** - WebSocket access for selections and app generation

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ |
| Bundler | Bun |
| MCP SDK | @modelcontextprotocol/sdk |
| MCP Apps | @modelcontextprotocol/ext-apps |
| UI Framework | React 19 |
| Language | TypeScript |
| Charts | Chart.js + react-chartjs-2 |
| Icons | Lucide React |
| Qlik Engine | Enigma.js |
| Build Tool | Vite |
| Single File | vite-plugin-singlefile |

## How It Works

1. **Server Registration**: The MCP server registers tools with metadata linking them to a UI resource (`ui://qlik/mcp-app.html`)

2. **Tool Invocation**: When Claude calls a tool, the server fetches data from Qlik Cloud APIs

3. **UI Rendering**: The response includes `structuredContent` that Claude Desktop renders using the registered UI resource

4. **User Interaction**: The UI can call back to the server using `callTool()` or prompt Claude with `sendAction()`

5. **Engine Integration**: For advanced features like selections and app generation, the server opens WebSocket connections to Qlik Engine via Enigma.js

6. **Smart ID Resolution**: The lineage tool automatically resolves dataset item IDs to their QRI identifiers, allowing seamless lineage lookups from any item list

## License

MIT

## Author

Built with Claude Code
