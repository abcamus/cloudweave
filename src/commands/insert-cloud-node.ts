import { App, Notice } from "obsidian"
import { t } from "../i18n"
import { CanvasService } from "../services/canvas-service"
import { SyncVaultBridge } from "../services/sync-vault-bridge"
import { BilibiliService } from "../services/bilibili-service"
import { CloudNodeService } from "../services/cloud-node-service"
import { CloudFilePickerModal } from "../ui/cloud-file-picker"

export class InsertCloudNodeCommand {
  private cloudNodeService: CloudNodeService

  constructor(
    private app: App,
    private canvasService: CanvasService,
    private syncVault: SyncVaultBridge,
    private bilibiliService: BilibiliService
  ) {
    this.cloudNodeService = new CloudNodeService(app, canvasService, syncVault, bilibiliService)
  }

  async execute() {
    this.canvasService.refresh()
    if (!this.canvasService.getCanvas()) {
      new Notice(t("openCanvasFirst"))
      return
    }

    const ready = await this.syncVault.ensureReady()
    if (!ready) {
      new Notice(t("mcpNotReady"))
      return
    }

    const modal = new CloudFilePickerModal(this.app, this.syncVault, (file) => {
      return this.cloudNodeService.insertCloudFile(file)
    }, this.cloudNodeService, this.bilibiliService)
    modal.open()
  }
}
