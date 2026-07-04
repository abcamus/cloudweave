import { App, Plugin, PluginSettingTab, Setting } from "obsidian"
import { t } from "../i18n"
import { LLMConfig } from "../types"

export class ContextCanvasSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: Plugin) {
    super(app, plugin)
  }

  getSettingDefinitions(): { name: string; desc?: string }[] {
    return [
      { name: t("settingsProvider"), desc: t("settingsProviderDesc") },
      { name: t("settingsApiKey"), desc: t("settingsApiKeyDesc") },
      { name: t("settingsModel"), desc: t("settingsModelDesc") },
      { name: t("settingsEndpoint"), desc: t("settingsEndpointDesc") },
    ]
  }

  display() {
    const { containerEl } = this
    containerEl.empty()

    new Setting(containerEl).setName(t("settingsTitle")).setHeading()

    const config = this.loadConfig()

    new Setting(containerEl)
      .setName(t("settingsProvider"))
      .setDesc(t("settingsProviderDesc"))
      .addDropdown((dd) => {
        dd.addOption("openai", "OpenAI")
        dd.addOption("gemini", "Gemini")
        dd.addOption("claude", "Claude")
        dd.addOption("local", t("settingsProviderLocal"))
        dd.setValue(config.provider)
        dd.onChange((val: string) => {
          config.provider = val as "openai" | "gemini" | "claude" | "local"
          this.saveConfig(config)
        })
      })

    new Setting(containerEl)
      .setName(t("settingsApiKey"))
      .setDesc(t("settingsApiKeyDesc"))
      .addText((txt) => {
        txt.setPlaceholder(t("settingsApiKeyPlaceholder"))
        txt.setValue(config.apiKey)
        txt.inputEl.type = "password"
        txt.onChange((val) => {
          config.apiKey = val
          this.saveConfig(config)
        })
      })

    new Setting(containerEl)
      .setName(t("settingsModel"))
      .setDesc(t("settingsModelDesc"))
      .addText((txt) => {
        txt.setValue(config.model)
        txt.onChange((val) => {
          config.model = val
          this.saveConfig(config)
        })
      })

    new Setting(containerEl)
      .setName(t("settingsEndpoint"))
      .setDesc(t("settingsEndpointDesc"))
      .addText((txt) => {
        txt.setPlaceholder("HTTPS://API.OpenAI.com/v1/chat/completions")
        txt.setValue(config.endpoint || "")
        txt.onChange((val) => {
          config.endpoint = val || undefined
          this.saveConfig(config)
        })
      })
  }

  private loadConfig(): LLMConfig {
    const raw = this.app.loadLocalStorage("cc-llm-config") as string | null
    if (raw) {
      try { return JSON.parse(raw) as LLMConfig }
      catch { /* ignore */ }
    }
    return { provider: "openai", apiKey: "", model: "gpt-4o-mini" }
  }

  private saveConfig(config: LLMConfig) {
    this.app.saveLocalStorage("cc-llm-config", JSON.stringify(config))
  }
}
