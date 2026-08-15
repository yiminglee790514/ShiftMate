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

// 你指定的規律：星期日～星期六如果有兩個黃色，
// 第一個黃色會變成藍色。
// 注意：週的判斷會包含月曆前後補出的日期，避免跨月時算錯。
function applyWeeklyRule(cells, shift, year, month, statusMap) {
  const result = { ...statusMap };

  for (let start = 0; start < cells.length; start += 7) {
    const week = cells.slice(start, start + 7);

    const yellowCells = week.filter((cell) => {
      const cellYear = cell.date.getFullYear();
      const cellMonth = cell.date.getMonth();
      const cellDay = cell.date.getDate();
      return getShiftStatus(shift, cellYear, cellMonth, cellDay) === "rest";
    });

    if (yellowCells.length >= 2) {
      const firstYellow = yellowCells[0];
      const key = dateKey(
        firstYellow.date.getFullYear(),
        firstYellow.date.getMonth(),
        firstYellow.date.getDate()
      );

      // 只修改目前正在顯示的月份，避免直接改到其他月份資料。
      if (result[key] !== undefined) {
        result[key] = "off";
      }
    }
  }

  return result;
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
    "holiday", "off", "work", "work", "off", "holiday", "work", "work", "off", "rest", "work", "work",
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
          if (profile?.active === false) {
            await auth.signOut();
            setShiftUser(null);
            setCustomEvents({});
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
          setCustomEvents(
            calendarData?.customEvents && typeof calendarData.customEvents === "object"
              ? calendarData.customEvents
              : {}
          );
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

  async function saveCustomEventsToFirebase(nextEvents) {
    if (!firebaseUser?.uid || !customEventsLoaded) return;

    try {
      const { db } = getFirebaseServices();
      await db.collection("users").doc(firebaseUser.uid).set(
        {
          customEvents: nextEvents,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("儲存行事曆失敗：", error);
      // Firebase 暫時無法寫入時，仍保留在瀏覽器，避免使用者當下編輯內容消失。
      try {
        localStorage.setItem(
          `shiftmate_customEvents_${firebaseUser.uid}`,
          JSON.stringify(nextEvents)
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

    if (inputText.trim()) {
      next[inputDate] = inputText.trim();
    } else {
      delete next[inputDate];
    }

    setCustomEvents(next);
    await saveCustomEventsToFirebase(next);
    setShowInput(false);
  }

  async function removeCustomEvent() {
    const next = { ...customEvents };
    delete next[inputDate];

    setCustomEvents(next);
    await saveCustomEventsToFirebase(next);
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

    monthLeaveDays.forEach(({ key, day }) => {
      const shouldLeave = selectedLeaveDays.includes(day);
      if (shouldLeave) {
        next[key] = "休";
      } else if (isLeaveText(next[key])) {
        delete next[key];
      }
    });

    setCustomEvents(next);
    await saveCustomEventsToFirebase(next);
    setShowLeavePicker(false);
  }

  const isAdmin = shiftUser?.role === "admin" || firebaseUser?.email?.toLowerCase() === employeeIdToEmail("Admin").toLowerCase();

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
    if (isAdmin) await loadAdminPeople();
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
          customText && <span className="custom-text">{customText}</span>
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

          <div className="legend">
            {Object.entries(SHIFT_TYPES).map(([key, info]) => (
              <div className="legend-item" key={key}>
                <span className={`legend-symbol ${info.className}`}>{info.symbol}</span>
                <span>{info.label}</span>
              </div>
            ))}
          </div>

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

            <div className="selected-summary">
              已選：{selectedLeaveDays.length ? selectedLeaveDays.join("、") : "尚未選擇"}
            </div>

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
