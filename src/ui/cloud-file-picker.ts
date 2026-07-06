import { App, Modal, Notice, setIcon } from "obsidian"
import { t } from "../i18n"
import { CloudFileEntry, CloudDiskType } from "../types"
import { SyncVaultBridge } from "../services/sync-vault-bridge"
import { BilibiliService } from "../services/bilibili-service"
import { CloudNodeService } from "../services/cloud-node-service"

const PAGE_LIMIT = 100

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
  private selectAllBtn!: HTMLElement
  private footerEl: HTMLElement | null = null
  private offset = 0
  private total = 0
  private hasMore = false
  private insertMode: "grid" | "timeline"

  constructor(
    app: App,
    private syncVault: SyncVaultBridge,
    private onPick: (file: CloudFileEntry) => void | Promise<void>,
    private cloudNodeService?: CloudNodeService,
    private bilibiliService?: BilibiliService,
    insertMode: "grid" | "timeline" = "grid",
  ) {
    super(app)
    this.insertMode = insertMode
    this.titleEl.setText(insertMode === "timeline" ? `⏳ ${t("insertModeTimeline")}` : t("cloudInsertTitle"))
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

    const clouds: CloudDiskType[] = ["aliyun", "baidu", "quark", "onedrive", "115", "bilibili"]
    const cloudLabels: Record<string, string> = {
      aliyun: t("cloudLabelAliyun"),
      baidu: t("cloudLabelBaidu"),
      quark: t("cloudLabelQuark"),
      onedrive: t("cloudLabelOnedrive"),
      "115": t("cloudLabel115"),
      bilibili: t("cloudLabelBilibili"),
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
      if (this.currentCloud === "bilibili") {
        this.searchActive = true
        this.searchRowEl.classList.toggle("cc-open", this.searchActive)
        searchBtn.classList.toggle("cc-active", this.searchActive)
        this.searchInputEl.placeholder = t("searchBilibiliPlaceholder")
        this.searchInputEl.focus()
      } else {
        this.searchInputEl.placeholder = t("searchPlaceholder")
      }
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

    const selectAllBtn = right.createSpan({ cls: "cc-toolbar-btn cc-select-all-btn" })
    setIcon(selectAllBtn, "check-square")
    selectAllBtn.setAttr("aria-label", "Select all")
    selectAllBtn.onClickEvent(() => this.toggleSelectAll())
    this.selectAllBtn = selectAllBtn

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

  private async loadFiles(dir?: string, append = false) {
    const seq = ++this.seq
    this.loading = true
    this.render()

    try {
      const targetPath = dir ?? this.currentPath

      if (!append) {
        this.offset = 0
      }

      let result: { files: CloudFileEntry[]; total: number; hasMore: boolean }

      if (this.currentCloud === "bilibili") {
        if (!this.searchQuery) {
          result = { files: [], total: 0, hasMore: false }
        } else {
          const entries = await this.bilibiliService!.search(this.searchQuery)
          result = { files: entries, total: entries.length, hasMore: false }
        }
      } else if (this.searchQuery) {
        result = await this.syncVault.searchFiles(
          this.searchQuery,
          this.currentCloud,
          PAGE_LIMIT,
          this.offset,
        )
      } else {
        result = await this.syncVault.listFiles(targetPath, this.currentCloud, PAGE_LIMIT, this.offset)
      }

      if (seq !== this.seq) return

      if (append) {
        this.files.push(...result.files)
      } else {
        this.files = result.files
        this.selected.clear()
      }
      this.total = result.total
      this.hasMore = result.hasMore
      this.offset += result.files.length
      this.currentPath = targetPath
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

    if (this.currentCloud !== "bilibili") {
      this.updateBreadcrumb()
    } else {
      this.breadcrumbEl.empty()
    }

    const list = contentEl.createDiv("cc-file-list")

    if (this.loading) {
      list.createEl("p", { text: t("loading"), cls: "cc-loading" })
    } else if (this.files.length === 0) {
      if (this.currentCloud === "bilibili" && !this.searchQuery) {
        list.createEl("p", { text: "🔍 " + t("searchBilibiliPlaceholder"), cls: "cc-empty" })
      } else if (this.currentCloud === "bilibili") {
        list.createEl("p", { text: t("bilibiliNoResults"), cls: "cc-empty" })
      } else {
        list.createEl("p", { text: t("emptyResult"), cls: "cc-empty" })
      }
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

      if (this.hasMore) {
        const loadMoreBtn = list.createDiv({ cls: "cc-load-more" })
        loadMoreBtn.textContent = `加载更多 (${this.files.length}/${this.total})`
        const loadFn = async () => {
          loadMoreBtn.remove()
          await this.loadFiles(undefined, true)
        }
        loadMoreBtn.onClickEvent(loadFn)
        const obs = new IntersectionObserver((entries) => {
          if (entries[0]?.isIntersecting) {
            obs.disconnect()
            void loadFn()
          }
        }, { rootMargin: "200px" })
        obs.observe(loadMoreBtn)
      }
    }

    this.renderFooter()

    const allSelected = this.files.length > 0 && this.files.every(f => this.selected.has(f.fsid))
    this.selectAllBtn?.classList.toggle("cc-active", allSelected)
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
      if (file.thumb) {
        const thumb = fileNameSpan.createEl("img", { cls: "cc-file-thumb" })
        thumb.src = file.thumb
        thumb.alt = file.name
      } else {
        const iconSpan = fileNameSpan.createSpan({ cls: "cc-file-type-icon" })
        if (file.isdir) {
          this.renderFolderIcon(iconSpan)
        } else {
          setIcon(iconSpan, this.getFileIcon(file.name))
        }
      }
      fileNameSpan.createSpan({ text: " " + file.name })

      const sizeStr = file.isdir ? "" : this.formatSize(file.size)
      if (sizeStr) row.createSpan({ text: sizeStr, cls: "cc-file-size" })

      if (file.cloudType === "bilibili" && this.bilibiliService) {
        const uploadBtn = row.createSpan({ cls: "cc-toolbar-btn" })
        setIcon(uploadBtn, "upload-cloud")
        uploadBtn.setAttr("aria-label", t("uploadToBaidu"))
        uploadBtn.onClickEvent(async (e) => {
          e.stopPropagation()
          uploadBtn.addClass("cc-loading")
          try {
            await this.bilibiliService!.uploadToBaidu(file.fsid, file.name + ".mp4")
            new Notice(t("uploadBaiduSuccess", file.name))
          } catch (err) {
            new Notice(t("uploadBaiduFailed", err instanceof Error ? err.message : String(err)))
          } finally {
            uploadBtn.removeClass("cc-loading")
          }
        })
      }

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
      if (file.thumb) {
        const img = preview.createEl("img", { cls: "cc-grid-thumb" })
        img.src = file.thumb
        img.alt = file.name
      } else {
        const iconSpan = preview.createSpan({ cls: "cc-grid-icon" })
        setIcon(iconSpan, this.getFileIcon(file.name))
      }
      const cb = card.createDiv("cc-grid-checkbox")
      cb.textContent = isSelected ? "✓" : ""
      const nameEl = card.createDiv("cc-grid-name")
      nameEl.textContent = file.name

      if (file.cloudType === "bilibili" && this.bilibiliService) {
        const uploadBtn = card.createDiv({ cls: "cc-grid-upload-btn" })
        setIcon(uploadBtn, "upload-cloud")
        uploadBtn.setAttr("aria-label", t("uploadToBaidu"))
        uploadBtn.onClickEvent(async (e) => {
          e.stopPropagation()
          uploadBtn.addClass("cc-loading")
          try {
            await this.bilibiliService!.uploadToBaidu(file.fsid, file.name + ".mp4")
            new Notice(t("uploadBaiduSuccess", file.name))
          } catch (err) {
            new Notice(t("uploadBaiduFailed", err instanceof Error ? err.message : String(err)))
          } finally {
            uploadBtn.removeClass("cc-loading")
          }
        })
      }

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
    const cb = el.querySelector<HTMLElement>(".cc-file-checkbox, .cc-grid-checkbox")
    if (cb) cb.textContent = this.selected.has(key) ? "✓" : ""
    this.updateFooter()
  }

  private toggleSelectAll() {
    const allSelected = this.files.every(f => this.selected.has(f.fsid))
    if (allSelected) {
      this.selected.clear()
    } else {
      this.selected = new Set(this.files.map(f => f.fsid))
    }
    this.render()
  }

  private renderFooter() {
    const footer = this.contentEl.createDiv("cc-footer")
    this.footerEl = footer

    const count = footer.createSpan({ cls: "cc-footer-count" })
    count.textContent = t("selectedCount", String(this.selected.size))

    const btn = footer.createEl("button", { cls: "cc-insert-btn" })
    btn.textContent = t("insertSelected", String(this.selected.size))
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
    const selected = this.files.filter(f => this.selected.has(f.fsid))

    if (this.insertMode === "timeline" && this.cloudNodeService) {
      await this.cloudNodeService.buildTimelineGroup(selected)
    } else if (this.cloudNodeService) {
      await this.cloudNodeService.batchInsert(selected)
    } else {
      for (const file of selected) {
        await this.onPick(file)
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
