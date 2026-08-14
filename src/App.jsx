import { useMemo, useState } from "react";
import "./App.css";

const SHIFT_TYPES = {
  work: { symbol: "○", label: "正班", className: "work" },
  off: { symbol: "■", label: "休假日", className: "off" },
  rest: { symbol: "▲", label: "休息日", className: "rest" },
  holiday: { symbol: "×", label: "例假日", className: "holiday" },
};

// 目前先建立 2026 年台灣國定假日資料。
// 後續可再擴充其他年度，輪班本身則不會被國定假日覆蓋。
const HOLIDAYS = {
  "2026-01-01": "元旦",
  "2026-02-14": "春節連假",
  "2026-02-15": "春節連假",
  "2026-02-16": "春節連假",
  "2026-02-17": "春節連假",
  "2026-02-18": "春節連假",
  "2026-02-19": "春節連假",
  "2026-02-20": "春節連假",
  "2026-02-21": "春節連假",
  "2026-02-22": "春節連假",
  "2026-02-27": "和平紀念日補假",
  "2026-02-28": "和平紀念日",
  "2026-04-03": "兒童節、清明節連假",
  "2026-04-04": "兒童節",
  "2026-04-05": "清明節",
  "2026-04-06": "兒童節、清明節補假",
  "2026-05-01": "勞動節",
  "2026-05-02": "勞動節連假",
  "2026-05-03": "勞動節連假",
  "2026-06-19": "端午節",
  "2026-06-20": "端午節連假",
  "2026-06-21": "端午節連假",
  "2026-09-25": "中秋節",
  "2026-09-26": "中秋節連假",
  "2026-09-27": "中秋節連假",
  "2026-09-28": "孔子誕辰紀念日／教師節",
  "2026-10-09": "國慶日補假",
  "2026-10-10": "國慶日",
  "2026-10-11": "國慶日連假",
  "2026-10-24": "臺灣光復暨金門古寧頭大捷紀念日連假",
  "2026-10-25": "臺灣光復暨金門古寧頭大捷紀念日",
  "2026-10-26": "臺灣光復暨金門古寧頭大捷紀念日補假",
  "2026-12-25": "行憲紀念日",
  "2026-12-26": "行憲紀念日連假",
  "2026-12-27": "行憲紀念日連假",
};

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
  A1: [
    "off", "rest", "work", "work", "holiday", "off",
    "work", "work", "rest", "holiday", "work", "work",
  ],
  A2: [
    "holiday", "off", "work", "rest", "rest", "holiday",
    "work", "off", "work", "rest", "work", "holiday",
  ],
  A3: [
    "work", "holiday", "holiday", "off", "work", "rest",
    "work", "holiday", "work", "off", "work", "rest",
  ],
};

const B_CYCLES = {
  // X1 → B1
  B1: [
    "off", "rest", "work", "work", "holiday", "off",
    "work", "work", "rest", "holiday", "work", "work",
  ],

  // X2 → B2
  B2: [
    "holiday", "off", "work", "work", "off", "holiday",
    "work", "work", "off", "rest", "work", "rest",
  ],

  // X3 → B3
  B3: [
    "rest", "holiday", "work", "work", "off", "rest",
    "work", "holiday", "work", "off", "work", "work",
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

export default function App() {
  const today = new Date();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [shift, setShift] = useState("A1");

  // 自訂內容：
  // K12 / 體檢 / 半天 / 休 都可以直接輸入。
  const [customEvents, setCustomEvents] = useState({
    "2026-08-05": "K12",
    "2026-08-09": "半天",
  });

  const [showInput, setShowInput] = useState(false);
  const [inputDate, setInputDate] = useState("");
  const [inputText, setInputText] = useState("");

  // 「本月休假」批次輸入
  const [showLeavePicker, setShowLeavePicker] = useState(false);
  const [selectedLeaveDays, setSelectedLeaveDays] = useState([]);

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

  const statusMap = useMemo(
    () => applyWeeklyRule(cells, shift, year, month, baseStatusMap),
    [cells, shift, year, month, baseStatusMap]
  );

  const monthLeaveDays = useMemo(
    () =>
      Array.from({ length: getDaysInMonth(year, month) }, (_, index) => {
        const day = index + 1;
        const key = dateKey(year, month, day);
        return {
          day,
          key,
          selected: isLeaveText(customEvents[key]),
        };
      }),
    [year, month, customEvents]
  );

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
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  function openCustomInput(cell) {
    if (!cell.currentMonth) return;

    const key = dateKey(year, month, cell.day);
    setInputDate(key);
    setInputText(customEvents[key] || "");
    setShowInput(true);
  }

  function saveCustomEvent() {
    if (!inputDate) return;

    setCustomEvents((old) => {
      const next = { ...old };

      if (inputText.trim()) {
        next[inputDate] = inputText.trim();
      } else {
        delete next[inputDate];
      }

      return next;
    });

    setShowInput(false);
  }

  function removeCustomEvent() {
    setCustomEvents((old) => {
      const next = { ...old };
      delete next[inputDate];
      return next;
    });

    setShowInput(false);
  }

  function openLeavePicker() {
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

  function saveLeaveDays() {
    setCustomEvents((old) => {
      const next = { ...old };

      monthLeaveDays.forEach(({ key, day }) => {
        const shouldLeave = selectedLeaveDays.includes(day);
        if (shouldLeave) {
          next[key] = "休";
        } else if (isLeaveText(next[key])) {
          delete next[key];
        }
      });

      return next;
    });

    setShowLeavePicker(false);
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
    const hasLeave = status === "holiday" || isLeaveText(customText);
    const isOfficialHoliday = Boolean(HOLIDAYS[key]);

    return (
      <button
        type="button"
        className={`calendar-cell ${statusInfo.className} ${
          isToday ? "today" : ""
        } ${hasLeave ? "has-leave" : ""}`}
        key={key}
        onClick={() => openCustomInput(cell)}
        title={isOfficialHoliday ? HOLIDAYS[key] : undefined}
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

        {isOfficialHoliday && (
          <span className="holiday-label">國</span>
        )}

        {isToday && <span className="today-label">今天</span>}
      </button>
    );
  }

  const monthTitle = new Intl.DateTimeFormat("en-US", {
    month: "long",
  }).format(new Date(year, month, 1));

  return (
    <div className="app">
      <header className="top-header">
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">▦</div>
          <div>
            <h1>ShiftMate</h1>
            <p>輪班行事曆</p>
          </div>
        </div>

        <button className="login-button" type="button">
          登入
        </button>
      </header>

      <main className="main-container">
        <section className="user-card">
          <div className="user-info">
            <span className="info-title">班別</span>
            <strong>{shift}</strong>
          </div>
          <div className="user-info">
            <span className="info-title">工號</span>
            <strong>尚未登入</strong>
          </div>
          <div className="user-info">
            <span className="info-title">姓名</span>
            <strong>尚未登入</strong>
          </div>
        </section>

        <section className="calendar-card">
          <div className="controls">
            <select
              value={shift}
              onChange={(event) => setShift(event.target.value)}
              aria-label="選擇班別"
            >
              <optgroup label="A 班">
                <option value="A1">A1</option>
                <option value="A2">A2</option>
                <option value="A3">A3</option>
              </optgroup>
              <optgroup label="B 班">
                <option value="B1">B1</option>
                <option value="B2">B2</option>
                <option value="B3">B3</option>
              </optgroup>
            </select>

            <button className="leave-month-button" onClick={openLeavePicker} type="button">
              本月休假
            </button>

            <button className="today-button" onClick={goToday} type="button">
              今天
            </button>
          </div>

          <div className="month-navigation">
            <button className="month-arrow" onClick={goPreviousMonth} type="button" aria-label="上一個月">‹</button>
            <div className="month-title">
              <span>{monthTitle}</span>
              <strong>{year}</strong>
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

          <div className="calendar-note">
            <span>點日期可輸入 K12、體檢、半天等備註。</span>
            <span>輸入「休」或選擇本月休假後，日期中央會顯示紅色「休」。</span>
          </div>
        </section>
      </main>

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
