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
    const label = this.buildNodeLabel(file, category)

    await this.canvasService.addCloudNode(nodeId, label, content, color)
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

    let display: string
    if (category === "video" || category === "audio") {
      display = `\`\`\`cloudvideo\n${file.cloudType}://${file.path} | ${file.name}\n\`\`\``
    } else if (category === "image") {
      display = `![](${cloudLink})`
    } else if (category === "pdf") {
      display = `📄 [${file.name}](${cloudLink})`
    } else {
      display = `📎 [${file.name}](${cloudLink})`
    }

    return `${display}\n\n<!-- meta:${JSON.stringify(meta)} -->`
  }

  private buildNodeLabel(file: CloudFileEntry, category: CloudFileCategory): string {
    const cloudLabel = this.getCloudLabel(file.cloudType)
    const icon = this.getCategoryIcon(category)
    return `${icon} ${file.name} · ${cloudLabel}`
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
