export type ConversationType = "general" | "application_question" | "task";
export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "completed";

export type ConversationTaskAttachment = {
  kind: "task";
  title: string;
  description: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assigned_at: string;
  assigned_by_id: string;
  assigned_by_name: string | null;
  completed_at: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isConversationType(value: unknown): value is ConversationType {
  return (
    value === "general" ||
    value === "application_question" ||
    value === "task"
  );
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return value === "low" || value === "medium" || value === "high";
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "todo" || value === "in_progress" || value === "completed";
}

export function normalizeConversationAttachments(
  value: unknown
): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    return [value];
  }
  return [];
}

export function getTaskAttachmentFromAttachments(
  value: unknown
): ConversationTaskAttachment | null {
  const task = normalizeConversationAttachments(value).find(
    (attachment) => attachment.kind === "task"
  );

  if (!task) {
    return null;
  }

  const rawTitle = typeof task.title === "string" ? task.title.trim() : "";
  if (!rawTitle) {
    return null;
  }

  const priority = isTaskPriority(task.priority) ? task.priority : "medium";
  const status = isTaskStatus(task.status) ? task.status : "todo";

  return {
    kind: "task",
    title: rawTitle,
    description:
      typeof task.description === "string" ? task.description : null,
    due_date: typeof task.due_date === "string" ? task.due_date : null,
    priority,
    status,
    assigned_at:
      typeof task.assigned_at === "string"
        ? task.assigned_at
        : new Date().toISOString(),
    assigned_by_id:
      typeof task.assigned_by_id === "string" ? task.assigned_by_id : "",
    assigned_by_name:
      typeof task.assigned_by_name === "string" ? task.assigned_by_name : null,
    completed_at:
      typeof task.completed_at === "string" ? task.completed_at : null,
  };
}

export function buildTaskAttachment(input: {
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  assignedById: string;
  assignedByName?: string | null;
}): ConversationTaskAttachment {
  return {
    kind: "task",
    title: input.title.trim(),
    description: input.description?.trim() || null,
    due_date: input.dueDate || null,
    priority: input.priority ?? "medium",
    status: "todo",
    assigned_at: new Date().toISOString(),
    assigned_by_id: input.assignedById,
    assigned_by_name: input.assignedByName ?? null,
    completed_at: null,
  };
}

export function setTaskStatusInAttachments(
  attachments: unknown,
  status: TaskStatus,
  nowIso: string = new Date().toISOString()
): Record<string, unknown>[] {
  const normalized = normalizeConversationAttachments(attachments);
  const index = normalized.findIndex((attachment) => attachment.kind === "task");
  if (index < 0) {
    return normalized;
  }

  const updated = { ...normalized[index] };
  updated.status = status;
  updated.completed_at = status === "completed" ? nowIso : null;
  normalized[index] = updated;

  return normalized;
}

export function formatTaskStatusLabel(status: TaskStatus): string {
  if (status === "todo") return "To Do";
  if (status === "in_progress") return "In Progress";
  return "Completed";
}

export function hasOpenTask(attachments: unknown): boolean {
  const task = getTaskAttachmentFromAttachments(attachments);
  return Boolean(task && task.status !== "completed");
}
