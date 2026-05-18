'use strict';

const ErrorResponse = require('../../core/utils/ErrorResponse');

class LogisticsError extends ErrorResponse {
  constructor(message, statusCode = 500, code = 'LOGISTICS_ERROR', details) {
    super(message, statusCode, code, details);
    this.name = 'LogisticsError';
  }
}

class ProviderError extends LogisticsError {
  constructor(message, opts = {}) {
    const { provider, statusCode = 502, code = 'PROVIDER_ERROR', details } = opts;
    super(message, statusCode, code, { provider, ...(details || {}) });
    this.name = 'ProviderError';
    this.provider = provider;
  }
}

class NotImplementedError extends LogisticsError {
  constructor(message = 'Not implemented', details) {
    super(message, 501, 'NOT_IMPLEMENTED', details);
    this.name = 'NotImplementedError';
  }
}

class ValidationError extends LogisticsError {
  constructor(message, details) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

class StateTransitionError extends LogisticsError {
  constructor(from, to) {
    super(`Illegal state transition: ${from} -> ${to}`, 409, 'STATE_TRANSITION', { from, to });
    this.name = 'StateTransitionError';
  }
}

class WebhookSignatureError extends LogisticsError {
  constructor(message = 'Invalid webhook signature') {
    super(message, 401, 'WEBHOOK_SIGNATURE_INVALID');
    this.name = 'WebhookSignatureError';
  }
}

module.exports = {
  LogisticsError,
  ProviderError,
  NotImplementedError,
  ValidationError,
  StateTransitionError,
  WebhookSignatureError,
};
