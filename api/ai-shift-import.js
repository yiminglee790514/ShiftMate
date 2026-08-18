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

      // 同一次辨識流程共用目前可用的 key。
      // 如果該 key 沒額度，askGemini 會自動切到下一組。
      let currentKeyIndex = 0;

      const input = await request.json();
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

      const modelUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

      function isQuotaError(status, message) {
        return status === 429 || /quota|rate.?limit|resource.?exhausted|free.?tier/i.test(String(message || ""));
      }

      async function askGemini(prompt, responseSchema) {
        let lastError = null;

        // 每個 request 每組 key 最多嘗試一次。
        // 遇到 quota / rate limit 才換下一組，不會無限重試。
        for (let attempt = 0; attempt < apiKeys.length; attempt += 1) {
          const keyIndex = (currentKeyIndex + attempt) % apiKeys.length;
          const apiKey = apiKeys[keyIndex];

          const response = await fetch(modelUrl, {
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
                temperature: 0,
              },
            }),
          });

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

          if (!isQuotaError(response.status, message)) {
            throw lastError;
          }

          // 這組 key 額度用完，下一個 request 改用下一組 key。
          currentKeyIndex = (keyIndex + 1) % apiKeys.length;

          if (attempt < apiKeys.length - 1) {
            continue;
          }
        }

        throw new Error(
          `所有 Gemini API 金鑰目前都達到配額限制。已嘗試 ${apiKeys.length} 組金鑰，請稍後再試或新增 GEMINI_API_KEY_2、GEMINI_API_KEY_3。原始訊息：${lastError?.message || "Quota exceeded"}`
        );
      }

      const employeeSchema = {
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
                markers: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                },
              },
              required: ["date", "type", "marker", "markers"],
            },
          },
        },
        required: ["employeeId", "name", "days"],
      };

      const schema = {
        type: "OBJECT",
        properties: {
          employees: { type: "ARRAY", items: employeeSchema },
          warnings: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["employees", "warnings"],
      };

      const employeeList = knownEmployees
        .map((p) => `${p.employeeId}${p.name ? `（${p.name}）` : ""}`)
        .join("、");

      const rules = `
年月：${defaultYear || "未提供"} 年 ${defaultMonth || "未提供"} 月。

【最重要規則】
1. 只允許回傳以下系統員工：${employeeList}
2. 圖片中其他工號一律忽略，不得新增。
3. 第一欄是工號，後面依序是 8/1、8/2、8/3……等日期欄。
4. 必須按照同一個人的水平列讀取，絕對不可把上下相鄰員工的格子混進來。
5. 只抓指定標記：休、半、K12、工程、3F、4F、5F、4A、4B、5A、5B。
6. 紅底代表休，紅底即使有文字也優先視為休。
7. 綠底任何標記都不抓。
8. 「半」一定要抓；格子內只要清楚看到「半」，就一定建立該日期資料。不要因為同一格還有 K12 而漏掉「半」。
9. K12、工程、3F、4F、5F、4A、4B、5A、5B 也一定要抓。
10. 每個日期格請分別判斷「休、半、K12、工程、3F、4F、5F、4A、4B、5A、5B」，不要只選其中一個。若同一格同時有兩個以上指定標記，全部放進 markers 陣列，例如 ["半","K12"]。
11. 「休」具有最高優先權：只要同一格有休，不論還有 5B、4A、K12、半天或其他指定標記，最後只回傳 type="休"、marker="休"。
12. 回傳 marker 時要保留所有非休指定標記，例如 marker="半/K12"、marker="4A/5B"。
12. O、O5A、O5B、5A、5B、A1、A2、A3、A4 都是文字，不可誤認為三角形。
13. 不確定的格子不要猜，放入 warnings。
14. date 必須輸出 YYYY-MM-DD。
`;

      function normalizeDay(day) {
        if (!day?.date) return null;

        const rawType = String(day?.type || "").trim();
        const rawMarker = String(day?.marker || "").trim();
        const rawMarkers = Array.isArray(day?.markers) ? day.markers : [];
        const combined = [rawType, rawMarker, ...rawMarkers]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .join("/");

        if (rawType === "休" || combined.includes("休")) {
          return { date: String(day.date), type: "休", marker: "休" };
        }

        const supported = ["半", "K12", "工程", "3F", "4F", "5F", "4A", "4B", "5A", "5B"];
        const found = [];
        for (const marker of supported) {
          if (combined.includes(marker)) found.push(marker === "半" ? "半天" : marker);
        }

        const unique = [...new Set(found)];
        if (unique.length) {
          return { date: String(day.date), type: "特殊", marker: unique.join("/") };
        }
        return null;
      }

      if (mode === "recognizeAll") {
        const prompt = `
你是 ShiftMate 排班表第一階段辨識助手。
請直接分析這張完整排班表，不要切圖，不要要求其他圖片。
你的任務是從整張圖片中找出「系統員工」以及這些員工列中符合規則的日期。

${rules}

請逐一檢查清單中的每一個員工。
即使某人沒有指定標記，也可以不放在 employees；但不要把其他人的資料放進來。
工號看不清楚時不要猜。
`;

        const result = await askGemini(prompt, schema);
        const employees = (Array.isArray(result?.employees) ? result.employees : [])
          .map((employee) => ({
            employeeId: String(employee?.employeeId || "").trim().toUpperCase(),
            name: String(employee?.name || "").trim(),
            days: (Array.isArray(employee?.days) ? employee.days : []).map(normalizeDay).filter(Boolean),
          }))
          .filter((employee) => allowed.has(employee.employeeId));

        return new Response(JSON.stringify({
          employees,
          warnings: Array.isArray(result?.warnings) ? result.warnings : [],
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
5. 每個日期格重新判斷「休、半、K12、工程」，若同一格同時出現多個指定標記，全部保留，不可漏掉「半」。
6. 不要為了湊數量而猜測。
6. 最終只回傳你能從圖片確認的資料。
`;

        const result = await askGemini(prompt, schema);
        const employees = (Array.isArray(result?.employees) ? result.employees : [])
          .map((employee) => ({
            employeeId: String(employee?.employeeId || "").trim().toUpperCase(),
            name: String(employee?.name || "").trim(),
            days: (Array.isArray(employee?.days) ? employee.days : []).map(normalizeDay).filter(Boolean),
          }))
          .filter((employee) => allowed.has(employee.employeeId));

        return new Response(JSON.stringify({
          employees,
          warnings: Array.isArray(result?.warnings) ? result.warnings : [],
        }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
      }

      return new Response(JSON.stringify({ error: "未知的 AI 辨識模式。" }), { status: 400, headers: { "Content-Type": "application/json; charset=utf-8" } });
    } catch (error) {
      console.error("Gemini shift import error:", error);
      return new Response(JSON.stringify({ error: error?.message || "Gemini AI 發生未知錯誤" }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
  },
};
