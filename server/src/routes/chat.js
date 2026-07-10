const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// POST /api/chat — public endpoint, no auth required
router.post('/', async (req, res) => {
  const db = getDb();
  const { message, history, stream } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: '请输入消息' });
  }

  // Read AI settings
  const settings = {};
  const rows = db.prepare('SELECT key, value FROM settings').all();
  rows.forEach(r => { settings[r.key] = r.value; });

  if (settings.ai_enabled !== 'true') {
    return res.status(403).json({ error: 'AI 聊天功能未启用' });
  }

  const apiKey = settings.ai_api_key;
  if (!apiKey) {
    return res.status(400).json({ error: 'AI API Key 未配置，请联系管理员' });
  }

  const model = settings.ai_model || 'claude-opus-4-8';
  const systemPrompt = settings.ai_system_prompt || '你是这个个人博客的AI助手。请用中文回答，保持友好、简洁的风格。';

  // Fetch published posts for context
  const posts = db.prepare(
    'SELECT title, slug, excerpt, tags, created_at FROM posts WHERE published = 1 ORDER BY created_at DESC'
  ).all();

  let blogContext;
  if (posts.length > 0) {
    const postList = posts.map((p, i) => {
      const date = p.created_at ? p.created_at.slice(0, 10) : '';
      let tags = [];
      try { tags = JSON.parse(p.tags); } catch {}
      const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
      return `${i + 1}. 《${p.title}》(${date})${tagStr}\n   ${p.excerpt || '暂无摘要'}`;
    }).join('\n\n');
    blogContext = `以下是这个博客的已发布文章列表：\n\n${postList}\n\n请根据以上文章内容回答访客的问题。如果访客问的问题涉及以上文章，请引用相关文章的标题。`;
  } else {
    blogContext = '这个博客目前还没有发布任何文章。';
  }

  const fullSystemPrompt = `${systemPrompt}\n\n${blogContext}`;

  // Build messages array
  const messages = [];
  if (Array.isArray(history)) {
    for (const h of history) {
      if (h.role && h.content) {
        messages.push({ role: h.role, content: h.content });
      }
    }
  }
  messages.push({ role: 'user', content: message.trim() });

  // Detect provider from model name
  const isDeepSeek = model.startsWith('deepseek');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    if (stream) {
      // === SSE streaming mode ===
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });

      let response;
      if (isDeepSeek) {
        response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            stream: true,
            messages: [
              { role: 'system', content: fullSystemPrompt },
              ...messages
            ]
          }),
          signal: controller.signal
        });
      } else {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            stream: true,
            system: fullSystemPrompt,
            messages
          }),
          signal: controller.signal
        });
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        let errMsg;
        try {
          const parsed = JSON.parse(errBody);
          errMsg = parsed.error?.message || `API 返回错误 (${response.status})`;
        } catch {
          errMsg = `API 返回错误 (${response.status})`;
        }
        res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
        res.end();
        return;
      }

      // Parse the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const jsonStr = trimmed.slice(6);

            // Anthropic: [DONE] or DeepSeek: [DONE]
            if (jsonStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(jsonStr);

              if (isDeepSeek) {
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) {
                  res.write(`data: ${JSON.stringify({ type: 'delta', content: delta.content })}\n\n`);
                }
              } else {
                // Anthropic SSE event types
                if (parsed.type === 'content_block_delta') {
                  const text = parsed.delta?.text;
                  if (text) {
                    res.write(`data: ${JSON.stringify({ type: 'delta', content: text })}\n\n`);
                  }
                } else if (parsed.type === 'message_delta') {
                  const stopReason = parsed.delta?.stop_reason;
                  if (stopReason) {
                    res.write(`data: ${JSON.stringify({ type: 'stop', stop_reason: stopReason })}\n\n`);
                  }
                }
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          res.write(`data: ${JSON.stringify({ type: 'error', error: 'AI 响应超时，请稍后重试' })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ type: 'error', error: 'AI 服务暂时不可用，请稍后重试' })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } else {
      // === Non-streaming mode (backward compatible) ===
      let response;
      if (isDeepSeek) {
        response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            messages: [
              { role: 'system', content: fullSystemPrompt },
              ...messages
            ]
          }),
          signal: controller.signal
        });
      } else {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: fullSystemPrompt,
            messages
          }),
          signal: controller.signal
        });
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        let errMsg;
        try {
          const parsed = JSON.parse(errBody);
          errMsg = parsed.error?.message || `API 返回错误 (${response.status})`;
        } catch {
          errMsg = `API 返回错误 (${response.status})`;
        }
        console.error(`[chat] ${isDeepSeek ? 'DeepSeek' : 'Anthropic'} API error (${response.status}):`, errBody);
        return res.status(502).json({ error: errMsg });
      }

      const data = await response.json();
      let reply;
      if (isDeepSeek) {
        reply = data.choices?.[0]?.message?.content || '';
      } else {
        reply = data.content?.[0]?.text || '';
      }

      res.json({ reply });
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      if (stream) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'AI 响应超时，请稍后重试' })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        return res.end();
      }
      return res.status(504).json({ error: 'AI 响应超时，请稍后重试' });
    }
    console.error('[chat] Unexpected error:', err);
    if (stream) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'AI 服务暂时不可用，请稍后重试' })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      return res.end();
    }
    res.status(500).json({ error: 'AI 服务暂时不可用，请稍后重试' });
  }
});

module.exports = router;
