import { App, Notice } from "obsidian"
import { t } from "../i18n"
import { CloudFileEntry, CloudNodeMeta, CloudDiskType, CloudFileCategory, CanvasData, CanvasNode } from "../types"
import { CanvasService } from "./canvas-service"
import { SyncVaultBridge } from "./sync-vault-bridge"
import { BilibiliService } from "./bilibili-service"
import { CLOUD_NODE_COLORS } from "../constants"

const META_COMMENT_RE = /<!--\s*meta:\s*(\{.+?\})\s*-->/

export class CloudNodeService {
  constructor(
    private app: App,
    private canvasService: CanvasService,
    private syncVault: SyncVaultBridge,
    private bilibiliService?: BilibiliService,
  ) {}

  get viewportCenter(): { x: number; y: number } {
    return this.canvasService.posCenter()
  }

  async insertCloudFile(file: CloudFileEntry, pos?: { x: number; y: number }) {
    if (file.cloudType === "bilibili" && this.bilibiliService) {
      await this.bilibiliService.insertVideo(file, pos)
      return
    }
    const category = this.syncVault.getCategory(file)
    const content = this.buildContent(file, category)
    const nodeId = `cloud-${category}-${file.cloudType}-${file.fsid}-${Date.now()}`
    const color = CLOUD_NODE_COLORS[category] || "1"
    const label = file.name.replace(/\.[^.]+$/, "")

    const isWide = category === "video" || category === "audio"
    const isTall = category === "ebook"
    const isImage = category === "image"
    const w = category === "video" ? 640 : isImage ? 400 : isTall ? 260 : isWide ? 480 : 220
    const h = category === "video" ? 360 : isImage ? 300 : isTall ? 340 : isWide ? 200 : 280

    await this.canvasService.addCloudNode(
      nodeId, label, content, color,
      pos,
      w, h,
    )
    new Notice(t("inserted", file.name))
  }

  async batchInsert(
    files: CloudFileEntry[],
  ): Promise<void> {
    const data = await this.canvasService.getData()
    if (!data) return

    const center = this.viewportCenter
    let cursorX = center.x, cursorY = center.y
    let rowMaxH = 0, col = 0
    const maxCols = 3
    let firstId = ""
    let count = 0

    interface SizedItem {
      file: CloudFileEntry
      w: number
      h: number
    }

    const sized: SizedItem[] = []
    const folderCache = new Map<string, CloudFileEntry[]>()

    for (const file of files) {
      if (file.isdir) {
        const result = await this.syncVault.listFiles(file.path, file.cloudType, 100, 0)
        const children = result.files
        folderCache.set(file.fsid, children)
        const filesOnly = children.filter(c => !c.isdir)
        const cols = 3, gap = 16, cardW = 220, cardH = 140
        const total = filesOnly.length
        const rows = Math.max(1, Math.ceil(total / cols))
        const gridH = rows * cardH + (rows - 1) * gap
        sized.push({ file, w: cols * cardW + (cols - 1) * gap, h: 80 + 16 + gridH })
      } else {
        const category = this.syncVault.getCategory(file)
        const isWide = category === "video" || category === "audio"
        const isImage = category === "image"
        sized.push({
          file,
          w: category === "video" ? 640 : isImage ? 400 : isWide ? 480 : 220,
          h: category === "video" ? 360 : isImage ? 300 : isWide ? 200 : 280,
        })
      }
    }

    for (const item of sized) {
      if (item.file.isdir) {
        const children = folderCache.get(item.file.fsid) || []
        const nodeId = this.buildFolderTree(data, item.file, children, { x: cursorX, y: cursorY }, folderCache, 1)
        if (!firstId) firstId = nodeId
      } else {
        const node = this.buildFileNode(item.file, { x: cursorX, y: cursorY })
        data.nodes.push(node)
        if (!firstId) firstId = node.id
      }

      rowMaxH = Math.max(rowMaxH, item.h)
      col++
      if (col >= maxCols) {
        cursorX = center.x
        cursorY += rowMaxH + 24
        col = 0; rowMaxH = 0
      } else {
        cursorX += item.w + 24
      }
      count++
    }

    if (count === 0) return
    await this.canvasService.setData(data)
    if (firstId) this.canvasService.scrollToNode(firstId)
    new Notice(t("inserted", String(count)))
  }

  private buildFileNode(file: CloudFileEntry, pos: { x: number; y: number }): CanvasNode {
    const category = this.syncVault.getCategory(file)
    const content = this.buildContent(file, category)
    const nodeId = `cloud-${category}-${file.cloudType}-${file.fsid}-${Date.now()}`
    const color = CLOUD_NODE_COLORS[category] || "1"
    const label = file.name.replace(/\.[^.]+$/, "")
    const isWide = category === "video" || category === "audio"
    const isTall = category === "ebook"
    const isImage = category === "image"
    return {
      id: nodeId,
      x: pos.x, y: pos.y,
      width: category === "video" ? 640 : isImage ? 400 : isTall ? 260 : isWide ? 480 : 220,
      height: category === "video" ? 360 : isImage ? 300 : isTall ? 340 : isWide ? 200 : 280,
      type: "text", label, text: content, color,
    }
  }

  private buildFolderTree(
    data: CanvasData,
    folder: CloudFileEntry,
    children: CloudFileEntry[],
    pos: { x: number; y: number },
    folderCache: Map<string, CloudFileEntry[]>,
    depth: number,
  ): string {
    const folderId = `cloud-${folder.cloudType}-${folder.fsid}-${Date.now()}`
    const cloudLabel = this.getCloudLabel(folder.cloudType)

    data.nodes.push({
      id: folderId,
      x: pos.x, y: pos.y,
      width: 220, height: 72,
      type: "text",
      label: folder.name,
      text: `📁 ${folder.name}\n${cloudLabel}`,
      color: "1",
    })

    const cardW = 220, cardH = 140, gap = 16
    const cols = 3
    const childY = pos.y + 72 + 24
    const filesOnly = children.filter(c => !c.isdir)
    const foldersOnly = children.filter(c => c.isdir)

    for (let i = 0; i < filesOnly.length; i++) {
      const child = filesOnly[i]!
      const ccol = i % cols
      const crow = Math.floor(i / cols)
      const cx = pos.x + ccol * (cardW + gap)
      const cy = childY + crow * (cardH + gap)
      const node = this.buildFileNode(child, { x: cx, y: cy })
      data.nodes.push(node)
    }

    const filesRows = Math.max(1, Math.ceil(filesOnly.length / cols))
    const subFolderY = childY + filesRows * (cardH + gap)

    for (let i = 0; i < foldersOnly.length; i++) {
      const child = foldersOnly[i]!
      const subChildren = depth > 0 && folderCache.has(child.fsid)
        ? folderCache.get(child.fsid)!
        : []
      const ccol = i % cols
      const crow = Math.floor(i / cols)
      const cx = pos.x + ccol * (cardW + gap)
      const cy = subFolderY + crow * (cardH + gap)

      let subId: string
      if (depth > 0) {
        subId = this.buildFolderTree(data, child, subChildren, { x: cx, y: cy }, folderCache, depth - 1)
      } else {
        subId = `cloud-${child.cloudType}-${child.fsid}-${Date.now()}`
        data.nodes.push({
          id: subId, x: cx, y: cy,
          width: cardW, height: cardH,
          type: "text",
          label: child.name,
          text: `📁 ${child.name}\n${this.getCloudLabel(child.cloudType)}`,
          color: "1",
        })
      }
    }

    return folderId
  }

  private async parseMetaFromNode(nodeId: string): Promise<CloudNodeMeta | null> {
    const data = await this.canvasService.getData()
    if (!data) return null

    const node = data.nodes.find((n) => n.id === nodeId)
    const text = node?.text ?? node?.content
    if (!text) return null

    const match = text.match(META_COMMENT_RE)
    if (!match) return null

    try {
      return JSON.parse(match[1]!) as CloudNodeMeta
    } catch {
      return null
    }
  }

  async insertFolder(
    folder: CloudFileEntry,
    depth: number = 1,
    pos?: { x: number; y: number },
  ): Promise<void> {
    const data = await this.canvasService.getData()
    if (!data) return

    const groupId = `cloud-folder-${folder.cloudType}-${folder.fsid}-${Date.now()}`
    const cloudLabel = this.getCloudLabel(folder.cloudType)

    const result = await this.syncVault.listFiles(folder.path, folder.cloudType, 100, 0)
    const children = result.files.filter(f => !f.isdir)

    const groupPad = 24
    const headerH = 44
    const gap = 16
    const cols = 3
    const cardW = 240
    const cardH = 140

    const totalCards = children.length
    const rows = Math.max(1, Math.ceil(totalCards / cols))
    const groupW = groupPad * 2 + cols * cardW + (cols - 1) * gap
    const contentH = rows * cardH + (rows - 1) * gap
    const groupH = groupPad * 2 + headerH + contentH

    let ref = pos || this.canvasService.posCenter()
    const gx = ref.x
    const gy = ref.y

    data.nodes.push({
      id: groupId,
      x: gx,
      y: gy,
      width: groupW,
      height: groupH,
      type: "group",
      label: folder.name,
      text: `📁 ${folder.name}\n${cloudLabel}`,
    })

    for (let i = 0; i < children.length; i++) {
      const item = children[i]!
      const col = i % cols
      const row = Math.floor(i / cols)

      const cx = gx + groupPad + col * (cardW + gap)
      const cy = gy + groupPad + headerH + row * (cardH + gap)
      const itemCategory = this.syncVault.getCategory(item)
      const itemId = `cloud-${itemCategory}-${item.cloudType}-${item.fsid}-${Date.now()}-${i}`

      const content = this.buildContent(item, itemCategory)
      const color = CLOUD_NODE_COLORS[itemCategory] || "1"

      data.nodes.push({
        id: itemId,
        x: cx,
        y: cy,
        width: cardW,
        height: cardH,
        type: "text",
        label: item.name.replace(/\.[^.]+$/, ""),
        text: content,
        color,
      })

    }

    await this.canvasService.setData(data)
    this.canvasService.scrollToNode(groupId)
    new Notice(t("insertedFolder", folder.name, String(children.length)))
  }

  async buildTimelineGroup(files: CloudFileEntry[], pos?: { x: number; y: number }): Promise<void> {
    const data = await this.canvasService.getData()
    if (!data) return

    const images = files
      .filter(f => this.syncVault.getCategory(f) === "image")
      .sort((a, b) => (a.mtime || 0) - (b.mtime || 0))

    if (images.length === 0) return

    const groups = new Map<string, CloudFileEntry[]>()
    for (const f of images) {
      const date = f.mtime ? new Date(f.mtime * 1000).toISOString().slice(0, 10) : "unknown"
      if (!groups.has(date)) groups.set(date, [])
      groups.get(date)!.push(f)
    }

    const cardW = 160, cardH = 120, gap = 12
    const maxCols = 4
    const groupPad = 20
    const headerH = 36
    const rowGap = 20

    const ref = pos || this.canvasService.posCenter()
    const groupId = `timeline-${Date.now()}`
    const ts = Date.now()

    let dayY = groupPad
    let maxWidth = 0
    const dayHeights: number[] = []

    for (const [, dayFiles] of groups) {
      const cols = Math.min(dayFiles.length, maxCols)
      const rows = Math.ceil(dayFiles.length / maxCols)
      const rowWidth = cols * cardW + (cols - 1) * gap
      const dayH = headerH + rows * cardH + (rows - 1) * gap
      maxWidth = Math.max(maxWidth, rowWidth)
      dayHeights.push(dayH)
    }

    const groupW = groupPad * 2 + maxWidth
    const groupH = groupPad + dayHeights.reduce((a, b) => a + b + rowGap, 0) - rowGap

    const gx = ref.x
    const gy = ref.y

    data.nodes.push({
      id: groupId,
      x: gx, y: gy,
      width: groupW, height: groupH,
      type: "group",
      label: `📷 Timeline (${images.length})`,
    })

    const dateEntries = [...groups.entries()]
    for (let di = 0; di < dateEntries.length; di++) {
      const [dateStr, dayFiles] = dateEntries[di]!
      const rows = Math.ceil(dayFiles.length / maxCols)

      const headerId = `timeline-date-${dateStr}-${ts}`
      data.nodes.push({
        id: headerId,
        x: gx + groupPad, y: gy + dayY,
        width: maxWidth, height: 20,
        type: "text",
        label: dateStr,
        text: `📅 **${dateStr}**`,
        color: "1",
      })

      dayY += headerH

      for (let i = 0; i < dayFiles.length; i++) {
        const file = dayFiles[i]!
        const col = i % maxCols
        const row = Math.floor(i / maxCols)
        const cx = gx + groupPad + col * (cardW + gap)
        const cy = gy + dayY + row * (cardH + gap)

        const cloudLink = `obsidian://cloud-link?type=${file.cloudType}&id=${file.fsid}&cloudpath=${encodeURIComponent(file.path)}`
        const content = `![](${cloudLink})`
        const photoId = `timeline-photo-${file.fsid}-${ts}-${i}`

        data.nodes.push({
          id: photoId,
          x: cx, y: cy,
          width: cardW, height: cardH,
          type: "text",
          label: file.name.replace(/\.[^.]+$/, ""),
          text: content,
          color: "5",
        })
      }

      dayY += rows * cardH + (rows - 1) * gap + rowGap
    }

    await this.canvasService.setData(data)
    this.canvasService.scrollToNode(groupId)
    new Notice(t("insertedTimeline", String(images.length)))
  }

  private buildContent(file: CloudFileEntry, category: CloudFileCategory): string {
    if (file.cloudType === "bilibili" && this.bilibiliService) {
      const meta = { bvid: file.fsid, title: file.name, cover: file.thumb || "", duration: file.size, up: "" }
      return this.bilibiliService.buildNodeContent(meta)
    }
    const meta: CloudNodeMeta = {
      cloudType: file.cloudType,
      filePath: file.path,
      fsid: file.fsid,
      fileName: file.name,
      fileSize: file.size,
      category,
    }

    const cloudLink = `obsidian://cloud-link?type=${file.cloudType}&id=${file.fsid}&cloudpath=${encodeURIComponent(file.path)}`
    const icon = this.getCategoryIcon(category)
    const cloudLabel = this.getCloudLabel(file.cloudType)
    const sizeLabel = this.formatSize(file.size)

    let display: string
    if (category === "image") {
      display = `![](${cloudLink})\n\n_${file.name} · ${cloudLabel}_`
    } else if (category === "video") {
      display = [
        `\`\`\`cloudvideo\n${file.cloudType}://${file.path} | ${file.name}\n\`\`\``,
        `### 🎬 ${file.name.replace(/\.[^.]+$/, "")}`,
        `\`${cloudLabel}\` \`${sizeLabel}\``,
      ].join("\n\n")
    } else if (category === "audio") {
      display = [
        `\`\`\`cloudaudio\n${file.cloudType}://${file.path} | ${file.name}\n\`\`\``,
        `### 🎧 ${file.name.replace(/\.[^.]+$/, "")}`,
        `\`${cloudLabel}\` \`${sizeLabel}\``,
      ].join("\n\n")
    } else if (category === "ebook") {
      const ext = file.name.split(".").pop()?.toLowerCase() || ""
      const parts = [
        `# 📖 ${file.name.replace(/\.[^.]+$/, "")}`,
        `---`,
        `\`\`\`\n${cloudLabel} · ${sizeLabel}\n\`\`\``,
        `[${t("openFile")}](${cloudLink})`,
      ]
      if (ext === "pdf") parts.unshift(`![](${cloudLink})`)
      display = parts.join("\n\n")
    } else {
      display = [
        `${icon} ${file.name}`,
        `${cloudLabel} · ${sizeLabel}`,
        `[${t("openFile")}](${cloudLink})`,
      ].join("\n")
    }

    return `${display}\n\n<!-- meta:${JSON.stringify(meta)} -->`
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  private getCloudLabel(type: CloudDiskType): string {
    const labels: Record<string, string> = {
      aliyun: t("cloudLabelAliyun"),
      baidu: t("cloudLabelBaidu"),
      quark: t("cloudLabelQuark"),
      onedrive: t("cloudLabelOnedrive"),
    }
    return labels[type] || type
  }

  private getCategoryIcon(cat: CloudFileCategory): string {
    return { video: "🎬", audio: "🎧", image: "🖼️", pdf: "📄", ebook: "📖", folder: "📁", other: "📎" }[cat] || "📎"
  }
}
