/*
 * OPENROUTER SETTINGS TAB
 * Settings UI for API key, favorites, and plugin assignments
 */

import { App, PluginSettingTab, Setting, Notice, setIcon } from "obsidian";
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
        containerEl.addClass('or-settings');

        // ===== HEADER =====
        containerEl.createEl('h2', { text: 'OpenRouter Provider' });

        // ===== API KEY =====
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

        // Balance display
        const balanceContainer = containerEl.createDiv({ cls: 'or-settings-balance' });
        balanceContainer.setText("Checking balance...");
        this.plugin.fetchCredits().then(c => {
            balanceContainer.empty();
            const icon = balanceContainer.createSpan({ cls: 'or-balance-icon' });
            setIcon(icon, 'wallet');
            balanceContainer.createSpan({ text: c ? `Balance: $${c}` : "Balance: Unknown" });
        });

        // ===== CONNECTED PLUGINS =====
        this.createSection(containerEl, 'Connected Plugins', 'plug', () => {
            const content = containerEl.createDiv({ cls: 'or-settings-section-content' });

            const aiPlugins = [
                { id: 'ai-ocr-formatter', name: 'AI OCR Formatter' },
                { id: 'ai-flashcards', name: 'AI Flashcards' },
                { id: 'lecture-slides', name: 'Lecture Slides' }
            ];

            const pluginModels = this.plugin.settings.pluginModels || {};
            let hasAnyPlugin = false;

            aiPlugins.forEach(({ id, name }) => {
                const pluginInstance = (this.app as any).plugins.getPlugin(id);
                if (!pluginInstance) return;
                hasAnyPlugin = true;

                const row = content.createDiv({ cls: 'or-settings-plugin-row' });

                const left = row.createDiv({ cls: 'or-settings-plugin-info' });
                const statusIcon = left.createSpan({ cls: 'or-status-icon connected' });
                setIcon(statusIcon, 'check-circle');
                left.createSpan({ text: name, cls: 'or-settings-plugin-name' });

                const right = row.createDiv({ cls: 'or-settings-plugin-model' });
                const modelId = pluginModels[id];
                if (modelId) {
                    right.createSpan({ text: modelId.split('/').pop() || modelId });
                } else {
                    right.createSpan({ text: 'No model set', cls: 'or-text-muted' });
                }
            });

            if (!hasAnyPlugin) {
                content.createDiv({
                    text: 'No AI plugins detected',
                    cls: 'or-text-muted or-text-center'
                });
            }
        });

        // ===== FAVORITE MODELS =====
        this.createSection(containerEl, 'Favorite Models', 'star', () => {
            const content = containerEl.createDiv({ cls: 'or-settings-section-content' });

            const currentFavorites = this.plugin.getFavorites();
            if (currentFavorites.length === 0) {
                content.createDiv({
                    text: 'No favorites saved yet. Use "Manage Models" to add some.',
                    cls: 'or-text-muted or-text-center'
                });
            } else {
                currentFavorites.forEach(m => {
                    const parts = m.split('/');
                    const provider = parts.length > 1 ? parts[0] : '';
                    const modelName = parts.length > 1 ? parts.slice(1).join('/') : m;

                    const row = content.createDiv({ cls: 'or-settings-model-row' });
                    row.createSpan({ text: modelName, cls: 'or-settings-model-name' });
                    if (provider) {
                        row.createSpan({ text: provider, cls: 'or-settings-model-provider' });
                    }
                });
            }

            // Manage button
            const btnContainer = content.createDiv({ cls: 'or-settings-btn-container' });
            const manageBtn = btnContainer.createEl('button', {
                text: 'Manage Models',
                cls: 'mod-cta'
            });
            manageBtn.addEventListener('click', () => {
                this.plugin.openModelSelector('settings', () => {
                    this.display(); // Refresh
                });
            });
        });

        // ===== DEBUG (Collapsible) =====
        this.createCollapsibleSection(containerEl, 'Debug Info', 'bug', false, () => {
            const content = containerEl.createDiv({ cls: 'or-settings-debug' });

            const pluginModels = this.plugin.settings.pluginModels || {};

            content.createDiv({ text: 'Raw pluginModels:', cls: 'or-debug-label' });
            content.createEl('pre', {
                text: JSON.stringify(pluginModels, null, 2),
                cls: 'or-debug-json'
            });

            content.createDiv({ text: 'Favorites array:', cls: 'or-debug-label' });
            content.createEl('pre', {
                text: JSON.stringify(this.plugin.settings.favoriteModels, null, 2),
                cls: 'or-debug-json'
            });
        });
    }

    private createSection(container: HTMLElement, title: string, icon: string, buildContent: () => void): void {
        const section = container.createDiv({ cls: 'or-settings-section' });
        const header = section.createDiv({ cls: 'or-settings-section-header' });
        const iconEl = header.createSpan({ cls: 'or-settings-section-icon' });
        setIcon(iconEl, icon);
        header.createSpan({ text: title });
        buildContent();
    }

    private createCollapsibleSection(container: HTMLElement, title: string, icon: string, openByDefault: boolean, buildContent: () => void): void {
        const section = container.createDiv({ cls: 'or-settings-section or-collapsible' });
        if (openByDefault) section.addClass('open');

        const header = section.createDiv({ cls: 'or-settings-section-header clickable' });
        const iconEl = header.createSpan({ cls: 'or-settings-section-icon' });
        setIcon(iconEl, icon);
        header.createSpan({ text: title });
        const chevron = header.createSpan({ cls: 'or-chevron' });
        setIcon(chevron, 'chevron-down');

        const contentWrapper = section.createDiv({ cls: 'or-collapsible-content' });

        header.addEventListener('click', () => {
            section.toggleClass('open', !section.hasClass('open'));
        });

        // Build content inside wrapper
        const originalParent = container;
        buildContent();
        // Move the created content div into wrapper
        const lastChild = container.lastElementChild;
        if (lastChild && lastChild !== section) {
            contentWrapper.appendChild(lastChild);
        }
    }
}
