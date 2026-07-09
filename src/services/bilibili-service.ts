import { App, Notice, requestUrl } from "obsidian"
import { createHash } from "crypto"
import { CloudFileEntry } from "../types"
import { CanvasService } from "./canvas-service"
import { SyncVaultBridge } from "./sync-vault-bridge"
import { CLOUD_NODE_COLORS } from "../constants"
import { t } from "../i18n"

export interface BilibiliMeta {
  bvid: string
  title: string
  cover: string
  duration: number
  up: string
}

export class BilibiliService {
  private wbiKeys: { imgKey: string; subKey: string } | null = null
  private cookie = ""

  private biliHeaders: Record<string, string> = {
    "Referer": "https://www.bilibili.com",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  }

  constructor(
    private app: App,
    private canvasService: CanvasService,
    private syncVault?: SyncVaultBridge,
  ) {}

  setCookie(cookie: string) {
    this.cookie = cookie
    if (cookie) {
      this.biliHeaders["Cookie"] = cookie
    } else {
      delete this.biliHeaders["Cookie"]
    }
  }

  /* ──── WBI signing ──── */

  private async ensureWBIConfig(): Promise<void> {
    if (this.wbiKeys) return
    for (const endpoint of [
      "https://api.bilibili.com/x/web-interface/wbi/index",
      "https://api.bilibili.com/x/web-interface/nav",
    ]) {
      try {
        const resp = await requestUrl({
          url: endpoint,
          method: "GET",
          headers: this.biliHeaders,
          throw: false,
        })
        if (resp.status !== 200) continue
        const body = resp.json as { code?: number; data?: { wbi_img?: { img_url?: string; sub_url?: string } } }
        const imgUrl = body?.data?.wbi_img?.img_url
        const subUrl = body?.data?.wbi_img?.sub_url
        if (!imgUrl || !subUrl) continue
        const imgKey = imgUrl.split("/").pop()?.split(".")[0] || ""
        const subKey = subUrl.split("/").pop()?.split(".")[0] || ""
        if (!imgKey || !subKey) continue
        this.wbiKeys = { imgKey, subKey }
        return
      } catch { /* try next */ }
    }
    throw new Error("Failed to fetch Bilibili WBI config")
  }

  private wbiSign(params: Record<string, string | number>): Record<string, string> {
    const sorted: Record<string, string> = {}
    for (const k of Object.keys(params).sort()) sorted[k] = String(params[k])
    sorted.wts = String(Math.floor(Date.now() / 1000))
    const allKeys = Object.keys(sorted).sort()
    const queryStr = allKeys.map(k => `${k}=${sorted[k]}`).join("&")
    const mixKey = this.wbiKeys!.subKey.slice(0, 4) + this.wbiKeys!.imgKey.slice(0, 4)
    sorted.w_rid = createHash("md5").update(queryStr + mixKey).digest("hex")
    return sorted
  }

  /* ──── API ──── */

  async search(keyword: string, page = 1): Promise<CloudFileEntry[]> {
    await this.ensureWBIConfig()
    const signed = this.wbiSign({ keyword, search_type: "video", page })
    const queryStr = Object.entries(signed)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&")
    const url = `https://api.bilibili.com/x/web-interface/search/type?${queryStr}`

    const resp = await requestUrl({
      url, method: "GET",
      headers: this.biliHeaders,
      throw: false,
    })
    if (resp.status === 412) {
      this.wbiKeys = null
      await this.ensureWBIConfig()
      return this.search(keyword, page)
    }
    if (resp.status !== 200) throw new Error(`Bilibili search API error: ${resp.status}`)

    type BiliSearchResponse = {
      code: number
      message: string
      data?: {
        result?: Array<{
          bvid: string
          title: string
          pic: string
          duration: string
          author: string
          play?: number
        }>
      }
    }
    const body = resp.json as BiliSearchResponse
    if (body.code !== 0) throw new Error(`Bilibili search rejected (${body.code}): ${body.message}`)
    const items = body?.data?.result || []
    return items.map((item) => ({
      cloudType: "bilibili",
      path: item.bvid,
      name: item.title.replace(/<[^>]+>/g, ""),
      isdir: false,
      fsid: item.bvid,
      size: this.parseDuration(item.duration),
      ctime: 0,
      mtime: 0,
      thumb: item.pic.startsWith("//") ? "https:" + item.pic : item.pic,
    }))
  }

  async getVideo(bvid: string): Promise<CloudFileEntry> {
    const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
    const resp = await requestUrl({
      url, method: "GET",
      headers: this.biliHeaders,
      throw: false,
    })
    if (resp.status !== 200) throw new Error(`Bilibili view API error: ${resp.status}`)

    type BiliViewResponse = {
      code: number
      message: string
      data?: {
        bvid: string
        title: string
        pic: string
        duration: number
        owner?: { name: string }
        stat?: { view?: number }
      }
    }
    const body = resp.json as BiliViewResponse
    if (body.code !== 0) throw new Error(`Bilibili view rejected (${body.code}): ${body.message}`)
    const d = body?.data
    if (!d) throw new Error("Bilibili video not found")

    return {
      cloudType: "bilibili",
      path: d.bvid,
      name: d.title,
      isdir: false,
      fsid: d.bvid,
      size: d.duration,
      ctime: 0,
      mtime: 0,
      thumb: d.pic.startsWith("//") ? "https:" + d.pic : d.pic,
    }
  }

  getEmbedUrl(bvid: string): string {
    return `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0&high_quality=1`
  }

  /* ──── Play URL (requires cookie) ──── */

  private async getCid(bvid: string): Promise<number> {
    const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
    const resp = await requestUrl({ url, method: "GET", headers: this.biliHeaders, throw: false })
    if (resp.status !== 200) throw new Error(`Bilibili view API error: ${resp.status}`)
    type ViewResp = { code: number; message: string; data?: { cid?: number; aid?: number } }
    const body = resp.json as ViewResp
    if (body.code !== 0) throw new Error(`Bilibili view rejected (${body.code}): ${body.message}`)
    if (!body.data?.cid) throw new Error("Bilibili video has no cid")
    return body.data.cid
  }

  async getVideoPlayUrl(bvid: string): Promise<string> {
    if (!this.cookie) throw new Error(t("bilibiliNoCookie"))
    await this.ensureWBIConfig()
    const cid = await this.getCid(bvid)
    const signed = this.wbiSign({ bvid, cid, qn: 80, fnver: 0, fnval: 4048, fourk: 1 })
    const queryStr = Object.entries(signed)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&")
    const url = `https://api.bilibili.com/x/player/wbi/v2?${queryStr}`

    const resp = await requestUrl({ url, method: "GET", headers: this.biliHeaders, throw: false })
    if (resp.status === 412) {
      this.wbiKeys = null
      return this.getVideoPlayUrl(bvid)
    }
    if (resp.status !== 200) throw new Error(`Bilibili player API error: ${resp.status}`)

    type PlayerResp = {
      code: number
      message: string
      data?: {
        dash?: { video?: Array<{ base_url: string; backup_url?: string[] }> }
        durl?: Array<{ url: string; backup_url?: string[] }>
      }
    }
    const body = resp.json as PlayerResp
    if (body.code !== 0) throw new Error(`Bilibili player rejected (${body.code}): ${body.message}`)

    const pd = body.data
    if (!pd) throw new Error("Bilibili play data not found")

    if (pd.durl?.[0]?.url) return pd.durl[0].url
    if (pd.dash?.video?.[0]?.base_url) return pd.dash.video[0].base_url
    if (pd.dash?.video?.[0]?.backup_url?.[0]) return pd.dash.video[0].backup_url[0]
    if (pd.durl?.[0]?.backup_url?.[0]) return pd.durl[0].backup_url[0]

    throw new Error("No playable URL found in Bilibili response")
  }

  async uploadToBaidu(bvid: string, filename: string, dir = "/"): Promise<void> {
    if (!this.syncVault) throw new Error("SyncVaultBridge not available")
    const videoUrl = await this.getVideoPlayUrl(bvid)
    await this.syncVault.post("baidu_file_upload_by_url", {
      url: videoUrl,
      filename,
      dir,
      cloudType: "Baidu",
    })
  }

  /* ──── Canvas insertion ──── */

  async insertVideo(file: CloudFileEntry, pos?: { x: number; y: number }): Promise<void> {
    const meta: BilibiliMeta = {
      bvid: file.fsid,
      title: file.name,
      cover: file.thumb || "",
      duration: file.size,
      up: "",
    }
    const content = this.buildNodeContent(meta)
    const nodeId = `cloud-bilibili-${file.fsid}-${Date.now()}`
    const label = file.name

    await this.canvasService.addCloudNode(
      nodeId, label, content, CLOUD_NODE_COLORS.bilibili || "3",
      pos, 640, 360,
    )
    new Notice(t("inserted", file.name))
  }

  buildNodeContent(meta: BilibiliMeta): string {
    const json = JSON.stringify(meta)
    return [
      "```bilibili",
      json,
      "```",
      `<!-- meta:${JSON.stringify({ cloudType: "bilibili", filePath: meta.bvid, fsid: meta.bvid, fileName: meta.title, fileSize: meta.duration, category: "bilibili" })} -->`,
    ].join("\n\n")
  }

  /* ──── Code block processor handler ──── */

  getCodeBlockHandler(): (source: string, el: HTMLElement) => void {
    return (source, el) => {
      const meta: Record<string, unknown> = JSON.parse(source) as Record<string, unknown>
      const bvid = typeof meta.bvid === "string" ? meta.bvid : ""

      const container = el.createDiv({ cls: "cc-bilibili-player" })

      const iframe = container.createEl("iframe")
      iframe.src = this.getEmbedUrl(bvid)
      iframe.allowFullscreen = true
      iframe.setAttr("sandbox", "allow-same-origin allow-scripts allow-popups allow-forms")

      const title = typeof meta.title === "string" ? meta.title : ""
      const up = typeof meta.up === "string" ? meta.up : ""
      if (title) {
        const info = container.createDiv({ cls: "cc-bilibili-info" })
        info.createEl("strong", { text: `▶ ${title}` })
        if (up) info.createSpan({ text: `  ${up}`, cls: "cc-bilibili-up" })
      }

      const pre = el.closest("pre")
      if (pre) pre.addClass("cc-bilibili-pre")
    }
  }

  private parseDuration(d: string): number {
    const parts = d.split(":").map(Number)
    if (parts.length === 2) return parts[0]! * 60 + parts[1]!
    if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
    return 0
  }
}
