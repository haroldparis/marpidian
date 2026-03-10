export class Modal {
  app: App
  contentEl: HTMLElement
  constructor(app: App) {
    this.app = app
    this.contentEl = document.createElement('div')
  }
  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
}

export function setIcon(_el: HTMLElement, _icon: string): void {}

export class Plugin {
  app: App
  manifest: any
  constructor(app: App, manifest: any) {
    this.app = app
    this.manifest = manifest
  }
  async loadData(): Promise<any> {
    return {}
  }
  async saveData(_data: any): Promise<void> {}
  registerEvent(_event: any): void {}
  addCommand(_command: any): void {}
  addSettingTab(_tab: any): void {}
  registerView(_type: string, _factory: any): void {}
}

export class ItemView {
  app: App
  leaf: WorkspaceLeaf
  contentEl: HTMLElement
  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf
    this.app = leaf.app
    this.contentEl = document.createElement('div')
  }
  getViewType(): string {
    return ''
  }
  getDisplayText(): string {
    return ''
  }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export class PluginSettingTab {
  app: App
  plugin: Plugin
  containerEl: HTMLElement
  constructor(app: App, plugin: Plugin) {
    this.app = app
    this.plugin = plugin
    this.containerEl = document.createElement('div')
  }
  display(): void {}
  hide(): void {}
}

export class Setting {
  setName(_name: string): this {
    return this
  }
  setDesc(_desc: string): this {
    return this
  }
  addText(_cb: (text: any) => any): this {
    return this
  }
  addButton(_cb: (btn: any) => any): this {
    return this
  }
}

export class WorkspaceLeaf {
  app: App
  constructor(app: App) {
    this.app = app
  }
}

export interface App {
  vault: Vault
  workspace: Workspace
  metadataCache: MetadataCache
}

export interface Vault {
  read(file: TFile): Promise<string>
  on(event: string, cb: (...args: any[]) => any): EventRef
  offref(ref: EventRef): void
  adapter: {
    read(path: string): Promise<string>
    remove(path: string): Promise<void>
  }
}

export interface Workspace {
  on(event: string, cb: (...args: any[]) => any): EventRef
  getLeaf(type: string, direction?: string): WorkspaceLeaf
  getLeavesOfType(type: string): WorkspaceLeaf[]
  revealLeaf(leaf: WorkspaceLeaf): Promise<void>
}

export interface MetadataCache {
  getFileCache(file: TFile): { frontmatter?: Record<string, any> } | null
}

export interface TFile {
  path: string
  name: string
  extension: string
}

export type EventRef = { id: string }
