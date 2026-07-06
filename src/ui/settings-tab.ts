import { App, PluginSettingTab, Setting } from "obsidian"
import { t } from "../i18n"
import { LLMConfig } from "../types"
import ContextCanvasPlugin from "../main"

export class ContextCanvasSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ContextCanvasPlugin) {
    super(app, plugin)
  }

  getSettingDefinitions(): { name: string; desc?: string }[] {
    return [
      { name: t("settingsProvider") },
      { name: t("settingsApiKey") },
      { name: t("settingsModel") },
      { name: t("settingsEndpoint") },
      { name: "Canvas card style" },
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

    new Setting(containerEl).setName("Card style").setHeading()

    new Setting(containerEl)
      .setName("Canvas card style")
      .setDesc("Choose the visual style for canvas nodes")
      .addDropdown((dd) => {
        dd.addOption("default", "Obsidian default")
        dd.addOption("notion", "Notion (clean shadow)")
        dd.addOption("glass", "Linear (frosted glass)")
        dd.addOption("sticky", "Milanote (sticky note)")
        dd.addOption("accent", "Figma (border accent)")
        dd.setValue(this.plugin.settings.cardStyle)
        dd.onChange(async (val: string) => {
          this.plugin.settings.cardStyle = val
          await this.plugin.saveSettings()
          this.plugin.applyCardStyle(val)
        })
      })

    new Setting(containerEl)
      .setName("Image card style")
      .setDesc("Visual style for image nodes in canvas")
      .addDropdown((dd) => {
        dd.addOption("poster", "Poster (cover + caption overlay)")
        dd.addOption("frame", "Frame (polaroid border)")
        dd.addOption("masonry", "Masonry (rounded + shadow)")
        dd.setValue(this.plugin.settings.imageCardStyle)
        dd.onChange(async (val: string) => {
          this.plugin.settings.imageCardStyle = val
          await this.plugin.saveSettings()
          this.plugin.applyImageCardStyle(val)
        })
      })

    new Setting(containerEl)
      .setName("Book card style")
      .setDesc("Visual style for ebook nodes in canvas")
      .addDropdown((dd) => {
        dd.addOption("default", "Warm spine (default)")
        dd.addOption("apple", "Apple Books (bookshelf)")
        dd.addOption("kind", "Kindle (clean)")
        dd.setValue(this.plugin.settings.ebookStyle)
        dd.onChange(async (val: string) => {
          this.plugin.settings.ebookStyle = val
          await this.plugin.saveSettings()
          this.plugin.applyEbookStyle(val)
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
