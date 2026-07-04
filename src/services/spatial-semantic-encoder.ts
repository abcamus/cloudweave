import { CanvasData, CanvasNode, CanvasEdge, CloudNodeMeta } from "../types"

const META_COMMENT_RE = /<!--\s*meta:\s*(\{.+?\})\s*-->/

const COLOR_SEMANTICS: Record<string, string> = {
  "1": "🔴 待讨论/有争议",
  "2": "🟠 核心/重要",
  "3": "🟡 参考资料",
  "4": "🟢 已确认/终版",
  "5": "🔵 设计相关",
  "6": "🟣 技术相关",
}

export interface SpatialGroup {
  type: "row" | "column" | "cluster"
  label: string
  nodes: { id: string; label: string; type: string }[]
}

export interface RelationDesc {
  fromId: string
  fromLabel: string
  toId: string
  toLabel: string
  label?: string
  direction: string
}

export interface SpatialContext {
  layoutSummary: string
  groups: SpatialGroup[]
  relations: RelationDesc[]
  isolatedNodes: string[]
}

export class SpatialSemanticEncoder {
  private rowThreshold = 80
  private colThreshold = 80

  encode(data: CanvasData): SpatialContext {
    if (!data.nodes.length) {
      return { layoutSummary: "（空白画布）", groups: [], relations: [], isolatedNodes: [] }
    }

    const rows = this.detectRows(data.nodes)
    const connectedIds = new Set<string>()
    for (const e of data.edges) {
      connectedIds.add(e.fromNode)
      connectedIds.add(e.toNode)
    }
    const isolated = data.nodes.filter(n => !connectedIds.has(n.id)).map(n => n.label || "未命名")

    const relations = this.parseEdges(data.nodes, data.edges)
    const layoutSummary = this.buildLayoutSummary(data.nodes, rows, relations, isolated)
    const groups = this.buildGroups(data.nodes, rows)

    return { layoutSummary, groups, relations, isolatedNodes: isolated }
  }

  private detectRows(nodes: CanvasNode[]): { y: number; nodes: CanvasNode[] }[] {
    if (nodes.length === 0) return []

    const sorted = [...nodes].sort((a, b) => a.y - b.y)
    const first = sorted[0]!
    const rows: { y: number; nodes: CanvasNode[] }[] = []
    let currentRow = { y: first.y, nodes: [first] }

    for (let i = 1; i < sorted.length; i++) {
      const node = sorted[i]!
      if (Math.abs(node.y - currentRow.y) <= this.rowThreshold) {
        currentRow.nodes.push(node)
      } else {
        currentRow.nodes.sort((a, b) => a.x - b.x)
        rows.push(currentRow)
        currentRow = { y: node.y, nodes: [node] }
      }
    }
    currentRow.nodes.sort((a, b) => a.x - b.x)
    rows.push(currentRow)

    return rows
  }

  private parseEdges(nodes: CanvasNode[], edges: CanvasEdge[]): RelationDesc[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    return edges.map(edge => {
      const from = nodeMap.get(edge.fromNode)
      const to = nodeMap.get(edge.toNode)

      let direction = "相连"
      if (from && to) {
        const dx = to.x - from.x
        const dy = to.y - from.y
        if (Math.abs(dx) > Math.abs(dy)) {
          direction = dx > 0 ? "左侧" : "右侧"
        } else {
          direction = dy > 0 ? "上方" : "下方"
        }
      }

      return {
        fromId: edge.fromNode,
        fromLabel: from?.label || edge.fromNode,
        toId: edge.toNode,
        toLabel: to?.label || edge.toNode,
        label: edge.label,
        direction,
      }
    })
  }

  private buildLayoutSummary(
    nodes: CanvasNode[],
    rows: { y: number; nodes: CanvasNode[] }[],
    relations: RelationDesc[],
    isolatedNodes: string[]
  ): string {
    const connectedIds = new Set(relations.flatMap(r => [r.fromId, r.toId]))
    const lines: string[] = []

    const visibleRows = rows.filter(r => r.nodes.some(n => connectedIds.has(n.id) || r.nodes.length > 1))

    if (visibleRows.length === 0) {
      lines.push(`Canvas 共有 ${nodes.length} 个孤立节点。`)
    } else {
      lines.push(`Canvas 共有 ${nodes.length} 个节点，排列在 ${visibleRows.length} 行中。`)
    }
    lines.push("")

    visibleRows.forEach((row, i) => {
      const desc = row.nodes
        .map(n => {
          const type = this.describeNodeType(n)
          const label = n.label || "未命名"
          if (type === "note") return `[${label}]`
          return `[${label}] (${type})`
        })
        .join("  ")
      lines.push(`第 ${i + 1} 行：${desc}`)
    })

    if (relations.length > 0) {
      lines.push("")
      lines.push("节点连线关系：")
      relations.forEach(r => {
        const tag = r.label ? ` [标签: ${r.label}]` : ""
        lines.push(`  "${r.fromLabel}" 在 "${r.toLabel}" 的${r.direction}${tag}`)
      })
    }

    const colorGroups = this.groupByColor(nodes)
    const usedColors = [...colorGroups.keys()].filter(c => COLOR_SEMANTICS[c])
    if (usedColors.length > 0) {
      lines.push("")
      lines.push("颜色分类：")
      usedColors.forEach(color => {
        const meaning = COLOR_SEMANTICS[color]
        const labels = colorGroups.get(color)!.join(", ")
        lines.push(`  ${meaning}: ${labels}`)
      })
    }

    if (isolatedNodes.length > 0) {
      lines.push("")
      lines.push("孤立节点（无连线）：")
      isolatedNodes.forEach(name => lines.push(`  ⚠ ${name}`))
    }

    return lines.join("\n")
  }

  private describeNodeType(node: CanvasNode): string {
    if (node.type === "group") return "分组"
    const text = node.text || node.content || ""
    const meta = this.parseMeta(text)
    if (meta) {
      const labels: Record<string, string> = { video: "视频", audio: "音频", image: "图片", pdf: "PDF" }
      return labels[meta.category] || "文件"
    }
    return "笔记"
  }

  private groupByColor(nodes: CanvasNode[]): Map<string, string[]> {
    const groups = new Map<string, string[]>()
    nodes.forEach(n => {
      const c = n.color || "default"
      if (!groups.has(c)) groups.set(c, [])
      groups.get(c)!.push(n.label || "未命名")
    })
    return groups
  }

  private buildGroups(nodes: CanvasNode[], rows: { y: number; nodes: CanvasNode[] }[]): SpatialGroup[] {
    return rows.map((row, i) => ({
      type: "row" as const,
      label: `第 ${i + 1} 行`,
      nodes: row.nodes.map(n => ({
        id: n.id,
        label: n.label || "未命名",
        type: this.describeNodeType(n),
      })),
    }))
  }

  private parseMeta(content: string): CloudNodeMeta | null {
    const match = content.match(META_COMMENT_RE)
    if (!match) return null
    try {
      return JSON.parse(match[1]!) as CloudNodeMeta
    } catch {
      return null
    }
  }
}
