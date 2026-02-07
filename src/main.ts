/*
 * OPENROUTER PROVIDER PLUGIN
 * Shared API provider for AI plugins in Obsidian
 * Manages: API key, model selection, favorites, credits
 */

import { Plugin, requestUrl, Notice, App } from "obsidian";
import { ModelSelectorModal } from "./modelSelector";
import { OpenRouterSettingTab } from "./settingsTab";

// ==================== TYPES ====================
export interface OpenRouterSettings {
    apiKey: string;
    apiUrl: string;
    favoriteModels: string[];
    modelContextLengths: { [modelId: string]: number };
    pluginModels: { [pluginId: string]: string };
}

export interface ModelInfo {
    id: string;
    name: string;
    context_length: number;
    pricing: { prompt: string; completion: string };
}

export interface RequestBody {
    model: string;
    messages: { role: string; content: string }[];
    [key: string]: unknown;
}

declare global {
    interface Window {
        openrouterProvider: OpenRouterProvider;
    }
}

const DEFAULT_SETTINGS: OpenRouterSettings = {
    apiKey: "",
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    favoriteModels: [
        "google/gemini-2.0-flash-exp:free",
        "openai/gpt-4o-mini",
        "anthropic/claude-3-haiku"
    ],
    modelContextLengths: {},
    pluginModels: {}
};

// ==================== MAIN PLUGIN ====================
export default class OpenRouterProvider extends Plugin {
    settings!: OpenRouterSettings;

    async onload(): Promise<void> {
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
                (this.app as any).setting.open();
                (this.app as any).setting.openTabById('openrouter-provider');
            }
        });

        console.log("OpenRouter Provider loaded");
    }

    onunload(): void {
        delete (window as any).openrouterProvider;
    }

    // ==================== PUBLIC API ====================

    getApiKey(): string {
        return this.settings.apiKey;
    }

    async setApiKey(key: string): Promise<void> {
        this.settings.apiKey = key;
        await this.saveSettings();
    }

    getModel(pluginId: string): string {
        return this.settings.pluginModels[pluginId] || this.settings.favoriteModels[0] || "google/gemini-2.0-flash-exp:free";
    }

    async setModel(pluginId: string, modelId: string): Promise<void> {
        this.settings.pluginModels[pluginId] = modelId;
        await this.saveSettings();
        console.log("Plugin model saved:", pluginId, "->", modelId, "All:", this.settings.pluginModels);
    }

    getFavorites(): string[] {
        return this.settings.favoriteModels || [];
    }

    async addFavorite(modelId: string, contextLength: number | null = null): Promise<void> {
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

    async removeFavorite(modelId: string): Promise<void> {
        this.settings.favoriteModels = this.settings.favoriteModels.filter(m => m !== modelId);
        await this.saveSettings();
        console.log("Favorites after remove:", this.settings.favoriteModels);
    }

    async fetchCredits(): Promise<string | null> {
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
                accountCredits = (creditsRes.json as any)?.data?.total_credits || 0;
            }

            let keyRemaining = Infinity;
            if (keyRes.status === 200 && (keyRes.json as any)?.data?.limit !== null) {
                keyRemaining = Math.max(0, ((keyRes.json as any).data.limit || 0) - ((keyRes.json as any).data.usage || 0));
            }

            return Math.min(accountCredits, keyRemaining).toFixed(2);
        } catch (e) {
            console.error("Failed to fetch credits", e);
            return null;
        }
    }

    openModelSelector(pluginId: string, onSelect: (modelId: string) => void): void {
        new ModelSelectorModal(this.app, this, pluginId, onSelect).open();
    }

    async fetchWithRetry(requestBody: RequestBody, retries: number = 3, delay: number = 2000): Promise<any> {
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
                        const errJson = response.json as any;
                        if (errJson?.error?.message) errorMsg += `: ${errJson.error.message}`;
                    } catch (e) { }
                    throw new Error(errorMsg);
                }

                // Clean <think> tags from reasoning models
                if ((response.json as any)?.choices?.[0]?.message?.content) {
                    (response.json as any).choices[0].message.content =
                        (response.json as any).choices[0].message.content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
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
    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
