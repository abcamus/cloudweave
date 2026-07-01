import { App, MarkdownRenderer, Component, setIcon } from "obsidian"
import { t } from "../i18n"

export class FloatingCard {
  private container: HTMLElement
  private contentEl: HTMLElement
  private _anchor: HTMLElement
  private renderComp: Component | null = null

  constructor(
    private app: App,
    anchor: HTMLElement,
  ) {
    this._anchor = anchor
    this.container = createDiv({ cls: "cc-floating-card" })
    this.container.hide()
    document.body.appendChild(this.container)

    const header = this.container.createDiv("cc-floating-card-header")
    const title = header.createSpan({ cls: "cc-floating-card-title", text: "AI" })

    const actions = header.createDiv("cc-floating-card-actions")

    const copyBtn = actions.createEl("button", { cls: "cc-floating-card-btn" })
    setIcon(copyBtn, "copy")
    copyBtn.onClickEvent(() => this.copyContent())

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
    const msg = this.contentEl.createSpan({ text: t("aiRequesting") })
    this.position()
    this.container.show()
  }

  async showResult(text: string) {
    this.renderComp?.unload()
    this.contentEl.removeClass("cc-floating-card-loading")
    this.contentEl.removeClass("cc-floating-card-error")
    this.contentEl.empty()

    this.renderComp = new Component()
    await MarkdownRenderer.render(this.app, text, this.contentEl, "", this.renderComp)
    this.contentEl.scrollTop = 0
    this.position()
    this.container.show()
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
    this.renderComp?.unload()
    this.container.remove()
  }
}
