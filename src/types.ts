export type CloudDiskType =
  | "aliyun" | "baidu" | "quark" | "onedrive" | "115"
  | "nutstore" | "infinicloud" | "googledrive" | "webdav"

export type CloudFileCategory = "video" | "audio" | "image" | "pdf" | "folder" | "other"

export interface CloudFileEntry {
  cloudType: CloudDiskType
  path: string
  name: string
  isdir: boolean
  fsid: string
  size: number
  ctime: number
  mtime: number
  mimetype?: string
  thumb?: string
}

export interface CloudNodeMeta {
  cloudType: CloudDiskType
  filePath: string
  fsid: string
  fileName: string
  fileSize: number
  category: CloudFileCategory
  thumbnailUrl?: string
  downloadUrl?: string
  streamUrl?: string
}

export interface CanvasNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  type: "text" | "file" | "group"
  text?: string
  content?: string
  file?: string
  color?: string
  label?: string
}

export interface CanvasEdge {
  id: string
  fromNode: string
  toNode: string
  fromSide?: string
  toSide?: string
  label?: string
  color?: string
}

export interface CanvasData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export interface CanvasNodeElement {
  id: string
  x: number
  y: number
  width: number
  height: number
  type: string
  label?: string
  setData?(data: Partial<CanvasNodeElement>): void
}

export interface Canvas {
  nodes: Map<string, CanvasNodeElement>
  edges: Map<string, CanvasEdge>
  selection?: Set<{ id: string }>
  getData(): Promise<CanvasData>
  setData(data: CanvasData): Promise<void>
  requestSave(): void
  selectOnly?(nodeId: string): void
  deselectAll?(): void
}

export interface TimestampNote {
  id: string
  nodeId: string
  time: number
  label: string
  createdAt: number
}

export interface CanvasAIContext {
  nodeIds: string[]
  textContents: string[]
  totalTokens: number
}

export interface LLMConfig {
  provider: "openai" | "gemini" | "claude" | "local"
  apiKey: string
  model: string
  endpoint?: string
}
