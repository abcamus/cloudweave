import en from "./locales/en"
import zh from "./locales/zh"
import { getLanguage } from "obsidian"

const locales: Record<string, Record<string, string>> = { en, zh }

let lang = "zh"

export function initLocale() {
  const detected = getLanguage() || navigator.language || "zh"
  lang = detected.startsWith("zh") ? "zh" : "en"
}

export function t(key: string, ...args: string[]): string {
  const dict = locales[lang] || locales.zh
  let str = dict[key]
  if (!str) {
    str = locales.zh[key] || key
  }
  if (args.length > 0) {
    args.forEach((arg, i) => {
      str = str.replace(`{${i}}`, arg)
    })
  }
  return str
}

export function getLang(): string {
  return lang
}
