import { Notice, requestUrl } from "obsidian"
import { t } from "../i18n"
import { CloudFileEntry, CloudDiskType, CloudFileCategory } from "../types"

const TIMEOUT = 5000

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
    limit = 50,
    offset = 0
  ): Promise<{ files: CloudFileEntry[]; total: number }> {
    const mcpResp = await this.post("list_cloud_files", { cloudType, path, limit, offset })
    const data = this.parse(mcpResp)
    if (!data?.files) return { files: [], total: 0 }
    return {
      files: data.files.map((f: any) => this.mapEntry(f, cloudType)),
      total: data.pagination?.total ?? data.files.length,
    }
  }

  async searchFiles(
    query: string,
    cloudType: CloudDiskType,
    limit = 20,
    offset = 0
  ): Promise<CloudFileEntry[]> {
    const mcpResp = await this.post("search_cloud_files", { query, cloudType, limit, offset })
    const data = this.parse(mcpResp)
    if (!data?.files) return []
    return data.files.map((f: any) => this.mapEntry(f, cloudType))
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
    if (ext === "pdf") return "pdf"
    return "other"
  }

  async getDownloadUrl(file: CloudFileEntry): Promise<string | undefined> {
    return undefined
  }

  private async post(method: string, args: any): Promise<any> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: method, arguments: args },
    })

    console.debug(`[ContextCanvas] POST ${method}`, args)

    // try {
    //   const result = await this.postFetch(this.endpoint, body)
    //   console.debug(`[ContextCanvas] fetch OK ${method}`, result)
    //   return result
    // } catch (fetchErr) {
    //   console.debug(`[ContextCanvas] fetch failed, trying requestUrl:`, fetchErr)
    const result = await this.postRequestUrl(this.endpoint, body)
    console.debug(`[ContextCanvas] requestUrl OK ${method}`, result)
    return result
    // }
  }

  private async postFetch(url: string, body: string): Promise<any> {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT)

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      })

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

      const json = await resp.json()
      if (json?.error) throw new Error(json.error.message)
      if (!json?.result) throw new Error("MCP 返回空")

      return json.result
    } finally {
      window.clearTimeout(timer)
    }
  }

  private async postRequestUrl(url: string, body: string): Promise<any> {
    const resp = await requestUrl({
      url,
      method: "POST",
      contentType: "application/json",
      body,
      throw: false,
    })

    if (resp.status === 0) throw new Error(t("mcpConnectFailed"))
    if (resp.status !== 200) throw new Error(t("mcpError", String(resp.status)))

    const mcpResp = resp.json as any
    if (mcpResp?.error) throw new Error(mcpResp.error.message)
    if (!mcpResp?.result) throw new Error(t("mcpEmpty"))

    return mcpResp.result
  }

  private async detect(): Promise<boolean> {
    for (const url of [
      "http://127.0.0.1:3002/message",
      // "http://127.0.0.1:3000/message",
      // "http://localhost:3002/message",
      // "http://localhost:3000/message",
    ]) {
      try {
        const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })

        let respJson: any

        // try {
        //   const result = await this.postFetch(url, body)
        //   respJson = result
        // } catch {
        const result = await this.postRequestUrl(url, body)
        respJson = result
        // }

        if (respJson?.tools) {
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

  private parse(result: any): any {
    if (!result) return null
    if (result.content?.[0]?.type === "text") {
      try { return JSON.parse(result.content[0].text) } catch { return result.content[0].text }
    }
    return result
  }

  private mapEntry(f: any, cloudType: CloudDiskType): CloudFileEntry {
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
