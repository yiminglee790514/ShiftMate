export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: { "Content-Type": "application/json; charset=utf-8" } });
    }

    try {
      // Gemini API 金鑰支援輪替：
      // GEMINI_API_KEY = 第 1 組
      // GEMINI_API_KEY_2 = 第 2 組
      // GEMINI_API_KEY_3 = 第 3 組（可繼續往下增加）
      // 當目前金鑰遇到 quota / rate limit 時，會自動換下一組。
      // Gemini API 金鑰輪替：
      // GEMINI_API_KEY = 第 1 組
      // GEMINI_API_KEY_2、_3、_4... = 後續金鑰
      // 會自動讀取目前環境中存在的金鑰，最多支援 20 組。
      const apiKeys = [];
      for (let i = 1; i <= 20; i += 1) {
        const envName = i === 1 ? "GEMINI_API_KEY" : `GEMINI_API_KEY_${i}`;
        const key = String(process.env[envName] || "").trim();
        if (key) apiKeys.push(key);
      }

      if (apiKeys.length === 0) {
        return new Response(JSON.stringify({ error: "找不到 GEMINI_API_KEY，請在部署平台的 Environment Variables 設定。" }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } });
      }

      // 先解析 request body，再讀取 keyOffset。
      // 不能在 const input 初始化前使用 input，否則會拋出
      // "Cannot access 'input' before initialization"。
      const input = await request.json();

      // 同一次辨識流程共用目前可用的 key。
      // 如果該 key 沒額度，askGemini 會自動切到下一組。
      // 每個分組 request 可以指定起始 key，讓 3 人一組的請求自然分散到不同 API Key。
      const requestedKeyOffset = Number.isFinite(Number(input?.keyOffset))
        ? Math.max(0, Number(input.keyOffset))
        : 0;
      let currentKeyIndex = requestedKeyOffset % apiKeys.length;

      const mode = String(input.mode || "").trim();
      const image = String(input.image || "");
      if (!image.startsWith("data:image/")) {
        return new Response(JSON.stringify({ error: "沒有收到有效的圖片資料。" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8" } });
      }

      const commaIndex = image.indexOf(",");
      if (commaIndex < 0) {
        return new Response(JSON.stringify({ error: "圖片格式不正確。" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8" } });
      }

      const mimeType = image.slice(5, commaIndex).split(";")[0] || "image/jpeg";
      const base64Data = image.slice(commaIndex + 1);
      const defaultYear = String(input.year || "").trim();
      const defaultMonth = String(input.month || "").trim();
      const knownEmployees = Array.isArray(input.knownEmployees)
        ? input.knownEmployees.map((p) => ({
            employeeId: String(p?.employeeId || "").trim().toUpperCase(),
            name: String(p?.name || "").trim(),
          })).filter((p) => p.employeeId)
        : [];
      const selectedEmployeeIds = Array.isArray(input.selectedEmployeeIds)
        ? input.selectedEmployeeIds.map((id) => String(id || "").trim().toUpperCase()).filter(Boolean)
        : [];
      const selectedSet = new Set(selectedEmployeeIds);
      const allowed = new Set(
        (selectedSet.size ? knownEmployees.filter((p) => selectedSet.has(p.employeeId)) : knownEmployees)
          .map((p) => p.employeeId)
      );

      const modelUrls = [
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      ];

      function isRetryableError(status, message) {
        return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
          || /quota|rate.?limit|resource.?exhausted|high demand|temporarily unavailable|overloaded|timeout|fetch failed/i.test(String(message || ""));
      }

      async function fetchWithTimeout(url, options, timeoutMs = 8000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await fetch(url, { ...options, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
      }

      async function askGemini(prompt, responseSchema) {
        let lastError = null;
        const delays = [700, 1200];

        // 一個分組正常只呼叫一次；只有服務忙碌/限流時才快速換模型或換 key。
        for (let attempt = 0; attempt < apiKeys.length; attempt += 1) {
          const keyIndex = (currentKeyIndex + attempt) % apiKeys.length;
          const apiKey = apiKeys[keyIndex];

          for (let modelIndex = 0; modelIndex < modelUrls.length; modelIndex += 1) {
            const modelUrl = modelUrls[modelIndex];
            try {
              const response = await fetchWithTimeout(modelUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": apiKey,
                },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Data } }] }],
                  generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema,
                    maxOutputTokens: 4096,
                    thinkingConfig: {
                      thinkingLevel: "low",
                    },
                  },
                }),
              }, 8000);

              const raw = await response.text();
              let data = {};
              try { data = JSON.parse(raw); } catch {}

              if (response.ok) {
                currentKeyIndex = keyIndex;
                const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
                try {
                  return JSON.parse(text);
                } catch {
                  throw new Error("Gemini 回傳的結果不是有效 JSON。");
                }
              }

              const message = data?.error?.message || `Gemini API 錯誤：${response.status}`;
              lastError = new Error(message);

              if (!isRetryableError(response.status, message)) throw lastError;

              // 503/high demand：先換備援模型；兩個模型都忙才換下一把 key。
              if (modelIndex < modelUrls.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, delays[modelIndex] || 800));
                continue;
              }
            } catch (error) {
              lastError = error instanceof Error ? error : new Error(String(error));
              if (modelIndex < modelUrls.length - 1 && /abort|timeout|fetch failed|high demand|503|temporarily/i.test(lastError.message)) {
                await new Promise((resolve) => setTimeout(resolve, delays[modelIndex] || 800));
                continue;
              }
            }
          }

          currentKeyIndex = (keyIndex + 1) % apiKeys.length;
        }

        throw new Error(`Gemini 暫時無法完成辨識。已嘗試 ${apiKeys.length} 組 API Key。${lastError?.message ? ` ${lastError.message}` : ""}`);
      }

      const employeeSchema = {
        type: "OBJECT",
        properties: {
          employeeId: { type: "STRING" },
          name: { type: "STRING" },
          sourceIndex: { type: "INTEGER", minimum: 0, maximum: 2 },
          days: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                date: { type: "STRING" },
                type: { type: "STRING" },
                marker: { type: "STRING" },
                columnHeader: { type: "STRING" },
                markers: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                },
              },
              required: ["date", "type", "marker", "columnHeader", "markers"],
            },
          },
        },
        required: ["employeeId", "name", "sourceIndex", "days"],
      };

      const schema = {
        type: "OBJECT",
        properties: {
          employees: { type: "ARRAY", minItems: 0, maxItems: 3, items: employeeSchema },
          warnings: { type: "ARRAY", items: { type: "STRING" } },
          imageYear: { type: "STRING" },
          imageMonth: { type: "STRING" },
        },
        required: ["employees", "warnings", "imageYear", "imageMonth"],
      };

      const singleEmployeeSchema = {
        type: "OBJECT",
        properties: {
          employees: {
            type: "ARRAY",
            minItems: 0,
            maxItems: 1,
            items: {
              type: "OBJECT",
              properties: {
                employeeId: { type: "STRING" },
                name: { type: "STRING" },
                days: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      date: { type: "STRING" },
                      type: { type: "STRING" },
                      marker: { type: "STRING" },
                      columnHeader: { type: "STRING" },
                      markers: { type: "ARRAY", items: { type: "STRING" } },
                    },
                    required: ["date", "type", "marker", "columnHeader", "markers"],
                  },
                },
              },
              required: ["employeeId", "name", "days"],
            },
          },
          warnings: { type: "ARRAY", items: { type: "STRING" } },
          imageYear: { type: "STRING" },
          imageMonth: { type: "STRING" },
        },
        required: ["employees", "warnings", "imageYear", "imageMonth"],
      };

      const employeeList = knownEmployees
        .map((p) => `${p.employeeId}${p.name ? `（${p.name}）` : ""}`)
        .join("、");

      const rules = `
年月：${defaultYear || "未提供"} 年 ${defaultMonth || "未提供"} 月。

【最重要規則】
1. 系統員工清單僅用來決定最後哪些員工可以輸出：${employeeList}
2. 圖片中的工號只要是圖片實際看見的員工，都可以作為定位參考；不要因為不在系統清單而產生 warning。最後只輸出系統清單中的員工。
3. 這次圖片是由程式上下排列的「1～3 個獨立員工區塊」。每個區塊都包含自己的日期標題列＋自己的員工列；不同區塊之間有白色間隔。
4. 每個員工只能使用「自己區塊」的日期列與員工列，絕對不可把上一個或下一個區塊的格子混進來。
5. 【月份以圖片為準】先讀最上方日期標題，判斷圖片實際年份與月份。程式帶入的 ${defaultMonth || "未知"} 月只是畫面目前選擇值，不是正確答案。只要圖片標題清楚顯示 9/1～9/30，就必須判定 imageMonth=9；不要把 9 月硬套成 8 月。若圖片標題顯示其他月份，就以圖片標題為準。
6. 只抓指定標記：休、半、K12、工程、3F、4F、5F、4A、4B、5A、5B。
7. 紅底代表休，紅底即使有文字也優先視為休。
8. 綠底任何標記都不抓。
9. 「半」一定要抓；格子內只要清楚看到「半」，就一定建立該日期資料。不要因為同一格還有 K12 而漏掉「半」。
10. K12、工程、3F、4F、5F、4A、4B、5A、5B 也一定要抓。
11. 每個日期格請分別判斷「休、半、K12、工程、3F、4F、5F、4A、4B、5A、5B」，不要只選其中一個。若同一格同時有兩個以上指定標記，全部放進 markers 陣列，例如 ["半","K12"]。
12. 「休」具有最高優先權：只要同一格有休，不論還有 5B、4A、K12、半天或其他指定標記，最後只回傳 type="休"、marker="休"。
13. 回傳 marker 時要保留所有非休指定標記，例如 marker="半/K12"、marker="4A/5B"。
14. O、O5A、O5B、5A、5B、A1、A2、A3、A4 都是文字，不可誤認為三角形。
15. 不確定的格子不要猜，放入 warnings。
16. date 必須輸出 YYYY-MM-DD，且 columnHeader 必須盡量逐格填寫實際上方日期標題。
`;

      function normalizeDay(day) {
        if (!day?.date && !day?.columnHeader) return null;

        const rawType = String(day?.type || "").trim();
        const rawMarker = String(day?.marker || "").trim();
        const rawColumnHeader = String(day?.columnHeader || "").trim();
        const rawMarkers = Array.isArray(day?.markers) ? day.markers : [];
        const combined = [rawType, rawMarker, rawColumnHeader, ...rawMarkers]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .join("/");

        // 優先使用 AI 明確辨識出的「日期欄標題」。
        // 例如 AI 若誤把 9/14 格子的 date 寫成 9/13，但 columnHeader=9/14，
        // 這裡會以欄位標題為準，避免整欄向左/向右偏一格。
        let normalizedDate = String(day?.date || "").trim();
        const headerMatch = rawColumnHeader.match(/(?:^|\D)(1[0-2]|[1-9])\s*[/.-]\s*(3[01]|[12]\d|0?[1-9])(?:$|\D)/);
        let detectedHeaderMonth = null;
        if (headerMatch) {
          const headerMonth = Number(headerMatch[1]);
          const headerDay = Number(headerMatch[2]);
          detectedHeaderMonth = headerMonth;
          // 日期欄標題是最高優先權；不要被目前畫面選到的月份（例如 8 月）覆蓋。
          normalizedDate = `${defaultYear || new Date().getFullYear()}-${String(headerMonth).padStart(2, "0")}-${String(headerDay).padStart(2, "0")}`;
        }

        if (!normalizedDate) return null;

        const dateMatch = normalizedDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (!dateMatch) return null;
        const dateYear = Number(dateMatch[1]);
        const dateMonth = Number(dateMatch[2]);
        const dateDay = Number(dateMatch[3]);
        const targetYear = Number(defaultYear);
        const daysInDateMonth = new Date(dateYear, dateMonth, 0).getDate();
        if (Number.isFinite(targetYear) && dateYear !== targetYear) return null;
        if (dateMonth < 1 || dateMonth > 12 || dateDay < 1 || dateDay > daysInDateMonth) return null;
        normalizedDate = `${String(dateYear).padStart(4, "0")}-${String(dateMonth).padStart(2, "0")}-${String(dateDay).padStart(2, "0")}`;

        if (rawType === "休" || combined.includes("休")) {
          return { date: normalizedDate, type: "休", marker: "休", columnHeader: rawColumnHeader };
        }

        const supported = ["半", "K12", "工程", "3F", "4F", "5F", "4A", "4B", "5A", "5B"];
        const found = [];
        for (const marker of supported) {
          if (combined.includes(marker)) found.push(marker === "半" ? "半天" : marker);
        }

        const unique = [...new Set(found)];
        if (unique.length) {
          return { date: normalizedDate, type: "特殊", marker: unique.join("/"), columnHeader: rawColumnHeader };
        }
        return null;
      }


      if (mode === "recognizeAll") {
        const prompt = `
你是 ShiftMate 排班表辨識助手。

【這次非常重要】
這次 API 收到的圖片不是整張排班表，而是「一位員工的獨立區塊」。
圖片中只允許有：
1. 該員工自己的日期標題列（例如 9/1～9/30）
2. 該員工自己的工號／姓名列
3. 該區塊下方可能有空白或分隔線

你只能辨識這一個區塊內的這一位員工。
【絕對禁止】把其他員工的資料、日期或「休」帶進來。
如果圖片中看見的工號不是系統清單中的員工，employees 必須回傳空陣列，不要猜成別人。
employees 最多只能回傳 1 位員工。

${rules}

【單一員工辨識流程】
1. 先讀取圖片左側員工列的工號，這是本次唯一員工。
2. 再讀取緊鄰該員工正上方的日期標題列。
3. 只在該員工自己的那一列，從 9/1 一欄一欄掃到 9/30。
4. 「休」必須依照它所在的實際欄位判斷日期，不能用上一個或下一個區塊的日期。
5. 不要把日期往左或往右移一格。
6. 如果該員工沒有任何指定標記，employees 可以回傳該員工且 days=[]；程式最後會把沒有標記的人隱藏。
7. 不要為了湊數量猜工號、姓名或日期。
8. imageYear / imageMonth 必須根據這個區塊自己的日期標題判斷。
`;
        const result = await askGemini(prompt, singleEmployeeSchema);
        const employees = (Array.isArray(result?.employees) ? result.employees : [])
          .slice(0, 1)
          .map((employee) => ({
            employeeId: String(employee?.employeeId || "").trim().toUpperCase(),
            name: String(employee?.name || "").trim(),
            days: (Array.isArray(employee?.days) ? employee.days : []).map(normalizeDay).filter(Boolean),
          }))
          .filter((employee) => allowed.has(employee.employeeId));

        const cleanWarnings = (Array.isArray(result?.warnings) ? result.warnings : [])
          .map((item) => String(item || "").trim())
          .filter((item) => item && !/not in the allowed|不在.*(系統|清單)|allowed system employees|系統員工清單/i.test(item));
        return new Response(JSON.stringify({
          employees,
          warnings: cleanWarnings,
          imageYear: String(result?.imageYear || defaultYear || "").trim(),
          imageMonth: String(result?.imageMonth || "").trim(),
        }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
      }

      if (mode === "verifyAll") {
        const firstResult = Array.isArray(input.firstResult) ? input.firstResult : [];
        const compactFirstResult = firstResult.map((employee) => ({
          employeeId: String(employee?.employeeId || "").trim().toUpperCase(),
          name: String(employee?.name || "").trim(),
          days: Array.isArray(employee?.days) ? employee.days : [],
        })).filter((employee) => allowed.has(employee.employeeId));

        const prompt = `
你是 ShiftMate 排班表第二階段「逐列校對」助手。
現在請重新看同一張原始排班表，逐一核對下面的第一次辨識結果。
不要相信第一次結果；以圖片實際內容為準。

第一次辨識結果：
${JSON.stringify(compactFirstResult)}

${rules}

校對要求：
1. 先在圖片左側找到正確工號列，再只讀該工號同一水平列的日期格。
2. 特別注意 D7445、K09439、K22043、F4171、42255、G5452、C8112、K07881、K04175、G7714 等可能出現在清單中的員工，不可因為第一次沒抓到就忽略。
3. 如果第一次漏掉系統員工，只要圖片中確實存在，就補回來。
4. 如果第一次把別列資料放進來，依圖片刪除。
5. 每個日期格重新判斷「休、半、K12、工程、3F、4F、5F、4A、4B、5A、5B」，若同一格同時出現多個指定標記，全部保留，不可漏掉「半」。
6. 不要為了湊數量而猜測。
7. 最終只回傳你能從圖片確認的資料。
8. 對第一次結果中每一個日期都重新確認「該休字正上方的日期標題」，若第一次是 9/13 而圖片欄位其實是 9/14，必須改成 9/14。
9. 每一位圖片中存在且在系統清單的員工都要回傳；即使該員工沒有任何指定標記，也回傳該員工且 days 為空陣列。
10. 不要因為第一次結果看起來合理就照抄；每個日期都要重新對照欄位。
`;

        const result = await askGemini(prompt, schema);
        const employees = (Array.isArray(result?.employees) ? result.employees : [])
          .map((employee) => ({
            employeeId: String(employee?.employeeId || "").trim().toUpperCase(),
            name: String(employee?.name || "").trim(),
            days: (Array.isArray(employee?.days) ? employee.days : []).map(normalizeDay).filter(Boolean),
          }))
          .filter((employee) => allowed.has(employee.employeeId));

        const cleanWarnings = (Array.isArray(result?.warnings) ? result.warnings : [])
          .map((item) => String(item || "").trim())
          .filter((item) => item && !/not in the allowed|不在.*(系統|清單)|allowed system employees|系統員工清單/i.test(item));
        return new Response(JSON.stringify({
          employees,
          warnings: cleanWarnings,
          imageYear: String(result?.imageYear || defaultYear || "").trim(),
          imageMonth: String(result?.imageMonth || "").trim(),
        }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
      }

      return new Response(JSON.stringify({ error: "未知的 AI 辨識模式。" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8" } });
    } catch (error) {
      console.error("Gemini shift import error:", error);
      return new Response(JSON.stringify({ error: error?.message || "Gemini AI 發生未知錯誤" }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
  },
};
