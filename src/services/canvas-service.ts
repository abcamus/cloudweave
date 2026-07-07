import { App, ItemView } from "obsidian"
import { Canvas, CanvasData, CanvasNode } from "../types"
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

  async layoutTimeline(): Promise<void> {
    const data = await this.getData()
    if (!data) return

    const nodes = data.nodes.filter(n => n.type !== "group")
    if (nodes.length < 2) return

    const META_RE = /<!--\s*meta:\s*(\{.+?\})\s*-->/
    const TIMESTAMP_RE = /[A-Za-z]+-\d{10}/

    const getMtime = (n: CanvasNode): number => {
      const text = n.text ?? n.content ?? ""
      const m = META_RE.exec(text)
      if (m?.[1]) {
        try {
          const meta = JSON.parse(m[1]) as Record<string, unknown>
          if (typeof meta.mtime === "number") return meta.mtime
        } catch { /* ignore */ }
      }
      const tm = TIMESTAMP_RE.exec(text)
      if (tm?.[0]) {
        const ts = parseInt(tm[0].split("-").pop() ?? "", 10)
        if (!isNaN(ts)) return ts
      }
      return n.y * 100000 + n.x
    }

    const sorted = [...nodes].sort((a, b) => getMtime(a) - getMtime(b))

    const monthMap = new Map<string, CanvasNode[]>()
    for (const n of sorted) {
      const ts = getMtime(n)
      const d = ts > 10000000000 ? new Date(ts) : new Date(ts * 1000)
      const key = d.toISOString().slice(0, 7)
      if (!monthMap.has(key)) monthMap.set(key, [])
      monthMap.get(key)!.push(n)
    }

    const monthKeys = [...monthMap.keys()].sort()

    const startX = Math.min(...nodes.map(n => n.x))
    const startY = Math.min(...nodes.map(n => n.y))
    const pad = 24
    const headerH = 40
    const gap = 16
    const monthGap = 32
    const cols = 3

    const moves: { node: CanvasNode; x: number; y: number }[] = []
    let cursorY = startY + pad
    let rightMostX = 0

    for (const key of monthKeys) {
      const monthNodes = monthMap.get(key)!
      const [y, m] = key.split("-").map(Number)
      const monthLabel = `${y}年${m}月`

      const headerId = `timeline-hdr-${key}-${Date.now()}`
      data.nodes.push({
        id: headerId,
        type: "text",
        x: startX + pad, y: cursorY,
        width: 240, height: 24,
        label: monthLabel,
        text: `📅 **${monthLabel}**`,
        color: "1",
      })
      cursorY += headerH

      let rowMaxH = 0
      let rowStartX = startX + pad

      for (let i = 0; i < monthNodes.length; i++) {
        const n = monthNodes[i]!
        const col = i % cols

        if (col === 0 && i > 0) {
          cursorY += rowMaxH + gap
          rowMaxH = 0
          rowStartX = startX + pad
        }

        moves.push({ node: n, x: rowStartX, y: cursorY })
        rowStartX += n.width + gap
        rowMaxH = Math.max(rowMaxH, n.height)
      }

      cursorY += rowMaxH + monthGap
      rightMostX = Math.max(rightMostX, rowStartX)
    }

    const totalW = rightMostX - startX + pad
    const totalH = cursorY - startY + pad

    const groupId = `timeline-group-${Date.now()}`
    data.nodes.push({
      id: groupId,
      x: startX, y: startY,
      width: totalW, height: totalH,
      type: "group",
      label: `📅 时间轴 (${nodes.length})`,
    })

    for (const move of moves) {
      move.node.x = move.x
      move.node.y = move.y
    }

    await this.setData(data)
    this.scrollToNode(groupId)
  }

  async layoutGrid(cols = 4): Promise<void> {
    const data = await this.getData()
    if (!data) return

    const nodes = data.nodes.filter(n => n.type !== "group")
    if (nodes.length < 2) return

    nodes.sort((a, b) => {
      const yd = a.y - b.y
      return Math.abs(yd) > 10 ? yd : a.x - b.x
    })

    const gapX = 40, gapY = 40
    const startX = Math.min(...nodes.map(n => n.x))
    const startY = Math.min(...nodes.map(n => n.y))

    const colWidths: number[] = Array.from({ length: cols }, () => 0)
    for (let i = 0; i < nodes.length; i++) {
      colWidths[i % cols] = Math.max(colWidths[i % cols]!, nodes[i]!.width)
    }

    const rowHeights: number[] = []
    for (let i = 0; i < nodes.length; i += cols) {
      let maxH = 0
      for (let j = 0; j < cols && i + j < nodes.length; j++) {
        maxH = Math.max(maxH, nodes[i + j]!.height)
      }
      rowHeights.push(maxH)
    }

    let cursorX = startX
    let cursorY = startY
    for (let i = 0; i < nodes.length; i++) {
      const col = i % cols
      const n = nodes[i]!
      n.x = cursorX
      n.y = cursorY

      if (col + 1 < cols && i + 1 < nodes.length) {
        cursorX += (colWidths[col] || n.width) + gapX
      }
      if (col + 1 >= cols || i + 1 >= nodes.length) {
        cursorX = startX
        if (i + 1 < nodes.length) {
          cursorY += (rowHeights[Math.floor(i / cols)] || 0) + gapY
        }
      }
    }

    await this.setData(data)
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
      const p = matrix[1]!.split(",").map(v => parseFloat(v.trim()))
      if (p.length >= 6) {
        tx = p[4] || 0
        ty = p[5] || 0
        scale = Math.abs(p[0]!) || 1
      }
    } else {
      const m = ts.replace(/\s+/g, " ").match(/translate\(([^,]+),\s*([^)]+)\)\s*scale\(([^)]+)\)/)
      if (m) {
        tx = parseFloat(m[1]!) || 0
        ty = parseFloat(m[2]!) || 0
        scale = parseFloat(m[3]!) || 1
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
      const nodeEl = activeDocument.querySelector(`[data-id="${nodeId}"], [data-node-id="${nodeId}"], #${CSS.escape(nodeId)}`) as HTMLElement
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
      const p = matrix[1]!.split(",").map(v => parseFloat(v.trim()))
        if (p.length >= 6) {
          scale = Math.abs(p[0]!)
        }
      } else {
        const m = ts.replace(/\s+/g, " ").match(/translate\(([^,]+),\s*([^)]+)\)\s*scale\(([^)]+)\)/)
        if (m) {
          scale = parseFloat(m[3]!) || 1
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
