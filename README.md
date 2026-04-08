# xcodegen-mcp

An MCP (Model Context Protocol) server that wraps [XcodeGen](https://github.com/yonaskolb/XcodeGen), allowing AI assistants like Claude Code to generate and manage Xcode projects.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)

## Setup with Claude Code

Since this is a private repo, you can run it directly via `npx` with no install step:

```bash
claude mcp add xcodegen -- npx github:youruser/xcodegen-mcp
```

Or add it manually to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "xcodegen": {
      "command": "npx",
      "args": ["github:youruser/xcodegen-mcp"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
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
