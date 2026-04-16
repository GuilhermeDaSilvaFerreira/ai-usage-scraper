export enum OutreachStatus {
  NOT_CONTACTED = 'not_contacted',
  FIRST_CONTACT_SENT = 'first_contact_sent',
  FOLLOW_UP_SENT = 'follow_up_sent',
  REPLIED = 'replied',
  UNDER_NEGOTIATION = 'under_negotiation',
  DECLINED = 'declined',
  CLOSED_WON = 'closed_won',
  CLOSED_LOST = 'closed_lost',
}

export enum ContactPlatform {
  EMAIL = 'email',
  LINKEDIN = 'linkedin',
  PHONE = 'phone',
  OTHER = 'other',
}
