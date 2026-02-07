# OpenRouter Provider

A shared OpenRouter API provider plugin for Obsidian. This plugin centralizes API key management, model selection, and credit monitoring for multiple AI-powered Obsidian plugins. It offers both standard request handling and robust streaming capabilities.

## Features

- **Centralized API Management**: Configure your OpenRouter API key once for all compatible plugins.
- **Model Selection**: Browse and select models using a comprehensive visual picker.
- **Per-Plugin Configuration**: Assign specific default models to individual plugins.
- **Balance Monitoring**: View your OpenRouter credit balance in real-time.
- **Streaming Support**: Full support for Server-Sent Events (SSE) streaming with real-time token generation.
- **Status Bar Integration**: Visual feedback for connection status, generation progress, and errors.
- **Reasoning Support**: Native support for reasoning models (e.g., DeepSeek R1), including specific "Thinking" states.
- **Robust Fallback**: Automatically handles non-streaming JSON responses even when streaming is requested, ensuring compatibility across all providers.

## Installation

1. Download the latest release.
2. Extract the files to your vault's `.obsidian/plugins/openrouter-provider/` directory.
3. Enable the plugin in Obsidian settings.
4. Enter your OpenRouter API key in the plugin settings.

## Usage

### For Users

1. navigate to the plugin settings and enter your OpenRouter API key.
2. Compatible AI plugins will automatically detect and utilize this provider.
3. Use the visual model picker within your AI plugins to select your preferred models.

### For Plugin Developers

This plugin exposes a public API for other Obsidian plugins to consume. You can access it via the global window object or the Obsidian plugin registry.

#### Accessing the Provider

```typescript
const provider = this.app.plugins.getPlugin('openrouter-provider');
```

#### Standard Request (Non-Streaming)

Use `fetchWithRetry` for standard, one-shot completions. This method handles rate limits and retries automatically.

```typescript
if (provider) {
    try {
        const response = await provider.fetchWithRetry({
            model: "google/gemini-2.0-flash-exp:free",
            messages: [{ role: "user", content: "Hello" }]
        });
        console.log(response.json.choices[0].message.content);
    } catch (error) {
        console.error("API Error:", error);
    }
}
```

#### Streaming Request (New)

Use `streamRequest` for real-time text generation. This method handles SSE parsing, reasoning extraction, and status bar updates.

```typescript
if (provider) {
    await provider.streamRequest(
        {
            model: "deepseek/deepseek-r1",
            messages: [{ role: "user", content: "Explain quantum physics" }]
        },
        (token) => {
            // Called for each text token received
            editor.replaceSelection(token);
        },
        (fullText) => {
            // Called when generation is complete
            console.log("Finished:", fullText);
        },
        (error) => {
            // Called on error
            new Notice("Generation failed");
        },
        (reasoning) => {
            // Optional: Called when reasoning/thinking content is received
            console.log("Thinking:", reasoning);
        }
    );
}
```

## API Reference

- `getApiKey()`: Returns the configured API key.
- `getModel(pluginId)`: Returns the selected model ID for a specific plugin.
- `setModel(pluginId, modelId)`: Sets the preferred model for a plugin.
- `fetchWithRetry(requestBody)`: Executes a standard HTTP POST request with retry logic.
- `streamRequest(requestBody, onToken, onComplete, onError, onReasoning)`: Initiates a streaming request with callbacks.
- `openModelSelector(pluginId, onSelect)`: Opens the model selection modal.

## Compatible Plugins

- AI Learning Assistant (Flashcards)
- AI OCR Formatter
- Any plugin implementing the provider interface

## License

MIT License - see [LICENSE](LICENSE) for details.
