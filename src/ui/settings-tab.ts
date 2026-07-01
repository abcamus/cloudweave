import { App, PluginSettingTab, Setting } from "obsidian"
import { t } from "../i18n"
import { LLMConfig } from "../types"

export class ContextCanvasSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: any) {
    super(app, plugin)
  }

  display() {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl("h2", { text: t("settingsTitle") })

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
        dd.onChange((val: "openai" | "gemini" | "claude" | "local") => {
          config.provider = val
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
        txt.setPlaceholder("https://api.openai.com/v1/chat/completions")
        txt.setValue(config.endpoint || "")
        txt.onChange((val) => {
          config.endpoint = val || undefined
          this.saveConfig(config)
        })
      })
  }

  private loadConfig(): LLMConfig {
    const raw = localStorage.getItem("cc-llm-config")
    if (raw) {
      try { return JSON.parse(raw) }
      catch { /* ignore */ }
    }
    return { provider: "openai", apiKey: "", model: "gpt-4o-mini" }
  }

  private saveConfig(config: LLMConfig) {
    localStorage.setItem("cc-llm-config", JSON.stringify(config))
  }
}
