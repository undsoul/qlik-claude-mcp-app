# Qlik Cloud MCP App for Claude Desktop

A full-featured Model Context Protocol (MCP) server that connects Claude Desktop to Qlik Cloud, providing rich interactive UI components for managing apps, spaces, users, automations, alerts, AI assistants, and more.

## Features

### 58 MCP Tools with Rich UI

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
| **Data** | `lineage`, `dataset`, `dataset_profile` | Data lineage, dataset details, profiling |
| **Selections** | `select`, `clear_selections`, `selections`, `fields`, `field_values` | Interactive app selections via Engine API |
| **Sheets** | `list_sheets`, `sheet_details` | List app sheets and view objects |
| **Master Items** | `master_dimensions`, `master_measures` | Explore master dimensions and measures |
| **Bookmarks** | `bookmarks`, `apply_bookmark` | List and apply bookmarks |
| **Variables** | `variables`, `set_variable` | List and modify app variables |
| **Stories** | `stories` | List data stories |
| **Script** | `app_script` | View app load script with syntax highlighting |
| **Connections** | `app_connections`, `data_connections`, `data_connection_details` | App and tenant-level data connections |
| **Glossary** | `glossaries`, `glossary_details`, `glossary_term`, `create_glossary_term`, `delete_glossary_term` | Business glossary management |
| **Data Products** | `data_products`, `data_product_details` | Data product catalog |

### UI Components

The MCP App renders beautiful, interactive UI components in Claude Desktop:

- **Unified Design System**: Consistent `results-panel` style with green accent headers across all views
- **Grid Views**: Apps, spaces, users, automations, alerts, assistants, sheets, glossaries, data products, connections with search filters, sorting, and pagination
- **Detail Views**: Rich information panels for apps, sheets, bookmarks, variables, stories, experiments, deployments
- **Charts**: Real-time Insight Advisor charts (bar, line, pie, scatter, polar, radar, doughnut, area)
- **Data Tables**: Multi-column tables with dimensions and measures
- **Timelines**: Reload history, automation runs with status indicators
- **Lineage Views**:
  - App data model with tables, rows, fields statistics
  - Graph-based upstream/downstream lineage with nodes and edges
- **Script Editor**:
  - Vertical tab navigation for script sections
  - Full Qlik syntax highlighting (keywords, functions, variables, strings, comments)
  - Hidden `///$tab` markers with preserved line numbers
- **Dataset Profiling**: Field statistics with type badges, distinct values, tags
- **Master Items**: Dimensions and measures with expressions
- **Interactive Elements**: Action buttons, 3-dot menus, bookmark apply, variable editing
- **Theme Support**: Automatic dark/light theme via MCP SDK

### Smart Chart Type Detection

Ask for specific chart types in natural language:

```
"Show revenue by region as a polar chart"
"Display sales by category in a pie chart"
"Revenue vs profit by customer as a scatter plot"
"Product details as a table"
```

Supported chart types: bar, line, pie, doughnut, polar, radar, scatter, area, treemap, table

### Engine API Integration

Full Qlik Engine API support via WebSocket (Enigma.js):

- **Selections**: Select values by field name with automatic element number resolution
- **Field Values**: Browse all values in any field
- **Bookmarks**: Apply bookmarks to restore selection states
- **Variables**: Read and update app variables
- **Script**: Full load script with tab parsing
- **Sheets**: List sheets and their objects
- **Master Items**: Dimensions and measures with formulas

## Architecture

```
qlik-claude-mcp-app/
├── server.ts              # MCP Server - API client & tool definitions
├── main.ts                # Entry point - stdio transport
├── mcp-app.html           # HTML template for UI
├── src/
│   ├── mcp-app.tsx        # React UI components
│   ├── global.css         # Global styles with theme support
│   └── vite-env.d.ts      # TypeScript environment
├── dist/                  # Build output
│   ├── index.js           # Bundled entry point
│   ├── server.js          # Bundled server
│   └── mcp-app.html       # Single-file UI bundle (~1MB)
├── package.json
├── tsconfig.json
├── tsconfig.server.json
└── vite.config.ts
```

### Key Components

#### server.ts - MCP Server

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
  - Data Lineage API (graph with nodes/edges)
  - Datasets API (details, profile)
  - Glossary API (glossaries, terms, categories)
  - Data Connections API (tenant and app level)
  - Engine API via Enigma.js (selections, field values, sheets, master items, bookmarks, variables, stories, script, app generation)

- **Tool Registrations**: 58 tools with Zod schemas for input validation
- **Auto-Pagination**: Fetches all results using cursor-based pagination
- **WebSocket Integration**: Enigma.js for Qlik Engine communication
- **Smart ID Resolution**: Automatic dataset item ID to QRI resolution

#### mcp-app.tsx - React UI

Comprehensive UI components using MCP SDK v1.0.1:

- **Theme Hooks**: `useHostStyleVariables()`, `useHostFonts()`, `useDocumentTheme()`
- **Grid Components**: AppsGrid, SpacesGrid, UsersGrid, AutomationsGrid, AlertsGrid, AssistantsGrid, ExperimentsGrid, DeploymentsGrid, DatasetsGrid, SheetsGrid, GlossariesGrid, DataProductsGrid, DataConnectionsGrid
- **Detail Components**: AppDetail, SpaceDetail, UserDetail, AutomationDetail, AlertDetail, AssistantDetail, ExperimentDetail, DeploymentDetail, DatasetDetail, SheetDetail, GlossaryDetail, GlossaryTermView, DataProductDetail, DataConnectionDetail
- **Visualization**: ChartView (8 chart types), LineageView (graph), AppLineageView (tables), DatasetProfileView (field statistics)
- **App Content**: SheetsGrid, MasterDimensionsView, MasterMeasuresView, BookmarksView, VariablesView, StoriesView, AppScriptView (with syntax highlighting), AppConnectionsView, FieldValuesView, SelectionsPanel
- **Interactive**: ReloadsTimeline, AutomationRuns, ItemMenu (3-dot context menu)
- **Common**: Pagination, StatusBadge, ErrorCard, ActionSuccess
- **40-color palette** for rich pie/doughnut/polar/radar charts

#### global.css - Styles

Complete styling system with:
- Dark and light theme support
- Unified `results-panel` design with green accent
- Qlik script syntax highlighting (keywords, functions, variables, strings, comments, data types)
- Vertical script tabs navigation
- Grid and list views
- Chart styling
- Status badges and type indicators
- Responsive design
- Animations and transitions

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
Show me field values for Product Category in the Sales app
Clear all selections in the Sales app
```

### View app script
```
Show me the load script for the Sales app
```

### Generate an app
```
Generate a Qlik Sense app for tracking sales performance with revenue, profit, and customer metrics
```

### Dataset profiling
```
Show me the profile for dataset 697b4aac376930e8e2843ee9
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
    <div className="results-panel">
      <div className="results-header">
        <span className="results-count">Title</span>
        <span className="results-badge">Badge</span>
      </div>
      {/* Your content here */}
    </div>
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
- **Tools without UI**: Use `server.registerTool()` - returns plain text only

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
- **Datasets** - Read dataset details and profiles
- **Engine** - WebSocket access for selections, fields, bookmarks, variables, script

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ |
| Bundler | Bun |
| MCP SDK | @modelcontextprotocol/sdk |
| MCP Apps | @modelcontextprotocol/ext-apps v1.0.1 |
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

4. **Theme Integration**: The UI automatically adapts to Claude Desktop's theme using MCP SDK hooks

5. **User Interaction**: The UI can call back to the server using `callTool()` or prompt Claude with `sendAction()`

6. **Engine Integration**: For advanced features like selections, the server opens WebSocket connections to Qlik Engine via Enigma.js with automatic element number resolution

7. **Smart ID Resolution**: The lineage tool automatically resolves dataset item IDs to their QRI identifiers

## Recent Updates

- **Unified Design**: All views now use consistent `results-panel` style with green accent
- **Script Tabs**: Vertical tab navigation with `///$tab` marker parsing
- **Syntax Highlighting**: Full Qlik script syntax highlighting (50+ keyword categories)
- **Engine API Selections**: Fixed `select` tool using proper element number resolution
- **Dataset Profile**: Field statistics table with type badges and tags
- **Lineage Tables**: Show app data model with tables, rows, and field counts
- **Theme Support**: Automatic dark/light mode via MCP SDK v1.0.1

## License

MIT

## Author

Built with Claude Code
