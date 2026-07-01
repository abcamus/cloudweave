import { Plugin, Notice, setIcon } from "obsidian"
import { initLocale, t } from "./i18n"
import { CanvasService } from "./services/canvas-service"
import { SyncVaultBridge } from "./services/sync-vault-bridge"
import { ContextAIService } from "./services/context-ai-service"
import { InsertCloudNodeCommand } from "./commands/insert-cloud-node"
import { TimestampCommand } from "./commands/timestamp"
import { CanvasToolbar } from "./ui/canvas-toolbar"
import { ContextCanvasSettingTab } from "./ui/settings-tab"

export default class ContextCanvasPlugin extends Plugin {
  private canvasService: CanvasService
  private syncVault: SyncVaultBridge
  private aiService: ContextAIService
  private insertCloudNodeCmd: InsertCloudNodeCommand
  private timestampCmd: TimestampCommand
  private toolbar: CanvasToolbar | null = null
  private menuObserver: MutationObserver | null = null
  private isCanvasContextMenu = false

  async onload() {
    initLocale()
    this.canvasService = new CanvasService(this.app)
    this.syncVault = new SyncVaultBridge()
    this.aiService = new ContextAIService(this.app, this.canvasService)
    this.insertCloudNodeCmd = new InsertCloudNodeCommand(this.app, this.canvasService, this.syncVault)
    this.timestampCmd = new TimestampCommand(this.app, this.canvasService)
    this.toolbar = new CanvasToolbar(this.app, this.canvasService, this.aiService)

    this.registerCommands()
    this.initCanvasContextMenu()
    this.registerCodeMirrorProtocol()

    this.addSettingTab(new ContextCanvasSettingTab(this.app, this))
  }

  private registerCommands() {
    this.addCommand({
      id: "insert-cloud-node",
      name: t("insertCloudNode"),
      callback: () => this.insertCloudNodeCmd.execute(),
    })

    this.addCommand({
      id: "record-timestamp",
      name: t("recordTimestamp"),
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: " " }],
      callback: () => this.timestampCmd.recordTimestamp(0),
    })

  }

  private initCanvasContextMenu() {
    document.addEventListener("contextmenu", (e) => {
      this.isCanvasContextMenu = !!(e.target as HTMLElement).closest(".canvas-wrapper")
    }, true)

    this.menuObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "childList") continue
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i]
          if (!(node instanceof HTMLElement)) continue
          if (!this.isCanvasContextMenu) continue
          if (node.matches?.(".menu")) {
            this.injectMenuItem(node)
          } else {
            const menus = node.querySelectorAll(".menu")
            for (let j = 0; j < menus.length; j++) {
              this.injectMenuItem(menus[j] as HTMLElement)
            }
          }
        }
      }
    })

    this.menuObserver.observe(document.body, { childList: true, subtree: true })
  }

  private injectMenuItem(menu: HTMLElement) {
    if (menu.querySelector(".cc-insert-cloud")) return

    const scroll = menu.querySelector(".menu-scroll")
    if (!scroll) return

    const separator = createDiv({ cls: "menu-separator" })
    scroll.appendChild(separator)

    const group = createDiv({ cls: "menu-group" })
    scroll.appendChild(group)

    const item = createDiv({ cls: "menu-item tappable cc-insert-cloud" })
    item.dataset.section = "cc-insert"
    item.onClickEvent(() => {
      (menu as any).hide?.()
      this.insertCloudNodeCmd.execute()
    })
    item.onmouseenter = () => item.addClass("selected")
    item.onmouseleave = () => item.removeClass("selected")

    const icon = createSpan({ cls: "menu-item-icon" })
    setIcon(icon, "cloud")
    item.appendChild(icon)

    const titleEl = createSpan({ cls: "menu-item-title", text: t("insertCloudNode") })
    item.appendChild(titleEl)

    group.appendChild(item)
  }

  private registerCodeMirrorProtocol() {
    this.registerDomEvent(document, "click", (e) => {
      const target = e.target as HTMLElement
      const href = target.getAttribute("href")
      if (!href?.startsWith("cc-timestamp://")) return

      const [, nodeId, timeStr] = href.split("/")
      const time = parseFloat(timeStr)
      if (isNaN(time)) return

      e.preventDefault()
      this.jumpToTimestamp(nodeId, time)
    })
  }

  private async jumpToTimestamp(nodeId: string, time: number) {
    const leaf = this.app.workspace.getLeavesOfType("canvas")[0]
    if (!leaf) {
      new Notice("请先打开 Canvas 文件")
      return
    }

    this.app.workspace.setActiveLeaf(leaf, { focus: true })
    ;(leaf.view as any).canvas?.selectOnly?.(nodeId)
  }

  onunload() {
    this.toolbar?.unmount()
    this.menuObserver?.disconnect()
  }
}
