/**
 * Email module exports
 * Central location for all email-related functionality
 */

export {
  sendEmail,
  sendEmailFrom,
  sendBulkEmails,
  EMAIL_CONFIG,
  buildAppOwnedReplyToAddress,
  extractAppOwnedReplyToken,
  decodeAppOwnedReplyToken,
  type ResendReplyContext,
  type SendEmailOptions,
} from './resend'

export {
  baseEmailTemplate,
  propertyDetailsTemplate,
  followUpTemplate,
  offerTemplate,
  welcomeTemplate,
  notificationTemplate,
  type PropertyDetailsData,
} from './templates'
