import { Notice } from "obsidian";

export class StreamManager {
    static async streamRequest(
        url: string,
        apiKey: string,
        requestBody: any,
        onToken: (token: string) => void,
        onError: (error: any) => void,
        onComplete: (fullText: string) => void,
        abortController: AbortController = new AbortController()
    ): Promise<void> {

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                    "HTTP-Referer": "https://obsidian.md",
                    "X-Title": "Obsidian OpenRouter Provider"
                },
                body: JSON.stringify({ ...requestBody, stream: true }),
                signal: abortController.signal
            });

            if (!response.ok) {
                let errorMsg = `API Error ${response.status}`;
                try {
                    const errorJson = await response.json();
                    if (errorJson?.error?.message) errorMsg += `: ${errorJson.error.message}`;
                } catch (e) {
                    errorMsg += `: ${response.statusText}`;
                }
                throw new Error(errorMsg);
            }

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let fullText = "";
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                const lines = buffer.split("\n");
                // Keep the last partial line in the buffer
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === "data: [DONE]") continue;

                    if (trimmed.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(trimmed.slice(6));

                            // Handle content delta
                            const delta = data.choices?.[0]?.delta?.content;
                            if (delta) {
                                fullText += delta;
                                onToken(delta);
                            }

                            // Check finish reason
                            if (data.choices?.[0]?.finish_reason) {
                                // Request finished
                            }
                        } catch (e) {
                            console.warn("Failed to parse SSE line:", line, e);
                        }
                    } else {
                        // Keep parsing if line might be wrapped JSON? 
                        // Usually SSE lines are strictly data: {...}
                        // Non-data lines are ignored (like keep-alives)
                    }
                }
            }

            // Final completion callback
            onComplete(fullText);

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('Stream aborted');
                // Optional: callback for abort
            } else {
                console.error("Stream Error:", error);
                onError(error);
            }
        }
    }
}
