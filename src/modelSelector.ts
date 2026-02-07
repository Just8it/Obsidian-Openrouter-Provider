/*
 * MODEL SELECTOR MODAL
 * Visual model browser with filters, favorites, and drag-drop
 */

import { Modal, App, Notice, requestUrl, setIcon } from "obsidian";
import OpenRouterProvider, { ModelInfo, OpenRouterSettings } from "./main";

interface Filters {
    search: string;
    modality: string;
    provider: string[];
    context: string;
    maxPrice: number;
}

export class ModelSelectorModal extends Modal {
    plugin: OpenRouterProvider;
    pluginId: string;
    onSelect: (modelId: string) => void;
    models: ModelInfo[];
    filteredModels: ModelInfo[];
    favorites: string[];
    balance: string;
    filters: Filters;

    // UI Elements
    balanceEl!: HTMLElement;
    countSpan!: HTMLElement;
    modelList!: HTMLElement;
    savedList!: HTMLElement;

    constructor(app: App, plugin: OpenRouterProvider, pluginId: string, onSelect: (modelId: string) => void) {
        super(app);
        this.plugin = plugin;
        this.pluginId = pluginId;
        this.onSelect = onSelect;
        this.models = [];
        this.filteredModels = [];
        this.favorites = [...(plugin.settings.favoriteModels || [])];
        this.balance = "Loading...";
        this.filters = {
            search: "",
            modality: "any",
            provider: [],
            context: "any",
            maxPrice: 10
        };
    }

    async onOpen(): Promise<void> {
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
            this.filters.search = (e.target as HTMLInputElement).value.toLowerCase();
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
            this.filters.maxPrice = parseFloat((e.target as HTMLInputElement).value);
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
            const modelId = e.dataTransfer?.getData('text/plain');
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

    createAccordion(parent: HTMLElement, title: string, items: { label: string; value: string; checked?: boolean }[], filterKey: keyof Filters, isRadio: boolean): void {
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
                    (this.filters as any)[filterKey] = opt.value;
                } else {
                    const arr = this.filters[filterKey] as string[];
                    if (input.checked) arr.push(opt.value);
                    else (this.filters as any)[filterKey] = arr.filter(x => x !== opt.value);
                }
                this.applyFilters();
            });
        });
    }

    async fetchModels(): Promise<void> {
        try {
            const response = await requestUrl({
                url: "https://openrouter.ai/api/v1/models",
                method: "GET"
            });

            if (response.status === 200) {
                this.models = (response.json as any).data;
                this.applyFilters();
            } else {
                new Notice("Failed to fetch models");
            }
        } catch (e: any) {
            console.error(e);
            new Notice("Error fetching models: " + e.message);
        }
    }

    applyFilters(): void {
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

    renderCatalog(): void {
        this.modelList.empty();

        const toShow = this.filteredModels.slice(0, 100);

        toShow.forEach(m => {
            const card = this.modelList.createDiv({ cls: 'or-model-card' });
            card.setAttribute('draggable', 'true');
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer?.setData('text/plain', m.id);
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
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
                const price = m.pricing ? (parseFloat(m.pricing.prompt) * 1000000).toFixed(2) : '?';
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

    renderSaved(): void {
        this.savedList.empty();
        this.favorites.forEach(id => {
            const item = this.savedList.createDiv({ cls: 'or-saved-item' });

            const info = item.createDiv();
            info.createDiv({ text: id.split('/').pop() || id, cls: 'or-saved-item-name' });

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

    toggleFavorite(id: string): void {
        if (this.favorites.includes(id)) {
            this.favorites = this.favorites.filter(x => x !== id);
            this.plugin.removeFavorite(id);
        } else {
            this.favorites.push(id);
            const modelData = this.models.find(m => m.id === id);
            this.plugin.addFavorite(id, modelData?.context_length || null);

            // Also set this as the plugin's selected model
            if (this.pluginId && this.pluginId !== 'settings') {
                this.plugin.setModel(this.pluginId, id);
                console.log("Also set as plugin model:", this.pluginId, "->", id);
            }
        }

        this.renderSaved();
        new Notice(this.favorites.includes(id) ? "Saved model" : "Removed model");
    }

    selectModel(id: string): void {
        console.log("selectModel called:", id, "pluginId:", this.pluginId);
        this.plugin.setModel(this.pluginId, id);
        this.onSelect(id);
        this.close();
        new Notice(`Selected: ${id.split('/').pop()}`);
    }

    onClose(): void {
        this.contentEl.empty();
        this.modalEl.removeClass('or-modal');
    }
}
