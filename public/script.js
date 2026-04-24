const monthSelector = document.getElementById("monthSelector");
const calendarTitle = document.getElementById("calendarTitle");
const weekdays = document.getElementById("weekdays");
const daysGrid = document.getElementById("daysGrid");
const emailInput = document.getElementById("emailInput");
const emailSearchBtn = document.getElementById("emailSearchBtn");
const emailResult = document.getElementById("emailResult");
const diaryTitle = document.getElementById("diaryTitle");
const diaryInputs = document.getElementById("diaryInputs");
const addDiaryBtn = document.getElementById("addDiaryBtn");
const addDraftBtn = document.getElementById("addDraftBtn");
const saveDraftBtn = document.getElementById("saveDraftBtn");
const saveDiaryBtn = document.getElementById("saveDiaryBtn");
const diaryResult = document.getElementById("diaryResult");
const existingDiaries = document.getElementById("existingDiaries");
const draftList = document.getElementById("draftList");
const diaryModeBtn = document.getElementById("diaryModeBtn");
const draftModeBtn = document.getElementById("draftModeBtn");
const diaryModePanel = document.getElementById("diaryModePanel");
const draftModePanel = document.getElementById("draftModePanel");

const year = new Date().getFullYear();
const weekNames = ["일", "월", "화", "수", "목", "금", "토"];

let selectedMonth = new Date().getMonth() + 1;
let selectedDay = null;
let selectedEmail = "";
let diaryInputCount = 0;
let monthDiaryMap = {};
let monthDraftMap = {};
let monthReplyMap = {};
let dayReply = null;
let selectedDrafts = [];
let currentMode = "diary";

function formatReplyStatusLabel(status) {
  if (status === "PENDING") {
    return "준비중";
  }
  if (status === "SUCCEED") {
    return "준비완료";
  }
  return "";
}

function formatReadLabel(isRead) {
  return isRead ? "읽음" : "안읽음";
}

function setMode(mode) {
  currentMode = mode;
  const isDiaryMode = mode === "diary";
  diaryModePanel.classList.toggle("hidden", !isDiaryMode);
  draftModePanel.classList.toggle("hidden", isDiaryMode);
  diaryModeBtn.classList.toggle("active", isDiaryMode);
  draftModeBtn.classList.toggle("active", !isDiaryMode);
}

function syncDiaryButtons() {
  const isMax = diaryInputCount >= 5;
  addDiaryBtn.disabled = isMax;
  addDraftBtn.disabled = isMax;
}

function formatSelectedDate() {
  if (!selectedDay) {
    return "";
  }
  return `${year}-${String(selectedMonth).padStart(2, "0")}-${String(
    selectedDay
  ).padStart(2, "0")}`;
}

function createDiaryInput(value = "") {
  if (diaryInputCount >= 5) {
    return;
  }
  const input = document.createElement("input");
  input.type = "text";
  input.className = "diary-input";
  input.maxLength = 49;
  input.placeholder = `${diaryInputCount + 1}번째 일기 (2자 이상 50자 미만)`;
  input.value = value;
  diaryInputs.appendChild(input);
  diaryInputCount += 1;
  syncDiaryButtons();
}

function resetDiaryInputs() {
  diaryInputs.innerHTML = "";
  diaryInputCount = 0;
  createDiaryInput();
  syncDiaryButtons();
}

function renderExistingDiaries() {
  existingDiaries.innerHTML = "";
  if (!selectedDay || !monthDiaryMap[selectedDay]) {
    return;
  }

  monthDiaryMap[selectedDay].diaries.forEach((diary) => {
    const item = document.createElement("li");
    item.className = "existing-diary-item";

    const content = document.createElement("span");
    content.className = "diary-item-content";
    content.textContent = diary.content;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-diary-btn";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => {
      deleteDiary(diary.id);
    });

    item.appendChild(content);
    item.appendChild(deleteButton);

    existingDiaries.appendChild(item);
  });

  const replyArea = document.createElement("div");
  replyArea.className = "reply-area";
  const firstDiaryId = monthDiaryMap[selectedDay].diaries[0]?.id;

  if (!dayReply) {
    const createReplyButton = document.createElement("button");
    createReplyButton.type = "button";
    createReplyButton.className = "reply-btn";
    createReplyButton.textContent = "답장 생성";
    createReplyButton.addEventListener("click", () => {
      if (firstDiaryId) {
        createReply(firstDiaryId);
      }
    });
    replyArea.appendChild(createReplyButton);
  } else {
    const replyStatus = document.createElement("p");
    replyStatus.className = "reply-status";
    replyStatus.textContent = `상태: ${dayReply.replyProcessStatus} | is_read: ${dayReply.isRead}`;
    replyArea.appendChild(replyStatus);

    const statusButtons = document.createElement("div");
    statusButtons.className = "reply-buttons";

    const pendingButton = document.createElement("button");
    pendingButton.type = "button";
    pendingButton.className = "reply-btn";
    pendingButton.textContent = "PENDING";
    pendingButton.addEventListener("click", () => {
      updateReply(dayReply.id, {
        replyProcessStatus: "PENDING",
        replyType: dayReply.replyType || "FIRST",
      });
    });

    const succeedButton = document.createElement("button");
    succeedButton.type = "button";
    succeedButton.className = "reply-btn";
    succeedButton.textContent = "SUCCEED";
    succeedButton.addEventListener("click", () => {
      updateReply(dayReply.id, {
        replyProcessStatus: "SUCCEED",
        isRead: dayReply.isRead,
        content: dayReply.content || "",
        replyType: dayReply.replyType || "FIRST",
      });
    });

    statusButtons.appendChild(pendingButton);
    statusButtons.appendChild(succeedButton);
    replyArea.appendChild(statusButtons);

    if (dayReply.replyProcessStatus === "SUCCEED") {
      const readToggleButton = document.createElement("button");
      readToggleButton.type = "button";
      readToggleButton.className = "reply-btn";
      readToggleButton.textContent = dayReply.isRead
        ? "읽지 않음(false)로 변경"
        : "읽음(true)으로 변경";
      readToggleButton.addEventListener("click", () => {
        updateReply(dayReply.id, {
          replyProcessStatus: "SUCCEED",
          isRead: !dayReply.isRead,
          content: dayReply.content || "",
          replyType: dayReply.replyType || "FIRST",
        });
      });
      replyArea.appendChild(readToggleButton);

      const contentInput = document.createElement("input");
      contentInput.type = "text";
      contentInput.className = "reply-content-input";
      contentInput.placeholder = "답장 내용을 입력하세요";
      contentInput.value = dayReply.content || "";
      replyArea.appendChild(contentInput);

      const saveReplyContentButton = document.createElement("button");
      saveReplyContentButton.type = "button";
      saveReplyContentButton.className = "reply-btn";
      saveReplyContentButton.textContent = "답장 내용 저장";
      saveReplyContentButton.addEventListener("click", () => {
        updateReply(dayReply.id, {
          replyProcessStatus: "SUCCEED",
          isRead: dayReply.isRead,
          content: contentInput.value.trim(),
          replyType: dayReply.replyType || "FIRST",
        });
      });
      replyArea.appendChild(saveReplyContentButton);
    }
  }

  existingDiaries.appendChild(replyArea);
}

function renderDrafts() {
  draftList.innerHTML = "";
  if (!selectedDay || selectedDrafts.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "draft-item-empty";
    emptyItem.textContent = "임시저장된 내용이 없습니다.";
    draftList.appendChild(emptyItem);
    return;
  }

  selectedDrafts.forEach((draft, index) => {
    const item = document.createElement("li");
    item.className = "draft-item";

    const content = document.createElement("span");
    content.className = "draft-item-content";
    content.textContent = `${index + 1}. ${draft.content}`;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-draft-btn";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => {
      deleteDraft(draft.id);
    });

    item.appendChild(content);
    item.appendChild(deleteButton);
    draftList.appendChild(item);
  });
}

function renderWeekNames() {
  weekdays.innerHTML = "";
  weekNames.forEach((day) => {
    const cell = document.createElement("div");
    cell.textContent = day;
    weekdays.appendChild(cell);
  });
}

function createMonthButtons() {
  monthSelector.innerHTML = "";

  for (let month = 1; month <= 12; month += 1) {
    const button = document.createElement("button");
    button.className = "month-btn";
    button.type = "button";
    button.textContent = `${month}월`;

    if (month === selectedMonth) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => {
      selectedMonth = month;
      selectedDay = null;
      dayReply = null;
      selectedDrafts = [];
      diaryTitle.textContent = "날짜를 선택해주세요";
      diaryResult.textContent = "아직 저장된 내용이 없습니다.";
      resetDiaryInputs();
      renderDrafts();
      renderExistingDiaries();
      createMonthButtons();
      renderCalendar(selectedMonth);
      loadMonthlyDiaries();
    });

    monthSelector.appendChild(button);
  }
}

function renderCalendar(month) {
  calendarTitle.textContent = `${year}년 ${month}월`;
  daysGrid.innerHTML = "";

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let i = 0; i < firstDay; i += 1) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "empty";
    daysGrid.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayCell = document.createElement("div");
    const dayNumber = document.createElement("div");
    dayNumber.className = "day-number";
    dayNumber.textContent = String(day);
    dayCell.appendChild(dayNumber);

    if (monthDiaryMap[day]) {
      const badge = document.createElement("span");
      badge.className = "diary-badge";
      badge.textContent = `일기 ${monthDiaryMap[day].count}`;
      dayCell.appendChild(badge);
    }

    if (monthDraftMap[day]) {
      const draftBadge = document.createElement("span");
      draftBadge.className = "draft-badge";
      draftBadge.textContent = `임시 ${monthDraftMap[day].count}`;
      dayCell.appendChild(draftBadge);
    }

    if (monthReplyMap[day]) {
      const replyBadge = document.createElement("span");
      replyBadge.className = "reply-badge";
      replyBadge.textContent = `답장 ${monthReplyMap[day].count}`;
      dayCell.appendChild(replyBadge);

      const replyStatusBadge = document.createElement("span");
      replyStatusBadge.className = "reply-status-badge";
      replyStatusBadge.textContent = `${formatReplyStatusLabel(monthReplyMap[day].status)} / ${formatReadLabel(monthReplyMap[day].isRead)}`;
      dayCell.appendChild(replyStatusBadge);
    }

    if (selectedDay === day) {
      dayCell.classList.add("selected-day");
    }
    dayCell.addEventListener("click", () => {
      selectedDay = day;
      diaryTitle.textContent = `${year}년 ${selectedMonth}월 ${selectedDay}일 일기 작성`;
      diaryResult.textContent = monthDiaryMap[selectedDay]
        ? "기존 일기 목록입니다. 새 일기를 작성해 추가 저장할 수 있습니다."
        : "일기를 작성한 뒤 전송 버튼을 눌러주세요.";
      resetDiaryInputs();
      loadDraftsForSelectedDay();
      loadRepliesForSelectedDay();
      renderCalendar(selectedMonth);
    });
    daysGrid.appendChild(dayCell);
  }
}

async function loadDraftsForSelectedDay() {
  if (!selectedEmail || !selectedDay) {
    selectedDrafts = [];
    renderDrafts();
    return;
  }

  try {
    const response = await fetch(
      `/api/drafts/by-email?email=${encodeURIComponent(selectedEmail)}&selectedDate=${formatSelectedDate()}`,
    );
    const data = await response.json();
    selectedDrafts = !response.ok ? [] : data.drafts || [];
  } catch (error) {
    selectedDrafts = [];
  }
  renderDrafts();
}

async function loadRepliesForSelectedDay() {
  if (!selectedEmail || !selectedDay || !monthDiaryMap[selectedDay]) {
    dayReply = null;
    renderExistingDiaries();
    return;
  }

  const firstDiaryId = monthDiaryMap[selectedDay].diaries[0]?.id;
  if (!firstDiaryId) {
    dayReply = null;
    renderExistingDiaries();
    return;
  }

  try {
    const response = await fetch(
      `/api/replies/by-diary?email=${encodeURIComponent(selectedEmail)}&diaryId=${firstDiaryId}`,
    );
    const data = await response.json();
    dayReply = !response.ok ? null : data.reply || null;
  } catch (error) {
    dayReply = null;
  }

  renderExistingDiaries();
}

async function loadMonthlyDiaries() {
  if (!selectedEmail) {
    monthDiaryMap = {};
    monthDraftMap = {};
    monthReplyMap = {};
    renderCalendar(selectedMonth);
    renderExistingDiaries();
    return;
  }

  try {
    const response = await fetch(
      `/api/diaries/calendar?email=${encodeURIComponent(selectedEmail)}&year=${year}&month=${selectedMonth}`,
    );
    const data = await response.json();
    if (!response.ok) {
      monthDiaryMap = {};
      return;
    }
    monthDiaryMap = data.byDay || {};

    const draftResponse = await fetch(
      `/api/drafts/calendar?email=${encodeURIComponent(selectedEmail)}&year=${year}&month=${selectedMonth}`,
    );
    const draftData = await draftResponse.json();
    monthDraftMap = !draftResponse.ok ? {} : draftData.byDay || {};

    const replyResponse = await fetch(
      `/api/replies/calendar?email=${encodeURIComponent(selectedEmail)}&year=${year}&month=${selectedMonth}`,
    );
    const replyData = await replyResponse.json();
    monthReplyMap = !replyResponse.ok ? {} : replyData.byDay || {};

    renderCalendar(selectedMonth);
    await loadRepliesForSelectedDay();
  } catch (error) {
    monthDiaryMap = {};
    monthDraftMap = {};
    monthReplyMap = {};
  }
}

async function createReply(diaryId) {
  if (!selectedEmail) {
    diaryResult.textContent = "먼저 이메일 조회를 완료해주세요.";
    return;
  }

  diaryResult.textContent = "답장 생성 중...";
  try {
    const response = await fetch("/api/replies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: selectedEmail,
        diaryId,
        replyType: "FIRST",
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      diaryResult.textContent = data.message || "답장 생성에 실패했습니다.";
      return;
    }
    diaryResult.textContent = "답장을 생성했습니다.";
    await loadMonthlyDiaries();
    await loadRepliesForSelectedDay();
  } catch (error) {
    diaryResult.textContent = "네트워크 오류가 발생했습니다.";
  }
}

async function updateReply(replyId, payload) {
  if (!selectedEmail) {
    diaryResult.textContent = "먼저 이메일 조회를 완료해주세요.";
    return;
  }

  diaryResult.textContent = "답장 상태 변경 중...";
  try {
    const response = await fetch(`/api/replies/${replyId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: selectedEmail,
        ...payload,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      diaryResult.textContent = data.message || "답장 상태 변경에 실패했습니다.";
      return;
    }

    diaryResult.textContent = "답장 상태를 변경했습니다.";
    await loadMonthlyDiaries();
    await loadRepliesForSelectedDay();
  } catch (error) {
    diaryResult.textContent = "네트워크 오류가 발생했습니다.";
  }
}

async function searchEmail() {
  const email = emailInput.value.trim();

  if (!email) {
    emailResult.textContent = "이메일을 먼저 입력해주세요.";
    return;
  }

  emailResult.textContent = "조회 중...";

  try {
    const response = await fetch(
      `/api/users/by-email?email=${encodeURIComponent(email)}`
    );
    const data = await response.json();

    if (!response.ok) {
      emailResult.textContent = data.message || "조회에 실패했습니다.";
      selectedEmail = "";
      return;
    }

    selectedEmail = data.email;
    emailResult.textContent = `조회된 이메일: ${data.email} | 닉네임: ${data.nickName ?? "-"}`;
    await loadMonthlyDiaries();
  } catch (error) {
    selectedEmail = "";
    monthDiaryMap = {};
    monthDraftMap = {};
    monthReplyMap = {};
    emailResult.textContent = "네트워크 오류가 발생했습니다.";
  }
}

function collectDiaryContents() {
  const inputs = Array.from(document.querySelectorAll(".diary-input"));
  return inputs.map((input) => input.value.trim()).filter((value) => value.length > 0);
}

async function saveDiaries() {
  if (!selectedDay) {
    diaryResult.textContent = "먼저 캘린더에서 날짜를 선택해주세요.";
    return;
  }

  if (!selectedEmail) {
    diaryResult.textContent = "먼저 이메일 조회를 완료해주세요.";
    return;
  }

  const contents = collectDiaryContents();
  if (contents.length < 1) {
    diaryResult.textContent = "최소 1개의 일기를 입력해주세요.";
    return;
  }

  const existingDiaryCount = monthDiaryMap[selectedDay]?.count ?? 0;
  if (existingDiaryCount + contents.length > 5) {
    diaryResult.textContent = `해당 날짜 일기는 최대 5개입니다. 현재 ${existingDiaryCount}개가 있어 ${5 - existingDiaryCount}개까지만 추가할 수 있습니다.`;
    return;
  }

  const invalid = contents.find((content) => content.length < 2 || content.length >= 50);
  if (invalid !== undefined) {
    diaryResult.textContent = "각 일기는 2자 이상 50자 미만이어야 합니다.";
    return;
  }

  diaryResult.textContent = "저장 중...";

  try {
    const response = await fetch("/api/diaries/by-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: selectedEmail,
        selectedDate: formatSelectedDate(),
        contents,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      diaryResult.textContent = data.message || "저장에 실패했습니다.";
      return;
    }

    diaryResult.textContent = `${data.selectedDate}에 ${data.insertedCount}개 저장 완료`;
    resetDiaryInputs();
    await loadMonthlyDiaries();
    renderExistingDiaries();
  } catch (error) {
    diaryResult.textContent = "네트워크 오류가 발생했습니다.";
  }
}

async function saveDraft() {
  if (!selectedDay) {
    diaryResult.textContent = "먼저 캘린더에서 날짜를 선택해주세요.";
    return;
  }

  if (!selectedEmail) {
    diaryResult.textContent = "먼저 이메일 조회를 완료해주세요.";
    return;
  }

  const contents = collectDiaryContents();
  if (contents.length < 1) {
    diaryResult.textContent = "임시저장할 내용을 입력해주세요.";
    return;
  }

  const existingDraftCount = selectedDrafts.length;
  if (existingDraftCount + contents.length > 5) {
    diaryResult.textContent = `해당 날짜 임시저장은 최대 5개입니다. 현재 ${existingDraftCount}개가 있어 ${5 - existingDraftCount}개까지만 추가할 수 있습니다.`;
    return;
  }

  diaryResult.textContent = "임시저장 중...";
  try {
    const response = await fetch("/api/drafts/by-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: selectedEmail,
        selectedDate: formatSelectedDate(),
        contents,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      diaryResult.textContent = data.message || "임시저장에 실패했습니다.";
      return;
    }

    diaryResult.textContent = `임시저장 ${data.insertedCount ?? contents.length}개 완료`;
    await loadMonthlyDiaries();
    await loadDraftsForSelectedDay();
  } catch (error) {
    diaryResult.textContent = "네트워크 오류가 발생했습니다.";
  }
}

async function deleteDiary(diaryId) {
  if (!selectedEmail) {
    diaryResult.textContent = "먼저 이메일 조회를 완료해주세요.";
    return;
  }

  diaryResult.textContent = "삭제 중...";

  try {
    const response = await fetch(`/api/diaries/${diaryId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: selectedEmail,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      diaryResult.textContent = data.message || "삭제에 실패했습니다.";
      return;
    }

    diaryResult.textContent = "일기를 삭제했습니다.";
    await loadMonthlyDiaries();
    await loadRepliesForSelectedDay();
  } catch (error) {
    diaryResult.textContent = "네트워크 오류가 발생했습니다.";
  }
}

async function deleteDraft(draftId) {
  if (!selectedEmail) {
    diaryResult.textContent = "먼저 이메일 조회를 완료해주세요.";
    return;
  }

  diaryResult.textContent = "임시저장 삭제 중...";
  try {
    const response = await fetch(`/api/drafts/${draftId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: selectedEmail,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      diaryResult.textContent = data.message || "임시저장 삭제에 실패했습니다.";
      return;
    }

    diaryResult.textContent = "임시저장을 삭제했습니다.";
    await loadMonthlyDiaries();
    await loadDraftsForSelectedDay();
  } catch (error) {
    diaryResult.textContent = "네트워크 오류가 발생했습니다.";
  }
}

emailSearchBtn.addEventListener("click", searchEmail);
emailInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    searchEmail();
  }
});
addDiaryBtn.addEventListener("click", () => {
  createDiaryInput();
});
addDraftBtn.addEventListener("click", () => {
  createDiaryInput();
});
saveDraftBtn.addEventListener("click", saveDraft);
saveDiaryBtn.addEventListener("click", saveDiaries);
diaryModeBtn.addEventListener("click", () => setMode("diary"));
draftModeBtn.addEventListener("click", () => setMode("draft"));

renderWeekNames();
createMonthButtons();
renderCalendar(selectedMonth);
resetDiaryInputs();
renderDrafts();
setMode("diary");
