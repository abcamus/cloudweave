import { App, ItemView } from "obsidian"
import { Canvas, CanvasData } from "../types"
import { CANVAS_VIEW_TYPE } from "../constants"

type CanvasView = ItemView & { canvas?: Canvas }

interface CanvasInternal {
  posCenter?(): { x: number; y: number }
  getViewportCenter?(): { x: number; y: number }
  getScroll?(): { x: number; y: number; scale: number }
}

export class CanvasService {
  private activeCanvas: Canvas | null = null

  constructor(private app: App) {}

  refresh() {
    const view = this.app.workspace.getActiveViewOfType(ItemView)
    if (view?.getViewType() === CANVAS_VIEW_TYPE) {
      this.activeCanvas = (view as CanvasView).canvas ?? null
    } else {
      this.activeCanvas = null
    }
  }

  getCanvas(): Canvas | null {
    return this.activeCanvas
  }

  async getData(): Promise<CanvasData | null> {
    const canvas = this.getCanvas()
    if (!canvas) return null
    return await canvas.getData()
  }

  async setData(data: CanvasData): Promise<void> {
    const canvas = this.getCanvas()
    if (!canvas) return
    await canvas.setData(data)
    canvas.requestSave()
  }

  getSelectedNodeIds(): string[] {
    const canvas = this.getCanvas()
    if (canvas?.selection) {
      return Array.from(canvas.selection, n => n.id)
    }

    return Array.from(activeDocument.querySelectorAll(".canvas-node.is-selected"))
      .map(el => el.getAttribute("data-id") || el.id)
      .filter(Boolean)
  }

  async addCloudNode(
    nodeId: string,
    label: string,
    content: string,
    color: string,
    pos?: { x: number; y: number },
    width = 240,
    height = 280,
  ): Promise<void> {
    const canvas = this.getCanvas()
    if (!canvas) return

    const data = await this.getData()
    if (!data) return

    let x: number, y: number
    if (pos) {
      x = pos.x
      y = pos.y
    } else {
      const c = this.posCenter()
      x = c.x
      y = c.y
    }

    data.nodes.push({
      id: nodeId,
      x,
      y,
      width,
      height,
      type: "text",
      label,
      text: content,
      color,
    })

    await this.setData(data)
    this.scrollToNode(nodeId)
  }

  posCenter(): { x: number; y: number } {
    const canvas = this.getCanvas()
    if (canvas) {
      const internal = canvas as unknown as CanvasInternal
      if (typeof internal.posCenter === "function") {
        return internal.posCenter()
      }
    }
    return this.getViewportCenter()
  }

  private getViewportCenter(): { x: number; y: number } {
    const canvas = this.getCanvas()
    if (canvas) {
      const internal = canvas as unknown as CanvasInternal
      if (typeof internal.getViewportCenter === "function") {
        const pos = internal.getViewportCenter()
        if (pos && typeof pos.x === "number") {
          return { x: pos.x, y: pos.y }
        }
      }
      if (typeof internal.getScroll === "function") {
        const scroll = internal.getScroll()
        if (scroll && typeof scroll.x === "number" && typeof scroll.scale === "number") {
          const wrapper = activeDocument.querySelector(".canvas-wrapper") as HTMLElement
          if (wrapper) {
            return {
              x: scroll.x / scroll.scale + wrapper.clientWidth / (2 * scroll.scale),
              y: scroll.y / scroll.scale + wrapper.clientHeight / (2 * scroll.scale),
            }
          }
        }
      }
    }

    const wrapper = activeDocument.querySelector(".canvas-wrapper") as HTMLElement
    if (!wrapper) return { x: 200, y: 200 }

    const zoomArea = Array.from(wrapper.children).find((el) => {
      const e = el as HTMLElement
      const style = e.style.transform || window.getComputedStyle(e).transform
      return style && style !== "none"
    }) as HTMLElement | undefined

    if (!zoomArea) return { x: wrapper.clientWidth / 2, y: wrapper.clientHeight / 2 }

    let tx = 0, ty = 0, scale = 1
    const ts = zoomArea.style.transform || window.getComputedStyle(zoomArea).transform

    const matrix = ts.match(/matrix\(([^)]+)\)/)
    if (matrix) {
      const p = matrix[1].split(",").map(v => parseFloat(v.trim()))
      if (p.length >= 6) {
        tx = p[4] || 0
        ty = p[5] || 0
        scale = Math.abs(p[0]) || 1
      }
    } else {
      const m = ts.replace(/\s+/g, " ").match(/translate\(([^,]+),\s*([^)]+)\)\s*scale\(([^)]+)\)/)
      if (m) {
        tx = parseFloat(m[1]) || 0
        ty = parseFloat(m[2]) || 0
        scale = parseFloat(m[3]) || 1
      }
    }

    return {
      x: (-tx) / scale + wrapper.clientWidth / (2 * scale),
      y: (-ty) / scale + wrapper.clientHeight / (2 * scale),
    }
  }

  findRefNode(data: CanvasData): { x: number; y: number } {
    const ids = this.getSelectedNodeIds()
    if (ids.length > 0) {
      const n = data.nodes.find(n => ids.includes(n.id))
      if (n) return { x: n.x + n.width + 40, y: n.y }
    }

    return this.getViewportCenter()
  }

  scrollToNode(nodeId: string) {
    window.setTimeout(() => {
      const nodeEl = activeDocument.querySelector(`.canvas-node[data-id="${nodeId}"]`) as HTMLElement
      if (!nodeEl) return

    const wrapper = activeDocument.querySelector(".canvas-wrapper") as HTMLElement
      if (!wrapper) return

      const overflow = window.getComputedStyle(wrapper).overflow

      if (overflow === "auto" || overflow === "scroll") {
        nodeEl.scrollIntoView({ block: "center", behavior: "smooth" })
        return
      }

      const zoomArea = nodeEl.parentElement
      if (!zoomArea) return

      let scale = 1

      const ts = zoomArea.style.transform || window.getComputedStyle(zoomArea).transform

      const matrix = ts.match(/matrix\(([^)]+)\)/)
      if (matrix) {
        const p = matrix[1].split(",").map(v => parseFloat(v.trim()))
        if (p.length >= 6) {
          scale = Math.abs(p[0])
        }
      } else {
        const m = ts.replace(/\s+/g, " ").match(/translate\(([^,]+),\s*([^)]+)\)\s*scale\(([^)]+)\)/)
        if (m) {
          scale = parseFloat(m[3]) || 1
        }
      }

      const nodeLeft = parseInt(nodeEl.style.left) || 0
      const nodeTop = parseInt(nodeEl.style.top) || 0
      zoomArea.style.transform = `translate(${-(nodeLeft * scale - wrapper.clientWidth / 2)}px, ${-(nodeTop * scale - wrapper.clientHeight / 2)}px) scale(${scale})`
    }, 100)
  }

  async addEdge(
    fromId: string,
    toId: string,
    label?: string,
    color?: string
  ): Promise<void> {
    const data = await this.getData()
    if (!data) return

    const edgeId = `edge-${fromId}-${toId}-${Date.now()}`

    if (data.edges.some(e => e.fromNode === fromId && e.toNode === toId)) return

    data.edges.push({
      id: edgeId,
      fromNode: fromId,
      toNode: toId,
      label,
      color,
    })

    await this.setData(data)
  }
}
