# OpenRouter Provider

A shared OpenRouter API provider plugin for Obsidian. Manages API keys, model selection, and credits across multiple AI plugins.

## Features

- **Centralized API Key Management**: Configure your OpenRouter API key once
- **Model Selection**: Browse and select models with a visual picker
- **Per-Plugin Models**: Set different default models for each connected plugin
- **Balance Display**: Monitor your OpenRouter credits in real-time
- **Favorite Models**: Quick access to frequently used models

## Installation

1. Download the latest release
2. Extract to `.obsidian/plugins/openrouter-provider/`
3. Enable the plugin in Obsidian settings
4. Enter your OpenRouter API key

## Usage

This plugin provides a shared API for other AI plugins:

### For Users

1. Configure your API key in plugin settings
2. Other AI plugins will automatically detect and use this provider
3. Select models using the visual model picker

### For Plugin Developers

Access the provider programmatically:

```javascript
const provider = this.app.plugins.getPlugin('openrouter-provider');
if (provider) {
    const apiKey = provider.getApiKey();
    const model = provider.getModel('your-plugin-id');
    const response = await provider.fetchWithRetry(requestBody);
}
```

## API Methods

- `getApiKey()` - Returns the configured API key
- `getModel(pluginId)` - Returns the selected model for a plugin
- `setModel(pluginId, modelId)` - Sets the model for a plugin
- `fetchWithRetry(requestBody)` - Makes API calls with retry logic
- `openModelSelector(pluginId, callback)` - Opens the model picker UI

## Compatible Plugins

- AI Learning Assistant (Flashcards)
- AI OCR Formatter
- (Any plugin implementing the provider interface)

## License

MIT License - see [LICENSE](LICENSE) for details.
