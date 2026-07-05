import { App, Modal, Notice, setIcon } from "obsidian"
import { t } from "../i18n"
import { CloudFileEntry, CloudDiskType } from "../types"
import { SyncVaultBridge } from "../services/sync-vault-bridge"
import { CloudNodeService } from "../services/cloud-node-service"

export class CloudFilePickerModal extends Modal {
  private files: CloudFileEntry[] = []
  private currentPath = "/"
  private currentCloud: CloudDiskType = "aliyun"
  private loading = false
  private searchQuery = ""
  private searchTimer: number | null = null
  private viewMode: "list" | "grid" = "list"
  private selected = new Set<string>()
  private searchActive = false
  private breadcrumbEl!: HTMLElement
  private searchRowEl!: HTMLElement
  private searchInputEl!: HTMLInputElement
  private viewToggleEl!: HTMLElement
  private footerEl: HTMLElement | null = null

  constructor(
    app: App,
    private syncVault: SyncVaultBridge,
    private onPick: (file: CloudFileEntry) => void | Promise<void>,
    private cloudNodeService?: CloudNodeService,
  ) {
    super(app)
    this.titleEl.setText(t("cloudInsertTitle"))
  }

  onOpen() {
    this.renderToolbar()
    this.renderFileList()
    void this.loadFiles()
  }

  private renderToolbar() {
    const toolbar = this.contentEl.createDiv("cc-toolbar")
    const left = toolbar.createDiv("cc-toolbar-left")
    const right = toolbar.createDiv("cc-toolbar-right")

    const clouds: CloudDiskType[] = ["aliyun", "baidu", "quark", "onedrive", "115"]
    const cloudLabels: Record<string, string> = {
      aliyun: t("cloudLabelAliyun"),
      baidu: t("cloudLabelBaidu"),
      quark: t("cloudLabelQuark"),
      onedrive: t("cloudLabelOnedrive"),
      "115": t("cloudLabel115"),
    }

    const select = left.createEl("select", { cls: "dropdown" })
    for (const c of clouds) {
      select.createEl("option", { value: c, text: cloudLabels[c] })
    }
    select.value = this.currentCloud
    select.onchange = async () => {
      this.currentCloud = select.value as CloudDiskType
      this.currentPath = "/"
      this.searchQuery = ""
      this.selected.clear()
      await this.loadFiles()
    }

    this.breadcrumbEl = left.createSpan({ cls: "cc-toolbar-breadcrumb" })

    const searchBtn = right.createSpan({ cls: "cc-toolbar-btn" })
    setIcon(searchBtn, "search")
    searchBtn.onClickEvent(() => {
      this.searchActive = !this.searchActive
      this.searchRowEl.classList.toggle("cc-open", this.searchActive)
      searchBtn.classList.toggle("cc-active", this.searchActive)
      if (this.searchActive) {
        this.searchInputEl.value = this.searchQuery
        this.searchInputEl.focus()
      } else {
        this.searchQuery = ""
        if (this.searchTimer) window.clearTimeout(this.searchTimer)
        void this.loadFiles()
      }
    })

    this.viewToggleEl = right.createSpan({ cls: "cc-toolbar-btn" })
    setIcon(this.viewToggleEl, "grid")
    this.viewToggleEl.onClickEvent(() => {
      this.viewMode = this.viewMode === "list" ? "grid" : "list"
      this.updateToggleIcon()
      this.render()
    })

    this.searchRowEl = this.contentEl.createDiv("cc-search-row")
    this.searchInputEl = this.searchRowEl.createEl("input", {
      type: "text",
      cls: "cc-toolbar-search-input",
      placeholder: t("searchPlaceholder"),
    })
    this.searchInputEl.oninput = () => {
      this.searchQuery = this.searchInputEl.value
      if (this.searchTimer) window.clearTimeout(this.searchTimer)
      this.searchTimer = window.setTimeout(() => void this.loadFiles(), 300)
    }
  }

  private renderFolderIcon(parent: HTMLElement) {
    const ns = "http://www.w3.org/2000/svg"
    const svg = activeDocument.createElementNS(ns, "svg")
    svg.setAttribute("viewBox", "0 0 24 24")
    svg.setAttribute("width", "100%")
    svg.setAttribute("height", "100%")
    svg.addClass("svg-icon")
    const path = activeDocument.createElementNS(ns, "path")
    path.setAttribute("d", "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z")
    path.setAttribute("fill", "none")
    path.setAttribute("stroke", "currentColor")
    path.setAttribute("stroke-width", "2")
    path.setAttribute("stroke-linecap", "round")
    path.setAttribute("stroke-linejoin", "round")
    svg.appendChild(path)
    parent.appendChild(svg)
  }

  private updateToggleIcon() {
    this.viewToggleEl.empty()
    setIcon(this.viewToggleEl, this.viewMode === "list" ? "grid" : "list")
    this.viewToggleEl.setAttr("aria-label", this.viewMode === "list" ? t("gridView") : t("listView"))
  }

  private updateBreadcrumb() {
    this.breadcrumbEl.empty()

    const parts = this.currentPath.split("/").filter(Boolean)
    const accum: string[] = []

    const addCrumb = (label: string, path: string, isLast: boolean, isRoot = false) => {
      const span = this.breadcrumbEl.createSpan({
        cls: isLast ? "cc-crumb-current" : "cc-crumb-link",
      })
      if (isRoot) {
        setIcon(span, "home")
      } else {
        span.textContent = label
      }
      if (!isLast) {
        span.onClickEvent(async () => {
          this.currentPath = path
          this.selected.clear()
          await this.loadFiles()
        })
      }
    }

    addCrumb("", "/", parts.length === 0, true)
    for (let i = 0; i < parts.length; i++) {
      accum.push(parts[i]!)
      this.breadcrumbEl.createSpan({ text: " / " })
      addCrumb(parts[i]!, "/" + accum.join("/"), i === parts.length - 1)
    }
  }

  private renderFileList() {
    this.contentEl.createDiv("cc-file-list")
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
      this.selected.clear()
      this.loading = false
      this.render()
    } catch (e) {
      if (seq !== this.seq) return
      this.loading = false
      this.render()
      new Notice(t("readFailed", e instanceof Error ? e.message : String(e)))
    }
  }

  private render() {
    const { contentEl } = this

    contentEl.querySelector(".cc-file-list")?.remove()
    contentEl.querySelector(".cc-footer")?.remove()

    this.updateBreadcrumb()

    const list = contentEl.createDiv("cc-file-list")

    if (this.loading) {
      list.createEl("p", { text: t("loading"), cls: "cc-loading" })
    } else if (this.files.length === 0) {
      list.createEl("p", { text: t("emptyResult"), cls: "cc-empty" })
    } else {
      const sorted = [...this.files].sort((a, b) => {
        if (a.isdir !== b.isdir) return a.isdir ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      if (this.viewMode === "grid") {
        list.addClass("cc-file-grid")
        this.renderGrid(sorted, list)
      } else {
        this.renderList(sorted, list)
      }
    }

    this.renderFooter()
  }

  private renderList(sorted: CloudFileEntry[], list: HTMLElement) {
    for (const file of sorted) {
      const key = file.fsid
      const isSelected = this.selected.has(key)

      const row = list.createDiv("cc-file-row" + (isSelected ? " cc-selected" : ""))
      const cb = row.createSpan({ cls: "cc-file-checkbox" })
      cb.textContent = isSelected ? "✓" : ""
      cb.onClickEvent((e) => {
        e.stopPropagation()
        this.toggleSelect(key, row)
      })

      const fileNameSpan = row.createSpan({ cls: "cc-file-name" })
      const iconSpan = fileNameSpan.createSpan({ cls: "cc-file-type-icon" })
      if (file.isdir) {
        this.renderFolderIcon(iconSpan)
      } else {
        setIcon(iconSpan, this.getFileIcon(file.name))
      }
      fileNameSpan.createSpan({ text: " " + file.name })

      const sizeStr = file.isdir ? "" : this.formatSize(file.size)
      if (sizeStr) row.createSpan({ text: sizeStr, cls: "cc-file-size" })

      if (file.isdir) {
        row.onClickEvent(async () => {
          this.currentPath = file.path
          this.selected.clear()
          await this.loadFiles()
        })
      } else {
        row.onClickEvent(() => {
          if (this.selected.size > 0 || isSelected) {
            this.toggleSelect(key, row)
          } else {
            void this.onPick(file)
            this.close()
          }
        })
      }
    }
  }

  private renderGrid(sorted: CloudFileEntry[], list: HTMLElement) {
    for (const file of sorted) {
      const key = file.fsid
      const isSelected = this.selected.has(key)

      if (file.isdir) {
        const card = list.createDiv("cc-grid-card" + (isSelected ? " cc-selected" : ""))
        const preview = card.createDiv("cc-grid-preview")
        const iconSpan = preview.createSpan({ cls: "cc-grid-icon" })
        this.renderFolderIcon(iconSpan)
        const cb = card.createDiv("cc-grid-checkbox")
        cb.textContent = isSelected ? "✓" : ""
        cb.onClickEvent((e) => {
          e.stopPropagation()
          this.toggleSelect(key, card)
        })
        const nameEl = card.createDiv("cc-grid-name")
        nameEl.textContent = file.name
        card.onClickEvent(async () => {
          this.currentPath = file.path
          this.selected.clear()
          await this.loadFiles()
        })
        continue
      }

      const card = list.createDiv("cc-grid-card" + (isSelected ? " cc-selected" : ""))
      const preview = card.createDiv("cc-grid-preview")
      const iconSpan = preview.createSpan({ cls: "cc-grid-icon" })
      setIcon(iconSpan, this.getFileIcon(file.name))
      const cb = card.createDiv("cc-grid-checkbox")
      cb.textContent = isSelected ? "✓" : ""
      const nameEl = card.createDiv("cc-grid-name")
      nameEl.textContent = file.name

      card.onClickEvent(() => {
        this.toggleSelect(key, card)
      })
    }
  }

  private toggleSelect(key: string, el: HTMLElement) {
    if (this.selected.has(key)) {
      this.selected.delete(key)
      el.removeClass("cc-selected")
    } else {
      this.selected.add(key)
      el.addClass("cc-selected")
    }
    this.updateFooter()
  }

  private renderFooter() {
    const footer = this.contentEl.createDiv("cc-footer")
    this.footerEl = footer

    const count = footer.createSpan({ cls: "cc-footer-count" })
    count.textContent = t("selectedCount", "0")

    const btn = footer.createEl("button", { cls: "cc-insert-btn" })
    btn.textContent = t("insertSelected", "0")
    btn.onClickEvent(() => this.insertAllSelected())
  }

  private updateFooter() {
    if (!this.footerEl) return
    const count = this.selected.size
    this.footerEl.querySelector(".cc-footer-count")!.textContent = t("selectedCount", String(count))
    this.footerEl.querySelector(".cc-insert-btn")!.textContent = t("insertSelected", String(count))
  }

  private async insertAllSelected() {
    if (this.selected.size === 0) return
    const cns = this.cloudNodeService
    if (!cns) {
      for (const file of this.files) {
        if (this.selected.has(file.fsid)) {
          await this.onPick(file)
        }
      }
    } else {
      const center = cns.viewportCenter
      let yOff = 0
      for (const file of this.files) {
        if (!this.selected.has(file.fsid)) continue
        const pos = { x: center.x, y: center.y + yOff }
        if (file.isdir) {
          await cns.insertFolder(file, 1, pos)
          yOff += 200
        } else {
          await cns.insertCloudFile(file, pos)
          const ext = file.name.split(".").pop()?.toLowerCase() || ""
          const isWide = ["mp4", "mkv", "avi", "mov", "mp3", "wav", "flac"].includes(ext)
          const h = isWide ? (["mp4", "mkv", "avi", "mov"].includes(ext) ? 360 : 200) : 280
          yOff += h + 20
        }
      }
    }
    this.close()
  }

  private getFileIcon(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() || ""
    if (["mp4", "mkv", "avi", "mov"].includes(ext)) return "film"
    if (["mp3", "wav", "flac"].includes(ext)) return "music"
    if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) return "image"
    if (ext === "pdf") return "file-text"
    return "file"
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
  }
}
