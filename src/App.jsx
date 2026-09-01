import { useEffect, useMemo, useRef, useState } from "react";
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


function getMonthKey(year, monthIndex) {
  return `${year}-${pad(monthIndex + 1)}`;
}

function normalizeEmployeeId(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeAttendanceCellText(cell) {
  const raw = String(cell ?? "").trim();
  if (!raw) return [];

  // 一格可能同時有多個標記，例如「半/K12」。
  // 半 → 半天；相同標記只保留一次，例如「半天/半天」只顯示一個「半天」。
  const seen = new Set();
  return raw
    .split(/[\/／、,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item === "半" ? "半天" : item)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function parseAttendanceWorkbook(arrayBuffer) {
  if (!window.XLSX) {
    throw new Error("Excel 解析元件尚未載入，請重新整理頁面後再試。");
  }

  const workbook = window.XLSX.read(arrayBuffer, { type: "array", cellDates: false });
  const employees = {};

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });

    let dateHeaders = null;

    rows.forEach((row) => {
      const first = String(row?.[0] ?? "").trim();

      if (first === "日期") {
        dateHeaders = Array.from({ length: Math.max(0, row.length - 1) }, (_, index) => {
          const value = String(row[index + 1] ?? "").trim();
          const match = value.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})$/);
          return match
            ? { column: index + 1, month: Number(match[1]), day: Number(match[2]) }
            : null;
        });
        return;
      }

      if (!dateHeaders || !first) return;

      const employeeId = normalizeEmployeeId(first);
      if (!employeeId || employeeId === "日期") return;

      const events = {};
      dateHeaders.forEach((header) => {
        if (!header) return;
        const cell = String(row[header.column] ?? "").trim();
        const texts = normalizeAttendanceCellText(cell);
        if (!texts.length) return;

        events[String(header.day)] = texts;
      });

      if (!employees[employeeId]) {
        employees[employeeId] = { employeeId, name: "", events: {} };
      }

      employees[employeeId].events = {
        ...(employees[employeeId].events || {}),
        ...events,
      };
    });
  });

  const employeeList = Object.values(employees);
  if (!employeeList.length) {
    throw new Error("Excel 裡找不到可用的員工資料，請確認格式為「日期列＋工號列」。");
  }

  // 相容舊資料：同時保留 days，方便舊月份資料繼續使用。
  employeeList.forEach((employee) => {
    employee.days = Object.entries(employee.events || {})
      .filter(([, texts]) => texts.some((text) => text === "休"))
      .map(([day]) => Number(day))
      .sort((a, b) => a - b);
  });

  return {
    employees,
    employeeCount: employeeList.length,
    sourceSheetNames: workbook.SheetNames,
  };
}

const EN_TEXT = {
  "輪班行事曆": "ShiftMate",
  "請輸入工號與密碼登入": "Enter your employee ID and password",
  "工號": "Employee ID", "密碼": "Password", "登入": "Login", "登入中…": "Signing in…",
  "登出": "Logout", "管理": "Manage", "管理者": "Administrator",
  "班別": "Shift", "姓名": "Name", "本月統計": "Monthly Summary",
  "正班": "Work", "休假日": "Day Off", "休息日": "Rest Day", "例假日": "Regular Holiday",
  "人員、全員行程、國定假日": "People, shared events and holidays",
  "人員管理": "People", "全員行程": "Shared Events", "國定假日": "Holidays", "月份資料": "Monthly Data",
  "修改人員": "Edit Person", "新增人員": "Add Person", "取消編輯": "Cancel Edit",
  "處理中…": "Processing…", "儲存修改": "Save Changes", "新增人員": "Add Person", "全部人員": "All People",
  "編輯": "Edit", "停用": "Disable", "儲存": "Save", "刪除": "Delete",
  "新增／修改全員行程": "Add / Edit Shared Event",
  "系統會自動帶入國定假日；管理者可以修改日期／名稱，或暫時停用。": "System holidays are added automatically. Administrators can change dates/names or temporarily disable them.",
  "登入輪班行事曆": "Login to ShiftMate", "使用工號＋密碼登入": "Sign in with your employee ID and password",
  "例如 D7445": "e.g. D7445", "請輸入密碼": "Enter password", "尚未登入": "Not signed in",
  "本月放假": "Monthly Leave", "載入休假": "Load Leave", "儲存": "Save", "取消": "Cancel",
  "關閉照片": "Close photo", "出勤表照片": "Attendance photo",
  "天": " days"
};

function translatePage(language) {
  const dictionary = language === "en"
    ? EN_TEXT
    : Object.fromEntries(Object.entries(EN_TEXT).map(([zh, en]) => [en, zh]));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (node.parentElement?.closest?.('[data-no-translate]')) return;
    const raw = node.nodeValue;
    const trimmed = raw.trim();
    if (!trimmed || !dictionary[trimmed]) return;
    const leading = raw.match(/^\s*/)?.[0] || "";
    const trailing = raw.match(/\s*$/)?.[0] || "";
    node.nodeValue = `${leading}${dictionary[trimmed]}${trailing}`;
  });
  document.querySelectorAll('[placeholder],[aria-label],[title]').forEach((el) => {
    ['placeholder','aria-label','title'].forEach((attr) => {
      const value = el.getAttribute(attr);
      if (value && dictionary[value]) el.setAttribute(attr, dictionary[value]);
    });
  });
}

export default function App() {
  const today = new Date();
  const [language, setLanguage] = useState(() => localStorage.getItem("shiftmate-language") || "zh");

  useEffect(() => {
    localStorage.setItem("shiftmate-language", language);
    document.documentElement.lang = language === "en" ? "en" : "zh-Hant";
    document.title = language === "en" ? "ShiftMate" : "輪班行事曆";
    const timer = window.setTimeout(() => translatePage(language), 0);
    return () => window.clearTimeout(timer);
  }, [language]);

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

  // Excel 休假資料與月份照片
  const [excelLeaveDataByMonth, setExcelLeaveDataByMonth] = useState({});
  const [showLoadLeave, setShowLoadLeave] = useState(false);
  const [showLoadLeaveConfirm, setShowLoadLeaveConfirm] = useState(false);
  const [loadLeaveItems, setLoadLeaveItems] = useState([]);
  const [loadLeaveBusy, setLoadLeaveBusy] = useState(false);
  const [loadLeaveError, setLoadLeaveError] = useState("");
  const [loadLeaveUpdatedAt, setLoadLeaveUpdatedAt] = useState(null);
  // 依月份記錄使用者最後一次點開載入休假的時間，用於更新提示。
  const [leaveNoticeSeenAtByMonth, setLeaveNoticeSeenAtByMonth] = useState({});
  const [photoNoticeSeenAtByMonth, setPhotoNoticeSeenAtByMonth] = useState({});
  const [currentMonthAttendanceUploadedAt, setCurrentMonthAttendanceUploadedAt] = useState(null);
  const [currentMonthPhotoUploadedAt, setCurrentMonthPhotoUploadedAt] = useState(null);

  const [showMonthPhotos, setShowMonthPhotos] = useState(false);
  const [monthPhotos, setMonthPhotos] = useState([]);
  const [monthPhotosBusy, setMonthPhotosBusy] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoViewer, setPhotoViewer] = useState({ rotation: 0, scale: 1, x: 0, y: 0 });
  const photoDragRef = useRef({ active: false, pointerId: null, startX: 0, startY: 0, originX: 0, originY: 0 }); 
  const [pendingPhotoFiles, setPendingPhotoFiles] = useState([]);

  const [monthDataBusy, setMonthDataBusy] = useState(false);
  const [monthDataMessage, setMonthDataMessage] = useState("");
  const [monthDataInfo, setMonthDataInfo] = useState(null);
  const [monthPhotoAdminBusy, setMonthPhotoAdminBusy] = useState(false);

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
          setExcelLeaveDataByMonth({});
          setLeaveNoticeSeenAtByMonth({});
          setPhotoNoticeSeenAtByMonth({});
          setCurrentMonthAttendanceUploadedAt(null);
          setCurrentMonthPhotoUploadedAt(null);
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
          // 這是為了讓系統可以安全地把目前登入者的資料寫回自己的帳號文件。
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
          setExcelLeaveDataByMonth(
            calendarData?.excelLeaveDataByMonth && typeof calendarData.excelLeaveDataByMonth === "object"
              ? calendarData.excelLeaveDataByMonth
              : (calendarData?.excelLeaveDatesByMonth && typeof calendarData.excelLeaveDatesByMonth === "object"
                ? Object.fromEntries(
                    Object.entries(calendarData.excelLeaveDatesByMonth).map(([monthKey, days]) => [
                      monthKey,
                      (Array.isArray(days) ? days : []).map((day) => ({ day: Number(day), texts: ["休"] }))
                    ])
                  )
                : {})
          );
          setLeaveNoticeSeenAtByMonth(
            calendarData?.leaveNoticeSeenAtByMonth && typeof calendarData.leaveNoticeSeenAtByMonth === "object"
              ? calendarData.leaveNoticeSeenAtByMonth
              : {}
          );
          setPhotoNoticeSeenAtByMonth(
            calendarData?.photoNoticeSeenAtByMonth && typeof calendarData.photoNoticeSeenAtByMonth === "object"
              ? calendarData.photoNoticeSeenAtByMonth
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



  function formatMonthDataTime(value) {
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date).replace(/-/g, "/");
  }

  async function loadMonthDataInfo() {
    if (!isAdmin) return;
    try {
      const { db } = getFirebaseServices();
      const key = getMonthKey(year, month);
      const doc = await db.collection("attendanceMonths").doc(key).get();
      setMonthDataInfo(doc.exists ? { id: doc.id, ...doc.data() } : null);
      await loadMonthPhotosForMonth(year, month);
    } catch (error) {
      console.error("讀取月份資料失敗：", error);
      setMonthDataInfo(null);
    }
  }

  async function handleAttendanceExcelUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !isAdmin) return;

    setMonthDataBusy(true);
    setMonthDataMessage("");

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseAttendanceWorkbook(buffer);
      const expectedMonth = month + 1;

      // 確認所有日期列都屬於目前管理者選擇的月份。
      const workbook = window.XLSX.read(buffer, { type: "array", cellDates: false });
      const invalidMonthCells = [];
      workbook.SheetNames.forEach((sheetName) => {
        const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
          defval: "",
          raw: false,
        });
        rows.forEach((row) => {
          if (String(row?.[0] ?? "").trim() !== "日期") return;
          row.slice(1).forEach((value) => {
            const match = String(value ?? "").trim().match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})$/);
            if (match && Number(match[1]) !== expectedMonth) invalidMonthCells.push(String(value));
          });
        });
      });

      if (invalidMonthCells.length) {
        throw new Error(`Excel 日期月份不是 ${expectedMonth} 月，請確認你現在管理的是 ${year} 年 ${expectedMonth} 月。`);
      }

      const { db } = getFirebaseServices();
      const key = getMonthKey(year, month);
      const uploadedAt = new Date();
      await db.collection("attendanceMonths").doc(key).set({
        year,
        month: expectedMonth,
        sourceFileName: file.name,
        uploadedAt,
        employeeCount: parsed.employeeCount,
        employees: parsed.employees,
      }, { merge: true });

      setMonthDataInfo({
        id: key,
        year,
        month: expectedMonth,
        sourceFileName: file.name,
        uploadedAt,
        employeeCount: parsed.employeeCount,
        employees: parsed.employees,
      });
      setMonthDataMessage(`已上傳 ${year}年${expectedMonth}月休假資料，共 ${parsed.employeeCount} 位員工。`);
    } catch (error) {
      console.error("上傳休假 Excel 失敗：", error);
      setMonthDataMessage(error?.message || "Excel 上傳失敗。");
    } finally {
      setMonthDataBusy(false);
    }
  }

  async function removeAttendanceExcel() {
    if (!isAdmin) return;
    const key = getMonthKey(year, month);
    if (!window.confirm(`確定要移除 ${year}年${month + 1}月的休假 Excel 資料嗎？\n移除後，員工將無法從這個月份載入休假。`)) return;

    setMonthDataBusy(true);
    setMonthDataMessage("");
    try {
      const { db } = getFirebaseServices();
      await db.collection("attendanceMonths").doc(key).delete();
      setMonthDataInfo(null);
      setMonthDataMessage(`${year}年${month + 1}月休假資料已移除。`);
    } catch (error) {
      setMonthDataMessage(error?.message || "移除休假資料失敗。");
    } finally {
      setMonthDataBusy(false);
    }
  }

  async function loadMonthPhotosForMonth(targetYear = year, targetMonth = month) {
    try {
      const { db } = getFirebaseServices();
      const key = getMonthKey(targetYear, targetMonth);
      const snapshot = await db.collection("monthPhotos").doc(key).collection("items").orderBy("uploadedAt", "desc").get();
      const photos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMonthPhotos(photos);
      if (targetYear === year && targetMonth === month) {
        setCurrentMonthPhotoUploadedAt(photos[0]?.uploadedAt || null);
      }
      return photos;
    } catch (error) {
      console.error("讀取月份照片失敗：", error);
      setMonthPhotos([]);
      return [];
    }
  }

  async function openMonthPhotos() {
    // 一點開「出勤表照片」就視為使用者已看到更新提示。
    markPhotoNoticeSeen();
    setSelectedPhoto(null);
    setShowMonthPhotos(true);
    setMonthPhotosBusy(true);
    const photos = await loadMonthPhotosForMonth(year, month);
    setMonthPhotosBusy(false);

    if (photos.length === 1) {
      setShowMonthPhotos(false);
      setSelectedPhoto(photos[0]);
    }
  }

  async function imageFileToFirestoreDataUrl(file, rotation = 0) {
    if (!file?.type?.startsWith("image/")) {
      throw new Error(`「${file?.name || "檔案"}」不是圖片檔案。`);
    }

    const readAsDataUrl = () => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(`讀取「${file.name}」失敗。`));
      reader.readAsDataURL(file);
    });

    const sourceUrl = await readAsDataUrl();
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`無法讀取圖片「${file.name}」。`));
      img.src = sourceUrl;
    });

    const maxDimension = 1800;
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const quarterTurn = normalizedRotation === 90 || normalizedRotation === 270;

    const canvas = document.createElement("canvas");
    canvas.width = quarterTurn ? drawHeight : drawWidth;
    canvas.height = quarterTurn ? drawWidth : drawHeight;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("瀏覽器不支援圖片處理。");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((normalizedRotation * Math.PI) / 180);
    context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

    const qualities = [0.82, 0.74, 0.66, 0.58];
    let dataUrl = "";

    for (const quality of qualities) {
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= 850000) break;
    }

    if (dataUrl.length > 850000) {
      const smaller = document.createElement("canvas");
      const ratio = 1200 / Math.max(canvas.width, canvas.height);
      const smallerScale = Math.min(1, ratio);
      smaller.width = Math.max(1, Math.round(canvas.width * smallerScale));
      smaller.height = Math.max(1, Math.round(canvas.height * smallerScale));
      const smallerContext = smaller.getContext("2d");
      if (!smallerContext) throw new Error("瀏覽器不支援圖片處理。");
      smallerContext.fillStyle = "#ffffff";
      smallerContext.fillRect(0, 0, smaller.width, smaller.height);
      smallerContext.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      dataUrl = smaller.toDataURL("image/jpeg", 0.58);
    }

    if (dataUrl.length > 900000) {
      throw new Error(`「${file.name}」圖片太大，請先縮小圖片後再上傳。`);
    }

    return dataUrl;
  }

  function handleMonthPhotoSelection(event) {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
    event.target.value = "";
    if (!files.length || !isAdmin) return;

    pendingPhotoFiles.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });

    setPendingPhotoFiles(
      files.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }))
    );
    setMonthDataMessage("");
  }


  function clearPendingPhotoFiles() {
    pendingPhotoFiles.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setPendingPhotoFiles([]);
  }

  async function uploadPendingMonthPhotos() {
    if (!pendingPhotoFiles.length || !isAdmin) return;

    setMonthPhotoAdminBusy(true);
    setMonthDataMessage("");

    try {
      const { db } = getFirebaseServices();
      const key = getMonthKey(year, month);
      let added = 0;

      for (const item of pendingPhotoFiles) {
        const dataUrl = await imageFileToFirestoreDataUrl(item.file, 0);
        const photoId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        await db.collection("monthPhotos").doc(key).collection("items").doc(photoId).set({
          name: item.file.name,
          dataUrl,
          rotation: 0,
          uploadedAt: new Date(),
          ownerUid: firebaseUser?.uid || "",
        });

        added += 1;
      }

      await loadMonthPhotosForMonth(year, month);
      clearPendingPhotoFiles();
      setMonthDataMessage(
        added
          ? `已新增 ${added} 張${year}年${month + 1}月出勤表照片。`
          : "沒有可上傳的圖片。"
      );
    } catch (error) {
      console.error("新增出勤表照片失敗：", error);
      setMonthDataMessage(error?.message || "照片上傳失敗。");
    } finally {
      setMonthPhotoAdminBusy(false);
    }
  }

  function resetPhotoViewer() {
    const savedRotation = Number(selectedPhoto?.rotation || 0);
    setPhotoViewer({ rotation: savedRotation, scale: 1, x: 0, y: 0 });
  }

  function openSelectedPhoto(photo) {
    setSelectedPhoto(photo);
    const savedRotation = Number(photo?.rotation || 0);
    setPhotoViewer({ rotation: ((savedRotation % 360) + 360) % 360, scale: 1, x: 0, y: 0 });
  }

  async function saveSelectedPhotoRotation() {
    if (!isAdmin || !selectedPhoto?.id) return;

    const rotation = ((Number(photoViewer.rotation || 0) % 360) + 360) % 360;
    setMonthPhotoAdminBusy(true);
    setMonthDataMessage("");

    try {
      const { db } = getFirebaseServices();
      const photoRef = db.collection("monthPhotos")
        .doc(getMonthKey(year, month))
        .collection("items")
        .doc(selectedPhoto.id);

      await photoRef.update({
        rotation,
        rotationUpdatedAt: new Date(),
        rotationUpdatedBy: firebaseUser?.uid || "",
      });

      setSelectedPhoto((current) => current ? { ...current, rotation } : current);
      setMonthPhotos((current) => current.map((photo) =>
        photo.id === selectedPhoto.id ? { ...photo, rotation } : photo
      ));
      setMonthDataMessage(rotation ? `照片方向已儲存（${rotation}°）。` : "照片方向已恢復原始方向。");
    } catch (error) {
      console.error("儲存照片旋轉失敗：", error);
      setMonthDataMessage(error?.message || "儲存照片方向失敗。");
    } finally {
      setMonthPhotoAdminBusy(false);
    }
  }

  function closeSelectedPhoto() {
    setSelectedPhoto(null);
    resetPhotoViewer();
    photoDragRef.current = { active: false, pointerId: null, startX: 0, startY: 0, originX: 0, originY: 0 };
  }

  function rotateSelectedPhoto(direction = 1) {
    setPhotoViewer((current) => ({
      ...current,
      rotation: (current.rotation + direction * 90 + 360) % 360,
    }));
  }

  function zoomSelectedPhoto(delta) {
    setPhotoViewer((current) => ({
      ...current,
      scale: Math.min(4, Math.max(0.5, Number((current.scale + delta).toFixed(2)))),
    }));
  }

  function handlePhotoWheel(event) {
    event.preventDefault();
    zoomSelectedPhoto(event.deltaY < 0 ? 0.15 : -0.15);
  }

  function handlePhotoPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const current = photoViewer;
    photoDragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: current.x,
      originY: current.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePhotoPointerMove(event) {
    const drag = photoDragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    setPhotoViewer((current) => ({
      ...current,
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    }));
  }

  function handlePhotoPointerUp(event) {
    const drag = photoDragRef.current;
    if (drag.pointerId === event.pointerId) {
      photoDragRef.current.active = false;
      photoDragRef.current.pointerId = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }

  async function removeMonthPhoto(photo) {
    if (!isAdmin || !photo?.id) return;
    if (!window.confirm(`確定要移除「${photo.name || "這張照片"}」嗎？`)) return;

    setMonthPhotoAdminBusy(true);
    try {
      const { db } = getFirebaseServices();
      await db.collection("monthPhotos")
        .doc(getMonthKey(year, month))
        .collection("items")
        .doc(photo.id)
        .delete();

      await loadMonthPhotosForMonth(year, month);
      setMonthDataMessage("照片已移除。");
    } catch (error) {
      setMonthDataMessage(error?.message || "照片移除失敗。");
    } finally {
      setMonthPhotoAdminBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentMonthAttendanceNotice() {
      if (!firebaseUser) {
        setCurrentMonthAttendanceUploadedAt(null);
        return;
      }
      try {
        const { db } = getFirebaseServices();
        const key = getMonthKey(year, month);
        const doc = await db.collection("attendanceMonths").doc(key).get();
        if (cancelled) return;
        setCurrentMonthAttendanceUploadedAt(doc.exists ? (doc.data()?.uploadedAt || null) : null);

        // 出勤表照片的更新提示以本月份最新一張照片的 uploadedAt 判斷。
        const photoSnapshot = await db.collection("monthPhotos").doc(key).collection("items")
          .orderBy("uploadedAt", "desc").limit(1).get();
        if (cancelled) return;
        setCurrentMonthPhotoUploadedAt(
          photoSnapshot.empty ? null : (photoSnapshot.docs[0].data()?.uploadedAt || null)
        );
      } catch (error) {
        if (!cancelled) {
          setCurrentMonthAttendanceUploadedAt(null);
          setCurrentMonthPhotoUploadedAt(null);
        }
        console.error("讀取月份更新提示失敗：", error);
      }
    }

    loadCurrentMonthAttendanceNotice();
    return () => { cancelled = true; };
  }, [firebaseUser, year, month]);

  const currentMonthKey = getMonthKey(year, month);
  const currentMonthNoticeMillis = currentMonthAttendanceUploadedAt
    ? new Date(currentMonthAttendanceUploadedAt?.toDate ? currentMonthAttendanceUploadedAt.toDate() : currentMonthAttendanceUploadedAt).getTime()
    : 0;
  const currentMonthSeenMillis = leaveNoticeSeenAtByMonth?.[currentMonthKey]
    ? new Date(leaveNoticeSeenAtByMonth[currentMonthKey]).getTime()
    : 0;
  const showLeaveUpdateBadge = Boolean(
    currentMonthNoticeMillis && (!currentMonthSeenMillis || currentMonthNoticeMillis > currentMonthSeenMillis)
  );

  const currentMonthPhotoNoticeMillis = currentMonthPhotoUploadedAt
    ? new Date(currentMonthPhotoUploadedAt?.toDate ? currentMonthPhotoUploadedAt.toDate() : currentMonthPhotoUploadedAt).getTime()
    : 0;
  const currentMonthPhotoSeenMillis = photoNoticeSeenAtByMonth?.[currentMonthKey]
    ? new Date(photoNoticeSeenAtByMonth[currentMonthKey]).getTime()
    : 0;
  const showPhotoUpdateBadge = Boolean(
    currentMonthPhotoNoticeMillis && (!currentMonthPhotoSeenMillis || currentMonthPhotoNoticeMillis > currentMonthPhotoSeenMillis)
  );

  async function markLeaveNoticeSeen() {
    if (!firebaseUser) return;
    const seenAt = new Date().toISOString();
    const next = { ...leaveNoticeSeenAtByMonth, [currentMonthKey]: seenAt };
    setLeaveNoticeSeenAtByMonth(next);
    try {
      const { db } = getFirebaseServices();
      await db.collection("users").doc(firebaseUser.uid).set({
        leaveNoticeSeenAtByMonth: next,
      }, { merge: true });
    } catch (error) {
      console.error("儲存休假更新提示狀態失敗：", error);
    }
  }

  async function markPhotoNoticeSeen() {
    if (!firebaseUser) return;
    const seenAt = new Date().toISOString();
    const next = { ...photoNoticeSeenAtByMonth, [currentMonthKey]: seenAt };
    setPhotoNoticeSeenAtByMonth(next);
    try {
      const { db } = getFirebaseServices();
      await db.collection("users").doc(firebaseUser.uid).set({
        photoNoticeSeenAtByMonth: next,
      }, { merge: true });
    } catch (error) {
      console.error("儲存出勤表照片更新提示狀態失敗：", error);
    }
  }

  async function openLoadLeave() {
    // 一點開「載入休假」就視為使用者已看到更新提示。
    markLeaveNoticeSeen();
    setLoadLeaveError("");
    setLoadLeaveItems([]);
    setLoadLeaveUpdatedAt(null);
    setShowLoadLeave(true);

    if (!firebaseUser) {
      setLoadLeaveError("請先登入後再載入休假。");
      return;
    }

    setLoadLeaveBusy(true);
    try {
      const { db } = getFirebaseServices();
      const key = getMonthKey(year, month);
      const doc = await db.collection("attendanceMonths").doc(key).get();

      if (!doc.exists) {
        setLoadLeaveError("出勤資料尚未上傳");
        return;
      }

      const data = doc.data() || {};
      setLoadLeaveUpdatedAt(data.uploadedAt || null);
      const employeeId = normalizeEmployeeId(
        shiftUser?.employeeId || firebaseUser?.email?.split("@")[0] || ""
      );
      const employee = data?.employees?.[employeeId];

      if (!employee) {
        setLoadLeaveError("出勤資料尚未上傳");
        return;
      }

      let items = Object.entries(employee.events || {})
        .map(([day, texts]) => ({
          day: Number(day),
          texts: Array.isArray(texts)
            ? Array.from(new Set(texts.map((text) => text === "半" ? "半天" : String(text)).filter(Boolean)))
            : [],
        }))
        .filter((item) =>
          item.day >= 1 &&
          item.day <= getDaysInMonth(year, month) &&
          item.texts.length
        )
        .sort((a, b) => a.day - b.day);

      // 相容尚未更新前的舊 Excel 資料。
      if (!items.length && Array.isArray(employee.days)) {
        items = [...new Set(employee.days.map(Number))]
          .filter((day) => day >= 1 && day <= getDaysInMonth(year, month))
          .sort((a, b) => a - b)
          .map((day) => ({ day, texts: ["休"] }));
      }

      setLoadLeaveItems(items);
    } catch (error) {
      console.error("讀取休假資料失敗：", error);
      setLoadLeaveError(error?.message || "休假資料讀取失敗。");
    } finally {
      setLoadLeaveBusy(false);
    }
  }


  function closeLoadLeave() {
    if (loadLeaveBusy) return;
    setShowLoadLeave(false);
    setShowLoadLeaveConfirm(false);
    setLoadLeaveError("");
  }

  function requestLoadLeaveConfirm() {
    if (loadLeaveBusy || loadLeaveError) return;
    setShowLoadLeaveConfirm(true);
  }

  async function confirmLoadLeave() {
    if (!firebaseUser || !loadLeaveItems.length) return;

    setLoadLeaveBusy(true);
    try {
      const key = getMonthKey(year, month);
      const previousImported = Array.isArray(excelLeaveDataByMonth[key])
        ? excelLeaveDataByMonth[key]
        : [];

      const next = { ...customEvents };
      const deletedNext = new Set(deletedCustomEventDates);

      // 整批取代目前使用者、目前月份上一批 Excel 載入資料。
      // 只清除這個月份曾由 Excel 載入的日期，不碰其他月份或其他使用者。
      previousImported.forEach((item) => {
        const oldDay = Number(item?.day);
        if (!oldDay) return;
        const oldKey = dateKey(year, month, oldDay);
        if (next[oldKey]) {
          delete next[oldKey];
          deletedNext.add(oldKey);
        }
      });

      // 相容較早版本：如果沒有保存上一批 Excel 日期清單，
      // 仍清除目前月份中明確標記為「休」的舊休假，避免殘留。
      Object.keys(next).forEach((eventKey) => {
        if (!eventKey.startsWith(`${year}-${pad(month + 1)}-`)) return;
        if (isLeaveText(next[eventKey])) {
          delete next[eventKey];
          deletedNext.add(eventKey);
        }
      });

      loadLeaveItems.forEach((item) => {
        const day = Number(item.day);
        if (!day) return;
        const eventKey = dateKey(year, month, day);
        const texts = Array.isArray(item.texts) ? item.texts.filter(Boolean) : [];

        // 同一天多個標記上下排列，例如：
        // 半/K12 → 半天\nK12
        // 如果包含「休」，仍以「休」作為休假標記。
        next[eventKey] = texts.includes("休") ? "休" : texts.join("\n");
        deletedNext.delete(eventKey);
      });

      const importedNext = {
        ...excelLeaveDataByMonth,
        [key]: loadLeaveItems,
      };

      setCustomEvents(next);
      setDeletedCustomEventDates([...deletedNext]);
      setExcelLeaveDataByMonth(importedNext);

      const { db } = getFirebaseServices();
      await db.collection("users").doc(firebaseUser.uid).set({
        customEvents: next,
        deletedCustomEventDates: [...deletedNext],
        excelLeaveDataByMonth: importedNext,
        updatedAt: new Date(),
      }, { merge: true });

      setShowLoadLeaveConfirm(false);
      setShowLoadLeave(false);
    } catch (error) {
      console.error("載入休假失敗：", error);
      setLoadLeaveError(error?.message || "載入休假失敗。");
      setShowLoadLeaveConfirm(false);
    } finally {
      setLoadLeaveBusy(false);
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

  useEffect(() => {
    if (!showAdminPanel || !isAdmin) return;
    loadMonthDataInfo();
  }, [showAdminPanel, isAdmin, year, month]);

  const currentHolidayMap = useMemo(
    () => buildHolidayMap(year, holidayOverrides),
    [year, holidayOverrides]
  );

  async function loadAdminPeople() {
    if (!isAdmin) return;
    const { db } = getFirebaseServices();
    const snapshot = await db.collection("shiftUsers").orderBy("employeeId").get();

    const uniquePeople = new Map();
    snapshot.docs.forEach((doc) => {
      const data = doc.data() || {};
      const employeeId = String(data.employeeId || doc.id || "").trim().toUpperCase();
      if (!employeeId || data.active === false) return;

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

  async function restoreHoliday(id) {
    const systemHoliday = getSystemHolidayDefinitions(year).find((item) => item.id === id);
    if (!systemHoliday) return;

    try {
      const { db } = getFirebaseServices();
      await db.collection("holidayOverrides").doc(id).set({
        year,
        date: systemHoliday.date,
        name: systemHoliday.name,
        enabled: true,
        updatedAt: new Date(),
      }, { merge: true });
      setHolidayOverrides((old) => ({
        ...old,
        [id]: {
          ...(old[id] || {}),
          year,
          date: systemHoliday.date,
          name: systemHoliday.name,
          enabled: true,
        },
      }));
      setAdminMessage("國定假日已恢復");
    } catch (error) {
      setAdminMessage(error?.message || "恢復失敗");
    }
  }

  async function openAdmin() {
    setShowAdminPanel(true);
    setAdminMessage("");
    if (isAdmin) {
      await loadAdminPeople();
      await loadMonthDataInfo();
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
            (customText.includes("/") || customText.includes("\n")) ? (
              <span className="custom-text custom-text-multi">
                {Array.from(new Set(customText.split(/[\/\n]+/).map((text) => text === "半" ? "半天" : text).filter(Boolean))).map((text, index) => (
                  <span key={`${text}-${index}`}>{text}</span>
                ))}
              </span>
            ) : (
              <span className="custom-text">{customText === "半" ? "半天" : customText}</span>
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
          <button
            className="language-button"
            type="button"
            onClick={() => setLanguage((current) => current === "zh" ? "en" : "zh")}
            aria-label={language === "zh" ? "Switch to English" : "切換為中文"}
          >
            {language === "zh" ? "🌐 EN" : "🌐 中文"}
          </button>
          {isAdmin && (
            <button className="admin-button" type="button" onClick={openAdmin}>{language === "en" ? "Manage" : "管理"}</button>
          )}
          {firebaseUser ? (
            <button className="login-button" type="button" onClick={logoutFirebase}>
              {language === "en" ? "Logout" : "登出"}
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
              {language === "en" ? "Today" : "今天"}
            </button>
          </div>

          <div className="calendar-import-actions">
            <button className="calendar-import-button leave-import-button" type="button" onClick={openLoadLeave}>
              {showLeaveUpdateBadge && <span className="leave-update-badge" aria-label="休假資料已更新">!</span>}
              載入休假
            </button>
            <button className="calendar-import-button photo-view-button" type="button" onClick={openMonthPhotos}>
              {showPhotoUpdateBadge && <span className="photo-update-badge" aria-label="出勤表照片已更新">!</span>}
              出勤表照片
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

          <div className="calendar-statistics" aria-label="本月統計" data-no-translate>
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

        </section>
      </main>



      {showLoadLeave && (
        <div className="modal-backdrop" onClick={closeLoadLeave}>
          <div className="login-modal month-load-modal" onClick={(event) => event.stopPropagation()}>
            <div className="login-modal-header">
              <div>
                <h2>{language === "en"
                  ? `${shiftUser?.name ? `${shiftUser.name} ` : ""}${year}/${month + 1} Leave`
                  : <>{shiftUser?.name ? `${shiftUser.name} ` : ""}{year}年{month + 1}月份休假</>}</h2>
                <p>{language === "en" ? "Read your leave from this month's attendance data" : "從本月份的出勤資料讀取你的休假"}</p>
                {loadLeaveUpdatedAt && (
                  <p className="month-load-updated-at">{language === "en" ? "Last updated: " : "資料更新時間："}{formatMonthDataTime(loadLeaveUpdatedAt)}</p>
                )}
              </div>
              <button className="shift-menu-close" type="button" onClick={closeLoadLeave}>×</button>
            </div>

            {loadLeaveBusy && <div className="month-load-status">{language === "en" ? "Loading…" : "讀取中…"}</div>}
            {!loadLeaveBusy && loadLeaveError && (
              <div className="month-load-error">{loadLeaveError}</div>
            )}
            {!loadLeaveBusy && !loadLeaveError && (
              <>
                {(() => {
                  const leaveItems = loadLeaveItems.filter((item) => (item.texts || []).some((text) => text === "休"));
                  const specialItems = loadLeaveItems.filter((item) => (item.texts || []).some((text) => text !== "休"));
                  const renderItems = (items, kind) => items.length ? items.map((item) => (
                    <div className={`month-load-item ${kind === "leave" ? "month-load-item-leave" : "month-load-item-special"}`} key={`${kind}-${item.day}`}>
                      <span className="month-load-day">{language === "en" ? item.day : `${item.day}號`}</span>
                      <span className="month-load-item-text">
                        {(item.texts || []).filter((text) => kind === "leave" ? text === "休" : text !== "休").map((text, index) => (
                          <span
                            key={`${item.day}-${text}-${index}`}
                            className={text === "休" ? "month-load-tag leave" : "month-load-tag special"}
                          >
                            {text === "半" ? "半天" : text}
                          </span>
                        ))}
                      </span>
                    </div>
                  )) : <span className="month-load-empty">{language === "en" ? "No data" : "沒有資料"}</span>;

                  return (
                    <div className="month-load-sections">
                      <section className="month-load-section month-load-section-leave">
                        <h3>{language === "en" ? "Leave" : "休假"}</h3>
                        <div className="month-load-days">{renderItems(leaveItems, "leave")}</div>
                      </section>
                      <section className="month-load-section month-load-section-special">
                        <h3>{language === "en" ? "Other" : "其他"}</h3>
                        <div className="month-load-days">{renderItems(specialItems, "special")}</div>
                      </section>
                    </div>
                  );
                })()}
                <div className="modal-buttons">
                  <button className="cancel-button" type="button" onClick={closeLoadLeave}>{language === "en" ? "Cancel" : "取消"}</button>
                  <button className="save-button" type="button" onClick={requestLoadLeaveConfirm} disabled={!loadLeaveItems.length}>{language === "en" ? "Load" : "載入"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showLoadLeaveConfirm && (
        <div className="modal-backdrop" onClick={() => !loadLeaveBusy && setShowLoadLeaveConfirm(false)}>
          <div className="login-modal confirm-load-modal" onClick={(event) => event.stopPropagation()}>
            <div className="login-modal-header">
              <div>
                <h2>{language === "en" ? "Confirm Load" : "確認載入"}</h2>
                <p>{language === "en" ? `Load leave for ${year}/${month + 1}?` : <>確定要載入 {year}年{month + 1}月的休假嗎？</>}</p>
              </div>
            </div>
            <div className="modal-buttons">
              <button className="cancel-button" type="button" onClick={() => setShowLoadLeaveConfirm(false)} disabled={loadLeaveBusy}>{language === "en" ? "Cancel" : "取消"}</button>
              <button className="save-button" type="button" onClick={confirmLoadLeave} disabled={loadLeaveBusy}>
                {loadLeaveBusy ? (language === "en" ? "Loading…" : "載入中…") : (language === "en" ? "Confirm Load" : "確定載入")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMonthPhotos && (
        <div className="modal-backdrop" onClick={() => !selectedPhoto && setShowMonthPhotos(false)}>
          <div className="login-modal month-photos-modal" onClick={(event) => event.stopPropagation()}>
            <div className="login-modal-header">
              <div>
                <h2>{language === "en" ? `${year}/${month + 1} Attendance Photos` : `${year}年${month + 1}月出勤表照片`}</h2>
                <p>{language === "en" ? "Photos uploaded by the administrator for this month" : "管理者上傳的本月份照片"}</p>
              </div>
              <button className="shift-menu-close" type="button" onClick={() => setShowMonthPhotos(false)}>×</button>
            </div>

            {monthPhotosBusy ? (
              <div className="month-load-status">讀取中…</div>
            ) : monthPhotos.length ? (
              <div className="month-photo-viewer-grid">
                {monthPhotos.map((photo) => (
                  <button type="button" className="month-photo-view-item" key={photo.id} onClick={() => openSelectedPhoto(photo)}>
                    <img src={photo.dataUrl || photo.url} alt={photo.name || "出勤表照片"} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="month-load-empty">本月尚未上傳出勤表照片</div>
            )}
          </div>
        </div>
      )}

      {selectedPhoto && (
        <div className="modal-backdrop photo-direct-backdrop" onClick={closeSelectedPhoto}>
          <div className="photo-direct-view" onClick={(event) => event.stopPropagation()}>
            <div className="photo-direct-toolbar">
              <button type="button" onClick={() => rotateSelectedPhoto(-1)} aria-label="向左旋轉">↶</button>
              <button type="button" onClick={() => zoomSelectedPhoto(-0.25)} aria-label="縮小">−</button>
              <span>{Math.round(photoViewer.scale * 100)}%</span>
              <button type="button" onClick={() => zoomSelectedPhoto(0.25)} aria-label="放大">＋</button>
              <button type="button" onClick={() => rotateSelectedPhoto(1)} aria-label="向右旋轉">↷</button>
              <button type="button" className="photo-direct-reset" onClick={resetPhotoViewer}>重設</button>
              {isAdmin && (
                <button
                  type="button"
                  className="photo-direct-save"
                  onClick={saveSelectedPhotoRotation}
                  disabled={monthPhotoAdminBusy}
                >
                  {monthPhotoAdminBusy ? "儲存中…" : "儲存旋轉"}
                </button>
              )}
              <button type="button" className="photo-direct-close" onClick={closeSelectedPhoto} aria-label="關閉照片">×</button>
            </div>
            <div
              className="photo-direct-canvas"
              onWheel={handlePhotoWheel}
              onPointerDown={handlePhotoPointerDown}
              onPointerMove={handlePhotoPointerMove}
              onPointerUp={handlePhotoPointerUp}
              onPointerCancel={handlePhotoPointerUp}
              onDoubleClick={() => zoomSelectedPhoto(0.5)}
            >
              <img
                src={selectedPhoto.dataUrl || selectedPhoto.url}
                alt={selectedPhoto.name || "出勤表照片"}
                draggable="false"
                style={{
                  transform: `translate(${photoViewer.x}px, ${photoViewer.y}px) rotate(${photoViewer.rotation}deg) scale(${photoViewer.scale})`,
                }}
              />
            </div>
          </div>
        </div>
      )}

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
                ["monthData", "月份資料"],
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
              <div className="admin-section holiday-admin-section">
                <h3>{year}年國定假日</h3>
                <p className="month-data-help">
                  系統會自動帶入國定假日；管理者可以修改日期／名稱，或暫時停用。
                </p>

                <div className="holiday-admin-list">
                  {getSystemHolidayDefinitions(year).map((item) => {
                    const override = holidayOverrides[item.id];
                    const enabled = override?.enabled !== false;
                    const date = override?.date || item.date;
                    const name = override?.name || item.name;

                    return (
                      <div className={`holiday-admin-row ${enabled ? "" : "disabled"}`} key={item.id}>
                        <div className="holiday-admin-info">
                          <strong>{date}</strong>
                          <span>{name}</span>
                        </div>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="holiday-edit-button"
                            onClick={() => setHolidayForm({
                              id: item.id,
                              date,
                              name,
                            })}
                          >
                            編輯
                          </button>
                          {enabled ? (
                            <button
                              type="button"
                              className="holiday-disable-button"
                              onClick={() => disableHoliday(item.id)}
                            >
                              停用
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="holiday-restore-button"
                              onClick={() => restoreHoliday(item.id)}
                            >
                              恢復
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {holidayForm.id && (
                  <div className="holiday-edit-box">
                    <div className="holiday-edit-title">
                      <strong>修改國定假日</strong>
                      <button
                        type="button"
                        className="shift-menu-close"
                        onClick={() => setHolidayForm({ id: "", date: "", name: "" })}
                      >
                        ×
                      </button>
                    </div>
                    <div className="admin-form-grid">
                      <input
                        type="date"
                        value={holidayForm.date}
                        onChange={(event) => setHolidayForm({ ...holidayForm, date: event.target.value })}
                      />
                      <input
                        value={holidayForm.name}
                        placeholder="國定假日名稱"
                        onChange={(event) => setHolidayForm({ ...holidayForm, name: event.target.value })}
                      />
                    </div>
                    <div className="modal-buttons">
                      <button
                        type="button"
                        className="cancel-button"
                        onClick={() => setHolidayForm({ id: "", date: "", name: "" })}
                      >
                        取消
                      </button>
                      <button type="button" className="save-button" onClick={saveHolidayOverride}>
                        儲存
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {adminTab === "monthData" && (
              <div className="admin-section month-data-section">
                <h3>月份資料</h3>
                <p className="month-data-help">
                  休假 Excel 與出勤表照片都依目前選擇的年月分開管理，不使用檔名判斷月份。
                </p>

                <div className="month-data-card">
                  <div className="month-data-card-header">
                    <div>
                      <strong>{year}年{month + 1}月休假資料</strong>
                      <span>{monthDataInfo?.sourceFileName || "尚未上傳休假資料"}</span>
                    </div>
                    {monthDataInfo?.sourceFileName && (
                      <button type="button" className="danger-button" disabled={monthDataBusy} onClick={removeAttendanceExcel}>
                        移除 Excel
                      </button>
                    )}
                  </div>

                  <input
                    id="attendance-excel-input"
                    className="month-data-file-input"
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={handleAttendanceExcelUpload}
                    disabled={monthDataBusy}
                  />
                  <label className="month-data-upload-button" htmlFor="attendance-excel-input">
                    {monthDataBusy ? "處理中…" : "上傳休假 Excel"}
                  </label>

                  {monthDataInfo?.uploadedAt && (
                    <small className="month-data-meta">
                      已上傳：{formatMonthDataTime(monthDataInfo.uploadedAt)} · {monthDataInfo.employeeCount || 0} 位員工
                    </small>
                  )}
                </div>

                <div className="month-data-card">
                  <div className="month-data-card-header">
                    <div>
                      <strong>{year}年{month + 1}月出勤表照片</strong>
                      <span>{monthPhotos.length ? `${monthPhotos.length} 張` : "尚未上傳照片"}</span>
                    </div>
                  </div>

                  <input
                    id="month-photo-input"
                    className="month-data-file-input"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleMonthPhotoSelection}
                    disabled={monthPhotoAdminBusy}
                  />
                  <label className="month-data-upload-button photo-upload-button" htmlFor="month-photo-input">
                    選擇出勤表照片
                  </label>

                  {pendingPhotoFiles.length > 0 && (
                    <div className="pending-photo-upload">
                      <div className="pending-photo-grid">
                        {pendingPhotoFiles.map((item, index) => (
                          <div className="pending-photo-card" key={`${item.file.name}-${index}`}>
                            <div className="pending-photo-preview">
                              <img
                                src={item.previewUrl}
                                alt={item.file.name}
                              />
                            </div>
                            <div className="pending-photo-name">{item.file.name}</div>
                          </div>
                        ))}
                      </div>
                      <div className="pending-photo-actions">
                        <button type="button" className="cancel-button" onClick={clearPendingPhotoFiles} disabled={monthPhotoAdminBusy}>
                          取消
                        </button>
                        <button type="button" className="save-button" onClick={uploadPendingMonthPhotos} disabled={monthPhotoAdminBusy}>
                          {monthPhotoAdminBusy ? "上傳中…" : "確認上傳"}
                        </button>
                      </div>
                    </div>
                  )}

                  {monthPhotos.length > 0 && (
                    <div className="admin-photo-grid">
                      {monthPhotos.map((photo) => (
                        <div className="admin-photo-item" key={photo.id}>
                          <button type="button" onClick={() => openSelectedPhoto(photo)} className="admin-photo-preview">
                            <img src={photo.dataUrl || photo.url} alt={photo.name || "出勤表照片"} />
                          </button>
                          <button type="button" className="danger-button admin-photo-delete" disabled={monthPhotoAdminBusy} onClick={() => removeMonthPhoto(photo)}>
                            移除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {monthDataMessage && <div className="admin-message">{monthDataMessage}</div>}
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
            <h2>{language === "en" ? "Select Leave Dates for This Month" : "輸入本月放假日期"}</h2>
            <p className="modal-description">
              {language === "en"
                ? "Select the dates you want to take off this month. You can select yellow, blue, or even work days; after saving, they will be marked in red with 「休」。"
                : "點選這個月要放假的日期。可以選黃色、藍色，甚至正班日；儲存後都會顯示紅色「休」。"}
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
              {language === "en"
                ? `${month + 1} Leave: ${selectedLeaveDays.length ? selectedLeaveDays.join(", ") : "None"}`
                : `${month + 1}月放假${selectedLeaveDays.length ? selectedLeaveDays.join("、") : "無"}`}
            </button>

            <div className="modal-buttons">
              <button className="cancel-button" onClick={() => setShowLeavePicker(false)} type="button">{language === "en" ? "Cancel" : "取消"}</button>
              <button className="save-button" onClick={saveLeaveDays} type="button">{language === "en" ? "Save This Month's Leave" : "儲存本月休假"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
