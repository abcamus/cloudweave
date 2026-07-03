import { App, Notice } from "obsidian"
import { t } from "../i18n"
import { CloudFileEntry, CloudNodeMeta, CloudDiskType, CloudFileCategory } from "../types"
import { CanvasService } from "./canvas-service"
import { SyncVaultBridge } from "./sync-vault-bridge"
import { CLOUD_NODE_COLORS } from "../constants"

const META_COMMENT_RE = /<!--\s*meta:\s*(\{.+?\})\s*-->/

export class CloudNodeService {
  constructor(
    private app: App,
    private canvasService: CanvasService,
    private syncVault: SyncVaultBridge
  ) {}

  async insertCloudFile(file: CloudFileEntry) {
    const category = this.syncVault.getCategory(file)
    const content = this.buildContent(file, category)
    const nodeId = `cloud-${file.cloudType}-${file.fsid}-${Date.now()}`
    const color = CLOUD_NODE_COLORS[category] || "1"
    const label = file.name.replace(/\.[^.]+$/, "")

    const isWide = category === "video" || category === "audio"
    await this.canvasService.addCloudNode(
      nodeId, label, content, color,
      undefined,
      isWide ? 320 : 220,
      isWide ? 200 : 300,
    )
    new Notice(t("inserted", file.name))
  }

  async refreshNodeContent(nodeId: string): Promise<CloudNodeMeta | null> {
    return this.parseMetaFromNode(nodeId)
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
      return JSON.parse(match[1]) as CloudNodeMeta
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
    const subdirs = result.files.filter(f => f.isdir)

    const groupPad = 24
    const headerH = 44
    const gap = 16
    const cols = 3
    const cardW = 220
    const cardH = 120

    const totalCards = children.length + subdirs.length
    const rows = Math.max(1, Math.ceil(totalCards / cols))
    const groupW = groupPad * 2 + cols * cardW + (cols - 1) * gap
    const contentH = rows * cardH + (rows - 1) * gap
    const groupH = groupPad * 2 + headerH + contentH

    const ref = pos || this.canvasService.findRefNode(data)
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

    const allItems = [...subdirs, ...children]

    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i]
      const col = i % cols
      const row = Math.floor(i / cols)

      const cx = gx + groupPad + col * (cardW + gap)
      const cy = gy + groupPad + headerH + row * (cardH + gap)
      const itemId = `cloud-${item.cloudType}-${item.fsid}-${Date.now()}-${i}`

      if (item.isdir) {
        data.nodes.push({
          id: itemId,
          x: cx,
          y: cy,
          width: cardW,
          height: cardH,
          type: "text",
          label: item.name,
          text: `📁 ${item.name}`,
          color: "3",
        })
      } else {
        const category = this.syncVault.getCategory(item)
        const content = this.buildContent(item, category)
        const color = CLOUD_NODE_COLORS[category] || "1"
        const isWide = category === "video" || category === "audio"

        data.nodes.push({
          id: itemId,
          x: cx,
          y: cy,
          width: isWide ? 320 : cardW,
          height: isWide ? 200 : cardH,
          type: "text",
          label: item.name.replace(/\.[^.]+$/, ""),
          text: content,
          color,
        })
      }

    }

    await this.canvasService.setData(data)
    new Notice(t("insertedFolder", folder.name, String(allItems.length)))
  }

  private buildContent(file: CloudFileEntry, category: CloudFileCategory): string {
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
    if (category === "image" || category === "pdf") {
      display = `![](${cloudLink})\n\n_${file.name} · ${cloudLabel}_`
    } else if (category === "video") {
      display = [
        `\`\`\`cloudvideo\n${file.cloudType}://${file.path} | ${file.name}\n\`\`\``,
        `### 🎬 ${file.name.replace(/\.[^.]+$/, "")}`,
        `\`${cloudLabel}\` \`${sizeLabel}\``,
      ].join("\n\n")
    } else if (category === "audio") {
      display = [
        `# 🎧 ${file.name.replace(/\.[^.]+$/, "")}`,
        `\`${cloudLabel}\` \`${sizeLabel}\``,
        `---`,
        `▶️ [${t("openFile")}](${cloudLink})`,
      ].join("\n")
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
      "115": t("cloudLabel115"),
    }
    return labels[type] || type
  }

  private getCategoryIcon(cat: CloudFileCategory): string {
    return { video: "🎬", audio: "🎧", image: "🖼️", pdf: "📄", folder: "📁", other: "📎" }[cat] || "📎"
  }
}
