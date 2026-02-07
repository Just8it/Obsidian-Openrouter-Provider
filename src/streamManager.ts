import { Notice } from "obsidian";

export class StreamManager {
    static async streamRequest(
        url: string,
        apiKey: string,
        requestBody: any,
        onToken: (token: string) => void,
        onError: (error: any) => void,
        onComplete: (fullText: string) => void,
        abortController: AbortController = new AbortController(),
        onReasoning?: (reasoning: string) => void
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

            // Check if response is JSON (fallback for non-streaming providers)
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
                const json = await response.json();
                const choice = json.choices?.[0];

                if (choice) {
                    const content = choice.message?.content || "";
                    const reasoning = choice.message?.reasoning || ""; // detailed-thinking field?

                    // Emit reasoning if present
                    if (reasoning && onReasoning) {
                        onReasoning(reasoning);
                    } else if (content.includes("<think>")) {
                        // Attempt to extract think tag if in content
                        const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
                        if (thinkMatch && onReasoning) {
                            onReasoning(thinkMatch[1]);
                        }
                    }

                    if (content) {
                        onToken(content); // Emit all at once
                    }
                    onComplete(content);
                }
                return;
            }

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
                            const delta = data.choices?.[0]?.delta;
                            if (delta) {
                                if (delta.content) {
                                    fullText += delta.content;
                                    onToken(delta.content);
                                }

                                // Handle reasoning delta (DeepSeek R1/V3)
                                if (delta.reasoning && onReasoning) {
                                    onReasoning(delta.reasoning);
                                }
                            }

                        } catch (e) {
                            console.warn("Failed to parse SSE line:", line, e);
                        }
                    }
                }
            }

            // Final completion callback
            onComplete(fullText);

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('Stream aborted');
            } else {
                console.error("Stream Error:", error);
                onError(error);
            }
        }
    }
}
