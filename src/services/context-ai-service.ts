import { App, requestUrl } from "obsidian"
import { CloudNodeMeta, LLMConfig, CanvasAIContext, TimestampNote } from "../types"
import { CanvasService } from "./canvas-service"
import { SyncVaultBridge } from "./sync-vault-bridge"
import { SpatialSemanticEncoder } from "./spatial-semantic-encoder"

const META_COMMENT_RE = /<!--\s*meta:\s*(\{.+?\})\s*-->/

export class ContextAIService {
  private spatialEncoder = new SpatialSemanticEncoder()

  constructor(
    private app: App,
    private canvasService: CanvasService,
    private syncVault: SyncVaultBridge
  ) {}

  async buildContext(nodeIds: string[]): Promise<CanvasAIContext> {
    const data = await this.canvasService.getData()
    if (!data) return { nodeIds: [], textContents: [], totalTokens: 0 }

    const relevantNodes = nodeIds.length > 0
      ? data.nodes.filter(n => nodeIds.includes(n.id))
      : data.nodes

    const relevantEdges = data.edges.filter(e =>
      relevantNodes.some(n => n.id === e.fromNode) &&
      relevantNodes.some(n => n.id === e.toNode)
    )

    const spatial = this.spatialEncoder.encode({ nodes: relevantNodes, edges: relevantEdges })

    const textContents: string[] = [spatial.layoutSummary]

    for (const node of relevantNodes) {
      const label = node.label || node.file?.replace(/\.md$/, "").split("/").pop() || "未命名"

      if (node.type === "file" && node.file) {
        textContents.push(`[${label}] 文件: ${node.file}`)
        continue
      }

      const content = node.text ?? node.content
      if (!content) continue

      const text = this.extractNodeContent(content)
      if (text) {
        textContents.push(`[${label}] ${text}`)
      }
    }

    const estimateTokens = (s: string) => Math.ceil(s.length / 4)
    return {
      nodeIds: relevantNodes.map(n => n.id),
      textContents,
      totalTokens: textContents.reduce((sum, t) => sum + estimateTokens(t), 0),
    }
  }

  async queryLLM(context: CanvasAIContext, question: string, config: LLMConfig): Promise<string> {
    const prompt = this.buildPrompt(context, question)

    console.debug(`Prompt: ${prompt}`);

    switch (config.provider) {
      case "openai":
        return this.queryOpenAI(prompt, config)
      case "local":
        return this.queryOllama(prompt, config)
      case "gemini":
        return this.queryGemini(prompt, config)
      case "claude":
        return this.queryClaude(prompt, config)
    }
  }

  private extractNodeContent(content: string): string | null {
    const meta = this.parseMeta(content)

    if (meta) {
      const icons: Record<string, string> = {
        image: "[Image",
        video: "[Video",
        audio: "[Audio",
        pdf: "[PDF",
      }
      const prefix = icons[meta.category] || "[File"
      return `${prefix}: ${meta.fileName}]`
    }

    const clean = content.replace(META_COMMENT_RE, "").trim()
    return clean || null
  }

  private parseMeta(content: string): CloudNodeMeta | null {
    const match = content.match(META_COMMENT_RE)
    if (!match) return null
    try {
      return JSON.parse(match[1]) as CloudNodeMeta
    } catch {
      return null
    }
  }

  private buildPrompt(context: CanvasAIContext, question: string): string {
    const contents = context.textContents
      .map((t, i) => {
        if (i === 0) return `--- 画布布局 ---\n${t}`
        return `--- 节点 ${i} ---\n${t}`
      })
      .join("\n\n")

    return `以下是我 Canvas 画布上选中的 ${context.nodeIds.length} 个节点的内容及其空间布局信息：\n\n${contents}\n\n请基于以上内容（包括空间布局）回答：${question}`
  }

  private async queryOpenAI(prompt: string, config: LLMConfig): Promise<string> {
    const url = config.endpoint || "https://api.openai.com/v1/chat/completions"
    const headers: Record<string, string> = {}
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`

    const resp = await requestUrl({
      url,
      method: "POST",
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        model: config.model || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4096,
      }),
    })

    return resp.json.choices?.[0]?.message?.content || "（无响应）"
  }

  private async queryOllama(prompt: string, config: LLMConfig): Promise<string> {
    const url = config.endpoint || "http://localhost:11434/api/chat"

    console.log("[Context Canvas] Ollama request URL:", url, "model:", config.model)

    try {
      const resp = await requestUrl({
        url,
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
          model: config.model || "qwen2",
          messages: [{ role: "user", content: prompt }],
          stream: false,
          options: { num_predict: 4096 },
        }),
      })

      return resp.json.message?.content || "（无响应）"
    } catch (e) {
      console.error("[Context Canvas] Ollama error:", e)
      throw e
    }
  }

  private async queryGemini(prompt: string, config: LLMConfig): Promise<string> {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model || "gemini-2.0-flash"}:generateContent?key=${config.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    const data = await resp.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "（无响应）"
  }

  private async queryClaude(prompt: string, config: LLMConfig): Promise<string> {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model || "claude-3-haiku-20240307",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    })
    const data = await resp.json()
    return data.content?.[0]?.text || "（无响应）"
  }
}
