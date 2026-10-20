export const ACCOUNT_REMINDER_CHANGED_EVENT = "account-pending-changed";

export function notifyAccountReminderChanged() {
  window.dispatchEvent(new Event(ACCOUNT_REMINDER_CHANGED_EVENT));
}
