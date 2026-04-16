const STORAGE_KEY = "daily-task-tracker-db";
const REMINDER_WINDOW_MINUTES = 60;

const state = {
  tasks: [],
  search: "",
  notificationsEnabled: false,
  notifiedTaskIds: new Set(),
};

const els = {
  todayDate: document.getElementById("todayDate"),
  taskSummary: document.getElementById("taskSummary"),
  taskForm: document.getElementById("taskForm"),
  taskId: document.getElementById("taskId"),
  title: document.getElementById("title"),
  description: document.getElementById("description"),
  category: document.getElementById("category"),
  priority: document.getElementById("priority"),
  dueDate: document.getElementById("dueDate"),
  dueTime: document.getElementById("dueTime"),
  cancelEdit: document.getElementById("cancelEdit"),
  resetToday: document.getElementById("resetToday"),
  taskList: document.getElementById("taskList"),
  notificationArea: document.getElementById("notificationArea"),
  totalTasks: document.getElementById("totalTasks"),
  completedTasks: document.getElementById("completedTasks"),
  pendingTasks: document.getElementById("pendingTasks"),
  completionRate: document.getElementById("completionRate"),
  formModeBadge: document.getElementById("formModeBadge"),
  searchInput: document.getElementById("searchInput"),
  enableNotifications: document.getElementById("enableNotifications"),
  progressChart: document.getElementById("progressChart"),
  priorityChart: document.getElementById("priorityChart"),
  template: document.getElementById("taskCardTemplate"),
};

init();

function init() {
  loadState();
  autoResetIfNewDay();
  bindEvents();
  render();
  checkDueTasks();
  setInterval(checkDueTasks, 60 * 1000);
}

function bindEvents() {
  els.taskForm.addEventListener("submit", handleSubmit);
  els.cancelEdit.addEventListener("click", resetForm);
  els.resetToday.addEventListener("click", handleManualReset);
  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderTaskList();
  });
  els.enableNotifications.addEventListener("click", enableNotifications);
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    seedDemoTasks();
    return;
  }

  try {
    const saved = JSON.parse(raw);
    state.tasks = Array.isArray(saved.tasks) ? saved.tasks : [];
    state.notificationsEnabled = Boolean(saved.notificationsEnabled);
  } catch (error) {
    console.error("Failed to load saved tasks", error);
    seedDemoTasks();
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      tasks: state.tasks,
      notificationsEnabled: state.notificationsEnabled,
    })
  );
}

function seedDemoTasks() {
  const today = formatDateForInput(new Date());
  state.tasks = [
    createTaskObject({
      title: "Check emails",
      description: "Reply to urgent messages before noon.",
      category: "Work",
      priority: "medium",
      dueDate: today,
      dueTime: "10:00",
    }),
    createTaskObject({
      title: "Workout session",
      description: "Complete 30 minutes of exercise.",
      category: "Health",
      priority: "high",
      dueDate: today,
      dueTime: "18:00",
    }),
  ];
  saveState();
}

function createTaskObject(values) {
  return {
    id: values.id || crypto.randomUUID(),
    title: values.title,
    description: values.description || "",
    category: values.category || "General",
    priority: values.priority || "medium",
    dueDate: values.dueDate || "",
    dueTime: values.dueTime || "",
    completed: Boolean(values.completed),
    lastCompletedDate: values.lastCompletedDate || null,
    createdAt: values.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(els.taskForm);
  const taskData = Object.fromEntries(formData.entries());

  if (!taskData.title.trim()) {
    return;
  }

  if (taskData.taskId) {
    state.tasks = state.tasks.map((task) =>
      task.id === taskData.taskId
        ? {
            ...task,
            title: taskData.title.trim(),
            description: taskData.description.trim(),
            category: taskData.category.trim() || "General",
            priority: taskData.priority,
            dueDate: taskData.dueDate,
            dueTime: taskData.dueTime,
            updatedAt: new Date().toISOString(),
          }
        : task
    );
  } else {
    state.tasks.unshift(
      createTaskObject({
        title: taskData.title.trim(),
        description: taskData.description.trim(),
        category: taskData.category.trim() || "General",
        priority: taskData.priority,
        dueDate: taskData.dueDate,
        dueTime: taskData.dueTime,
      })
    );
  }

  saveState();
  resetForm();
  render();
}

function editTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;

  els.taskId.value = task.id;
  els.title.value = task.title;
  els.description.value = task.description;
  els.category.value = task.category;
  els.priority.value = task.priority;
  els.dueDate.value = task.dueDate;
  els.dueTime.value = task.dueTime;
  els.cancelEdit.hidden = false;
  els.formModeBadge.textContent = "Edit mode";
  els.title.focus();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((task) => task.id !== id);
  state.notifiedTaskIds.delete(id);
  saveState();
  render();
}

function toggleTask(id, completed) {
  const todayKey = getTodayKey();

  state.tasks = state.tasks.map((task) =>
    task.id === id
      ? {
          ...task,
          completed,
          lastCompletedDate: completed ? todayKey : null,
          updatedAt: new Date().toISOString(),
        }
      : task
  );

  saveState();
  render();
}

function handleManualReset() {
  state.tasks = state.tasks.map((task) => ({
    ...task,
    completed: false,
    lastCompletedDate: null,
    updatedAt: new Date().toISOString(),
  }));

  state.notifiedTaskIds.clear();
  saveState();
  render();
}

function autoResetIfNewDay() {
  const todayKey = getTodayKey();
  let changed = false;

  state.tasks = state.tasks.map((task) => {
    if (task.completed && task.lastCompletedDate !== todayKey) {
      changed = true;
      return {
        ...task,
        completed: false,
        lastCompletedDate: null,
        updatedAt: new Date().toISOString(),
      };
    }

    return task;
  });

  if (changed) {
    state.notifiedTaskIds.clear();
    saveState();
  }
}

function render() {
  renderHeader();
  renderStats();
  renderTaskList();
  renderCharts();
  updateNotificationButton();
}

function renderHeader() {
  const now = new Date();
  els.todayDate.textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const todayTasks = getTodayTasks();
  els.taskSummary.textContent = `${todayTasks.length} task${todayTasks.length === 1 ? "" : "s"} scheduled today`;
}

function renderStats() {
  const tasks = getVisibleBaseTasks();
  const completed = tasks.filter((task) => task.completed).length;
  const pending = tasks.length - completed;
  const rate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  els.totalTasks.textContent = String(tasks.length);
  els.completedTasks.textContent = String(completed);
  els.pendingTasks.textContent = String(pending);
  els.completionRate.textContent = `${rate}%`;
}

function renderTaskList() {
  const tasks = getFilteredTasks();
  const nearDueTasks = getNearDueTasks(tasks);

  els.notificationArea.innerHTML = "";

  nearDueTasks.forEach((task) => {
    const notice = document.createElement("div");
    notice.className = "notice";
    notice.textContent = `"${task.title}" is due within ${REMINDER_WINDOW_MINUTES} minutes.`;
    els.notificationArea.appendChild(notice);
  });

  els.taskList.innerHTML = "";

  if (!tasks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No tasks found. Add a task to get started.";
    els.taskList.appendChild(empty);
    return;
  }

  tasks
    .slice()
    .sort(sortTasks)
    .forEach((task) => {
      const fragment = els.template.content.cloneNode(true);
      const card = fragment.querySelector(".task-card");
      const checkbox = fragment.querySelector(".task-check");
      const title = fragment.querySelector(".task-title");
      const description = fragment.querySelector(".task-description");
      const priorityPill = fragment.querySelector(".priority-pill");
      const meta = fragment.querySelector(".task-meta");
      const editBtn = fragment.querySelector(".edit-btn");
      const deleteBtn = fragment.querySelector(".delete-btn");

      checkbox.checked = task.completed;
      checkbox.addEventListener("change", () => toggleTask(task.id, checkbox.checked));

      title.textContent = task.title;
      description.textContent = task.description || "No description provided.";
      priorityPill.textContent = capitalize(task.priority);
      priorityPill.classList.add(task.priority);

      if (task.completed) {
        card.classList.add("completed");
      }

      if (isOverdue(task)) {
        card.classList.add("overdue");
      } else if (isNearDue(task)) {
        card.classList.add("near-due");
      }

      addMetaPill(meta, task.category);
      if (task.dueDate) {
        addMetaPill(meta, `Due ${formatFriendlyDue(task)}`);
      }
      addMetaPill(meta, task.completed ? "Completed today" : "Pending");

      editBtn.addEventListener("click", () => editTask(task.id));
      deleteBtn.addEventListener("click", () => deleteTask(task.id));

      els.taskList.appendChild(fragment);
    });
}

function renderCharts() {
  drawProgressChart();
  drawPriorityChart();
}

function drawProgressChart() {
  const ctx = els.progressChart.getContext("2d");
  const tasks = getVisibleBaseTasks();
  const completed = tasks.filter((task) => task.completed).length;
  const pending = Math.max(tasks.length - completed, 0);
  const total = completed + pending || 1;
  const completedAngle = (completed / total) * Math.PI * 2;

  ctx.clearRect(0, 0, els.progressChart.width, els.progressChart.height);

  const centerX = els.progressChart.width / 2;
  const centerY = els.progressChart.height / 2;
  const radius = 72;

  ctx.lineWidth = 22;
  ctx.strokeStyle = "rgba(36, 79, 69, 0.12)";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#2c8a58";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, -Math.PI / 2, completedAngle - Math.PI / 2);
  ctx.stroke();

  ctx.fillStyle = "#1f1a17";
  ctx.font = '700 28px "Space Grotesk"';
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round((completed / total) * 100)}%`, centerX, centerY + 8);

  ctx.fillStyle = "#6e6259";
  ctx.font = '500 14px "Manrope"';
  ctx.fillText("Completed", centerX, centerY + 32);
}

function drawPriorityChart() {
  const ctx = els.priorityChart.getContext("2d");
  const tasks = getVisibleBaseTasks();
  const counts = {
    high: tasks.filter((task) => task.priority === "high").length,
    medium: tasks.filter((task) => task.priority === "medium").length,
    low: tasks.filter((task) => task.priority === "low").length,
  };
  const bars = [
    { label: "High", value: counts.high, color: "#c74646" },
    { label: "Medium", value: counts.medium, color: "#dc8b2a" },
    { label: "Low", value: counts.low, color: "#2c8a58" },
  ];
  const maxValue = Math.max(...bars.map((bar) => bar.value), 1);

  ctx.clearRect(0, 0, els.priorityChart.width, els.priorityChart.height);

  const originX = 42;
  const originY = 180;
  const barWidth = 56;
  const gap = 34;

  ctx.strokeStyle = "rgba(31, 26, 23, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(originX - 12, originY);
  ctx.lineTo(290, originY);
  ctx.stroke();

  bars.forEach((bar, index) => {
    const height = (bar.value / maxValue) * 110;
    const x = originX + index * (barWidth + gap);
    const y = originY - height;

    ctx.fillStyle = bar.color;
    roundRect(ctx, x, y, barWidth, height, 16);
    ctx.fill();

    ctx.fillStyle = "#1f1a17";
    ctx.font = '700 15px "Space Grotesk"';
    ctx.textAlign = "center";
    ctx.fillText(String(bar.value), x + barWidth / 2, y - 10);

    ctx.fillStyle = "#6e6259";
    ctx.font = '600 13px "Manrope"';
    ctx.fillText(bar.label, x + barWidth / 2, originY + 22);
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function checkDueTasks() {
  const nearDueTasks = getNearDueTasks(getVisibleBaseTasks());

  nearDueTasks.forEach((task) => {
    if (state.notificationsEnabled && !state.notifiedTaskIds.has(task.id) && "Notification" in window && Notification.permission === "granted") {
      new Notification("Task reminder", {
        body: `${task.title} is almost due.`,
      });
      state.notifiedTaskIds.add(task.id);
    }
  });

  renderTaskList();
}

function enableNotifications() {
  if (!("Notification" in window)) {
    alert("This browser does not support notifications.");
    return;
  }

  Notification.requestPermission().then((permission) => {
    state.notificationsEnabled = permission === "granted";
    saveState();
    updateNotificationButton();
  });
}

function updateNotificationButton() {
  els.enableNotifications.textContent = state.notificationsEnabled ? "Reminders Enabled" : "Enable Reminders";
}

function getVisibleBaseTasks() {
  return state.tasks;
}

function getFilteredTasks() {
  if (!state.search) return state.tasks;

  return state.tasks.filter((task) => {
    const text = [task.title, task.description, task.category].join(" ").toLowerCase();
    return text.includes(state.search);
  });
}

function getTodayTasks() {
  const today = getTodayKey();
  return state.tasks.filter((task) => !task.dueDate || task.dueDate === today);
}

function getNearDueTasks(tasks) {
  return tasks.filter((task) => isNearDue(task) && !task.completed);
}

function isNearDue(task) {
  const due = getTaskDueDate(task);
  if (!due) return false;

  const diffMinutes = (due.getTime() - Date.now()) / (1000 * 60);
  return diffMinutes > 0 && diffMinutes <= REMINDER_WINDOW_MINUTES;
}

function isOverdue(task) {
  const due = getTaskDueDate(task);
  return Boolean(due) && due.getTime() < Date.now() && !task.completed;
}

function getTaskDueDate(task) {
  if (!task.dueDate) return null;
  const time = task.dueTime || "23:59";
  return new Date(`${task.dueDate}T${time}`);
}

function formatFriendlyDue(task) {
  const due = getTaskDueDate(task);
  if (!due) return "No due date";

  return due.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function addMetaPill(container, text) {
  const pill = document.createElement("span");
  pill.textContent = text;
  container.appendChild(pill);
}

function resetForm() {
  els.taskForm.reset();
  els.taskId.value = "";
  els.cancelEdit.hidden = true;
  els.formModeBadge.textContent = "Create mode";
}

function sortTasks(a, b) {
  const aDue = getTaskDueDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bDue = getTaskDueDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;

  if (a.completed !== b.completed) {
    return a.completed - b.completed;
  }

  if (aDue !== bDue) {
    return aDue - bDue;
  }

  return priorityScore(b.priority) - priorityScore(a.priority);
}

function priorityScore(priority) {
  return { low: 1, medium: 2, high: 3 }[priority] ?? 0;
}

function getTodayKey() {
  return formatDateForInput(new Date());
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
