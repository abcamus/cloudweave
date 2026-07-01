import { App, ItemView, Notice, setIcon } from "obsidian"
import { t } from "../i18n"
import { CANVAS_VIEW_TYPE } from "../constants"
import { CanvasService } from "../services/canvas-service"
import { ContextAIService } from "../services/context-ai-service"
import { LLMConfig } from "../types"
import { FloatingCard } from "./floating-card"

const PRESET_PROMPTS: Record<string, string> = {
  explain: "请解释选中的这些节点内容，并结合它们在画布上的空间排布和连线关系说明整体结构。",
  summarize: "请总结选中的这些节点的核心内容，提取关键信息。",
  relate: "请分析选中的这些节点之间的关联关系，包括空间位置关系、连线关系以及内容层面的联系。",
}

const CC_MENU_MARKER = "cc-ai-menu-items"

export class CanvasToolbar {
  private inputPopover: HTMLElement
  private questionInput: HTMLTextAreaElement
  private pollInterval: number
  private currentSelection: string[] = []
  private config: LLMConfig
  private card: FloatingCard

  constructor(
    private app: App,
    private canvasService: CanvasService,
    private aiService: ContextAIService,
  ) {
    this.config = this.loadConfig()
    this.card = new FloatingCard(this.app, document.body)
    this.buildPopover()
    this.startPolling()
  }

  private buildPopover() {
    this.inputPopover = createDiv({ cls: "cc-ai-popover" })
    this.inputPopover.hide()
    document.body.appendChild(this.inputPopover)

    const header = this.inputPopover.createDiv("cc-ai-popover-header")
    header.createSpan({ text: "💬 Ask AI about selected nodes" })
    const closeBtn = header.createEl("button", { cls: "cc-ai-popover-close" })
    setIcon(closeBtn, "x")
    closeBtn.onClickEvent(() => this.inputPopover.hide())

    const body = this.inputPopover.createDiv("cc-ai-popover-body")

    this.questionInput = body.createEl("textarea", {
      cls: "cc-ai-popover-textarea",
      attr: { placeholder: t("aiAskShort"), rows: "3" },
    }) as HTMLTextAreaElement

    const footer = this.inputPopover.createDiv("cc-ai-popover-footer")
    const hint = footer.createSpan({ cls: "cc-ai-popover-hint", text: "Enter 发送 · Shift+Enter 换行 · Esc 关闭" })

    const sendBtn = footer.createEl("button", { cls: "cc-ai-popover-send-btn" })
    setIcon(sendBtn, "arrow-up")

    const ask = () => {
      const q = this.questionInput.value.trim()
      if (!q) return
      this.inputPopover.hide()
      this.customQuery(q)
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
    this.pollInterval = window.setInterval(() => this.poll(), 500)
  }

  private getCardMenu(): HTMLElement | null {
    const view = this.app.workspace.getActiveViewOfType(ItemView)
    if (!view || view.getViewType() !== CANVAS_VIEW_TYPE) return null
    const container = (view as any).contentEl || (view as any).containerEl
    if (!container) return null
    return container.querySelector(".canvas-card-menu") as HTMLElement | null
  }

  private poll() {
    this.canvasService.refresh()

    if (document.querySelector(".modal-container")) {
      this.hideUI()
      return
    }

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
    this.card.setAnchor(menuEl)
  }

  private hideUI() {
    this.currentSelection = []
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
      const btn = wrapper.createEl("div", {
        cls: "canvas-card-menu-button mod-draggable",
        attr: { "aria-label": cfg.label, "data-tooltip-position": "top" },
      })
      setIcon(btn, cfg.icon)
      btn.onClickEvent(() => this.handleAction(cfg.action))
    }
  }

  private handleAction(action: string) {
    if (action === "explain" || action === "summarize" || action === "relate") {
      this.runPreset(action)
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

    const prompt = PRESET_PROMPTS[action]
    this.card.showLoading()

    try {
      const context = await this.aiService.buildContext(ids)
      const answer = await this.aiService.queryLLM(context, prompt, this.config)
      this.card.showResult(answer)
    } catch (e) {
      this.card.showError(e.message)
    }
  }

  private async customQuery(question: string) {
    if (!this.checkConfig()) return

    const ids = this.canvasService.getSelectedNodeIds()
    if (ids.length === 0) {
      new Notice(t("aiNoNodes"))
      return
    }

    this.card.showLoading()

    try {
      const context = await this.aiService.buildContext(ids)
      const answer = await this.aiService.queryLLM(context, question, this.config)
      this.card.showResult(answer)
    } catch (e) {
      this.card.showError(e.message)
    }
  }

  refreshConfig() {
    this.config = this.loadConfig()
  }

  private loadConfig(): LLMConfig {
    const raw = localStorage.getItem("cc-llm-config")
    if (raw) {
      try {
        return JSON.parse(raw)
      } catch { /* ignore */ }
    }
    return { provider: "openai", apiKey: "", model: "gpt-4o-mini" }
  }

  unmount() {
    window.clearInterval(this.pollInterval)
    this.card.unmount()
    this.inputPopover.remove()
  }
}
