/*
 * OPENROUTER SETTINGS TAB
 * Settings UI for API key, favorites, and plugin assignments
 */

import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import OpenRouterProvider from "./main";

export class OpenRouterSettingTab extends PluginSettingTab {
    plugin: OpenRouterProvider;

    constructor(app: App, plugin: OpenRouterProvider) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: '🌐 OpenRouter Provider Settings' });

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Your OpenRouter API key (shared across all AI plugins)')
            .addText(t => t
                .setPlaceholder('sk-or-...')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async v => {
                    this.plugin.settings.apiKey = v;
                    await this.plugin.saveSettings();
                }));

        const balanceEl = containerEl.createDiv({ attr: { style: 'margin-bottom: 16px; color: var(--text-success);' } });
        balanceEl.setText("Checking balance...");
        this.plugin.fetchCredits().then(c => {
            balanceEl.setText(c ? `💳 Balance: $${c}` : "💳 Balance: Unknown");
        });

        containerEl.createEl('h3', { text: '⭐ Favorite Models' });

        const favList = containerEl.createDiv({ attr: { style: 'margin-bottom: 16px;' } });
        const currentFavorites = this.plugin.getFavorites();
        if (currentFavorites.length === 0) {
            favList.createDiv({ text: 'No favorites saved yet.', attr: { style: 'color: var(--text-muted); font-style: italic;' } });
        } else {
            currentFavorites.forEach(m => {
                const parts = m.split('/');
                const provider = parts.length > 1 ? parts[0] : '';
                const modelName = parts.length > 1 ? parts.slice(1).join('/') : m;

                const row = favList.createDiv({ cls: 'openrouter-list-row' });
                row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; margin-bottom: 4px; background: var(--background-secondary); border-radius: 4px; gap: 12px;';

                const nameEl = row.createEl('span');
                nameEl.textContent = modelName;
                nameEl.style.cssText = 'font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis;';

                if (provider) {
                    const providerEl = row.createEl('span');
                    providerEl.textContent = provider;
                    providerEl.style.cssText = 'color: var(--text-muted); font-size: 0.8em; flex-shrink: 0;';
                }
            });
        }

        new Setting(containerEl)
            .addButton(b => b
                .setButtonText("Manage Models")
                .onClick(() => {
                    this.plugin.openModelSelector('settings', () => {
                        this.display(); // Refresh
                    });
                }));

        containerEl.createEl('h3', { text: '🔌 Plugin Model Assignments' });

        const assignments = containerEl.createDiv({ attr: { style: 'margin-bottom: 16px;' } });
        const pluginModels = this.plugin.settings.pluginModels || {};
        // Filter out 'settings' since that's not a real plugin
        const pluginEntries = Object.entries(pluginModels).filter(([id]) => id !== 'settings');

        if (pluginEntries.length === 0) {
            assignments.createDiv({ text: 'No plugins have selected a model yet.', attr: { style: 'color: var(--text-muted); font-style: italic;' } });
        } else {
            pluginEntries.forEach(([pluginId, modelId]) => {
                const modelName = modelId.split('/').pop();

                const row = assignments.createDiv({ cls: 'openrouter-list-row' });
                row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; margin-bottom: 4px; background: var(--background-secondary); border-radius: 4px; gap: 12px;';

                const pluginEl = row.createEl('span');
                pluginEl.textContent = pluginId;
                pluginEl.style.cssText = 'font-weight: bold; flex: 1;';

                const modelEl = row.createEl('span');
                modelEl.textContent = modelName || modelId;
                modelEl.style.cssText = 'color: var(--text-accent); flex-shrink: 0;';
            });
        }

        // Debug section - show all connected AI plugins
        containerEl.createEl('h3', { text: '🔧 Debug Info' });
        const debugDiv = containerEl.createDiv({ attr: { style: 'padding: 8px; background: var(--background-secondary); border-radius: 4px; font-family: monospace; font-size: 0.8em;' } });

        // Show raw pluginModels
        debugDiv.createDiv({ text: `Raw pluginModels:` });
        debugDiv.createDiv({ text: JSON.stringify(pluginModels, null, 2), attr: { style: 'white-space: pre; margin-left: 12px; color: var(--text-muted);' } });

        // Show connected plugins
        const aiPlugins = ['ai-ocr-formatter', 'ai-flashcards'];
        debugDiv.createDiv({ text: `Checking AI plugins:`, attr: { style: 'margin-top: 8px;' } });
        aiPlugins.forEach(pid => {
            const plugin = (this.app as any).plugins.getPlugin(pid);
            const status = plugin ? '✅ Loaded' : '❌ Not loaded';
            debugDiv.createDiv({ text: `  ${pid}: ${status}`, attr: { style: 'margin-left: 12px;' } });
        });
    }
}
