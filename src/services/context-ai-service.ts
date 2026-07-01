import { App, requestUrl } from "obsidian"
import { CloudNodeMeta, CloudDiskType, LLMConfig, CanvasAIContext } from "../types"
import { CanvasService } from "./canvas-service"
import { SpatialSemanticEncoder } from "./spatial-semantic-encoder"
import { SyncVaultBridge } from "./sync-vault-bridge"

const META_COMMENT_RE = /<!--\s*meta:\s*(\{.+?\})\s*-->/

const SYSTEM_PROMPT = `你是一个 Canvas 画布助手。你可以分析画布上的节点内容、空间布局和连线关系。

你可以使用以下工具：
- read_file: 读取 vault 中指定文件的内容。当节点只提供了文件路径而没有具体内容时，你可以调用此工具来获取文件内容。
- read_cloud_file: 读取云盘（百度网盘、阿里云盘、夸克网盘、OneDrive 等）中指定文件的内容。参数包括 cloudType（云盘类型: baidu/aliyun/quark/onedrive）、path（云盘中的文件路径）、maxLength（可选，最大读取字符数）。当节点标记为"云盘文件"时，你应该调用此工具读取文件的实际内容。`

interface LLMMessage {
  role: string
  content: string
  name?: string
}

interface LLMToolDef {
  type: string
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface ToolCallRaw {
  function: {
    name: string
    arguments: string | Record<string, string>
  }
}

const TOOLS: LLMToolDef[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取 vault 中指定文件的内容。传入文件的完整 vault 路径。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "文件在 vault 中的相对路径，例如 Product/ContextCanvas PRD.md",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_cloud_file",
      description: "读取云盘（百度网盘、阿里云盘、夸克网盘、OneDrive 等）中指定文件的内容。传入云盘类型和文件路径。",
      parameters: {
        type: "object",
        properties: {
          cloudType: {
            type: "string",
            enum: ["baidu", "aliyun", "quark", "onedrive"],
            description: "云盘类型",
          },
          path: {
            type: "string",
            description: "文件在云盘中的完整路径",
          },
          maxLength: {
            type: "number",
            description: "可选，读取的最大字符数，默认 50000",
          },
        },
        required: ["cloudType", "path"],
      },
    },
  },
]

interface ToolCall {
  name: string
  arguments: Record<string, string>
}

interface LLMResponse {
  content: string | null
  toolCalls: ToolCall[] | null
}

type StreamChunk = (text: string) => void

function parseToolCallsFromRaw(raw: ToolCallRaw[]): ToolCall[] {
  return raw.map(tc => ({
    name: tc.function.name,
    arguments: typeof tc.function.arguments === "string"
      ? JSON.parse(tc.function.arguments) as Record<string, string>
      : tc.function.arguments,
  }))
}

export class ContextAIService {
  private spatialEncoder = new SpatialSemanticEncoder()

  constructor(
    private app: App,
    private canvasService: CanvasService,
    private syncVault: SyncVaultBridge,
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

      const meta = this.parseMeta(content)
      if (meta?.cloudType && meta?.filePath) {
        textContents.push(`[${label}] 云盘文件: ${meta.fileName} (${meta.cloudType}) 路径: ${meta.filePath}（可使用 read_cloud_file 工具读取内容）`)
        continue
      }

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

  async queryLLM(
    context: CanvasAIContext,
    question: string,
    config: LLMConfig,
    onChunk?: StreamChunk,
  ): Promise<string> {
    const messages = this.buildMessages(context, question)

    for (let round = 0; round < 5; round++) {
      let response: LLMResponse

      switch (config.provider) {
        case "local":
          response = onChunk
            ? await this.respondOllamaStream(messages, TOOLS, config, onChunk)
            : await this.respondOllama(messages, TOOLS, config)
          break
        case "openai":
          response = onChunk
            ? await this.respondOpenAIStream(messages, TOOLS, config, onChunk)
            : await this.respondOpenAI(messages, TOOLS, config)
          break
        default:
          response = await this.respondOllama(messages, null, config)
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const call of response.toolCalls) {
          const result = await this.executeTool(call)
          messages.push({ role: "tool", name: call.name, content: result })
        }
        continue
      }

      return response.content ?? "（无响应）"
    }

    return "（已达到最大工具调用轮次）"
  }

  private buildMessages(context: CanvasAIContext, question: string): LLMMessage[] {
    const contents = context.textContents
      .map((t, i) => {
        if (i === 0) return `--- 画布布局 ---\n${t}`
        return `--- 节点 ${i} ---\n${t}`
      })
      .join("\n\n")

    return [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `以下是我 Canvas 画布上选中的 ${context.nodeIds.length} 个节点的内容及其空间布局信息：\n\n${contents}\n\n请基于以上内容回答：${question}`,
      },
    ]
  }

  private async executeTool(call: ToolCall): Promise<string> {
    switch (call.name) {
      case "read_file": {
        const path = call.arguments.path
        if (!path) return "错误: 缺少 path 参数"
        const file = this.app.vault.getFileByPath(path)
        if (!file) return `错误: 文件不存在: ${path}`
        const content = await this.app.vault.read(file)
        return content.slice(0, 5000)
      }
      case "read_cloud_file": {
        const { cloudType, path: cloudPath, maxLength } = call.arguments
        if (!cloudType || !cloudPath) return "错误: 缺少 cloudType 或 path 参数"
        try {
          const content = await this.syncVault.readCloudFile(
            cloudPath,
            cloudType as CloudDiskType,
            maxLength ? Number(maxLength) : undefined,
          )
          return content
        } catch (e) {
          return `错误: 读取云盘文件失败: ${e instanceof Error ? e.message : String(e)}`
        }
      }
      default:
        return `错误: 未知工具: ${call.name}`
    }
  }

  private async respondOllama(messages: LLMMessage[], tools: LLMToolDef[] | null, config: LLMConfig): Promise<LLMResponse> {
    const url = config.endpoint || "http://localhost:11434/api/chat"
    const body = {
      model: config.model || "qwen2",
      messages,
      stream: false,
      options: { num_predict: 4096 },
      ...(tools ? { tools } : {}),
    }

    const resp = await requestUrl({
      url,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify(body),
    })

    const data = resp.json as { message: { content?: string; tool_calls?: ToolCallRaw[] } }
    const msg = data.message

    if (msg.tool_calls) {
      return { content: null, toolCalls: parseToolCallsFromRaw(msg.tool_calls) }
    }

    return { content: msg.content ?? null, toolCalls: null }
  }

  private async respondOllamaStream(
    messages: LLMMessage[],
    tools: LLMToolDef[] | null,
    config: LLMConfig,
    onChunk: StreamChunk,
  ): Promise<LLMResponse> {
    const url = config.endpoint || "http://localhost:11434/api/chat"
    const body = {
      model: config.model || "qwen2",
      messages,
      stream: true,
      options: { num_predict: 4096 },
      ...(tools ? { tools } : {}),
    }

    const resp = await window.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const reader = resp.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let fullContent = ""
    let toolCalls: ToolCall[] | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const data = JSON.parse(trimmed) as { done?: boolean; message?: { content?: string; tool_calls?: ToolCallRaw[] } }
          if (data.message?.content) {
            fullContent += data.message.content
            onChunk(data.message.content)
          }
          if (data.message?.tool_calls) {
            toolCalls = parseToolCallsFromRaw(data.message.tool_calls)
          }
          if (data.done) break
        } catch { /* skip malformed lines */ }
      }
    }

    if (toolCalls) return { content: null, toolCalls }
    return { content: fullContent, toolCalls: null }
  }

  private async respondOpenAI(messages: LLMMessage[], tools: LLMToolDef[] | null, config: LLMConfig): Promise<LLMResponse> {
    const url = config.endpoint || "https://api.openai.com/v1/chat/completions"
    const headers: Record<string, string> = {}
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`
    const body = {
      model: config.model || "gpt-4o-mini",
      messages,
      max_tokens: 4096,
      ...(tools ? { tools } : {}),
    }

    const resp = await requestUrl({
      url,
      method: "POST",
      contentType: "application/json",
      headers,
      body: JSON.stringify(body),
    })

    const data = resp.json as { choices?: Array<{ message?: { content?: string; tool_calls?: ToolCallRaw[] } }> }
    const choice = data.choices?.[0]
    const msg = choice?.message

    if (msg?.tool_calls) {
      return { content: null, toolCalls: parseToolCallsFromRaw(msg.tool_calls) }
    }

    return { content: msg?.content ?? null, toolCalls: null }
  }

  private async respondOpenAIStream(
    messages: LLMMessage[],
    tools: LLMToolDef[] | null,
    config: LLMConfig,
    onChunk: StreamChunk,
  ): Promise<LLMResponse> {
    const url = config.endpoint || "https://api.openai.com/v1/chat/completions"
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`
    const body = {
      model: config.model || "gpt-4o-mini",
      messages,
      stream: true,
      max_tokens: 4096,
      ...(tools ? { tools } : {}),
    }

    const resp = await window.fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    const reader = resp.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let fullContent = ""
    let toolCalls: ToolCall[] | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith("data: ")) continue
        const json = trimmed.slice(6)
        if (json === "[DONE]") break
        try {
          const data = JSON.parse(json) as { choices?: Array<{ delta?: { content?: string; tool_calls?: ToolCallRaw[] } }> }
          const delta = data.choices?.[0]?.delta
          if (!delta) continue
          if (delta.content) {
            fullContent += delta.content
            onChunk(delta.content)
          }
          if (delta.tool_calls) {
            toolCalls = parseToolCallsFromRaw(delta.tool_calls)
          }
        } catch { /* skip */ }
      }
    }

    if (toolCalls) return { content: null, toolCalls }
    return { content: fullContent, toolCalls: null }
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
}
