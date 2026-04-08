# xcodegen-mcp

An MCP (Model Context Protocol) server that wraps [XcodeGen](https://github.com/yonaskolb/XcodeGen), allowing AI assistants like Claude Code to generate and manage Xcode projects.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)

## Setup with Claude Code

### Option A: Streamable HTTP (recommended for remote/container use)

Start the server on your Mac, pointing it at your project:

```bash
npx github:youruser/xcodegen-mcp -- --http --project-dir /Users/you/Projects/MyApp
```

By default it listens on port 8080. Set `PORT` to change it:

```bash
PORT=3000 npx github:youruser/xcodegen-mcp -- --http --project-dir /Users/you/Projects/MyApp
```

Then configure Claude Code to connect:

```bash
claude mcp add xcodegen --transport http http://localhost:8080/mcp
```

Or in `.claude/settings.json`:

```json
{
  "mcpServers": {
    "xcodegen": {
      "type": "streamable-http",
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

### Option B: stdio (local only)

```bash
claude mcp add xcodegen -- npx github:youruser/xcodegen-mcp
```

## Path handling

When the MCP server runs on a different machine (or the host of a container), the caller may not know the correct host-side paths. Use the `get_host_info` tool to discover the project directory before calling other tools.

The `--project-dir` flag sets the default project directory for all tools. If omitted, it defaults to the server's current working directory.

## Tools

| Tool | Description |
|------|-------------|
| `get_host_info` | Returns the host machine's project directory path. Call this first to discover correct paths. |
| `generate` | Run `xcodegen generate` to create an Xcode project from a spec |
| `dump` | Output the fully resolved spec as JSON or YAML |
| `read_spec` | Read the raw `project.yml` file |
| `cache` | Write the XcodeGen cache for faster future generations |
| `version` | Return the installed XcodeGen version |

## Local Development

```bash
npm install
npm run build
npm start
```
