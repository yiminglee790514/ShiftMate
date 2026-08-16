import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import aiShiftImport from './api/ai-shift-import.js'

function aiShiftApiPlugin() {
  return {
    name: 'shiftmate-ai-shift-api',
    configureServer(server) {
      server.middlewares.use('/api/ai-shift-import', async (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        try {
          const chunks = []
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }
          const body = Buffer.concat(chunks)

          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) {
              headers.set(key, value.join(', '))
            } else if (value != null) {
              headers.set(key, value)
            }
          }

          const request = new Request(
            `http://${req.headers.host || 'localhost'}/api/ai-shift-import`,
            {
              method: 'POST',
              headers,
              body
            }
          )

          const response = await aiShiftImport.fetch(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))

          const responseBody = Buffer.from(await response.arrayBuffer())
          res.end(responseBody)
        } catch (error) {
          console.error('AI shift API middleware error:', error)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
          }
          res.end(JSON.stringify({
            error: error?.message || 'AI 排班 API 發生未知錯誤'
          }))
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 本機開發時讀取 .env / .env.local 的所有 Gemini API Key。
  // API Key 不寫進前端程式碼。
  // 重要：不能只設定 GEMINI_API_KEY，否則 _2、_3、_4... 不會進入
  // API middleware 的 process.env，導致輪替程式永遠只看到 1 組金鑰。
  const env = loadEnv(mode, process.cwd(), '')

  for (let i = 1; i <= 20; i += 1) {
    const envName = i === 1 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`
    if (env[envName]) {
      process.env[envName] = env[envName]
    }
  }

  return {
    plugins: [react(), aiShiftApiPlugin()],
  }
})
