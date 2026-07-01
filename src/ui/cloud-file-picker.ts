import { App, Modal, Setting, Notice } from "obsidian"
import { t } from "../i18n"
import { CloudFileEntry, CloudDiskType } from "../types"
import { SyncVaultBridge } from "../services/sync-vault-bridge"

export class CloudFilePickerModal extends Modal {
  private files: CloudFileEntry[] = []
  private currentPath = "/"
  private currentCloud: CloudDiskType = "aliyun"
  private loading = false
  private searchQuery = ""
  private searchTimer: number | null = null

  constructor(
    app: App,
    private syncVault: SyncVaultBridge,
    private onPick: (file: CloudFileEntry) => void
  ) {
    super(app)
    this.titleEl.setText(t("cloudInsertTitle"))
  }

  onOpen() {
    this.renderCloudSelector()
    this.renderSearchBar()
    this.renderBreadcrumb()
    this.renderFileList()
    this.loadFiles()
  }

  private renderCloudSelector() {
    const container = this.contentEl.createDiv("cc-cloud-selector")
    const clouds: CloudDiskType[] = ["aliyun", "baidu", "quark", "onedrive", "115"]

    const cloudLabels: Record<string, string> = {
      aliyun: t("cloudLabelAliyun"),
      baidu: t("cloudLabelBaidu"),
      quark: t("cloudLabelQuark"),
      onedrive: t("cloudLabelOnedrive"),
      "115": t("cloudLabel115"),
    }

    new Setting(container)
      .setName(t("selectCloud"))
      .addDropdown((dd) => {
        for (const c of clouds) {
          dd.addOption(c, cloudLabels[c] || c)
        }
        dd.setValue(this.currentCloud)
        dd.onChange(async (val: CloudDiskType) => {
          this.currentCloud = val
          this.currentPath = "/"
          this.searchQuery = ""
          await this.loadFiles()
        })
      })
  }

  private renderSearchBar() {
    const container = this.contentEl.createDiv("cc-search-bar")
    new Setting(container)
      .setName(t("search"))
      .addText((txt) => {
        txt.setPlaceholder(t("searchPlaceholder"))
        txt.onChange((val) => {
          this.searchQuery = val
          if (this.searchTimer) window.clearTimeout(this.searchTimer)
          this.searchTimer = window.setTimeout(() => this.loadFiles(), 300)
        })
      })
  }

  private renderBreadcrumb() {
    const nav = this.contentEl.createDiv("cc-breadcrumb")
    nav.empty()

    const parts = this.currentPath.split("/").filter(Boolean)
    const accum: string[] = []

    const addCrumb = (label: string, path: string, isLast: boolean) => {
      const span = nav.createSpan({ text: label, cls: isLast ? "cc-crumb-current" : "cc-crumb-link" })
      if (!isLast) {
        span.onClickEvent(async () => {
          this.currentPath = path
          await this.loadFiles()
        })
      }
    }

    addCrumb(t("rootDir"), "/", parts.length === 0)
    for (let i = 0; i < parts.length; i++) {
      accum.push(parts[i])
      nav.createSpan({ text: " / " })
      addCrumb(parts[i], "/" + accum.join("/"), i === parts.length - 1)
    }
  }

  private renderFileList() {
    const container = this.contentEl.createDiv("cc-file-list")
  }

  private seq = 0

  private async loadFiles(dir?: string) {
    const seq = ++this.seq
    this.loading = true
    this.render()

    try {
      const targetPath = dir ?? this.currentPath
      let result: { files: CloudFileEntry[]; total: number }

      if (this.searchQuery) {
        const entries = await this.syncVault.searchFiles(
          this.searchQuery,
          this.currentCloud
        )
        result = { files: entries, total: entries.length }
      } else {
        result = await this.syncVault.listFiles(targetPath, this.currentCloud, 100, 0)
      }

      if (seq !== this.seq) return

      this.files = result.files
      this.currentPath = targetPath
      this.loading = false
      this.render()
    } catch (e) {
      if (seq !== this.seq) return
      this.loading = false
      this.render()
      new Notice(t("readFailed", e.message))
    }
  }

  private render() {
    const { contentEl } = this

    contentEl.querySelector(".cc-breadcrumb")?.remove()
    contentEl.querySelector(".cc-file-list")?.remove()

    this.renderBreadcrumb()

    const list = contentEl.createDiv("cc-file-list")

    if (this.loading) {
      list.createEl("p", { text: t("loading"), cls: "cc-loading" })
      return
    }

    if (this.files.length === 0) {
      list.createEl("p", { text: t("emptyResult"), cls: "cc-empty" })
      return
    }

    const sorted = [...this.files].sort((a, b) => {
      if (a.isdir !== b.isdir) return a.isdir ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    for (const file of sorted) {
      const row = list.createDiv("cc-file-row")
      const icon = file.isdir ? "📁" : this.getFileIcon(file.name)
      const sizeStr = file.isdir ? "" : this.formatSize(file.size)

      row.createSpan({ text: `${icon} ${file.name}`, cls: "cc-file-name" })
      if (sizeStr) row.createSpan({ text: sizeStr, cls: "cc-file-size" })

      if (file.isdir) {
        row.onClickEvent(async () => {
          this.currentPath = file.path
          await this.loadFiles()
        })
      } else {
        row.onClickEvent(() => {
          this.onPick(file)
          this.close()
        })
      }
    }
  }

  private getFileIcon(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() || ""
    if (["mp4", "mkv", "avi", "mov"].includes(ext)) return "🎬"
    if (["mp3", "wav", "flac"].includes(ext)) return "🎧"
    if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) return "🖼️"
    if (ext === "pdf") return "📄"
    return "📎"
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
  }
}
