interface ImportMetaEnv {
  /** `resend` sends task, reminder, escalation and signing emails through the relay at /api/send-email. */
  readonly VITE_EMAIL_DELIVERY?: string;
  /** Where the relay lives when it isn't on the app's own origin. */
  readonly VITE_EMAIL_RELAY_URL?: string;
}
