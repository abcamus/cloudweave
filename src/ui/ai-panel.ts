import { App, Notice } from "obsidian"
import { t } from "../i18n"
import { CanvasService } from "../services/canvas-service"
import { ContextAIService } from "../services/context-ai-service"
import { LLMConfig } from "../types"

export class AIPanel {
  private container: HTMLElement
  private questionEl: HTMLTextAreaElement
  private answerEl: HTMLElement
  private sendBtn: HTMLElement
  private contextInfoEl: HTMLElement
  private config: LLMConfig
  private selectionObserver: number | undefined

  constructor(
    private app: App,
    private canvasService: CanvasService,
    private aiService: ContextAIService,
    private onOpenSettings: () => void
  ) {
    this.config = this.loadConfig()
  }

  mount(container: HTMLElement) {
    this.container = container
    container.empty()
    container.addClass("cc-ai-panel")

    const header = container.createDiv("cc-ai-header")
    header.createEl("h3", { text: t("aiTitle") })

    const settingsBtn = header.createEl("button", { text: "⚙️", cls: "cc-ai-settings-btn" })
    settingsBtn.onClickEvent(() => this.onOpenSettings())

    this.contextInfoEl = container.createDiv("cc-ai-context-info")
    this.updateContextInfo()

    this.questionEl = container.createEl("textarea", {
      cls: "cc-ai-question",
      attr: { placeholder: t("aiAskPlaceholder") },
    })

    this.sendBtn = container.createEl("button", {
      text: t("aiSend"),
      cls: "cc-ai-send-btn",
    })
    this.sendBtn.onClickEvent(() => this.sendQuery())

    this.answerEl = container.createDiv("cc-ai-answer")
    this.answerEl.setText(t("aiWait"))

    this.registerSelectionObserver()
  }

  private registerSelectionObserver() {
    this.selectionObserver = window.setInterval(() => this.updateContextInfo(), 1000)
  }

  private updateContextInfo() {
    const ids = this.canvasService.getSelectedNodeIds()
    this.contextInfoEl?.setText(t("aiContextInfo", String(ids.length)))
  }

  unmount() {
    if (this.selectionObserver != null) window.clearInterval(this.selectionObserver)
    this.container?.empty()
  }

  private async sendQuery() {
    const question = this.questionEl.value.trim()
    if (!question) return

    const nodeIds = this.canvasService.getSelectedNodeIds()
    if (nodeIds.length === 0) {
      new Notice(t("aiNoNodes"))
      return
    }

    this.answerEl.setText(t("aiBuildingContext"))
    this.sendBtn.setText(t("aiProcessing"))
    this.sendBtn.addClass("cc-disabled")

    try {
      const context = await this.aiService.buildContext(nodeIds)
      this.answerEl.setText(
        `${t("aiContextLoaded", String(context.textContents.length), String(context.totalTokens))}\n\n${t("aiRequesting")}`
      )

      const answer = await this.aiService.queryLLM(context, question, this.config)
      this.answerEl.setText(answer)
    } catch (e) {
      this.answerEl.setText(t("aiError", e instanceof Error ? e.message : String(e)))
    } finally {
      this.sendBtn.setText(t("aiSend"))
      this.sendBtn.removeClass("cc-disabled")
    }
  }

  private loadConfig(): LLMConfig {
    const raw = this.app.loadLocalStorage("cc-llm-config") as string | null
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as LLMConfig
      } catch {
        /* ignore */
      }
    }
    return {
      provider: "openai",
      apiKey: "",
      model: "gpt-4o-mini",
    }
  }
}
