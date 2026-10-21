# Local chatbot model comparison

Small synthetic regression sample; not a human usability or safety certification. Cold model loading is included in latency.

Configured model remains `llama3.2:3b`. No model was downloaded or configuration changed.

| Model | Correct routes (including fallback) | Correct routes from model | Conversational replies | Average routing latency |
| --- | --- | --- | --- | --- |
| qwen3.5:4b | 6/7 | 6/7 | 2/2 | 3334 ms |

Detailed prompts, decisions, fallback use and responses are in `chat-model-comparison.json`. Review prose quality manually; the automated checks measure routing and preservation of the original facts, not naturalness.

Rerun: `node --env-file=.env scripts/evaluate-chat-models.cjs --models=llama3.2:3b,qwen2.5-coder:7b`
