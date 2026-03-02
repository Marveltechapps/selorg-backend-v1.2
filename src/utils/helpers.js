// Counter to ensure uniqueness within the same millisecond
let idCounter = 0;

/**
 * Generate unique ID with prefix
 */
const generateId = (prefix, count = 0) => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000); // Increased range for better uniqueness
  const counter = count || (++idCounter % 10000); // Increment counter to ensure uniqueness
  const processId = process.pid || 0;
  
  // Combine timestamp, process ID, counter, and random for maximum uniqueness
  return `${prefix}-${timestamp}${processId}${counter}${random}`;
};

/**
 * Calculate SLA timer in MM:SS format
 */
const calculateSLATimer = (deadline) => {
  const now = new Date();
  const diff = deadline - now;
  
  if (diff <= 0) {
    return '00:00';
  }
  
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/**
 * Determine SLA status based on time remaining
 */
const getSLAStatus = (deadline) => {
  const now = new Date();
  const diff = deadline - now;
  const minutes = Math.floor(diff / 60000);
  
  if (minutes < 0) {
    return 'critical';
  } else if (minutes < 5) {
    return 'critical';
  } else if (minutes < 15) {
    return 'warning';
  }
  return 'safe';
};

/**
 * Format wait time as "Xm Ys"
 */
const formatWaitTime = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
};

/**
 * Calculate peak time based on historical data
 */
const calculatePeakTime = () => {
  const hour = new Date().getHours();
  if (hour >= 16 && hour < 20) {
    return '4:00 PM';
  } else if (hour >= 12 && hour < 16) {
    return '12:00 PM';
  } else if (hour >= 18 && hour < 22) {
    return '6:00 PM';
  }
  return '4:00 PM';
};

/**
 * Generate random data points for last hour (9 points)
 */
const generateLastHourData = () => {
  return Array.from({ length: 9 }, () => Math.floor(Math.random() * 50) + 30);
};

module.exports = {
  generateId,
  calculateSLATimer,
  getSLAStatus,
  formatWaitTime,
  calculatePeakTime,
  generateLastHourData,
};

