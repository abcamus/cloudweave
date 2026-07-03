import { App, ItemView } from "obsidian"
import { Canvas, CanvasData } from "../types"
import { CANVAS_VIEW_TYPE } from "../constants"

type CanvasView = ItemView & { canvas?: Canvas }

export class CanvasService {
  private activeCanvas: Canvas | null = null
  private cloudNodeCount = 0

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
    width = 220,
    height = 300,
  ): Promise<void> {
    const data = await this.getData()
    if (!data) return

    let x: number, y: number

    if (pos) {
      x = pos.x
      y = pos.y
    } else {
      const ref = this.findRefNode(data)
      const offset = this.cloudNodeCount * 40
      this.cloudNodeCount++
      x = ref.x + offset
      y = ref.y + offset
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

  findRefNode(data: CanvasData): { x: number; y: number } {
    const ids = this.getSelectedNodeIds()
    if (ids.length > 0) {
      const n = data.nodes.find(n => ids.includes(n.id))
      if (n) return { x: n.x + n.width + 40, y: n.y }
    }

      const wrapper = activeDocument.querySelector(".canvas-wrapper") as HTMLElement
    if (wrapper) {
      const ref = wrapper.querySelector(".canvas-node") as HTMLElement
      if (ref) {
        return {
          x: (parseInt(ref.style.left) || 0) + 320,
          y: parseInt(ref.style.top) || 0,
        }
      }
    }

    return { x: 100, y: 100 }
  }

  private scrollToNode(nodeId: string) {
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
