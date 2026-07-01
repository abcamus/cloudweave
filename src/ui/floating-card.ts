import { App, MarkdownRenderer, Component, Notice, setIcon } from "obsidian"
import { t } from "../i18n"

export class FloatingCard {
  private container: HTMLElement
  private contentEl: HTMLElement
  private _anchor: HTMLElement
  private renderComp: Component | null = null
  private streamingText = ""
  private copyBtn: HTMLElement
  private streamTimer: number | null = null
  private isRendered = false

  constructor(
    private app: App,
    anchor: HTMLElement,
  ) {
    this._anchor = anchor
    this.container = createDiv({ cls: "cc-floating-card" })
    this.container.hide()
    document.body.appendChild(this.container)

    const header = this.container.createDiv("cc-floating-card-header")
    header.createSpan({ cls: "cc-floating-card-title", text: "AI" })

    const actions = header.createDiv("cc-floating-card-actions")

    this.copyBtn = actions.createEl("button", { cls: "cc-floating-card-btn" })
    setIcon(this.copyBtn, "copy")
    this.copyBtn.onClickEvent(() => this.copyContent())

    const closeBtn = actions.createEl("button", { cls: "cc-floating-card-btn" })
    setIcon(closeBtn, "x")
    closeBtn.onClickEvent(() => this.hide())

    this.contentEl = this.container.createDiv("cc-floating-card-content")
    this.contentEl.setText(t("aiWait"))

    this.container.addEventListener("mousedown", (e) => e.stopPropagation())
    this.container.addEventListener("mouseup", (e) => e.stopPropagation())
  }

  private async copyContent() {
    const text = this.contentEl.textContent || ""
    await navigator.clipboard.writeText(text)
    new Notice(t("aiCopied"))
    setIcon(this.copyBtn, "check")
    setTimeout(() => setIcon(this.copyBtn, "copy"), 1500)
  }

  setAnchor(el: HTMLElement) {
    this._anchor = el
  }

  showLoading() {
    this.renderComp?.unload()
    this.renderComp = null
    this.contentEl.empty()
    this.contentEl.removeClass("cc-floating-card-error")
    this.contentEl.addClass("cc-floating-card-loading")
    this.contentEl.createSpan({ text: t("aiRequesting") })
    this.position()
    this.container.show()
  }

  showStreaming() {
    this.renderComp?.unload()
    this.renderComp = null
    this.contentEl.empty()
    this.contentEl.removeClass("cc-floating-card-loading")
    this.contentEl.removeClass("cc-floating-card-error")
    this.streamingText = ""
    this.isRendered = false
    if (this.streamTimer) {
      clearTimeout(this.streamTimer)
      this.streamTimer = null
    }
    this.position()
    this.container.show()
  }

  appendStream(chunk: string) {
    this.streamingText += chunk
    this.contentEl.setText(this.streamingText)
    this.contentEl.scrollTop = this.contentEl.scrollHeight
    this.position()

    if (this.streamTimer) clearTimeout(this.streamTimer)
    this.streamTimer = window.setTimeout(() => this.renderStreamMd(), 400)
  }

  private async renderStreamMd() {
    const text = this.streamingText
    if (!text.trim()) return

    this.renderComp?.unload()
    this.contentEl.empty()
    this.renderComp = new Component()
    await MarkdownRenderer.render(this.app, text, this.contentEl, "", this.renderComp)
    this.contentEl.scrollTop = this.contentEl.scrollHeight
    this.position()
    this.isRendered = true
  }

  async showResult(text: string) {
    if (this.streamTimer) {
      clearTimeout(this.streamTimer)
      this.streamTimer = null
    }
    this.renderComp?.unload()
    this.contentEl.removeClass("cc-floating-card-loading")
    this.contentEl.removeClass("cc-floating-card-error")
    this.contentEl.empty()

    this.renderComp = new Component()
    await MarkdownRenderer.render(this.app, text, this.contentEl, "", this.renderComp)
    this.contentEl.scrollTop = 0
    this.position()
    this.container.show()
    this.isRendered = false
  }

  showError(message: string) {
    this.renderComp?.unload()
    this.renderComp = null
    this.contentEl.removeClass("cc-floating-card-loading")
    this.contentEl.empty()
    this.contentEl.addClass("cc-floating-card-error")
    this.contentEl.setText(`❌ ${t("aiError", message)}`)
    this.position()
    this.container.show()
  }

  hide() {
    this.container.hide()
  }

  private position() {
    const anchorRect = this._anchor.getBoundingClientRect()
    const cardW = 420
    const cardH = this.container.offsetHeight || 240
    const gap = 8

    let left = anchorRect.right + gap
    if (left + cardW > window.innerWidth - gap) {
      left = Math.max(gap, anchorRect.left - cardW - gap)
    }

    let top = anchorRect.top
    if (top + cardH > window.innerHeight - gap) {
      top = window.innerHeight - cardH - gap
    }
    if (top < gap) top = gap

    this.container.style.left = `${left}px`
    this.container.style.top = `${top}px`
  }

  unmount() {
    if (this.streamTimer) clearTimeout(this.streamTimer)
    this.renderComp?.unload()
    this.container.remove()
  }
}
