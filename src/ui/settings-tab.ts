import { App, PluginSettingTab, SecretComponent, Setting } from "obsidian"
import { t } from "../i18n"
import ContextCanvasPlugin from "../main"

interface LLMConfigPublic {
  provider: "openai" | "gemini" | "claude" | "local"
  model: string
  endpoint?: string
}

type SectionKey = "llm" | "web-search" | "card-style" | "bilibili"

const SECTION_LABELS: Record<SectionKey, string> = {
  "llm": "LLM Configuration",
  "web-search": "Web Search",
  "card-style": "Card Style",
  "bilibili": "Bilibili",
}

export class ContextCanvasSettingTab extends PluginSettingTab {
  private sectionState: Record<SectionKey, boolean> = {
    "llm": false,
    "web-search": false,
    "card-style": false,
    "bilibili": false,
  }

  constructor(app: App, private plugin: ContextCanvasPlugin) {
    super(app, plugin)
    const saved = this.app.loadLocalStorage("cc-settings-collapse") as string | null
    if (saved) {
      try { Object.assign(this.sectionState, JSON.parse(saved)) } catch { /* ignore */ }
    }
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

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    const pub = this.loadPublicConfig()

    this.buildSection("llm", containerEl, (el) => {
      new Setting(el)
        .setName(t("settingsProvider"))
        .setDesc(t("settingsProviderDesc"))
        .addDropdown((dd) => {
          dd.addOption("openai", "OpenAI")
          dd.addOption("gemini", "Gemini")
          dd.addOption("claude", "Claude")
          dd.addOption("local", t("settingsProviderLocal"))
          dd.setValue(pub.provider)
          dd.onChange((val: string) => {
            pub.provider = val as "openai" | "gemini" | "claude" | "local"
            this.savePublicConfig(pub)
          })
        })

      new Setting(el)
        .setName(t("settingsApiKey"))
        .setDesc(t("settingsApiKeyDesc"))
        .addComponent(el => new SecretComponent(this.app, el)
          .setValue(this.plugin.settings.llmSecretName)
          .onChange(value => {
            this.plugin.settings.llmSecretName = value
            void this.plugin.saveSettings()
          }))

      new Setting(el)
        .setName(t("settingsModel"))
        .setDesc(t("settingsModelDesc"))
        .addText((txt) => {
          txt.setValue(pub.model)
          txt.onChange((val) => {
            pub.model = val
            this.savePublicConfig(pub)
          })
        })

      new Setting(el)
        .setName(t("settingsEndpoint"))
        .setDesc(t("settingsEndpointDesc"))
        .addText((txt) => {
          txt.setPlaceholder("HTTPS://API.OpenAI.com/v1/chat/completions")
          txt.setValue(pub.endpoint || "")
          txt.onChange((val) => {
            pub.endpoint = val || undefined
            this.savePublicConfig(pub)
          })
        })
    })

    this.buildSection("web-search", containerEl, (el) => {
      new Setting(el)
        .setName("Tavily API key")
        .setDesc("Required for AI web search. Get one at https://tavily.com")
        .addComponent(el => new SecretComponent(this.app, el)
          .setValue(this.plugin.settings.tavilySecretName)
          .onChange(value => {
            this.plugin.settings.tavilySecretName = value
            void this.plugin.saveSettings()
          }))
    })

    this.buildSection("bilibili", containerEl, (el) => {
      new Setting(el)
        .setName("Bilibili cookie")
        .setDesc("Bilibili SESSDATA cookie for video playback. Required to get actual video download URLs. Go to bilibili.com → F12 → Application → Cookies → copy SESSDATA=xxx; bili_jct=yyy")
        .addComponent(comp => new SecretComponent(this.app, comp)
          .setValue(this.plugin.settings.bilibiliSecretName)
          .onChange(async value => {
            this.plugin.settings.bilibiliSecretName = value
            await this.plugin.saveSettings()
            await this.plugin.loadBilibiliCookie()
          }))
    })

    this.buildSection("card-style", containerEl, (el) => {
      new Setting(el)
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

      new Setting(el)
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

      new Setting(el)
        .setName("Book card style")
        .setDesc("Visual style for ebook nodes in canvas")
        .addDropdown((dd) => {
          dd.addOption("default", "Warm spine (default)")
          dd.addOption("apple", "Apple books (bookshelf)")
          dd.addOption("kind", "Kindle (clean)")
          dd.setValue(this.plugin.settings.ebookStyle)
          dd.onChange(async (val: string) => {
            this.plugin.settings.ebookStyle = val
            await this.plugin.saveSettings()
            this.plugin.applyEbookStyle(val)
          })
        })
    })
  }

  private buildSection(key: SectionKey, parent: HTMLElement, fn: (el: HTMLElement) => void): void {
    const details = parent.createEl("details", { cls: "cc-settings-section" })
    details.open = this.sectionState[key]
    const summary = details.createEl("summary", { cls: "cc-settings-summary" })
    summary.setText(SECTION_LABELS[key])

    const content = details.createDiv({ cls: "cc-settings-content" })
    fn(content)

    details.addEventListener("toggle", () => {
      this.sectionState[key] = details.open
      this.app.saveLocalStorage("cc-settings-collapse", JSON.stringify(this.sectionState))
    })
  }

  private loadPublicConfig(): LLMConfigPublic {
    const raw = this.app.loadLocalStorage("cc-llm-config") as string | null
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as LLMConfigPublic
        return { provider: parsed.provider, model: parsed.model, endpoint: parsed.endpoint }
      } catch { /* ignore */ }
    }
    return { provider: "openai", model: "gpt-4o-mini" }
  }

  private savePublicConfig(config: LLMConfigPublic) {
    this.app.saveLocalStorage("cc-llm-config", JSON.stringify(config))
  }
}
