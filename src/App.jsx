import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { firebaseConfig, FIREBASE_LOGIN_DOMAIN } from "./firebase.js";

const SHIFT_TYPES = {
  work: { symbol: "○", label: "正班", className: "work" },
  off: { symbol: "■", label: "休假日", className: "off" },
  rest: { symbol: "▲", label: "休息日", className: "rest" },
  holiday: { symbol: "×", label: "例假日", className: "holiday" },
};

// 國定假日：固定國曆 + 農曆節日。每個年份都會自動產生。
// Admin 可在 Firebase 的 holidayOverrides/{year_id} 覆寫名稱、日期或停用。
const FIXED_HOLIDAY_DEFS = [
  { id: "new-year", month: 1, day: 1, name: "元旦" },
  { id: "peace", month: 2, day: 28, name: "和平紀念日" },
  { id: "children", month: 4, day: 4, name: "兒童節" },
  { id: "qingming", month: 4, day: 5, name: "清明節" },
  { id: "labor", month: 5, day: 1, name: "勞動節" },
  { id: "teacher", month: 9, day: 28, name: "教師節" },
  { id: "national", month: 10, day: 10, name: "國慶日" },
  { id: "retrocession", month: 10, day: 25, name: "光復節" },
  { id: "constitution", month: 12, day: 25, name: "行憲紀念日" },
];

function chineseLunarMonthDay(date) {
  try {
    const parts = new Intl.DateTimeFormat("zh-TW-u-ca-chinese", {
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    return { month, day };
  } catch {
    return null;
  }
}

function getLunarNewYearDate(year) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 2, 15);
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const lunar = chineseLunarMonthDay(date);
    if (lunar?.month === 1 && lunar.day === 1) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
  }
  return null;
}

function getSystemHolidayDefinitions(year) {
  const holidays = FIXED_HOLIDAY_DEFS.map((item) => ({
    id: item.id,
    date: dateKey(year, item.month - 1, item.day),
    name: item.name,
  }));

  const newYear = getLunarNewYearDate(year);
  if (newYear) {
    const addDays = (offset) => {
      const date = new Date(newYear);
      date.setDate(date.getDate() + offset);
      return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
    };

    holidays.push(
      { id: "lunar-eve-before", date: addDays(-2), name: "小年夜" },
      { id: "lunar-eve", date: addDays(-1), name: "除夕" },
      { id: "lunar-new-year", date: addDays(0), name: "初一" },
      { id: "lunar-day-2", date: addDays(1), name: "初二" },
      { id: "lunar-day-3", date: addDays(2), name: "初三" },
      { id: "dragon-boat", date: findLunarDate(year, 5, 5), name: "端午節" },
      { id: "mid-autumn", date: findLunarDate(year, 8, 15), name: "中秋節" },
    );
  }

  return holidays.filter((item) => item.date);
}

function findLunarDate(year, lunarMonth, lunarDay) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const lunar = chineseLunarMonthDay(date);
    if (lunar?.month === lunarMonth && lunar.day === lunarDay) {
      return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
    }
  }
  return null;
}

function buildHolidayMap(year, overrides = {}) {
  const map = {};
  getSystemHolidayDefinitions(year).forEach((item) => {
    const override = overrides[item.id];
    if (override?.enabled === false) return;

    const date = override?.date || item.date;
    const name = override?.name?.trim() || item.name;
    if (date && name) map[date] = { id: item.id, name };
  });
  return map;
}

// 2026/8 月保留你之前提供的原始資料，作為參考與備份。
// 真正顯示班別時，現在改由下方「12 天週期」自動計算。
const AUGUST_2026 = {
  A1: {
    1:"work",2:"work",3:"off",4:"holiday",5:"work",6:"work",7:"off",
    8:"rest",9:"work",10:"work",11:"holiday",12:"off",13:"work",14:"work",
    15:"rest",16:"holiday",17:"work",18:"work",19:"off",20:"rest",21:"work",
    22:"work",23:"holiday",24:"off",25:"work",26:"work",27:"rest",28:"holiday",
    29:"work",30:"work",31:"off",
  },
  A2: {
    1:"work",2:"work",3:"off",4:"rest",5:"work",6:"holiday",7:"holiday",
    8:"off",9:"work",10:"rest",11:"rest",12:"holiday",13:"work",14:"off",
    15:"work",16:"rest",17:"work",18:"holiday",19:"work",20:"off",21:"work",
    22:"rest",23:"off",24:"holiday",25:"work",26:"off",27:"work",28:"rest",
    29:"work",30:"holiday",31:"work",
  },
  A3: {
    1:"work",2:"holiday",3:"work",4:"work",5:"off",6:"rest",7:"work",8:"holiday",
    9:"holiday",10:"off",11:"work",12:"rest",13:"work",14:"holiday",15:"work",
    16:"off",17:"work",18:"rest",19:"work",20:"holiday",21:"work",22:"off",
    23:"work",24:"rest",25:"work",26:"holiday",27:"work",28:"off",29:"work",
    30:"rest",31:"work",
  },

  // 你提供的 X1 / X2 / X3 原始規律。
  X1: {
    1:"off",2:"rest",3:"work",4:"work",5:"holiday",6:"off",7:"work",8:"work",
    9:"off",10:"holiday",11:"work",12:"work",13:"off",14:"rest",15:"work",
    16:"work",17:"holiday",18:"off",19:"work",20:"work",21:"rest",22:"holiday",
    23:"work",24:"work",25:"off",26:"rest",27:"work",28:"holiday",29:"work",
    30:"off",31:"work",
  },
  X2: {
    1:"holiday",2:"off",3:"work",4:"work",5:"rest",6:"holiday",7:"work",8:"off",
    9:"off",10:"rest",11:"work",12:"work",13:"holiday",14:"off",15:"work",
    16:"work",17:"off",18:"holiday",19:"work",20:"work",21:"off",22:"rest",
    23:"work",24:"rest",25:"holiday",26:"off",27:"work",28:"work",29:"rest",
    30:"holiday",31:"work",
  },
  X3: {
    1:"rest",2:"holiday",3:"work",4:"work",5:"off",6:"rest",7:"work",8:"holiday",
    9:"holiday",10:"off",11:"work",12:"work",13:"rest",14:"holiday",15:"work",
    16:"work",17:"off",18:"rest",19:"work",20:"holiday",21:"work",22:"off",
    23:"work",24:"work",25:"rest",26:"holiday",27:"work",28:"work",29:"off",
    30:"rest",31:"work",
  },
};

// B 班完全沿用 X 班規律：
// X1 → B1、X2 → B2、X3 → B3。
// 這樣未來修改 X 班規律時，B 班會自動跟著一致。
AUGUST_2026.B1 = AUGUST_2026.X1;
AUGUST_2026.B2 = AUGUST_2026.X2;
AUGUST_2026.B3 = AUGUST_2026.X3;

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function formatDateForDisplay(key) {
  const [year, month, day] = key.split("-");
  return `${year}/${month}/${day}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getCalendarCells(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const days = getDaysInMonth(year, month);
  const previousMonth = month === 0 ? 11 : month - 1;
  const previousYear = month === 0 ? year - 1 : year;
  const previousMonthDays = getDaysInMonth(previousYear, previousMonth);
  const cells = [];

  for (let i = firstDay - 1; i >= 0; i -= 1) {
    const day = previousMonthDays - i;
    cells.push({
      day,
      currentMonth: false,
      date: new Date(previousYear, previousMonth, day),
    });
  }

  for (let day = 1; day <= days; day += 1) {
    cells.push({
      day,
      currentMonth: true,
      date: new Date(year, month, day),
    });
  }

  let nextDay = 1;
  while (cells.length < 42) {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    cells.push({
      day: nextDay,
      currentMonth: false,
      date: new Date(nextYear, nextMonth, nextDay),
    });
    nextDay += 1;
  }

  return cells;
}


// ============================================================
// 12 天輪班週期
// A 班：2026/08/07～08/18 為基準 12 天
// B 班：2026/08/13～08/24 為基準 12 天
//
// 之後不管查看 2026、2027、2028、2035... 都會以 12 天為單位
// 持續循環，不會因為換月份或換年份而重新從第 1 天開始。
// B1/B2/B3 完全沿用原本 X1/X2/X3 的 12 天規律。
// ============================================================

const A_CYCLE_START = new Date(2026, 7, 7);   // 2026/08/07
const B_CYCLE_START = new Date(2026, 7, 13);  // 2026/08/13

const A_CYCLES = {
  // A1：2026/08/07～08/18
  A1: [
    "off", "rest", "work", "work", "holiday", "off", "work", "work", "rest", "holiday", "work", "work",
  ],

  // A2：2026/08/07～08/18
  A2: [
    "holiday", "off", "work", "work", "rest", "holiday", "work", "work", "off", "rest", "work", "work",
  ],

  // A3：2026/08/07～08/18
  A3: [
    "rest", "holiday", "work", "work", "off", "rest", "work", "work", "holiday", "off", "work", "work",
  ],
};

const B_CYCLES = {
  // B1：2026/08/13～08/24
  B1: [
    "off", "rest", "work", "work", "holiday", "off", "work", "work", "rest", "holiday", "work", "work",
  ],

  // B2：2026/08/13～08/24
  B2: [
    "holiday", "off", "work", "work", "rest", "holiday", "work", "work", "off", "rest", "work", "work",
  ],

  // B3：2026/08/13～08/24
  B3: [
    "rest", "holiday", "work", "work", "off", "rest", "work", "work", "holiday", "off", "work", "work",
  ],
};

function daysBetween(startDate, targetDate) {
  const start = Date.UTC(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  );

  const target = Date.UTC(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  );

  return Math.floor((target - start) / 86400000);
}

function cycleIndex(startDate, targetDate) {
  const diff = daysBetween(startDate, targetDate);

  // JavaScript 的 % 對負數會得到負數，所以要這樣處理，
  // 才能讓 2026/08/06 往前、2025 年、2024 年也正常循環。
  return ((diff % 12) + 12) % 12;
}

function getShiftStatus(shift, year, month, day) {
  const targetDate = new Date(year, month, day);

  if (A_CYCLES[shift]) {
    return A_CYCLES[shift][cycleIndex(A_CYCLE_START, targetDate)];
  }

  if (B_CYCLES[shift]) {
    return B_CYCLES[shift][cycleIndex(B_CYCLE_START, targetDate)];
  }

  return "work";
}

function isLeaveText(text) {
  return text?.trim() === "休";
}


// ============================================================
// Firebase 登入
// - 僅使用工號 + 密碼：D7445 → d7445@<FIREBASE_LOGIN_DOMAIN>
// - 登入後從 shiftUsers/{employeeId} 讀取班別、工號、姓名
// ============================================================

function getFirebaseServices() {
  if (!window.firebase) {
    throw new Error("Firebase Web SDK 尚未載入");
  }

  if (!window.__shiftmateFirebaseApp) {
    const required = [
      "apiKey",
      "authDomain",
      "projectId",
      "appId",
    ];

    const missing = required.filter((key) => !firebaseConfig[key]);
    if (missing.length) {
      throw new Error(`Firebase 設定尚未完成：${missing.join(", ")}`);
    }

    window.__shiftmateFirebaseApp = window.firebase.initializeApp(firebaseConfig);
  }

  return {
    auth: window.firebase.auth(),
    db: window.firebase.firestore(),
  };
}

function employeeIdToEmail(employeeId) {
  const normalized = employeeId.trim().toLowerCase();

  if (!normalized) {
    throw new Error("請輸入工號");
  }

  if (!FIREBASE_LOGIN_DOMAIN) {
    throw new Error("尚未設定 Firebase 登入 Email 網域");
  }

  return `${normalized}@${FIREBASE_LOGIN_DOMAIN}`;
}

async function loadShiftUser(db, user) {
  // D7445 帳密登入：文件 ID 直接就是 D7445。
  const employeeId =
    user?.employeeId ||
    user?.displayName ||
    user?.email?.split("@")[0]?.toUpperCase();

  if (employeeId) {
    const direct = await db.collection("shiftUsers").doc(employeeId).get();
    if (direct.exists) return direct.data();
  }

  if (user?.uid) {
    const byUid = await db.collection("shiftUsers").doc(user.uid).get();
    if (byUid.exists) return byUid.data();
  }

  if (user?.email) {
    const byEmail = await db
      .collection("shiftUsers")
      .where("email", "==", user.email)
      .limit(1)
      .get();

    if (!byEmail.empty) return byEmail.docs[0].data();
  }

  return null;
}

export default function App() {
  const today = new Date();

  async function copyMonthLeaveSummary() {
    const days = monthLeaveDays
      .filter(({ key }) => isLeaveText(customEvents[key]))
      .map(({ day }) => `${day}號`)
      .join("、") || "無";
    const text = `${month + 1}月份放假：${days}`;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [shift, setShift] = useState("A1");
  const [showShiftMenu, setShowShiftMenu] = useState(false);

  // Firebase 登入狀態
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [shiftUser, setShiftUser] = useState(null);
  const [showLoginMenu, setShowLoginMenu] = useState(false);
  const [loginEmployeeId, setLoginEmployeeId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  // 自訂內容：
  // K12 / 體檢 / 半天 / 休 都可以直接輸入。
  const [customEvents, setCustomEvents] = useState({});
  // 使用者明確刪除的自訂行程日期，避免舊的雲端資料在重新整理時重新出現。
  const [deletedCustomEventDates, setDeletedCustomEventDates] = useState([]);
  // AI 發布休假後的提示時間與月份。只有該月份有 AI 帶入休假時才顯示。
  const [aiLeaveImportedAt, setAiLeaveImportedAt] = useState(null);
  const [aiLeaveImportedMonth, setAiLeaveImportedMonth] = useState("");

  const [showInput, setShowInput] = useState(false);
  const [inputDate, setInputDate] = useState("");
  const [inputText, setInputText] = useState("");

  // 「本月休假」批次輸入
  const [showLeavePicker, setShowLeavePicker] = useState(false);
  const [selectedLeaveDays, setSelectedLeaveDays] = useState([]);
  // 已儲存的自訂行程是否已從 Firebase 載入完成。
  // 載入完成前不執行自動儲存，避免重新整理時用空資料覆蓋雲端資料。
  const [customEventsLoaded, setCustomEventsLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [globalEvents, setGlobalEvents] = useState({});
  const [holidayOverrides, setHolidayOverrides] = useState({});
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminTab, setAdminTab] = useState("people");
  const [adminPeople, setAdminPeople] = useState([]);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [personForm, setPersonForm] = useState({ employeeId: "", name: "", shift: "A1", password: "" });
  const [editingPersonId, setEditingPersonId] = useState("");
  const [globalEventForm, setGlobalEventForm] = useState({ date: "", text: "" });
  const [holidayForm, setHolidayForm] = useState({ id: "", date: "", name: "" });

  // 管理者：AI 排班圖片辨識（第一階段只辨識，不寫入員工行事曆）
  const [aiShiftFile, setAiShiftFile] = useState(null);
  const [aiShiftPreview, setAiShiftPreview] = useState("");
  const [aiShiftResults, setAiShiftResults] = useState(null);
  const [aiShiftBusy, setAiShiftBusy] = useState(false);
  const [aiShiftError, setAiShiftError] = useState("");
  const [aiPublishEmployeeId, setAiPublishEmployeeId] = useState("");
  const [aiPublishBusy, setAiPublishBusy] = useState(false);
  const [aiPublishMessage, setAiPublishMessage] = useState("");
  const [aiShiftGroups, setAiShiftGroups] = useState([]);
  const [aiShiftGroupId, setAiShiftGroupId] = useState("");
  const [aiShiftGroupName, setAiShiftGroupName] = useState("");
  const [aiSelectedEmployeeIds, setAiSelectedEmployeeIds] = useState([]);
  const [aiGroupBusy, setAiGroupBusy] = useState(false);

  useEffect(() => {
    let unsubscribe = null;

    try {
      const { auth } = getFirebaseServices();

      unsubscribe = auth.onAuthStateChanged(async (user) => {
        setFirebaseUser(user);
        setCustomEventsLoaded(false);

        if (!user) {
          setShiftUser(null);
          setCustomEvents({});
          setAiLeaveImportedAt(null);
          setAiLeaveImportedMonth("");
          setGlobalEvents({});
          setHolidayOverrides({});
          setCustomEventsLoaded(true);
          setAuthReady(true);
          return;
        }

        try {
          const { db } = getFirebaseServices();
          let profile = await loadShiftUser(db, user);
          if (!profile && user.email?.toLowerCase() === employeeIdToEmail("Admin").toLowerCase()) {
            profile = { employeeId: "Admin", name: "管理者", role: "admin", shift: "" };
          }

          // 每位員工第一次登入時，自動把目前 Firebase Auth UID
          // 同步回 shiftUsers/{工號}。
          //
          // 這是為了讓管理者之後可以用「工號 → UID」安全地把
          // AI 辨識結果發布到正確員工的 users/{uid} 行事曆。
          // 只同步「目前登入者自己的 UID」，不會替其他員工寫入 UID。
          if (
            profile?.employeeId &&
            profile.employeeId !== "Admin" &&
            user?.uid &&
            user?.email &&
            user.email.toLowerCase() === employeeIdToEmail(profile.employeeId).toLowerCase()
          ) {
            try {
              if (profile.uid !== user.uid) {
                await db.collection("shiftUsers").doc(profile.employeeId).set(
                  {
                    uid: user.uid,
                    updatedAt: new Date(),
                  },
                  { merge: true }
                );
                profile = { ...profile, uid: user.uid };
              }
            } catch (uidSyncError) {
              // UID 同步失敗不阻止員工登入；管理者之後仍可在系統中看到錯誤。
              console.warn("同步員工 Firebase UID 失敗：", uidSyncError);
            }
          }

          if (profile?.active === false) {
            await auth.signOut();
            setShiftUser(null);
            setCustomEvents({});
            setAiLeaveImportedAt(null);
            setAiLeaveImportedMonth("");
            setCustomEventsLoaded(true);
            setAuthReady(true);
            return;
          }

          setShiftUser(profile);

          if (profile?.shift && ["A1", "A2", "A3", "B1", "B2", "B3"].includes(profile.shift)) {
            setShift(profile.shift);
          }

          const globalSnapshot = await db.collection("globalEvents").get();
          const globals = {};
          globalSnapshot.forEach((doc) => {
            const data = doc.data();
            if (data?.date && data?.text) globals[data.date] = { id: doc.id, text: data.text };
          });
          setGlobalEvents(globals);

          // 從 Firebase 載入這個帳號之前儲存的行事曆自訂內容。
          const calendarDoc = await db.collection("users").doc(user.uid).get();
          const calendarData = calendarDoc.exists ? calendarDoc.data() : {};
          const storedCustomEvents =
            calendarData?.customEvents && typeof calendarData.customEvents === "object"
              ? calendarData.customEvents
              : {};
          const deletedCustomEventDates = Array.isArray(calendarData?.deletedCustomEventDates)
            ? calendarData.deletedCustomEventDates.map((value) => String(value))
            : [];
          const deletedSet = new Set(deletedCustomEventDates);
          const cleanedCustomEvents = Object.fromEntries(
            Object.entries(storedCustomEvents).filter(([date]) => !deletedSet.has(date))
          );

          setCustomEvents(cleanedCustomEvents);
          setDeletedCustomEventDates(deletedCustomEventDates);
          setAiLeaveImportedAt(calendarData?.aiLeaveImportedAt || null);
          setAiLeaveImportedMonth(String(calendarData?.aiLeaveImportedMonth || ""));
          setCustomEventsLoaded(true);
          setAuthReady(true);
        } catch (error) {
          console.error("讀取使用者資料失敗：", error);
          setShiftUser(null);
          setCustomEvents({});
          setCustomEventsLoaded(true);
          setAuthReady(true);
        }
      });
    } catch (error) {
      setAuthReady(true);
      console.error("Firebase 初始化失敗：", error);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    (async () => {
      try {
        const { db } = getFirebaseServices();
        const snapshot = await db.collection("holidayOverrides").where("year", "==", year).get();
        const map = {};
        snapshot.forEach((doc) => { map[doc.id] = doc.data(); });
        if (!cancelled) setHolidayOverrides(map);
      } catch (error) {
        console.error("讀取國定假日設定失敗：", error);
        if (!cancelled) setHolidayOverrides({});
      }
    })();
    return () => { cancelled = true; };
  }, [firebaseUser, year]);

  const cells = useMemo(
    () => getCalendarCells(year, month),
    [year, month]
  );

  const baseStatusMap = useMemo(() => {
    const map = {};

    cells.forEach((cell) => {
      if (!cell.currentMonth) return;
      const key = dateKey(year, month, cell.day);
      map[key] = getShiftStatus(shift, year, month, cell.day);
    });

    return map;
  }, [cells, year, month, shift]);

  const statusMap = baseStatusMap;

  const monthLeaveDays = useMemo(
    () =>
      Array.from({ length: getDaysInMonth(year, month) }, (_, index) => {
        const day = index + 1;
        const key = dateKey(year, month, day);
        return {
          day,
          key,
          selected: isLeaveText(customEvents[key]) || statusMap[key] === "holiday",
        };
      }),
    [year, month, customEvents, statusMap]
  );

  const monthStatistics = useMemo(() => {
    const stats = { work: 0, off: 0, rest: 0, holiday: 0, hours: 0 };

    for (let day = 1; day <= getDaysInMonth(year, month); day += 1) {
      const key = dateKey(year, month, day);
      const status = statusMap[key] || "work";
      const customText = String(customEvents[key] || "").trim();

      // 有「休」時，這一天統一歸到「× 例假日」統計。
      // 同時不計入原本的 ○/■/▲ 天數，也不計上班時數。
      if (isLeaveText(customText)) {
        stats.holiday += 1;
        continue;
      }

      stats[status] += 1;

      // 「半」或「半天」不論底色/符號為何，都只算 5 小時。
      if (customText.includes("半")) {
        stats.hours += 5;
      } else if (status === "work" || status === "off" || status === "rest") {
        stats.hours += 10;
      }
    }

    return stats;
  }, [year, month, customEvents, statusMap]);

  const aiLeaveNotice = useMemo(() => {
    const currentMonthKey = `${year}-${pad(month + 1)}`;
    if (!aiLeaveImportedAt || aiLeaveImportedMonth !== currentMonthKey) return "";

    const date = aiLeaveImportedAt?.toDate
      ? aiLeaveImportedAt.toDate()
      : new Date(aiLeaveImportedAt);
    if (Number.isNaN(date.getTime())) return "";

    const formatted = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date).replace(/-/g, "/").replace(/\s+/g, " ");

    return `AI 辨識休假已於 ${formatted} 帶入，請確認`;
  }, [year, month, aiLeaveImportedAt, aiLeaveImportedMonth]);

  function openLoginMenu() {
    setLoginError("");
    setLoginPassword("");
    setShowLoginMenu(true);
  }

  async function loginWithEmployee() {
    setLoginError("");

    if (!loginEmployeeId.trim() || !loginPassword) {
      setLoginError("請輸入工號與密碼");
      return;
    }

    setLoginBusy(true);

    try {
      const { auth, db } = getFirebaseServices();
      const email = employeeIdToEmail(loginEmployeeId);

      const result = await auth.signInWithEmailAndPassword(email, loginPassword);
      const normalizedId = loginEmployeeId.trim().toUpperCase();
      const profile = await db.collection("shiftUsers").doc(normalizedId).get();
      let data = profile.exists ? profile.data() : null;

      if (!data && normalizedId === "ADMIN") {
        data = { employeeId: "Admin", name: "管理者", role: "admin", shift: "" };
      }

      if (!data) {
        await auth.signOut();
        throw new Error("此工號尚未建立，請找系統管理員新增。");
      }

      if (data.active === false) {
        await auth.signOut();
        setShiftUser(null);
        setLoginError("此工號目前已停用，請聯絡系統管理員。");
        return;
      }

      setShiftUser(data);

      if (data?.shift && ["A1", "A2", "A3", "B1", "B2", "B3"].includes(data.shift)) {
        setShift(data.shift);
      }

      setShowLoginMenu(false);
      setLoginPassword("");
    } catch (error) {
      console.error("工號登入失敗：", error);
      const code = error?.code || "";

      if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
        setLoginError("工號或密碼錯誤");
      } else if (code.includes("invalid-email")) {
        setLoginError("工號對應的登入 Email 設定錯誤");
      } else {
        setLoginError(error?.message || "登入失敗");
      }
    } finally {
      setLoginBusy(false);
    }
  }


  async function logoutFirebase() {
    try {
      const { auth } = getFirebaseServices();
      await auth.signOut();
      setFirebaseUser(null);
      setShiftUser(null);
    } catch (error) {
      console.error("登出失敗：", error);
    }
  }

  function openShiftMenu() {
    setShowShiftMenu(true);
  }

  function selectShift(value) {
    setShift(value);
    setShowShiftMenu(false);
  }

  function goPreviousMonth() {
    if (month === 0) {
      setYear((value) => value - 1);
      setMonth(11);
    } else {
      setMonth((value) => value - 1);
    }
  }

  function goNextMonth() {
    if (month === 11) {
      setYear((value) => value + 1);
      setMonth(0);
    } else {
      setMonth((value) => value + 1);
    }
  }

  function goToday() {
    const current = new Date();
    setYear(current.getFullYear());
    setMonth(current.getMonth());
  }

  async function saveCustomEventsToFirebase(nextEvents, nextDeletedDates = null) {
    if (!firebaseUser?.uid || !customEventsLoaded) return;

    try {
      const { db } = getFirebaseServices();
      const payload = {
        customEvents: nextEvents,
        updatedAt: new Date(),
      };

      if (Array.isArray(nextDeletedDates)) {
        payload.deletedCustomEventDates = [
          ...new Set(nextDeletedDates.map((value) => String(value))),
        ];
      }

      await db.collection("users").doc(firebaseUser.uid).set(
        payload,
        { merge: true }
      );
    } catch (error) {
      console.error("儲存行事曆失敗：", error);
      try {
        localStorage.setItem(
          `shiftmate_customEvents_${firebaseUser.uid}`,
          JSON.stringify({
            customEvents: nextEvents,
            deletedCustomEventDates: Array.isArray(nextDeletedDates)
              ? [...new Set(nextDeletedDates.map((value) => String(value)))]
              : [],
          })
        );
      } catch {
        // ignore localStorage errors
      }
    }
  }

  function openCustomInput(cell) {
    if (!cell.currentMonth) return;

    const key = dateKey(year, month, cell.day);
    setInputDate(key);
    setInputText(customEvents[key] || "");
    setShowInput(true);
  }

  async function saveCustomEvent() {
    if (!inputDate) return;

    const next = { ...customEvents };
    const deletedNext = new Set(deletedCustomEventDates);

    if (inputText.trim()) {
      next[inputDate] = inputText.trim();
      deletedNext.delete(inputDate);
    } else {
      delete next[inputDate];
      deletedNext.add(inputDate);
    }

    const deletedArray = [...deletedNext];
    setCustomEvents(next);
    setDeletedCustomEventDates(deletedArray);
    await saveCustomEventsToFirebase(next, deletedArray);
    setShowInput(false);
  }

  async function removeCustomEvent() {
    const next = { ...customEvents };
    delete next[inputDate];

    const deletedNext = [...new Set([...deletedCustomEventDates, inputDate])];
    setCustomEvents(next);
    setDeletedCustomEventDates(deletedNext);
    await saveCustomEventsToFirebase(next, deletedNext);
    setShowInput(false);
  }

  function openLeavePicker() {
    // 開啟「本月放假」時，除了已儲存的「休」，
    // 也預先選取目前班表的「× 例假日」。
    // 這只是編輯畫面的預選，不會在尚未儲存時自動寫入「休」。
    setSelectedLeaveDays(
      monthLeaveDays.filter((item) => item.selected).map((item) => item.day)
    );
    setShowLeavePicker(true);
  }

  function toggleLeaveDay(day) {
    setSelectedLeaveDays((old) =>
      old.includes(day)
        ? old.filter((value) => value !== day)
        : [...old, day].sort((a, b) => a - b)
    );
  }

  async function saveLeaveDays() {
    const next = { ...customEvents };
    const deletedNext = new Set(deletedCustomEventDates);

    monthLeaveDays.forEach(({ key, day }) => {
      const shouldLeave = selectedLeaveDays.includes(day);
      if (shouldLeave) {
        next[key] = "休";
        deletedNext.delete(key);
      } else if (isLeaveText(next[key])) {
        delete next[key];
        deletedNext.add(key);
      }
    });

    const deletedArray = [...deletedNext];
    setCustomEvents(next);
    setDeletedCustomEventDates(deletedArray);
    await saveCustomEventsToFirebase(next, deletedArray);
    setShowLeavePicker(false);
  }

  async function copySelectedLeaveSummary() {
    const days = selectedLeaveDays.join("、") || "無";
    const text = `${month + 1}月放假${days}`;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }


  function resetAiShiftImport() {
    setAiShiftFile(null);
    setAiShiftPreview("");
    setAiShiftResults(null);
    setAiShiftError("");
    setAiSelectedEmployeeIds([]);
    setAiPublishEmployeeId("");
    setAiPublishMessage("");
    setAiShiftGroupId("");
    setAiShiftGroupName("");
  }

  function handleAiShiftFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAiShiftError("請上傳 JPG、PNG 或其他圖片檔案。");
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setAiShiftError("圖片太大，請使用 12MB 以下的圖片。");
      return;
    }

    setAiShiftError("");
    setAiShiftResults(null);
    setAiShiftFile(file);

    const reader = new FileReader();
    reader.onload = () => setAiShiftPreview(String(reader.result || ""));
    reader.onerror = () => setAiShiftError("圖片讀取失敗，請重新選擇。");
    reader.readAsDataURL(file);
  }

  function loadImageForAi(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("圖片載入失敗，無法進行 AI 分列。"));
      image.src = src;
    });
  }

  async function cropAiImage(src, crop) {
    const image = await loadImageForAi(src);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;

    const x = Math.max(0, Math.floor(crop.x || 0));
    const y = Math.max(0, Math.floor(crop.y || 0));
    const width = Math.min(sourceWidth - x, Math.max(1, Math.floor(crop.width)));
    const height = Math.min(sourceHeight - y, Math.max(1, Math.floor(crop.height)));
    const scale = Math.min(4, Math.max(1, 1800 / Math.max(width, height)));

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const context = canvas.getContext("2d", { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.92);
  }

  async function detectAiShiftEmployeeCrops(src) {
    const image = await loadImageForAi(src);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(width, 1400);
    canvas.height = Math.max(1, Math.round(height * (canvas.width / width)));
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const warmRows = [];
    const sampleStep = Math.max(1, Math.floor(canvas.width / 700));

    for (let y = 0; y < canvas.height; y += 1) {
      let warm = 0;
      let samples = 0;
      for (let x = 0; x < canvas.width; x += sampleStep) {
        const i = (y * canvas.width + x) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        if (r > 150 && g > 125 && r - b > 18 && g - b > 8) warm += 1;
        samples += 1;
      }
      warmRows.push(samples ? warm / samples : 0);
    }

    // 新格式：每位員工都有自己的「日期列＋員工列」。
    // 每一條淡橘/淡黃日期列就是一個獨立員工區塊的起點。
    const bands = [];
    let start = -1;
    for (let y = 0; y < warmRows.length; y += 1) {
      const hit = warmRows[y] >= 0.42;
      if (hit && start < 0) start = y;
      if ((!hit || y === warmRows.length - 1) && start >= 0) {
        const end = hit && y === warmRows.length - 1 ? y : y - 1;
        if (end - start + 1 >= 2) bands.push({ start, end });
        start = -1;
      }
    }

    const merged = [];
    for (const band of bands) {
      const last = merged[merged.length - 1];
      if (last && band.start - last.end <= 3) last.end = band.end;
      else merged.push({ ...band });
    }

    const candidates = merged.filter((band) => {
      const h = band.end - band.start + 1;
      return h >= 3 && h <= Math.max(28, canvas.height * 0.12);
    });

    // 每一個日期標題列到下一個日期標題列，就是「一位員工」的完整區塊。
    // 不再使用等距 3 人 fallback，避免把不同員工的資料切在一起。
    return candidates.map((band, index) => {
      const next = candidates[index + 1];
      const y = Math.max(0, Math.floor((band.start / canvas.height) * height) - 2);
      const nextY = next
        ? Math.floor((next.start / canvas.height) * height)
        : height;
      return {
        x: 0,
        y,
        width,
        height: Math.min(height - y, Math.max(1, nextY - y + 1)),
      };
    });
  }

  async function detectRedRestDatesFromCrop(src, crop) {
    // 「休」在排班圖中固定是紅字；對紅字日期做一次本地像素定位，
    // 用來修正 Gemini 偶爾左右偏一格的情況。特殊標記仍交給 Gemini。
    const image = await loadImageForAi(src);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const x = Math.max(0, Math.floor(crop.x || 0));
    const y = Math.max(0, Math.floor(crop.y || 0));
    const width = Math.min(sourceWidth - x, Math.max(1, Math.floor(crop.width)));
    const height = Math.min(sourceHeight - y, Math.max(1, Math.floor(crop.height)));

    const scale = Math.min(2, Math.max(1, 1400 / Math.max(width, height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    context.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const startY = Math.floor(canvas.height * 0.42);
    const redByX = new Array(canvas.width).fill(0);

    for (let py = startY; py < canvas.height; py += 1) {
      for (let px = 0; px < canvas.width; px += 1) {
        const i = (py * canvas.width + px) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        // 避免把淡橘色背景/網格誤認成紅字。
        if (r >= 150 && r - g >= 70 && r - b >= 55 && g < 130) redByX[px] += 1;
      }
    }

    // 把相鄰紅字像素合成一個「休」字群。
    const clusters = [];
    let clusterStart = -1;
    for (let px = 0; px < redByX.length; px += 1) {
      const hit = redByX[px] >= 1;
      if (hit && clusterStart < 0) clusterStart = px;
      if ((!hit || px === redByX.length - 1) && clusterStart >= 0) {
        const end = hit && px === redByX.length - 1 ? px : px - 1;
        if (end - clusterStart + 1 >= Math.max(2, Math.round(scale * 2))) {
          clusters.push({ start: clusterStart, end });
        }
        clusterStart = -1;
      }
    }

    // 第一欄是工號欄；剩下 30 欄等寬。用 crop 的實際寬度估算資料區，
    // 不依賴固定像素，換圖片尺寸也能使用。
    const employeeColumnRatio = 0.078;
    const dataStart = canvas.width * employeeColumnRatio;
    const dataWidth = canvas.width - dataStart;
    const result = new Set();

    for (const cluster of clusters) {
      const centerX = (cluster.start + cluster.end) / 2;
      if (centerX < dataStart) continue;
      const rawIndex = Math.round(((centerX - dataStart) / dataWidth) * 30 - 0.5);
      const day = rawIndex + 1;
      if (day >= 1 && day <= 30) result.add(day);
    }

    return [...result].sort((a, b) => a - b);
  }

  async function combineAiCropImages(cropImages) {
    const images = await Promise.all(cropImages.map((src) => loadImageForAi(src)));
    if (!images.length) throw new Error("沒有可供 AI 辨識的員工區塊。");

    const gap = 18;
    const width = Math.max(...images.map((image) => image.naturalWidth || image.width));
    const height = images.reduce((sum, image) => sum + (image.naturalHeight || image.height), 0) + gap * (images.length - 1);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    let y = 0;
    for (const image of images) {
      const imageWidth = image.naturalWidth || image.width;
      const imageHeight = image.naturalHeight || image.height;
      context.drawImage(image, 0, y, imageWidth, imageHeight);
      y += imageHeight + gap;
    }

    return canvas.toDataURL("image/jpeg", 0.92);
  }

  async function runAiShiftRecognition() {
    if (!aiShiftPreview) {
      setAiShiftError("請先上傳排班圖片。");
      return;
    }

    setAiShiftBusy(true);
    setAiShiftError("");
    setAiShiftResults(null);

    try {
      const allKnownEmployees = adminPeople.map((person) => ({
        employeeId: String(person.employeeId || "").trim().toUpperCase(),
        name: person.name || "",
      })).filter((person) => person.employeeId);

      if (!allKnownEmployees.length) {
        throw new Error("系統目前沒有可比對的員工資料。");
      }

      const selectedIds = new Set(
        aiSelectedEmployeeIds.map((value) => String(value || "").trim().toUpperCase()).filter(Boolean)
      );
      if (!selectedIds.size) throw new Error("請先勾選要辨識的員工。");

      // 這裡不能依系統工號排序來硬切 3 人一組；Firebase 的 employeeId 是排序過的，
      // 和圖片上的實際 3 人分組沒有關係。真正的分組來源必須是圖片本身。
      // 先偵測圖片中每一個「日期標題＋單一員工列」區塊。
      const detectedCrops = await detectAiShiftEmployeeCrops(aiShiftPreview);
      if (!detectedCrops.length) {
        throw new Error("無法辨識每位員工的日期區塊，請確認圖片包含完整的日期標題列。");
      }

      const requestGemini = async (groupImage, keyOffset = 0) => {
        const response = await fetch("/api/ai-shift-import", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            mode: "recognizeAll",
            image: groupImage,
            // 每個裁切批次都提供完整系統員工清單，讓 AI 只從已知工號中選出圖片實際看到的員工。
            knownEmployees: allKnownEmployees,
            selectedEmployeeIds: allKnownEmployees.map((person) => person.employeeId),
            year: String(year),
            month: String(month + 1),
            keyOffset,
          }),
        });

        const raw = await response.text();
        let data = {};
        try { data = JSON.parse(raw); } catch { data = {}; }
        if (!response.ok) {
          throw new Error(data?.error || `AI 辨識失敗（${response.status}）`);
        }
        return data;
      };

      // 新格式：每位員工都有自己的「日期列＋員工列」。
      // 重要：現在「一個員工區塊 = 一次 Gemini request」。
      // 不再把 3 個區塊合併後交給 AI，也不再使用 sourceIndex。
      // 這可以從根本上避免 D2729 被對到 G4547 這種「整個人抓成隔壁人」的問題。
      const jobs = detectedCrops.map((crop, index) => ({
        crop,
        index,
      }));

      const resultsByIndex = new Array(jobs.length);
      let nextJob = 0;
      const worker = async (workerIndex) => {
        while (true) {
          const jobIndex = nextJob++;
          if (jobIndex >= jobs.length) return;
          const job = jobs[jobIndex];
          const cropImage = await cropAiImage(aiShiftPreview, job.crop);
          const result = await requestGemini(cropImage, (job.index + workerIndex) % 5);

          // 紅色「休」只從同一個員工自己的 crop 計算。
          // 不存在跨員工 sourceIndex，因此不可能把 G4547 的休假套到 D2729。
          const redRestDates = await detectRedRestDatesFromCrop(aiShiftPreview, job.crop);
          resultsByIndex[jobIndex] = { ...job, result, redRestDates };
        }
      };

      // 4 個員工區塊並行，兼顧速度與 Gemini 容量。
      const workerCount = Math.min(4, jobs.length);
      await Promise.all(Array.from({ length: workerCount }, (_, index) => worker(index)));

      const knownById = new Map(allKnownEmployees.map((person) => [person.employeeId, person]));
      const employeeMap = new Map();
      const warnings = [];

      for (const job of resultsByIndex) {
        const result = job?.result || {};
        if (Array.isArray(result.warnings)) warnings.push(...result.warnings.map((item) => String(item)));

        const returnedEmployees = Array.isArray(result.employees) ? result.employees : [];
        const returned = new Map(
          returnedEmployees.map((employee) => [
            String(employee?.employeeId || "").trim().toUpperCase(),
            { employee },
          ])
        );

        // 這個 job 本身就只代表一位員工、一個 crop。
        // 紅色「休」直接使用這個 crop 的本地像素結果，不再存在 sourceIndex 對錯人的可能。
        for (const [employeeId, entry] of returned.entries()) {
          const employee = entry.employee;
          const deterministicRestDays = Array.isArray(job.redRestDates)
            ? job.redRestDates
            : [];
          if (deterministicRestDays.length) {
            const aiDays = Array.isArray(employee?.days) ? employee.days : [];
            const aiNonRestDays = aiDays.filter((day) => String(day?.type || "").trim() !== "休" && !String(day?.marker || "").includes("休"));
            employee.days = [
              ...aiNonRestDays,
              ...deterministicRestDays.map((day) => ({
                date: `${String(result?.imageYear || year).padStart(4, "0")}-${String(result?.imageMonth || (month + 1)).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
                type: "休",
                marker: "休",
                columnHeader: `${result?.imageMonth || (month + 1)}/${day}`,
                markers: ["休"],
              })),
            ];
          }
          if (!knownById.has(employeeId)) continue;
          const previous = employeeMap.get(employeeId);
          const mergedDays = [
            ...(Array.isArray(previous?.days) ? previous.days : []),
            ...(Array.isArray(employee?.days) ? employee.days : []),
          ];
          employeeMap.set(employeeId, {
            employeeId,
            name: knownById.get(employeeId)?.name || employee?.name || "",
            days: mergedDays,
          });
        }
      }

      // 圖片月份優先：不要因為目前行事曆停在 8 月，就把上傳的 9 月圖片硬判成 8 月。
      const imageMonthCounts = new Map();
      const imageYearCounts = new Map();
      for (const job of resultsByIndex) {
        const result = job?.result || {};
        const candidateMonth = Number(String(result?.imageMonth || "").replace(/\D/g, ""));
        const candidateYear = Number(String(result?.imageYear || "").replace(/\D/g, ""));
        if (candidateMonth >= 1 && candidateMonth <= 12) {
          imageMonthCounts.set(candidateMonth, (imageMonthCounts.get(candidateMonth) || 0) + 1);
        }
        if (candidateYear >= 2000 && candidateYear <= 2100) {
          imageYearCounts.set(candidateYear, (imageYearCounts.get(candidateYear) || 0) + 1);
        }
      }
      // 如果 AI 沒回 imageMonth，從已辨識日期再推一次。
      if (!imageMonthCounts.size) {
        for (const job of resultsByIndex) {
          const result = job?.result || {};
          for (const employee of (Array.isArray(result.employees) ? result.employees : [])) {
            for (const day of (Array.isArray(employee?.days) ? employee.days : [])) {
              const match = String(day?.date || "").match(/^\d{4}-(\d{1,2})-\d{1,2}$/);
              if (match) {
                const candidateMonth = Number(match[1]);
                if (candidateMonth >= 1 && candidateMonth <= 12) {
                  imageMonthCounts.set(candidateMonth, (imageMonthCounts.get(candidateMonth) || 0) + 1);
                }
              }
            }
          }
        }
      }
      const detectedMonth = imageMonthCounts.size
        ? [...imageMonthCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : Number(month + 1);
      const detectedYear = imageYearCounts.size
        ? [...imageYearCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : Number(year);

      const targetEmployees = allKnownEmployees
        .filter((person) => selectedIds.has(person.employeeId))
        .map((person) => employeeMap.get(person.employeeId) || {
          employeeId: person.employeeId,
          name: person.name || "",
          days: [],
        });

      const employees = targetEmployees.map((employee) => {
        const employeeId = String(employee?.employeeId || "").trim().toUpperCase();
        const person = knownById.get(employeeId);
        if (!person) return null;

        const days = (Array.isArray(employee?.days) ? employee.days : [])
          .map((day) => {
            const rawType = String(day?.type || "").trim();
            const rawMarker = String(day?.marker || "").trim();
            const rawColumnHeader = String(day?.columnHeader || "").trim();
            const rawMarkers = Array.isArray(day?.markers) ? day.markers : [];
            const markerText = [rawMarker, rawColumnHeader, ...rawMarkers]
              .map((value) => String(value || "").trim())
              .filter(Boolean)
              .join("/");

            if (!day?.date && !rawColumnHeader) return null;

            let normalizedDate = String(day?.date || "").trim();
            const headerMatch = rawColumnHeader.match(/(?:^|\D)(1[0-2]|[1-9])\s*[/.-]\s*(3[01]|[12]\d|0?[1-9])(?:$|\D)/);
            if (headerMatch) {
              // 上方欄位標題是最高優先權；不要因為目前行事曆停在 8 月而忽略 9 月圖片。
              normalizedDate = `${detectedYear}-${String(Number(headerMatch[1])).padStart(2, "0")}-${String(Number(headerMatch[2])).padStart(2, "0")}`;
            }

            // 硬限制改為「圖片實際月份」：如果上傳的是 9 月圖片，即使畫面目前停在 8 月，也只接受 9 月。
            const dateMatch = normalizedDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
            if (!dateMatch) return null;
            const dateYear = Number(dateMatch[1]);
            const dateMonth = Number(dateMatch[2]);
            const dateDay = Number(dateMatch[3]);
            const maxDay = new Date(Number(detectedYear), Number(detectedMonth), 0).getDate();
            if (dateYear !== Number(detectedYear) || dateMonth !== Number(detectedMonth) || dateDay < 1 || dateDay > maxDay) return null;
            normalizedDate = `${Number(detectedYear)}-${String(detectedMonth).padStart(2, "0")}-${String(dateDay).padStart(2, "0")}`;

            const hasOff = rawType === "休" || markerText.includes("休");
            if (hasOff) return { date: normalizedDate, type: "休", marker: "休" };

            const supportedMarkers = ["半", "K12", "工程", "3F", "4F", "5F", "4A", "4B", "5A", "5B"];
            const markers = [];
            supportedMarkers.forEach((marker) => {
              if (markerText.includes(marker)) markers.push(marker === "半" ? "半天" : marker);
            });
            const uniqueMarkers = [...new Set(markers)];
            if (uniqueMarkers.length) {
              return { date: normalizedDate, type: "特殊", marker: uniqueMarkers.join("/") };
            }
            return null;
          })
          .filter(Boolean);

        // 同一員工同一天若 AI 重複回傳，只保留一筆；休優先。
        const dayMap = new Map();
        for (const day of days) {
          const previous = dayMap.get(day.date);
          if (!previous || day.type === "休") dayMap.set(day.date, day);
        }

        return {
          employeeId,
          name: person.name || employee.name || "",
          matched: true,
          days: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
        };
      }).filter((employee) => employee && Array.isArray(employee.days) && employee.days.length > 0);

      const uniqueWarnings = [];
      warnings.forEach((warning) => {
        const text = String(warning || "").trim();
        if (!text) return;
        // 「圖片裡的人不在系統名單」在 3 人分組辨識中是正常情況，因為他們只用來定位上下列。
        if (/not in the allowed|不在.*(系統|清單)|allowed system employees|系統員工清單/i.test(text)) return;
        if (!uniqueWarnings.includes(text)) uniqueWarnings.push(text);
      });

      const results = {
        year: String(detectedYear),
        month: String(detectedMonth),
        employees,
        warnings: uniqueWarnings,
        recognitionMode: "每人獨立日期列＋區塊索引校正＋休假像素定位",
      };

      setAiShiftResults(results);
      await createAiShiftGroupFromResults(results);
    } catch (error) {
      console.error("AI 排班辨識失敗：", error);
      setAiShiftError(error?.message || "AI 辨識失敗，請稍後再試。");
    } finally {
      setAiShiftBusy(false);
    }
  }

  async function publishAiShiftEmployee() {
    const employeeId = String(aiPublishEmployeeId || "").trim().toUpperCase();
    if (!employeeId) {
      setAiPublishMessage("請先選擇要發布的員工。");
      return;
    }

    const employee = Array.isArray(aiShiftResults?.employees)
      ? aiShiftResults.employees.find(
          (item) => String(item?.employeeId || "").trim().toUpperCase() === employeeId
        )
      : null;

    if (!employee) {
      setAiPublishMessage("找不到這位員工的 AI 辨識結果。");
      return;
    }

    const person = adminPeople.find(
      (item) => String(item?.employeeId || "").trim().toUpperCase() === employeeId
    );

    const currentLoginEmployeeId = String(
      firebaseUser?.email?.split("@")[0] || ""
    ).trim().toUpperCase();

    const targetUid =
      person?.uid ||
      (
        firebaseUser?.uid &&
        currentLoginEmployeeId === employeeId
          ? firebaseUser.uid
          : ""
      );

    if (!targetUid) {
      setAiPublishMessage(
        `工號 ${employeeId} 目前沒有 Firebase UID，無法發布。請先讓該員工登入一次行事曆。`
      );
      return;
    }

    const days = Array.isArray(employee.days)
      ? employee.days.filter((day) => day?.date)
      : [];

    if (!days.length) {
      setAiPublishMessage(`${employeeId} 沒有可發布的日期。`);
      return;
    }

    setAiPublishBusy(true);
    setAiPublishMessage("");

    try {
      const { db } = getFirebaseServices();
      const userRef = db.collection("users").doc(targetUid);
      const userSnapshot = await userRef.get();
      const existingData = userSnapshot.exists ? userSnapshot.data() || {} : {};
      const nextEvents = {
        ...(existingData.customEvents && typeof existingData.customEvents === "object"
          ? existingData.customEvents
          : {}),
      };
      const nextDeletedDates = new Set(
        Array.isArray(existingData.deletedCustomEventDates)
          ? existingData.deletedCustomEventDates.map((value) => String(value))
          : []
      );

      days.forEach((day) => {
        const type = String(day.type || "").trim();
        const marker = String(day.marker || "").trim();
        const dateKey = String(day.date);
        const value = type === "特殊" ? (marker || "特殊") : (type || "休");
        nextEvents[dateKey] = value;
        nextDeletedDates.delete(dateKey);
      });

      const importedLeave = days.some((day) => String(day.type || "").trim() === "休");
      const publishTime = new Date();

      await userRef.set(
        {
          customEvents: nextEvents,
          deletedCustomEventDates: [...nextDeletedDates],
          ...(importedLeave
            ? {
                aiLeaveImportedAt: publishTime,
                aiLeaveImportedMonth: `${aiShiftResults?.year || year}-${pad(Number(aiShiftResults?.month || month + 1))}`,
              }
            : {}),
          updatedAt: publishTime,
        },
        { merge: true }
      );

      if (importedLeave && targetUid === firebaseUser?.uid) {
        setAiLeaveImportedAt(publishTime);
        setAiLeaveImportedMonth(`${aiShiftResults?.year || year}-${pad(Number(aiShiftResults?.month || month + 1))}`);
      }

      if (aiShiftGroupId) {
        const currentGroup = aiShiftGroups.find((group) => group.id === aiShiftGroupId);
        const publishedIds = new Set(
          Array.isArray(currentGroup?.publishedEmployeeIds)
            ? currentGroup.publishedEmployeeIds
            : Array.isArray(aiShiftResults?.publishedEmployeeIds)
              ? aiShiftResults.publishedEmployeeIds
              : []
        );
        publishedIds.add(employeeId);
        await saveAiShiftGroup(aiShiftGroupId, { publishedEmployeeIds: [...publishedIds] });
        setAiShiftGroups((current) => current.map((group) =>
          group.id === aiShiftGroupId ? { ...group, publishedEmployeeIds: [...publishedIds] } : group
        ));
        setAiShiftResults((current) => current ? { ...current, publishedEmployeeIds: [...publishedIds] } : current);
      }

      setAiPublishMessage(
        `發布成功：${employeeId} ${employee.name || ""}，已寫入 ${days.length} 筆行事曆資料。`
      );
    } catch (error) {
      console.error("AI 排班指定員工發布失敗：", error);
      setAiPublishMessage(error?.message || "發布失敗，請稍後再試。");
    } finally {
      setAiPublishBusy(false);
    }
  }

  async function publishAiShiftAll() {
    const employees = Array.isArray(aiShiftResults?.employees)
      ? aiShiftResults.employees.filter((item) => item?.employeeId)
      : [];

    if (!employees.length) {
      setAiPublishMessage("目前沒有可發布的 AI 辨識結果。");
      return;
    }

    setAiPublishBusy(true);
    setAiPublishMessage("");

    try {
      const { db } = getFirebaseServices();
      const publishResults = [];
      const failedResults = [];
      const publishedIds = new Set(
        Array.isArray(aiShiftResults?.publishedEmployeeIds) ? aiShiftResults.publishedEmployeeIds : []
      );

      for (const employee of employees) {
        const employeeId = String(employee.employeeId || "").trim().toUpperCase();
        const person = adminPeople.find(
          (item) =>
            String(item?.employeeId || "").trim().toUpperCase() === employeeId
        );

        const currentLoginEmployeeId = String(
          firebaseUser?.email?.split("@")[0] || ""
        ).trim().toUpperCase();

        const targetUid =
          person?.uid ||
          (
            firebaseUser?.uid &&
            currentLoginEmployeeId === employeeId
              ? firebaseUser.uid
              : ""
          );

        const days = Array.isArray(employee.days)
          ? employee.days.filter((day) => day?.date)
          : [];

        if (!targetUid) {
          failedResults.push(`${employeeId}：沒有 Firebase UID`);
          continue;
        }

        if (!days.length) {
          failedResults.push(`${employeeId}：沒有可發布的日期`);
          continue;
        }

        try {
          const userRef = db.collection("users").doc(targetUid);
          const userSnapshot = await userRef.get();
          const existingData = userSnapshot.exists ? userSnapshot.data() || {} : {};
          const nextEvents = {
            ...(existingData.customEvents && typeof existingData.customEvents === "object"
              ? existingData.customEvents
              : {}),
          };
          const nextDeletedDates = new Set(
            Array.isArray(existingData.deletedCustomEventDates)
              ? existingData.deletedCustomEventDates.map((value) => String(value))
              : []
          );

          days.forEach((day) => {
            const type = String(day.type || "").trim();
            const marker = String(day.marker || "").trim();
            const dateKey = String(day.date);
            const value = type === "特殊" ? (marker || "特殊") : (type || "休");
            nextEvents[dateKey] = value;
            nextDeletedDates.delete(dateKey);
          });

          const importedLeave = days.some((day) => String(day.type || "").trim() === "休");
          const publishTime = new Date();
          const importedMonth = `${aiShiftResults?.year || year}-${pad(Number(aiShiftResults?.month || month + 1))}`;

          await userRef.set(
            {
              customEvents: nextEvents,
              deletedCustomEventDates: [...nextDeletedDates],
              ...(importedLeave
                ? {
                    aiLeaveImportedAt: publishTime,
                    aiLeaveImportedMonth: importedMonth,
                  }
                : {}),
              updatedAt: publishTime,
            },
            { merge: true }
          );

          if (importedLeave && targetUid === firebaseUser?.uid) {
            setAiLeaveImportedAt(publishTime);
            setAiLeaveImportedMonth(importedMonth);
          }

          publishResults.push(`${employeeId} ${employee.name || ""}：${days.length} 筆`);
          publishedIds.add(employeeId);
        } catch (error) {
          console.error(`AI 排班發布失敗：${employeeId}`, error);
          failedResults.push(`${employeeId}：${error?.message || "寫入失敗"}`);
        }
      }

      if (aiShiftGroupId && publishedIds.size) {
        await saveAiShiftGroup(aiShiftGroupId, { publishedEmployeeIds: [...publishedIds] });
        setAiShiftGroups((current) => current.map((group) =>
          group.id === aiShiftGroupId ? { ...group, publishedEmployeeIds: [...publishedIds] } : group
        ));
        setAiShiftResults((current) => current ? { ...current, publishedEmployeeIds: [...publishedIds] } : current);
      }

      if (failedResults.length) {
        setAiPublishMessage(
          `已發布 ${publishResults.length} 位；失敗 ${failedResults.length} 位：${failedResults.join("、")}`
        );
      } else {
        setAiPublishMessage(
          `全部發布成功：${publishResults.length} 位員工，共完成 AI 排班寫入。`
        );
      }
    } catch (error) {
      console.error("AI 排班全部發布失敗：", error);
      setAiPublishMessage(error?.message || "全部發布失敗，請稍後再試。");
    } finally {
      setAiPublishBusy(false);
    }
  }

  const currentEmployeeId = String(
    shiftUser?.employeeId || firebaseUser?.email?.split("@")[0] || ""
  ).trim().toUpperCase();

  // D7445 顯示管理按鈕；不另外建立管理者角色系統。
  const isAdmin =
    currentEmployeeId === "D7445" ||
    shiftUser?.role === "admin" ||
    firebaseUser?.email?.toLowerCase() === employeeIdToEmail("Admin").toLowerCase();

  const currentHolidayMap = useMemo(
    () => buildHolidayMap(year, holidayOverrides),
    [year, holidayOverrides]
  );

  async function loadAdminPeople() {
    if (!isAdmin) return;
    const { db } = getFirebaseServices();
    const snapshot = await db.collection("shiftUsers").orderBy("employeeId").get();

    // 舊資料可能曾經留下重複的人員文件；畫面上同一工號只顯示一次。
    const uniquePeople = new Map();
    snapshot.docs.forEach((doc) => {
      const data = doc.data() || {};
      const employeeId = String(data.employeeId || doc.id || "").trim().toUpperCase();
      if (!employeeId || data.active === false) return;

      // 優先使用「文件 ID = 工號」的正規文件。
      if (!uniquePeople.has(employeeId) || doc.id === employeeId) {
        uniquePeople.set(employeeId, { id: doc.id, ...data, employeeId });
      }
    });

    setAdminPeople(Array.from(uniquePeople.values()));
  }

  async function loadAiShiftGroups() {
    if (!firebaseUser?.uid || !isAdmin) return;
    try {
      const { db } = getFirebaseServices();
      const snapshot = await db.collection("aiShiftGroups")
        .where("ownerUid", "==", firebaseUser.uid)
        .get();

      let groups = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // 相容舊版：如果新的獨立群組還沒有資料，就讀取舊 users/{uid}.aiShiftGroups。
      if (!groups.length) {
        const userSnapshot = await db.collection("users").doc(firebaseUser.uid).get();
        const userData = userSnapshot.exists ? userSnapshot.data() || {} : {};
        const oldGroups = Array.isArray(userData.aiShiftGroups) ? userData.aiShiftGroups : [];
        groups = oldGroups.filter((group) => group?.id).map((group) => ({
          ...group,
          ownerUid: firebaseUser.uid,
        }));

        // 自動搬到新的獨立群組集合，避免之後再被 users 文件大小限制影響。
        for (const group of groups) {
          await db.collection("aiShiftGroups").doc(String(group.id)).set({
            ...group,
            ownerUid: firebaseUser.uid,
            migratedFromLegacy: true,
            updatedAt: new Date(),
          }, { merge: true });
        }
      }

      groups.sort((a, b) => {
        const ta = a?.createdAt?.toMillis?.() || new Date(a?.createdAt || 0).getTime() || 0;
        const tb = b?.createdAt?.toMillis?.() || new Date(b?.createdAt || 0).getTime() || 0;
        return tb - ta;
      });

      setAiShiftGroups(groups);
      setAiShiftError("");
    } catch (error) {
      console.error("讀取 AI 辨識群組失敗：", error);
      setAiShiftGroups([]);
      setAiShiftError(error?.message || "讀取 AI 辨識群組失敗。");
    }
  }

  function makeAiGroupId() {
    return `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function selectAiShiftGroup(group) {
    if (!group) return;
    const employees = Array.isArray(group.employees) ? group.employees : [];
    setAiShiftGroupId(group.id);
    setAiShiftGroupName(group.name || "");
    setAiShiftResults({
      year: String(group.year || year),
      month: String(group.month || month + 1),
      employees,
      warnings: Array.isArray(group.warnings) ? group.warnings : [],
      recognitionMode: group.recognitionMode || "已保存的 AI 辨識結果",
      groupId: group.id,
      groupName: group.name || "",
      publishedEmployeeIds: Array.isArray(group.publishedEmployeeIds) ? group.publishedEmployeeIds : [],
    });
    setAiPublishEmployeeId(employees[0]?.employeeId || "");
    setAiPublishMessage("");
    setAiShiftError("");
  }

  function toggleAiSelectedEmployee(employeeId) {
    const id = String(employeeId || "").trim().toUpperCase();
    setAiSelectedEmployeeIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  function toggleAllAiEmployees() {
    const allIds = adminPeople.map((person) => String(person?.employeeId || "").trim().toUpperCase()).filter(Boolean);
    setAiSelectedEmployeeIds((current) => current.length === allIds.length ? [] : allIds);
  }

  async function saveAiShiftGroup(groupId, groupData) {
    if (!firebaseUser?.uid) throw new Error("尚未登入，無法保存 AI 辨識群組。");
    const { db } = getFirebaseServices();
    await db.collection("aiShiftGroups").doc(String(groupId)).set({
      ...groupData,
      ownerUid: firebaseUser.uid,
      updatedAt: new Date(),
    }, { merge: true });
  }

  async function createAiShiftGroupFromResults(results) {
    const groupName = aiShiftGroupName.trim();
    if (!groupName) throw new Error("請先輸入 AI 辨識群組名稱，例如「2026年8月排班」。");
    if (aiShiftGroups.some((group) => String(group?.name || "").trim() === groupName)) {
      throw new Error(`群組「${groupName}」已存在，請換一個名稱。`);
    }

    const groupId = makeAiGroupId();
    const groupData = {
      name: groupName,
      year: String(results.year || year),
      month: String(results.month || month + 1),
      employees: Array.isArray(results.employees) ? results.employees : [],
      warnings: Array.isArray(results.warnings) ? results.warnings : [],
      recognitionMode: results.recognitionMode || "指定員工兩階段辨識",
      sourceFileName: aiShiftFile?.name || "",
      createdAt: new Date(),
      publishedEmployeeIds: [],
      ownerUid: firebaseUser?.uid || "",
    };
    await saveAiShiftGroup(groupId, groupData);
    const saved = { id: groupId, ...groupData };
    setAiShiftGroups((current) => [saved, ...current]);
    setAiShiftGroupId(groupId);
    setAiShiftResults({ ...results, groupId, groupName, publishedEmployeeIds: [] });
  }

  async function deleteAiShiftGroup(group) {
    if (!group?.id || !firebaseUser?.uid) return;
    if (!window.confirm(`確定要刪除「${String(group.name || "這個群組")}」嗎？\n群組內的 AI 辨識結果也會一起刪除。`)) return;

    setAiGroupBusy(true);
    try {
      const { db } = getFirebaseServices();
      const groupRef = db.collection("aiShiftGroups").doc(String(group.id));
      const groupSnapshot = await groupRef.get();
      if (groupSnapshot.exists) {
        const groupData = groupSnapshot.data() || {};
        if (groupData.ownerUid !== firebaseUser.uid) {
          throw new Error("沒有權限刪除此 AI 群組。");
        }
        await groupRef.delete();
      }
      setAiShiftGroups((current) => current.filter((item) => item.id !== group.id));
      if (aiShiftGroupId === group.id) {
        setAiShiftGroupId("");
        setAiShiftResults(null);
        setAiPublishEmployeeId("");
        setAiPublishMessage("");
      }
    } catch (error) {
      setAiShiftError(error?.message || "刪除群組失敗。");
    } finally {
      setAiGroupBusy(false);
    }
  }

  async function savePerson() {
    if (!personForm.employeeId.trim() || !personForm.name.trim() || !personForm.shift) {
      setAdminMessage("請填寫工號、姓名與班別");
      return;
    }
    setAdminBusy(true);
    setAdminMessage("");

    let secondaryApp = null;

    try {
      const { db } = getFirebaseServices();
      const employeeId = personForm.employeeId.trim().toUpperCase();
      const email = employeeIdToEmail(employeeId);
      const docRef = db.collection("shiftUsers").doc(employeeId);

      // 新增時先檢查正規文件。
      // 如果人員之前被「移除」，文件會保留但 active=false，
      // 這時視為重新啟用，不需要重新建立 Firebase Authentication 帳號。
      if (!editingPersonId) {
        const existingDoc = await docRef.get();
        if (existingDoc.exists) {
          const existingData = existingDoc.data() || {};

          if (existingData.active === false) {
            await docRef.set({
              employeeId,
              name: personForm.name.trim(),
              shift: personForm.shift,
              role: existingData.role || "employee",
              email: existingData.email || email,
              active: true,
              updatedAt: new Date(),
            }, { merge: true });

            setAdminMessage(`工號 ${employeeId} 已重新啟用`);
            setPersonForm({ employeeId: "", name: "", shift: "A1", password: "" });
            setEditingPersonId("");
            await loadAdminPeople();
            return;
          }

          setAdminMessage(`工號 ${employeeId} 已存在，請直接按「編輯」。`);
          return;
        }

        if (!personForm.password) {
          setAdminMessage("新增人員請設定初始密碼");
          return;
        }
      }

      const payload = {
        employeeId,
        name: personForm.name.trim(),
        shift: personForm.shift,
        role: "employee",
        email,
        active: true,
      };

      if (editingPersonId) {
        await docRef.set(payload, { merge: true });
        setAdminMessage("人員資料已更新");
      } else {
        /*
         * 用第二個 Firebase App 建立帳號，不會把目前的管理者登出。
         *
         * 如果這個 Email 以前已經建立過 Firebase 帳號，
         * 就用「這次輸入的初始密碼」登入那個既有帳號並取得 UID，
         * 讓之前建立到一半的人員可以繼續完成建立，而不是直接卡在
         * auth/email-already-in-use。
         */
        const secondaryName = `shiftmate-secondary-${Date.now()}`;
        secondaryApp = window.firebase.initializeApp(firebaseConfig, secondaryName);
        const secondaryAuth = secondaryApp.auth();

        let result;

        try {
          result = await secondaryAuth.createUserWithEmailAndPassword(
            email,
            personForm.password
          );
        } catch (createError) {
          if (createError?.code !== "auth/email-already-in-use") {
            throw createError;
          }

          try {
            result = await secondaryAuth.signInWithEmailAndPassword(
              email,
              personForm.password
            );
          } catch (signInError) {
            throw new Error(
              `工號 ${employeeId} 的 Firebase 帳號已存在，但密碼不正確。請到 Firebase Authentication 刪除舊帳號後，再重新新增。`
            );
          }
        }

        payload.uid = result.user.uid;
        await docRef.set(payload);
        await secondaryAuth.signOut();
        setAdminMessage("人員已建立");
      }

      setPersonForm({ employeeId: "", name: "", shift: "A1", password: "" });
      setEditingPersonId("");
      await loadAdminPeople();
    } catch (error) {
      console.error("管理人員失敗：", error);
      setAdminMessage(error?.message || "操作失敗");
    } finally {
      if (secondaryApp) {
        try {
          await secondaryApp.delete();
        } catch (cleanupError) {
          console.warn("清理第二個 Firebase App 失敗：", cleanupError);
        }
      }
      setAdminBusy(false);
    }
  }

  function editPerson(person) {
    setEditingPersonId(person.employeeId);
    setPersonForm({
      employeeId: person.employeeId,
      name: person.name || "",
      shift: person.shift || "A1",
      password: "",
    });
    setAdminMessage("");
  }

  async function removePerson(person) {
    const employeeId = String(person?.employeeId || "").trim().toUpperCase();
    if (!employeeId) return;

    // 不允許從人員管理刪除目前的管理者帳號。
    if (employeeId === "ADMIN") {
      setAdminMessage("管理者帳號不能從這裡移除");
      return;
    }

    const confirmed = window.confirm(
      `確定要停用「${employeeId} ${person?.name || ""}」嗎？\n\n停用後，這個工號將無法登入行事曆。\n之後管理者可以用相同工號重新新增／啟用，不需要重新建立 Firebase 帳號。`
    );
    if (!confirmed) return;

    setAdminBusy(true);
    setAdminMessage("");

    try {
      const { db } = getFirebaseServices();

      // 不刪除 Firebase Authentication，也不刪除 shiftUsers 文件。
      // 只停用人員，之後可以用同一工號重新啟用。
      await db.collection("shiftUsers").doc(employeeId).set({
        active: false,
        updatedAt: new Date(),
      }, { merge: true });

      if (editingPersonId === employeeId) {
        setEditingPersonId("");
        setPersonForm({ employeeId: "", name: "", shift: "A1", password: "" });
      }

      setAdminMessage(`已停用人員 ${employeeId}`);
      await loadAdminPeople();
    } catch (error) {
      console.error("停用人員失敗：", error);
      setAdminMessage(error?.message || "停用失敗");
    } finally {
      setAdminBusy(false);
    }
  }

  async function saveGlobalEvent() {
    if (!globalEventForm.date || !globalEventForm.text.trim()) return;
    try {
      const { db } = getFirebaseServices();
      await db.collection("globalEvents").doc(globalEventForm.date).set({
        date: globalEventForm.date,
        text: globalEventForm.text.trim(),
        updatedAt: new Date(),
      });
      setGlobalEvents((old) => ({ ...old, [globalEventForm.date]: { id: globalEventForm.date, text: globalEventForm.text.trim() } }));
      setGlobalEventForm({ date: "", text: "" });
      setAdminMessage("全員行程已儲存");
    } catch (error) {
      setAdminMessage(error?.message || "全員行程儲存失敗");
    }
  }

  async function deleteGlobalEvent(date) {
    try {
      const { db } = getFirebaseServices();
      await db.collection("globalEvents").doc(date).delete();
      setGlobalEvents((old) => {
        const next = { ...old };
        delete next[date];
        return next;
      });
    } catch (error) {
      setAdminMessage(error?.message || "刪除失敗");
    }
  }

  async function saveHolidayOverride() {
    if (!holidayForm.id || !holidayForm.date || !holidayForm.name.trim()) return;
    try {
      const { db } = getFirebaseServices();
      const id = holidayForm.id;
      await db.collection("holidayOverrides").doc(id).set({
        year,
        date: holidayForm.date,
        name: holidayForm.name.trim(),
        enabled: true,
        updatedAt: new Date(),
      }, { merge: true });
      setHolidayOverrides((old) => ({ ...old, [id]: { year, date: holidayForm.date, name: holidayForm.name.trim(), enabled: true } }));
      setAdminMessage("國定假日已修改");
    } catch (error) {
      setAdminMessage(error?.message || "國定假日儲存失敗");
    }
  }

  async function disableHoliday(id) {
    try {
      const { db } = getFirebaseServices();
      await db.collection("holidayOverrides").doc(id).set({ year, enabled: false, updatedAt: new Date() }, { merge: true });
      setHolidayOverrides((old) => ({ ...old, [id]: { ...(old[id] || {}), year, enabled: false } }));
    } catch (error) {
      setAdminMessage(error?.message || "停用失敗");
    }
  }

  async function openAdmin() {
    setShowAdminPanel(true);
    setAdminMessage("");
    if (isAdmin) {
      await loadAdminPeople();
      await loadAiShiftGroups();
    }
  }

  function renderCell(cell) {
    const key = dateKey(
      cell.date.getFullYear(),
      cell.date.getMonth(),
      cell.day
    );

    const isToday =
      cell.date.getFullYear() === today.getFullYear() &&
      cell.date.getMonth() === today.getMonth() &&
      cell.date.getDate() === today.getDate();

    if (!cell.currentMonth) {
      return (
        <div className="calendar-cell outside-month" key={key}>
          <span className="date-number">{cell.day}</span>
        </div>
      );
    }

    const status = statusMap[key] || "work";
    const statusInfo = SHIFT_TYPES[status];
    const customText = customEvents[key];
    // 「休」只在使用者實際儲存本月放假後顯示。
    // 例假日的 × 不再自動變成「休」。
    const hasLeave = isLeaveText(customText);
    const officialHoliday = currentHolidayMap[key];
    const isOfficialHoliday = Boolean(officialHoliday);

    return (
      <button
        type="button"
        className={`calendar-cell ${statusInfo.className} ${
          isToday ? "today" : ""
        } ${hasLeave ? "has-leave" : ""}`}
        key={key}
        onClick={() => openCustomInput(cell)}
        title={isOfficialHoliday ? officialHoliday.name : undefined}
      >
        <span className="date-number">{cell.day}</span>
        <span className={`status-symbol ${statusInfo.className}`}>
          {statusInfo.symbol}
        </span>

        {hasLeave ? (
          <span className="leave-text">休</span>
        ) : (
          customText && (
            customText.includes("/") ? (
              <span className="custom-text custom-text-multi">
                {customText.split("/").map((text, index) => (
                  <span key={`${text}-${index}`}>{text}</span>
                ))}
              </span>
            ) : (
              <span className="custom-text">{customText}</span>
            )
          )
        )}

        {(isOfficialHoliday || globalEvents[key]?.text) && (
          <span className="holiday-label">
            {[officialHoliday?.name, globalEvents[key]?.text].filter(Boolean).join("／")}
          </span>
        )}

      </button>
    );
  }


  if (!authReady || !firebaseUser) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="brand-icon" aria-hidden="true">▦</div>
          <h1>輪班行事曆</h1>
          <p>請輸入工號與密碼登入</p>
          <form className="employee-login-form" onSubmit={(event) => { event.preventDefault(); if (!loginBusy) loginWithEmployee(); }}>
            <label>
              工號
              <input
                type="text"
                value={loginEmployeeId}
                onChange={(event) => setLoginEmployeeId(event.target.value.toUpperCase())}
                placeholder="例如 D7445"
                autoCapitalize="characters"
                autoComplete="username"
                autoFocus
              />
            </label>
            <label>
              密碼
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="請輸入密碼"
                autoComplete="current-password"
              />
            </label>
            <button className="login-submit-button" type="submit" disabled={loginBusy}>
              {loginBusy ? "登入中…" : "登入"}
            </button>
          </form>
          {loginError && <div className="login-error">{loginError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top-header">
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">▦</div>
          <h1>輪班行事曆</h1>
        </div>

        <div className="header-actions">
          {isAdmin && (
            <button className="admin-button" type="button" onClick={openAdmin}>管理</button>
          )}
          {firebaseUser ? (
            <button className="login-button" type="button" onClick={logoutFirebase}>
              登出
            </button>
          ) : (
            <button className="login-button" type="button" onClick={openLoginMenu}>
              登入
            </button>
          )}
        </div>
      </header>

      <main className="main-container">
        <section className="user-card">
          <div className="user-info shift-info">
            <span className="info-icon people-icon" aria-hidden="true">👥</span>
            <div className="info-copy">
              <span className="info-title">班別</span>
              {isAdmin ? (
                <button className="shift-value" type="button" onClick={openShiftMenu}>
                  {shiftUser?.shift || shift}
                </button>
              ) : (
                <strong>{shiftUser?.shift || shift}</strong>
              )}
            </div>
          </div>

          <div className="user-info">
            <span className="info-icon badge-icon" aria-hidden="true">♙</span>
            <div className="info-copy">
              <span className="info-title">工號</span>
              <strong>{shiftUser?.employeeId || firebaseUser?.email?.split("@")[0]?.toUpperCase() || "尚未登入"}</strong>
            </div>
          </div>

          <div className="user-info">
            <span className="info-icon person-icon" aria-hidden="true">♙</span>
            <div className="info-copy">
              <span className="info-title">姓名</span>
              <strong>{shiftUser?.name || "尚未登入"}</strong>
            </div>
          </div>
        </section>

        <section className="calendar-card">
          <div className="calendar-top-actions">
            <button
              className="leave-month-button"
              onClick={openLeavePicker}
              type="button"
            >
              本月放假
            </button>

            <button
              className="today-button"
              type="button"
              onClick={goToday}
            >
              今天
            </button>
          </div>

          <div className="date-selectors">
            <label className="date-select year-select-wrap">
              <span className="date-select-icon" aria-hidden="true">▦</span>
              <select
                className="year-select"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                aria-label="選擇年份"
              >
                {Array.from({ length: 31 }, (_, index) => 2010 + index).map((value) => (
                  <option key={value} value={value}>{value} 年</option>
                ))}
              </select>
            </label>

            <label className="date-select month-select-wrap">
              <span className="date-select-icon" aria-hidden="true">▦</span>
              <select
                className="month-select"
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
                aria-label="選擇月份"
              >
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index} value={index}>{index + 1} 月</option>
                ))}
              </select>
            </label>
          </div>

          <div className="month-navigation">
            <button className="month-arrow" onClick={goPreviousMonth} type="button" aria-label="上一個月">‹</button>

            <div className="month-title">
              <div className="mobile-month-selectors" aria-label="選擇年月">
                <label className="date-select year-select-wrap">
                  <span className="date-select-icon" aria-hidden="true">▦</span>
                  <select
                    className="year-select"
                    value={year}
                    onChange={(event) => setYear(Number(event.target.value))}
                    aria-label="選擇年份"
                  >
                    {Array.from({ length: 31 }, (_, index) => 2010 + index).map((value) => (
                      <option key={value} value={value}>{value} 年</option>
                    ))}
                  </select>
                </label>

                <label className="date-select month-select-wrap">
                  <span className="date-select-icon" aria-hidden="true">▦</span>
                  <select
                    className="month-select"
                    value={month}
                    onChange={(event) => setMonth(Number(event.target.value))}
                    aria-label="選擇月份"
                  >
                    {Array.from({ length: 12 }, (_, index) => (
                      <option key={index} value={index}>{index + 1} 月</option>
                    ))}
                  </select>
                </label>
              </div>

              <span className="month-english">
                {new Intl.DateTimeFormat("en-US", { month: "long" }).format(
                  new Date(year, month, 1)
                )} {year}
              </span>
            </div>

            <button className="month-arrow" onClick={goNextMonth} type="button" aria-label="下一個月">›</button>
          </div>

          <div className="weekdays">
            {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          <div className="calendar-grid">
            {cells.map(renderCell)}
          </div>

          <div className="calendar-statistics" aria-label="本月統計">
            <div className="calendar-stat-item work">
              <span>○</span><strong className="desktop-stat-label">正班 </strong><b>{monthStatistics.work}天</b>
            </div>
            <div className="calendar-stat-item off">
              <span>■</span><strong className="desktop-stat-label">休假日 </strong><b>{monthStatistics.off}天</b>
            </div>
            <div className="calendar-stat-item rest">
              <span>▲</span><strong className="desktop-stat-label">休息日 </strong><b>{monthStatistics.rest}天</b>
            </div>
            <div className="calendar-stat-item holiday">
              <span>×</span><strong className="desktop-stat-label">例假日 </strong><b>{monthStatistics.holiday}天</b>
            </div>
            <div className="calendar-stat-hours">{monthStatistics.hours}小時</div>
          </div>

          {aiLeaveNotice && (
            <div className="ai-leave-notice">{aiLeaveNotice}</div>
          )}

        </section>
      </main>


      {showAdminPanel && isAdmin && (
        <div className="modal-backdrop admin-backdrop" onClick={() => setShowAdminPanel(false)}>
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="login-modal-header">
              <div>
                <h2>管理者</h2>
                <p>人員、全員行程、國定假日</p>
              </div>
              <button className="shift-menu-close" type="button" onClick={() => setShowAdminPanel(false)}>×</button>
            </div>

            <div className="admin-tabs">
              {[
                ["people", "人員管理"],
                ["global", "全員行程"],
                ["holiday", "國定假日"],
                ["aiShift", "AI排班"],
              ].map(([key, label]) => (
                <button key={key} type="button" className={adminTab === key ? "active" : ""} onClick={() => setAdminTab(key)}>
                  {label}
                </button>
              ))}
            </div>

            {adminMessage && <div className="admin-message">{adminMessage}</div>}

            {adminTab === "people" && (
              <div className="admin-section">
                <h3>{editingPersonId ? "修改人員" : "新增人員"}</h3>
                <div className="admin-form-grid">
                  <input value={personForm.employeeId} disabled={Boolean(editingPersonId)} placeholder="工號" onChange={(e) => setPersonForm({ ...personForm, employeeId: e.target.value.toUpperCase() })} />
                  <input value={personForm.name} placeholder="姓名" onChange={(e) => setPersonForm({ ...personForm, name: e.target.value })} />
                  <select value={personForm.shift} onChange={(e) => setPersonForm({ ...personForm, shift: e.target.value })}>
                    {["A1","A2","A3","B1","B2","B3"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                  {!editingPersonId && <input type="password" value={personForm.password} placeholder="初始密碼" onChange={(e) => setPersonForm({ ...personForm, password: e.target.value })} />}
                </div>
                <div className="modal-buttons">
                  {editingPersonId && <button className="cancel-button" type="button" onClick={() => { setEditingPersonId(""); setPersonForm({ employeeId: "", name: "", shift: "A1", password: "" }); }}>取消編輯</button>}
                  <button className="save-button" type="button" disabled={adminBusy} onClick={savePerson}>{adminBusy ? "處理中…" : editingPersonId ? "儲存修改" : "新增人員"}</button>
                </div>

                <h3 className="admin-list-title">全部人員</h3>
                <div className="admin-list">
                  {adminPeople.map((person) => (
                    <div className="admin-list-row" key={person.employeeId}>
                      <div><strong>{person.employeeId}</strong><span>{person.name || ""}</span><em>{person.shift || ""}</em></div>
                      <div className="admin-row-actions">
                        <button type="button" onClick={() => editPerson(person)}>編輯</button>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={adminBusy}
                          onClick={() => removePerson(person)}
                        >
                          停用
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {adminTab === "global" && (
              <div className="admin-section">
                <h3>新增／修改全員行程</h3>
                <div className="admin-form-grid">
                  <input type="date" value={globalEventForm.date} onChange={(e) => setGlobalEventForm({ ...globalEventForm, date: e.target.value })} />
                  <input value={globalEventForm.text} placeholder="例如：歲休、聚餐" onChange={(e) => setGlobalEventForm({ ...globalEventForm, text: e.target.value })} />
                  <button className="save-button" type="button" onClick={saveGlobalEvent}>儲存</button>
                </div>
                <div className="admin-list">
                  {Object.entries(globalEvents).sort(([a],[b]) => a.localeCompare(b)).map(([date, event]) => (
                    <div className="admin-list-row" key={date}>
                      <div><strong>{date}</strong><span>{event.text}</span></div>
                      <div className="admin-row-actions">
                        <button type="button" onClick={() => setGlobalEventForm({ date, text: event.text })}>編輯</button>
                        <button type="button" className="delete-button" onClick={() => deleteGlobalEvent(date)}>刪除</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}


            {adminTab === "aiShift" && (
              <div className="admin-section ai-shift-section">
                <h3>AI 排班圖片辨識</h3>
                <p className="ai-shift-help">
                  先建立辨識群組，再勾選要辨識的員工。辨識結果會保存到群組，之後可以直接發布，不需要重新辨識。
                </p>

                <div className="ai-shift-group-panel">
                  <div className="ai-shift-group-header">
                    <strong>AI 辨識群組</strong>
                    <span>{aiShiftGroups.length} 個</span>
                  </div>
                  <div className="ai-shift-group-create">
                    <input
                      value={aiShiftGroupName}
                      placeholder={`例如：${year}年${month + 1}月排班`}
                      onChange={(event) => setAiShiftGroupName(event.target.value)}
                      disabled={aiGroupBusy || aiShiftBusy}
                    />
                    <span className="ai-shift-group-month">{year} 年 {month + 1} 月</span>
                  </div>

                  {aiShiftGroups.length > 0 && (
                    <div className="ai-shift-group-list">
                      {aiShiftGroups.map((group) => (
                        <div className={`ai-shift-group-row ${aiShiftGroupId === group.id ? "active" : ""}`} key={group.id}>
                          <button
                            type="button"
                            className="ai-shift-group-select"
                            onClick={() => selectAiShiftGroup(group)}
                            disabled={aiGroupBusy || aiShiftBusy}
                          >
                            <strong>{group.name || "未命名群組"}</strong>
                            <span>
                              {group.year && group.month ? `${group.year}/${group.month}` : ""}
                              {" · "}
                              {Array.isArray(group.employees) ? group.employees.length : 0} 位
                            </span>
                          </button>
                          <button
                            type="button"
                            className="ai-shift-group-delete"
                            onClick={() => deleteAiShiftGroup(group)}
                            disabled={aiGroupBusy || aiShiftBusy}
                          >
                            刪除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="ai-shift-employee-picker">
                  <div className="ai-shift-picker-header">
                    <strong>選擇要辨識的員工</strong>
                    <button type="button" onClick={toggleAllAiEmployees} disabled={aiShiftBusy || !adminPeople.length}>
                      {aiSelectedEmployeeIds.length === adminPeople.length ? "取消全選" : "全選"}
                    </button>
                  </div>
                  <div className="ai-shift-employee-grid">
                    {adminPeople.map((person) => {
                      const id = String(person?.employeeId || "").trim().toUpperCase();
                      const checked = aiSelectedEmployeeIds.includes(id);
                      return (
                        <label className={`ai-shift-employee-check ${checked ? "checked" : ""}`} key={id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAiSelectedEmployee(id)}
                            disabled={aiShiftBusy}
                          />
                          <span>{id}</span>
                          <small>{person?.name || ""}</small>
                        </label>
                      );
                    })}
                  </div>
                  {!adminPeople.length && <div className="ai-shift-empty">尚未讀取使用者名單。</div>}
                </div>

                <div className="ai-shift-upload-box">
                  <input
                    id="ai-shift-image-input"
                    className="ai-shift-file-input"
                    type="file"
                    accept="image/*"
                    onChange={handleAiShiftFile}
                  />
                  <label className="ai-shift-upload-button" htmlFor="ai-shift-image-input">
                    {aiShiftFile ? "重新選擇排班圖片" : "選擇排班圖片"}
                  </label>
                  {aiShiftFile && (
                    <span className="ai-shift-file-name">{aiShiftFile.name}</span>
                  )}
                </div>

                {aiShiftPreview && (
                  <div className="ai-shift-preview">
                    <img src={aiShiftPreview} alt="排班表預覽" />
                  </div>
                )}

                {aiShiftError && <div className="ai-shift-error">{aiShiftError}</div>}

                <div className="modal-buttons ai-shift-actions">
                  <button
                    className="cancel-button"
                    type="button"
                    onClick={resetAiShiftImport}
                    disabled={aiShiftBusy}
                  >
                    清除
                  </button>
                  <button
                    className="save-button"
                    type="button"
                    onClick={runAiShiftRecognition}
                    disabled={aiShiftBusy || !aiShiftPreview || !aiSelectedEmployeeIds.length || !aiShiftGroupName.trim()}
                  >
                    {aiShiftBusy ? "Gemini 辨識中…" : "開始 AI 辨識並保存"}
                  </button>
                </div>

                {aiShiftResults && (
                  <div className="ai-shift-results">
                    <div className="ai-shift-result-header">
                      <div>
                        <h3>辨識結果</h3>
                        <p>
                          {aiShiftResults.year && aiShiftResults.month
                            ? `${aiShiftResults.year} 年 ${aiShiftResults.month} 月`
                            : "月份由圖片辨識"}
                        </p>
                      </div>
                      <span>
                        {aiShiftResults.groupName ? `${aiShiftResults.groupName} · ` : ""}
                        {Array.isArray(aiShiftResults.employees)
                          ? `${aiShiftResults.employees.length} 位`
                          : "—"}
                      </span>
                    </div>

                    <div className="ai-shift-publish-test">
                      <div className="ai-shift-publish-title">發布</div>
                      <div className="ai-shift-publish-row">
                        <select
                          value={aiPublishEmployeeId}
                          onChange={(event) => {
                            setAiPublishEmployeeId(event.target.value);
                            setAiPublishMessage("");
                          }}
                          disabled={aiPublishBusy}
                        >
                          <option value="">選擇要發布的員工</option>
                          {aiShiftResults.employees.map((employee) => (
                            <option key={employee.employeeId} value={employee.employeeId}>
                              {employee.employeeId} {employee.name || ""}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="ai-shift-publish-button"
                          onClick={publishAiShiftEmployee}
                          disabled={aiPublishBusy || !aiPublishEmployeeId}
                        >
                          {aiPublishBusy ? "發布中…" : "發布指定"}
                        </button>
                        <button
                          type="button"
                          className="ai-shift-publish-button ai-shift-publish-all-button"
                          onClick={publishAiShiftAll}
                          disabled={aiPublishBusy || !aiShiftResults.employees.length}
                        >
                          {aiPublishBusy ? "發布中…" : "發布全部"}
                        </button>
                      </div>
                      {aiPublishMessage && (
                        <div className={`ai-shift-publish-message ${aiPublishMessage.includes("成功") ? "success" : "error"}`}>
                          {aiPublishMessage}
                        </div>
                      )}
                    </div>

                    {Array.isArray(aiShiftResults.employees) && aiShiftResults.employees.length > 0 ? (
                      <div className="ai-shift-result-list">
                        {aiShiftResults.employees.map((employee, index) => (
                          <div
                            className="ai-shift-result-card"
                            key={`${employee.employeeId || "unknown"}-${index}`}
                          >
                            <div className="ai-shift-person">
                              <strong>{employee.employeeId || "未辨識工號"}</strong>
                              <span>{employee.name || "未配對姓名"}</span>
                              {employee.matched === false && <em>系統找不到此工號</em>}
                              {Array.isArray(aiShiftResults.publishedEmployeeIds) &&
                                aiShiftResults.publishedEmployeeIds.includes(employee.employeeId) && (
                                  <em className="published">已發布</em>
                                )}
                            </div>

                            <div className="ai-shift-day-results">
                              {Array.isArray(employee.days) && employee.days.length > 0 ? (
                                employee.days.map((day, dayIndex) => (
                                  <div
                                    className={`ai-shift-day-result ${day.type === "半天" || day.type === "特殊" ? "half" : "off"}`}
                                    key={`${day.date || "unknown"}-${dayIndex}`}
                                  >
                                    <strong>{day.date || "日期不明"}</strong>
                                    <span>{day.type || "休"}</span>
                                    {day.marker && <small>{day.marker}</small>}
                                  </div>
                                ))
                              ) : (
                                <span className="ai-shift-empty">沒有抓到指定標記</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="ai-shift-empty">這張圖片沒有辨識到符合目前規則的資料。</div>
                    )}

                    {Array.isArray(aiShiftResults.warnings) && aiShiftResults.warnings.length > 0 && (
                      <div className="ai-shift-warnings">
                        <strong>需要注意</strong>
                        <ul>
                          {aiShiftResults.warnings.map((warning, index) => (
                            <li key={index}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="ai-shift-safe-note">
                      AI 辨識結果不會自動寫入。請先確認辨識結果，確認無誤後可直接「發布指定」或「發布全部」。按下發布後會立即寫入行事曆。
                    </div>
                  </div>
                )}
              </div>
            )}

            {adminTab === "holiday" && (
              <div className="admin-section">
                <h3>{year} 年國定假日</h3>
                <div className="admin-list">
                  {getSystemHolidayDefinitions(year).map((item) => {
                    const override = holidayOverrides[item.id];
                    const effective = currentHolidayMap[item.date] || Object.values(currentHolidayMap).find((x) => x.id === item.id);
                    const effectiveDate = override?.date || item.date;
                    const effectiveName = override?.name || item.name;
                    const disabled = override?.enabled === false;
                    return (
                      <div className="admin-list-row" key={item.id}>
                        <div><strong>{effectiveDate}</strong><span>{effectiveName}{disabled ? "（已停用）" : ""}</span></div>
                        <div className="admin-row-actions">
                          <button type="button" onClick={() => { setHolidayForm({ id: item.id, date: effectiveDate, name: effectiveName }); setAdminMessage(""); }}>編輯</button>
                          <button type="button" className="delete-button" onClick={() => disableHoliday(item.id)}>停用</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {holidayForm.id && (
                  <div className="admin-edit-box">
                    <input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} />
                    <input value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="名稱" />
                    <button className="save-button" type="button" onClick={saveHolidayOverride}>儲存國定假日</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showLoginMenu && (
        <div className="modal-backdrop login-backdrop" onClick={() => setShowLoginMenu(false)}>
          <div className="login-modal" onClick={(event) => event.stopPropagation()}>
            <div className="login-modal-header">
              <div>
                <h2>登入輪班行事曆</h2>
                <p>使用工號＋密碼登入</p>
              </div>
              <button
                className="shift-menu-close"
                type="button"
                onClick={() => setShowLoginMenu(false)}
                aria-label="關閉"
              >
                ×
              </button>
            </div>

            <form
              className="employee-login-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!loginBusy) loginWithEmployee();
              }}
            >
              <label>
                工號
                <input
                  type="text"
                  value={loginEmployeeId}
                  onChange={(event) => setLoginEmployeeId(event.target.value.toUpperCase())}
                  placeholder="例如 D7445"
                  autoCapitalize="characters"
                  autoComplete="username"
                />
              </label>

              <label>
                密碼
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="請輸入密碼"
                  autoComplete="current-password"
                />
              </label>

              <button className="login-submit-button" type="submit" disabled={loginBusy}>
                {loginBusy ? "登入中…" : "登入"}
              </button>
            </form>

            {loginError && <div className="login-error">{loginError}</div>}
          </div>
        </div>
      )}

      {showShiftMenu && (
        <div className="modal-backdrop shift-menu-backdrop" onClick={() => setShowShiftMenu(false)}>
          <div className="shift-menu" onClick={(event) => event.stopPropagation()}>
            <div className="shift-menu-header">
              <div>
                <h2>選擇班別</h2>
                <p>點一下班別即可更換</p>
              </div>
              <button
                className="shift-menu-close"
                type="button"
                onClick={() => setShowShiftMenu(false)}
                aria-label="關閉"
              >
                ×
              </button>
            </div>

            <div className="shift-options">
              {["A1", "A2", "A3", "B1", "B2", "B3"].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`shift-option ${shift === value ? "selected" : ""}`}
                  onClick={() => selectShift(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showInput && (
        <div className="modal-backdrop" onClick={() => setShowInput(false)}>
          <div className="input-modal" onClick={(event) => event.stopPropagation()}>
            <h2>日期備註</h2>
            <div className="modal-date">{formatDateForDisplay(inputDate)}</div>

            <label>
              輸入內容
              <input
                type="text"
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                placeholder="例如：K12、體檢、半天、休"
                autoFocus
              />
            </label>

            <div className="modal-buttons">
              <button className="cancel-button" onClick={() => setShowInput(false)} type="button">取消</button>
              {customEvents[inputDate] && (
                <button className="delete-button" onClick={removeCustomEvent} type="button">清除</button>
              )}
              <button className="save-button" onClick={saveCustomEvent} type="button">儲存</button>
            </div>
          </div>
        </div>
      )}

      {showLeavePicker && (
        <div className="modal-backdrop" onClick={() => setShowLeavePicker(false)}>
          <div className="leave-modal" onClick={(event) => event.stopPropagation()}>
            <h2>輸入本月放假日期</h2>
            <p className="modal-description">
              點選這個月要放假的日期。可以選黃色、藍色，甚至正班日；儲存後都會顯示紅色「休」。
            </p>

            <div className="leave-day-grid">
              {monthLeaveDays.map(({ day, key }) => {
                const status = statusMap[key] || "work";
                const selected = selectedLeaveDays.includes(day);

                return (
                  <button
                    type="button"
                    key={day}
                    className={`leave-day ${status} ${selected ? "selected" : ""}`}
                    onClick={() => toggleLeaveDay(day)}
                    aria-pressed={selected}
                  >
                    <span>{day}</span>
                    {selected && <b>休</b>}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="selected-summary selected-summary-copy"
              onClick={copySelectedLeaveSummary}
              aria-label="複製本月放假日期"
            >
              {month + 1}月放假{selectedLeaveDays.length ? selectedLeaveDays.join("、") : "無"}
            </button>

            <div className="modal-buttons">
              <button className="cancel-button" onClick={() => setShowLeavePicker(false)} type="button">取消</button>
              <button className="save-button" onClick={saveLeaveDays} type="button">儲存本月休假</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
