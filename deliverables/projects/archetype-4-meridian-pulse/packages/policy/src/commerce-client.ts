/**
 * MCP client to the commerce server.
 *
 * The policy service is itself an MCP server (facing the gateway) AND an MCP
 * client (facing the real commerce server). It spawns mcp-commerce as a stdio
 * child and calls its tools to (a) read the context a tier decision needs and
 * (b) forward writes that policy permits. This keeps the commerce server the
 * single system of record — the policy service never touches its DB directly.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface MarginInfo {
  sku: string;
  cost: number;
  price: number;
  marginPct: number;
}

export interface SetPriceResult {
  success: boolean;
  sku: string;
  previousPrice: number;
  newPrice: number;
  error?: string;
}

function parseToolText<T>(result: { content?: { type: string; text?: string }[] }): T {
  const text = result.content?.[0]?.text ?? "{}";
  return JSON.parse(text) as T;
}

export class CommerceClient {
  private client: Client | null = null;

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly env: Record<string, string> = {},
  ) {}

  async connect(): Promise<void> {
    const transport = new StdioClientTransport({
      command: this.command,
      args: this.args,
      env: { ...process.env, ...this.env } as Record<string, string>,
    });
    this.client = new Client({ name: "meridian-policy", version: "0.1.0" });
    await this.client.connect(transport);
  }

  private ensure(): Client {
    if (!this.client) throw new Error("CommerceClient not connected");
    return this.client;
  }

  async getMargin(sku: string): Promise<MarginInfo | null> {
    const r = await this.ensure().callTool({ name: "get_margin", arguments: { sku } });
    if ((r as { isError?: boolean }).isError) return null;
    return parseToolText<MarginInfo>(r as never);
  }

  async getCurrentPrice(sku: string): Promise<{ sku: string; price: number } | null> {
    const r = await this.ensure().callTool({ name: "get_current_price", arguments: { sku } });
    if ((r as { isError?: boolean }).isError) return null;
    return parseToolText(r as never);
  }

  async setPrice(sku: string, newPrice: number, reason: string): Promise<SetPriceResult> {
    const r = await this.ensure().callTool({
      name: "set_price",
      arguments: { sku, newPrice, reason },
    });
    return parseToolText<SetPriceResult>(r as never);
  }

  /** Pass-through for the read tools the agent still needs (proxied 1:1). */
  async callRaw(name: string, args: Record<string, unknown>) {
    return this.ensure().callTool({ name, arguments: args });
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = null;
  }
}
