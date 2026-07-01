import { App, Notice } from "obsidian"
import { t } from "../i18n"
import { CanvasService } from "../services/canvas-service"
import { SyncVaultBridge } from "../services/sync-vault-bridge"
import { CloudNodeService } from "../services/cloud-node-service"
import { CloudFilePickerModal } from "../ui/cloud-file-picker"

export class InsertCloudNodeCommand {
  private cloudNodeService: CloudNodeService

  constructor(
    private app: App,
    private canvasService: CanvasService,
    private syncVault: SyncVaultBridge
  ) {
    this.cloudNodeService = new CloudNodeService(app, canvasService, syncVault)
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

    new CloudFilePickerModal(
      this.app,
      this.syncVault,
      async (file) => {
        await this.cloudNodeService.insertCloudFile(file)
      }
    ).open()
  }
}
