import { App, ItemView, Notice, setIcon } from "obsidian"
import { t } from "../i18n"
import { CANVAS_VIEW_TYPE } from "../constants"
import { CanvasService } from "../services/canvas-service"
import { ContextAIService } from "../services/context-ai-service"
import { SyncVaultBridge } from "../services/sync-vault-bridge"
import { CloudNodeService } from "../services/cloud-node-service"
import { CloudFilePickerModal } from "./cloud-file-picker"
import { LLMConfig } from "../types"

const PRESET_PROMPTS: Record<string, string> = {
  explain: "解释以下节点内容，结合画布上的空间排布和连线关系简要说明整体结构。直接回答，不要使用\"根据您提供的信息\"\"我们可以得知\"等套话，不要总结你自己的分析过程。",
  summarize: "总结以下节点的核心内容，提取关键信息。直接回答，不要使用套话，不要总结你自己的分析过程。",
  relate: "分析以下节点之间的关联关系，包括空间位置关系、连线关系以及内容层面的联系。直接回答，不要使用套话，不要总结你自己的分析过程。",
}

const CC_MENU_MARKER = "cc-ai-menu-items"
const CC_CLOUD_MARKER = "cc-cloud-insert-btn"
const CC_LAYOUT_MARKER = "cc-layout-btn"

type CanvasView = ItemView & { contentEl?: HTMLElement }

export class CanvasToolbar {
  private inputPopover!: HTMLElement
  private questionInput!: HTMLTextAreaElement
  private pollInterval!: number
  private currentSelection: string[] = []
  private config: LLMConfig

  constructor(
    private app: App,
    private canvasService: CanvasService,
    private aiService: ContextAIService,
    private syncVault: SyncVaultBridge,
  ) {
    this.config = this.loadConfig()
    this.buildPopover()
    this.startPolling()
  }

  private buildPopover() {
    this.inputPopover = createDiv({ cls: "cc-ai-popover" })
    this.inputPopover.hide()
    activeDocument.body.appendChild(this.inputPopover)

    const header = this.inputPopover.createDiv("cc-ai-popover-header")
    header.createSpan({ text: "💬 Ask AI about selected nodes" })
    const closeBtn = header.createEl("button", { cls: "cc-ai-popover-close" })
    setIcon(closeBtn, "x")
    closeBtn.onClickEvent(() => this.inputPopover.hide())

    const body = this.inputPopover.createDiv("cc-ai-popover-body")

    this.questionInput = body.createEl("textarea", {
      cls: "cc-ai-popover-textarea",
      attr: { placeholder: t("aiAskShort"), rows: "3" },
    })

    const footer = this.inputPopover.createDiv("cc-ai-popover-footer")
    footer.createSpan({ cls: "cc-ai-popover-hint", text: "Enter 发送 · Shift+Enter 换行 · Esc 关闭" })

    const sendBtn = footer.createEl("button", { cls: "cc-ai-popover-send-btn" })
    setIcon(sendBtn, "arrow-up")

    const ask = () => {
      const q = this.questionInput.value.trim()
      if (!q) return
      this.inputPopover.hide()
      void this.customQuery(q)
    }

    sendBtn.onClickEvent(ask)

    this.questionInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        ask()
      }
      if (e.key === "Escape") {
        this.inputPopover.hide()
      }
    })

    this.questionInput.addEventListener("input", () => {
      sendBtn.toggleClass("cc-active", this.questionInput.value.trim().length > 0)
    })
  }

  private startPolling() {
    this.pollInterval = window.setInterval(() => this.poll(), 1000)
  }

  private getCanvasView(): CanvasView | null {
    const view = this.app.workspace.getActiveViewOfType(ItemView)
    if (!view || view.getViewType() !== CANVAS_VIEW_TYPE) return null
    return view
  }

  private getCardMenu(): HTMLElement | null {
    const view = this.getCanvasView()
    if (!view) return null
    const container = view.contentEl || view.containerEl
    if (!container) return null
    return container.querySelector(".canvas-menu")
  }

  private getCardMenuContainer(): HTMLElement | null {
    const view = this.getCanvasView()
    if (!view) return null
    const container = view.contentEl || view.containerEl
    if (!container) return null
    return container.querySelector(".canvas-card-menu")
  }

  private poll() {
    this.canvasService.refresh()

    if (activeDocument.querySelector(".modal-container")) {
      this.hideUI()
      return
    }

    this.injectCloudButton()
    this.injectLayoutButton()

    const menuEl = this.getCardMenu()
    if (!menuEl) {
      this.hideUI()
      return
    }

    const ids = this.canvasService.getSelectedNodeIds()
    if (ids.length === 0) {
      this.hideUI()
      return
    }

    if (ids.length === this.currentSelection.length && ids.every((id, i) => id === this.currentSelection[i])) return

    this.currentSelection = ids
    this.injectItems(menuEl)
  }

  private hideUI() {
    this.currentSelection = []
  }

  private injectCloudButton() {
    const cardMenu = this.getCardMenuContainer()
    if (!cardMenu) return
    if (cardMenu.querySelector(`.${CC_CLOUD_MARKER}`)) return

    const btn = cardMenu.createDiv({
      cls: `canvas-card-menu-button mod-draggable ${CC_CLOUD_MARKER}`,
      attr: { "aria-label": t("insertCloudNode"), "data-tooltip-position": "top" },
    })
    setIcon(btn, "cloud")
    btn.onClickEvent(() => this.openCloudPicker())
  }

  private injectLayoutButton() {
    const controls = activeDocument.querySelector(".canvas-controls")
    if (!controls) return
    if (controls.querySelector(`.${CC_LAYOUT_MARKER}`)) {
      return
    }

    const group = createDiv({ cls: "canvas-control-group mod-raised" })
    const btn = group.createDiv({
      cls: `canvas-control-item ${CC_LAYOUT_MARKER}`,
      attr: { "aria-label": "Auto layout", "data-tooltip-position": "left" },
    })
    setIcon(btn, "grid")
    controls.appendChild(group)

    btn.onClickEvent(() => {
      void this.canvasService.layoutGrid(4)
    })
  }

  private async openCloudPicker() {
    this.canvasService.refresh()
    if (!this.canvasService.getCanvas()) {
      new Notice(t("openCanvasFirst"))
      return
    }

    const ready = await this.syncVault.ensureReady()
    if (!ready) {
      new Notice(t("mcpNotReady"))
      return
    }

    const cloudNodeService = new CloudNodeService(this.app, this.canvasService, this.syncVault)
    const modal = new CloudFilePickerModal(this.app, this.syncVault, (file) => {
      return cloudNodeService.insertCloudFile(file)
    }, cloudNodeService)
    modal.open()
  }

  private injectItems(menuEl: HTMLElement) {
    if (menuEl.querySelector(`.${CC_MENU_MARKER}`)) return

    const wrapper = createDiv({ cls: CC_MENU_MARKER })
    menuEl.appendChild(wrapper)

    const btns: Array<{ action: string; icon: string; label: string }> = [
      { action: "explain", icon: "search", label: t("aiExplain") },
      { action: "summarize", icon: "list", label: t("aiSummarize") },
      { action: "relate", icon: "git-branch", label: t("aiRelate") },
      { action: "ask", icon: "message-square", label: "Ask" },
    ]

    for (const cfg of btns) {
      const btn = wrapper.createEl("button", {
        cls: "clickable-icon",
        attr: { "aria-label": cfg.label, "data-tooltip-position": "top" },
      })
      setIcon(btn, cfg.icon)
      btn.onClickEvent(() => this.handleAction(cfg.action))
    }
  }

  handleAction(action: string) {
    if (action === "explain" || action === "summarize" || action === "relate") {
      void this.runPreset(action)
    } else if (action === "ask") {
      this.showInputPopover()
    }
  }

  private showInputPopover() {
    const menuEl = this.getCardMenu()
    if (!menuEl) return

    this.inputPopover.show()
    const rect = menuEl.getBoundingClientRect()
    const popoverH = this.inputPopover.offsetHeight || 160

    let top: number
    if (rect.top - popoverH - 8 >= 8) {
      top = rect.top - popoverH - 8
    } else {
      top = rect.bottom + 8
    }

    this.inputPopover.style.left = `${Math.max(8, rect.left)}px`
    this.inputPopover.style.top = `${top}px`
    this.questionInput.value = ""
    this.questionInput.focus()
  }

  private checkConfig(): boolean {
    this.config = this.loadConfig()
    if (this.config.provider !== "local" && !this.config.apiKey) {
      new Notice(t("aiConfigFirst"))
      return false
    }
    return true
  }

  private async runPreset(action: string) {
    if (!this.checkConfig()) return

    const ids = this.canvasService.getSelectedNodeIds()
    if (ids.length === 0) {
      new Notice(t("aiNoNodes"))
      return
    }

    const edgeLabels: Record<string, string> = {
      explain: "解释",
      summarize: "总结",
      relate: "关联",
    }
    const edgeLabel = edgeLabels[action] || action

    const nodeId = await this.createAIReplyNode(edgeLabel, ids)
    if (!nodeId) return

    try {
      const prompt = PRESET_PROMPTS[action]!
      const context = await this.aiService.buildContext(ids)
      const answer = await this.aiService.queryLLM(context, prompt, this.config)
      await this.updateAINodeContent(nodeId, answer)
    } catch (e) {
      await this.updateAINodeContent(nodeId, `❌ ${t("aiError", e instanceof Error ? e.message : String(e))}`)
    }
  }

  private async customQuery(question: string) {
    if (!this.checkConfig()) return

    const ids = this.canvasService.getSelectedNodeIds()
    if (ids.length === 0) {
      new Notice(t("aiNoNodes"))
      return
    }

    const truncatedLabel = question.length > 20 ? question.slice(0, 20) + "…" : question
    const nodeId = await this.createAIReplyNode(truncatedLabel, ids)
    if (!nodeId) return

    try {
      const context = await this.aiService.buildContext(ids)
      const answer = await this.aiService.queryLLM(context, question, this.config)
      await this.updateAINodeContent(nodeId, answer)
    } catch (e) {
      await this.updateAINodeContent(nodeId, `❌ ${t("aiError", e instanceof Error ? e.message : String(e))}`)
    }
  }

  private async createAIReplyNode(edgeLabel: string, sourceIds: string[]): Promise<string | null> {
    const data = await this.canvasService.getData()
    if (!data) return null

    const nodeId = `ai-result-${Date.now()}`
    const sourceNodes = data.nodes.filter(n => sourceIds.includes(n.id))
    if (sourceNodes.length === 0) return null

    const avgX = sourceNodes.reduce((sum, n) => sum + n.x, 0) / sourceNodes.length
    const maxY = Math.max(...sourceNodes.map(n => n.y + n.height))

    data.nodes.push({
      id: nodeId,
      x: avgX,
      y: maxY + 40,
      width: 320,
      height: 80,
      type: "text",
      text: "⏳ Thinking...",
      color: "6",
    })

    for (const sourceId of sourceIds) {
      data.edges.push({
        id: `edge-${sourceId}-${nodeId}`,
        fromNode: sourceId,
        toNode: nodeId,
        label: edgeLabel,
      })
    }

    await this.canvasService.setData(data)
    return nodeId
  }

  private async updateAINodeContent(nodeId: string, content: string) {
    const data = await this.canvasService.getData()
    if (!data) return

    const node = data.nodes.find(n => n.id === nodeId)
    if (!node) return

    node.text = content
    node.height = Math.max(80, Math.min(600, Math.ceil(content.length / 80) * 24))

    await this.canvasService.setData(data)
  }

  refreshConfig() {
    this.config = this.loadConfig()
  }

  private loadConfig(): LLMConfig {
    const raw = this.app.loadLocalStorage("cc-llm-config") as string | null
    if (raw) {
      try {
        return JSON.parse(raw) as LLMConfig
      } catch { /* ignore */ }
    }
    return { provider: "openai", apiKey: "", model: "gpt-4o-mini" }
  }

  unmount() {
    window.clearInterval(this.pollInterval)
    this.inputPopover.remove()
  }
}
