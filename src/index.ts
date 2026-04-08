#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";

const execFileAsync = promisify(execFile);

/**
 * Run xcodegen with the given arguments and return stdout/stderr.
 */
async function runXcodegen(
  args: string[],
  cwd?: string
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync("xcodegen", args, {
      cwd: cwd ?? process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    });
    return result;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `xcodegen failed:\n${e.stderr ?? e.message ?? "unknown error"}\n${e.stdout ?? ""}`
    );
  }
}

/**
 * Creates an McpServer with all xcodegen tools registered.
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "xcodegen",
    version: "1.0.0",
  });

  server.registerTool("generate", {
    title: "Generate Xcode Project",
    description:
      "Runs `xcodegen generate` to create an Xcode project from a project spec (project.yml). " +
      "Returns xcodegen's output including any warnings.",
    inputSchema: {
      specPath: z
        .string()
        .optional()
        .describe(
          "Path to the project spec file (project.yml). Defaults to 'project.yml' in the project directory."
        ),
      projectDirectory: z
        .string()
        .optional()
        .describe(
          "The directory containing the project spec and source files. Defaults to the current working directory."
        ),
      projectName: z
        .string()
        .optional()
        .describe("Override the project name from the spec."),
      useCache: z
        .boolean()
        .optional()
        .describe(
          "If true, use caching to avoid regenerating when nothing has changed."
        ),
    },
    annotations: {
      title: "Generate Xcode Project",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ specPath, projectDirectory, projectName, useCache }) => {
    const args = ["generate"];
    if (specPath) args.push("--spec", specPath);
    if (projectDirectory) args.push("--project-directory", projectDirectory);
    if (projectName) args.push("--project", projectName);
    if (useCache) args.push("--use-cache");
    args.push("--no-env");

    const { stdout, stderr } = await runXcodegen(args, projectDirectory);
    return {
      content: [
        {
          type: "text" as const,
          text: `${stdout}${stderr ? "\n--- stderr ---\n" + stderr : ""}`,
        },
      ],
    };
  });

  server.registerTool("dump", {
    title: "Dump Resolved Spec",
    description:
      "Runs `xcodegen dump` to output the fully resolved project spec as JSON or YAML. " +
      "Useful for inspecting how XcodeGen interprets the spec after resolving includes and defaults.",
    inputSchema: {
      specPath: z
        .string()
        .optional()
        .describe("Path to the project spec file."),
      projectDirectory: z
        .string()
        .optional()
        .describe("The project directory."),
      type: z
        .enum(["json", "yaml", "parsed"])
        .optional()
        .describe("Output format. Defaults to 'json'."),
    },
  }, async ({ specPath, projectDirectory, type }) => {
    const args = ["dump"];
    if (specPath) args.push("--spec", specPath);
    if (projectDirectory) args.push("--project-directory", projectDirectory);
    args.push("--type", type ?? "json");

    const { stdout } = await runXcodegen(args, projectDirectory);
    return {
      content: [{ type: "text" as const, text: stdout }],
    };
  });

  server.registerTool("read_spec", {
    title: "Read Project Spec",
    description:
      "Reads the raw XcodeGen project spec file (project.yml) and returns its contents. " +
      "Use this to inspect or understand the current project configuration before making changes.",
    inputSchema: {
      specPath: z
        .string()
        .optional()
        .describe(
          "Path to the spec file. Defaults to 'project.yml' in the project directory."
        ),
      projectDirectory: z
        .string()
        .optional()
        .describe("The project directory. Defaults to cwd."),
    },
    annotations: {
      title: "Read Project Spec",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async ({ specPath, projectDirectory }) => {
    const dir = projectDirectory ?? process.cwd();
    const file = specPath ?? path.join(dir, "project.yml");
    const content = await readFile(file, "utf-8");
    return {
      content: [{ type: "text" as const, text: content }],
    };
  });

  server.registerTool("cache", {
    title: "Manage XcodeGen Cache",
    description:
      "Runs `xcodegen cache` to write the cache for the current spec. " +
      "This is useful after generating to speed up future generations.",
    inputSchema: {
      specPath: z.string().optional().describe("Path to the project spec file."),
      projectDirectory: z.string().optional().describe("The project directory."),
    },
  }, async ({ specPath, projectDirectory }) => {
    const args = ["cache"];
    if (specPath) args.push("--spec", specPath);
    if (projectDirectory) args.push("--project-directory", projectDirectory);

    const { stdout, stderr } = await runXcodegen(args, projectDirectory);
    return {
      content: [
        {
          type: "text" as const,
          text: `${stdout}${stderr ? "\n--- stderr ---\n" + stderr : ""}`,
        },
      ],
    };
  });

  server.registerTool("version", {
    title: "XcodeGen Version",
    description: "Returns the installed XcodeGen version.",
    annotations: {
      title: "XcodeGen Version",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  }, async () => {
    const { stdout } = await runXcodegen(["version"]);
    return {
      content: [{ type: "text" as const, text: stdout.trim() }],
    };
  });

  return server;
}

// --- Start the server ---
async function main() {
  const mode = process.argv.includes("--http") ? "http" : "stdio";

  if (mode === "http") {
    const port = parseInt(process.env["PORT"] ?? "8080", 10);
    const sessions = new Map<string, StreamableHTTPServerTransport>();

    const httpServer = createServer(async (req, res) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (req.method === "POST" && req.url === "/mcp") {
        // Existing session
        if (sessionId && sessions.has(sessionId)) {
          const transport = sessions.get(sessionId)!;
          await transport.handleRequest(req, res);
          return;
        }

        // New session
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
          }
        };

        const sessionServer = createMcpServer();
        await sessionServer.connect(transport);
        await transport.handleRequest(req, res);

        if (transport.sessionId) {
          sessions.set(transport.sessionId, transport);
        }
      } else if (req.method === "GET" && req.url === "/mcp") {
        if (sessionId && sessions.has(sessionId)) {
          const transport = sessions.get(sessionId)!;
          await transport.handleRequest(req, res);
          return;
        }
        res.writeHead(400).end("No valid session. Send an initialize request first.");
      } else if (req.method === "DELETE" && req.url === "/mcp") {
        if (sessionId && sessions.has(sessionId)) {
          const transport = sessions.get(sessionId)!;
          await transport.handleRequest(req, res);
          return;
        }
        res.writeHead(404).end("Session not found.");
      } else {
        res.writeHead(404).end("Not found");
      }
    });

    httpServer.listen(port, () => {
      console.error(`XcodeGen MCP server listening on http://0.0.0.0:${port}/mcp`);
    });
  } else {
    const mcpServer = createMcpServer();
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error("XcodeGen MCP server running on stdio");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
