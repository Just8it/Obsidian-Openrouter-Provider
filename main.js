/*
 * OPENROUTER PROVIDER PLUGIN
 * Shared API provider for AI plugins in Obsidian
 * Manages: API key, model selection, favorites, credits
 */

const { Plugin, PluginSettingTab, Setting, Notice, requestUrl, Modal, setIcon } = require("obsidian");

const DEFAULT_SETTINGS = {
    apiKey: "",
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    favoriteModels: [
        "google/gemini-2.0-flash-exp:free",
        "openai/gpt-4o-mini",
        "anthropic/claude-3-haiku"
    ],
    modelContextLengths: {},
    // Per-plugin model selections
    pluginModels: {}
};

class OpenRouterProvider extends Plugin {
    async onload() {
        await this.loadSettings();

        // Register as global provider
        window.openrouterProvider = this;

        // Settings tab
        this.addSettingTab(new OpenRouterSettingTab(this.app, this));

        // Command to open settings
        this.addCommand({
            id: 'open-settings',
            name: 'Open OpenRouter Settings',
            callback: () => {
                this.app.setting.open();
                this.app.setting.openTabById('openrouter-provider');
            }
        });

        console.log("OpenRouter Provider loaded");
    }

    onunload() {
        delete window.openrouterProvider;
    }

    // ==================== PUBLIC API ====================

    /**
     * Get the API key
     */
    getApiKey() {
        return this.settings.apiKey;
    }

    /**
     * Set the API key
     */
    async setApiKey(key) {
        this.settings.apiKey = key;
        await this.saveSettings();
    }

    /**
     * Get model for a specific plugin
     * @param {string} pluginId - e.g., 'ai-flashcards', 'ai-ocr-formatter'
     * @returns {string} model ID or default
     */
    getModel(pluginId) {
        return this.settings.pluginModels[pluginId] || this.settings.favoriteModels[0] || "google/gemini-2.0-flash-exp:free";
    }

    /**
     * Set model for a specific plugin
     * @param {string} pluginId
     * @param {string} modelId
     */
    async setModel(pluginId, modelId) {
        this.settings.pluginModels[pluginId] = modelId;
        await this.saveSettings();
        console.log("Plugin model saved:", pluginId, "->", modelId, "All:", this.settings.pluginModels);
    }

    /**
     * Get all favorite models
     */
    getFavorites() {
        return this.settings.favoriteModels || [];
    }

    /**
     * Add a model to favorites
     */
    async addFavorite(modelId, contextLength = null) {
        // Always check and add, then save
        const favorites = this.settings.favoriteModels;
        const index = favorites.indexOf(modelId);
        if (index === -1) {
            favorites.push(modelId);
        }
        if (contextLength) {
            this.settings.modelContextLengths[modelId] = contextLength;
        }
        await this.saveSettings();
        console.log("Favorites saved:", this.settings.favoriteModels);
    }

    /**
     * Remove a model from favorites
     */
    async removeFavorite(modelId) {
        this.settings.favoriteModels = this.settings.favoriteModels.filter(m => m !== modelId);
        await this.saveSettings();
        console.log("Favorites after remove:", this.settings.favoriteModels);
    }

    /**
     * Fetch OpenRouter credits/balance
     */
    async fetchCredits() {
        if (!this.settings.apiKey) return null;
        try {
            const [creditsRes, keyRes] = await Promise.all([
                requestUrl({
                    url: "https://openrouter.ai/api/v1/credits",
                    method: "GET",
                    headers: { "Authorization": `Bearer ${this.settings.apiKey}` }
                }),
                requestUrl({
                    url: "https://openrouter.ai/api/v1/auth/key",
                    method: "GET",
                    headers: { "Authorization": `Bearer ${this.settings.apiKey}` }
                })
            ]);

            let accountCredits = 0;
            if (creditsRes.status === 200) {
                accountCredits = creditsRes.json?.data?.total_credits || 0;
            }

            let keyRemaining = Infinity;
            if (keyRes.status === 200 && keyRes.json?.data?.limit !== null) {
                keyRemaining = Math.max(0, (keyRes.json.data.limit || 0) - (keyRes.json.data.usage || 0));
            }

            return Math.min(accountCredits, keyRemaining).toFixed(2);
        } catch (e) {
            console.error("Failed to fetch credits", e);
            return null;
        }
    }

    /**
     * Open model selector modal for a plugin
     * @param {string} pluginId - Plugin requesting the selection
     * @param {function} onSelect - Callback with selected model ID
     */
    openModelSelector(pluginId, onSelect) {
        new ModelSelectorModal(this.app, this, pluginId, onSelect).open();
    }

    /**
     * Make API request with retry logic
     * @param {object} requestBody - The request body to send
     * @param {number} retries - Number of retries
     * @param {number} delay - Initial delay in ms
     */
    async fetchWithRetry(requestBody, retries = 3, delay = 2000) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await requestUrl({
                    url: this.settings.apiUrl,
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${this.settings.apiKey}`,
                        "HTTP-Referer": "https://obsidian.md",
                        "X-Title": "Obsidian OpenRouter Provider"
                    },
                    body: JSON.stringify(requestBody)
                });

                if (response.status === 429) {
                    new Notice(`⚠️ Rate limit! Waiting ${delay / 1000}s...`);
                    await new Promise(r => setTimeout(r, delay));
                    delay *= 2;
                    continue;
                }

                if (response.status >= 400) {
                    let errorMsg = `API Error ${response.status}`;
                    try {
                        const errJson = response.json;
                        if (errJson?.error?.message) errorMsg += `: ${errJson.error.message}`;
                    } catch (e) { }
                    throw new Error(errorMsg);
                }

                // Clean <think> tags from reasoning models
                if (response.json?.choices?.[0]?.message?.content) {
                    response.json.choices[0].message.content =
                        response.json.choices[0].message.content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
                }

                return response;

            } catch (error) {
                if (i === retries - 1) throw error;
                await new Promise(r => setTimeout(r, delay));
                delay *= 1.5;
            }
        }
    }

    // ==================== SETTINGS ====================
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

// ==================== MODEL SELECTOR MODAL ====================
class ModelSelectorModal extends Modal {
    constructor(app, plugin, pluginId, onSelect) {
        super(app);
        this.plugin = plugin;
        this.pluginId = pluginId;
        this.onSelect = onSelect;
        this.models = [];
        this.filteredModels = [];
        this.favorites = [...(plugin.settings.favoriteModels || [])]; // Copy, not reference
        this.balance = "Loading...";
        this.filters = {
            search: "",
            modality: "any",
            provider: [],
            context: "any",
            maxPrice: 10
        };
    }

    async onOpen() {
        this.modalEl.addClass('or-modal');

        this.plugin.fetchCredits().then(c => {
            this.balance = c ? `$${c}` : 'Unknown';
            if (this.balanceEl) this.balanceEl.setText(`Balance: ${this.balance}`);
        });

        const { contentEl } = this;
        contentEl.empty();

        const container = contentEl.createDiv({ cls: 'or-container' });

        // === LEFT SIDEBAR (FILTERS) ===
        const sidebar = container.createDiv({ cls: 'or-sidebar' });

        sidebar.createEl('h3', { text: 'Select Model', cls: 'or-sidebar-title' });
        sidebar.createDiv({ text: this.pluginId, cls: 'or-sidebar-subtitle' });

        const searchInput = sidebar.createEl('input', { cls: 'or-search', attr: { placeholder: 'Search models...' } });
        searchInput.addEventListener('input', (e) => {
            this.filters.search = e.target.value.toLowerCase();
            this.applyFilters();
        });

        // Pricing Slider
        const priceGroup = sidebar.createDiv({ cls: 'or-filter-group' });
        priceGroup.createDiv({ text: 'Max Price ($/1M)', cls: 'or-filter-label' });
        const priceLabel = priceGroup.createDiv({ text: '$10.00', cls: 'or-filter-value' });
        const priceSlider = priceGroup.createEl('input', {
            type: 'range',
            cls: 'or-slider',
            attr: { min: '0', max: '10', step: '0.1', value: '10' }
        });
        priceSlider.addEventListener('input', (e) => {
            this.filters.maxPrice = parseFloat(e.target.value);
            priceLabel.setText(this.filters.maxPrice >= 10 ? '$10.00+' : `$${this.filters.maxPrice.toFixed(2)}`);
            this.applyFilters();
        });

        // Modalities
        this.createAccordion(sidebar, 'Modalities', [
            { label: 'Text', value: 'text' },
            { label: 'Image (Vision)', value: 'image' }
        ], 'modality', true);

        // Providers
        this.createAccordion(sidebar, 'Providers', [
            { label: 'OpenAI', value: 'openai' },
            { label: 'Anthropic', value: 'anthropic' },
            { label: 'Google', value: 'google' },
            { label: 'Mistral', value: 'mistral' },
            { label: 'Meta (Llama)', value: 'meta' }
        ], 'provider', false);

        // Context
        this.createAccordion(sidebar, 'Context Length', [
            { label: 'Any', value: 'any', checked: true },
            { label: '32k+', value: '32k' },
            { label: '128k+', value: '128k' }
        ], 'context', true);

        // === MIDDLE (CATALOG) ===
        const catalog = container.createDiv({ cls: 'or-catalog' });

        const catalogHeader = catalog.createDiv({ cls: 'or-catalog-header' });
        this.countSpan = catalogHeader.createSpan({ text: 'Loading...', cls: 'or-catalog-title' });
        this.balanceEl = catalogHeader.createDiv({ text: 'Balance: ...', cls: 'or-balance' });

        this.modelList = catalog.createDiv({ cls: 'or-model-list' });

        // === RIGHT (SAVED) ===
        const saved = container.createDiv({ cls: 'or-saved' });
        saved.createDiv({ text: 'MY SAVED MODELS', cls: 'or-saved-title' });

        // Drop Zone Logic
        saved.addEventListener('dragover', (e) => {
            e.preventDefault();
            saved.addClass('drag-over');
        });
        saved.addEventListener('dragleave', (e) => {
            e.preventDefault();
            saved.removeClass('drag-over');
        });
        saved.addEventListener('drop', (e) => {
            e.preventDefault();
            saved.removeClass('drag-over');
            const modelId = e.dataTransfer.getData('text/plain');
            if (modelId && !this.favorites.includes(modelId)) {
                this.toggleFavorite(modelId);
            } else if (modelId) {
                new Notice('Model already in favorites');
            }
        });

        this.savedList = saved.createDiv({ cls: 'or-saved-list' });
        this.renderSaved();

        this.fetchModels();
    }

    createAccordion(parent, title, items, filterKey, isRadio) {
        const accordion = parent.createDiv({ cls: 'or-accordion open' });
        const header = accordion.createDiv({ cls: 'or-accordion-header' });
        header.createSpan({ text: title });
        header.innerHTML += `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

        header.addEventListener('click', () => accordion.classList.toggle('open'));

        const body = accordion.createDiv({ cls: 'or-accordion-body' });

        items.forEach(opt => {
            const row = body.createEl('label', { cls: 'or-checkbox-row' });
            const input = row.createEl('input', {
                type: isRadio ? 'radio' : 'checkbox',
                attr: { name: filterKey }
            });
            if (opt.checked) input.checked = true;
            row.createSpan({ text: opt.label });

            input.addEventListener('change', () => {
                if (isRadio) {
                    this.filters[filterKey] = opt.value;
                } else {
                    if (input.checked) this.filters[filterKey].push(opt.value);
                    else this.filters[filterKey] = this.filters[filterKey].filter(x => x !== opt.value);
                }
                this.applyFilters();
            });
        });
    }

    async fetchModels() {
        try {
            const response = await requestUrl({
                url: "https://openrouter.ai/api/v1/models",
                method: "GET"
            });

            if (response.status === 200) {
                this.models = response.json.data;
                this.applyFilters();
            } else {
                new Notice("Failed to fetch models");
            }
        } catch (e) {
            console.error(e);
            new Notice("Error fetching models: " + e.message);
        }
    }

    applyFilters() {
        this.filteredModels = this.models.filter(m => {
            if (this.filters.search && !m.id.toLowerCase().includes(this.filters.search) && !m.name.toLowerCase().includes(this.filters.search)) return false;

            if (this.filters.modality === "image") {
                const isVision = m.id.includes("vision") || m.id.includes("gpt-4-turbo") || m.id.includes("claude-3");
                if (!isVision) return false;
            }

            if (this.filters.provider.length > 0) {
                const matches = this.filters.provider.some(p => m.id.startsWith(p));
                if (!matches) return false;
            }

            if (this.filters.context !== "any") {
                const ctx = m.context_length || 0;
                if (this.filters.context === "32k" && ctx < 32000) return false;
                if (this.filters.context === "128k" && ctx < 128000) return false;
            }

            if (this.filters.maxPrice < 10) {
                const price = m.pricing ? parseFloat(m.pricing.prompt) * 1000000 : 0;
                if (price > this.filters.maxPrice) return false;
            }

            return true;
        });

        this.countSpan.setText(`${this.filteredModels.length} Models`);
        this.renderCatalog();
    }

    renderCatalog() {
        this.modelList.empty();

        const toShow = this.filteredModels.slice(0, 100);

        toShow.forEach(m => {
            const card = this.modelList.createDiv({ cls: 'or-model-card' });
            card.setAttribute('draggable', 'true');
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', m.id);
                e.dataTransfer.effectAllowed = 'copy';
                card.addClass('dragging');
            });
            card.addEventListener('dragend', () => card.removeClass('dragging'));

            const info = card.createDiv({ cls: 'or-model-info' });

            const nameRow = info.createDiv({ cls: 'or-model-name' });
            nameRow.createSpan({ text: m.name });
            if (m.id.includes('vision') || m.id.includes('gemini') || m.id.includes('claude-3')) {
                nameRow.createSpan({ text: '👁️', attr: { title: 'Multimodal' } });
            }

            const meta = info.createDiv({ cls: 'or-model-meta' });
            meta.createSpan({ text: m.context_length ? Math.round(m.context_length / 1000) + 'k' : '?' });

            const free = m.id.endsWith(':free');
            if (free) {
                meta.createSpan({ text: 'FREE', cls: 'or-tag-free' });
            } else {
                const price = m.pricing ? (m.pricing.prompt * 1000000).toFixed(2) : '?';
                meta.createSpan({ text: `$${price}/M`, cls: 'or-tag-paid' });
            }

            info.createDiv({ text: m.id, cls: 'or-model-id' });

            info.addEventListener('click', () => this.selectModel(m.id));

            const isFav = this.favorites.includes(m.id);
            const favBtn = card.createSpan({
                text: isFav ? '⭐' : '☆',
                cls: 'or-fav-btn',
                attr: { title: isFav ? 'Remove from Favorites' : 'Add to Favorites' }
            });

            favBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleFavorite(m.id);
                favBtn.setText(this.favorites.includes(m.id) ? '⭐' : '☆');
            });

            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.toggleFavorite(m.id);
                favBtn.setText(this.favorites.includes(m.id) ? '⭐' : '☆');
            });
        });
    }

    renderSaved() {
        this.savedList.empty();
        this.favorites.forEach(id => {
            const item = this.savedList.createDiv({ cls: 'or-saved-item' });

            const info = item.createDiv();
            info.createDiv({ text: id.split('/').pop(), cls: 'or-saved-item-name' });

            const ctxLen = this.plugin.settings.modelContextLengths?.[id];
            if (ctxLen) {
                info.createDiv({ text: `📏 ${Math.round(ctxLen / 1000)}k`, cls: 'or-saved-item-ctx' });
            }

            const remove = item.createDiv({ cls: 'or-saved-item-remove clickable-icon', attr: { 'aria-label': 'Remove' } });
            setIcon(remove, 'cross');

            remove.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFavorite(id);
            });

            item.addEventListener('click', () => this.selectModel(id));
        });
    }

    toggleFavorite(id) {
        if (this.favorites.includes(id)) {
            this.favorites = this.favorites.filter(x => x !== id);
            this.plugin.removeFavorite(id);
        } else {
            this.favorites.push(id);
            const modelData = this.models.find(m => m.id === id);
            this.plugin.addFavorite(id, modelData?.context_length);

            // Also set this as the plugin's selected model
            if (this.pluginId && this.pluginId !== 'settings') {
                this.plugin.setModel(this.pluginId, id);
                console.log("Also set as plugin model:", this.pluginId, "->", id);
            }
        }

        this.renderSaved();
        new Notice(this.favorites.includes(id) ? "Saved model" : "Removed model");
    }

    selectModel(id) {
        // Save the selection for this plugin
        console.log("selectModel called:", id, "pluginId:", this.pluginId);
        this.plugin.setModel(this.pluginId, id);
        this.onSelect(id);
        this.close();
        new Notice(`Selected: ${id.split('/').pop()}`);
    }

    onClose() {
        this.contentEl.empty();
        this.modalEl.removeClass('or-modal');
    }
}

// ==================== SETTINGS TAB ====================
class OpenRouterSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
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

        const balanceEl = containerEl.createDiv({ style: 'margin-bottom: 16px; color: var(--text-success);' });
        balanceEl.setText("Checking balance...");
        this.plugin.fetchCredits().then(c => {
            balanceEl.setText(c ? `💳 Balance: $${c}` : "💳 Balance: Unknown");
        });

        containerEl.createEl('h3', { text: '⭐ Favorite Models' });

        const favList = containerEl.createDiv({ style: 'margin-bottom: 16px;' });
        const currentFavorites = this.plugin.getFavorites();
        if (currentFavorites.length === 0) {
            favList.createDiv({ text: 'No favorites saved yet.', style: 'color: var(--text-muted); font-style: italic;' });
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

        const assignments = containerEl.createDiv({ style: 'margin-bottom: 16px;' });
        const pluginModels = this.plugin.settings.pluginModels || {};
        // Filter out 'settings' since that's not a real plugin
        const pluginEntries = Object.entries(pluginModels).filter(([id]) => id !== 'settings');

        if (pluginEntries.length === 0) {
            assignments.createDiv({ text: 'No plugins have selected a model yet.', style: 'color: var(--text-muted); font-style: italic;' });
        } else {
            pluginEntries.forEach(([pluginId, modelId]) => {
                const modelName = modelId.split('/').pop();

                const row = assignments.createDiv({ cls: 'openrouter-list-row' });
                row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; margin-bottom: 4px; background: var(--background-secondary); border-radius: 4px; gap: 12px;';

                const pluginEl = row.createEl('span');
                pluginEl.textContent = pluginId;
                pluginEl.style.cssText = 'font-weight: bold; flex: 1;';

                const modelEl = row.createEl('span');
                modelEl.textContent = modelName;
                modelEl.style.cssText = 'color: var(--text-accent); flex-shrink: 0;';
            });
        }

        // Debug section - show all connected AI plugins
        containerEl.createEl('h3', { text: '🔧 Debug Info' });
        const debugDiv = containerEl.createDiv({ style: 'padding: 8px; background: var(--background-secondary); border-radius: 4px; font-family: monospace; font-size: 0.8em;' });

        // Show raw pluginModels
        debugDiv.createDiv({ text: `Raw pluginModels:` });
        debugDiv.createDiv({ text: JSON.stringify(pluginModels, null, 2), style: 'white-space: pre; margin-left: 12px; color: var(--text-muted);' });

        // Show connected plugins
        const aiPlugins = ['ai-ocr-formatter', 'ai-flashcards'];
        debugDiv.createDiv({ text: `Checking AI plugins:`, style: 'margin-top: 8px;' });
        aiPlugins.forEach(pid => {
            const plugin = this.app.plugins.getPlugin(pid);
            const status = plugin ? '✅ Loaded' : '❌ Not loaded';
            debugDiv.createDiv({ text: `  ${pid}: ${status}`, style: 'margin-left: 12px;' });
        });
    }
}

module.exports = OpenRouterProvider;


