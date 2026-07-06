import { requestUrl } from "obsidian"
import { t } from "../i18n"
import { CloudFileEntry, CloudDiskType, CloudFileCategory } from "../types"

interface RawCloudEntry {
  path?: string
  name?: string
  isFolder?: boolean
  type?: string
  id?: string
  fsid?: string
  size?: number
  modified?: string | number | Date
}

interface MCPResult {
  files?: RawCloudEntry[]
  pagination?: { total?: number; hasMore?: boolean }
  tools?: Array<{ name: string }>
  content?: Array<{ type: string; text: string }>
}

export interface ListFilesResult {
  files: CloudFileEntry[]
  total: number
  hasMore: boolean
}

export class SyncVaultBridge {
  private endpoint = "http://127.0.0.1:3002/message"
  private ready = false

  
  async ensureReady(): Promise<boolean> {
    if (this.ready) return true
    return this.detect()
  }

  async listFiles(
    path: string,
    cloudType: CloudDiskType,
    limit = 100,
    offset = 0
  ): Promise<ListFilesResult> {
    const mcpResp = await this.post("list_cloud_files", { cloudType, path, limit, offset })
    const data = this.parse(mcpResp)
    if (!data?.files) return { files: [], total: 0, hasMore: false }
    return {
      files: data.files.map(f => this.mapEntry(f, cloudType)),
      total: data.pagination?.total ?? data.files.length,
      hasMore: data.pagination?.hasMore ?? false,
    }
  }

  async searchFiles(
    query: string,
    cloudType: CloudDiskType,
    limit = 50,
    offset = 0
  ): Promise<ListFilesResult> {
    const mcpResp = await this.post("search_cloud_files", { query, cloudType, limit, offset })
    const data = this.parse(mcpResp)
    if (!data?.files) return { files: [], total: 0, hasMore: false }
    return {
      files: data.files.map(f => this.mapEntry(f, cloudType)),
      total: data.pagination?.total ?? data.files.length,
      hasMore: data.pagination?.hasMore ?? false,
    }
  }

  getCategory(file: CloudFileEntry): CloudFileCategory {
    if (file.isdir) return "folder"
    const ext = file.name.split(".").pop()?.toLowerCase() || ""
    const videoExts = ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm"]
    const audioExts = ["mp3", "wav", "flac", "aac", "ogg", "wma", "m4a"]
    const imageExts = ["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp", "ico"]
    if (videoExts.includes(ext)) return "video"
    if (audioExts.includes(ext)) return "audio"
    if (imageExts.includes(ext)) return "image"
    const pdfExts = ["pdf"]
    const ebookExts = ["epub", "mobi", "azw3", "azw", "djvu", "fb2", "cbr", "cbz", "prc", "lit"]
    if (pdfExts.includes(ext)) return "ebook"
    if (ebookExts.includes(ext)) return "ebook"
    return "other"
  }

  async getDownloadUrl(file: CloudFileEntry): Promise<string | undefined> {
    return undefined
  }

  async readCloudFile(path: string, cloudType: CloudDiskType, maxLength?: number): Promise<string> {
    const result = await this.post("read_cloud_file", { path, cloudType, maxLength })
    if (result.content?.[0]?.type === "text") {
      return result.content[0].text
    }
    throw new Error(t("readFailed", "cloud file"))
  }

  async post(method: string, args: Record<string, unknown>): Promise<MCPResult> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: method, arguments: args },
    })

    return this.postRequestUrl(this.endpoint, body)
  }

  private async postRequestUrl(url: string, body: string): Promise<MCPResult> {
    const resp = await requestUrl({
      url,
      method: "POST",
      contentType: "application/json",
      body,
      throw: false,
    })

    if (resp.status === 0) throw new Error(t("mcpConnectFailed"))
    if (resp.status !== 200) throw new Error(t("mcpError", String(resp.status)))

    const mcpResp = resp.json as { error?: { message: string }; result?: MCPResult }
    if (mcpResp?.error) throw new Error(mcpResp.error.message)
    if (!mcpResp?.result) throw new Error(t("mcpEmpty"))

    return mcpResp.result
  }

  private async detect(): Promise<boolean> {
    for (const url of [
      "http://127.0.0.1:3002/message",
    ]) {
      try {
        const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
        const mcpResp = await this.postRequestUrl(url, body)
        if (mcpResp?.tools) {
          this.endpoint = url
          this.ready = true
          return true
        }
      } catch {
        continue
      }
    }
    return false
  }

  private parse(result: MCPResult): MCPResult | null {
    if (!result) return null
    if (result.content?.[0]?.type === "text") {
      try { return JSON.parse(result.content[0].text) as MCPResult } catch { return null }
    }
    return result
  }

  private mapEntry(f: RawCloudEntry, cloudType: CloudDiskType): CloudFileEntry {
    return {
      cloudType,
      path: f.path || "",
      name: f.name || f.path?.split("/").pop() || "",
      isdir: f.isFolder || f.type === "folder" || false,
      fsid: f.id || f.fsid || "",
      size: f.size || 0,
      ctime: 0,
      mtime: f.modified ? new Date(f.modified).getTime() / 1000 : 0,
      mimetype: f.type || "",
    }
  }
}
