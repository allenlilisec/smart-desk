/**
 * E2E测试定位点常量
 * 与契约保持一致
 */

// Portal页面测试ID
export const PORTAL_TEST_IDS = {
  PAGE_CONTAINER: 'portal-page',
  NEW_TICKET_FORM: 'new-ticket-form',
  TITLE_INPUT: 'ticket-title-input',
  DESCRIPTION_INPUT: 'ticket-description-input',
  CATEGORY_SELECT: 'ticket-category-select',
  PRIORITY_SELECT: 'ticket-priority-select',
  SUBMIT_BUTTON: 'ticket-submit-button',
  SUCCESS_MESSAGE: 'ticket-success-message',
  ERROR_MESSAGE: 'ticket-error-message',
  MY_TICKETS_LINK: 'my-tickets-link',
} as const;

// MyTickets页面测试ID
export const MY_TICKETS_TEST_IDS = {
  PAGE_CONTAINER: 'my-tickets-page',
  TICKETS_LIST: 'tickets-list',
  TICKET_ITEM: 'ticket-item',
  TICKET_NUMBER: 'ticket-number',
  TICKET_TITLE: 'ticket-title',
  TICKET_STATUS: 'ticket-status',
  TICKET_PRIORITY: 'ticket-priority',
  TICKET_CREATED_AT: 'ticket-created-at',
  SEARCH_INPUT: 'search-input',
  STATUS_FILTER: 'status-filter',
  NEW_TICKET_BUTTON: 'new-ticket-button',
  LOADING_STATE: 'loading-state',
  EMPTY_STATE: 'empty-state',
  ERROR_MESSAGE: 'error-message',
} as const;

// Portal工单详情测试ID
export const PORTAL_TICKET_DETAIL_TEST_IDS = {
  PAGE_CONTAINER: 'ticket-detail-page',
  TICKET_INFO: 'ticket-info',
  TICKET_NUMBER: 'ticket-number',
  TICKET_TITLE: 'ticket-title',
  TICKET_STATUS: 'ticket-status',
  TICKET_PRIORITY: 'ticket-priority',
  TICKET_DESCRIPTION: 'ticket-description',
  COMMENTS_LIST: 'comments-list',
  COMMENT_ITEM: 'comment-item',
  COMMENT_BODY: 'comment-body',
  COMMENT_AUTHOR: 'comment-author',
  COMMENT_TIME: 'comment-time',
  ADD_COMMENT_FORM: 'add-comment-form',
  COMMENT_INPUT: 'comment-input',
  SUBMIT_COMMENT_BUTTON: 'submit-comment-button',
  BACK_BUTTON: 'back-button',
  LOADING_STATE: 'loading-state',
  ERROR_MESSAGE: 'error-message',
} as const;

// Agent队列测试ID
export const AGENT_QUEUE_TEST_IDS = {
  PAGE_CONTAINER: 'agent-queue-page',
  QUEUE_LIST: 'queue-list',
  TICKET_ITEM: 'queue-ticket-item',
  TICKET_NUMBER: 'queue-ticket-number',
  TICKET_TITLE: 'queue-ticket-title',
  TICKET_STATUS: 'queue-ticket-status',
  TICKET_PRIORITY: 'queue-ticket-priority',
  TICKET_REQUESTER: 'queue-ticket-requester',
  TICKET_CREATED_AT: 'queue-ticket-created-at',
  SEARCH_INPUT: 'queue-search-input',
  STATUS_FILTER: 'queue-status-filter',
  VIEW_BUTTON: 'queue-view-button',
  LOADING_STATE: 'queue-loading-state',
  EMPTY_STATE: 'queue-empty-state',
  ERROR_MESSAGE: 'queue-error-message',
  ACCEPT_BUTTON: 'queue-accept-button',
} as const;

// Agent工单详情测试ID
export const AGENT_TICKET_DETAIL_TEST_IDS = {
  PAGE_CONTAINER: 'agent-ticket-detail-page',
  TICKET_INFO: 'agent-ticket-info',
  TICKET_NUMBER: 'agent-ticket-number',
  TICKET_TITLE: 'agent-ticket-title',
  TICKET_STATUS: 'agent-ticket-status',
  TICKET_PRIORITY: 'agent-ticket-priority',
  TICKET_DESCRIPTION: 'agent-ticket-description',
  STATUS_ACTIONS: 'agent-status-actions',
  TRANSITION_SELECT: 'agent-transition-select',
  TRANSITION_BUTTON: 'agent-transition-button',
  COMMENTS_TAB: 'agent-comments-tab',
  INTERNAL_TAB: 'agent-internal-tab',
  COMMENTS_LIST: 'agent-comments-list',
  COMMENT_ITEM: 'agent-comment-item',
  COMMENT_BODY: 'agent-comment-body',
  COMMENT_VISIBILITY: 'agent-comment-visibility',
  ADD_COMMENT_FORM: 'agent-add-comment-form',
  COMMENT_INPUT: 'agent-comment-input',
  VISIBILITY_SELECT: 'agent-visibility-select',
  SUBMIT_COMMENT_BUTTON: 'agent-submit-comment-button',
  BACK_BUTTON: 'agent-back-button',
  LOADING_STATE: 'agent-loading-state',
  ERROR_MESSAGE: 'agent-error-message',
  REQUESTER_INFO: 'agent-requester-info',
} as const;
