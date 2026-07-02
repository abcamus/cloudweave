import { Plugin, Notice, setIcon } from "obsidian"
import { initLocale, t } from "./i18n"
import { CanvasService } from "./services/canvas-service"
import { SyncVaultBridge } from "./services/sync-vault-bridge"
import { ContextAIService } from "./services/context-ai-service"
import { InsertCloudNodeCommand } from "./commands/insert-cloud-node"
import { TimestampCommand } from "./commands/timestamp"
import { CanvasToolbar } from "./ui/canvas-toolbar"
import { ContextCanvasSettingTab } from "./ui/settings-tab"

interface MenuEl {
  hide?: () => void
}

interface CanvasLeafView {
  canvas?: {
    selectOnly?: (nodeId: string) => void
  }
}

export default class ContextCanvasPlugin extends Plugin {
  private canvasService: CanvasService
  private syncVault: SyncVaultBridge
  private aiService: ContextAIService
  private insertCloudNodeCmd: InsertCloudNodeCommand
  private timestampCmd: TimestampCommand
  private toolbar: CanvasToolbar | null = null
  private menuObserver: MutationObserver | null = null
  private isCanvasBgContextMenu = false
  private isCanvasNodeContextMenu = false

  async onload() {
    initLocale()
    this.canvasService = new CanvasService(this.app)
    this.syncVault = new SyncVaultBridge()
    this.aiService = new ContextAIService(this.app, this.canvasService, this.syncVault)
    this.insertCloudNodeCmd = new InsertCloudNodeCommand(this.app, this.canvasService, this.syncVault)
    this.timestampCmd = new TimestampCommand(this.app, this.canvasService)
    this.toolbar = new CanvasToolbar(this.app, this.canvasService, this.aiService, this.syncVault)

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
      callback: () => this.timestampCmd.recordTimestamp(0),
    })

  }

  private initCanvasContextMenu() {
    activeDocument.addEventListener("contextmenu", (e) => {
      const target = e.target as HTMLElement
      const inCanvas = !!target.closest(".canvas-wrapper")
      const onNode = !!target.closest(".canvas-node")
      this.isCanvasBgContextMenu = inCanvas && !onNode
      this.isCanvasNodeContextMenu = inCanvas && onNode
    }, true)

    this.menuObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "childList") continue
        if (!this.isCanvasBgContextMenu && !this.isCanvasNodeContextMenu) continue
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const el = mutation.addedNodes[i] as HTMLElement
          if (el.nodeType !== Node.ELEMENT_NODE) continue
          if (el.matches?.(".menu")) {
            if (this.isCanvasBgContextMenu) this.injectMenuItem(el)
            if (this.isCanvasNodeContextMenu) this.injectAINodeMenuItems(el)
          } else {
            const menus = el.querySelectorAll(".menu")
            for (let j = 0; j < menus.length; j++) {
              const menu = menus[j] as HTMLElement
              if (this.isCanvasBgContextMenu) this.injectMenuItem(menu)
              if (this.isCanvasNodeContextMenu) this.injectAINodeMenuItems(menu)
            }
          }
        }
      }
    })

    this.menuObserver.observe(activeDocument.body, { childList: true, subtree: true })
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
      void (menu as MenuEl).hide?.()
      void this.insertCloudNodeCmd.execute()
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

  private injectAINodeMenuItems(menu: HTMLElement) {
    if (menu.querySelector(".cc-ai-menu-item")) return

    const scroll = menu.querySelector(".menu-scroll")
    if (!scroll) return

    const actions = [
      { action: "explain", icon: "search", label: t("aiExplain") },
      { action: "summarize", icon: "list", label: t("aiSummarize") },
      { action: "relate", icon: "git-branch", label: t("aiRelate") },
      { action: "ask", icon: "message-square", label: "Ask" },
    ]

    const separator = createDiv({ cls: "menu-separator" })
    scroll.appendChild(separator)

    const group = createDiv({ cls: "menu-group" })
    scroll.appendChild(group)

    for (const cfg of actions) {
      const item = createDiv({ cls: "menu-item tappable cc-ai-menu-item" })
      item.dataset.section = "cc-ai"
      item.onClickEvent(() => {
        void (menu as MenuEl).hide?.()
        this.toolbar?.handleAction(cfg.action)
      })
      item.onmouseenter = () => item.addClass("selected")
      item.onmouseleave = () => item.removeClass("selected")

      const icon = createSpan({ cls: "menu-item-icon" })
      setIcon(icon, cfg.icon)
      item.appendChild(icon)

      const titleEl = createSpan({ cls: "menu-item-title", text: cfg.label })
      item.appendChild(titleEl)

      group.appendChild(item)
    }
  }

  private registerCodeMirrorProtocol() {
    this.registerDomEvent(activeDocument, "click", (e) => {
      const target = e.target as HTMLElement
      const href = target.getAttribute("href")
      if (!href?.startsWith("cc-timestamp://")) return

      const [, nodeId, timeStr] = href.split("/")
      const time = parseFloat(timeStr)
      if (isNaN(time)) return

      e.preventDefault()
      void this.jumpToTimestamp(nodeId, time)
    })
  }

  private async jumpToTimestamp(nodeId: string, time: number) {
    const leaf = this.app.workspace.getLeavesOfType("canvas")[0]
    if (!leaf) {
      new Notice(t("openCanvasFirst"))
      return
    }

    this.app.workspace.setActiveLeaf(leaf, { focus: true })
    void (leaf.view as CanvasLeafView).canvas?.selectOnly?.(nodeId)
  }

  onunload() {
    this.toolbar?.unmount()
    this.menuObserver?.disconnect()
  }
}
