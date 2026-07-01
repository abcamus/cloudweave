import { App, ItemView } from "obsidian"
import { Canvas, CanvasData, CanvasNode, CanvasNodeElement } from "../types"
import { CANVAS_VIEW_TYPE } from "../constants"

export class CanvasService {
  private activeCanvas: Canvas | null = null

  constructor(private app: App) {}

  refresh() {
    const view = this.app.workspace.getActiveViewOfType(ItemView)
    if (view?.getViewType() === CANVAS_VIEW_TYPE) {
      this.activeCanvas = (view as any).canvas as Canvas
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
    // Try API: canvas.selection might be a Set/Array of node objects with .id
    const canvas = this.getCanvas()
    if (canvas) {
      const sel = (canvas as any).selection
      if (sel && typeof sel[Symbol.iterator] === "function") {
        const arr = Array.from(sel)
        if (arr.length > 0 && typeof arr[0] === "object" && (arr[0] as any)?.id) {
          return arr.map((n: any) => n.id)
        }
        if (arr.length > 0 && typeof arr[0] === "string") {
          return arr as string[]
        }
      }
    }

    // Fallback: use DOM
    return Array.from(document.querySelectorAll(".canvas-node.is-selected"))
      .map(el => el.getAttribute("data-id") || el.id)
      .filter(Boolean)
  }

  async addCloudNode(
    nodeId: string,
    label: string,
    content: string,
    color: string,
    pos?: { x: number; y: number }
  ): Promise<void> {
    const data = await this.getData()
    if (!data) return

    const maxX = Math.max(...data.nodes.map((n) => n.x + n.width), 0)
    const maxY = Math.max(...data.nodes.map((n) => n.y + n.height), 0)

    data.nodes.push({
      id: nodeId,
      x: pos?.x ?? maxX + 40,
      y: pos?.y ?? maxY + 40,
      width: 280,
      height: 200,
      type: "text",
      label,
      text: content,
      color,
    })

    await this.setData(data)
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
