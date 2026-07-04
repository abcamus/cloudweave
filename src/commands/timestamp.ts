import { App, Notice, MarkdownView } from "obsidian"
import { t } from "../i18n"
import { CanvasService } from "../services/canvas-service"
import { TimestampNote } from "../types"

export class TimestampCommand {
  private timestamps: TimestampNote[] = []

  constructor(
    private app: App,
    private canvasService: CanvasService
  ) {}

  recordTimestamp(seconds: number) {
    const nodeIds = this.canvasService.getSelectedNodeIds()
    if (nodeIds.length === 0) {
      new Notice(t("selectMediaNode"))
      return
    }

    const note: TimestampNote = {
      id: `ts-${Date.now()}`,
      nodeId: nodeIds[0]!,
      time: seconds,
      label: this.formatTime(seconds),
      createdAt: Date.now(),
    }

    this.timestamps.push(note)
    this.insertTimestampToNote(note)
    new Notice(t("timestampRecorded", note.label))
  }

  private insertTimestampToNote(note: TimestampNote) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (!activeView) return

    const editor = activeView.editor
    const linkText = `[${note.label}](cc-timestamp://${note.nodeId}/${note.time})`
    editor.replaceRange(
      linkText + "\n",
      editor.getCursor()
    )
  }

  private formatTime(s: number): string {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
  }
}
